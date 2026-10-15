# MediBridge API contract

Production base URL: `https://medibridge-3-icg4.onrender.com/api`

JSON responses use `{ success, data, message? }`. Errors use `{ success: false, message, errors? }`.

## Authentication

The server sets the `medibridge_auth` cookie on registration and login. It is `HttpOnly`, `Secure`, and `SameSite=None`. Frontend requests must use `credentials: 'include'`; JavaScript never reads a token.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Create an active patient session or a pending doctor/driver request |
| POST | `/auth/login` | Public | Start session |
| POST | `/auth/logout` | Public | Clear session cookie |
| GET | `/auth/me` | Authenticated | Restore current user |

Public registration always rejects the `admin` role. A doctor or driver registration returns `pending: true` and no cookie. Pending, rejected, and revoked staff cannot authenticate; legacy staff records without a status remain active.

## Staff administration

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/admin/users` | Administrator | List doctor/driver accounts and pending/active/rejected counts |
| PATCH | `/admin/users/:id/status` | Administrator | Approve, reject, or revoke a doctor/driver account |

The first administrator is created privately with `npm run provision:admin`. Administrator actions cannot target patients or other administrators and are recorded in the audit collection.

## Hospitals and ambulances

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/hospitals` | Public | List persisted hospitals |
| GET | `/hospitals/best-match` | Public | Find a hospital by care and live fleet availability |
| GET | `/hospitals/:id` | Public | Read hospital |
| GET | `/ambulances/availability` | Public | Aggregate live fleet availability |
| GET | `/ambulances` | Doctor | List fleet records |
| POST | `/ambulances` | Doctor | Create ambulance; linked driver must be approved |
| PATCH | `/ambulances/:id` | Doctor | Update ambulance |
| DELETE | `/ambulances/:id` | Doctor | Remove an unassigned ambulance |
| GET | `/ambulances/mine` | Driver | Read linked ambulance |
| PATCH | `/ambulances/mine/location` | Driver | Store GPS position |
| PATCH | `/ambulances/mine/status` | Driver | Set available/offline status |

## Emergency cases and tracking

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/cases` | Optional session | Create emergency request |
| GET | `/cases` | Authenticated | Patient own, doctor all, driver assigned cases |
| GET | `/cases/active` | Authenticated | Most recent active accessible case |
| GET | `/cases/:caseId` | Owner, doctor, linked driver | Full case |
| GET | `/cases/:caseId/track` | Public | Privacy-limited current tracking data |
| GET | `/cases/:caseId/stream` | Public | Server-sent tracking updates |
| POST | `/cases/:caseId/acknowledge` | Doctor | Confirm hospital readiness and attempt dispatch |
| POST | `/cases/:caseId/advance` | Doctor or linked driver | Apply one real workflow transition |

Tracking reads never advance a case. Ambulance locations come only from persisted base, manual, or GPS records.

## Slots, invoices, documents, consent and audit

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET/POST | `/slots` | Authenticated | List slots / doctor creates slot |
| PATCH | `/slots/:id/book` | Patient | Book free slot |
| PATCH | `/slots/:id/cancel` | Patient | Cancel own booking |
| DELETE | `/slots/:id` | Owning doctor | Delete slot |
| GET | `/invoices` | Patient | List own persisted invoices |
| GET | `/invoices/:invoiceId/receipt` | Patient owner | Read receipt for an already-paid invoice |
| GET/POST | `/documents` | Authenticated by role | List or upload documents |
| GET | `/documents/summary` | Patient | Own document summary |
| GET | `/documents/patients` | Doctor | Consenting patient directory |
| GET | `/documents/:id` | Authorized | Document metadata |
| GET | `/documents/:id/file` | Authorized | Stream GridFS file |
| DELETE | `/documents/:id` | Patient owner | Delete document and stored file |
| GET/POST | `/consent` | Patient | Read/update document consent |
| GET | `/audit` | Patient or doctor | Read permitted audit history |

No endpoint marks an invoice paid without a real payment provider.
