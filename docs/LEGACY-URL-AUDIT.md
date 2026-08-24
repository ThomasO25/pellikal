# LEGACY-URL-AUDIT.md

Audit of the duplicate-looking `/page/` vs `/page.html` structures.
**Audited:** 24 August 2026

---

## Short answer

There is **no duplicate-content problem**. Every `.html` file at the repository
root is a **redirect forwarder**, not a page. Each one is `noindex`, canonicals
to the folder URL, and immediately forwards. They should **stay**.

---

## Why they exist

The site originally used addresses like `pellikal.com/about.html`. It now uses
`pellikal.com/about/`. Google, directories and any existing backlinks still hold
the old addresses. Each old address remains as a small forwarder so those links
resolve instead of 404ing, passing their value to the current URL.

Deleting them would break existing inbound links and discard whatever ranking
they carry. **Do not delete them.**

---

## What each legacy file contains

Roughly ten lines, and nothing else:

```html
<meta name="robots" content="noindex">
<link rel="canonical" href="https://www.pellikal.com/about/">
<meta http-equiv="refresh" content="0; url=about/">
```

plus a visible clickable link as a no-JavaScript fallback, and a comment saying
`REDIRECT ONLY — this is not a real page`.

They are **generated** by `tools/build.py`. Never hand-edit them.

---

## Full inventory

| Legacy URL | Forwards to | Indexable? | Canonical | Keep? |
|---|---|:--:|---|:--:|
| `/about.html` | `/about/` | No | `/about/` | ✅ Keep |
| `/commercial.html` | `/commercial/` | No | `/commercial/` | ✅ Keep |
| `/contact.html` | `/contact/` | No | `/contact/` | ✅ Keep |
| `/faq.html` | `/faq/` | No | `/faq/` | ✅ Keep |
| `/residential.html` | `/residential/` | No | `/residential/` | ✅ Keep |
| `/solutions.html` | `/solutions/` | No | `/solutions/` | ✅ Keep |
| `/privacy.html` | `/privacy/` | No | `/privacy/` | ✅ Keep |
| `/terms.html` | `/terms/` | No | `/terms/` | ✅ Keep |
| `/accessibility.html` | `/accessibility/` | No | `/accessibility/` | ✅ Keep |
| `/admin.html` | `/admin/` | No | `/admin/` | ✅ Keep (private either way) |
| `/local-law-97.html` | **`/commercial/`** | No | `/commercial/` | ✅ Keep — **retired**, see below |

---

## Retired: Local Law 97

`/local-law-97/` and `/local-law-97.html` are the only **retired** URLs — the
content is gone, not moved to an equivalent page.

Both now point at `/commercial/`, are `noindex`, canonical to `/commercial/`,
carry no Local Law 97 marketing material, and include a plain clickable link as
a fallback. Removed from `sitemap.xml`. Full detail in
`docs/LOCAL-LAW-REMOVAL.md`.

---

## SEO risk assessment

| Risk | Status |
|---|---|
| Duplicate content between `/about/` and `/about.html` | ❌ Not possible — the legacy file is `noindex` + canonical and carries no content |
| Google indexing both versions | ❌ No — one is explicitly excluded |
| Crawl budget waste | Negligible — ten tiny files |
| Broken inbound links if deleted | ⚠️ **This is the actual risk.** Keep them. |
| Conflicting canonicals | ❌ No — every legacy file canonicals to its folder URL |

### One GitHub Pages limitation, stated honestly

GitHub Pages cannot issue real HTTP **301** redirects — there is no server
config. A meta-refresh plus canonical is the strongest static option available,
and Google does treat a meta-refresh with `content="0"` as a redirect signal.
Only a move to a host with redirect rules (Cloudflare Pages, Netlify) would give
true 301s. Not worth migrating for this alone.

---

## Recommendation

Leave all legacy files exactly as they are. They are generated automatically:
add a page to `site.config.json` with `"redirect": true` and its forwarder is
created on the next build.
