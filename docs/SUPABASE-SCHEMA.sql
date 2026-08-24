-- ============================================================
--  PELLIKAL — Supabase additions for the Website Manager
--  Safe to run more than once. Run in: SQL Editor → New query.
--  Existing tables (site_content, gallery_images, testimonials)
--  are only EXTENDED — no data is dropped.
-- ============================================================

-- PROJECTS (case studies shown on the homepage)
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null,
  location    text,
  service     text,
  description text,
  challenge   text,
  result      text,
  image_url   text,
  image_path  text,
  featured    boolean not null default true,
  sort_order  integer not null default 0
);
alter table projects enable row level security;
drop policy if exists "proj public read"  on projects;
drop policy if exists "proj staff insert" on projects;
drop policy if exists "proj staff update" on projects;
drop policy if exists "proj staff delete" on projects;
create policy "proj public read"  on projects for select using (true);
create policy "proj staff insert" on projects for insert to authenticated with check (true);
create policy "proj staff update" on projects for update to authenticated using (true) with check (true);
create policy "proj staff delete" on projects for delete to authenticated using (true);

-- Extra columns used by the Website Manager
alter table gallery_images add column if not exists alt_text   text;
alter table gallery_images add column if not exists sort_order integer not null default 0;
alter table testimonials   add column if not exists location   text;
