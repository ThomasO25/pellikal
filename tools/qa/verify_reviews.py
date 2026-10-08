"""Google reviews (Supabase-cached) verification against a real browser.

Supabase is stubbed at the network layer with fixture rows, so rendering,
selection rules, the bootstrap fallback, the error classification, the public
Google link and the mobile layout can all be checked deterministically. Nothing
here talks to Google - and the point of the first section is to prove that the
pages never do either.

Run:  python3 -m http.server 8901   (from the site root)   then
      python3 tools/qa/verify_reviews.py
"""
import base64, importlib.util, json, os, re, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8901"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
results = []


def check(label, got, want):
    ok = got == want
    results.append(ok)
    print(("  PASS  " if ok else "  FAIL  ") + label)
    if not ok:
        print("          expected: {!r}".format(want))
        print("          actual:   {!r}".format(got))


def read(rel):
    return open(os.path.join(ROOT, rel), encoding="utf-8").read()


CFG = json.load(open(os.path.join(ROOT, "site.config.json")))
FB = CFG["reviews"]["fallback"]
FB_RATING, FB_COUNT = "{:.1f}".format(float(FB["rating"])), str(int(FB["count"]))
FB_REVIEWS = FB["reviews"]                      # the three verified cards, verbatim
FB_NAMES = [r["reviewer_name"] for r in FB_REVIEWS]
LIVE_NAMES = ["Newest Lowstar", "Maria Santos", "D. Patel", "Should Not Show", "James O'Neill"]
# the PUBLIC Google Maps listing (site.config.json -> business.googleReviewsUrl), and how it appears inside an HTML attribute
GURL = CFG["business"]["googleReviewsUrl"]
GURL_ATTR = GURL.replace("&", "&amp;").replace('"', "&quot;")
PUBLIC_URL = "https://www.google.com/maps/search/?api=1&query=Pellikal+Window+Solutions&query_place_id=ChIJtUq8B35lwokR1llyrUB1VWc"
NOREF = "noopener noreferrer"

SUMMARY_LIVE = [{"average_rating": 4.9, "total_review_count": 23, "place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
                 "maps_uri": None, "new_review_uri": None, "last_synced_at": "2026-10-07T03:17:00Z"}]
SUMMARY_MAPS = [dict(SUMMARY_LIVE[0], maps_uri="https://maps.google.com/?cid=1234567890")]
SUMMARY_NOSYNC = [{"average_rating": None, "total_review_count": None, "place_id": None, "maps_uri": None, "new_review_uri": None, "last_synced_at": None}]
LONG = ("Our south-facing living room used to be unusable after 2pm in summer. Pellikal came out, explained the "
        "options without any pressure, and the film they installed made a real difference the same week. Clean "
        "install, no bubbles, and you cannot tell it is there. The crew covered the furniture, cleaned up after "
        "themselves and walked us through the warranty paperwork before they left. We have since had them back for the kitchen.")
REVIEWS = [
    {"google_review_id": "r5", "reviewer_name": "Newest Lowstar", "is_anonymous": False, "star_rating": 2, "comment": "Not for me.", "create_time": "2026-10-01T14:00:00Z", "update_time": "2026-10-01T14:00:00Z"},
    {"google_review_id": "r1", "reviewer_name": "Maria Santos", "is_anonymous": False, "star_rating": 5, "comment": LONG, "create_time": "2026-09-28T14:00:00Z", "update_time": "2026-09-28T14:00:00Z"},
    {"google_review_id": "r2", "reviewer_name": "D. Patel", "is_anonymous": False, "star_rating": 5, "comment": "Had the storefront windows of our shop done for glare and heat. Customers noticed the difference immediately and our AC runs less.", "create_time": "2026-09-10T14:00:00Z", "update_time": "2026-09-10T14:00:00Z"},
    {"google_review_id": "r3", "reviewer_name": "Should Not Show", "is_anonymous": True, "star_rating": 4, "comment": "Good work, on time.", "create_time": "2026-08-30T14:00:00Z", "update_time": "2026-08-30T14:00:00Z"},
    {"google_review_id": "r4", "reviewer_name": "James O'Neill", "is_anonymous": False, "star_rating": 5, "comment": "Professional from the first call to the last window.", "create_time": "2026-08-02T14:00:00Z", "update_time": "2026-08-02T14:00:00Z"},
]
# newest three WRITTEN reviews, strictly by create_time, whatever the stars (Option A)
WANT_CARDS = [("Newest Lowstar", "★★☆☆☆", "Rated 2 out of 5 on Google"), ("Maria Santos", "★★★★★", "Rated 5 out of 5 on Google"), ("D. Patel", "★★★★★", "Rated 5 out of 5 on Google")]
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "apikey, authorization, accept, content-type, accept-profile, content-profile, prefer, range"}

# What the stubbed Supabase answers to the SUMMARY request, per mode: (status, content-type, body).
# Modelled on real PostgREST / Supabase gateway responses.
J = "application/json"
SUMMARY_RESPONSES = {
    # --- must resolve to "live" ---
    "live":        (200, J, json.dumps(SUMMARY_LIVE)),
    "live_maps":   (200, J, json.dumps(SUMMARY_MAPS)),
    # --- must resolve to "nosync" (fallback allowed): Supabase POSITIVELY says no successful sync exists ---
    "nosync":      (200, J, json.dumps(SUMMARY_NOSYNC)),                                   # row exists, last_synced_at null
    "empty":       (200, J, "[]"),                                                          # table exists, zero rows
    "notable":     (404, J, json.dumps({"code": "PGRST205", "message": "Could not find the table 'public.google_review_summary' in the schema cache", "details": None, "hint": None})),   # PostgREST 12+
    "notable_old": (404, J, json.dumps({"code": "42P01", "message": "relation \"public.google_review_summary\" does not exist", "details": None, "hint": None})),                       # older PostgREST
    # --- must resolve to "unavailable" (NO fallback, UI hidden, page works) ---
    "400":         (400, J, json.dumps({"code": "PGRST100", "message": "\"failed to parse select parameter (average_rating,,total_review_count)\" (line 1, column 16)", "details": "unexpected \",\" expecting field name", "hint": None})),
    "401":         (401, J, json.dumps({"code": "PGRST301", "message": "JWT expired", "details": None, "hint": None})),
    "403":         (403, J, json.dumps({"code": "42501", "message": "permission denied for table google_review_summary", "details": None, "hint": None})),   # names the table, but is NOT "missing table"
    "404_html":    (404, "text/html; charset=utf-8", "<html><head><title>404</title></head><body>Not Found</body></html>"),                                   # gateway / wrong project URL
    "404_other":   (404, J, json.dumps({"code": "PGRST205", "message": "Could not find the table 'public.google_review_summary_v2' in the schema cache", "details": None, "hint": None})),   # PGRST205 for a DIFFERENT table
    "406":         (406, J, json.dumps({"code": "PGRST107", "message": "None of these media types are available: text/csv", "details": None, "hint": None})),
    "500":         (500, J, json.dumps({"message": "boom"})),
    "502_html":    (502, "text/html", "<html><body>502 Bad Gateway</body></html>"),
    "200_notjson": (200, "text/html", "<html><body>captive portal</body></html>"),
    "200_synced_nonumbers": (200, J, json.dumps([dict(SUMMARY_LIVE[0], average_rating=None, total_review_count=0)])),   # a sync happened, nothing usable: never fall back over synced data
}
NOSYNC_MODES = [("nosync", "summary row present, last_synced_at null"), ("empty", "table exists, zero rows"),
                ("notable", "table not created yet - PostgREST 404 PGRST205 naming google_review_summary"),
                ("notable_old", "table not created yet - older PostgREST 404 42P01 naming google_review_summary")]
UNAVAILABLE_MODES = [("down", "network failure (request aborted)"), ("400", "HTTP 400 malformed query (PGRST100)"), ("401", "HTTP 401 invalid/expired JWT (PGRST301)"),
                     ("403", "HTTP 403 permission denied (42501; message names the table)"), ("404_html", "HTTP 404 from a gateway (HTML body)"),
                     ("404_other", "HTTP 404 PGRST205 for a DIFFERENT table"), ("406", "HTTP 406 unexpected media type (PGRST107)"), ("500", "HTTP 500"),
                     ("502_html", "HTTP 502 (HTML body)"), ("200_notjson", "HTTP 200 with a non-JSON body"), ("200_synced_nonumbers", "synced row with no usable numbers")]

STATE = """() => { const s = document.querySelector('section#google-reviews'); const cards = s ? [...s.querySelectorAll('.greview')] : [];
    const g = document.querySelector('.gproof__google'); const pl = g ? g.querySelector('[data-greviews=proof-link]') : null;
    const shown = e => e.offsetParent !== null && getComputedStyle(e).display !== 'none';
    return { visible: !!s && !s.hidden, wrapHidden: s ? s.querySelector('[data-greviews-cards-wrap]').hidden : null,
      cards: cards.map(c => ({ name: c.querySelector('.greview__name').textContent, stars: c.querySelector('.gstars').textContent, label: c.querySelector('.gstars').getAttribute('aria-label'),
                               text: c.querySelector('.greview__text p').textContent, when: (c.querySelector('time')||{}).textContent, src: c.querySelector('.greview__src').textContent })),
      anyCard: document.querySelectorAll('.greview').length,
      rating: s ? s.querySelector('[data-greviews=rating]').textContent : null, count: s ? s.querySelector('[data-greviews=count]').textContent : null,
      bigStars: s ? s.querySelector('.gstars--lg').getAttribute('aria-label') : null, heading: s ? s.querySelector('h2').textContent : null, label: s ? s.querySelector('.greviews__label').textContent : null,
      link: s ? (a => ({ hidden: !shown(a), href: a.getAttribute('href'), target: a.target, rel: a.rel, text: a.textContent }))(s.querySelector('[data-greviews=link]')) : null,
      source: s ? s.getAttribute('data-greviews-source') : null, cardSources: cards.map(c => c.getAttribute('data-greviews-source')),
      proof: g ? { hidden: g.hidden, text: g.textContent, source: g.getAttribute('data-greviews-source'), rating: g.querySelector('[data-greviews=rating]').textContent, count: g.querySelector('[data-greviews=count]').textContent,
                   stars: g.querySelector('[data-greviews=stars]').textContent,
                   link: pl ? { href: pl.getAttribute('href'), target: pl.getAttribute('target'), rel: pl.getAttribute('rel'), isStatic: pl.classList.contains('gproof__link--static'), external: pl.getAttribute('data-greviews-external'), shown: shown(pl) } : null } : null,
      // every VISIBLE Google-review anchor that carries an href: none may be a dead "" / "#" (an <a> without href is plain text, not a link)
      deadLinks: [...document.querySelectorAll('a[data-greviews][href]')].filter(shown).map(a => a.getAttribute('href')).filter(h => h === '' || h === '#'),
      updatedNote: [...document.querySelectorAll('[data-greviews=synced]')].map(n => n.textContent).join('|') }; }"""
PAGE_OK = """() => ({ h1: !!document.querySelector('h1'), form: !!document.querySelector('#quote-form'), fields: [...document.querySelectorAll('#quote-form input:not([type=hidden])')].filter(e => !e.closest('.hp')).map(e => e.name),
      over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, stars: document.body.textContent.includes('★') })"""
# records every dataLayer push into sessionStorage (survives the /thankyou/ navigation)
RECORDER = """(() => { const rec = o => { try { const c = JSON.parse(sessionStorage.getItem('__ev')||'[]'); c.push(JSON.parse(JSON.stringify(o, (k,v) => typeof v === 'function' ? '[fn]' : v))); sessionStorage.setItem('__ev', JSON.stringify(c)); } catch (e) {} };
  const wrap = a => { if (!a || a.__w) return a; const p = a.push.bind(a); a.push = function (o) { rec(o); return p(o); }; a.__w = true; return a; };
  let real = wrap([]); Object.defineProperty(window, 'dataLayer', { configurable: true, get() { return real; }, set(v) { real = wrap(v||[]); } }); })()"""


def run():
    print("\n=== 1. SOURCE - secrets, surfaces, wiring, labels, the public Google URL ===")
    cfgjs = read("js/config.js")
    anon = re.search(r'SUPABASE_ANON_KEY:\s*"([^"]+)"', cfgjs).group(1)
    payload = json.loads(base64.urlsafe_b64decode(anon.split(".")[1] + "==").decode())
    check("the only Supabase key in client code is the ANON role key", payload.get("role"), "anon")
    client_files = ["js/reviews.js", "js/main.js", "js/config.js", "js/tracking.js", "js/consent.js", "js/admin.js", "index.html", "residential/index.html", "commercial/index.html"]
    blob = "\n".join(read(f) for f in client_files)
    leaks = [pat for pat in ["GOCSPX-", "refresh_token", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "SYNC_SECRET", "1//0", "mybusiness.googleapis.com", "oauth2.googleapis.com"] if re.search(re.escape(pat), blob)]
    check("no Google OAuth credential, refresh token or Google API host in any client file", leaks, [])
    roles = []
    for tok in re.findall(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", blob):
        try: roles.append(json.loads(base64.urlsafe_b64decode(tok.split(".")[1] + "==").decode()).get("role"))
        except Exception: roles.append("undecodable")
    check("every JWT in client code is the anon key (no service_role key anywhere)", roles, ["anon"] * len(roles))
    rv = read("js/reviews.js")
    check("reviews.js renders with DOM methods only (no innerHTML / insertAdjacentHTML / document.write)", re.findall(r"innerHTML|insertAdjacentHTML|document\.write|outerHTML", rv), [])
    check("reviews.js reads the two public rows, display columns only (never last_error); never writes (no POST/PATCH/DELETE)",
          ["google_review_summary?select=average_rating,total_review_count,place_id,maps_uri,new_review_uri,last_synced_at" in rv,
           "google_reviews?select=google_review_id,reviewer_name,is_anonymous,star_rating,comment,create_time,update_time" in rv, "last_error" in rv,
           bool(re.search(r"method:\s*['\"](POST|PATCH|PUT|DELETE)", rv))], [True, True, False, False])
    check("reviews.js no longer guesses what a review is about (no keyword classifier) and has no star filter", ["COMMERCIAL_WORDS" in rv, "min-stars" in rv, "minStars" in rv], [False, False, False])
    check("selection is strictly newest-first by create_time, written reviews only (no length preference)",
          ["parseWhen(b.create_time) - parseWhen(a.create_time)" in rv, "MIN_GOOD_LEN" in rv, "length >= 40" in rv], [True, False, False])
    check("link priority in code: configured URL, then maps_uri, then placeId", rv.find("configured) return configured") < rv.find("summary.maps_uri") < rv.find("placeid="), True)
    check("v30: the summary classifier inspects the PostgREST error BODY (PGRST205 / 42P01 naming google_review_summary) - the old status-only 'nosync' shortcut is gone",
          ["function isMissingSummaryTable" in rv, '"PGRST205"' in rv, '"42P01"' in rv, "google_review_summary\\b" in rv, "r.status === 404 || r.status === 400 || r.status === 406" in rv, "throw new Error(\"HTTP \" + r.status)" in rv.split("function loadReviews")[0]],
          [True, True, True, True, False, False])
    check("v30: every external Google link gets target=_blank + rel=\"noopener noreferrer\" (section buttons and the fallback hero count)",
          [rv.count('a.rel = "noopener noreferrer"'), rv.count('pl.rel = "noopener noreferrer"'), 'rel = "noopener";' in rv], [1, 1, False])
    env_example = read("supabase/.env.example")
    check(".env.example holds placeholders only", all(k in env_example for k in ["GOOGLE_CLIENT_ID=", "GOOGLE_CLIENT_SECRET=", "GOOGLE_REFRESH_TOKEN=", "GOOGLE_BUSINESS_ACCOUNT_ID=", "GOOGLE_BUSINESS_LOCATION_ID=", "SYNC_SECRET="])
          and all(("replace" in line.lower() or "123456" in line or "9876543210" in line) for line in env_example.splitlines() if "=" in line and not line.startswith("#")), True)
    check(".gitignore keeps supabase/.env out of the public repo", all(x in read(".gitignore") for x in ["supabase/.env", "!supabase/.env.example"]), True)
    fn = read("supabase/functions/sync-google-reviews/index.ts") + read("supabase/functions/sync-google-reviews/sync.ts")
    check("Edge Function reads every credential from the environment, hard-codes none",
          [bool(re.search(r"env\(\"" + k + "\"\)", fn)) for k in ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_BUSINESS_ACCOUNT_ID", "GOOGLE_BUSINESS_LOCATION_ID", "SYNC_SECRET"]]
          + [bool(re.search(r"GOCSPX-|1//0[A-Za-z0-9]", fn))], [True] * 6 + [False])
    mig = read("supabase/migrations/0004_google_reviews.sql")
    check("migration: RLS on both tables, anon granted SELECT on display columns only, no write policy, mark_missing is service_role-only",
          ["alter table public.google_review_summary enable row level security" in mig, "alter table public.google_reviews        enable row level security" in mig,
           "for select to anon, authenticated using (deleted_at is null)" in mig, "last_error" in mig.split("grant select (id, average_rating")[1].split(";")[0],
           bool(re.search(r"create policy \w+ on public\.google_\w+\s+for (insert|update|delete|all)", mig)),
           "grant execute on function public.google_reviews_mark_missing(text[], timestamptz) to service_role" in mig], [True, True, True, False, False, True])

    print("\n--- 1b. THE PUBLIC GOOGLE URL (site.config.json -> business.googleReviewsUrl) ---")
    check("business.googleReviewsUrl is no longer the REPLACE_WITH... placeholder", GURL.startswith("REPLACE") or "REPLACE" in GURL, False)
    check("it is EXACTLY the public 'Pellikal Window Solutions' Google Maps listing from the brief (not invented, not the signed-in management URL)", GURL, PUBLIC_URL)
    check("it begins with https://, contains no authuser=, no /customers/reviews, no account-specific Google parameter",
          [GURL.startswith("https://"), "authuser=" in GURL, "/customers/reviews" in GURL, bool(re.search(r"[?&](authuser|hl|gl|ved|ei|sxsrf|opi)=", GURL)), "business.google.com" in GURL], [True, False, False, False, False])
    for f, n_attr in [("index.html", 1), ("residential/index.html", 2), ("commercial/index.html", 2)]:
        html = read(f)
        hrefs = re.findall(r'data-greviews="link"[^>]*?\shref="([^"]*)"', html)
        check("{}: built page carries the public URL in every data-greviews-url attribute ({}) AND in the 'Read all reviews' href; no REPLACE_ placeholder, no authuser=, no /customers/reviews anywhere in the page".format(f, n_attr),
              [html.count('data-greviews-url="' + GURL_ATTR + '"'), hrefs, "REPLACE_WITH_GOOGLE" in html, "authuser=" in html, "/customers/reviews" in html], [n_attr, [GURL_ATTR], False, False, False])
        check("{}: no dead '#' Google review link in the markup (every data-greviews anchor has a real href or an on-page anchor)".format(f),
              [h for h in re.findall(r'<a[^>]*data-greviews="(?:link|proof-link)"[^>]*\shref="([^"]*)"', html) if h in ("", "#")], [])
    # the build's guard: a signed-in / non-public URL is refused, the placeholder leaves no link, the public URL is escaped into both places
    sys.dont_write_bytecode = True   # importing build.py must not leave a __pycache__ in the repo
    spec = importlib.util.spec_from_file_location("pellikal_build", os.path.join(ROOT, "tools", "build.py")); build = importlib.util.module_from_spec(spec); spec.loader.exec_module(build)
    snippet = '<span data-greviews-section data-greviews-url="REPLACE_WITH_GOOGLE_REVIEWS_URL" hidden></span><a class="btn" data-greviews="link" data-cta-location="x" href="#" hidden>Read</a>'
    def stamp(url):
        cfg = json.loads(json.dumps(CFG)); cfg["business"]["googleReviewsUrl"] = url
        try: return build.sync_contact_details(snippet, cfg)
        except SystemExit as e: return "REFUSED: " + str(e)
    bad = ["https://business.google.com/n/123/customers/reviews?authuser=1", "https://www.google.com/maps/place/x?authuser=2", "http://www.google.com/maps/search/?api=1&query=x",
           "https://business.google.com/n/1234567890/customers/reviews"]
    check("build.py refuses a signed-in management URL, authuser=, /customers/reviews and plain http://", [stamp(u).startswith("REFUSED: site.config.json: business.googleReviewsUrl must be the PUBLIC") for u in bad], [True] * 4)
    check("build.py: the REPLACE_ placeholder leaves the attribute unconfigured and the button href '#' (hidden, never shown)", stamp("REPLACE_WITH_GOOGLE_REVIEWS_URL"), snippet)
    check("build.py: the public URL is stamped, attribute-escaped, into the attribute and the href", stamp(GURL), snippet.replace("REPLACE_WITH_GOOGLE_REVIEWS_URL", GURL_ATTR).replace('href="#"', 'href="' + GURL_ATTR + '"'))

    for f in ["index.html", "residential/index.html", "commercial/index.html"]:
        html = read(f)
        check("{}: reviews section ships hidden, carries the config URL, no star filter / project classifier, labelled 'most recent', loads js/reviews.js deferred AFTER main.js".format(f),
              [html.count('id="google-reviews"'), 'id="google-reviews" data-greviews-section' in html, html.count('data-greviews-url="' + GURL_ATTR + '"') >= 1,
               bool(re.search(r'<section[^>]*id="google-reviews"[^>]*\bhidden>', html)), "data-greviews-min-stars" in html, "data-greviews-filter" in html,
               html.count("Google Reviews &mdash; most recent"), html.count('js/reviews.js" defer>'),
               re.search(r'<script src="[^"]*js/main\.js"', html).start() < re.search(r'<script src="[^"]*js/reviews\.js"', html).start()],
              [1, True, True, True, False, False, 1, 1, True])
    for f, loc in [("residential/index.html", "residential_hero"), ("commercial/index.html", "commercial_hero")]:
        html = read(f)
        check("{}: hero proof element carries the bootstrap fallback stamped from site.config.json ({} / {}), a proof-link and the config URL".format(f, FB_RATING, FB_COUNT),
              [html.count('data-greviews-role="proof"'), 'data-greviews-fallback-rating="' + FB_RATING + '"' in html, 'data-greviews-fallback-count="' + FB_COUNT + '"' in html,
               'data-greviews-fallback-asof="' + re.sub(r"[^0-9-]", "", str(FB.get("asOf", ""))) + '"' in html, 'data-greviews="proof-link" data-cta-location="' + loc + '"' in html], [1, True, True, True, True])
    for f in ["index.html", "residential/index.html", "commercial/index.html"]:
        html = read(f)
        m = re.search(r'<script type="application/json" data-greviews-fallback-reviews>(.*?)</script>', html, re.S)
        stamped = json.loads(m.group(1)) if m else None
        check("{}: the section carries the fallback summary + the 3 verified cards stamped from site.config.json, text byte-identical, '<' escaped".format(f),
              [bool(re.search(r'id="google-reviews"[^>]*data-greviews-fallback-rating="' + FB_RATING + '"', html)),
               [(r["reviewer_name"], r["star_rating"], r["review_date"], r["review_text"]) for r in (stamped or [])], "<" in (m.group(1) if m else "<")],
              [True, [(r["reviewer_name"], r["star_rating"], r["review_date"], r["review_text"]) for r in FB_REVIEWS], False])
    check("fallback content unchanged: rating 5.0, count 12, asOf 2026-10-07, the three names in the supplied order", [FB_RATING, FB_COUNT, FB.get("asOf"), FB_NAMES], ["5.0", "12", "2026-10-07", ["Steven Matt", "Maureen Paradine", "Meryl Feldman"]])
    check("homepage heading is 'What Pellikal customers say' with the GOOGLE REVIEWS eyebrow", ['<p class="eyebrow">Google reviews</p><h2>What Pellikal customers say</h2>' in read("index.html")], [True])
    check("the supplied review text was not altered on its way into the config (spot checks: 'Bert', '12 years again', 'excellence service')",
          ["Bert came in assessed" in FB_REVIEWS[2]["review_text"], "12 years again" in FB_REVIEWS[2]["review_text"], "excellence service" in FB_REVIEWS[2]["review_text"], FB_REVIEWS[0]["review_text"].startswith("Really great service")], [True] * 4)
    check("Commercial: neutral heading, no commercial-client claim anywhere in its reviews markup",
          ["<h2>What Pellikal customers say</h2>" in read("commercial/index.html"), bool(re.search(r"business &amp; commercial projects|describes a business", read("commercial/index.html")))], [True, False])
    for f in ["window-inserts/index.html", "contact/index.html", "about/index.html", "thankyou/index.html", "admin/index.html"]:
        check("{}: no reviews component, no reviews.js".format(f), ["google-reviews" in read(f), "reviews.js" in read(f)], [False, False])
    check("homepage: the old CMS testimonials placeholder is gone", [x in read("index.html") for x in ['id="reviews"', 'id="quotes"', "stays empty"]], [False, False, False])
    rres = read("residential/index.html")
    order = [m.start() for m in [re.search(r"<h1>", rres), re.search(r'data-quote-cta="hero"', rres), re.search(r'class="gproof"', rres), re.search(r'LLumar&reg; SelectPro&trade; dealer network</span></p>', rres),
                                 re.search(r'id="quote"', rres), re.search(r"Three things you notice", rres), re.search(r"Long Island homes we", rres), re.search(r'id="google-reviews"', rres), re.search(r'class="cta-band"', rres)]]
    check("residential order: problem/benefit -> Free Quote CTA -> Google proof -> LLumar -> form -> benefits -> imagery -> reviews -> final CTA", order == sorted(order), True)
    cron = read("supabase/sql/schedule_google_reviews_sync.sql")
    check("cron file: guard raises before anything runs; placeholder on exactly one line", [cron.find("raise exception") < cron.find("vault.create_secret") < cron.find("cron.schedule"), cron.count("'<SYNC_SECRET>'")], [True, 1])
    stale = []
    for f in ["README.md", "docs/GOOGLE-REVIEWS.md", "docs/DEPLOYMENT-CHECKLIST.md", "docs/SUPABASE-SETUP.md", "css/styles.css", "js/reviews.js", "index.html", "residential/index.html", "commercial/index.html"]:
        stale += [f + ": " + m for m in re.findall(r"stays hidden until real synced|hidden until real data|revealed only when real data|shows nothing on the live site|shows no review elements|nothing shows while the tables", read(f))]
    check("no documentation/comment still claims the review UI stays hidden until the first successful sync (v30 sweep)", stale, [])

    with sync_playwright() as p:
        browser = p.chromium.launch()

        def fresh(mode="live", width=1280, formspree=False, configured_url=None):
            """configured_url: None = the page as built (the public Maps URL); "" = serve it UNCONFIGURED
            (REPLACE_ placeholder, href '#'); any https URL = serve it with that URL configured instead."""
            ctx = browser.new_context(viewport={"width": width, "height": 900}, is_mobile=width <= 430, has_touch=width <= 430, reduced_motion="reduce")
            google_hits, calls = [], []
            for pat in ["**://*.googletagmanager.com/**", "**://fonts.googleapis.com/**", "**://fonts.gstatic.com/**"]:
                ctx.route(pat, lambda r: r.abort())
            ctx.route(re.compile(r"https://(mybusiness|mybusinessbusinessinformation|oauth2)\.googleapis\.com/.*"), lambda r: (google_hits.append(r.request.url), r.abort()))
            ctx.route(re.compile(r"https://(www\.)?google\.com/.*|https://search\.google\.com/.*|https://maps\.google\.com/.*|https://g\.page/.*"), lambda r: (google_hits.append(r.request.url), r.abort()))
            for t in ["site_content", "gallery_images", "projects", "testimonials"]:
                ctx.route("**/rest/v1/" + t + "*", lambda r: r.abort())
            if configured_url is not None:
                def rewrite(route):
                    res = route.fetch(); body = res.text()
                    if configured_url == "":
                        body = body.replace('data-greviews-url="' + GURL_ATTR + '"', 'data-greviews-url="REPLACE_WITH_GOOGLE_REVIEWS_URL"').replace('href="' + GURL_ATTR + '"', 'href="#"')
                    else:
                        body = body.replace(GURL_ATTR, configured_url.replace("&", "&amp;"))
                    route.fulfill(status=200, content_type="text/html; charset=utf-8", body=body)
                ctx.route(re.compile(r"http://127\.0\.0\.1:8901/(residential/|commercial/|)$"), rewrite)
            def rest(route):
                calls.append(route.request.method + " " + route.request.url)
                url = route.request.url
                if mode == "down":
                    return route.abort()
                status, ctype, body = SUMMARY_RESPONSES[mode]
                if "google_reviews?" in url:   # the cards request - only ever expected in live mode
                    if mode in ("live", "live_maps"): status, ctype, body = 200, J, json.dumps(REVIEWS)
                    elif status == 200: body = "[]"
                route.fulfill(status=status, content_type=ctype, body=body, headers=CORS)
            ctx.route("**/rest/v1/google_review_summary*", rest)
            ctx.route("**/rest/v1/google_reviews*", rest)
            if formspree:
                ctx.route("**://formspree.io/**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"ok":true}'))
            ctx.add_cookies([{"name": "pellikal_consent", "value": "v2%3Aa1%3Ad1%3A2026-09-14", "url": BASE}])
            return ctx, ctx.new_page(), calls, google_hits

        def submit_quote(pg):
            """Fills and submits the Residential quote form (Formspree stubbed). Returns (generate_lead count, landed on /thankyou/)."""
            pg.fill("#name", "Jane Testperson"); pg.fill("#phone", "5165550147"); pg.fill("#zip", "11570")
            pg.click("#quote-form button[type=submit]"); pg.wait_for_url("**/thankyou/**", timeout=6000); pg.wait_for_timeout(300)
            rec = pg.evaluate("() => JSON.parse(sessionStorage.getItem('__ev')||'[]')")
            evs = [x.get("event") for x in rec if isinstance(x, dict) and x.get("event")]
            return evs.count("generate_lead"), pg.url.endswith("/thankyou/"), rec

        print("\n=== 2. LIVE DATA (Supabase stubbed with a successful sync) ===")
        ctx, pg, calls, ghits = fresh()
        for path in ["/residential/", "/", "/commercial/"]:
            pg.goto(BASE + path, wait_until="load"); pg.wait_for_timeout(900)
            st = pg.evaluate(STATE)
            check("{}: section revealed; rating 4.9 / count 23 are the summary row's (Google's aggregate), NOT the fallback".format(path), [st["visible"], st["rating"], st["count"], st["bigStars"]], [True, "4.9", "23", "Rated 4.9 out of 5 on Google"])
            check("{}: cards = the 3 NEWEST written reviews strictly by date, whatever their stars (2-star newest included; anonymous 4-star and older 5-star excluded by date only)".format(path),
                  [(c["name"], c["stars"], c["label"]) for c in st["cards"]], WANT_CARDS)
            check("{}: label says 'most recent' and that is what it is".format(path), st["label"], "Google Reviews — most recent")
            check("{}: review text rendered exactly as stored - not rewritten, not trimmed".format(path), [c["text"] for c in st["cards"]], [REVIEWS[0]["comment"], LONG, REVIEWS[2]["comment"]])
            check("{}: every card carries reviewer name, relative date and 'Google review' attribution".format(path), all(c["when"] and c["src"] == "Google review" for c in st["cards"]), True)
            check("{}: 'Read all reviews' link = the configured PUBLIC Maps listing (priority 1, beats the synced placeId), new tab, rel=noopener noreferrer, visible; no dead '#' link".format(path),
                  [st["link"]["hidden"], st["link"]["href"], st["link"]["target"], st["link"]["rel"], st["deadLinks"]], [False, GURL, "_blank", NOREF, []])
            if path != "/":
                check("{}: hero proof line = LIVE values, marked source=live, count links to the on-page section".format(path),
                      [st["proof"]["hidden"], st["proof"]["source"], st["proof"]["rating"], st["proof"]["count"], st["proof"]["link"]["href"], st["proof"]["link"]["isStatic"]], [False, "live", "4.9", "23", "#google-reviews", False])
            check("{}: no request to any Google host from the browser".format(path), ghits, [])
        check("Commercial heading is neutral and its cards are the same newest-three as everywhere (no project-type guessing)",
              [pg.evaluate(STATE)["heading"], [c["name"] for c in pg.evaluate(STATE)["cards"]]], ["What Pellikal customers say", [c[0] for c in WANT_CARDS]])
        pg.goto(BASE + "/residential/", wait_until="load"); pg.wait_for_timeout(900)
        check("long review is clamped with a 'Read full review' control that expands it (text itself untouched)",
              pg.evaluate("""() => { const c = [...document.querySelectorAll('.greview')].find(x => x.querySelector('.greview__more')); if (!c) return 'no clamped card';
                  const q = c.querySelector('.greview__text'), b = c.querySelector('.greview__more'); const before = q.classList.contains('is-clamped'); b.click();
                  return [before, q.classList.contains('is-clamped'), b.textContent, b.getAttribute('aria-expanded'), q.textContent.length > 300]; }"""), [True, False, "Show less", "true", True])
        clicks = pg.evaluate("""() => { window.addEventListener('click', e => e.preventDefault());
            document.querySelector('section#google-reviews [data-greviews=link]').click();
            return (window.dataLayer||[]).filter(x => x && x.event === 'google_reviews_click').map(x => [x.cta_location, x.page_type, Object.keys(x).sort().join(',')]); }""")
        check("google_reviews_click is pushed with cta_location + page_type only (diagnostic; never generate_lead)", clicks, [["residential_reviews", "residential", "cta_location,event,page_type"]])
        n_before = len(calls)
        pg.goto(BASE + "/", wait_until="load"); pg.wait_for_timeout(700)
        check("second page in the same session reads the 15-minute sessionStorage cache (no new Supabase requests)", len(calls) - n_before, 0)
        check("no card from the fallback set while live data exists (no mixing)", [n for n in pg.evaluate("() => [...document.querySelectorAll('.greview__name')].map(e => e.textContent)") if n in FB_NAMES], [])
        check("every Supabase request the browser ever made was a read (GET) - the site never writes", sorted(set(c.split(" ")[0] for c in calls)), ["GET"])
        ctx.close()

        print("\n=== 2b. LINK PRIORITY (served UNCONFIGURED to reach the lower rungs) ===")
        ctx, pg, calls, ghits = fresh(mode="live", configured_url="")
        pg.goto(BASE + "/residential/", wait_until="load"); pg.wait_for_timeout(900)
        check("no configured URL, no maps_uri -> the placeId URL (last resort), new tab, noopener noreferrer", [pg.evaluate(STATE)["link"]["href"], pg.evaluate(STATE)["link"]["rel"]], ["https://search.google.com/local/reviews?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4", NOREF])
        ctx.close()
        ctx, pg, calls, ghits = fresh(mode="live_maps", configured_url="")
        pg.goto(BASE + "/residential/", wait_until="load"); pg.wait_for_timeout(900)
        check("Google's own maps_uri beats the constructed placeId URL", pg.evaluate(STATE)["link"]["href"], "https://maps.google.com/?cid=1234567890")
        ctx.close()
        ctx, pg, calls, ghits = fresh(mode="live_maps")
        pg.goto(BASE + "/residential/", wait_until="load"); pg.wait_for_timeout(900)
        check("the configured public URL beats both maps_uri and placeId", pg.evaluate(STATE)["link"]["href"], GURL)
        ctx.close()

        print("\n=== 3. BOOTSTRAP FALLBACK - only when Supabase POSITIVELY says no successful sync exists ===")
        for mode, label in NOSYNC_MODES:
            ctx, pg, calls, ghits = fresh(mode=mode)
            for path, heading in [("/residential/", "What Long Island homeowners say"), ("/commercial/", "What Pellikal customers say"), ("/", "What Pellikal customers say")]:
                pg.goto(BASE + path, wait_until="load"); pg.wait_for_timeout(900)
                st = pg.evaluate(STATE)
                if path != "/":
                    check("{} / {}: hero trust line shows the fallback {} / {}, marked source=fallback".format(label, path, FB_RATING, FB_COUNT),
                          [st["proof"]["hidden"], st["proof"]["source"], st["proof"]["rating"], st["proof"]["count"], st["proof"]["stars"]], [False, "fallback", FB_RATING, FB_COUNT, "★" * 5])
                    check("{} / {}: the fallback count is CLICKABLE - it opens the public Maps listing in a new tab (rel=noopener noreferrer)".format(label, path),
                          [st["proof"]["link"]["href"], st["proof"]["link"]["target"], st["proof"]["link"]["rel"], st["proof"]["link"]["external"], st["proof"]["link"]["isStatic"], st["proof"]["link"]["shown"]], [GURL, "_blank", NOREF, "1", False, True])
                check("{} / {}: section visible with the fallback summary, heading '{}', labelled 'Featured Google Reviews' (never 'most recent'), source=fallback".format(label, path, heading),
                      [st["visible"], st["rating"], st["count"], st["heading"], st["label"], st["source"]], [True, FB_RATING, FB_COUNT, heading, "Featured Google Reviews", "fallback"])
                check("{} / {}: all 3 verified cards, supplied order, text byte-identical to the config, 5 stars, dated, attributed, each marked source=fallback".format(label, path),
                      [[(c["name"], c["text"], c["stars"], c["when"], c["src"]) for c in st["cards"]], st["cardSources"]],
                      [[(r["reviewer_name"], r["review_text"], "★" * 5, {"2023-10-07": "Oct 2023", "2023-08-30": "Aug 2023", "2023-08-28": "Aug 2023"}[r["review_date"]], "Google review") for r in FB_REVIEWS], ["fallback"] * 3])
                check("{} / {}: no live fixture name anywhere, no 'updated' note, no Supabase reviews request (cards come from the page itself)".format(label, path),
                      [any(n in pg.content() for n in LIVE_NAMES), st["updatedNote"], any("google_reviews?" in c for c in calls)], [False, "", False])
                check("{} / {}: 'Read All Reviews on Google' is VISIBLE and opens the public Maps listing (new tab, rel=noopener noreferrer); no dead '#' link on the page".format(label, path),
                      [st["link"]["hidden"], st["link"]["href"], st["link"]["target"], st["link"]["rel"], st["deadLinks"]], [False, GURL, "_blank", NOREF, []])
            check("{}: Commercial fallback cards carry no commercial-client claim (label/heading neutral, no 'commercial' wording in the section text)".format(label),
                  (pg.goto(BASE + "/commercial/", wait_until="load") or True) and (pg.wait_for_timeout(900) or True) and bool(re.search(r"commercial client|commercial project", pg.evaluate("() => document.querySelector('#google-reviews').textContent"), re.I)), False)
            check("{}: the word 'fallback' is never shown to visitors (attribute only)".format(label), "fallback" in pg.evaluate("() => document.body.innerText").lower(), False)
            check("{}: every Supabase request was a read (GET) - the fallback never writes to Supabase".format(label), sorted(set(c.split(" ")[0] for c in calls)), ["GET"])
            check("{}: no request to any Google host from the browser".format(label), ghits, [])
            ctx.close()
        ctx, pg, calls, ghits = fresh(mode="nosync")
        pg.goto(BASE + "/residential/", wait_until="load"); pg.wait_for_timeout(900)
        clicks = pg.evaluate("""() => { window.addEventListener('click', e => e.preventDefault()); document.querySelector('[data-greviews=proof-link]').click(); document.querySelector('section#google-reviews [data-greviews=link]').click();
            return (window.dataLayer||[]).filter(x => x && x.event === 'google_reviews_click').map(x => [x.cta_location, x.page_type]); }""")
        check("fallback mode: clicking the hero count and the button each push the diagnostic google_reviews_click (residential_hero / residential_reviews)", clicks, [["residential_hero", "residential"], ["residential_reviews", "residential"]])
        ctx.close()
        for path in ["/residential/", "/"]:
            ctx, pg, calls, ghits = fresh(mode="nosync", configured_url="")
            pg.goto(BASE + path, wait_until="load"); pg.wait_for_timeout(900)
            st = pg.evaluate(STATE)
            if path != "/":
                check("were NO URL configured ({}): the fallback count is plain text - no dead link".format(path), [st["proof"]["link"]["href"], st["proof"]["link"]["isStatic"], st["deadLinks"]], [None, True, []])
            check("were NO URL configured ({}): the 'Read all reviews' button is NOT rendered (display none, not just the attribute)".format(path), [st["link"]["hidden"], st["deadLinks"]], [True, []])
            ctx.close()
        ctx, pg, calls, ghits = fresh(mode="live")
        pg.goto(BASE + "/residential/", wait_until="load"); pg.wait_for_timeout(900)
        st = pg.evaluate(STATE)
        check("LIVE sync present -> live values replace the stamped fallback everywhere (4.9/23, not {}/{}); cards are the live newest-three, label 'most recent', source=live, not one fallback name".format(FB_RATING, FB_COUNT),
              [st["proof"]["source"], st["proof"]["rating"], st["proof"]["count"], st["rating"], st["count"], st["source"], st["label"], [c["name"] for c in st["cards"]], st["cardSources"],
               any(n in [c["name"] for c in st["cards"]] for n in FB_NAMES), "data-greviews-fallback-rating=\"" + FB_RATING + "\"" in pg.content()],
              ["live", "4.9", "23", "4.9", "23", "live", "Google Reviews — most recent", [c[0] for c in WANT_CARDS], ["live"] * 3, False, True])
        ctx.close()

        print("\n=== 4. ERROR CLASSIFICATION - every real problem is 'unavailable': NO fallback, UI hidden, page + quote form keep working ===")
        for mode, label in UNAVAILABLE_MODES:
            ctx, pg, calls, ghits = fresh(mode=mode, formspree=True)
            pg.add_init_script(RECORDER)
            for path in ["/", "/residential/", "/commercial/"]:
                pg.goto(BASE + path, wait_until="load"); pg.wait_for_timeout(700)
                st = pg.evaluate(STATE); page_ok = pg.evaluate(PAGE_OK)
                check("{} / {}: section + proof stay hidden, NO fallback, no cards, no stars, no dead link; page, form and fields intact".format(label, path),
                      [st["visible"], (st["proof"] or {}).get("hidden", True), st["source"], (st["proof"] or {}).get("source"), st["anyCard"], page_ok["stars"], st["deadLinks"], page_ok["h1"], page_ok["form"], page_ok["fields"], page_ok["over"]],
                      [False, True, None, None, 0, False, [], True, True, ["name", "phone", "email", "zip"], False])
            pg.goto(BASE + "/residential/", wait_until="load"); pg.wait_for_timeout(500)
            leads, thanks, rec = submit_quote(pg)
            check("{}: the quote form still WORKS - Formspree 2xx -> exactly one generate_lead -> /thankyou/; no fallback name in any push".format(label),
                  [leads, thanks, any(n.lower() in repr(rec).lower() for n in FB_NAMES)], [1, True, False])
            check("{}: nothing was retried into a write; every Supabase request was a GET; no Google host called".format(label), [sorted(set(c.split(" ")[0] for c in calls)), ghits], [["GET"], []])
            ctx.close()
        ctx, pg, calls, ghits = fresh(mode="live")
        pg.goto(BASE + "/residential/", wait_until="load"); pg.wait_for_timeout(900)
        ctx.unroute("**/rest/v1/google_review_summary*"); ctx.unroute("**/rest/v1/google_reviews*")
        ctx.route("**/rest/v1/google_review_summary*", lambda r: r.abort()); ctx.route("**/rest/v1/google_reviews*", lambda r: r.abort())
        pg.goto(BASE + "/", wait_until="load"); pg.wait_for_timeout(900)
        check("last successfully loaded data keeps showing on the next page when Supabase then becomes unreachable (session cache)", pg.evaluate(STATE)["visible"], True)
        ctx.close()
        ctx, pg, calls, ghits = fresh(mode="403")
        pg.goto(BASE + "/residential/", wait_until="load"); pg.wait_for_timeout(700)
        n = len(calls)
        pg.goto(BASE + "/", wait_until="load"); pg.wait_for_timeout(700)
        check("an error answer is never cached: the next page asks Supabase again (so a fixed configuration shows up without a new session)", [len(calls) - n, pg.evaluate(STATE)["visible"]], [1, False])
        ctx.close()

        print("\n=== 5. FORMS + LEAD FLOW UNCHANGED WITH REVIEWS ON THE PAGE ===")
        for mode in ["live", "nosync"]:
            ctx, pg, calls, ghits = fresh(mode=mode, formspree=True)
            pg.add_init_script(RECORDER)
            pg.goto(BASE + "/residential/", wait_until="load"); pg.wait_for_timeout(900)
            check("{}: reviews visible on the form page".format(mode), pg.evaluate(STATE)["visible"], True)
            check("{}: Formspree action unchanged".format(mode), pg.eval_on_selector("#quote-form", "f => f.getAttribute('action')"), "https://formspree.io/f/maewnodj")
            leads, thanks, rec = submit_quote(pg)
            check("{}: Formspree 2xx -> exactly ONE generate_lead, then /thankyou/".format(mode), [leads, thanks], [1, True])
            check("{}: no PII and no review text in any dataLayer push".format(mode), [x for x in ["jane", "5165550147", "11570", "maria santos", "south-facing", "lowstar", "steven matt", "privacy film"] if x in repr(rec).lower()], [])
            ctx.close()

        print("\n=== 6. MOBILE (375px) ===")
        for mode in ["live", "nosync"]:
            ctx, pg, calls, ghits = fresh(mode=mode, width=375)
            for path in ["/residential/", "/", "/commercial/"]:
                pg.goto(BASE + path, wait_until="load"); pg.wait_for_timeout(900)
                m = pg.evaluate("""() => { const vw = innerWidth; const s = document.querySelector('section#google-reviews'); const cards = s ? [...s.querySelectorAll('.greview')] : [];
                    const r = e => e.getBoundingClientRect(); const fits = e => !e || e.hidden || (r(e).right <= vw + 1 && r(e).left >= -1);
                    const stacked = cards.length < 2 || cards.every((c, i) => i === 0 || r(c).top >= r(cards[i-1]).bottom - 1);
                    const taps = s && !s.hidden ? [...s.querySelectorAll('a[data-greviews=link], .greview__more')].filter(e => e.offsetParent !== null).map(e => r(e).height >= 44) : [];
                    const proof = document.querySelector('.gproof'); const pl = document.querySelector('[data-greviews=proof-link]'); const btn = s ? s.querySelector('a[data-greviews=link]') : null;
                    return { over: document.documentElement.scrollWidth > vw + 1, stacked, cardsFit: cards.every(fits), sectionFit: fits(s), proofFit: fits(proof), taps: taps.every(Boolean), form: fits(document.querySelector('#quote-form')),
                             proofShown: !!pl && pl.offsetParent !== null, proofHref: pl ? pl.getAttribute('href') : null, btnShown: !!btn && btn.offsetParent !== null, btnHref: btn ? btn.getAttribute('href') : null, btnFit: fits(btn) }; }""")
                check("375px {} {}: no horizontal overflow; cards stack and fit; proof line, section and form fit; tap targets >= 44px".format(mode, path),
                      [m["over"], m["stacked"], m["cardsFit"], m["sectionFit"], m["proofFit"], m["taps"], m["form"]], [False, True, True, True, True, True, True])
                want_proof = "#google-reviews" if mode == "live" else GURL
                check("375px {} {}: 'Read All Reviews' button shown, fits, opens the public listing{}".format(mode, path, "" if path == "/" else "; hero count shown and clickable"),
                      [m["btnShown"], m["btnFit"], m["btnHref"]] + ([] if path == "/" else [m["proofShown"], m["proofHref"]]), [True, True, GURL] + ([] if path == "/" else [True, want_proof]))
            ctx.close()

        print("\n=== 7. TIMING - summary first and early; cards after load; hero never waits ===")
        ctx, pg, calls, ghits = fresh(mode="live")
        # record the instant fetch() is CALLED (Resource Timing only lists a request once it completes)
        pg.add_init_script("""(() => { const f = window.fetch; window.__fetchLog = []; window.__dcl = false; document.addEventListener('DOMContentLoaded', () => { window.__dcl = true; });
            window.fetch = function (u) { window.__fetchLog.push({ u: String(u), ready: document.readyState, dclFired: window.__dcl }); return f.apply(this, arguments); }; })()""")
        pg.goto(BASE + "/residential/", wait_until="domcontentloaded")
        early = pg.evaluate("""() => { const log = window.__fetchLog || []; const s = log.filter(e => e.u.includes('/rest/v1/google_review_summary')); const l = log.filter(e => e.u.includes('/rest/v1/google_reviews?'));
            return { summaryCalled: s.length, summaryReadyState: s.length ? s[0].ready : null, summaryBeforeDCL: s.length ? !s[0].dclFired : null, reviewsCalled: l.length, h1: !!document.querySelector('h1'), form: !!document.querySelector('#quote-form') }; }""")
        check("the summary fetch is issued while the document is 'interactive' and BEFORE DOMContentLoaded has fired; the reviews fetch is NOT; hero and form exist",
              [early["summaryCalled"], early["summaryReadyState"], early["summaryBeforeDCL"], early["reviewsCalled"], early["h1"], early["form"]], [1, "interactive", True, 0, True, True])
        pg.wait_for_timeout(1500)
        late = pg.evaluate("""() => (window.__fetchLog || []).filter(e => e.u.includes('/rest/v1/google_reviews?')).map(e => e.ready)""")
        check("the review-cards fetch is issued only after the load event (readyState complete)", late, ["complete"])
        check("request order: summary first, then the review cards", [("google_review_summary" in calls[0]) if calls else None, ("google_reviews?" in calls[1]) if len(calls) > 1 else None, len(calls)], [True, True, 2])
        check("reviews.js is loaded with defer and is small", [pg.evaluate("() => [...document.scripts].some(s => s.src.endsWith('/js/reviews.js') && s.defer)"), os.path.getsize(os.path.join(ROOT, "js/reviews.js")) < 24000], [True, True])
        ctx.close()
        browser.close()

    print("\n" + "=" * 60)
    print("  {} passed / {} failed  (of {})".format(sum(results), len(results) - sum(results), len(results)))
    print("=" * 60)
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(run())
