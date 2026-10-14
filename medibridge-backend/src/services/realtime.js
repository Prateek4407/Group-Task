const { EventEmitter } = require('events');

/* In-process pub/sub that wakes up open live-tracking streams (SSE) the moment an ambulance moves.
   Works for one server instance (Render free/starter). For several instances use Redis pub/sub instead. */
const bus = new EventEmitter();
bus.setMaxListeners(0);

const notifyCase = (caseId) => { if (caseId) bus.emit('case:' + caseId); };
const onCase = (caseId, fn) => { bus.on('case:' + caseId, fn); return () => bus.off('case:' + caseId, fn); };

module.exports = { notifyCase, onCase };
