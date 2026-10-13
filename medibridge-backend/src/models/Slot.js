const mongoose = require('mongoose');
const plugin = require('./plugin');

const slotSchema = new mongoose.Schema({
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorName: { type: String, required: true },
  date: { type: String, required: true },       // YYYY-MM-DD
  from: { type: String, required: true },       // HH:MM
  to: { type: String, required: true },
  note: { type: String, default: '' },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  bookedByName: { type: String, default: null }
}, { timestamps: true });
slotSchema.index({ doctor: 1, date: 1 });
slotSchema.plugin(plugin);

module.exports = mongoose.model('Slot', slotSchema);
