/* =============================================================
   PELLIKAL — main.js  (runs on every public page)
   Nav, loader, scroll reveals, FAQ, tint before/after slider,
   animated stat counters, gallery lightbox, back-to-top,
   Formspree contact, and Supabase public reads (gallery,
   testimonials, editable site text).
   ============================================================= */
(function () {
  "use strict";
  var CFG = window.PELLIKAL_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Loader ---------- */
  window.addEventListener("load", function () { setTimeout(function () { document.body.classList.add("loaded"); }, 2600); });
  setTimeout(function () { document.body.classList.add("loaded"); }, 5000);

  /* ---------- Mobile nav ---------- */
  var menu = $("#navMenu"), toggle = $("#navToggle");
  if (toggle) toggle.addEventListener("click", function () {
    var open = menu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

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
  function animateCount(el) {
    var raw = el.getAttribute("data-count-text") || el.textContent;
    el.setAttribute("data-count-text", raw);
    var m = raw.match(/^(\d+)(.*)$/); if (!m) return;
    var target = parseInt(m[1], 10), suffix = m[2] || "", dur = 1100, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1), val = Math.round((0.1 + 0.9 * p) * p * target / (0.1 + 0.9)); // ease
      val = Math.round(target * (p * (2 - p))); // easeOutQuad
      el.textContent = val + suffix;
      if (p < 1) requestAnimationFrame(step); else el.textContent = target + suffix;
    }
    requestAnimationFrame(step);
  }

  /* ---------- Scroll reveals (+ trigger counters) ---------- */
  var io = null;
  function revealCheck() {
    if (!("IntersectionObserver" in window)) {
      $$("[data-reveal]").forEach(function (el) { el.classList.add("is-in"); });
      $$(".stat__n").forEach(animateCount); return;
    }
    if (!io) io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          if (en.target.classList.contains("stat")) { var n = $(".stat__n", en.target); if (n && !n.__done) { n.__done = true; animateCount(n); } }
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
    $$("[data-reveal]:not(.is-in), .stat").forEach(function (el) { io.observe(el); });
  }
  revealCheck();

  /* ---------- Gallery lightbox ---------- */
  var lb = null;
  function ensureLightbox() {
    if (lb) return lb;
    lb = document.createElement("div"); lb.className = "lightbox"; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true");
    lb.innerHTML = '<button class="lightbox__close" aria-label="Close">&times;</button><img alt="">';
    document.body.appendChild(lb);
    function close() { lb.classList.remove("is-open"); }
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target.classList.contains("lightbox__close")) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    return lb;
  }
  document.addEventListener("click", function (e) {
    var img = e.target.closest(".gallery .tile img");
    if (!img) return;
    var box = ensureLightbox(); box.querySelector("img").src = img.src; box.querySelector("img").alt = img.alt || ""; box.classList.add("is-open");
  });

  /* ---------- Back to top ---------- */
  var toTop = document.createElement("button");
  toTop.className = "to-top"; toTop.setAttribute("aria-label", "Back to top");
  toTop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
  document.body.appendChild(toTop);
  toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  window.addEventListener("scroll", function () {
    if (window.scrollY > 600) toTop.classList.add("is-vis"); else toTop.classList.remove("is-vis");
    requestAnimationFrame(revealCheck);
  }, { passive: true });

  /* ---------- Footer year ---------- */
  var yr = $("#year"); if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- Formspree ---------- */
  var form = $("#quote-form");
  if (form) {
    if (CFG.FORMSPREE_ID && form.getAttribute("action").indexOf("FORMSPREE_ID") !== -1)
      form.setAttribute("action", "https://formspree.io/f/" + CFG.FORMSPREE_ID);
    var okMsg = form.querySelector('[data-msg="ok"]'), errMsg = form.querySelector('[data-msg="err"]');
    function fmsg(el) { if (okMsg) okMsg.style.display = "none"; if (errMsg) errMsg.style.display = "none"; if (el) el.style.display = "block"; }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (form.querySelector('[name="_gotcha"]').value) { fmsg(okMsg); form.reset(); return; }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var demo = form.getAttribute("action").indexOf("FORMSPREE_ID") !== -1;
      if (demo) { fmsg(okMsg); form.reset(); okMsg.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      var btn = form.querySelector('button[type="submit"]'), label = btn.textContent; btn.textContent = "Sending…"; btn.disabled = true;
      fetch(form.getAttribute("action"), { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (r) { if (r.ok) { fmsg(okMsg); form.reset(); } else { fmsg(errMsg); } })
        .catch(function () { fmsg(errMsg); })
        .finally(function () { btn.textContent = label; btn.disabled = false; okMsg && okMsg.scrollIntoView({ behavior: "smooth", block: "center" }); });
    });
  }

  /* ---------- Supabase public reads (gallery, testimonials, text) ---------- */
  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
  var SB = null;
  if (configured) { try { SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false } }); } catch (e) { configured = false; } }

  var PLACEHOLDERS = ["Solar film — Long Island home", "Storefront privacy — Queens", "Office solar control — Manhattan", "Security film — retail glass", "Frosted privacy — bathroom", "Low-E film — sunroom"];
  function galleryPlaceholders() {
    var g = $("#gallery"); if (!g) return;
    g.innerHTML = PLACEHOLDERS.map(function (c) { return '<div class="tile tile--ph"><span>' + c + '<br>photo coming soon</span></div>'; }).join("");
  }
  function loadGallery() {
    var g = $("#gallery"); if (!g) return;
    if (!configured) { galleryPlaceholders(); return; }
    SB.from(CFG.GALLERY_TABLE).select("*").order("created_at", { ascending: false }).limit(12)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) { galleryPlaceholders(); return; }
        g.innerHTML = res.data.map(function (row) {
          var cap = (row.caption || row.category || "").replace(/</g, "&lt;");
          return '<div class="tile"><img loading="lazy" src="' + row.url + '" alt="' + cap + '">' + (cap ? '<div class="tile__cap">' + cap + '</div>' : '') + '</div>';
        }).join("");
      }).catch(galleryPlaceholders);
  }
  function loadContent() {
    if (!configured || !$$("[data-content]").length) return;
    SB.from(CFG.CONTENT_TABLE).select("*").then(function (res) {
      if (res.error || !res.data) return;
      var map = {}; res.data.forEach(function (r) { map[r.key] = r.value; });
      $$("[data-content]").forEach(function (el) { var k = el.getAttribute("data-content"); if (map[k] && String(map[k]).trim()) el.textContent = map[k]; });
    }).catch(function () {});
  }
  function loadTestimonials() {
    var wrap = $("#quotes"); if (!wrap) return;
    function empty() { wrap.innerHTML = '<p class="note-inline" style="grid-column:1/-1;text-align:center">Customer testimonials will appear here.</p>'; }
    if (!configured) { empty(); return; }
    SB.from(CFG.TESTIMONIALS_TABLE).select("*").order("created_at", { ascending: false }).limit(6)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) { empty(); return; }
        wrap.innerHTML = res.data.map(function (t) {
          var q = (t.quote || "").replace(/</g, "&lt;"), a = (t.author || "").replace(/</g, "&lt;");
          return '<figure class="quote"><div class="quote__mark">&ldquo;</div><p>' + q + '</p><figcaption class="quote__by">— ' + a + '</figcaption></figure>';
        }).join("");
      }).catch(empty);
  }
  loadGallery(); loadContent(); loadTestimonials();
})();
