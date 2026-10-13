const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const tokenFrom = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};
const load = async (token) => {
  const payload = jwt.verify(token, jwtSecret);
  return User.findById(payload.id);
};

/** Login required. Sets req.user. */
exports.authenticate = asyncHandler(async (req, res, next) => {
  const token = tokenFrom(req);
  if (!token) throw ApiError.unauthorized();
  let user;
  try { user = await load(token); } catch (e) { throw ApiError.unauthorized('Your session has expired. Please login again.'); }
  if (!user) throw ApiError.unauthorized('Account not found. Please login again.');
  req.user = user;
  next();
});

/** Login optional (emergency requests work without an account). */
exports.optionalAuth = asyncHandler(async (req, res, next) => {
  const token = tokenFrom(req);
  if (token) { try { req.user = await load(token); } catch (e) { /* ignore bad token */ } }
  next();
});

/** Role guard: authorize('doctor') */
exports.authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(ApiError.forbidden('This action is only available to a ' + roles.join(' / ') + ' account.'));
