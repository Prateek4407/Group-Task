
import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor

from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

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

# 2. Create the same engineered features
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

# 3. Keep the experimental target range
df = df[
    df[target].notna()
    & (df[target] >= 0)
    & (df[target] <= 60)
].copy()

X = df[features]
y = df[target]

# 4. Use the same split for every algorithm
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# 5. Prepare numerical and categorical columns
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

# 6. Algorithms to compare
algorithms = {
    "Linear Regression": LinearRegression(),

    "Decision Tree": DecisionTreeRegressor(
        random_state=42,
        min_samples_leaf=2
    ),

    "Random Forest": RandomForestRegressor(
        n_estimators=200,
        random_state=42,
        min_samples_leaf=2
    )
}

results = []

# 7. Train and evaluate each model
for name, algorithm in algorithms.items():
    model = Pipeline([
        ("preprocessor", preprocessor),
        ("regressor", algorithm)
    ])

    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    mae = mean_absolute_error(y_test, predictions)
    rmse = np.sqrt(mean_squared_error(y_test, predictions))
    r2 = r2_score(y_test, predictions)

    results.append({
        "Algorithm": name,
        "MAE": round(mae, 2),
        "RMSE": round(rmse, 2),
        "R2": round(r2, 3)
    })

results_df = pd.DataFrame(results).sort_values("MAE")
print("\nALGORITHM COMPARISON")
print(results_df.to_string(index=False))

results_df.to_csv(
    "data/algorithm_comparison.csv",
    index=False
)

print("\nSaved results to data/algorithm_comparison.csv")
