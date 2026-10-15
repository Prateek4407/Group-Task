const router = require('express').Router();
const c = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('admin'));
router.get('/users', c.listStaff);
router.patch('/users/:id/status', c.setStatus);

module.exports = router;
