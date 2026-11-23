const router = require('../lib/router').Express.Router();
const auth = require('../controllers/authController');
const c = require('../controllers/portalController');
const { requireClient } = require('../middleware/auth');

// Client portal auth is completely separate from the four-admin system:
// different endpoint, different JWT secret + audience, different cookie.
router.post('/auth/login', auth.portalLogin);
router.post('/auth/logout', requireClient, auth.portalLogout);
router.get('/auth/me', requireClient, auth.me);
router.post('/auth/change-password', requireClient, auth.portalChangePassword);

router.use(requireClient);
router.get('/overview', c.overview);
router.get('/projects/:id', c.projectDetail);
router.post('/projects/:id/feedback', c.addFeedback);
router.post('/projects/:id/change-requests', c.addChangeRequest);
router.get('/projects/:id/certificate', c.certificateDownload);
router.post('/quotations/:id/decision', c.approveQuotation);
router.get('/quotations/:id/pdf', c.quotationPdfDownload);
router.get('/invoices/:id/pdf', c.invoicePdfDownload);
router.get('/documents/:id/download', c.documentDownload);
router.get('/tickets', c.listTickets);
router.post('/tickets', c.createTicket);
router.post('/tickets/:id/reply', c.replyTicket);

module.exports = router;
