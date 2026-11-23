const path = require('../lib/path');
const AppError = require('../utils/AppError');

/**
 * The browser-declared MIME type can't be trusted. This checks the real bytes so a script
 * renamed to .pdf/.png is rejected before anything is written to Cloud Storage.
 */
const SIGS = {
  '.pdf': (b) => b.slice(0, 5).toString('latin1') === '%PDF-',
  '.png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.webp': (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  '.zip': (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5),
  '.docx': (b) => b[0] === 0x50 && b[1] === 0x4b,
  '.xlsx': (b) => b[0] === 0x50 && b[1] === 0x4b,
  '.pptx': (b) => b[0] === 0x50 && b[1] === 0x4b,
  '.doc': (b) => b.slice(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  '.xls': (b) => b.slice(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  '.txt': (b) => !b.includes(0), '.md': (b) => !b.includes(0), '.csv': (b) => !b.includes(0)
};

function verifyBuffer(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const head = file.buffer ? file.buffer.slice(0, 8192) : Buffer.alloc(0);
  return head.length > 0 && !!SIGS[ext]?.(head);
}

/** Throws on the first file whose content does not match its extension. */
function assertBuffersValid(files = []) {
  const bad = files.find((f) => !verifyBuffer(f));
  if (bad) throw new AppError(`"${bad.originalname}" does not look like a valid ${path.extname(bad.originalname).slice(1).toUpperCase()} file`, 400);
}

/** Kept for the controllers: uploads are verified by the upload middleware before storage. */
function assertFilesValid(files = []) {
  const bad = files.find((f) => !f.verified);
  if (bad) throw new AppError(`"${bad.originalname}" could not be verified`, 400);
}

module.exports = { assertFilesValid, assertBuffersValid, verifyBuffer };
