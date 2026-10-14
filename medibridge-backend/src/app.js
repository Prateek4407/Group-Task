const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { clientUrls } = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: clientUrls, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
