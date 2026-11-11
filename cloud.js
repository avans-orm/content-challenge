/* Content Challenge: koppeling met de database (Supabase), gedeeld door de game (index.html) en het docentendashboard (beheer.html).
   Zonder Supabase-gegevens in config.js draait een demoversie die alles in deze browser bewaart (handig om te testen). */
(function () {
  "use strict";
  const CFG = window.CC_CONFIG || {};
  const DEMO = !CFG.supabaseUrl || !CFG.supabaseAnonKey;
  const BASE = new URL("./", location.href).href; /* map van de site, hier komen de e-maillinks op uit */

  function dataUrlToBlob(d) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(d || "");
    if (!m) throw new Error("Geen geldig beeld");
    const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: m[1] });
  }
  function blobToDataUrl(b) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
  }

  /* Foutmeldingen van Supabase in gewone taal. */
  function nl(err) {
    const m = String((err && (err.message || err.error_description || err.msg)) || err || "");
    const code = err && (err.code || err.status);
    let t = m;
    if (/invalid login credentials/i.test(m)) t = "Dit e-mailadres of wachtwoord klopt niet.";
    else if (/email not confirmed/i.test(m)) t = "Je account is nog niet geactiveerd. Klik eerst op de link in je uitnodigingsmail, of vraag hieronder een nieuwe inloglink aan.";
    else if (/signups? not allowed|user not found|niet uitgenodigd/i.test(m)) t = "Voor dit e-mailadres is geen account. Vraag je docent om een uitnodiging.";
    else if (/only request this after (\d+)/i.test(m)) t = "Even wachten: je kunt over " + m.match(/after (\d+)/i)[1] + " seconden opnieuw een mail aanvragen.";
    else if (/rate limit|too many/i.test(m) || code === 429) t = "Er zijn net te veel mails verstuurd. Wacht een paar minuten en probeer het opnieuw.";
    else if (/expired|invalid.*(token|otp)|otp.*(expired|invalid)/i.test(m)) t = "Deze link of code is verlopen of al gebruikt. Vraag een nieuwe inloglink aan.";
    else if (/password should be at least|weak password|password.*characters/i.test(m)) t = "Kies een wachtwoord van minimaal 8 tekens.";
    else if (/same.*password|different from the old/i.test(m)) t = "Dit is al je wachtwoord. Je kunt verder.";
    else if (/failed to fetch|networkerror|load failed|network/i.test(m)) t = "Geen verbinding met de server. Controleer je internet en probeer het opnieuw.";
    else if (/al 10 docenten/i.test(m)) t = m;
    const e = new Error(t); e.raw = m; e.code = code; return e;
  }

  /* ================= Supabase ================= */
  function supa() {
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { flowType: "implicit", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const BUCKET = "beelden";
    let me = null;
    const api = {
      mode: "supabase", sb,
      base: BASE,
      async user() {
        const { data } = await sb.auth.getSession();
        me = data && data.session ? { id: data.session.user.id, email: data.session.user.email } : null;
        return me;
      },
      async loginPassword(email, pw) {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pw });
        if (error) throw nl(error);
      },
      async sendLoginLink(email) {
        const { error } = await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: BASE } });
        if (error) throw nl(error);
      },
      async verifyCode(email, code) {
        let last;
        for (const type of ["email", "signup", "magiclink"]) {
          const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type });
          if (!error) return; last = error;
        }
        throw nl(last);
      },
      async verifyHash(hash, type) {
        let last;
        for (const t of [type || "email", "email", "signup", "magiclink"]) {
          const { error } = await sb.auth.verifyOtp({ token_hash: hash, type: t });
          if (!error) return; last = error;
        }
        throw nl(last);
      },
      async setPassword(pw) {
        const { error } = await sb.auth.updateUser({ password: pw });
        if (error && !/same.*password|different from the old/i.test(error.message || "")) throw nl(error);
        const u = await api.user();
        await sb.from("profielen").update({ wachtwoord_gezet: true }).eq("id", u.id);
      },
      async logout() { await sb.auth.signOut(); me = null; },
      async mijnProfiel() {
        const { data, error } = await sb.rpc("mijn_profiel");
        if (error) throw nl(error);
        return data && data.id ? data : null;
      },
      async loadState(uid) {
        const { data, error } = await sb.from("voortgang").select("state,versie,bijgewerkt").eq("user_id", uid).maybeSingle();
        if (error) throw nl(error);
        return data ? { state: data.state, versie: data.versie, bijgewerkt: data.bijgewerkt } : { state: null, versie: 0 };
      },
      /* Opslaan met versiecontrole: is de rij intussen door een ander tabblad of apparaat gewijzigd, dan conflict. */
      async saveState(uid, state, sam, versie, force) {
        if (!versie) {
          const { data, error } = await sb.from("voortgang").insert({ user_id: uid, state, samenvatting: sam, versie: 1 }).select("versie");
          if (error) { if (error.code === "23505") return { conflict: true }; throw nl(error); }
          return { ok: true, versie: data[0].versie };
        }
        if (force) {
          const cur = await api.loadState(uid);
          versie = cur.versie;
        }
        const { data, error } = await sb.from("voortgang").update({ state, samenvatting: sam, versie: versie + 1 }).eq("user_id", uid).eq("versie", versie).select("versie");
        if (error) throw nl(error);
        if (!data || !data.length) return { conflict: true };
        return { ok: true, versie: data[0].versie };
      },
      async listImgs(uid) {
        const out = []; let offset = 0;
        for (;;) {
          const { data, error } = await sb.storage.from(BUCKET).list(uid, { limit: 1000, offset });
          if (error) throw nl(error);
          (data || []).forEach(f => { if (f && f.name && f.id !== null) out.push(f.name); });
          if (!data || data.length < 1000) break; offset += 1000;
        }
        return out;
      },
      async getImg(uid, name) {
        const { data, error } = await sb.storage.from(BUCKET).download(uid + "/" + name);
        if (error) throw nl(error);
        return blobToDataUrl(data);
      },
      async putImg(uid, id, dataUrl) {
        const blob = dataUrlToBlob(dataUrl);
        const { error } = await sb.storage.from(BUCKET).upload(uid + "/" + id, blob, { upsert: true, contentType: blob.type, cacheControl: "31536000" });
        if (error) throw nl(error);
      },
      async delImgs(uid, ids) {
        if (!ids.length) return;
        const { error } = await sb.storage.from(BUCKET).remove(ids.map(i => uid + "/" + i));
        if (error) throw nl(error);
      },
      async klas() {
        const { data, error } = await sb.rpc("klas");
        if (error) throw nl(error);
        return data || [];
      },
      async invites() {
        const { data, error } = await sb.from("uitnodigingen").select("*").order("uitgenodigd_op", { ascending: false });
        if (error) throw nl(error);
        return data || [];
      },
      async profielen() {
        const { data, error } = await sb.from("profielen").select("id,email,rol,aangemaakt");
        if (error) throw nl(error);
        return data || [];
      },
      async addInvite(email, rol) {
        const u = await api.user();
        const { error } = await sb.from("uitnodigingen").upsert({ email, rol, uitgenodigd_door: u.id }, { onConflict: "email" });
        if (error) throw nl(error);
      },
      /* De uitnodiging zelf: Supabase maakt het account aan en mailt de activatielink (template "Confirm signup").
         Bestaat het account al, dan komt er een gewone inloglink (template "Magic Link"). */
      async sendInvite(email) {
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: BASE } });
        if (error) throw nl(error);
        await sb.from("uitnodigingen").update({ laatst_verstuurd: new Date().toISOString() }).eq("email", email);
      },
      async verwijder(email, uid) {
        if (uid) { try { const ids = await api.listImgs(uid); for (let i = 0; i < ids.length; i += 100) await api.delImgs(uid, ids.slice(i, i + 100)); } catch (e) { /* beelden later opruimen */ } }
        const { error } = await sb.rpc("verwijder_gebruiker", { p_email: email });
        if (error) throw nl(error);
      }
    };
    return api;
  }

  /* ================= Demo (alles in deze browser) ================= */
  function demo() {
    const K = "ccdemo-db", SK = "ccdemo-sessie";
    const load = () => { try { return JSON.parse(localStorage.getItem(K)) || null; } catch (e) { return null; } };
    let db = load();
    if (!db) {
      db = { users: [{ id: "demo-docent", email: "docent@demo.nl", pw: "demo1234" }], invites: { "docent@demo.nl": { email: "docent@demo.nl", rol: "docent", uitgenodigd_op: new Date().toISOString(), geaccepteerd_op: null, laatst_verstuurd: null } }, prof: {}, vg: {}, img: {}, mails: [] };
    }
    const put = () => { try { localStorage.setItem(K, JSON.stringify(db)); } catch (e) { throw new Error("De demo-opslag in deze browser is vol."); } };
    put();
    const wait = (ms) => new Promise(r => setTimeout(r, ms || 60));
    const uid = () => { try { return localStorage.getItem(SK) || ""; } catch (e) { return ""; } };
    const userBy = (email) => db.users.find(u => u.email === email);
    const mail = (to, soort) => {
      const u = userBy(to);
      db.mails.unshift({ to, soort, link: BASE + "?demo_login=" + encodeURIComponent(u.id), op: new Date().toISOString() });
      db.mails = db.mails.slice(0, 50); put();
    };
    const api = {
      mode: "demo", base: BASE,
      mails: () => (load() || db).mails,
      async user() { db = load() || db; const u = db.users.find(x => x.id === uid()); return u ? { id: u.id, email: u.email } : null; },
      async loginPassword(email, pw) { await wait(); email = email.trim().toLowerCase(); const u = userBy(email); if (!u || !u.pw || u.pw !== pw) throw new Error("Dit e-mailadres of wachtwoord klopt niet."); localStorage.setItem(SK, u.id); },
      async sendLoginLink(email) { await wait(); email = email.trim().toLowerCase(); if (!userBy(email)) throw new Error("Voor dit e-mailadres is geen account. Vraag je docent om een uitnodiging."); mail(email, "Inloglink"); },
      async verifyCode() { throw new Error("In de demo werkt inloggen met een code niet. Gebruik het demo-postvak."); },
      async verifyHash() { throw new Error("Niet beschikbaar in de demo."); },
      loginDemoLink(id) { if (db.users.some(u => u.id === id)) { localStorage.setItem(SK, id); return true; } return false; },
      async setPassword(pw) { await wait(); if (String(pw).length < 8) throw new Error("Kies een wachtwoord van minimaal 8 tekens."); const u = db.users.find(x => x.id === uid()); u.pw = pw; if (db.prof[u.id]) db.prof[u.id].wachtwoord_gezet = true; put(); },
      async logout() { localStorage.removeItem(SK); },
      async mijnProfiel() {
        await wait(); const u = db.users.find(x => x.id === uid()); if (!u) return null; const inv = db.invites[u.email]; if (!inv) return null;
        let p = db.prof[u.id]; if (!p) p = db.prof[u.id] = { id: u.id, email: u.email, rol: inv.rol, wachtwoord_gezet: !!u.pw, aangemaakt: new Date().toISOString() };
        p.rol = inv.rol; if (!inv.geaccepteerd_op) inv.geaccepteerd_op = new Date().toISOString(); put(); return Object.assign({}, p);
      },
      async loadState(id) { await wait(); const v = db.vg[id]; return v ? { state: v.state, versie: v.versie, bijgewerkt: v.bijgewerkt } : { state: null, versie: 0 }; },
      async saveState(id, state, sam, versie, force) {
        await wait(); db = load() || db; const v = db.vg[id];
        if (!force && (v ? v.versie : 0) !== (versie || 0)) return { conflict: true };
        const nv = (v ? v.versie : 0) + 1; db.vg[id] = { state, samenvatting: sam, versie: nv, bijgewerkt: new Date().toISOString() }; put(); return { ok: true, versie: nv };
      },
      async listImgs(id) { await wait(); return Object.keys(db.img[id] || {}); },
      async getImg(id, name) { return (db.img[id] || {})[name] || ""; },
      async putImg(id, name, d) { await wait(); db = load() || db; (db.img[id] = db.img[id] || {})[name] = d; put(); },
      async delImgs(id, ids) { db = load() || db; ids.forEach(n => { if (db.img[id]) delete db.img[id][n]; }); put(); },
      async klas() {
        await wait(); db = load() || db; const doc = (db.prof[uid()] || {}).rol === "docent";
        return Object.values(db.prof).filter(p => p.rol === "student").map(p => { const v = db.vg[p.id] || {}; const s = v.samenvatting || {}; return { id: p.id, naam: s.naam || null, studio: s.studio || null, samenvatting: s, email: doc ? p.email : null, bijgewerkt: v.bijgewerkt || null }; });
      },
      async invites() { await wait(); db = load() || db; return Object.values(db.invites).sort((a, b) => b.uitgenodigd_op.localeCompare(a.uitgenodigd_op)); },
      async profielen() { await wait(); return Object.values(db.prof); },
      async addInvite(email, rol) {
        await wait(); db = load() || db;
        if (rol === "docent" && Object.values(db.invites).filter(i => i.rol === "docent" && i.email !== email).length >= 10) throw new Error("Er zijn al 10 docenten. Verwijder eerst een docent.");
        const i = db.invites[email]; db.invites[email] = Object.assign(i || { uitgenodigd_op: new Date().toISOString(), geaccepteerd_op: null, laatst_verstuurd: null }, { email, rol }); put();
      },
      async sendInvite(email) {
        await wait(150); db = load() || db; if (!userBy(email)) db.users.push({ id: "demo-" + Math.random().toString(36).slice(2, 10), email, pw: "" });
        db.invites[email].laatst_verstuurd = new Date().toISOString(); put(); mail(email, "Uitnodiging");
      },
      async verwijder(email) {
        await wait(); db = load() || db; const u = userBy(email);
        if (u) { if (u.id === uid()) throw new Error("Je kunt jezelf niet verwijderen."); delete db.prof[u.id]; delete db.vg[u.id]; delete db.img[u.id]; db.users = db.users.filter(x => x !== u); }
        delete db.invites[email]; put();
      }
    };
    return api;
  }

  window.CC = DEMO ? demo() : supa();
  window.CC.nl = nl;
  window.CC.maxOpslag = Math.round((Number(CFG.maxOpslagMB) || 12) * 1024 * 1024);
})();
