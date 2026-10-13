const router = require('express').Router();
const c = require('../controllers/invoiceController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('patient'));
router.get('/', c.list);
router.post('/:invoiceId/pay', c.pay);
router.get('/:invoiceId/receipt', c.receipt);

module.exports = router;
