const { config } = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Server error';
  let details = err.details;

  if (err.name === 'ValidationError') {
    status = 400;
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = 'Validation failed';
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = `Duplicate value for ${Object.keys(err.keyValue || {}).join(', ') || 'record'}`;
  } else if (err.code === 'permission-denied') {
    // firestore.rules refused the read/write
    status = 403;
    err.friendly = true;
    message = 'You do not have permission to do that.';
  } else if (err.code === 'unavailable' || err.code === 'deadline-exceeded') {
    status = 503;
    err.friendly = true;
    message = 'Cannot reach the database. Check your internet connection.';
  } else if (err.code === 'resource-exhausted') {
    status = 429;
    err.friendly = true;
    message = 'The free daily database limit has been reached. It resets at midnight (Pacific time).';
  }

  if (status >= 500) {
    if (!err.isOperational) console.error(`[${req.method} ${req.originalUrl}]`, err);
    // Messages we wrote ourselves (AppError, mapped Firebase errors) are safe to show.
    if (config.isProd && !err.isOperational && !err.friendly) message = 'Something went wrong on our side. Please try again.';
  }

  // Only field-level validation details are ever sent to the browser (never internal error text,
  // e.g. the `details` string Firestore/gRPC errors carry).
  const safeDetails = status < 500 && Array.isArray(details) ? details : undefined;
  res.status(status).json({ success: false, message, ...(safeDetails ? { details: safeDetails } : {}) });
}

module.exports = { notFound, errorHandler };
