const router = require('express').Router();
const c = require('../controllers/documentController');
const upload = require('../middleware/upload');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.post('/', authorize('patient'), upload, c.upload);
router.get('/', c.list);
router.get('/summary', authorize('patient'), c.summary);      // keep above /:id
router.get('/patients', authorize('doctor'), c.patients);      // keep above /:id
router.get('/:id', c.get);
router.get('/:id/file', c.file);
router.delete('/:id', authorize('patient'), c.remove);

module.exports = router;
