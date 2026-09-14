# SECURITY.md

The security model for the Pellikal CMS, and its limits.

---

## Principles

1. **Authorisation is membership, not identity.** A user is an admin because
   their `auth.users` UUID appears in `app_admins` — never because of an email
   string, a client-side flag, or simply being signed in.
2. **Deny by default.** Every table has RLS on with no permissive default. A
   policy is the only way data moves.
3. **The server decides.** Every check in the browser is convenience. Postgres
   enforces the real rules, so tampering with the page changes nothing.
4. **No secrets ship to the browser.** The site carries the anon public key,
   which is designed to be public. A `service_role` key must never appear in
   any file in this repository.

---

## Roles

| Role | Read published content | Write CMS | Storage write | Read `app_admins` / audit log |
|---|:--:|:--:|:--:|:--:|
| Anonymous visitor | ✅ | ❌ | ❌ | ❌ |
| Signed-in, **not** an admin | ✅ | ❌ | ❌ | ❌ |
| Admin, password only (**aal1**) | ✅ | ❌ | ❌ | ❌ |
| Admin with MFA verified (**aal2**) | ✅ | ✅ | ✅ | ✅ |

**Two things are required to write: membership *and* MFA.** An admin who has
signed in with a password but not completed their second factor has no more
power than a visitor.

**A normal authenticated account has exactly the same rights as an anonymous
visitor.** Signing up grants nothing — and signups are disabled anyway.

---

## `is_admin()`

```sql
create or replace function public.is_admin()
returns boolean language sql stable
security definer
set search_path = public, pg_catalog
as $$ select exists (select 1 from public.app_admins a where a.user_id = auth.uid()); $$;
```

- **SECURITY DEFINER** so it can read `app_admins` even though the caller
  cannot read that table directly.
- **`set search_path`** pinned, so a caller cannot create a malicious
  `app_admins` in another schema and have the function resolve to it.
- **`auth.uid()`** is derived from the verified JWT. A client cannot forge it.
- Execute is revoked from `anon`; it returns false for anonymous callers anyway.

`am_i_admin()` is the same check exposed as an RPC so `/admin/` can ask
"should I show the CMS?" before rendering anything.

---

## Multi-factor authentication (the `/admin/` login)

> **Important distinction.** MFA on your *Supabase dashboard account* protects
> the Supabase console. It does **nothing** for `pellikal.com/admin/`, which
> signs in a separate Supabase **Auth user**. Both matter, and they are
> configured in different places.

The CMS uses Supabase Auth TOTP MFA (any authenticator app).

### Assurance levels
Supabase records how strongly the session was authenticated in the JWT's `aal`
claim:

| Level | Meaning |
|---|---|
| `aal1` | Password only |
| `aal2` | Password **plus** a verified TOTP code, for this session |

### Enforced in the database, not just the screen

```sql
create or replace function public.is_admin_mfa()
returns boolean language sql stable security definer
set search_path = public, pg_catalog
as $$ select public.is_admin() and public.has_aal2(); $$;
```

Every INSERT / UPDATE / DELETE policy on `site_content`, `projects`,
`gallery_images`, `testimonials` and the `gallery` Storage objects uses
`is_admin_mfa()`. Admin reads of `app_admins` and `admin_audit_log` require it
too.

So a stolen password alone cannot change the website — not through the admin
page, and not through a hand-written API call either. Postgres refuses.

`is_admin()` deliberately does **not** include the MFA test, so the admin page
can ask "is this account even an admin?" straight after password login, before
MFA is enrolled or completed.

### Login flow

1. Email + password
2. `am_i_admin()` → not an admin? refused and signed out
3. Read the assurance level
   - already `aal2` → CMS opens
   - has a factor, session is `aal1` → enter the 6-digit code
   - no factor at all → **one-time enrolment**: QR + setup key, enter the code
4. Re-read the assurance level; only `aal2` reveals the CMS

Enrolment is effectively mandatory: an admin who never enrols stays at `aal1`
and every write is refused by RLS.

### Lost authenticator

There is no self-service reset, by design. Someone with Supabase dashboard
access must clear the factor:

1. **Authentication → Users** → the user → remove/unenroll their MFA factor
2. The admin signs in again and is taken through enrolment

If that option is unavailable on your plan, delete the Auth user, create a new
one, and add the new UUID to `app_admins`. Keep a second admin account so one
lost phone never locks the business out of its own website.

---

## Storage

Bucket `gallery`:

| Control | Value | Enforced by |
|---|---|---|
| Public read | on | bucket + policy |
| Insert / update / delete | admins only | RLS on `storage.objects` using `is_admin()` |
| Allowed **declared** types | JPEG, PNG, WebP | **bucket** `allowed_mime_types` |
| Max size | 8 MB | **bucket** `file_size_limit` |
| Object path | random UUID + whitelisted extension | `admin.js` |
| Who may upload | admins **at aal2** | RLS using `is_admin_mfa()` |

The bucket rejects uploads whose **declared Content-Type** is outside the list,
and anything over 8 MB. That blocks the cases that matter here: an `.svg` or
`.html` upload is refused, which matters because SVG can carry script and would
otherwise be served from our own origin.

> **What we do *not* claim.** This is a declared-Content-Type check, not
> byte-level inspection of file contents. A determined uploader could in
> principle send a non-image while declaring `image/jpeg`. We have not
> implemented magic-byte sniffing and do not pretend otherwise.
>
> Why that is acceptable here: **only an approved admin with MFA can upload at
> all.** There is no anonymous or ordinary-user upload path, so this is not an
> external attack surface — it would require an already-trusted, MFA-verified
> account acting maliciously. Adding an Edge Function purely to sniff bytes
> would add moving parts and a failure mode for no meaningful gain on a
> two-person marketing CMS. If public uploads are ever introduced, this
> decision must be revisited.

Original filenames are never reused — they can carry path traversal, unicode
tricks or simply leak a client's name.

---

## Audit log

Every insert/update/delete on `projects`, `gallery_images`, `testimonials` and
`site_content` writes a row via a SECURITY DEFINER trigger: **actor UUID,
action, table, record id, timestamp.**

- No passwords, tokens, API keys or row payloads are recorded.
- Anonymous users cannot read it.
- No client can write it — insert/update/delete are revoked; only the trigger
  inserts.

---

## XSS

All CMS text reaches the page through `document.createElement` and
`textContent`. `innerHTML` is used in exactly one place — a hard-coded SVG for
the back-to-top button — and never for database content.

So a testimonial containing `<script>alert(1)</script>` renders as visible
characters. Image URLs are additionally validated against `^https?://` before
being used as a `src`.

---

## What this does NOT claim

- It is **not** a claim of legal or regulatory compliance.
- It does not protect against a fully compromised admin account — one where
  the attacker holds both the password **and** the authenticator. Use a strong
  unique password, keep the authenticator on a device with a screen lock, and
  enable MFA on the Supabase **dashboard** account separately.
- It does not verify image file contents byte-by-byte (see Storage above).
- It does not protect against someone with the `service_role` key. Keep that
  key in the dashboard only — never in the repo, never in a browser.
- Contact-form leads are handled by Formspree and are **not** in this database.


---

## Browser security headers — what GitHub Pages can and cannot do

*(added 14 Sep 2026)*

GitHub Pages serves fixed response headers. It **cannot** send a custom
`Content-Security-Policy`, `Permissions-Policy`, `X-Frame-Options`,
`X-Content-Type-Options` or `Strict-Transport-Security`. HTTPS is enforced
by the "Enforce HTTPS" setting in the repository's Pages configuration —
confirm it is on.

### Done in the document (the only channel available)

- `<meta name="referrer" content="strict-origin-when-cross-origin">` on every
  page, generated by `tools/build.py` and added by hand to `/admin/`.

### Deliberately NOT done

A `Content-Security-Policy` in a `<meta>` tag. Reasons: `frame-ancestors`,
`report-uri` and report-only are unsupported in meta; the generated inline
scripts (consent defaults, GTM snippet, JSON-LD) would need hashes regenerated
every build; GTM/GA4/Ads/Formspree/Supabase each require host lists that
change under the vendor's control. A policy that silently blocks the Google
Ads conversion costs more than it protects. Do not add one without testing
every path in the live test matrix.

### Requires edge/host configuration

If Pellikal is ever placed behind Cloudflare (or any host with custom
response headers), configure — and test one at a time:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY                      # or CSP frame-ancestors 'none'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Content-Security-Policy-Report-Only: (start here, read the reports, then enforce)
  default-src 'self';
  script-src 'self' 'nonce-…' https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com;
  connect-src 'self' https://btmkronkwvtcvqcwefsi.supabase.co https://formspree.io https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.g.doubleclick.net https://www.google.com;
  img-src 'self' data: https://btmkronkwvtcvqcwefsi.supabase.co https://www.google-analytics.com https://*.g.doubleclick.net https://www.google.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  frame-src https://www.googletagmanager.com https://td.doubleclick.net;
  form-action 'self' https://formspree.io;
  frame-ancestors 'none'; base-uri 'self'; object-src 'none';
```
Nonces require the edge to inject them into the generated inline scripts, or
those scripts must be moved to files. Google's host list changes; check Google's
current CSP guidance for GTM and Ads before enforcing.

## Admin session storage

*(changed 14 Sep 2026)* The admin Supabase session — access and refresh
tokens — is held in **`sessionStorage`**, so it ends when the tab or browser is
closed. Previously it was in `localStorage` and survived restarts on any
device ever signed in. Cost: password + TOTP once per browser session.
Session lifetime within a tab is governed by the Supabase project's JWT expiry
and refresh settings (dashboard → Authentication). Do not revert to
`localStorage` without recording the decision here.

## Launch gates — verify in the live dashboard, every time

- [ ] Authentication → Sign In / Providers → **Allow new users to sign up: OFF**
- [ ] The owner's own Supabase **dashboard account has MFA enabled**
- [ ] GitHub Pages → **Enforce HTTPS: ON**
- [ ] `SECURITY-TEST-MATRIX.md` rows pass against the live project, including
      "approved admin at aal1 **cannot** write"
