const Invoice = require('../models/Invoice');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const METHODS = ['UPI', 'Card', 'Pay at hospital'];

const mine = async (req) => {
  const inv = await Invoice.findOne({ invoiceId: req.params.invoiceId });
  if (!inv) throw ApiError.notFound('Invoice not found.');
  if (String(inv.patient) !== String(req.user._id)) throw ApiError.forbidden();
  return inv;
};

/** GET /api/invoices   (patient) */
exports.list = asyncHandler(async (req, res) => {
  const invoices = await Invoice.find({ patient: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: invoices.length, data: { invoices } });
});

/** POST /api/invoices/:invoiceId/pay   body: { method }   (demo, no real payment) */
exports.pay = asyncHandler(async (req, res) => {
  const method = req.body.method || 'UPI';
  if (!METHODS.includes(method)) throw ApiError.badRequest('method must be one of: ' + METHODS.join(', '), { method: 'Invalid payment method.' });
  const inv = await mine(req);
  if (inv.status === 'Paid') throw ApiError.conflict('This invoice is already paid.');
  inv.status = 'Paid'; inv.method = method; inv.paidAt = new Date();
  await inv.save();
  res.json({ success: true, message: 'Payment marked as paid (demo)', data: { invoice: inv } });
});

/** GET /api/invoices/:invoiceId/receipt */
exports.receipt = asyncHandler(async (req, res) => {
  const inv = await mine(req);
  if (inv.status !== 'Paid') throw ApiError.badRequest('A receipt is only available for paid invoices.');
  res.json({ success: true, data: { receipt: { invoiceId: inv.invoiceId, service: inv.service, amount: inv.amount, method: inv.method || 'UPI', status: inv.status, paidAt: inv.paidAt, note: 'Demo receipt for presentation only.' } } });
});
