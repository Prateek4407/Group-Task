# MediBridge backend

Production Express/MongoDB API for MediBridge. It stores users, hospital directory records, emergency cases, ambulance assignments and GPS positions, appointment slots, invoices, medical documents, consent, and audit history in MongoDB.

## Production deployment

- Repository: `Prateek4407/MediBridge`
- Branch: `backend-integration` while this release is being verified; production remains `backend`
- Render root directory: `medibridge-backend`
- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/api/health`

Required environment variables:

```text
MONGO_URI
JWT_SECRET
NODE_ENV=production
CLIENT_URL=https://YOUR-FRONTEND.vercel.app
```

Optional settings are `PORT`, `JWT_EXPIRES_IN`, `AUTH_COOKIE_NAME`, and `AUTH_COOKIE_DAYS`. Production startup fails when any required secret or origin is missing. Do not commit `.env`.

Run locally with an explicitly configured `.env`:

```powershell
npm ci
npm run seed
npm run dev
```

`npm run seed` initializes the hospital directory only. The server never creates users, ambulances, cases, invoices, or other sample operational records.

## Authentication and security

Registration and login set a `Secure`, `HttpOnly`, `SameSite=None` cookie. Protected endpoints read only that cookie; bearer tokens are not accepted. Browser clients must send `credentials: 'include'`. Logout clears the cookie.

Public self-registration is limited to patients. Doctor and driver accounts must be provisioned by an authorized database operator. State-changing browser requests are restricted to the exact origins in `CLIENT_URL`, and CORS is enabled with credentials.

## Operational behavior

- Ambulances are explicit MongoDB records; none are created at server startup.
- A doctor acknowledges an emergency case and dispatches an available ambulance atomically.
- Only the assigned driver or a doctor can move an assigned case through its real workflow.
- Driver GPS updates are stored and returned as-is. The API does not synthesize movement or timed case progress.
- Medical documents are stored in MongoDB GridFS with consent and audit controls.
- Emergency requests create pending invoice records. No payment endpoint is exposed until a real payment provider is connected.

See [docs/API.md](docs/API.md) for the endpoint contract.
