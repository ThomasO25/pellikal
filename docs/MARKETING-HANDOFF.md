# MARKETING-HANDOFF.md

Everything the marketing specialist needs. Nothing here is invented — where a
value is the specialist's to create, it says so.

---

## The essentials

| | |
|---|---|
| **Website** | https://www.pellikal.com |
| **GTM container** | `GTM-MK2PHWB` — installed and live on every public page |
| **Production GA4** | `G-J8SQ4CC7BT` — **configure inside GTM** |
| **Google Ads** | `AW-859941989` — **configure inside GTM** |
| **Retired GA4** | `G-TPD5SKWWVC` — ❌ do not use. Purged from the site. |
| **Conversion labels** | ⚠️ **None exist yet — you create them.** No label is hard-coded anywhere. |

### Architecture

```
Website → GTM-MK2PHWB → GA4 G-J8SQ4CC7BT
                      → Google Ads AW-859941989
                      → conversion tags / future call tracking
```

The **only** Google code on the pages is the GTM container. There is no
gtag.js, no direct GA4 install and no Ads tag in the HTML — deliberately, so
nothing double-counts. Do not add any.

---

## Website events

All push to `window.dataLayer`. In GTM use a **Custom Event** trigger whose name
matches exactly.

| Event | Fires when | Parameters | Pages |
|---|---|---|---|
| `click_to_call` | A `tel:` link is clicked | `click_location` | All public pages |
| `click_to_text` | An `sms:` link is clicked | `click_location` | All public pages |
| `click_to_email` | A `mailto:` link is clicked | `click_location` | All public pages |
| `view_contact_page` | `/contact/` loads | — | Contact |
| `contact_form_submit` | Formspree **confirms** the contact form was accepted | — | Contact |
| `homepage_form_submit` | Formspree **confirms** a homepage form was accepted | — | Homepage |
| `generate_lead` | Immediately after either form-submit event | `lead_source` | Homepage / Contact |

**`click_location`:** `header` · `hero` · `page_hero` · `mobile_bar` · `footer` ·
`final_cta` · `contact_page` · `body`

**`lead_source`:** `contact_form` · `homepage_form`

```js
{ event: "click_to_call",       click_location: "mobile_bar" }
{ event: "view_contact_page" }
{ event: "contact_form_submit" }
{ event: "generate_lead",       lead_source: "contact_form" }
```

### ⚠️ `homepage_form_submit` is dormant
The homepage currently has **no form** — it drives visitors to `/contact/` and to
the phone. The event is wired and fires the moment a homepage form with
`id="home-form"` is added. Expect zero until then. Not a fault.

---

## When `generate_lead` fires — read before creating conversions

**Only after Formspree returns a successful HTTP response.**

- ❌ Pressing Submit — no conversion
- ❌ Failing validation — no conversion
- ❌ Network error, timeout or Formspree error — no conversion; the visitor sees
  an error, **their typed details are kept**, and they're asked to call or text
- ❌ Honeypot/bot submission — silently dropped, fires nothing
- ✅ `response.ok === true` → `contact_form_submit` → then `generate_lead`

The form is only reset on confirmed success. So a reported conversion means an
enquiry that genuinely reached the business.

---

## Suggested Google Ads mapping

| Event | Conversion action | Notes |
|---|---|---|
| `generate_lead` | **Submit lead form** | Primary. Count: One |
| `click_to_call` | **Phone call lead** | Count: One |
| `click_to_text` | Contact | Optional |
| `click_to_email` | Contact | Optional |
| `contact_form_submit` / `homepage_form_submit` | — | Diagnostics only; don't double-count with `generate_lead` |
| `view_contact_page` | ❌ **Never a conversion** | Intent/audience signal only. Counting it will wildly inflate conversions. |

The account already contains historical actions (Submit lead form, Phone call
lead, Contact, Get directions, Download, Engagement, Page view, Other). Some are
old or misconfigured. **Auditing them is your call** — no website code creates,
modifies or depends on them.

Also configure **Conversion Linker** (or the current Google tag equivalent) in
GTM so ad-click IDs persist across pages.

Bidding strategy and account goals are deliberately not decided here.

---

## Call tracking

**Not implemented.** No dynamic number replacement, no forwarding number.

The markup is DNR-friendly: every number sits in a proper
`<a href="tel:+15163369586">` with the visible number as that link's own text,
and the format is identical everywhere.

If you introduce a permanent forwarding number, keep the **real** number in the
structured data and on Google Business Profile to protect NAP consistency.

---

## Privacy

**No customer PII is passed to the dataLayer — verified by test submission.**
Name, email, phone, town and message text do not appear anywhere in the
dataLayer. Events record only that an action happened and roughly where.

`/privacy/` discloses GTM, GA4, Google Ads measurement, Formspree, Supabase and
GitHub Pages, and states call tracking is not currently active. Update it if
that changes.

No cookie banner ships. Add one only if the business targets jurisdictions
requiring prior consent; Consent Mode is best configured in GTM.

---

## Tag Assistant test steps

1. **tagassistant.google.com** → Add domain → `https://www.pellikal.com`
   (or GTM → **Preview**).
2. Confirm the badge shows **GTM-MK2PHWB connected**.
3. Run through these, watching the event stream:

| Action | Expected event |
|---|---|
| Load homepage | `gtm.js`, `gtm.dom`, `gtm.load` |
| Tap header phone number | `click_to_call` · `click_location: header` |
| Tap sticky bottom bar (mobile) | `click_to_call` / `click_to_text` · `mobile_bar` |
| Click footer email | `click_to_email` · `footer` |
| Visit `/contact/` | `view_contact_page` |
| Submit a **real** test enquiry | `contact_form_submit`, then `generate_lead` (`lead_source: contact_form`) |

4. Click any event → **Data Layer** tab → confirm **no personal data**.
5. Load `/admin/` → confirm **no container fires** (expected).
6. Confirm the phone actually dials — tracking never blocks the link.
7. Check each page fires the container **once**, not twice.

---

## GA4 Realtime test steps

1. In GTM add **Tag → Google Tag**, ID `G-J8SQ4CC7BT`, trigger
   **Initialization – All Pages**. Publish.
2. GA4 → **Reports → Realtime**.
3. Open `https://www.pellikal.com` in a normal window (not Preview).
4. Within ~30s: 1 active user and a `page_view`.
5. Tap a phone link → **Realtime → Event count by Event name** shows
   `click_to_call`.
6. Submit a test enquiry → `generate_lead` appears.
7. **Admin → Events → Mark as key event** for `generate_lead`.
8. Confirm **one** `page_view` per page load. Two means a duplicate GA4 tag in
   GTM — there is none in the site code.
9. Import `generate_lead` into Google Ads, or build a native Ads conversion tag
   in GTM. **Not both for the same action.**
