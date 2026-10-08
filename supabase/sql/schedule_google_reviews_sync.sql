-- ============================================================================
--  PELLIKAL — schedule_google_reviews_sync.sql
--  Runs the sync-google-reviews Edge Function EVERY 12 HOURS from inside the
--  database (pg_cron + pg_net), so reviews refresh with nobody touching the
--  website. Run this ONCE in the Supabase SQL Editor, by hand, after the
--  function is deployed and its secrets are set (docs/GOOGLE-REVIEWS.md,
--  "GOOGLE BUSINESS PROFILE SETUP REQUIRED", step 11).
--
--  This file is NOT a migration on purpose: it needs the shared secret, and
--  the secret must never be committed. It is stored in Supabase Vault and
--  read from there at run time, so the only thing in the cron job is the
--  Vault lookup - never the secret itself.
--
--  ONE placeholder to replace before running:  <SYNC_SECRET>  (line marked
--  "REPLACE" below) - the same value you gave the function with
--  `supabase secrets set SYNC_SECRET=...`. If you forget, the guard at the
--  top of the block stops everything with a clear error; nothing is changed.
-- ============================================================================

-- 1. Extensions (also togglable in Dashboard -> Database -> Extensions). Harmless if already on.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Guard, Vault secret and schedule - ONE transaction. If the placeholder
--    was not replaced, the exception rolls everything back.
do $$
declare
  secret   text := '<SYNC_SECRET>';   -- <<< REPLACE the whole value between the quotes (keep the quotes)
  existing uuid;
begin
  if secret is null or secret like '<%>' or secret like '%SYNC_SECRET%' or length(secret) < 16 then
    raise exception using
      message = 'schedule_google_reviews_sync.sql: the <SYNC_SECRET> placeholder has not been replaced (or the value is shorter than 16 characters). '
             || 'Edit the line marked REPLACE and paste the real SYNC_SECRET - the same value set on the Edge Function - then run this file again. Nothing was changed.',
      errcode = 'P0001';
  end if;

  -- the shared secret, kept in Vault (re-running replaces it)
  select id into existing from vault.secrets where name = 'sync_google_reviews_secret';
  if existing is null then
    perform vault.create_secret(secret, 'sync_google_reviews_secret', 'x-sync-secret header for the sync-google-reviews Edge Function');
  else
    perform vault.update_secret(existing, secret, 'sync_google_reviews_secret', 'x-sync-secret header for the sync-google-reviews Edge Function');
  end if;

  -- the schedule: 03:17 and 15:17 UTC every day (= every 12 hours). Minute 17
  -- rather than :00 so it does not queue behind everyone's on-the-hour jobs.
  -- Re-running replaces the job.
  if exists (select 1 from cron.job where jobname = 'sync-google-reviews') then
    perform cron.unschedule('sync-google-reviews');
  end if;

  perform cron.schedule(
    'sync-google-reviews',
    '17 3,15 * * *',
    $job$
    select net.http_post(
      url     := 'https://btmkronkwvtcvqcwefsi.supabase.co/functions/v1/sync-google-reviews',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_google_reviews_secret' limit 1)
                 ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );
end $$;

-- 3. Check it is there, and later, check it ran:
--      select jobid, jobname, schedule, active from cron.job where jobname = 'sync-google-reviews';
--      select start_time, status, return_message from cron.job_run_details
--        where jobid = (select jobid from cron.job where jobname = 'sync-google-reviews')
--        order by start_time desc limit 10;
--    and the outcome of the HTTP call itself (status 200 = synced, 502 = Google/Supabase error, 403 = wrong secret):
--      select created, status_code, left(content, 300) from net._http_response order by created desc limit 5;
--    and the data:
--      select average_rating, total_review_count, last_sync_status, last_synced_at, last_attempt_at from public.google_review_summary;
