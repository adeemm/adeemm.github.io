/* ════════════════════════════════════════════════════════════════
   unicodeTools.js — the six Unicode 16 tools, rebuilt on-board.
   browse · combine · confusables · emoji · search · watermark

   Data: json/*.json (Unicode 16.0 — the same files the live site
   ships). Each tool lazy-loads only the data it needs the first
   time its page is opened, behind the WORKING overlay.
═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  /* ── shared state ─────────────────────────────────────────── */
  var CPD = null;        // CodepointDict
  var ALIASES = null;    // PropertyValueAliases
  var CONF = null;       // Confusables
  var CONFE = null;      // ConfusablesEmoji (lite)
  var EMOJI = null;      // EmojiData
  var EMSEQ = null;      // EmojiSequences
  var EMVS = null;       // EmojiVariationSequences
  var EMZWJ = null;      // EmojiZWJSequences

  var jsonCache = {};
  function loadJson(name) {
    if (!jsonCache[name]) {
      jsonCache[name] = fetch("json/" + name + ".json").then(function (r) {
        if (!r.ok) throw new Error(name + ".json: HTTP " + r.status);
        return r.json();
      }).catch(function (err) { delete jsonCache[name]; throw err; });
    }
    return jsonCache[name];
  }

  /* the WORKING overlay + status bar are provided by main.js's
     window.toggleLoad() wrapper */
  function loading(on) {
    if (typeof window.toggleLoad === "function") window.toggleLoad(on);
  }

  function toolError(pageId, err) {
    loading(false);
    var el = $(pageId + "Err");
    if (el) { el.hidden = false; el.textContent = "COULD NOT LOAD THE UNICODE DATA — " + (err && err.message ? err.message : err); }
  }

  /* ── small helpers ────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function hexOf(cp) { return cp.toString(16).toUpperCase().padStart(4, "0"); }
  function cpHexStr(cp) { return "U+" + hexOf(cp); }
  function glyphOf(cps) {
    return cps.map(function (cp) { return String.fromCodePoint(cp); }).join("");
  }
  function fromHex(h) {
    return String(h).split(/\s+/).map(function (x) { return parseInt(x, 16); });
  }
  function titleCase(s) {
    return String(s).toLowerCase()
      .replace(/(^|[\s\-,(\[’'':;])([a-z\u00c0-\u02af])/g, function (m, sep, ch) { return sep + ch.toUpperCase(); });
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { }
    document.body.removeChild(ta);
  }
  function copyText(text, btn) {
    function done() {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = "✓ COPIED";
      setTimeout(function () { btn.textContent = old; }, 1200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function flashNote(id, msg, warn) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("warn", !!warn);
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.textContent = ""; el.classList.remove("warn"); }, 4000);
  }

  /* ── character modal (browse + search) ────────────────────── */
  var modalVeil = null;
  function modalKey(e) { if (e.key === "Escape") closeModal(); }
  function closeModal() {
    if (!modalVeil) return;
    modalVeil.remove();
    document.removeEventListener("keydown", modalKey);
    modalVeil = null;
  }
  function openCharModal(hexKey) {
    if (!CPD) return;
    closeModal();
    var d = CPD[hexKey] || {};
    var ch = String.fromCodePoint(parseInt(hexKey, 16));
    var veil = document.createElement("div");
    veil.className = "modal-veil";
    veil.innerHTML =
      '<div class="modal-box">' +
      '<div class="modal-top"><span class="bright">U+' + esc(hexKey) + '</span>' +
      '<button type="button" class="winbtn winbtn-x" data-close title="close" aria-label="close">✕</button></div>' +
      '<div class="modal-glyph">' + esc(ch) + "</div>" +
      '<div class="modal-name">' + esc(d.name || "NO NAME") + "</div>" +
      '<table class="tt modal-meta">' +
      "<tr><td>BLOCK</td><td>" + esc(d.block || "—") + "</td></tr>" +
      "<tr><td>CATEGORY</td><td>" + esc(d.category || "—") + "</td></tr>" +
      "<tr><td>BIDI CLASS</td><td>" + esc(d.bidirectionalCategory || "—") + "</td></tr>" +
      "<tr><td>COMBINING</td><td>" + esc(String(d.canonicalCombiningClass || "0")) + "</td></tr>" +
      "</table>" +
      '<div class="rowctl"><button type="button" class="btn" data-copy>[ COPY CHARACTER ]</button></div>' +
      "</div>";
    veil.addEventListener("mousedown", function (e) { if (e.target === veil) closeModal(); });
    veil.querySelector("[data-close]").addEventListener("click", closeModal);
    veil.querySelector("[data-copy]").addEventListener("click", function () { copyText(ch, this); });
    document.body.appendChild(veil);
    document.addEventListener("keydown", modalKey);
    modalVeil = veil;
  }

  /* ═══════════════════════════ 1 · BROWSE ════════════════════ */
  var browseReady = false;
  function initBrowse() {
    if (browseReady) return;
    browseReady = true;
    loading(true);
    Promise.all([loadJson("CodepointDict"), loadJson("PropertyValueAliases")]).then(function (res) {
      CPD = res[0];
      ALIASES = res[1].PropertyValueAliases || [];
      var sel = $("uniBrowseType");
      sel.addEventListener("change", function () { renderBrowseType(sel.value); });
      $("uniBrowseGroups").addEventListener("click", function (e) {
        var cell = e.target.closest ? e.target.closest(".char-cell") : null;
        if (cell) openCharModal(cell.dataset.cp);
      });
      renderBrowseType(sel.value || "bidirectionalCategory");
      loading(false);
    }).catch(function (err) { toolError("uniBrowse", err); });
  }

  function aliasLong(prop, key) {
    if (!ALIASES) return null;
    for (var i = 0; i < ALIASES.length; i++) {
      var a = ALIASES[i];
      if (a.property !== prop) continue;
      if (prop === "ccc" ? a.class === key : a.shortName === key) {
        return (a.longName || a.shortName).replace(/_/g, " ");
      }
    }
    return null;
  }

  function renderBrowseType(attr) {
    var host = $("uniBrowseGroups");
    host.innerHTML = "";
    var map = {};
    var order = [];
    Object.keys(CPD).forEach(function (k) {
      var v = CPD[k];
      var key = v[attr];
      if (key === null || key === undefined) return;
      key = String(key);
      if (!map[key]) { map[key] = { cps: [], first: parseInt(k, 16) }; order.push(key); }
      map[key].cps.push(k);
    });
    var groups = order.map(function (key) {
      var g = map[key];
      var label = key;
      if (attr === "bidirectionalCategory") label = aliasLong("bc", key) || key;
      else if (attr === "category") label = aliasLong("gc", key) || key;
      else if (attr === "canonicalCombiningClass") label = key === "0" ? "Not Reordered" : (aliasLong("ccc", key) || "CCC " + key);
      return { key: key, label: label, cps: g.cps, first: g.first };
    });
    groups.sort(function (a, b) {
      if (attr === "block") return a.first - b.first;
      return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0);
    });
    var frag = document.createDocumentFragment();
    groups.forEach(function (g) {
      var det = document.createElement("details");
      det.className = "browse-group";
      var sum = document.createElement("summary");
      sum.innerHTML = '<span class="bg-name">' + esc(g.label) + '</span><span class="bg-count">' + g.cps.length + " CHARS</span>";
      var body = document.createElement("div");
      body.className = "bg-body";
      det.appendChild(sum);
      det.appendChild(body);
      det.addEventListener("toggle", function () {
        if (det.open && !body.dataset.filled) {
          body.dataset.filled = "1";
          fillCharGrid(body, g.cps);
        }
      });
      frag.appendChild(det);
    });
    host.appendChild(frag);
  }

  function fillCharGrid(body, cps) {
    var grid = document.createElement("div");
    grid.className = "char-grid";
    var frag = document.createDocumentFragment();
    cps.forEach(function (k) {
      var cell = document.createElement("div");
      cell.className = "char-cell";
      cell.dataset.cp = k;
      cell.title = (CPD[k] && CPD[k].name) || k;
      var g = document.createElement("span");
      g.className = "cc-glyph";
      g.textContent = String.fromCodePoint(parseInt(k, 16));
      var h = document.createElement("span");
      h.className = "cc-hex";
      h.textContent = k;
      cell.appendChild(g);
      cell.appendChild(h);
      frag.appendChild(cell);
    });
    grid.appendChild(frag);
    body.appendChild(grid);
  }

  /* ═══════════════════════════ 2 · COMBINE ═══════════════════ */
  var CCC_NAMES = {
    "1": "Overlay", "6": "Han Reading", "7": "Nukta", "8": "Kana Voicing", "9": "Virama",
    "200": "Attached Below Left", "202": "Attached Below", "214": "Attached Above",
    "216": "Attached Above Right", "218": "Below Left", "220": "Below", "222": "Below Right",
    "224": "Left", "226": "Right", "228": "Above Left", "230": "Above", "232": "Above Right",
    "233": "Double Below", "234": "Double Above", "240": "Iota Subscript"
  };
  var combineReady = false;
  function initCombine() {
    if (combineReady) return;
    combineReady = true;
    var tText = $("uniCombText"), tCps = $("uniCombCps"), ins = $("uniInsertCp");

    tText.addEventListener("input", function () {
      var out = "";
      Array.from(tText.value).forEach(function (ch) {
        out += "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0") + " ";
      });
      tCps.value = out.replace(/\s+$/, "");
    });
    tCps.addEventListener("input", function () {
      var out = "";
      tCps.value.split(/\s+/).forEach(function (tok) {
        if (!tok) return;
        var cp = parseInt(tok.replace(/^u\+?/i, ""), 16);
        if (!isNaN(cp) && cp >= 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF)) {
          try { out += String.fromCodePoint(cp); } catch (e) { }
        }
      });
      tText.value = out;
    });
    function insert(where) {
      var raw = ins.value.replace(/^u\+?/i, "").trim();
      var cp = parseInt(raw, 16);
      if (isNaN(cp) || cp < 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) {
        flashNote("uniCombNote", "NOT A VALID CODEPOINT: \"" + ins.value + "\"", true);
        return;
      }
      var ch = String.fromCodePoint(cp);
      tText.value = (where === "front" ? ch : "") + tText.value + (where === "end" ? ch : "");
      tText.dispatchEvent(new Event("input"));
    }
    $("uniPrepend").addEventListener("click", function () { insert("front"); });
    $("uniAppend").addEventListener("click", function () { insert("end"); });
    $("uniCombTable").addEventListener("click", function (e) {
      var tr = e.target.closest ? e.target.closest("tr") : null;
      if (tr && tr.dataset.cp) ins.value = "U+" + tr.dataset.cp;
    });

    loading(true);
    loadJson("CodepointDict").then(function (d) {
      CPD = d;
      var have = {};
      Object.keys(d).forEach(function (k) {
        var c = d[k].canonicalCombiningClass;
        if (c && c !== "0") have[c] = true;
      });
      var keys = Object.keys(have).sort(function (a, b) { return parseInt(a) - parseInt(b); });
      var sel = $("uniCombCat");
      keys.forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c;
        opt.textContent = CCC_NAMES[c] || ("CCC" + c);
        sel.appendChild(opt);
      });
      sel.addEventListener("change", function () { renderCombClass(sel.value); });
      loading(false);
    }).catch(function (err) { toolError("uniCombine", err); });
  }

  function renderCombClass(c) {
    var tbody = $("uniCombTbody"), table = $("uniCombTable");
    tbody.innerHTML = "";
    if (!c) { table.hidden = true; return; }
    var frag = document.createDocumentFragment();
    Object.keys(CPD).forEach(function (k) {
      if (CPD[k].canonicalCombiningClass !== c) return;
      var tr = document.createElement("tr");
      tr.dataset.cp = k;
      var td1 = document.createElement("td");
      var code = document.createElement("code");
      code.textContent = "U+" + k;
      td1.appendChild(code);
      var td2 = document.createElement("td");
      td2.className = "cc-big";
      td2.textContent = String.fromCodePoint(parseInt(k, 16));
      var td3 = document.createElement("td");
      td3.textContent = CPD[k].name || "";
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
    table.hidden = false;
  }

  /* ═══════════════════════════ 3 · CONFUSABLES ═══════════════ */
  var confReady = false;
  function initConfusables() {
    if (confReady) return;
    confReady = true;
    var input = $("uniConfInput");
    function run() {
      var term = input.value;
      var randomEl = $("uniConfRandom"), tbody = $("uniConfRows");
      tbody.innerHTML = "";
      if (!term) { randomEl.textContent = "—"; return; }
      if (!CONF) { randomEl.textContent = "STILL LOADING THE SWAP TABLES…"; return; }
      var rand = "", any = false;
      var frag = document.createDocumentFragment();
      for (var i = 0; i < term.length; i++) {
        var ch = term[i];
        var conf = CONF[ch];
        var emoj = CONFE[ch.toUpperCase()];
        if (!conf && !emoj) continue;
        any = true;
        if (conf && conf.length) rand += conf[Math.floor(Math.random() * conf.length)].c;
        var tr = document.createElement("tr");
        var td0 = document.createElement("td");
        td0.className = "cc-big";
        td0.textContent = ch;
        tr.appendChild(td0);
        var td1 = document.createElement("td");
        var parts = [];
        (conf || []).forEach(function (e) { parts.push(esc(e.c)); });
        (emoj || []).forEach(function (e) { parts.push(esc(e)); });
        td1.innerHTML = parts.join("&nbsp;&nbsp;&nbsp;");
        tr.appendChild(td1);
        frag.appendChild(tr);
      }
      randomEl.textContent = any ? (rand || "—") : "NO LOOK-ALIKES FOUND FOR THIS TEXT";
      tbody.appendChild(frag);
    }
    input.addEventListener("input", run);
    loading(true);
    Promise.all([loadJson("Confusables"), loadJson("ConfusablesEmoji")]).then(function (res) {
      CONF = res[0];
      CONFE = res[1];
      loading(false);
      if (input.value) run();
    }).catch(function (err) { toolError("uniConfusables", err); });
  }

  /* ═══════════════════════════ 4 · EMOJI ═════════════════════ */
  var ZWJ = 0x200D, KEYCAP = 0x20E3, VS16 = 0xFE0F, VS15 = 0xFE0E;
  var RI_LO = 0x1F1E6, RI_HI = 0x1F1FF;
  var SKIN_LO = 0x1F3FB, SKIN_HI = 0x1F3FF;
  var YEAR_BY_AGE = { "1.1": 1999, "2.0": 1999, "3.0": 2005, "3.2": 2009, "4.0": 2008, "4.1": 2005, "5.0": 2006, "5.1": 2008, "5.2": 2009, "6.0": 2010, "6.1": 2012, "6.2": 2012, "6.3": 2014, "7.0": 2014, "8.0": 2015, "9.0": 2016, "10.0": 2017, "11.0": 2018, "12.0": 2019, "12.1": 2019, "13.0": 2020, "14.0": 2021, "15.0": 2022, "15.1": 2023, "16.0": 2024 };
  var EMOJI_RELEASE_BY_AGE = { "6.0": "0.6", "6.1": "0.6", "6.2": "0.6", "6.3": "0.6", "7.0": "1.0", "8.0": "2.0", "9.0": "3.0", "10.0": "4.0", "11.0": "5.0", "12.0": "6.0", "12.1": "7.0", "13.0": "8.0–10.0", "14.0": "11.0", "15.0": "12.0–14.0", "15.1": "15.0", "16.0": "16.0" };
  var GRID_BATCH = 400;
  var emojiReady = false;
  var emojiList = [], unqualified = [], zwjList = [], keycapList = [], flagList = [], skinToneList = [];
  var emFiltered = [], emShown = 0, emPresMode = "text";

  function cpNamePretty(cp) {
    var d = CPD[hexOf(cp)];
    if (!d || !d.name) return "U+" + hexOf(cp);
    return titleCase(d.name.replace(/;/, ""));
  }
  function emRoleOf(cp) {
    if (cp === ZWJ) return { label: "ZWJ", cls: "r-zwj" };
    if (cp === KEYCAP) return { label: "KEYCAP", cls: "r-keycap" };
    if (cp === VS16) return { label: "VS-16", cls: "r-vs" };
    if (cp === VS15) return { label: "VS-15", cls: "r-vs" };
    if (cp >= SKIN_LO && cp <= SKIN_HI) return { label: "SKIN TONE", cls: "r-skin" };
    if (cp >= RI_LO && cp <= RI_HI) return { label: "REG. INDICATOR", cls: "r-ri" };
    if (cp >= 0xE0000 && cp <= 0xE007F) return { label: "TAG", cls: "r-tag" };
    var d = EMOJI[hexOf(cp)];
    if (d && d.emoji_modifier_base) return { label: "MODIFIER BASE", cls: "r-emoji" };
    if (d && d.emoji) return { label: "EMOJI", cls: "r-emoji" };
    if (d && d.emoji_component) return { label: "COMPONENT", cls: "r-comp" };
    if (d && d.extended_pictographic) return { label: "PICTOGRAPH", cls: "r-comp" };
    return { label: "CHARACTER", cls: "r-char" };
  }
  var SEQ_TYPE_LABELS = {
    Basic_Emoji: "basic emoji sequence",
    RGI_Emoji_Flag_Sequence: "official flag sequence",
    RGI_Emoji_Tag_Sequence: "official tag sequence",
    Emoji_Keycap_Sequence: "official keycap sequence",
    RGI_Emoji_Modifier_Sequence: "official modifier sequence"
  };
  function emSeqTypeLabel(t) { return SEQ_TYPE_LABELS[t] || t; }

  function emSequenceName(cps) {
    if (cps.length === 1) return cpNamePretty(cps[0]);
    var key = cps.map(hexOf).join(" ");
    if (EMZWJ[key]) return EMZWJ[key];
    if (EMSEQ[key]) return EMSEQ[key].desc;
    return null;
  }

  function initEmoji() {
    if (emojiReady) return;
    emojiReady = true;
    loading(true);
    Promise.all([
      loadJson("CodepointDict"), loadJson("PropertyValueAliases"),
      loadJson("EmojiData"), loadJson("EmojiSequences"),
      loadJson("EmojiVariationSequences"), loadJson("EmojiZWJSequences")
    ]).then(function (res) {
      CPD = res[0];
      ALIASES = res[1].PropertyValueAliases || [];
      EMOJI = res[2];
      EMSEQ = res[3];
      EMVS = res[4];
      EMZWJ = res[5];
      buildEmLists();
      buildEmZwjList();
      buildEmKeycaps();
      buildEmFlags();
      buildEmSkinTones();
      buildEmBlockOptions();
      applyEmFilter();
      renderEmPresentation();
      bindEmEvents();
      loading(false);
    }).catch(function (err) { toolError("uniEmoji", err); });
  }

  function buildEmLists() {
    Object.keys(EMOJI).forEach(function (k) {
      var d = EMOJI[k];
      var cp = parseInt(k, 16);
      var cd = CPD[k] || null;
      var entry = {
        cp: cp, hex: k, glyph: String.fromCodePoint(cp),
        name: cd && cd.name ? cd.name : k,
        pretty: cd && cd.name ? titleCase(cd.name.replace(/;/, "")) : k,
        block: cd && cd.block ? cd.block : "Unknown",
        note: d.note || ""
      };
      if (d.emoji && !d.emoji_modifier && !(cp >= RI_LO && cp <= RI_HI)) {
        emojiList.push(entry);
        if (!d.emoji_presentation) unqualified.push(entry);
      }
    });
  }

  var ZWJ_CAT_RANK = { people: 0, love: 1, other: 2 };
  var ZWJ_LOVE_WORDS = ["couple with heart", "kiss", "holding hands", "handshake", "family"];
  var ZWJ_PERSON_WORDS = ["man", "woman", "person", "people", "deaf", "merman", "mermaid", "genie", "zombie"];
  function zwjCategory(name, cps) {
    var n = name.toLowerCase();
    if (ZWJ_LOVE_WORDS.some(function (w) { return n.indexOf(w) !== -1; })) return "love";
    var d = EMOJI[hexOf(cps[0])];
    if (d && d.emoji_modifier_base) return "people";
    if (ZWJ_PERSON_WORDS.some(function (w) { return n.indexOf(w) !== -1; })) return "people";
    return "other";
  }
  function buildEmZwjList() {
    var list = [];
    Object.keys(EMZWJ).forEach(function (h, i) {
      var cps = fromHex(h);
      list.push({
        seq: true, hexKey: h, cps: cps, glyph: glyphOf(cps),
        name: EMZWJ[h], pretty: titleCase(EMZWJ[h]),
        rank: ZWJ_CAT_RANK[zwjCategory(EMZWJ[h], cps)], i: i
      });
    });
    list.sort(function (a, b) { return a.rank - b.rank || a.i - b.i; });
    zwjList = list;
  }
  function keycapFor(cp) {
    var cps = [cp];
    if (cp === 0x23 || cp === 0x2A || (cp >= 0x30 && cp <= 0x39)) cps.push(VS16);
    cps.push(KEYCAP);
    return cps;
  }
  function buildEmKeycaps() {
    var bases = [];
    for (var i = 0x30; i <= 0x39; i++) bases.push(i);
    bases.push(0x23, 0x2A);
    bases.forEach(function (cp) {
      var cps = keycapFor(cp);
      var seq = EMSEQ[cps.map(hexOf).join(" ")] || {};
      var name = (seq.desc || "keycap: " + String.fromCodePoint(cp)).replace(/\\x\{[0-9A-Fa-f]+\}/g, function (m) {
        return String.fromCodePoint(parseInt(m.slice(3, -1), 16));
      });
      keycapList.push({
        seq: true, hexKey: cps.map(hexOf).join(" "), cps: cps, glyph: glyphOf(cps),
        name: name, pretty: titleCase(name)
      });
    });
  }
  function buildEmFlags() {
    Object.keys(EMSEQ).forEach(function (h) {
      var t = EMSEQ[h].type;
      if (t !== "RGI_Emoji_Flag_Sequence" && t !== "RGI_Emoji_Tag_Sequence") return;
      var cps = fromHex(h);
      flagList.push({
        seq: true, hexKey: h, cps: cps, glyph: glyphOf(cps),
        name: EMSEQ[h].desc, pretty: titleCase(EMSEQ[h].desc)
      });
    });
  }
  function buildEmSkinTones() {
    Object.keys(EMSEQ).forEach(function (h) {
      if (EMSEQ[h].type !== "RGI_Emoji_Modifier_Sequence") return;
      var cps = fromHex(h);
      skinToneList.push({
        seq: true, hexKey: h, cps: cps, glyph: glyphOf(cps),
        name: EMSEQ[h].desc, pretty: titleCase(EMSEQ[h].desc)
      });
    });
  }
  function buildEmBlockOptions() {
    var blocks = {};
    emojiList.forEach(function (e) { blocks[e.block] = true; });
    var names = Object.keys(blocks).sort();
    var sel = $("uniEmBlock");
    names.forEach(function (b) {
      var o = document.createElement("option");
      o.value = b;
      o.textContent = b;
      sel.appendChild(o);
    });
  }

  function emPool() {
    var b = $("uniEmBlock").value;
    if (b === "ZWJ") return zwjList;
    if (b === "KEYCAP") return keycapList;
    if (b === "FLAG") return flagList;
    if (b === "SKINTONE") return skinToneList;
    return emojiList;
  }

  function applyEmFilter() {
    var q = $("uniEmSearch").value.trim().toLowerCase();
    var block = $("uniEmBlock").value;
    var isSeq = block === "ZWJ" || block === "KEYCAP" || block === "FLAG" || block === "SKINTONE";
    var pool = emPool();
    emFiltered = pool.filter(function (e) {
      if (!isSeq && block !== "ALL" && e.block !== block) return false;
      if (!q) return true;
      var hexStr = e.seq ? e.hexKey : e.hex;
      return e.name.toLowerCase().indexOf(q) !== -1
        || (!e.seq && e.note && e.note.toLowerCase().indexOf(q) !== -1)
        || hexStr.toLowerCase().indexOf(q.replace(/^u\+/, "")) !== -1;
    });
    emShown = 0;
    $("uniEmGrid").innerHTML = "";
    renderEmBatch();
  }

  /* shrink long sequences so they fit inside a cell; invisible
     codepoints don't count toward the visible width */
  function zwjCellStyle(cps) {
    var visible = cps.filter(function (cp) {
      return cp !== ZWJ && cp !== VS15 && cp !== VS16 && cp !== KEYCAP
        && !(cp >= 0xE0000 && cp <= 0xE007F);
    }).length;
    if (visible <= 2) return "";
    if (visible === 3) return "font-size:20px;";
    if (visible === 4) return "font-size:16px;";
    return "font-size:13px;";
  }

  function renderEmBatch() {
    var grid = $("uniEmGrid");
    var end = Math.min(emShown + GRID_BATCH, emFiltered.length);
    if (emShown >= emFiltered.length) {
      $("uniEmMore").hidden = emFiltered.length === 0;
      $("uniEmEmpty").hidden = emFiltered.length > 0;
      return;
    }
    var frag = document.createDocumentFragment();
    for (var i = emShown; i < end; i++) {
      var e = emFiltered[i];
      var title = e.seq
        ? e.pretty + " (" + e.cps.map(cpHexStr).join(" ") + ")"
        : e.pretty + " (" + cpHexStr(e.cp) + ")" + (e.note ? " - " + e.note : "");
      var cell = document.createElement("div");
      cell.className = "char-cell" + (e.seq ? " em-seq" : "");
      cell.dataset.cp = e.seq ? e.hexKey : e.hex;
      cell.title = title;
      var sp = document.createElement("span");
      sp.className = "cc-glyph";
      var fs = e.seq ? zwjCellStyle(e.cps) : "";
      if (fs) sp.style.cssText = fs;
      sp.textContent = e.glyph;
      cell.appendChild(sp);
      frag.appendChild(cell);
    }
    grid.appendChild(frag);
    emShown = end;
    $("uniEmMore").hidden = end >= emFiltered.length;
    $("uniEmEmpty").hidden = emFiltered.length > 0;
  }

  function emSelectSequence(cps) {
    var s = glyphOf(cps);
    var key = cps.map(hexOf).join(" ");
    var name = emSequenceName(cps) || cps.map(cpNamePretty).join(" + ");
    var badges = "";
    if (cps.length === 1) {
      var d = EMOJI[hexOf(cps[0])] || {};
      var cd = CPD[hexOf(cps[0])] || {};
      if (d.age) badges += '<span class="eb-badge">Unicode ' + esc(d.age) + " (" + (YEAR_BY_AGE[d.age] || "") + ")</span>";
      if (d.age && EMOJI_RELEASE_BY_AGE[d.age] && d.age !== "13.0" && d.age !== "15.0") {
        badges += '<span class="eb-badge">Emoji ' + esc(EMOJI_RELEASE_BY_AGE[d.age]) + "</span>";
      } else if (d.age === "13.0") badges += '<span class="eb-badge">Emoji 8.0/9.0/10.0</span>';
      else if (d.age === "15.0") badges += '<span class="eb-badge">Emoji 12.0/13.0/14.0</span>';
      if (cd.block) badges += '<span class="eb-badge">' + esc(cd.block) + " block</span>";
    } else {
      badges += '<span class="eb-badge">' + cps.length + " codepoints</span>";
      if (EMZWJ[key]) badges += '<span class="eb-badge">official RGI ZWJ sequence</span>';
      else if (EMSEQ[key]) badges += '<span class="eb-badge">' + esc(emSeqTypeLabel(EMSEQ[key].type)) + "</span>";
      else badges += '<span class="eb-badge dim">not in the RGI list</span>';
    }
    var rows = cps.map(function (cp, i) {
      var r = emRoleOf(cp);
      var invis = (cp === ZWJ || (cp >= 0xFE00 && cp <= 0xFE0F) || cp === KEYCAP) ? ' <span class="dim">(invisible)</span>' : "";
      return "<tr><td>" + (i + 1) + '</td><td class="cc-big">' + esc(String.fromCodePoint(cp)) + invis + "</td>" +
        '<td class="em-mono">U+' + hexOf(cp) + "</td><td>" + esc(cpNamePretty(cp)) + "</td>" +
        '<td><span class="em-role ' + r.cls + '">' + r.label + "</span></td></tr>";
    }).join("");
    var table = '<table class="tt"><tr><th>#</th><th></th><th>CODEPOINT</th><th>NAME</th><th>ROLE</th></tr>' + rows + "</table>";
    var escSeq = cps.map(function (cp) { return "\\u{" + hexOf(cp) + "}"; }).join(" ");
    var copyRow = '<div class="rowctl">' +
      '<button type="button" class="btn" data-copy="' + esc(s) + '">[ COPY EMOJI ]</button>' +
      '<button type="button" class="btn" data-copy="' + cps.map(cpHexStr).join(" ") + '">[ COPY CODEPOINTS ]</button>' +
      '<button type="button" class="btn btn-alt" data-copy="' + esc(escSeq) + '">[ COPY \\u ESCAPES ]</button>' +
      "</div>";
    var box = $("uniEmInspect");
    box.innerHTML = '<div class="em-big">' + esc(s) + "</div>" +
      '<div class="em-name">' + esc(titleCase(name)) + "</div>" +
      '<div class="em-badges">' + badges + "</div>" + table + copyRow;
    box.hidden = false;
    $("uniEmInspectIdle").hidden = true;
    box.querySelectorAll("button[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () { copyText(b.getAttribute("data-copy"), b); });
    });
    /* highlight the matching cell in the explorer grid */
    var grid = $("uniEmGrid");
    grid.querySelectorAll(".char-cell.sel").forEach(function (c) { c.classList.remove("sel"); });
    if (cps.length === 1) {
      var h = hexOf(cps[0]);
      var cell = grid.querySelector('.char-cell[data-cp="' + h + '"]');
      if (cell) cell.classList.add("sel");
    }
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderEmPresentation() {
    var vs = emPresMode === "text" ? VS15 : VS16;
    var grid = $("uniEmPres");
    grid.innerHTML = "";
    var frag = document.createDocumentFragment();
    unqualified.forEach(function (e) {
      var cell = document.createElement("div");
      cell.className = "char-cell";
      cell.dataset.cp = e.hex + " " + hexOf(vs);
      cell.title = e.pretty + " (U+" + e.hex + " U+" + hexOf(vs) + ")";
      var sp = document.createElement("span");
      sp.className = "cc-glyph";
      sp.textContent = e.glyph + String.fromCodePoint(vs);
      cell.appendChild(sp);
      frag.appendChild(cell);
    });
    grid.appendChild(frag);
  }

  function bindEmEvents() {
    var t = null;
    $("uniEmSearch").addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(applyEmFilter, 120);
    });
    $("uniEmBlock").addEventListener("change", applyEmFilter);
    $("uniEmMore").addEventListener("click", renderEmBatch);
    $("uniEmGrid").addEventListener("click", function (e) {
      var cell = e.target.closest ? e.target.closest(".char-cell") : null;
      if (cell) emSelectSequence(fromHex(cell.dataset.cp));
    });
    $("uniEmPres").addEventListener("click", function (e) {
      var cell = e.target.closest ? e.target.closest(".char-cell") : null;
      if (cell) emSelectSequence(fromHex(cell.dataset.cp));
    });
    $("uniEmPresSeg").addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b) return;
      emPresMode = b.dataset.mode;
      this.querySelectorAll("button").forEach(function (x) {
        x.setAttribute("aria-pressed", x === b ? "true" : "false");
      });
      renderEmPresentation();
    });
  }

  /* ═══════════════════════════ 5 · SEARCH ════════════════════ */
  var searchReady = false;
  function initSearch() {
    if (searchReady) return;
    searchReady = true;
    var box = $("uniSearchBox");
    var t = null;
    box.addEventListener("input", function () {
      clearTimeout(t);
      loading(false);
      t = setTimeout(runUniSearch, 700);
    });
    $("uniSearchRows").addEventListener("click", function (e) {
      var tr = e.target.closest ? e.target.closest("tr") : null;
      if (tr && tr.dataset.cp) openCharModal(tr.dataset.cp);
    });
    loading(true);
    loadJson("CodepointDict").then(function (d) {
      CPD = d;
      loading(false);
    }).catch(function (err) { toolError("uniSearch", err); });
  }

  function runUniSearch() {
    var term = $("uniSearchBox").value;
    var out = $("uniSearchOut"), rows = $("uniSearchRows"), more = $("uniSearchMore");
    rows.innerHTML = "";
    more.textContent = "";
    if (!term || !CPD) { out.hidden = true; return; }
    loading(true);
    var single = term.length === 1;
    var q = single ? term : term.toLowerCase();
    var MAX = 500;
    /* collect the hits, then order them by codepoint: the dictionary's
       insertion order groups astral blocks first, so a query like
       "0041" would otherwise surface U+10041 above U+0041 */
    var hits = [];
    Object.keys(CPD).forEach(function (k) {
      var v = CPD[k];
      var hit;
      if (single) {
        hit = String.fromCodePoint(parseInt(k, 16)) === q;
      } else {
        hit = ("u+" + k.toLowerCase()).indexOf(q) !== -1
          || ((v.name || "").toLowerCase().indexOf(q) !== -1)
          || ((v.aliases || []).join(" ").toLowerCase().indexOf(q) !== -1)
          || ((v.crossReferences || []).join(" ").toLowerCase().indexOf(q) !== -1)
          || ((v.comments || []).join(" ").toLowerCase().indexOf(q) !== -1);
      }
      if (hit) hits.push(k);
    });
    hits.sort(function (a, b) { return parseInt(a, 16) - parseInt(b, 16); });
    var frag = null;
    for (var i = 0; i < hits.length && i < MAX; i++) {
      var k = hits[i];
      var v = CPD[k];
      var tr = document.createElement("tr");
      tr.dataset.cp = k;
      var td0 = document.createElement("td");
      td0.className = "cc-big";
      td0.textContent = String.fromCodePoint(parseInt(k, 16));
      var td1 = document.createElement("td");
      var code = document.createElement("code");
      code.textContent = "U+" + k;
      td1.appendChild(code);
      var td2 = document.createElement("td");
      td2.textContent = v.name || "";
      var td3 = document.createElement("td");
      td3.textContent = (v.aliases || []).join(", ");
      var td4 = document.createElement("td");
      td4.textContent = (v.crossReferences || []).join(", ");
      var td5 = document.createElement("td");
      td5.textContent = (v.comments || []).join(", ");
      tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
      tr.appendChild(td3); tr.appendChild(td4); tr.appendChild(td5);
      if (!frag) frag = document.createDocumentFragment();
      frag.appendChild(tr);
    }
    if (frag) rows.appendChild(frag);
    var count = hits.length;
    out.hidden = false;
    more.textContent = count === 0 ? "NO MATCHES."
      : (count > MAX ? "SHOWING FIRST " + MAX + " OF " + count + " MATCHES." : count + " MATCHES.");
    loading(false);
  }

  /* ═══════════════════════════ 6 · WATERMARK ═════════════════ */
  function bindWatermark() {
    $("uniWmEncode").addEventListener("click", wmEncode);
    $("uniWmDecode").addEventListener("click", wmDecode);
  }
  function wmEncode() {
    var secret = $("uniWmSecret").value;
    var msg = $("uniWmMsg").value;
    if (!secret) { flashNote("uniWmNote", "TYPE THE HIDDEN MESSAGE FIRST", true); return; }
    var bytes = new TextEncoder().encode(secret);
    var enc = "";
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      /* byte 0–15  => U+FE00–U+FE0F · byte 16–255 => U+E0100–U+E01EF */
      enc += (b < 16) ? String.fromCodePoint(0xFE00 + b) : String.fromCodePoint(0xE0100 + (b - 16));
    }
    var mid = Math.floor(msg.length / 2);
    var out = msg.slice(0, mid) + enc + msg.slice(mid);
    $("uniWmEncoded").value = out;
    copyText(out, null);
    flashNote("uniWmNote", "WATERMARK ENCODED & MESSAGE COPIED TO CLIPBOARD (" + bytes.length + " BYTES)");
  }
  function wmDecode() {
    var msg = $("uniWmEncoded").value;
    var bytes = [];
    for (var i = 0; i < msg.length; i++) {
      var cp = msg.codePointAt(i);
      if (cp > 0xFFFF) i++;
      if (cp >= 0xFE00 && cp <= 0xFE0F) bytes.push(cp - 0xFE00);
      else if (cp >= 0xE0100 && cp <= 0xE01EF) bytes.push((cp - 0xE0100) + 16);
    }
    var out = $("uniWmOut");
    if (!bytes.length) {
      out.textContent = "NO WATERMARK FOUND IN THAT TEXT";
      flashNote("uniWmNote", "NOTHING HIDDEN IN THERE", true);
      return;
    }
    var decoded = new TextDecoder().decode(new Uint8Array(bytes));
    out.textContent = "DECODED: " + decoded;
    flashNote("uniWmNote", "EXTRACTED " + bytes.length + " BYTES");
  }

  /* ── page activation: initialize a tool the first time its
     page becomes visible (main.js toggles the .active class) ── */
  var INITS = {
    uniBrowse: initBrowse,
    uniCombine: initCombine,
    uniConfusables: initConfusables,
    uniEmoji: initEmoji,
    uniSearch: initSearch,
    uniWatermark: bindWatermark
  };
  function boot() {
    var mo = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        var el = m.target;
        var fn = INITS[el.id];
        if (fn && el.classList.contains("active")) fn();
      });
    });
    Object.keys(INITS).forEach(function (id) {
      var el = $(id);
      if (!el) return;
      mo.observe(el, { attributes: true, attributeFilter: ["class"] });
      if (el.classList.contains("active")) INITS[id]();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
