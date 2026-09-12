/* =============================================================
   PELLIKAL — Website Manager (admin.js)

   A plain-English CMS for the business owner. No knowledge of
   Supabase, tables, buckets, file paths, JSON, HTML or CSS is
   needed to use it.

   HOW PUBLISHING WORKS
     Typing updates the PREVIEW on the right immediately.
     The public website does not change until "Publish changes"
     is pressed — only then is anything written to Supabase.

   SECURITY
     Anon public key only — never a service_role key.
     Every write requires a signed-in account; row-level security
     on Supabase enforces that on the server, not here.
     All values render via createElement/textContent, never
     innerHTML, so stored text cannot inject markup.
   ============================================================= */
(function () {
  "use strict";
  var CFG = window.PELLIKAL_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function safeUrl(u) { u = String(u == null ? "" : u); return /^https?:\/\//i.test(u) ? u : ""; }
  function storageOK() { try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; } catch (e) { return false; } }

  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && String(CFG.SUPABASE_URL).indexOf("http") === 0 && window.supabase);
  var SB = null;
  if (configured) { try { SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: storageOK(), autoRefreshToken: storageOK() } }); } catch (e) { configured = false; } }

  var PROJECTS = CFG.PROJECTS_TABLE || "projects";
  var EDIT = $("#cms-edit"), PREV = $("#cms-prev");
  var draft = {}, saved = {};

  /* ---------- little builders ---------- */
  function field(labelText, node, hint) {
    var frag = document.createDocumentFragment();
    var l = el("label", "fl", labelText); if (node.id) l.setAttribute("for", node.id);
    frag.appendChild(l); frag.appendChild(node);
    if (hint) { var h = el("p", "microcopy", hint); h.style.margin = ".3rem 0 0"; frag.appendChild(h); }
    return frag;
  }
  function input(id, val, ph, type) { var i = document.createElement("input"); i.type = type || "text"; i.id = id; i.value = val == null ? "" : val; if (ph) i.placeholder = ph; return i; }
  function textarea(id, val, ph) { var t = document.createElement("textarea"); t.id = id; t.value = val == null ? "" : val; if (ph) t.placeholder = ph; return t; }
  function btn(text, cls, fn) { var b = el("button", "btn " + (cls || "btn--ghost"), text); b.type = "button"; b.addEventListener("click", fn); return b; }
  function smallBtn(text, cls, fn) { var b = el("button", cls || "", text); b.type = "button"; b.addEventListener("click", fn); return b; }
  function note(kind, text) { return el("p", kind === "err" ? "warnbox" : "okbox", text); }

  function publishBar(onPublish) {
    var bar = el("div", "dirty");
    var status = el("span", "dirty__s", "No unsaved changes");
    var pub = el("button", "btn btn--cyan", "Publish changes"); pub.type = "button"; pub.disabled = true;
    bar.appendChild(status); bar.appendChild(pub);
    bar._mark = function () { status.textContent = "Unpublished changes"; status.className = "dirty__s is-dirty"; pub.disabled = false; };
    bar._done = function () { status.textContent = "Changes published successfully."; status.className = "dirty__s is-ok"; pub.disabled = true; };
    pub.addEventListener("click", function () {
      pub.textContent = "Publishing\u2026"; pub.disabled = true;
      Promise.resolve(onPublish()).then(function (ok) {
        pub.textContent = "Publish changes";
        if (ok === false) { pub.disabled = false; status.textContent = "Couldn\u2019t publish \u2014 see the message above."; status.className = "dirty__s is-dirty"; }
        else bar._done();
      });
    });
    return bar;
  }

  /* ---------- shared data helpers ---------- */
  function loadContent() {
    return SB.from(CFG.CONTENT_TABLE).select("*").then(function (r) {
      saved = {}; (r.data || []).forEach(function (row) { saved[row.key] = row.value; });
      draft = Object.assign({}, saved); return saved;
    });
  }
  function publishContent(keys) {
    var ups = [], dels = [];
    keys.forEach(function (k) {
      var v = (draft[k] == null ? "" : String(draft[k])).trim();
      if (v) ups.push({ key: k, value: v }); else if (saved[k] != null) dels.push(k);
    });
    var jobs = [];
    if (ups.length) jobs.push(SB.from(CFG.CONTENT_TABLE).upsert(ups, { onConflict: "key" }));
    dels.forEach(function (k) { jobs.push(SB.from(CFG.CONTENT_TABLE).delete().eq("key", k)); });
    return Promise.all(jobs).then(function (res) {
      var bad = res.filter(function (r) { return r && r.error; });
      if (bad.length) return { ok: false, msg: bad[0].error.message };
      keys.forEach(function (k) { saved[k] = draft[k]; });
      return { ok: true };
    });
  }
  /* Remove a Storage object and REPORT the outcome.
     Returns a promise of true/false — callers must await it.
     A null/empty path means the image is a static repo asset (seeded rows
     have image_path = null), so there is nothing in Storage to delete and we
     must never try. */
  function removeStorage(path) {
    if (!path) return Promise.resolve(true);
    return SB.storage.from(CFG.SUPABASE_BUCKET).remove([path])
      .then(function (r) {
        if (r && r.error) { console.warn("[Pellikal] storage remove failed:", r.error.message); return false; }
        return true;
      })
      .catch(function (e) { console.warn("[Pellikal] storage remove failed:", e && e.message); return false; });
  }

  function uploadImage(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.reject(new Error("Only JPEG, PNG or WebP images are allowed."));
    /* Randomised object path. The original filename is never trusted or
       reused — only a whitelisted extension is carried over. Type and size
       are ALSO enforced server-side by the bucket; this check is just UX. */
    var EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    var ext = EXT[file.type];
    if (!ext) return Promise.reject(new Error("Only JPEG, PNG or WebP images are allowed."));
    if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error("That image is larger than 8 MB."));
    var path = (crypto && crypto.randomUUID ? crypto.randomUUID()
                : Date.now() + "-" + Math.random().toString(16).slice(2)) + "." + ext;
    return SB.storage.from(CFG.SUPABASE_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false })
      .then(function (r) { if (r.error) throw r.error; return { url: SB.storage.from(CFG.SUPABASE_BUCKET).getPublicUrl(path).data.publicUrl, path: path }; });
  }
  function imagePicker(id, currentUrl, onPicked) {
    var wrap = el("div");
    var prev = document.createElement("img");
    prev.alt = ""; prev.style.cssText = "width:100%;max-width:250px;border-radius:10px;display:block;margin-bottom:.6rem;background:#eef1f5";
    if (safeUrl(currentUrl)) prev.src = safeUrl(currentUrl); else prev.style.display = "none";
    var file = document.createElement("input"); file.type = "file"; file.accept = "image/*"; file.id = id;
    var status = el("p", "microcopy", ""); status.style.margin = ".4rem 0 0";
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; if (!f) return;
      status.textContent = "Uploading\u2026";
      uploadImage(f).then(function (r) {
        prev.src = r.url; prev.style.display = "block";
        status.textContent = "Uploaded. Press Publish changes to make it live.";
        onPicked(r.url, r.path);
      }).catch(function (e) { status.textContent = "Upload failed: " + (e.message || "please try again."); });
    });
    wrap.appendChild(prev); wrap.appendChild(file); wrap.appendChild(status);
    return wrap;
  }

  /* ===================== HOMEPAGE ===================== */
  function viewHome() {
    clear(EDIT); clear(PREV);
    EDIT.appendChild(el("h2", null, "Homepage"));
    EDIT.appendChild(el("p", "hint", "The headline, the Llumar SelectPro paragraph and the closing call-to-action. The preview updates as you type; the website changes only when you press Publish. (Photos are changed in Projects and Photos.)"));

    var bar = publishBar(function () {
      return publishContent(["hero_headline", "hero_subtitle", "selectpro_text", "cta_headline", "cta_text"]).then(function (r) {
        var old = EDIT.querySelector(".okbox,.warnbox"); if (old) old.remove();
        if (!r.ok) { EDIT.insertBefore(note("err", "Couldn\u2019t publish: " + r.msg), EDIT.children[2]); return false; }
        EDIT.insertBefore(note("ok", "Changes published successfully. They are live on your website."), EDIT.children[2]);
        return true;
      });
    });

    var h = input("f-hh", draft.hero_headline || "Protect What You've Built.");
    var s = textarea("f-hs", draft.hero_subtitle || "");
    var sp = textarea("f-sp", draft.selectpro_text || "");
    var ch = input("f-ch", draft.cta_headline || "Let's protect your home.");
    var ct = textarea("f-ct", draft.cta_text || "");

    EDIT.appendChild(field("Main headline", h));
    EDIT.appendChild(field("Headline paragraph", s, "One or two sentences under the headline."));
    EDIT.appendChild(field("Llumar SelectPro paragraph", sp, "Have this wording approved by Llumar before publishing."));
    EDIT.appendChild(field("Closing headline", ch));
    EDIT.appendChild(field("Closing paragraph", ct));

    function sync() { draft.hero_headline = h.value; draft.hero_subtitle = s.value; draft.selectpro_text = sp.value; draft.cta_headline = ch.value; draft.cta_text = ct.value; }
    [h, s, sp, ch, ct].forEach(function (n) { n.addEventListener("input", function () { sync(); bar._mark(); prev(); }); });

    function prev() {
      clear(PREV);
      var img = safeUrl(draft.hero_image);
      if (img) { var i = document.createElement("img"); i.src = img; i.alt = ""; i.style.cssText = "width:100%;border-radius:12px;margin-bottom:1rem;display:block"; PREV.appendChild(i); }
      PREV.appendChild(el("p", "eyebrow", "The Hamptons \u00B7 East End \u00B7 Long Island"));
      var t = el("h1", null, draft.hero_headline || "Protect What You've Built."); t.style.cssText = "font-size:1.85rem;margin:.2rem 0 .6rem"; PREV.appendChild(t);
      PREV.appendChild(el("p", "lead", draft.hero_subtitle || "Premium window film for East End, Hamptons and Long Island homes."));
      var row = el("div"); row.style.cssText = "display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0 1.4rem";
      row.appendChild(el("span", "btn btn--cyan", "Schedule a Consultation"));
      row.appendChild(el("span", "btn btn--ghost", "Call 516-336-9586")); PREV.appendChild(row);
      var sec = el("div"); sec.style.cssText = "border-top:1px solid var(--line);padding-top:1.1rem;display:flex;gap:1rem;align-items:flex-start";
      var b = safeUrl(draft.selectpro_badge);
      if (b) { var bi = document.createElement("img"); bi.src = b; bi.alt = ""; bi.style.cssText = "width:70px;height:70px;object-fit:contain;flex:none"; sec.appendChild(bi); }
      sec.appendChild(el("p", "microcopy", draft.selectpro_text || "An authorized Llumar SelectPro dealer."));
      PREV.appendChild(sec);
      var c = el("h2", null, draft.cta_headline || "Let's protect your home."); c.style.cssText = "font-size:1.3rem;margin:1.5rem 0 .35rem"; PREV.appendChild(c);
      PREV.appendChild(el("p", "microcopy", draft.cta_text || ""));
    }
    EDIT.appendChild(bar); prev();
  }

  /* ===================== PROJECTS ===================== */
  function viewProjects() {
    clear(EDIT); clear(PREV);
    EDIT.appendChild(el("h2", null, "Projects"));
    EDIT.appendChild(el("p", "hint", "Real Pellikal work. Anything marked \u201CShow on homepage\u201D appears in the homepage projects section. Only publish jobs you actually completed."));
    var formHost = el("div"); EDIT.appendChild(formHost);
    var listHead = el("h2", null, "Published projects"); listHead.style.marginTop = "2rem"; EDIT.appendChild(listHead);
    var list = el("div", "cms__list"); EDIT.appendChild(list);
    projectForm(formHost, null, function () { listProjects(list, formHost); });
    listProjects(list, formHost);
  }
  function projectForm(host, existing, onSaved) {
    clear(host);
    var p = existing || {};
    var d = { title: p.title || "", location: p.location || "", service: p.service || "", description: p.description || "",
              challenge: p.challenge || "", result: p.result || "", image_url: p.image_url || "", image_path: p.image_path || "", alt_text: p.alt_text || "",
              featured: p.featured !== false, sort_order: p.sort_order || 0 };

    var t = input("p-t", d.title, "Waterfront residence");
    var loc = input("p-l", d.location, "Sag Harbor, NY");
    var svc = input("p-s", d.service, "Ceramic solar-control film");
    var desc = textarea("p-d", d.description, "One or two sentences about the property.");
    var altf = input("p-alt", d.alt_text, "e.g. Cedar-shingled home with large filmed picture windows");
    var ch = textarea("p-c", d.challenge, "What problem was the customer facing?");
    var rs = textarea("p-r", d.result, "What the film achieved.");
    var feat = document.createElement("input"); feat.type = "checkbox"; feat.id = "p-f"; feat.checked = d.featured;
    var sort = input("p-o", d.sort_order, "0", "number");

    host.appendChild(el("h2", null, existing ? "Edit project" : "Add a project"));
    host.appendChild(field("Project title", t));
    host.appendChild(field("Town / location", loc));
    host.appendChild(field("Service / film type", svc));
    host.appendChild(field("Short description", desc));
    host.appendChild(field("Challenge", ch));
    host.appendChild(field("Solution / result", rs));
    host.appendChild(field("Project photo", imagePicker("p-i", d.image_url, function (u, pa) {
      /* remember the object we are replacing so it can be cleaned up AFTER the
         new row saves successfully. Never touch a null path — that means the
         image is a static repo asset, not a Storage object. */
      if (d.image_path && d.image_path !== pa) d._replacedPath = d.image_path;
      d.image_url = u; d.image_path = pa; bar._mark(); prev();
    })));
    host.appendChild(field("Photo description (alt text)", altf,
      "Describe what is visible, in one plain sentence. Screen readers read this aloud, and it helps search. Required when there is a photo."));
    var fl = el("label", "fl", "Show on homepage"); fl.setAttribute("for", "p-f"); host.appendChild(fl);
    var frow = el("div"); frow.style.cssText = "display:flex;align-items:center;gap:.5rem;margin-top:.3rem";
    frow.appendChild(feat); frow.appendChild(el("span", "microcopy", "Featured projects appear in the homepage \u201COur work\u201D section."));
    host.appendChild(frow);
    host.appendChild(field("Sort order", sort, "Lower numbers appear first."));

    function sync() { d.title = t.value; d.location = loc.value; d.service = svc.value; d.description = desc.value; d.challenge = ch.value; d.result = rs.value; d.alt_text = altf.value; d.featured = feat.checked; d.sort_order = parseInt(sort.value || "0", 10); }
    function prev() {
      clear(PREV);
      var art = el("article", "proj");
      var media = el("div", "proj__media");
      if (safeUrl(d.image_url)) { var i = document.createElement("img"); i.src = d.image_url; i.alt = ""; media.appendChild(i); }
      art.appendChild(media);
      var b = el("div", "proj__body");
      b.appendChild(el("h3", null, d.title || "Project title"));
      var meta = [d.location, d.service].filter(Boolean).join(" \u00B7 "); if (meta) b.appendChild(el("p", "proj__meta", meta));
      if (d.description) b.appendChild(el("p", "proj__l", d.description));
      if (d.challenge) b.appendChild(el("p", "proj__l", "Challenge: " + d.challenge));
      if (d.result) b.appendChild(el("p", "proj__l", "Result: " + d.result));
      art.appendChild(b); PREV.appendChild(art);
    }
    [t, loc, svc, desc, ch, rs, altf, sort].forEach(function (n) { n.addEventListener("input", function () { sync(); bar._mark(); prev(); }); });
    feat.addEventListener("change", function () { sync(); bar._mark(); prev(); });

    var bar = publishBar(function () {
      sync();
      if (!d.title) { alert("Give the project a title first."); return false; }
      if (d.image_url && !(d.alt_text || "").trim()) {
        alert("Please add a photo description (alt text) so the image is accessible.");
        return false;
      }
      var row = { title: d.title, location: d.location, service: d.service, description: d.description,
                  challenge: d.challenge, result: d.result, image_url: d.image_url, image_path: d.image_path,
                  alt_text: d.alt_text, featured: d.featured, sort_order: d.sort_order };
      var q = existing ? SB.from(PROJECTS).update(row).eq("id", existing.id) : SB.from(PROJECTS).insert(row);
      return q.then(function (r) {
        if (r.error) { alert("Couldn't publish: " + r.error.message); return false; }
        /* Row saved. Only now remove the Storage object it replaced, so a
           failed save can never leave the project pointing at a deleted file. */
        var cleanup = d._replacedPath ? removeStorage(d._replacedPath) : Promise.resolve(true);
        return cleanup.then(function (ok) {
          if (!ok) alert("Saved, but the previous image could not be removed from storage. It is now unused.");
          d._replacedPath = null;
          onSaved(); if (!existing) projectForm(host, null, onSaved);
          return true;
        });
      });
    });
    host.appendChild(bar); prev();
  }
  function listProjects(host, formHost) {
    clear(host); host.appendChild(el("p", "cms__empty", "Loading\u2026"));
    SB.from(PROJECTS).select("*").order("sort_order", { ascending: true }).then(function (r) {
      clear(host);
      if (r.error) { host.appendChild(el("p", "cms__empty", "Couldn\u2019t load: " + r.error.message)); return; }
      var rows = r.data || [];
      if (!rows.length) { host.appendChild(el("p", "cms__empty", "No projects yet \u2014 add your first one above.")); return; }
      rows.forEach(function (p) {
        var it = el("div", "cms__item");
        if (safeUrl(p.image_url)) { var im = document.createElement("img"); im.src = p.image_url; im.alt = ""; it.appendChild(im); }
        var g = el("div", "g");
        var b = el("b", null, p.title || "Untitled");
        b.appendChild(el("span", p.featured ? "pillbadge" : "pillbadge pillbadge--off", p.featured ? "Homepage" : "Hidden"));
        g.appendChild(b); g.appendChild(el("span", null, [p.location, p.service].filter(Boolean).join(" \u00B7 ")));
        it.appendChild(g);
        var acts = el("div", "acts");
        acts.appendChild(smallBtn("Edit", "", function () { projectForm(formHost, p, function () { listProjects(host, formHost); }); window.scrollTo({ top: 0, behavior: "smooth" }); }));
        acts.appendChild(smallBtn("Delete", "del", function () {
          if (!confirm("Delete \u201C" + (p.title || "this project") + "\u201D? This cannot be undone.")) return;
          SB.from(PROJECTS).delete().eq("id", p.id).then(function (rr) {
            if (rr.error) { alert("Couldn't delete: " + rr.error.message); return; }
            return removeStorage(p.image_path).then(function (ok) {
              if (!ok) alert("Project deleted, but its image could not be removed from storage. It is now unused.");
              listProjects(host, formHost);
            });
          });
        }));
        it.appendChild(acts); host.appendChild(it);
      });
    });
  }

  /* ===================== PHOTOS ===================== */
  function viewPhotos() {
    clear(EDIT); clear(PREV);
    EDIT.appendChild(el("h2", null, "Photos"));
    EDIT.appendChild(el("p", "hint", "Your photo gallery. Photos always display level and straight on the website."));
    var file = document.createElement("input"); file.type = "file"; file.accept = "image/*"; file.id = "ph-f";
    var cap = input("ph-c", "", "Caption (optional)");
    var alt = input("ph-a", "", "Describe the photo for screen readers");
    var msg = el("p", "microcopy", "");
    EDIT.appendChild(field("Choose a photo", file));
    EDIT.appendChild(field("Caption", cap));
    EDIT.appendChild(field("Photo description (alt text)", alt, "Required. One plain sentence describing what is visible \u2014 screen readers read this aloud."));
    EDIT.appendChild(btn("Upload photo", "btn--cyan", function () {
      var f = file.files && file.files[0]; if (!f) { msg.textContent = "Choose a photo first."; return; }
      if (!alt.value.trim()) { msg.textContent = "Please add a photo description (alt text) before uploading."; return; }
      msg.textContent = "Uploading\u2026";
      uploadImage(f).then(function (r) {
        return SB.from(CFG.GALLERY_TABLE).insert({ url: r.url, path: r.path, caption: cap.value.trim(), alt_text: alt.value.trim() });
      }).then(function (r) {
        if (r.error) throw r.error;
        msg.textContent = "Photo published to your gallery."; file.value = ""; cap.value = ""; alt.value = ""; listPhotos(grid);
      }).catch(function (e) { msg.textContent = "Upload failed: " + (e.message || "please try again."); });
    }));
    EDIT.appendChild(msg);
    var gh = el("h2", null, "Your photos"); gh.style.marginTop = "2rem"; EDIT.appendChild(gh);
    var grid = el("div", "cms__list"); EDIT.appendChild(grid); listPhotos(grid);
    PREV.appendChild(el("p", "microcopy", "Uploaded photos appear in the gallery on your website. Use Projects for full case studies with a challenge and result."));
  }
  function listPhotos(host) {
    clear(host); host.appendChild(el("p", "cms__empty", "Loading\u2026"));
    SB.from(CFG.GALLERY_TABLE).select("*").order("created_at", { ascending: false }).then(function (r) {
      clear(host);
      if (r.error) { host.appendChild(el("p", "cms__empty", "Couldn\u2019t load: " + r.error.message)); return; }
      var rows = r.data || [];
      if (!rows.length) { host.appendChild(el("p", "cms__empty", "No photos yet.")); return; }
      rows.forEach(function (p) {
        var it = el("div", "cms__item");
        if (safeUrl(p.url)) { var im = document.createElement("img"); im.src = p.url; im.alt = ""; it.appendChild(im); }
        var g = el("div", "g"); g.appendChild(el("b", null, p.caption || "(no caption)"));
        g.appendChild(el("span", null, p.alt_text || "")); it.appendChild(g);
        var acts = el("div", "acts");
        acts.appendChild(smallBtn("Delete", "del", function () {
          if (!confirm("Delete this photo?")) return;
          SB.from(CFG.GALLERY_TABLE).delete().eq("id", p.id).then(function (rr) {
            if (rr.error) { alert("Couldn't delete: " + rr.error.message); return; }
            return removeStorage(p.path).then(function (ok) {
              if (!ok) alert("Photo deleted, but the file could not be removed from storage. It is now unused.");
              listPhotos(host);
            });
          });
        }));
        it.appendChild(acts); host.appendChild(it);
      });
    });
  }

  /* ===================== TESTIMONIALS ===================== */
  function viewQuotes() {
    clear(EDIT); clear(PREV);
    EDIT.appendChild(el("h2", null, "Testimonials"));
    EDIT.appendChild(note("err", "Only publish reviews from real customers. Never invent a quote, change its meaning, or reuse someone else\u2019s review."));
    var q = textarea("t-q", "", "What the customer said, in their words.");
    var a = input("t-a", "", "Customer display name");
    var loc = input("t-l", "", "Town (optional)");
    var msg = el("p", "microcopy", "");
    EDIT.appendChild(field("Quote", q));
    EDIT.appendChild(field("Customer name", a));
    EDIT.appendChild(field("Location", loc));
    function prev() {
      clear(PREV);
      var fig = el("figure", "quote");
      fig.appendChild(el("div", "quote__mark", "\u201C"));
      fig.appendChild(el("p", null, q.value || "The customer\u2019s words appear here."));
      fig.appendChild(el("figcaption", "quote__by", "\u2014 " + (a.value || "Customer name") + (loc.value ? " \u00B7 " + loc.value : "")));
      PREV.appendChild(fig);
    }
    [q, a, loc].forEach(function (n) { n.addEventListener("input", prev); });
    EDIT.appendChild(btn("Publish testimonial", "btn--cyan", function () {
      if (!q.value.trim() || !a.value.trim()) { msg.textContent = "A quote and a customer name are both required."; return; }
      SB.from(CFG.TESTIMONIALS_TABLE).insert({ quote: q.value.trim(), author: a.value.trim(), location: loc.value.trim() }).then(function (r) {
        if (r.error) { msg.textContent = "Failed: " + r.error.message; return; }
        msg.textContent = "Changes published successfully."; q.value = ""; a.value = ""; loc.value = ""; prev(); listQuotes(list);
      });
    }));
    EDIT.appendChild(msg);
    var lh = el("h2", null, "Published testimonials"); lh.style.marginTop = "2rem"; EDIT.appendChild(lh);
    var list = el("div", "cms__list"); EDIT.appendChild(list); listQuotes(list); prev();
  }
  function listQuotes(host) {
    clear(host); host.appendChild(el("p", "cms__empty", "Loading\u2026"));
    SB.from(CFG.TESTIMONIALS_TABLE).select("*").order("created_at", { ascending: false }).then(function (r) {
      clear(host);
      if (r.error) { host.appendChild(el("p", "cms__empty", "Couldn\u2019t load: " + r.error.message)); return; }
      var rows = r.data || [];
      if (!rows.length) { host.appendChild(el("p", "cms__empty", "No testimonials yet. The website shows an honest empty message until you add one.")); return; }
      rows.forEach(function (t) {
        var it = el("div", "cms__item"); var g = el("div", "g");
        g.appendChild(el("b", null, t.author || "")); g.appendChild(el("span", null, t.quote || ""));
        it.appendChild(g);
        var acts = el("div", "acts");
        acts.appendChild(smallBtn("Delete", "del", function () {
          if (!confirm("Delete this testimonial?")) return;
          SB.from(CFG.TESTIMONIALS_TABLE).delete().eq("id", t.id).then(function () { listQuotes(host); });
        }));
        it.appendChild(acts); host.appendChild(it);
      });
    });
  }

  /* Business Information (phone / email / service area) is intentionally NOT
     editable here. Those values generate tel:, sms: and mailto: links, meta
     descriptions and JSON-LD across every page, so they live in
     site.config.json and are applied by tools/build.py. Editing them at
     runtime could only ever change some occurrences and would leave the site
     inconsistent. See docs/DATA-MODEL.md. */

  /* ===================== shell ===================== */
  var VIEWS = { home: viewHome, projects: viewProjects, photos: viewPhotos, quotes: viewQuotes };
  function go(name) {
    $$("#cms-nav button").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-view") === name); });
    (VIEWS[name] || viewHome)();
  }
  function show(id) { var e = $(id); if (e) e.style.display = ""; }
  function hide(id) { var e = $(id); if (e) e.style.display = "none"; }
  /* AUTHORISATION GATE.
     Being signed in is NOT authorisation. Before any CMS chrome is shown we
     ask the database whether this user is an approved admin, via the
     am_i_admin() RPC (which reads app_admins under SECURITY DEFINER).
     A normal account gets a clear refusal and is signed out.

     This is a UX gate only — the real enforcement is row-level security on
     the server. Even if someone forced this function to run, every write
     would still be rejected by Postgres. */
  /* ===================== ACCESS CONTROL =====================
     Two independent gates, in order:

       1. APPROVED ADMIN — am_i_admin() asks the database whether this
          user's UUID is in app_admins. Being signed in proves nothing.

       2. MFA (aal2) — the session must have completed a TOTP challenge.
          Supabase records this as the "aal" claim in the JWT.

     Both gates are ALSO enforced server-side: every write policy requires
     public.is_admin_mfa(), which is is_admin() AND aal2. So this screen is
     convenience — a password-only session that skipped the UI entirely would
     still be refused by Postgres on every insert, update and delete.
     ========================================================= */

  var currentSession = null;

  function enter(session) {
    currentSession = session;
    hide("#admin-login"); hide("#admin-setup"); hide("#admin-mfa"); hide("#admin-mfa-enroll");

    SB.rpc("am_i_admin").then(function (res) {
      if (res.error || res.data !== true) return denyAccess(res.error);   // gate 1
      return checkAssurance();                                            // gate 2
    }).catch(function (e) { denyAccess(e); });
  }

  /* Decide whether this session already satisfies MFA, needs a code, or needs
     first-time enrolment. */
  function checkAssurance() {
    return SB.auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
      if (r.error) throw r.error;
      var cur = r.data && r.data.currentLevel;
      var next = r.data && r.data.nextLevel;
      if (cur === "aal2") return showCMS();              // already verified
      if (next === "aal2") return showChallenge();       // has a factor, needs the code
      return showEnroll();                               // no factor yet
    }).catch(function (e) { denyAccess(e); });
  }

  function showCMS() {
    hide("#admin-login"); hide("#admin-mfa"); hide("#admin-mfa-enroll");
    $("#cms").classList.add("is-on");
    var who = $("#admin-who");
    if (who && currentSession && currentSession.user) who.textContent = currentSession.user.email;
    loadContent().then(function () { go("home"); }).catch(function () { go("home"); });
  }

  /* ---- existing authenticator: ask for the 6-digit code ---- */
  function showChallenge() {
    hide("#admin-login"); show("#admin-mfa");
    var code = $("#mfa-code"), err = $("#mfa-err"), btn = $("#mfa-verify");
    err.style.display = "none"; code.value = ""; code.focus();

    function verify() {
      var val = (code.value || "").replace(/\D/g, "");
      if (val.length !== 6) { err.textContent = "Enter the 6-digit code from your app."; err.style.display = "block"; return; }
      btn.textContent = "Verifying\u2026"; btn.disabled = true; err.style.display = "none";
      SB.auth.mfa.listFactors().then(function (lf) {
        if (lf.error) throw lf.error;
        var totp = (lf.data && lf.data.totp) || [];
        if (!totp.length) return showEnroll();
        return SB.auth.mfa.challengeAndVerify({ factorId: totp[0].id, code: val }).then(function (v) {
          if (v.error) throw v.error;
          return checkAssurance();     // re-read the AAL rather than assuming
        });
      }).catch(function (e) {
        err.textContent = (e && e.message) ? e.message : "That code wasn\u2019t accepted. Try the next one.";
        err.style.display = "block"; code.value = ""; code.focus();
      }).then(function () { btn.textContent = "Verify"; btn.disabled = false; });
    }
    btn.onclick = verify;
    code.onkeydown = function (e) { if (e.key === "Enter") verify(); };
    $("#mfa-cancel").onclick = function (e) { e.preventDefault(); SB.auth.signOut().then(function () { location.reload(); }); };
  }

  /* ---- first login: enrol a TOTP factor ---- */
  function showEnroll() {
    hide("#admin-login"); hide("#admin-mfa"); show("#admin-mfa-enroll");
    var err = $("#mfa-enroll-err"), btn = $("#mfa-enroll-verify");
    var qr = $("#mfa-qr"), secret = $("#mfa-secret"), code = $("#mfa-enroll-code");
    err.style.display = "none";
    var factorId = null;

    /* mfa.enroll() creates an UNVERIFIED factor. If setup is abandoned halfway
       and restarted, those unverified factors would otherwise pile up on the
       account forever. So: clear out any unverified TOTP factors first, then
       enrol exactly one.

       A VERIFIED factor is never touched here — if one existed we would not be
       on this screen at all (checkAssurance would have sent us to the code
       challenge). The status check below is belt-and-braces so a change in
       Supabase's response shape can never unenrol a working authenticator. */
    SB.auth.mfa.listFactors()
      .then(function (lf) {
        if (lf.error) throw lf.error;
        var all = (lf.data && (lf.data.totp || lf.data.all)) || [];
        var stale = all.filter(function (f) {
          return f && f.id && f.factor_type !== "phone" && f.status && f.status !== "verified";
        });
        if (!stale.length) return null;
        return Promise.all(stale.map(function (f) {
          return SB.auth.mfa.unenroll({ factorId: f.id }).catch(function (e) {
            console.warn("[Pellikal] could not clear stale MFA factor:", e && e.message);
          });
        }));
      })
      .catch(function (e) { console.warn("[Pellikal] factor cleanup skipped:", e && e.message); })
      .then(function () {
        return SB.auth.mfa.enroll({ factorType: "totp", friendlyName: "Pellikal admin" });
      })
      .then(function (r) {
        if (r.error) throw r.error;
        factorId = r.data.id;
        var t = r.data.totp || {};
        /* The QR arrives as an SVG data URI. Only ever assign it to an <img>
           src after checking the scheme — an <img> cannot execute SVG script,
           and we never inject the markup into the DOM. */
        if (typeof t.qr_code === "string" && /^data:image\/svg\+xml[,;]/i.test(t.qr_code)) {
          qr.src = t.qr_code; qr.style.display = "inline-block";
        }
        if (t.secret) secret.value = t.secret;
        code.focus();
      })
      .catch(function (e) {
        err.textContent = (e && e.message) ? e.message : "Couldn\u2019t start two-factor setup.";
        err.style.display = "block";
      });

    function verify() {
      var val = (code.value || "").replace(/\D/g, "");
      if (!factorId) { err.textContent = "Setup didn\u2019t start. Reload and try again."; err.style.display = "block"; return; }
      if (val.length !== 6) { err.textContent = "Enter the 6-digit code from your app."; err.style.display = "block"; return; }
      btn.textContent = "Verifying\u2026"; btn.disabled = true; err.style.display = "none";
      SB.auth.mfa.challengeAndVerify({ factorId: factorId, code: val })
        .then(function (v) { if (v.error) throw v.error; return checkAssurance(); })
        .catch(function (e) {
          err.textContent = (e && e.message) ? e.message : "That code wasn\u2019t accepted. Wait for the next one and retry.";
          err.style.display = "block"; code.value = ""; code.focus();
        })
        .then(function () { btn.textContent = "Confirm and continue"; btn.disabled = false; });
    }
    btn.onclick = verify;
    code.onkeydown = function (e) { if (e.key === "Enter") verify(); };
    $("#mfa-enroll-cancel").onclick = function (e) { e.preventDefault(); SB.auth.signOut().then(function () { location.reload(); }); };
  }

  function denyAccess(err) {
    $("#cms").classList.remove("is-on");
    hide("#admin-mfa"); hide("#admin-mfa-enroll");
    show("#admin-login");
    /* Keep the on-screen message generic. Database/auth error strings can
       disclose schema or configuration detail, and they mean nothing to the
       person reading them. Technical detail goes to the console instead. */
    if (err) console.warn("[Pellikal] admin access denied:", (err && err.message) || err);
    var box = $("#admin-login-err");
    if (box) {
      box.textContent = "This account is not authorised for the Pellikal site manager. Ask the site owner to add you.";
      box.style.display = "block";
    }
    try { SB.auth.signOut(); } catch (e) {}
  }
  function doLogin() {
    var email = $("#admin-email").value.trim(), pass = $("#admin-pass").value, err = $("#admin-login-err");
    err.style.display = "none";
    if (!email || !pass) { err.textContent = "Enter your email and password."; err.style.display = "block"; return; }
    var b = $("#admin-login-btn"); b.textContent = "Signing in\u2026"; b.disabled = true;
    SB.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
      b.textContent = "Sign in"; b.disabled = false;
      if (r.error) { err.textContent = r.error.message || "Sign-in failed."; err.style.display = "block"; return; }
      enter(r.data.session);
    });
  }
  function init() {
    hide("#admin-setup"); hide("#admin-login"); hide("#admin-mfa"); hide("#admin-mfa-enroll");
    if (!configured) { show("#admin-setup"); return; }
    $$("#cms-nav button").forEach(function (b) { b.addEventListener("click", function () { go(b.getAttribute("data-view")); }); });
    $("#admin-logout").addEventListener("click", function () { SB.auth.signOut().then(function () { location.reload(); }); });
    $("#admin-login-btn").addEventListener("click", doLogin);
    $("#admin-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    SB.auth.getSession().then(function (r) { if (r.data && r.data.session) enter(r.data.session); else show("#admin-login"); }).catch(function () { show("#admin-login"); });
  }
  init();
})();
