# YOLO Analyst Service — Design Spec

Status: approved | Date: 2026-09-14 | Touches: VPS (new container), n8n workflow (Branch C), repo (new yolo-service/ + scripts/)

## Purpose

Replace the `Build YOLO Opinion` stub (`{"status":"notyettrained"}`) in Branch C with a real,
local inference service. Bootstrap with a public pretrained plant-disease classifier so real
opinions flow from day one; the Judge keeps its documented low-weighting of YOLO until the
model is fine-tuned on this pot's own human-verified DiseaseScans data (the dataset flywheel).

## Architecture

```
ESP32-CAM --POST yolo-scan--> n8n Branch C
                                  |
                    Vision Analyst (Gemma) ──┐
                    YOLO Analyst (HTTP) ─────┼──> Judge (Gemma, YOLO = low weight) --> ...
                                  |
                                  v
                    yolo-service container (FastAPI, :8090)
                    same docker network as n8n
                    model.pt present? -> predict -> {label, confidence, all_scores}
                    model.pt absent?  -> {status: "notyettrained"}
```

## Deployment (VPS)

- New folder `yolo-service/` in the repo: `app/main.py` (FastAPI), `requirements.txt`
  (fastapi, uvicorn, ultralytics CPU, pillow), `Dockerfile`, `models/` (gitignored, mounted volume).
- Runs as a container alongside n8n on the VPS. n8n reaches it at `http://yolo:8090/predict`
  (shared docker network; no public exposure, no tunnel involvement).
- RAM: ultralytics + torch CPU ~1-2 GB transient per inference; weekly cadence, safe on 8 GB.
- Env var `MODEL_PATH` (default `/models/model.pt`). Missing/unloadable model -> endpoint
  returns the notyettrained shape with HTTP 200 (never errors the workflow).

## API contract

`POST /predict` — multipart form, field `image` (JPEG).
Response 200:
```json
{ "status": "ok",
  "label": "Tomato___Early_blight",
  "label_simple": "early blight",
  "confidence": 0.83,
  "top3": [{"label": "...", "confidence": 0.83}, ...],
  "model": "plantvillage-yolov8n-cls" }
```
or `{ "status": "notyettrained" }` when no model is loaded.
`label_simple`: PlantVillage class names normalized (strip species prefix, underscores -> spaces)
because the Judge prompt consumes human-readable text.
Timeout behaviour on n8n side: HTTP node timeout 30s; on ANY error/timeout the workflow
substitutes `{ "status": "unavailable" }` so the Judge still runs (same graceful-degradation
pattern as the stub).

## Bootstrap model

- Base: YOLOv8n-cls trained on PlantVillage (38 classes). Download step documented in
  yolo-service/README.md (public weights, e.g. Zenodo record with trained .pt); placed at
  `models/model.pt`. If download is unavailable, service runs in notyettrained mode until
  the first self-trained model lands — pipeline never breaks either way.
- PlantVillage is lab-condition data: transfer to real home photos is mediocre BY DESIGN
  ASSUMPTION. The Judge prompt already encodes low trust. Fine-tuning on DiseaseScans gold
  labels replaces the bootstrap later.

## Dataset flywheel (export + training, runs later on demand)

- `scripts/export_dataset.py`: reads DiseaseScans rows (drivelinks, judgeverdict, userverdict,
  treatmentoutcome), downloads Drive photos, writes a YOLO-classify dataset:
  `dataset/<label>/*.jpg`. Label priority: userverdict (human) > judgeverdict; rows where the
  user said "Wrong" are EXCLUDED (that's a verified false label).
- `scripts/train.py`: `yolo classify train` on the exported dataset, fine-tuning the bootstrap
  weights; outputs a new `model.pt`. Drop into `models/`, restart container. No workflow change.
- Minimum sane dataset: ~30+ verified images per class before first fine-tune; document this.

## n8n workflow changes (Branch C, surgical)

1. Replace Code node `Build YOLO Opinion` with an HTTP Request node "YOLO Analyst":
   POST `http://yolo:8090/predict`, multipart, field `image` = the scan photo binary,
   timeout 30 s, "Continue on fail" ON + a small Code fallback that emits
   `{status:"unavailable"}` on failure so downstream shape never breaks.
2. `Build Judge Prompt` already stringifies whatever the YOLO stage returns — verify it passes
   label_simple + confidence through; no prompt change needed (low-weight rule already written).
3. Workflow stays INACTIVE during the edit; verify persistence, export, commit.

## Test plan

1. `docker compose up` the service with no model -> `POST /predict` with any photo ->
   `notyettrained`.
2. Drop bootstrap model.pt -> same call -> real label + confidence.
3. n8n: manual Branch C scan test photo -> Judge output mentions the YOLO opinion.
4. Kill the container -> scan still completes with `unavailable` (Judge degrades gracefully).

## Explicitly out of scope (this stage)

- Object detection / bounding boxes (needs box annotations; classification only).
- Auto-retraining triggers, MLflow, versioned model registry (manual file swap is enough).
- Public exposure of the endpoint (docker-network-internal only).
