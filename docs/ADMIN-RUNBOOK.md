# ADMIN-RUNBOOK.md

Day-to-day use of the Pellikal site manager at **/admin/**.

---

## Signing in

Go to `https://www.pellikal.com/admin/`, then:

1. **Email and password**
2. **A 6-digit code from your authenticator app**

Both are required, every time. The site checks with the server that your
account is an approved admin *before* showing anything, and the database
refuses every save unless your session has passed the code step. A stolen
password on its own cannot change the website.

**First time only:** you'll be shown a QR code to scan into an authenticator
app (Google Authenticator, Authy, 1Password…), plus a setup key. Scan it, enter
the code it shows, and you're in. **Keep that setup key somewhere safe.**

If your account isn't on the approved list you'll see "This account is not
authorised…" and be signed out. That is intentional — being signed in is not
the same as being allowed.

### Lost your phone?

There is no self-service reset. Whoever has Supabase dashboard access clears
your authenticator (Authentication → Users → your user → remove MFA factor),
then you sign in and enrol again. This is exactly why a second admin account is
worth having.

The admin area is unlinked from the site, `noindex`, disallowed in
`robots.txt`, and carries **no** marketing tracking.

---

## The tabs

| Tab | What it does |
|---|---|
| **Homepage** | Headline, headline paragraph, LLumar SelectPro paragraph, closing CTA |
| **Projects** | Add / edit / delete real projects, with a photo, alt text, "show on homepage" and sort order |
| **Photos** | Upload and delete gallery photos. Alt text is **required** |
| **Testimonials** | Add and delete **real** customer reviews |

### How "Show on homepage" works

The homepage shows **the first six** projects that have *Show on homepage*
ticked, in **sort order** (lowest number first).

- Adding a seventh featured project does **not** make seven appear — it waits.
- To promote it, give it a **lower sort order** than one currently showing.
- Untick *Show on homepage* on one and the next in line takes its place.
- A project can stay in the system without being on the homepage at all.

### Editing → publishing

Typing updates the preview on the right **only**. The public site changes when
you press **Publish changes** and see *"Changes published successfully."*

---

## Photos

- **JPEG, PNG or WebP. Maximum 8 MB.** Other types and larger files are
  rejected by the server, not just by the browser.
- Files are stored under a random name. Your original filename is discarded —
  it can leak a client's name and is not needed.
- **Alt text is required** on gallery uploads and on project photos: one plain
  sentence describing what is visible. It's what a screen-reader user hears,
  and it helps search. Describe the actual photo — don't paste keywords.
- **Only upload photos Pellikal owns or has permission to publish.** Never
  caption a manufacturer or stock image as our own job.

---

## Testimonials

Real customers only. Do not invent, reword the meaning of, or reuse someone
else's review. Light typo fixes are fine. If a review was given in exchange for
anything, flag it — it may need disclosure.

---

## What you cannot change here, and where to change it instead

| Item | Where |
|---|---|
| Phone, email, service area | `site.config.json` → run `python3 tools/build.py` |
| Menu, footer links, page list | `site.config.json` → run the build |
| Homepage hero photo | Replace the file in `assets/images/projects/` |
| LLumar SelectPro logo | Replace `assets/images/llumar-selectpro.jpg` |
| Page copy outside the CMS fields | Edit that page's `index.html` |

> These controls used to exist in the CMS and were **removed** because the
> public site ignored them — it reported "published" while nothing changed.
> A control that lies is worse than no control.

---

## If something looks wrong

| Symptom | Cause | Fix |
|---|---|---|
| "Supabase isn't connected" | Keys missing from `js/config.js` | See `SUPABASE-SETUP.md` §4 |
| "Not authorised" | Your UUID isn't in `app_admins` | `SUPABASE-SETUP.md` §3 |
| Published change not on the site | Browser cache | Hard-refresh |
| Photo won't upload | Wrong type, over 8 MB, or alt text missing | Re-save as JPEG under 8 MB and add a description |
| "Saved, but the previous image could not be removed" | Storage delete failed | The site is fine; the old file is just unused. Mention it so it can be tidied |
| Everything saves but nothing changes | Session dropped to `aal1` | Sign out and back in, completing the code step |
| Site shows old content, CMS looks fine | Supabase unreachable — the site fell back to its built-in content | Check Supabase status; the site stays up either way |

---

## Good habits

- Strong unique password, plus your own authenticator — never share either
- Enable MFA on the Supabase **dashboard** account too; that's a separate login
- Don't share the login — add a second admin instead (`SUPABASE-SETUP.md` §8)
- Remove admins who leave
- Every change is recorded in the audit log with who and when
