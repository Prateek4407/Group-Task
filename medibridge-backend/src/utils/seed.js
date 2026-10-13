const Hospital = require('../models/Hospital');
const User = require('../models/User');
const Slot = require('../models/Slot');
const hospitals = require('../../seeds/hospitals');
const { createWelcomeInvoices } = require('../services/invoiceService');

/** Insert the demo hospitals when the collection is empty. */
async function seedHospitals() {
  if ((await Hospital.countDocuments()) === 0) await Hospital.insertMany(hospitals);
}

/** Demo accounts + slots that match the frontend demo (password: demo1234). */
async function seedDemoUsers() {
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  let patient = await User.findOne({ email: 'patient@demo.test' });
  if (!patient) {
    patient = await User.create({ role: 'patient', name: 'Rajesh Sharma', email: 'patient@demo.test', phone: '9876543210', password: 'demo1234' });
    await createWelcomeInvoices(patient._id);
  }
  let doctor = await User.findOne({ email: 'doctor@demo.test' });
  if (!doctor) {
    doctor = await User.create({ role: 'doctor', name: 'Dr. S. K. Roy', email: 'doctor@demo.test', phone: '9876500000', password: 'demo1234', spec: 'Trauma & Emergency Medicine' });
    await Slot.insertMany([
      { doctor: doctor._id, doctorName: doctor.name, date: day(1), from: '10:00', to: '10:30', note: 'General consultation' },
      { doctor: doctor._id, doctorName: doctor.name, date: day(1), from: '11:00', to: '11:30', note: 'Follow-up visit' }
    ]);
  }
}
module.exports = { seedHospitals, seedDemoUsers };
