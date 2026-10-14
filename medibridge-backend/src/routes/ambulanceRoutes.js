const router = require('express').Router();
const c = require('../controllers/ambulanceController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/availability', c.availability);                          // public: how many ambulances are free

router.use(authenticate);
router.get('/mine', authorize('driver'), c.mine);                     // keep "mine" routes above /:id
router.patch('/mine/location', authorize('driver'), c.mineLocation);
router.patch('/mine/status', authorize('driver'), c.mineStatus);

router.get('/', authorize('doctor'), c.list);
router.post('/', authorize('doctor'), c.create);
router.patch('/:id', authorize('doctor'), c.update);
router.patch('/:id/location', authorize('doctor', 'driver'), c.location);
router.delete('/:id', authorize('doctor'), c.remove);

module.exports = router;
