/* Staff approval integration tests: real Express app + isolated MONGO_URI_TEST. */
const os = require('os'), path = require('path'), fs = require('fs');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'approval-test-secret';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-approval-uploads-'));

const mongoose = require('mongoose');
const request = require('supertest');
const { createTestDatabase } = require('./testDatabase');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const { seedHospitals } = require('../src/utils/seed');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');

let mongo, n = 0;
const phone = () => '8' + String(400000000 + ++n);

/* Secure cookies are captured from a Supertest agent and replayed explicitly because
   Supertest exercises the Express app over an HTTP test transport. */
const browser = () => ({ agent: request.agent(app), cookie: '' });
const rememberCookie = (browserSession, response) => {
  const raw = response.headers['set-cookie'];
  if (raw?.length) browserSession.cookie = raw[0].split(';')[0];
  return response;
};
const withCookie = (browserSession, testRequest) => browserSession.cookie
  ? testRequest.set('Cookie', browserSession.cookie)
  : testRequest;
const get = (session, url) => withCookie(session, session.agent.get(url));
const patch = (session, url) => withCookie(session, session.agent.patch(url));

const staffBody = (role, extra = {}) => ({
  role,
  name: role === 'doctor' ? 'Dr. Approval' : 'Approval Driver',
  email: `approval${++n}@t.test`,
  phone: phone(),
  password: 'secret1',
  confirmPassword: 'secret1',
  ...(role === 'doctor' ? { spec: 'Emergency Medicine' } : {}),
  ...extra
});
const register = (session, body) => session.agent.post('/api/auth/register').send(body);
const login = async (session, body) => rememberCookie(session, await session.agent.post('/api/auth/login').send(body));
const setStatus = (id, status) => patch(adminSession, `/api/admin/users/${id}/status`).send({ status });

let adminSession, patientSession, patient, pendingDoctor, pendingDriver;

beforeAll(async () => {
  mongo = await createTestDatabase();
  await connectDB(mongo.uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  await seedHospitals();

  await User.create({
    role: 'admin', status: 'active', name: 'Approval Administrator',
    email: 'admin-approval@t.test', phone: '8000000001', password: 'admin-secret-1'
  });
  adminSession = browser();
  const adminLogin = await login(adminSession, { identifier: 'admin-approval@t.test', password: 'admin-secret-1', role: 'admin' });
  expect(adminLogin.status).toBe(200);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongo.stop();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

describe('Public registration and authentication status', () => {
  test('public administrator registration is rejected', async () => {
    const response = await register(browser(), staffBody('admin'));
    expect(response.status).toBe(400);
    expect(response.body.errors.role).toBeTruthy();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  test('patient registration remains active and cookie-authenticated', async () => {
    patientSession = browser();
    const body = staffBody('patient', { name: 'Approval Patient' });
    const response = rememberCookie(patientSession, await register(patientSession, body));
    patient = response.body.data.user;
    expect(response.status).toBe(201);
    expect(patient.status).toBe('active');
    expect(patientSession.cookie).toMatch(/^medibridge_auth=/);
    expect(response.body.data.token).toBeUndefined();
    expect((await get(patientSession, '/api/auth/me')).status).toBe(200);
  });

  test('doctor and driver registrations are pending and receive no cookie', async () => {
    const doctorResponse = await register(browser(), staffBody('doctor'));
    const driverResponse = await register(browser(), staffBody('driver'));
    pendingDoctor = doctorResponse.body.data.user;
    pendingDriver = driverResponse.body.data.user;
    for (const response of [doctorResponse, driverResponse]) {
      expect(response.status).toBe(201);
      expect(response.body.pending).toBe(true);
      expect(response.body.data.user.status).toBe('pending');
      expect(response.body.data.token).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  test('pending staff cannot log in', async () => {
    const session = browser();
    const response = await login(session, { identifier: pendingDoctor.email, password: 'secret1', role: 'doctor' });
    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/waiting for administrator approval/i);
    expect(session.cookie).toBe('');
  });
});

describe('Administrator authorization and decisions', () => {
  let doctorSession, driverSession;

  test('anonymous and patient accounts cannot use administrator endpoints', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    expect((await get(patientSession, '/api/admin/users')).status).toBe(403);
    expect((await patch(patientSession, `/api/admin/users/${pendingDoctor.id}/status`).send({ status: 'active' })).status).toBe(403);
  });

  test('administrator can list pending staff without hashes or secrets', async () => {
    const response = await get(adminSession, '/api/admin/users?status=pending');
    expect(response.status).toBe(200);
    expect(response.body.data.users.map((user) => user.id)).toEqual(expect.arrayContaining([pendingDoctor.id, pendingDriver.id]));
    expect(response.body.data.counts.pending).toBeGreaterThanOrEqual(2);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toMatch(/password|\$2[aby]\$/i);
    expect(response.body.data.users.every((user) => ['doctor', 'driver'].includes(user.role))).toBe(true);
  });

  test('administrator can approve doctor and driver accounts', async () => {
    expect((await setStatus(pendingDoctor.id, 'active')).status).toBe(200);
    expect((await setStatus(pendingDriver.id, 'active')).status).toBe(200);

    doctorSession = browser();
    driverSession = browser();
    expect((await login(doctorSession, { identifier: pendingDoctor.email, password: 'secret1', role: 'doctor' })).status).toBe(200);
    expect((await login(driverSession, { identifier: pendingDriver.email, password: 'secret1', role: 'driver' })).status).toBe(200);
    expect((await get(doctorSession, '/api/documents')).status).toBe(200);
  });

  test('active doctor and driver accounts still cannot use administrator endpoints', async () => {
    expect((await get(doctorSession, '/api/admin/users')).status).toBe(403);
    expect((await get(driverSession, '/api/admin/users')).status).toBe(403);
  });

  test('rejected staff cannot log in', async () => {
    const body = staffBody('doctor');
    const registration = await register(browser(), body);
    expect((await setStatus(registration.body.data.user.id, 'rejected')).status).toBe(200);
    const response = await login(browser(), { identifier: body.email, password: body.password, role: 'doctor' });
    expect(response.status).toBe(403);
  });

  test('revocation immediately blocks an existing cookie and future login', async () => {
    expect((await get(doctorSession, '/api/documents')).status).toBe(200);
    const revoked = await setStatus(pendingDoctor.id, 'rejected');
    expect(revoked.status).toBe(200);
    expect(revoked.body.message).toMatch(/revoked/i);
    expect((await get(doctorSession, '/api/documents')).status).toBe(403);
    expect((await login(browser(), { identifier: pendingDoctor.email, password: 'secret1', role: 'doctor' })).status).toBe(403);
  });

  test('admin actions only target staff and validate status', async () => {
    expect((await setStatus(patient.id, 'rejected')).status).toBe(404);
    expect((await setStatus(pendingDriver.id, 'banana')).status).toBe(400);
    expect((await setStatus('not-an-id', 'active')).status).toBe(404);
  });

  test('approval, rejection and revocation are recorded in the audit log', async () => {
    const actions = await AuditLog.distinct('action');
    expect(actions).toEqual(expect.arrayContaining(['staff.approve', 'staff.reject', 'staff.revoke']));
  });
});

describe('Legacy access and ambulance linking', () => {
  test('legacy staff without a status field remains active', async () => {
    const legacy = await User.create({
      role: 'doctor', name: 'Legacy Doctor', email: 'legacy-doctor@t.test', phone: '8000000002',
      password: 'legacy-secret', spec: 'Cardiology', status: 'active'
    });
    await User.collection.updateOne({ _id: legacy._id }, { $unset: { status: '' } });
    const session = browser();
    expect((await login(session, { identifier: legacy.email, password: 'legacy-secret', role: 'doctor' })).status).toBe(200);
    expect((await get(session, '/api/documents')).status).toBe(200);
    const active = await get(adminSession, '/api/admin/users?status=active');
    expect(active.body.data.users.find((user) => user.email === legacy.email).status).toBe('active');
  });

  test('only an active driver can be linked to an ambulance', async () => {
    const doctor = await User.create({
      role: 'doctor', status: 'active', name: 'Fleet Approver', email: 'fleet-approver@t.test',
      phone: '8000000003', password: 'fleet-secret', spec: 'Emergency Medicine'
    });
    const doctorSession = browser();
    expect((await login(doctorSession, { identifier: doctor.email, password: 'fleet-secret', role: 'doctor' })).status).toBe(200);

    const driverBody = staffBody('driver');
    const registration = await register(browser(), driverBody);
    const ambulance = { registration: 'DL1CAP9001', hospital: 'H1', type: 'ALS', driverEmail: driverBody.email };
    const blocked = await withCookie(doctorSession, doctorSession.agent.post('/api/ambulances')).send(ambulance);
    expect(blocked.status).toBe(400);
    expect(blocked.body.errors.driverEmail).toBeTruthy();

    expect((await setStatus(registration.body.data.user.id, 'active')).status).toBe(200);
    const created = await withCookie(doctorSession, doctorSession.agent.post('/api/ambulances')).send(ambulance);
    expect(created.status).toBe(201);
    expect(created.body.data.ambulance.driverUser.email).toBe(driverBody.email);
  });
});
