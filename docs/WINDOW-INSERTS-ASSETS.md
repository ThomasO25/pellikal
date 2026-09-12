# WINDOW-INSERTS-ASSETS.md

Imagery on `/window-inserts/` — what is published, where it came from, and the
permission position.

**Updated:** 10 September 2026 · **Manufacturer assets: APPROVED and live.**

---

## ✅ Permission — approved

```js
// js/config.js
WINDOW_INSERT_ASSETS_APPROVED: true,
```

**Approved 10 September 2026 by the business owner**, on the stated basis that
Pellikal is an authorised dealer for the product and uses the manufacturer's
assets on the same footing as its LLumar material.

> This is an **owner attestation**, recorded here for the file. No written
> licence document has been reviewed. If the manufacturer ever objects or the
> dealer relationship ends, set the flag back to `false` — the six assets
> disappear cleanly and the page still works on the five owner photographs
> alone. That is exactly what the flag is for.

The gate still exists and still functions; it is simply switched on. See
"The gate" below.

---

## Page order

Real product explanation first, then proof, then the science, then the service.

| # | Slot | File | Section | Source |
|---|---|---|---|---|
| 1 | `components` | `insert-components.jpg` | **Hero**, beside the H1 | Manufacturer (logo visible) |
| 2 | `before` | `existing-window-frame.jpg` | Before &amp; after | Pellikal |
| 3 | `after` | `casement-finished-room.jpg` | Before &amp; after | Pellikal |
| 4 | `diagram-draft` | `diagram-draft.jpg` | How it works — drafts | Manufacturer |
| 5 | `diagram-heat` | `diagram-heat.jpg` | How it works — heat | Manufacturer |
| 6 | `fitting-1` | `fitting-panel-into-frame.jpg` | Measurement &amp; fitting | Manufacturer |
| 7 | `fitting-2` | `fitting-kitchen-window.jpg` | Measurement &amp; fitting | Manufacturer |
| 8 | `frame-detail` | `insert-frame-detail.jpg` | Measurement &amp; fitting | Manufacturer (logo visible) |
| 9 | `removable-panel` | `insert-panel-removable.jpg` | Measurement &amp; fitting | Pellikal |
| 10 | `street-facing-room` | `urban-street-facing.jpg` | Use cases / FAQ | Pellikal |
| 11 | `historic-windows` | `commercial-arched-windows.jpg` | Use cases / FAQ | Pellikal |

### The hero image carries the explanation
`insert-components.jpg` labels the three parts — **silicone tubing, ABS
carrier, acrylic glazing** — and sits beside the H1. The section immediately
below expands each one in Pellikal's own words, so the page explains the
product rather than just showing it.

### Before &amp; after
Images 2 and 3 are presented as the **same window before and after** an insert
was fitted — timber frame first, then the fitted result. Labelled with overlay
Before/After badges rather than captions.

> **Owner-attested pairing.** The before/after relationship was confirmed by
> the owner. If these turn out to be two different windows rather than one
> window photographed twice, the section must be relabelled — presenting two
> different windows as a before/after would be misleading.

---

## The gate (still in place, switched on)

| Value | Behaviour |
|---|---|
| `true` *(current)* | All six manufacturer assets render in place |
| `false` | They are removed entirely. The hero reflows to a single column, the two "how it works" rows drop their diagrams, the fitting row collapses, and no empty box or orphan heading is left |

Hiding remains the CSS default:

```css
html:not(.mfr-assets-approved) [data-asset-source="manufacturer"]{display:none}
```

so if the flag is ever turned off the assets stay hidden even with JavaScript
disabled. When `false`, `js/main.js` also removes the nodes so the files are
never requested.

---

## Claims discipline — unchanged

- The manufacturer is **not named** in the page copy
- **No numeric performance figure** appears anywhere — no noise-reduction
  percentage, no energy-saving percentage, no fit-rate
- The diagrams are labelled in-page as illustrative, with results depending on
  the window, frame, insert and conditions
- Logos inside manufacturer images are **left intact** — never cropped out

---

## Rules for anything added later

- Publish only what Pellikal owns or has permission to use
- Never caption third-party imagery as our own installation
- Keep photographs level — decorative containers may tilt, images never do
- Real alt text describing what is visible; no keyword stuffing
- Resize to ~1200 px wide, keep under ~300 KB
- Retouching for exposure and clarity is fine; never alter how the product
  itself looks
