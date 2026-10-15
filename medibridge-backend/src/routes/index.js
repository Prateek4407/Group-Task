const router = require('express').Router();

router.get('/health', (req, res) => res.json({ success: true, status: 'ok', service: 'medibridge-api', time: new Date().toISOString() }));
router.use('/auth', require('./authRoutes'));
router.use('/hospitals', require('./hospitalRoutes'));
router.use('/cases', require('./caseRoutes'));
router.use('/slots', require('./slotRoutes'));
router.use('/invoices', require('./invoiceRoutes'));
router.use('/documents', require('./documentRoutes'));
router.use('/ambulances', require('./ambulanceRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/', require('./trustRoutes'));            // /consent and /audit

module.exports = router;
