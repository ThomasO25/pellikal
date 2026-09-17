/* =============================================================
   PELLIKAL — main.js  (runs on every public page)
   Nav, loader, scroll reveals, FAQ, tint before/after slider,
   animated stat counters, gallery lightbox, back-to-top,
   Formspree contact, and Supabase PUBLIC reads (gallery,
   testimonials, editable text).

   SECURITY NOTES:
   - Uses only the Supabase ANON public key (js/config.js).
     NEVER put a service_role key in the frontend.
   - Gallery / testimonials / editable text render with
     document.createElement + textContent (never innerHTML) so
     database content cannot inject HTML or scripts.
   - No writes happen here; all editing is in the signed-in admin
     and is enforced by Supabase row-level security.
   ============================================================= */
(function () {
  "use strict";
  var CFG = window.PELLIKAL_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function safeUrl(u) { u = String(u == null ? "" : u); return /^https?:\/\//i.test(u) ? u : ""; }

  /* ---------- Loader (short; skipped for reduced motion) ---------- */
  if (reduceMotion) document.body.classList.add("loaded");
  else {
    window.addEventListener("load", function () { setTimeout(function () { document.body.classList.add("loaded"); }, 1700); });
    setTimeout(function () { document.body.classList.add("loaded"); }, 3500);
  }

  /* ---------- Mobile nav ---------- */
  var menu = $("#navMenu"), toggle = $("#navToggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) { menu.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu.classList.contains("is-open")) { menu.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); toggle.focus(); } });
  }

  /* ---------- FAQ accordion ---------- */
  $$(".faq__q").forEach(function (btn) {
    btn.setAttribute("aria-expanded", "false");
    var panel = btn.parentElement.nextElementSibling;
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      var group = btn.closest(".faq");
      if (group) $$(".faq__q", group).forEach(function (o) {
        if (o !== btn) { o.setAttribute("aria-expanded", "false"); var p = o.parentElement.nextElementSibling; if (p) p.style.height = "0px"; }
      });
      if (open) { btn.setAttribute("aria-expanded", "false"); panel.style.height = "0px"; }
      else { btn.setAttribute("aria-expanded", "true"); panel.style.height = panel.firstElementChild.offsetHeight + "px"; }
    });
  });

  /* ---------- Tint before/after slider ---------- */
  function sizeBA(ba) { var img = $(".ba__clip .ba__img--untinted", ba); if (img) img.style.width = ba.offsetWidth + "px"; }
  function sizeAllBA() { $$("[data-ba]").forEach(sizeBA); }
  $$("[data-ba]").forEach(function (ba) {
    var range = $(".ba__range", ba), clip = $(".ba__clip", ba), handle = $(".ba__handle", ba);
    function set(v) { clip.style.width = v + "%"; handle.style.left = v + "%"; }
    if (range) {
      range.addEventListener("input", function () { set(range.value); ba.classList.add("is-touched"); });
      range.addEventListener("pointerdown", function () { ba.classList.add("is-touched"); });
      set(range.value);
    }
    sizeBA(ba);
  });
  window.addEventListener("resize", sizeAllBA);

  /* ---------- Animated stat counters ---------- */
  function animateCount(elm) {
    var raw = elm.getAttribute("data-count-text") || elm.textContent;
    elm.setAttribute("data-count-text", raw);
    var m = raw.match(/^(\d+)(.*)$/); if (!m) return;
    var target = parseInt(m[1], 10), suffix = m[2] || "", dur = 1000, start = null;
    if (reduceMotion) { elm.textContent = target + suffix; return; }
    function step(ts) { if (!start) start = ts; var p = Math.min((ts - start) / dur, 1); elm.textContent = Math.round(target * (p * (2 - p))) + suffix; if (p < 1) requestAnimationFrame(step); else elm.textContent = target + suffix; }
    requestAnimationFrame(step);
  }

  /* ---------- Scroll reveals (+ counters) ---------- */
  var io = null;
  function revealCheck() {
    if (!("IntersectionObserver" in window)) { $$("[data-reveal]").forEach(function (e) { e.classList.add("is-in"); }); $$(".stat__n").forEach(animateCount); return; }
    if (!io) io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          if (en.target.classList.contains("stat")) { var n = $(".stat__n", en.target); if (n && !n.__done) { n.__done = true; animateCount(n); } }
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
    $$("[data-reveal]:not(.is-in), .stat").forEach(function (e) { io.observe(e); });
  }
  revealCheck();

  /* ---------- Gallery lightbox (keyboard accessible) ---------- */
  var lb = null, lastFocus = null;
  function ensureLightbox() {
    if (lb) return lb;
    lb = el("div", "lightbox"); lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true"); lb.setAttribute("aria-label", "Gallery image");
    var close = el("button", "lightbox__close"); close.type = "button"; close.setAttribute("aria-label", "Close"); close.textContent = "\u00D7";
    var img = document.createElement("img"); img.alt = "";
    lb.appendChild(close); lb.appendChild(img); document.body.appendChild(lb);
    function hide() { lb.classList.remove("is-open"); if (lastFocus) try { lastFocus.focus(); } catch (e) {} }
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target === close) hide(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("is-open")) return;
      if (e.key === "Escape") { hide(); return; }
      /* The close button is the only focusable control: keep Tab on it so
         focus cannot wander into the page underneath the modal. */
      if (e.key === "Tab") { e.preventDefault(); close.focus(); }
    });
    return lb;
  }
  /* Opens from the tile's <button>, so Enter/Space work as well as a click. */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".gallery .tile .tile__open"); if (!btn) return;
    var img = btn.querySelector("img"); if (!img) return;
    lastFocus = btn;
    var box = ensureLightbox(); var i = box.querySelector("img"); i.src = img.src; i.alt = img.alt || ""; box.classList.add("is-open");
    box.querySelector(".lightbox__close").focus();
  });

  /* ---------- Back to top ---------- */
  var toTop = el("button", "to-top"); toTop.setAttribute("aria-label", "Back to top");
  toTop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>';
  document.body.appendChild(toTop);
  toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); });
  window.addEventListener("scroll", function () { if (window.scrollY > 600) toTop.classList.add("is-vis"); else toTop.classList.remove("is-vis"); requestAnimationFrame(revealCheck); }, { passive: true });


  /* ---------- Manufacturer-supplied imagery gate ----------
     CSS already hides these when unapproved (and keeps them hidden with JS
     off). This additionally REMOVES the nodes so the browser never requests
     the files, and so nothing unapproved sits in the DOM for a reader, a
     screen reader, or "view source" to find.

     Tagging covers whole figures, one media column and one whole section, so
     removal never leaves an empty container or a heading with nothing under
     it. See docs/WINDOW-INSERTS-ASSETS.md. */
  (function manufacturerAssetGate() {
    if (CFG.WINDOW_INSERT_ASSETS_APPROVED === true) return;   // approved: leave everything in place
    var blocked = $$('[data-asset-source="manufacturer"]');
    if (!blocked.length) return;
    blocked.forEach(function (node) { if (node.parentNode) node.parentNode.removeChild(node); });
    if (window.console && console.info) {
      console.info("[Pellikal] " + blocked.length + " manufacturer-supplied image block(s) withheld: " +
                   "set WINDOW_INSERT_ASSETS_APPROVED to true in js/config.js once permission is documented.");
    }
  })();

  /* ---------- Footer year ---------- */
  var yr = $("#year"); if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- Contact form (Formspree) — never fakes success ---------- */
  /* "Get a Free Quote" controls carry data-quote-cta="header|hero|mobile_bar|cta_band". */
  document.addEventListener("click", function (e) {
    var cta = e.target.closest && e.target.closest("[data-quote-cta]");
    if (cta && window.PELLIKAL_TRACK_EVENT) window.PELLIKAL_TRACK_EVENT("quote_cta_click", { cta_location: cta.getAttribute("data-quote-cta") });
  });

  /* /contact/?service=window-inserts pre-selects the dropdown so a visitor
     arriving from the Window Inserts page doesn't have to hunt for it.

     Matched by SLUG, not by substring. The old substring match compared
     the first word only, so adding "Residential Window Film" to the list
     would have made ?service=window-inserts select it instead — both
     labels contain "window". Slugs make the match exact regardless of
     what is added to the dropdown or in what order.

     A build-time preselection (the landing pages) is overridden by an
     explicit ?service= in the URL, which is the more specific intent. */
  (function prefillService() {
    var sel = $("#service"); if (!sel) return;
    var q = (location.search.match(/[?&]service=([^&]+)/) || [])[1];
    if (!q) return;
    q = decodeURIComponent(q).toLowerCase().replace(/-/g, " ");
    if (!window.PELLIKAL_SERVICE_SLUG) return;
    var wanted = window.PELLIKAL_SERVICE_SLUG(q);
    if (!wanted || wanted === "not_sure") return;
    for (var i = 0; i < sel.options.length; i++) {
      if (window.PELLIKAL_SERVICE_SLUG(sel.options[i].text) === wanted) { sel.selectedIndex = i; break; }
    }
  })();

  var form = $("#quote-form");
  if (form) {
    var rawId = (CFG.FORMSPREE_ID || "").trim();
    var isPlaceholder = !rawId || rawId === "FORMSPREE_ID";
    var endpoint = isPlaceholder ? "" : (/formspree\.io/.test(rawId) ? rawId : ("https://formspree.io/f/" + rawId));
    if (endpoint) form.setAttribute("action", endpoint);

    var okMsg = form.querySelector('[data-msg="ok"]'), errMsg = form.querySelector('[data-msg="err"]');
    function fmsg(elm, text) { if (okMsg) okMsg.style.display = "none"; if (errMsg) errMsg.style.display = "none"; if (elm) { if (text != null) elm.textContent = text; elm.style.display = "block"; elm.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); } }

    if (isPlaceholder) console.warn("[Pellikal] Formspree is not configured. Set FORMSPREE_ID in js/config.js — until then the contact form will NOT send; visitors are asked to call/text/email.");

    /* ---------------------------------------------------------
       SUCCESS REDIRECT  →  /thankyou/
       Reached from exactly one place: inside the r.ok branch below,
       after Formspree has confirmed the submission. A validation
       failure, a network error, a Formspree rejection or a bot trip
       all return early and the visitor stays on this page with their
       typed details intact.

       The redirect waits for the measurement calls rather than racing
       them. PELLIKAL_TRACK_LEAD attaches GTM's eventCallback to the
       final event, so we leave as soon as the tags report done. The
       timer is the backstop for when the container is blocked and that
       callback never comes — the visitor still gets their confirmation.

       Nothing about the submission is put in the URL.
    --------------------------------------------------------- */
    var thanksUrl = form.getAttribute("data-success-url") || "/thankyou/";
    var redirected = false;

    /* CLICK-ID FORWARDING. Google Ads lands the visitor on ?gclid=… (or
       gbraid/wbraid on iOS). With ad_storage denied — the site's default —
       the Conversion Linker cannot write its cookie, and a JavaScript
       redirect is not decorated by Google's URL passthrough. So without
       this, the conversion tag on /thankyou/ would have no click ID to
       attribute the lead to, for every visitor who did not press Accept.
       These are Google's own click identifiers, already in the landing
       URL; nothing the visitor typed is carried. */
    function withClickIds(url) {
      var keep = ["gclid", "gbraid", "wbraid", "gclsrc"], out = [];
      var q = window.location.search.replace(/^\?/, "").split("&");
      for (var i = 0; i < q.length; i++) {
        var kv = q[i].split("="); if (kv.length !== 2) continue;
        if (keep.indexOf(kv[0]) > -1 && /^[A-Za-z0-9_.-]{1,200}$/.test(kv[1])) out.push(kv[0] + "=" + kv[1]);
      }
      return out.length ? url + (url.indexOf("?") > -1 ? "&" : "?") + out.join("&") : url;
    }

    function goToThanks() {
      if (redirected) return;
      redirected = true;
      window.location.assign(withClickIds(thanksUrl));
    }

    /* Back-button / bfcache: the page comes back with its JavaScript state
       intact, so a second, genuinely new submission must be allowed to
       redirect again. */
    window.addEventListener("pageshow", function (e) { if (e.persisted) { redirected = false; } });

    /* Funnel diagnostics (secondary, not conversions): the form coming into
       view, and the first keystroke. Each fires once per page. */
    (function funnel() {
      var loc = form.getAttribute("data-form-location") || "";
      var seen = false, started = false;
      function viewed() { if (seen) return; seen = true; if (window.PELLIKAL_TRACK_EVENT) window.PELLIKAL_TRACK_EVENT("quote_form_view", { form_location: loc }); }
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) { entries.forEach(function (en) { if (en.isIntersecting) { viewed(); io.disconnect(); } }); }, { threshold: 0.35 });
        io.observe(form);
      } else { viewed(); }
      form.addEventListener("input", function () {
        if (started) return; started = true;
        if (window.PELLIKAL_TRACK_EVENT) window.PELLIKAL_TRACK_EVENT("quote_form_start", { form_location: loc });
      });
    })();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var leadLocation = form.getAttribute("data-form-location") || "";
      if (form.querySelector('[name="_gotcha"]').value) { return; } // bot: drop silently
      $$("input[type=text], input[type=email], input[type=tel], textarea", form).forEach(function (f) { f.value = f.value.trim(); });
      if (!form.checkValidity()) {
        form.reportValidity();
        if (window.PELLIKAL_TRACK_EVENT) window.PELLIKAL_TRACK_EVENT("quote_form_error", { error_type: "validation", form_location: leadLocation });
        return;
      }
      /* Short form: phone OR email, not both. HTML5 can't express "one of",
         so it's done here, with a real message and aria-invalid on both
         fields — never a colour-only hint. */
      if (form.getAttribute("data-form-layout") === "short") {
        var phoneEl = form.querySelector('[name="phone"]'), emailEl = form.querySelector('[name="email"]');
        var hasPhone = phoneEl && phoneEl.value.trim().length >= 7, hasEmail = emailEl && emailEl.value.trim().length > 3;
        if (!hasPhone && !hasEmail) {
          if (phoneEl) phoneEl.setAttribute("aria-invalid", "true");
          if (emailEl) emailEl.setAttribute("aria-invalid", "true");
          fmsg(errMsg, "Please add a phone number or an email address so we can reach you.");
          if (phoneEl) phoneEl.focus();
          if (window.PELLIKAL_TRACK_EVENT) window.PELLIKAL_TRACK_EVENT("quote_form_error", { error_type: "contact_required", form_location: leadLocation });
          return;
        }
        if (phoneEl) phoneEl.removeAttribute("aria-invalid");
        if (emailEl) emailEl.removeAttribute("aria-invalid");
      }

      if (!endpoint) { // not configured — be honest, keep their message
        fmsg(errMsg, "The online form isn\u2019t connected yet \u2014 please call or text 516-336-9586, or email info@pellikal.com, and we\u2019ll get right back to you. (Your details were not sent.)");
        return;
      }

      /* Capture the service CATEGORY now — form.reset() runs on success and
         would clear it. This is a dropdown label, never free text or PII. */
      var svcEl = form.querySelector('[name="service"], [name="goal"]');
      var leadService = window.PELLIKAL_SERVICE_SLUG ? window.PELLIKAL_SERVICE_SLUG(svcEl ? svcEl.value : "") : "";
      var leadPageType = document.body.getAttribute("data-page-type") || "";
      var btn = form.querySelector('button[type="submit"]'), label = btn.textContent;
      if (btn.disabled) return;                       // a second click while sending
      btn.textContent = "Sending\u2026"; btn.disabled = true;
      fetch(endpoint, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (r) {
          if (r.ok) {
            form.reset(); fmsg(okMsg);
            /* CONVERSION — fires ONLY here, after Formspree returns a
               successful HTTP response. Clicking Submit is not enough,
               and a rejected or failed submission fires nothing.
               No personal data is passed; see js/tracking.js. */
            if (window.PELLIKAL_TRACK_LEAD) {
              /* Backstop: if GTM is blocked its eventCallback never fires,
                 so leave anyway shortly after. Whichever comes first wins;
                 goToThanks is guarded so it can only run once. */
              setTimeout(goToThanks, 1400);
              window.PELLIKAL_TRACK_LEAD((form.id === "home-form" || leadLocation === "homepage") ? "homepage_form" : "contact_form",
                                         leadService, leadPageType, leadLocation, goToThanks);
            } else {
              goToThanks();
            }
          } else return r.json().then(function (d) { throw new Error((d && d.errors && d.errors[0] && d.errors[0].message) || "send failed"); });
        })
        .catch(function (err) {
          fmsg(errMsg, "Sorry \u2014 something went wrong, so your message wasn\u2019t sent. Your details are still here; please try again or call/text 516-336-9586.");
          if (window.PELLIKAL_TRACK_EVENT) window.PELLIKAL_TRACK_EVENT("quote_form_error", { error_type: (err && err.message === "send failed") || (err && /rejected|error/i.test(err.message || "")) ? "provider" : "network", form_location: leadLocation });
        })
        .finally(function () { btn.textContent = label; btn.disabled = false; });
    });
  }

  /* ---------- Supabase PUBLIC reads ---------- */
  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && String(CFG.SUPABASE_URL).indexOf("http") === 0 && window.supabase);
  var SB = null;
  if (configured) { try { SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false } }); } catch (e) { configured = false; } }

  var PLACEHOLDERS = ["Solar film — Long Island home", "Storefront privacy — Queens", "Office solar control — Manhattan", "Security film — retail glass", "Frosted privacy — bathroom", "Low-E film — sunroom"];
  function galleryPlaceholders() {
    var g = $("#gallery"); if (!g) return; clear(g);
    PLACEHOLDERS.forEach(function (c) { var tile = el("div", "tile tile--ph"); var s = el("span"); s.appendChild(document.createTextNode(c)); s.appendChild(document.createElement("br")); s.appendChild(document.createTextNode("photo coming soon")); tile.appendChild(s); g.appendChild(tile); });
  }
  function loadGallery() {
    var g = $("#gallery"); if (!g) return;
    if (!configured) { galleryPlaceholders(); return; }
    SB.from(CFG.GALLERY_TABLE).select("*").eq("is_published", true).order("sort_order", { ascending: true }).order("created_at", { ascending: false }).limit(12)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) { galleryPlaceholders(); return; }
        clear(g);
        res.data.forEach(function (row) {
          var url = safeUrl(row.url); if (!url) return;
          var cap = (row.caption || row.category || "").toString();
          /* alt_text is the field the admin is REQUIRED to fill in — it is the
             first choice. Caption is the fallback. There is deliberately no
             invented fallback such as "Window film project by Pellikal": an
             alt that asserts ownership nobody verified is worse than none. */
          var alt = (row.alt_text || cap || "").toString();
          var tile = el("div", "tile");
          /* A real button, so keyboard users can open the same image the
             mouse can. The img inside is presentational to the button. */
          var open = el("button", "tile__open"); open.type = "button";
          open.setAttribute("aria-label", alt ? "View larger: " + alt : "View larger image");
          var img = document.createElement("img"); img.loading = "lazy"; img.decoding = "async"; img.src = url; img.alt = alt;
          open.appendChild(img); tile.appendChild(open);
          if (cap) tile.appendChild(el("div", "tile__cap", cap)); g.appendChild(tile);
        });
      }).catch(galleryPlaceholders);
  }
  function loadContent() {
    if (!configured || !$$("[data-content]").length) return;
    SB.from(CFG.CONTENT_TABLE).select("*").eq("is_published", true).then(function (res) {
      if (res.error || !res.data) return;
      var map = {}; res.data.forEach(function (r) { map[r.key] = r.value; });
      $$("[data-content]").forEach(function (e) { var k = e.getAttribute("data-content"); if (map[k] && String(map[k]).trim()) e.textContent = map[k]; });
    }).catch(function () {});
  }
  function loadTestimonials() {
    var wrap = $("#quotes"); if (!wrap) return;
    var reviewSection = wrap.closest("section");
    /* The section ships HIDDEN. It is revealed only once real, published
       testimonials come back from the CMS. An "our reviews area is empty"
       notice was public before; a visitor should never see that. */
    if (!configured) return;
    SB.from(CFG.TESTIMONIALS_TABLE).select("*").eq("is_published", true).order("sort_order", { ascending: true }).order("created_at", { ascending: false }).limit(6)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return;   // section stays hidden
        clear(wrap);
        if (reviewSection) reviewSection.hidden = false;           // real reviews: show it
        res.data.forEach(function (t) {
          var fig = el("figure", "quote");
          fig.appendChild(el("div", "quote__mark", "\u201C"));
          fig.appendChild(el("p", null, t.quote || ""));
          fig.appendChild(el("figcaption", "quote__by", "\u2014 " + (t.author || "")));
          wrap.appendChild(fig);
        });
      }).catch(function () {});   // keep static fallback
  }
  /* ---------- Projects (Supabase enhances the static cards) ---------- */
  function loadProjects() {
    var home = $("[data-projects-home]");
    if (!home || !configured) return;                       // keep static fallback
    /* The homepage shows AT MOST SIX featured projects.
       Every condition is applied server-side, in this order, so the six rows
       that come back are exactly the six that should render:
         is_published = true   — never show a hidden project
         featured     = true   — "Show on homepage" means what it says
         sort_order   asc      — the owner controls the running order
         limit 6               — the homepage design holds six

       Filtering `featured` in JavaScript AFTER a limit(6) — which is what this
       used to do — silently breaks: the database returns the first six
       published rows, JS discards the unfeatured ones, and a featured seventh
       project can never take the free slot. */
    SB.from(CFG.PROJECTS_TABLE || "projects")
      .select("*")
      .eq("is_published", true)
      .eq("featured", true)
      .order("sort_order", { ascending: true })
      .limit(6)
      .then(function (res) {
        /* Static six-card HTML stays put unless the query returns usable rows. */
        if (res.error || !res.data || !res.data.length) return;   // keep static fallback
        clear(home);
        res.data.forEach(function (p) {
          var art = el("article", "proj");
          var media = el("div", "proj__media");
          var url = safeUrl(p.image_url);
          if (url) { var im = document.createElement("img"); im.src = url; im.loading = "lazy"; im.decoding = "async"; im.alt = p.alt_text || p.title || ""; media.appendChild(im); }
          art.appendChild(media);
          var body = el("div", "proj__body");
          body.appendChild(el("h3", null, p.title || "Project"));
          var meta = [p.location, p.service].filter(Boolean).join(" \u00B7 ");
          if (meta) body.appendChild(el("p", "proj__meta", meta));
          if (p.description) body.appendChild(el("p", "proj__l", p.description));
          if (p.challenge) body.appendChild(el("p", "proj__l", "Challenge: " + p.challenge));
          if (p.result) body.appendChild(el("p", "proj__l", "Result: " + p.result));
          art.appendChild(body); home.appendChild(art);
        });
        var note = document.querySelector("[data-ph-note]"); if (note) note.remove();
      }).catch(function () {});                              // keep static fallback
  }

  loadGallery(); loadContent(); loadTestimonials(); loadProjects();
})();
