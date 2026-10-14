const mongoose = require('mongoose');

/* Medical files live inside MongoDB (GridFS), not on the web server's disk.
   Render's disk is wiped on every redeploy; the database is not. */
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'medicalDocuments' });

/** Saves a Buffer, resolves with the new GridFS file id. */
function save(buffer, filename, contentType) {
  return new Promise((resolve, reject) => {
    const up = bucket().openUploadStream(filename, { contentType });
    up.on('error', reject);
    up.on('finish', () => resolve(up.id));
    up.end(buffer);
  });
}

const openStream = (id) => bucket().openDownloadStream(id);
const exists = async (id) => (await bucket().find({ _id: id }).limit(1).toArray()).length > 0;
const remove = (id) => bucket().delete(id).catch(() => {});

module.exports = { save, openStream, exists, remove };
