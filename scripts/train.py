import argparse
import os
import random
import shutil
from pathlib import Path

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp"}


def link_or_copy(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        return
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def count_images(path: Path):
    if not path.is_dir():
        return 0
    return len([p for p in path.iterdir() if p.suffix.lower() in IMG_EXT])


def ensure_split(root: Path) -> Path:
    if (root / "train").is_dir() and (root / "val").is_dir():
        return root
    from ultralytics.data.split import split_classify_dataset

    split = split_classify_dataset(root)
    print(f"[train] created split dataset at {split}")
    return split


def build_replay(own_root: Path, pv_root: Path, out: Path, fraction: float, seed: int):
    rng = random.Random(seed)
    own = ensure_split(own_root)
    own_classes = sorted(d.name for d in (own / "train").iterdir() if d.is_dir())
    if not own_classes:
        raise SystemExit(f"own dataset has no classes under {own}/train")

    for split in ("train", "val"):
        for cls_dir in sorted((own / split).iterdir()):
            if not cls_dir.is_dir():
                continue
            for img in cls_dir.iterdir():
                if img.suffix.lower() in IMG_EXT:
                    link_or_copy(img, out / split / cls_dir.name / img.name)

    sampled = {}
    if fraction > 0:
        if not (pv_root / "train").is_dir():
            raise SystemExit(f"PlantVillage split not found at {pv_root} - run prepare_plantvillage.py first")
        for cls_dir in sorted((pv_root / "train").iterdir()):
            if not cls_dir.is_dir():
                continue
            images = [p for p in sorted(cls_dir.iterdir()) if p.suffix.lower() in IMG_EXT]
            rng.shuffle(images)
            take = max(1, int(len(images) * fraction))
            sample = images[:take]
            sampled[cls_dir.name] = len(sample)
            n_val = max(1, int(len(sample) * 0.1))
            for split, items in (("val", sample[:n_val]), ("train", sample[n_val:])):
                for img in items:
                    link_or_copy(img, out / split / cls_dir.name / f"pv_{img.name}")

    for cls_dir in sorted((out / "train").iterdir()):
        if not cls_dir.is_dir():
            continue
        if count_images(out / "val" / cls_dir.name) == 0:
            images = [p for p in sorted(cls_dir.iterdir()) if p.suffix.lower() in IMG_EXT]
            if images:
                link_or_copy(images[0], out / "val" / cls_dir.name / images[0].name)

    return own_classes, sampled


def run_training(base: str, data: Path, args):
    from ultralytics import YOLO

    model = YOLO(base)
    base_names = set(str(v) for v in model.names.values())
    data_names = set(d.name for d in (data / "train").iterdir() if d.is_dir())
    new_classes = sorted(data_names - base_names)
    dropped = sorted(base_names - data_names)
    if new_classes or dropped:
        print("[train] class set differs from the base model:")
        if new_classes:
            print("[train]   new classes (head rebuild required): " + ", ".join(new_classes))
        if dropped:
            print("[train]   base classes not in the dataset (dropped): " + ", ".join(dropped))
        print("[train]   Ultralytics reinitializes the classifier head for the new class count; backbone weights continue.")

    model.train(
        data=str(data),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        workers=args.workers,
        seed=args.seed,
        project=args.project,
        name=args.name,
        exist_ok=True,
    )
    best = Path(model.trainer.save_dir) / "weights" / "best.pt"
    shutil.copy2(best, args.output)
    print(f"[train] weights written to {args.output}")


def main():
    parser = argparse.ArgumentParser(description="Two-stage YOLOv8n-cls training: bootstrap on PlantVillage, then flywheel replay")
    parser.add_argument("--mode", choices=("bootstrap", "flywheel"), required=True)
    parser.add_argument("--base", default="", help="bootstrap: start weights (default yolov8n-cls.pt); flywheel: previous model.pt (required)")
    parser.add_argument("--data", default="plantvillage", help="bootstrap: prepared PlantVillage split directory")
    parser.add_argument("--own-dataset", default="dataset", help="flywheel: exported own-plant dataset (dataset/<label>/*.jpg)")
    parser.add_argument("--plantvillage", default="plantvillage", help="flywheel: prepared PlantVillage split directory (replay source)")
    parser.add_argument("--replay-fraction", type=float, default=0.2, help="flywheel: fraction of each PlantVillage class mixed into training (0 = none)")
    parser.add_argument("--replay-out", default="dataset_replay", help="flywheel: combined replay dataset output directory")
    parser.add_argument("--epochs", type=int, default=0)
    parser.add_argument("--imgsz", type=int, default=160)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--project", default="runs/classify")
    parser.add_argument("--name", default="")
    parser.add_argument("--output", default="model.pt")
    args = parser.parse_args()

    if args.mode == "bootstrap":
        args.base = args.base or "yolov8n-cls.pt"
        args.name = args.name or "bootstrap-plantvillage"
        args.epochs = args.epochs or 12
        data = Path(args.data)
        if not (data / "train").is_dir():
            raise SystemExit(f"prepared PlantVillage not found at {data} - run prepare_plantvillage.py first")
        run_training(args.base, data, args)
        return

    args.base = args.base or "../yolo-service/models/model.pt"
    args.name = args.name or "flywheel-replay"
    args.epochs = args.epochs or 8
    base_path = Path(args.base)
    if not base_path.is_file():
        raise SystemExit(f"flywheel requires the existing model.pt at {base_path} - run --mode bootstrap first")
    if base_path.name.startswith("yolov8n-cls"):
        raise SystemExit("refusing to train from scratch: point --base at your previous model.pt")
    own = Path(args.own_dataset)
    if not own.is_dir():
        raise SystemExit(f"own-plant dataset not found at {own} - run export_dataset.py first")

    replay = Path(args.replay_out)
    own_classes, sampled = build_replay(own, Path(args.plantvillage), replay, args.replay_fraction, args.seed)
    print(f"[train] replay dataset: {replay} (own classes: {len(own_classes)}, PlantVillage classes sampled: {len(sampled)})")
    print(f"[train] continuing from {base_path} - never from scratch")
    run_training(str(base_path), replay, args)


if __name__ == "__main__":
    main()
