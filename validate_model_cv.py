
import pandas as pd
import numpy as np

from sklearn.model_selection import KFold, cross_validate
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestRegressor

# 1. Load cleaned dataset
df = pd.read_csv("data/rapidcare_cleaned_data.csv")

target = "response_delay_min"

numeric_features = [
    "distance_km",
    "availability_age_min",
    "hour_of_day",
    "available_ambulance_count"
]

categorical_features = [
    "locality",
    "partner_type",
    "partner_status",
    "day_of_week",
    "traffic_level",
    "weather_condition",
    "hospital_capacity_status",
    "dispatch_mode"
]

# 2. Feature engineering
df["distance_per_ambulance"] = (
    df["distance_km"] /
    df["available_ambulance_count"].clip(lower=1)
)

df["is_peak_hour"] = df["hour_of_day"].isin(
    [7, 8, 9, 17, 18, 19, 20]
).astype(int)

numeric_features += [
    "distance_per_ambulance",
    "is_peak_hour"
]

features = numeric_features + categorical_features

# 3. Select delays from 0 to 60 minutes
df = df[
    df[target].notna()
    & (df[target] >= 0)
    & (df[target] <= 60)
].copy()

X = df[features]
y = df[target]

# 4. Preprocessing
numeric_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="median"))
])

categorical_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("encoder", OneHotEncoder(handle_unknown="ignore"))
])

preprocessor = ColumnTransformer([
    ("num", numeric_transformer, numeric_features),
    ("cat", categorical_transformer, categorical_features)
])

# 5. Random Forest model
model = Pipeline([
    ("preprocessor", preprocessor),
    ("regressor", RandomForestRegressor(
        n_estimators=200,
        random_state=42,
        min_samples_leaf=2
    ))
])

# 6. Five-fold cross-validation
cv = KFold(n_splits=5, shuffle=True, random_state=42)

scores = cross_validate(
    model,
    X,
    y,
    cv=cv,
    scoring={
        "mae": "neg_mean_absolute_error",
        "rmse": "neg_root_mean_squared_error",
        "r2": "r2"
    }
)

# 7. Show results
mae_scores = -scores["test_mae"]
rmse_scores = -scores["test_rmse"]
r2_scores = scores["test_r2"]

print("DATASET RECORDS:", len(df))
print("\nFIVE-FOLD CROSS-VALIDATION RESULTS")

for i in range(5):
    print(
        f"Fold {i + 1}: "
        f"MAE={mae_scores[i]:.2f}, "
        f"RMSE={rmse_scores[i]:.2f}, "
        f"R2={r2_scores[i]:.3f}"
    )

print("\nAVERAGE RESULTS")
print(f"Mean MAE:  {mae_scores.mean():.2f}")
print(f"Mean RMSE: {rmse_scores.mean():.2f}")
print(f"Mean R2:   {r2_scores.mean():.3f}")

print("\nSTANDARD DEVIATION")
print(f"MAE Std:  {mae_scores.std():.2f}")
print(f"RMSE Std: {rmse_scores.std():.2f}")
print(f"R2 Std:   {r2_scores.std():.3f}")
