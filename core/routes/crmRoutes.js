const router = require('../lib/router').Express.Router();
const { requireAdminPasswordChanged } = require('../middleware/auth');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');

const lead = require('../controllers/leadController');
const client = require('../controllers/clientController');
const project = require('../controllers/projectController');
const task = require('../controllers/taskController');
const quotation = require('../controllers/quotationController');
const invoice = require('../controllers/invoiceController');
const payment = require('../controllers/paymentController');
const expense = require('../controllers/expenseController');
const doc = require('../controllers/documentController');
const cert = require('../controllers/certificateController');
const dash = require('../controllers/dashboardController');
const report = require('../controllers/reportController');
const misc = require('../controllers/miscController');

// EVERY route below requires one of the four admins. Hiding UI is never the only protection.
router.use(requireAdminPasswordChanged);

router.get('/dashboard', dash.overview);
router.get('/team', misc.teamList);
router.get('/admins', lead.adminsForAssign);

/* Leads */
const leadRules = {
  name: { required: true, max: 120, min: 2 }, email: { required: true, email: true }, phone: { phone: true },
  status: { oneOf: ['New', 'Contacted', 'Discussion', 'Quotation Sent', 'Negotiation', 'Won', 'Lost'] }, followUpDate: { date: true }
};
router.get('/leads', lead.list);
router.post('/leads', validate(leadRules), lead.create);
router.get('/leads/:id', lead.get);
router.put('/leads/:id', validate({ ...leadRules, name: { max: 120 }, email: { email: true } }), lead.update);
router.delete('/leads/:id', lead.remove);
router.post('/leads/:id/communications', lead.addCommunication);
router.post('/leads/:id/convert', lead.convert);

/* Clients */
const clientRules = { contactPerson: { required: true, max: 120 }, email: { required: true, email: true }, phone: { phone: true } };
router.get('/clients', client.list);
router.post('/clients', validate(clientRules), client.create);
router.get('/clients/:id', client.get);
router.put('/clients/:id', validate({ contactPerson: { max: 120 }, email: { email: true }, phone: { phone: true } }), client.update);
router.delete('/clients/:id', client.remove);
router.post('/clients/:id/portal-access', client.portalAccess);

/* Projects */
const projectRules = {
  name: { required: true, max: 160 }, client: { required: true }, status: { oneOf: ['Not Started', 'Planning', 'In Progress', 'On Hold', 'Testing', 'Client Review', 'Completed', 'Cancelled'] },
  acceptedAmount: { number: true, min: 0 }, quotationAmount: { number: true, min: 0 }, advanceAmount: { number: true, min: 0 },
  startDate: { date: true }, expectedDeadline: { date: true }, githubUrl: { url: true }, liveUrl: { url: true }, progress: { number: true, min: 0, max: 100 }
};
router.get('/projects', project.list);
router.post('/projects', validate(projectRules), project.create);
router.get('/projects/:id', project.get);
router.put('/projects/:id', validate({ ...projectRules, name: { max: 160 }, client: {} }), project.update);
router.delete('/projects/:id', project.remove);
router.put('/projects/:id/portfolio', validate({ coverImage: { url: true } }), project.setPortfolio);
router.put('/projects/:id/checklist/:itemId', project.toggleChecklist);
router.post('/projects/:id/checklist', project.addChecklistItem);
router.post('/projects/:id/handover/confirm', project.confirmHandover);
router.post('/projects/:id/change-requests', project.addChangeRequest);
router.put('/projects/:id/change-requests/:crId', project.decideChangeRequest);
router.post('/projects/:id/feedback', project.addFeedback);
router.post('/projects/:id/contributions', project.addContribution);
router.get('/projects/:id/milestones', project.listMilestones);
router.post('/projects/:id/milestones', validate({ name: { required: true, max: 160 }, paymentAmount: { number: true, min: 0 }, dueDate: { date: true } }), project.createMilestone);
router.put('/projects/:id/milestones/:mid', project.updateMilestone);
router.delete('/projects/:id/milestones/:mid', project.deleteMilestone);
router.get('/projects/:id/certificate/eligibility', cert.eligibility);
router.get('/projects/:id/certificate/preview', cert.preview);
router.post('/projects/:id/certificate', cert.generate);
router.get('/projects/:id/certificate/download', cert.download);

/* Tasks */
const taskRules = { title: { required: true, max: 200 }, project: { required: true }, priority: { oneOf: ['Low', 'Medium', 'High', 'Urgent'] }, status: { oneOf: ['To Do', 'In Progress', 'Review', 'Completed'] }, dueDate: { date: true } };
router.get('/tasks', task.list);
router.post('/tasks', validate(taskRules), task.create);
router.put('/tasks/:id', validate({ title: { max: 200 }, priority: { oneOf: ['Low', 'Medium', 'High', 'Urgent'] }, status: { oneOf: ['To Do', 'In Progress', 'Review', 'Completed'] }, dueDate: { date: true } }), task.update);
router.delete('/tasks/:id', task.remove);
router.post('/tasks/:id/comments', task.addComment);

/* Quotations */
const qRules = { projectName: { required: true, max: 160 }, expiryDate: { required: true, date: true }, taxRate: { number: true, min: 0, max: 100 }, advancePercent: { number: true, min: 0, max: 100 }, discountValue: { number: true, min: 0 } };
router.get('/quotations/defaults', quotation.defaults);
router.get('/quotations', quotation.list);
router.post('/quotations', validate(qRules), quotation.create);
router.get('/quotations/:id', quotation.get);
router.put('/quotations/:id', validate({ ...qRules, projectName: { max: 160 }, expiryDate: { date: true } }), quotation.update);
router.delete('/quotations/:id', quotation.remove);
router.post('/quotations/:id/duplicate', quotation.duplicate);
router.get('/quotations/:id/pdf', quotation.pdf);
router.post('/quotations/:id/send', quotation.send);
router.put('/quotations/:id/status', quotation.setStatus);
router.post('/quotations/:id/create-project', quotation.createProject);

/* Invoices */
const invRules = { dueDate: { date: true }, taxRate: { number: true, min: 0, max: 100 } };
router.get('/invoices', invoice.list);
router.post('/invoices', validate(invRules), invoice.create);
router.get('/invoices/:id', invoice.get);
router.put('/invoices/:id', validate(invRules), invoice.update);
router.post('/invoices/:id/cancel', invoice.cancel);
router.delete('/invoices/:id', invoice.remove);
router.get('/invoices/:id/pdf', invoice.pdf);
router.post('/invoices/:id/send', invoice.send);
router.post('/invoices/:id/mark-sent', invoice.markSent);
router.post('/invoices/:id/remind', invoice.remind);

/* Payments */
router.get('/payments', payment.list);
router.post('/payments', validate({ amount: { required: true, number: true, min: 0.01 }, paymentType: { required: true, oneOf: ['Advance', 'Milestone', 'Final', 'Partial', 'Other Income'] }, method: { required: true, oneOf: ['Bank Transfer', 'UPI', 'Cash', 'Other'] }, paidOn: { required: true, date: true } }), payment.create);
router.put('/payments/:id', payment.update);
router.post('/payments/:id/void', payment.voidPayment);
router.get('/payments/:id/receipt', payment.receipt);
router.post('/payments/:id/email-receipt', payment.emailReceipt);

/* Expenses */
router.get('/expenses/categories', expense.CATEGORIES);
router.get('/expenses', expense.list);
router.post('/expenses', validate({ title: { required: true, max: 160 }, category: { required: true }, amount: { required: true, number: true, min: 0.01 }, expenseDate: { required: true, date: true } }), expense.create);
router.put('/expenses/:id', validate({ amount: { number: true, min: 0.01 }, expenseDate: { date: true } }), expense.update);
router.delete('/expenses/:id', expense.remove);
router.post('/expenses/:id/receipt', upload.single('receipt'), expense.uploadReceipt);

/* Documents */
router.get('/documents', doc.list);
router.post('/documents', upload.array('files', 5), doc.upload);
router.get('/documents/:id/download', doc.download);
router.put('/documents/:id/visibility', doc.toggleVisibility);
router.delete('/documents/:id', doc.remove);

/* Reports */
router.get('/reports', report.list);
router.get('/reports/:type', report.run);

/* Audit (read only: there is intentionally no write route) */
router.get('/audit-logs', misc.auditList);
router.get('/audit-logs/:id', misc.auditGet);

/* Notifications / settings / tickets */
router.get('/notifications', misc.notifList);
router.put('/notifications/read-all', misc.notifReadAll);
router.put('/notifications/:id/read', misc.notifRead);
router.get('/settings', misc.settingsGet);
router.put('/settings', misc.settingsUpdate);
router.get('/tickets', misc.ticketList);
router.post('/tickets/:id/reply', misc.ticketReply);

module.exports = router;
