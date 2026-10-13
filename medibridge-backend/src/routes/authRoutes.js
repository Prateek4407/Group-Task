const router = require('express').Router();
const c = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/register', c.register);
router.post('/login', c.login);
router.get('/me', authenticate, c.me);

module.exports = router;
