# GOOGLE-TAG-AUDIT.md

Every Google tracking instance in the repository.
**Audited:** 24 August 2026

---

## Verdict

| Check | Result |
|---|---|
| GTM container installed | ✅ `GTM-MK2PHWB`, one head snippet + one noscript per public page |
| Duplicate GTM containers | ✅ **None** |
| Hard-coded `gtag(` calls | ✅ **Zero** anywhere in the repository |
| Hard-coded GA4 (`G-…`) in page code | ✅ **Zero** |
| Hard-coded Google Ads (`AW-…`) in page code | ✅ **Zero** |
| Old/wrong GA4 `G-TPD5SKWWVC` active anywhere | ✅ **No** — purged |
| GTM on `/admin/` | ✅ **Absent** by design |
| Site works with GTM blocked | ✅ Verified |

**No duplicate implementations needed removing** — there were none to remove.

---

## Per-file audit

`head` = official GTM `<head>` snippet · `ns` = `<noscript>` iframe

| File | head | ns | `gtag(` | `G-` | `AW-` | Notes |
|---|:--:|:--:|:--:|:--:|:--:|---|
| `index.html` | 1 | 1 | 0 | 0 | 0 | |
| `residential/index.html` | 1 | 1 | 0 | 0 | 0 | |
| `commercial/index.html` | 1 | 1 | 0 | 0 | 0 | |
| `solutions/index.html` | 1 | 1 | 0 | 0 | 0 | |
| `about/index.html` | 1 | 1 | 0 | 0 | 0 | |
| `faq/index.html` | 1 | 1 | 0 | 0 | 0 | |
| `contact/index.html` | 1 | 1 | 0 | 0 | 0 | |
| `privacy/index.html` | 1 | 1 | 0 | 0 | 0 | |
| `terms/index.html` | 1 | 1 | 0 | 0 | 0 | |
| `accessibility/index.html` | 1 | 1 | 0 | 0 | 0 | |
| `404.html` | 1 | 1 | 0 | 0 | 0 | |
| `admin/index.html` | 0 | 0 | 0 | 0 | 0 | **Excluded on purpose** |
| `local-law-97/index.html` | 0 | 0 | 0 | 0 | 0 | Bare redirect — excluded |
| Legacy `*.html` redirect stubs (10) | 0 | 0 | 0 | 0 | 0 | Forwarders only; no tracking needed |

### Why `/admin/` is excluded
It is the owner's private content manager. Tracking staff activity there would
inflate engagement metrics, distort bounce and session data, and pollute
remarketing audiences with the business's own visits.

### Why `/local-law-97/` is excluded
It is a retired URL that redirects immediately to `/commercial/`. A pageview
there would be noise, and the visitor is measured properly on `/commercial/`.

---

## Where the IDs live

| ID | Value | Location | Installed on pages? |
|---|---|---|---|
| GTM container | `GTM-MK2PHWB` | `site.config.json` → `analytics.gtmContainerId` | **Yes** — stamped into every public page by `tools/build.py` |
| GA4 measurement | `G-J8SQ4CC7BT` | `site.config.json` → `analytics.ga4MeasurementId` | **No — by design.** Configure inside GTM |
| Google Ads | `AW-859941989` | `site.config.json` → `analytics.googleAdsId` | **No — by design.** Configure inside GTM |
| Retired GA4 | `G-TPD5SKWWVC` | Recorded once in `site.config.json` as `_retiredGa4` **only** so nobody re-adds it | **No** |

Changing the container ID is a one-line edit in `site.config.json` followed by
`python3 tools/build.py`, which restamps the head snippet and the `<noscript>`
fallback on every page. Hand-editing a page is pointless — the build overwrites it.

---

## Architecture

```
Pellikal website
   └── GTM-MK2PHWB          ← the only tag on the pages
         ├── GA4  G-J8SQ4CC7BT          (configure in GTM)
         ├── Google Ads  AW-859941989   (configure in GTM)
         └── conversion tags + future call tracking
```

**Rule:** never add a second Google snippet to a page. If GA4 is configured both
in GTM and directly in the HTML, every page view is counted twice and every
report becomes untrustworthy.

---

## Resilience

The GTM snippet is Google's official asynchronous loader. If the container is
blocked by an ad blocker, a corporate proxy or a privacy browser:

- the page still renders completely (verified with `googletagmanager.com` blocked)
- `window.dataLayer` is still initialised, so no script throws
- all events still push to `dataLayer` harmlessly
- forms, phone links, text links, email links, Supabase and the gallery all work

Tracking is additive. Nothing on the site depends on it.
