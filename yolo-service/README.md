# PhytoAI — YOLO Analyst Service

Local CPU-only plant-disease image classifier that answers Branch C's `YOLO Analyst` HTTP node.
FastAPI + Ultralytics YOLOv8 classification. Reachable by n8n only, inside the Docker network:
`http://yolo:8090/predict`. No public exposure, no credentials.

## API

`POST /predict` — multipart form, field `image` (JPEG).

```json
{
  "status": "ok",
  "label": "Tomato___Early_blight",
  "label_simple": "early blight",
  "confidence": 0.83,
  "top3": [{ "label": "Tomato___Early_blight", "confidence": 0.83 }],
  "model": "plantvillage-yolov8n-cls"
}
```

`{ "status": "notyettrained" }` when no model is present or the model cannot be loaded (HTTP 200 — the workflow never errors).
`{ "status": "unavailable" }` if the image is unreadable or inference fails (HTTP 200; the workflow's Judge degrades gracefully).

`GET /health` — `{"status": "ok" | "notyettrained", "model": ..., "model_path": ...}`.

The model is loaded lazily and **reloaded automatically when the file changes** (mtime check), so dropping in a
new `model.pt` does not require a restart.

## Network — verify the name (open item)

There is no compose file in this repo (n8n runs on the VPS), so the external network name in
`docker-compose.yml` is a **placeholder**: `n8n_default`.

Pick one of these:
- **Recommended:** add the `yolo` service block (from `docker-compose.yml`) into the *existing* n8n compose
  file — same file means the same default network, and the `networks:` section is not needed.
- Or run this compose separately and set the network to the real one:
  `docker network ls` (usually `<compose-project>_default`, e.g. `n8n_default`), then edit
  `n8n_net.name` accordingly.

No `ports:` mapping is defined — only `expose`, so `:8090` is docker-network-internal by construction.

## Bootstrap model

1. Download a PlantVillage-pretrained YOLOv8n-cls `.pt` (e.g. a public Zenodo/Ultralytics classification
   checkpoint for the 38-class PlantVillage set). Put it at `yolo-service/models/model.pt` (folder is gitignored).
2. Without a model the service still runs and returns `notyettrained` — the pipeline never breaks.

## Build & run

```bash
cd yolo-service
docker compose up -d --build
docker compose logs -f yolo
```

Smoke test (from the VPS):

```bash
curl -F "image=@/path/to/photo.jpg" http://127.0.0.1:8090/predict   # host-side, only if you forward it
docker exec -it n8n curl -F "image=@/tmp/photo.jpg" http://yolo:8090/predict   # network-internal check
```

RAM: ultralytics + CPU torch use ~1–2 GB transient per inference; weekly cadence, safe on 8 GB.

## Swapping in a fine-tuned model later

1. Run `scripts/export_dataset.py` + `scripts/train.py` (see `scripts/README.md`) to produce `model.pt`.
2. Copy it over `yolo-service/models/model.pt` on the VPS.
3. No restart needed (mtime auto-reload); the workflow is unchanged.

## Known limitations

- PlantVillage is lab-condition data; transfer to real home photos is expected to be mediocre — the Judge
  already applies a documented low weight to YOLO until fine-tuned on this pot's verified DiseaseScans data.
- Classification only (no bounding boxes).
