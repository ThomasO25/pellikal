-- 0003_homepage_hero_repositioning.sql
-- 22 Sep 2026 — homepage first-impression repositioning (Long Island & NYC,
-- residential + commercial) instead of Hamptons / East End / LLumar-first.
--
-- WHY THIS EXISTS
-- The homepage H1 and subtitle carry data-content="hero_headline" /
-- "hero_subtitle". js/main.js replaces their text at runtime with whatever
-- site_content holds for those keys. 0002 seeded the OLD copy, so without
-- this migration the live database would silently put the Hamptons headline
-- back on the page for every JavaScript-enabled visitor (and for Google's
-- renderer), no matter what the HTML says.
--
-- GUARDED: only rows that still hold the 0002 seed text are updated. A
-- headline the owner has since edited in /admin/ is left exactly as it is —
-- that is the owner's choice, and the admin editor remains the way to
-- change it again later. Safe to run more than once.

update public.site_content
   set value = 'Professional Window Film for Long Island & NYC'
 where key = 'hero_headline'
   and value = 'Protect What You''ve Built.';

update public.site_content
   set value = 'Residential and commercial window film, professionally installed to help reduce heat, glare and UV while improving comfort and privacy. Free, no-pressure quotes across Long Island and New York City.'
 where key = 'hero_subtitle'
   and value like 'Premium LLumar® window film for East End, Hamptons and Long Island homes.%';
