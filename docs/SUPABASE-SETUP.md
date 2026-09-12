# SUPABASE-SETUP.md

Exact steps to stand up the Pellikal CMS on a **fresh, empty** Supabase project.
Follow them in order. Nothing works until step 3 is done.

> **You will never put a service_role key in the website.** The site uses the
> anon public key only. Security comes from row-level security on Supabase's
> servers.

---

## 1. Run the migration

1. Supabase dashboard → your project → **SQL Editor** → **New query**
2. Open **`supabase/migrations/0001_pellikal_cms.sql`**, copy the whole file, paste, **Run**
3. Expect *Success. No rows returned.* It is safe to run again.

### 1b. Run the seed — **do not skip this**

**SQL Editor → New query** → paste **`supabase/migrations/0002_seed_current_content.sql`** → **Run**.

The homepage ships six static project cards as a fallback. The frontend swaps
that whole block out the moment `projects` returns *any* row — so on an empty
database, adding your first project would drop the homepage from six projects
to one. The seed loads today's six projects and today's editable copy, so the
site looks identical on day one and the admin opens with real text instead of
blank fields.

It is idempotent (fixed UUIDs, `on conflict do nothing`): re-running never
duplicates rows and never overwrites an edit you made later.

Verify:

```sql
select sort_order, title, service from public.projects order by sort_order;  -- 6 rows
select key, left(value, 50) from public.site_content order by key;           -- 7 rows
```

> ⛔ Do **not** run `docs/SUPABASE-SCHEMA.sql`. It is a retired stub that
> deliberately raises an error; its old policies let any signed-in user write.

**What it creates:** `app_admins`, `site_content`, `projects`, `gallery_images`,
`testimonials`, `admin_audit_log`, the `is_admin()` / `am_i_admin()` functions,
all RLS policies, and the `gallery` Storage bucket (public read, 8 MB cap,
JPEG/PNG/WebP only).

At this point **nobody can write anything** — there are no admins yet.

---

## 2. Turn off self-service signups

**Authentication → Sign In / Providers → Email**

- [ ] **Disable "Allow new users to sign up"**

This is the single most important dashboard setting. Without it, a stranger
could create an account. They still could not write anything (they would not be
in `app_admins`), but there is no reason to allow accounts at all.

- [ ] Leave **Confirm email** on
- [ ] Disable any social/OAuth provider you are not using

---

## 3. Create the owner's admin user

1. **Authentication → Users → Add user → Create new user**
2. Email + a strong password
3. Tick **Auto Confirm User** → create

### Get the UUID
In the Users list, click the new user. Copy the **UID** — a long value like
`3f2b9c10-7a4e-4f1a-9c2b-8d5e6f7a1b2c`. That UUID is the identity, not the email.

### Add them to the admin list
**SQL Editor → New query**, paste, replace the UUID, **Run**:

```sql
insert into public.app_admins (user_id, email_note)
values ('PASTE-THE-UUID-HERE', 'owner@pellikal.com');
```

Verify:

```sql
select user_id, email_note, created_at from public.app_admins;
```

> `email_note` is a human label for your own reference. **It is never used for
> authorisation** — only the UUID is.

---

## 4. Connect the website

`js/config.js` already holds the project URL and the **anon public** key
(Project Settings → API). Confirm they match this project.

```js
SUPABASE_URL:      "https://YOURPROJECT.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi…",   // anon public — NOT service_role
```

Table and bucket names in that file must match the migration: `site_content`,
`projects`, `gallery_images`, `testimonials`, bucket `gallery`.

---

## 5. Check Storage

**Storage → gallery** → the bucket should read:

| Setting | Expected |
|---|---|
| Public bucket | **On** (visitors must see the photos) |
| File size limit | **8 MB** |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` |

The migration sets all three. If you created a bucket by hand earlier with
different settings, re-run the migration — it overwrites them.

---

## 6. First sign-in and MFA enrolment

> The CMS requires two-factor authentication. This is separate from any MFA on
> your Supabase **dashboard** account. Have an authenticator app ready
> (Google Authenticator, Authy, 1Password…).

1. Go to **/admin/** → sign in with the owner email and password
2. Because the account has no authenticator yet, you'll see **"Set up two-factor
   authentication"**
3. Scan the QR code with your app, or type the setup key by hand.
   **Save that key somewhere safe** — it is your way back if the phone is lost
4. Enter the 6-digit code → **Confirm and continue**
5. The CMS opens. Your session is now `aal2`

### Confirm it actually worked

In the browser console on `/admin/`:

```js
const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
data.currentLevel   // must be "aal2"
```

If it says `aal1`, MFA did not complete and **every save will be refused by the
database** — that is the enforcement working, not a bug.

### Then test the CMS

6. Add a test project with a photo and alt text → **Publish changes**
7. Open the homepage → your test project appears **alongside the seeded six**
8. Delete the test project

If you see *"This account is not authorised…"*, the `app_admins` row is missing
or has the wrong UUID. Re-check step 3.

---

## 7. Test a NON-admin account

Do this once. It is the proof that the model works.

1. **Authentication → Users → Add user** → `tester@example.com`, Auto Confirm.
   **Do not** add this UUID to `app_admins`.
2. Sign in at **/admin/** as the tester
3. **Expected:** a clear "not authorised" message, and you are signed straight
   back out. No CMS is shown.
4. Full server-side checks are in `docs/SECURITY-TEST-MATRIX.md`
5. Delete the tester user when you're done

---

## 8. Adding a second admin later

**Do this.** One admin with one phone is a single point of failure — if that
device is lost, nobody can edit the website until the factor is cleared.

1. Authentication → Users → Add user (Auto Confirm)
2. Copy their UUID
3. ```sql
   insert into public.app_admins (user_id, email_note)
   values ('THEIR-UUID', 'their.name@example.com');
   ```
4. They sign in at `/admin/` and are walked through their own MFA enrolment,
   exactly as in §6. Each admin has their own authenticator — never share one.

### If an admin loses their authenticator

1. **Authentication → Users** → select the user → remove/unenroll their MFA factor
2. They sign in again and are taken through enrolment from scratch

If your plan doesn't expose that control, delete the Auth user, create a
replacement, and add the new UUID to `app_admins`. Their old `app_admins` row
is removed automatically when the auth user is deleted (cascade).

To remove someone:

```sql
delete from public.app_admins where user_id = 'THEIR-UUID';
```

Access ends on their next request. Also delete the Auth user if they should not
be able to sign in at all.

> `app_admins` cannot be edited from the website — by design. There is no
> insert/update/delete policy on it, so promoting an admin is always a
> deliberate dashboard action.
