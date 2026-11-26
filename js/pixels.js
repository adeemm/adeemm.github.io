(function () {
  "use strict";

  /* ── helpers ─────────────────────────────────────────────── */

  function hex2rgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  /* f < 1 darkens, f > 1 brightens; hsl-ish but dead simple */
  function shade(hex, f) {
    const c = hex2rgb(hex).map(v => Math.max(0, Math.min(255, Math.round(v * f))));
    return "rgb(" + c.join(",") + ")";
  }
  function ctxOf(cv) { return cv.getContext("2d"); }

  /* draw a char-map sprite: each char indexes `pal`; '.'/' ' = clear */
  function drawMap(cv, map, pal) {
    const ctx = ctxOf(cv);
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < map.length; y++) {
      const row = map[y];
      for (let x = 0; x < row.length; x++) {
        const c = pal[row.charAt(x)];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }

  /* ── the sprite library ──────────────────────────────────── */

  const GHOST = [
    ".....gggggg.....",
    "....gGGGGGGg....",
    "...gGGGGGGGGg...",
    "..gGGGGGGGGGGg..",
    "..gGGGGGGGGGGg..",
    ".gGGwkGGGGwkGGg.",
    ".gGGkkGGGGkkGGg.",
    ".gGGGGGGGGGGGGg.",
    ".gGGGGGGGGGGGGg.",
    ".gGGGGGGkkGGGGg.",
    ".gGGGGGGkkGGGGg.",
    ".gGGGGGGGGGGGGg.",
    ".gGGGGGGGGGGGGg.",
    "ggGGGGGGGGGGGGgg",
    "gggggggggggggggg",
    ".g.gggg.gggg.gg."
  ];
  const GHOST_PAL = {
    G: "#c9ffce", g: "#39ff5e", w: "#ffffff", k: "#03130a"
  };

  const HOME = [
    "......AA......",
    ".....AAAA.....",
    "....AAAAAA....",
    "...AAAAAAAA...",
    "..AAAAAAAAAA..",
    ".AAAAAAAAAAAA.",
    ".WWWWWWWWWWWW.",
    ".WWKKWWWKKWW.",
    ".WWKKWWWKKWW.",
    ".WWWWWWWWWWWW.",
    ".WWWWWKKWWWWW.",
    ".WWWWWKKWWWWW.",
    ".WWWWWKKWWWWW.",
    ".KKKKKKKKKKKK."
  ];

  const LOOKUP = [
    "....AAAAAA....",
    "..AALLLLLLAA..",
    ".ALLLLLLLLLLA.",
    ".ALLLWWLLLLLA.",
    "ALLLLLLLLLLLLA",
    "ALLLLLLLLLLLLA",
    ".ALLLLLLLLLLA.",
    ".ALLLLLLLLLLA.",
    "..AALLLLLLAA..",
    "....AAAAAAKK..",
    "..........KK..",
    ".........KK...",
    "........KK....",
    ".......KK....."
  ];

  const SEARCH = [
    "....AAAAAA....",
    "..AA......AA..",
    ".A....KK....A.",
    ".A..B.KK..B.A.",
    ".A....KK....A.",
    "AA....KK....AA",
    "..KKKKKKKKKK..",
    "..KKKKKKKKKK..",
    "AA....KK....AA",
    ".A....KK..B.A.",
    ".A....KK....A.",
    "..AA......AA..",
    "....AAAAAA....",
    ".............."
  ];

  const SLOP = [
    "....KKKKKK....",
    "..KKKKKKKKKK..",
    ".AAAAAAAAAAAA.",
    "..AAAAAAAAAA..",
    "..AKAAKAAKAA..",
    "..AKAAKAAKAA..",
    "..AKAAKAAKAA..",
    "..AKAAKAAKAA..",
    "..AKAAKAAKAA..",
    "..AKAAKAAKAA..",
    "..AKAAKAAKAA..",
    "..AAAAAAAAAA..",
    "...AAAAAAAA...",
    "...KKKKKKKK..."
  ];

  const UNICODE = [
    ".KKKKKKKKKKKK.",
    ".KWWWWWWWWWWK.",
    ".KWWWWWWWWWWK.",
    ".KWWWKKKKWWWK.",
    ".KWWKK...KKWK.",
    ".KWW.....KKWK.",
    ".KWW.....KKWK.",
    ".KWW....KKWWK.",
    ".KWWWWWWWWWWK.",
    ".KWW....KKWWK.",
    ".KWWWWWWWWWWK.",
    ".KKKKKKKKKKKK."
  ];

  const FILES = [
    ".KKKKKKKKKK...",
    ".KKKKKKWWWKKKK.",
    ".KKKKKKWWWKKKK.",
    ".KAAAAAAAAAAK.",
    ".KAAAAAAAAAAK.",
    ".KWWWWWWWWWWK.",
    ".KWWWWWWWWWWK.",
    ".KWWKKKKKKWWK.",
    ".KWWWWWWWWWWK.",
    ".KWWKKKKKKWWK.",
    ".KWWWWWWWWWWK.",
    ".KAAAAAAAAAAK.",
    ".KAAAAAAAAAAK.",
    ".KKKKKKKKKKKK."
  ];

  const ABOUT = [
    ".....KKKK.....",
    "....KDDDDK....",
    "...KDDDDDDK...",
    "..KDDDDDDDDK..",
    "..KDKKKKKKDK..",
    "..KDKkkkkkkDK.",
    "..KDKAAkkAADK.",
    "..KDKkkkkkkDK.",
    "..KDKkkkkkkDK.",
    "..KDDDDDDDDK..",
    ".KDDDDDDDDDDK.",
    ".KDDDDDDDDDDK.",
    ".KKKKKKKKKKKK."
  ];

  /* palette factory: accent-based sprites get 3 tones automatically */
  function accPal(accent) {
    return {
      A: accent,
      K: shade(accent, 0.42),
      W: "#f4fff6",
      L: shade(accent, 0.30),  /* glass: dark tint of accent */
      B: "#ffffff",
      D: "#1e9c3f",
      g: "#39ff5e",
      G: "#c9ffce"
    };
  }

  const SPRITES = {
    ghost:  { map: GHOST,   pal: GHOST_PAL },
    home:   { map: HOME,    pal: accPal("#ff5ad5") },
    lookup: { map: LOOKUP,  pal: accPal("#35f2ff") },
    search: { map: SEARCH,  pal: accPal("#ffe93b") },
    slop:   { map: SLOP,    pal: accPal("#ff4444") },
    unicode:{ map: UNICODE, pal: accPal("#39ff5e") },
    files:  { map: FILES,   pal: accPal("#ffb400") },
    about:  { map: ABOUT,   pal: accPal("#f4fff6") }
  };

  function spriteCanvas(name, size) {
    const s = SPRITES[name];
    const w = s.map[0].length, h = s.map.length;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    drawMap(cv, s.map, s.pal);
    if (size) {
      const out = document.createElement("canvas");
      out.width = w * size; out.height = h * size;
      const o = ctxOf(out);
      o.imageSmoothingEnabled = false;
      o.drawImage(cv, 0, 0, out.width, out.height);
      return out;
    }
    return cv;
  }

  /* ── the ADEEM logo (two-tone pixel wordmark) ──────────────
     rendered at half size, then doubled with smoothing off:
     chunky but crisp, like an embedded Flash font. */
  function drawLogo(cv) {
    const text = "ADEEM.CO";
    const HALF_W = 130, HALF_H = 26;
    const tmp = document.createElement("canvas");
    tmp.width = HALF_W; tmp.height = HALF_H;
    const t = ctxOf(tmp);
    t.clearRect(0, 0, HALF_W, HALF_H);
    t.font = "22px 'Courier New', monospace";
    t.textBaseline = "top";

    const w = t.measureText(text).width;
    const x0 = Math.max(1, (HALF_W - w) / 2);
    /* dark offset (extrusion) */
    t.fillStyle = "#0a3d1c";
    t.fillText(text, x0 + 1, 3);
    /* bottom half: darker green */
    t.fillStyle = "#1e9c3f";
    t.fillText(text, x0, 2);
    /* clip to top half, redraw bright */
    t.save();
    t.beginPath();
    t.rect(x0 - 2, 0, w + 4, 13);
    t.clip();
    t.fillStyle = "#c9ffce";
    t.fillText(text, x0, 2);
    t.restore();
    /* middle scanline cut */
    t.fillStyle = "rgba(1,5,2,.55)";
    t.fillRect(x0 - 2, 13, w + 4, 1);

    /* double it, no smoothing → clean chunky pixels */
    const o = ctxOf(cv);
    o.clearRect(0, 0, cv.width, cv.height);
    o.imageSmoothingEnabled = false;
    o.drawImage(tmp, 0, 0, cv.width, cv.height);
  }

  /* ── page art: static bases (animated bits live in main.js) ── */

  /* check page: four dim "database record" rows
     (scan state, checks and magnifier animate in main.js) */
  function drawCheckArt(cv) {
    const o = ctxOf(cv);
    o.clearRect(0, 0, cv.width, cv.height);
    o.fillStyle = "rgba(255,233,59,.25)";
    [12, 23, 34, 45].forEach(function (y) {
      o.fillRect(10, y, 20, 3);
      o.fillRect(33, y, 11, 3);
    });
  }

  /* search page: radar screen (sweep + blips animated in main.js) */
  function drawRadar(cv) {
    const o = ctxOf(cv);
    const S = cv.width, C = S / 2, R = S / 2 - 4;
    o.clearRect(0, 0, S, S);
    o.strokeStyle = "#35f2ff";
    o.lineWidth = 2;
    o.shadowColor = "rgba(53,242,255,.7)"; o.shadowBlur = 6;
    o.beginPath(); o.arc(C, C, R, 0, Math.PI * 2); o.stroke();
    o.beginPath(); o.arc(C, C, R * 0.62, 0, Math.PI * 2); o.lineWidth = 1; o.stroke();
    o.beginPath(); o.arc(C, C, R * 0.28, 0, Math.PI * 2); o.stroke();
    /* crosshair */
    o.beginPath();
    o.moveTo(C - R, C); o.lineTo(C + R, C);
    o.moveTo(C, C - R); o.lineTo(C, C + R);
    o.stroke();
    o.shadowBlur = 0;
  }

  /* files page: two monitors + a cable (packets animated in main.js) */
  function drawCourier(cv) {
    const o = ctxOf(cv);
    const W = cv.width;    /* 150 */
    const H = cv.height;   /* 46 */
    o.clearRect(0, 0, W, H);

    function monitor(x, screenColor, fileOn) {
      /* bezel */
      o.fillStyle = "#0a3d1c";
      o.fillRect(x, 6, 34, 26);
      o.fillStyle = "#03130a";
      o.fillRect(x + 2, 8, 30, 22);
      /* screen */
      o.fillStyle = screenColor;
      o.fillRect(x + 4, 10, 26, 18);
      /* file icon on screen */
      if (fileOn) {
        o.fillStyle = "#010804";
        o.fillRect(x + 13, 13, 8, 11);
        o.fillStyle = screenColor;
        o.fillRect(x + 13, 13, 8, 3);
        o.fillStyle = "#010804";
        o.fillRect(x + 15, 18, 4, 1);
        o.fillRect(x + 15, 20, 4, 1);
      } else {
        /* blinking receive block */
        o.fillStyle = "rgba(1,8,4,.7)";
        o.fillRect(x + 12, 14, 10, 9);
      }
      /* stand */
      o.fillStyle = "#0a3d1c";
      o.fillRect(x + 13, 32, 8, 4);
      o.fillRect(x + 8, 36, 18, 3);
    }

    monitor(8, "#39ff5e", true);
    monitor(W - 42, "#ffb400", false);

    /* cable */
    o.strokeStyle = "#1e9c3f";
    o.lineWidth = 2;
    o.setLineDash([3, 3]);
    o.beginPath();
    o.moveTo(46, 20);
    o.lineTo(W - 46, 20);
    o.stroke();
    o.setLineDash([]);
  }

  /* unicode page: glyph rain */
  const GLYPHS = "日月水火木金土風雲電山川石田米竹犬馬牛羊星月光明光暗上下左右前後大小多少黑白紅黃藍綠粉橙紫褐灰青赤金銀銅鐵木水火土".split("");
  const GLYPHS2 = "कखगचछजझटठडढणतथदधनपफबभमयरलवशषहॐ".split("")
    .concat("กขฅฆงจฉชซญฎฏฐฑฒณดถทธนบปผฝพฟภมรลวศษสหอฮ".split(""))
    .concat("ㄅㄉㄋㄌㄓㄔㄕㄖㄗㄘㄙ".split(""))
    .concat("ϪϬϴϵϸϻϗϙϟϡϫϮ".split(""))
    .concat("ŋþðœæłšžľ".split(""))
    .concat("٠١٢٣٤٥٦٧٨٩".split(""));
  function glyphRand() {
    const pool = Math.random() < 0.62 ? GLYPHS : GLYPHS2;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ── public API ──────────────────────────────────────────── */
  window.PX = {
    SPRITES: SPRITES,
    accPal: accPal,
    shade: shade,
    drawMap: drawMap,
    spriteCanvas: spriteCanvas,
    drawLogo: drawLogo,
    drawCheckArt: drawCheckArt,
    drawRadar: drawRadar,
    drawCourier: drawCourier,
    glyphRand: glyphRand
  };
})();
