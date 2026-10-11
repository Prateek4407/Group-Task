
import pandas as pd
import numpy as np

from sklearn.model_selection import KFold, GridSearchCV
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestRegressor

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

df = df[
    df[target].notna()
    & (df[target] >= 0)
    & (df[target] <= 60)
].copy()

X = df[numeric_features + categorical_features]
y = df[target]

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

pipeline = Pipeline([
    ("preprocessor", preprocessor),
    ("regressor", RandomForestRegressor(random_state=42))
])

param_grid = {
    "regressor__n_estimators": [100, 200],
    "regressor__max_features": [0.7, 1.0],
    "regressor__min_samples_leaf": [2, 5, 10]
}

cv = KFold(n_splits=5, shuffle=True, random_state=42)

search = GridSearchCV(
    pipeline,
    param_grid,
    scoring="neg_mean_absolute_error",
    cv=cv,
    n_jobs=-1,
    verbose=1
)

search.fit(X, y)

print("\nBEST PARAMETERS:")
print(search.best_params_)

print("\nBEST CROSS-VALIDATION MAE:")
print(round(-search.best_score_, 3), "minutes")

results = pd.DataFrame(search.cv_results_)
results["mean_MAE"] = -results["mean_test_score"]

results[
    ["params", "mean_MAE", "std_test_score", "rank_test_score"]
].sort_values("rank_test_score").to_csv(
    "data/random_forest_tuning_results.csv",
    index=False
)

print("\nSaved tuning results to data/random_forest_tuning_results.csv")
