
import pandas as pd
import joblib

from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score

# 1. Load dataset
data_path = Path(__file__).parent / "train.csv"
df = pd.read_csv(data_path)

# 2. Remove columns that could cause leakage or are identifiers
drop_cols = [
    "patient_id",
    "triage_nurse_id",
    "disposition",
    "ed_los_hours"
]

X = df.drop(columns=["triage_acuity"] + drop_cols)
y = df["triage_acuity"]

# 3. Identify numeric and categorical columns
numeric_cols = X.select_dtypes(include="number").columns.tolist()
categorical_cols = X.select_dtypes(
    include=["object", "category", "bool"]
).columns.tolist()

# 4. Handle missing values and encode categories
numeric_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="median"))
])

categorical_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("encoder", OneHotEncoder(handle_unknown="ignore"))
])

preprocessor = ColumnTransformer([
    ("numeric", numeric_pipeline, numeric_cols),
    ("categorical", categorical_pipeline, categorical_cols)
])

# 5. Split data fairly across all five classes
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# 6. Build model
model = Pipeline([
    ("preprocessor", preprocessor),
    ("classifier", RandomForestClassifier(
        n_estimators=100,
        random_state=42,
        n_jobs=-1,
        class_weight="balanced"
    ))
])

# 7. Train
print("Training model...")
model.fit(X_train, y_train)

# 8. Evaluate on held-out test data
predictions = model.predict(X_test)

print("\nAccuracy:", round(accuracy_score(y_test, predictions), 4))
print("\nClassification Report:")
print(classification_report(y_test, predictions, zero_division=0))

# 9. Save model
output_path = Path(__file__).parent / "emergency_severity_model.joblib"
joblib.dump(model, output_path)

print("\nModel saved at:", output_path)
