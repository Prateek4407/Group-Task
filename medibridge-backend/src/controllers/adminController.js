const mongoose = require('mongoose');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/auditService');

const STAFF_ROLES = ['doctor', 'driver'];
const STATUSES = ['pending', 'active', 'rejected'];
const SAFE_FIELDS = 'role name email phone spec status createdAt updatedAt';
const statusFilter = (status) => status === 'active'
  ? { $or: [{ status: 'active' }, { status: { $exists: false } }] }
  : { status };

/** GET /api/admin/users?status=pending|active|rejected&role=doctor|driver */
exports.listStaff = asyncHandler(async (req, res) => {
  if (req.query.status && !STATUSES.includes(req.query.status)) throw ApiError.badRequest('status must be pending, active or rejected.');
  if (req.query.role && !STAFF_ROLES.includes(req.query.role)) throw ApiError.badRequest('role must be doctor or driver.');

  const filter = { role: req.query.role || { $in: STAFF_ROLES } };
  if (req.query.status) Object.assign(filter, statusFilter(req.query.status));
  const [users, pending, active, rejected] = await Promise.all([
    User.find(filter).select(SAFE_FIELDS).sort({ createdAt: -1, _id: -1 }),
    User.countDocuments({ role: { $in: STAFF_ROLES }, ...statusFilter('pending') }),
    User.countDocuments({ role: { $in: STAFF_ROLES }, ...statusFilter('active') }),
    User.countDocuments({ role: { $in: STAFF_ROLES }, ...statusFilter('rejected') })
  ]);
  const safeUsers = users.map((user) => ({ ...user.toJSON(), status: user.status || 'active' }));
  res.json({ success: true, count: safeUsers.length, data: { users: safeUsers, counts: { pending, active, rejected } } });
});

/** PATCH /api/admin/users/:id/status   body { status: active|rejected } */
exports.setStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'rejected'].includes(status)) throw ApiError.badRequest('status must be active or rejected.', { status: 'Invalid status.' });
  const user = mongoose.isValidObjectId(req.params.id)
    ? await User.findById(req.params.id).select(SAFE_FIELDS)
    : null;
  if (!user || !STAFF_ROLES.includes(user.role)) throw ApiError.notFound('Doctor or driver account not found.');

  const previous = user.status || 'active';
  if (previous !== status) {
    user.status = status;
    await user.save();
    const action = status === 'active' ? 'staff.approve' : previous === 'pending' ? 'staff.reject' : 'staff.revoke';
    await audit.log(req, {
      action,
      patient: user._id,
      patientName: user.name,
      targetType: 'user',
      targetId: user._id,
      targetLabel: `${user.role} account`
    });
  }

  const verb = status === 'active' ? 'approved' : previous === 'active' ? 'revoked' : 'rejected';
  res.json({ success: true, message: `${user.name} ${verb}.`, data: { user } });
});
