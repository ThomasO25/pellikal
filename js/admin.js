/* =============================================================
   PELLIKAL — admin.js  (loads only on admin.html)
   Secure staff dashboard: gallery photos, editable site text,
   and customer testimonials. All writes require sign-in and are
   enforced by Supabase row-level security on the server.
   ============================================================= */
(function () {
  "use strict";
  var CFG = window.PELLIKAL_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function show(id){var e=$(id);if(e)e.style.display="";}
  function hide(id){var e=$(id);if(e)e.style.display="none";}
  function note(id,kind,text){var e=$(id);if(!e)return;e.className="callout "+(kind==="ok"?"callout--ok":kind==="err"?"callout--warn":"callout--info");e.textContent=text;e.style.display=text?"block":"none";}
  function storageOK(){try{var k="__t";localStorage.setItem(k,"1");localStorage.removeItem(k);return true;}catch(e){return false;}}

  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
  var SB = null;
  if (configured) { try { SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: storageOK(), autoRefreshToken: storageOK() } }); } catch (e) { configured = false; } }

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
    $("#admin-login-btn").addEventListener("click", function () {
      var email = $("#admin-email").value.trim(), pass = $("#admin-pass").value, err = $("#admin-login-err"); err.style.display = "none";
      if (!email || !pass) { err.textContent = "Enter your email and password."; err.style.display = "block"; return; }
      var b = $("#admin-login-btn"); b.textContent = "Signing in…"; b.disabled = true;
      SB.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        b.textContent = "Sign in"; b.disabled = false;
        if (res.error) { err.textContent = res.error.message || "Sign-in failed."; err.style.display = "block"; return; }
        enterDash(res.data.session);
      });
    });
    var pass = $("#admin-pass"); if (pass) pass.addEventListener("keydown", function (e) { if (e.key === "Enter") $("#admin-login-btn").click(); });
    $("#admin-logout").addEventListener("click", function () { SB.auth.signOut().then(function () { hide("#admin-dash"); show("#admin-login"); }); });
    $$(".admin-tab").forEach(function (tab) { tab.addEventListener("click", function () {
      $$(".admin-tab").forEach(function (t) { t.classList.remove("is-on"); }); tab.classList.add("is-on");
      var name = tab.getAttribute("data-tab");
      $$(".admin-pane").forEach(function (p) { p.style.display = p.getAttribute("data-pane") === name ? "" : "none"; });
    }); });
    $("#up-btn").addEventListener("click", uploadPhoto);
    $("#content-save").addEventListener("click", saveContent);
    $("#t-add").addEventListener("click", addTest);
  }

  /* Photos */
  function uploadPhoto() {
    var fi = $("#up-file"), cat = $("#up-cat").value, cap = $("#up-cap").value.trim();
    var file = fi.files && fi.files[0];
    if (!file) { note("#admin-upload-msg", "err", "Choose a photo to upload first."); return; }
    var btn = $("#up-btn"); btn.textContent = "Uploading…"; btn.disabled = true; note("#admin-upload-msg", "info", "Uploading photo…");
    var safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_"), path = Date.now() + "-" + safe;
    SB.storage.from(CFG.SUPABASE_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false })
      .then(function (up) { if (up.error) throw up.error; var pub = SB.storage.from(CFG.SUPABASE_BUCKET).getPublicUrl(path); return SB.from(CFG.GALLERY_TABLE).insert({ url: pub.data.publicUrl, path: path, category: cat, caption: cap }); })
      .then(function (ins) { if (ins.error) throw ins.error; note("#admin-upload-msg", "ok", "Photo added — it's live on the site."); $("#up-file").value = ""; $("#up-cap").value = ""; loadGrid(); })
      .catch(function (err) { note("#admin-upload-msg", "err", "Upload failed: " + (err.message || "check your Supabase bucket/table & policies (see README).")); })
      .then(function () { btn.textContent = "Upload photo"; btn.disabled = false; });
  }
  function loadGrid() {
    var grid = $("#admin-grid"), empty = $("#admin-empty"); if (!grid) return;
    SB.from(CFG.GALLERY_TABLE).select("*").order("created_at", { ascending: false }).then(function (res) {
      if (res.error) { grid.innerHTML = ""; empty.style.display = "block"; empty.textContent = "Couldn't load photos: " + res.error.message; return; }
      var rows = res.data || []; empty.style.display = rows.length ? "none" : "block"; if (!rows.length) empty.textContent = "No photos yet — upload your first one above.";
      grid.innerHTML = rows.map(function (row) { var cap = (row.caption || row.category || "").replace(/"/g, "&quot;").replace(/</g, "&lt;"); return '<div class="admin-thumb"><img src="' + row.url + '" alt="' + cap + '"><button title="Delete" data-id="' + row.id + '" data-path="' + (row.path || "") + '">&times;</button><span class="cap2">' + cap + '</span></div>'; }).join("");
      $$(".admin-thumb button", grid).forEach(function (b) { b.addEventListener("click", function () { delPhoto(b.getAttribute("data-id"), b.getAttribute("data-path")); }); });
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

  /* Content */
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

  /* Testimonials */
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
    var list = $("#t-list"), empty = $("#t-empty"); if (!list) return;
    SB.from(CFG.TESTIMONIALS_TABLE).select("*").order("created_at", { ascending: false }).then(function (res) {
      if (res.error) { list.innerHTML = ""; empty.style.display = "block"; empty.textContent = "Couldn't load: " + res.error.message; return; }
      var rows = res.data || []; empty.style.display = rows.length ? "none" : "block";
      list.innerHTML = rows.map(function (t) { var q = (t.quote || "").replace(/</g, "&lt;"), a = (t.author || "").replace(/</g, "&lt;"); return '<div style="border:1px solid var(--line);border-radius:10px;padding:.9rem 1rem;display:flex;justify-content:space-between;gap:1rem;align-items:flex-start"><div><p style="margin:0 0 .3rem;font-style:italic;color:var(--text)">&ldquo;' + q + '&rdquo;</p><p style="margin:0;font-weight:800;color:var(--navy)">— ' + a + '</p></div><button class="btn btn--ghost" style="padding:.4rem .7rem" data-id="' + t.id + '">Delete</button></div>'; }).join("");
      $$("#t-list button").forEach(function (b) { b.addEventListener("click", function () { if (!confirm("Delete this testimonial?")) return; SB.from(CFG.TESTIMONIALS_TABLE).delete().eq("id", b.getAttribute("data-id")).then(function (r) { if (r.error) { note("#t-msg", "err", "Delete failed: " + r.error.message); return; } loadTests(); }); }); });
    });
  }

  init();
})();
