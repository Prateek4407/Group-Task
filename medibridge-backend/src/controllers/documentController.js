const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const { CATEGORIES } = require('../models/Document');
const User = require('../models/User');
const { uploadDir } = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { str } = require('../utils/validators');
const storage = require('../services/fileStorage');
const audit = require('../services/auditService');
const consent = require('../services/consentService');

const isOwner = (d, user) => String(d.owner) === String(user._id);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const forAudit = (d, action) => ({ action, patient: d.owner, patientName: d.ownerName, targetId: d._id, targetLabel: d.fileName });

/** Removes the stored bytes: GridFS for new documents, the old disk file for documents uploaded before GridFS. */
async function removeStored(d) {
  if (d.fileId) await storage.remove(d.fileId);
  else if (d.storedName) await fs.promises.unlink(path.join(uploadDir, d.storedName)).catch(() => {});
}

/** Patients see their own files. Doctors see a patient's files only while that patient's consent is active. */
async function load(req) {
  const d = await Document.findById(req.params.id);
  if (!d) throw ApiError.notFound('Document not found.');
  if (req.user.role === 'patient' && !isOwner(d, req.user)) throw ApiError.forbidden();
  if (req.user.role === 'doctor' && !(await consent.hasDocumentConsent(d.owner))) {
    await audit.log(req, forAudit(d, 'document.denied'));
    throw ApiError.forbidden('This patient has withdrawn consent, so their documents are not available.');
  }
  return d;
}

/** POST /api/documents   (patient)   multipart/form-data: file, category, title?, note? */
exports.upload = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw ApiError.badRequest('Please choose a file to upload.', { file: 'Please choose a file to upload.' });
  const category = str(req.body.category) || 'Other';
  if (!CATEGORIES.includes(category)) throw ApiError.badRequest('category must be one of: ' + CATEGORIES.join(', '), { category: 'Invalid category.' });

  const fileId = await storage.save(file.buffer, file.originalname, file.mimetype);
  let doc;
  try {
    doc = await Document.create({
      owner: req.user._id, ownerName: req.user.name, category,
      title: str(req.body.title) || file.originalname.replace(/\.[^.]+$/, ''),
      fileName: file.originalname, fileId, mimeType: file.mimetype, size: file.size, note: str(req.body.note)
    });
  } catch (e) { await storage.remove(fileId); throw e; }       // never leave an orphan file behind
  await consent.ensureDocumentGrant(req.user._id);
  await audit.log(req, forAudit(doc, 'document.upload'));
  const shared = await consent.hasDocumentConsent(req.user._id);
  res.status(201).json({ success: true, message: shared ? 'Document uploaded. Your doctor can now view it.' : 'Document uploaded. Doctors cannot see it while sharing is switched off.', data: { document: doc } });
});

/** GET /api/documents?patientId=&category=&q=   patient: own | doctor: patients who have not withdrawn consent */
exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === 'patient') filter.owner = req.user._id;
  else {
    const blocked = (await consent.withdrawnOwners()).map(String);
    if (req.query.patientId) {
      if (blocked.includes(String(req.query.patientId))) return res.json({ success: true, count: 0, data: { documents: [] } });
      filter.owner = req.query.patientId;
    } else if (blocked.length) filter.owner = { $nin: blocked };
  }
  if (req.query.category && req.query.category !== 'all') filter.category = req.query.category;
  if (req.query.q) { const re = new RegExp(escapeRe(String(req.query.q)), 'i'); filter.$or = [{ title: re }, { fileName: re }, { ownerName: re }, { note: re }]; }
  const documents = await Document.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, count: documents.length, data: { documents } });
});

/** GET /api/documents/summary   (patient)  -> drives the "please upload your medical history" prompt */
exports.summary = asyncHandler(async (req, res) => {
  const docs = await Document.find({ owner: req.user._id }, 'category');
  res.json({ success: true, data: { total: docs.length, hasMedicalHistory: docs.some(d => d.category === 'Medical History') } });
});

/** GET /api/documents/patients   (doctor)  -> patients that uploaded something and still share it (filter dropdown) */
exports.patients = asyncHandler(async (req, res) => {
  const blocked = new Set((await consent.withdrawnOwners()).map(String));
  const docs = await Document.find({}, 'owner ownerName category');
  const byOwner = new Map();
  docs.forEach(d => {
    const k = String(d.owner);
    if (blocked.has(k)) return;
    const row = byOwner.get(k) || { id: k, name: d.ownerName, documents: 0, hasMedicalHistory: false };
    row.documents += 1; if (d.category === 'Medical History') row.hasMedicalHistory = true; byOwner.set(k, row);
  });
  const users = await User.find({ _id: { $in: [...byOwner.keys()] } }, 'email');
  users.forEach(u => { byOwner.get(String(u._id)).email = u.email; });
  const patients = [...byOwner.values()].sort((a, b) => a.name.localeCompare(b.name));
  res.json({ success: true, data: { patients } });
});

/** GET /api/documents/:id */
exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { document: await load(req) } });
});

/** GET /api/documents/:id/file?download=1   streams the file (token required, never a public URL). Every open is logged. */
exports.file = asyncHandler(async (req, res) => {
  const d = await load(req);
  const asDownload = req.query.download === '1' || req.query.download === 'true';
  const headers = () => {
    res.setHeader('Content-Type', d.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${asDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(d.fileName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
  };

  if (d.fileId) {
    if (!(await storage.exists(d.fileId))) throw ApiError.notFound('The file is no longer available.');
    await audit.log(req, forAudit(d, asDownload ? 'document.download' : 'document.view'));
    headers(); res.setHeader('Content-Length', d.size);
    const stream = storage.openStream(d.fileId);
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  }

  /* legacy document (uploaded before GridFS): still served from disk while the file exists */
  const full = path.join(uploadDir, d.storedName || '');
  if (!d.storedName || !fs.existsSync(full)) throw ApiError.notFound('The file is no longer available. Please upload it again.');
  await audit.log(req, forAudit(d, asDownload ? 'document.download' : 'document.view'));
  headers();
  res.sendFile(full);
});

/** DELETE /api/documents/:id   (owner only) */
exports.remove = asyncHandler(async (req, res) => {
  const d = await Document.findById(req.params.id);
  if (!d) throw ApiError.notFound('Document not found.');
  if (!isOwner(d, req.user)) throw ApiError.forbidden('You can only delete your own documents.');
  await audit.log(req, forAudit(d, 'document.delete'));
  await removeStored(d);
  await d.deleteOne();
  res.json({ success: true, message: 'Document deleted' });
});
