/* Integration tests: real Express app + real MongoDB-compatible database (MONGO_URI_TEST). */
const os = require('os'), path = require('path'), fs = require('fs');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-uploads-'));

const mongoose = require('mongoose');
const request = require('supertest');
const { createTestDatabase } = require('./testDatabase');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const { seedHospitals } = require('../src/utils/seed');
const User = require('../src/models/User');
/* documents now live in MongoDB (GridFS), not on disk */
const stored = () => mongoose.connection.db.collection('medicalDocuments.files').countDocuments();

const api = () => request(app);
let n = 0;
const phone = () => '9' + String(100000000 + ++n);
const auth = (cookie) => ({ Cookie: cookie });
const sessionCookie = (res) => {
  const raw = res.headers['set-cookie'];
  expect(raw).toBeTruthy();
  return raw[0].split(';')[0];
};
const future = (days = 1) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

async function register(role, extra = {}) {
  const body = { role, name: role === 'doctor' ? 'Dr. Test Doc' : 'Test Patient', email: `u${++n}@t.test`, phone: phone(), password: 'secret1', ...extra };
  if (role !== 'patient') {
    const user = await User.create({ ...body, status: 'active' });
    const res = await api().post('/api/auth/login').send({ identifier: body.email, password: body.password, role });
    expect(res.status).toBe(200);
    return { token: sessionCookie(res), user: user.toJSON(), body };
  }
  const res = await api().post('/api/auth/register').send(body);
  expect(res.status).toBe(201);
  return { token: sessionCookie(res), user: res.body.data.user, body };
}
const caseBody = (o = {}) => ({ name: 'Rajesh Verma', age: 58, sex: 'Male', phone: '9876543210', rel: 'Self', care: 'Cardiac', sev: 'P1', symptoms: 'chest pain', address: '12 Test Street, Delhi', hospital: 'auto', consent: true, ...o });

let patient, patient2, doctor, mongo;

beforeAll(async () => {
  mongo = await createTestDatabase();
  await connectDB(mongo.uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map(m => m.init()));
  await seedHospitals();
  patient = await register('patient');
  patient2 = await register('patient');
  doctor = await register('doctor', { spec: 'Cardiology' });
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongo.stop();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

describe('Health & 404', () => {
  test('GET /api/health', async () => {
    const r = await api().get('/api/health'); expect(r.status).toBe(200); expect(r.body.status).toBe('ok');
  });
  test('unknown route -> 404 json', async () => {
    const r = await api().get('/api/nope'); expect(r.status).toBe(404); expect(r.body.success).toBe(false);
  });
});

describe('Auth', () => {
  test('register sets a secure HttpOnly cookie and returns no token', async () => {
    expect(patient.token).toMatch(/^medibridge_auth=/); expect(patient.user.password).toBeUndefined(); expect(patient.user.id).toBeTruthy();
    const r = await api().post('/api/auth/register').send({ role: 'patient', name: 'Cookie Check', email: `cookie${++n}@t.test`, phone: phone(), password: 'secret1' });
    expect(r.body.data.token).toBeUndefined();
    expect(r.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(r.headers['set-cookie'][0]).toMatch(/Secure/i);
    expect(r.headers['set-cookie'][0]).toMatch(/SameSite=None/i);
  });
  test('doctor keeps speciality, patient does not', () => { expect(doctor.user.spec).toBe('Cardiology'); expect(patient.user.spec).toBe(''); });
  test('register validates fields like the frontend', async () => {
    const r = await api().post('/api/auth/register').send({ role: 'patient', name: 'A', email: 'bad', phone: '123', password: '123', confirmPassword: '999' });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.errors)).toEqual(expect.arrayContaining(['name', 'email', 'phone', 'password', 'confirmPassword']));
  });
  test('register rejects unknown role', async () => {
    const r = await api().post('/api/auth/register').send({ role: 'admin', name: 'Abc', email: 'a@b.co', phone: phone(), password: 'secret1' });
    expect(r.status).toBe(400); expect(r.body.errors.role).toBeTruthy();
  });
  test('duplicate email or phone -> 409', async () => {
    const r1 = await api().post('/api/auth/register').send({ ...patient.body, phone: phone() }); expect(r1.status).toBe(409);
    const r2 = await api().post('/api/auth/register').send({ ...patient.body, email: 'other@t.test' }); expect(r2.status).toBe(409);
  });
  test('password is stored hashed', async () => {
    const u = await User.findById(patient.user.id).select('+password'); expect(u.password).not.toBe('secret1'); expect(u.password.startsWith('$2')).toBe(true);
  });
  test('login with email and with phone', async () => {
    const a = await api().post('/api/auth/login').send({ identifier: patient.body.email, password: 'secret1', role: 'patient' });
    expect(a.status).toBe(200); expect(a.body.data.token).toBeUndefined(); expect(sessionCookie(a)).toMatch(/^medibridge_auth=/);
    const b = await api().post('/api/auth/login').send({ identifier: patient.body.phone, password: 'secret1' });
    expect(b.status).toBe(200);
  });
  test('wrong password -> 401', async () => {
    const r = await api().post('/api/auth/login').send({ identifier: patient.body.email, password: 'wrong!!', role: 'patient' }); expect(r.status).toBe(401);
  });
  test('wrong role -> 403 with the frontend message', async () => {
    const r = await api().post('/api/auth/login').send({ identifier: patient.body.email, password: 'secret1', role: 'doctor' });
    expect(r.status).toBe(403); expect(r.body.message).toMatch(/registered as a patient/);
  });
  test('missing credentials -> 400', async () => { expect((await api().post('/api/auth/login').send({})).status).toBe(400); });
  test('GET /me needs a valid session cookie', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth('medibridge_auth=garbage'))).status).toBe(401);
    const r = await api().get('/api/auth/me').set(auth(patient.token)); expect(r.status).toBe(200); expect(r.body.data.user.email).toBe(patient.body.email);
  });
  test('logout clears the session cookie', async () => {
    const r = await api().post('/api/auth/logout').set(auth(patient.token));
    expect(r.status).toBe(200); expect(r.headers['set-cookie'][0]).toMatch(/medibridge_auth=;/);
  });
  test('new patient has no seeded invoices', async () => {
    const r = await api().get('/api/invoices').set(auth(patient.token)); expect(r.body.count).toBe(0);
  });
});

describe('Hospitals', () => {
  test('list all, saturated hospital last', async () => {
    const r = await api().get('/api/hospitals'); expect(r.status).toBe(200); expect(r.body.count).toBe(6);
    expect(r.body.data.hospitals[5].load).toBe('Saturated'); expect(r.body.data.hospitals[0].id).toBe('H2'); // fastest ETA (7 min)
  });
  test('filter by care', async () => {
    const r = await api().get('/api/hospitals?care=Maternity'); expect(r.body.data.hospitals.every(h => h.care.includes('Maternity'))).toBe(true);
  });
  test('search by name or area', async () => {
    const r = await api().get('/api/hospitals?q=sector 12'); expect(r.body.count).toBe(1); expect(r.body.data.hospitals[0].name).toBe('Riverside Heart Institute');
  });
  test('sort by ICU beds and by distance', async () => {
    const icu = (await api().get('/api/hospitals?sort=icu')).body.data.hospitals.map(h => h.icu);
    expect(icu.slice(0, 5)).toEqual([...icu.slice(0, 5)].sort((a, b) => b - a));
    const km = (await api().get('/api/hospitals?sort=km')).body.data.hospitals.map(h => h.km);
    expect(km.slice(0, 5)).toEqual([...km.slice(0, 5)].sort((a, b) => a - b));
  });
  test('invalid care -> 400', async () => { expect((await api().get('/api/hospitals?care=Nope')).status).toBe(400); });
  test('get one / 404', async () => {
    expect((await api().get('/api/hospitals/H3')).body.data.hospital.name).toMatch(/Lotus/);
    expect((await api().get('/api/hospitals/H99')).status).toBe(404);
  });
  test('best match skips saturated hospitals and picks fastest ETA', async () => {
    const r = await api().get('/api/hospitals/best-match?care=Maternity'); expect(r.body.data.hospital.id).toBe('H3');
    const e = await api().get('/api/hospitals/best-match?care=Emergency'); expect(e.body.data.hospital.id).toBe('H2');
  });
});

describe('Emergency cases', () => {
  let c;
  test('create without login (public emergency flow)', async () => {
    const r = await api().post('/api/cases').send(caseBody());
    expect(r.status).toBe(201); c = r.body.data.case;
    expect(c.caseId).toMatch(/^CB-\d{4}$/); expect(c.stage).toBe(0); expect(c.hospital.id).toBe('H2'); // best Cardiac match = fastest non-saturated (7 min)
    expect(c.timeline).toHaveLength(6); expect(c.timeline[0].state).toBe('now');
  });
  test('validation + consent required', async () => {
    const r = await api().post('/api/cases').send(caseBody({ name: 'x', age: 200, sex: 'Robot', phone: '123', care: 'Dental', sev: 'P9', address: 'ab', consent: false }));
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.errors)).toEqual(expect.arrayContaining(['name', 'age', 'sex', 'phone', 'care', 'sev', 'address', 'consent']));
  });
  test('unknown preferred hospital -> 400, chosen hospital is used', async () => {
    expect((await api().post('/api/cases').send(caseBody({ hospital: 'H99' }))).status).toBe(400);
    const r = await api().post('/api/cases').send(caseBody({ hospital: 'H5' })); expect(r.body.data.case.hospital.id).toBe('H5');
  });
  test('public tracking view hides phone / symptoms', async () => {
    const r = await api().get(`/api/cases/${c.caseId}/track`); expect(r.status).toBe(200);
    expect(r.body.data.case.patient.phone).toBeUndefined(); expect(r.body.data.case.symptoms).toBeUndefined();
    expect(r.body.data.case.etaMinutes).toBeGreaterThan(0); expect(r.body.data.case.liveStatus).toMatch(/hospital confirmation/i);
  });
  test('track unknown case -> 404', async () => { expect((await api().get('/api/cases/CB-0000/track')).status).toBe(404); });
  test('tracking reads do not simulate stage progress', async () => {
    const first = await api().get(`/api/cases/${c.caseId}/track`);
    const second = await api().get(`/api/cases/${c.caseId}/track`);
    expect(first.body.data.case.stage).toBe(0); expect(second.body.data.case.stage).toBe(0);
  });
  test('owned case cannot be advanced anonymously', async () => {
    const mk = await api().post('/api/cases').set(auth(patient.token)).send(caseBody());
    expect((await api().post(`/api/cases/${mk.body.data.case.caseId}/advance`)).status).toBe(401);
    expect((await api().post(`/api/cases/${mk.body.data.case.caseId}/advance`).set(auth(patient.token))).status).toBe(403);
  });
  test('full details need login', async () => { expect((await api().get(`/api/cases/${c.caseId}`)).status).toBe(401); });

  test('logged-in patient owns the case + gets an ambulance invoice', async () => {
    const mk = await api().post('/api/cases').set(auth(patient.token)).send(caseBody({ care: 'Trauma', sev: 'P2' }));
    const mine = mk.body.data.case;
    const inv = await api().get('/api/invoices').set(auth(patient.token));
    expect(inv.body.data.invoices.some(i => i.service === 'Ambulance request ' + mine.caseId && i.amount === 1500 && i.status === 'Pending')).toBe(true);
    const full = await api().get(`/api/cases/${mine.caseId}`).set(auth(patient.token)); expect(full.status).toBe(200); expect(full.body.data.case.patient.phone).toBe('9876543210');
    expect((await api().get(`/api/cases/${mine.caseId}`).set(auth(patient2.token))).status).toBe(403);
    expect((await api().get(`/api/cases/${mine.caseId}`).set(auth(doctor.token))).status).toBe(200);
    expect((await api().post(`/api/cases/${mine.caseId}/advance`).set(auth(patient2.token))).status).toBe(403);
  });
  test('list: patient sees own, doctor sees all', async () => {
    const mineList = await api().get('/api/cases').set(auth(patient.token));
    expect(mineList.body.data.cases.every(x => x.patient.name)).toBe(true);
    const all = await api().get('/api/cases').set(auth(doctor.token));
    expect(all.body.count).toBeGreaterThan(mineList.body.count);
    expect((await api().get('/api/cases').set(auth(patient2.token))).body.count).toBe(0);
  });
  test('active case endpoint', async () => {
    const a = await api().get('/api/cases/active').set(auth(patient.token)); expect(a.body.data.case.stage).toBeLessThan(5);
    expect((await api().get('/api/cases/active').set(auth(patient2.token))).body.data.case).toBeNull();
  });
  test('demo case endpoint is not available', async () => {
    const r = await api().post('/api/cases/demo'); expect(r.status).toBe(404);
  });
  test('only a doctor can acknowledge readiness', async () => {
    expect((await api().post(`/api/cases/${c.caseId}/acknowledge`).set(auth(patient.token))).status).toBe(403);
    expect((await api().post(`/api/cases/${c.caseId}/acknowledge`)).status).toBe(401);
    const r = await api().post(`/api/cases/${c.caseId}/acknowledge`).set(auth(doctor.token)); expect(r.status).toBe(200); expect(r.body.data.case.acknowledgedAt).toBeTruthy();
  });
});

describe('Appointment slots', () => {
  let slot;
  test('doctor creates a slot', async () => {
    const r = await api().post('/api/slots').set(auth(doctor.token)).send({ date: future(), from: '10:00', to: '10:30', note: 'General consultation' });
    expect(r.status).toBe(201); slot = r.body.data.slot; expect(slot.status).toBe('free'); expect(slot.doctor).toBe('Dr. Test Doc');
  });
  test('patient cannot create slots, anonymous is rejected', async () => {
    expect((await api().post('/api/slots').set(auth(patient.token)).send({ date: future(), from: '12:00', to: '12:30' })).status).toBe(403);
    expect((await api().post('/api/slots').send({})).status).toBe(401);
  });
  test('validation: format, past date, end before start', async () => {
    const d = auth(doctor.token);
    expect((await api().post('/api/slots').set(d).send({ date: 'x', from: '9', to: '10' })).status).toBe(400);
    expect((await api().post('/api/slots').set(d).send({ date: '2020-01-01', from: '10:00', to: '11:00' })).body.message).toMatch(/past/);
    expect((await api().post('/api/slots').set(d).send({ date: future(), from: '11:00', to: '10:00' })).body.message).toMatch(/after the start/);
  });
  test('overlapping slot -> 409, adjacent slot ok', async () => {
    const d = auth(doctor.token);
    expect((await api().post('/api/slots').set(d).send({ date: future(), from: '10:15', to: '10:45' })).status).toBe(409);
    expect((await api().post('/api/slots').set(d).send({ date: future(), from: '10:30', to: '11:00' })).status).toBe(201);
  });
  test('patient lists upcoming slots', async () => {
    const r = await api().get('/api/slots').set(auth(patient.token)); expect(r.body.count).toBe(2); expect(r.body.data.slots[0].from).toBe('10:00');
  });
  test('book, double-book, taken view, cancel', async () => {
    const b = await api().patch(`/api/slots/${slot.id}/book`).set(auth(patient.token)); expect(b.status).toBe(200); expect(b.body.data.slot.status).toBe('mine');
    expect((await api().patch(`/api/slots/${slot.id}/book`).set(auth(patient2.token))).status).toBe(409);
    const other = (await api().get('/api/slots').set(auth(patient2.token))).body.data.slots.find(s => s.id === slot.id);
    expect(other.status).toBe('taken'); expect(other.bookedBy).toBeUndefined();
    const dl = (await api().get('/api/slots').set(auth(doctor.token))).body.data.slots.find(s => s.id === slot.id);
    expect(dl.status).toBe('booked'); expect(dl.bookedBy).toBe('Test Patient');
    expect((await api().patch(`/api/slots/${slot.id}/cancel`).set(auth(patient2.token))).status).toBe(403);
    const c = await api().patch(`/api/slots/${slot.id}/cancel`).set(auth(patient.token)); expect(c.body.data.slot.status).toBe('free');
  });
  test('doctor cannot book; delete rules', async () => {
    expect((await api().patch(`/api/slots/${slot.id}/book`).set(auth(doctor.token))).status).toBe(403);
    const doc2 = await register('doctor');
    expect((await api().delete(`/api/slots/${slot.id}`).set(auth(doc2.token))).status).toBe(403);
    expect((await api().delete(`/api/slots/${slot.id}`).set(auth(doctor.token))).status).toBe(200);
    expect((await api().delete(`/api/slots/${slot.id}`).set(auth(doctor.token))).status).toBe(404);
    expect((await api().patch('/api/slots/not-an-id/book').set(auth(patient.token))).status).toBe(404);
  });
});

describe('Invoices', () => {
  test('doctor cannot use payment APIs', async () => { expect((await api().get('/api/invoices').set(auth(doctor.token))).status).toBe(403); });
  test('a real ambulance request creates a pending invoice; fake payment is unavailable', async () => {
    await api().post('/api/cases').set(auth(patient2.token)).send(caseBody({ care: 'Emergency', sev: 'P2' }));
    const list = (await api().get('/api/invoices').set(auth(patient2.token))).body.data.invoices;
    const pending = list.find(i => i.status === 'Pending');
    expect(pending).toBeTruthy();
    expect((await api().post(`/api/invoices/${pending.invoiceId}/pay`).set(auth(patient2.token)).send({ method: 'Card' })).status).toBe(404);
    expect((await api().get(`/api/invoices/${pending.invoiceId}/receipt`).set(auth(patient2.token))).status).toBe(400);
  });
  test("a patient cannot touch someone else's invoice", async () => {
    const other = (await api().get('/api/invoices').set(auth(patient.token))).body.data.invoices[0];
    expect((await api().get(`/api/invoices/${other.invoiceId}/receipt`).set(auth(patient2.token))).status).toBe(403);
    expect((await api().get('/api/invoices/INV-0').set(auth(patient2.token))).status).toBe(404);
  });
});

describe('Documents (patient upload -> doctor access)', () => {
  let history, report;
  const up = (token, fields = {}, file = { buf: Buffer.from('Allergic to penicillin. Appendix removed 2019.'), name: 'history.txt' }) => {
    let r = api().post('/api/documents').set(auth(token));
    Object.entries(fields).forEach(([k, v]) => { r = r.field(k, v); });
    return file ? r.attach('file', file.buf, file.name) : r;
  };

  test('summary: no medical history yet', async () => {
    const r = await api().get('/api/documents/summary').set(auth(patient.token)); expect(r.body.data).toEqual({ total: 0, hasMedicalHistory: false });
  });
  test('patient uploads medical history', async () => {
    const r = await up(patient.token, { category: 'Medical History', title: 'My history', note: 'Allergic to penicillin' });
    expect(r.status).toBe(201); history = r.body.data.document;
    expect(history.category).toBe('Medical History'); expect(history.fileName).toBe('history.txt'); expect(history.size).toBeGreaterThan(10);
    expect(history.storedName).toBeUndefined(); expect(history.fileId).toBeUndefined();   // storage details are never exposed
    expect(await stored()).toBe(1);                                      // saved in MongoDB, nothing written to disk
    expect(fs.readdirSync(process.env.UPLOAD_DIR)).toHaveLength(0);
  });
  test('title defaults to file name, category defaults to Other', async () => {
    const r = await up(patient.token, {}, { buf: Buffer.from('%PDF-1.4 fake'), name: 'blood-test.pdf' });
    report = r.body.data.document; expect(report.title).toBe('blood-test'); expect(report.category).toBe('Other');
  });
  test('summary now shows medical history uploaded', async () => {
    const r = await api().get('/api/documents/summary').set(auth(patient.token)); expect(r.body.data).toEqual({ total: 2, hasMedicalHistory: true });
  });
  test('rejects: no file, bad type, bad category, doctor upload, anonymous', async () => {
    expect((await up(patient.token, { category: 'Other' }, null)).status).toBe(400);
    expect((await up(patient.token, {}, { buf: Buffer.from('MZ'), name: 'virus.exe' })).status).toBe(400);
    const before = await stored();
    expect((await up(patient.token, { category: 'Selfies' })).status).toBe(400);
    expect(await stored()).toBe(before);                                  // rejected file is not kept
    const ins = await up(patient.token, { category: 'Insurance' });         // category used by the frontend
    expect(ins.status).toBe(201);
    await api().delete(`/api/documents/${ins.body.data.document.id}`).set(auth(patient.token));
    expect((await up(doctor.token, { category: 'Other' })).status).toBe(403);
    expect((await api().post('/api/documents')).status).toBe(401);
  });
  test('files over 10 MB -> 413', async () => {
    const r = await up(patient.token, { category: 'Other' }, { buf: Buffer.alloc(10 * 1024 * 1024 + 10, 1), name: 'big.pdf' }); expect(r.status).toBe(413);
  });
  test('patient lists only own documents', async () => {
    expect((await api().get('/api/documents').set(auth(patient.token))).body.count).toBe(2);
    expect((await api().get('/api/documents').set(auth(patient2.token))).body.count).toBe(0);
  });
  test('doctor sees every patient\'s documents with filters', async () => {
    await up(patient2.token, { category: 'Prescription', title: 'Amoxicillin' });
    const all = await api().get('/api/documents').set(auth(doctor.token)); expect(all.body.count).toBe(3);
    expect((await api().get('/api/documents?category=Prescription').set(auth(doctor.token))).body.count).toBe(1);
    expect((await api().get('/api/documents?patientId=' + patient.user.id).set(auth(doctor.token))).body.count).toBe(2);
    expect((await api().get('/api/documents?q=amoxi').set(auth(doctor.token))).body.count).toBe(1);
    expect((await api().get('/api/documents?q=(').set(auth(doctor.token))).status).toBe(200);   // regex chars are escaped
  });
  test('doctor patients dropdown', async () => {
    const r = await api().get('/api/documents/patients').set(auth(doctor.token));
    expect(r.body.data.patients).toHaveLength(2); expect(r.body.data.patients.find(p => p.id === patient.user.id).documents).toBe(2);
    expect(r.body.data.patients.find(p => p.id === patient.user.id).hasMedicalHistory).toBe(true);
    expect(r.body.data.patients.find(p => p.id === patient2.user.id).hasMedicalHistory).toBe(false);
    expect((await api().get('/api/documents/patients').set(auth(patient.token))).status).toBe(403);
  });
  test('doctor can download the file; content is intact', async () => {
    const r = await api().get(`/api/documents/${history.id}/file`).set(auth(doctor.token)).buffer(true).parse((res, cb) => { const b = []; res.on('data', d => b.push(d)); res.on('end', () => cb(null, Buffer.concat(b))); });
    expect(r.status).toBe(200); expect(r.body.toString()).toBe('Allergic to penicillin. Appendix removed 2019.');
    expect(r.headers['content-disposition']).toMatch(/^inline/);
    const dl = await api().get(`/api/documents/${history.id}/file?download=1`).set(auth(doctor.token)); expect(dl.headers['content-disposition']).toMatch(/^attachment/);
  });
  test('files are not public and not shared between patients', async () => {
    expect((await api().get(`/api/documents/${history.id}/file`)).status).toBe(401);
    expect((await api().get(`/api/documents/${history.id}/file`).set(auth(patient2.token))).status).toBe(403);
    expect((await api().get(`/api/documents/${history.id}`).set(auth(patient2.token))).status).toBe(403);
    expect((await api().get('/api/documents/507f1f77bcf86cd799439011').set(auth(doctor.token))).status).toBe(404);
  });
  test('only the owner can delete (doctor read-only); stored file removed', async () => {
    expect((await api().delete(`/api/documents/${history.id}`).set(auth(doctor.token))).status).toBe(403);
    expect((await api().delete(`/api/documents/${history.id}`).set(auth(patient2.token))).status).toBe(403);
    const before = await stored();
    expect((await api().delete(`/api/documents/${history.id}`).set(auth(patient.token))).status).toBe(200);
    expect(await stored()).toBe(before - 1);
    expect((await api().get(`/api/documents/${history.id}`).set(auth(doctor.token))).status).toBe(404);
    expect((await api().get('/api/documents/summary').set(auth(patient.token))).body.data.hasMedicalHistory).toBe(false);
  });
});
