# CONVERSION-DEBUG.md

How to prove the lead funnel in GTM Preview / Tag Assistant, and what you
should see. **17 September 2026.**

## The mechanism (verified in code — `js/main.js`)

1. The visitor submits a quote form. `submit` is intercepted; the form is
   **never** posted the normal way while JavaScript is running.
2. Honeypot check → HTML5 validation (`checkValidity`) → short-form rule
   (phone **or** email; a typed phone must carry 10–15 digits). Any
   failure: stays on the page, `quote_form_error` fires with `error_type`
   validation · contact_required · phone_invalid, **nothing else does.**
3. `fetch(POST)` to the Formspree endpoint (`FORMSPREE_ID` in `js/config.js`)
   with `Accept: application/json`. The button is disabled for the duration;
   a second click returns immediately.
4. **Only if the HTTP response is `ok` (2xx):** `contact_form_submit` (or
   `homepage_form_submit`) → `generate_lead` → `window_insert_lead` when the
   service is inserts. GTM's `eventCallback` is attached to the last event.
5. Navigate to `/thankyou/`, carrying any `gclid`/`gbraid`/`wbraid`/`gclsrc`
   from the landing URL so internal navigation never drops an ad-click
   identifier. This is continuity, not attribution magic: with advertising
   consent denied, Consent Mode and `ads_data_redaction` still decide what
   Google may send or use. The redirect fires when GTM reports the tags done,
   or after 1.4 s if GTM never answers (blocked). It is guarded to run once.
6. A non-2xx response or a network failure: error message, details kept,
   `quote_form_error` with `error_type` provider/network, **no lead event, no
   redirect.**

## The 12-step check

1. Tag Assistant → **Connect** to the site → open `/residential/?gclid=test123`
   (a fake click ID stands in for a real ad click).
2. Choose **Reject Non-Essential** on the banner — the worst case for
   measurement is the one to test. (From New York the *default* before you
   click is now granted — see "Manual regional verification" below — so
   pressing Reject is what puts the page into the denied state this run
   records.)
3. Click **Get a Free Quote** in the hero → `quote_cta_click`.
4. Type a name → `quote_form_view` (fired as the form scrolled in) and
   `quote_form_start`.
5. Submit with no phone and no email → `quote_form_error`
   (`error_type: contact_required`). **Confirm `generate_lead` did NOT fire.**
   (A ZIP that isn't 5 digits is blocked by the browser first —
   `error_type: validation`; a blank ZIP is fine, it is optional.)
6. Add a phone number → submit.
7. Network tab: one `POST formspree.io/f/…` with status **200**.
8. Tag Assistant: `contact_form_submit` then **exactly one `generate_lead`**.
9. Tag Assistant: the Google Ads lead conversion tag fires **on the
   `generate_lead` event, on the Residential page, before the redirect**
   (the site holds the redirect until GTM reports the tag done). Then the
   browser lands on `/thankyou/?gclid=test123` — a page view, not a
   conversion.
10. Open `generate_lead` in Tag Assistant: parameters are `lead_source`,
    `service`, `form_location` only — no name, phone, email, ZIP.
11. Refresh `/thankyou/`, press Back, press Forward: `generate_lead` count
    stays at **1** and the Ads tag does **not** fire again. (The thank-you
    **page view** repeats — which is exactly why nothing may be triggered by
    it.)
12. In the email inbox: one Formspree message with `name`, `phone`/`email`,
    `zip` (if given), plus `form_variant`, `service`, `property_type`.

## Expected dataLayer sequence

Recorded from a real run (Chromium, Formspree stubbed with a 200) on
17 Sep 2026 — compare Tag Assistant's Summary against this, top to bottom:

```
 0a. gtag(consent, default, {ad_storage:denied, analytics_storage:denied,
                             ad_user_data:denied, ad_personalization:denied,
                             functionality_storage:granted, security_storage:granted,
                             region:[AT … SE, GB, CH]})   ← listed regions (28 Sep 2026)
 0b. gtag(consent, default, {ad_storage:granted, analytics_storage:granted,
                             ad_user_data:granted, ad_personalization:granted,
                             functionality_storage:granted, security_storage:granted})
                                                        ← no region = everyone else
 1. gtag(set, ads_data_redaction, true)
 1b. gtag(js, <Date>)                                   ← the page's own Google tag (7 Oct 2026)
 1c. gtag(config, AW-859941989)                         ← queued AFTER the defaults; the GA4 page_view goes
                                                           to destination G-J8SQ4CC7BT through this tag
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
    ← Google Ads lead conversion tag fires HERE (Custom Event trigger)
    → navigation to /thankyou/?gclid=… once GTM reports done (or after 1.4 s)
12. gtag(consent, default, {…denied…, region:[…]})    ← new page, same two defaults
12b. gtag(consent, default, {…granted…})
13. gtag(set, ads_data_redaction, true)
13b. gtag(consent, update, {all four: denied})         ← the SAVED Reject, restored by the head
13c. gtag(set, ads_data_redaction, true)                  block BEFORE the container bootstrap
13d. gtag(js, <Date>) / gtag(config, AW-859941989)     ← page_view for /thankyou/ (to G-J8SQ4CC7BT) — a page view, NOT a conversion
14. GTM bootstrap {gtm.start, event:'gtm.js'}          ← page view only; no conversion here
```

With the Google tag now installed by the page (7 Oct 2026; installed ID
`AW-859941989`, GA4 destination `G-J8SQ4CC7BT`), every page load sends **one**
`page_view` through it — the GTM Google Tag `GA4` is paused and stays paused
or there are two (`GA4-DIRECT-TAG.md` §4, §7).

Line 13b is the one the 28 Sep change added: a stored Reject is now
re-applied on every page load *before* GTM, because the default for a
visitor outside the listed regions is granted.

## Manual regional verification (Tag Assistant) — added 28 Sep 2026

The automated suite proves which commands the pages emit and in what order.
It does **not** exercise Google's geographic resolution — nothing in the
repository can. These steps have to be run by a person, and until they have
been, the regional behaviour is *configured*, not *verified*.

Use Tag Assistant → **Consent** tab (the *On-page Default* and *Update*
columns) with the browser's location simulated (DevTools → Sensors →
Location, or a VPN exit in the country). Start every case from
`?consent=reset` so no stored choice interferes.

| Case | Location | First-load expectation (On-page Default) | Then |
|---|---|---|---|
| A | New York, United States | `ad_storage` **granted**, `analytics_storage` **granted**, `ad_user_data` **granted**, `ad_personalization` **granted** | Click **Reject Non-Essential** → Update row: all four **denied**. Reload → the Update to denied appears **before** `Container Loaded` (saved Reject honoured immediately, no granted window). |
| B | Spain | all four **denied** | Click **Accept All** → Update row: all four **granted**. Reload → the Update to granted appears **before** `Container Loaded`. |
| C | United Kingdom | all four **denied** | (optional) Accept / Reject as in B. |
| D | Switzerland | all four **denied** | (optional) Accept / Reject as in B. |

Also confirm in every case that the Google Ads lead conversion still fires
only on `generate_lead` (steps 6–11 above) and that `/thankyou/` remains a
page view. Record the date and who ran it in `DEPLOYMENT-CHECKLIST.md` §4b.

Do not write up any of A–D as passed on the strength of the local suite.

If `generate_lead` appears before a 200 from Formspree, or appears twice,
or appears after an error — that is a bug; the code path above does not
allow it, so look for a second listener added in GTM.

## A/B-ready

There is one form layout — four fields, every page (25 Sep 2026). A
multi-step variant would be a second partial selected per variant in
`site.config.json` → `forms.variants`, using the same handler, the same events
and the same `/thankyou/`. Do not build it until Pellikal's own data says the
single short form is the bottleneck.
