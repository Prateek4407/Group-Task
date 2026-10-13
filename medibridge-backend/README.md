# MediBridge Backend (Express + MongoDB, MVC)

REST API for the MediBridge frontend: auth (patient/doctor), hospital finder, emergency cases with live tracking,
doctor appointment slots, demo payments, and patient documents / medical history that doctors can read.

Full endpoint list with request/response examples: **[docs/API.md](docs/API.md)** (31 endpoints).

## Structure (MVC)
```
server.js                 starts the server (connect DB, seed hospitals, listen)
src/
  app.js                  Express app: security, CORS, JSON, routes, error handling
  config/                 env.js (settings), db.js (MongoDB connection)
  models/      (M)        User, Hospital, Case, Slot, Invoice, Document  (Mongoose schemas)
  controllers/ (C)        auth, hospital, case, slot, invoice, document  (request handling + JSON "view")
  routes/                 one router per resource, mounted under /api
  middleware/             auth (JWT + roles), upload (multer), errorHandler
  services/               caseService (stages/ETA/timeline), invoiceService
  utils/                  ApiError, asyncHandler, validators, seed
seeds/                    hospital data + `npm run seed`
tests/api.test.js         58 integration tests
docs/API.md               API documentation
uploads/                  uploaded documents (private, git-ignored)
```
In an API, the "View" of MVC is the JSON each controller returns (`present()` functions in the case/slot controllers
and the `toJSON` rules in `models/plugin.js`).

## Run
```
npm install
cp .env.example .env        # set MONGO_URI (local MongoDB or Atlas) and JWT_SECRET
npm run seed                # optional: demo accounts patient@demo.test / doctor@demo.test (password demo1234)
npm run dev                 # http://localhost:5000/api/health
```
Hospitals are seeded automatically on first start. Set `CLIENT_URL` to your frontend URL (default `http://localhost:5173`).

## Test
```
npm test
```
Uses `MONGO_URI_TEST` (default `mongodb://127.0.0.1:27017/medibridge_test`). **That database is dropped on every run**, so never point it at real data.
Covers auth, validation, role rules, tracking stage progression, slot overlap / double booking, payments, and
document upload / permissions / file download.

## Deploy (e.g. Render + MongoDB Atlas)
Set `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `NODE_ENV=production`. Uploaded files are stored on the server disk
(`UPLOAD_DIR`), and most free hosts wipe disk on redeploy, so for production move files to cloud storage (S3, Cloudinary, GridFS)
by changing `middleware/upload.js` and `controllers/documentController.js` only.
