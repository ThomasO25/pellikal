# CLAIMS-SOURCES.md

Every performance/manufacturer claim on the site, with the source required.
**Reviewed:** 24 August 2026

| Claim (as published) | Page | Product / category | Source required | Status |
|---|---|---|---|---|
| "Select LLumar® residential solar-control films block more than 99% of the UV rays that contribute to fading." | Residential, FAQ | LLumar residential solar-control film | **Official LLumar source, reviewed 14 Sep 2026:** https://llumar.com/en/residential-window-film/solar-control/ (states solar-control window film blocks more than 99% of UV rays); also https://llumar.com/en/residential-window-film/solar-control/dual-reflective/ | ✅ APPROVED — scoped to select LLumar residential solar-control films only |
| "Select LLumar® films block more than 99% of UV rays" | Solutions | LLumar solar-control / ceramic | Same official source as above, reviewed 14 Sep 2026 | ✅ APPROVED — "select" scoping must stay; never generalise to all film or to inserts |
| "helps reduce UV exposure" | Residential, Homepage | General | General industry knowledge; non-numeric, hedged | ✅ APPROVED |
| "UV is one contributor to fading — heat, visible light and time also play a part" | Homepage, Residential, FAQ | General | Standard conservation guidance; qualifies the claim rather than extending it | ✅ APPROVED |
| "helps reduce solar heat and glare" | Residential, Homepage | General | Non-numeric, hedged | ✅ APPROVED |
| "Manufacturer's limited warranty available on qualifying LLumar products. Restrictions apply." | Homepage, footer, all pages | LLumar | LLumar warranty documentation | ⚠️ OWNER/LLUMAR CONFIRMATION |
| "Many residential jobs are completed in a single day and small jobs in a few hours." | FAQ | Pellikal operations | Owner's own experience | ⚠️ OWNER CONFIRMATION |
| "Standard reflective privacy film works best in daytime… at night with interior lights on that effect reverses." | FAQ, Solutions | General | Physically accurate; deliberately preserved | ✅ APPROVED |
| "No film makes glass unbreakable… one layer of protection, not a guarantee." | FAQ, Solutions | Security/safety film | Deliberately conservative disclaimer | ✅ APPROVED |
| "Performance depends on the specific film system and, where the manufacturer requires it, an appropriate attachment system." | FAQ, Commercial | Security film | Standard requirement for security systems | ✅ APPROVED |
| "Actual savings depend on your building, climate, windows and usage." | FAQ | Energy | Qualifier, not a claim | ✅ APPROVED |
| "If glass is failing, foggy or has broken seals, replacement may be better." | FAQ | General | Honest limitation | ✅ APPROVED |

## Numbers deliberately absent

No percentage appears for heat rejection, TSER, VLT, energy savings, temperature
reduction or film lifespan. Earlier unsourced figures (30%, 10×, 80%, 48%, 42%,
34%, 2%, 6%) were **removed, not replaced**. Nothing was invented to fill gaps.

## To publish any new figure

It must be transcribed from the LLumar technical data sheet for a product
Pellikal actually installs, attributed to the manufacturer, and hedged where the
result varies by glass or application.


---

**14 Sep 2026 — FAQ aligned.** The visible FAQ answer said "Quality window
film blocks up to 99% of ultraviolet rays" (any film, "up to") while its own
JSON-LD and the Residential/Solutions pages said "Select LLumar® … block more
than 99%". The visible copy now uses the narrower, sourced wording. The claim
was **narrowed**, not broadened. Rows 8–9 were closed the same day against LLumar's official
residential solar-control page (recorded in the table above).


---

## Window inserts — noise claims (added 14 Sep 2026)

| Claim | Where | Basis | Status |
|---|---|---|---|
| "helps reduce the outside noise coming through the window" / "you can still get quieter" (double-pane) / "quieter, not silent" | /window-inserts/ hero, Quieter rooms section, FAQ | General principle: an added sealed layer plus an air gap reduces sound transmission through the glass and closes the leak paths around the sash. No figures used. Every instance is qualified ("helps", "depends on the window"). | ✅ Qualitative only — publishable |
| "no window product makes a room soundproof" / sound also enters through walls, doors, ceilings, vents | same | Consistent with the manufacturer disclaimer below and with the existing FAQ | ✅ |
| **Up to 70% noise reduction · Average 20% energy savings · Over 99% perfect fit rate · "with its Snug Fit compression tubing"** | **LIVE — enabled 15 Sep 2026** (`site.config.json` → `windowInserts.manufacturerClaims.enabled`) | Indow official product pages, verified by the reviewer 14 Sep 2026: https://indowwindows.com/products/indow-window-inserts · https://indowwindows.com/products/acoustic-window-inserts | ✅ **Enabled 15 Sep 2026 at the owner's request** for a real decibel figure on the page. Note: the owner asked for the figures having been told they are Indow's Acoustic Grade numbers; a separate written sentence "we sell Indow Acoustic Grade" is still worth keeping on file. Every figure is attributed to Indow; never a Pellikal guarantee; never "our patented". Revert = `enabled: false` + rebuild. |
| **Up to 18.9 dBA / ~70% (Acoustic Grade over operable single-pane)** and **about 10–12 dBA / ~50% (Acoustic Grade over operable double-pane)** | **REMOVED from the page 15 Sep 2026 (owner: no exact decibel figures)** | Indow official sources (recorded, not fetched from this sandbox): https://indowwindows.com/window-soundproofing-for-noise · https://indowwindows.com/solutions/noise-performance · https://indowwindows.com/noise-disclaimer | ⏸ Not on the page. Recorded here in case they are ever wanted; the owner has chosen general noise wording over exact dB. |

Never apply Acoustic Grade figures to Standard Grade. Never convert dBA into
"X times quieter". Keep single-pane vs double-pane figures separate.
