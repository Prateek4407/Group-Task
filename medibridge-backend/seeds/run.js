/* npm run seed -> bootstrap the hospital directory in MongoDB */
const env = require('../src/config/env');
const connectDB = require('../src/config/db');
const { seedHospitals } = require('../src/utils/seed');

(async () => {
  await connectDB(env.mongoUri);
  await seedHospitals();
  console.log('Hospital directory is ready.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
