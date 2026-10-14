const Invoice = require('../models/Invoice');

const rand = () => 1000 + Math.floor(Math.random() * 8999);

async function uniqueInvoiceId() {
  for (;;) {
    const id = 'INV-' + rand();
    if (!(await Invoice.exists({ invoiceId: id }))) return id;
  }
}

async function createAmbulanceInvoice(patientId, caseId) {
  return Invoice.create({ invoiceId: await uniqueInvoiceId(), patient: patientId, service: 'Ambulance request ' + caseId, amount: 1500, status: 'Pending', caseId });
}

module.exports = { createAmbulanceInvoice };
