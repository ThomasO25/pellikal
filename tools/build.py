#!/usr/bin/env python3
"""
===============================================================
 PELLIKAL — build.py
===============================================================

WHAT THIS DOES
  Copies the shared header and footer from  partials/  into every
  page, filling in the business details from  site.config.json.
  It also regenerates the old-URL redirect files and sitemap.xml.

WHEN TO RUN IT
  After you edit ANY of these:
    • site.config.json   (phone, email, menu, service area…)
    • partials/header.html
    • partials/footer.html
  Run:   python3 tools/build.py

WHEN YOU DON'T NEED IT
  Editing the actual content of a page — the words inside <main> —
  needs no build at all. Just edit the HTML and save.

IMPORTANT
  This is NOT a framework. Every page stays complete, standalone
  HTML that works on its own. The build only keeps the repeated
  parts in sync so you never have to edit ten files by hand.

HOW IT KNOWS WHAT TO REPLACE
  Each page contains marker comments:

      <!-- @partial:header -->  ...generated...  <!-- @end -->
      <!-- @partial:footer -->  ...generated...  <!-- @end -->

  Anything between the markers is replaced. Anything outside them
  (all your real page content) is never touched.
===============================================================
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_config():
    with open(os.path.join(ROOT, "site.config.json"), encoding="utf-8") as f:
        return json.load(f)


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


def write(path, text):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(text)


def strip_comment(text):
    """Remove the leading explanatory comment from a partial file."""
    return re.sub(r"^\s*<!--.*?-->\s*", "", text, count=1, flags=re.S)


def depth_of(page_file):
    """index.html -> 0 ;  about/index.html -> 1"""
    return page_file.count("/")


def url_for(slug, depth):
    """Relative link from a page at `depth` to `slug`.

    Relative (not root-absolute) so the site works BOTH at
    https://www.pellikal.com/  AND at a GitHub Pages project path
    like https://user.github.io/pellikal/.
    """
    prefix = "../" * depth
    if slug == "":
        return prefix if prefix else "./"
    return prefix + slug + "/"


def render(template, cfg, depth, active_slug):
    b = cfg["business"]

    nav = "".join(
        '<li><a href="{href}"{cur}>{label}</a></li>'.format(
            href=url_for(item["slug"], depth),
            cur=' aria-current="page"' if item["slug"] == active_slug else "",
            label=item["label"],
        )
        for item in cfg["nav"]
    )
    nav += (
        '<li class="nav__cta"><a class="btn btn--cyan btn--block" href="{{QUOTE_HREF}}" data-quote-cta="menu">'
        "Get a Free Quote</a></li>"
    )

    def links(key):
        return "".join(
            '<li><a href="{}">{}</a></li>'.format(url_for(i["slug"], depth), i["label"])
            for i in cfg[key]
        )

    out = template
    out = out.replace("{{NAV_ITEMS}}", nav)
    out = out.replace("{{FOOTER_SERVICES}}", links("footerServices"))
    out = out.replace("{{FOOTER_COMPANY}}", links("footerCompany"))
    out = out.replace("{{HOME}}", url_for("", depth))
    out = out.replace("{{PHONE_DISPLAY}}", b["phoneDisplay"])
    out = out.replace("{{PHONE_LINK}}", b["phoneLink"])
    out = out.replace("{{EMAIL}}", b["email"])
    out = out.replace("{{SERVICE_AREA}}", b["serviceArea"])
    # {{URL:slug}} -> correct relative link
    out = re.sub(
        r"\{\{URL:([a-z0-9\-]*)\}\}",
        lambda m: url_for(m.group(1), depth),
        out,
    )
    return out


def apply_partial(html, name, rendered):
    """Replace the region between the markers, or report it's missing."""
    start = "<!-- @partial:{} -->".format(name)
    end = "<!-- @end -->"
    pattern = re.compile(
        re.escape(start) + r".*?" + re.escape(end), re.S
    )
    if not pattern.search(html):
        return html, False
    return pattern.sub(lambda _: start + "\n" + rendered.strip() + "\n" + end, html), True


def build_redirect(slug, cfg, target=None):
    """The old .html URL forwards to the new folder URL.

    WHY THESE FILES EXIST:
    The site used to live at /about.html. It now lives at /about/.
    Google and other sites still hold links to the old address, so
    /about.html stays behind as a tiny forwarder. Deleting it would
    turn those links into 404s and lose the search ranking they carry.
    """
    dest = target or slug
    return (
        "<!DOCTYPE html>\n"
        "<html lang=\"en\">\n"
        "<head>\n"
        "<meta charset=\"utf-8\">\n"
        "<!-- REDIRECT ONLY — this is not a real page.\n"
        "     It forwards the old /{slug}.html address to /{dest}/.\n"
        "     Generated by tools/build.py — do not edit by hand. -->\n"
        "<title>Redirecting\u2026</title>\n"
        "<meta name=\"robots\" content=\"noindex\">\n"
        "<link rel=\"canonical\" href=\"{base}{dest}/\">\n"
        "<meta http-equiv=\"refresh\" content=\"0; url={dest}/\">\n"
        "</head>\n"
        "<body>\n"
        "<p>This page has moved to <a href=\"{dest}/\">/{dest}/</a>. Redirecting\u2026</p>\n"
        "</body>\n"
        "</html>\n"
    ).format(slug=slug, dest=dest, base=cfg["business"]["domain"])


def build_sitemap(cfg):
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<!-- Generated by tools/build.py from site.config.json — do not edit by hand. -->",
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    base = cfg["business"]["domain"]
    for page in cfg["pages"]:
        if not page.get("inSitemap"):
            continue
        lines.append(
            "  <url><loc>{}{}</loc><changefreq>monthly</changefreq>"
            "<priority>{}</priority></url>".format(
                base, page["slug"] + "/" if page["slug"] else "", page["priority"]
            )
        )
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def sync_contact_details(html, cfg):
    """Make site.config.json the ONE place the phone/email live.

    Page content (hero buttons, the contact page call box, JSON-LD,
    meta descriptions) also contains the phone number. This rewrites
    every one of them to match the config, so changing the number is
    a one-line edit instead of hunting through eleven files.
    """
    b = cfg["business"]
    # clickable links
    html = re.sub(r'href="tel:\+?[0-9\-\s().]+"', 'href="tel:{}"'.format(b["phoneLink"]), html)
    html = re.sub(r'href="sms:\+?[0-9\-\s().]+"', 'href="sms:{}"'.format(b["phoneLink"]), html)
    html = re.sub(r'href="mailto:[^"]+"', 'href="mailto:{}"'.format(b["email"]), html)
    # structured data
    html = re.sub(r'"telephone":"[^"]*"', '"telephone":"{}"'.format(b["phoneSchema"]), html)
    html = re.sub(r'"email":"[^"]*"', '"email":"{}"'.format(b["email"]), html)
    # any visible 000-000-0000 style number, and the email in text
    html = re.sub(r"\b\d{3}-\d{3}-\d{4}\b", b["phoneDisplay"], html)
    html = re.sub(r"\b[A-Za-z0-9._%+-]+@pellikal\.com\b", b["email"], html)
    return html


SAFE_TOKEN = re.compile(r"^[A-Za-z0-9_-]+$")


def consent_settings(cfg):
    """Read + validate analytics.consent from site.config.json."""
    c = dict(cfg["analytics"].get("consent") or {})
    c.setdefault("cookieName", "pellikal_consent")
    c.setdefault("version", "v1")
    c.setdefault("rememberDays", 180)
    c.setdefault("adsDataRedaction", True)
    for key in ("cookieName", "version"):
        if not SAFE_TOKEN.match(str(c[key])):
            raise SystemExit(
                "site.config.json: analytics.consent.{} must contain only "
                "letters, digits, _ or - (got {!r})".format(key, c[key])
            )
    try:
        c["rememberDays"] = int(c["rememberDays"])
    except (TypeError, ValueError):
        raise SystemExit("site.config.json: analytics.consent.rememberDays must be a number")
    if not 1 <= c["rememberDays"] <= 400:
        raise SystemExit("site.config.json: analytics.consent.rememberDays must be 1-400")
    return c


def consent_head(cfg):
    """Google Consent Mode v2 defaults.

    THIS MUST BE EMITTED ABOVE THE GTM SNIPPET. It is generated into the
    same @partial:gtm-head region as the container itself precisely so the
    two can never drift apart or be reordered by hand — a rebuild always
    restores both, in this order.

    All four optional categories default to DENIED. A previously stored
    choice is re-applied here, synchronously, before gtm.js is requested,
    so a returning visitor who accepted is not measured as denied for the
    first hit of every page. That is also why there is no `wait_for_update`:
    nothing about this is asynchronous, so there is nothing to wait for.

    No personal data is read, written or pushed. The stored value is a
    version tag, a choice, and a date.
    """
    c = consent_settings(cfg)
    settings = json.dumps(
        {
            "name": c["cookieName"],
            "version": c["version"],
            "days": c["rememberDays"],
            "redact": bool(c["adsDataRedaction"]),
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    return (
        "<!-- Referrer policy: send only the origin cross-site. GitHub Pages cannot\n"
        "     set response headers, so this is done in the document. -->\n"
        '<meta name="referrer" content="strict-origin-when-cross-origin">\n'
        "<!-- Google Consent Mode v2 defaults - GENERATED by tools/build.py.\n"
        "     Do not edit here and do not move it below the GTM snippet:\n"
        "     defaults only count if they are set BEFORE gtm.js loads.\n"
        "     Settings live in site.config.json -> analytics.consent.\n"
        "     Full explanation: docs/CONSENT-MODE.md -->\n"
        "<script>\n"
        "(function(w,d){\n"
        "var S=" + settings + ";w.PELLIKAL_CONSENT_SETTINGS=S;\n"
        "w.dataLayer=w.dataLayer||[];\n"
        "function gtag(){w.dataLayer.push(arguments);}\n"
        "w.gtag=w.gtag||gtag;\n"
        "gtag('consent','default',{\n"
        "'ad_storage':'denied',\n"
        "'analytics_storage':'denied',\n"
        "'ad_user_data':'denied',\n"
        "'ad_personalization':'denied',\n"
        "'functionality_storage':'granted',\n"
        "'security_storage':'granted'\n"
        "});\n"
        "if(S.redact){gtag('set','ads_data_redaction',true);}\n"
        "var v='';\n"
        "try{var ck=('; '+d.cookie).split('; '+S.name+'=');\n"
        "if(ck.length>1){v=decodeURIComponent(ck.pop().split(';').shift());}\n"
        "else if(w.localStorage){v=w.localStorage.getItem(S.name)||'';}}catch(e){}\n"
        "w.PELLIKAL_CONSENT_STORED=v;\n"
        "/* stored format: VERSION:a0|a1:d0|d1:DATE  (analytics, advertising) */\n"
        "if(v.indexOf(S.version+':')===0){\n"
        "var a=v.indexOf(':a1')>-1,ad=v.indexOf(':d1')>-1;\n"
        "if(a||ad){gtag('consent','update',{\n"
        "'analytics_storage':a?'granted':'denied',\n"
        "'ad_storage':ad?'granted':'denied',\n"
        "'ad_user_data':ad?'granted':'denied',\n"
        "'ad_personalization':ad?'granted':'denied'\n"
        "});}\n"
        "if(S.redact&&ad){gtag('set','ads_data_redaction',false);}\n"
        "}\n"
        "})(window,document);\n"
        "</script>\n"
        "<!-- End Google Consent Mode v2 defaults -->"
    )


def gtm_head(cfg):
    """Consent Mode v2 defaults, then Google's official GTM container snippet.

    This is the ONLY Google container on the site. GA4 and Google Ads
    conversions are configured inside the container, not here — adding
    a second gtag.js snippet to the pages would double-count page views.

    The consent block is deliberately part of THIS function's output: the
    defaults are worthless unless they run first, and keeping them in one
    generated region is what guarantees it.
    """
    gid = cfg["analytics"]["gtmContainerId"]
    return (
        consent_head(cfg) + "\n"
        "<!-- Google Tag Manager -->\n"
        "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n"
        "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n"
        "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n"
        "'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n"
        "})(window,document,'script','dataLayer','" + gid + "');</script>\n"
        "<!-- End Google Tag Manager -->"
    )


def formspree_action():
    """The form's no-JavaScript action=, read from js/config.js.

    js/config.js is the documented home of FORMSPREE_ID (README, and
    DEPLOYMENT-CHECKLIST §5 checks it there). Reading it here means the
    three copies of the form cannot drift from it — change the ID in one
    place, rebuild, and every page follows.

    Returns "" when the ID is still the placeholder, which is what
    js/main.js already treats as "not configured": the form then tells
    visitors to call instead of silently failing.
    """
    try:
        src = read("js/config.js")
    except OSError:
        return ""
    m = re.search(r'FORMSPREE_ID\s*:\s*"([^"]*)"', src)
    if not m:
        return ""
    raw = m.group(1).strip()
    if not raw or raw == "FORMSPREE_ID":
        return ""
    return raw if "formspree.io" in raw else "https://formspree.io/f/" + raw


def options_html(values, selected):
    """A <select>'s options, with `selected` on the variant's default.

    When the variant has no default the usual disabled placeholder is
    shown, so a visitor still has to make a deliberate choice.
    """
    out = []
    if not selected:
        out.append('<option value="" selected disabled>Choose one&hellip;</option>')
    else:
        out.append('<option value="" disabled>Choose one&hellip;</option>')
    for v in values:
        esc = v.replace("&", "&amp;")
        out.append(
            "<option{}>{}</option>".format(" selected" if v == selected else "", esc)
        )
    return "".join(out)


def quote_form(cfg, variant, depth):
    """Render partials/quote-form.html for one page."""
    forms = cfg.get("forms") or {}
    variants = forms.get("variants") or {}
    if variant not in variants:
        raise SystemExit(
            "unknown quote-form variant {!r} — add it to site.config.json "
            "-> forms.variants".format(variant)
        )
    v = variants[variant]
    short = v.get("layout", "full") == "short"
    tpl = strip_comment(read("partials/quote-form-short.html" if short else "partials/quote-form.html"))
    out = tpl
    out = out.replace("{{SERVICE_OPTIONS}}", options_html(forms.get("serviceOptions", []), v.get("service", "")))
    out = out.replace("{{PROPERTY_OPTIONS}}", options_html(forms.get("propertyOptions", []), v.get("propertyType", "")))
    # short layout: what the page already knows travels as hidden fields
    out = out.replace("{{PROPERTY_TYPE}}", v.get("propertyType", "").replace("&", "&amp;").replace('"', "&quot;"))
    out = out.replace("{{SERVICE}}", v.get("service", "").replace("&", "&amp;").replace('"', "&quot;"))
    out = out.replace("{{FORM_VARIANT}}", v.get("formVariant", variant + "_" + ("short" if short else "full")))
    out = out.replace("{{FORM_LOCATION}}", v.get("formLocation", variant))
    out = out.replace("{{SUBMIT_LABEL}}", v.get("submitLabel", "Send"))
    out = out.replace("{{SUCCESS_URL}}", url_for(forms.get("successPath", "thankyou"), depth))
    out = out.replace("{{FORMSPREE_ACTION}}", formspree_action())
    # No-JavaScript fallback: Formspree redirects here after a plain POST.
    # (Ignored for the fetch() path, which navigates itself.)
    out = out.replace("{{SITE_THANKYOU}}", cfg["business"]["domain"].rstrip("/") + "/" + forms.get("successPath", "thankyou").strip("/") + "/")
    # {{PHONE_DISPLAY}} and {{URL:privacy}} are handled by render()
    out = render(out, cfg, depth, None)

    # REGRESSION GUARD. strip_comment() matches up to the FIRST comment
    # closer, so a stray one inside the partial's heading comment leaks the
    # rest of that text into the page as live markup. When the leaked text
    # contains an "@end" marker it also truncates this region, orphaning
    # the previous form and appending a new one on every build — the page
    # grows a form per run. Cheap to check, miserable to debug.
    if "@end" in out or "@partial" in out:
        raise SystemExit(
            "partials/quote-form.html leaked a partial marker into its output "
            "— check for a stray comment delimiter in its heading comment"
        )
    if "{{" in out:
        leftover = re.findall(r"\{\{[^}]*\}\}", out)
        raise SystemExit(
            "partials/quote-form.html has unfilled placeholders: {}".format(
                ", ".join(sorted(set(leftover)))
            )
        )
    return out


def insert_claims(cfg):
    """The three cards in the /window-inserts/ "Quieter rooms" section.

    Two variants, chosen by site.config.json -> windowInserts.manufacturerClaims:

    enabled = false  -> qualitative cards. True of any sealed insert; names no
                        manufacturer; carries no figures.
    enabled = true   -> the manufacturer's PUBLISHED figures, attributed to the
                        manufacturer in every sentence ("Indow reports…",
                        "designed to…"), never phrased as a Pellikal promise.
                        Noise stays the headline; energy is second.

    Flip to true only after the owner has confirmed, in writing, that the
    product sold is the named manufacturer's named grade. The figures are
    theirs and only apply to their product.
    """
    mc = (cfg.get("windowInserts") or {}).get("manufacturerClaims") or {}
    if not mc.get("enabled"):
        return (
            '<div class="card" data-reveal><h3>Quieter</h3><p>Helps reduce the traffic, sirens and street noise coming through the window &mdash; the reason most people call. In Manhattan, Brooklyn and Queens the window is often the thinnest thing between you and the street.</p></div>\n'
            '<div class="card" data-reveal><h3>More comfortable</h3><p>The same sealed layer cuts drafts and slows temperature transfer through the glass &mdash; a second benefit you feel in winter and in summer.</p></div>\n'
            '<div class="card" data-reveal><h3>Made for your window</h3><p>Custom-measured for each opening, pressed into place, removable without tools. The original window is not modified.</p></div>'
        )
    m = mc.get("manufacturer", "the manufacturer")
    g = mc.get("grade", "")
    return (
        '<div class="card" data-reveal><h3>Up to 70% noise reduction</h3><p>' + m + ' ' + g + ' inserts are designed to reduce outside noise by up to 70%. In Manhattan, Brooklyn and Queens the window is often the thinnest thing between you and the street; how much a room gains depends on its windows and the other paths sound takes in.</p></div>\n'
        '<div class="card" data-reveal><h3>Average 20% energy savings</h3><p>' + m + ' reports average energy savings of 20% with its window inserts &mdash; fewer drafts and less heat moving through the glass, a second benefit you feel in winter and in summer.</p></div>\n'
        '<div class="card" data-reveal><h3>Over 99% perfect fit rate</h3><p>' + m + ' reports a perfect-fit rate of over 99% for its custom-measured inserts, with its Snug Fit compression tubing sealing against the frame. Pellikal measures, supplies and installs; the original window is not modified.</p></div>\n'
        '<p class="microcopy" style="grid-column:1/-1;margin:.2rem 0 0">Figures published by ' + m + ' for its inserts; the noise figure applies to ' + g + '. Not a guarantee of results in your room.</p>'
    )


QUOTE_FORM_MARKER = re.compile(
    r"<!-- @partial:quote-form:([a-z_]+) -->.*?<!-- @end -->", re.S
)


def apply_quote_forms(html, cfg, depth):
    """Replace every <!-- @partial:quote-form:VARIANT --> region."""
    found = []

    def sub(m):
        variant = m.group(1)
        found.append(variant)
        return (
            "<!-- @partial:quote-form:{} -->\n".format(variant)
            + quote_form(cfg, variant, depth).strip()
            + "\n<!-- @end -->"
        )

    return QUOTE_FORM_MARKER.sub(sub, html), found


CONSENT_TAG_RE = re.compile(r'[ \t]*<script src="[^"]*js/consent\.js"></script>\n?')

# ---- Supabase browser library: only where the page actually reads the CMS ----
SUPABASE_TAG_RE = re.compile(r'[ \t]*<script src="[^"]*js/vendor/supabase-js-[^"]*\.js"></script>\n?')
SUPABASE_FILE = "js/vendor/supabase-js-2.116.0.js"
# The selectors js/main.js fills from Supabase. A page with none of them
# never opens a connection, so the ~218 KB library is dead weight there.
CMS_HOOK_RE = re.compile(r'data-content=|data-projects-home|id="quotes"|id="gallery"|data-hero-image')


def apply_supabase_script(html, depth, force=False):
    """Keep the vendored Supabase <script> only on pages that use the CMS.

    Derived from the markup, not a hand-kept list: add a data-content hook
    to any page and the next build gives it the library; remove the last
    hook and the next build takes it away. js/main.js treats window.supabase
    as optional, so pages without it simply keep their static content.
    """
    html = SUPABASE_TAG_RE.sub("", html)
    if not (force or CMS_HOOK_RE.search(html)):
        return html, False
    prefix = "../" * depth
    anchor = '<script src="{}js/config.js"></script>'.format(prefix)
    if anchor not in html:
        return html, False
    tag = '<script src="{}{}"></script>'.format(prefix, SUPABASE_FILE)
    return html.replace(anchor, tag + "\n" + anchor, 1), True


def apply_consent_script(html, depth, wanted):
    """Keep <script src=".../js/consent.js"> correct on every tracked page.

    The site's script tags sit OUTSIDE the partial markers (they carry a
    per-page relative path), so they can't be stamped in as a partial.
    This removes any existing tag — including one left at the wrong depth
    by a copied folder — and re-inserts it above js/tracking.js when the
    page should have it.

    Returns (html, ok). ok is False only if the page is supposed to have
    the tag but has no js/tracking.js anchor to hang it on.
    """
    html = CONSENT_TAG_RE.sub("", html)
    if not wanted:
        return html, True
    prefix = "../" * depth
    anchor = '<script src="{}js/tracking.js"></script>'.format(prefix)
    if anchor not in html:
        return html, False
    tag = '<script src="{}js/consent.js"></script>'.format(prefix)
    return html.replace(anchor, tag + "\n" + anchor, 1), True


def gtm_body(cfg):
    """The @partial:gtm-body region — intentionally EMPTY of tags.

    Google's standard install adds a <noscript> iframe here so that GTM can
    still load for visitors with JavaScript off. On this site that path is
    wrong: the consent mechanism is JavaScript-driven, so a JavaScript-off
    visitor can never be asked. The Consent Mode defaults in <head> are also
    JavaScript, so the iframe would load the container with NO consent state
    at all — Google's implicit "granted". The iframe was removed 14 Sep 2026.

    What is lost: nothing that the visitor could consent to. GTM's own
    documentation describes the noscript iframe as a fallback only.
    The region is kept so older pages stay idempotent and the removal is
    visible in every page rather than silently absent.
    """
    return (
        "<!-- Google Tag Manager (noscript) — deliberately NOT installed.\n"
        "     A JavaScript-off visitor cannot operate the consent banner or\n"
        "     receive the Consent Mode defaults, so loading the container for\n"
        "     them would mean measuring without any consent state.\n"
        "     See docs/CONSENT-MODE.md. -->"
    )


def main():
    cfg = load_config()
    header_tpl = strip_comment(read("partials/header.html"))
    footer_tpl = strip_comment(read("partials/footer.html"))
    no_track = set(cfg["analytics"].get("excludeFromTracking", []))

    updated, skipped, warnings = 0, 0, []
    forms_built = []
    supabase_pages = []

    for page in cfg["pages"]:
        path = page["file"]
        full = os.path.join(ROOT, path)
        if not os.path.exists(full):
            warnings.append("missing page: " + path)
            continue

        html = read(path)
        original = html
        depth = depth_of(path)
        slug = page["slug"]

        # Bare redirect pages have no header/footer by design.
        if page.get("partials", True):
            html, ok_h = apply_partial(html, "header", render(header_tpl, cfg, depth, slug))
            html, ok_f = apply_partial(html, "footer", render(footer_tpl, cfg, depth, slug))
        else:
            ok_h = ok_f = True

        # Marketing tags — never on the private admin page.
        tracked = path not in no_track
        if tracked:
            html, _ = apply_partial(html, "gtm-head", gtm_head(cfg))
            html, _ = apply_partial(html, "gtm-body", gtm_body(cfg))

        # Consent banner: on every tracked page, never on an untracked one
        # (nothing to consent to there).
        html, ok_c = apply_consent_script(html, depth, tracked)

        # Supabase library only where the page has CMS hooks (admin always).
        html, has_sb = apply_supabase_script(html, depth, force=(path == "admin/index.html"))
        if has_sb:
            supabase_pages.append(path)

        # Window Inserts performance cards (only that page carries the marker).
        html, _ = apply_partial(html, "insert-claims", insert_claims(cfg))

        # The shared quote form, wherever a page asks for it.
        html, form_variants = apply_quote_forms(html, cfg, depth)
        if form_variants:
            forms_built.append((path, form_variants))

        # Header / mobile-bar quote buttons jump to this page's own form when
        # it has one, otherwise go to the contact page.
        html = html.replace("{{QUOTE_HREF}}", "#quote" if 'id="quote"' in html else url_for("contact", depth))

        html = sync_contact_details(html, cfg)

        if not ok_h:
            warnings.append("{}: no <!-- @partial:header --> markers".format(path))
        if not ok_f:
            warnings.append("{}: no <!-- @partial:footer --> markers".format(path))
        if not ok_c:
            warnings.append(
                "{}: tracked page, but no js/tracking.js tag to anchor "
                "js/consent.js to — the consent banner will not load".format(path)
            )

        if html != original:
            write(path, html)
            updated += 1
            print("  updated  {}".format(path))
        else:
            skipped += 1

        if page.get("redirect") and slug:
            write(slug + ".html", build_redirect(slug, cfg, page.get("redirectTo")))

    # Files that have no header/footer but still mention the phone/email
    # (the 404 page, and the form fallback messages in js/main.js).
    for extra in cfg.get("syncOnly", []):
        if not os.path.exists(os.path.join(ROOT, extra)):
            warnings.append("missing syncOnly file: " + extra)
            continue
        original_extra = read(extra)
        text = original_extra
        # HTML files in this list still need the marketing tags
        if extra.endswith(".html"):
            extra_tracked = extra not in no_track
            if extra_tracked:
                text, _ = apply_partial(text, "gtm-head", gtm_head(cfg))
                text, _ = apply_partial(text, "gtm-body", gtm_body(cfg))
            text, ok_c = apply_consent_script(text, depth_of(extra), extra_tracked)
            text, _ = apply_supabase_script(text, depth_of(extra))
            text = text.replace("{{QUOTE_HREF}}", url_for("contact", depth_of(extra)))
            if not ok_c:
                warnings.append(
                    "{}: tracked page, but no js/tracking.js tag to anchor "
                    "js/consent.js to".format(extra)
                )
        synced = sync_contact_details(text, cfg)
        if synced != original_extra:
            write(extra, synced)
            updated += 1
            print("  updated  {}".format(extra))

    write("sitemap.xml", build_sitemap(cfg))

    print("\nPages updated: {}   already current: {}".format(updated, skipped))
    print("Redirect files and sitemap.xml regenerated.")
    # Supply-chain guard: Supabase JS is vendored (js/vendor/). A page still
    # pointing at the CDN would float on whatever @2 resolves to that day.
    for page in cfg["pages"]:
        pf = os.path.join(ROOT, page["file"])
        if os.path.exists(pf) and "cdn.jsdelivr.net" in read(page["file"]):
            warnings.append("{}: still loads Supabase from cdn.jsdelivr.net — "
                            "use the vendored js/vendor build".format(page["file"]))
    print("\nSupabase browser library loaded on (derived from CMS hooks in the markup):")
    for sp in supabase_pages:
        print("  " + sp)
    if forms_built:
        print("\nShared quote form rendered from partials/quote-form.html:")
        for path, variants in forms_built:
            print("  {:<28} {}".format(path, ", ".join(variants)))
        if not formspree_action():
            warnings.append(
                "FORMSPREE_ID in js/config.js is not set — every form will "
                "tell visitors to call instead of sending"
            )
    if warnings:
        print("\nWARNINGS:")
        for w in warnings:
            print("  ! " + w)
        return 1
    print("\nDone. Everything is in sync.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
