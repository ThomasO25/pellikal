/* =============================================================
   PELLIKAL — tracking.js
   The website's dataLayer EVENT LAYER. Not the GTM loader.

   WHAT THIS FILE DOES
   - Pushes a small, consistent set of events to window.dataLayer:
     view_contact_page, click_to_call/text/email, contact_form_submit,
     homepage_form_submit, generate_lead, window_insert_lead.

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
     conversion. The Primary Ads lead conversion is the /thankyou/ page view.
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

     NOTE FOR THE ADS SPECIALIST: none of these is a Google Ads conversion.
     The site fires dataLayer events only. The single Ads lead conversion is
     the /thankyou/ page view, configured inside GTM. */
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
       single Primary is the /thankyou/ page view. Existing triggers on
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
