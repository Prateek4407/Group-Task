
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder
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

df = df.dropna(subset=[target])
df = df[df[target] >= 0].copy()

def evaluate(data, label):
    X = data[features]
    y = data[target]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

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
    baseline_predictions = np.full(len(y_test), y_train.mean())

    print(f"\n{label}")
    print(f"Training rows: {len(X_train)}")
    print(f"Testing rows: {len(X_test)}")
    print(f"Random Forest MAE: {mean_absolute_error(y_test, predictions):.2f}")
    print(f"Random Forest RMSE: {np.sqrt(mean_squared_error(y_test, predictions)):.2f}")
    print(f"Random Forest R2: {r2_score(y_test, predictions):.3f}")
    print(f"Baseline MAE: {mean_absolute_error(y_test, baseline_predictions):.2f}")
    print(f"Baseline RMSE: {np.sqrt(mean_squared_error(y_test, baseline_predictions)):.2f}")
    print(f"Baseline R2: {r2_score(y_test, baseline_predictions):.3f}")

    return X_test, y_test, predictions

print("\nEXPERIMENT A: ALL RECORDS")
evaluate(df, "ALL RECORDS")

print("\nEXPERIMENT B: TRAIN WITHOUT 9999, COMMON TEST SET")
train_pool = df[df[target] != 9999]
test_pool = df
X_train_b, X_test_b, y_train_b, y_test_b = train_test_split(
    df[features], df[target], test_size=0.2, random_state=42
)
train_mask = y_train_b != 9999
X_train_b = X_train_b.loc[train_mask]
y_train_b = y_train_b.loc[train_mask]

numeric_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="median"))
])
categorical_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("encoder", OneHotEncoder(handle_unknown="ignore"))
])
preprocessor_b = ColumnTransformer([
    ("num", numeric_transformer, numeric_features),
    ("cat", categorical_transformer, categorical_features)
])
model_b = Pipeline([
    ("preprocessor", preprocessor_b),
    ("regressor", RandomForestRegressor(
        n_estimators=200, random_state=42, min_samples_leaf=2
    ))
])
model_b.fit(X_train_b, y_train_b)
pred_b = model_b.predict(X_test_b)
base_b = np.full(len(y_test_b), y_train_b.mean())
print(f"Training rows: {len(X_train_b)}")
print(f"Testing rows: {len(X_test_b)}")
print(f"Random Forest MAE: {mean_absolute_error(y_test_b, pred_b):.2f}")
print(f"Random Forest RMSE: {np.sqrt(mean_squared_error(y_test_b, pred_b)):.2f}")
print(f"Random Forest R2: {r2_score(y_test_b, pred_b):.3f}")
print(f"Baseline MAE: {mean_absolute_error(y_test_b, base_b):.2f}")
print(f"Baseline RMSE: {np.sqrt(mean_squared_error(y_test_b, base_b)):.2f}")
print(f"Baseline R2: {r2_score(y_test_b, base_b):.3f}")

print("\nEXPERIMENT C: DELAYS UP TO 60 MINUTES ONLY")
df_c = df[df[target] <= 60].copy()
X_test_c, y_test_c, pred_c = evaluate(
    df_c, "DELAYS UP TO 60 MINUTES ONLY"
)

prediction_results = pd.DataFrame({
    "actual_delay": y_test_c,
    "predicted_delay": pred_c
}, index=y_test_c.index)

prediction_results["absolute_error"] = abs(
    prediction_results["actual_delay"] -
    prediction_results["predicted_delay"]
)

print("\nSAMPLE PREDICTIONS")
print(prediction_results.head(15).round(2).to_string(index=False))

print("\nLARGEST PREDICTION ERRORS")
print(
    prediction_results.nlargest(10, "absolute_error")
    .round(2).to_string(index=False)
)

error_indices = prediction_results.nlargest(
    10, "absolute_error"
).index

error_details = df.loc[error_indices, features].copy()
error_details.insert(
    0, "actual_delay",
    prediction_results.loc[error_indices, "actual_delay"]
)
error_details.insert(
    1, "predicted_delay",
    prediction_results.loc[error_indices, "predicted_delay"]
)
error_details.insert(
    2, "absolute_error",
    prediction_results.loc[error_indices, "absolute_error"]
)

print("\nLARGEST ERRORS WITH INPUT FEATURES")
print(error_details.round(2).to_string(index=False))

prediction_results.to_csv(
    "data/experiment_c_predictions.csv", index=False
)
error_details.to_csv(
    "data/largest_prediction_errors.csv", index=False
)

print("\nSaved predictions to data/experiment_c_predictions.csv")
print("Saved error details to data/largest_prediction_errors.csv")
