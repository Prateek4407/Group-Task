const Slot = require('../models/Slot');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { DATE, TIME, todayStr, str, check } = require('../utils/validators');

const same = (a, b) => a && b && String(a) === String(b);

/** Slot "view". Patients only see their own name on a booked slot; others show as taken. */
function present(s, user) {
  const mine = user.role === 'patient' && same(s.bookedBy, user._id);
  const status = !s.bookedBy ? 'free' : user.role === 'doctor' ? 'booked' : mine ? 'mine' : 'taken';
  return {
    id: String(s._id), doctor: s.doctorName, doctorId: String(s.doctor), date: s.date, from: s.from, to: s.to, note: s.note, status,
    ...(user.role === 'doctor' && s.bookedBy ? { bookedBy: s.bookedByName } : {})
  };
}

/** GET /api/slots   patient: upcoming slots of all doctors | doctor: own slots (?mine=true is the default for doctors) */
exports.list = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'doctor' ? { doctor: req.user._id } : { date: { $gte: todayStr() } };
  if (req.query.doctorId && req.user.role === 'patient') filter.doctor = req.query.doctorId;
  const slots = await Slot.find(filter).sort({ date: 1, from: 1 });
  res.json({ success: true, count: slots.length, data: { slots: slots.map(s => present(s, req.user)) } });
});

/** POST /api/slots   (doctor)  body: { date, from, to, note } */
exports.create = asyncHandler(async (req, res) => {
  const date = str(req.body.date), from = str(req.body.from), to = str(req.body.to), note = str(req.body.note);
  const errors = {};
  if (!DATE.test(date)) errors.date = 'Date must be YYYY-MM-DD.';
  if (!TIME.test(from)) errors.from = 'Time must be HH:MM (24h).';
  if (!TIME.test(to)) errors.to = 'Time must be HH:MM (24h).';
  check(errors);
  if (date < todayStr()) throw ApiError.badRequest('The date cannot be in the past.', { date: 'The date cannot be in the past.' });
  if (from >= to) throw ApiError.badRequest('The end time must be after the start time.', { to: 'The end time must be after the start time.' });
  const clash = await Slot.exists({ doctor: req.user._id, date, from: { $lt: to }, to: { $gt: from } });
  if (clash) throw ApiError.conflict('This overlaps one of your saved slots.');
  const s = await Slot.create({ doctor: req.user._id, doctorName: req.user.name, date, from, to, note });
  res.status(201).json({ success: true, message: 'Schedule saved. Patients can now book it.', data: { slot: present(s, req.user) } });
});

/** DELETE /api/slots/:id   (doctor, own slots) */
exports.remove = asyncHandler(async (req, res) => {
  const s = await Slot.findById(req.params.id);
  if (!s) throw ApiError.notFound('Slot not found.');
  if (!same(s.doctor, req.user._id)) throw ApiError.forbidden('You can only delete your own slots.');
  await s.deleteOne();
  res.json({ success: true, message: 'Slot deleted' });
});

/** PATCH /api/slots/:id/book   (patient)  - atomic, so two patients cannot book the same slot */
exports.book = asyncHandler(async (req, res) => {
  const slot = await Slot.findById(req.params.id);
  if (!slot) throw ApiError.notFound('Slot not found.');
  if (slot.date < todayStr()) throw ApiError.badRequest('This slot is in the past.');
  const s = await Slot.findOneAndUpdate({ _id: slot._id, bookedBy: null }, { bookedBy: req.user._id, bookedByName: req.user.name }, { new: true });
  if (!s) throw ApiError.conflict('This slot has already been booked.');
  res.json({ success: true, message: 'Appointment booked', data: { slot: present(s, req.user) } });
});

/** PATCH /api/slots/:id/cancel   (patient who booked it) */
exports.cancel = asyncHandler(async (req, res) => {
  const slot = await Slot.findById(req.params.id);
  if (!slot) throw ApiError.notFound('Slot not found.');
  if (!same(slot.bookedBy, req.user._id)) throw ApiError.forbidden('You can only cancel your own appointment.');
  slot.bookedBy = null; slot.bookedByName = null;
  await slot.save();
  res.json({ success: true, message: 'Appointment cancelled', data: { slot: present(slot, req.user) } });
});
