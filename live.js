/* Content Challenge live: inloggen, gegevens laden en opslaan in de database, en daarna de game starten.
   De game zelf staat in index.html (script#gamecode) en gebruikt CStore in plaats van localStorage. */
(function () {
  "use strict";
  const KEY = "cq-level1-v1", IMGK = KEY + "-img-", DOCKEY = "cq-docent";
  const HASH = window.CC_HASH || "", QS = new URLSearchParams(window.CC_QS || "");
  const CC = window.CC;

  /* ---------- kleine helpers ---------- */
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
    kids.flat().forEach(c => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  const gate = () => document.getElementById("ccgate");
  function show(...content) { const g = gate(); g.hidden = false; g.innerHTML = ""; g.append(el("div", { class: "ccbox" }, el("div", { class: "cclogo" }, el("b", null, "Content Challenge"), el("span", null, "On air")), ...content)); const f = g.querySelector("input"); if (f) setTimeout(() => f.focus(), 30); }
  function msgEl() { return el("p", { class: "ccmsg", role: "alert", hidden: true }); }
  function say(m, text, ok) { m.textContent = text; m.hidden = !text; m.classList.toggle("ok", !!ok); }
  function busy(btn, on, label) { if (on) { btn._t = btn.textContent; btn.textContent = label || "Bezig…"; btn.disabled = true; } else { btn.textContent = btn._t || btn.textContent; btn.disabled = false; } }
  function cleanUrl(keep) {
    const p = new URLSearchParams(location.search); ["th", "tt", "demo_login"].forEach(k => p.delete(k));
    if (!keep) p.delete("bekijk");
    const q = p.toString(); history.replaceState(null, "", location.pathname + (q ? "?" + q : ""));
  }
  function hashErr() {
    const p = new URLSearchParams(HASH.replace(/^#/, ""));
    if (!p.get("error") && !p.get("error_code")) return "";
    const c = p.get("error_code") || "";
    return /expired|otp/i.test(c + p.get("error_description")) ? "Deze link is verlopen of al gebruikt. Vul je e-mailadres in en vraag een nieuwe inloglink aan." : "Inloggen via de link lukte niet. Vraag een nieuwe inloglink aan.";
  }
  const viaLink = /type=(signup|magiclink|recovery|invite)/.test(HASH) || QS.has("th") || QS.has("demo_login");

  /* ---------- schermen ---------- */
  function viewLogin(note) {
    const email = el("input", { type: "email", id: "ccemail", autocomplete: "username", placeholder: "naam@student.avans.nl" });
    const pw = el("input", { type: "password", id: "ccpw", autocomplete: "current-password" });
    const m = msgEl(); const m2 = msgEl();
    const btn = el("button", { class: "btn", type: "submit" }, "Inloggen");
    const form = el("form", { class: "ccform", onsubmit: async e => {
      e.preventDefault(); say(m, "");
      if (!email.value.trim() || !pw.value) { say(m, "Vul je e-mailadres en wachtwoord in."); return; }
      busy(btn, true, "Inloggen…");
      try { await CC.loginPassword(email.value, pw.value); start(); } catch (err) { busy(btn, false); say(m, err.message); }
    } },
      el("label", { for: "ccemail" }, "E-mailadres"), email,
      el("label", { for: "ccpw" }, "Wachtwoord"), pw, btn, m);
    const code = el("input", { type: "text", id: "cccode", inputmode: "numeric", autocomplete: "one-time-code", placeholder: "123456" });
    const codeBox = el("div", { class: "cccode", hidden: true },
      el("label", { for: "cccode" }, "Code uit de mail"), code,
      el("button", { class: "btn", type: "button", onclick: async e => {
        say(m2, ""); if (!code.value.trim()) { say(m2, "Vul de code uit de mail in."); return; }
        busy(e.target, true, "Controleren…"); try { await CC.verifyCode(email.value, code.value); start({ link: true }); } catch (err) { busy(e.target, false); say(m2, err.message); }
      } }, "Log in met code"));
    const linkBtn = el("button", { class: "btn ghost", type: "button", onclick: async e => {
      say(m2, ""); if (!email.value.trim()) { say(m2, "Vul eerst hierboven je e-mailadres in."); email.focus(); return; }
      busy(e.target, true, "Versturen…");
      try { await CC.sendLoginLink(email.value); busy(e.target, false); say(m2, "Verstuurd. Kijk in je mail (ook in je spam). Klik op de knop in de mail, of vul hieronder de code uit de mail in.", true); codeBox.hidden = CC.mode === "demo"; if (CC.mode === "demo") renderPost(); }
      catch (err) { busy(e.target, false); say(m2, err.message); }
    } }, "Stuur me een inloglink");
    const post = el("div", { class: "ccpost" });
    function renderPost() {
      if (CC.mode !== "demo") return; post.innerHTML = "";
      const ms = CC.mails();
      post.append(el("h3", null, "Demo-postvak"), el("p", { class: "ccsmall" }, "In de demo gaan mails niet echt de deur uit. Ze staan hier. Docent: docent@demo.nl, wachtwoord demo1234."),
        ms.length ? el("ul", null, ms.slice(0, 8).map(x => el("li", null, el("strong", null, x.soort + " voor " + x.to + ": "), el("a", { href: x.link }, "open de link")))) : el("p", { class: "ccsmall" }, "Nog geen mails."));
    }
    renderPost();
    show(el("h1", null, "Inloggen"), note ? el("p", { class: "ccnote" }, note) : null,
      el("p", { class: "ccsmall" }, "Log in met het e-mailadres waarop je docent je heeft uitgenodigd."),
      form,
      el("div", { class: "ccsep" }, el("p", null, el("strong", null, "Eerste keer, of wachtwoord vergeten? "), "Dan krijg je een link per mail. Daarna kies je een (nieuw) wachtwoord."), el("div", { class: "ccrow" }, linkBtn, CC.mode === "demo" ? null : el("button", { class: "btn ghost", type: "button", onclick: () => { codeBox.hidden = false; (email.value ? code : email).focus(); } }, "Ik heb een code uit de mail")), m2, codeBox),
      CC.mode === "demo" ? post : null,
      el("p", { class: "ccsmall ccfoot" }, CC.mode === "demo" ? "Demomodus: er is nog geen database gekoppeld (zie config.js). Alles staat alleen in deze browser." : "Nog geen uitnodiging gehad? Vraag je docent om je toe te voegen."));
  }
  function viewWelcome(th, tt) {
    const m = msgEl();
    const b = el("button", { class: "btn", type: "button", onclick: async () => {
      busy(b, true, "Even geduld…"); say(m, "");
      try { await CC.verifyHash(th, tt); cleanUrl(true); start({ link: true }); }
      catch (err) { busy(b, false); say(m, err.message); }
    } }, "Ga verder");
    show(el("h1", null, "Welkom bij Content Challenge"), el("p", null, "Klik op de knop om in te loggen. De eerste keer kies je daarna een wachtwoord, zodat je voortaan gewoon met je e-mailadres en wachtwoord inlogt."), b, m,
      el("p", { class: "ccsmall" }, "Werkt het niet? ", el("a", { href: location.pathname }, "Ga naar het inlogscherm"), " en vraag een nieuwe inloglink aan."));
  }
  function viewPassword(prof, optional) {
    const a = el("input", { type: "password", id: "ccpw1", autocomplete: "new-password" });
    const b2 = el("input", { type: "password", id: "ccpw2", autocomplete: "new-password" });
    const m = msgEl();
    const btn = el("button", { class: "btn", type: "submit" }, "Bewaar wachtwoord");
    return new Promise(resolve => {
      show(el("h1", null, optional ? "Nieuw wachtwoord?" : "Kies je wachtwoord"),
        el("p", null, "Je bent ingelogd als ", el("strong", null, prof.email), ". ", optional ? "Wil je een nieuw wachtwoord instellen? Dat kan hier." : "Kies een wachtwoord. Daarmee log je voortaan in."),
        el("form", { class: "ccform", onsubmit: async e => {
          e.preventDefault(); say(m, "");
          if (a.value.length < 8) { say(m, "Kies een wachtwoord van minimaal 8 tekens."); return; }
          if (a.value !== b2.value) { say(m, "De twee wachtwoorden zijn niet hetzelfde."); return; }
          busy(btn, true, "Opslaan…");
          try { await CC.setPassword(a.value); resolve(true); } catch (err) { busy(btn, false); say(m, err.message); }
        } }, el("label", { for: "ccpw1" }, "Wachtwoord (minimaal 8 tekens)"), a, el("label", { for: "ccpw2" }, "Herhaal je wachtwoord"), b2, btn, m),
        optional ? el("button", { class: "btn ghost", type: "button", onclick: () => resolve(false) }, "Nu niet, ga naar de game") : null);
    });
  }
  function viewNoAccess(email) {
    show(el("h1", null, "Geen toegang"), el("p", null, "Je bent ingelogd als ", el("strong", null, email || "onbekend"), ", maar dit e-mailadres staat niet op de lijst van Content Challenge."),
      el("p", null, "Vraag je docent om je uit te nodigen. Gebruik daarna de link in de uitnodigingsmail."),
      el("button", { class: "btn ghost", type: "button", onclick: async () => { await CC.logout(); location.href = location.pathname; } }, "Uitloggen"));
  }
  function viewError(text) {
    show(el("h1", null, "Er ging iets mis"), el("p", null, text), el("div", { class: "ccrow" },
      el("button", { class: "btn", type: "button", onclick: () => location.reload() }, "Probeer opnieuw"),
      el("button", { class: "btn ghost", type: "button", onclick: async () => { await CC.logout(); location.href = location.pathname; } }, "Uitloggen")));
  }
  function viewLoading(t) { show(el("p", { class: "ccload" }, t || "Laden…")); }

  /* ---------- opslag: CStore vervangt localStorage voor de game ---------- */
  const M = new Map();
  let OWNER = "", ROL = "student", READONLY = false, VERSIE = 0, ALLOW = 0, HOOKS = {};
  const ST = { pending: null, timer: null, saving: false, conflict: false, error: "", imgs: new Map(), imgBusy: false, imgErr: "" };
  function imgChars() { let n = 0; M.forEach((v, k) => { if (k.indexOf(IMGK) === 0) n += v.length; }); return n; }
  window.CStore = {
    get length() { return M.size; },
    key(i) { return [...M.keys()][i] ?? null; },
    getItem(k) { if (k === DOCKEY) return ROL === "docent" ? "contentdocent" : null; return M.has(k) ? M.get(k) : null; },
    setItem(k, v) {
      v = String(v); if (k === DOCKEY) return;
      if (k.indexOf(IMGK) === 0) {
        if (imgChars() - (M.get(k) || "").length + v.length > CC.maxOpslag) { const e = new Error("Opslag vol"); e.name = "QuotaExceededError"; throw e; }
        M.set(k, v); imgQueue(k.slice(IMGK.length), v); return;
      }
      M.set(k, v); if (k === KEY) statePut(v);
    },
    removeItem(k) { const had = M.delete(k); if (had && k.indexOf(IMGK) === 0) imgQueue(k.slice(IMGK.length), null); }
  };
  const BK = () => "cc-backup-" + OWNER;
  function backup(json) { if (READONLY) return; try { localStorage.setItem(BK(), JSON.stringify({ versie: VERSIE, json, t: Date.now() })); } catch (e) { } }
  function backupClean() { try { localStorage.removeItem(BK()); } catch (e) { } }
  function statePut(json) {
    if (READONLY) { if (!ALLOW) return; ALLOW--; }
    ST.pending = json; backup(json); status(); clearTimeout(ST.timer); ST.timer = setTimeout(flush, 1200);
  }
  async function flush(force) {
    clearTimeout(ST.timer); ST.timer = null;
    if (ST.saving) { ST.timer = setTimeout(flush, 500); return; }
    if (ST.pending == null || (ST.conflict && !force)) return;
    const json = ST.pending; ST.pending = null;
    let obj, c; try { obj = JSON.parse(json); c = canon(obj); } catch (e) { return; }
    if (c === LASTC && !force) { if (ST.pending == null) backupClean(); status(); return; }
    ST.saving = true; status();
    let sam = {}; try { sam = HOOKS.samenvatting ? HOOKS.samenvatting() : {}; } catch (e) { }
    try {
      const r = await CC.saveState(OWNER, obj, sam, VERSIE, !!force);
      ST.saving = false;
      if (r.conflict) { ST.pending = ST.pending ?? json; ST.conflict = true; conflictBar(); status(); return; }
      VERSIE = r.versie; ST.error = ""; ST.conflict = false; LASTC = c;
      if (ST.pending == null) backupClean(); else backup(ST.pending);
    } catch (e) {
      ST.saving = false; ST.pending = ST.pending ?? json; ST.error = e.message || "Opslaan mislukt";
      clearTimeout(ST.timer); ST.timer = setTimeout(flush, 5000);
    }
    status();
    if (ST.pending != null && !ST.timer) ST.timer = setTimeout(flush, 800);
  }
  function imgQueue(id, data) { if (READONLY) return; ST.imgs.set(id, data); status(); imgWork(); }
  async function imgWork() {
    if (ST.imgBusy) return; ST.imgBusy = true;
    while (ST.imgs.size) {
      const [id, data] = ST.imgs.entries().next().value;
      try {
        if (data == null) { await CC.delImgs(OWNER, [id]); icDel(OWNER, id); } else { await CC.putImg(OWNER, id, data); icPut(OWNER, id, data); }
        if (ST.imgs.get(id) === data) ST.imgs.delete(id); ST.imgErr = "";
      } catch (e) { ST.imgErr = e.message || "Beeld uploaden mislukt"; status(); await new Promise(r => setTimeout(r, 5000)); }
      status();
    }
    ST.imgBusy = false; status();
  }
  /* Vaste volgorde van sleutels, zodat "niets veranderd" herkend wordt (de database sorteert de sleutels anders). */
  function canon(v) { if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]"; if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"; return JSON.stringify(v); }
  let LASTC = "";
  function unsaved() { return ST.pending != null || ST.saving || ST.imgs.size > 0; }
  window.addEventListener("beforeunload", e => { if (!READONLY && unsaved()) { flush(); e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && ST.pending != null) flush(); });

  /* ---------- statusbalk en knoppen in de kop ---------- */
  function status() {
    const s = document.getElementById("ccsave"); if (!s) return;
    let t, c;
    if (READONLY) { t = "Alleen lezen"; c = "ro"; }
    else if (ST.conflict) { t = "Niet opgeslagen"; c = "bad"; }
    else if (ST.error || ST.imgErr) { t = "Geen verbinding, probeert opnieuw…"; c = "bad"; }
    else if (unsaved()) { t = "Opslaan…" + (ST.imgs.size ? " (" + ST.imgs.size + " beeld" + (ST.imgs.size > 1 ? "en" : "") + ")" : ""); c = "busy"; }
    else { t = "Opgeslagen"; c = "ok"; }
    s.className = "ccsave " + c; s.textContent = t; s.title = ST.error || ST.imgErr || "Je werk wordt automatisch opgeslagen in je account.";
  }
  function conflictBar() {
    if (document.getElementById("ccconflict")) return;
    const bar = el("div", { id: "ccconflict", class: "ccbar bad", role: "alert" },
      el("span", null, "Je werk is intussen in een ander tabblad of op een ander apparaat opgeslagen. Wat wil je doen?"),
      el("button", { class: "btn small", type: "button", onclick: () => { backupClean(); location.reload(); } }, "Laad de nieuwste versie"),
      el("button", { class: "btn small ghost", type: "button", onclick: () => { bar.remove(); ST.conflict = false; if (ST.pending == null) ST.pending = M.get(KEY) || "{}"; flush(true); } }, "Bewaar wat hier staat"));
    document.body.prepend(bar);
  }
  function topBar(prof, viewName) {
    const side = document.querySelector(".top .hside"); if (!side) return;
    if (ROL !== "docent") { const r = side.querySelector(".roles"); if (r) r.hidden = true; }
    const menu = el("details", { class: "ccmenu" }, el("summary", { title: prof.email }, el("span", { class: "ccav" }, (prof.email || "?").slice(0, 1).toUpperCase()), el("span", { class: "sr" }, "Account")),
      el("div", { class: "ccpop" },
        el("p", { class: "ccsmall" }, "Ingelogd als", el("br"), el("strong", null, prof.email), ROL === "docent" ? " (docent)" : ""),
        ROL === "docent" ? el("a", { class: "btn small", href: "beheer.html" }, "Docentendashboard") : null,
        el("button", { class: "btn small ghost", type: "button", onclick: async () => { const ok = await viewPassword(prof, true); gate().hidden = true; if (ok) toastMsg("Je wachtwoord is gewijzigd"); } }, "Wachtwoord wijzigen"),
        el("button", { class: "btn small ghost", type: "button", onclick: async () => { if (unsaved()) await flush(); await CC.logout(); location.href = location.pathname; } }, "Uitloggen")));
    side.append(el("div", { class: "ccacct" }, el("span", { id: "ccsave", class: "ccsave ok", role: "status", "aria-live": "polite" }), menu));
    document.addEventListener("click", e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    status();
    if (READONLY) document.body.prepend(el("div", { class: "ccbar ro" }, el("span", null, "Je bekijkt het werk van ", el("strong", null, viewName), ". Alleen lezen: wat je hier verandert, wordt niet opgeslagen."), el("a", { class: "btn small ghost", href: "beheer.html" }, "Terug naar het dashboard")));
  }
  function toastMsg(m) { const t = document.getElementById("toast"); if (!t) return; t.textContent = m; t.hidden = false; setTimeout(() => { t.hidden = true; }, 2500); }

  /* ---------- klas: scorebord en klasoverzicht ---------- */
  const KLAS = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }; let KLAST = null;
  async function loadKlas() {
    try {
      const rows = await CC.klas(); KLAST = new Date();
      for (let n = 1; n <= 6; n++) {
        const arr = KLAS[n]; arr.length = 0;
        rows.forEach(r => {
          if (r.id === OWNER) return; const s = r.samenvatting || {}; const lv = s.lv && s.lv[n]; if (!lv) return;
          arr.push(Object.assign({ x: [0, 0, 0, 0], b: 0, st: "-" }, lv, { n: (s.naam || "").trim() || (r.email ? r.email.split("@")[0] : "Student zonder naam"), s: Number(s.studio) || 1, uid: r.id, email: r.email || "" }));
        });
      }
    } catch (e) { /* scorebord blijft zoals het was */ }
  }
  setInterval(() => { if (document.visibilityState === "visible" && OWNER) loadKlas(); }, 60000);
  const tijd = () => KLAST ? KLAST.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "-";

  window.CCLIVE = {
    isDocent: () => ROL === "docent",
    bekijk: () => READONLY,
    klasArr: n => KLAS[n],
    naamCel(r) {
      if (r.me || !r.uid || ROL !== "docent") return r.n;
      return el("a", { href: "?bekijk=" + encodeURIComponent(r.uid), target: "_blank", rel: "noopener", title: "Bekijk het werk van " + r.n + (r.email ? " (" + r.email + ")" : "") }, r.n);
    },
    mijnNaam: naam => (naam || (READONLY ? "Student" : "Jij")) + (READONLY ? " (bekijk je nu)" : " (jij)"),
    klasNoot(soort) {
      if (soort === "docent") return el("p", { class: "example" }, READONLY ? "De hele klas, stand van " + tijd() + ". De gemarkeerde rij is de student die je nu bekijkt." : "De hele klas, stand van " + tijd() + ". Klik op een naam om het werk van die student te bekijken. Uitnodigen en beheren doe je in het docentendashboard.");
      return el("p", { class: "example" }, "De hele klas, stand van " + tijd() + ".");
    },
    schrijfToe() { ALLOW = 2; },
    koppel(h) { HOOKS = h || {}; },
    maxOpslag: CC.maxOpslag
  };

  /* Beelden veranderen nooit (een nieuw beeld krijgt een nieuwe id). Daarom bewaart de browser een kopie,
     zodat de game niet bij elk bezoek alle beelden opnieuw downloadt. De database blijft de bron. */
  const IC = { c: null };
  async function icOpen() { if (IC.c !== null) return IC.c; try { IC.c = window.caches ? await caches.open("cc-beelden-v1") : false; } catch (e) { IC.c = false; } return IC.c; }
  const icKey = (uid, id) => new URL("__beeld/" + uid + "/" + id, CC.base).href;
  async function icGet(uid, id) { const c = await icOpen(); if (!c) return ""; try { const r = await c.match(icKey(uid, id)); return r ? await r.text() : ""; } catch (e) { return ""; } }
  async function icPut(uid, id, d) { const c = await icOpen(); if (!c || !d) return; try { await c.put(icKey(uid, id), new Response(d, { headers: { "content-type": "text/plain" } })); } catch (e) { } }
  async function icDel(uid, id) { const c = await icOpen(); if (!c) return; try { await c.delete(icKey(uid, id)); } catch (e) { } }

  /* ---------- opstarten ---------- */
  async function loadOwner(uid) {
    const st = await CC.loadState(uid); VERSIE = st.versie || 0;
    let json = st.state && Object.keys(st.state).length ? JSON.stringify(st.state) : null;
    if (!READONLY) {
      let b = null; try { b = JSON.parse(localStorage.getItem("cc-backup-" + uid) || "null"); } catch (e) { }
      if (b && b.json && b.versie === VERSIE) { json = b.json; ST.pending = b.json; }   /* niet-opgeslagen werk van vorige keer */
      else if (b) { try { localStorage.removeItem("cc-backup-" + uid); } catch (e) { } }
    }
    if (json) M.set(KEY, json);
    if (st.state) { try { LASTC = canon(st.state); } catch (e) { } }
    const names = await CC.listImgs(uid); let done = 0;
    viewLoading("Je werk laden… beelden 0 van " + names.length);
    const q = names.slice();
    const worker = async () => { while (q.length) { const n = q.shift(); try { let d = await icGet(uid, n); if (!d) { d = await CC.getImg(uid, n); icPut(uid, n, d); } if (/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(d || "")) M.set(IMGK + n, d); } catch (e) { } done++; const p = document.querySelector(".ccload"); if (p) p.textContent = "Je werk laden… beelden " + done + " van " + names.length; } };
    await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
  }
  function runGame() {
    const src = document.getElementById("gamecode").textContent;
    const s = document.createElement("script"); s.textContent = src; document.body.append(s);
  }
  let started = false;
  async function start(opt) {
    opt = opt || {};
    if (started) return; viewLoading("Inloggen…");
    try {
      const user = await CC.user();
      if (!user) { viewLogin(hashErr()); return; }
      const prof = await CC.mijnProfiel();
      if (!prof) { viewNoAccess(user.email); return; }
      ROL = prof.rol;
      if (!prof.wachtwoord_gezet || opt.link || viaLink) { await viewPassword(prof, !!prof.wachtwoord_gezet); }
      cleanUrl(true);
      started = true;
      const want = QS.get("bekijk");
      let viewName = "";
      if (want && ROL === "docent" && want !== user.id) {
        READONLY = true; OWNER = want;
        const k = await CC.klas(); const r = k.find(x => x.id === want);
        if (!r) { started = false; viewError("Deze student is niet gevonden. Misschien is het account verwijderd."); return; }
        viewName = ((r.samenvatting && r.samenvatting.naam) || "") + (r.email ? " (" + r.email + ")" : "");
        document.title = "Bekijken: " + (viewName || "student") + " · Content Challenge";
      } else { OWNER = user.id; if (want) cleanUrl(false); }
      viewLoading("Je werk laden…");
      await loadOwner(OWNER);
      await loadKlas();
      gate().hidden = true; document.body.classList.remove("cc-wait");
      runGame();
      topBar(prof, viewName || "deze student");
      if (ST.pending != null) flush();
    } catch (e) {
      started = false; viewError((e && e.message) || "Onbekende fout");
    }
  }

  /* Wie via een link uit de mail komt (?th=...) klikt eerst op een knop; zo kan een virusscanner in de mail de link niet opmaken. */
  (async function boot() {
    if (QS.has("demo_login") && CC.mode === "demo") { CC.loginDemoLink(QS.get("demo_login")); return start({ link: true }); }
    if (QS.has("th")) { const u = await CC.user().catch(() => null); if (!u) return viewWelcome(QS.get("th"), QS.get("tt")); }
    if (CC.mode === "supabase" && /access_token=/.test(HASH)) await new Promise(r => setTimeout(r, 300)); /* laat supabase de link verwerken */
    start();
  })();
})();
