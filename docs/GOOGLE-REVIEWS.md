# GOOGLE-REVIEWS.md

Real Google Business Profile reviews on pellikal.com, refreshed automatically.
**Added 7 October 2026.**

```
Google Business Profile API          (official Reviews API, OAuth 2.0 - no scraping)
        │  every 12 h (pg_cron)  +  on demand
        ▼
Supabase Edge Function  sync-google-reviews      (server side; holds the Google secrets;
        │                                         writes with the service_role key)
        ▼
Supabase tables  google_review_summary · google_reviews      (cache; last good data survives
        │                                                      any later failure)
        ▼
pellikal.com  js/reviews.js                      (reads two small rows with the public anon
                                                  key, read-only; renders with textContent)
```

Nothing on the website ever calls Google. No Google credential, refresh token
or service-role key exists in any file the browser can load (proved by
`tools/qa/verify_reviews.py` §1 on every run).

**Status: implemented and tested locally against stubs. NOT deployed.
Before the first successful sync (the owner completes "GOOGLE BUSINESS
PROFILE SETUP REQUIRED" below) the live site may display the verified
temporary Google snapshot and the verified review cards from
`site.config.json → reviews.fallback` (§5a). After the first successful
sync, live Supabase data replaces the fallback completely.**

---

## 1. What the site shows, and where

| Page | Element | Content |
|---|---|---|
| **Residential** | hero, directly under the two CTAs | `★★★★★ 4.9 on Google · 23 Google reviews · Free, no-pressure quote · LLumar® SelectPro™ dealer network` — the Google part is dynamic, the two facts after it are static (LLumar moved here from the trust strip; the strip keeps the warranty + service-area items) |
| **Residential** | section `#google-reviews`, after the project photos, before the final CTA | eyebrow *Real customer experiences*, heading *What Long Island homeowners say*, Google's rating + count, label **Google Reviews — most recent**, up to 3 cards, **Read All Reviews on Google** |
| **Homepage** | section `#google-reviews` (replaces the hidden CMS-testimonials placeholder) | eyebrow *Google reviews*, heading *What Pellikal customers say*, rating + count, 3 cards, **Read All Google Reviews** |
| **Commercial** | hero proof line + compact section before the final CTA | rating + count for the **whole profile**, heading *What Pellikal customers say*, the same newest-three cards as everywhere. **No review is ever presented as a commercial client's** — the site has no trusted metadata that could say so and (since v28) does not guess from the wording |

Numbers in this document are examples. On the site every number comes from
Supabase, synced from Google — with one documented, temporary exception (§5a,
the bootstrap fallback: a verified snapshot for the trust line and three
verified review cards, copied verbatim from the public profile). **Nothing is
invented: no placeholder reviews, names or review text exist anywhere in the
code.** Every element ships with the `hidden` attribute. Before the first
successful sync the verified temporary snapshot and cards may be displayed;
after the first successful sync, live Supabase data replaces the fallback
completely.

Residential order after this change (CRO brief §12): problem/benefit (H1 +
sub) → **Free Quote** CTA → Google proof → LLumar credibility → short quote
form → benefits ("Three things you notice…", "Three steps…", "Room by room",
"Three more reasons…") → real project photos → Google reviews → final CTA. The
only move was the *Recent work* photo section, from directly after the form
to directly before the reviews.

## 2. Data model (`supabase/migrations/0004_google_reviews.sql`)

| Table | Row(s) | Notes |
|---|---|---|
| `google_review_summary` | exactly one (`id = 1`) | `average_rating`, `total_review_count` **as Google reports them** (never recomputed from the displayed subset), `place_id` / `maps_uri` / `new_review_uri` (from the location metadata, used for the "all reviews" link), `last_synced_at` (last *successful* sync), `last_attempt_at`, `last_sync_status` (`never`/`ok`/`error`), `last_error` (sanitised; not readable by the site) |
| `google_reviews` | one per review, PK = Google's `reviewId` | `reviewer_name`, `is_anonymous`, `star_rating` 1–5, `comment` (as written; only capped at 8,000 chars), `create_time`, `update_time`, `reply_comment` + `reply_update_time` (the owner's reply, stored, not currently displayed), `google_review_url` (reserved — the API provides none), `synced_at`, `deleted_at` (soft delete when Google stops returning the review) |

Security, same model as the CMS: RLS on both tables; `anon`/`authenticated`
may `SELECT` the **display columns only** (column-level grants) of
non-deleted rows; no write policy exists, so only the `service_role` key —
which lives only inside the Edge Function — can write.
`google_reviews_mark_missing()` is `security definer`, executable by
`service_role` only. Non-destructive: nothing existing is altered.

Idempotency: every write is an upsert `ON CONFLICT (google_review_id) DO
UPDATE` (PostgREST `resolution=merge-duplicates`). A hundred syncs of the
same 23 reviews leave 23 rows. Reviews that disappear from Google are
soft-deleted — **only after a complete listing** (every page fetched), never
after a partial or failed one — and revived automatically if they reappear.

## 3. The sync (`supabase/functions/sync-google-reviews/`)

`sync.ts` is the logic (pure, tested); `index.ts` the HTTP wrapper.

1. `POST https://oauth2.googleapis.com/token` with the refresh token → access token
2. `GET https://mybusiness.googleapis.com/v4/accounts/{ACCOUNT}/locations/{LOCATION}/reviews?pageSize=50` — every page (`nextPageToken`), hard cap 40 pages. Each page also carries `averageRating` and `totalReviewCount`.
3. `GET https://mybusinessbusinessinformation.googleapis.com/v1/locations/{LOCATION}?readMask=metadata` → `placeId`, `mapsUri`, `newReviewUri` (optional; a failure here is ignored)
4. map `starRating` `ONE…FIVE` → 1…5 (reviews with an unspecified rating are skipped); anonymous reviewers are stored as *A Google user*
5. upsert the reviews, then soft-delete the missing ones, then write the summary with `last_sync_status = 'ok'`

**Fail safely.** Any exception → nothing is upserted or deleted, the summary
row gets `last_sync_status = 'error'`, `last_error` (secrets redacted),
`last_attempt_at`; `last_synced_at` is left alone; HTTP 502 is returned so
the cron history shows it. The website keeps showing the last successful
data indefinitely.

**Access control.** Every call must carry the `x-sync-secret` header equal
to the `SYNC_SECRET` secret (compared in constant time). The schedule file
refuses to run while its `<SYNC_SECRET>` placeholder is unreplaced (or the
value is under 16 characters): a `raise exception` at the top of its single
transaction, so nothing is created half-way. Deploy with
`--no-verify-jwt` (the anon JWT is public and would protect nothing).
Routes: `POST /` runs the sync; `GET /?discover=1` lists the accounts and
locations the token can see (to find the two IDs); `GET /?health=1` pings.

**Schedule.** `supabase/sql/schedule_google_reviews_sync.sql` creates a
`pg_cron` job (`17 3,15 * * *` UTC = every 12 h) that calls the function
through `pg_net`, reading the secret from **Supabase Vault** — so the secret
is never in the repository and never in the cron table in clear text.

**Tests.** `deno test --allow-read tools/qa/sync_google_reviews_test.ts` runs
the sync against a fake Google and a fake PostgREST that returns 409 on a
duplicate key unless the request asked for upsert semantics — proving:
pagination; summary from Google's aggregate; **three syncs → still N rows**;
soft-delete + revival; OAuth failure / Google 503 on page 2 / Supabase write
failure each leave the cache untouched and never soft-delete; error
messages contain no secret. `deno check` type-checks the function.
`python3 tools/qa/verify_sql.py` runs the migration and the schedule file on
a **real PostgreSQL** (with the Supabase roles and stub `cron`/`vault`
schemas, and Supabase's default "anon gets ALL on new tables" privileges in
place): migration idempotent; anon reads display columns only, cannot read
`last_error`, cannot write, cannot call `mark_missing`; upserts don't
duplicate; the cron file **raises** with the placeholder and creates nothing,
runs clean once replaced, and the job text holds the Vault lookup, never the
secret.

## 4. Selection and display rules (`js/reviews.js`)

Automatic, deterministic, and exactly what the label says ("Google Reviews
— most recent"):

1. only reviews with written text (the summary still counts all of them)
2. **strictly newest first by `create_time`** — whatever the star rating; no
   length preference, no quality scoring, no curation of any kind. A 1-star
   review that is among the three newest written reviews is shown. The
   overall rating and count carry the aggregate reputation.
3. cap at 3 (`data-greviews-max`)
4. the **same rule on every page**, Commercial included. Nothing decides what
   a review is "about" (the keyword classifier of v27 was removed in v28
   because it could present a homeowner's review as a commercial job).

In **fallback mode** (§5a) the cards are the three verified reviews in the
supplied order, labelled "Featured Google Reviews"; live and fallback are
never shown together.

Each card shows: stars (with an `aria-label`), the reviewer's display name
exactly as Google gives it (*A Google user* when anonymous), the text
verbatim (reviews over 320 characters are visually clamped with a *Read full
review* control — the text itself is untouched), a relative date (*3 weeks
ago* / *Mar 2026*) with a machine-readable `<time>`, and the attribution
**Google review**. Each section carries the label **Google Reviews**, a note
that reviews are shown as written and that the rating/count are Google's for
the whole profile, and a **Read all reviews on Google** link.

**The "all reviews" link**, in this order: (1) the explicitly configured,
verified URL — `site.config.json → business.googleReviewsUrl`, **set on
7 Oct 2026 (v30) to the public Google Maps listing** (§5c; a value beginning
with `REPLACE_` would mean "not configured"); (2) Google's own
`metadata.mapsUri`, synced into the summary row; (3) only then a URL built
from the synced `placeId` (`https://search.google.com/local/reviews?placeid=…`
— an undocumented pattern, kept as a last resort). None available → the link
is hidden, never invented. Because (1) is set, the link never depends on the
constructed form. Every Google link opens in a new tab with
`rel="noopener noreferrer"`.

**Google attribution.** Review content from the Business Profile APIs is
shown unmodified, with reviewer name, rating and date, labelled as Google's,
and linked back to Google. The site uses the word *Google* in text only — no
Google logo or lookalike mark — so nothing suggests Google endorses
Pellikal. Reviews Google stops returning stop being shown within one sync.

## 5. Fallback behaviour

### 5a. Bootstrap fallback for the API-approval waiting period (temporary)

Google's API approval takes 7–10 business days, but the Google proof is
wanted for the Ads conversion test now. So `site.config.json →
reviews.fallback` holds **verified data copied by hand from the public
Google Business Profile ("Pellikal Window Solutions") on 7 Oct 2026**:

- the summary: rating 5.0, 12 reviews — stamped by the build into
  `data-greviews-fallback-*` on the hero proof elements and the three review
  sections;
- **three real reviews** (Steven Matt · Maureen Paradine · Meryl Feldman),
  text verbatim — spelling and all, never edited — stamped as a JSON block
  inside each review section, in the supplied order.

Rules, all enforced in `js/reviews.js` and tested:

- Used **only** when Supabase has *positively* answered that no successful
  sync exists: a `2xx` row set with no row or a row whose `last_synced_at`
  is null, **or** PostgREST's own missing-table error for this table — HTTP
  404 with body `{"code":"PGRST205","message":"Could not find the table
  'public.google_review_summary' in the schema cache"}` (older PostgREST:
  code `42P01`, `relation "public.google_review_summary" does not exist`).
  The body is inspected; the status alone is never trusted (v30). Then: the
  hero line shows 5.0 / 12, and the review sections on the homepage,
  Residential and Commercial show the summary **and the three verified
  cards**, labelled **"Featured Google Reviews"** — never "most recent",
  because they were chosen for usefulness, not by date.
- The moment `google_review_summary` holds a successful sync, the live
  numbers **and the live cards replace all of it**. The fallback is never
  used again and the two sources are never mixed: one render, one source.
- Any other answer means the fallback is **not** used and nothing is shown
  — a network failure, HTTP 400 (malformed request), 401/403 (key or
  permission problem), a 404 that is not the missing-table error above, 406,
  any 5xx, a `2xx` whose body is not a row set, or a synced row with no
  usable numbers. The temporary 5.0 / 12 must never mask a real Supabase
  configuration error; the rest of the page and the quote form keep working
  (tested for every case in `verify_reviews.py` §4). In the waiting period
  the normal state is "reachable, no sync", which does show the fallback.
- Everything rendered from the fallback is marked
  `data-greviews-source="fallback"` (live: `"live"`) on the section, the
  hero element and each card — internal metadata only; the word is never
  shown to visitors. No "updated … ago" note in fallback mode.
- Links: the hero count and **Read All Reviews on Google** open the
  configured public Google Maps listing (§5c) in a new tab
  (`target="_blank" rel="noopener noreferrer"`); were no URL configured, the
  count would be plain text and the button not rendered — never a dead `#`
  link. With live data the count jumps to the on-page section and the
  button follows the §4 link priority (which the configured URL heads).
- Commercial shows the same general cards under a neutral heading; nothing
  calls the reviewers commercial clients.
- It cannot overwrite anything: the site never writes to Supabase (every
  request it makes is a GET — asserted in every test mode).

**Remove it after the first successful sync:** in `site.config.json →
reviews.fallback` set `rating` and `count` to `null` and `reviews` to `[]`,
run `python3 tools/build.py`, publish. (Leaving it in is harmless — live
data wins — but stale numbers in the config are a maintenance trap.)

### 5c. Pellikal's Google reviews URL (set 7 Oct 2026, v30)

`site.config.json → business.googleReviewsUrl` is the **public** Google Maps
listing of "Pellikal Window Solutions":

```
https://www.google.com/maps/search/?api=1&query=Pellikal+Window+Solutions&query_place_id=ChIJtUq8B35lwokR1llyrUB1VWc
```

`python3 tools/build.py` copies it into every `data-greviews-url` attribute
and into the `href` of every **Read all reviews on Google** button, so no
`#` placeholder ships. It is used in both fallback and live mode (first in
the priority list, §4). Rules: the URL must be the public listing — never
the signed-in Business Profile *management* URL, nothing containing
`authuser=`, `/customers/reviews` or any other account-specific parameter —
and it must start with `https://` (the build refuses anything else). To
change it, edit the config only and rebuild; a value beginning with
`REPLACE_` means "not configured", in which case no link is shown anywhere
— the site never invents one.

### 5b. Runtime

| Situation | What happens |
|---|---|
| Google API down / quota / OAuth expired | sync records an error; the cached data keeps showing; nothing is deleted |
| Supabase sync fails to write | same |
| Supabase unreachable from the browser, or answers with an error (400, 401/403, a 404 other than "table not found", 406, 5xx, a non-JSON body) | the review elements stay hidden — the fallback is **not** used, so a configuration problem is never masked; hero, form, everything else unaffected (verified for every case) |
| sync has never run (table exists with no synced row, or the table has not been created yet — PostgREST's own missing-table answer) | hero trust line and the review sections show the verified bootstrap data (§5a: summary + three real cards labelled "Featured Google Reviews"); nothing invented |
| no review qualifies for a card | rating + count still show; the card block stays hidden |
| `js/reviews.js` blocked | elements stay hidden |

The browser also keeps a 15-minute `sessionStorage` cache of the two rows
(live data only), so a second page in the same visit makes no request at all.

## 6. Performance

`js/reviews.js` (~15 KB unminified, no dependencies — it does **not** load
the Supabase client library) is loaded with `defer`. Two requests, two
speeds: the tiny **summary** request is issued the instant the deferred
script runs — the document is parsed, DOMContentLoaded has not fired yet —
so the hero trust line appears as early as the network allows (tested: the
fetch is called at `readyState: interactive`, before DOMContentLoaded). The
**review cards** request waits for the `load` event and an idle callback, so
it never competes with images. The hero and form render with no dependency
on either; both are asynchronous and every failure is swallowed. No
third-party widget, no iframe, no images from Google.

## 7. Analytics

Nothing existing changed: GA4, GTM, Consent Mode, Formspree,
`generate_lead`, the quote funnel events, `click_to_call` / `click_to_text`
are untouched (`js/tracking.js`, `js/main.js` byte-identical to v26).

One **optional, diagnostic** event: `google_reviews_click`, pushed through
the existing allow-list when a *Read all reviews* link is used, with
`cta_location` (`residential_reviews` · `home_reviews` ·
`commercial_reviews`) and `page_type` (`residential` · `home` ·
`commercial`). `page_location` is not pushed by the site because GA4
attaches it to every event automatically. **It must never be configured as a
conversion or key event.** To see it in GA4, add the event name to the
`GA4 - Pellikal Custom Events` trigger in GTM (manual, optional).

## 8. Files

| File | Role |
|---|---|
| `supabase/migrations/0004_google_reviews.sql` | tables, RLS, grants, `google_reviews_mark_missing()` |
| `supabase/functions/sync-google-reviews/index.ts`, `sync.ts` | the Edge Function |
| `supabase/sql/schedule_google_reviews_sync.sql` | pg_cron + pg_net + Vault schedule (run by hand) |
| `supabase/.env.example` | placeholder secrets; copy to `supabase/.env` (git-ignored) |
| `.gitignore` | new — keeps `supabase/.env` out of the public repo |
| `js/reviews.js` | the browser half |
| `css/styles.css` § 17 | `.gproof`, `.greviews`, `.greview`, `.gstars` |
| `index.html`, `residential/index.html`, `commercial/index.html` | the markup; `data-greviews-url` and the "Read all reviews" `href` kept in sync by the build |
| `site.config.json` → `business.googleReviewsUrl` | the public Google Maps listing (set 7 Oct 2026); first choice for every Google link, fallback and live |
| `tools/build.py` | stamps `data-greviews-url` and the "Read all reviews" `href` from the config (refuses a non-public / non-https URL) |
| `tools/qa/verify_reviews.py`, `tools/qa/sync_google_reviews_test.ts`, `tools/qa/verify_sql.py` | the tests (browser · sync logic · real PostgreSQL) |
| `site.config.json` → `reviews.fallback` | the temporary bootstrap snapshot (§5a); stamped by the build |

The CMS **testimonials** table and the `/admin/` testimonials editor still
exist and are untouched (nothing destructive), but the homepage no longer
renders them — Google reviews took that slot. `js/main.js`'s
`loadTestimonials()` finds no `#quotes` container and does nothing.


## 10. Brand name: "Pellikal Window Solutions" vs "Pellikal Window Enhancements" — FLAGGED, not changed

The Google Business Profile shows **Pellikal Window Solutions**; the
repository uses **Pellikal Window Enhancements** everywhere except one
`alternateName`. Nothing was renamed — legal pages may use a registered
name on purpose. Inventory (7 Oct 2026):

| Where | What it controls | Name used |
|---|---|---|
| `partials/footer.html` line 23 | the visible **© footer** on every page (stamped by the build) | Enhancements |
| `<meta property="og:site_name">` in all 14 pages (incl. `/admin/`) | the site name on **social/link previews** | Enhancements |
| JSON-LD `"name"` in `index.html`, `residential/`, `commercial/`, `solutions/`, `window-inserts/` (`HomeAndConstructionBusiness`) | the **schema.org business name** search engines read | Enhancements — the homepage also carries `"alternateName":"Pellikal Window Solutions"` |
| `<title>` of `privacy/`, `terms/`, `accessibility/` | browser tab / search result title of the legal pages | Enhancements |
| `privacy/index.html` body text (×2: "How … handles the information", "Who we are") and `terms/index.html` body text (×1: "This website is operated by …") | the **legal identity** named in the policies | Enhancements |
| `site.config.json → business.name`, `site.webmanifest → name`, `README.md` | config value (not stamped into pages by the build today), PWA/home-screen name, docs | Enhancements |
| **Google review attribution on the site** | the cards say "Google review" and the summary says "on Google" — **no business name is rendered** with reviews, so attribution is not affected by the discrepancy. The reviews themselves live under "Pellikal Window Solutions" on Google. | — |
| **Google Ads / GA4 / GTM** | not in the repository; account names are set in Google's UIs | — |

**Recommended migration plan, once you confirm which name is canonical:**

1. Decide the canonical **trading name** (the one customers see — if the
   Business Profile stays "Pellikal Window Solutions", that is the strongest
   candidate, because Google reviews, Maps and the Ads landing pages should
   match) and whether the **legal entity name** differs. If they differ, the
   legal pages keep the legal name and gain one line: *"… trading as
   Pellikal Window Solutions"*; everything customer-facing uses the trading
   name.
2. Make the build the single source: stamp `business.name` into the footer
   ©, `og:site_name` and the JSON-LD `name` (one regex each in
   `tools/build.py → sync_contact_details()`, same pattern as the phone
   number), keep the other name as JSON-LD `alternateName` on every schema
   page, and set `site.webmanifest`. One edit in `site.config.json` then
   changes all 14 pages.
3. Edit the three legal pages by hand (titles + body text) **only after your
   approval**, with the "Last updated" dates bumped.
4. Google side: Business Profile name is edited at business.google.com and
   may trigger Google's re-verification; Ads account name is cosmetic. Keep
   the name in Business Profile and on the site identical so the Google
   reviews a visitor reads and the site they are on carry the same name.
5. Re-run the build twice and the three suites; `TRADEMARK-REVIEW.md` and
   `OWNER-LEGAL-REVIEW.md` get a line each.

Nothing in this list is done yet. The reviews integration works with either
name.

---

# GOOGLE BUSINESS PROFILE SETUP REQUIRED

Everything below is done once, by the owner (or whoever manages the Google
Business Profile), outside the repository. Until step 9 succeeds the site
shows the verified temporary snapshot and review cards (§5a); once it
succeeds, live data replaces them completely. Allow a few days: Google
approves API access by hand.

**You will need:** the Google account that *manages* the Pellikal Business
Profile (the one you use at business.google.com), access to the Supabase
project dashboard, and the Supabase CLI on a computer (`npm i -g supabase`
or https://supabase.com/docs/guides/cli).

### 1. Create a Google Cloud project and enable the APIs

1. Go to https://console.cloud.google.com — sign in with the **same Google
   account that manages the Pellikal Business Profile**.
2. Top bar → project selector → **New project** → name it `Pellikal Reviews
   Sync` → Create → make sure it is selected.
3. Left menu → **APIs & Services → Library**. Search for and **Enable** each
   of these three (they are separate):
   - **Google My Business API** (this is the one that serves reviews — the
     "v4" API)
   - **My Business Account Management API** (to find your account ID)
   - **My Business Business Information API** (to find your location ID and
     the "all reviews" link)

### 2. Request access to the Business Profile APIs

Unlike most Google APIs these are **not usable until Google approves your
project**. Until then every call returns a "quota exceeded / 0 requests"
error even though the APIs are enabled.

1. Open https://developers.google.com/my-business/content/prereqs and follow
   **"Request access"** → the Business Profile APIs access request form.
2. Fill it in with: your project's **Project ID** (Cloud Console → project
   selector shows it), the business name *Pellikal Window Enhancements*, the
   website, and a plain description such as *"Display our own Business
   Profile reviews and rating on our own website, synced twice a day."*
   Choose that you are an **end user / business owner**, not an agency or
   platform.
3. Wait for the approval email (typically several business days). Nothing
   else in this guide works before that.

### 3. Which Google account must authorise it

The OAuth sign-in in step 7 must be done by a Google account that is an
**Owner or Manager** of the Pellikal location in Business Profile. Check at
https://business.google.com → the location → *Business Profile settings →
People and access*. Use the primary owner's account if in doubt; the refresh
token will carry that account's permissions.

### 4. Find the account ID

You can do this after step 8 with the function's **discover** mode (easiest),
or now with the OAuth Playground from step 7. The result looks like
`accounts/1234567890` — the number after `accounts/` is
`GOOGLE_BUSINESS_ACCOUNT_ID`. (Use the account that *contains* the Pellikal
location — usually the personal account; if the location sits in a
*location group*, use that group's ID.)

### 5. Find the location ID

Same place: the location is listed as `locations/9876543210` — the number is
`GOOGLE_BUSINESS_LOCATION_ID`. The discover output shows the location's
**title and address** next to it so you can be sure it is the right one.

### 6. Create the OAuth credentials

1. Cloud Console → **APIs & Services → OAuth consent screen**:
   - User type **External** → Create
   - App name `Pellikal Reviews Sync`, your email as support + developer
     contact → Save
   - **Scopes**: Add or remove scopes → paste
     `https://www.googleapis.com/auth/business.manage` → Update → Save
   - **Test users**: add the Google account from step 3
   - Back on the summary page: **Publish app → Confirm** (status
     *In production*). **Do not skip this:** while the app is *Testing*,
     Google expires the refresh token after **7 days** and the sync would
     silently stop. Publishing does not require Google's verification for
     your own private use; ignore the "unverified app" warning during step 7.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**, name `reviews-sync`
   - Authorised redirect URIs → add exactly
     `https://developers.google.com/oauthplayground`
   - Create → copy the **Client ID** (`…apps.googleusercontent.com`) and the
     **Client secret** (`GOCSPX-…`). These are `GOOGLE_CLIENT_ID` and
     `GOOGLE_CLIENT_SECRET`.

### 7. Obtain the refresh token

1. Open https://developers.google.com/oauthplayground
2. Click the **gear icon** (top right) → tick **Use your own OAuth
   credentials** → paste the Client ID and Client secret → Close.
3. In **Step 1** on the left, scroll to or type the scope
   `https://www.googleapis.com/auth/business.manage` → **Authorize APIs**.
4. Sign in with the account from step 3 → *Continue* through the
   "Google hasn't verified this app" screen (Advanced → Go to Pellikal
   Reviews Sync) → **Allow**.
5. **Step 2**: click **Exchange authorization code for tokens**. Copy the
   **Refresh token** (starts with `1//`). That is `GOOGLE_REFRESH_TOKEN`.
   Never paste it anywhere except Supabase secrets.

(While you are here you can also find the IDs for steps 4–5: in **Step 3**,
set *Request URI* to
`https://mybusinessaccountmanagement.googleapis.com/v1/accounts` → *Send the
request* → read `"name": "accounts/…"`; then
`https://mybusinessbusinessinformation.googleapis.com/v1/accounts/ACCOUNT_ID/locations?readMask=name,title`
→ read `"name": "locations/…"`. Or use discover mode in step 8.)

### 8. Where each environment variable is entered

Secrets go **only** into the Supabase Edge Function. Never into
`js/config.js`, never into any page, never into Git.

1. Run the migration once: Supabase dashboard → **SQL Editor → New query** →
   paste all of `supabase/migrations/0004_google_reviews.sql` → **Run**. (Safe
   to re-run.)
2. On your computer, in the repository folder:
   ```
   supabase login
   supabase link --project-ref btmkronkwvtcvqcwefsi
   cp supabase/.env.example supabase/.env       # then edit supabase/.env with real values
   ```
   `supabase/.env` is git-ignored. Fill in:

   | Variable | Value | From |
   |---|---|---|
   | `GOOGLE_CLIENT_ID` | `…apps.googleusercontent.com` | step 6 |
   | `GOOGLE_CLIENT_SECRET` | `GOCSPX-…` | step 6 |
   | `GOOGLE_REFRESH_TOKEN` | `1//…` | step 7 |
   | `GOOGLE_BUSINESS_ACCOUNT_ID` | digits only | step 4 (or discover, below) |
   | `GOOGLE_BUSINESS_LOCATION_ID` | digits only | step 5 (or discover, below) |
   | `SYNC_SECRET` | a random string, 32+ chars (`openssl rand -hex 32`) | you |

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the
   function automatically — do not set them.
3. Push the secrets and deploy the function:
   ```
   supabase secrets set --env-file supabase/.env
   supabase functions deploy sync-google-reviews --no-verify-jwt
   ```
   (Alternatively paste each secret in Dashboard → **Edge Functions →
   Secrets**, and deploy from the dashboard; `--no-verify-jwt` corresponds to
   turning off *Verify JWT* for the function.)
4. **Discover the IDs** if you did not get them in step 7 — in a terminal
   (replace the secret):
   ```
   curl -s -H "x-sync-secret: YOUR_SYNC_SECRET" \
     "https://btmkronkwvtcvqcwefsi.supabase.co/functions/v1/sync-google-reviews?discover=1"
   ```
   It prints every account and location the token can see, with
   `accountId` / `locationId` ready to paste. Update `supabase/.env`, run
   `supabase secrets set --env-file supabase/.env` again.

### 9. Run the first manual sync

```
curl -s -X POST -H "x-sync-secret: YOUR_SYNC_SECRET" \
  "https://btmkronkwvtcvqcwefsi.supabase.co/functions/v1/sync-google-reviews"
```

Expected: HTTP 200 and `{"ok": true, "fetched": N, "upserted": N,
"softDeleted": 0, "pages": 1, "averageRating": 4.9, "totalReviewCount": N}`.

If it says `"ok": false`: the `error` field says why — `invalid_grant` means
the refresh token is wrong or expired (step 6, publishing status; redo step
7); `HTTP 403` / `quota` from Google means step 2's approval is not through
yet; `HTTP 404` on the reviews list means a wrong account/location ID (step
8.4); `403 forbidden` from the function itself means the secret header does
not match.

### 10. Confirm Supabase received the reviews

Dashboard → **Table Editor**: `google_review_summary` has one row with your
rating, count, `last_sync_status = ok` and `last_synced_at` just now;
`google_reviews` has one row per review. Or SQL Editor:

```sql
select average_rating, total_review_count, last_sync_status, last_synced_at from public.google_review_summary;
select reviewer_name, star_rating, left(comment, 60), create_time from public.google_reviews where deleted_at is null order by create_time desc;
```

Then open the website (after the site itself is published): the Residential
hero shows the **live** rating line (the element's `data-greviews-source`
is now `live`, not `fallback`) and the review sections show the live
reviews under "Google Reviews — most recent". Now remove the bootstrap
data: `site.config.json → reviews.fallback` → `rating` and `count` to
`null`, `reviews` to `[]`, rebuild, publish (§5a). The hero count and the
"Read all reviews on Google" button open the public listing configured in
`business.googleReviewsUrl` (§5c) whether or not Google returned a
`place_id`.

### 11. Confirm the scheduled refresh is working

1. Dashboard → **Database → Extensions** → enable **pg_cron** and **pg_net**
   (or let the SQL do it).
2. SQL Editor → paste `supabase/sql/schedule_google_reviews_sync.sql`,
   replace `<SYNC_SECRET>` on the line marked **REPLACE** with your secret →
   **Run**. (It stores the secret in Supabase Vault and schedules 03:17 and
   15:17 UTC daily = every 12 h.) If you forget to replace it, the file stops
   with *"the <SYNC_SECRET> placeholder has not been replaced…"* and changes
   nothing — fix the line and run again.
3. Check the job exists and, after the next run time, that it ran:
   ```sql
   select jobname, schedule, active from cron.job where jobname = 'sync-google-reviews';
   select start_time, status, return_message from cron.job_run_details
     where jobid = (select jobid from cron.job where jobname = 'sync-google-reviews') order by start_time desc limit 5;
   select created, status_code from net._http_response order by created desc limit 5;   -- 200 = synced, 502 = Google error, 403 = wrong secret
   select last_sync_status, last_synced_at, last_attempt_at, last_error from public.google_review_summary;
   ```
   `last_attempt_at` advancing every 12 h with `last_sync_status = ok` is the
   proof. A new Google review appears on the site within 12 hours of being
   posted (or immediately after a manual run of step 9), with no edit to the
   website.

**If a sync ever fails**, the site keeps showing the previous data; look at
`last_error` and Dashboard → **Edge Functions → sync-google-reviews → Logs**.
The most common cause is an expired refresh token (app left in *Testing*):
fix the publishing status (step 6) and repeat step 7 + `supabase secrets set`.
