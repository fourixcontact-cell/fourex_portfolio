const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const SupportTicket = require('../models/SupportTicket');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { getSiteSettings } = require('../services/siteSettingsService');
const { getPaging, pageMeta, searchFilter, assertObjectId, pick } = require('../utils/helpers');

/* ---------------- Audit logs: read only ---------------- */
const auditList = asyncHandler(async (req, res) => {
  const paging = getPaging(req.query, 25);
  const q = {};
  if (req.query.admin) { assertObjectId(req.query.admin, 'admin'); q.adminId = req.query.admin; }
  if (req.query.module) q.module = String(req.query.module);
  if (req.query.action) q.action = String(req.query.action);
  if (req.query.from || req.query.to) {
    q.createdAt = {};
    if (req.query.from) q.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) q.createdAt.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }
  const s = searchFilter(req.query.search, ['description', 'adminName', 'recordId']);
  if (s) Object.assign(q, s);
  const [rows, total, modules, actions] = await Promise.all([
    AuditLog.find(q).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(),
    AuditLog.countDocuments(q),
    audit.facet('modules'),
    audit.facet('actions')
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, paging), filters: { modules: modules.sort(), actions: actions.sort() } });
});

const auditGet = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const row = await AuditLog.findById(req.params.id).lean();
  if (!row) throw new AppError('Audit record not found', 404);
  res.json({ success: true, data: row });
});

/* ---------------- Notifications ---------------- */
const notifList = asyncHandler(async (req, res) => {
  const q = { audience: 'admin' };
  if (req.query.unread === 'true') q.unreadBy = String(req.user._id);
  const paging = getPaging(req.query, 20);
  const [rows, total, unread] = await Promise.all([
    Notification.find(q).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(),
    Notification.countDocuments(q),
    // One Firestore count() over an array-contains index instead of scanning every notification.
    Notification.countDocuments({ unreadBy: String(req.user._id) })
  ]);
  res.json({ success: true, data: rows.map((n) => ({ ...n, read: (n.readBy || []).some((id) => String(id) === String(req.user._id)), readBy: undefined, unreadBy: undefined })), meta: pageMeta(total, paging), unread });
});

const notifRead = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  await Notification.updateOne({ _id: req.params.id }, { $addToSet: { readBy: req.user._id }, $pull: { unreadBy: req.user._id } });
  res.json({ success: true });
});

const notifReadAll = asyncHandler(async (req, res) => {
  await Notification.updateMany({ unreadBy: String(req.user._id) }, { $addToSet: { readBy: req.user._id }, $pull: { unreadBy: req.user._id } });
  res.json({ success: true });
});

/* ---------------- Settings ---------------- */
const SETTINGS_FIELDS = ['agencyName', 'tagline', 'address', 'phone', 'email', 'website', 'gstin', 'signatory', 'bankDetails', 'defaultTaxName', 'defaultTaxRate', 'defaultCurrency', 'quotationValidityDays', 'invoiceDueDays', 'defaultPaymentTerms', 'defaultTerms', 'social', 'testimonials', 'publicTeam', 'blogPosts', 'services', 'technologies', 'workflow', 'why', 'aboutStory', 'aboutPrinciples'];

const settingsGet = asyncHandler(async (req, res) => {
  const s = await getSiteSettings();
  res.json({ success: true, data: s });
});

/** Only http(s) URLs may be stored for anything that becomes an href/src on the public site. */
const safeUrl = (u) => { const s = String(u || '').trim(); return /^https?:\/\/[^\s]+$/i.test(s) ? s.slice(0, 500) : ''; };

const contentText = (value, label, max, required = false) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (required && !text) throw new AppError(`${label} is required`, 400);
  if (text.length > max) throw new AppError(`${label} must be ${max} characters or fewer`, 400);
  return text;
};

const contentIcon = (value) => {
  const icon = contentText(value, 'Icon', 64);
  const bootstrapIcon = /^bi-[a-z0-9-]+$/.test(icon);
  const fontAwesomeIcon = /^fa-(solid|regular|brands)(\s+fa-[a-z0-9-]+)+$/.test(icon);
  if (icon && !bootstrapIcon && !fontAwesomeIcon) throw new AppError('Icon must be a Bootstrap Icons class or Font Awesome classes such as fa-solid fa-code', 400);
  return icon;
};

const contentList = (value, field, max = 50) => {
  if (!Array.isArray(value)) throw new AppError(`${field} must be a list`, 400);
  if (value.length > max) throw new AppError(`${field} cannot contain more than ${max} items`, 400);
  return value;
};

const uniqueBy = (items, field, label) => {
  const values = new Set();
  for (const item of items) {
    const value = item[field].toLocaleLowerCase();
    if (values.has(value)) throw new AppError(`${label} must be unique`, 400);
    values.add(value);
  }
  return items;
};

const contentStrings = (items, field, maxItems, maxLength) => {
  if (!Array.isArray(items)) throw new AppError(`${field} must be a list`, 400);
  if (items.length > maxItems) throw new AppError(`${field} cannot contain more than ${maxItems} items`, 400);
  return items.map((item) => contentText(item, field, maxLength, true));
};

function validateSiteContent(data) {
  if (Object.prototype.hasOwnProperty.call(data, 'services')) {
    data.services = contentList(data.services, 'Services').map((item) => ({
      icon: contentIcon(item?.icon),
      title: contentText(item?.title, 'Service title', 120, true),
      text: contentText(item?.text, 'Service description', 1000, true),
      points: contentStrings(item?.points ?? [], 'Service points', 20, 160)
    }));
    uniqueBy(data.services, 'title', 'Service titles');
  }
  if (Object.prototype.hasOwnProperty.call(data, 'technologies')) {
    data.technologies = contentList(data.technologies, 'Technology groups').map((item) => ({
      group: contentText(item?.group, 'Technology group', 80, true),
      icon: contentIcon(item?.icon),
      items: contentList(item?.items ?? [], 'Technologies', 60).map((technology) => {
        if (typeof technology === 'string') return contentText(technology, 'Technology name', 80, true);
        return {
          name: contentText(technology?.name, 'Technology name', 80, true),
          icon: contentIcon(technology?.icon)
        };
      })
    }));
    uniqueBy(data.technologies, 'group', 'Technology group names');
    data.technologies.forEach((group) => uniqueBy(group.items.map((technology) => typeof technology === 'string' ? { name: technology } : technology), 'name', `Technology names in ${group.group}`));
  }
  for (const field of ['workflow', 'why']) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
    const label = field === 'workflow' ? 'Workflow step' : 'Reason';
    data[field] = contentList(data[field], field).map((item) => ({
      icon: contentIcon(item?.icon),
      title: contentText(item?.title, `${label} title`, 120, true),
      text: contentText(item?.text, `${label} description`, 1000, true)
    }));
    uniqueBy(data[field], 'title', `${label} titles`);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'aboutStory')) {
    data.aboutStory = contentStrings(data.aboutStory, 'About story paragraphs', 10, 2000);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'aboutPrinciples')) {
    data.aboutPrinciples = contentList(data.aboutPrinciples, 'About principles', 12).map((item) => ({
      icon: contentIcon(item?.icon),
      title: contentText(item?.title, 'About principle title', 80, true),
      text: contentText(item?.text, 'About principle description', 1000, true)
    }));
    uniqueBy(data.aboutPrinciples, 'title', 'About principle titles');
  }
}

const settingsUpdate = asyncHandler(async (req, res) => {
  const s = await getSiteSettings();
  const before = s.toObject();
  const data = pick(req.body, SETTINGS_FIELDS);
  validateSiteContent(data);
  if (data.social && typeof data.social === 'object') data.social = Object.fromEntries(['github', 'linkedin', 'twitter', 'instagram'].map((k) => [k, safeUrl(data.social[k])]));
  if (Array.isArray(data.publicTeam)) data.publicTeam = data.publicTeam.map((t) => ({ ...t, photoUrl: safeUrl(t.photoUrl), linkedin: safeUrl(t.linkedin), github: safeUrl(t.github) }));
  if (Array.isArray(data.blogPosts)) {
    const used = new Set();
    data.blogPosts = data.blogPosts.map((p) => {
      let slug = String(p.slug || p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'post';
      for (let i = 2; used.has(slug); i += 1) slug = `${slug.replace(/-\d+$/, '')}-${i}`;
      used.add(slug);
      return { ...p, slug, coverImage: safeUrl(p.coverImage), publishedAt: p.published ? p.publishedAt || new Date() : undefined };
    });
  }
  s.set(data);
  await s.save();
  await audit.recordUpdate(req, { module: 'settings', recordId: s._id, action: 'SETTINGS_CHANGE', description: 'Settings modified', before, after: s.toObject() });
  res.json({ success: true, data: s });
});

/* ---------------- Team ---------------- */
const teamList = asyncHandler(async (req, res) => {
  const admins = await User.find({ role: 'admin', isActive: true }).sort({ adminSlot: 1 }).select('name email avatarColor adminSlot');
  const stats = await Promise.all(
    admins.map(async (a) => {
      const [projects, open, done, overdue] = await Promise.all([
        Project.countDocuments({ team: a._id, isArchived: false }),
        Task.countDocuments({ assignedTo: a._id, status: { $ne: 'Completed' } }),
        Task.countDocuments({ completedBy: a._id, status: 'Completed' }),
        Task.countDocuments({ assignedTo: a._id, status: { $ne: 'Completed' }, dueDate: { $lt: new Date() } })
      ]);
      return { ...a.toObject(), projects, openTasks: open, tasksCompleted: done, overdueTasks: overdue };
    })
  );
  res.json({ success: true, data: stats, notice: 'Contribution figures are informational and do not determine ownership or profit distribution.' });
});

/* ---------------- Support tickets (admin side) ---------------- */
const ticketList = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.status) q.status = String(req.query.status);
  const paging = getPaging(req.query);
  const [rows, total] = await Promise.all([
    SupportTicket.find(q).populate('client', 'company contactPerson').populate('project', 'name').sort({ updatedAt: -1 }).skip(paging.skip).limit(paging.limit),
    SupportTicket.countDocuments(q)
  ]);
  res.json({ success: true, data: rows, meta: pageMeta(total, paging) });
});

const ticketReply = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const t = await SupportTicket.findById(req.params.id);
  if (!t) throw new AppError('Ticket not found', 404);
  const message = String(req.body.message || '').trim();
  if (message) t.replies.push({ from: 'admin', authorName: req.user.name, message: message.slice(0, 4000) });
  if (req.body.status && ['Open', 'In Progress', 'Resolved', 'Closed'].includes(req.body.status)) t.status = req.body.status;
  await t.save();
  await audit.record(req, { action: 'UPDATE', module: 'ticket', recordId: t._id, description: `Ticket ${t.number} ${message ? 'replied' : 'updated'} (${t.status})` });
  res.json({ success: true, data: t });
});

module.exports = { auditList, auditGet, notifList, notifRead, notifReadAll, settingsGet, settingsUpdate, teamList, ticketList, ticketReply };
