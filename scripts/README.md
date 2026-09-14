# PhytoAI — two-stage YOLO training pipeline

Self-learning classifier for the `YOLO Analyst` service. Two stages:

1. **Bootstrap** — fine-tune `yolov8n-cls.pt` on the public PlantVillage dataset → `model.pt` v1.
2. **Flywheel** — repeatedly fine-tune the **previous `model.pt`** on a replay mix of our own verified
   DiseaseScans photos + a fraction of PlantVillage (anti-forgetting).

Both stages run on CPU. Target box: VPS, 2 vCPU / 8 GB RAM / 75 GB disk — defaults are capped to finish
overnight (see timings below).

**Golden rule: always fine-tune from the previous `model.pt` — never from scratch.**
The bootstrap is the only run that starts from public weights.

---

## Runbook

### 1. Prepare PlantVillage (once)

```bash
cd scripts
python prepare_plantvillage.py --out plantvillage
```

- Downloads only the **color** images via a sparse git checkout of
  `spMohanty/PlantVillage-Dataset` (`raw/color`, 38 classes, ~2 GB).
- Writes Ultralytics classify layout `plantvillage/train/<class>` + `plantvillage/val/<class>`
  (per-class split, `--val-fraction 0.2`, deterministic seed). Hardlinks are used when possible, so the
  split adds almost no extra disk; otherwise allow ~2 GB more.
- **Resumable / partial-failure tolerant:** re-run any time — the sparse checkout resumes fetching and
  already-split files are kept. Prints per-class train/val counts and warns if the class count isn't 38.
- `--max-per-class 300` (default) caps the bootstrap to ~11k images/epoch so CPU training finishes
  overnight; `--max-per-class 0` uses all ~54k (much slower).
- Have an existing copy? `--source-dir /path/to/PlantVillage-Dataset` (or a folder of class dirs) skips the download.

### 2. Bootstrap training

```bash
python train.py --mode bootstrap --data plantvillage --output model.pt
```

- Defaults: `--base yolov8n-cls.pt` (public), `--epochs 12 --imgsz 160 --batch 32 --workers 2 --device cpu`.
- Output: `model.pt` **v1** (the bootstrap brain). Then deploy (step 3).

### 3. Deploy the model

Copy `model.pt` to the service and let it reload (mtime auto-reload, no restart):

```bash
cp model.pt ../yolo-service/models/model.pt
```

### 4. Accumulate own-plant labels (weekly scans)

The weekly scan HITLs collect `user_verdict` / `treatment_outcome` in `DiseaseScans`. When enough have piled up:

```bash
python export_dataset.py /path/to/DiseaseScans.csv --out dataset
```

Export rules: label = `user_verdict` else `judge_verdict`; rows where `user_verdict` is "Wrong" are skipped.
**Minimum sane dataset: ~30+ verified images per class** before the first flywheel run (the exporter warns per class).

### 5. Flywheel training

```bash
python train.py --mode flywheel \
  --base ../yolo-service/models/model.pt \
  --own-dataset dataset --plantvillage plantvillage \
  --replay-fraction 0.2 --output model.pt
```

- **Continues from the previous `model.pt`** (the script refuses a `yolov8n-cls*` base or a missing model).
- Builds a replay mix in `dataset_replay/`: all own gold labels **+ 20 % of each PlantVillage class**
  (`--replay-fraction`, 0 disables) to prevent catastrophic forgetting. Own data goes to train/val from its
  split; PlantVillage replay goes 90/10 train/val; every class is guaranteed at least one val image.
- **New classes from own data** (e.g. our species' `healthy`): when the dataset class set differs from the
  base model, Ultralytics rebuilds the classifier head for the new class count — the backbone continues from
  `model.pt`. The script prints the new/dropped classes before training.
- Class naming: PlantVillage classes keep their `Species___Disease` names; own labels are the normalized
  names from `export_dataset.py` (e.g. `early_blight`), so own classes never collide with PlantVillage ones.
- Defaults: `--epochs 8 --imgsz 160 --batch 32 --workers 2 --device cpu`.

### 6. Deploy again

```bash
cp model.pt ../yolo-service/models/model.pt
```

Repeat 4 → 5 → 6 as labels accumulate.

---

## Timing / disk (2 vCPU, 8 GB RAM, CPU only)

| Step | Default | Rough time |
|---|---|---|
| Prepare (sparse download + split) | ~2 GB color images | 20–60 min (network-bound) |
| Bootstrap | 11k images/epoch × 12 epochs @160px | ~2–5 h overnight |
| Flywheel | own set + 20 % PlantVillage @160px × 8 epochs | ~1–3 h (much less with few own classes) |

Disk: sparse checkout ~2 GB (+ split ~2 GB if hardlinks unavailable) + `dataset_replay/` (small: own data +
20 % of PlantVillage, hardlinked where possible). Keep ≥ 6 GB free.

## Notes

- `plantvillage/`, `pv_download/`, `dataset/`, `dataset_split/`, `dataset_replay/`, `runs/` and `*.pt` are gitignored.
- `pip install ultralytics` (plus `requests` for the exporter). Training scripts do not need the service's Docker image.
- PlantVillage is lab-condition data: bootstrap accuracy on real home photos is expected to be mediocre — that is
  the documented reason for the low YOLO weight in the Judge, and for the flywheel.
