# LEAD-FLOW.md

The paid-ad lead flow: ad click → landing-page form → `/thankyou/` → Google
Ads counts the lead.

**Added:** 14 September 2026 · requested by Damian

---

## The flow

```
Google Ad
  → /residential/  or  /window-inserts/   (form embedded on the page)
  → visitor submits
  → Formspree returns a CONFIRMED success
  → dataLayer events fire
  → Google Ads records ONE lead conversion, triggered by the generate_lead event
  → /thankyou/ loads (the visitor's confirmation — not a second conversion)
```

Nothing is counted until Formspree actually confirms. `generate_lead` is the
authoritative signal precisely because it exists only after a 2xx from
Formspree; a page view can be reached by a refresh, a Back/Forward revisit,
a bookmark or a mistyped link, and none of those is a lead. The redirect
waits for GTM's `eventCallback`, so the Ads tag finishes before the page
changes (1.4 s backstop if GTM is blocked). A click on Submit is not
a lead, and a failed or rejected submission never redirects and never fires an
event.

---

## One form, three pages

`partials/quote-form.html` is the only copy of the form. `tools/build.py`
renders it into any page carrying a variant marker:

```
<!-- @partial:quote-form:residential -->   ...generated...   <!-- @end -->
```

| Page | Variant | Layout | Service (hidden on short) | Property type | Event on success |
|---|---|---|---|---|---|
| `/` | `homepage` | **short** | — | — | `homepage_form_submit` → `generate_lead` |
| `/residential/` | `residential` | **short** | Residential Window Film | Residential | `contact_form_submit` → `generate_lead` |
| `/commercial/` | `commercial` | **short** | Commercial Window Film | Commercial | `contact_form_submit` → `generate_lead` |
| `/window-inserts/` | `window_inserts` | **short** | Window Inserts / Noise Reduction | — | `contact_form_submit` → `generate_lead` → `window_insert_lead` |
| `/contact/` | `contact` | full | visitor chooses | visitor chooses | `contact_form_submit` → `generate_lead` |

**Short layout (17 Sep 2026, paid-traffic conversion pass)** —
`partials/quote-form-short.html`: first name (required), phone, email,
town/ZIP (optional). **Phone OR email is required, not both** — enforced in
`js/main.js` with a real message and `aria-invalid` on both fields. What the
page already knows travels as hidden fields (`service`, `property_type`,
`form_variant`), so the Formspree email still arrives complete and the
tracking slug still comes from `[name="service"]`. Same endpoint, same
handler, same `/thankyou/`, same events. `?service=` prefill only applies to
the full form's dropdown.

Defined in `site.config.json` → `forms.variants`. Edit the markup once, run
`python3 tools/build.py`, and all three follow. The build prints which pages
got which variant, and **fails** if a placeholder is left unfilled.

The Formspree endpoint is **not** duplicated into the three pages — the build
reads `FORMSPREE_ID` out of `js/config.js`, which stays its documented home.

### Where the form sits

- **Residential** — after the "Five upgrades from one thin, invisible layer"
  benefits grid, before "Room by room". Second section on the page: enough to
  understand the offer, no long scroll.
- **Window Inserts** — after "Three parts, one tight seal", before the
  before/after comparison. Second section, straight after the product is
  explained.

Both reuse `.quote-wrap`, so they inherit the existing two-column-to-one-column
behaviour rather than introducing new responsive rules.

---

## A dropdown option had to be added

The service dropdown had **no residential option** — the closest was
"Solar / Heat & Glare". There was nothing to preselect.

So **"Residential Window Film" is new**, and it maps to a new service slug
`residential_film`. Damian should expect that value to start appearing in GA4
alongside the existing ones.

Adding it broke `/contact/?service=window-inserts`: the old prefill matched on
the first word, and both labels contain "window", so it started selecting
"Residential Window Film" instead. The prefill now matches on **slug**, so it
is exact regardless of what is added to the dropdown or in what order.

---

## The redirect

In `js/main.js`, reached from exactly one place — inside the `r.ok` branch,
after Formspree confirms:

1. validate (`checkValidity`), bot honeypot check
2. `POST` to Formspree
3. **only if `r.ok`** → reset form, show success, fire the events
4. navigate to `data-success-url` (`../thankyou/`, written at build time),
   **forwarding `gclid` / `gbraid` / `wbraid` / `gclsrc`** from the landing
   URL so internal navigation never drops an ad-click identifier (Google
   warns that redirects which lose the GCLID break attribution, and a
   JavaScript redirect is not decorated by Google's URL passthrough). This
   is measurement continuity, not a bypass: with advertising consent denied,
   Consent Mode and `ads_data_redaction` still govern what Google sends and
   uses, and attribution may remain cookieless/modelled. Nothing the visitor
   typed is carried.

Anything else — invalid fields, HTTP 422, network failure — shows the error,
keeps everything the visitor typed, and **stays on the page**.

Back button / bfcache: `pageshow` with `persisted` resets the redirect guard,
so a second, genuinely new submission redirects again. JavaScript off: the
plain POST reaches Formspree, whose `_next` field sends the visitor to
`https://www.pellikal.com/thankyou/` (no events can fire in that case —
there is no JavaScript to fire them). Repeatable Tag Assistant procedure and
the expected sequence: `CONVERSION-DEBUG.md`.

The redirect does not race the measurement calls. `PELLIKAL_TRACK_LEAD`
attaches GTM's `eventCallback` to the last event, so the page leaves as soon as
the tags report done. A 1400 ms timer is the backstop for when the container is
blocked and that callback never arrives; whichever fires first wins, and the
redirect is guarded so it can only happen once.

---

## Events — all preserved

| Event | Status |
|---|---|
| `view_contact_page` | unchanged |
| `click_to_call` / `click_to_text` / `click_to_email` | unchanged |
| `homepage_form_submit` | unchanged (see note) |
| `contact_form_submit` | unchanged — fires from all three forms |
| `generate_lead` | unchanged, **plus one new parameter** |
| `window_insert_lead` | unchanged |

**New parameter on `generate_lead` only:** `form_location`, one of
`homepage` · `contact` · `residential` · `commercial` · `window_inserts`. A fixed vocabulary set at build
time — never anything a visitor typed. Existing parameters (`lead_source`,
`service`, `page_type`) are untouched.

`lead_source` stays `contact_form` for all three forms, so any existing GTM
trigger on `contact_form_submit` keeps working exactly as before. Use
`form_location` to tell them apart.

> **`homepage_form_submit` is live again (17 Sep 2026):** the homepage now
> carries the short form (`form_location=homepage`), and `js/main.js` maps
> that location to `lead_source=homepage_form`.

### Funnel diagnostics (secondary — never conversions)

| Event | When | Parameter |
|---|---|---|
| `quote_cta_click` | any "Get a Free Quote" control | `cta_location`: header · menu · hero · mobile_bar · cta_band |
| `quote_form_view` | a quote form scrolls ≥35% into view, once per page | `form_location` |
| `quote_form_start` | first keystroke in a quote form, once per page | `form_location` |
| `quote_form_error` | submission blocked or failed | `error_type`: validation · contact_required · phone_invalid · provider · network |

`click_to_call` / `click_to_text` already cover phone and text taps. Every
parameter passes an allow-list in `js/tracking.js` (`PELLIKAL_TRACK_EVENT`),
so nothing typed into a form can reach analytics. With these, GTM can show
*100 clicks → N quote_cta_click → N quote_form_start → N generate_lead* and
say whether the page, the form or the traffic is the problem.

**Double-submit guard:** the submit button is disabled the instant a send
starts and a second click while it is disabled returns immediately; the
redirect is guarded to fire once. Verified: two clicks → one `generate_lead`.

### No PII

Nothing typed into the form reaches the dataLayer, the URL, GTM, GA4, cookies
or `localStorage`. Verified by filling the real form and searching every one of
those for the submitted values. The only things measured are the service
*category* as a slug and `form_location`.

---

## `/thankyou/`

| Property | Value |
|---|---|
| URL | `https://www.pellikal.com/thankyou/` — no dash |
| Canonical | the same |
| Robots | `noindex, follow` |
| Sitemap | excluded (`inSitemap: false`) |
| `robots.txt` | **deliberately not disallowed** |
| GTM | `GTM-MK2PHWB`, once, the standard public-page install (GA4 page view + Conversion Linker) |
| Extra tags | none — no second GA4 config, no Ads conversion in the page. **This page view is not a conversion trigger.** |
| Consent | same state as the rest of the site |
| Legacy `.html` forwarder | none (`redirect: false`) |

**Why it is not in `robots.txt`:** disallowing the crawl would stop Google ever
fetching the page, so it would never read the `noindex`. The two together are a
common and self-defeating mistake. `noindex` + out of the sitemap is correct.

Converting does **not** override a visitor's tracking choice. Someone who chose
Necessary Only still arrives with all four categories denied.

No submitted details appear on the page or in its URL.

---

## Still to do by hand — GTM and Google Ads

None of the below is in the repository, and none of it was verified here.

- [ ] **Inspect the existing "Google Ads Conversion - Form Fill → Thank You
      Page View" trigger.** There is a good chance it already points at
      `/thankyou/` and simply lost its page when the site was rebuilt.
- [ ] **Re-point the Ads lead conversion tag to a Custom Event trigger, event
      name exactly `generate_lead`.** The existing "Thank You Page View"
      trigger must then be removed from that tag (or the tag duplicated and
      the page-view version paused) — one Primary path only.
- [ ] Set the Ads conversion action: **Goal** Submit lead form ·
      **Optimization** Primary · **Count** One.
- [ ] **Check that no Ads conversion still fires on the `/thankyou/` page
      view.** With `generate_lead` as the trigger, a page-view conversion
      would count the same lead twice, and would count refreshes and
      revisits as leads.
- [ ] Leave `generate_lead` as a GA4 event for reporting — it is what tells you
      *which* service and *which* form produced the lead.
- [ ] **GTM Variables → New → Data Layer Variable**, name `DLV - form_location`,
      data layer variable name `form_location`, **Version 2**. Add it to the
      `GA4 - Pellikal Custom Events` tag as `form_location`.
- [ ] **Register `form_location` in GA4** (Admin → Custom definitions →
      event-scoped custom dimension). Without this the parameter is collected
      but never appears in reports — it is the step people forget.
- [ ] Check the same for `service`, and note it now has a **new value**,
      `residential_film`. Any lookup table, audience or filter with a fixed
      list of service values needs it adding.
- [ ] Pause the old `GA4 Event - Contact Form Fill` (thank-you page view). Once
      `/thankyou/` exists it fires again and double-reports alongside
      `generate_lead`. Check first whether it is marked as a key event in GA4 —
      if it is, historical reporting changes when you pause it.
- [ ] Pause `GA4 Event - Check Out Our New Look` (old-site leftover).
- [ ] Keep the Conversion Linker tag firing site-wide.
- [ ] Point ad final URLs at the trailing-slash form of the landing pages.

**Not verified here:** live Formspree delivery and the live Google Ads
conversion. Formspree was stubbed at the network layer to exercise success and
failure deterministically; the Ads side lives in Google's UI.
