# CONVERSION-DEBUG.md

How to prove the lead funnel in GTM Preview / Tag Assistant, and what you
should see. **17 September 2026.**

## The mechanism (verified in code — `js/main.js`)

1. The visitor submits a quote form. `submit` is intercepted; the form is
   **never** posted the normal way while JavaScript is running.
2. Honeypot check → HTML5 validation (`checkValidity`) → short-form rule
   (phone **or** email). Any failure: stays on the page, `quote_form_error`
   fires, **nothing else does.**
3. `fetch(POST)` to the Formspree endpoint (`FORMSPREE_ID` in `js/config.js`)
   with `Accept: application/json`. The button is disabled for the duration;
   a second click returns immediately.
4. **Only if the HTTP response is `ok` (2xx):** `contact_form_submit` (or
   `homepage_form_submit`) → `generate_lead` → `window_insert_lead` when the
   service is inserts. GTM's `eventCallback` is attached to the last event.
5. Navigate to `/thankyou/`, carrying any `gclid`/`gbraid`/`wbraid`/`gclsrc`
   from the landing URL. The redirect fires when GTM reports the tags done,
   or after 1.4 s if GTM never answers (blocked). It is guarded to run once.
6. A non-2xx response or a network failure: error message, details kept,
   `quote_form_error` with `error_type` provider/network, **no lead event, no
   redirect.**

## The 12-step check

1. Tag Assistant → **Connect** to the site → open `/residential/?gclid=test123`
   (a fake click ID stands in for a real ad click).
2. Choose **Reject Non-Essential** on the banner — the worst case for
   measurement is the one to test.
3. Click **Get a Free Quote** in the hero → `quote_cta_click`.
4. Type a first name → `quote_form_view` (fired as the form scrolled in) and
   `quote_form_start`.
5. Submit with no phone and no email → `quote_form_error`
   (`error_type: contact_required`). **Confirm `generate_lead` did NOT fire.**
6. Add a phone number → submit.
7. Network tab: one `POST formspree.io/f/…` with status **200**.
8. Tag Assistant: `contact_form_submit` then **exactly one `generate_lead`**.
9. The browser lands on `/thankyou/?gclid=test123`. The `Google Ads
   Conversion - Form Fill` tag fires on that page view.
10. Open `generate_lead` in Tag Assistant: parameters are `lead_source`,
    `service`, `form_location` only — no name, phone, email, town.
11. Refresh `/thankyou/`, press Back, press Forward: `generate_lead` count
    stays at **1**. (The thank-you **page view** repeats — which is why the
    Ads conversion is **Count: One** and the GA4 key event must be
    `generate_lead`, not the page view.)
12. In the email inbox: one Formspree message with `form_variant`,
    `service`, `property_type` filled in.

## Expected dataLayer sequence

Recorded from a real run (Chromium, Formspree stubbed with a 200) on
17 Sep 2026 — compare Tag Assistant's Summary against this, top to bottom:

```
 0. gtag(consent, default, {ad_storage:denied, analytics_storage:denied,
                            ad_user_data:denied, ad_personalization:denied,
                            functionality_storage:granted, security_storage:granted})
 1. gtag(set, ads_data_redaction, true)
 2. GTM bootstrap {gtm.start, event:'gtm.js'}          ← container loads AFTER the defaults
 3. gtag(consent, update, {all four: denied})          ← visitor chose Reject
 4. gtag(set, ads_data_redaction, true)
 5. event: consent_update {consent_choice:reject, consent_analytics:denied, consent_advertising:denied}
 6. event: quote_cta_click {cta_location:hero}
 7. event: quote_form_view {form_location:residential}
 8. event: quote_form_start {form_location:residential}
 9. event: quote_form_error {error_type:contact_required, form_location:residential}
10. event: contact_form_submit {}
11. event: generate_lead {lead_source:contact_form, service:residential_film, form_location:residential}
    → navigation to /thankyou/?gclid=…
12. gtag(consent, default, {…denied…})                 ← new page, same defaults
13. gtag(set, ads_data_redaction, true)
14. GTM bootstrap {gtm.start, event:'gtm.js'}          ← Ads Form Fill tag fires on this page view
```

If `generate_lead` appears before a 200 from Formspree, or appears twice,
or appears after an error — that is a bug; the code path above does not
allow it, so look for a second listener added in GTM.

## A/B-ready

The form layout is a per-variant setting (`site.config.json` →
`forms.variants.*.layout`: `short` | `full`). A multi-step variant would be
a third partial with `layout: "steps"`, using the same handler, the same
events and the same `/thankyou/`. Do not build it until Pellikal's own data
says the single short form is the bottleneck.
