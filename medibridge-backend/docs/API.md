# MediBridge API Documentation

Base URL (local): `http://localhost:5000/api`
Format: JSON (`Content-Type: application/json`), except document upload (`multipart/form-data`).

> **Added after this document was written:** ambulances, live tracking stream, consent and audit endpoints are listed in
> the README section "What is new". `role` may now also be `driver`. Documents are stored in MongoDB (GridFS).

## Quick reference – the original 31 endpoints

| # | Method | URL | Auth | Purpose |
|---|--------|-----|------|---------|
| 1 | GET | `/api/health` | Public | Server health check |
| **Auth** | | | | |
| 2 | POST | `/api/auth/register` | Public | Create patient / doctor account |
| 3 | POST | `/api/auth/login` | Public | Login with email or phone |
| 4 | GET | `/api/auth/me` | Any login | Current user |
| **Hospitals** | | | | |
| 5 | GET | `/api/hospitals` | Public | Hospital finder (search, filter, sort) |
| 6 | GET | `/api/hospitals/best-match` | Public | Best hospital for a care type |
| 7 | GET | `/api/hospitals/:id` | Public | One hospital profile |
| **Emergency cases & tracking** | | | | |
| 8 | POST | `/api/cases` | Optional login | Send an emergency request |
| 9 | POST | `/api/cases/demo` | Optional login | Start a demo case |
| 10 | GET | `/api/cases` | Any login | Patient: own cases, Doctor: all cases |
| 11 | GET | `/api/cases/active` | Any login | Most recent case still in progress |
| 12 | GET | `/api/cases/:caseId/track` | Public | Live tracking view (no phone/symptoms) |
| 13 | GET | `/api/cases/:caseId` | Owner / Doctor | Full case details |
| 14 | POST | `/api/cases/:caseId/advance` | Owner / Doctor / anonymous case | "Advance step (demo)" |
| 15 | POST | `/api/cases/:caseId/restart` | Owner / Doctor / anonymous case | "Restart demo" |
| 16 | POST | `/api/cases/:caseId/acknowledge` | Doctor | "Acknowledge readiness" |
| **Appointment slots** | | | | |
| 17 | GET | `/api/slots` | Any login | Patient: upcoming slots, Doctor: own slots |
| 18 | POST | `/api/slots` | Doctor | Save a time slot |
| 19 | DELETE | `/api/slots/:id` | Doctor (owner) | Delete a slot |
| 20 | PATCH | `/api/slots/:id/book` | Patient | Book a slot |
| 21 | PATCH | `/api/slots/:id/cancel` | Patient (who booked) | Cancel appointment |
| **Payments (demo)** | | | | |
| 22 | GET | `/api/invoices` | Patient | My invoices |
| 23 | POST | `/api/invoices/:invoiceId/pay` | Patient | Pay an invoice (demo) |
| 24 | GET | `/api/invoices/:invoiceId/receipt` | Patient | Receipt of a paid invoice |
| **Documents & medical history** | | | | |
| 25 | POST | `/api/documents` | Patient | Upload a document / medical history |
| 26 | GET | `/api/documents` | Patient (own) / Doctor (all) | List documents (filters) |
| 27 | GET | `/api/documents/summary` | Patient | Has medical history? (prompt) |
| 28 | GET | `/api/documents/patients` | Doctor | Patients who uploaded files |
| 29 | GET | `/api/documents/:id` | Owner / Doctor | Document details |
| 30 | GET | `/api/documents/:id/file` | Owner / Doctor | View / download the file |
| 31 | DELETE | `/api/documents/:id` | Patient (owner) | Delete a document |

**Auth header** for protected routes: `Authorization: Bearer <token>` (token comes from register/login, valid 7 days).

## Response format

Success: `{ "success": true, "data": { ... }, "message": "optional" }` (lists also have `"count"`).
Error: `{ "success": false, "message": "...", "errors": { "field": "message" } }` (`errors` only for validation).

| Status | Meaning |
|--------|---------|
| 200 / 201 | OK / Created |
| 400 | Validation error (see `errors`) |
| 401 | Not logged in / bad or expired token / wrong password |
| 403 | Logged in but not allowed (wrong role or not the owner) |
| 404 | Not found |
| 409 | Conflict (duplicate account, slot overlap, slot already booked, invoice already paid) |
| 413 | File larger than 10 MB |

---

## 1. Health

### GET `/api/health`
```json
{ "success": true, "status": "ok", "service": "medibridge-api", "time": "2026-10-13T06:40:35.132Z" }
```

## 2. Auth

### POST `/api/auth/register`
| Field | Rules |
|-------|-------|
| `role` | `patient` or `doctor` |
| `name` | min 2 chars |
| `email` | valid email, unique |
| `phone` | 10-digit Indian mobile (starts 6-9), unique |
| `password` | min 6 chars |
| `confirmPassword` | optional, must equal `password` |
| `spec` | optional, doctors only (speciality) |

```json
{ "role": "patient", "name": "Rajesh Sharma", "email": "rajesh@mail.com", "phone": "9876543210", "password": "secret1", "confirmPassword": "secret1" }
```
`201` → `{ "success": true, "data": { "token": "<jwt>", "user": { "id": "...", "role": "patient", "name": "...", "email": "...", "phone": "...", "spec": "" } } }`
Errors: `400` validation, `409` "An account with this email or phone already exists." New patients automatically get the 2 sample invoices.

### POST `/api/auth/login`
```json
{ "identifier": "patient@demo.test", "password": "demo1234", "role": "patient" }
```
`identifier` = email **or** phone. `role` is optional but, if sent, must match the account.
`200` → same shape as register. `401` wrong credentials. `403` "This account is registered as a patient. Switch the role above."

### GET `/api/auth/me`
`200` → `{ "success": true, "data": { "user": { ... } } }`

## 3. Hospitals

### GET `/api/hospitals`
Query (all optional): `care` = `Emergency|Cardiac|Trauma|Maternity|All`, `q` = text in name/area, `sort` = `eta` (default) | `km` | `icu`. Saturated hospitals are always listed last.
Example: `/api/hospitals?care=Cardiac&q=sector&sort=icu`
```json
{ "success": true, "count": 2, "data": { "hospitals": [
  { "id": "H1", "name": "Riverside Heart Institute", "area": "Sector 12", "km": 3.2, "eta": 9, "icu": 3, "vent": 2,
    "load": "Low", "care": ["Emergency", "Cardiac"], "src": "Verified", "x": 270, "y": 80 } ] } }
```

### GET `/api/hospitals/best-match?care=Cardiac`
Fastest-ETA hospital offering that care that is not Saturated. `data.hospital` = one hospital. `400` for an invalid `care`.

### GET `/api/hospitals/:id`
e.g. `/api/hospitals/H3` → `data.hospital`. `404` if unknown.

## 4. Emergency cases & live tracking

### POST `/api/cases`  (login optional)
Create an emergency request (the 4-step form). If a **patient** is logged in, the case belongs to them and a Pending ambulance invoice (₹1500) is created.

| Field | Rules |
|-------|-------|
| `name` | min 2 chars |
| `age` | 0–120 |
| `sex` | `Male` / `Female` / `Other` |
| `phone` | 10-digit Indian mobile |
| `rel` | `Self` (default) / `Spouse` / `Child` / `Parent` / `Good Samaritan` |
| `care` | `Emergency` / `Cardiac` / `Trauma` / `Maternity` |
| `sev` | `P1` / `P2` / `P3` |
| `symptoms` | optional |
| `hospital` | `"auto"` (best match, default) or a hospital id like `H3` |
| `address` | min 5 chars |
| `landmark` | optional |
| `gps` | optional `{ "lat": 28.61, "lng": 77.2 }` |
| `consent` | must be `true` |

`201` → `data.case` (see **Case object** below), `message: "Request sent. Case CB-2041 created."`

### POST `/api/cases/demo`
No body. Creates the "Demo Patient" P1 case → `201` `data.case`.

### GET `/api/cases`  (login)
Patient: own cases. Doctor: all cases. Newest first. → `{ count, data: { cases: [Case, ...] } }`

### GET `/api/cases/active`  (login)
→ `data.case` = most recent case with stage < 6 (or `null`). Used by "Active emergency coordination".

### GET `/api/cases/:caseId/track`  (public)
Same as the Case object but **without** phone, symptoms, landmark, GPS and relationship. Safe for the "Share live link" page. Calling it also moves the simulation forward (one stage every 6 seconds). `404` if the case id is unknown.

### GET `/api/cases/:caseId`  (owner or doctor)
Full Case object. `401` not logged in, `403` someone else's case.

### POST `/api/cases/:caseId/advance`  /  `restart`
Demo buttons "Advance step" and "Restart demo". Allowed for the owner, any doctor, or anyone if the case was sent without login. `403` otherwise. → `data.case`.

### POST `/api/cases/:caseId/acknowledge`  (doctor)
Marks readiness acknowledged. → `data.case` with `acknowledgedAt`. `403` for patients.

**Case object**
```json
{
  "id": "6acd...", "caseId": "CB-2041",
  "patient": { "name": "Rajesh Verma", "age": 58, "sex": "Male", "phone": "9876543210" },
  "care": "Cardiac", "sev": "P1", "pickupAddress": "12 Test Street, Delhi",
  "hospital": { "id": "H2", "name": "City General Hospital", "area": "Central Market Road", "km": 1.8, "eta": 7 },
  "stage": 2, "stageLabel": "Stage 3 of 6", "stageProgress": 0.42,
  "status": { "label": "In transit", "badge": "estimated" },
  "etaMinutes": 15, "liveStatus": "Ambulance heading to the patient",
  "corridor": "Green corridor active", "hospitalStatus": "Accepted",
  "timeline": [ { "step": 1, "title": "Request received", "detail": "...", "state": "done", "at": "2026-10-13T06:40:35Z" }, "... 6 steps, state = done | now | future" ],
  "relationship": "Self", "symptoms": "chest pain", "landmark": "", "gps": null, "acknowledgedAt": null,
  "isDemo": false, "createdAt": "..."
}
```
`phone`, `relationship`, `symptoms`, `landmark`, `gps`, `acknowledgedAt` appear only in the full view.
Stages: 1 Request received → 2 Hospital confirmed → 3 Ambulance assigned → 4 Pickup done → 5 On the way to hospital → 6 Arrived at hospital. The frontend should poll `/track` every 1–2 seconds and use `stageProgress` (0–1) to move the ambulance marker.

## 5. Appointment slots

### GET `/api/slots`  (login)
Patient: all upcoming slots of all doctors (`?doctorId=` to filter). Doctor: their own slots. Sorted by date and time.
```json
{ "success": true, "count": 1, "data": { "slots": [
  { "id": "...", "doctor": "Dr. S. K. Roy", "doctorId": "...", "date": "2026-10-14", "from": "10:00", "to": "10:30",
    "note": "General consultation", "status": "free" } ] } }
```
`status`: `free`, `mine` (booked by you), `taken` (booked by someone else – name hidden). Doctors see `booked` and `bookedBy`.

### POST `/api/slots`  (doctor)
```json
{ "date": "2026-10-20", "from": "10:00", "to": "10:30", "note": "Follow-up" }
```
`date` = `YYYY-MM-DD` not in the past, `from`/`to` = `HH:MM` (24h) with `to` after `from`. `409` if it overlaps one of the doctor's slots. `201` → `data.slot`.

### DELETE `/api/slots/:id`  (doctor, own slots)
`200` `{ "message": "Slot deleted" }`. `403` for another doctor's slot, `404` if missing.

### PATCH `/api/slots/:id/book`  (patient)
Atomic: `409` "This slot has already been booked." if someone got it first. → `data.slot` with `status: "mine"`.

### PATCH `/api/slots/:id/cancel`  (patient)
Only the patient who booked it (`403` otherwise). → `data.slot` with `status: "free"`.

## 6. Payments (demo – no real money)

### GET `/api/invoices`  (patient)
```json
{ "success": true, "count": 2, "data": { "invoices": [
  { "id": "...", "invoiceId": "INV-1001", "service": "Teleconsultation", "amount": 500, "status": "Pending", "method": "", "paidAt": null } ] } }
```

### POST `/api/invoices/:invoiceId/pay`  (patient)
```json
{ "method": "UPI" }
```
`method` = `UPI` (default) / `Card` / `Pay at hospital`. → `data.invoice` with `status: "Paid"`. `409` already paid, `403` not your invoice.

### GET `/api/invoices/:invoiceId/receipt`  (patient)
→ `data.receipt` `{ invoiceId, service, amount, method, status, paidAt, note }`. `400` if not paid yet.

## 7. Documents & medical history

Allowed files: **PDF, PNG, JPG, JPEG, WEBP, DOC, DOCX, TXT**, max **10 MB**. Categories: `Medical History`, `Lab Report`, `Prescription`, `Imaging / Scan`, `Discharge Summary`, `Insurance`, `ID Proof`, `Other`.
Patients only access their own files. **Doctors can view/download every patient's files (read-only).** Files are kept in a private folder and are only served through the authenticated endpoint below (never a public URL).

### POST `/api/documents`  (patient) – `multipart/form-data`
| Field | |
|-------|--|
| `file` | required |
| `category` | one of the categories (default `Other`) |
| `title` | optional (defaults to the file name) |
| `note` | optional note for the doctor |

```bash
curl -X POST http://localhost:5000/api/documents -H "Authorization: Bearer $TOKEN" \
  -F "category=Medical History" -F "title=Discharge summary" -F "file=@history.pdf"
```
`201` → `data.document`:
```json
{ "id": "...", "owner": "...", "ownerName": "Rajesh Sharma", "category": "Medical History", "title": "Discharge summary",
  "fileName": "history.pdf", "mimeType": "application/pdf", "size": 48211, "note": "", "createdAt": "..." }
```
`400` missing file / bad type / bad category, `403` doctor, `413` too large.

### GET `/api/documents`  (login)
Query (all optional): `category`, `q` (search title / file name / patient name / note), and for doctors `patientId`.
→ `{ count, data: { documents: [...] } }` newest first.

### GET `/api/documents/summary`  (patient)
→ `{ "data": { "total": 2, "hasMedicalHistory": true } }` – drives the "Please upload your medical history document" prompt.

### GET `/api/documents/patients`  (doctor)
→ `{ "data": { "patients": [ { "id": "...", "name": "Rajesh Sharma", "email": "...", "documents": 2, "hasMedicalHistory": true } ] } }` – fills the doctor's patient filter (and shows "no history").

### GET `/api/documents/:id`  (owner or doctor)
→ `data.document`. `403` for another patient, `404` if missing.

### GET `/api/documents/:id/file`  (owner or doctor)
Streams the file. Add `?download=1` to force a download (otherwise it opens inline for preview). The request must send the `Authorization` header, so in the frontend fetch it as a blob:
```js
const res = await fetch(`${API}/documents/${id}/file`, { headers: { Authorization: `Bearer ${token}` } });
const url = URL.createObjectURL(await res.blob());   // use in <img>, <iframe>, or an <a download>
```

### DELETE `/api/documents/:id`  (patient, owner only)
Deletes the record and the file. `403` for doctors and other patients.

---

## Frontend ↔ API mapping (what replaces `localStorage`)

| Frontend (localStorage) | API |
|---|---|
| `mb_users`, `mb_session` | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` + JWT in memory/`localStorage` |
| `HOSP` constant | `GET /hospitals`, `GET /hospitals/:id`, `GET /hospitals/best-match` |
| `mb_cases`, `mb_active`, request form | `POST /cases`, `GET /cases`, `GET /cases/active`, `GET /cases/:caseId/track` |
| tracking "Advance / Restart / demo" | `POST /cases/:caseId/advance`, `/restart`, `POST /cases/demo` |
| doctor "Acknowledge readiness" | `POST /cases/:caseId/acknowledge` |
| `mb_slots` | `GET/POST /slots`, `DELETE /slots/:id`, `PATCH /slots/:id/book`, `/cancel` |
| `mb_inv` | `GET /invoices`, `POST /invoices/:invoiceId/pay`, `GET /invoices/:invoiceId/receipt` |
| `mb_docs` + IndexedDB files | `POST/GET /documents`, `GET /documents/:id/file`, `DELETE /documents/:id` |
