
from pathlib import Path

import joblib
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "hospital_bed_model.joblib"
DATA_PATH = BASE_DIR / "data" / "hospital_occupancy.csv"

_saved_model = None


def get_model():
    global _saved_model

    if _saved_model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError("Hospital bed model file not found.")

        saved = joblib.load(MODEL_PATH)
        _saved_model = {
            "model": saved["model"],
            "features": saved["features"],
        }

    return _saved_model


def predict_bed_availability():
    if not DATA_PATH.exists():
        raise FileNotFoundError("Hospital occupancy dataset not found.")

    saved = get_model()
    model = saved["model"]
    features = saved["features"]

    df = pd.read_csv(DATA_PATH)
    df["Date"] = pd.to_datetime(df["Date"])

    latest = (
        df.sort_values("Date")
        .groupby("Department", as_index=False)
        .tail(1)
        .copy()
    )

    latest["Day_Number"] = latest["Date"].dt.day
    latest["Day_Of_Year"] = latest["Date"].dt.dayofyear
    latest["Year"] = latest["Date"].dt.year

    predictions = model.predict(latest[features])

    results = []

    for (_, row), prediction in zip(latest.iterrows(), predictions):
        results.append({
            "department": str(row["Department"]),
            "last_record_date": row["Date"].strftime("%Y-%m-%d"),
            "predicted_next_day_available_beds": round(
                max(0.0, float(prediction)), 1
            ),
        })

    return {
        "predictions": results,
        "note": (
            "Historical-data estimates only; "
            "not verified live hospital bed availability."
        ),
    }


if __name__ == "__main__":
    import json

    print(json.dumps(predict_bed_availability(), indent=2))
