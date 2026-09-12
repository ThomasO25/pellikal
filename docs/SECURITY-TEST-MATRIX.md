# SECURITY-TEST-MATRIX.md

What was verified locally, and what must be run against the real Supabase
project. **No live Supabase test has been performed** — the project was empty
and the migration had not been applied when this was written.

---

## A. Verified locally (static/browser)

| # | Test | Result |
|---|---|---|
| A1 | No `service_role` / `sb_secret` key anywhere in the repo | ✅ pass |
| A2 | `js/config.js` carries the **anon** key only | ✅ pass (JWT role claim = `anon`) |
| A3 | No `innerHTML` used for any database value | ✅ pass (one hard-coded SVG only) |
| A4 | All CMS values render via `createElement` / `textContent` | ✅ pass |
| A5 | Image URLs validated `^https?://` before use as `src` | ✅ pass |
| A6 | Public loaders keep static fallback on error/empty | ✅ pass |
| A7 | Page renders fully with Supabase unreachable | ✅ pass (blocked in test) |
| A8 | Upload path is a random UUID, not the filename | ✅ pass |
| A9 | Browser upload check limited to JPEG/PNG/WebP ≤ 8 MB | ✅ pass |
| A10 | `/admin/` is `noindex` + robots-disallowed + untracked | ✅ pass |
| A11 | Admin UI calls `am_i_admin()` before showing the CMS | ✅ pass (code path present) |
| A13 | Admin UI reads the assurance level and blocks the CMS below `aal2` | ✅ pass (code path present) |
| A14 | MFA QR assigned to `<img src>` only after validating the `data:image/svg+xml` scheme; never injected as markup | ✅ pass |
| A15 | Every write policy in `0001` uses `is_admin_mfa()`, not bare `is_admin()` | ✅ pass (0 bare occurrences in policies) |
| A16 | Storage deletes are awaited and failures surfaced; null `image_path` never deleted | ✅ pass |
| A17 | Project and gallery alt text required before save/upload | ✅ pass |
| A18 | Homepage project query filters `is_published` **and** `featured` server-side, ordered, limit 6 | ✅ pass |
| A19 | No client-side `featured` filter, no "show everything" fallback, no post-query slice | ✅ pass |
| A20 | Enrolment clears stale **unverified** TOTP factors; verified factors untouched | ✅ pass (code path present) |
| A21 | Unauthorised screen shows a generic message; error detail only to `console.warn` | ✅ pass |
| A12 | JS syntax clean (`node --check`) | ✅ pass |

> A1–A12 are **client-side** facts. They do not prove the database is safe.
> Only section B does that.

---

## B. Must be run on the real project (after the migration)

Run each as the stated role. **Every ❌ row must fail.** A pass where a failure
is expected is a security defect — stop and report it.

### B1 · Anonymous (signed out)

Browser console on the live site, or a REST client with the anon key.

| Test | Expected |
|---|---|
| `select` published projects | ✅ rows returned |
| `select` published testimonials / gallery / site_content | ✅ rows returned |
| `select` a row with `is_published = false` | ❌ not returned |
| `insert` into `projects` | ❌ RLS violation |
| `update` / `delete` any project | ❌ RLS violation |
| `insert` / `delete` a testimonial | ❌ RLS violation |
| `select` from `app_admins` | ❌ denied / empty |
| `select` from `admin_audit_log` | ❌ denied / empty |
| upload to the `gallery` bucket | ❌ denied |
| delete a `gallery` object | ❌ denied |

```js
// paste in the browser console on www.pellikal.com
const sb = supabase.createClient(PELLIKAL_CONFIG.SUPABASE_URL, PELLIKAL_CONFIG.SUPABASE_ANON_KEY);
await sb.from('projects').select('*');                       // expect rows
await sb.from('projects').insert({title:'hack'});            // expect error
await sb.from('app_admins').select('*');                     // expect error/empty
await sb.from('admin_audit_log').select('*');                // expect error/empty
await sb.storage.from('gallery').upload('x.jpg', new Blob([1])); // expect error
```

### B1b · Admin signed in with password only (aal1, MFA not completed)

**This is the new critical test.** Sign in as the admin, then — *before*
entering the 6-digit code — open the console and try to write.

| Test | Expected |
|---|---|
| `rpc('am_i_admin')` | returns **true** (membership is not the same as authorisation) |
| `mfa.getAuthenticatorAssuranceLevel()` → `currentLevel` | `aal1` |
| `insert` / `update` / `delete` on `projects` | ❌ RLS violation |
| `insert` / `delete` a testimonial | ❌ RLS violation |
| update `site_content` | ❌ RLS violation |
| upload or delete a Storage object | ❌ denied |
| `select` from `app_admins` or `admin_audit_log` | ❌ denied / empty |
| The CMS itself | never revealed; the code screen is shown instead |

```js
// after password login, BEFORE entering the TOTP code
await sb.rpc('am_i_admin');                                  // true
(await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data;    // currentLevel "aal1"
await sb.from('projects').insert({title:'aal1 write'});       // MUST fail
```

Then complete the code step and repeat: the same insert must now succeed.
**If the aal1 insert succeeds, stop — MFA is not being enforced.**

### B2 · Ordinary authenticated user (NOT in `app_admins`)

Create `tester@example.com` (Auto Confirm). **Do not** add the UUID to
`app_admins`.

| Test | Expected |
|---|---|
| Sign in at `/admin/` | ❌ "not authorised", signed out, no CMS, no MFA prompt |
| `rpc('am_i_admin')` | returns **false** |
| `insert` / `update` / `delete` any CMS table | ❌ RLS violation |
| upload or delete a Storage object | ❌ denied |
| `select` `app_admins` or `admin_audit_log` | ❌ denied / empty |
| `insert` into `app_admins` (self-promotion) | ❌ denied — no policy exists |

> This is the most important test in the document. It proves that signing up
> grants nothing.

### B3 · Approved admin

| Test | Expected |
|---|---|
| First sign-in with no factor | ✅ MFA enrolment screen (QR + setup key) |
| Enter the code from the app | ✅ session becomes `aal2`, CMS loads |
| Later sign-in | ✅ password, then code, then CMS |
| `mfa.getAuthenticatorAssuranceLevel()` | `currentLevel` = **aal2** |
| `rpc('am_i_admin')` | returns **true** |
| Create / edit / delete a project | ✅ works |
| Upload and delete a gallery photo | ✅ works |
| Add and delete a testimonial | ✅ works |
| Edit permitted `site_content` and publish | ✅ works, visible on the site |
| `select` `admin_audit_log` | ✅ rows for the actions just performed |
| `insert` into `app_admins` | ❌ denied (dashboard-only by design) |

### B4 · Input and file safety

| Test | Expected |
|---|---|
| Testimonial quote `<script>alert(1)</script>` | Renders as **visible text**; no alert |
| Project title `<img src=x onerror=alert(1)>` | Renders as visible text |
| Upload `test.svg` | ❌ rejected — declared type not in the allowed list |
| Upload `test.html` | ❌ rejected — same |
| Upload any file sent with an unsupported `Content-Type` | ❌ rejected |
| Upload a 12 MB JPEG | ❌ rejected (8 MB bucket cap) |
| Upload a valid 2 MB JPEG / PNG / WebP | ✅ accepted, stored under a random UUID name |
| Gallery upload with the alt-text box empty | ❌ blocked by the admin UI |
| Project photo saved with no alt text | ❌ blocked by the admin UI |

> **Scope note — read before testing.** The bucket enforces the **declared**
> Content-Type and the size limit. It is **not** byte-level file sniffing, and
> we do not claim it is. A file sent with a spoofed `image/jpeg` header may be
> accepted. That is tolerated because uploading requires an approved admin with
> MFA — there is no anonymous or ordinary-user upload path — so it is not an
> external attack surface. Do not write a test that asserts a renamed `.exe` is
> detected from its bytes; it is not implemented. Revisit this if public
> uploads are ever added.

### B5 · Resilience

| Test | Expected |
|---|---|
| Block `*.supabase.co` in devtools, load the homepage | Page renders fully with built-in content |
| Empty database, load the site | Static projects and the honest testimonial empty-state show |
| **After running seed 0002**, load the homepage | **Six** projects, matching the static six |
| Storage delete fails during a project delete | Row is deleted; admin is told the file is now unused |

### B5b · Homepage project selection

The homepage is designed to hold **at most six featured projects**. All the
filtering happens server-side (`is_published = true`, `featured = true`,
`sort_order` ascending, `limit 6`), so these are the behaviours to confirm:

| Test | Expected |
|---|---|
| Seeded database, load homepage | Exactly **6** projects, in `sort_order` order |
| Add a 7th featured project with a `sort_order` **after** the existing six | Homepage still shows **6** — the newcomer is queued, not displayed |
| Move that 7th project's `sort_order` **ahead** of an existing one | It enters the top six; the one it displaced drops off |
| Untick "Show on homepage" on one of the six | The next featured project by `sort_order` fills the freed slot |
| Untick "Show on homepage" on **all** projects | Homepage falls back to the static six-card HTML — never to unfeatured rows |
| Set a project `is_published = false` | It never appears, even if it is featured and top of the order |

> ⚠️ **Do not test for "a seventh project makes seven cards."** It will not, and
> should not. Six is the design.
>
> This section was rewritten after a real bug: the query used to `limit(6)`
> **before** filtering `featured` in JavaScript, so a featured seventh project
> could never reach the page, and unfeaturing one of the first six left a gap
> instead of promoting the next. Worse, an "if nothing is featured, show
> everything" fallback meant the *Show on homepage* checkbox could be ignored
> entirely. All three are fixed; these tests exist to keep them fixed.
| Force a query error | Section keeps its static content; no blank areas |

---

## C. Record the run

| Section | Run by | Date | Result |
|---|---|---|---|
| B1 Anonymous | | | |
| B5b Homepage selection | | | |
| **B1b Admin at aal1 (MFA not done)** | | | |
| B2 Non-admin | | | |
| B3 Admin | | | |
| B4 Input/file | | | |
| B5 Resilience | | | |

Do not treat the CMS as production-ready until **B1b and B2 both pass in
full**. B1b proves MFA is enforced by the database; B2 proves that simply
having an account grants nothing.
