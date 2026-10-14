# MediBridge Backend (Express + MongoDB, MVC)

REST API for the MediBridge frontend: auth (patient/doctor/driver), hospital finder, emergency cases with live tracking,
ambulance fleet management with automatic dispatch and driver GPS, doctor appointment slots, demo payments, and patient
documents / medical history with consent control and an access (audit) log.

Full endpoint list with request/response examples: **[docs/API.md](docs/API.md)**. The endpoints added for ambulances, consent and audit are listed in section 'What is new' below.

## Structure (MVC)
```
server.js                 starts the server (connect DB, seed hospitals, listen)
src/
  app.js                  Express app: security, CORS, JSON, routes, error handling
  config/                 env.js (settings), db.js (MongoDB connection)
  models/      (M)        User, Hospital, Case, Slot, Invoice, Document, Ambulance, Consent, AuditLog  (Mongoose schemas)
  controllers/ (C)        auth, hospital, case, slot, invoice, document, ambulance, trust (consent + audit)
  routes/                 one router per resource, mounted under /api
  middleware/             auth (JWT + roles), upload (multer), errorHandler
  services/               caseService (stages/ETA/timeline), ambulanceService (dispatch, positions), fileStorage (GridFS),
                          consentService, auditService, realtime (live tracking pushes), invoiceService
  utils/                  ApiError, asyncHandler, validators, seed
seeds/                    hospital data + `npm run seed`
tests/api.test.js         integration tests (core API)
tests/fleet.test.js       integration tests (ambulances, dispatch, GPS, consent, audit)
docs/API.md               API documentation
uploads/                  only used to read documents uploaded BEFORE the move to MongoDB (legacy)
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
Hospitals and a demo ambulance fleet are seeded automatically on first start (the demo driver login is driver@demo.test after `npm run seed`). Set `CLIENT_URL` to your frontend URL (default `http://localhost:5173`).

## Test
```
npm test
```
Uses `MONGO_URI_TEST` (default `mongodb://127.0.0.1:27017/medibridge_test`). **That database is dropped on every run**, so never point it at real data.
Covers auth, validation, role rules, tracking stage progression, slot overlap / double booking, payments, and
document upload / permissions / file download.

## What is new

### Medical documents survive redeploys
Files are now stored **inside MongoDB (GridFS)**, not on the server disk, so a Render redeploy no longer erases them.
Nothing extra to set up: it uses the same `MONGO_URI`. Documents uploaded before this change still open if their file is
still on disk; otherwise the patient sees "please upload it again". Files are limited to 10 MB each (same as before).
Atlas free tier has 512 MB total, so this suits a demo/academic project; for production use S3 or Cloudinary by changing
only `services/fileStorage.js`.

### Ambulance fleet and dispatch
* Doctors manage ambulances (vehicle number, base hospital, type, equipment, driver, status).
* When a hospital confirms a request (stage 2, "Ambulance assigned") the **nearest free ambulance** is claimed
  atomically, preferring the chosen hospital's own vehicles. It is freed when the case reaches stage 6 or is restarted,
  and automatically after 30 minutes if a case is abandoned.
* If every ambulance is busy the case **waits at stage 2** ("waiting for a free ambulance") instead of pretending.
* The Hospital Finder and the delay-prediction form show how many ambulances are free (`ambulances: { total, available }`).
* If no ambulance has been created yet, cases use the old fully simulated flow (nothing breaks).

### Real-time tracking (honest about what is real)
* `GET /api/cases/:caseId/stream` pushes updates with Server-Sent Events (no new package). The page falls back to polling.
* A driver registers with the role **driver**, a doctor links the driver's email to an ambulance, and the driver's phone
  sends GPS to `PATCH /api/ambulances/mine/location` (the Driver page does this every 4 s).
* While GPS is fresh (< 90 s) the tracking page shows `source: "live"`. Otherwise the position is **simulated** and labelled so.
* Pushes work for a single server instance. For several instances, replace `services/realtime.js` with Redis pub/sub.

### Consent and audit history
* Patients can switch sharing of their documents with doctors on/off (`/api/consent`). Withdrawing hides every document
  from doctors (list, details, file) and the attempt is logged. Every decision is kept as history.
* Sending an emergency request while logged in records an `emergency-case` consent with the case id.
* Every upload, view, download, delete, blocked attempt and consent change is written to an append-only audit log.
  Patients read it at `GET /api/audit` (who opened what, when); doctors see only their own activity.
* No decision on file counts as "allowed" (the upload screen already says doctors can see files); the first upload
  writes an explicit grant.

| Method | URL | Who | Purpose |
|--------|-----|-----|---------|
| GET | `/api/ambulances/availability` | Public | Free / total ambulances, per hospital |
| GET | `/api/ambulances` | Doctor | Fleet list (filters `hospital`, `status`) |
| POST | `/api/ambulances` | Doctor | Add an ambulance (`registration`, `hospital`, `type`, `driverEmail`, ...) |
| PATCH | `/api/ambulances/:id` | Doctor | Edit / set status `available`, `offline`, `maintenance` |
| DELETE | `/api/ambulances/:id` | Doctor | Remove (not while on a case) |
| PATCH | `/api/ambulances/:id/location` | Doctor or linked driver | Set position `{ lat, lng }` |
| GET | `/api/ambulances/mine` | Driver | My ambulance |
| PATCH | `/api/ambulances/mine/location` | Driver | Send live GPS `{ lat, lng }` |
| PATCH | `/api/ambulances/mine/status` | Driver | `available` or `offline` |
| GET | `/api/cases/:caseId/stream` | Public | Live tracking stream (SSE) |
| GET | `/api/consent` | Patient | Current consent + history |
| POST | `/api/consent` | Patient | `{ granted: true | false }` |
| GET | `/api/audit?limit=&action=` | Patient / Doctor | Access log (patient: my records, doctor: my activity) |

Case JSON now also contains `ambulance` (`registration`, `type`, `equipment`, `position`; the full view adds the driver's
name and phone) and `waitingForAmbulance`. Hospital JSON contains `ambulances`.

## Deploy (e.g. Render + MongoDB Atlas)
Set `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `NODE_ENV=production`. Documents are stored in MongoDB, so they survive redeploys.
`UPLOAD_DIR` is no longer needed. Free Render instances sleep when idle: the first request after a pause is slow and open live
tracking streams are dropped (the page reconnects or falls back to polling).
