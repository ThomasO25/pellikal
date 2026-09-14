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
| 1 | `components` | `insert-cutaway-labeled.jpg` | **Hero**, beside the H1, as a capped thumbnail | Manufacturer (logo visible) |
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
`insert-cutaway-labeled.jpg` labels the three parts — **silicone tubing, ABS
carrier, acrylic glazing** — and sits beside the H1. The section immediately
below expands each one in Pellikal's own words, so the page explains the
product rather than just showing it.

### Two separate installations (NOT a before/after)
Images 2 and 3 are **two different windows, each already fitted with an
insert** — confirmed by the owner on 14 Sep 2026. They were originally
presented as a before/after pair; that was wrong and has been removed from the
page, the tags, the alt text and the microcopy. Public copy must never imply
one was taken before fitting. The overlay tags now describe each photograph
("Leaded casement" / "Finished room").
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


---

## Update — 14 September 2026 (owner feedback)

**Hero image replaced.** `insert-components.jpg` was swapped for
`insert-cutaway-labeled.jpg`, a cleaner manufacturer render that labels all
three parts (the previous one cropped the silicone-tubing label out). Sourced
from the manufacturer's site, trimmed of its white margin and resized to
640×925 / 59 KB. It carries `data-asset-source="manufacturer"` like the
others, so `WINDOW_INSERT_ASSETS_APPROVED` still governs it.

`insert-components.jpg` is **no longer referenced** but has been left in the
repository in case it is wanted again.

**Image sizes reduced page-wide.** Every image block is now capped and centred
in its column instead of filling it (`.imgslot--thumb` / `--sm` / `--md`,
stylesheet §18). Desktop rendered widths went from ~560 px to 230 px (hero),
380 px (diagrams) and 420–430 px (photographs). Shadows softened to match.

**The before/after pair was NOT a before/after.** The owner confirmed the two
photographs are *two separate installations, both already fitted with inserts*.
The Before/After tags, the "same window" heading and the alt text that claimed
one was taken before fitting have all been removed. The section is now
"Two insert installations", the tags describe each photograph, and the
microcopy states plainly that this is not a before-and-after of one opening.
The CSS modifiers were renamed `--one` / `--two` so nobody relabels them.
