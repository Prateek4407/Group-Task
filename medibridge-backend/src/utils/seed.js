const Hospital = require('../models/Hospital');
const User = require('../models/User');
const Slot = require('../models/Slot');
const Ambulance = require('../models/Ambulance');
const hospitals = require('../../seeds/hospitals');
const fleet = require('../../seeds/ambulances');
const { createWelcomeInvoices } = require('../services/invoiceService');

/** Insert the demo hospitals when the collection is empty. */
async function seedHospitals() {
  if ((await Hospital.countDocuments()) === 0) { await Hospital.insertMany(hospitals); return; }
  /* hospitals saved before ambulance support have no coordinates: fill them in once */
  await Hospital.bulkWrite(hospitals.filter(h => h.lat != null).map(h => ({
    updateOne: { filter: { _id: h._id, lat: { $exists: false } }, update: { $set: { lat: h.lat, lng: h.lng } } }
  })));
}

/** Insert the demo ambulance fleet when there are no ambulances yet (parked at their base hospitals). */
async function seedAmbulances() {
  if ((await Ambulance.countDocuments()) > 0) return;
  const base = Object.fromEntries(hospitals.map(h => [h._id, h]));
  await Ambulance.insertMany(fleet.map(a => ({
    ...a, status: 'available',
    location: { lat: base[a.hospital].lat, lng: base[a.hospital].lng, updatedAt: new Date(), source: 'base' }
  })));
}

/** Demo accounts + slots that match the frontend demo (password: demo1234). */
async function seedDemoUsers() {
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  let patient = await User.findOne({ email: 'patient@demo.test' });
  if (!patient) {
    patient = await User.create({ role: 'patient', name: 'Rajesh Sharma', email: 'patient@demo.test', phone: '9876543210', password: 'demo1234' });
    await createWelcomeInvoices(patient._id);
  }
  let driver = await User.findOne({ email: 'driver@demo.test' });
  if (!driver) driver = await User.create({ role: 'driver', name: 'Ramesh Kumar', email: 'driver@demo.test', phone: '9810000001', password: 'demo1234' });
  await Ambulance.updateOne({ registration: 'DL1CA1001', driverUser: null }, { $set: { driverUser: driver._id } });
  let doctor = await User.findOne({ email: 'doctor@demo.test' });
  if (!doctor) {
    doctor = await User.create({ role: 'doctor', name: 'Dr. S. K. Roy', email: 'doctor@demo.test', phone: '9876500000', password: 'demo1234', spec: 'Trauma & Emergency Medicine' });
    await Slot.insertMany([
      { doctor: doctor._id, doctorName: doctor.name, date: day(1), from: '10:00', to: '10:30', note: 'General consultation' },
      { doctor: doctor._id, doctorName: doctor.name, date: day(1), from: '11:00', to: '11:30', note: 'Follow-up visit' }
    ]);
  }
}
module.exports = { seedHospitals, seedAmbulances, seedDemoUsers };
