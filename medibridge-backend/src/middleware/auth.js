const jwt = require('jsonwebtoken');
const { jwtSecret, authCookieName } = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const tokenFrom = (req) => req.cookies?.[authCookieName] || null;
const load = async (token) => {
  const payload = jwt.verify(token, jwtSecret);
  return User.findById(payload.id);
};
const isActive = (user) => user && (!user.status || user.status === 'active');

/** Login required. Sets req.user. */
exports.authenticate = asyncHandler(async (req, res, next) => {
  const token = tokenFrom(req);
  if (!token) throw ApiError.unauthorized();
  let user;
  try { user = await load(token); } catch (e) { throw ApiError.unauthorized('Your session has expired. Please login again.'); }
  if (!user) throw ApiError.unauthorized('Account not found. Please login again.');
  if (!isActive(user)) throw ApiError.forbidden('Your account is not active. Please contact the administrator.');
  req.user = user;
  next();
});

/** Login optional (emergency requests work without an account). */
exports.optionalAuth = asyncHandler(async (req, res, next) => {
  const token = tokenFrom(req);
  if (token) {
    try {
      const user = await load(token);
      if (isActive(user)) req.user = user;
    } catch (e) { /* ignore bad token */ }
  }
  next();
});

/** Role guard: authorize('doctor') */
exports.authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(ApiError.forbidden('This action is only available to a ' + roles.join(' / ') + ' account.'));
