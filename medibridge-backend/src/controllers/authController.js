const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { jwtSecret, jwtExpires, authCookieName, authCookieDays } = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { EMAIL, PHONE, str, check } = require('../utils/validators');

const sign = (user) => jwt.sign({ id: user._id, role: user.role }, jwtSecret, { expiresIn: jwtExpires });
const cookieOptions = () => ({
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
  maxAge: authCookieDays * 24 * 60 * 60 * 1000
});
const setSession = (res, user) => res.cookie(authCookieName, sign(user), cookieOptions());
const STAFF_ROLES = ['doctor', 'driver'];

/** POST /api/auth/register */
exports.register = asyncHandler(async (req, res) => {
  const { role, password, confirmPassword } = req.body;
  const name = str(req.body.name), email = str(req.body.email).toLowerCase(), phone = str(req.body.phone), spec = str(req.body.spec);
  const errors = {};
  const isStaff = STAFF_ROLES.includes(role);
  if (!['patient', ...STAFF_ROLES].includes(role)) errors.role = 'Role must be patient, doctor or driver.';
  if (name.length < 2) errors.name = 'Enter your full name.';
  if (!EMAIL.test(email)) errors.email = 'Enter a valid email.';
  if (!PHONE.test(phone)) errors.phone = 'Enter a 10-digit mobile number.';
  if (role === 'doctor' && spec.length < 2) errors.spec = 'Enter the speciality / department.';
  if (typeof password !== 'string' || password.length < 6) errors.password = 'At least 6 characters.';
  if (confirmPassword !== undefined && confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';
  check(errors);

  if (await User.exists({ $or: [{ email }, { phone }] })) throw ApiError.conflict('An account with this email or phone already exists.');
  const user = await User.create({ role, name, email, phone, password, spec: role === 'doctor' ? spec : '', status: isStaff ? 'pending' : 'active' });
  if (isStaff) {
    return res.status(201).json({
      success: true,
      pending: true,
      message: 'Registration submitted. You can log in after an administrator approves your account.',
      data: { user }
    });
  }
  setSession(res, user);
  res.status(201).json({ success: true, data: { user } });
});

/** POST /api/auth/login   body: { identifier (email or phone), password, role } */
exports.login = asyncHandler(async (req, res) => {
  const identifier = str(req.body.identifier || req.body.email).toLowerCase(), { password, role } = req.body;
  if (!identifier || !password) throw ApiError.badRequest('Please enter your email/phone and password.');
  const user = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }] }).select('+password');
  if (!user || !(await user.comparePassword(String(password)))) throw ApiError.unauthorized('Incorrect email/phone or password.');
  if (user.status === 'pending') throw ApiError.forbidden('Your account is waiting for administrator approval. Please try again later.');
  if (user.status === 'rejected') throw ApiError.forbidden('Your account is not active. Please contact the administrator.');
  if (role && user.role !== role) throw ApiError.forbidden('This account is registered as a ' + user.role + '. Switch the role above.');
  setSession(res, user);
  res.json({ success: true, data: { user } });
});

/** GET /api/auth/me */
exports.me = (req, res) => res.json({ success: true, data: { user: req.user } });

/** POST /api/auth/logout */
exports.logout = (req, res) => {
  res.clearCookie(authCookieName, { httpOnly: true, secure: true, sameSite: 'none', path: '/' });
  res.json({ success: true, message: 'Logged out.' });
};
