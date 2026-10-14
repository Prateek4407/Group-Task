const Hospital = require('../models/Hospital');
const hospitals = require('../../seeds/hospitals');

/** Bootstrap the configured hospital directory when the collection is empty. */
async function seedHospitals() {
  if ((await Hospital.countDocuments()) === 0) { await Hospital.insertMany(hospitals); return; }
  /* hospitals saved before ambulance support have no coordinates: fill them in once */
  await Hospital.bulkWrite(hospitals.filter(h => h.lat != null).map(h => ({
    updateOne: { filter: { _id: h._id, lat: { $exists: false } }, update: { $set: { lat: h.lat, lng: h.lng } } }
  })));
}

module.exports = { seedHospitals };
