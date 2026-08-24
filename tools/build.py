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
        '<li class="nav__cta"><a class="btn btn--cyan btn--block" href="{}">'
        "Free Consultation</a></li>".format(url_for("contact", depth))
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


def gtm_head(cfg):
    """Google's official GTM container snippet, for <head>.

    This is the ONLY Google container on the site. GA4 and Google Ads
    conversions are configured inside the container, not here — adding
    a second gtag.js snippet to the pages would double-count page views.
    """
    gid = cfg["analytics"]["gtmContainerId"]
    return (
        "<!-- Google Tag Manager -->\n"
        "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n"
        "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n"
        "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n"
        "'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n"
        "})(window,document,'script','dataLayer','" + gid + "');</script>\n"
        "<!-- End Google Tag Manager -->"
    )


def gtm_body(cfg):
    """Google's official <noscript> fallback, for immediately after <body>."""
    gid = cfg["analytics"]["gtmContainerId"]
    return (
        "<!-- Google Tag Manager (noscript) -->\n"
        '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=' + gid + '"\n'
        'height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n'
        "<!-- End Google Tag Manager (noscript) -->"
    )


def main():
    cfg = load_config()
    header_tpl = strip_comment(read("partials/header.html"))
    footer_tpl = strip_comment(read("partials/footer.html"))
    no_track = set(cfg["analytics"].get("excludeFromTracking", []))

    updated, skipped, warnings = 0, 0, []

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
        if path not in no_track:
            html, _ = apply_partial(html, "gtm-head", gtm_head(cfg))
            html, _ = apply_partial(html, "gtm-body", gtm_body(cfg))

        html = sync_contact_details(html, cfg)

        if not ok_h:
            warnings.append("{}: no <!-- @partial:header --> markers".format(path))
        if not ok_f:
            warnings.append("{}: no <!-- @partial:footer --> markers".format(path))

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
        if extra.endswith(".html") and extra not in no_track:
            text, _ = apply_partial(text, "gtm-head", gtm_head(cfg))
            text, _ = apply_partial(text, "gtm-body", gtm_body(cfg))
        synced = sync_contact_details(text, cfg)
        if synced != original_extra:
            write(extra, synced)
            updated += 1
            print("  updated  {}".format(extra))

    write("sitemap.xml", build_sitemap(cfg))

    print("\nPages updated: {}   already current: {}".format(updated, skipped))
    print("Redirect files and sitemap.xml regenerated.")
    if warnings:
        print("\nWARNINGS:")
        for w in warnings:
            print("  ! " + w)
        return 1
    print("\nDone. Everything is in sync.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
