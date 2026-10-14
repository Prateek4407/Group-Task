

import pandas as pd
import joblib
from pathlib import Path

folder = Path(__file__).parent

model = joblib.load(folder / "emergency_severity_model.joblib")
df = pd.read_csv(folder / "train.csv")

drop_cols = [
    "patient_id",
    "triage_nurse_id",
    "disposition",
    "ed_los_hours",
    "triage_acuity"
]

X = df.drop(columns=drop_cols)
sample = X.iloc[[0]]

prediction = model.predict(sample)[0]

print("Predicted acuity:", prediction)
