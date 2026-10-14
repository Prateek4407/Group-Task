const mongoose = require('mongoose');
const plugin = require('./plugin');

const SCOPES = ['documents', 'emergency-case'];

/* One row per decision. The newest row for a patient + scope is the current state; older rows are the history. */
const consentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  scope: { type: String, enum: SCOPES, required: true },
  granted: { type: Boolean, required: true },
  caseId: { type: String, default: null },       // only for scope 'emergency-case'
  note: { type: String, default: '' }
}, { timestamps: { createdAt: true, updatedAt: false } });
consentSchema.index({ patient: 1, scope: 1, createdAt: -1 });
consentSchema.plugin(plugin);

module.exports = mongoose.model('Consent', consentSchema);
module.exports.SCOPES = SCOPES;
