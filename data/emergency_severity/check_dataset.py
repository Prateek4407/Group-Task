
import pandas as pd
from pathlib import Path

file_path = Path("data/emergency_severity/train.csv")

df = pd.read_csv(file_path)

print("Dataset shape:", df.shape)
print("\nFirst 5 rows:")
print(df.head())

print("\nColumn names:")
print(df.columns.tolist())

print("\nMissing values:")
print(df.isnull().sum().sort_values(ascending=False).head(15))

print("\nTriage acuity distribution:")
print(df["triage_acuity"].value_counts().sort_index())
