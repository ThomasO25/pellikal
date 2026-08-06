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
    var close = el("button", "lightbox__close"); close.setAttribute("aria-label", "Close"); close.textContent = "\u00D7";
    var img = document.createElement("img"); img.alt = "";
    lb.appendChild(close); lb.appendChild(img); document.body.appendChild(lb);
    function hide() { lb.classList.remove("is-open"); if (lastFocus) try { lastFocus.focus(); } catch (e) {} }
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target === close) hide(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && lb.classList.contains("is-open")) hide(); });
    return lb;
  }
  document.addEventListener("click", function (e) {
    var img = e.target.closest(".gallery .tile img"); if (!img) return;
    lastFocus = document.activeElement;
    var box = ensureLightbox(); var i = box.querySelector("img"); i.src = img.src; i.alt = img.alt || ""; box.classList.add("is-open");
    box.querySelector(".lightbox__close").focus();
  });

  /* ---------- Back to top ---------- */
  var toTop = el("button", "to-top"); toTop.setAttribute("aria-label", "Back to top");
  toTop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>';
  document.body.appendChild(toTop);
  toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); });
  window.addEventListener("scroll", function () { if (window.scrollY > 600) toTop.classList.add("is-vis"); else toTop.classList.remove("is-vis"); requestAnimationFrame(revealCheck); }, { passive: true });

  /* ---------- Footer year ---------- */
  var yr = $("#year"); if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- Contact form (Formspree) — never fakes success ---------- */
  var form = $("#quote-form");
  if (form) {
    var rawId = (CFG.FORMSPREE_ID || "").trim();
    var isPlaceholder = !rawId || rawId === "maewnodj";
    var endpoint = isPlaceholder ? "" : (/formspree\.io/.test(rawId) ? rawId : ("https://formspree.io/f/" + rawId));
    if (endpoint) form.setAttribute("action", endpoint);

    var okMsg = form.querySelector('[data-msg="ok"]'), errMsg = form.querySelector('[data-msg="err"]');
    function fmsg(elm, text) { if (okMsg) okMsg.style.display = "none"; if (errMsg) errMsg.style.display = "none"; if (elm) { if (text != null) elm.textContent = text; elm.style.display = "block"; elm.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); } }

    if (isPlaceholder) console.warn("[Pellikal] Formspree is not configured. Set FORMSPREE_ID in js/config.js — until then the contact form will NOT send; visitors are asked to call/text/email.");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (form.querySelector('[name="_gotcha"]').value) { return; } // bot: drop silently
      $$("input[type=text], input[type=email], input[type=tel], textarea", form).forEach(function (f) { f.value = f.value.trim(); });
      if (!form.checkValidity()) { form.reportValidity(); return; }

      if (!endpoint) { // not configured — be honest, keep their message
        fmsg(errMsg, "The online form isn\u2019t connected yet \u2014 please call or text 516-336-9586, or email info@pellikal.com, and we\u2019ll get right back to you. (Your details were not sent.)");
        return;
      }

      var btn = form.querySelector('button[type="submit"]'), label = btn.textContent;
      btn.textContent = "Sending\u2026"; btn.disabled = true;
      fetch(endpoint, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (r) { if (r.ok) { form.reset(); fmsg(okMsg); } else return r.json().then(function (d) { throw new Error((d && d.errors && d.errors[0] && d.errors[0].message) || "send failed"); }); })
        .catch(function () { fmsg(errMsg, "Sorry \u2014 something went wrong, so your message wasn\u2019t sent. Your details are still here; please try again or call/text 516-336-9586."); })
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
    SB.from(CFG.GALLERY_TABLE).select("*").order("created_at", { ascending: false }).limit(12)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) { galleryPlaceholders(); return; }
        clear(g);
        res.data.forEach(function (row) {
          var url = safeUrl(row.url); if (!url) return;
          var cap = (row.caption || row.category || "").toString();
          var tile = el("div", "tile");
          var img = document.createElement("img"); img.loading = "lazy"; img.src = url; img.alt = cap || "Window film project by Pellikal";
          tile.appendChild(img); if (cap) tile.appendChild(el("div", "tile__cap", cap)); g.appendChild(tile);
        });
      }).catch(galleryPlaceholders);
  }
  function loadContent() {
    if (!configured || !$$("[data-content]").length) return;
    SB.from(CFG.CONTENT_TABLE).select("*").then(function (res) {
      if (res.error || !res.data) return;
      var map = {}; res.data.forEach(function (r) { map[r.key] = r.value; });
      $$("[data-content]").forEach(function (e) { var k = e.getAttribute("data-content"); if (map[k] && String(map[k]).trim()) e.textContent = map[k]; });
    }).catch(function () {});
  }
  function loadTestimonials() {
    var wrap = $("#quotes"); if (!wrap) return;
    function empty() { clear(wrap); var p = el("p", "note-inline", "Customer testimonials will appear here."); p.style.gridColumn = "1/-1"; p.style.textAlign = "center"; wrap.appendChild(p); }
    if (!configured) { empty(); return; }
    SB.from(CFG.TESTIMONIALS_TABLE).select("*").order("created_at", { ascending: false }).limit(6)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) { empty(); return; }
        clear(wrap);
        res.data.forEach(function (t) {
          var fig = el("figure", "quote");
          fig.appendChild(el("div", "quote__mark", "\u201C"));
          fig.appendChild(el("p", null, t.quote || ""));
          fig.appendChild(el("figcaption", "quote__by", "\u2014 " + (t.author || "")));
          wrap.appendChild(fig);
        });
      }).catch(empty);
  }
  loadGallery(); loadContent(); loadTestimonials();
})();
