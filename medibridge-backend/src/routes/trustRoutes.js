const router = require('express').Router();
const c = require('../controllers/trustController');
const { authenticate, authorize } = require('../middleware/auth');

/* mounted at "/api", so auth is applied per route (a router-level guard would also catch unknown URLs and hide the 404) */
router.get('/consent', authenticate, authorize('patient'), c.getConsent);
router.post('/consent', authenticate, authorize('patient'), c.setConsent);
router.get('/audit', authenticate, authorize('patient', 'doctor'), c.list);

module.exports = router;
