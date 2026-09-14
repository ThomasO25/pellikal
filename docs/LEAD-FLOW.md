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
  → /thankyou/ loads
  → Google Ads records ONE lead conversion on that page view
```

Nothing is counted until Formspree actually confirms. A click on Submit is not
a lead, and a failed or rejected submission never redirects and never fires an
event.

---

## One form, three pages

`partials/quote-form.html` is the only copy of the form. `tools/build.py`
renders it into any page carrying a variant marker:

```
<!-- @partial:quote-form:residential -->   ...generated...   <!-- @end -->
```

| Page | Variant | Service preselected | Property type |
|---|---|---|---|
| `/contact/` | `contact` | none (visitor chooses) | none |
| `/residential/` | `residential` | Residential Window Film | Residential |
| `/window-inserts/` | `window_inserts` | Window Inserts / Noise Reduction | none |

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
4. navigate to `data-success-url` (`../thankyou/`, written at build time)

Anything else — invalid fields, HTTP 422, network failure — shows the error,
keeps everything the visitor typed, and **stays on the page**.

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
`contact` · `residential` · `window_inserts`. A fixed vocabulary set at build
time — never anything a visitor typed. Existing parameters (`lead_source`,
`service`, `page_type`) are untouched.

`lead_source` stays `contact_form` for all three forms, so any existing GTM
trigger on `contact_form_submit` keeps working exactly as before. Use
`form_location` to tell them apart.

> **Note on `homepage_form_submit`:** there is no form on the homepage and
> there never was one in this repository — no element with `id="home-form"`
> exists. The branch is preserved but unreachable. Worth knowing before anyone
> builds a report on it.

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
| GTM | `GTM-MK2PHWB`, once, the standard public-page install |
| Extra tags | none — no second GA4 config, no Ads conversion in the page |
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
- [ ] Confirm the trigger is **Page Path equals `/thankyou/`** (or an exact URL
      match on the full address).
- [ ] Set the Ads conversion action: **Goal** Submit lead form ·
      **Optimization** Primary · **Count** One.
- [ ] **Check nothing else is already firing an Ads conversion on
      `generate_lead`.** If a tag exists there, one lead would count twice.
      The website fires dataLayer events only; the single Ads conversion must
      be the `/thankyou/` page view.
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
