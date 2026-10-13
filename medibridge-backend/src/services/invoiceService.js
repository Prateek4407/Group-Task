const Invoice = require('../models/Invoice');

const rand = () => 1000 + Math.floor(Math.random() * 8999);

async function uniqueInvoiceId() {
  for (;;) {
    const id = 'INV-' + rand();
    if (!(await Invoice.exists({ invoiceId: id }))) return id;
  }
}

/** Same sample invoices the frontend demo starts with. */
async function createWelcomeInvoices(patientId) {
  await Invoice.create([
    { invoiceId: await uniqueInvoiceId(), patient: patientId, service: 'Teleconsultation', amount: 500, status: 'Pending' },
    { invoiceId: await uniqueInvoiceId(), patient: patientId, service: 'Ambulance transport (sample)', amount: 1200, status: 'Paid', method: 'UPI', paidAt: new Date() }
  ]);
}

async function createAmbulanceInvoice(patientId, caseId) {
  return Invoice.create({ invoiceId: await uniqueInvoiceId(), patient: patientId, service: 'Ambulance request ' + caseId, amount: 1500, status: 'Pending', caseId });
}

module.exports = { createWelcomeInvoices, createAmbulanceInvoice };
