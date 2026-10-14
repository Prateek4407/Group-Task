const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { clientUrls } = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: clientUrls, credentials: true }));
app.use((req, res, next) => {
  const origin = req.get('origin');
  const changesState = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (changesState && origin && !clientUrls.includes(origin)) {
    return res.status(403).json({ success: false, message: 'Origin is not allowed.' });
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
