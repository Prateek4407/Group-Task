
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any
import pandas as pd
import joblib

# Project paths
BASE_DIR = Path(__file__).resolve().parent

# FastAPI application
app = FastAPI(title="MediBridge ML API")

# Load the existing delay model
delay_model = joblib.load(
    BASE_DIR / "models" / "response_delay_model.joblib"
)

# Severity model loads only when first requested
severity_model = None

DROP_COLUMNS = [
    "patient_id",
    "triage_nurse_id",
    "disposition",
    "ed_los_hours",
    "triage_acuity"
]


class DelayRequest(BaseModel):
    distance_km: float
    availability_age_min: float
    hour_of_day: int
    available_ambulance_count: int
    distance_per_ambulance: float
    is_peak_hour: int
    locality: str
    partner_status: str
    partner_type: str
    traffic_level: str
    weather_condition: str
    dispatch_mode: str
    hospital_capacity_status: str
    day_of_week: str


@app.get("/")
def home():
    return {
        "message": "MediBridge ML API is running",
        "endpoints": ["/predict/delay", "/predict/severity", "/docs"]
    }


@app.post("/predict/delay")
def predict_delay(request: DelayRequest):
    input_data = pd.DataFrame([request.model_dump()])
    prediction = delay_model.predict(input_data)[0]

    return {
        "predicted_response_delay_min": round(float(prediction), 2),
        "message": "Estimated delay only; not a live ambulance ETA."
    }


@app.post("/predict/severity")
def predict_severity(data: dict[str, Any]):
    global severity_model

    try:
        model_path = (
            BASE_DIR
            / "data"
            / "emergency_severity"
            / "emergency_severity_model.joblib"
        )

        if severity_model is None:
            if not model_path.exists():
                raise HTTPException(
                    status_code=503,
                    detail="Severity model file is not available."
                )
            severity_model = joblib.load(model_path)

        # Match the input columns used during training
        expected_columns = list(
            severity_model.feature_names_in_
        )

        missing_columns = [
            col for col in expected_columns if col not in data
        ]

        if missing_columns:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Some required input fields are missing.",
                    "missing_columns": missing_columns
                }
            )

        input_data = pd.DataFrame(
            [{col: data[col] for col in expected_columns}]
        )

        prediction = severity_model.predict(input_data)[0]

        return {
            "predicted_acuity": int(prediction),
            "message": (
                "Academic prototype prediction only. "
                "Not for real medical triage."
            )
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(exc)}"
        )

@app.post("/predict/beds")
def predict_beds():
    try:
        from hospital_bed_prediction.predict import predict_bed_availability
        return predict_bed_availability()

    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Bed prediction failed: {str(exc)}"
        )
