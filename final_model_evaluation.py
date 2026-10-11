
import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split, GridSearchCV, KFold
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# 1. Load dataset
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

numeric_features += ["distance_per_ambulance", "is_peak_hour"]
features = numeric_features + categorical_features

# 3. Select experimental scope: 0-60 minutes
df = df[
    df[target].notna()
    & (df[target] >= 0)
    & (df[target] <= 60)
].copy()

X = df[features]
y = df[target]

# 4. Keep an untouched test set
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# 5. Preprocessing
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

# 6. Original model
original_model = Pipeline([
    ("preprocessor", preprocessor),
    ("regressor", RandomForestRegressor(
        n_estimators=200,
        random_state=42,
        min_samples_leaf=2
    ))
])

original_model.fit(X_train, y_train)
original_pred = original_model.predict(X_test)

# 7. Tune only on training data
tuned_pipeline = Pipeline([
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
    tuned_pipeline,
    param_grid,
    scoring="neg_mean_absolute_error",
    cv=cv,
    n_jobs=-1
)

search.fit(X_train, y_train)
tuned_model = search.best_estimator_
tuned_pred = tuned_model.predict(X_test)

# 8. Compare on the same test set
results = []

for name, pred in [
    ("Original Random Forest", original_pred),
    ("Tuned Random Forest", tuned_pred)
]:
    results.append({
        "Model": name,
        "MAE": round(mean_absolute_error(y_test, pred), 3),
        "RMSE": round(
            np.sqrt(mean_squared_error(y_test, pred)), 3
        ),
        "R2": round(r2_score(y_test, pred), 3)
    })

print("Training records:", len(X_train))
print("Untouched test records:", len(X_test))
print("\nBest tuning parameters:")
print(search.best_params_)

print("\nFINAL TEST RESULTS")
results_df = pd.DataFrame(results)
print(results_df.to_string(index=False))

results_df.to_csv(
    "data/final_model_comparison.csv",
    index=False
)

# Save the tuned pipeline for later testing
import joblib
joblib.dump(tuned_model, "models/response_delay_model_tuned.joblib")

print("\nSaved comparison to data/final_model_comparison.csv")
print("Saved tuned model to models/response_delay_model_tuned.joblib")
