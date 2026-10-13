# MediBridge Backend

REST API for **MediBridge**, an emergency care coordination platform. It connects patients, ambulances, hospitals and doctors: patients can find the best hospital, raise an emergency request and track it live, while doctors manage appointment slots and view patient medical records.

**Live API:** https://medibridge-2-v53u.onrender.com
**Health check:** https://medibridge-2-v53u.onrender.com/api/health
**Full API reference:** [docs/API.md](docs/API.md) (31 endpoints with request and response examples)

> If the service is hosted on a free Render plan, it may sleep when idle, so the first request can take up to a minute.

---

## Features

- **Authentication.** Register and log in as a `patient` or a `doctor` using email or phone. JWT-based, with role-based access control.
- **Hospital finder.** Search, filter by care type (Emergency, Cardiac, Trauma, Maternity) and sort by ETA, distance or ICU availability. A best-match endpoint picks the fastest hospital that is not saturated.
- **Emergency cases and live tracking.** Raise an emergency request (login optional) and follow it through six stages, from request received to arrival at the hospital, via a public tracking link that hides private patient details.
- **Doctor appointment slots.** Doctors publish time slots with overlap protection. Patients book and cancel them, with atomic booking to prevent double booking.
- **Demo payments.** Invoices, simulated payment (UPI, Card, Pay at hospital) and receipts. No real money is involved.
- **Documents and medical history.** Patients upload PDFs, images and Word or text files (up to 10 MB). Doctors have read-only access to every patient's files. Files are served only through an authenticated endpoint.

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | Express 5 |
| Database | MongoDB with Mongoose |
| Auth | JSON Web Tokens, bcryptjs |
| Security | Helmet, CORS |
| File uploads | Multer |
| Testing | Jest, Supertest |
| Hosting | Render (API), MongoDB Atlas (database) |

## Project structure

The project follows an MVC pattern. In an API, the "View" is the JSON each controller returns.

```
medibridge-backend/
├── server.js               Entry point: connects DB, seeds hospitals, starts the server
├── src/
│   ├── app.js              Express app: security, CORS, JSON parsing, routes, error handling
│   ├── config/             env.js (settings), db.js (MongoDB connection)
│   ├── models/             User, Hospital, Case, Slot, Invoice, Document
│   ├── controllers/        auth, hospital, case, slot, invoice, document
│   ├── routes/             One router per resource, mounted under /api
│   ├── middleware/         auth (JWT and roles), upload (multer), errorHandler
│   ├── services/           caseService (stages, ETA, timeline), invoiceService
│   └── utils/              ApiError, asyncHandler, validators, seed
├── seeds/                  Hospital data and `npm run seed` script
├── tests/api.test.js       Integration tests
├── docs/API.md             Full API documentation
└── uploads/                Uploaded documents (private, git-ignored)
```

## Getting started

### Prerequisites

- Node.js 18 or later
- A MongoDB database (local installation or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster)

### Installation

```bash
git clone https://github.com/Prateek4407/MediBridge.git
cd MediBridge
git checkout backend
cd medibridge-backend
npm install
```

### Environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env        # on Windows PowerShell: copy .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port the server listens on | `5000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/medibridge` |
| `MONGO_URI_TEST` | Separate database used by tests (**dropped on every run**) | `mongodb://127.0.0.1:27017/medibridge_test` |
| `JWT_SECRET` | Secret used to sign tokens. Use a long random string | dev-only fallback |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `CLIENT_URL` | Allowed frontend origin(s) for CORS, comma separated | `http://localhost:5173` |
| `UPLOAD_DIR` | Folder for uploaded documents | `uploads` |

Never commit your `.env` file. It is already listed in `.gitignore`.

### Run

```bash
npm run seed     # optional: creates demo accounts and slots
npm run dev      # development mode with auto-restart
npm start        # production mode
```

The API runs at `http://localhost:5000/api`. Check it with `http://localhost:5000/api/health`.

Hospitals are seeded automatically on first start.

### Demo accounts

After running `npm run seed`:

| Role | Email | Password |
|------|-------|----------|
| Patient | `patient@demo.test` | `demo1234` |
| Doctor | `doctor@demo.test` | `demo1234` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the server |
| `npm run dev` | Start with `node --watch` |
| `npm run seed` | Seed hospitals and demo users |
| `npm test` | Run the integration tests |

## API overview

Base URL: `https://medibridge-2-v53u.onrender.com/api`

Protected routes need the header `Authorization: Bearer <token>`. The token is returned by register and login.

| Area | Endpoints | Access |
|------|-----------|--------|
| Health | `GET /health` | Public |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Public, then any login |
| Hospitals | `GET /hospitals`, `GET /hospitals/best-match`, `GET /hospitals/:id` | Public |
| Emergency cases | `POST /cases`, `POST /cases/demo`, `GET /cases`, `GET /cases/active`, `GET /cases/:caseId`, `GET /cases/:caseId/track`, `POST /cases/:caseId/advance`, `POST /cases/:caseId/restart`, `POST /cases/:caseId/acknowledge` | Mixed (see docs) |
| Appointment slots | `GET /slots`, `POST /slots`, `DELETE /slots/:id`, `PATCH /slots/:id/book`, `PATCH /slots/:id/cancel` | Doctor / Patient |
| Invoices | `GET /invoices`, `POST /invoices/:invoiceId/pay`, `GET /invoices/:invoiceId/receipt` | Patient |
| Documents | `POST /documents`, `GET /documents`, `GET /documents/summary`, `GET /documents/patients`, `GET /documents/:id`, `GET /documents/:id/file`, `DELETE /documents/:id` | Patient / Doctor |

See [docs/API.md](docs/API.md) for field rules, request bodies and example responses.

### Example requests

Log in:

```bash
curl -X POST https://medibridge-2-v53u.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"patient@demo.test","password":"demo1234","role":"patient"}'
```

Find cardiac hospitals sorted by ICU availability:

```bash
curl "https://medibridge-2-v53u.onrender.com/api/hospitals?care=Cardiac&sort=icu"
```

Get the current user:

```bash
curl https://medibridge-2-v53u.onrender.com/api/auth/me \
  -H "Authorization: Bearer <token>"
```

### Response format

Success:

```json
{ "success": true, "data": { }, "message": "optional" }
```

Error:

```json
{ "success": false, "message": "...", "errors": { "field": "message" } }
```

| Status | Meaning |
|--------|---------|
| 200 / 201 | OK / Created |
| 400 | Validation error |
| 401 | Not logged in, or bad or expired token |
| 403 | Logged in but not allowed (wrong role or not the owner) |
| 404 | Not found |
| 409 | Conflict (duplicate account, overlapping or already booked slot, invoice already paid) |
| 413 | File larger than 10 MB |

## Testing

```bash
npm test
```

The tests cover auth, validation, role rules, tracking stage progression, slot overlap and double booking, payments, and document upload, permissions and download.

> **Warning:** the database in `MONGO_URI_TEST` is dropped on every run. Never point it at real data.

## Deployment (Render + MongoDB Atlas)

1. Push the project to GitHub and create a **Web Service** on Render for the repo.
2. Use these settings:

   | Setting | Value |
   |---------|-------|
   | Branch | `backend` |
   | Runtime / Language | `Node` |
   | Root Directory | `medibridge-backend` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |

3. Add these environment variables in Render: `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL` (your frontend URL), and `NODE_ENV=production`. Do not set `PORT`, because Render provides it.
4. In MongoDB Atlas, allow Render to connect under **Network Access** (for example `0.0.0.0/0`).
5. Deploy, then open `/api/health` to confirm the service is running.

To create the demo accounts on the hosted database, run `npm run seed` once on your own computer with `MONGO_URI` in your `.env` pointing to the Atlas database.

### Note on file uploads

Uploaded documents are stored on the server's disk (`UPLOAD_DIR`). Most free hosts erase this disk on every redeploy, so files will be lost. For production, move storage to a cloud service such as S3, Cloudinary or GridFS. Only `middleware/upload.js` and `controllers/documentController.js` need to change.

## Roles and permissions

| Capability | Patient | Doctor | Anonymous |
|------------|:------:|:------:|:---------:|
| Browse hospitals | ✔ | ✔ | ✔ |
| Send emergency request | ✔ | ✔ | ✔ |
| View public tracking link | ✔ | ✔ | ✔ |
| View own cases | ✔ | | |
| View all cases and acknowledge readiness | | ✔ | |
| Create and delete own slots | | ✔ | |
| Book and cancel slots | ✔ | | |
| Pay invoices | ✔ | | |
| Upload and delete own documents | ✔ | | |
| View all patients' documents (read-only) | | ✔ | |

## License

This project is private and was built as a group project.
