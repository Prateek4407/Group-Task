const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { uploadDir } = require('../config/env');
const ApiError = require('../utils/ApiError');

fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED = { '.pdf': 1, '.png': 1, '.jpg': 1, '.jpeg': 1, '.webp': 1, '.doc': 1, '.docx': 1, '.txt': 1 };
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, same as the frontend

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
});

module.exports = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED[path.extname(file.originalname).toLowerCase()]
      ? cb(null, true)
      : cb(ApiError.badRequest('Please upload a PDF, image (PNG/JPG/WEBP), Word or text file.'))
}).single('file');
