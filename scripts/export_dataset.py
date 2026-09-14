import argparse
import csv
import os
import re

import requests

CANONICAL = {
    "timestamp",
    "drivelinks",
    "judgeverdict",
    "userverdict",
    "treatmentoutcome",
}

MIN_PER_CLASS = 30


def norm_key(key):
    return re.sub(r"[^a-z]", "", (key or "").strip().lower())


def norm_label(raw):
    text = str(raw or "").split("___")[-1]
    text = text.replace("_", " ").strip().lower()
    text = re.sub(r"[^a-z0-9 ]+", "", text)
    return text.replace(" ", "_") or "unknown"


def drive_id(url):
    text = str(url or "")
    match = re.search(r"/d/([A-Za-z0-9_-]{10,})", text)
    if match:
        return match.group(1)
    match = re.search(r"[?&]id=([A-Za-z0-9_-]{10,})", text)
    return match.group(1) if match else None


def download_drive(file_id, dest):
    session = requests.Session()
    url = "https://drive.google.com/uc"
    with session.get(url, params={"export": "download", "id": file_id}, stream=True, timeout=60) as resp:
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "")
        if "text/html" in content_type:
            token = re.search(r'name="confirm"\s+value="([^"]+)"', resp.text) or re.search(
                r"confirm=([0-9A-Za-z_]+)", resp.text
            )
            if not token:
                raise RuntimeError("drive confirm token not found - is the file shared link-readable?")
            resp.close()
            resp = session.get(
                url,
                params={"export": "download", "id": file_id, "confirm": token.group(1)},
                stream=True,
                timeout=120,
            )
            resp.raise_for_status()
        with open(dest, "wb") as handle:
            for chunk in resp.iter_content(64 * 1024):
                if chunk:
                    handle.write(chunk)


def main():
    parser = argparse.ArgumentParser(description="Export DiseaseScans rows into dataset/<label>/*.jpg")
    parser.add_argument("csv_path", help="CSV export of the DiseaseScans tab")
    parser.add_argument("--out", default="dataset", help="output directory (default: dataset)")
    parser.add_argument("--limit", type=int, default=0, help="max rows to process (0 = all)")
    args = parser.parse_args()

    with open(args.csv_path, newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        field_map = {}
        for name in reader.fieldnames or []:
            normalized = norm_key(name)
            if normalized in CANONICAL:
                field_map[normalized] = name
        missing = CANONICAL - set(field_map)
        if missing:
            raise SystemExit(f"CSV is missing expected columns: {sorted(missing)}")
        rows = list(reader)

    counts = {}
    skipped_wrong = 0
    skipped_other = 0
    downloaded = 0
    for index, row in enumerate(rows):
        if args.limit and index >= args.limit:
            break
        user_verdict = str(row.get(field_map["userverdict"], "") or "").strip()
        judge_verdict = str(row.get(field_map["judgeverdict"], "") or "").strip()
        if user_verdict.lower() == "wrong":
            skipped_wrong += 1
            continue
        label_raw = user_verdict or judge_verdict
        file_id = drive_id(row.get(field_map["drivelinks"], ""))
        if not label_raw or not file_id:
            skipped_other += 1
            continue
        label = norm_label(label_raw)
        class_dir = os.path.join(args.out, label)
        os.makedirs(class_dir, exist_ok=True)
        dest = os.path.join(class_dir, f"{label}_{file_id}.jpg")
        if not os.path.exists(dest):
            try:
                download_drive(file_id, dest)
                downloaded += 1
                print(f"[export] {dest}")
            except Exception as exc:
                print(f"[export] download failed for {file_id}: {exc}")
                skipped_other += 1
                continue
        counts[label] = counts.get(label, 0) + 1

    print("\n[export] summary")
    for label in sorted(counts):
        flag = "" if counts[label] >= MIN_PER_CLASS else f"  (< {MIN_PER_CLASS}, too few to fine-tune)"
        print(f"  {label}: {counts[label]}{flag}")
    print(f"[export] new downloads: {downloaded} | skipped user_verdict=Wrong: {skipped_wrong} | skipped other: {skipped_other}")
    print("[export] minimum sane dataset: ~30+ verified images per class before the first fine-tune")


if __name__ == "__main__":
    main()
