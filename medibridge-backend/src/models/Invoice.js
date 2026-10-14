const mongoose = require('mongoose');
const plugin = require('./plugin');

const invoiceSchema = new mongoose.Schema({
  invoiceId: { type: String, required: true, unique: true },       // INV-1001
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  service: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
  method: { type: String, enum: ['', 'UPI', 'Card', 'Pay at hospital'], default: '' },
  paidAt: { type: Date, default: null },
  caseId: { type: String, default: null }
}, { timestamps: true });
invoiceSchema.plugin(plugin);

module.exports = mongoose.model('Invoice', invoiceSchema);
