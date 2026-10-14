const router = require('express').Router();
const c = require('../controllers/hospitalController');

router.get('/', c.list);
router.get('/best-match', c.best);   // must stay above /:id
router.get('/:id', c.get);

module.exports = router;
