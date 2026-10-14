
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

BASE_DIR = Path(__file__).parent
DATA_PATH = BASE_DIR / "data" / "hospital_occupancy.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "hospital_bed_model.joblib"

df = pd.read_csv(DATA_PATH)
df["Date"] = pd.to_datetime(df["Date"])
df = df.sort_values(["Date", "Department"]).copy()

# Label: next day's recorded available beds in the same department
df["Next_Day_Available_Beds"] = (
    df.groupby("Department")["Total_Hospital_Beds"].shift(-1)
    - df.groupby("Department")["Beds_Occupied"].shift(-1)
)

df = df.dropna(subset=["Next_Day_Available_Beds"]).copy()

# Only information available on the current day is used as input.
df["Day_Number"] = df["Date"].dt.day
df["Day_Of_Year"] = df["Date"].dt.dayofyear
df["Year"] = df["Date"].dt.year

numeric_features = [
    "Month",
    "Day_Number",
    "Day_Of_Year",
    "Year",
    "Total_Hospital_Beds",
    "Beds_Occupied",
    "Occupancy_Rate_Pct",
    "Daily_Admissions",
    "Daily_Discharges",
    "Emergency_Admissions",
    "ICU_Admissions",
    "Avg_Length_of_Stay",
    "Public_Holiday",
    "Special_Event",
    "Staff_Availability_Pct",
]

categorical_features = ["Department", "Day_of_Week", "Season"]

features = numeric_features + categorical_features
target = "Next_Day_Available_Beds"

train = df[df["Date"] < "2024-01-01"]
test = df[df["Date"] >= "2024-01-01"]

X_train = train[features]
y_train = train[target]
X_test = test[features]
y_test = test[target]

preprocessor = ColumnTransformer(
    transformers=[
        ("numeric", "passthrough", numeric_features),
        ("categorical", OneHotEncoder(handle_unknown="ignore"),
         categorical_features),
    ]
)

model = Pipeline(
    steps=[
        ("preprocessor", preprocessor),
        ("regressor", RandomForestRegressor(
            n_estimators=200,
            random_state=42,
            min_samples_leaf=2,
            n_jobs=-1,
        )),
    ]
)

model.fit(X_train, y_train)
predictions = model.predict(X_test)

print("Training rows:", len(train))
print("Testing rows:", len(test))
print(f"MAE: {mean_absolute_error(y_test, predictions):.2f} beds")
print(f"RMSE: {mean_squared_error(y_test, predictions) ** 0.5:.2f} beds")
print(f"R²: {r2_score(y_test, predictions):.3f}")

MODEL_DIR.mkdir(parents=True, exist_ok=True)
joblib.dump(
    {"model": model, "features": features},
    MODEL_PATH,
)
print(f"Model saved to: {MODEL_PATH}")
