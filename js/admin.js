/* =============================================================
   PELLIKAL — admin.js   (loads only on admin.html)
   Secure staff dashboard: gallery photos, editable site text,
   customer testimonials. All writes require sign-in and are
   enforced by Supabase ROW-LEVEL SECURITY on the server.

   ⚠️  Use ONLY the Supabase anon public key (js/config.js).
       NEVER ship a service_role key to the browser.

   ── REQUIRED SUPABASE SETUP (see README.md for the exact SQL) ──
   Storage bucket (Public):  gallery
   Tables:
     gallery_images(id uuid pk default gen_random_uuid(),
                    created_at timestamptz default now(),
                    url text, path text, category text, caption text)
     site_content  (key text pk, value text, updated_at timestamptz default now())
     testimonials  (id uuid pk default gen_random_uuid(),
                    created_at timestamptz default now(),
                    quote text, author text)
   RLS on every table:  public SELECT = true;
     INSERT / UPDATE / DELETE restricted to role 'authenticated'.
   Storage policies on bucket 'gallery':
     authenticated INSERT + DELETE; public read comes from the
     bucket being Public.
   Create your login under Authentication → Users (Auto Confirm).
   ============================================================= */
(function () {
  "use strict";
  var CFG = window.PELLIKAL_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function safeUrl(u) { u = String(u == null ? "" : u); return /^https?:\/\//i.test(u) ? u : ""; }
  function show(id) { var e = $(id); if (e) e.style.display = ""; }
  function hide(id) { var e = $(id); if (e) e.style.display = "none"; }
  function note(id, kind, text) { var e = $(id); if (!e) return; e.className = "callout " + (kind === "ok" ? "callout--ok" : kind === "err" ? "callout--warn" : "callout--info"); e.textContent = text; e.style.display = text ? "block" : "none"; }
  function storageOK() { try { var k = "__t"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch (e) { return false; } }

  var CATS = ["Residential", "Commercial", "Solar", "Privacy", "Security", "Anti-Graffiti", "Low-E", "Ceramic"];
  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && String(CFG.SUPABASE_URL).indexOf("http") === 0 && window.supabase);
  var SB = null;
  if (configured) { try { SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: storageOK(), autoRefreshToken: storageOK() } }); } catch (e) { configured = false; } }

  /* ---------- tiny modal (built with createElement; XSS-safe) ---------- */
  function modal(title, fields, onSave) {
    var ov = el("div"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    ov.style.cssText = "position:fixed;inset:0;z-index:3000;background:rgba(10,20,48,.6);display:flex;align-items:center;justify-content:center;padding:5vw";
    var card = el("div"); card.style.cssText = "background:#fff;border-radius:14px;max-width:520px;width:100%;padding:1.4rem;box-shadow:0 30px 70px rgba(0,0,0,.4);max-height:86vh;overflow:auto";
    card.appendChild(el("h3", null, title));
    var inputs = {};
    fields.forEach(function (f) {
      var wrap = el("div", "field");
      wrap.appendChild(el("label", null, f.label));
      var input;
      if (f.type === "textarea") { input = el("textarea"); input.rows = 3; }
      else if (f.type === "select") { input = el("select"); (f.options || []).forEach(function (o) { var op = el("option", null, o); if (o === f.value) op.selected = true; input.appendChild(op); }); }
      else { input = el("input"); input.type = "text"; }
      if (f.type !== "select") input.value = f.value || "";
      wrap.appendChild(input); card.appendChild(wrap); inputs[f.key] = input;
    });
    var row = el("div"); row.style.cssText = "display:flex;gap:.6rem;justify-content:flex-end;margin-top:.4rem";
    var cancel = el("button", "btn btn--ghost", "Cancel");
    var save = el("button", "btn btn--cyan", "Save");
    row.appendChild(cancel); row.appendChild(save); card.appendChild(row); ov.appendChild(card); document.body.appendChild(ov);
    function close() { document.body.removeChild(ov); }
    cancel.addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
    save.addEventListener("click", function () {
      var vals = {}; Object.keys(inputs).forEach(function (k) { vals[k] = inputs[k].value.trim(); });
      save.textContent = "Saving…"; save.disabled = true;
      Promise.resolve(onSave(vals)).then(function (ok) { if (ok !== false) close(); else { save.textContent = "Save"; save.disabled = false; } });
    });
    (card.querySelector("input,textarea,select") || save).focus();
  }

  /* ---------- init / auth ---------- */
  function init() {
    hide("#admin-setup"); hide("#admin-login"); hide("#admin-dash");
    if (!configured) { show("#admin-setup"); return; }
    wire();
    SB.auth.getSession().then(function (res) { if (res.data && res.data.session) enterDash(res.data.session); else show("#admin-login"); }).catch(function () { show("#admin-login"); });
  }
  function enterDash(session) {
    hide("#admin-login"); hide("#admin-setup"); show("#admin-dash");
    var who = $("#admin-who"); if (who && session && session.user) who.textContent = "Signed in as " + session.user.email;
    loadGrid(); loadContentFields(); loadTests();
  }
  var wired = false;
  function wire() {
    if (wired) return; wired = true;
    $("#admin-login-btn").addEventListener("click", doLogin);
    var pass = $("#admin-pass"); if (pass) pass.addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    $("#admin-logout").addEventListener("click", function () { SB.auth.signOut().then(function () { hide("#admin-dash"); show("#admin-login"); }); });
    $$(".admin-tab").forEach(function (tab) { tab.addEventListener("click", function () {
      $$(".admin-tab").forEach(function (t) { t.classList.remove("is-on"); }); tab.classList.add("is-on");
      var name = tab.getAttribute("data-tab"); $$(".admin-pane").forEach(function (p) { p.style.display = p.getAttribute("data-pane") === name ? "" : "none"; });
    }); });
    $("#up-btn").addEventListener("click", uploadPhoto);
    $("#content-save").addEventListener("click", saveContent);
    $("#t-add").addEventListener("click", addTest);
  }
  function doLogin() {
    var email = $("#admin-email").value.trim(), pass = $("#admin-pass").value, err = $("#admin-login-err"); err.style.display = "none";
    if (!email || !pass) { err.textContent = "Enter your email and password."; err.style.display = "block"; return; }
    var b = $("#admin-login-btn"); b.textContent = "Signing in…"; b.disabled = true;
    SB.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
      b.textContent = "Sign in"; b.disabled = false;
      if (res.error) { err.textContent = res.error.message || "Sign-in failed."; err.style.display = "block"; return; }
      enterDash(res.data.session);
    });
  }

  /* ---------- Photos ---------- */
  function uploadPhoto() {
    var fi = $("#up-file"), cat = $("#up-cat").value, cap = $("#up-cap").value.trim();
    var file = fi.files && fi.files[0];
    if (!file) { note("#admin-upload-msg", "err", "Choose a photo to upload first."); return; }
    if (!/^image\//.test(file.type)) { note("#admin-upload-msg", "err", "That file isn’t an image."); return; }
    var btn = $("#up-btn"); btn.textContent = "Uploading…"; btn.disabled = true; note("#admin-upload-msg", "info", "Uploading photo…");
    var safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_"), path = Date.now() + "-" + safe;
    SB.storage.from(CFG.SUPABASE_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false })
      .then(function (up) { if (up.error) throw up.error; var pub = SB.storage.from(CFG.SUPABASE_BUCKET).getPublicUrl(path); return SB.from(CFG.GALLERY_TABLE).insert({ url: pub.data.publicUrl, path: path, category: cat, caption: cap }); })
      .then(function (ins) { if (ins.error) throw ins.error; note("#admin-upload-msg", "ok", "Photo added — it’s live on the site."); $("#up-file").value = ""; $("#up-cap").value = ""; loadGrid(); })
      .catch(function (err) { note("#admin-upload-msg", "err", "Upload failed: " + (err.message || "check the bucket/table & policies (see README).")); })
      .then(function () { btn.textContent = "Upload photo"; btn.disabled = false; });
  }
  function loadGrid() {
    var grid = $("#admin-grid"), empty = $("#admin-empty"); if (!grid) return;
    clear(grid);
    SB.from(CFG.GALLERY_TABLE).select("*").order("created_at", { ascending: false }).then(function (res) {
      if (res.error) { empty.style.display = "block"; empty.textContent = "Couldn’t load photos: " + res.error.message; return; }
      var rows = res.data || []; empty.style.display = rows.length ? "none" : "block"; if (!rows.length) { empty.textContent = "No photos yet — upload your first one above."; return; }
      rows.forEach(function (row) {
        var url = safeUrl(row.url); var cap = (row.caption || row.category || "").toString();
        var thumb = el("div", "admin-thumb");
        var img = document.createElement("img"); img.src = url; img.alt = cap; thumb.appendChild(img);
        var edit = el("button", "admin-edit", "Edit"); edit.title = "Edit caption/category";
        edit.addEventListener("click", function () {
          modal("Edit photo details", [
            { key: "caption", label: "Caption", type: "text", value: row.caption || "" },
            { key: "category", label: "Category", type: "select", value: row.category || "Residential", options: CATS }
          ], function (v) {
            return SB.from(CFG.GALLERY_TABLE).update({ caption: v.caption, category: v.category }).eq("id", row.id).then(function (r) { if (r.error) { alert("Update failed: " + r.error.message); return false; } loadGrid(); });
          });
        });
        var del = el("button", "admin-del"); del.title = "Delete"; del.textContent = "\u00D7";
        del.addEventListener("click", function () { delPhoto(row.id, row.path); });
        thumb.appendChild(edit); thumb.appendChild(del);
        thumb.appendChild(el("span", "cap2", cap));
        grid.appendChild(thumb);
      });
    });
  }
  function delPhoto(id, path) {
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    SB.from(CFG.GALLERY_TABLE).delete().eq("id", id).then(function (res) {
      if (res.error) { note("#admin-upload-msg", "err", "Delete failed: " + res.error.message); return; }
      if (path) { try { SB.storage.from(CFG.SUPABASE_BUCKET).remove([path]); } catch (e) {} }
      loadGrid();
    });
  }

  /* ---------- Content ---------- */
  function loadContentFields() {
    SB.from(CFG.CONTENT_TABLE).select("*").then(function (res) {
      if (res.error || !res.data) return; var map = {}; res.data.forEach(function (r) { map[r.key] = r.value; });
      $$("[data-key]").forEach(function (f) { var k = f.getAttribute("data-key"); f.value = map[k] != null ? map[k] : ""; });
    });
  }
  function saveContent() {
    var btn = $("#content-save"); btn.textContent = "Saving…"; btn.disabled = true;
    var ups = [], dels = [];
    $$("[data-key]").forEach(function (f) { var k = f.getAttribute("data-key"), v = f.value.trim(); if (v) ups.push({ key: k, value: v }); else dels.push(k); });
    var work = [];
    if (ups.length) work.push(SB.from(CFG.CONTENT_TABLE).upsert(ups, { onConflict: "key" }));
    dels.forEach(function (k) { work.push(SB.from(CFG.CONTENT_TABLE).delete().eq("key", k)); });
    Promise.all(work).then(function (results) {
      var bad = results.filter(function (r) { return r && r.error; });
      if (bad.length) note("#content-msg", "err", "Save failed: " + (bad[0].error.message || "check policies (see README)."));
      else note("#content-msg", "ok", "Saved — your text is live on the site.");
      btn.textContent = "Save changes"; btn.disabled = false;
    }).catch(function (e) { note("#content-msg", "err", "Save failed: " + (e.message || "try again.")); btn.textContent = "Save changes"; btn.disabled = false; });
  }

  /* ---------- Testimonials ---------- */
  function addTest() {
    var q = $("#t-quote").value.trim(), a = $("#t-author").value.trim();
    if (!q || !a) { note("#t-msg", "err", "Add both a quote and a customer name."); return; }
    var btn = $("#t-add"); btn.textContent = "Adding…"; btn.disabled = true;
    SB.from(CFG.TESTIMONIALS_TABLE).insert({ quote: q, author: a }).then(function (res) {
      btn.textContent = "Add testimonial"; btn.disabled = false;
      if (res.error) { note("#t-msg", "err", "Failed: " + res.error.message); return; }
      note("#t-msg", "ok", "Testimonial added."); $("#t-quote").value = ""; $("#t-author").value = ""; loadTests();
    });
  }
  function loadTests() {
    var list = $("#t-list"), empty = $("#t-empty"); if (!list) return; clear(list);
    SB.from(CFG.TESTIMONIALS_TABLE).select("*").order("created_at", { ascending: false }).then(function (res) {
      if (res.error) { empty.style.display = "block"; empty.textContent = "Couldn’t load: " + res.error.message; return; }
      var rows = res.data || []; empty.style.display = rows.length ? "none" : "block";
      rows.forEach(function (t) {
        var itemMain = el("div");
        var qp = el("p", null, "\u201C" + (t.quote || "") + "\u201D"); qp.style.cssText = "margin:0 0 .3rem;font-style:italic;color:var(--text)";
        var ap = el("p", null, "\u2014 " + (t.author || "")); ap.style.cssText = "margin:0;font-weight:800;color:var(--navy)";
        itemMain.appendChild(qp); itemMain.appendChild(ap);
        var btns = el("div"); btns.style.cssText = "display:flex;gap:.4rem;flex:none";
        var edit = el("button", "btn btn--ghost", "Edit"); edit.style.padding = ".4rem .7rem";
        edit.addEventListener("click", function () {
          modal("Edit testimonial", [
            { key: "quote", label: "Quote", type: "textarea", value: t.quote || "" },
            { key: "author", label: "Customer name", type: "text", value: t.author || "" }
          ], function (v) {
            if (!v.quote || !v.author) { alert("Both fields are required."); return false; }
            return SB.from(CFG.TESTIMONIALS_TABLE).update({ quote: v.quote, author: v.author }).eq("id", t.id).then(function (r) { if (r.error) { alert("Update failed: " + r.error.message); return false; } loadTests(); });
          });
        });
        var del = el("button", "btn btn--ghost", "Delete"); del.style.padding = ".4rem .7rem";
        del.addEventListener("click", function () { if (!confirm("Delete this testimonial?")) return; SB.from(CFG.TESTIMONIALS_TABLE).delete().eq("id", t.id).then(function (r) { if (r.error) { note("#t-msg", "err", "Delete failed: " + r.error.message); return; } loadTests(); }); });
        btns.appendChild(edit); btns.appendChild(del);
        var wrap = el("div"); wrap.style.cssText = "border:1px solid var(--line);border-radius:10px;padding:.9rem 1rem;display:flex;justify-content:space-between;gap:1rem;align-items:flex-start";
        wrap.appendChild(itemMain); wrap.appendChild(btns); list.appendChild(wrap);
      });
    });
  }

  init();
})();
