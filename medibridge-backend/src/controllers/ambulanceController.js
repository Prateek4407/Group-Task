const Ambulance = require('../models/Ambulance');
const { TYPES, STATUSES } = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { PHONE, str, check } = require('../utils/validators');
const svc = require('../services/ambulanceService');
const realtime = require('../services/realtime');

const REG = /^[A-Z0-9][A-Z0-9 -]{3,14}$/;       // loose vehicle-number check, e.g. DL1CAB1234 or DL 1C AB 1234
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

async function loadDriver(email) {
  const user = await User.findOne({ email: str(email).toLowerCase() });
  if (!user || user.role !== 'driver') throw ApiError.badRequest('No driver account found with this email. The driver must register first.', { driverEmail: 'Unknown driver account.' });
  if (user.status && user.status !== 'active') throw ApiError.badRequest('This driver account is not approved.', { driverEmail: 'Choose an approved driver account.' });
  return user;
}

/** Validates the fields shared by create and update. `partial` = only check what was sent. */
async function readBody(b, partial) {
  const errors = {}, out = {};
  const has = (k) => !partial || b[k] !== undefined;
  if (has('registration')) { const r = str(b.registration).toUpperCase(); if (!REG.test(r)) errors.registration = 'Enter the vehicle number (e.g. DL1CAB1234).'; else out.registration = r; }
  if (has('hospital')) { const h = str(b.hospital); if (!h || !(await Hospital.exists({ _id: h }))) errors.hospital = 'Choose a base hospital.'; else out.hospital = h; }
  if (b.type !== undefined) { if (!TYPES.includes(b.type)) errors.type = 'type must be one of: ' + TYPES.join(', '); else out.type = b.type; }
  if (b.driverName !== undefined) out.driverName = str(b.driverName);
  if (b.driverPhone !== undefined) { const p = str(b.driverPhone); if (p && !PHONE.test(p)) errors.driverPhone = 'Enter a 10-digit mobile number.'; else out.driverPhone = p; }
  if (b.equipment !== undefined) out.equipment = (Array.isArray(b.equipment) ? b.equipment : String(b.equipment).split(',')).map(str).filter(Boolean).slice(0, 15);
  if (b.status !== undefined) { if (!STATUSES.includes(b.status) || b.status === 'assigned') errors.status = 'Status can be set to: available, offline, maintenance.'; else out.status = b.status; }
  check(errors);
  return out;
}

/** GET /api/ambulances/availability   PUBLIC  { total, available, byHospital } - no vehicle details */
exports.availability = asyncHandler(async (req, res) => {
  const byHospital = await svc.countsByHospital();
  const sum = (k) => Object.values(byHospital).reduce((n, h) => n + h[k], 0);
  res.json({ success: true, data: { total: sum('total'), available: sum('available'), assigned: sum('assigned'), offline: sum('offline'), byHospital } });
});

/** GET /api/ambulances?hospital=&status=   (doctor) */
exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.hospital) filter.hospital = String(req.query.hospital);
  if (req.query.status) filter.status = String(req.query.status);
  const ambulances = await Ambulance.find(filter).sort({ hospital: 1, registration: 1 }).populate('driverUser', 'name email');
  res.json({ success: true, count: ambulances.length, data: { ambulances } });
});

/** POST /api/ambulances   (doctor) */
exports.create = asyncHandler(async (req, res) => {
  const body = await readBody(req.body, false);
  if (await Ambulance.exists({ registration: body.registration })) throw ApiError.conflict('An ambulance with this vehicle number already exists.');
  const base = await Hospital.findById(body.hospital);
  const amb = new Ambulance({ ...body, status: body.status || 'available' });
  const lat = num(req.body.lat), lng = num(req.body.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) amb.location = { lat, lng, updatedAt: new Date(), source: 'manual' };
  else if (base && base.lat != null) amb.location = { lat: base.lat, lng: base.lng, updatedAt: new Date(), source: 'base' };
  if (req.body.driverEmail) amb.driverUser = (await loadDriver(req.body.driverEmail))._id;
  await amb.save();
  await amb.populate('driverUser', 'name email');
  res.status(201).json({ success: true, message: 'Ambulance ' + amb.registration + ' added.', data: { ambulance: amb } });
});

/** PATCH /api/ambulances/:id   (doctor)   status, driver, equipment, base hospital ... */
exports.update = asyncHandler(async (req, res) => {
  const amb = await Ambulance.findById(req.params.id);
  if (!amb) throw ApiError.notFound('Ambulance not found.');
  const body = await readBody(req.body, true);
  if (amb.status === 'assigned' && (body.status || body.hospital)) throw ApiError.conflict('This ambulance is on an active case. Change it after the case ends.');
  if (body.registration && body.registration !== amb.registration && await Ambulance.exists({ registration: body.registration })) throw ApiError.conflict('An ambulance with this vehicle number already exists.');
  Object.assign(amb, body);
  if (req.body.driverEmail !== undefined) amb.driverUser = req.body.driverEmail ? (await loadDriver(req.body.driverEmail))._id : null;
  const lat = num(req.body.lat), lng = num(req.body.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) amb.location = { lat, lng, updatedAt: new Date(), source: 'manual' };
  await amb.save();
  await amb.populate('driverUser', 'name email');
  res.json({ success: true, message: 'Ambulance updated.', data: { ambulance: amb } });
});

/** DELETE /api/ambulances/:id   (doctor)  not while on a case */
exports.remove = asyncHandler(async (req, res) => {
  const amb = await Ambulance.findById(req.params.id);
  if (!amb) throw ApiError.notFound('Ambulance not found.');
  if (amb.status === 'assigned') throw ApiError.conflict('This ambulance is on an active case and cannot be removed.');
  await amb.deleteOne();
  res.json({ success: true, message: 'Ambulance removed.' });
});

const canSend = (amb, user) => user.role === 'doctor' || (amb.driverUser && String(amb.driverUser) === String(user._id));

async function writeLocation(amb, body) {
  const lat = num(body.lat), lng = num(body.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180)
    throw ApiError.badRequest('Send a valid latitude and longitude.', { lat: 'Invalid latitude.', lng: 'Invalid longitude.' });
  amb.location = { lat, lng, updatedAt: new Date(), source: 'gps' };
  await amb.save();
  realtime.notifyCase(amb.assignedCase);           // wakes up the open tracking pages right away
}

/** GET /api/ambulances/mine   (driver)  the ambulance linked to this driver login */
exports.mine = asyncHandler(async (req, res) => {
  const amb = await Ambulance.findOne({ driverUser: req.user._id });
  res.json({ success: true, data: { ambulance: amb } });
});

/** PATCH /api/ambulances/mine/location   (driver)   body { lat, lng } - the driver's phone sends this every few seconds */
exports.mineLocation = asyncHandler(async (req, res) => {
  const amb = await Ambulance.findOne({ driverUser: req.user._id });
  if (!amb) throw ApiError.notFound('No ambulance is linked to your account yet. Ask the hospital to link it.');
  await writeLocation(amb, req.body);
  res.json({ success: true, data: { ambulance: amb } });
});

/** PATCH /api/ambulances/mine/status   (driver)   body { status: 'available' | 'offline' } */
exports.mineStatus = asyncHandler(async (req, res) => {
  const amb = await Ambulance.findOne({ driverUser: req.user._id });
  if (!amb) throw ApiError.notFound('No ambulance is linked to your account yet.');
  if (amb.status === 'assigned') throw ApiError.conflict('You are on an active case. The status changes automatically when it ends.');
  if (!['available', 'offline'].includes(req.body.status)) throw ApiError.badRequest('status must be available or offline.', { status: 'Invalid status.' });
  amb.status = req.body.status; await amb.save();
  res.json({ success: true, data: { ambulance: amb } });
});

/** PATCH /api/ambulances/:id/location   (doctor, or the linked driver) */
exports.location = asyncHandler(async (req, res) => {
  const amb = await Ambulance.findById(req.params.id);
  if (!amb) throw ApiError.notFound('Ambulance not found.');
  if (!canSend(amb, req.user)) throw ApiError.forbidden('Only the linked driver or hospital staff can update this ambulance.');
  await writeLocation(amb, req.body);
  res.json({ success: true, data: { ambulance: amb } });
});
