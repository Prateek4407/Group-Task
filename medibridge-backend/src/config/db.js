const mongoose = require('mongoose');
const dns = require('node:dns');

module.exports = async function connectDB(uri) {
  const dnsServers = (process.env.MONGO_DNS_SERVERS || '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
  if (dnsServers.length) dns.setServers(dnsServers);

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
};
