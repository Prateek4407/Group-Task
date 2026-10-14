const Case = require('../models/Case');
const Hospital = require('../models/Hospital');
const ambulances = require('./ambulanceService');
const realtime = require('./realtime');

const STAGES = [
  ['Request received', 'Case created and triage priority assigned'],
  ['Hospital confirmed', 'Hospital acknowledged and prepared a bay'],
  ['Ambulance assigned', 'Ambulance dispatched to the patient'],
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

async function bestMatch(care) {
  const list = await Hospital.find({ care, load: { $ne: 'Saturated' } }).sort({ eta: 1 });
  const counts = await ambulances.countsByHospital();
  return list.find((hospital) => counts[hospital._id]?.available > 0)
    || list[0]
    || (await Hospital.findOne().sort({ _id: 1 }));
}

/**
 * Applies one real workflow transition. No timer advances cases. When moving
 * from hospital confirmation to dispatch, an available MongoDB ambulance is
 * claimed atomically; if none exists, the case stays waiting at stage 1.
 */
async function stepForward(c, at = new Date()) {
  if (c.stage >= 5) return false;
  if (c.stage === 1 && !c.ambulance) {
    const ambulance = await ambulances.assignNearest(c);
    if (!ambulance) return false;
  }
  c.stage += 1;
  c.stageStart = at;
  c.stageLog.push({ stage: c.stage, at });
  if (c.stage === 5) await ambulances.release(c);
  return true;
}

const statusOf = (c) => (c.stage >= 5
  ? { label: 'Handoff completed', badge: 'green' }
  : c.stage < 2
    ? { label: 'Awaiting dispatch', badge: 'estimated' }
    : { label: 'In transit', badge: 'estimated' });

function timeline(c) {
  return STAGES.map(([title, detail], index) => {
    const log = c.stageLog.find((entry) => entry.stage === index);
    const at = index === 0 ? c.createdAt : log?.at || null;
    return {
      step: index + 1,
      title,
      detail,
      state: index < c.stage ? 'done' : index === c.stage ? (c.stage === 5 ? 'done' : 'now') : 'future',
      at: index <= c.stage ? at : null
    };
  });
}

function ambulanceView(c, full) {
  const ambulance = c.ambulance?.registration ? c.ambulance : null;
  if (!ambulance) return null;
  const storedPosition = ambulances.livePosition(ambulance);
  const gpsPosition = storedPosition?.source === 'gps' ? storedPosition : null;
  const out = {
    id: String(ambulance._id),
    registration: ambulance.registration,
    type: ambulance.type,
    equipment: ambulance.equipment || [],
    position: gpsPosition,
    waitingForDriverLocation: !gpsPosition
  };
  if (full) Object.assign(out, {
    driverName: ambulance.driverName,
    driverPhone: ambulance.driverPhone
  });
  return out;
}

function present(c, { full = false } = {}) {
  const hospital = c.hospital?.name ? c.hospital : null;
  const waiting = c.stage === 1 && !c.ambulance;
  const liveStatuses = [
    'Waiting for hospital confirmation',
    'Hospital confirmed - waiting for an available ambulance',
    'Ambulance heading to the patient',
    'Patient pickup complete',
    'Ambulance heading to hospital',
    'Patient arrived at hospital'
  ];
  const ambulance = ambulanceView(c, full);
  const waitingForDriverLocation = c.stage >= 2 && c.stage < 5 && ambulance?.waitingForDriverLocation;
  const out = {
    id: String(c._id),
    caseId: c.caseId,
    patient: { name: c.name, age: c.age, sex: c.sex },
    care: c.care,
    sev: c.sev,
    pickupAddress: c.address,
    hospital: hospital
      ? { id: hospital._id, name: hospital.name, area: hospital.area, km: hospital.km, eta: hospital.eta }
      : { id: c.hospital },
    stage: c.stage,
    stageLabel: `Stage ${c.stage + 1} of 6`,
    stageProgress: c.stage >= 5 ? 1 : 0,
    status: statusOf(c),
    etaMinutes: c.stage >= 5 ? 0 : (hospital?.eta ?? null),
    liveStatus: waitingForDriverLocation ? 'Waiting for driver live location' : liveStatuses[c.stage],
    ambulance,
    waitingForAmbulance: waiting,
    corridor: c.stage < 2 ? 'Preparing' : c.stage === 5 ? 'Completed' : 'Active',
    hospitalStatus: c.stage < 1 ? 'Pending' : 'Accepted',
    timeline: timeline(c),
    createdAt: c.createdAt
  };
  if (full) Object.assign(out, {
    patient: { name: c.name, age: c.age, sex: c.sex, phone: c.phone },
    relationship: c.rel,
    symptoms: c.symptoms,
    landmark: c.landmark,
    gps: c.gps?.lat != null ? c.gps : null,
    acknowledgedAt: c.acknowledgedAt
  });
  return out;
}

const notify = (c) => realtime.notifyCase(c.caseId);

module.exports = { STAGES, uniqueCaseId, bestMatch, stepForward, present, notify };
