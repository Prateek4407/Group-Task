const mongoose = require('mongoose');
const plugin = require('./plugin');

const TYPES = ['BLS', 'ALS', 'Cardiac', 'Neonatal', 'Patient Transport'];
const STATUSES = ['available', 'assigned', 'offline', 'maintenance'];

const ambulanceSchema = new mongoose.Schema({
  registration: { type: String, required: true, unique: true, uppercase: true, trim: true },   // vehicle number, e.g. DL1CAB1234
  type: { type: String, enum: TYPES, default: 'BLS' },
  hospital: { type: String, ref: 'Hospital', required: true },                                // base hospital (H1, H2 ...)
  driverName: { type: String, trim: true, default: '' },
  driverPhone: { type: String, trim: true, default: '' },
  driverUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },          // driver login that may send GPS
  equipment: [{ type: String, trim: true }],
  status: { type: String, enum: STATUSES, default: 'available' },
  /* source: base = parked at the hospital, manual = typed in by staff, gps = sent by the driver's phone */
  location: {
    lat: Number, lng: Number, updatedAt: Date,
    source: { type: String, enum: ['base', 'manual', 'gps'], default: 'base' }
  },
  assignedCase: { type: String, default: null },        // CB-1234 while status === 'assigned'
  assignedAt: { type: Date, default: null }
}, { timestamps: true });
ambulanceSchema.index({ hospital: 1, status: 1 });
ambulanceSchema.plugin(plugin);

module.exports = mongoose.model('Ambulance', ambulanceSchema);
module.exports.TYPES = TYPES;
module.exports.STATUSES = STATUSES;
