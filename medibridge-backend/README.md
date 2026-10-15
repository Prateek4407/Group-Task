# MediBridge backend

Production Express/MongoDB API for MediBridge. It stores users, hospital directory records, emergency cases, ambulance assignments and GPS positions, appointment slots, invoices, medical documents, consent, and audit history in MongoDB.

## Production deployment

- Repository: `Prateek4407/MediBridge`
- Production branch: `backend`
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

Patients receive a session immediately after registration. Doctors and drivers may submit a registration, but remain pending and receive no session until an administrator approves them. Rejected or revoked staff cannot log in, and protected requests re-check the current database status so an existing cookie stops working immediately after revocation. Administrator accounts are never publicly registrable.

Create the first administrator once with environment variables and the private provisioning command:

```powershell
$env:ADMIN_NAME='Platform Administrator'
$env:ADMIN_EMAIL='admin@example.com'
$env:ADMIN_PHONE='9000000000'
$env:ADMIN_PASSWORD='<strong one-time password>'
npm run provision:admin
```

The command uses the normal `User` password hashing hook, never prints the password, refuses to overwrite an account, and refuses to create a second administrator. Remove the one-time environment values after provisioning. State-changing browser requests are restricted to the exact origins in `CLIENT_URL`, and CORS is enabled with credentials.

The current MediBridge Vercel Preview and production aliases are also listed explicitly in `src/config/env.js`. Preview access never uses a wildcard origin.

## Operational behavior

- Ambulances are explicit MongoDB records; none are created at server startup.
- Only approved drivers can be linked to an ambulance.
- A doctor acknowledges an emergency case and dispatches an available ambulance atomically.
- Only the assigned driver or a doctor can move an assigned case through its real workflow.
- Driver GPS updates are stored and returned as-is. The API does not synthesize movement or timed case progress.
- Medical documents are stored in MongoDB GridFS with consent and audit controls.
- Emergency requests create pending invoice records. No payment endpoint is exposed until a real payment provider is connected.

See [docs/API.md](docs/API.md) for the endpoint contract.
