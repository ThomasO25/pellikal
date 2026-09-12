-- ============================================================================
--  PELLIKAL CMS — 0002_seed_current_content.sql
--
--  RUN THIS IMMEDIATELY AFTER 0001. It is not optional.
--
--  WHY IT MATTERS
--  The public homepage ships six static project cards as a fallback. The
--  frontend replaces that whole block the moment the projects table returns
--  ANY row. So if the owner added one project to an empty database, the
--  homepage would drop from six projects to one.
--
--  This seed loads the six projects that are on the site today, plus the
--  editable text currently in the HTML, so that:
--    * the site looks identical on day one
--    * the admin opens with the real copy in the fields instead of blanks
--    * adding project seven adds to six, it does not replace them
--
--  IDEMPOTENT: ids are fixed UUIDs and conflicts DO NOTHING, so re-running
--  will never duplicate rows and will never overwrite a later owner edit.
--
--  Images point at the existing repo assets on www.pellikal.com.
--  image_path is NULL because these are NOT Supabase Storage objects — that
--  is what stops the CMS from ever trying to delete them from Storage.
--
--  ⚠️  OWNER CONFIRMATION NEEDED — ALT TEXT OWNERSHIP CLAIMS
--
--  THREE of the six seeded rows carry alt text that asserts the photo is
--  Pellikal's own work:
--
--    french-doors-winter.jpg      "... in a Pellikal client's home ..."
--    marble-estate.jpg            "... treated by Pellikal"
--    modern-glass-residence.jpg   "... treated by Pellikal"
--
--  These are copied verbatim from what the homepage publishes today, so
--  seeding them changes nothing that is not already live. They are correct
--  ONLY if all three really are Pellikal installations.
--
--  If any of them came from stock or manufacturer material, edit the alt_text in
--  this file BEFORE running it (or fix it afterwards in the CMS) to something
--  neutral, e.g. "Filmed French doors looking onto a snow-covered terrace".
--  Never label third-party imagery as our own job.
--
--  The other three use neutral descriptions and need no confirmation.
-- ============================================================================


insert into public.projects
  (id, title, location, service, description, challenge, result,
   image_url, image_path, alt_text, featured, is_published, sort_order)
values
  ('ae63c697-ce36-523f-93d0-6b55406c7b1c'::uuid, 'Private Residence — East End', 'East End', 'Solar-control window film',
   null,
   'Large expanses of glass facing an open, exposed elevation.',
   'Film selected to reduce solar heat and glare while keeping the contemporary glazing looking clean and uninterrupted.',
   'https://www.pellikal.com/assets/images/projects/coastal-modern-glass.jpg',
   null,
   'Cedar-shingled coastal home with large filmed picture windows reflecting surrounding trees',
   true, true, 0),
  ('465e6ba0-7f78-5401-9d28-6a383db3d543'::uuid, 'Private Residence — Waterfront', 'Waterfront', 'Solar-control window film',
   null,
   'Bright reflected light off the water through full-height French doors.',
   'A low-appearance film to cut glare across the room while maintaining the water view year-round.',
   'https://www.pellikal.com/assets/images/projects/french-doors-winter.jpg',
   null,
   'Filmed French doors in a Pellikal client''s home looking out over a snow-covered waterfront terrace',
   true, true, 1),
  ('ba9896b8-4b21-5a94-bc66-3a8e16cba836'::uuid, 'Private Residence — Long Island', 'Long Island', 'Solar-control window film',
   null,
   'Tall gable glazing with no shading, warming the room through the afternoon.',
   'Film applied across the upper and lower glazing to help manage heat and UV exposure.',
   'https://www.pellikal.com/assets/images/projects/cedar-gable-glass.jpg',
   null,
   'Cedar-shingle home with large filmed gable windows above a deck',
   true, true, 2),
  ('d788be76-9447-52a6-8d5f-f5a89cb072a0'::uuid, 'Private Estate — North Shore', 'North Shore', 'Residential window film',
   null,
   'A large formal property with extensive arched glazing and furnished interiors.',
   'Film specified to reduce UV exposure reaching finishes and furnishings inside.',
   'https://www.pellikal.com/assets/images/projects/marble-estate.jpg',
   null,
   'Marble-clad estate with tall arched windows treated by Pellikal',
   true, true, 3),
  ('5305f5f8-43de-520c-8dda-c6f28d8e664b'::uuid, 'Private Residence — East End', 'East End', 'Solar-control window film',
   null,
   'A glazed garden room that became uncomfortable in peak sun.',
   'Film selected to make the space usable through the summer without darkening the room.',
   'https://www.pellikal.com/assets/images/projects/white-estate-sunroom.jpg',
   null,
   'White estate home with a glazed sunroom addition seen across the lawn',
   true, true, 4),
  ('d01f5d94-c565-5a68-a566-e440cc5e78e7'::uuid, 'Private Residence — Long Island', 'Long Island', 'Residential window film',
   null,
   'A contemporary build where the glazing is a defining architectural feature.',
   'A high-clarity film chosen so the appearance of the glass stayed true to the design intent.',
   'https://www.pellikal.com/assets/images/projects/modern-glass-residence.jpg',
   null,
   'Contemporary residence with full-height black-framed glazing treated by Pellikal',
   true, true, 5)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
--  Editable site copy — exactly what the pages show today.
-- ---------------------------------------------------------------------------
insert into public.site_content (key, value, is_published)
values
  ('hero_headline', 'Protect What You''ve Built.', true),
  ('hero_subtitle', 'Premium LLumar® window film for East End, Hamptons and Long Island homes. Help protect the artwork, flooring and furnishings you''ve invested in — reducing UV exposure, solar heat and glare while keeping your natural light and your views.', true),
  ('selectpro_text', 'Pellikal is part of the LLumar SelectPro dealer network — a group focused on providing a high-quality film-selection and professional installation experience. In practice that means film chosen to suit your glass, your exposure and how you actually use the room, installed to a standard that belongs in a finished home.', true),
  ('cta_headline', 'Let''s protect your home.', true),
  ('cta_text', 'Tell us about your property and what you''re protecting. We''ll follow up personally — no pressure, no obligation.', true),
  ('about_title', 'How we approach the work', true),
  ('about_intro', 'Most of our work happens in homes that are already finished and lived in. That shapes everything about how we operate: what we recommend, how we protect the space while we''re in it, and what we tell you when film isn''t the right answer.', true)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------------
--  NO TESTIMONIALS ARE SEEDED.
--  The site shows an honest empty state until real, attributable customer
--  reviews are added through the CMS. Never seed invented reviews.
-- ---------------------------------------------------------------------------

-- Verify:
--   select sort_order, title, service from public.projects order by sort_order;
--   select key, left(value, 60) from public.site_content order by key;
