# Pellikal final handoff

This is the working source package to deploy from.

## Final fixes applied

- Fixed stale TOTP cleanup in `js/admin.js`: unverified factors are read from `mfa.listFactors().data.all`, and only `factor_type === "totp" && status === "unverified"` is removed. Verified MFA factors are never removed by this cleanup.
- Gallery uploads now remove the newly uploaded Storage object if the database insert fails.
- Project image replacement keeps the currently published image until the database update succeeds.
- Replacing a not-yet-published project image removes the abandoned draft upload.
- A failed project database save removes the new draft upload and restores the last successfully saved image in the editor.
- Repeated edits to the same existing project correctly track the most recently saved image, so later replacements do not target an already-deleted older image.
- Leaving the Projects view attempts to remove an uncommitted draft image.
- Project image inputs are temporarily disabled during upload to prevent overlapping uploads from the same picker.

## Validation completed locally

- `python3 tools/build.py` -> `Pages updated: 0`, generated pages synchronized.
- `node --check` passes for `js/admin.js`, `js/config.js`, `js/main.js`, and `js/tracking.js`.
- Local HTTP smoke test returned HTTP 200 for all major routes, including `/admin/` and `/window-inserts/`.
- Internal local-link/resource scan found no missing generated-site assets/routes; the only template placeholders are in `partials/`, as expected.
- Production public pages contain the intended GTM container; `/admin/` remains excluded. The intentional `/local-law-97/` redirect remains untagged.
- `generate_lead`, `window_insert_lead`, and Formspree configuration remain present.
- The frontend Supabase JWT is an `anon` key, not a service-role key.
- The migrations still enforce approved-admin membership plus `aal2` MFA for CMS writes and admin-only Storage writes.

## What cannot be proven locally

The real Supabase database, RLS policies, Storage policies, Auth MFA flow, and live Google tags must still be tested against the actual Supabase/Google accounts after setup. Do not skip `docs/SECURITY-TEST-MATRIX.md`.

## Supabase setup order

1. In Supabase SQL Editor, run `supabase/migrations/0001_pellikal_cms.sql` in full.
2. Review the three ownership-claiming image alt texts noted at the top of `0002_seed_current_content.sql`. If they are genuine Pellikal jobs, leave them. Otherwise make them neutral before running the seed.
3. Run `supabase/migrations/0002_seed_current_content.sql`.
4. Disable public/self-service Auth signups.
5. Create the first admin user manually in Supabase Auth and Auto Confirm it.
6. Copy the user's UUID and add it with SQL:

   ```sql
   insert into public.app_admins (user_id, email_note)
   values ('PASTE-USER-UUID', 'owner@pellikal.com');
   ```

7. Deploy this website package.
8. Open `/admin/`, sign in with the approved account, and enroll TOTP MFA.
9. Complete the tests in `docs/SECURITY-TEST-MATRIX.md`, especially the `aal1` write-fails / `aal2` write-succeeds test.
10. Test one homepage text edit, one project edit, one gallery upload/delete, and one testimonial add/delete.
11. Verify the public homepage still shows the intended six featured projects.
12. After deployment, use GTM Preview / Tag Assistant and GA4 Realtime before Damian launches paid traffic.

## Content still outstanding

The actual installer/fitting Window Inserts photo is still not in this repository. The current page remains functional without it, but add the approved installer image when available. Do not describe third-party/manufacturer imagery as Pellikal's own work unless ownership/use is confirmed.
