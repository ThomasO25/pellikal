/* =============================================================
   PELLIKAL — CONFIGURATION
   Edit this one file to connect the site. Nothing else needed.
   -------------------------------------------------------------
   FORMSPREE: create a form at formspree.io and paste its ID
     (the part after /f/ in your endpoint) as FORMSPREE_ID.
   SUPABASE: create a free project at supabase.com, then paste the
     Project URL and the anon public key. The anon key is meant to
     be public — security is enforced by row-level policies on the
     server (see README.md). Leave blank to run in demo mode.
   ============================================================= */
window.PELLIKAL_CONFIG = {
  FORMSPREE_ID: "FORMSPREE_ID",          // e.g. "abcdwxyz"
  SUPABASE_URL: "",                       // e.g. "https://xxxx.supabase.co"
  SUPABASE_ANON_KEY: "",                  // anon public key
  SUPABASE_BUCKET: "gallery",
  GALLERY_TABLE: "gallery_images",
  CONTENT_TABLE: "site_content",
  TESTIMONIALS_TABLE: "testimonials"
};
