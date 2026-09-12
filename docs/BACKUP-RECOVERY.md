# BACKUP-RECOVERY.md

What to back up, how to restore, and what the blast radius of a mistake is.

---

## What exists, and where

| Asset | Location | If lost |
|---|---|---|
| Website code, pages, images shipped with the site | GitHub repo | Re-clone. This is the real source of truth. |
| Projects, gallery rows, testimonials, editable text | Supabase Postgres | Site falls back to built-in content — **it stays up** |
| Uploaded photos | Supabase Storage `gallery` | Images 404; the rest of the page is unaffected |
| Domain / DNS | Wix (registrar + DNS) | Site unreachable until restored |
| Form submissions | Formspree + email | Not in Supabase at all |

**The design point:** the public website does not depend on Supabase. Losing
the whole database is a content loss, not an outage.

---

## Backups

### Supabase (automatic)
Paid plans include automatic daily backups with point-in-time recovery. Check
**Database → Backups** for what your plan provides. Free-tier projects may have
limited or no automatic backups — do not assume.

### Manual database export (recommended monthly, and before any schema change)

SQL Editor, then save each result as CSV:

```sql
select * from public.projects       order by sort_order;
select * from public.gallery_images order by sort_order;
select * from public.testimonials   order by created_at;
select * from public.site_content   order by key;
select * from public.app_admins;
```

Or, with the Supabase CLI:

```bash
supabase db dump --db-url "postgresql://…" > pellikal-backup-$(date +%F).sql
```

Store it somewhere that is not the same Supabase project.

### Storage
Download the `gallery` bucket contents periodically (Storage → gallery →
select → download). **Keep the originals of every project photo off-platform
as well** — camera originals are irreplaceable; the site copies are resized.

---

## Restore

### A few rows deleted by accident
Re-add them in the CMS. Check `admin_audit_log` for what was removed and when:

```sql
select created_at, actor, action, entity, record_id
from public.admin_audit_log
order by created_at desc limit 50;
```

### Whole database lost / project recreated
1. Run `supabase/migrations/0001_pellikal_cms.sql` on the new project
2. Recreate the admin user and the `app_admins` row (`SUPABASE-SETUP.md` §3)
3. Re-import the CSV/SQL backup
4. Re-upload the gallery images
5. Update `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `js/config.js` if the project changed
6. Re-run the `SECURITY-TEST-MATRIX.md` B-section

**While you do this the website keeps serving its built-in content.**

### Website itself
GitHub Pages serves from the repo. Roll back a bad deploy by reverting the
commit and pushing. Keep the `CNAME` file — losing it breaks the custom domain.

---

## Before any schema change

1. Export the tables (above)
2. Apply the change to a **branch or a scratch project** first
3. Re-run the security test matrix
4. Only then apply to production

Write new migrations as `supabase/migrations/0002_*.sql` and so on. **Never
edit `0001` after it has been applied** — an applied migration is history.
