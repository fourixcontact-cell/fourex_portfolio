/** Minimal, dependency-free replacements for the parts of Node's `crypto` the app uses. */
const getRandom = (n) => {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
};

function randomBytes(n) {
  return Buffer.from(getRandom(n));
}

function randomInt(min, max) {
  if (max === undefined) { max = min; min = 0; }
  const range = max - min;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / range) * range;
  do { globalThis.crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return min + (buf[0] % range);
}

/* SHA-1 (only used for deterministic ids, not for security). */
function sha1(bytes) {
  const ml = bytes.length * 8;
  const withOne = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;
  const view = new DataView(withOne.buffer);
  view.setUint32(withOne.length - 4, ml >>> 0);
  view.setUint32(withOne.length - 8, Math.floor(ml / 0x100000000));
  let h0 = 0x67452301; let h1 = 0xefcdab89; let h2 = 0x98badcfe; let h3 = 0x10325476; let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let i = 0; i < withOne.length; i += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(i + t * 4);
    for (let t = 16; t < 80; t += 1) { const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]; w[t] = (x << 1) | (x >>> 31); }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4;
    for (let t = 0; t < 80; t += 1) {
      const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = Buffer.alloc(20);
  [h0, h1, h2, h3, h4].forEach((h, i) => out.writeUInt32BE(h, i * 4));
  return out;
}

function createHash(alg) {
  if (alg !== 'sha1') throw new Error(`Unsupported hash ${alg}`);
  const parts = [];
  const api = {
    update(data) { parts.push(Buffer.from(typeof data === 'string' ? Buffer.from(data, 'utf8') : data)); return api; },
    digest(enc) { const d = sha1(Buffer.concat(parts)); return enc ? d.toString(enc) : d; }
  };
  return api;
}

module.exports = { randomBytes, randomInt, createHash };
