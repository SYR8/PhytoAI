import argparse
import shutil
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Fine-tune the PlantVillage bootstrap YOLOv8n-cls on the exported dataset")
    parser.add_argument("--dataset", default="dataset", help="exported dataset root (dataset/<label>/*.jpg)")
    parser.add_argument("--base", default="../yolo-service/models/model.pt", help="bootstrap weights to fine-tune from")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=224)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", default="cpu", help="cpu or 0 for GPU")
    parser.add_argument("--output", default="model.pt", help="where to write the fine-tuned weights")
    args = parser.parse_args()

    from ultralytics import YOLO
    from ultralytics.data.split import split_classify_dataset

    data = Path(args.dataset)
    if not data.is_dir():
        raise SystemExit(f"dataset directory not found: {data}")
    if not (data / "train").is_dir():
        data = split_classify_dataset(data)
        print(f"[train] created split dataset at {data}")

    model = YOLO(args.base)
    model.train(
        data=str(data),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project="runs/classify",
        name="phyto-finetune",
    )

    best = Path(model.trainer.save_dir) / "weights" / "best.pt"
    shutil.copy2(best, args.output)
    print(f"[train] fine-tuned weights written to {args.output}")


if __name__ == "__main__":
    main()
