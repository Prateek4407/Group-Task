/* npm run seed  ->  hospitals + demo patient/doctor */
const env = require('../src/config/env');
const connectDB = require('../src/config/db');
const { seedHospitals, seedDemoUsers } = require('../src/utils/seed');

(async () => {
  await connectDB(env.mongoUri);
  await seedHospitals();
  await seedDemoUsers();
  console.log('Seeded hospitals and demo users (patient@demo.test / doctor@demo.test, password demo1234).');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
