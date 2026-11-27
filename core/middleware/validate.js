const validator = require('validator');
const AppError = require('../utils/AppError');

/**
 * Tiny schema validator. Usage:
 *   validate({ name: { required: true, max: 120 }, email: { required: true, email: true } })
 * Trims strings, strips control characters, and rejects with a field-level error list.
 */
function clean(v) {
  if (typeof v !== 'string') return v;
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

function validate(rules) {
  return (req, res, next) => {
    const errors = [];
    const body = req.body || {};
    Object.entries(rules).forEach(([field, r]) => {
      let val = clean(body[field]);
      if (val === undefined || val === null || val === '') {
        if (r.required) errors.push({ field, message: `${r.label || field} is required` });
        if (val === '') body[field] = r.required ? val : undefined;
        return;
      }
      if (r.email && !validator.isEmail(String(val))) errors.push({ field, message: 'Enter a valid email address' });
      if (r.phone && !/^[+()\-\s\d]{7,20}$/.test(String(val))) errors.push({ field, message: 'Enter a valid phone number' });
      if (r.url && !validator.isURL(String(val), { require_protocol: true, protocols: ['http', 'https'] })) errors.push({ field, message: 'Enter a valid URL (https://…)' });
      if (r.number) {
        val = Number(val);
        if (Number.isNaN(val)) errors.push({ field, message: `${r.label || field} must be a number` });
        else if (r.min !== undefined && val < r.min) errors.push({ field, message: `${r.label || field} must be at least ${r.min}` });
        else if (r.max !== undefined && val > r.max) errors.push({ field, message: `${r.label || field} must be at most ${r.max}` });
      }
      if (r.date && Number.isNaN(Date.parse(val))) errors.push({ field, message: `${r.label || field} must be a valid date` });
      if (r.oneOf && !r.oneOf.includes(val)) errors.push({ field, message: `${r.label || field} has an invalid value` });
      if (r.max && typeof val === 'string' && val.length > r.max) errors.push({ field, message: `${r.label || field} must be under ${r.max} characters` });
      if (r.min && typeof val === 'string' && !r.number && val.length < r.min) errors.push({ field, message: `${r.label || field} must be at least ${r.min} characters` });
      body[field] = val;
    });
    if (errors.length) return next(new AppError('Validation failed', 400, errors));
    req.body = body;
    return next();
  };
}

module.exports = validate;
