const mongoose = require('mongoose');
const plugin = require('./plugin');

const CATEGORIES = ['Medical History', 'Lab Report', 'Prescription', 'Imaging / Scan', 'Discharge Summary', 'Insurance', 'ID Proof', 'Other'];

const documentSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ownerName: { type: String, required: true },
  category: { type: String, enum: CATEGORIES, required: true },
  title: { type: String, required: true, trim: true },
  fileName: { type: String, required: true },     // original name shown to users
  fileId: { type: mongoose.Schema.Types.ObjectId, default: null },   // GridFS file in MongoDB (survives redeploys)
  storedName: { type: String, default: '' },     // legacy: random name on disk (documents uploaded before GridFS)
  mimeType: { type: String, default: 'application/octet-stream' },
  size: { type: Number, required: true },
  note: { type: String, default: '' }
}, { timestamps: true });
documentSchema.plugin(plugin);

module.exports = mongoose.model('Document', documentSchema);
module.exports.CATEGORIES = CATEGORIES;
