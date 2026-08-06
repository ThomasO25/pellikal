/* =============================================================
   PELLIKAL — CONFIGURATION  (edit this one file to go live)
   -------------------------------------------------------------
   ⚠️  SECURITY: Only ever use the Supabase **anon public** key here.
       NEVER paste a service_role / secret key into any file that
       ships to the browser — it would give the public full write
       access to your database. The anon key is safe to expose;
       security is enforced by row-level policies on Supabase's
       servers (see README.md → Supabase setup).

   FORMSPREE (contact form):
     Put your form ID (the part after /f/ in your endpoint) OR the
     full endpoint URL in FORMSPREE_ID. Leave it as "FORMSPREE_ID"
     and the form will NOT send — it will tell visitors to call/
     text/email instead (it never fakes success).

   SUPABASE (admin / gallery / testimonials / editable text):
     Paste your Project URL and anon public key. Leave blank and the
     site runs in demo mode: public pages show default text and
     placeholder tiles, and the admin shows a setup checklist.
   ============================================================= */
window.PELLIKAL_CONFIG = {
  // ---- Formspree ----
  FORMSPREE_ID: "maewnod",              // e.g. "xdorwabc"  OR  "https://formspree.io/f/xdorwabc"

  // ---- Supabase (anon public key ONLY) ----
  SUPABASE_URL: "",                          // e.g. "https://YOURPROJECT.supabase.co"
  SUPABASE_ANON_KEY: "",                     // the anon public key (NOT the service_role key)

  // ---- Names you created in Supabase (only change if you renamed them) ----
  SUPABASE_BUCKET: "gallery",                // Storage bucket (Public)
  GALLERY_TABLE: "gallery_images",
  CONTENT_TABLE: "site_content",
  TESTIMONIALS_TABLE: "testimonials"
};
