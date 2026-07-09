# Pellikal Window Enhancements — Website

A professional, **multi-page** website for Pellikal Window Enhancements (residential & commercial
window film, Long Island & NYC), built to your brand guidelines — **Mulish** type, **deep-navy +
cyan**, the **stacked-panes logo**, the **diagonal capsule photo masks**, and the real photos from
your brand kit. Plain HTML/CSS/JS, no build step, no framework, not Wix.

Highlights
- **Separate pages** with shared, organized files (one stylesheet, shared scripts, assets folder).
- A **film-install loading animation**, scroll reveals, **animated stat counters**, a **gallery
  lightbox**, a **back-to-top** button, and a **drag-to-compare tint slider** (bare glass vs. film).
- A **Formspree** consultation form, click-to-call everywhere, sticky mobile call/text bar.
- A secure **Supabase admin** to manage **gallery photos**, edit the **bio / mission / intro text**,
  and add/remove **customer testimonials**.
- The admin page is **not linked anywhere** — it's reachable only by typing its URL.

---

## File structure
```
pellikal-site/
├── index.html            ← Home  (served at /)
├── residential/index.html    → /residential/
├── commercial/index.html     → /commercial/
├── local-law-97/index.html   → /local-law-97/
├── solutions/index.html      → /solutions/
├── contact/index.html        → /contact/   (Formspree form)
├── about/index.html          → /about/
├── faq/index.html            → /faq/
├── admin/index.html          → /admin/     (Staff dashboard; unlinked; noindex)
├── 404.html
│   (residential.html, commercial.html, … at the root are tiny redirect
│    stubs that forward the old .html URLs to the new clean folders)
├── css/
│   └── styles.css        ← all styling
├── js/
│   ├── config.js         ← ⭐ EDIT THIS: Formspree ID + Supabase keys
│   ├── main.js           ← site behavior (all public pages)
│   └── admin.js          ← admin dashboard (admin page only)
├── assets/images/        ← logo icons, share image, brand photos
├── robots.txt  ·  sitemap.xml  ·  CNAME  ·  .nojekyll
```
The site uses **clean, extensionless URLs**: each page lives in its own folder as `index.html`, which GitHub Pages serves at `/residential/`, `/contact/`, etc. Asset links are relative per folder depth, so the site works identically at the GitHub Pages project path (`/pellikal/`) and at the root custom domain. The old `.html` URLs still work — each one is a small redirect stub that forwards to its clean folder URL. Every page shares the same header/footer markup, so navigation works even with JavaScript disabled,
and each page has its own title, description and canonical URL for search engines.

---

## 1. Preview
Open **`index.html`** in any browser and click around.

## 2. Deploy (GitHub Pages)
1. Create a repo and upload the **contents** of this folder (so `index.html` is at the repo root).
2. **Settings → Pages → Source:** *Deploy from a branch*, branch **main**, folder **/(root)**.
3. Custom domain: `CNAME` already contains `www.pellikal.com`. Add a DNS **CNAME** record for `www`
   → `<username>.github.io`, then enable **Enforce HTTPS**. Keep `.nojekyll`.

## 3. Connect everything — edit ONE file: `js/config.js`
```js
window.PELLIKAL_CONFIG = {
  FORMSPREE_ID: "abcdwxyz",                 // from your Formspree endpoint /f/abcdwxyz
  SUPABASE_URL: "https://xxxx.supabase.co", // Supabase → Project Settings → API
  SUPABASE_ANON_KEY: "eyJhbGciOi...",       // the anon public key (safe to expose)
  SUPABASE_BUCKET: "gallery",
  GALLERY_TABLE: "gallery_images",
  CONTENT_TABLE: "site_content",
  TESTIMONIALS_TABLE: "testimonials"
};
```
Leave the Supabase fields blank to keep the site in demo mode (placeholders + default text). Leave
`FORMSPREE_ID` as-is to keep the form in demo mode (shows success, doesn't send).

### Formspree (contact form) — ~5 min
Create a form at **formspree.io**, copy the ID after `/f/`, put it in `FORMSPREE_ID`, and set the
notification email to **info@pellikal.com**.

---

## 4. Turn on the admin (Supabase) — ~15 min

### Step 1 — Project + keys
Create a free project at **supabase.com** → **Project Settings → API** → copy the **Project URL** and
**anon public** key into `js/config.js`.

### Step 2 — Storage bucket
**Storage → Create bucket** → name it exactly **`gallery`**, turn **Public bucket ON**.

### Step 3 — Tables + security (SQL Editor → paste → Run)
```sql
-- 1) GALLERY PHOTOS
create table if not exists gallery_images (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  url text not null, path text, category text, caption text
);
alter table gallery_images enable row level security;
create policy "Public read gallery"  on gallery_images for select using (true);
create policy "Staff insert gallery" on gallery_images for insert to authenticated with check (true);
create policy "Staff delete gallery" on gallery_images for delete to authenticated using (true);

-- 2) EDITABLE SITE TEXT (bio, mission, homepage intro)
create table if not exists site_content (
  key text primary key, value text, updated_at timestamptz not null default now()
);
alter table site_content enable row level security;
create policy "Public read content"  on site_content for select using (true);
create policy "Staff insert content" on site_content for insert to authenticated with check (true);
create policy "Staff update content" on site_content for update to authenticated using (true) with check (true);
create policy "Staff delete content" on site_content for delete to authenticated using (true);

-- 3) CUSTOMER TESTIMONIALS
create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  quote text not null, author text not null
);
alter table testimonials enable row level security;
create policy "Public read testimonials"  on testimonials for select using (true);
create policy "Staff insert testimonials" on testimonials for insert to authenticated with check (true);
create policy "Staff delete testimonials" on testimonials for delete to authenticated using (true);
```
Then allow signed-in staff to upload/delete files in the bucket:
```sql
create policy "Staff upload gallery bucket" on storage.objects
  for insert to authenticated with check (bucket_id = 'gallery');
create policy "Staff delete gallery bucket" on storage.objects
  for delete to authenticated using (bucket_id = 'gallery');
```

### Step 4 — Create your login
**Authentication → Users → Add user** (enable *Auto Confirm*); enter your email + password.

### Step 5 — Use it
Go to **https://www.pellikal.com/admin/** and sign in. Three tabs:
- **Photos** — upload/delete gallery images (category + caption).
- **Bio & Mission** — edit the Who We Are, Mission, and homepage intro text (blank a field to restore
  the built-in default).
- **Testimonials** — add/remove real customer reviews.

> **The admin page is intentionally not linked** from the menu, footer, or sitemap, and it's set to
> `noindex`. Bookmark **/admin/**. It's your private door in.

---

## Security — what's in place, honestly
No website is "unhackable," but this follows current best practices:
- **No secrets in the browser.** The anon key is designed to be public; it can't bypass your rules.
- **Row-level security (RLS)** is enforced on Supabase's servers: anyone can *read* gallery/text/
  reviews (they're shown on the site), but **inserting, editing and deleting require a signed-in
  staff account**. A visitor editing the page's JavaScript still can't write to your database.
- **Auth** is handled by Supabase (hashed passwords, tokens) — not by any code in this site.
- **Spam protection** on the form via a hidden honeypot plus Formspree's own filtering.
- **XSS-safe rendering:** photo captions, testimonials and edited text are inserted as plain text /
  escaped, so pasted HTML can't run.
- Serve over **HTTPS** (GitHub Pages does this once your domain is set).
- Optional hardening: enable email confirmation / limit sign-ups in Supabase Auth so only your
  account exists, and turn on 2-factor on your Supabase login.

---

## Editing content directly
All copy is plain HTML in the page files. Shared header/footer live in each page (edit once per file,
or ask us to regenerate). The phone appears as `tel:+15163369586` and display `516-336-9586` — update
both if it changes. Text the admin can edit is marked with `data-content="…"`; the words between the
tags are the defaults shown until changed in the admin.

### Please keep (trust & legal)
Copy avoids fabricated reviews/awards/certifications and unconditional guarantees. Warranty =
*"manufacturer-backed lifetime warranty available."* The Local Law 97 page does **not** promise
compliance and carries the required disclaimer. Add only real testimonials.

## SEO
This is now a true multi-page site: each page has a unique title, description and canonical URL, all
listed in `sitemap.xml`, with LocalBusiness schema on the home page. After launch, verify the site in
**Google Search Console** and submit the sitemap.

## Launch checklist
- [ ] `js/config.js`: add your **Formspree ID** and test a real submission → info@pellikal.com
- [ ] `js/config.js`: add **Supabase URL + anon key**; run the three SQL blocks + storage policies;
      create your login; then at **/admin/** upload a test photo, edit the bio, add a testimonial
- [ ] Phone check on mobile: tap-to-call, tap-to-text, sticky bar, menu, tint slider, form
- [ ] Deploy to GitHub Pages; connect **www.pellikal.com** (CNAME + DNS); enable HTTPS
- [ ] Submit `sitemap.xml` in Google Search Console; run Google's Rich Results Test on the home page
- [ ] Bookmark **/admin/**
