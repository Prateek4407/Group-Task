
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("data/rapidcare_cleaned_data.csv")

target = "response_delay_min"
delay = df[target]

print("TOTAL RECORDS:", len(df))
print("MISSING DELAYS:", delay.isna().sum())
print("ZERO DELAYS:", (delay == 0).sum())
print("NEGATIVE DELAYS:", (delay < 0).sum())
print("DELAYS ABOVE 60 MIN:", (delay > 60).sum())
print("DELAYS ABOVE 100 MIN:", (delay > 100).sum())
print("DELAYS ABOVE 500 MIN:", (delay > 500).sum())
print("DELAYS EQUAL TO 9999:", (delay == 9999).sum())

print("\nDELAY STATISTICS")
print(delay.describe(percentiles=[0.50, 0.75, 0.90, 0.95, 0.99]))

print("\nTOP 15 HIGHEST DELAYS")
columns = [
    "request_id",
    "partner_type",
    "partner_status",
    "distance_km",
    "available_ambulance_count",
    "traffic_level",
    "weather_condition",
    target
]
print(
    df.nlargest(15, target)[columns].to_string(index=False)
)

plt.figure(figsize=(9, 5))
plt.hist(delay[delay <= 60], bins=30, edgecolor="black")
plt.title("Response Delay Distribution: 0 to 60 Minutes")
plt.xlabel("Response Delay (minutes)")
plt.ylabel("Number of Requests")
plt.tight_layout()
plt.show()

plt.figure(figsize=(9, 5))
plt.boxplot(delay.dropna(), flierprops={"marker": "o"})
plt.title("Response Delay Boxplot: All Records")
plt.ylabel("Response Delay (minutes)")
plt.tight_layout()
plt.show()

plt.figure(figsize=(9, 5))
plt.hist(delay[delay <= 100], bins=30, edgecolor="black")
plt.title("Response Delay Distribution: 0 to 100 Minutes")
plt.xlabel("Response Delay (minutes)")
plt.ylabel("Number of Requests")
plt.tight_layout()
plt.show()

plt.figure(figsize=(9, 5))
plt.boxplot(
    delay[(delay >= 0) & (delay <= 60)],
    flierprops={"marker": "o"}
)
plt.title("Boxplot of Response Delays: 0–60 Minutes")
plt.ylabel("Response Delay (minutes)")
plt.tight_layout()
plt.show()

plt.figure(figsize=(9, 5))
plt.hist(delay[delay > 60], bins=15, edgecolor="black")
plt.title("Distribution of Delays Above 60 Minutes")
plt.xlabel("Response Delay (minutes)")
plt.ylabel("Number of Requests")
plt.tight_layout()
plt.show()

