const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const realtime = require('./realtime');

const STALE_ASSIGNMENT_MS = 30 * 60 * 1000;      // an ambulance stuck "assigned" for 30 min is released

/* distance between two coordinates in km (haversine) */
function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const R = 6371, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const lerp = (a, b, t) => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
const hospitalId = (c) => (c.hospital && c.hospital._id) || c.hospital;

/** The fleet is "managed" once at least one ambulance exists. With no fleet, cases use the old fully simulated flow. */
const fleetEnabled = async () => (await Ambulance.estimatedDocumentCount()) > 0;

/** Counts per hospital: { H1: { total, available, assigned, offline } } (offline includes maintenance). */
async function countsByHospital() {
  const rows = await Ambulance.aggregate([{ $group: { _id: { h: '$hospital', s: '$status' }, n: { $sum: 1 } } }]);
  const out = {};
  rows.forEach(({ _id, n }) => {
    const r = out[_id.h] || (out[_id.h] = { total: 0, available: 0, assigned: 0, offline: 0 });
    r.total += n;
    if (_id.s === 'available') r.available += n; else if (_id.s === 'assigned') r.assigned += n; else r.offline += n;
  });
  return out;
}

/** Where the patient is. Uses the GPS from the request, otherwise a point near the hospital (demo / no GPS). */
function pickupPoint(c, hospital) {
  if (c.gps && c.gps.lat != null && c.gps.lng != null) return { lat: c.gps.lat, lng: c.gps.lng };
  const h = hospital || c.hospital;
  if (!h || h.lat == null) return null;
  const d = (h.km || 2) / 111 * 0.7;               // ~0.7 x the hospital's listed distance, diagonal
  return { lat: h.lat - d, lng: h.lng - d };
}

/** Frees ambulances that were assigned long ago and never finished (abandoned demo cases). */
async function releaseStale() {
  await Ambulance.updateMany(
    { status: 'assigned', assignedAt: { $lt: new Date(Date.now() - STALE_ASSIGNMENT_MS) } },
    { $set: { status: 'available', assignedCase: null, assignedAt: null } }
  );
}

/**
 * Picks the nearest available ambulance (base hospital first, then any hospital) and claims it atomically.
 * Sets c.ambulance / c.ambulanceOrigin on the case document (caller saves). Returns the ambulance or null.
 */
async function assignNearest(c) {
  await releaseStale();
  const hid = hospitalId(c);
  const hospital = c.hospital && c.hospital.name ? c.hospital : await Hospital.findById(hid);
  const pickup = pickupPoint(c, hospital);

  let candidates = await Ambulance.find({ status: 'available', hospital: hid });
  if (!candidates.length) candidates = await Ambulance.find({ status: 'available' });
  const where = (a) => (a.location && a.location.lat != null ? a.location : hospital);
  candidates.sort((a, b) => distanceKm(where(a), pickup) - distanceKm(where(b), pickup));

  for (const cand of candidates) {
    const amb = await Ambulance.findOneAndUpdate(
      { _id: cand._id, status: 'available' },
      { $set: { status: 'assigned', assignedCase: c.caseId, assignedAt: new Date() } },
      { new: true }
    );
    if (amb) {
      const o = where(amb);
      c.ambulance = amb;
      c.ambulanceOrigin = o && o.lat != null ? { lat: o.lat, lng: o.lng } : undefined;
      c.ambulanceAssignedAt = new Date();
      return amb;
    }
  }
  return null;
}

/** Puts the ambulance back in service at its base hospital (called when a case ends or restarts). */
async function release(c) {
  const id = c.ambulance && c.ambulance._id ? c.ambulance._id : c.ambulance;
  if (!id) return;
  const amb = await Ambulance.findById(id);
  if (!amb || amb.assignedCase !== c.caseId) return;
  const base = await Hospital.findById(amb.hospital);
  amb.status = 'available'; amb.assignedCase = null; amb.assignedAt = null;
  if (base && base.lat != null) amb.location = { lat: base.lat, lng: base.lng, updatedAt: new Date(), source: 'base' };
  await amb.save();
  realtime.notifyCase(c.caseId);
}

/** Position shown on the tracking page: real GPS if the driver app is sending it, otherwise a simulation. */
function livePosition(c, amb, stage, frac) {
  const loc = amb.location;
  const fresh = loc && loc.source === 'gps' && loc.updatedAt && Date.now() - new Date(loc.updatedAt).getTime() < 90 * 1000;
  if (fresh && stage < 5) return { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt, source: 'live' };

  const hospital = c.hospital && c.hospital.name ? c.hospital : null;
  const origin = c.ambulanceOrigin && c.ambulanceOrigin.lat != null ? c.ambulanceOrigin : hospital;
  const pickup = pickupPoint(c, hospital);
  if (!origin || origin.lat == null || !pickup || !hospital || hospital.lat == null) return null;
  const home = { lat: hospital.lat, lng: hospital.lng };
  let p;
  if (stage <= 2) p = lerp(origin, pickup, stage === 2 ? frac : 0);
  else if (stage === 3) p = pickup;
  else if (stage === 4) p = lerp(pickup, home, frac);
  else p = home;
  return { lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), updatedAt: new Date(), source: 'simulated' };
}

module.exports = { fleetEnabled, countsByHospital, assignNearest, release, livePosition, distanceKm, pickupPoint };
