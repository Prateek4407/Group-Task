const path = require('path');
const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED = { '.pdf': 1, '.png': 1, '.jpg': 1, '.jpeg': 1, '.webp': 1, '.doc': 1, '.docx': 1, '.txt': 1 };
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, same as the frontend

/* The file is kept in memory and then saved to MongoDB (GridFS) by the controller - nothing is written to disk. */
module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED[path.extname(file.originalname).toLowerCase()]
      ? cb(null, true)
      : cb(ApiError.badRequest('Please upload a PDF, image (PNG/JPG/WEBP), Word or text file.'))
}).single('file');
