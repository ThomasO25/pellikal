-- ============================================================================
--  ⛔ RETIRED — DO NOT RUN THIS FILE.
--
--  This file previously contained an earlier schema whose write policies
--  granted CMS access to ANY authenticated user. That is unsafe: anyone who
--  could create an account could edit the website.
--
--  The single authoritative schema is now:
--
--      supabase/migrations/0001_pellikal_cms.sql
--
--  Setup instructions:  docs/SUPABASE-SETUP.md
--  Security model:      docs/SECURITY.md
--
--  This stub is kept only so that an old bookmark or copy-paste cannot
--  silently re-apply the unsafe policies.
-- ============================================================================
DO $$ BEGIN
  RAISE EXCEPTION 'RETIRED FILE. Run supabase/migrations/0001_pellikal_cms.sql instead. See docs/SUPABASE-SETUP.md';
END $$;
