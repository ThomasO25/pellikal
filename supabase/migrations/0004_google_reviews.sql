-- ============================================================================
--  PELLIKAL — 0004_google_reviews.sql
--  Cached Google Business Profile review data (7 October 2026).
--
--  Run once, in full, in the Supabase SQL Editor (or `supabase db push`).
--  Idempotent: safe to re-run. NON-DESTRUCTIVE: touches nothing that already
--  exists (the CMS tables, testimonials, projects, site_content are untouched).
--
--  ARCHITECTURE
--    Google Business Profile API
--        -> Edge Function sync-google-reviews  (server side, every 12 h, holds
--           the Google OAuth secrets; writes with the service_role key)
--        -> these two tables
--        -> the website reads them with the ANON key, read-only.
--
--  SECURITY MODEL (same rules as 0001)
--    anon / authenticated -> may SELECT the DISPLAY columns of non-deleted
--                            reviews and of the summary row. Nothing else.
--                            No writes of any kind.
--    service_role         -> the sync function. Writes everything; the only
--                            caller of google_reviews_mark_missing().
--    admins               -> no special rights here: Google reviews are not
--                            edited in the CMS. They are Google's content.
--
--  NOTHING HERE STORES A SECRET. OAuth credentials live only in the Edge
--  Function's environment (supabase secrets), never in SQL, never in the site.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SUMMARY — one row (id = 1): the aggregate exactly as Google reports it.
--    average_rating / total_review_count are Google's own numbers, never
--    computed here from the subset of reviews we happen to display.
-- ---------------------------------------------------------------------------
create table if not exists public.google_review_summary (
  id                  smallint primary key default 1,
  average_rating      numeric(2,1) check (average_rating is null or (average_rating >= 1 and average_rating <= 5)),
  total_review_count  integer      check (total_review_count is null or total_review_count >= 0),
  place_id            text         check (place_id is null or char_length(place_id) <= 200),
  maps_uri            text         check (maps_uri is null or char_length(maps_uri) <= 2000),
  new_review_uri      text         check (new_review_uri is null or char_length(new_review_uri) <= 2000),
  last_synced_at      timestamptz,                      -- last SUCCESSFUL sync
  last_attempt_at     timestamptz,                      -- last attempt, success or not
  last_sync_status    text not null default 'never' check (last_sync_status in ('never','ok','error')),
  last_error          text         check (last_error is null or char_length(last_error) <= 1000),
  constraint google_review_summary_single_row check (id = 1)
);
comment on table  public.google_review_summary is 'Google Business Profile aggregate (averageRating, totalReviewCount) as returned by the Reviews API, plus sync status. One row.';
comment on column public.google_review_summary.last_synced_at is 'When Google data was last written successfully. The site keeps showing this data if later syncs fail.';
comment on column public.google_review_summary.last_error is 'Last failure, sanitised by the sync function (never contains tokens). Not readable by anon.';

insert into public.google_review_summary (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. REVIEWS — one row per Google review, keyed by Google's own reviewId so
--    repeated syncs UPSERT instead of duplicating.
-- ---------------------------------------------------------------------------
create table if not exists public.google_reviews (
  google_review_id   text primary key check (char_length(google_review_id) between 1 and 200),
  review_name        text check (review_name is null or char_length(review_name) <= 400),  -- accounts/…/locations/…/reviews/…
  reviewer_name      text not null default 'A Google user' check (char_length(reviewer_name) between 1 and 200),
  is_anonymous       boolean not null default false,
  star_rating        smallint not null check (star_rating between 1 and 5),
  comment            text check (comment is null or char_length(comment) <= 8000),
  create_time        timestamptz not null,
  update_time        timestamptz not null,
  reply_comment      text check (reply_comment is null or char_length(reply_comment) <= 8000),
  reply_update_time  timestamptz,
  google_review_url  text check (google_review_url is null or char_length(google_review_url) <= 2000), -- the API does not provide one today; reserved
  synced_at          timestamptz not null default now(),
  deleted_at         timestamptz                       -- set when a review is no longer returned by Google (removed by the author or by Google)
);
comment on table  public.google_reviews is 'Cache of Google Business Profile reviews. Content is Google''s and the reviewer''s: never edited, never invented. Rows missing from a complete sync are soft-deleted (deleted_at) so the site stops showing them.';
comment on column public.google_reviews.google_review_id is 'Google''s reviewId - the idempotency key for upserts.';
comment on column public.google_reviews.deleted_at is 'Soft delete. The site only ever reads rows where this is null.';

create index if not exists google_reviews_public_idx on public.google_reviews (deleted_at, create_time desc);

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.google_review_summary enable row level security;
alter table public.google_reviews        enable row level security;

drop policy if exists google_review_summary_public_read on public.google_review_summary;
create policy google_review_summary_public_read on public.google_review_summary
  for select to anon, authenticated using (true);

drop policy if exists google_reviews_public_read on public.google_reviews;
create policy google_reviews_public_read on public.google_reviews
  for select to anon, authenticated using (deleted_at is null);

-- No insert/update/delete policies: with RLS on and no policy, anon and
-- authenticated cannot write. service_role bypasses RLS and is the only writer.

-- ---------------------------------------------------------------------------
-- 4. COLUMN-LEVEL GRANTS — the site may read display columns only.
--    (last_error / sync status / resource names stay server-side.)
-- ---------------------------------------------------------------------------
revoke all on public.google_review_summary from anon, authenticated;
revoke all on public.google_reviews        from anon, authenticated;

-- The sync function (service_role) writes. Supabase grants this by default
-- through its default privileges; stated explicitly so it holds anywhere.
grant select, insert, update, delete on public.google_review_summary, public.google_reviews to service_role;

grant select (id, average_rating, total_review_count, place_id, maps_uri, new_review_uri, last_synced_at)
  on public.google_review_summary to anon, authenticated;

grant select (google_review_id, reviewer_name, is_anonymous, star_rating, comment, create_time, update_time, reply_comment, reply_update_time)
  on public.google_reviews to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. SOFT-DELETE helper for the sync function.
--    Called ONLY after a COMPLETE listing (every page fetched), so a partial
--    or failed Google response can never hide reviews. Rows re-appearing in a
--    later sync are revived by the upsert (deleted_at set back to null).
-- ---------------------------------------------------------------------------
create or replace function public.google_reviews_mark_missing(p_seen text[], p_synced_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  n integer;
begin
  update public.google_reviews
     set deleted_at = p_synced_at
   where deleted_at is null
     and not (google_review_id = any (coalesce(p_seen, array[]::text[])));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.google_reviews_mark_missing(text[], timestamptz) from public, anon, authenticated;
grant execute on function public.google_reviews_mark_missing(text[], timestamptz) to service_role;
comment on function public.google_reviews_mark_missing(text[], timestamptz) is 'Soft-deletes reviews not present in p_seen. service_role only. Call only after a complete listing.';

-- ---------------------------------------------------------------------------
-- 6. SANITY — what the website can and cannot do, in one query each
--    (run by hand if you want to confirm):
--      set role anon;  select average_rating, total_review_count from public.google_review_summary;     -- works
--      set role anon;  select last_error from public.google_review_summary;                            -- permission denied
--      set role anon;  insert into public.google_reviews (google_review_id, star_rating, create_time, update_time) values ('x',5,now(),now()); -- denied
--      reset role;
-- ---------------------------------------------------------------------------
