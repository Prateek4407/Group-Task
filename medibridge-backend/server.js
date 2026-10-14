const env = require('./src/config/env');
const connectDB = require('./src/config/db');
const app = require('./src/app');

(async () => {
  await connectDB(env.mongoUri);
  app.listen(env.port, () => console.log(`MediBridge API listening on port ${env.port}`));
})().catch(e => { console.error('Failed to start:', e.message); process.exit(1); });
