(function () {

const S = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./sdpz.js') : globalThis.sdpz;
const W = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./wordlist.js') : globalThis.sdpzWordlist;

const CAND_TYPES = ['host', 'srflx', 'prflx', 'relay'];
const ICE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const TYPE_PREF = { host: 126, prflx: 110, srflx: 100, relay: 0 };

class BW {
  constructor() { this.b = []; this.a = 0; this.n = 0; }
  w(v, k) {
    for (let i = k - 1; i >= 0; i--) {
      this.a = ((this.a << 1) | ((v >>> i) & 1)) & 0xff;
      if (++this.n === 8) { this.b.push(this.a); this.a = 0; this.n = 0; }
    }
  }
  get bits() { return this.b.length * 8 + this.n; }
  done() { const pad = this.n ? 8 - this.n : 0; if (this.n) this.b.push((this.a << pad) & 0xff); return new Uint8Array(this.b); }
}
class BR {
  constructor(u) { this.u = u; this.p = 0; this.end = u.length * 8; }
  r(k) {
    if (this.p + k > this.end) throw new Error('code is too short');
    let v = 0;
    for (let i = 0; i < k; i++) { v = v * 2 + ((this.u[this.p >> 3] >> (7 - (this.p & 7))) & 1); this.p++; }
    return v;
  }
}


function tailBits(bytes, usedBits) {
  const pad = bytes.length * 8 - usedBits;
  if (pad === 0) return { pad: 0, want: 0 };
  const clean = bytes.slice();
  clean[clean.length - 1] &= (0xff << pad) & 0xff;      // zero the pad region
  const h = S.sha256(clean);
  return { pad, want: h[0] >> (8 - pad) };
}


const isV4 = (a) => /^\d+\.\d+\.\d+\.\d+$/.test(a);
const v4Int = (a) => a.split('.').reduce((n, o) => (n * 256 + Number(o)) >>> 0, 0);
const intV4 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

function v4Shape(n) {
  if ((n >>> 24) === 10) return [1, 24, n & 0xffffff];
  if ((n >>> 16) === 0xc0a8) return [2, 16, n & 0xffff];
  if ((n >>> 20) === 0xac1) return [3, 20, n & 0xfffff];
  return [0, 32, n >>> 0];
}
const v4Unshape = (s, v) => (s === 1 ? 0x0a000000 + v : s === 2 ? 0xc0a80000 + v : s === 3 ? 0xac100000 + v : v) >>> 0;

/**
 * @param {string} sdp  the SDP from createOffer()/createAnswer(), already
 *                      passed through sdpz.withDerivedCredentials()
 * @param {object} [o]
 * @param {number} [o.maxCandidates=0]  0 = rely on peer-reflexive discovery
 * @returns {{bytes:Uint8Array, bits:number}}
 */
function packMini(sdp, o = {}) {
  const maxCand = Math.min(o.maxCandidates ?? 0, 4);
  const f = S.parseSdp(sdp, o.type);

  if (f.fpAlg !== 'sha-256') throw new Error('handoff: profile requires a sha-256 fingerprint');
  const d = S.deriveCredentials(f.fingerprint);
  const derived = f.ufrag === d.ufrag && f.pwd === d.pwd;
  if (!derived && o.requireDerived) {
    throw new Error('handoff: run the SDP through sdpz.withDerivedCredentials() before setLocalDescription()');
  }
  if (!derived) {
    for (const ch of f.ufrag + f.pwd) {
      if (!/[A-Za-z0-9+/]/.test(ch)) throw new Error('handoff: unexpected character in ICE credentials');
    }
  }

  let cands = f.candidates.filter((c) => c.proto === 'udp');
  const rank = { srflx: 0, host: 1, relay: 2, prflx: 3 };
  cands.sort((a, b) => rank[a.type] - rank[b.type]);
  cands = cands.slice(0, maxCand);

  const w = new BW();
  w.w(derived ? 0 : 1, 1);
  w.w(f.role === 'answer' ? 1 : 0, 1);
  w.w(cands.length ? 1 : 0, 1);
  if (cands.length) {
    w.w(cands.length - 1, 2);
    for (const c of cands) {
      w.w(CAND_TYPES.indexOf(c.type), 2);
      if (c.mdns) {
        w.w(2, 2);
        for (const b of uuidBytes(c.addr)) w.w(b, 8);
      }
      else if (isV4(c.addr)) {
        w.w(0, 2);
        const [shape, bits, val] = v4Shape(v4Int(c.addr));
        w.w(shape, 2); w.w(val, bits);
      }
      else {
        w.w(1, 2);
        for (const b of v6Bytes(c.addr)) w.w(b, 8);
      }
      w.w(c.port, 16);
    }
  }
  if (!derived) {
    w.w(f.ufrag.length - 1, 5);
    w.w(f.pwd.length - 1, 6);
    for (const ch of f.ufrag) w.w(ICE_CHARS.indexOf(ch), 6);
    for (const ch of f.pwd) w.w(ICE_CHARS.indexOf(ch), 6);
  }
  for (const b of f.fingerprint) w.w(b, 8);
  const bits = w.bits;
  const bytes = w.done();
  const { pad, want } = tailBits(bytes, bits);
  if (pad) bytes[bytes.length - 1] |= want;
  return { bytes, bits };
}

function unpackMini(bytes) {
  const r = new BR(bytes);
  const derived = r.r(1) === 0;
  const role = r.r(1) ? 'answer' : 'offer';
  const hasCand = r.r(1);
  const candidates = [];
  if (hasCand) {
    const n = r.r(2) + 1;
    for (let i = 0; i < n; i++) {
      const type = CAND_TYPES[r.r(2)];
      const fam = r.r(2);
      let addr, mdns = false;
      if (fam === 0) {
        const shape = r.r(2);
        addr = intV4(v4Unshape(shape, r.r([32, 24, 16, 20][shape])));
      }
      else if (fam === 1) {
        const b = new Uint8Array(16);
        for (let k = 0; k < 16; k++) b[k] = r.r(8);
        addr = v6Str(b);
      }
      else if (fam === 2) {
        const b = new Uint8Array(16);
        for (let k = 0; k < 16; k++) b[k] = r.r(8);
        addr = uuidStr(b); mdns = true;
      }
      else {
        throw new Error('unknown code type');
      }
      candidates.push({ type, proto: 'udp', addr, port: r.r(16), tcptype: null, mdns });
    }
  }
  let ufrag = null, pwd = null;
  if (!derived) {
    const ul = r.r(5) + 1, pl = r.r(6) + 1;
    ufrag = ''; pwd = '';
    for (let i = 0; i < ul; i++) ufrag += ICE_CHARS[r.r(6)];
    for (let i = 0; i < pl; i++) pwd += ICE_CHARS[r.r(6)];
  }
  const fingerprint = new Uint8Array(32);
  for (let i = 0; i < 32; i++) fingerprint[i] = r.r(8);

  const used = r.p;
  // zero-fill extra space
  const need = Math.ceil(used / 8);
  if (bytes.length < need) throw new Error('code is too short');
  if (bytes.length > need + 2) throw new Error('code is too long');
  for (let i = need; i < bytes.length; i++) {
    if (bytes[i] !== 0) throw new Error('wrong alphabet for this code');
  }
  const body = bytes.subarray(0, need);
  const { pad, want } = tailBits(body, used);
  if (pad && (body[need - 1] & ((1 << pad) - 1)) !== want) {
    throw new Error('checksum failed — something in that code is wrong');
  }

  if (derived) ({ ufrag, pwd } = S.deriveCredentials(fingerprint));
  const fields = {
    role, setup: role === 'answer' ? 'active' : 'actpass',
    ufrag, pwd, fpAlg: 'sha-256', fingerprint,
    sctpPort: 5000, maxMessageSize: 262144, candidates,
  };
  return { type: role, sdp: S.buildSdp(fields), fields, bits: used };
}


function uuidBytes(a) {
  const hex = a.replace(/\.local$/i, '').replace(/-/g, '');
  const o = new Uint8Array(16);
  for (let i = 0; i < 16; i++) o[i] = parseInt(hex.substr(i * 2, 2), 16);
  return o;
}
function uuidStr(b) {
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}.local`;
}

function v6Bytes(a) {
  const z = a.indexOf('%'); if (z >= 0) a = a.slice(0, z);
  const [h = '', t = ''] = a.split('::');
  const hs = h.split(':').filter(Boolean), ts = t.split(':').filter(Boolean);
  const g = a.includes('::') ? [...hs, ...new Array(8 - hs.length - ts.length).fill('0'), ...ts] : hs;
  const o = new Uint8Array(16);
  g.forEach((x, i) => { const v = parseInt(x, 16) || 0; o[i * 2] = v >> 8; o[i * 2 + 1] = v & 255; });
  return o;
}
function v6Str(b) {
  const g = []; for (let i = 0; i < 16; i += 2) g.push(((b[i] << 8) | b[i + 1]).toString(16));
  let best = -1, bl = 0, cur = -1, cl = 0;
  for (let i = 0; i < 8; i++) {
    if (g[i] === '0') { if (cur < 0) { cur = i; cl = 0; } if (++cl > bl) { bl = cl; best = cur; } }
    else { cur = -1; cl = 0; }
  }
  return bl < 2 ? g.join(':') : g.slice(0, best).join(':') + '::' + g.slice(best + bl).join(':');
}


const CJK = 0x4e00;
const C32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const C32_IN = new Map([...C32].map((c, i) => [c, i]));
for (const [k, v] of [['O', 0], ['I', 1], ['L', 1], ['U', 27]]) C32_IN.set(k, v);

/* ------------------------------------------------------------------ *
 * Paste service (short-code style)
 *
 * The payload is XOR-obfuscated with a pre-shared key before upload, so
 * the paste server only ever stores an opaque v1.-prefixed blob.
 * ------------------------------------------------------------------ */

const PASTE_BASE = 'https://lesma.eu';

// Keys look like the base64url/b32 codes but are much shorter
const KEY_SHAPE = /^[A-Za-z0-9_-]{2,16}$/;

// Pre-shared key for the short-code payload
const PASTE_PSK = 'hnb6thENXYlC7AHY2gFVwSfhookBgjkAjPUvEtnY0fQ';
const PASTE_KEY = new TextEncoder().encode(PASTE_PSK);

// Payload format: v1. + base64url(offset || xor(payload))
const PASTE_FMT = 'v1.';

// XOR the bytes with the key rotated by a random one-byte offset, so the
// same plaintext never produces the same ciphertext
function xorPaste(data, offset) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ PASTE_KEY[(i + offset) % PASTE_KEY.length];
  }
  return out;
}

// Encrypt a connection code for upload
function encryptPaste(code) {
  const data = new TextEncoder().encode(String(code));
  const offset = (Math.random() * PASTE_KEY.length) | 0;
  const buf = new Uint8Array(1 + data.length);
  buf[0] = offset;
  buf.set(xorPaste(data, offset), 1);
  return PASTE_FMT + S.toBase64url(buf);
}

// Decrypt a v1.-prefixed payload back into a connection code
function decryptPaste(payload) {
  let raw;
  try {
    raw = S.fromBase64url(String(payload).slice(PASTE_FMT.length).trim());
  } catch (e) {
    throw new Error('that short code could not be read, ask the peer to send a fresh one');
  }
  const offset = raw.length ? raw[0] : 0;
  if (raw.length < 2 || offset >= PASTE_KEY.length) {
    throw new Error('that short code could not be read, ask the peer to send a fresh one');
  }
  return new TextDecoder().decode(xorPaste(raw.slice(1), offset));
}

// Pull the paste key out of a lesma response: the final URL after a
// 303 redirect, or the paste URL shown in the HTML page title
function pasteKeyFrom(finalUrl, text) {
  let u = null;
  try { u = new URL(finalUrl); } catch (e) { /* opaque redirect */ }
  if (u && u.pathname !== '/') {
    const seg = u.pathname.split('/').filter(Boolean).pop();
    if (seg) return seg;
  }
  const t = String(text);
  let m = t.match(/<title>\s*lesma\/([A-Za-z0-9_-]+)\s*<\/title>/i);
  if (m) return m[1];
  m = t.match(/https?:\/\/\S*lesma\.eu\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

// Upload a code to the paste service (XOR-obfuscated) and resolve with its key.
function publishKey(code) {
  const fd = new FormData();
  fd.append('lesma', encryptPaste(code));
  return fetch(PASTE_BASE, { method: 'POST', body: fd })
    .then(function (res) {
      if (!res.ok) throw new Error('the paste service is unavailable, try again later');
      return res.text().then(function (text) {
        const key = pasteKeyFrom(res.url, text);
        if (!key) throw new Error('the paste service did not return a key, try again later');
        return key;
      });
    })
    .catch(function (e) {
      // fetch rejects with a TypeError when the network request fails
      if (e instanceof TypeError) throw new Error('could not reach the paste service, check your connection');
      throw e;
    });
}

// Fetch a published key and resolve with its decoded connection code.
// v1. payloads are XOR-decrypted first
function fetchKey(key) {
  return fetch(PASTE_BASE + '/' + encodeURIComponent(key) + '?raw')
    .then(function (res) {
      if (res.status === 404) throw new Error('could not retrieve that short code, check the key and try again');
      if (!res.ok) throw new Error('the paste service is unavailable, try again later');
      return res.text();
    })
    .then(function (text) {
      const payload = text.trim();
      if (payload.indexOf(PASTE_FMT) === 0) return decode(decryptPaste(payload));
      return decode(payload);
    })
    .catch(function (e) {
      if (e instanceof TypeError) throw new Error('could not reach the paste service, check your connection');
      throw e;
    });
}

function toB32(u8) {
  let acc = 0, n = 0, out = '';
  for (const b of u8) {
    acc = (acc << 8) | b; n += 8;
    while (n >= 5) { out += C32[(acc >> (n - 5)) & 31]; n -= 5; }
  }
  if (n) out += C32[(acc << (5 - n)) & 31];
  return out;
}
function fromB32(str) {
  let acc = 0, n = 0; const out = [];
  for (const ch of str.toUpperCase()) {
    const v = C32_IN.get(ch);
    if (v == null) throw new Error(`bad character "${ch}"`);
    acc = (acc << 5) | v; n += 5;
    while (n >= 8) { out.push((acc >> (n - 8)) & 0xff); n -= 8; }
  }
  return Uint8Array.from(out);
}

const group = (s, n) => s.match(new RegExp(`.{1,${n}}`, 'g')).join('-');

const RENDER = {
  // 24 english words
  words: {
    label: 'words',
    to: (b) => W.toWords(W.bytesToIndices(b, Math.ceil((b.length * 8) / 11))),
    from: (s) => W.indicesToBytes(W.fromWords(s)),
    shape: (s) => {
      const t = s.split(/[^A-Za-z]+/).filter(Boolean);
      return t.length >= 6 && t.every((x) => x.length >= 3);
    },
    size: (n) => Math.ceil((n * 8) / 11) + ' words',
  },

  // 53 Crockford base32 characters
  terse: {
    label: 'type',
    to: (b) => group(toB32(b), 4),
    from: (s) => fromB32(s.replace(/[^0-9A-Za-z]/g, '')),
    shape: (s) => {
      const t = s.replace(/[^0-9A-Za-z]/g, '');
      return t.length > 0 && [...t.toUpperCase()].every((c) => C32_IN.has(c));
    },
    size: (n) => Math.ceil((n * 8) / 5) + ' characters',
  },

  // 19 CJK ideographs
  cjk: {
    label: 'paste',
    to: (b) => S.toBase16384(b),
    from: (s) => S.fromBase16384(s.trim()),
    shape: (s) => s.charCodeAt(0) >= CJK && s.charCodeAt(0) < CJK + 16384,
    size: (n) => Math.ceil((n * 8) / 14) + ' characters',
  },

  // 44 base64url safe characters
  b64: {
    label: 'link',
    to: (b) => S.toBase64url(b),
    from: (s) => S.fromBase64url(s.trim()),
    shape: (s) => /^[A-Za-z0-9_-]+$/.test(s.trim()),
    size: (n) => Math.ceil((n * 8) / 6) + ' characters',
  },

  // Pastebin shortcode
  short: {
    label: 'shortcode',
    shape: (s) => KEY_SHAPE.test(s.trim()),
    size: () => '1 key',
  },
};

// Encode an SDP into a connection code. style: words|terse|cjk|b64
// ('short' uploads to the paste service and is async, see encodeAsync())
function encode(sdp, style = 'words', opts = {}) {
  if (style === 'short') throw new Error("the 'short' style uploads to the paste service, use encodeAsync()");
  const { bytes } = packMini(sdp, opts);
  return RENDER[style].to(bytes);
}

// Async version of encode() that also supports the 'short' style: the
// base64url payload is XOR-obfuscated and published to the paste
// service, and the resulting key is returned.
function encodeAsync(sdp, style = 'words', opts = {}) {
  if (style === 'short') return publishKey(encode(sdp, 'b64', opts));
  return Promise.resolve(encode(sdp, style, opts));
}

// Decode any of the four code types
function decode(str) {
  const s = String(str).trim();
  if (!s) throw new Error('empty code');

  const hits = [];
  const errors = [];
  for (const style of ['cjk', 'words', 'b64', 'terse']) {
    const r = RENDER[style];
    let shaped;
    try { shaped = r.shape(s); } catch { shaped = false; }
    if (!shaped) continue;
    try { hits.push({ style, ...unpackMini(r.from(s)) }); }
    catch (e) { errors.push(`${style}: ${e.message}`); }
  }

  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    for (const style of ['cjk', 'words']) {
      const h = hits.find((x) => x.style === style);
      if (h) return h;
    }
    const want = /[a-z_]/.test(s.replace(/-/g, '')) ? 'b64' : 'terse';
    return hits.find((h) => h.style === want) ?? hits[0];
  }
  throw new Error(errors.length
    ? 'invalid code: ' + errors[0]
    : 'invalid code');
}

const detect = (s) => { try { return decode(s).style; } catch { return null; } };

function toLink(sdp, base, opts = {}) {
  const href = base ?? (typeof location !== 'undefined' ? location.href.split('#')[0] : '');
  return href + '#' + encode(sdp, 'b64', opts);
}
function fromLink(url) {
  const h = String(url).split('#')[1];
  if (!h) throw new Error('no code in that link');
  return decode(decodeURIComponent(h));
}

/**
 * Async counterpart of decode() that also resolves short codes.
 *
 * Attempts the following:
 *   1. A "Link" URL (code in the fragment) or a full paste URL.
 *   2. A direct code in any sync alphabet (checksum-verified).
 *   3. A paste key: fetch the payload and decode it.
 *
 * Resolves to { type, sdp, fields, bits, style, source } where source is
 * 'link', 'short', or one of the alphabet names.
 */
function resolve(raw) {
  const s = String(raw).trim();
  if (!s) return Promise.reject(new Error('empty code'));

  // 1. Links carry the code in a fragment; a full paste URL is a key too
  if (s.indexOf('#') !== -1) {
    const d = fromLink(s); d.source = 'link';
    return Promise.resolve(d);
  }
  const pasteUrl = s.match(/^https?:\/\/lesma\.eu\/([A-Za-z0-9_-]+)/i);
  if (pasteUrl) return fetchKey(pasteUrl[1]).then(function (d) { d.source = 'short'; return d; });

  // 2. A direct code in any alphabet
  try {
    const d = decode(s); d.source = d.style;
    return Promise.resolve(d);
  } catch (e) {
    const localError = e;

    // 3. A paste key. A real connection code is at least 19 characters,
    //    so if the fetch fails on a short input, report it (dead key or
    //    typo) instead of the misleading alphabet decode error.
    if (RENDER.short.shape(s)) {
      return fetchKey(s)
        .then(function (d) { d.source = 'short'; return d; })
        .catch(function (keyError) {
          if (s.length < 19) throw keyError;
          throw localError;
        });
    }
    return Promise.reject(localError);
  }
}

function sizes(withCandidates = 0, derivedCreds = true) {
  const bits = 259 + (derivedCreds ? 0 : 11 + 28 * 6) + (withCandidates ? 2 + withCandidates * 54 : 0);
  const n = Math.ceil(bits / 8);
  const out = { bits, bytes: n };
  for (const [k, r] of Object.entries(RENDER)) out[k] = r.size(n);
  return out;
}

const handoff = {
  packMini, unpackMini, encode, encodeAsync, decode, resolve, detect,
  toLink, fromLink, sizes, publishKey, fetchKey, pasteKeyFrom,
  encryptPaste, decryptPaste,
  PASTE_BASE, PASTE_PSK, KEY_SHAPE, RENDER,
};
if (typeof module !== 'undefined' && module.exports) module.exports = handoff;
if (typeof globalThis !== 'undefined') globalThis.sdpzHandoff = handoff;
})();
