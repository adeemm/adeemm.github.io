/* ════════════════════════════════════════════════════════════════
   ambient.js — the room behind the console
   A pool of background visualizations for the #bgDrift canvas.
   Every initial page load picks exactly one at random (main.js
   calls AMBIENT.pick() + AMBIENT.start() once, on power-on):

     00 · GHOST DRIFT    — the original: a drifting ghost + specks
     01 · GLYPH RAIN     — a slow, sparse fall of dim code glyphs
     02 · NETWORK        — a seeded ops map, packets crawling the edges
     03 · GRID FLOOR     — a phosphor wireframe plane scrolling toward you
     05 · OSCILLOSCOPE   — four phosphor traces drifting over a graticule
     06 · CODE STREAMS   — rows of faint terminal output drifting sideways
     07 · BINARY SNOW    — 0s and 1s drifting down at a slight angle
     08 · CIRCUIT        — orthogonal PCB traces with travelling pulses
     09 · SCANNER        — a scan line crawling down a measurement grid
     11 · STARFIELD      — ASCII glyphs flying toward a drifting vanishing point
     13 · DOT MATRIX     — a room-sized LED panel breathing in diagonal waves
     14 · AURORA         — phosphor curtains drifting additively over faint stars

   API (used by main.js):
     AMBIENT.list                    the pool, with id / label / create
     AMBIENT.pick()                  a random background id
     AMBIENT.start(canvas, id, reduced)  runs that background; returns the id
═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── 00 · GHOST DRIFT — the original background, moved here
     from main.js: one big faint ghost drifting across the room,
     40 tiny specks drifting down. */
  function ghostDrift(cv, reduced) {
    var o = cv.getContext("2d");
    var W, H, bgx = 0, specks = [];
    var ghostImg = PX.spriteCanvas("ghost", 1);

    function resize() {
      W = cv.width = window.innerWidth;
      H = cv.height = window.innerHeight;
      bgx = W + 60;
      specks = [];
      for (var i = 0; i < 40; i++) {
        specks.push({ x: Math.random() * W, y: Math.random() * H, v: 4 + Math.random() * 10 });
      }
    }
    resize();
    window.addEventListener("resize", resize);

    var last = 0;
    function frame(ts) {
      var dt = Math.min(50, ts - last) || 16;
      last = ts;
      var t = ts / 1000;
      o.clearRect(0, 0, W, H);
      o.fillStyle = "rgba(57,255,94,.05)";
      for (var i = 0; i < specks.length; i++) {
        var s = specks[i];
        s.y += s.v * dt / 1000;
        if (s.y > H) { s.y = -4; s.x = Math.random() * W; }
        o.fillRect(s.x, s.y, 2, 2);
      }
      bgx -= 14 * dt / 1000;
      if (bgx < -80) bgx = W + 80;
      var gy = H * 0.3 + Math.sin(t * 0.5) * 26;
      o.globalAlpha = 0.10;
      o.drawImage(ghostImg, bgx, gy, 48, 48);
      o.globalAlpha = 1;
      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── 01 · GLYPH RAIN — a slow, sparse fall of dim code glyphs
     in three depth layers; occasional bright spark. */
  function glyphRain(cv, reduced) {
    var o = cv.getContext("2d");
    var POOL = ("01<>/\\{}[]();:+=*#@$%&アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ").split("");
    var LAYERS = [
      { sp: 14, a: 0.050, font: 12, trail: 5 },
      { sp: 24, a: 0.075, font: 14, trail: 6 },
      { sp: 38, a: 0.105, font: 16, trail: 7 }
    ];
    var cols = [], W, H;

    function init() {
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      var n = Math.ceil(W / 16);
      cols = [];
      for (var i = 0; i < n; i++) {
        var band = (i * 7919) % 10;
        var L = LAYERS[band < 4 ? 0 : band < 7 ? 1 : 2];
        cols.push({
          x: i * 16 + 8,
          y: Math.random() * (H + 200) - 100,
          L: L,
          sp: L.sp * (0.7 + Math.random() * 0.6),
          tint: Math.random() < 0.14,
          seed: (Math.random() * 64) | 0,
          spark: 0
        });
      }
    }
    init();
    window.addEventListener("resize", init);

    function frame(ts) {
      var t = ts / 1000;
      o.clearRect(0, 0, W, H);
      for (var i = 0; i < cols.length; i++) {
        var c = cols[i];
        c.y += c.sp * 0.016;
        if (c.y > H + 30) c.y = -40 - Math.random() * 160;
        o.font = c.L.font + "px 'Courier New', monospace";
        var headA = c.L.a + c.spark;
        for (var k = c.L.trail; k >= 0; k--) {
          /* the y-offset can be negative at the top of the screen —
             keep the pool index wrapped, not negative */
          var idx = (c.seed + Math.floor(c.y / c.L.font) + k * 5) % POOL.length;
          if (idx < 0) idx += POOL.length;
          var ch = POOL[idx];
          var a = headA * (1 - k / (c.L.trail + 1.6));
          if (a < 0.004) continue;
          if (c.spark > 0 && k === 0) {
            o.fillStyle = "rgba(201,255,206," + a.toFixed(3) + ")";
          } else if (c.tint) {
            o.fillStyle = "rgba(30,156,63," + a.toFixed(3) + ")";
          } else {
            o.fillStyle = "rgba(57,255,94," + a.toFixed(3) + ")";
          }
          o.fillText(ch, c.x, c.y - k * c.L.font);
        }
        if (Math.random() < 0.0011) c.spark = 0.32;
        if (c.spark > 0) c.spark = Math.max(0, c.spark - 0.014);
      }
      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── 02 · NETWORK — a faint operations map: dim nodes, hairline
     links, bright packets crawling the edges. The layout is
     seeded, so it's the same constellation every time. */
  function network(cv, reduced) {
    var o = cv.getContext("2d");

    function mulberry32(a) {
      return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    var rnd = mulberry32(42);

    var W, H, nodes, edges, pulses;
    function spawn(r) {
      var e = edges[(r() * edges.length) | 0];
      return { e: e, p: r(), sp: 0.05 + r() * 0.10, fwd: r() < 0.5 };
    }
    function init() {
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      var n = Math.max(34, Math.round(W * H / 30000));
      nodes = [];
      for (var i = 0; i < n; i++) nodes.push({ x: rnd() * W, y: rnd() * H, ph: rnd() * 6.28, hub: false });
      edges = [];
      var seen = {};
      for (i = 0; i < nodes.length; i++) {
        var d = [];
        for (var j = 0; j < nodes.length; j++) {
          if (j === i) continue;
          var dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
          d.push({ j: j, d: dx * dx + dy * dy });
        }
        d.sort(function (a, b) { return a.d - b.d; });
        for (var k = 0; k < 2; k++) {
          var a = Math.min(i, d[k].j), b = Math.max(i, d[k].j);
          var key = a + "-" + b;
          if (seen[key]) continue;
          seen[key] = 1;
          edges.push({ a: i, b: d[k].j });
          if (k === 0 && rnd() < 0.4) nodes[i].hub = true;
        }
      }
      pulses = [];
      for (i = 0; i < 13; i++) pulses.push(spawn(rnd));
    }
    init();
    window.addEventListener("resize", init);

    function frame(ts) {
      var t = ts / 1000;
      o.clearRect(0, 0, W, H);
      /* hairline links */
      o.strokeStyle = "rgba(57,255,94,0.05)";
      o.lineWidth = 1;
      o.beginPath();
      for (var i = 0; i < edges.length; i++) {
        var e = edges[i];
        o.moveTo(nodes[e.a].x, nodes[e.a].y);
        o.lineTo(nodes[e.b].x, nodes[e.b].y);
      }
      o.stroke();
      /* breathing nodes */
      for (i = 0; i < nodes.length; i++) {
        var n2 = nodes[i];
        var a = (n2.hub ? 0.24 : 0.13) + 0.05 * Math.sin(t * 0.4 + n2.ph);
        var s = n2.hub ? 4 : 2;
        o.fillStyle = "rgba(57,255,94," + a.toFixed(3) + ")";
        o.fillRect(n2.x - s / 2, n2.y - s / 2, s, s);
      }
      /* packets on the edges */
      for (i = 0; i < pulses.length; i++) {
        var p = pulses[i];
        p.p += p.sp * 0.016;
        if (p.p >= 1) { var np = spawn(Math.random); p.e = np.e; p.p = np.p; p.sp = np.sp; p.fwd = np.fwd; }
        var A = nodes[p.e.a], B = nodes[p.e.b];
        var f = p.fwd ? p.p : 1 - p.p;
        var x = A.x + (B.x - A.x) * f, y = A.y + (B.y - A.y) * f;
        o.save();
        o.shadowColor = "rgba(201,255,206,.8)";
        o.shadowBlur = 7;
        o.fillStyle = "rgba(201,255,206," + (0.22 + 0.22 * (0.5 + 0.5 * Math.sin(t * 2 + i))).toFixed(3) + ")";
        o.fillRect(x - 2, y - 2, 4, 4);
        o.restore();
      }
      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── 03 · GRID FLOOR — a phosphor wireframe plane receding to a
     low horizon, scrolling slowly toward the viewer. */
  function gridFloor(cv, reduced) {
    var o = cv.getContext("2d");
    var W, H;

    function fit() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
    fit();
    window.addEventListener("resize", fit);

    function frame(ts) {
      var t = ts / 1000;
      /* the vanishing point sits above the top edge, so the grid
         fans out across the visible margins instead of hiding
         behind the monitor */
      var horizon = -60;
      o.clearRect(0, 0, W, H);

      var cx = W / 2;
      var speed = 0.5;               /* world units / s */
      var off = (t * speed) % 1;     /* fractional scroll 0..1 */

      /* horizontal grid lines: projected z rows scrolling toward us */
      var rows = 22;
      for (var i = 1; i <= rows; i++) {
        var z = (i - off);
        if (z < 0.02) continue;
        var scale = 1 / z;
        var y = horizon + (H - horizon) * Math.min(1, scale * 0.9);
        if (y > H + 4) continue;
        var fade = Math.min(1, scale * 2.2);
        var a = 0.025 + 0.10 * fade;
        o.strokeStyle = "rgba(57,255,94," + a.toFixed(3) + ")";
        o.lineWidth = fade > 0.6 ? 1.4 : 1;
        o.beginPath();
        o.moveTo(0, y);
        o.lineTo(W, y);
        o.stroke();
      }

      /* vertical lanes: converge to the vanishing point above the screen */
      var lanes = 26;
      for (var l = -lanes; l <= lanes; l++) {
        var xTop = cx + l * 10;
        var xBot = cx + l * (W * 1.5 / lanes);
        var a2 = l === 0 ? 0.20 : 0.06 + 0.05 * (1 - Math.abs(l) / lanes);
        o.strokeStyle = "rgba(57,255,94," + a2.toFixed(3) + ")";
        o.lineWidth = l === 0 ? 1.4 : 1;
        o.beginPath();
        o.moveTo(xTop, horizon);
        o.lineTo(xBot, H);
        o.stroke();
      }

      /* a faint scan sweep running down the floor */
      var sweep = ((t * 0.16) % 1);
      var sy = -40 + (H + 80) * sweep * sweep;
      var sg = o.createLinearGradient(0, sy - 26, 0, sy + 4);
      sg.addColorStop(0, "rgba(201,255,206,0)");
      sg.addColorStop(1, "rgba(201,255,206,0.05)");
      o.fillStyle = sg;
      o.fillRect(0, sy - 26, W, 30);

      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── 05 · OSCILLOSCOPE — four phosphor traces drifting over a
     faint graticule, each with a wide soft halo pass underneath. */
  function oscilloscope(cv, reduced) {
    var o = cv.getContext("2d");

    var TRACES = [
      { A: 48, k: 0.011, w: 0.50, ph: 0.0, col: "57,255,94",  a: 0.17 },
      { A: 72, k: 0.007, w: 0.31, ph: 2.1, col: "57,255,94",  a: 0.09 },
      { A: 30, k: 0.017, w: 0.77, ph: 4.0, col: "53,242,255", a: 0.08 },
      { A: 56, k: 0.005, w: 0.21, ph: 5.2, col: "255,233,59", a: 0.06 }
    ];
    var W, H;
    function fit() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
    fit();
    window.addEventListener("resize", fit);

    function tracePath(T, t) {
      o.beginPath();
      for (var x = 0; x <= W; x += 4) {
        var env = 0.4 + 0.6 * Math.sin((x / W) * Math.PI); /* soft edge taper */
        var y = H / 2
          + Math.sin(x * T.k + t * T.w + T.ph) * T.A * env
          + Math.sin(x * T.k * 2.7 + t * T.w * 1.9 + 1.3) * T.A * 0.18 * env;
        if (x === 0) o.moveTo(x, y); else o.lineTo(x, y);
      }
    }

    function frame(ts) {
      var t = ts / 1000;
      o.clearRect(0, 0, W, H);

      /* graticule */
      o.strokeStyle = "rgba(57,255,94,0.028)";
      o.lineWidth = 1;
      o.beginPath();
      for (var x = 0; x < W; x += 64) { o.moveTo(x, 0); o.lineTo(x, H); }
      for (var y = 0; y < H; y += 44) { o.moveTo(0, y); o.lineTo(W, y); }
      o.stroke();
      o.strokeStyle = "rgba(57,255,94,0.05)";
      o.beginPath();
      o.moveTo(0, H / 2); o.lineTo(W, H / 2);
      o.moveTo(W / 2, 0); o.lineTo(W / 2, H);
      o.stroke();

      /* traces: halo pass, then core pass */
      for (var i = 0; i < TRACES.length; i++) {
        var T = TRACES[i];
        o.lineJoin = "round";
        o.strokeStyle = "rgba(" + T.col + "," + (T.a * 0.22).toFixed(3) + ")";
        o.lineWidth = 6;
        tracePath(T, t);
        o.stroke();
        o.strokeStyle = "rgba(" + T.col + "," + T.a + ")";
        o.lineWidth = 1.5;
        tracePath(T, t);
        o.stroke();
      }

      /* scope overlay readout */
      o.fillStyle = "rgba(57,255,94,0.15)";
      o.font = "13px 'Courier New', monospace";
      o.fillText("CH1 2.00Vpp  f≈31Hz   CH2 0.42Vpp  TRIG A↑", 14, 22);
      o.fillStyle = "rgba(53,242,255,0.13)";
      o.fillText("SWP ×1.0  ·  DELAY 2.00ns  ·  PHOSPHOR P1", 14, 40);

      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── 06 · CODE STREAMS — rows of faint terminal output drifting
     sideways at different depths: prompts, hex dumps, connection
     logs. A few rows end in a blinking cursor block. */
  function codeStreams(cv, reduced) {
    var o = cv.getContext("2d");

    /* run colors: prompt yellow, bright, green, cyan, dim, hex-dim */
    var COLS = {
      y:  "255,233,59", b: "201,255,206", g: "57,255,94",
      c:  "53,242,255", d: "30,156,63",  h: "30,156,63"
    };
    var TEMPLATES = [
      [["> whoami", "y"], [" → researcher", "b"]],
      [["[ok] mount /dev/phosphor0 ", "g"], ["t=0.41s", "b"]],
      [["0x7f3a9c  8b 1e 44 aa 02 f1  c3 9d  e0 55 12 ab  47 c8  91 3a", "h"]],
      [["TCP ESTABLISHED ", "d"], ["8.8.8.8:53", "c"], [" 22ms", "d"]],
      [["$ git commit -m \"phosphor pass\"", "y"]],
      [["[12:04:31] accept ", "d"], ["10.0.4.19:52231", "c"], [" → :443", "d"]],
      [["scan 192.168.7.0/24 … ", "d"], ["3 open", "y"]],
      [["handshake: offer → answer ", "d"], ["41ms", "c"]],
      [["Δt 0.0042  σ 0.87  n=16384", "h"]],
      [["[warn] entropy pool 42%", "y"]],
      [["ssh researcher@adeem.co  ~ ", "d"], ["key ok", "b"]]
    ];
    var W, H, rows;

    function init() {
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      var n = Math.max(16, Math.round(H / 42));
      rows = [];
      o.textBaseline = "middle";
      for (var i = 0; i < n; i++) {
        var depth = Math.random();
        var font = Math.round(13 + depth * 3);
        o.font = font + "px 'Courier New', monospace";
        /* each row repeats 3-5 templates until it's wider than the screen */
        var runs = [], total = 0, guard = 0;
        while (total < W + 400 && guard++ < 12) {
          var tpl = TEMPLATES[(Math.random() * TEMPLATES.length) | 0];
          for (var s = 0; s < tpl.length; s++) {
            var w = o.measureText(tpl[s][0]).width;
            runs.push({ txt: tpl[s][0], col: COLS[tpl[s][1]], w: w, x0: total });
            total += w;
          }
          total += 24; /* gutter between template repeats */
        }
        rows.push({
          y: (i + 0.5) * (H / n),
          font: font,
          runs: runs,
          total: total,
          sp: 8 + depth * 22,
          ph: Math.random() * W,
          a: 0.045 + depth * 0.075,
          cursor: Math.random() < 0.3
        });
      }
    }
    init();
    window.addEventListener("resize", init);

    function frame(ts) {
      var t = ts / 1000;
      o.clearRect(0, 0, W, H);
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var off = (row.ph + t * row.sp) % row.total;
        for (var copy = -1; copy <= 0; copy++) {
          var x0 = -off + copy * row.total;
          for (var r = 0; r < row.runs.length; r++) {
            var run = row.runs[r];
            var x = x0 + run.x0;
            if (x > W + 40 || x + run.w < -40) continue;
            o.font = row.font + "px 'Courier New', monospace";
            o.fillStyle = "rgba(" + run.col + "," + row.a.toFixed(3) + ")";
            o.fillText(run.txt, x, row.y);
          }
          /* one blinking cursor per copy at the end of the row */
          if (row.cursor && (Math.floor(t * 2) % 2 === 0)) {
            var cx = x0 + row.total - 18;
            if (cx > -20 && cx < W + 20) {
              o.fillStyle = "rgba(201,255,206," + (row.a * 1.8).toFixed(3) + ")";
              o.fillRect(cx, row.y - 7, 9, 14);
            }
          }
        }
      }
      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── 07 · BINARY SNOW — 0s and 1s drifting down at a slight
     angle, three depths, a gentle sway, and the rare flake that
     sparks bright for a moment as it falls. */
  function binarySnow(cv, reduced) {
    var o = cv.getContext("2d");
    var HEX = "0123456789abcdef";
    var W, H, flakes;

    function makeFlake(anywhere) {
      var r = Math.random();
      var ch;
      if (r < 0.42) ch = "0";
      else if (r < 0.84) ch = "1";
      else if (r < 0.92) ch = HEX[(Math.random() * 16) | 0];
      else ch = (Math.random() < 0.5 ? "01" : "10");
      return {
        x: Math.random() * W,
        y: anywhere ? Math.random() * H : -14,
        depth: Math.random(),
        sp: 9 + Math.random() * 16,
        ph: Math.random() * 6.28,
        ch: ch,
        glow: 0
      };
    }

    function init() {
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      flakes = [];
      var n = Math.round(W * H / 8500);
      for (var i = 0; i < n; i++) flakes.push(makeFlake(true));
    }
    init();
    window.addEventListener("resize", init);

    function frame(ts) {
      var t = ts / 1000;
      o.clearRect(0, 0, W, H);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.y += f.sp * 0.016;
        f.x += f.sp * 0.016 * 0.18 + Math.sin(t * 0.5 + f.ph) * 0.16;
        if (f.y > H + 12 || f.x > W + 12) { flakes[i] = makeFlake(false); continue; }
        var d = f.depth;
        var font = Math.round(10 + d * 7);
        var a = 0.04 + d * 0.085;
        if (f.glow > 0) {
          a = 0.30 * f.glow;
          f.glow = Math.max(0, f.glow - 0.02);
        } else if (Math.random() < 0.00035) {
          f.glow = 1;
        }
        o.font = font + "px 'Courier New', monospace";
        o.fillStyle = f.glow > 0
          ? "rgba(201,255,206," + a.toFixed(3) + ")"
          : (d < 0.33 ? "rgba(13,92,38," + a.toFixed(3) + ")" : "rgba(57,255,94," + a.toFixed(3) + ")");
        o.fillText(f.ch, f.x, f.y);
      }
      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── 08 · CIRCUIT — the room is a board: orthogonal traces with
     45° bends (proper PCB routing), pads and vias, and pulses of
     light travelling along the copper. Layout is seeded and stable. */
  function circuit(cv, reduced) {
    var o = cv.getContext("2d");

    function mulberry32(a) {
      return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    var rnd = mulberry32(99);

    /* orthogonal path A→B with one pair of 45° bends */
    function orthoPath(p, q) {
      var pts = [{ x: p.x, y: p.y }];
      var dx = q.x - p.x, dy = q.y - p.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        var xm = q.x - Math.sign(dx || 1) * Math.abs(dy);
        pts.push({ x: xm, y: p.y });
      } else {
        var ym = q.y - Math.sign(dy || 1) * Math.abs(dx);
        pts.push({ x: p.x, y: ym });
      }
      pts.push({ x: q.x, y: q.y });
      return pts;
    }

    var W, H, pads, traces, pulses;

    function segsOf(pts) {
      var segs = [], total = 0;
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        var len = Math.hypot(b.x - a.x, b.y - a.y);
        segs.push({ a: a, b: b, len: len, at: total });
        total += len;
      }
      return { segs: segs, total: total };
    }
    function pointAt(tr, d) {
      d = Math.max(0, Math.min(tr.total, d));
      for (var i = 0; i < tr.segs.length; i++) {
        var s = tr.segs[i];
        if (d <= s.at + s.len) {
          var f = s.len ? (d - s.at) / s.len : 0;
          return { x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f };
        }
      }
      var last = tr.segs[tr.segs.length - 1];
      return { x: last.b.x, y: last.b.y };
    }

    function init() {
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      var n = Math.max(10, Math.round(W * H / 52000));
      pads = [];
      for (var i = 0; i < n; i++) {
        pads.push({ x: 30 + rnd() * (W - 60), y: 30 + rnd() * (H - 60) });
      }
      traces = [];
      var seen = {};
      for (i = 0; i < pads.length; i++) {
        var d = [];
        for (var j = 0; j < pads.length; j++) {
          if (j === i) continue;
          var dx = pads[j].x - pads[i].x, dy = pads[j].y - pads[i].y;
          d.push({ j: j, d: dx * dx + dy * dy });
        }
        d.sort(function (a, b) { return a.d - b.d; });
        for (var k = 0; k < 2; k++) {
          var a = Math.min(i, d[k].j), b = Math.max(i, d[k].j);
          var key = a + "-" + b;
          if (seen[key]) continue;
          seen[key] = 1;
          traces.push(segsOf(orthoPath(pads[i], pads[d[k].j])));
        }
      }
      pulses = [];
      for (i = 0; i < 10; i++) pulses.push({ tr: (rnd() * traces.length) | 0, d: rnd() * 600 });
    }
    init();
    window.addEventListener("resize", init);

    function frame(ts) {
      var t = ts / 1000;
      o.clearRect(0, 0, W, H);

      /* solder-mask micro-grid, barely there */
      o.fillStyle = "rgba(57,255,94,0.016)";
      for (var gx = 20; gx < W; gx += 46)
        for (var gy = 20; gy < H; gy += 46)
          o.fillRect(gx, gy, 1, 1);

      /* copper traces */
      o.strokeStyle = "rgba(30,156,63,0.13)";
      o.lineWidth = 2;
      o.lineJoin = "round";
      o.beginPath();
      for (var i = 0; i < traces.length; i++) {
        var tr = traces[i], s0 = tr.segs[0];
        o.moveTo(s0.a.x, s0.a.y);
        for (var s = 0; s < tr.segs.length; s++) o.lineTo(tr.segs[s].b.x, tr.segs[s].b.y);
      }
      o.stroke();

      /* vias at bend points */
      o.fillStyle = "rgba(57,255,94,0.15)";
      for (i = 0; i < traces.length; i++) {
        for (s = 0; s < traces[i].segs.length - 1; s++) {
          o.fillRect(traces[i].segs[s].b.x - 1, traces[i].segs[s].b.y - 1, 2, 2);
        }
      }

      /* pads */
      for (i = 0; i < pads.length; i++) {
        var p = pads[i];
        o.strokeStyle = "rgba(57,255,94,0.22)";
        o.lineWidth = 1.5;
        o.strokeRect(p.x - 3.5, p.y - 3.5, 7, 7);
        o.fillStyle = "rgba(57,255,94,0.30)";
        o.fillRect(p.x - 1, p.y - 1, 2, 2);
      }

      /* travelling pulses */
      for (i = 0; i < pulses.length; i++) {
        var pu = pulses[i];
        pu.d += 52 * 0.016;
        if (pu.d > traces[pu.tr].total + 24) {
          pu.d = 0;
          pu.tr = (Math.random() * traces.length) | 0;
        }
        var pt = pointAt(traces[pu.tr], pu.d);
        var fade = Math.min(1, pu.d / 24, (traces[pu.tr].total - pu.d) / 24 + 1);
        o.save();
        o.shadowColor = "rgba(201,255,206,.85)";
        o.shadowBlur = 8;
        o.fillStyle = "rgba(201,255,206," + (0.34 * fade).toFixed(3) + ")";
        o.fillRect(pt.x - 2, pt.y - 2, 4, 4);
        o.restore();
      }

      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── 09 · SCANNER — a single scan line crawls down the room over
     a faint measurement grid. Grid intersections light up as the
     line passes; the occasional "anomaly" flares with a ring. */
  function scanner(cv, reduced) {
    var o = cv.getContext("2d");
    var GRID = 44;
    var W, H, anomalies = [], nextAnomaly = 4;

    function fit() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
    fit();
    window.addEventListener("resize", fit);

    function frame(ts) {
      var t = ts / 1000;
      o.clearRect(0, 0, W, H);

      /* measurement grid */
      o.strokeStyle = "rgba(57,255,94,0.024)";
      o.lineWidth = 1;
      o.beginPath();
      for (var x = 0; x < W; x += GRID) { o.moveTo(x + 0.5, 0); o.lineTo(x + 0.5, H); }
      for (var y = 0; y < H; y += GRID) { o.moveTo(0, y + 0.5); o.lineTo(W, y + 0.5); }
      o.stroke();

      /* the scan line, with a fading trail above it */
      var yLine = ((t * 24) % (H + 140)) - 70;
      var trail = o.createLinearGradient(0, yLine - 72, 0, yLine);
      trail.addColorStop(0, "rgba(201,255,206,0)");
      trail.addColorStop(1, "rgba(201,255,206,0.045)");
      o.fillStyle = trail;
      o.fillRect(0, yLine - 72, W, 72);
      o.fillStyle = "rgba(201,255,206,0.13)";
      o.fillRect(0, yLine, W, 2);

      /* intersections light up near the line */
      for (var gx = 0; gx < W; gx += GRID) {
        for (var gy = 0; gy < H; gy += GRID) {
          var d = Math.abs(gy - yLine);
          if (d > GRID) continue;
          var a = (1 - d / GRID) * 0.11;
          o.fillStyle = "rgba(57,255,94," + a.toFixed(3) + ")";
          o.fillRect(gx - 2.5, gy - 0.5, 5, 1);
          o.fillRect(gx - 0.5, gy - 2.5, 1, 5);
        }
      }

      /* readout that follows the line */
      o.fillStyle = "rgba(201,255,206,0.16)";
      o.font = "13px 'Courier New', monospace";
      var yy = Math.max(12, Math.min(H - 6, yLine));
      o.fillText("Y " + String(Math.round(yLine)).padStart(4, "0"), W - 108, yy - 8);

      /* anomalies: rare flares with an expanding ring */
      if (t > nextAnomaly && !reduced) {
        nextAnomaly = t + 7 + Math.random() * 6;
        anomalies.push({
          x: Math.round(Math.random() * (W / GRID)) * GRID,
          y: Math.round(Math.random() * (H / GRID)) * GRID,
          t0: t
        });
      }
      for (var i = anomalies.length - 1; i >= 0; i--) {
        var an = anomalies[i];
        var p = (t - an.t0) / 1.4;
        if (p >= 1) { anomalies.splice(i, 1); continue; }
        var r = 4 + p * 30;
        o.strokeStyle = "rgba(255,233,59," + (0.20 * (1 - p)).toFixed(3) + ")";
        o.lineWidth = 1;
        o.beginPath(); o.arc(an.x, an.y, r, 0, Math.PI * 2); o.stroke();
        o.fillStyle = "rgba(201,255,206," + (0.30 * (1 - p)).toFixed(3) + ")";
        o.fillRect(an.x - 3, an.y - 0.5, 6, 1);
        o.fillRect(an.x - 0.5, an.y - 3, 1, 6);
      }

      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── 11 · STARFIELD — an ASCII starfield: glyphs that are far
     away are tiny and dim, and grow and brighten as they fly
     toward you. The vanishing point drifts very slowly. */
  function starfield(cv, reduced) {
    var o = cv.getContext("2d");
    var W, H, maxR, stars = [];
    var CHARS = ["·", ".", "+", "×"];

    function fit() {
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      maxR = Math.hypot(W, H) * 0.55;
    }
    function respawn(s, far) {
      s.ang = Math.random() * Math.PI * 2;
      s.r = far ? maxR * (0.15 + Math.random() * 0.85) : 3 + Math.random() * 12;
      s.sp = 5 + Math.random() * 16;
      s.cyan = Math.random() < 0.08;
    }
    function init() {
      fit();
      stars = [];
      for (var i = 0; i < 110; i++) {
        var s = {};
        respawn(s, true);
        stars.push(s);
      }
    }
    init();
    window.addEventListener("resize", init);

    function frame(ts) {
      var t = ts / 1000;
      o.clearRect(0, 0, W, H);
      var cx = W / 2 + Math.sin(t * 0.05) * 26;
      var cy = H * 0.44 + Math.cos(t * 0.04) * 14;
      o.textAlign = "center";
      o.textBaseline = "middle";
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.r += s.sp * (0.25 + s.r / maxR) * 0.016;
        if (s.r > maxR) { respawn(s, false); continue; }
        var x = cx + Math.cos(s.ang) * s.r;
        var y = cy + Math.sin(s.ang) * s.r;
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        var f = s.r / maxR;
        var a = 0.03 + 0.21 * f * f;
        var ch = CHARS[f < 0.3 ? 0 : f < 0.6 ? 1 : f < 0.85 ? 2 : 3];
        o.font = Math.round(11 + f * 9) + "px 'Courier New', monospace";
        o.fillStyle = s.cyan
          ? "rgba(53,242,255," + a.toFixed(3) + ")"
          : "rgba(57,255,94," + a.toFixed(3) + ")";
        o.fillText(ch, x, y);
      }
      o.textAlign = "left";
      o.textBaseline = "alphabetic";
      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── 13 · DOT MATRIX — the whole room is a dot-matrix panel. A
     slow diagonal wave makes the dots swell and fade like
     breathing phosphor; one or two dots are "dead" for a while. */
  function dotMatrix(cv, reduced) {
    var o = cv.getContext("2d");
    var GAP = 22, LEVELS = 12;
    var W, H, dots = [], dead = [], deadUntil = 0;

    function init() {
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      dots = [];
      for (var y = GAP / 2, row = 0; y < H + GAP; y += GAP, row++) {
        for (var x = (row % 2 ? GAP / 2 : 0); x < W + GAP; x += GAP) {
          dots.push({ x: x, y: y });
        }
      }
    }
    init();
    window.addEventListener("resize", init);

    function frame(ts) {
      var t = ts / 1000;
      o.clearRect(0, 0, W, H);

      /* rotate the dead pixel every few seconds */
      if (t > deadUntil) {
        deadUntil = t + 5;
        dead = [];
        for (var d = 0; d < 2; d++) dead.push((Math.random() * dots.length) | 0);
      }
      /* precompute the alpha per brightness level for this frame */
      var fills = [];
      for (var l = 0; l < LEVELS; l++) {
        var u = l / (LEVELS - 1);
        var a = 0.026 + 0.062 * u;
        fills.push("rgba(57,255,94," + a.toFixed(3) + ")");
      }
      var deadFill = "rgba(57,255,94,0.008)";

      for (var i = 0; i < dots.length; i++) {
        var p = dots[i];
        var wv = Math.sin(p.x * 0.021 + t * 0.55) * Math.sin(p.y * 0.024 - t * 0.41);
        var u2 = wv * 0.5 + 0.5;
        var lvl = Math.min(LEVELS - 1, (u2 * LEVELS) | 0);
        var rad = 1.0 + 1.7 * u2;
        o.fillStyle = (dead[0] === i || dead[1] === i) ? deadFill : fills[lvl];
        o.beginPath();
        o.arc(p.x, p.y, rad, 0, 6.2832);
        o.fill();
      }

      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── 14 · AURORA — three wide curtains of phosphor light
     drifting and undulating across the room, drawn additively so
     overlaps brighten. Faint stars twinkle behind; the occasional
     thin airglow streak flashes by. */
  function aurora(cv, reduced) {
    var o = cv.getContext("2d");

    var BANDS = [
      { fy: 0.34, h: 150, amp: 54, f1: 0.0038, w1: 0.21, f2: 0.0105, w2: 0.12, ph: 0.0, col: "57,255,94",  a: 0.045 },
      { fy: 0.46, h: 190, amp: 70, f1: 0.0028, w1: 0.15, f2: 0.0080, w2: 0.10, ph: 2.2, col: "30,156,63",  a: 0.060 },
      { fy: 0.58, h: 120, amp: 44, f1: 0.0050, w1: 0.27, f2: 0.0130, w2: 0.16, ph: 4.1, col: "53,242,255", a: 0.030 }
    ];
    var W, H, stars = [], streaks = [], nextStreak = 2;

    function fit() {
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      stars = [];
      for (var i = 0; i < 70; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * 6.28, s: 0.3 + Math.random() * 0.7 });
      }
    }
    fit();
    window.addEventListener("resize", fit);

    function center(b, x, t) {
      return H * b.fy
        + Math.sin(x * b.f1 + t * b.w1 + b.ph) * b.amp
        + Math.sin(x * b.f2 - t * b.w2) * b.amp * 0.5;
    }
    function ribbon(b, t, hMul, alpha) {
      var h = b.h * hMul;
      o.fillStyle = "rgba(" + b.col + "," + alpha + ")";
      o.beginPath();
      for (var x = 0; x <= W; x += 10) {
        var y = center(b, x, t) - h / 2;
        if (x === 0) o.moveTo(x, y); else o.lineTo(x, y);
      }
      for (x = W; x >= 0; x -= 10) {
        o.lineTo(x, center(b, x, t) + h / 2);
      }
      o.closePath();
      o.fill();
    }

    function frame(ts) {
      var t = ts / 1000;
      o.clearRect(0, 0, W, H);

      /* stars behind the curtains */
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var a = (0.02 + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.7 + s.ph))) * s.s;
        o.fillStyle = "rgba(201,255,206," + a.toFixed(3) + ")";
        o.fillRect(s.x, s.y, 1, 1);
      }

      /* curtains, additive so crossings brighten */
      o.globalCompositeOperation = "lighter";
      for (var b = 0; b < BANDS.length; b++) {
        var B = BANDS[b];
        ribbon(B, t, 2.6, B.a * 0.30);
        ribbon(B, t, 1.7, B.a * 0.55);
        ribbon(B, t, 1.0, B.a);
      }
      o.globalCompositeOperation = "source-over";

      /* airglow streaks */
      if (t > nextStreak && !reduced) {
        nextStreak = t + 2.5 + Math.random() * 3;
        streaks.push({ y: Math.random() * H, t0: t });
      }
      for (var k = streaks.length - 1; k >= 0; k--) {
        var st = streaks[k];
        var p = (t - st.t0) / 0.9;
        if (p >= 1) { streaks.splice(k, 1); continue; }
        o.fillStyle = "rgba(201,255,206," + (0.04 * Math.sin(p * Math.PI)).toFixed(3) + ")";
        o.fillRect(0, st.y, W, 1);
      }

      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ═══════════════════════ the pool + API ════════════════════ */
  var BACKGROUNDS = [
    { id: "ghost-drift",  label: "00 · GHOST DRIFT",   create: ghostDrift },
    { id: "glyph-rain",   label: "01 · GLYPH RAIN",    create: glyphRain },
    { id: "network",      label: "02 · NETWORK",       create: network },
    { id: "grid-floor",   label: "03 · GRID FLOOR",    create: gridFloor },
    { id: "oscilloscope", label: "05 · OSCILLOSCOPE",  create: oscilloscope },
    { id: "code-streams", label: "06 · CODE STREAMS",  create: codeStreams },
    { id: "binary-snow",  label: "07 · BINARY SNOW",   create: binarySnow },
    { id: "circuit",      label: "08 · CIRCUIT",       create: circuit },
    { id: "scanner",      label: "09 · SCANNER",       create: scanner },
    { id: "starfield",    label: "11 · STARFIELD",     create: starfield },
    { id: "dot-matrix",   label: "13 · DOT MATRIX",    create: dotMatrix },
    { id: "aurora",       label: "14 · AURORA",        create: aurora }
  ];

  window.AMBIENT = {
    list: BACKGROUNDS,

    /* one uniform random pick from the pool */
    pick: function () {
      return BACKGROUNDS[(Math.random() * BACKGROUNDS.length) | 0].id;
    },

    /* run a background on the given canvas (falls back to the
       first entry for unknown ids); tags the canvas with the id */
    start: function (cv, id, reduced) {
      var bg = null;
      for (var i = 0; i < BACKGROUNDS.length; i++) {
        if (BACKGROUNDS[i].id === id) { bg = BACKGROUNDS[i]; break; }
      }
      if (!bg) bg = BACKGROUNDS[0];
      cv.setAttribute("data-ambient", bg.id);
      bg.create(cv, !!reduced);
      return bg.id;
    }
  };
})();
