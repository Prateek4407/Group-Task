const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const { CATEGORIES } = require('../models/Document');
const User = require('../models/User');
const { uploadDir } = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { str } = require('../utils/validators');

const isOwner = (d, user) => String(d.owner) === String(user._id);
const removeFile = (name) => fs.promises.unlink(path.join(uploadDir, name)).catch(() => {});
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Patients see their own files, doctors see everything. */
async function load(req) {
  const d = await Document.findById(req.params.id);
  if (!d) throw ApiError.notFound('Document not found.');
  if (req.user.role === 'patient' && !isOwner(d, req.user)) throw ApiError.forbidden();
  return d;
}

/** POST /api/documents   (patient)   multipart/form-data: file, category, title?, note? */
exports.upload = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw ApiError.badRequest('Please choose a file to upload.', { file: 'Please choose a file to upload.' });
  const category = str(req.body.category) || 'Other';
  if (!CATEGORIES.includes(category)) { await removeFile(file.filename); throw ApiError.badRequest('category must be one of: ' + CATEGORIES.join(', '), { category: 'Invalid category.' }); }
  const doc = await Document.create({
    owner: req.user._id, ownerName: req.user.name, category,
    title: str(req.body.title) || file.originalname.replace(/\.[^.]+$/, ''),
    fileName: file.originalname, storedName: file.filename, mimeType: file.mimetype, size: file.size, note: str(req.body.note)
  });
  res.status(201).json({ success: true, message: 'Document uploaded. Your doctor can now view it.', data: { document: doc } });
});

/** GET /api/documents?patientId=&category=&q=   patient: own | doctor: all patients */
exports.list = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'patient' ? { owner: req.user._id } : {};
  if (req.user.role === 'doctor' && req.query.patientId) filter.owner = req.query.patientId;
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

/** GET /api/documents/patients   (doctor)  -> patients that uploaded something (filter dropdown) */
exports.patients = asyncHandler(async (req, res) => {
  const docs = await Document.find({}, 'owner ownerName');
  const byOwner = new Map();
  docs.forEach(d => {
    const k = String(d.owner), row = byOwner.get(k) || { id: k, name: d.ownerName, documents: 0 };
    row.documents += 1; byOwner.set(k, row);
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

/** GET /api/documents/:id/file?download=1   streams the file (token required, never a public URL) */
exports.file = asyncHandler(async (req, res) => {
  const d = await load(req);
  const full = path.join(uploadDir, d.storedName);
  if (!fs.existsSync(full)) throw ApiError.notFound('The file is no longer available.');
  const asDownload = req.query.download === '1' || req.query.download === 'true';
  res.setHeader('Content-Type', d.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${asDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(d.fileName)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(full);
});

/** DELETE /api/documents/:id   (owner only) */
exports.remove = asyncHandler(async (req, res) => {
  const d = await Document.findById(req.params.id);
  if (!d) throw ApiError.notFound('Document not found.');
  if (!isOwner(d, req.user)) throw ApiError.forbidden('You can only delete your own documents.');
  await removeFile(d.storedName);
  await d.deleteOne();
  res.json({ success: true, message: 'Document deleted' });
});
