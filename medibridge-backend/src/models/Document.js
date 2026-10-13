const mongoose = require('mongoose');
const plugin = require('./plugin');

const CATEGORIES = ['Medical History', 'Lab Report', 'Prescription', 'Scan / Imaging', 'Other'];

const documentSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ownerName: { type: String, required: true },
  category: { type: String, enum: CATEGORIES, required: true },
  title: { type: String, required: true, trim: true },
  fileName: { type: String, required: true },     // original name shown to users
  storedName: { type: String, required: true },   // random name on disk (never exposed)
  mimeType: { type: String, default: 'application/octet-stream' },
  size: { type: Number, required: true },
  note: { type: String, default: '' }
}, { timestamps: true });
documentSchema.plugin(plugin);

module.exports = mongoose.model('Document', documentSchema);
module.exports.CATEGORIES = CATEGORIES;
