# DEPLOYMENT-CHECKLIST.md

Run through this before every push, and in full before the Window Inserts
campaign goes live.

---

## 1. Build

```bash
python3 tools/build.py     # run twice
```

The **second** run must say `Pages updated: 0`. If it doesn't, something isn't
synchronised — commit the generated files.

- [ ] Build clean, second run reports 0 updated
- [ ] `node --check js/*.js` passes
- [ ] Build prints the shared quote form on all three pages and no warnings
- [ ] No dead links, all images have alt text, JSON-LD parses

---

## 2. Supabase (first deploy only)

- [ ] `supabase/migrations/0001_pellikal_cms.sql` run on the project
- [ ] **Signups disabled** (Authentication → Sign In / Providers)
- [ ] Owner admin user created, UUID added to `app_admins`
- [ ] `gallery` bucket: public read, 8 MB, JPEG/PNG/WebP
- [ ] Signed in at `/admin/` successfully
- [ ] **Non-admin test passed** (`SECURITY-TEST-MATRIX.md` B2)
- [ ] `js/config.js` has the anon key — **never** service_role

---

## 3. Content truthfulness

- [ ] No image captioned as Pellikal's own work unless it is
- [ ] No invented testimonial, award, certification or statistic
- [ ] Manufacturer claims attributed and sourced (`CLAIMS-SOURCES.md`)
- [ ] Warranty wording conditional ("qualifying products, restrictions apply")
- [ ] LLumar / SelectPro usage matches `LLUMAR-USAGE-REVIEW.md`

---


## 3b. Manufacturer imagery on /window-inserts/

Six images on that page are manufacturer material, not Pellikal photography.
They are controlled by one flag in `js/config.js`.

- [ ] `WINDOW_INSERT_ASSETS_APPROVED` is **`true`** — approved 10 Sep 2026 on
      the owner's dealer-relationship attestation (recorded in
      `WINDOW-INSERTS-ASSETS.md`)
- [ ] If the dealer relationship ends or the manufacturer objects, set it back
      to `false`; the page degrades cleanly
- [ ] Load `/window-inserts/` and confirm the page reads correctly in whichever
      state you are shipping — no empty boxes, no heading with nothing under it
- [ ] Confirm the five owner-supplied photographs show in **both** states

Hiding is enforced in CSS, so if the flag is ever set back to `false` the
assets stay hidden even with JavaScript disabled. Full detail: `docs/WINDOW-INSERTS-ASSETS.md`.

## 4. Tracking — do not change these

- [ ] `GTM-MK2PHWB` present once in `<head>` per public page — and **no** `<noscript>` iframe (removed on purpose; see `CONSENT-MODE.md`)
- [ ] `/admin/` and `/local-law-97/` carry **no** container
- [ ] **The Google tag is installed by the page (7 Oct 2026):** exactly ONE
      `gtag/js?id=AW-859941989` loader and ONE `gtag('config','AW-859941989')`
      per tracked page, placed after the consent block and before the GTM
      snippet — **no** `gtag/js?id=G-J8SQ4CC7BT` anywhere (it 404s; the GA4
      stream is a *destination* of the installed tag) — and **none** on
      `/admin/` or `/local-law-97/`
- [ ] No conversion label (`AW-859941989/…`) and no `gtag('event'…)` anywhere
      in page code (the Ads conversion and the GA4 custom events stay inside
      GTM)
- [ ] `generate_lead` and `window_insert_lead` intact
- [ ] ID roles straight: installed Google tag `AW-859941989` · GA4 destination
      `G-J8SQ4CC7BT` · container `GTM-MK2PHWB` · Ads conversion `AW-859941989`
      (label in GTM only)
- [ ] **GTM: the Google Tag `GA4` (`G-J8SQ4CC7BT`, Initialization – All Pages)
      is PAUSED and stays paused**; no other Google base tag added in GTM
      (`docs/GA4-DIRECT-TAG.md` §4)
- [ ] `docs/GA4-DIRECT-TAG.md` §7 live checks done and signed (name + date):
      `gtag/js?id=AW-859941989` → 200, no `G-J8SQ4CC7BT` loader at all, one
      `/g/collect` `page_view` → 204 per page with `tid=G-J8SQ4CC7BT`, custom
      events once, `generate_lead` once, `GA4 - Pellikal Custom Events`
      succeeds, Ads conversion once, no second loader when events fire. **If
      the custom events trigger a `G-J8SQ4CC7BT` loader, that is a failure —
      do not sign off.**

> **`gtag(` appears on every page and that is correct.** The Consent Mode v2
> block defines `gtag()` and calls `gtag('consent', …)` (the consent API), and
> since 7 Oct 2026 the page's own Google tag calls
> `gtag('config', 'AW-859941989')` exactly once. The things to check for are a
> *second* loader/config, or a conversion label / `gtag('event')` in page
> code. See `docs/CONSENT-MODE.md`, `docs/GA4-DIRECT-TAG.md`.

### 4b. Consent Mode v2 (`docs/CONSENT-MODE.md`)

- [ ] Consent block sits **above** the GTM snippet in `<head>` on every tracked page
- [ ] Consent version is `v2` in `site.config.json` (granular categories)
- [ ] **Regional defaults (28 Sep 2026)** — Tag Assistant Consent view, before
      choosing, from `?consent=reset`:
      - from **Spain / UK / Switzerland** (simulated location or VPN): all four
        optional categories **denied**
      - from **New York**: all four optional categories **granted**
      (`CONVERSION-DEBUG.md` → "Manual regional verification"; the local suite
      proves the emitted commands, not Google's geography — this box is a
      person's signature: name + date + how location was simulated)
- [ ] After **Accept All**: all four **granted**
- [ ] After **Reject Non-Essential**: all four **denied** — from New York too
- [ ] Returning visitor who **rejected**: the update to denied lands **before**
      `Container Loaded` (no granted window on any page)
- [ ] Manage → Analytics only: `analytics_storage` granted, ad categories denied
- [ ] Manage → Advertising only: three ad categories granted, analytics denied
- [ ] Returning visitor who accepted: the update lands **before** `Container Loaded`
- [ ] Footer **Tracking preferences** button reopens the banner
- [ ] `?consent=reset` brings the banner back
- [ ] **Every non-Google tag in GTM has consent checks** (Clarity, chat, call
      tracking, pixels). Consent Mode does not gate them automatically, and an
      ungated tag makes the banner a false promise
- [ ] **The tool list in `privacy/index.html` matches what is actually enabled
      in GTM.** The repo cannot verify this — open the container and read it

> **HARD GATE — do this BEFORE pushing, not after.** The privacy policy states
> that Microsoft Clarity is *not currently enabled*. `Microsoft Clarity -
> Official` must be **paused in GTM before this code goes live**. Deploying the
> banner while an ungated Clarity tag keeps recording would mean the site
> offers "Necessary Only" and then ignores it — worse than shipping no banner
> at all. If you decide to keep Clarity, gate it on `analytics_storage` and
> change that bullet in the policy first.

### 4c. Lead flow (`docs/LEAD-FLOW.md`)

- [ ] One form each on `/contact/`, `/residential/`, `/window-inserts/`
- [ ] Correct service preselected on each
- [ ] `/contact/?service=window-inserts` still selects Window Inserts
- [ ] A failed submission does **not** redirect and fires **no** event
- [ ] A confirmed success lands on `/thankyou/`
- [ ] `/thankyou/` is `noindex, follow`, carries GTM once, is out of the sitemap
- [ ] `/thankyou/` is **not** disallowed in `robots.txt`
- [ ] Exactly one Google Ads conversion exists for one lead — the `generate_lead` event, not the `/thankyou/` page view

---

## 4c. Google reviews (7 Oct 2026) — `docs/GOOGLE-REVIEWS.md`

- [ ] Migration `0004_google_reviews.sql` run on the live project (safe to re-run)
- [ ] No Google credential anywhere in the repo: `grep -rn "GOCSPX-\|1//0\|refresh_token" --include=*.html --include=*.js --include=*.json .` finds nothing; `supabase/.env` is git-ignored and not committed
- [ ] `python3 tools/qa/verify_reviews.py` passes (stubbed Supabase; also proves the pages never call Google)
- [ ] `deno test --allow-read tools/qa/sync_google_reviews_test.ts` passes (idempotent upsert, fail-safe)
- [ ] `python3 tools/qa/verify_sql.py` passes against a local PostgreSQL (anon column grants / no writes; cron file refuses its placeholder)
- [ ] Bootstrap fallback (`site.config.json → reviews.fallback`: 5.0 / 12 + the three verified cards, copied 7 Oct 2026) still matches the public profile; **after the first successful sync set rating/count to null and reviews to [] and rebuild**
- [ ] `business.googleReviewsUrl` is the PUBLIC Google Maps listing (set 7 Oct 2026, v30; `GOOGLE-REVIEWS.md` §5c) — no `authuser=`, no `/customers/reviews`, starts with `https://`; the hero count and every "Read all reviews" button open it in a new tab (`verify_reviews.py` §1 + §3 prove it)
- [ ] Review labels say "most recent" and the cards ARE the newest written reviews (no star filter, no wording classifier on Commercial)
- [ ] Brand name discrepancy (Window Solutions vs Window Enhancements) decided by the owner — `GOOGLE-REVIEWS.md` §10; no rename happens without approval
- [ ] Owner setup done: function deployed with `--no-verify-jwt`, secrets set, first manual sync returned `"ok": true`, `google_review_summary.last_sync_status = ok`
- [ ] Schedule installed (`supabase/sql/schedule_google_reviews_sync.sql`), `cron.job` shows `sync-google-reviews`, a run has completed with HTTP 200
- [ ] Live site: Residential hero shows the Google line; `/`, `/residential/`, `/commercial/` show real reviews. Before the first successful sync they show the verified temporary snapshot (5.0 / 12) and the three verified cards ("Featured Google Reviews"); after it, live data replaces the fallback completely. If Supabase answers with an error, nothing shows (the fallback never masks a configuration problem)
- [ ] `google_reviews_click` is **not** a key event / conversion anywhere (diagnostic only)

## 5. Forms

- [ ] Formspree ID `maewnodj` unchanged in `js/config.js`
- [ ] Test submission arrives at info@pellikal.com
- [ ] A failed submission fires **no** conversion and keeps the typed text
- [ ] Every form (home, residential, commercial, window inserts, contact) asks
      only: Full name · Phone · Email · ZIP code (optional)
- [ ] `/contact/?service=window-inserts` → the Formspree email shows
      `service: Window Inserts / Noise Reduction` (hidden field, no dropdown)

---

## 6. Push

- [ ] Push to `main`; GitHub Pages redeploys (~1 min)
- [ ] `CNAME` still present in the repo

---

## 6b. Homepage repositioning (22 Sep 2026)

- [ ] Run `supabase/migrations/0003_homepage_hero_repositioning.sql` on the
      live project (or set the hero headline/subtitle in `/admin/`) — otherwise
      the CMS puts the old Hamptons headline back at runtime
- [ ] With JavaScript on, the homepage H1 reads *Professional Window Film for
      Long Island & NYC*
- [ ] Search Console → URL Inspection → `https://www.pellikal.com/` →
      Request Indexing; sitemap still submitted

## 7. Verify live

- [ ] `https://www.pellikal.com/` loads over HTTPS
- [ ] `https://www.pellikal.com/window-inserts/` loads (**trailing slash**)
- [ ] Mobile: menu opens, no sideways scroll, tap-to-call works
- [ ] Tag Assistant / GTM Preview shows the container firing once
- [ ] GA4 Realtime shows the pageview and `click_to_call`
- [ ] A real test lead produces `generate_lead`
- [ ] `/admin/` still requires sign-in and still shows no container

---

## 8. Then, and only then

- [ ] Tell Damian to point the campaign at
      `https://www.pellikal.com/window-inserts/`

---

## Rollback

Revert the commit and push. GitHub Pages serves the previous version within a
minute. Supabase content is unaffected by a code rollback.


### 4d. MANUAL HARD GATES — live GTM review (the repo cannot see any of this)

Do every one of these in the GTM container **before** pushing the site.

- [ ] `Microsoft Clarity - Official` is **PAUSED** — or explicitly gated on
      `analytics_storage` **and** the privacy policy's Clarity bullet changed
- [ ] `GA4 Event - Contact Form Fill` (thank-you page view) **paused**
- [ ] `GA4 Event - Check Out Our New Look` **paused**
- [ ] The current GA4 configuration tag **remains**
- [ ] `GA4 - Pellikal Custom Events` **remains**
- [ ] `Conversion Linker` **remains**, all pages
- [ ] `DLV - form_location` exists (Data Layer Variable, name `form_location`,
      Version 2) and is passed as `form_location` on the custom-events tag
- [ ] `form_location` registered as an event-scoped custom dimension in GA4
- [ ] The Google Ads lead conversion tag is triggered by **Custom Event, event
      name exactly `generate_lead`** — using the existing Submit-lead-form
      conversion action, **Count: One**
- [ ] The old **Thank You Page View** trigger is **removed** from that tag (or
      that tag is paused): `/thankyou/` must not be a second Primary
- [ ] It fires **ONCE** per successful lead — verify with the 12-step
      procedure in `CONVERSION-DEBUG.md` (refresh/back/forward on `/thankyou/`
      must not re-fire it)
- [ ] `window_insert_lead` is reporting / Secondary at most
- [ ] **No unknown pixel, chat, session-replay or A/B tag** exists that is not
      gated on consent — read every tag in the container
- [ ] The old Ads conversion action is no longer **Misconfigured** before any
      ad spend starts

---

## 9. Live test matrix — run after deployment

**A. Fresh visitor** — clear site data; load `/`; banner appears with Accept
All · Reject Non-Essential · Manage Preferences, all three the same size.

**B. Reject** — click Reject Non-Essential; Tag Assistant Consent tab shows all
four denied; browse, open the menu, submit the form: everything works.

**C. Analytics only** — `?consent=reset`, Manage → Analytics on → Save; Tag
Assistant shows `analytics_storage` granted, three ad categories denied; a GA4
hit is sent; no Ads cookie set.

**D. Advertising** — Manage → Advertising on → Save; three ad categories
granted; Conversion Linker sets its cookie.

**E. Preference change** — footer → Tracking preferences shows the current
switches; change one; Save; navigate and reload: state persists.

**F. Forms** — real submission from `/residential/`, `/window-inserts/` and
`/contact/`: email arrives, browser lands on `/thankyou/`. Submit with a
required field blank: stays put. (To simulate failure: DevTools → Network →
block `formspree.io` → submit → error shown, no redirect, text kept.)

**G. Tracking** — run the 12-step procedure in `CONVERSION-DEBUG.md` and compare
against its expected sequence. In Preview, `generate_lead` fires *before* the redirect with
the right `service` slug and `form_location`; nothing typed appears in the
dataLayer; on `/thankyou/` the Ads Form Fill tag fires **exactly once**.

**H. Admin** — anonymous cannot write; a signed-in non-admin cannot write;
an approved admin at aal1 cannot write; at aal2 can; upload and delete work;
`admin_audit_log` records each; closing the browser signs the admin out.

**I. Accessibility** — keyboard-only through menu, accordion, form, consent
banner and dialog (Tab stays inside; Escape closes; focus returns);
VoiceOver/NVDA spot-check; 200% and 400% zoom reflow; 320 px width.
