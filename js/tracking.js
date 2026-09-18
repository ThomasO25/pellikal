/* =============================================================
   PELLIKAL — tracking.js
   The website's dataLayer EVENT LAYER. Not the GTM loader.

   WHAT THIS FILE DOES
   - Pushes a small, consistent set of events to window.dataLayer:
     view_contact_page, click_to_call/text/email, contact_form_submit,
     homepage_form_submit, generate_lead, window_insert_lead, plus the
     funnel diagnostics quote_cta_click / quote_form_view /
     quote_form_start / quote_form_error.

   WHAT THIS FILE DOES NOT DO
   - It does not load Google Tag Manager. The container (ID from
     site.config.json) and the Consent Mode v2 defaults are generated
     inline into each page's <head> by tools/build.py, defaults first.
     There is intentionally no GTM <noscript> iframe.
   - It contains no GA4 ID, Google Ads ID or conversion label. Those are
     configured inside the live GTM container.
   - It never sends personally identifiable information. No names,
     emails, phone numbers, addresses or message text are ever pushed
     to the dataLayer.
   See docs/MARKETING-TRACKING.md, docs/LEAD-FLOW.md, docs/CONSENT-MODE.md.
   ============================================================= */
(function () {
  "use strict";

  /* The GTM container itself is installed inline in the <head> of every
     public page (Google's official snippet, stamped in by tools/build.py
     from site.config.json). This file only supplies the event layer.
     dataLayer is initialised defensively in case this script somehow runs
     first, or GTM is blocked by an ad blocker. */
  window.dataLayer = window.dataLayer || [];

  /* ---------------------------------------------------------
     EVENT HELPER
     Every event goes through here. Params are whitelisted at the
     call site — nothing is read from form fields.
  --------------------------------------------------------- */
  function push(eventName, params) {
    try {
      var payload = { event: eventName };
      if (params) for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) payload[k] = params[k];
      window.dataLayer.push(payload);
    } catch (e) { /* tracking must never break the page */ }
  }
  window.PELLIKAL_TRACK = push;

  /* ---------------------------------------------------------
     CLICK LOCATION
     A non-sensitive label describing WHERE on the page a contact
     link was clicked. Derived from the surrounding markup.
  --------------------------------------------------------- */
  function isContactPage() {
    var p = location.pathname.toLowerCase();
    return /\/contact\/?$/.test(p) || /\/contact\/index\.html$/.test(p) || /\/contact\.html$/.test(p);
  }

  function clickLocation(node) {
    if (node.closest(".site-header")) return "header";
    if (node.closest(".mobile-bar")) return "mobile_bar";
    if (node.closest(".footer")) return "footer";
    if (node.closest(".cta-band")) return "final_cta";
    if (node.closest(".hero")) return "hero";
    if (node.closest(".page-hero")) return "page_hero";
    if (node.closest(".callbox") || node.closest(".form")) return "contact_page";
    var p = location.pathname;
    if (isContactPage()) return "contact_page";
    return "body";
  }

  /* ---------------------------------------------------------
     CLICK-TO-CALL / TEXT / EMAIL
     Delegated listener. It only reports the click — it never calls
     preventDefault, so the phone dialer, SMS app and mail client all
     behave exactly as before.

     The destination number/address is deliberately NOT included:
     it is the business's own contact detail, and keeping the payload
     minimal avoids any chance of leaking user data.
  --------------------------------------------------------- */
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="tel:"], a[href^="sms:"], a[href^="mailto:"]') : null;
    if (!a) return;
    var href = (a.getAttribute("href") || "").toLowerCase();
    var evt = href.indexOf("tel:") === 0 ? "click_to_call"
            : href.indexOf("sms:") === 0 ? "click_to_text"
            : "click_to_email";
    push(evt, { click_location: clickLocation(a) });
  }, true); // capture phase: fires even if another handler stops propagation

  /* ---------------------------------------------------------
     CONTACT PAGE VIEW
     Signals intent, NOT a lead. Never configure this as a Google Ads
     conversion. The Primary Ads lead conversion is generate_lead (GTM Custom Event).
  --------------------------------------------------------- */
  function markContactView() {
    if (isContactPage()) push("view_contact_page");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", markContactView);
  else markContactView();

  /* ---------------------------------------------------------
     FORM CONVERSIONS
     Fired by js/main.js ONLY after Formspree returns a successful
     HTTP response. A click on Submit is not a conversion, and a
     failed or rejected submission never fires anything.

     lead_source values: "homepage_form" | "contact_form"
  --------------------------------------------------------- */
  /* ---------------------------------------------------------
     FUNNEL DIAGNOSTICS — secondary events, never conversions.
       quote_cta_click   a "Get a Free Quote" control was used
                         (cta_location: header | hero | mobile_bar | cta_band)
       quote_form_view   a quote form scrolled into view (once per page)
       quote_form_start  a visitor began filling a quote form (once per page)
       quote_form_error  a submission was blocked or failed
                         (error_type: validation | contact_required | phone_invalid | provider | network)
     Only the allow-listed parameters below are ever forwarded, so nothing
     typed into a form can leak into analytics by accident. Together with
     generate_lead these let GTM show where paid visitors drop off:
     100 clicks -> 28 quote_cta_click -> 16 quote_form_start -> N leads.
  --------------------------------------------------------- */
  var SAFE_PARAMS = { cta_location: 1, form_location: 1, error_type: 1, page_type: 1 };
  window.PELLIKAL_TRACK_EVENT = function (name, params) {
    var clean = {};
    for (var k in (params || {})) {
      if (SAFE_PARAMS[k] && typeof params[k] === "string" && params[k].length <= 40) clean[k] = params[k];
    }
    push(name, clean);
  };

  /* leadSource:   "homepage_form" | "contact_form"
     service:      a short CATEGORY chosen from the form's dropdown — e.g.
                   "window_inserts", "residential_film", "privacy". It is never
                   free text and never identifies the customer.
     pageType:     which page the form was on, e.g. "window_insert_landing".
     formLocation: NEW — which of the three embedded forms was used:
                   "contact" | "residential" | "window_inserts". A fixed
                   vocabulary, set at build time, never typed by a visitor.
     onComplete:   optional. Called once GTM reports it has finished handling
                   the final event, or after eventTimeout, whichever comes
                   first. Used by js/main.js to hold the redirect to
                   /thankyou/ until the measurement calls have gone out.

     NOTE FOR THE ADS SPECIALIST: the site fires dataLayer events only. The
     single Google Ads lead conversion is a GTM tag triggered by the Custom
     Event generate_lead — which exists only after Formspree has returned a
     2xx. The /thankyou/ page is the visitor's confirmation, not a second
     conversion. The eventCallback below holds the redirect until that tag
     has fired. */
  window.PELLIKAL_TRACK_LEAD = function (leadSource, service, pageType, formLocation, onComplete) {
    var src = leadSource === "homepage_form" ? "homepage_form" : "contact_form";
    var params = { lead_source: src };
    if (service) params.service = service;
    if (pageType) params.page_type = pageType;
    if (formLocation) params.form_location = formLocation;

    /* Built as a list so the completion callback can be attached to
       whichever push turns out to be last. */
    var queue = [[src === "homepage_form" ? "homepage_form_submit" : "contact_form_submit", null],
                 ["generate_lead", params]];
    /* Additional event so Window Inserts leads can be segmented from general
       film leads in GA4 reporting, and used as a Secondary Ads signal if the
       specialist wants one. It is NOT another Primary lead conversion — the
       single Primary is generate_lead. Existing triggers on
       generate_lead keep working unchanged. */
    if (service === "window_inserts") queue.push(["window_insert_lead", { lead_source: src }]);

    for (var i = 0; i < queue.length; i++) {
      var name = queue[i][0];
      var payload = queue[i][1];
      if (i === queue.length - 1 && typeof onComplete === "function") {
        payload = payload ? JSON.parse(JSON.stringify(payload)) : {};
        /* GTM calls eventCallback once every tag for this event has run.
           eventTimeout caps the wait. Neither key is sent on to GA4.
           js/main.js keeps its own timer too, because eventCallback never
           fires at all if the container is blocked. */
        payload.eventCallback = onComplete;
        payload.eventTimeout = 1200;
      }
      push(name, payload);
    }
  };

  /* Turn the dropdown's human label into a safe, stable category slug.
     ORDER MATTERS. "insert" is tested first because "Window Inserts /
     Noise Reduction" and "Residential Window Film" both contain "window";
     testing inserts first keeps the existing window_inserts slug intact. */
  window.PELLIKAL_SERVICE_SLUG = function (label) {
    label = String(label || "").toLowerCase();
    if (label.indexOf("insert") > -1) return "window_inserts";
    if (label.indexOf("commercial") > -1) return "commercial_film";
    if (label.indexOf("residential") > -1) return "residential_film";
    if (label.indexOf("solar") > -1 || label.indexOf("heat") > -1) return "solar_heat_glare";
    if (label.indexOf("privacy") > -1) return "privacy";
    if (label.indexOf("security") > -1) return "security_safety";
    if (label.indexOf("graffiti") > -1) return "anti_graffiti";
    if (label.indexOf("low-e") > -1 || label.indexOf("energy") > -1) return "low_e_energy";
    if (label) return "not_sure";
    return "";
  };
})();
