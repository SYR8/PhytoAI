import io
import os
import threading

import uvicorn
from fastapi import FastAPI, File, UploadFile
from PIL import Image

MODEL_PATH = os.environ.get("MODEL_PATH", "/models/model.pt")
MODEL_NAME = os.environ.get("MODEL_NAME", "plantvillage-yolov8n-cls")

app = FastAPI(title="PhytoAI YOLO Analyst", version="1.0")

_lock = threading.Lock()
_model = None
_model_mtime = None


def label_simple(label: str) -> str:
    tail = str(label).split("___")[-1]
    return tail.replace("_", " ").strip().lower()


def ensure_model():
    global _model, _model_mtime
    with _lock:
        if not os.path.exists(MODEL_PATH):
            if _model is not None:
                _model = None
                _model_mtime = None
            return _model
        mtime = os.path.getmtime(MODEL_PATH)
        if _model is not None and mtime == _model_mtime:
            return _model
        try:
            from ultralytics import YOLO

            _model = YOLO(MODEL_PATH)
            _model_mtime = mtime
            print(f"[yolo] loaded {MODEL_PATH} as {MODEL_NAME}", flush=True)
        except Exception as exc:
            _model = None
            _model_mtime = None
            print(f"[yolo] model load failed: {exc}", flush=True)
        return _model


@app.get("/health")
def health():
    loaded = ensure_model() is not None
    return {"status": "ok" if loaded else "notyettrained", "model": MODEL_NAME, "model_path": MODEL_PATH}


@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    model = ensure_model()
    if model is None:
        return {"status": "notyettrained"}
    try:
        raw = await image.read()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        print(f"[yolo] bad image: {exc}", flush=True)
        return {"status": "unavailable"}
    try:
        results = model.predict(img, verbose=False)
        result = results[0]
        probs = result.probs
        names = result.names if hasattr(result, "names") else model.names
        top1 = int(probs.top1)
        top3 = []
        for idx, conf in list(zip(list(probs.top5), list(probs.top5conf.tolist())))[:3]:
            top3.append({"label": str(names[int(idx)]), "confidence": round(float(conf), 4)})
        label = str(names[top1])
        return {
            "status": "ok",
            "label": label,
            "label_simple": label_simple(label),
            "confidence": round(float(probs.top1conf), 4),
            "top3": top3,
            "model": MODEL_NAME,
        }
    except Exception as exc:
        print(f"[yolo] predict failed: {exc}", flush=True)
        return {"status": "unavailable"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8090")))
