/* Shared JSON "view": expose `id`, hide internals */
module.exports = (schema) => {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (doc, ret) => {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.password;
      delete ret.storedName;
      delete ret.fileId;
      return ret;
    }
  });
};
