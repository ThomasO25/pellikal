# PHONE-AUDIT.md

Full audit of every phone number, `tel:` link, `sms:` link and structured-data
phone value in the Pellikal repository.

**Audit date:** 21 August 2026 · **Re-verified:** 24 August 2026 (after Local Law 97 removal and GTM install)
**Scope:** every `.html`, `.js`, `.json`, `.xml`, `.md` and `.webmanifest` file
in the repository, including all folder pages and the legacy `.html` redirect
stubs.

---

## Result summary

> ### ✅ No conflicting phone numbers were found in the website code.
>
> Exactly **one** phone number appears anywhere in the repository:
> **516-336-9586**
>
> Every clickable link's displayed number matches its own `tel:` / `sms:`
> target. There is no mismatch between what a visitor reads and what their
> phone dials.

**This does not automatically mean the number is correct** — only that the site
is internally consistent. See *Owner confirmation required* below.

---

## Number formats in use

| Context | Value | Correct format for its purpose |
|---|---|---|
| Visible text on pages | `516-336-9586` | ✅ Human-readable |
| `tel:` links | `tel:+15163369586` | ✅ E.164, required for dialling |
| `sms:` links | `sms:+15163369586` | ✅ E.164 |
| JSON-LD `telephone` | `+1-516-336-9586` | ✅ Valid for schema.org |

All four normalise to the same ten digits: **5163369586**.

---

## Every occurrence

### Clickable links

| Type | Target | Occurrences |
|---|---|---|
| `tel:` | `tel:+15163369586` | 44 |
| `sms:` | `sms:+15163369586` | 19 |
| `mailto:` | `mailto:info@pellikal.com` | 10 |

### By location on the site

| Location | File(s) | Displayed | Link target | Match |
|---|---|---|---|---|
| Header call button | all public pages | `516-336-9586` | `tel:+15163369586` | ✅ |
| Homepage hero / CTA buttons | `index.html` | `516-336-9586` | `tel:+15163369586` | ✅ |
| Homepage final CTA band | `index.html` | `516-336-9586` | `tel:+15163369586` | ✅ |
| Page hero CTAs | `residential/`, `commercial/`, `solutions/`, `about/`, `faq/` | `516-336-9586` | `tel:+15163369586` | ✅ |
| Contact page call box | `contact/index.html` | `516-336-9586` | `tel:+15163369586` | ✅ |
| Contact page text link | `contact/index.html` | text link | `sms:+15163369586` | ✅ |
| Sticky mobile bar — Call | all public pages | "Call" | `tel:+15163369586` | ✅ |
| Sticky mobile bar — Text | all public pages | "Text" | `sms:+15163369586` | ✅ |
| Footer contact list | all public pages | `516-336-9586` | `tel:+15163369586` | ✅ |
| Footer text link | all public pages | "Text us" | `sms:+15163369586` | ✅ |
| 404 page | `404.html` | `516-336-9586` | `tel:+15163369586` | ✅ |
| Legacy redirect stubs | `*.html` at root | — | — | n/a (meta-refresh only) |

### Structured data (JSON-LD)

| File | Property | Value |
|---|---|---|
| `index.html` | `HomeAndConstructionBusiness.telephone` | `+1-516-336-9586` |
| `residential/index.html` | `Service.provider.telephone` | `+1-516-336-9586` |
| `commercial/index.html` | `Service.provider.telephone` | `+1-516-336-9586` |

| `solutions/index.html` | `Service.provider.telephone` | `+1-516-336-9586` |

### Meta descriptions containing the number

| File | Field |
|---|---|
| `index.html` | `description`, `og:description` |
| `contact/index.html` | `description`, `og:description` |

### JavaScript

`js/main.js` contains the number twice, inside the two user-facing fallback
messages shown when a form submission cannot be delivered
("…please call or text 516-336-9586…"). Both match.

---

## ⚠️ Owner confirmation required

The marketing specialist reported that a displayed number may differ from a
`tel:` target somewhere. **That discrepancy is not present in the current
website code.** The most likely explanations, in order:

1. **The old Wix site was still cached** when they checked. Until recently
   pellikal.com served the previous Wix site, which may have carried a
   different number. Ask them when and where they saw it.
2. **Google Business Profile** lists a different number from the website.
   This is the most common real-world cause and it directly affects local
   ranking and ad quality — the business name, address and phone must match
   across the website, GBP and any directory listings.
3. **A call-tracking / forwarding number** already in use in an existing
   listing or ad.
4. They viewed a **cached copy or screenshot** predating the current deploy.

**Action for the owner:** confirm in writing that **516-336-9586** is the
correct primary business number to publish. Then verify it matches the Google
Business Profile listing exactly.

If a different number is confirmed, it must be changed in **all** of these
places together:

- every visible `516-336-9586` in the HTML
- every `tel:+15163369586`
- every `sms:+15163369586`
- every JSON-LD `"telephone":"+1-516-336-9586"`
- the two meta descriptions listed above
- the two fallback messages in `js/main.js`

No number has been changed as part of this work. Nothing was guessed.

---

## Call tracking note

Dynamic number replacement has **not** been installed. The markup is left in a
state that makes it straightforward to add later: every phone number is inside
a semantically correct `<a href="tel:…">` element with the visible number as
that link's own text, so a replacement script can swap both the display text
and the `href` reliably. See `MARKETING-TRACKING.md`.


---

## Re-verification — 24 August 2026

Re-run after the Local Law 97 page was replaced with a redirect and Google Tag
Manager was installed.

- Still exactly **one** number in the repository: **516-336-9586**
- Every link's displayed number still matches its own `tel:` / `sms:` target
- The removed Local Law 97 page took its `Service` schema phone entry with it
- The phone number is now generated from `site.config.json`, so all occurrences
  are guaranteed to stay in sync. Changing `phoneDisplay` / `phoneLink` /
  `phoneSchema` there and running `python3 tools/build.py` updates every page,
  every link, the structured data, the meta descriptions and the JavaScript
  fallback messages at once.

**Still awaiting owner confirmation** that 516-336-9586 is the correct number
and that it matches the Google Business Profile listing exactly.
