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

  /* ---- Google Tag Manager ----
     The container ID is NOT set here. The official GTM snippet is
     installed directly in the <head> of every public page, generated
     by tools/build.py from "analytics" in site.config.json.
     To change the container ID, edit site.config.json and re-run:
         python3 tools/build.py
     GA4 (G-J8SQ4CC7BT) is configured INSIDE the GTM container —
     never add a gtag.js snippet here or page views double-count. */

  /* Consent Mode default. false = analytics/ads storage allowed on
     load (typical for a US-only local business). Set to true only if
     a consent banner is added. See tracking.js. */
  CONSENT_DEFAULT_DENIED: false,

  /* ---- Window Inserts: manufacturer-supplied imagery ----
     Six images on /window-inserts/ are manufacturer / product marketing
     material rather than Pellikal photography, and two carry a visible
     manufacturer logo. They stay HIDDEN until Pellikal has documented
     permission to republish them.

       false -> those images are not rendered at all, and any section left
                empty collapses cleanly
       true  -> they are shown

     APPROVED 10 Sep 2026 by the business owner, on the basis that Pellikal is
     an authorised dealer for the product and uses the manufacturer's assets on
     the same footing as its LLumar material. See
     docs/WINDOW-INSERTS-ASSETS.md. The five owner-supplied photographs are
     never affected by this flag. */
  WINDOW_INSERT_ASSETS_APPROVED: true,

  /* ---- Formspree (contact form) ---- */
  FORMSPREE_ID: "maewnodj",              // e.g. "xdorwabc"  OR  "https://formspree.io/f/xdorwabc"

  // ---- Supabase (anon public key ONLY) ----
  SUPABASE_URL: "https://btmkronkwvtcvqcwefsi.supabase.co",                          // e.g. "https://YOURPROJECT.supabase.co"
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0bWtyb25rd3Z0Y3ZxY3dlZnNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNTk5MTcsImV4cCI6MjEwMTYzNTkxN30.nRCUTpU2xpV-WWFlAbYc4wVc-rtuC-OZ17BgjpOAPP0",                     // the anon public key (NOT the service_role key)

  // ---- Names you created in Supabase (only change if you renamed them) ----
  SUPABASE_BUCKET: "gallery",                // Storage bucket (Public)
  GALLERY_TABLE: "gallery_images",
  CONTENT_TABLE: "site_content",
  TESTIMONIALS_TABLE: "testimonials",
  PROJECTS_TABLE: "projects"
};

/* Applied here rather than in main.js so approved assets are revealed as early
   as possible. The default is hidden, so unapproved material can never flash
   on screen — and it stays hidden even with JavaScript disabled, because the
   CSS hides it unless this class is present. */
try {
  if (window.PELLIKAL_CONFIG.WINDOW_INSERT_ASSETS_APPROVED === true) {
    document.documentElement.classList.add("mfr-assets-approved");
  }
} catch (e) {}

