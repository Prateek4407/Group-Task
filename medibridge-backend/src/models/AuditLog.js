const mongoose = require('mongoose');
const plugin = require('./plugin');

const ACTIONS = ['document.upload', 'document.view', 'document.download', 'document.delete', 'document.denied', 'consent.grant', 'consent.withdraw'];

/* Append-only: the API has no route that edits or deletes an audit entry. */
const auditSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorName: { type: String, required: true },
  actorRole: { type: String, required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },   // whose record was touched
  patientName: { type: String, default: '' },
  action: { type: String, enum: ACTIONS, required: true },
  targetType: { type: String, default: 'document' },
  targetId: { type: String, default: '' },
  targetLabel: { type: String, default: '' },      // file name or consent scope
  ip: { type: String, default: '' }
}, { timestamps: { createdAt: true, updatedAt: false } });
auditSchema.index({ patient: 1, createdAt: -1 });
auditSchema.plugin(plugin);

module.exports = mongoose.model('AuditLog', auditSchema);
module.exports.ACTIONS = ACTIONS;
