const Invoice = require('../models/Invoice');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

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

/** GET /api/invoices/:invoiceId/receipt */
exports.receipt = asyncHandler(async (req, res) => {
  const inv = await mine(req);
  if (inv.status !== 'Paid') throw ApiError.badRequest('A receipt is only available for paid invoices.');
  res.json({ success: true, data: { receipt: { invoiceId: inv.invoiceId, service: inv.service, amount: inv.amount, method: inv.method, status: inv.status, paidAt: inv.paidAt } } });
});
