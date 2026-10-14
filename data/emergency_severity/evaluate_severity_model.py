
import pandas as pd
import joblib

from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)

folder = Path(__file__).parent

df = pd.read_csv(folder / "train.csv")

drop_cols = [
    "patient_id",
    "triage_nurse_id",
    "disposition",
    "ed_los_hours",
    "triage_acuity"
]

X = df.drop(columns=drop_cols)
y = df["triage_acuity"]

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

model = joblib.load(folder / "emergency_severity_model.joblib")

predictions = model.predict(X_test)

print("Accuracy:", accuracy_score(y_test, predictions))

print("\nClassification Report:")
print(classification_report(y_test, predictions))

print("\nConfusion Matrix:")
print(confusion_matrix(y_test, predictions))
