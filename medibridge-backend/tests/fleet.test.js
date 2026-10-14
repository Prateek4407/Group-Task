/* Ambulance fleet, live location, consent and audit history. Real Express app + real MongoDB (MONGO_URI_TEST). */
const os = require('os'), path = require('path'), fs = require('fs');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-uploads-'));
process.env.STAGE_STEP_MS = '600000';          // 10 min: stages only move when the test advances them

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const { seedHospitals } = require('../src/utils/seed');
const Ambulance = require('../src/models/Ambulance');

const api = () => request(app);
let n = 0;
const phone = () => '9' + String(200000000 + ++n);
const auth = (t) => ({ Authorization: 'Bearer ' + t });
async function register(role, extra = {}) {
  const body = { role, name: role === 'doctor' ? 'Dr. Fleet' : role === 'driver' ? 'Driver Dev' : 'Fleet Patient', email: `f${++n}@t.test`, phone: phone(), password: 'secret1', ...extra };
  const res = await api().post('/api/auth/register').send(body);
  expect(res.status).toBe(201);
  return { token: res.body.data.token, user: res.body.data.user, body };
}
const caseBody = (o = {}) => ({ name: 'Rajesh Verma', age: 58, sex: 'Male', phone: '9876543210', rel: 'Self', care: 'Cardiac', sev: 'P1', symptoms: 'chest pain', address: '12 Test Street, Delhi', hospital: 'H1', consent: true, ...o });
const amb = (o = {}) => ({ registration: 'DL1CT' + String(1000 + ++n), hospital: 'H1', type: 'ALS', driverName: 'Test Driver', equipment: 'Defibrillator, Oxygen', ...o });

let patient, patient2, doctor, driver;

beforeAll(async () => {
  await connectDB(process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/medibridge_test');
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map(m => m.init()));
  await seedHospitals();
  patient = await register('patient'); patient2 = await register('patient');
  doctor = await register('doctor', { spec: 'Cardiology' }); driver = await register('driver');
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

describe('Driver role', () => {
  test('a driver can register; the role is returned', () => { expect(driver.user.role).toBe('driver'); });
  test('drivers have no patient/doctor pages', async () => {
    expect((await api().get('/api/ambulances').set(auth(driver.token))).status).toBe(403);
    expect((await api().post('/api/documents').set(auth(driver.token))).status).toBe(403);
  });
});

describe('Ambulance management', () => {
  let a1;
  test('availability is public and starts at zero', async () => {
    const r = await api().get('/api/ambulances/availability'); expect(r.status).toBe(200);
    expect(r.body.data.total).toBe(0); expect(r.body.data.available).toBe(0);
  });
  test('only doctors manage the fleet', async () => {
    expect((await api().get('/api/ambulances')).status).toBe(401);
    expect((await api().post('/api/ambulances').set(auth(patient.token)).send(amb())).status).toBe(403);
  });
  test('validation: vehicle number, hospital, type, status, driver phone', async () => {
    const r = await api().post('/api/ambulances').set(auth(doctor.token)).send({ registration: '#', hospital: 'H99', type: 'Boat', driverPhone: '12' });
    expect(r.status).toBe(400); expect(Object.keys(r.body.errors)).toEqual(expect.arrayContaining(['registration', 'hospital', 'type', 'driverPhone']));
  });
  test('doctor adds an ambulance; it starts parked at the base hospital', async () => {
    const r = await api().post('/api/ambulances').set(auth(doctor.token)).send(amb({ driverEmail: driver.body.email }));
    expect(r.status).toBe(201); a1 = r.body.data.ambulance;
    expect(a1.status).toBe('available'); expect(a1.equipment).toEqual(['Defibrillator', 'Oxygen']);
    expect(a1.location.source).toBe('base'); expect(a1.location.lat).toBeCloseTo(28.5985, 3);
  });
  test('duplicate vehicle number -> 409; unknown driver email -> 400', async () => {
    expect((await api().post('/api/ambulances').set(auth(doctor.token)).send(amb({ registration: a1.registration }))).status).toBe(409);
    expect((await api().post('/api/ambulances').set(auth(doctor.token)).send(amb({ driverEmail: 'nobody@t.test' }))).status).toBe(400);
  });
  test('availability and hospital finder now show the ambulance count', async () => {
    const av = await api().get('/api/ambulances/availability'); expect(av.body.data.byHospital.H1).toMatchObject({ total: 1, available: 1 });
    const h = await api().get('/api/hospitals/H1'); expect(h.body.data.hospital.ambulances).toMatchObject({ total: 1, available: 1 });
    const list = await api().get('/api/hospitals'); expect(list.body.data.hospitals.find(x => x.id === 'H2').ambulances.total).toBe(0);
  });
  test('status can be set to offline / available; "assigned" cannot be set by hand', async () => {
    expect((await api().patch(`/api/ambulances/${a1.id}`).set(auth(doctor.token)).send({ status: 'maintenance' })).body.data.ambulance.status).toBe('maintenance');
    expect((await api().get('/api/ambulances/availability')).body.data.available).toBe(0);
    expect((await api().patch(`/api/ambulances/${a1.id}`).set(auth(doctor.token)).send({ status: 'assigned' })).status).toBe(400);
    expect((await api().patch(`/api/ambulances/${a1.id}`).set(auth(doctor.token)).send({ status: 'available' })).status).toBe(200);
  });
  test('driver sees own ambulance and sends GPS; strangers cannot', async () => {
    expect((await api().get('/api/ambulances/mine').set(auth(driver.token))).body.data.ambulance.registration).toBe(a1.registration);
    const r = await api().patch('/api/ambulances/mine/location').set(auth(driver.token)).send({ lat: 28.61, lng: 77.35 });
    expect(r.status).toBe(200); expect(r.body.data.ambulance.location.source).toBe('gps');
    expect((await api().patch('/api/ambulances/mine/location').set(auth(driver.token)).send({ lat: 999, lng: 0 })).status).toBe(400);
    const other = await register('driver');
    expect((await api().patch('/api/ambulances/mine/location').set(auth(other.token)).send({ lat: 28.6, lng: 77.3 })).status).toBe(404);
    expect((await api().patch(`/api/ambulances/${a1.id}/location`).set(auth(other.token)).send({ lat: 28.6, lng: 77.3 })).status).toBe(403);
  });
});

describe('Dispatch: nearest ambulance is assigned and released', () => {
  let c1, c2, a2;
  beforeAll(async () => {
    await Ambulance.updateMany({}, { $set: { status: 'available', assignedCase: null, 'location.source': 'base' } });   // forget GPS sent in earlier tests
    const r = await api().post('/api/ambulances').set(auth(doctor.token)).send(amb({ hospital: 'H2' })); a2 = r.body.data.ambulance;
    await Ambulance.updateOne({ _id: a2.id }, { $set: { status: 'offline' } });          // only the H1 ambulance is free
  });
  const go = (c, t) => api().post(`/api/cases/${c.caseId}/advance`).set(auth(t));

  test('no ambulance before the hospital confirms', async () => {
    const r = await api().post('/api/cases').set(auth(patient.token)).send(caseBody()); c1 = r.body.data.case;
    expect(r.status).toBe(201); expect(c1.ambulance).toBeNull();
  });
  test('moving to "Ambulance assigned" claims the free ambulance', async () => {
    await go(c1, patient.token);                                                        // stage 1
    const r = await go(c1, patient.token);                                              // stage 2
    expect(r.status).toBe(200); const cs = r.body.data.case;
    expect(cs.stage).toBe(2); expect(cs.ambulance.registration).toBeTruthy(); expect(cs.ambulance.driverName).toBeTruthy();
    expect(cs.ambulance.position.source).toBe('simulated');
    expect((await api().get('/api/ambulances/availability')).body.data.available).toBe(0);
  });
  test('public tracking shows the vehicle but not the driver\'s phone', async () => {
    const r = await api().get(`/api/cases/${c1.caseId}/track`); const a = r.body.data.case.ambulance;
    expect(a.registration).toBeTruthy(); expect(a.type).toBe('ALS'); expect(a.driverPhone).toBeUndefined(); expect(a.driverName).toBeUndefined();
  });
  test('real GPS from the driver replaces the simulated position', async () => {
    await api().patch('/api/ambulances/mine/location').set(auth(driver.token)).send({ lat: 28.60, lng: 77.34 });
    const a = (await api().get(`/api/cases/${c1.caseId}/track`)).body.data.case.ambulance;
    expect(a.position.source).toBe('live'); expect(a.position.lat).toBeCloseTo(28.60, 4);
  });
  test('a second case waits when every ambulance is busy', async () => {
    const r = await api().post('/api/cases').set(auth(patient2.token)).send(caseBody()); c2 = r.body.data.case;
    await go(c2, patient2.token);
    const blocked = await go(c2, patient2.token);
    expect(blocked.status).toBe(409); expect(blocked.body.message).toMatch(/No ambulance is free/);
  });
  test('finishing the first case frees the ambulance, then the second can continue', async () => {
    for (let i = 0; i < 3; i++) await go(c1, patient.token);                            // stages 3, 4, 5
    expect((await api().get(`/api/cases/${c1.caseId}/track`)).body.data.case.stage).toBe(5);
    expect((await api().get('/api/ambulances/availability')).body.data.available).toBe(1);
    const again = await go(c2, patient2.token);
    expect(again.status).toBe(200); expect(again.body.data.case.ambulance.registration).toBeTruthy();
  });
  test('restart gives the ambulance back', async () => {
    const r = await api().post(`/api/cases/${c2.caseId}/restart`).set(auth(patient2.token));
    expect(r.body.data.case.ambulance).toBeNull(); expect(r.body.data.case.stage).toBe(0);
    expect((await api().get('/api/ambulances/availability')).body.data.available).toBe(1);
  });
  test('an ambulance on a case cannot be removed', async () => {
    await go(c2, patient2.token); await go(c2, patient2.token);
    const list = await api().get('/api/ambulances?status=assigned').set(auth(doctor.token));
    expect(list.body.count).toBe(1);
    expect((await api().delete(`/api/ambulances/${list.body.data.ambulances[0].id}`).set(auth(doctor.token))).status).toBe(409);
  });
});

describe('Consent and audit history', () => {
  let doc;
  const up = (token) => api().post('/api/documents').set(auth(token)).field('category', 'Lab Report').attach('file', Buffer.from('Hb 13.2 g/dL'), 'lab.txt');
  const events = async (t, q = '') => (await api().get('/api/audit' + q).set(auth(t))).body.data.events;

  test('first upload writes an explicit consent grant and an upload audit entry', async () => {
    const r = await up(patient.token); expect(r.status).toBe(201); doc = r.body.data.document;
    const c = await api().get('/api/consent').set(auth(patient.token));
    expect(c.body.data.documents.granted).toBe(true); expect(c.body.data.history.some(h => h.scope === 'documents' && h.granted)).toBe(true);
    expect((await events(patient.token)).some(e => e.action === 'document.upload' && e.targetLabel === 'lab.txt')).toBe(true);
  });
  test('sending an emergency request while logged in records emergency-case consent', async () => {
    const c = await api().get('/api/consent').set(auth(patient.token));
    expect(c.body.data.history.some(h => h.scope === 'emergency-case' && h.caseId)).toBe(true);
  });
  test('every view and download by a doctor is visible to the patient', async () => {
    await api().get(`/api/documents/${doc.id}/file`).set(auth(doctor.token));
    await api().get(`/api/documents/${doc.id}/file?download=1`).set(auth(doctor.token));
    const ev = await events(patient.token);
    const view = ev.find(e => e.action === 'document.view'), dl = ev.find(e => e.action === 'document.download');
    expect(view.actorRole).toBe('doctor'); expect(view.actorName).toBe('Dr. Fleet'); expect(dl.targetLabel).toBe('lab.txt');
  });
  test('another patient cannot read this log; the doctor only sees own activity', async () => {
    expect((await events(patient2.token)).some(e => e.targetLabel === 'lab.txt')).toBe(false);
    const mine = await events(doctor.token); expect(mine.length).toBeGreaterThanOrEqual(2); expect(mine.every(e => e.actorName === 'Dr. Fleet')).toBe(true);
    expect((await api().get('/api/audit').set(auth(driver.token))).status).toBe(403);
  });
  test('withdrawing consent hides the documents from doctors and logs the attempt', async () => {
    const w = await api().post('/api/consent').set(auth(patient.token)).send({ granted: false });
    expect(w.status).toBe(200); expect(w.body.data.documents.granted).toBe(false);
    expect((await api().get(`/api/documents/${doc.id}/file`).set(auth(doctor.token))).status).toBe(403);
    expect((await api().get(`/api/documents/${doc.id}`).set(auth(doctor.token))).status).toBe(403);
    const list = await api().get('/api/documents').set(auth(doctor.token)); expect(list.body.data.documents.some(d => d.id === doc.id)).toBe(false);
    const pats = await api().get('/api/documents/patients').set(auth(doctor.token)); expect(pats.body.data.patients.some(p => p.id === patient.user.id)).toBe(false);
    const ev = await events(patient.token);
    expect(ev.some(e => e.action === 'consent.withdraw')).toBe(true); expect(ev.some(e => e.action === 'document.denied')).toBe(true);
  });
  test('the patient still has full access to their own file while consent is withdrawn', async () => {
    expect((await api().get(`/api/documents/${doc.id}/file`).set(auth(patient.token))).status).toBe(200);
  });
  test('granting again restores doctor access; repeating the same choice adds no duplicate', async () => {
    await api().post('/api/consent').set(auth(patient.token)).send({ granted: true });
    const before = (await api().get('/api/consent').set(auth(patient.token))).body.data.history.length;
    await api().post('/api/consent').set(auth(patient.token)).send({ granted: true });
    expect((await api().get('/api/consent').set(auth(patient.token))).body.data.history.length).toBe(before);
    expect((await api().get(`/api/documents/${doc.id}/file`).set(auth(doctor.token))).status).toBe(200);
  });
  test('consent endpoints are patient-only and validate input', async () => {
    expect((await api().post('/api/consent').set(auth(doctor.token)).send({ granted: false })).status).toBe(403);
    expect((await api().post('/api/consent').set(auth(patient.token)).send({ granted: 'no' })).status).toBe(400);
    expect((await api().get('/api/consent')).status).toBe(401);
  });
  test('audit entries cannot be changed through the API', async () => {
    const ev = await events(patient.token);
    expect((await api().delete('/api/audit/' + ev[0].id).set(auth(patient.token))).status).toBe(404);
  });
});
