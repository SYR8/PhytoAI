import argparse
import os
import random
import shutil
import subprocess
from pathlib import Path

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp"}
EXPECTED_CLASSES = 38
DEFAULT_REPO = "https://github.com/spMohanty/PlantVillage-Dataset.git"
COLOR_SUBDIR = Path("raw") / "color"


def run(cmd):
    print("[prepare] $ " + " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def ensure_git_color(work: Path, repo_url: str) -> Path:
    repo = work / "PlantVillage-Dataset"
    if not (repo / ".git").is_dir():
        work.mkdir(parents=True, exist_ok=True)
        run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", repo_url, str(repo)])
    run(["git", "-C", str(repo), "sparse-checkout", "set", str(COLOR_SUBDIR).replace("\\", "/")])
    return repo / COLOR_SUBDIR


def resolve_color_dir(args) -> Path:
    if args.source_dir:
        source = Path(args.source_dir)
        if (source / COLOR_SUBDIR).is_dir():
            return source / COLOR_SUBDIR
        return source
    return ensure_git_color(Path(args.work), args.repo_url)


def collect_classes(color_dir: Path):
    classes = {}
    for entry in sorted(color_dir.iterdir()):
        if not entry.is_dir():
            continue
        images = [p for p in sorted(entry.iterdir()) if p.suffix.lower() in IMG_EXT]
        if images:
            classes[entry.name] = images
    return classes


def link_or_copy(src: Path, dst: Path) -> bool:
    if dst.exists():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)
    return True


def build_split(color_dir: Path, out: Path, val_fraction: float, seed: int, max_per_class: int):
    rng = random.Random(seed)
    classes = collect_classes(color_dir)
    if not classes:
        raise SystemExit(f"no image classes found under {color_dir} - check the download or --source-dir")
    added = 0
    for cls, images in classes.items():
        pool = list(images)
        rng.shuffle(pool)
        if max_per_class:
            pool = pool[:max_per_class]
        n_val = max(1, int(len(pool) * val_fraction))
        if len(pool) > 1 and n_val >= len(pool):
            n_val = len(pool) - 1
        for split, items in (("val", pool[:n_val]), ("train", pool[n_val:])):
            for src in items:
                if link_or_copy(src, out / split / cls / src.name):
                    added += 1
    return classes, added


def report(out: Path):
    print("\n[prepare] per-class counts (train / val):")
    total = 0
    for cls_dir in sorted((out / "train").iterdir()):
        if not cls_dir.is_dir():
            continue
        train = len([p for p in cls_dir.iterdir() if p.suffix.lower() in IMG_EXT])
        val_dir = out / "val" / cls_dir.name
        val = len([p for p in val_dir.iterdir() if p.suffix.lower() in IMG_EXT]) if val_dir.is_dir() else 0
        total += train + val
        print(f"  {cls_dir.name}: {train} / {val}")
    print(f"[prepare] total images: {total}")


def main():
    parser = argparse.ArgumentParser(description="Prepare the PlantVillage color dataset in Ultralytics classify layout")
    parser.add_argument("--out", default="plantvillage", help="output dataset root (train/<class> + val/<class>)")
    parser.add_argument("--work", default="pv_download", help="download/work directory for the sparse git checkout")
    parser.add_argument("--repo-url", default=DEFAULT_REPO)
    parser.add_argument("--source-dir", default="", help="use an existing local copy of the dataset (raw/color or class dirs) instead of downloading")
    parser.add_argument("--val-fraction", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--max-per-class", type=int, default=300, help="cap images per class for a fast CPU bootstrap (0 = use all)")
    args = parser.parse_args()

    color_dir = resolve_color_dir(args)
    if not color_dir.is_dir():
        raise SystemExit(f"color image directory not found: {color_dir}")

    out = Path(args.out)
    classes, added = build_split(color_dir, out, args.val_fraction, args.seed, args.max_per_class)
    print(f"[prepare] classes found: {len(classes)} (expected {EXPECTED_CLASSES})")
    if len(classes) != EXPECTED_CLASSES:
        print("[prepare] WARNING: unexpected class count - dataset may be incomplete; re-run to resume")
    print(f"[prepare] new files linked/copied: {added} (existing files are kept - re-runs are resume-safe)")
    report(out)
    print(
        "\n[prepare] disk notes: sparse color checkout ~2 GB, split output ~2 GB more if hardlinks are unavailable;\n"
        "  keep >= 6 GB free on the VPS (75 GB available).\n"
        "[prepare] training caps for 2 vCPU / 8 GB: defaults (--max-per-class 300) -> ~11k images/epoch;\n"
        "  use --max-per-class 0 only if you can leave the machine running much longer."
    )


if __name__ == "__main__":
    main()
