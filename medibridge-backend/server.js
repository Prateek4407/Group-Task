const env = require('./src/config/env');
const connectDB = require('./src/config/db');
const app = require('./src/app');
const { seedHospitals } = require('./src/utils/seed');

(async () => {
  await connectDB(env.mongoUri);
  await seedHospitals();
  app.listen(env.port, () => console.log(`MediBridge API running on http://localhost:${env.port}/api`));
})().catch(e => { console.error('Failed to start:', e.message); process.exit(1); });
