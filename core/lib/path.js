/** The two `path` helpers the app uses, without Node. */
const basename = (p) => String(p).replace(/\\/g, '/').split('/').pop();
const extname = (p) => { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; };
module.exports = { basename, extname };
