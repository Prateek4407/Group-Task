const router = require('express').Router();
const c = require('../controllers/slotController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/', c.list);
router.post('/', authorize('doctor'), c.create);
router.delete('/:id', authorize('doctor'), c.remove);
router.patch('/:id/book', authorize('patient'), c.book);
router.patch('/:id/cancel', authorize('patient'), c.cancel);

module.exports = router;
