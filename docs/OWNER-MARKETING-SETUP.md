# OWNER-MARKETING-SETUP.md

Tasks that **cannot be done in website code** and must be completed by the
business owner. Website work is finished; these are account and access steps.

---

## ⚠️ Rule that matters most

> **Every Google account must be created by, and permanently owned by,
> Pellikal — not by the contractor or the marketing specialist.**
>
> Give the specialist **admin/manager access** to accounts you own. Never let
> a vendor create the accounts in their own name.
>
> If the relationship ends and the accounts belong to them, you can lose your
> ad history, conversion data, analytics history and reviews — and rebuilding
> that costs real money and ranking. This is the single most common and most
> expensive mistake in small-business marketing.

---

## 1. Confirm the business phone number — do this first

The specialist reported a possible mismatch between a displayed number and a
`tel:` link. **A full audit of the website found no mismatch** — the site uses
`516-336-9586` consistently everywhere. See `PHONE-AUDIT.md`.

**You need to confirm, in writing:**

- [ ] Is **516-336-9586** the correct number to publish? (yes / no)
- [ ] Does it match your **Google Business Profile** listing exactly?
- [ ] Does it match any directory listings, invoices and vehicle signage?

If a different number is correct, say so and it will be updated everywhere at
once. Nothing has been changed or guessed.

---

## 2. Google Business Profile

- [ ] Claim or confirm ownership of the Pellikal listing at
      google.com/business
- [ ] Add the marketing specialist as a **Manager** (not Owner)
- [ ] Verify the listing details match the website exactly:

| Field | Website says |
|---|---|
| Business name | Pellikal Window Enhancements |
| Phone | 516-336-9586 |
| Website | https://www.pellikal.com |
| Email | info@pellikal.com |
| Service area | Long Island · Nassau · Suffolk · Queens · Brooklyn · Manhattan · NYC |

**Name, phone and website must match character-for-character** across the
website, GBP and every directory. Inconsistency ("NAP mismatch") suppresses
local ranking.

**Set it up as a service-area business.** You visit customers; do not publish a
home address as a storefront. There is no fake Hamptons or East End address on
the website and none should be created — serving an area does not require an
office there, and inventing one risks suspension of the listing.

---

## 3. Google Ads

- [ ] Create the Google Ads account **under a Pellikal-owned Google login**
- [ ] Add the specialist via **Tools → Access and security** (Admin or Standard)
- [ ] Keep **billing on the business's own card**. Never let an agency place
      your spend on their billing profile unless there is a contract that says
      so — it makes leaving difficult and can hold your account hostage.
- [ ] Ask the specialist for the conversion actions they create so they can be
      cross-checked against `MARKETING-TRACKING.md`

---

## 4. Google Analytics 4

- [ ] Create a GA4 property under the Pellikal Google account (or confirm one
      exists)
- [ ] Grant the specialist **Editor** access
- [ ] Provide the **Measurement ID** (`G-XXXXXXXXXX`) — the specialist connects
      it through GTM

No GA4 code is installed on the site, by design, so there is no duplicate
tracking to untangle.

---

## 5. Google Tag Manager

- [ ] Create a GTM container under the Pellikal Google account
- [ ] Grant the specialist **Publish** rights on the container
- [ ] Send the **container ID** (`GTM-XXXXXXX`) to whoever maintains the site

The ID must be entered in **two places** (`js/config.js` and the `<noscript>`
fallback on each public page) — see `MARKETING-TRACKING.md` §1. Until then the
site is completely untracked.

---

## 6. Search Console

- [ ] Verify `https://www.pellikal.com` at search.google.com/search-console
- [ ] Submit `https://www.pellikal.com/sitemap.xml`
- [ ] Grant the specialist access

Your DNS already contains a `google-site-verification` TXT record from the
previous setup, so verification may already be satisfied — check before adding
another.

---

## 7. Domain / DNS

Your domain is registered with **Wix** and DNS is hosted at Wix
(`ns2/ns3.wixdns.net`), while the website itself runs on GitHub Pages.

- [ ] Keep access to the Wix account for DNS changes
- [ ] Google may ask for a **TXT record** to verify domain ownership for GBP or
      Search Console — you (not the specialist) will need to add it
- [ ] **Do not remove the existing MX records** — those are your Google
      Workspace email. Removing them stops info@pellikal.com from receiving
      anything, including your own leads.

---

## 8. Formspree

Already live and working (form ID `maewnodj`).

- [ ] Confirm lead notification emails arrive at info@pellikal.com
- [ ] Check the plan's monthly submission limit and whether it needs upgrading
      before ad traffic begins — a full mailbox during a paid campaign means
      paying for clicks you never see

---

## 9. Supabase / admin — do not share

- [ ] **Do not** add the marketing specialist to Supabase
- [ ] **Do not** share the `/admin/` login

They do not need it. Website measurement is handled entirely through Google Tag
Manager once the container ID is installed. The admin area holds your content
and a record of customer enquiries — including names, phone numbers and email
addresses — and there is no marketing reason to expose that.

Its security is unchanged: authentication required, row-level security
enforced on Supabase's servers, `noindex`, and blocked in `robots.txt`.

---

## 10. Privacy policy

A privacy policy has been published at **/privacy/** and linked in the footer
of every page. Google Ads requires an accurate privacy policy on any site
running ads.

It currently states that analytics and advertising measurement are **being
prepared and are not yet active** — which is true today.

- [ ] Once GA4 / Google Ads / call tracking actually go live, update the
      "Analytics and advertising measurement" section to say they are active
      and change the date at the top
- [ ] If call tracking with number replacement is introduced, confirm that
      section reflects it
- [ ] **SUPERSEDED 14 Sep 2026.** The consent banner now ships. Everything
      optional defaults to denied before GTM loads, and visitors choose Accept
      All or Necessary Only. The old `CONSENT_DEFAULT_DENIED` flag in
      `js/config.js` has been removed — it never did anything. Read
      `docs/CONSENT-MODE.md` before changing any of it.

---

## Quick summary

| Task | Who | Status |
|---|---|---|
| Confirm phone number | **Owner** | ⬜ Blocking |
| Google Business Profile + Manager access | **Owner** | ⬜ |
| Google Ads account + access + billing | **Owner** | ⬜ |
| GA4 property + Measurement ID | Owner / Specialist | ⬜ |
| GTM container + container ID | Owner / Specialist | ⬜ |
| Enter GTM ID in the site | Site maintainer | ⬜ Waiting on ID |
| Search Console + sitemap | Owner | ⬜ |
| Formspree limit check | **Owner** | ⬜ |
| Update privacy policy when tools go live | Site maintainer | ⬜ Later |
