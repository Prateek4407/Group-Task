class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
  static badRequest(msg, errors) { return new ApiError(400, msg, errors); }
  static unauthorized(msg = 'Please login to continue.') { return new ApiError(401, msg); }
  static forbidden(msg = 'You do not have access to this resource.') { return new ApiError(403, msg); }
  static notFound(msg = 'Not found.') { return new ApiError(404, msg); }
  static conflict(msg) { return new ApiError(409, msg); }
}
module.exports = ApiError;
