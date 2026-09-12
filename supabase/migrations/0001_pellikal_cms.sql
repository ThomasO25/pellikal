-- ============================================================================
--  PELLIKAL CMS — 0001_pellikal_cms.sql
--  Target: a COMPLETELY EMPTY Supabase project.
--  Run once, in full, in the SQL Editor. Safe to re-run (idempotent).
--
--  SECURITY MODEL
--    anon              -> may SELECT published public content only. No writes.
--    authenticated     -> NO CMS rights by default. Being signed in is not
--                         authorisation. A normal user account can do nothing
--                         an anonymous visitor cannot.
--    admin             -> a row in public.app_admins keyed to auth.users(id)
--                         AND a session at assurance level aal2 (TOTP MFA
--                         completed). Admin membership alone is NOT enough to
--                         write: the JWT must carry "aal":"aal2".
--
--  Authorisation is by UUID membership in app_admins — never by email string,
--  never by a hard-coded address, never by a client-supplied claim.
--
--  NOTHING HERE STORES A SECRET. The website uses the anon key only.
--  Never put a service_role key in the site or in this file.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. ADMIN REGISTRY
-- ---------------------------------------------------------------------------
create table if not exists public.app_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email_note  text,                       -- human label only; NOT used for authz
  added_by    uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  constraint app_admins_email_note_len check (email_note is null or char_length(email_note) <= 200)
);
comment on table  public.app_admins is 'Allow-list of CMS administrators. Membership here is the ONLY thing that grants write access.';
comment on column public.app_admins.email_note is 'Human-readable label for the dashboard. Never used for authorisation.';

-- ---------------------------------------------------------------------------
-- 2. is_admin() — the single authorisation helper
--
--    SECURITY DEFINER so it can read app_admins even though the caller cannot.
--    search_path is pinned to defeat search-path hijacking.
--    Returns false for anonymous callers (auth.uid() is null).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.app_admins a
    where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
comment on function public.is_admin() is 'True only if the caller is signed in AND listed in app_admins.';

-- Explicit RPC the admin UI calls before revealing the CMS.
create or replace function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.is_admin();
$$;
revoke all on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2b. MFA ASSURANCE LEVEL
--
--     Supabase puts the session's Authenticator Assurance Level in the JWT as
--     the "aal" claim. aal1 = password only. aal2 = a second factor (TOTP) was
--     verified for THIS session.
--
--     Write access requires aal2. Enforcing it here — not just in the admin
--     page — means a stolen password alone cannot change the website, and a
--     hand-crafted API call from a password-only session is rejected by
--     Postgres.
--
--     is_admin() deliberately does NOT include the aal2 test, so the admin UI
--     can still ask "is this account an admin?" immediately after password
--     login, before MFA has been completed or enrolled.
-- ---------------------------------------------------------------------------
create or replace function public.has_aal2()
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;
revoke all on function public.has_aal2() from public, anon;
grant execute on function public.has_aal2() to authenticated;

-- The single predicate every write policy uses.
create or replace function public.is_admin_mfa()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.is_admin() and public.has_aal2();
$$;
revoke all on function public.is_admin_mfa() from public, anon;
grant execute on function public.is_admin_mfa() to authenticated;
comment on function public.is_admin_mfa() is 'True only for an approved admin whose session has completed MFA (aal2). Required for every CMS write.';

-- ---------------------------------------------------------------------------
-- 3. AUDIT LOG
--    Written by triggers. Never readable by the public.
--    Records WHO / WHAT / WHICH ROW / WHEN. No credentials, no row payloads.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id          bigint generated always as identity primary key,
  actor       uuid,                       -- auth.uid() of the admin
  action      text not null check (action in ('insert','update','delete')),
  entity      text not null check (char_length(entity) <= 63),
  record_id   text,
  created_at  timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx   on public.admin_audit_log (actor);
comment on table public.admin_audit_log is 'Append-only trail of CMS writes. Never exposed to anon. Contains no secrets or payloads.';

create or replace function public.log_admin_action()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  rid text;
begin
  if (tg_op = 'DELETE') then
    rid := coalesce(old.id::text, '');
  else
    rid := coalesce(new.id::text, '');
  end if;

  insert into public.admin_audit_log (actor, action, entity, record_id)
  values (auth.uid(), lower(tg_op), tg_table_name, rid);

  if (tg_op = 'DELETE') then return old; end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. SITE CONTENT  (short editable strings only)
--
--    IMPORTANT: phone, email and service area are deliberately NOT here.
--    Those values generate tel:/sms:/mailto: links, meta descriptions and
--    JSON-LD across every page, so they are build-time values in
--    site.config.json. Editing them at runtime could only ever change some
--    occurrences, leaving the site inconsistent. See docs/DATA-MODEL.md.
-- ---------------------------------------------------------------------------
create table if not exists public.site_content (
  key         text primary key check (char_length(key) between 1 and 64),
  value       text check (value is null or char_length(value) <= 4000),
  is_published boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);
comment on table public.site_content is 'Short editable text fragments consumed by [data-content] on public pages.';

-- ---------------------------------------------------------------------------
-- 5. PROJECTS
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 160),
  location     text check (location is null or char_length(location) <= 160),
  service      text check (service is null or char_length(service) <= 160),
  description  text check (description is null or char_length(description) <= 2000),
  challenge    text check (challenge  is null or char_length(challenge)  <= 2000),
  result       text check (result     is null or char_length(result)     <= 2000),
  image_url    text check (image_url  is null or char_length(image_url)  <= 1000),
  image_path   text check (image_path is null or char_length(image_path) <= 500),
  alt_text     text check (alt_text   is null or char_length(alt_text)   <= 300),
  featured     boolean not null default true,     -- show on the homepage
  is_published boolean not null default true,     -- visible to the public at all
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  updated_by   uuid references auth.users(id)
);
create index if not exists projects_public_idx on public.projects (is_published, featured, sort_order);

-- ---------------------------------------------------------------------------
-- 6. GALLERY IMAGES
-- ---------------------------------------------------------------------------
create table if not exists public.gallery_images (
  id           uuid primary key default gen_random_uuid(),
  url          text not null check (char_length(url) <= 1000),
  path         text check (path is null or char_length(path) <= 500),
  caption      text check (caption  is null or char_length(caption)  <= 300),
  alt_text     text check (alt_text is null or char_length(alt_text) <= 300),
  category     text check (category is null or char_length(category) <= 80),
  featured     boolean not null default false,
  is_published boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);
create index if not exists gallery_public_idx on public.gallery_images (is_published, sort_order);

-- ---------------------------------------------------------------------------
-- 7. TESTIMONIALS  (real customers only — enforced by policy, not by code)
-- ---------------------------------------------------------------------------
create table if not exists public.testimonials (
  id           uuid primary key default gen_random_uuid(),
  quote        text not null check (char_length(quote) between 1 and 2000),
  author       text not null check (char_length(author) between 1 and 160),
  location     text check (location is null or char_length(location) <= 160),
  source       text check (source   is null or char_length(source)   <= 160),
  is_published boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);
create index if not exists testimonials_public_idx on public.testimonials (is_published, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. updated_at / updated_by maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_row();

drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch before update on public.site_content
  for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- 9. AUDIT TRIGGERS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['projects','gallery_images','testimonials'] loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I
         for each row execute function public.log_admin_action()', t, t);
  end loop;
end $$;

-- site_content has a text primary key, so log the key as the record id
create or replace function public.log_site_content_action()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.admin_audit_log (actor, action, entity, record_id)
  values (auth.uid(), lower(tg_op), 'site_content',
          case when tg_op = 'DELETE' then old.key else new.key end);
  if (tg_op = 'DELETE') then return old; end if;
  return new;
end;
$$;
drop trigger if exists site_content_audit on public.site_content;
create trigger site_content_audit after insert or update or delete on public.site_content
  for each row execute function public.log_site_content_action();

-- ============================================================================
-- 10. ROW LEVEL SECURITY
--     Every table below denies by default; the policies are the only way in.
-- ============================================================================
alter table public.app_admins      enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.site_content    enable row level security;
alter table public.projects        enable row level security;
alter table public.gallery_images  enable row level security;
alter table public.testimonials    enable row level security;

-- ---- app_admins : admins may read the list. NOBODY may write it from the
--      website. Adding/removing an admin is a deliberate dashboard action.
drop policy if exists app_admins_read on public.app_admins;
create policy app_admins_read on public.app_admins
  for select to authenticated using (public.is_admin_mfa());
-- (no insert/update/delete policies at all -> writes are impossible via the API)

-- ---- admin_audit_log : admins read. No client may write it; only the
--      SECURITY DEFINER trigger inserts rows.
drop policy if exists audit_read on public.admin_audit_log;
create policy audit_read on public.admin_audit_log
  for select to authenticated using (public.is_admin_mfa());

-- ---- site_content
drop policy if exists content_public_read on public.site_content;
drop policy if exists content_admin_all   on public.site_content;
create policy content_public_read on public.site_content
  for select to anon, authenticated using (is_published);
create policy content_admin_all on public.site_content
  for all to authenticated using (public.is_admin_mfa()) with check (public.is_admin_mfa());

-- ---- projects
drop policy if exists projects_public_read on public.projects;
drop policy if exists projects_admin_all   on public.projects;
create policy projects_public_read on public.projects
  for select to anon, authenticated using (is_published);
create policy projects_admin_all on public.projects
  for all to authenticated using (public.is_admin_mfa()) with check (public.is_admin_mfa());

-- ---- gallery_images
drop policy if exists gallery_public_read on public.gallery_images;
drop policy if exists gallery_admin_all   on public.gallery_images;
create policy gallery_public_read on public.gallery_images
  for select to anon, authenticated using (is_published);
create policy gallery_admin_all on public.gallery_images
  for all to authenticated using (public.is_admin_mfa()) with check (public.is_admin_mfa());

-- ---- testimonials
drop policy if exists testimonials_public_read on public.testimonials;
drop policy if exists testimonials_admin_all   on public.testimonials;
create policy testimonials_public_read on public.testimonials
  for select to anon, authenticated using (is_published);
create policy testimonials_admin_all on public.testimonials
  for all to authenticated using (public.is_admin_mfa()) with check (public.is_admin_mfa());

-- ============================================================================
-- 11. STORAGE — bucket "gallery"
--     Public READ (the website shows the photos).
--     Write/update/delete: admins only.
--     The bucket enforces a size cap and an allowed Content-Type list
--     server-side. NOTE: this is a declared-Content-Type check, not deep
--     inspection of the file's bytes. We do not claim byte-level sniffing.
--     Uploads are admin-and-MFA-only, so a spoofed Content-Type is not an
--     anonymous attack path. See docs/SECURITY.md.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 8388608,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = true,
      file_size_limit    = 8388608,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists gallery_objects_public_read on storage.objects;
drop policy if exists gallery_objects_admin_write on storage.objects;
drop policy if exists gallery_objects_admin_update on storage.objects;
drop policy if exists gallery_objects_admin_delete on storage.objects;

create policy gallery_objects_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'gallery');

create policy gallery_objects_admin_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gallery' and public.is_admin_mfa());

create policy gallery_objects_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'gallery' and public.is_admin_mfa())
  with check (bucket_id = 'gallery' and public.is_admin_mfa());

create policy gallery_objects_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'gallery' and public.is_admin_mfa());

-- ============================================================================
-- 12. GRANTS
--     RLS still governs every row; these just permit the API surface.
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select on public.site_content, public.projects, public.gallery_images, public.testimonials to anon, authenticated;
grant insert, update, delete on public.site_content, public.projects, public.gallery_images, public.testimonials to authenticated;
grant select on public.app_admins, public.admin_audit_log to authenticated;

-- Nobody writes the audit log through the API.
revoke insert, update, delete on public.admin_audit_log from anon, authenticated;
-- Nobody edits the admin list through the API.
revoke insert, update, delete on public.app_admins from anon, authenticated;

-- ============================================================================
--  NEXT STEP — create your admin user. See docs/SUPABASE-SETUP.md §3.
--  Summary: Authentication > Users > Add user (Auto Confirm), copy the UUID,
--  then run:
--      insert into public.app_admins (user_id, email_note)
--      values ('PASTE-UUID-HERE', 'owner@example.com');
--  Until that row exists, NOBODY can write anything.
-- ============================================================================
