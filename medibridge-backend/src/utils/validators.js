const ApiError = require('./ApiError');

/* Same rules as the frontend forms */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[6-9]\d{9}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const todayStr = () => new Date().toISOString().slice(0, 10);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Throws a 400 with a field -> message map if `errors` is not empty. */
function check(errors) {
  if (Object.keys(errors).length) throw ApiError.badRequest('Please fix the highlighted fields.', errors);
}

module.exports = { EMAIL, PHONE, DATE, TIME, todayStr, str, check };
