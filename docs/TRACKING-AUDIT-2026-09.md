# TRACKING-AUDIT-2026-09.md

Why Google reports "some pages not tagged," and what to do about it.
**Audited:** 10 September 2026 · against the live site and the repository

---

## Verdict up front

**The GTM template is correct and consistent.** `GTM-MK2PHWB` is on every
content page — one official head snippet, one `<noscript>` — including the new
`/window-inserts/` page. There are **no** duplicate containers and **no**
direct `gtag.js` installs for `G-J8SQ4CC7BT` or `AW-859941989`.

The four URLs Google flags are **URL variants and one intentional exclusion**,
not missing tags. Nothing in the page templates was broken.

---

## The four flagged URLs, explained

| Google reports | What it actually is | Tagged? | Action |
|---|---|---|---|
| `/contact` (no slash) | GitHub Pages issues a **301 redirect** to `/contact/`. A redirect response has no HTML, so Google sees "no tag." | n/a — it's a redirect | **No code fix possible.** Stop feeding Google the slash-less URL (see below). |
| `/privacy` (no slash) | Same — 301 → `/privacy/` | n/a | Same |
| `/local-law-97/` | A retired page that redirects to `/commercial/`. It is `noindex` and **intentionally untagged**: tagging a page whose only job is to redirect would fire a junk pageview every hit. | No, by design | Leave. Google will drop it as it honours `noindex`. |
| `/residential/` "no recent data" | Fully tagged. "No recent data" means the container is present but that URL simply hasn't received a hit in the reporting window. | **Yes** | Nothing — a traffic-timing artifact. Will clear with Ads traffic. |

### Where the slash-less URLs come from

The website never links to `/contact` or `/privacy` without the trailing slash
— every internal link, canonical, sitemap entry and menu item uses `/contact/`.
Google is learning those variants from **outside the site**, most likely:

- Google Ads **final URLs** entered without the trailing slash
- The Google Business Profile website field
- Old links from the previous Wix site

Each one produces a 301 hop before the tagged page loads. That is harmless for
visitors but shows up as a "not tagged" URL in the coverage tool and can split
attribution.

### `/residential//` (double slash)

Also from an external source. GitHub Pages serves it; the page's `canonical`
tag points to `/residential/` so search engines consolidate it. No code change
is needed; fix the source of the malformed link.

---

## What the site does

| Check | Result |
|---|---|
| GTM head snippet, every content page | ✅ 12/12 |
| GTM `<noscript>`, every content page | ✅ 12/12 |
| GTM on `/window-inserts/` | ✅ from day one |
| GTM on `/admin/` | ❌ excluded on purpose (private staff tool) |
| Duplicate containers | ✅ none |
| Hard-coded `gtag(` / `G-` / `AW-` in page code | ✅ none |
| Internal links without trailing slash | ✅ none |
| Internal links with `//` | ✅ none |
| Canonicals | ✅ all trailing-slash form |
| Sitemap | ✅ trailing-slash form, 11 URLs, includes `/window-inserts/` |
| Thank-you page | **None.** Success is shown inline; the conversion fires on Formspree's HTTP success. A reload or direct visit cannot fake a lead. |

---

## Action list

### Damian (Google Ads / GTM)
- [ ] In Google Ads, set every **final URL** to the trailing-slash form:
      `https://www.pellikal.com/contact/`, `/residential/`, `/window-inserts/`
- [ ] Same for any sitelink or asset URLs
- [ ] For the flagged coverage report: expect `/contact` and `/privacy` to
      disappear once nothing external points at them; expect `/local-law-97/`
      to disappear as Google honours `noindex`. Neither needs a tag.
- [ ] **Do not press "Add to workspace" for Google's suggested tags.** The
      container may already contain GA4 and Ads destinations. Audit the
      existing tags first; a second `AW-859941989` tag double-counts.

### Owner
- [ ] Check the **Google Business Profile** website field — it should be
      `https://www.pellikal.com/` with the slash.

### Could not be verified locally
- Whether GA4/Ads tags **inside** the GTM container are configured correctly —
  that lives in Google's UI, not the repo. Verify with GTM Preview on the live
  site (see MARKETING-HANDOFF.md §8).
- Which of the two Pellikal GA properties is receiving data. Anchor on
  `G-J8SQ4CC7BT`; open GA4 → Admin → Data Streams and confirm that stream's
  measurement ID matches. **Do not delete the other property** — export or
  archive it if needed.
