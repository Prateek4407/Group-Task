
import joblib
import pandas as pd

model = joblib.load("models/response_delay_model.joblib")

sample = {
    "distance_km": 5.0,
    "availability_age_min": 10.0,
    "hour_of_day": 14,
    "available_ambulance_count": 3,
    "distance_per_ambulance": 5.0 / 3,
    "is_peak_hour": 0,
    "locality": "Central Zone",
    "partner_status": "available",
    "partner_type": "unknown",
    "traffic_level": "medium",
    "weather_condition": "clear",
    "dispatch_mode": "automated",
    "hospital_capacity_status": "available",
    "day_of_week": "monday"
}

input_data = pd.DataFrame([sample])
prediction = model.predict(input_data)

print("Predicted Response Delay:", round(prediction[0], 2), "minutes")
