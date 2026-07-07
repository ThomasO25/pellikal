/* =====================================================================
   Pellikal Window Enhancements — main.js  (vanilla, no dependencies)
   Handles: mobile nav, FAQ accordion, before/after slider,
   scroll reveals, graceful image fallback, Formspree AJAX submit,
   and conversion-tracking placeholders.
   ===================================================================== */
(function () {
  "use strict";
  var doc = document;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -------------------------------------------------
     1) Mobile navigation toggle
  ------------------------------------------------- */
  (function nav() {
    var toggle = doc.querySelector(".nav__toggle");
    var menu = doc.getElementById("nav-menu");
    if (!toggle || !menu) return;
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    // close menu when a link is tapped (single-page anchors / navigation)
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  })();

  /* -------------------------------------------------
     2) Graceful image fallback
     Any <img data-file="..."> that fails to load flips its
     wrapper (.media) into a labeled placeholder so the layout
     never shows a broken-image icon before real photos are added.
  ------------------------------------------------- */
  (function mediaFallback() {
    var imgs = doc.querySelectorAll(".media img[data-file]");
    imgs.forEach(function (img) {
      function fail() {
        var wrap = img.closest(".media");
        if (wrap) {
          wrap.classList.add("media--fallback");
          wrap.setAttribute("data-file", img.getAttribute("data-file"));
        }
      }
      img.addEventListener("error", fail);
      // Handle images that errored before JS ran, or have no src yet.
      if (!img.getAttribute("src") || (img.complete && img.naturalWidth === 0)) fail();
    });
  })();

  /* -------------------------------------------------
     3) FAQ accordion (accessible, animated height)
  ------------------------------------------------- */
  (function faq() {
    var items = doc.querySelectorAll(".faq__item");
    items.forEach(function (item) {
      var btn = item.querySelector(".faq__q");
      var panel = item.querySelector(".faq__a");
      if (!btn || !panel) return;
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!open));
        if (open) {
          panel.style.height = panel.scrollHeight + "px";
          requestAnimationFrame(function () { panel.style.height = "0px"; });
        } else {
          panel.style.height = panel.scrollHeight + "px";
          panel.addEventListener("transitionend", function te() {
            panel.style.height = "auto";
            panel.removeEventListener("transitionend", te);
          });
        }
      });
    });
  })();

  /* -------------------------------------------------
     4) Before / After comparison slider
     Driven by a range input (keyboard-accessible) with pointer
     drag support; syncs the clip width and handle position.
  ------------------------------------------------- */
  (function beforeAfter() {
    var widgets = doc.querySelectorAll("[data-ba]");
    widgets.forEach(function (ba) {
      var range = ba.querySelector(".ba__range");
      var clip = ba.querySelector(".ba__clip");
      var handle = ba.querySelector(".ba__handle");
      if (!range || !clip || !handle) return;

      var before = ba.querySelector(".ba__layer--before");
      function sizeBefore() { if (before) before.style.width = ba.offsetWidth + "px"; }
      sizeBefore();
      window.addEventListener("resize", sizeBefore);

      function apply(v) {
        v = Math.max(0, Math.min(100, v));
        clip.style.width = v + "%";
        handle.style.left = v + "%";
      }
      apply(parseFloat(range.value) || 50);
      range.addEventListener("input", function () { apply(parseFloat(range.value)); });

      // Pointer drag anywhere on the widget
      var dragging = false;
      function fromEvent(e) {
        var rect = ba.getBoundingClientRect();
        var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        var pct = (x / rect.width) * 100;
        range.value = pct;
        apply(pct);
      }
      ba.addEventListener("pointerdown", function (e) { dragging = true; fromEvent(e); });
      window.addEventListener("pointermove", function (e) { if (dragging) fromEvent(e); });
      window.addEventListener("pointerup", function () { dragging = false; });
    });
  })();

  /* -------------------------------------------------
     5) Scroll reveals (skipped if reduced motion)
  ------------------------------------------------- */
  (function reveals() {
    var els = doc.querySelectorAll("[data-reveal]");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* -------------------------------------------------
     6) Conversion tracking placeholders
     Fire your Google Ads / GA4 events here. IDs are added in the
     <head> snippet of each HTML page. These stubs are safe no-ops
     until you drop your real IDs in.
  ------------------------------------------------- */
  function trackConversion(label) {
    // ---- GOOGLE ADS: replace AW-CONVERSION_ID / label below ----
    // if (typeof gtag === "function") {
    //   gtag("event", "conversion", { send_to: "AW-CONVERSION_ID/CONVERSION_LABEL" });
    // }
    // ---- GA4 custom event (optional) ----
    if (typeof gtag === "function") {
      try { gtag("event", label || "generate_lead"); } catch (e) {}
    }
    // ---- GTM dataLayer (optional) ----
    if (window.dataLayer) {
      window.dataLayer.push({ event: label || "generate_lead" });
    }
  }
  // Count click-to-call / click-to-text as conversions.
  doc.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
    a.addEventListener("click", function () { trackConversion("click_to_call"); });
  });
  doc.querySelectorAll('a[href^="sms:"]').forEach(function (a) {
    a.addEventListener("click", function () { trackConversion("click_to_text"); });
  });

  /* -------------------------------------------------
     7) Quote form — Formspree AJAX submit
     No backend needed. Submits JSON to Formspree, shows an inline
     success / error message, and fires a lead conversion.
     >>> Replace FORMSPREE_ID in the form's action attribute <<<
     (A Formspree form ID is meant to be public — it is NOT a secret key.)
  ------------------------------------------------- */
  (function quoteForm() {
    var form = doc.getElementById("quote-form");
    if (!form) return;
    var okMsg = form.querySelector('[data-msg="ok"]');
    var errMsg = form.querySelector('[data-msg="err"]');
    var submitBtn = form.querySelector('[type="submit"]');

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      // Honeypot: if filled, silently pretend success (bot).
      var hp = form.querySelector('input[name="_gotcha"]');
      if (hp && hp.value) { show(okMsg, errMsg); form.reset(); return; }

      if (!form.checkValidity()) { form.reportValidity(); return; }

      var action = form.getAttribute("action") || "";
      var isPlaceholder = action.indexOf("FORMSPREE_ID") !== -1 || action.indexOf("your-form-id") !== -1;

      if (isPlaceholder) {
        // Demo mode until a real endpoint is connected.
        show(okMsg, errMsg);
        trackConversion("generate_lead");
        form.reset();
        console.warn("Quote form: replace FORMSPREE_ID in the form action with your Formspree endpoint.");
        return;
      }

      var data = new FormData(form);
      if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.label = submitBtn.textContent; submitBtn.textContent = "Sending…"; }

      fetch(action, { method: "POST", body: data, headers: { Accept: "application/json" } })
        .then(function (res) {
          if (res.ok) {
            show(okMsg, errMsg);
            trackConversion("generate_lead");
            form.reset();
          } else {
            res.json().then(function () { show(errMsg, okMsg); }).catch(function () { show(errMsg, okMsg); });
          }
        })
        .catch(function () { show(errMsg, okMsg); })
        .finally(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.label || "Request My Quote"; }
        });
    });

    function show(on, off) {
      if (off) off.style.display = "none";
      if (on) { on.style.display = "block"; on.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); }
    }
  })();

  /* -------------------------------------------------
     8) Footer year
  ------------------------------------------------- */
  var y = doc.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
