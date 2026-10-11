
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from pathlib import Path

file_path = Path("data/model_predictions.csv")

if not file_path.exists():
    print("Error: model_predictions.csv file nahi mili.")
    raise SystemExit

df = pd.read_csv(file_path)

required_columns = ["actual_delay", "predicted_delay"]

if not all(column in df.columns for column in required_columns):
    print("CSV columns:", df.columns.tolist())
    print("Required columns missing hain.")
    raise SystemExit

df = df[required_columns].apply(pd.to_numeric, errors="coerce")
df = df.dropna()

if len(df) < 2:
    print("Validation ke liye enough valid records nahi hain.")
    raise SystemExit

df["absolute_error"] = (
    df["actual_delay"] - df["predicted_delay"]
).abs()

mae = mean_absolute_error(
    df["actual_delay"], df["predicted_delay"]
)

rmse = mean_squared_error(
    df["actual_delay"], df["predicted_delay"]
) ** 0.5

r2 = r2_score(
    df["actual_delay"], df["predicted_delay"]
)

print("\nMODEL VALIDATION RESULTS")
print("------------------------")
print("Valid test records:", len(df))
print("MAE:", round(mae, 2), "minutes")
print("RMSE:", round(rmse, 2), "minutes")
print("R2 Score:", round(r2, 3))
print("Mean actual delay:", round(df["actual_delay"].mean(), 2))
print("Mean predicted delay:", round(df["predicted_delay"].mean(), 2))

print("\nLARGEST PREDICTION ERRORS")
print(
    df.sort_values("absolute_error", ascending=False)
    .head(10)
    .to_string(index=False)
)

output_path = Path("data/validation_errors.csv")

df.sort_values(
    "absolute_error", ascending=False
).to_csv(output_path, index=False)

print("\nDetailed results saved to:", output_path)
