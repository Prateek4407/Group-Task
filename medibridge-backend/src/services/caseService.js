const Case = require('../models/Case');
const Hospital = require('../models/Hospital');
const { stageStepMs } = require('../config/env');
const ambulances = require('./ambulanceService');
const realtime = require('./realtime');

/* Same six stages as the frontend tracking page */
const STAGES = [
  ['Request received', 'Case created and triage priority assigned'],
  ['Hospital confirmed', 'Hospital acknowledged and prepared a bay'],
  ['Ambulance assigned', 'Ambulance leaving the hospital for the patient'],
  ['Pickup done', 'Patient loaded and stabilised on scene'],
  ['On the way to hospital', 'Priority transit to the hospital'],
  ['Arrived at hospital', 'Handoff to the receiving team']
];

async function uniqueCaseId() {
  for (;;) {
    const id = 'CB-' + (2000 + Math.floor(Math.random() * 7999));
    if (!(await Case.exists({ caseId: id }))) return id;
  }
}

/** Best hospital for a care type: not saturated, fastest ETA first, and (when the fleet is managed) one with a free ambulance. */
async function bestMatch(care) {
  const list = await Hospital.find({ care, load: { $ne: 'Saturated' } }).sort({ eta: 1 });
  if (list.length && (await ambulances.fleetEnabled())) {
    const counts = await ambulances.countsByHospital();
    const withAmb = list.find(h => counts[h._id] && counts[h._id].available > 0);
    if (withAmb) return withAmb;
  }
  return list[0] || (await Hospital.findOne().sort({ _id: 1 }));
}

/**
 * Moves a case to its next stage. Moving 1 -> 2 ("Ambulance assigned") claims the nearest free ambulance when the
 * fleet is managed; if none is free the case waits at stage 1 and returns false. Reaching stage 5 frees the ambulance.
 */
async function stepForward(c, at = new Date()) {
  if (c.stage >= 5) return false;
  if (c.stage === 1 && !c.ambulance && (await ambulances.fleetEnabled())) {
    const amb = await ambulances.assignNearest(c);
    if (!amb) return false;
  }
  c.stage += 1; c.stageStart = at; c.stageLog.push({ stage: c.stage, at });
  if (c.stage === 5) await ambulances.release(c);
  return true;
}

/** Moves the case forward by one stage every STEP ms (simulation, same as the frontend). */
async function advanceIfDue(c) {
  const now = Date.now();
  let changed = false;
  while (c.stage < 5 && now - c.stageStart.getTime() >= stageStepMs) {
    const next = new Date(c.stageStart.getTime() + stageStepMs);
    const hadAmbulance = !!c.ambulance;
    if (!(await stepForward(c, next))) break;
    if (!hadAmbulance && c.ambulance) {          // an ambulance was just found: stage 3 timing starts now, not in the past
      c.stageStart = new Date(now); c.stageLog[c.stageLog.length - 1].at = c.stageStart;
    }
    changed = true;
  }
  if (changed) { await c.save(); realtime.notifyCase(c.caseId); }
  return c;
}

/** "Restart demo": back to stage 0 and give the ambulance back. */
async function restart(c) {
  await ambulances.release(c);
  c.stage = 0; c.stageStart = new Date(); c.stageLog = [{ stage: 0, at: c.stageStart }];
  c.ambulance = null; c.ambulanceOrigin = undefined; c.ambulanceAssignedAt = null;
  await c.save();
  realtime.notifyCase(c.caseId);
  return c;
}

const progress = (c) => (c.stage >= 5 ? 1 : Math.min(1, (Date.now() - c.stageStart.getTime()) / stageStepMs));

function etaMinutes(c, f) {
  const s = c.stage;
  const m = s < 2 ? 20 - s * 2 : s === 2 ? 8 * (1 - f) + 12 : s === 3 ? 12 : s === 4 ? 12 * (1 - f) : 0;
  return Math.ceil(m);
}

const statusOf = (c) => (c.stage >= 5 ? { label: 'Handoff completed', badge: 'green' } : { label: 'In transit', badge: 'estimated' });

function timeline(c) {
  const s = c.stage;
  return STAGES.map(([title, detail], i) => {
    const log = c.stageLog.find(l => l.stage === i);
    const at = i === 0 ? c.createdAt : log ? log.at : null;
    return { step: i + 1, title, detail, state: i < s ? 'done' : i === s ? (s === 5 ? 'done' : 'now') : 'future', at: i <= s ? at : null };
  });
}

/** Ambulance block of the case view. Public view: vehicle + position only. Full view adds the driver. */
function ambulanceView(c, s, f, full) {
  const a = c.ambulance && c.ambulance.registration ? c.ambulance : null;
  if (!a) return null;
  const out = {
    id: String(a._id), registration: a.registration, type: a.type, equipment: a.equipment || [],
    position: ambulances.livePosition(c, a, s, f)
  };
  if (full) Object.assign(out, { driverName: a.driverName, driverPhone: a.driverPhone });
  return out;
}

/**
 * Case "view": the JSON shape the frontend needs.
 * full=false is the public tracking view (no phone, symptoms or GPS).
 */
function present(c, { full = false } = {}) {
  const s = c.stage, f = progress(c), h = c.hospital && c.hospital.name ? c.hospital : null;
  const waiting = s === 1 && f >= 1 && !c.ambulance;
  const out = {
    id: String(c._id),
    caseId: c.caseId,
    patient: { name: c.name, age: c.age, sex: c.sex },
    care: c.care,
    sev: c.sev,
    pickupAddress: c.address,
    hospital: h ? { id: h._id, name: h.name, area: h.area, km: h.km, eta: h.eta } : { id: c.hospital },
    stage: s,
    stageLabel: `Stage ${s + 1} of 6`,
    stageProgress: Number(f.toFixed(3)),
    status: statusOf(c),
    etaMinutes: etaMinutes(c, f),
    liveStatus: waiting ? 'Hospital confirmed - waiting for a free ambulance' : ['Hospital is confirming the request', 'Hospital is confirming the request', 'Ambulance heading to the patient', 'Patient being loaded', 'Ambulance heading to hospital', 'Patient arrived at hospital'][s],
    ambulance: ambulanceView(c, s, f, full),
    waitingForAmbulance: waiting,
    corridor: s < 2 ? 'Preparing' : s === 5 ? 'Completed' : 'Green corridor active',
    hospitalStatus: s < 1 ? 'Pending' : 'Accepted',
    timeline: timeline(c),
    isDemo: c.isDemo,
    createdAt: c.createdAt
  };
  if (full) {
    Object.assign(out, {
      patient: { name: c.name, age: c.age, sex: c.sex, phone: c.phone },
      relationship: c.rel, symptoms: c.symptoms, landmark: c.landmark, gps: c.gps && c.gps.lat != null ? c.gps : null,
      acknowledgedAt: c.acknowledgedAt
    });
  }
  return out;
}

module.exports = { STAGES, uniqueCaseId, bestMatch, advanceIfDue, stepForward, restart, present };
