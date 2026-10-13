const router = require('express').Router();

router.get('/health', (req, res) => res.json({ success: true, status: 'ok', service: 'medibridge-api', time: new Date().toISOString() }));
router.use('/auth', require('./authRoutes'));
router.use('/hospitals', require('./hospitalRoutes'));
router.use('/cases', require('./caseRoutes'));
router.use('/slots', require('./slotRoutes'));
router.use('/invoices', require('./invoiceRoutes'));
router.use('/documents', require('./documentRoutes'));

module.exports = router;
