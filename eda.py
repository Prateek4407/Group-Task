
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

df = pd.read_csv("data/rapidcare_uncleaned_data.csv")

print("\nFIRST 5 ROWS")
print(df.head().to_string())

print("\nDATASET SHAPE")
print(df.shape)

print("\nCOLUMN NAMES")
print(df.columns.tolist())

print("\nDATA TYPES")
print(df.dtypes)

print("\nMISSING VALUES")
print(df.isnull().sum())

print("\nTOTAL MISSING VALUES")
print(df.isnull().sum().sum())

print("\nDUPLICATE ROWS")
print(df.duplicated().sum())

print("\nCATEGORICAL SUMMARY")
print(df.describe(include="str").to_string())

print("\nUNIQUE VALUES")
for col in df.select_dtypes(include="str").columns:
    print("\n", col)
    print(df[col].value_counts(dropna=False).to_string())

df["distance_num"] = pd.to_numeric(
    df["distance_km"].str.replace(" km", "", regex=False).str.replace("km", "", regex=False).str.strip(),
    errors="coerce"
)

df["delay_num"] = pd.to_numeric(
    df["response_delay_min"].str.replace(" min", "", regex=False).str.strip().str.replace(",", ".", regex=False),
    errors="coerce"
)

print("\nNUMERIC CONVERSION")
print("Valid distance values:", df["distance_num"].notna().sum())
print("Valid response delay values:", df["delay_num"].notna().sum())

plt.figure(figsize=(8, 5))
df["delay_num"].dropna().hist(bins=30)
plt.xlabel("Response Delay (minutes)")
plt.ylabel("Count")
plt.title("Response Delay Distribution")
plt.tight_layout()
plt.show()

delay = df["delay_num"].dropna()

Q1 = delay.quantile(0.25)
Q3 = delay.quantile(0.75)
IQR = Q3 - Q1

lower_limit = Q1 - 1.5 * IQR
upper_limit = Q3 + 1.5 * IQR

outliers = (delay < lower_limit) | (delay > upper_limit)

print("\nOUTLIER DETECTION")
print("Q1:", Q1)
print("Q3:", Q3)
print("IQR:", IQR)
print("Lower limit:", lower_limit)
print("Upper limit:", upper_limit)
print("Number of outliers:", outliers.sum())

plt.figure(figsize=(8, 5))
sns.boxplot(x=delay)
plt.xlabel("Response Delay (minutes)")
plt.title("Boxplot Before Outlier Treatment")
plt.tight_layout()
plt.show()

delay_treated = delay.clip(lower=lower_limit, upper=upper_limit)

plt.figure(figsize=(8, 5))
sns.boxplot(x=delay_treated)
plt.xlabel("Response Delay (minutes)")
plt.title("Boxplot After Outlier Treatment")
plt.tight_layout()
plt.show()

print("\nOUTLIER TREATMENT")
print("Original minimum:", delay.min())
print("Original maximum:", delay.max())
print("Treated minimum:", delay_treated.min())
print("Treated maximum:", delay_treated.max())

plt.figure(figsize=(8, 5))
sns.histplot(df["distance_num"].dropna(), bins=30)
plt.xlabel("Distance (km)")
plt.ylabel("Count")
plt.title("Distance Distribution")
plt.tight_layout()
plt.show()

print("\nEDA COMPLETED")
