const Consent = require('../models/Consent');
const AuditLog = require('../models/AuditLog');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/auditService');
const consent = require('../services/consentService');

/** GET /api/consent   (patient)  current state + full decision history */
exports.getConsent = asyncHandler(async (req, res) => {
  const history = await Consent.find({ patient: req.user._id }).sort({ createdAt: -1, _id: -1 }).limit(200);
  const docs = history.find(h => h.scope === 'documents');
  res.json({
    success: true,
    data: {
      documents: { granted: docs ? docs.granted : true, since: docs ? docs.createdAt : null, recorded: !!docs },
      history
    }
  });
});

/** POST /api/consent   (patient)   body { granted: true|false, note? }   share / stop sharing documents with doctors */
exports.setConsent = asyncHandler(async (req, res) => {
  if (typeof req.body.granted !== 'boolean') throw ApiError.badRequest('granted must be true or false.', { granted: 'Choose to share or stop sharing.' });
  const granted = req.body.granted;
  const current = await consent.hasDocumentConsent(req.user._id);
  if (current !== granted) {
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 200) : '';
    await Consent.create({ patient: req.user._id, scope: 'documents', granted, note });
    await audit.log(req, {
      action: granted ? 'consent.grant' : 'consent.withdraw', patient: req.user._id, patientName: req.user.name,
      targetType: 'consent', targetLabel: 'Doctor access to medical documents'
    });
  }
  res.json({
    success: true,
    message: granted ? 'Doctors can open your documents again.' : 'Consent withdrawn. Doctors can no longer open your documents.',
    data: { documents: { granted } }
  });
});

/** GET /api/audit?limit=50&action=document.view
 *  patient: everything that happened to their records (who viewed, when) | doctor: their own activity */
exports.list = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const filter = req.user.role === 'doctor' ? { actor: req.user._id } : { patient: req.user._id };
  if (req.query.action && AuditLog.ACTIONS.includes(req.query.action)) filter.action = req.query.action;
  const events = await AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit);
  res.json({ success: true, count: events.length, data: { events } });
});
