const Hospital = require('../models/Hospital');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { bestMatch } = require('../services/caseService');
const { countsByHospital } = require('../services/ambulanceService');

const EMPTY = { total: 0, available: 0, assigned: 0, offline: 0 };
const withAmbulances = (h, counts) => ({ ...h.toJSON(), ambulances: counts[h._id] || EMPTY });

const CARES = ['Emergency', 'Cardiac', 'Trauma', 'Maternity'];

/** GET /api/hospitals?care=Cardiac&q=sector&sort=eta|km|icu */
exports.list = asyncHandler(async (req, res) => {
  const { care, q = '', sort = 'eta' } = req.query;
  const filter = {};
  if (care && care !== 'All') {
    if (!CARES.includes(care)) throw ApiError.badRequest('care must be one of: ' + CARES.join(', '));
    filter.care = care;
  }
  let list = await Hospital.find(filter);
  const needle = String(q).toLowerCase();
  if (needle) list = list.filter(h => (h.name + ' ' + h.area).toLowerCase().includes(needle));
  const key = ['eta', 'km', 'icu'].includes(sort) ? sort : 'eta';
  list.sort((a, b) => ((a.load === 'Saturated') - (b.load === 'Saturated')) || (key === 'icu' ? b.icu - a.icu : a[key] - b[key]));
  const counts = await countsByHospital();
  res.json({ success: true, count: list.length, data: { hospitals: list.map(h => withAmbulances(h, counts)) } });
});

/** GET /api/hospitals/best-match?care=Cardiac */
exports.best = asyncHandler(async (req, res) => {
  const care = req.query.care || 'Emergency';
  if (!CARES.includes(care)) throw ApiError.badRequest('care must be one of: ' + CARES.join(', '));
  const h = await bestMatch(care);
  res.json({ success: true, data: { hospital: h && withAmbulances(h, await countsByHospital()) } });
});

/** GET /api/hospitals/:id */
exports.get = asyncHandler(async (req, res) => {
  const h = await Hospital.findById(req.params.id);
  if (!h) throw ApiError.notFound('Hospital not found.');
  res.json({ success: true, data: { hospital: withAmbulances(h, await countsByHospital()) } });
});
