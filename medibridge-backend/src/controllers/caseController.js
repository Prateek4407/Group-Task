const Case = require('../models/Case');
const Hospital = require('../models/Hospital');
const Consent = require('../models/Consent');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { PHONE, str, check } = require('../utils/validators');
const svc = require('../services/caseService');
const realtime = require('../services/realtime');
const { createAmbulanceInvoice } = require('../services/invoiceService');

const SEX = ['Male', 'Female', 'Other'], REL = ['Self', 'Spouse', 'Child', 'Parent', 'Good Samaritan'];
const CARE = ['Emergency', 'Cardiac', 'Trauma', 'Maternity'], SEV = ['P1', 'P2', 'P3'];

const populate = (q) => q.populate('hospital').populate('ambulance');
const same = (a, b) => a && b && String(a) === String(b);

/** Doctors see everything. Owners see their case. Cases sent without login stay reachable by whoever knows the case id. */
const canAccess = (c, user) => !c.createdBy || (!!user && (user.role === 'doctor' || same(c.createdBy, user._id)));

async function loadCase(req) {
  const c = await populate(Case.findOne({ caseId: req.params.caseId }));
  if (!c) throw ApiError.notFound('Case not found.');
  return svc.advanceIfDue(c);
}

/** POST /api/cases   (login optional) */
exports.create = asyncHandler(async (req, res) => {
  const b = req.body;
  const name = str(b.name), phone = str(b.phone), address = str(b.address), age = b.age;
  const errors = {};
  if (name.length < 2) errors.name = "Enter the patient's name.";
  if (age === undefined || age === '' || !Number.isFinite(+age) || +age < 0 || +age > 120) errors.age = 'Enter an age between 0 and 120.';
  if (!SEX.includes(b.sex)) errors.sex = 'Sex must be one of: ' + SEX.join(', ');
  if (!PHONE.test(phone)) errors.phone = 'Enter a 10-digit Indian mobile number.';
  if (b.rel !== undefined && !REL.includes(b.rel)) errors.rel = 'Invalid relationship.';
  if (!CARE.includes(b.care)) errors.care = 'care must be one of: ' + CARE.join(', ');
  if (!SEV.includes(b.sev)) errors.sev = 'sev must be one of: ' + SEV.join(', ');
  if (address.length < 5) errors.address = 'Enter the pickup address (at least 5 characters).';
  if (b.consent !== true) errors.consent = 'Please tick the consent box to continue.';
  check(errors);

  let hospital;
  if (!b.hospital || b.hospital === 'auto') hospital = await svc.bestMatch(b.care);
  else {
    hospital = await Hospital.findById(b.hospital);
    if (!hospital) throw ApiError.badRequest('Selected hospital does not exist.', { hospital: 'Unknown hospital.' });
  }

  const gps = b.gps && Number.isFinite(+b.gps.lat) && Number.isFinite(+b.gps.lng) ? { lat: +b.gps.lat, lng: +b.gps.lng } : undefined;
  const now = new Date();
  const c = await Case.create({
    caseId: await svc.uniqueCaseId(), createdBy: req.user ? req.user._id : null,
    name, age: +age, sex: b.sex, phone, rel: b.rel || 'Self', care: b.care, sev: b.sev, symptoms: str(b.symptoms),
    address, landmark: str(b.landmark), gps, hospital: hospital._id, stage: 0, stageStart: now, stageLog: [{ stage: 0, at: now }]
  });
  if (req.user && req.user.role === 'patient') {
    await createAmbulanceInvoice(req.user._id, c.caseId);
    await Consent.create({ patient: req.user._id, scope: 'emergency-case', granted: true, caseId: c.caseId, note: 'Agreed to share details with the hospital and ambulance team' });
  }
  await c.populate(['hospital', 'ambulance']);
  res.status(201).json({ success: true, message: `Request sent. Case ${c.caseId} created.`, data: { case: svc.present(c, { full: true }) } });
});

/** POST /api/cases/demo  -> demo case used by "Start a demo case" */
exports.demo = asyncHandler(async (req, res) => {
  const hospital = await svc.bestMatch('Emergency'), now = new Date();
  const c = await Case.create({
    caseId: await svc.uniqueCaseId(), createdBy: req.user ? req.user._id : null, name: 'Demo Patient', age: 45, sex: 'Male', phone: '9876543210',
    rel: 'Self', care: 'Emergency', sev: 'P1', symptoms: 'Demo case', address: 'Demo pickup point', hospital: hospital._id,
    stage: 0, stageStart: now, stageLog: [{ stage: 0, at: now }], isDemo: true
  });
  await c.populate(['hospital', 'ambulance']);
  res.status(201).json({ success: true, data: { case: svc.present(c, { full: true }) } });
});

/** GET /api/cases   patient: own cases | doctor: all cases */
exports.list = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'doctor' ? {} : { createdBy: req.user._id };
  const cases = await populate(Case.find(filter).sort({ createdAt: -1 }));
  await Promise.all(cases.map(svc.advanceIfDue));
  res.json({ success: true, count: cases.length, data: { cases: cases.map(c => svc.present(c, { full: true })) } });
});

/** GET /api/cases/active   most recent case still in progress (dashboard "Active emergency coordination") */
exports.active = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'doctor' ? {} : { createdBy: req.user._id };
  const cases = await populate(Case.find(filter).sort({ createdAt: -1 }).limit(20));
  await Promise.all(cases.map(svc.advanceIfDue));
  const c = cases.find(x => x.stage < 5) || null;
  res.json({ success: true, data: { case: c ? svc.present(c, { full: true }) : null } });
});

/** GET /api/cases/:caseId/track   PUBLIC live-tracking view (no phone / symptoms / GPS) */
exports.track = asyncHandler(async (req, res) => {
  const c = await loadCase(req);
  res.json({ success: true, data: { case: svc.present(c) } });
});

/** GET /api/cases/:caseId   full details (owner or doctor) */
exports.get = asyncHandler(async (req, res) => {
  const c = await loadCase(req);
  if (!canAccess(c, req.user)) throw ApiError.forbidden();
  res.json({ success: true, data: { case: svc.present(c, { full: true }) } });
});

/** POST /api/cases/:caseId/advance   "Advance step (demo)" - claims an ambulance when moving to stage 3 */
exports.advance = asyncHandler(async (req, res) => {
  const c = await loadCase(req);
  if (!canAccess(c, req.user)) throw ApiError.forbidden();
  if (c.stage < 5) {
    if (!(await svc.stepForward(c))) throw ApiError.conflict('No ambulance is free right now. The case will continue as soon as one becomes available.');
    await c.save();
    realtime.notifyCase(c.caseId);
  }
  res.json({ success: true, data: { case: svc.present(c, { full: true }) } });
});

/** POST /api/cases/:caseId/restart   "Restart demo" - gives the ambulance back */
exports.restart = asyncHandler(async (req, res) => {
  const c = await loadCase(req);
  if (!canAccess(c, req.user)) throw ApiError.forbidden();
  await svc.restart(c);
  res.json({ success: true, message: 'Demo restarted', data: { case: svc.present(c, { full: true }) } });
});

/** GET /api/cases/:caseId/stream   PUBLIC live tracking over Server-Sent Events (same limited fields as /track).
 *  Pushes the case every 1.5 s and immediately when an ambulance sends a new GPS position. */
exports.stream = asyncHandler(async (req, res) => {
  await loadCase(req);                                   // 404 as normal JSON before the stream starts
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  let closed = false, busy = false;
  const stop = () => { if (closed) return; closed = true; clearInterval(timer); clearTimeout(limit); off(); res.end(); };
  const push = async () => {
    if (closed || busy) return;
    busy = true;
    try {
      const c = await loadCase(req);
      const view = svc.present(c);
      res.write('data: ' + JSON.stringify({ case: view }) + '\n\n');
      if (view.stage >= 5) { res.write('event: done\ndata: {}\n\n'); stop(); }
    } catch (e) { stop(); }
    busy = false;
  };
  const off = realtime.onCase(req.params.caseId, push);
  const timer = setInterval(push, 1500);
  const limit = setTimeout(stop, 10 * 60 * 1000);       // the browser reconnects automatically
  req.on('close', stop);
  push();
});

/** POST /api/cases/:caseId/acknowledge   doctor: "Acknowledge readiness" */
exports.acknowledge = asyncHandler(async (req, res) => {
  const c = await loadCase(req);
  c.acknowledgedBy = req.user._id; c.acknowledgedAt = new Date();
  await c.save();
  res.json({ success: true, message: 'Readiness acknowledged', data: { case: svc.present(c, { full: true }) } });
});
