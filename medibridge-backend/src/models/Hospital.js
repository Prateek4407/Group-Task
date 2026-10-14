const mongoose = require('mongoose');
const plugin = require('./plugin');

/* _id is the readable code used by the frontend: H1, H2, ... */
const hospitalSchema = new mongoose.Schema({
  _id: { type: String },
  name: { type: String, required: true },
  area: String,
  km: Number,
  eta: Number,
  icu: Number,
  vent: Number,
  load: { type: String, enum: ['Low', 'Moderate', 'High', 'Saturated'] },
  care: [{ type: String, enum: ['Emergency', 'Cardiac', 'Trauma', 'Maternity'] }],
  src: { type: String, enum: ['Verified', 'Declared', 'Estimated', 'Simulated'] },
  x: Number,
  y: Number,
  lat: Number,            // real-world position, used to find the nearest ambulance
  lng: Number
});
hospitalSchema.plugin(plugin);

module.exports = mongoose.model('Hospital', hospitalSchema);
