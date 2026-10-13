const Case = require('../models/Case');
const Hospital = require('../models/Hospital');
const { stageStepMs } = require('../config/env');

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

/** Best hospital for a care type: not saturated, fastest ETA first. */
async function bestMatch(care) {
  const list = await Hospital.find({ care, load: { $ne: 'Saturated' } }).sort({ eta: 1 }).limit(1);
  return list[0] || (await Hospital.findOne().sort({ _id: 1 }));
}

/** Moves the case forward by one stage every STEP ms (simulation, same as the frontend). */
async function advanceIfDue(c) {
  const now = Date.now();
  let changed = false;
  while (c.stage < 5 && now - c.stageStart.getTime() >= stageStepMs) {
    c.stage += 1;
    c.stageStart = new Date(c.stageStart.getTime() + stageStepMs);
    c.stageLog.push({ stage: c.stage, at: c.stageStart });
    changed = true;
  }
  if (changed) await c.save();
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

/**
 * Case "view": the JSON shape the frontend needs.
 * full=false is the public tracking view (no phone, symptoms or GPS).
 */
function present(c, { full = false } = {}) {
  const s = c.stage, f = progress(c), h = c.hospital && c.hospital.name ? c.hospital : null;
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
    liveStatus: ['Hospital is confirming the request', 'Hospital is confirming the request', 'Ambulance heading to the patient', 'Patient being loaded', 'Ambulance heading to hospital', 'Patient arrived at hospital'][s],
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

module.exports = { STAGES, uniqueCaseId, bestMatch, advanceIfDue, present };
