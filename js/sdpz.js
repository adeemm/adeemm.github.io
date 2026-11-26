/**
 * Compression library for WebRTC SDP
 *
 * Only keeps:
 *   - DTLS fingerprint      32 bytes
 *   - ICE ufrag + pwd       21 bytes
 *   - ICE candidates        ~7 bytes each
 *   - flags/role/setup      2 bytes
 *
 * Everything else (v=, o=, s=, t=, m=, c=, mid, bundle, sctp-port,
 * candidate foundation/priority/component/generation) is reconstructed.
 */

(function () {


class BitWriter {
  constructor() { this.bytes = []; this.acc = 0; this.n = 0; }
  write(value, width) {
    for (let i = width - 1; i >= 0; i--) {
      this.acc = ((this.acc << 1) | ((value >>> i) & 1)) & 0xff;
      if (++this.n === 8) { this.bytes.push(this.acc); this.acc = 0; this.n = 0; }
    }
  }
  writeBytes(arr) { for (const b of arr) this.write(b, 8); }
  get bitLength() { return this.bytes.length * 8 + this.n; }
  finish() {
    if (this.n > 0) { this.bytes.push((this.acc << (8 - this.n)) & 0xff); this.acc = 0; this.n = 0; }
    return new Uint8Array(this.bytes);
  }
}

class BitReader {
  constructor(u8) { this.u8 = u8; this.pos = 0; }
  read(width) {
    let v = 0;
    for (let i = 0; i < width; i++) {
      const byte = this.u8[this.pos >> 3] ?? 0;
      v = v * 2 + ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }
  readBytes(n) { const o = new Uint8Array(n); for (let i = 0; i < n; i++) o[i] = this.read(8); return o; }
}


const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

function sha256(bytes) {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const l = bytes.length;
  const buf = new Uint8Array((((l + 9) >> 6) + 1) << 6);
  buf.set(bytes);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(buf.length - 4, l * 8, false);
  const w = new Uint32Array(64);
  for (let off = 0; off < buf.length; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15], y = w[t - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K256[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i], false);
  return out;
}


const B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64url(u8) {
  let out = '', i = 0;
  for (; i + 2 < u8.length; i += 3) {
    const n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2];
    out += B64U[(n >> 18) & 63] + B64U[(n >> 12) & 63] + B64U[(n >> 6) & 63] + B64U[n & 63];
  }
  const rem = u8.length - i;
  if (rem === 1) { const n = u8[i] << 16; out += B64U[(n >> 18) & 63] + B64U[(n >> 12) & 63]; }
  else if (rem === 2) { const n = (u8[i] << 16) | (u8[i + 1] << 8); out += B64U[(n >> 18) & 63] + B64U[(n >> 12) & 63] + B64U[(n >> 6) & 63]; }
  return out;
}

function fromBase64url(s) {
  const bits = [];
  for (const ch of s) {
    const v = B64U.indexOf(ch);
    if (v < 0) throw new Error('bad base64url char: ' + ch);
    bits.push(v);
  }
  const out = new Uint8Array(Math.floor((bits.length * 6) / 8));
  let acc = 0, n = 0, p = 0;
  for (const v of bits) {
    acc = (acc << 6) | v; n += 6;
    while (n >= 8) { out[p++] = (acc >> (n - 8)) & 0xff; n -= 8; }
  }
  return out;
}

// Base16384: 14 bits per character, mapped into a block of CJK Unified Ideographs (U+4E00..U+8DFF).
const B16K_BASE = 0x4e00;

function toBase16384(u8) {
  let out = '', acc = 0, n = 0;
  for (const b of u8) {
    acc = (acc << 8) | b; n += 8;
    if (n >= 14) { out += String.fromCharCode(B16K_BASE + ((acc >> (n - 14)) & 0x3fff)); n -= 14; }
  }
  if (n > 0) out += String.fromCharCode(B16K_BASE + ((acc << (14 - n)) & 0x3fff));
  return out;
}

function fromBase16384(s) {
  const out = [];
  let acc = 0, n = 0;
  for (let i = 0; i < s.length; i++) {
    const v = s.charCodeAt(i) - B16K_BASE;
    if (v < 0 || v > 0x3fff) throw new Error('bad base16384 char at ' + i);
    acc = (acc << 14) | v; n += 14;
    while (n >= 8) { out.push((acc >> (n - 8)) & 0xff); n -= 8; }
  }
  return new Uint8Array(out);
}

/* ------------------------------------------------------------------ *
 * Derived ICE credentials
 * ------------------------------------------------------------------ */

// ICE allows ALPHA / DIGIT / "+" / "/"
const ICE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function iceCharsFrom(bytes, count) {
  let out = '', acc = 0, n = 0, i = 0;
  while (out.length < count) {
    if (n < 6) { acc = (acc << 8) | bytes[i++ % bytes.length]; n += 8; }
    out += ICE_CHARS[(acc >> (n - 6)) & 63]; n -= 6;
  }
  return out;
}

/**
 * Derive ICE ufrag/pwd deterministically from the DTLS fingerprint.
 * Both peers can compute these from data already in the blob
 */
function deriveCredentials(fingerprintBytes) {
  const tag = new TextEncoder().encode('sdpz/v1/ice\u0000');
  const seed = new Uint8Array(tag.length + fingerprintBytes.length);
  seed.set(tag); seed.set(fingerprintBytes, tag.length);
  const h1 = sha256(seed);
  const h2 = sha256(h1);
  return { ufrag: iceCharsFrom(h1, 4), pwd: iceCharsFrom(h2, 24) };
}

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const VERSION = 0;
const FP_ALGS = ['sha-256', 'sha-1', 'sha-224', 'sha-384', 'sha-512', 'md5', 'md2', 'token'];
const FP_LEN = { 'sha-1': 20, 'sha-224': 28, 'sha-256': 32, 'sha-384': 48, 'sha-512': 64, 'md5': 16, 'md2': 16 };
const SETUPS = [null, 'actpass', 'active', 'passive'];
const MMS = [65536, 262144, 1073741823, null];
const CAND_TYPES = ['host', 'srflx', 'prflx', 'relay'];
const TYPE_PREF = { host: 126, prflx: 110, srflx: 100, relay: 0 };
const TCP_TYPES = ['active', 'passive', 'so', 'active'];

/* ------------------------------------------------------------------ *
 * Address helpers
 * ------------------------------------------------------------------ */

const isV4 = (a) => /^\d+\.\d+\.\d+\.\d+$/.test(a);

function v4ToInt(a) {
  const p = a.split('.').map(Number);
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
const intToV4 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

// RFC1918 shapes let LAN candidates drop 1–2 bytes.
function v4Shape(n) {
  if ((n >>> 24) === 10) return { shape: 1, bits: 24, val: n & 0x00ffffff };
  if ((n >>> 16) === 0xc0a8) return { shape: 2, bits: 16, val: n & 0x0000ffff };
  if ((n >>> 20) === 0xac1) return { shape: 3, bits: 20, val: n & 0x000fffff };
  return { shape: 0, bits: 32, val: n >>> 0 };
}
function v4Unshape(shape, val) {
  if (shape === 1) return ((10 << 24) >>> 0) + val;
  if (shape === 2) return ((0xc0a8 << 16) >>> 0) + val;
  if (shape === 3) return ((0xac1 << 20) >>> 0) + val;
  return val >>> 0;
}

function v6ToBytes(a) {
  const zone = a.indexOf('%'); if (zone >= 0) a = a.slice(0, zone);
  const [head, tail = ''] = a.split('::');
  const h = head ? head.split(':').filter(Boolean) : [];
  const t = tail ? tail.split(':').filter(Boolean) : [];
  const mid = new Array(8 - h.length - t.length).fill('0');
  const groups = a.includes('::') ? [...h, ...mid, ...t] : h;
  const out = new Uint8Array(16);
  groups.forEach((g, i) => { const v = parseInt(g, 16) || 0; out[i * 2] = v >> 8; out[i * 2 + 1] = v & 255; });
  return out;
}
function bytesToV6(b) {
  const g = [];
  for (let i = 0; i < 16; i += 2) g.push(((b[i] << 8) | b[i + 1]).toString(16));
  let best = -1, bestLen = 0, cur = -1, curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (g[i] === '0') { if (cur < 0) { cur = i; curLen = 0; } curLen++; if (curLen > bestLen) { best = cur; bestLen = curLen; } }
    else { cur = -1; curLen = 0; }
  }
  if (bestLen < 2) return g.join(':');
  return g.slice(0, best).join(':') + '::' + g.slice(best + bestLen).join(':');
}

/* ------------------------------------------------------------------ *
 * SDP parsing
 * ------------------------------------------------------------------ */

function parseSdp(sdp, type) {
  const lines = sdp.split(/\r\n|\n/).map((l) => l.trim()).filter(Boolean);
  const grab = (re) => { for (const l of lines) { const m = l.match(re); if (m) return m; } return null; };

  const uf = grab(/^a=ice-ufrag:(.+)$/);
  const pw = grab(/^a=ice-pwd:(.+)$/);
  const fp = grab(/^a=fingerprint:(\S+)\s+(\S+)$/i);
  const su = grab(/^a=setup:(\S+)$/);
  const sp = grab(/^a=sctp-port:(\d+)$/);
  const mm = grab(/^a=max-message-size:(\d+)$/);

  if (!uf || !pw) throw new Error('sdpz: SDP has no ICE credentials');
  if (!fp) throw new Error('sdpz: SDP has no DTLS fingerprint');

  const alg = fp[1].toLowerCase();
  const hex = fp[2].replace(/:/g, '');
  const fpBytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < fpBytes.length; i++) fpBytes[i] = parseInt(hex.substr(i * 2, 2), 16);

  const setup = su ? su[1] : 'actpass';
  const role = type || (setup === 'actpass' ? 'offer' : 'answer');

  const candidates = [];
  const seen = new Set();
  for (const l of lines) {
    const m = l.match(/^a=candidate:(\S+) (\d+) (\S+) (\d+) (\S+) (\d+) typ (\S+)(.*)$/i);
    if (!m) continue;
    if (m[2] !== '1') continue;               // RTCP component is dead weight under rtcp-mux
    const proto = m[3].toLowerCase();
    if (proto !== 'udp' && proto !== 'tcp') continue;
    const addr = m[5];
    const mdns = /^[0-9a-f-]{36}\.local$/i.test(addr);
    if (/\.local$/i.test(addr) && !mdns) continue;
    const ctype = m[7].toLowerCase();
    if (!CAND_TYPES.includes(ctype)) continue;
    const tcptype = (m[8].match(/tcptype (\S+)/) || [])[1] || 'active';
    if (proto === 'tcp' && Number(m[6]) === 0) continue; // TCP active placeholders carry no info
    const key = `${proto}|${addr}|${m[6]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ type: ctype, proto, addr, port: Number(m[6]), tcptype, mdns });
  }

  return {
    role,
    setup,
    ufrag: uf[1],
    pwd: pw[1],
    fpAlg: alg,
    fingerprint: fpBytes,
    sctpPort: sp ? Number(sp[1]) : 5000,
    maxMessageSize: mm ? Number(mm[1]) : 262144,
    candidates,
  };
}

/* ------------------------------------------------------------------ *
 * Pack / unpack
 * ------------------------------------------------------------------ */

/**
 * @param {string} sdp
 * @param {object} [opts]
 * @param {'offer'|'answer'} [opts.type]
 * @param {boolean} [opts.deriveCreds=true]  omit ufrag/pwd (saves 21 bytes)
 * @param {number}  [opts.maxCandidates=15]
 * @param {boolean} [opts.dropCandidates=false] omit all candidates entirely
 * @returns {Uint8Array}
 */
function pack(sdp, opts = {}) {
  const { deriveCreds = true, maxCandidates = 15, dropCandidates = false } = opts;
  const s = parseSdp(sdp, opts.type);

  if (deriveCreds) {
    const d = deriveCredentials(s.fingerprint);
    if (s.ufrag !== d.ufrag || s.pwd !== d.pwd) {
      throw new Error(
        'sdpz: deriveCreds mode requires the local SDP to already use derived ICE ' +
        'credentials. Run the SDP through withDerivedCredentials() before ' +
        'setLocalDescription(), or pass { deriveCreds: false }.'
      );
    }
  }

  let cands = dropCandidates ? [] : s.candidates.filter((c) => !c.mdns);
  // Prefer the candidates most likely to produce a connection.
  const rank = { srflx: 0, host: 1, relay: 2, prflx: 3 };
  cands.sort((a, b) => (rank[a.type] - rank[b.type]) || (a.proto === 'udp' ? -1 : 1));
  cands = cands.slice(0, Math.min(maxCandidates, 15));

  const w = new BitWriter();
  w.write(VERSION, 3);
  w.write(deriveCreds ? 0 : 1, 1);
  w.write(s.role === 'answer' ? 1 : 0, 1);

  const defaultSetup = s.role === 'answer' ? 'active' : 'actpass';
  w.write(s.setup === defaultSetup ? 0 : SETUPS.indexOf(s.setup), 2);

  const mmsIdx = MMS.indexOf(s.maxMessageSize);
  w.write(mmsIdx < 0 ? 3 : mmsIdx, 2);

  w.write(s.sctpPort === 5000 ? 0 : 1, 1);

  const algIdx = FP_ALGS.indexOf(s.fpAlg);
  if (algIdx < 0) throw new Error('sdpz: unsupported fingerprint alg ' + s.fpAlg);
  w.write(algIdx === 0 ? 0 : 1, 1);
  if (algIdx !== 0) w.write(algIdx, 3);

  w.write(cands.length, 4);

  if (mmsIdx < 0) w.write(s.maxMessageSize, 32);
  if (s.sctpPort !== 5000) w.write(s.sctpPort, 16);

  if (!deriveCreds) {
    w.write(s.ufrag.length - 1, 5);
    w.write(s.pwd.length - 1, 8);
    for (const ch of s.ufrag) {
      const v = ICE_CHARS.indexOf(ch);
      if (v < 0) throw new Error('sdpz: non-ICE char in ufrag: ' + ch);
      w.write(v, 6);
    }
    for (const ch of s.pwd) {
      const v = ICE_CHARS.indexOf(ch);
      if (v < 0) throw new Error('sdpz: non-ICE char in pwd: ' + ch);
      w.write(v, 6);
    }
  }

  w.writeBytes(s.fingerprint);

  for (const c of cands) {
    w.write(CAND_TYPES.indexOf(c.type), 2);
    w.write(c.proto === 'tcp' ? 1 : 0, 1);
    if (c.proto === 'tcp') w.write(TCP_TYPES.indexOf(c.tcptype) & 3, 2);
    if (isV4(c.addr)) {
      w.write(0, 1);
      const { shape, bits, val } = v4Shape(v4ToInt(c.addr));
      w.write(shape, 2);
      w.write(val, bits);
    }
    else {
      w.write(1, 1);
      const b = v6ToBytes(c.addr);
      const linkLocal = b[0] === 0xfe && (b[1] & 0xc0) === 0x80 &&
        b[2] === 0 && b[3] === 0 && b[4] === 0 && b[5] === 0 && b[6] === 0 && b[7] === 0;
      w.write(linkLocal ? 1 : 0, 1);
      w.writeBytes(linkLocal ? b.slice(8) : b);
    }
    w.write(c.port, 16);
  }

  return w.finish();
}

/**
 * @param {Uint8Array} bytes
 * @returns {{type:'offer'|'answer', sdp:string, fields:object}}
 */
function unpack(bytes) {
  const r = new BitReader(bytes);
  const version = r.read(3);
  if (version !== VERSION) throw new Error('sdpz: unknown version ' + version);

  const explicitCreds = r.read(1) === 1;
  const role = r.read(1) === 1 ? 'answer' : 'offer';
  const setupIdx = r.read(2);
  const mmsIdx = r.read(2);
  const sctpFlag = r.read(1);
  const algFlag = r.read(1);
  const algIdx = algFlag ? r.read(3) : 0;
  const candCount = r.read(4);

  const maxMessageSize = mmsIdx === 3 ? r.read(32) : MMS[mmsIdx];
  const sctpPort = sctpFlag ? r.read(16) : 5000;

  let ufrag = null, pwd = null;
  if (explicitCreds) {
    const ul = r.read(5) + 1;
    const pl = r.read(8) + 1;
    ufrag = ''; pwd = '';
    for (let i = 0; i < ul; i++) ufrag += ICE_CHARS[r.read(6)];
    for (let i = 0; i < pl; i++) pwd += ICE_CHARS[r.read(6)];
  }

  const fpAlg = FP_ALGS[algIdx];
  const fingerprint = r.readBytes(FP_LEN[fpAlg] ?? 32);

  if (!explicitCreds) ({ ufrag, pwd } = deriveCredentials(fingerprint));

  const candidates = [];
  for (let i = 0; i < candCount; i++) {
    const type = CAND_TYPES[r.read(2)];
    const proto = r.read(1) ? 'tcp' : 'udp';
    const tcptype = proto === 'tcp' ? TCP_TYPES[r.read(2)] : null;
    let addr;
    if (r.read(1) === 0) {
      const shape = r.read(2);
      const bits = [32, 24, 16, 20][shape];
      addr = intToV4(v4Unshape(shape, r.read(bits)));
    } else {
      if (r.read(1) === 1) {
        const suffix = r.readBytes(8);
        const full = new Uint8Array(16);
        full[0] = 0xfe; full[1] = 0x80;
        full.set(suffix, 8);
        addr = bytesToV6(full);
      } else {
        addr = bytesToV6(r.readBytes(16));
      }
    }
    const port = r.read(16);
    candidates.push({ type, proto, addr, port, tcptype });
  }

  const setup = setupIdx === 0 ? (role === 'answer' ? 'active' : 'actpass') : SETUPS[setupIdx];
  const fields = { role, setup, ufrag, pwd, fpAlg, fingerprint, sctpPort, maxMessageSize, candidates };
  return { type: role, sdp: buildSdp(fields), fields };
}

/* ------------------------------------------------------------------ *
 * SDP reconstruction
 * ------------------------------------------------------------------ */

const hexFp = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(':');

function buildSdp(f) {
  const L = [
    'v=0',
    'o=- 1 1 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    'a=ice-ufrag:' + f.ufrag,
    'a=ice-pwd:' + f.pwd,
    'a=ice-options:trickle',
    'a=fingerprint:' + f.fpAlg + ' ' + hexFp(f.fingerprint),
    'a=setup:' + f.setup,
    'a=mid:0',
    'a=sctp-port:' + f.sctpPort,
    'a=max-message-size:' + f.maxMessageSize,
  ];

  f.candidates.forEach((c, i) => {
    // RFC 8445 5.1.2.1
    const priority = TYPE_PREF[c.type] * 16777216 + (65535 - i) * 256 + 255;
    let line = `a=candidate:${i + 1} 1 ${c.proto} ${priority} ${c.addr} ${c.port} typ ${c.type}`;
    if (c.type !== 'host') line += ' raddr 0.0.0.0 rport 0';
    if (c.proto === 'tcp') line += ' tcptype ' + c.tcptype;
    L.push(line);
  });

  L.push('a=end-of-candidates');
  return L.join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/** Compress an SDP to a compact string. encoding: 'b64' | 'cjk' */
function compress(sdp, opts = {}) {
  const bytes = pack(sdp, opts);
  return (opts.encoding === 'cjk') ? toBase16384(bytes) : toBase64url(bytes);
}

/** Inverse of compress(). Auto-detects the encoding. */
function decompress(str) {
  const s = str.trim();
  const cjk = s.charCodeAt(0) >= B16K_BASE && s.charCodeAt(0) < B16K_BASE + 16384;
  return unpack(cjk ? fromBase16384(s) : fromBase64url(s));
}

/**
 * Call this on the output of createOffer()/createAnswer() before setLocalDescription().
 * deriveCreds mode saves 21 bytes
 */
function withDerivedCredentials(sdp) {
  const m = sdp.match(/^a=fingerprint:\S+\s+(\S+)$/im);
  if (!m) throw new Error('sdpz: no fingerprint in SDP');
  const hex = m[1].replace(/:/g, '');
  const fp = new Uint8Array(hex.length / 2);
  for (let i = 0; i < fp.length; i++) fp[i] = parseInt(hex.substr(i * 2, 2), 16);
  const d = deriveCredentials(fp);
  return sdp
    .replace(/^a=ice-ufrag:.*$/gim, 'a=ice-ufrag:' + d.ufrag)
    .replace(/^a=ice-pwd:.*$/gim, 'a=ice-pwd:' + d.pwd);
}

const sdpz = {
  compress, decompress, pack, unpack, parseSdp, buildSdp,
  deriveCredentials, withDerivedCredentials,
  toBase64url, fromBase64url, toBase16384, fromBase16384, sha256,
};

if (typeof module !== 'undefined' && module.exports) module.exports = sdpz;
if (typeof globalThis !== 'undefined') globalThis.sdpz = sdpz;
})();
