# DEPLOYMENT-CHECKLIST.md

Run through this before every push, and in full before the Window Inserts
campaign goes live.

---

## 1. Build

```bash
python3 tools/build.py     # run twice
```

The **second** run must say `Pages updated: 0`. If it doesn't, something isn't
synchronised — commit the generated files.

- [ ] Build clean, second run reports 0 updated
- [ ] `node --check js/*.js` passes
- [ ] No dead links, all images have alt text, JSON-LD parses

---

## 2. Supabase (first deploy only)

- [ ] `supabase/migrations/0001_pellikal_cms.sql` run on the project
- [ ] **Signups disabled** (Authentication → Sign In / Providers)
- [ ] Owner admin user created, UUID added to `app_admins`
- [ ] `gallery` bucket: public read, 8 MB, JPEG/PNG/WebP
- [ ] Signed in at `/admin/` successfully
- [ ] **Non-admin test passed** (`SECURITY-TEST-MATRIX.md` B2)
- [ ] `js/config.js` has the anon key — **never** service_role

---

## 3. Content truthfulness

- [ ] No image captioned as Pellikal's own work unless it is
- [ ] No invented testimonial, award, certification or statistic
- [ ] Manufacturer claims attributed and sourced (`CLAIMS-SOURCES.md`)
- [ ] Warranty wording conditional ("qualifying products, restrictions apply")
- [ ] LLumar / SelectPro usage matches `LLUMAR-USAGE-REVIEW.md`

---

## 4. Tracking — do not change these

- [ ] `GTM-MK2PHWB` present once in `<head>` and once as `<noscript>` per public page
- [ ] `/admin/` and `/local-law-97/` carry **no** container
- [ ] No hard-coded `gtag(`, `G-`, or `AW-` in page code
- [ ] `generate_lead` and `window_insert_lead` intact
- [ ] GA4 `G-J8SQ4CC7BT` and Ads `AW-859941989` configured **inside GTM only**

---

## 5. Forms

- [ ] Formspree ID `maewnodj` unchanged in `js/config.js`
- [ ] Test submission arrives at info@pellikal.com
- [ ] A failed submission fires **no** conversion and keeps the typed text
- [ ] `/contact/?service=window-inserts` pre-selects the dropdown

---

## 6. Push

- [ ] Push to `main`; GitHub Pages redeploys (~1 min)
- [ ] `CNAME` still present in the repo

---

## 7. Verify live

- [ ] `https://www.pellikal.com/` loads over HTTPS
- [ ] `https://www.pellikal.com/window-inserts/` loads (**trailing slash**)
- [ ] Mobile: menu opens, no sideways scroll, tap-to-call works
- [ ] Tag Assistant / GTM Preview shows the container firing once
- [ ] GA4 Realtime shows the pageview and `click_to_call`
- [ ] A real test lead produces `generate_lead`
- [ ] `/admin/` still requires sign-in and still shows no container

---

## 8. Then, and only then

- [ ] Tell Damian to point the campaign at
      `https://www.pellikal.com/window-inserts/`

---

## Rollback

Revert the commit and push. GitHub Pages serves the previous version within a
minute. Supabase content is unaffected by a code rollback.
