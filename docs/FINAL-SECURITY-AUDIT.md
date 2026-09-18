# FINAL-SECURITY-AUDIT.md

Production readiness pass — security, privacy, accessibility, legal-readiness,
reliability. **14 September 2026.**

This document deliberately separates what was proven from what was not. A
static repository cannot prove anything about live GTM, live Supabase, live
Formspree or the law. Nothing below says "compliant" or "secure" as an
absolute, because nothing can.

---

## VERIFIED IN CODE (read, grepped, reasoned about)

| Item | Result |
|---|---|
| Secrets | Only the Supabase **anon** key ships (JWT `role: anon`, decoded and checked). No `service_role`, no `sb_secret`, no private keys anywhere in the repo. |
| XSS sinks | No `innerHTML` with data, no `insertAdjacentHTML`, no `eval`, no `new Function`, no `document.write`, no inline event handlers. The one `innerHTML` is a static SVG string for the back-to-top button (no data). All CMS text goes through `textContent`. |
| URL safety | `safeUrl()` accepts `http(s)://` only. `javascript:`, `data:`, `vbscript:` are rejected. |
| `target=_blank` | None without `rel=noopener` (there are none at all). |
| RLS | Enabled on all six tables: `app_admins`, `admin_audit_log`, `site_content`, `projects`, `gallery_images`, `testimonials`. |
| Public reads | `*_public_read` policies only; grants are `select` for `anon`. |
| Writes | Every `*_admin_all` policy uses `is_admin_mfa()` — `is_admin()` (UUID allow-list, `SECURITY DEFINER`) **and** `has_aal2()` (JWT `aal = aal2`). Enforced in Postgres, not just the UI. |
| `app_admins` | `insert/update/delete` revoked from `anon` and `authenticated`. Not writable from the browser. |
| Audit log | Client `insert/update/delete` revoked; rows come only from `SECURITY DEFINER` triggers. |
| Storage | `gallery` bucket: public read; write/update/delete require `is_admin_mfa()`; 8 MB cap; `image/jpeg`, `image/png`, `image/webp` only. |
| Admin page | `noindex,nofollow`; no GTM container; no consent banner (nothing to consent to). |
| Formspree ID | `maewnodj`, single source in `js/config.js`, read by the build into the shared form. |
| Lead flow | Redirect only inside `r.ok`; failures stay put; events fire once; no PII in the dataLayer, URL or `/thankyou/`. |
| Consent Mode defaults | Generated above the GTM snippet on every tracked page. A rebuild restores order. |
| Consent storage | `pellikal_consent = v2:a<0|1>:d<0|1>:YYYY-MM-DD`. Version, two flags, date. Nothing else. |
| Supabase JS | **Vendored** at `js/vendor/supabase-js-2.116.0.js` (MIT licence alongside). This is the exact `dist/umd/supabase.js` that jsDelivr resolved `@supabase/supabase-js@2` to on 14 Sep 2026 — a freeze of what was already live, **not an upgrade**. No page loads from a CDN any more; the build warns if one does. |
| Admin session | Now **session-only** (`sessionStorage`). Refresh token no longer persists in `localStorage`. |
| GTM `<noscript>` | **Removed** from every page. See Consent section below for why. |
| Referrer policy | `strict-origin-when-cross-origin` meta on every page including `/admin/`. |
| Gallery alt bug | Fixed: `row.alt_text` is first choice; caption fallback; no invented ownership string. Same for CMS projects (`p.alt_text || p.title || ""`). |
| Dead asset | `assets/images/exterior-modern.jpg` (2.4 MB, referenced nowhere) removed. |

## VERIFIED LOCALLY (real Chromium, Playwright, 107 automated checks)

- Consent v2 suite, **42/42**: defaults denied before GTM; Accept / Reject /
  Manage; Analytics-only and Advertising-only map to exactly the right Google
  categories; per-category restore lands before the GTM bootstrap on later
  pages; dialog has `role=dialog`, `aria-modal`, labelled heading, initial
  focus, **focus containment (a Shift+Tab escape was found and fixed)**,
  Escape closes without a choice, focus returns to the opener; nothing
  pre-selected; Accept and Reject identical geometry; all three choices
  visible without scrolling at 320×568; old v1 cookies are re-asked; reset;
  cookie/localStorage fallbacks; no PII; admin untouched.
- Lead-flow suite, **65/65**: three forms, preselection, `?service=` compat,
  invalid/422/network failures do not redirect, confirmed success does,
  events and parameters, `/thankyou/` metadata, consent not bypassed by
  converting, no overflow at 375/430/768/1440.
- Build idempotent (`Pages updated: 0` on the second run). `node --check`
  clean on all five JS files and the vendored build.
- Canonical ×1 and H1 ×1 on every public page; all JSON-LD parses; sitemap
  excludes `/thankyou/` and `/admin/`; `robots.txt` does not block
  `/thankyou/`.
- Window Inserts imagery: widest image 340/395/420/436 px at 375/430/768/
  1440, no horizontal overflow, no broken images, no missing alt.

**Not measured:** Lighthouse / Core Web Vitals. This sandbox cannot reach
Google Fonts, GTM or Supabase, so any score would be fiction. Run Lighthouse
on the live URL after deployment.

## REQUIRES LIVE SUPABASE TEST

- The `SECURITY-TEST-MATRIX.md` rows: anonymous cannot write; signed-in
  non-admin cannot write; approved admin at **aal1 cannot** write; at
  **aal2 can**; upload/delete; audit-log rows appear.
- That the vendored **2.116.0** build works end-to-end with the live project:
  public CMS reads, sign-in, TOTP enrol/challenge, storage upload. It is the
  same code that was live via the CDN, but confirm it.
- Session-only auth: closing the browser signs the admin out; reopening
  requires password + TOTP again.
- **Self-signup is DISABLED** in Authentication → Providers. Launch gate.
- **MFA is enabled on the owner's Supabase dashboard account** itself.

## REQUIRES LIVE GTM TEST

See `DEPLOYMENT-CHECKLIST.md` §4d — the manual hard gates. In particular:
Clarity paused or gated; the two legacy GA4 tags paused; the Ads lead
conversion tag on Custom Event `generate_lead`, firing once; the `/thankyou/`
page view **not** a second Primary; `DLV - form_location` wired; no unknown tag bypassing consent.

## REQUIRES LIVE FORMSPREE TEST

One real submission from `/residential/`, one from `/window-inserts/`, one
from `/contact/`; each arrives by email and lands on `/thankyou/`. Formspree
was stubbed at the network layer here so success and failure could both be
exercised deterministically. Formspree's own spam filtering plus the honeypot
is judged adequate for a low-volume local-business form; add a challenge only
if real spam appears, and disclose any new vendor first.

## REQUIRES OWNER CONFIRMATION

- Legal entity name vs "Pellikal Window Enhancements" (see `OWNER-LEGAL-REVIEW.md`).
- Whether to mount the CMS **gallery** anywhere. **Finding:** no public page
  contains `#gallery`, so `loadGallery()`, its placeholders and the lightbox
  are unreachable today. The admin can upload gallery images and alt text and
  nothing displays them. Code fixed regardless; product decision is the owner's.
- `og-image.png` still shows the previous logo pane order. Source file not in
  the repo; recreating it from the wordmark alone would be a bad copy. Small
  brand item.
- Google Fonts remains externally hosted (see below).

## REQUIRES LEGAL / PROFESSIONAL REVIEW

Everything in `OWNER-LEGAL-REVIEW.md`. Nothing in this repo claims ADA, WCAG,
GDPR, CCPA, SHIELD or any other conformance. WCAG 2.2 AA is the engineering
target; that is all the Accessibility Statement says.

---

## Decisions made, with reasons

**GTM `<noscript>` iframe removed.** The consent banner and the Consent Mode
defaults are both JavaScript. A JavaScript-off visitor can never be asked and
never receives the denied defaults — so the iframe would load the container
with no consent state at all, i.e. Google's implicit "granted". Removing it
closes that path. Google describes the iframe as a fallback only; nothing a
consenting visitor relies on is lost.

**No CSP meta tag.** Considered and rejected for this hosting:
`frame-ancestors`, `report-uri` and report-only mode do not work in a meta
tag; the head contains generated inline scripts (consent defaults, GTM
snippet, JSON-LD) that would need hashes regenerated on every build; GTM,
GA4, Google Ads, Formspree and Supabase each need a host list that changes
under Google's control. A CSP that silently breaks the Ads conversion is worse
than none. The full header set is specified in `SECURITY.md` → *Requires
edge/host configuration* for the day Pellikal sits behind Cloudflare.

**Referrer-Policy via meta — yes.** Meta is a supported delivery for it.

**Google Fonts left as-is, and disclosed.** Self-hosting Mulish is the better
privacy posture, but it could not be done *correctly* here: this sandbox
cannot reach Google Fonts to fetch the served files, and a hand-converted
font risks a visible typography change. Rather than fake local fonts, the
privacy policy now discloses the request plainly. Recommended follow-up:
download Mulish (SIL Open Font License) from the official source, convert
to woff2, add `@font-face` with `font-display: swap`, remove the two
`preconnect`s and the stylesheet link — then delete the Fonts paragraph from
the policy.

**Admin auth session-only.** The refresh token in `localStorage` survived
browser restarts on any device the owner signed in on. `sessionStorage`
dies with the tab. Cost: password + TOTP once per browser session. For an
occasional-use CMS with MFA already required, that trade is right.

**Gallery renderer fixed even though unmounted.** It is still the code that
will run the day someone adds `<div id="gallery">`. Leaving a known bug in
dead code is how it becomes a live bug.

---

## Commands run

```
python3 tools/build.py            # twice — second run: Pages updated: 0
node --check js/*.js js/vendor/*.js
python3 verify_consent.py         # 42/42
python3 verify_leadflow.py        # 65/65
```
plus the ad-hoc Playwright measurements recorded above.
