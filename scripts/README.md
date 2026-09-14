# PhytoAI — dataset export & training scripts

These run **later, on demand** (not in the live pipeline). They turn verified `DiseaseScans` rows into a
fine-tuned classifier that replaces the PlantVillage bootstrap.

## 1. Export the dataset

1. In Google Sheets, open the `DiseaseScans` tab and export it as CSV (File → Download → CSV).
2. Install the one dependency and run:

```bash
pip install requests
python scripts/export_dataset.py /path/to/DiseaseScans.csv --out dataset
```

Rules applied by the exporter:
- Label priority: `user_verdict` (human) → `judge_verdict`.
- Rows where `user_verdict` is **"Wrong"** are skipped (verified false label).
- Drive photos are downloaded from `drive_links`; output is `dataset/<label>/*.jpg`
  (label normalized: PlantVillage species prefix stripped, lowercase, spaces → underscores).
- Already-downloaded files are kept; re-running only fetches new rows.

**Minimum sane dataset: ~30+ verified images per class** before the first fine-tune. The script prints a
warning next to any class below that.

## 2. Fine-tune

```bash
pip install ultralytics
python scripts/train.py \
  --dataset dataset \
  --base ../yolo-service/models/model.pt \
  --epochs 50 --imgsz 224 --batch 16 --device cpu \
  --output model.pt
```

- If `dataset/` has no `train/` subfolder, the script auto-splits it 80/20 into `dataset_split/`
  (Ultralytics `split_classify_dataset`) and trains on that.
- The fine-tuned weights land in `model.pt`.

## 3. Deploy the new model

Copy `model.pt` over `yolo-service/models/model.pt` on the VPS. The service reloads on file change
(mtime check) — no restart, no workflow change.

## Notes

- `dataset/`, `dataset_split/`, `runs/` and `*.pt` are gitignored (large binaries).
- The Judge keeps its documented low weight for YOLO until enough verified data exists; this is expected.
