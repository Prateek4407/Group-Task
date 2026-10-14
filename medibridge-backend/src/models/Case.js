const mongoose = require('mongoose');
const plugin = require('./plugin');

const caseSchema = new mongoose.Schema({
  caseId: { type: String, required: true, unique: true },          // CB-1234
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = sent without login
  name: { type: String, required: true, trim: true },
  age: { type: Number, required: true, min: 0, max: 120 },
  sex: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
  phone: { type: String, required: true },
  rel: { type: String, enum: ['Self', 'Spouse', 'Child', 'Parent', 'Good Samaritan'], default: 'Self' },
  care: { type: String, enum: ['Emergency', 'Cardiac', 'Trauma', 'Maternity'], required: true },
  sev: { type: String, enum: ['P1', 'P2', 'P3'], required: true },
  symptoms: { type: String, default: '' },
  address: { type: String, required: true },
  landmark: { type: String, default: '' },
  gps: { lat: Number, lng: Number },
  hospital: { type: String, ref: 'Hospital', required: true },
  stage: { type: Number, default: 0, min: 0, max: 5 },              // 0..5 -> "Stage 1 of 6" .. "Stage 6 of 6"
  stageStart: { type: Date, default: Date.now },
  stageLog: [{ _id: false, stage: Number, at: Date }],
  ambulance: { type: mongoose.Schema.Types.ObjectId, ref: 'Ambulance', default: null },
  ambulanceOrigin: { lat: Number, lng: Number },       // where the ambulance was when it was assigned
  ambulanceAssignedAt: { type: Date, default: null },
  isDemo: { type: Boolean, default: false },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  acknowledgedAt: { type: Date, default: null }
}, { timestamps: true });
caseSchema.plugin(plugin);

module.exports = mongoose.model('Case', caseSchema);
