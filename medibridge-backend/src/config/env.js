const path = require('path');
require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const requiredInProduction = (name, developmentValue) => {
  const value = process.env[name];
  if (env === 'production' && !value) throw new Error(`${name} is required in production.`);
  return value || developmentValue;
};
const clientUrls = requiredInProduction('CLIENT_URL', 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

module.exports = {
  env,
  port: Number(process.env.PORT) || 5000,
  mongoUri: requiredInProduction('MONGO_URI', 'mongodb://127.0.0.1:27017/medibridge'),
  jwtSecret: requiredInProduction('JWT_SECRET', 'dev-only-secret-change-me'),
  jwtExpires: process.env.JWT_EXPIRES_IN || '7d',
  authCookieName: process.env.AUTH_COOKIE_NAME || 'medibridge_auth',
  authCookieDays: Number(process.env.AUTH_COOKIE_DAYS) || 7,
  clientUrls,
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads')
};
