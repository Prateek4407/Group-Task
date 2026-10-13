const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { env } = require('../config/env');

exports.notFound = (req, res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  let status = err.status || 500, message = err.message, errors = err.errors;

  if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'This file is larger than 10 MB. Please choose a smaller file.' : err.message;
  } else if (err.name === 'ValidationError') {
    status = 400; message = 'Validation failed.';
    errors = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
  } else if (err.name === 'CastError') {
    status = 404; message = 'Not found.';
  } else if (err.code === 11000) {
    status = 409; message = 'A record with this value already exists.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Invalid JSON body.';
  }

  if (status >= 500) { console.error(err); if (env === 'production') message = 'Something went wrong on the server.'; }
  res.status(status).json({ success: false, message, ...(errors ? { errors } : {}) });
};
