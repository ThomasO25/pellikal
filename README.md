# Pellikal Window Enhancements — Website

A fast, mobile-first, static marketing site for **Pellikal Window Enhancements** (residential &
commercial window film, Long Island & NYC). Built with plain HTML, CSS and vanilla JavaScript —
**no build step, no framework, no backend.** It's designed to deploy to GitHub Pages as-is.

Primary goals: get the phone to ring, get texts, and capture quote-form leads.

---

## What's in here

```
pellikal/
├── index.html                ← Home ( / )
├── residential/index.html    ← /residential/
├── commercial/index.html     ← /commercial/
├── ll97/index.html           ← /ll97/  (Local Law 97)
├── solutions/index.html      ← /solutions/  (all film types, with #anchors)
├── get-a-quote/index.html    ← /get-a-quote/  (Formspree form)
├── faq/index.html            ← /faq/  (FAQ + FAQ schema)
├── assets/
│   ├── css/styles.css        ← All styles (one file)
│   ├── js/main.js            ← All behavior (one file)
│   └── images/               ← Put your photos here (see "Images" below)
├── sitemap.xml
├── robots.txt
├── CNAME                     ← Custom domain for GitHub Pages
└── .nojekyll                 ← Tells GitHub Pages to serve files as-is
```

The existing indexed URLs (`/`, `/residential/`, `/commercial/`, `/ll97/`, `/solutions/`,
`/get-a-quote/`, `/faq/`) are **preserved**, so you keep your current SEO.

---

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `pellikal-site`).
2. Upload the **contents** of this `pellikal/` folder to the repo root (so `index.html` is at the
   top level of the repo, not inside a subfolder).
3. In the repo: **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/ (root)**, then **Save**.
6. Wait 1–2 minutes. GitHub gives you a URL like `https://<username>.github.io/`.

### Custom domain (www.pellikal.com)

- The included **CNAME** file already contains `www.pellikal.com`. If your final domain differs,
  edit that file so it contains exactly your domain on one line.
- At your DNS provider, point the domain to GitHub Pages:
  - For **www**: add a `CNAME` record → `<username>.github.io`
  - For the **root/apex** (pellikal.com): add GitHub's A records, or a redirect from apex → www.
    See GitHub's docs: "Managing a custom domain for your GitHub Pages site."
- Back in **Settings → Pages**, confirm the custom domain and tick **Enforce HTTPS** once it's
  available.

> The `.nojekyll` file is intentional — it prevents GitHub from hiding folders and lets
> `/assets/…` load correctly. Leave it in place.

---

## Before you go live — required setup

Two things must be connected, plus your images. Search the files for the word **REPLACE** to find
every spot.

### 1) Connect the quote form (Formspree)

The `/get-a-quote/` form submits with AJAX to **Formspree** (free tier available).

1. Sign up at <https://formspree.io> and create a new form.
2. Copy your form endpoint — it looks like `https://formspree.io/f/abcdwxyz`.
3. Open `get-a-quote/index.html`, find:
   ```html
   <form id="quote-form" ... action="https://formspree.io/f/FORMSPREE_ID" ...>
   ```
   Replace **FORMSPREE_ID** with your form's ID (the part after `/f/`).
4. Set the form's notification email in Formspree to **info@pellikal.com** (or wherever you want
   leads to land).

> Until you do this, the form runs in **demo mode**: it shows a success message but does **not**
> send. The Formspree form ID is public by design — it is not a secret.

### 2) Images

Drop real photos into `assets/images/` using these exact filenames (used across the site):

| Filename | Where it's used | Suggested size |
|---|---|---|
| `hero-window-film.jpg` | Home hero | tall, ~1200×1500 (4:5) |
| `residential-window-film.jpg` | Home + Residential | ~1200×900 (4:3) |
| `commercial-window-film.jpg` | Home | ~1200×900 |
| `low-e-film.jpg`, `privacy-film.jpg`, `solar-film.jpg`, `neutral-film.jpg`, `ceramic-film.jpg`, `security-film.jpg`, `anti-graffiti-film.jpg` | Solutions | ~1200×900 each |
| `gallery-1.jpg`, `gallery-2.jpg`, `gallery-3.jpg` | Home gallery | ~1000×750 |
| `gallery-before.jpg`, `gallery-after.jpg` | Home before/after slider | same dimensions as each other |
| `og-default.jpg` | Social share preview | **1200×630** |
| `favicon.ico` | Browser tab icon | 32×32 / 48×48 |

**Nice touch:** until you add photos, the site shows tasteful labeled placeholders automatically —
so it looks intentional, not broken. Replace them whenever you're ready; no code changes needed.
Optional: add a real logo at `assets/images/logo.svg` and un-comment the logo line in each header.

### 3) Analytics & Google Ads (optional but recommended)

Each page has a commented analytics block in the `<head>`. To turn it on:

1. Un-comment the block and add your **GA4 ID** (`G-XXXXXXXXXX`).
2. For **Google Ads** conversion tracking, add `gtag('config', 'AW-CONVERSION_ID')` in that block,
   then open `assets/js/main.js` and set your conversion label inside `trackConversion()`.
3. The site already fires events on:
   - **click-to-call** (`tel:` links)
   - **click-to-text** (`sms:` links)
   - **lead** (successful quote-form submit)

Prefer Google Tag Manager? Add your GTM container in the same block; the code already pushes to
`dataLayer`.

---

## Editing content

- **Phone number** appears as `tel:+15163369586` (links) and `516-336-9586` (display). If the
  number ever changes, update both.
- **Business info / disclaimers** live in the shared footer at the bottom of each page.
- Everything is hand-editable HTML — open a file, change the text, commit. No compiling.

### A note on claims (please keep)

To keep the site trustworthy and legally safe, the copy intentionally **avoids**:

- fabricated reviews, ratings, awards, certifications or years-in-business,
- unconditional guarantees (warranty is described as *"manufacturer-backed lifetime warranty
  available"*),
- any promise that window film makes a building **compliant** with Local Law 97.

If you add testimonials, use **real** ones. If you add a specific stat, make sure it's accurate.

---

## Launch checklist

- [ ] Replace **FORMSPREE_ID** in `get-a-quote/index.html` and test a real submission
- [ ] Confirm quote leads arrive at **info@pellikal.com**
- [ ] Add real images to `assets/images/` (see table above), including `og-default.jpg` (1200×630)
- [ ] Add `favicon.ico`
- [ ] Turn on GA4 / GTM (un-comment analytics block, add IDs)
- [ ] Set up Google Ads conversion ID + label (if running ads)
- [ ] Test every page on a phone: tap-to-call, tap-to-text, sticky bottom bar, menu, form
- [ ] Check the before/after slider drags smoothly
- [ ] Deploy to GitHub Pages and connect **www.pellikal.com** (CNAME + DNS), enable HTTPS
- [ ] Submit `sitemap.xml` in **Google Search Console** and verify the property
- [ ] Spot-check that old URLs still resolve (`/residential/`, `/commercial/`, `/ll97/`,
      `/solutions/`, `/get-a-quote/`, `/faq/`)
- [ ] Run the pages through Google's **Rich Results Test** to confirm the LocalBusiness / FAQ /
      Breadcrumb schema is valid
- [ ] Optional: run Lighthouse (mobile) and confirm strong performance/accessibility scores

---

## Tech notes

- **Accessibility:** semantic landmarks, one `<h1>` per page, labeled form fields, visible focus
  states, `aria-expanded` on the menu and FAQ, a skip link, and reduced-motion support.
- **Performance:** two small static assets, system-friendly fonts loaded once, lazy visual reveals
  via `IntersectionObserver`, no framework.
- **SEO:** unique title + meta description per page, canonical URLs, Open Graph/Twitter tags,
  JSON-LD (LocalBusiness, Service, FAQPage, BreadcrumbList), `sitemap.xml`, `robots.txt`.
- **No browser storage** is used, so it runs anywhere without cookie banners for storage.

Questions about the build? Everything is plain HTML/CSS/JS — open the files and read along.
