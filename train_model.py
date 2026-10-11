
import os
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

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

df = df.copy()

df["request_datetime"] = pd.to_datetime(
    df["request_datetime"], errors="coerce"
)

df["distance_per_ambulance"] = (
    df["distance_km"] /
    df["available_ambulance_count"].clip(lower=1)
)

df["is_peak_hour"] = df["hour_of_day"].isin(
    [7, 8, 9, 17, 18, 19, 20]
).astype(int)

numeric_features.extend([
    "distance_per_ambulance",
    "is_peak_hour"
])

features = numeric_features + categorical_features

print("TOTAL RECORDS:", len(df))
print("9999 DELAY RECORDS:", (df[target] == 9999).sum())
print("DELAYS ABOVE 60 MINUTES:", (df[target] > 60).sum())

df = df[
    df[target].notna() &
    (df[target] >= 0) &
    (df[target] <= 60)
].copy()

print("\nEXPERIMENTAL SCOPE: DELAYS FROM 0 TO 60 MINUTES")
print("ELIGIBLE RECORDS:", len(df))

train_df, test_df = train_test_split(
    df, test_size=0.2, random_state=42
)

X_train = train_df[features]
y_train = train_df[target]
X_test = test_df[features]
y_test = test_df[target]

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

model = Pipeline([
    ("preprocessor", preprocessor),
    ("regressor", RandomForestRegressor(
        n_estimators=200,
        random_state=42,
        min_samples_leaf=2
    ))
])

model.fit(X_train, y_train)
predictions = model.predict(X_test)

baseline_predictions = np.full(
    len(y_test), y_train.mean()
)

print("\nTRAINING ROWS:", len(X_train))
print("TESTING ROWS:", len(X_test))

print("\nBASELINE MODEL")
print("MAE:", round(mean_absolute_error(y_test, baseline_predictions), 2))
print("RMSE:", round(np.sqrt(mean_squared_error(y_test, baseline_predictions)), 2))
print("R2:", round(r2_score(y_test, baseline_predictions), 3))

print("\nRANDOM FOREST MODEL")
print("MAE:", round(mean_absolute_error(y_test, predictions), 2))
print("RMSE:", round(np.sqrt(mean_squared_error(y_test, predictions)), 2))
print("R2:", round(r2_score(y_test, predictions), 3))

feature_names = model.named_steps[
    "preprocessor"
].get_feature_names_out()

importances = model.named_steps[
    "regressor"
].feature_importances_

importance_df = pd.DataFrame({
    "feature": feature_names,
    "importance": importances
}).sort_values("importance", ascending=False)

print("\nTOP 15 IMPORTANT FEATURES")
print(importance_df.head(15).to_string(index=False))

os.makedirs("data", exist_ok=True)
os.makedirs("models", exist_ok=True)

results = test_df[features].reset_index(drop=True).copy()

results["actual_delay"] = y_test.reset_index(drop=True)
results["predicted_delay"] = predictions

results["absolute_error"] = (
    results["actual_delay"] - results["predicted_delay"]
).abs()

results.to_csv("data/model_predictions.csv", index=False)

results.sort_values(
    "absolute_error", ascending=False
).head(10).to_csv(
    "data/largest_prediction_errors.csv", index=False
)

importance_df.to_csv("data/feature_importance.csv", index=False)

joblib.dump(model, "models/response_delay_model.joblib")

print("\nSAVED: data/model_predictions.csv")
print("SAVED: data/largest_prediction_errors.csv")
print("SAVED: data/feature_importance.csv")
print("SAVED: models/response_delay_model.joblib")
