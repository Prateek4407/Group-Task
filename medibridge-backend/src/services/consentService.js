const Consent = require('../models/Consent');

/** Latest decision for a patient + scope (null = never decided). */
const latest = (patient, scope) => Consent.findOne({ patient, scope }).sort({ createdAt: -1, _id: -1 });

/**
 * May doctors open this patient's documents?
 * No decision on file counts as "yes": the upload screen already tells patients that doctors can see their files,
 * and the first upload writes an explicit grant. A withdrawal always wins.
 */
async function hasDocumentConsent(patient) {
  const c = await latest(patient, 'documents');
  return !c || c.granted;
}

/** Patients whose newest 'documents' decision is a withdrawal. */
async function withdrawnOwners() {
  const rows = await Consent.aggregate([
    { $match: { scope: 'documents' } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $group: { _id: '$patient', granted: { $first: '$granted' } } },
    { $match: { granted: false } }
  ]);
  return rows.map(r => r._id);
}

/** Writes an explicit grant the first time a patient shares a document. */
async function ensureDocumentGrant(patient) {
  if (!(await Consent.exists({ patient, scope: 'documents' }))) {
    await Consent.create({ patient, scope: 'documents', granted: true, note: 'Granted when the first document was uploaded' });
  }
}

module.exports = { latest, hasDocumentConsent, withdrawnOwners, ensureDocumentGrant };
