# MARKETING-TRACKING.md

Reference for the marketing specialist managing Google Ads, GA4 and GTM for
**pellikal.com**.

**Status:** Google Tag Manager is **installed and live** on the website.
GA4 and Google Ads conversions must now be configured **inside the container**.

---

## 1. Google Tag Manager

| | |
|---|---|
| **Production container** | `GTM-MK2PHWB` |
| Head snippet | Google's official snippet, at the top of `<head>` on every public page |
| Body snippet | Google's official `<noscript>` iframe, immediately after `<body>` |
| Containers on the site | **One.** No second container, no stray gtag.js |

### Pages carrying the container

`/` · `/residential/` · `/commercial/` · `/solutions/` · `/about/` · `/faq/` ·
`/contact/` · `/privacy/` · `404.html`

### Pages deliberately excluded

| Page | Why |
|---|---|
| `/admin/` | Private staff content manager. Tracking the owner's own admin activity would pollute analytics and inflate engagement. |
| `/local-law-97/` | A bare redirect to `/commercial/`. Nobody stays on it; a pageview there would be noise. |

### Changing the container ID

The ID lives in **one place**: `site.config.json` →

```json
"analytics": {
  "gtmContainerId":   "GTM-MK2PHWB",
  "ga4MeasurementId": "G-J8SQ4CC7BT"
}
```

Edit it, then run `python3 tools/build.py`. That restamps the head snippet and
the `<noscript>` fallback across every page. **Do not hand-edit the snippet in
individual pages** — the build overwrites it.

---

## 2. Google Analytics 4

| | |
|---|---|
| **Existing Measurement ID** | `G-J8SQ4CC7BT` |
| How it should be installed | As a **Google tag inside GTM** |
| Direct gtag.js on the site | **None — intentionally** |

The repository was searched for existing GA4 / gtag.js / analytics.js
installations. **None were found**, so there was no duplicate-pageview problem
to untangle and nothing was removed. The GA4 property itself is untouched.

**Set it up like this:**

1. GTM → **Tags → New → Google Tag**
2. Tag ID: `G-J8SQ4CC7BT`
3. Trigger: **Initialization – All Pages**
4. Publish

> ⚠️ Do **not** also paste a gtag.js snippet into the pages. Either GTM manages
> GA4, or the site does — never both, or every page view counts twice.

---

## 3. Website events

All events are pushed to `window.dataLayer`. In GTM, catch each one with a
**Custom Event** trigger whose event name matches exactly.

| Event | Trigger | Parameters | Fires on |
|---|---|---|---|
| `click_to_call` | Any `tel:` link clicked | `click_location` | Every public page |
| `click_to_text` | Any `sms:` link clicked | `click_location` | Every public page |
| `click_to_email` | Any `mailto:` link clicked | `click_location` | Every public page |
| `view_contact_page` | `/contact/` loads | — | Contact page |
| `contact_form_submit` | Formspree confirms the contact form succeeded | — | Contact page |
| `homepage_form_submit` | Formspree confirms a homepage form succeeded | — | Homepage |
| `generate_lead` | Immediately after either form-submit event | `lead_source` | Homepage / Contact |

**`click_location` values:**
`header` · `hero` · `page_hero` · `mobile_bar` · `footer` · `final_cta` ·
`contact_page` · `body`

**`lead_source` values:** `contact_form` · `homepage_form`

### Example payloads

```js
{ event: "click_to_call",      click_location: "mobile_bar" }
{ event: "click_to_email",     click_location: "footer" }
{ event: "view_contact_page" }
{ event: "contact_form_submit" }
{ event: "generate_lead",      lead_source: "contact_form" }
```

### ⚠️ `homepage_form_submit` is implemented but currently dormant

The live homepage has **no lead form on it**. The only form is the full one at
`/contact/`. The event is wired and will fire the moment a homepage form with
`id="home-form"` is added. Until then, expect zero of these. Not a fault.

---

## 4. When exactly `generate_lead` fires

Only after **Formspree returns a successful HTTP response** confirming the
submission was accepted.

- ❌ Clicking Submit does **not** fire it
- ❌ Failing client-side validation does **not** fire it
- ❌ A network error, timeout or Formspree error response does **not** fire it —
  the visitor sees an error, **their typed details are preserved**, and they are
  asked to call or text
- ❌ A honeypot (bot) submission is dropped silently and fires nothing
- ✅ Only `response.ok === true` fires `contact_form_submit` → `generate_lead`

So reported conversions correspond to enquiries that genuinely reached the
business. The form is not reset unless the submission succeeded.

---

## 5. Google Ads

**No `AW-` Conversion ID or Conversion Label is hard-coded anywhere**, by
design. Configure them in GTM.

Suggested mapping:

| Website event | Google Ads conversion | Notes |
|---|---|---|
| **`/thankyou/` page view** | **Submit lead form** | **THE primary conversion.** Count: One |
| `generate_lead` | — | **GA4 reporting only — not a second Primary Ads conversion** |
| `click_to_call` | **Phone call lead** | If you want call clicks counted |
| `click_to_text` | Contact | Optional |
| `click_to_email` | Contact | Optional |
| `homepage_form_submit` | — | Diagnostic only; don't double-count with `generate_lead` |
| `contact_form_submit` | — | Diagnostic only |
| `window_insert_lead` | Secondary at most | Never a second Primary lead |
| `view_contact_page` | **Never** | Intent signal / audience only. Counting it as a lead will badly inflate conversions. |

The existing Google Ads account contains historical conversion actions (Submit
lead form, Phone call lead, Contact, Get directions, Download, Engagement, Page
view, Other). Some are old or misconfigured. **Auditing and cleaning those is
the specialist's call** — nothing in the website code creates, modifies or
depends on them. The site's only job is to expose accurate events.

Bidding strategy and account-level goals are deliberately not decided here.

### Conversion Linker

Configure **Conversion Linker** (or the modern Google tag settings that replace
it) inside GTM so ad-click identifiers persist across pages. No account values
are invented in the site code.

---

## 6. Call tracking

**Dynamic number replacement is not installed.** No third-party call-tracking
script is present and no Google forwarding number is in use.

The site is structured to make it easy to add later:

- Every number sits inside a proper `<a href="tel:+15163369586">` with the
  visible number as that link's own text
- Formats are consistent — display `516-336-9586`, link `tel:+15163369586`

If you introduce a permanent forwarding number, note that **structured data and
Google Business Profile should keep the real business number** to protect NAP
consistency. See `PHONE-AUDIT.md` for every location.

---

## 7. Privacy

**No customer PII passes through the dataLayer — verified by test.** A test
enquiry was submitted and the entire dataLayer inspected: the name, email,
phone number, town and message text do **not** appear anywhere.

Events record only that an action happened, and roughly where on the page.

The privacy policy at `/privacy/` now states that Google Tag Manager and GA4
are in use, that Google Ads measurement is being configured, and that call
tracking is **not** currently active. It also states plainly that personal
information is never sent to analytics or advertising systems.

**SUPERSEDED 14 Sep 2026.** ~~The site ships no cookie banner.~~ Consent Mode
v2 ships in the website itself — defaults denied before GTM loads, plus a
banner offering Accept All / Necessary Only, and a reopen control in the
footer and the privacy policy. Configure nothing equivalent in GTM; do gate any
custom GTM tag with its own consent check. See `CONSENT-MODE.md`.

---

## 8. Testing with Tag Assistant

1. Go to **tagassistant.google.com** → **Add domain** →
   `https://www.pellikal.com` (or GTM → **Preview**).
2. A tagged window opens. Confirm the badge shows **GTM-MK2PHWB connected**.
3. Walk through these and watch the event stream on the left:

| Do this | Expect |
|---|---|
| Load the homepage | `gtm.js`, `gtm.dom`, `gtm.load` |
| Tap the header phone number | `click_to_call` → `click_location: header` |
| Tap the sticky bottom bar on mobile | `click_to_call` / `click_to_text` → `mobile_bar` |
| Click the footer email | `click_to_email` → `footer` |
| Visit `/contact/` | `view_contact_page` |
| Submit a **real** test enquiry | `contact_form_submit`, then `generate_lead` with `lead_source: contact_form` |

4. Click any event → **Data Layer** tab → confirm **no personal data** is
   present.
5. Check `/admin/` shows **no container** (expected — it's excluded).
6. Confirm the phone actually dials and the email client opens; tracking never
   blocks the link.

---

## 9. Verifying GA4 Realtime (after GA4 is configured in GTM)

1. Publish the GTM container with the GA4 Google tag (`G-J8SQ4CC7BT`).
2. GA4 → **Reports → Realtime**.
3. Open `https://www.pellikal.com` in a normal browser window (not Preview).
4. Within ~30 seconds you should see 1 active user and a `page_view`.
5. Tap a phone link, then check **Realtime → Event count by Event name** for
   `click_to_call`.
6. Submit a test enquiry and confirm `generate_lead` appears.
7. GA4 → **Admin → Events → Mark as key event** for `generate_lead`.
8. Confirm **page views are not doubled** — one `page_view` per page load. If
   you see two, a duplicate GA4 tag exists somewhere in GTM (there is none in
   the site code).
