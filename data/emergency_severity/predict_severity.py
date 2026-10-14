
import pandas as pd
import joblib
from pathlib import Path

folder = Path(__file__).parent

model = joblib.load(
    folder / "emergency_severity_model.joblib"
)

def predict_severity(patient_data):
    """
    patient_data: dictionary containing the model input features
    """

    input_df = pd.DataFrame([patient_data])

    prediction = model.predict(input_df)[0]

    return {
        "predicted_acuity": int(prediction),
        "message": (
            "Academic prototype prediction only. "
            "Not for real medical triage."
        )
    }


if __name__ == "__main__":
    df = pd.read_csv(folder / "train.csv")

    drop_cols = [
        "patient_id",
        "triage_nurse_id",
        "disposition",
        "ed_los_hours",
        "triage_acuity"
    ]

    X = df.drop(columns=drop_cols)

    sample = X.iloc[0].to_dict()

    result = predict_severity(sample)

    print("Prediction result:", result)
