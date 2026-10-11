
import pandas as pd
import matplotlib.pyplot as plt

predictions = pd.read_csv("data/model_predictions.csv")
importance = pd.read_csv("data/feature_importance.csv")

plt.figure(figsize=(8, 6))
plt.scatter(
    predictions["actual_delay"],
    predictions["predicted_delay"],
    alpha=0.6
)

minimum = min(
    predictions["actual_delay"].min(),
    predictions["predicted_delay"].min()
)
maximum = max(
    predictions["actual_delay"].max(),
    predictions["predicted_delay"].max()
)

plt.plot(
    [minimum, maximum],
    [minimum, maximum],
    linestyle="--"
)

plt.xlabel("Actual Response Delay (minutes)")
plt.ylabel("Predicted Response Delay (minutes)")
plt.title("Actual vs Predicted Response Delay")
plt.tight_layout()
plt.savefig("data/actual_vs_predicted.png")
plt.show()

top_features = importance.head(15).sort_values(
    "importance", ascending=True
)

plt.figure(figsize=(10, 7))
plt.barh(
    top_features["feature"],
    top_features["importance"]
)

plt.xlabel("Feature Importance")
plt.ylabel("Features")
plt.title("Top 15 Important Features")
plt.tight_layout()
plt.savefig("data/feature_importance.png")
plt.show()

print("Both graphs saved successfully.")
print("1. data/actual_vs_predicted.png")
print("2. data/feature_importance.png")
