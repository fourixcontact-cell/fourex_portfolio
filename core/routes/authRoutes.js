const router = require('../lib/router').Express.Router();
const c = require('../controllers/authController');
const { requireAdmin, requireAdminPasswordChanged } = require('../middleware/auth');

router.post('/login', c.adminLogin);
router.post('/logout', requireAdmin, c.adminLogout);
router.get('/me', requireAdmin, c.me);
router.post('/change-password', requireAdmin, c.adminChangePassword);

router.get('/admins', requireAdminPasswordChanged, c.listAdmins);
router.get('/sessions', requireAdminPasswordChanged, c.listSessions);
router.get('/login-history', requireAdminPasswordChanged, c.loginHistory);
router.post('/sessions/:id/revoke', requireAdminPasswordChanged, c.revokeSession);

module.exports = router;
