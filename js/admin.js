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
  function uploadImage(file) {
    if (!/^image\//.test(file.type)) return Promise.reject(new Error("That file isn't an image."));
    var path = Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
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
    EDIT.appendChild(el("p", "hint", "The headline, hero photo, Llumar SelectPro section and closing call-to-action. The preview updates as you type; the website changes only when you press Publish."));

    var bar = publishBar(function () {
      return publishContent(["hero_headline", "hero_subtitle", "hero_image", "selectpro_badge", "selectpro_text", "cta_headline", "cta_text"]).then(function (r) {
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
    EDIT.appendChild(field("Hero photo", imagePicker("f-hi", draft.hero_image, function (u) { draft.hero_image = u; bar._mark(); prev(); }), "One strong landscape photo of a luxury or coastal home."));
    EDIT.appendChild(field("Llumar SelectPro badge", imagePicker("f-sb", draft.selectpro_badge, function (u) { draft.selectpro_badge = u; bar._mark(); prev(); }), "Upload the official badge here to replace the placeholder."));
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
              challenge: p.challenge || "", result: p.result || "", image_url: p.image_url || "", image_path: p.image_path || "",
              featured: p.featured !== false, sort_order: p.sort_order || 0 };

    var t = input("p-t", d.title, "Waterfront residence");
    var loc = input("p-l", d.location, "Sag Harbor, NY");
    var svc = input("p-s", d.service, "Ceramic solar-control film");
    var desc = textarea("p-d", d.description, "One or two sentences about the property.");
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
    host.appendChild(field("Project photo", imagePicker("p-i", d.image_url, function (u, pa) { d.image_url = u; d.image_path = pa; bar._mark(); prev(); })));
    var fl = el("label", "fl", "Show on homepage"); fl.setAttribute("for", "p-f"); host.appendChild(fl);
    var frow = el("div"); frow.style.cssText = "display:flex;align-items:center;gap:.5rem;margin-top:.3rem";
    frow.appendChild(feat); frow.appendChild(el("span", "microcopy", "Featured projects appear in the homepage \u201COur work\u201D section."));
    host.appendChild(frow);
    host.appendChild(field("Sort order", sort, "Lower numbers appear first."));

    function sync() { d.title = t.value; d.location = loc.value; d.service = svc.value; d.description = desc.value; d.challenge = ch.value; d.result = rs.value; d.featured = feat.checked; d.sort_order = parseInt(sort.value || "0", 10); }
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
    [t, loc, svc, desc, ch, rs, sort].forEach(function (n) { n.addEventListener("input", function () { sync(); bar._mark(); prev(); }); });
    feat.addEventListener("change", function () { sync(); bar._mark(); prev(); });

    var bar = publishBar(function () {
      sync();
      if (!d.title) { alert("Give the project a title first."); return false; }
      var row = { title: d.title, location: d.location, service: d.service, description: d.description,
                  challenge: d.challenge, result: d.result, image_url: d.image_url, image_path: d.image_path,
                  featured: d.featured, sort_order: d.sort_order };
      var q = existing ? SB.from(PROJECTS).update(row).eq("id", existing.id) : SB.from(PROJECTS).insert(row);
      return q.then(function (r) {
        if (r.error) { alert("Couldn't publish: " + r.error.message); return false; }
        onSaved(); if (!existing) projectForm(host, null, onSaved);
        return true;
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
            if (rr.error) { alert(rr.error.message); return; }
            if (p.image_path) { try { SB.storage.from(CFG.SUPABASE_BUCKET).remove([p.image_path]); } catch (e) {} }
            listProjects(host, formHost);
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
    EDIT.appendChild(field("Description for accessibility", alt));
    EDIT.appendChild(btn("Upload photo", "btn--cyan", function () {
      var f = file.files && file.files[0]; if (!f) { msg.textContent = "Choose a photo first."; return; }
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
            if (rr.error) { alert(rr.error.message); return; }
            if (p.path) { try { SB.storage.from(CFG.SUPABASE_BUCKET).remove([p.path]); } catch (e) {} }
            listPhotos(host);
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

  /* ===================== BUSINESS INFORMATION ===================== */
  function viewBusiness() {
    clear(EDIT); clear(PREV);
    EDIT.appendChild(el("h2", null, "Business Information"));
    EDIT.appendChild(el("p", "hint", "Your phone, email and service area. If any of these are left blank the website keeps showing its built-in details, so nothing can go missing."));
    var ph = input("b-p", draft.business_phone || "", "516-336-9586", "tel");
    var em = input("b-e", draft.business_email || "", "info@pellikal.com", "email");
    var ar = textarea("b-a", draft.service_area || "", "Hamptons \u00B7 East End \u00B7 North Fork \u00B7 Long Island \u00B7 Manhattan");
    EDIT.appendChild(field("Phone number", ph));
    EDIT.appendChild(field("Email address", em));
    EDIT.appendChild(field("Primary service area", ar));
    function prev() {
      clear(PREV);
      PREV.appendChild(el("p", "microcopy", "Shown across the website:"));
      PREV.appendChild(el("h3", null, ph.value || "516-336-9586"));
      PREV.appendChild(el("p", null, em.value || "info@pellikal.com"));
      PREV.appendChild(el("p", "microcopy", ar.value || "Hamptons \u00B7 East End \u00B7 Long Island"));
    }
    var bar = publishBar(function () {
      draft.business_phone = ph.value; draft.business_email = em.value; draft.service_area = ar.value;
      return publishContent(["business_phone", "business_email", "service_area"]).then(function (r) {
        var old = EDIT.querySelector(".okbox,.warnbox"); if (old) old.remove();
        if (!r.ok) { EDIT.appendChild(note("err", "Couldn\u2019t publish: " + r.msg)); return false; }
        EDIT.appendChild(note("ok", "Changes published successfully.")); return true;
      });
    });
    [ph, em, ar].forEach(function (n) { n.addEventListener("input", function () { bar._mark(); prev(); }); });
    EDIT.appendChild(bar); prev();
  }

  /* ===================== shell ===================== */
  var VIEWS = { home: viewHome, projects: viewProjects, photos: viewPhotos, quotes: viewQuotes, business: viewBusiness };
  function go(name) {
    $$("#cms-nav button").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-view") === name); });
    (VIEWS[name] || viewHome)();
  }
  function show(id) { var e = $(id); if (e) e.style.display = ""; }
  function hide(id) { var e = $(id); if (e) e.style.display = "none"; }
  function enter(session) {
    hide("#admin-login"); hide("#admin-setup");
    $("#cms").classList.add("is-on");
    var who = $("#admin-who"); if (who && session && session.user) who.textContent = session.user.email;
    loadContent().then(function () { go("home"); }).catch(function () { go("home"); });
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
    hide("#admin-setup"); hide("#admin-login");
    if (!configured) { show("#admin-setup"); return; }
    $$("#cms-nav button").forEach(function (b) { b.addEventListener("click", function () { go(b.getAttribute("data-view")); }); });
    $("#admin-logout").addEventListener("click", function () { SB.auth.signOut().then(function () { location.reload(); }); });
    $("#admin-login-btn").addEventListener("click", doLogin);
    $("#admin-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    SB.auth.getSession().then(function (r) { if (r.data && r.data.session) enter(r.data.session); else show("#admin-login"); }).catch(function () { show("#admin-login"); });
  }
  init();
})();
