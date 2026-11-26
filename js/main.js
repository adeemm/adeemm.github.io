/* ════════════════════════════════════════════════════════════════
   main.js — the console brain
   Router + dock + page transitions + animations
   The tool logic itself (lookup / search / file transfer / unicode
   tools) lives in the scripts loaded before this one.
═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (id) { return document.getElementById(id); };

  /* ═══════════════════════════ page table ════════════════════ */
  var ACC_HEX = {
    magenta: "#ff5ad5", cyan: "#35f2ff", yellow: "#ffe93b",
    red: "#ff4444", green: "#39ff5e", amber: "#ffb400", white: "#f4fff6"
  };
  var PAGES = {
    home:          { name: "HOME",             sub: "WELCOME SCREEN",      acc: "red",     ico: "home" },
    lookup:        { name: "IP / URL LOOKUP",  sub: "SECURITY TOOL",      acc: "yellow",  ico: "lookup" },
    search:        { name: "SLOP-LESS SEARCH", sub: "WEB SEARCH TOOL",      acc: "cyan",    ico: "search" },
    slop:          { name: "WHAT IS AI-SLOP?", sub: "READ ME",             acc: "red",     ico: "slop" },
    unicode:       { name: "UNICODE TOOLS", sub: "TEXT EDITOR",       acc: "green",   ico: "unicode" },
    uniBrowse:     { name: "UNICODE > BROWSE",      sub: "TEXT EDITOR",  acc: "green", ico: "unicode" },
    uniCombine:    { name: "UNICODE > COMBINE",     sub: "TEXT EDITOR",  acc: "green", ico: "unicode" },
    uniConfusables:{ name: "UNICODE > CONFUSABLES", sub: "TEXT EDITOR",  acc: "green", ico: "unicode" },
    uniEmoji:      { name: "UNICODE > EMOJI",       sub: "TEXT EDITOR",  acc: "green", ico: "unicode" },
    uniSearch:     { name: "UNICODE > SEARCH",      sub: "TEXT EDITOR",  acc: "green", ico: "unicode" },
    uniWatermark:  { name: "UNICODE > WATERMARK",   sub: "TEXT EDITOR",  acc: "green", ico: "unicode" },
    fileMenu:      { name: "FILE SHARING",     sub: "COURIER SERVICE",     acc: "amber",   ico: "files" },
    sendFiles:     { name: "SEND A FILE",      sub: "COURIER SERVICE > OUT",  acc: "amber", ico: "files" },
    downloadFiles: { name: "RECEIVE A FILE",   sub: "COURIER SERVICE > IN",   acc: "amber", ico: "files" },
    about:         { name: "MEET THE WEBMASTER", sub: "ABOUT PAGE",         acc: "white",   ico: "about" }
  };
  var DOCK_ORDER = ["home", "lookup", "search", "unicode", "fileMenu", "about"];
  var current = null;
  var visited = {};
  var busy = false;

  /* ═══════════════════════════ clock ═════════════════════════ */
  (function () {
    var el = $("clock");
    var D = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    var M = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function tick() {
      var d = new Date();
      el.textContent = D[d.getDay()] + " " + pad(d.getDate()) + " " + M[d.getMonth()] +
        " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }
    tick();
    setInterval(tick, 1000);
  })();

  /* ═══════════════════════════ sprite pass ═══════════════════ */
  /* every canvas in the DOM that declares data-ico / data-badge
     gets its sprite; the logo and mascot get theirs too. */
  (function () {
    var icoCanvases = document.querySelectorAll("canvas[data-ico]");
    for (var i = 0; i < icoCanvases.length; i++) {
      var cv = icoCanvases[i];
      var sp = PX.SPRITES[cv.getAttribute("data-ico")];
      if (sp) PX.drawMap(cv, sp.map, sp.pal);
    }
    /* mascot: the header ghost (the floating one is the same sprite) */
    PX.drawMap($("ghostHead"), PX.SPRITES.ghost.map, PX.SPRITES.ghost.pal);
    /* the logo is font-dependent: paint once now, then repaint when
       document.fonts settles so it always uses the local font stack */
    function paintFontArt() {
      PX.drawLogo($("logo"));
    }
    paintFontArt();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(paintFontArt, paintFontArt);
    } else { setTimeout(paintFontArt, 400); }
    /* page-art bases */
    PX.drawCheckArt($("checkArt"));
    PX.drawRadar($("radarArt"));
    PX.drawCourier($("courierArt"));
  })();

  /* ═══════════════════════════ status bar ════════════════════ */
  function setState(txt, led) {
    $("stState").textContent = txt;
    $("stLed").className = "led" + (led ? " " + led : "");
  }
  var statusTimer = null;
  function statusFlash(txt, ms) {
    var el = $("stTool");
    var old = el.textContent;
    el.textContent = txt;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { el.textContent = old; }, ms || 2600);
  }

  /* ═══════════════════════════ the dock ══════════════════════ */
  var dockTiles = {};
  (function () {
    var tiles = document.querySelectorAll(".dock-ico");
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      dockTiles[t.getAttribute("data-page")] = t;
      (function (tile) {
        tile.addEventListener("click", function () { nav(tile.getAttribute("data-page")); });
      })(t);
    }
    /* arrow-key roving focus across the dock */
    var dock = $("dock");
    dock.addEventListener("keydown", function (ev) {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      var tiles = Array.prototype.slice.call(dock.querySelectorAll(".dock-ico"));
      var idx = tiles.indexOf(document.activeElement);
      if (idx < 0) return;
      ev.preventDefault();
      var next = ev.key === "ArrowRight" ? (idx + 1) % tiles.length : (idx - 1 + tiles.length) % tiles.length;
      tiles[next].focus();
    });
    /* number keys launch tools, unless you're typing somewhere */
    window.addEventListener("keydown", function (ev) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      for (var i = 0; i < DOCK_ORDER.length; i++) {
        if (ev.key === String(i + 1)) {
          nav(DOCK_ORDER[i]);
          break;
        }
      }
    });
  })();

  /* every page knows which dock tile it belongs to (the unicode
     subpages all light up the UNICODE tile, the courier subpages the FILES one) */
  function dockTileFor(id) {
    if (id === "sendFiles" || id === "downloadFiles") return "fileMenu";
    if (id.indexOf("uni") === 0) return "unicode";
    return id;
  }
  function dockSetActive(id) {
    var want = dockTileFor(id);
    var tiles = document.querySelectorAll(".dock-ico");
    for (var i = 0; i < tiles.length; i++) {
      var on = tiles[i].getAttribute("data-page") === want;
      tiles[i].classList.toggle("active", !!on);
      tiles[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  /* ═══════════════════════════ router + transitions ══════════ */
  var loader = $("loader"), loaderFill = $("loaderFill"), loaderLabel = $("loaderLabel");
  var winBody = $("winBody"), crtFlash = $("crtFlash");

  function titleIcoRender(id) {
    var p = PAGES[id];
    var img = $("titleIco");
    var src = "images/dock/" + p.ico + ".png";
    if (img.getAttribute("src") !== src) img.src = src;
  }

  function nav(id, opts) {
    opts = opts || {};
    if (!PAGES[id]) id = "home";
    if (busy && !opts.instant) return;
    var same = id === current;

    function chrome() {
      var p = PAGES[id];
      $("titleName").textContent = p.sub;
      $("titleName").style.color = ACC_HEX[p.acc];
      $("titleName").style.textShadow = "0 0 8px " + ACC_HEX[p.acc];
      $("stTool").textContent = p.name + " - " + p.sub;
      titleIcoRender(id);
      dockSetActive(id);
      document.title = (id === "home") ? "ADEEM.CO " : p.name;
    }

    function finish() {
      var section = $(id);
      section.classList.remove("out");
      section.classList.add("active");
      winBody.scrollTop = 0;
      loader.classList.remove("show");
      busy = false;
      dockTiles.fileMenu && dockTiles.fileMenu.classList.remove("busy");
      Object.keys(dockTiles).forEach(function (k) { dockTiles[k].classList.remove("busy"); });
      if (!visited[id] && !opts.noFlashFx) {
        visited[id] = true;
        crtFlash.classList.remove("go");
        void crtFlash.offsetWidth;
        crtFlash.classList.add("go");
      }
      setState("READY");
    }

    if (same && current !== null && !opts.instant) return;

    if (opts.instant) {
      /* first boot: no loader, just a power-on flash */
      var old = document.querySelector(".page.active");
      if (old) old.classList.remove("active");
      current = id;
      chrome();
      finish();
      return;
    }

    busy = true;
    chrome(); /* title bar + status + dock LED switch over as loading starts */
    var tileFor = dockTileFor(id);
    if (dockTiles[tileFor]) dockTiles[tileFor].classList.add("busy");
    setState("LOADING", "loading");

    var oldSection = current ? $(current) : null;
    var DUR = REDUCED ? 60 : 420 + Math.random() * 260;

    function swap() {
      if (oldSection) {
        oldSection.classList.add("out");
        setTimeout(function () { oldSection.classList.remove("active", "out"); }, 170);
      }
      loaderLabel.textContent = "LOADING " + PAGES[id].name + "…";
      loaderFill.style.transition = "none";
      loaderFill.style.width = "0%";
      loader.classList.add("show");
      void loaderFill.offsetWidth;
      loaderFill.style.transition = "width " + DUR + "ms linear";
      loaderFill.style.width = "100%";
      setTimeout(finish, DUR + 40);
    }

    if (oldSection && current !== id) {
      setTimeout(swap, 170);
    } else {
      swap();
    }
    current = id;
    /* real hash push so back/forward and shared links keep working
       (the hashchange handler ignores same-id re-entry) */
    if (location.hash !== "#" + id) {
      location.hash = "#" + id;
    }
  }

  /* hash is the source of truth (back/forward, shared links,
     and the ported file-transfer code all write to it) */
  function hashId() {
    var h = (location.hash || "").replace(/^#/, "");
    return PAGES[h] ? h : null;
  }
  window.addEventListener("hashchange", function () {
    var id = hashId();
    if (!id || id === current) return;
    nav(id);
  });

  $("btnHome").addEventListener("click", function () { nav("home"); });

  /* ═══════════════════════ wrap the ported tool hooks ════════
     fileTransfer.js / searcher.js call toggleLoad(),
     updateDownloadProgress() and displayError(). Keep the
     originals intact and mirror them into the status bar. */
  (function () {
    var origToggle = window.toggleLoad;
    window.toggleLoad = function (show) {
      if (typeof origToggle === "function") origToggle(!!show);
      else if (typeof show === "boolean") {
        var l = $("loading");
        if (l) l.style.display = show ? "block" : "none";
      }
      setState(show ? "WORKING…" : "READY");
    };
    var origProg = window.updateDownloadProgress;
    window.updateDownloadProgress = function (pct) {
      if (typeof origProg === "function") origProg(pct);
      var fill = $("dlProgressFill"), bar = $("dlProgress");
      if (fill && bar) {
        bar.removeAttribute("hidden");
        fill.style.width = Math.min(100, Math.max(0, parseFloat(pct) || 0)) + "%";
      }
    };
    var origErr = window.displayError;
    window.displayError = function (title, message) {
      if (typeof origErr === "function") origErr(title, message);
      setState("ERROR", "err");
    };
    /* lookup button (ipLookup.js defines lookupTarget) */
    var ipText = $("ipText"), ipSubmit = $("ipSubmit");
    function doLookup() { if (window.lookupTarget) window.lookupTarget(ipText.value); }
    if (ipText) ipText.addEventListener("keydown", function (ev) { if (ev.key === "Enter") doLookup(); });
    if (ipSubmit) {
      ipSubmit.addEventListener("click", doLookup);
      ipSubmit.addEventListener("mousedown", function () { setState("LOOKING UP…"); });
    }
    /* search button (searcher.js defines performSlopSearch) */
    var typeSel = $("searchTypeSelect"), query = $("searchQueryText"),
      engine = $("engineFormatText"), sBtn = $("searchBtn");
    if (typeSel && engine) {
      typeSel.addEventListener("change", function () {
        var v = typeSel.value || "ddg";
        engine.textContent = "https://adeem.co/?search=true&type=" + v + "&q=%s";
      });
    }
    function doSearch() {
      if (!window.performSlopSearch) return;
      /* an unselected engine falls back to the default (DuckDuckGo)
         instead of the switch in performSlopSearch() silently
         matching no case */
      var t = typeSel ? typeSel.value : "";
      window.performSlopSearch(false, t || "ddg", query.value);
    }
    if (sBtn) sBtn.addEventListener("click", doSearch);
    if (query) query.addEventListener("keydown", function (ev) { if (ev.key === "Enter") doSearch(); });
  })();

  /* ═══════════════════════════ ambient animation ═════════════
     The room background behind the console is one of a pool of
     visualizations in js/ambient.js (the old drifting ghost is
     entry 00) — one is picked at random at every initial page
     load. One rAF loop drives the console's own art: radar sweep,
     globe satellite, courier packets, glyph rain. */
  (function () {
    /* random background for this page load; it owns #bgDrift now */
    var bgId = window.AMBIENT.pick();
    window.AMBIENT.start($("bgDrift"), bgId, REDUCED);
    console.info("ADEEM · ambient background: " + bgId);

    if (REDUCED) return; /* the static frames drawn at boot are fine */

    var check = $("checkArt"), radar = $("radarArt"),
      courier = $("courierArt"), rain = $("glyphRain");

    /* glyph rain state */
    var RC = { cols: [], w: 0, h: 0 };
    function rainInit() {
      RC.w = rain.width; RC.h = rain.height;
      var step = 15;
      RC.n = Math.floor(RC.w / step);
      RC.step = step;
      RC.cols = [];
      for (var i = 0; i < RC.n; i++) {
        /* start mid-fall so the strip is alive from the first frame */
        RC.cols.push({ y: Math.random() * (RC.h + 40) - 60, sp: 0.35 + Math.random() * 0.55, trail: [] });
      }
    }
    rainInit();

    var last = 0, rainClock = 0;

    function frame(ts) {
      var dt = Math.min(50, ts - last) || 16;
      last = ts;
      var t = ts / 1000;

      /* per-page art only animates while its page is the visible one —
         the canvases live inside the (usually hidden) page sections */

      /* ── radar sweep (search page) ── */
      if (current === "search") {
      var o = radar.getContext("2d"), S = radar.width, C = S / 2, R = S / 2 - 4;
      PX.drawRadar(radar);
      var ang = t * 1.7;
      /* fading trail wedge */
      if (o.createConicGradient) {
        var g = o.createConicGradient(ang, C, C);
        g.addColorStop(0, "rgba(53,242,255,.5)");
        g.addColorStop(0.12, "rgba(53,242,255,0)");
        g.addColorStop(1, "rgba(53,242,255,0)");
        o.fillStyle = g;
        o.beginPath(); o.moveTo(C, C); o.arc(C, C, R - 1, 0, Math.PI * 2); o.fill();
      }
      o.strokeStyle = "#fffbe0";
      o.lineWidth = 1.5;
      o.beginPath(); o.moveTo(C, C);
      o.lineTo(C + (R - 2) * Math.cos(ang), C + (R - 2) * Math.sin(ang));
      o.stroke();
      /* blips: each dot flares as the sweep line passes over it,
         then fades until the beam comes back around */
      var TAU = Math.PI * 2;
      [[0.32, -0.55], [0.6, 0.35], [-0.5, 0.42]].forEach(function (b) {
        var bAng = Math.atan2(b[1], b[0]);
        var since = (ang - bAng) % TAU;  /* angle turned since the beam last passed */
        if (since < 0) since += TAU;
        var flare = Math.max(0, 1 - since / 1.4);  /* ~1.3s decay after the pass */
        o.globalAlpha = 0.12 + 0.88 * flare * flare;
        o.fillStyle = "#fffbe0";
        o.fillRect(C + R * b[0] - 2, C + R * b[1] - 2, 4, 4);
      });
      o.globalAlpha = 1;
      } else if (current === "lookup") {
      /* ── database sweep (lookup page): the magnifier steps through four records ── */
      o = check.getContext("2d");
      S = check.width;
      PX.drawCheckArt(check);
      var rows = [12, 23, 34, 45];
      var PER = 1.35, DWELL = 1.1;
      var cycT = t % (PER * 4);
      var idx = Math.floor(cycT / PER);
      var ph = cycT % PER;
      var ly, done;
      if (ph < DWELL) { ly = rows[idx]; done = idx; }
      else {
        var m = (ph - DWELL) / (PER - DWELL);
        var e = m * m * (3 - 2 * m);
        ly = rows[idx] + (rows[(idx + 1) % 4] - rows[idx]) * e;
        done = idx + 1;
      }
      /* rows: scanned = bright + green check, unscanned stay dim */
      rows.forEach(function (y, i) {
        var a = i < done ? 0.9 : 0;
        if (i === idx && ph < DWELL) a = 1;
        if (a > 0) {
          o.globalAlpha = a;
          o.fillStyle = "#fffbe0";
          o.fillRect(10, y, 20, 3);
          o.fillRect(33, y, 11, 3);
          o.globalAlpha = 1;
        }
        if (i < done) {
          o.strokeStyle = "#39ff5e";
          o.lineWidth = 1.5;
          o.beginPath();
          o.moveTo(49, y + 1); o.lineTo(51, y + 3); o.lineTo(54, y - 1);
          o.stroke();
        }
      });
      /* magnifier over the current row */
      var lx = 28;
      o.strokeStyle = "#ffe93b";
      o.lineWidth = 2;
      o.shadowColor = "rgba(255,233,59,.8)"; o.shadowBlur = 5;
      o.beginPath(); o.arc(lx, ly, 8, 0, Math.PI * 2); o.stroke();
      o.strokeStyle = "#fffbe0";
      o.lineWidth = 3;
      o.beginPath(); o.moveTo(lx + 6, ly + 6); o.lineTo(lx + 11, ly + 11); o.stroke();
      o.shadowBlur = 0;
      } else if (current === "fileMenu") {
      /* ── courier packets (file sharing page) ── */
      o = courier.getContext("2d");
      var W = courier.width;
      PX.drawCourier(courier);
      var span = W - 96;
      /* one-way: the file only travels sender → receiver */
      for (var i = 0; i < 3; i++) {
        var px = 48 + ((t * 42 + i * span / 3) % span);
        o.fillStyle = "#39ff5e";
        o.fillRect(px, 17, 5, 5);
      }
      /* receiver blinks as data arrives */
      if (Math.floor(t * 3) % 2 === 0) {
        o.fillStyle = "rgba(255,229,59,.8)";
        o.fillRect(W - 34, 14, 12, 2);
      }

      } else if (current === "unicode") {
      /* ── glyph rain (unicode page, tick at ~24fps) ── */
      rainClock += dt;
      if (rainClock > 42) {
        rainClock = 0;
        var ro = rain.getContext("2d");
        ro.fillStyle = "rgba(1,8,4,.22)";
        ro.fillRect(0, 0, RC.w, RC.h);
        for (var c = 0; c < RC.n; c++) {
          var col = RC.cols[c];
          if (Math.random() < 0.5) {
            col.y += RC.step * col.sp;
            if (col.y > RC.h + 20) { col.y = -20 - Math.random() * 60; col.sp = 0.35 + Math.random() * 0.55; }
          }
        }
        ro.font = "15px 'Courier New', monospace";
        for (var c2 = 0; c2 < RC.n; c2++) {
          var col2 = RC.cols[c2];
          var ch = PX.glyphRand();
          ro.globalAlpha = 0.9;
          ro.fillStyle = "#c9ffce";
          ro.fillText(ch, c2 * RC.step, col2.y);
          ro.globalAlpha = 0.32;
          ro.fillStyle = "#39ff5e";
          for (var k = 1; k < 7; k++) {
            ro.fillText(PX.glyphRand(), c2 * RC.step, col2.y - k * RC.step);
          }
        }
        ro.globalAlpha = 1;
      }
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })();

  /* ═══════════════════════════ scale to fit ══════════════════
     Wide windows: the monitor is a fixed-size "movie" (1024px,
     --console-w in styles.css); if the window is a little narrow we
     scale the whole thing down (Flash's "show all"), letterboxed on
     the CRT. Narrow windows (phones): no transform — under 900px the
     console goes fluid (see the media query in styles.css) instead of
     shrinking into an unreadable thumbnail. */
  (function () {
    var FLUID_BELOW = 900;
    var CONSOLE_W = 1024; /* keep in sync with --console-w */
    var c = $("console");
    function fit() {
      var vw = window.innerWidth;
      if (vw < FLUID_BELOW) {
        c.style.transform = "";
        return;
      }
      var s = Math.min(1, (vw - 8) / CONSOLE_W);
      if (s < 1) {
        var tx = Math.max(0, (vw - CONSOLE_W * s) / 2);
        c.style.transform = "translateX(" + tx.toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
      } else {
        c.style.transform = "";
      }
    }
    window.addEventListener("resize", fit);
    fit();
  })();

  /* ═══════════════════════════ power on ══════════════════════
     not a boot sequence — just the CRT waking up: a quick
     horizontal line flash, the dock LEDs doing a sweep, and the
     first page in. */
  function powerOn() {
    if (!REDUCED) {
      crtFlash.classList.remove("go");
      void crtFlash.offsetWidth;
      crtFlash.classList.add("go");
      /* dock LED self-test sweep */
      var tiles = document.querySelectorAll(".dock-ico");
      for (var i = 0; i < tiles.length; i++) {
        (function (tile, k) {
          setTimeout(function () {
            tile.classList.add("busy");
            setTimeout(function () { tile.classList.remove("busy"); }, 110);
          }, 120 + k * 75);
        })(tiles[i], i);
      }
    }
    var id = hashId() || "home";
    nav(id, { instant: true, noFlashFx: REDUCED });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", powerOn);
  } else {
    powerOn();
  }
})();
