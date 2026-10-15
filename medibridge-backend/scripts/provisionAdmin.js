/*
 * One-time administrator provisioning.
 * Required environment variables: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD.
 * This command refuses to overwrite accounts and never prints the password.
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const { EMAIL, PHONE } = require('../src/utils/validators');

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

async function provisionAdmin() {
  const name = required('ADMIN_NAME');
  const email = required('ADMIN_EMAIL').toLowerCase();
  const phone = required('ADMIN_PHONE');
  const password = process.env.ADMIN_PASSWORD || '';

  if (name.length < 2) throw new Error('ADMIN_NAME must contain at least 2 characters.');
  if (!EMAIL.test(email)) throw new Error('ADMIN_EMAIL must be a valid email address.');
  if (!PHONE.test(phone)) throw new Error('ADMIN_PHONE must be a valid 10-digit mobile number.');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters.');

  await connectDB(env.mongoUri);
  if (await User.exists({ role: 'admin' })) throw new Error('An administrator already exists; no changes were made.');
  if (await User.exists({ $or: [{ email }, { phone }] })) throw new Error('That email or phone already belongs to an account; no changes were made.');

  await User.create({ role: 'admin', status: 'active', name, email, phone, password });
  console.log(`Administrator ${email} created successfully.`);
}

provisionAdmin()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(`Administrator provisioning failed: ${error.message}`);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
