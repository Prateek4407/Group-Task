const AuditLog = require('../models/AuditLog');

/** Records who did what to whose record. Never throws: a logging problem must not block patient care. */
async function log(req, { action, patient, patientName = '', targetType = 'document', targetId = '', targetLabel = '' }) {
  try {
    await AuditLog.create({
      actor: req.user._id, actorName: req.user.name, actorRole: req.user.role,
      patient, patientName, action, targetType, targetId: String(targetId || ''), targetLabel,
      ip: req.ip || ''
    });
  } catch (e) { console.error('audit log failed:', e.message); }
}

module.exports = { log };
