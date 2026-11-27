const path = require('../lib/path');
const { config } = require('../config/env');
const AppError = require('../utils/AppError');
const storage = require('../services/storageService');
const { assertBuffersValid } = require('../services/fileCheck');

/**
 * File uploads in the browser. The axios adapter turns a FormData body into req.body (text
 * fields) + req.rawFiles ([{ field, file: File }]).
 *
 * Same contract the controllers already use:
 *   upload.single('receipt')     -> req.file
 *   upload.array('files', 5)     -> req.files
 * Each file object has { fieldname, originalname, mimetype, size, filename }, where
 * `filename` is the storage key. Type, size, count and the real file signature are all checked
 * BEFORE anything is written.
 */
const ALLOWED = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
  'text/plain': ['.txt', '.md'],
  'text/markdown': ['.md'],
  'text/csv': ['.csv'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls', '.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx']
};

async function readFiles(req, field, maxCount) {
  const raw = req.rawFiles || [];
  if (raw.length > maxCount) throw new AppError(`Too many files (max ${maxCount})`, 400);
  const files = [];
  for (const { field: name, file } of raw) {
    const originalname = file.name || 'file';
    const mimetype = file.type || 'application/octet-stream';
    const ext = path.extname(originalname).toLowerCase();
    if (name !== field) throw new AppError(`Unexpected file field "${name}"`, 400);
    if (!ALLOWED[mimetype] || !ALLOWED[mimetype].includes(ext)) throw new AppError(`File type not allowed (${mimetype || 'unknown'})`, 400);
    if (file.size > config.maxUploadMb * 1024 * 1024) throw new AppError(`File too large (max ${config.maxUploadMb}MB)`, 400);
    // eslint-disable-next-line no-await-in-loop
    const buffer = Buffer.from(await file.arrayBuffer());
    files.push({ fieldname: name, originalname, mimetype, size: buffer.length, buffer });
  }
  return files;
}

function handler(field, maxCount, single) {
  return async (req, res, next) => {
    try {
      const files = await readFiles(req, field, maxCount);
      assertBuffersValid(files);
      for (const f of files) {
        // eslint-disable-next-line no-await-in-loop
        f.filename = await storage.saveBuffer(f.buffer, path.extname(f.originalname).toLowerCase(), f.mimetype);
        f.verified = true;
        delete f.buffer;
      }
      if (single) req.file = files[0]; else req.files = files;
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

module.exports = {
  single: (field) => handler(field, 1, true),
  array: (field, maxCount = 5) => handler(field, maxCount, false)
};
