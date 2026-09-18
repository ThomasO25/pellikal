# COOKIE-TRACKING-INVENTORY.md

Every technology on pellikal.com that stores or transmits something about a
visitor. **14 September 2026.** Change this file whenever GTM changes — the
repo cannot see inside the container, so this list is only as current as the
last person who checked.

Preferences are changed via **Tracking preferences** (footer of every page,
and inline in the privacy policy), or `?consent=reset`.

| Provider | Purpose | Category | Loads when | Consent required | Data (high level) | Where set |
|---|---|---|---|---|---|---|
| **Pellikal** — `pellikal_consent` cookie (+ `localStorage` mirror) | Remembers the visitor's tracking choice, 180 days | Necessary | On saving a choice | No (it *is* the consent record) | version, analytics flag, advertising flag, date. No personal data. | `js/consent.js` |
| **Supabase Auth** — session in `sessionStorage` | Keeps a staff member signed in on `/admin/` for that tab only | Necessary (admin page only) | On admin sign-in | No | auth tokens for that session | `js/admin.js` |
| **Google Tag Manager** (`GTM-MK2PHWB`) | Container that loads the tools below | — | Every tracked page, after Consent Mode defaults | Loads regardless; **every tag inside it obeys the consent state** (Google tags automatically; custom tags only if gated) | technical request data to Google | `tools/build.py` |
| **Google Analytics 4** (`G-J8SQ4CC7BT`) | Visits, pages, sources, in aggregate | Analytics | Via GTM | `analytics_storage = granted` | Google's own cookies/identifiers when granted; limited cookieless pings when denied | inside GTM |
| **Google Ads** (`AW-859941989`) | Conversion measurement on the `generate_lead` event; remarketing | Advertising | Via GTM | `ad_storage`, `ad_user_data`, `ad_personalization` all `granted` | advertising identifiers when granted; redacted cookieless pings when denied (`ads_data_redaction`) | inside GTM |
| **Microsoft Clarity** | Session replay / heatmaps | Analytics | Via GTM — **must be paused or gated on `analytics_storage`** | Would be `analytics_storage` | session recordings | inside GTM — **not visible from this repo** |
| **Formspree** | Delivers the consultation form by email | Necessary to the action the visitor chose | Only on form submit | No — it is the service the visitor is using | the fields they typed | `partials/quote-form.html`, `js/main.js` |
| **Supabase** (REST) | Public CMS content (projects, testimonials, editable text) | Necessary | Every public page | No | none about the visitor beyond the request itself | `js/main.js` |
| **Google Fonts** | The Mulish typeface | — | Every page, before any choice | Cannot be gated from the dialog | IP/technical data to Google to serve the file; no cookies | page `<head>` — disclosed in the privacy policy; self-hosting recommended |
| **GitHub Pages** | Hosting | — | Every request | No | standard server logs | hosting |

Not on the site: call tracking, chat widgets, Meta/other pixels, A/B tools.
If any is added — in code or in GTM — add it here, gate it, and update
`privacy/index.html` the same day.

**Exact third-party cookie names and lifetimes are not listed** because they
are set by Google and change under Google's control. Google documents them.
