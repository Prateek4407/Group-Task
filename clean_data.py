
import pandas as pd
import numpy as np

df = pd.read_csv("data/rapidcare_uncleaned_data.csv")

print("ORIGINAL DATASET SHAPE:", df.shape)

df = df.drop_duplicates().copy()

def clean_text(series):
    return series.astype("str").str.strip().str.lower()

def convert_number(series):
    return pd.to_numeric(
        series.astype("str")
        .str.replace(",", ".", regex=False)
        .str.replace(r"[^\d.\-]", "", regex=True),
        errors="coerce"
    )

df["request_datetime"] = pd.to_datetime(
    df["request_datetime"],
    format="mixed",
    errors="coerce"
)

df["locality"] = df["locality"].astype("str").str.strip().str.title()
df["locality"] = df["locality"].replace(
    ["", "Nan", "None", "Unknown", "?", "-"], np.nan
)

numeric_columns = [
    "distance_km",
    "availability_age_min",
    "hour_of_day",
    "available_ambulance_count",
    "response_delay_min"
]

for col in numeric_columns:
    df[col] = convert_number(df[col])

df.loc[~df["distance_km"].between(0, 500), "distance_km"] = np.nan
df.loc[~df["availability_age_min"].between(0, 1440), "availability_age_min"] = np.nan
df.loc[~df["hour_of_day"].between(0, 23), "hour_of_day"] = np.nan
df.loc[~df["available_ambulance_count"].between(0, 100), "available_ambulance_count"] = np.nan
df.loc[df["response_delay_min"] < 0, "response_delay_min"] = np.nan

df["partner_type"] = clean_text(df["partner_type"]).replace({
    "hosp.": "hospital",
    "hosp": "hospital",
    "amb": "ambulance",
    "ambulance svc": "ambulance"
})

df["partner_status"] = clean_text(df["partner_status"]).replace({
    "avail": "available",
    "avail.": "available",
    "avaliable": "available",
    "limted": "limited",
    "ltd": "limited",
    "bsy": "busy",
    "busy.": "busy"
})

df["traffic_level"] = clean_text(df["traffic_level"]).replace({
    "hi": "high",
    "med": "medium",
    "med.": "medium",
    "lo": "low"
})

df["weather_condition"] = clean_text(df["weather_condition"]).replace({
    "clr": "clear",
    "cldy": "cloudy",
    "rain": "rainy",
    "fog": "foggy"
})

df["hospital_capacity_status"] = clean_text(
    df["hospital_capacity_status"]
).replace({
    "avail": "available",
    "not applicable": "not_applicable",
    "not-applicable": "not_applicable",
    "not available": "unavailable",
    "ltd": "limited"
})

df["dispatch_mode"] = clean_text(df["dispatch_mode"]).replace({
    "auto": "automated",
    "automatic": "automated",
    "manually": "manual",
    "man.": "manual"
})

df["day_of_week"] = clean_text(df["day_of_week"]).replace({
    "mon": "monday",
    "tue": "tuesday",
    "wed": "wednesday",
    "thu": "thursday",
    "fri": "friday",
    "sat": "saturday",
    "sun": "sunday"
})

unknown_values = ["", "nan", "none", "unknown", "?", "-"]

categorical_columns = [
    "partner_type",
    "partner_status",
    "traffic_level",
    "weather_condition",
    "hospital_capacity_status",
    "dispatch_mode",
    "day_of_week"
]

for col in categorical_columns:
    df[col] = df[col].replace(unknown_values, np.nan)

df["hospital_capacity_status"] = df["hospital_capacity_status"].replace(
    ["n.a."], np.nan
)

valid_days = [
    "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday"
]

df.loc[~df["day_of_week"].isin(valid_days), "day_of_week"] = np.nan

df = df.dropna(subset=["response_delay_min"]).copy()

numeric_predictors = [
    "distance_km",
    "availability_age_min",
    "hour_of_day",
    "available_ambulance_count"
]

categorical_predictors = [
    "locality",
    "partner_type",
    "partner_status",
    "day_of_week",
    "traffic_level",
    "weather_condition",
    "hospital_capacity_status",
    "dispatch_mode"
]

for col in numeric_predictors:
    df[col] = df[col].fillna(df[col].median())

for col in categorical_predictors:
    mode_values = df[col].mode()
    if not mode_values.empty:
        df[col] = df[col].fillna(mode_values.iloc[0])

df = df.drop_duplicates().copy()

print("\nFINAL DUPLICATE COUNT:", df.duplicated().sum())

print("\nHIGHEST RESPONSE DELAYS")
print(
    df.nlargest(15, "response_delay_min")[
        ["request_id", "response_delay_min", "distance_km", "partner_status"]
    ].to_string(index=False)
)

print("\nRESPONSE DELAY QUANTILES")
print(
    df["response_delay_min"].quantile(
        [0.25, 0.50, 0.75, 0.90, 0.95, 0.99]
    )
)

print("\nFINAL CLEANED DATASET SHAPE:", df.shape)

print("\nMISSING VALUES AFTER CLEANING")
print(df.isnull().sum())

print("\nMISSING DATETIME COUNT:", df["request_datetime"].isnull().sum())

print("\nCLEANED CATEGORICAL VALUES")
for col in [
    "partner_type",
    "partner_status",
    "traffic_level",
    "weather_condition",
    "dispatch_mode"
]:
    print(col, df[col].value_counts().to_dict())

df.to_csv("data/rapidcare_cleaned_data.csv", index=False)

print("\nCLEANED DATA SAVED SUCCESSFULLY")
print("File: data/rapidcare_cleaned_data.csv")
