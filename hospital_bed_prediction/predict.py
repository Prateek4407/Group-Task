
from pathlib import Path

import joblib
import pandas as pd

BASE_DIR = Path(__file__).parent
MODEL_PATH = BASE_DIR / "models" / "hospital_bed_model.joblib"
DATA_PATH = BASE_DIR / "data" / "hospital_occupancy.csv"

saved = joblib.load(MODEL_PATH)
model = saved["model"]
features = saved["features"]

df = pd.read_csv(DATA_PATH)
df["Date"] = pd.to_datetime(df["Date"])

# Latest available record for each department
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

result = pd.DataFrame({
    "Department": latest["Department"].to_numpy(),
    "Last_Record_Date": latest["Date"].dt.strftime("%Y-%m-%d").to_numpy(),
    "Predicted_Next_Day_Available_Beds": predictions.round(1),
})

print("\nAcademic prototype predictions:")
print(result.to_string(index=False))
print("\nNote: Estimates only; not verified live hospital availability.")
