const router = require('express').Router();
const c = require('../controllers/caseController');
const { authenticate, optionalAuth, authorize } = require('../middleware/auth');

router.post('/', optionalAuth, c.create);                       // emergency request works without login
router.post('/demo', optionalAuth, c.demo);
router.get('/', authenticate, c.list);
router.get('/active', authenticate, c.active);                  // must stay above /:caseId
router.get('/:caseId/track', c.track);                          // public, limited fields
router.get('/:caseId/stream', c.stream);                        // public live stream (SSE), same fields as /track
router.get('/:caseId', authenticate, c.get);
router.post('/:caseId/advance', optionalAuth, c.advance);
router.post('/:caseId/restart', optionalAuth, c.restart);
router.post('/:caseId/acknowledge', authenticate, authorize('doctor'), c.acknowledge);

module.exports = router;
