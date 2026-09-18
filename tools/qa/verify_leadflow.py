"""Paid-ad lead flow verification.

Formspree is stubbed at the network layer so success AND failure can both
be exercised deterministically. Nothing here proves the live Formspree
account or the live Google Ads conversion works — see the report.
"""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8901"
EVENTS_JS = "() => (window.dataLayer||[]).filter(x => x && x.event).map(x => x.event)"
PARAMS_JS = """() => {
  const g = (window.dataLayer||[]).filter(x => x && x.event === 'generate_lead');
  return g.length ? g[g.length-1] : null; }"""


# Mirror every dataLayer push into sessionStorage so the events survive the
# redirect to /thankyou/. Aborting the navigation instead does NOT work:
# Chromium replaces the document with an error page and the dataLayer is
# gone before it can be read.
RECORDER = """
(() => {
  const rec = (o) => { try {
    const cur = JSON.parse(sessionStorage.getItem('__ev') || '[]');
    cur.push(JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'function' ? '[fn]' : v)));
    sessionStorage.setItem('__ev', JSON.stringify(cur));
  } catch (e) {} };
  const wrap = (arr) => {
    if (!arr || arr.__wrapped) return arr;
    const p = arr.push.bind(arr);
    arr.push = function (o) { rec(o); return p(o); };
    arr.__wrapped = true;
    return arr;
  };
  let real = wrap([]);
  Object.defineProperty(window, 'dataLayer', {
    configurable: true,
    get() { return real; },
    set(v) { real = wrap(v || []); }
  });
})();
"""

RECORDED_JS = "() => JSON.parse(sessionStorage.getItem('__ev') || '[]')"

results = []


def check(label, got, want):
    ok = got == want
    results.append(ok)
    print(("  PASS  " if ok else "  FAIL  ") + label)
    if not ok:
        print("          expected: {!r}".format(want))
        print("          actual:   {!r}".format(got))


def fill(pg, phone=True, email=True):
    pg.fill("#first-name", "Jane")
    if pg.query_selector("#last-name"): pg.fill("#last-name", "Testperson")
    if email: pg.fill("#email", "jane.testperson@example.com")
    if phone: pg.fill("#phone", "5165550147")
    pg.fill("#location", "Garden City")
    if pg.query_selector("#message"): pg.fill("#message", "Three south facing windows in the living room")
    if pg.query_selector("#property-type") and pg.eval_on_selector("#property-type", "el => el.value") == "":
        pg.select_option("#property-type", "Residential")


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        def fresh(formspree="ok", accept=True):
            ctx = browser.new_context()
            for pat in ["**://*.googletagmanager.com/**", "**://fonts.googleapis.com/**",
                        "**://fonts.gstatic.com/**", "**://cdn.jsdelivr.net/**",
                        "**://*.supabase.co/**"]:
                ctx.route(pat, lambda r: r.abort())
            if formspree == "ok":
                ctx.route("**://formspree.io/**", lambda r: r.fulfill(
                    status=200, content_type="application/json", body='{"ok":true}'))
            elif formspree == "fail":
                ctx.route("**://formspree.io/**", lambda r: r.fulfill(
                    status=422, content_type="application/json",
                    body='{"errors":[{"message":"rejected"}]}'))
            else:
                ctx.route("**://formspree.io/**", lambda r: r.abort())
            if accept:
                ctx.add_cookies([{"name": "pellikal_consent", "value": "v2%3Aa1%3Ad1%3A2026-09-14",
                                  "url": BASE}])
            return ctx, ctx.new_page()

        print("\n=== 1. THE FORM RENDERS ON ALL THREE PAGES ===")
        ctx, pg = fresh()
        for path, variant, service in [
            ("/contact/", "contact", ""),
            ("/residential/", "residential", "Residential Window Film"),
            ("/window-inserts/", "window_inserts", "Window Inserts / Noise Reduction"),
        ]:
            pg.goto(BASE + path, wait_until="domcontentloaded")
            pg.wait_for_timeout(400)
            check("{}: exactly one form".format(path),
                  pg.evaluate("() => document.querySelectorAll('form#quote-form').length"), 1)
            check("{}: data-form-location".format(path),
                  pg.eval_on_selector("#quote-form", "el => el.dataset.formLocation"), variant)
            check("{}: success url is relative and correct".format(path),
                  pg.eval_on_selector("#quote-form", "el => el.dataset.successUrl"), "../thankyou/")
            check("{}: service carried".format(path),
                  pg.eval_on_selector('[name="service"]', "el => el.value"), service)
        ctx.close()

        print("\n=== 2. EXISTING ?service= BEHAVIOUR PRESERVED ===")
        ctx, pg = fresh()
        pg.goto(BASE + "/contact/?service=window-inserts", wait_until="domcontentloaded")
        pg.wait_for_timeout(500)
        check("/contact/?service=window-inserts still selects Window Inserts",
              pg.eval_on_selector("#service", "el => el.value"), "Window Inserts / Noise Reduction")
        pg.goto(BASE + "/residential/?service=privacy", wait_until="domcontentloaded")
        pg.wait_for_timeout(500)
        check("short form: service is fixed by the page, ?service= does not change it",
              pg.eval_on_selector('[name="service"]', "el => el.value"), "Residential Window Film")
        ctx.close()

        print("\n=== 3. INVALID SUBMISSION DOES NOT REDIRECT ===")
        ctx, pg = fresh()
        pg.goto(BASE + "/residential/", wait_until="domcontentloaded")
        pg.wait_for_timeout(400)
        pg.click("#quote-form button[type=submit]")
        pg.wait_for_timeout(900)
        check("still on /residential/", "/residential/" in pg.url, True)
        check("no lead events fired", pg.evaluate(EVENTS_JS).count("generate_lead"), 0)
        ctx.close()

        print("\n=== 4. FORMSPREE FAILURE DOES NOT REDIRECT ===")
        for mode, label in [("fail", "HTTP 422 rejection"), ("network", "network failure")]:
            ctx, pg = fresh(formspree=mode)
            pg.goto(BASE + "/window-inserts/", wait_until="domcontentloaded")
            pg.wait_for_timeout(400)
            fill(pg)
            pg.click("#quote-form button[type=submit]")
            pg.wait_for_timeout(1800)
            check("{}: stayed on the page".format(label), "/window-inserts/" in pg.url, True)
            check("{}: error message shown".format(label),
                  pg.eval_on_selector('[data-msg="err"]', "el => getComputedStyle(el).display"), "block")
            check("{}: NO conversion event".format(label),
                  pg.evaluate(EVENTS_JS).count("generate_lead"), 0)
            check("{}: typed details preserved".format(label),
                  pg.eval_on_selector("#email", "el => el.value"), "jane.testperson@example.com")
            check("{}: submit button re-enabled".format(label),
                  pg.eval_on_selector("#quote-form button[type=submit]", "el => el.disabled"), False)
            ctx.close()

        print("\n=== 5. CONFIRMED SUCCESS -> /thankyou/ ===")
        for path, loc, svc, extra in [
            ("/residential/", "residential", "residential_film", False),
            ("/window-inserts/", "window_inserts", "window_inserts", True),
            ("/contact/", "contact", None, False),
        ]:
            ctx, pg = fresh()
            pg.goto(BASE + path, wait_until="domcontentloaded")
            pg.wait_for_timeout(400)
            fill(pg)
            if path == "/contact/":
                pg.select_option("#service", "Solar / Heat & Glare")
            captured = pg.evaluate("""() => { window.__ev = []; const d = window.dataLayer;
                const orig = d.push.bind(d);
                d.push = function(o){ try{ window.__ev.push(JSON.parse(JSON.stringify(o))); }catch(e){}
                                      return orig(o); }; return true; }""")
            pg.click("#quote-form button[type=submit]")
            pg.wait_for_url("**/thankyou/**", timeout=6000)
            check("{}: landed on /thankyou/".format(path), pg.url.endswith("/thankyou/"), True)
            ctx.close()

        print("\n=== 6. EVENTS AND PARAMETERS AT THE MOMENT OF SUCCESS ===")
        ctx, pg = fresh()
        pg.add_init_script(RECORDER)
        pg.goto(BASE + "/window-inserts/", wait_until="domcontentloaded")
        pg.wait_for_timeout(400)
        fill(pg)
        pg.click("#quote-form button[type=submit]")
        pg.wait_for_url("**/thankyou/**", timeout=6000)
        pg.wait_for_timeout(300)
        rec = pg.evaluate(RECORDED_JS)
        evs = [x.get("event") for x in rec if isinstance(x, dict) and x.get("event")]
        check("contact_form_submit fired", "contact_form_submit" in evs, True)
        check("generate_lead fired", "generate_lead" in evs, True)
        check("window_insert_lead fired", "window_insert_lead" in evs, True)
        check("generate_lead fired exactly once", evs.count("generate_lead"), 1)
        gl = [x for x in rec if isinstance(x, dict) and x.get("event") == "generate_lead"][0]
        check("lead_source preserved", gl.get("lead_source"), "contact_form")
        check("service slug", gl.get("service"), "window_inserts")
        check("page_type preserved", gl.get("page_type"), "window_insert_landing")
        check("NEW form_location parameter", gl.get("form_location"), "window_inserts")
        wl = [x for x in rec if isinstance(x, dict) and x.get("event") == "window_insert_lead"][0]
        check("eventCallback attached to the LAST event (holds the redirect)",
              wl.get("eventCallback"), "[fn]")
        check("landed on /thankyou/ after the events", pg.url.endswith("/thankyou/"), True)
        blob = repr(rec).lower()
        leaks = [x for x in ["jane", "testperson", "example.com", "5165550147",
                             "garden city", "south facing"] if x in blob]
        check("no PII in any recorded dataLayer push", leaks, [])
        ctx.close()

        print("\n=== 7. /thankyou/ ITSELF ===")
        ctx, pg = fresh()
        pg.goto(BASE + "/thankyou/", wait_until="domcontentloaded")
        pg.wait_for_timeout(500)
        check("loads directly", pg.evaluate("() => !!document.querySelector('h1')"), True)
        check("noindex, follow",
              pg.evaluate("""() => document.querySelector('meta[name=robots]').content"""),
              "noindex, follow")
        check("canonical exact",
              pg.evaluate("""() => document.querySelector('link[rel=canonical]').href"""),
              "https://www.pellikal.com/thankyou/")
        check("GTM bootstrap present exactly once",
              pg.evaluate("""() => (window.dataLayer||[]).filter(x => x && x['gtm.start']).length"""), 1)
        # gtag( DOES appear now -- it is the Consent Mode v2 API, which is not
        # a tag. What must not appear is a GA4 config, an Ads conversion, or a
        # second gtag.js loader, any of which would double-count the lead.
        check("no hard-coded GA4 config, Ads conversion or second gtag.js loader",
              pg.evaluate("""() => (document.documentElement.innerHTML
                    .match(/AW-\\d|G-J8SQ4|gtag\\(\\s*['\"](config|event)['\"]|gtag\\/js/g)) || []"""), [])
        check("consent state honoured (granted here)",
              pg.evaluate("""() => { const dl = window.dataLayer||[]; const st = {};
                for (const i of dl) if (i && i[0]==='consent') Object.assign(st, i[2]||{});
                return st.analytics_storage; }"""), "granted")
        check("no query string carried over", pg.evaluate("() => location.search"), "")
        ctx.close()

        print("\n=== 8. CONSENT CHOICE IS NOT BYPASSED BY CONVERTING ===")
        ctx, pg = fresh(accept=False)
        pg.goto(BASE + "/residential/", wait_until="domcontentloaded")
        pg.wait_for_timeout(400)
        pg.click('[data-consent-choice="reject"]')
        pg.wait_for_timeout(200)
        fill(pg)
        pg.click("#quote-form button[type=submit]")
        pg.wait_for_url("**/thankyou/**", timeout=6000)
        pg.wait_for_timeout(400)
        check("/thankyou/ still denied after a Reject-Non-Essential visitor converts",
              pg.evaluate("""() => { const dl = window.dataLayer||[]; const st = {};
                for (const i of dl) if (i && i[0]==='consent') Object.assign(st, i[2]||{});
                return [st.ad_storage, st.analytics_storage, st.ad_user_data, st.ad_personalization]; }"""),
              ["denied", "denied", "denied", "denied"])
        check("banner does not reappear on /thankyou/",
              pg.evaluate("() => !!document.querySelector('.consent')"), False)
        ctx.close()

        print("\n=== 8b. SHORT FORM RULES, FUNNEL EVENTS, DOUBLE SUBMIT ===")
        ctx, pg = fresh()
        pg.add_init_script(RECORDER)
        pg.goto(BASE + "/residential/", wait_until="domcontentloaded")
        pg.wait_for_timeout(400)
        check("short layout on residential", pg.eval_on_selector("#quote-form", "el => el.dataset.formLayout"), "short")
        check("no last name / property / service select / message on the short form",
              pg.evaluate("() => ['#last-name','#property-type','select#service','#message'].map(s => !!document.querySelector(s))"), [False]*4)
        pg.click('.page-hero__actions a[href="#quote"]'); pg.wait_for_timeout(600)
        evs = pg.evaluate(EVENTS_JS)
        check("quote_cta_click fired (hero)", "quote_cta_click" in evs, True)
        check("quote_form_view fired once the form scrolled in", evs.count("quote_form_view"), 1)
        pg.fill("#first-name", "Jane"); pg.wait_for_timeout(100)
        check("quote_form_start fired once", pg.evaluate(EVENTS_JS).count("quote_form_start"), 1)
        pg.fill("#location", "Garden City")
        check("still once after more typing", pg.evaluate(EVENTS_JS).count("quote_form_start"), 1)
        pg.click("#quote-form button[type=submit]"); pg.wait_for_timeout(600)
        check("name only (no phone, no email) is rejected: stays on page", "/residential/" in pg.url, True)
        check("error message shown, both fields aria-invalid",
              pg.evaluate("""() => [getComputedStyle(document.querySelector('[data-msg=err]')).display,
                     document.querySelector('#phone').getAttribute('aria-invalid'), document.querySelector('#email').getAttribute('aria-invalid')]"""),
              ["block", "true", "true"])
        check("quote_form_error(contact_required) fired, no generate_lead",
              pg.evaluate("""() => { const dl = window.dataLayer; return [dl.some(x => x && x.event === 'quote_form_error' && x.error_type === 'contact_required'), dl.some(x => x && x.event === 'generate_lead')]; }"""),
              [True, False])
        pg.fill("#phone", "5165550147")
        # double submit: two clicks before the (stubbed) provider answers
        pg.evaluate("() => { const b = document.querySelector('#quote-form button[type=submit]'); b.click(); b.click(); }")
        pg.wait_for_url("**/thankyou/**", timeout=6000); pg.wait_for_timeout(300)
        rec = pg.evaluate(RECORDED_JS)
        evs = [x.get("event") for x in rec if isinstance(x, dict) and x.get("event")]
        check("name + phone accepted -> /thankyou/", pg.url.endswith("/thankyou/"), True)
        check("double click -> exactly ONE generate_lead", evs.count("generate_lead"), 1)
        gl = [x for x in rec if isinstance(x, dict) and x.get("event") == "generate_lead"][0]
        check("residential slug + form_location from hidden fields", [gl.get("service"), gl.get("form_location"), gl.get("lead_source")], ["residential_film", "residential", "contact_form"])
        blob = repr(rec).lower()
        check("no PII in any push (incl. funnel events)", [x for x in ["jane", "5165550147", "garden city"] if x in blob], [])
        ctx.close()

        ctx, pg = fresh()
        pg.goto(BASE + "/residential/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        fill(pg, phone=False, email=True)
        pg.click("#quote-form button[type=submit]")
        pg.wait_for_url("**/thankyou/**", timeout=6000)
        check("name + email (no phone) accepted", pg.url.endswith("/thankyou/"), True)
        ctx.close()

        print("\n=== 8b-ii. PHONE RULE + CLICK-ID FORWARDING ===")
        for phone, email, expect, label in [
            ("(516) 336-9586", "", True,  "formatted phone, no email -> accepted"),
            ("+1 516 336 9586", "", True,  "+1 spaced phone -> accepted"),
            ("abcdefg", "", False, "alphabetic 'phone', no email -> rejected"),
            ("516-33", "", False, "6-digit fragment, no email -> rejected"),
            ("abcdefg", "jane@example.com", True, "bad phone but valid email -> accepted"),
            ("", "not-an-email", False, "no phone, malformed email -> rejected"),
        ]:
            ctx, pg = fresh()
            pg.goto(BASE + "/residential/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
            pg.fill("#first-name", "Jane")
            if phone: pg.fill("#phone", phone)
            if email: pg.fill("#email", email)
            pg.click("#quote-form button[type=submit]")
            if expect:
                pg.wait_for_url("**/thankyou/**", timeout=6000)
                check(label, pg.url.endswith("/thankyou/"), True)
            else:
                pg.wait_for_timeout(700)
                check(label, ["/residential/" in pg.url, pg.evaluate("() => (window.dataLayer||[]).some(x => x && x.event === 'generate_lead')")], [True, False])
            ctx.close()
        ctx, pg = fresh()
        pg.goto(BASE + "/residential/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        pg.fill("#first-name", "Jane"); pg.fill("#phone", "abcdefg"); pg.click("#quote-form button[type=submit]"); pg.wait_for_timeout(400)
        check("invalid phone reports error_type=phone_invalid and submitted value is untouched",
              [pg.evaluate("() => (window.dataLayer||[]).some(x => x && x.event === 'quote_form_error' && x.error_type === 'phone_invalid')"),
               pg.eval_on_selector("#phone", "el => el.value")], [True, "abcdefg"])
        ctx.close()
        ctx, pg = fresh()
        pg.goto(BASE + "/residential/?gclid=TeSt.Click-123&utm_source=google&x=1", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        fill(pg); pg.click("#quote-form button[type=submit]")
        pg.wait_for_url("**/thankyou/**", timeout=6000)
        check("gclid (and only the click IDs) forwarded to /thankyou/", pg.url.split("/thankyou/")[1], "?gclid=TeSt.Click-123")
        check("no submitted PII in the thank-you URL or page", [x for x in ["jane", "5165550147", "example.com"] if x in (pg.url + pg.content()).lower()], [])
        ctx.close()

        print("\n=== 8c. HOMEPAGE + COMMERCIAL VARIANTS ===")
        ctx, pg = fresh()
        pg.add_init_script(RECORDER)
        pg.goto(BASE + "/", wait_until="domcontentloaded"); pg.wait_for_timeout(400)
        check("homepage has the short form", pg.evaluate("() => document.querySelectorAll('form#quote-form[data-form-layout=short]').length"), 1)
        check("empty-reviews placeholder is NOT visible", pg.evaluate("() => { const s = document.querySelector('#reviews'); return !s || s.hidden || getComputedStyle(s).display === 'none'; }"), True)
        check("hero CTA reads Get a Free Quote -> #quote", pg.evaluate("() => { const a = document.querySelector('.hero__actions a[data-quote-cta]'); return a && a.textContent.trim() + ' ' + a.getAttribute('href'); }"), "Get a Free Quote #quote")
        fill(pg); pg.click("#quote-form button[type=submit]")
        pg.wait_for_url("**/thankyou/**", timeout=6000); pg.wait_for_timeout(300)
        rec = pg.evaluate(RECORDED_JS); evs = [x.get("event") for x in rec if isinstance(x, dict) and x.get("event")]
        check("homepage form fires homepage_form_submit (not contact_form_submit)", ["homepage_form_submit" in evs, "contact_form_submit" in evs], [True, False])
        gl = [x for x in rec if isinstance(x, dict) and x.get("event") == "generate_lead"][0]
        check("lead_source=homepage_form, form_location=homepage", [gl.get("lead_source"), gl.get("form_location")], ["homepage_form", "homepage"])
        ctx.close()
        ctx, pg = fresh()
        pg.add_init_script(RECORDER)
        pg.goto(BASE + "/commercial/", wait_until="domcontentloaded"); pg.wait_for_timeout(400)
        fill(pg); pg.click("#quote-form button[type=submit]")
        pg.wait_for_url("**/thankyou/**", timeout=6000); pg.wait_for_timeout(300)
        rec = pg.evaluate(RECORDED_JS); gl = [x for x in rec if isinstance(x, dict) and x.get("event") == "generate_lead"][0]
        check("commercial lead identified as commercial", [gl.get("form_location"), gl.get("service")], ["commercial", "commercial_film"])
        ctx.close()

        print("\n=== 9. RESPONSIVE — NO HORIZONTAL OVERFLOW ===")
        for w in [375, 430, 768, 1440]:
            ctx = browser.new_context(viewport={"width": w, "height": 900},
                                      is_mobile=w <= 430, has_touch=w <= 768)
            for pat in ["**://*.googletagmanager.com/**", "**://fonts.googleapis.com/**",
                        "**://fonts.gstatic.com/**", "**://cdn.jsdelivr.net/**",
                        "**://*.supabase.co/**"]:
                ctx.route(pat, lambda r: r.abort())
            pg = ctx.new_page()
            for path in ["/", "/residential/", "/window-inserts/", "/commercial/", "/contact/", "/thankyou/"]:
                pg.goto(BASE + path, wait_until="domcontentloaded")
                pg.wait_for_timeout(350)
                over = pg.evaluate("""() => document.documentElement.scrollWidth
                                       > document.documentElement.clientWidth + 1""")
                check("{}px {}: no horizontal overflow".format(w, path), over, False)
                if w <= 768:
                    bar = pg.evaluate("""() => { const b = document.querySelector('.mobile-bar'); if (!b || getComputedStyle(b).display === 'none') return 'hidden';
                        const a = [...b.querySelectorAll('a')]; return a.length + ':' + a.every(x => x.getBoundingClientRect().height >= 44) + ':' + (a[2] ? a[2].getAttribute('href') : ''); }""")
                    check("{}px {}: mobile bar 3 targets >=44px".format(w, path), bar.startswith("3:true:"), True)
            ctx.close()

        browser.close()

    print("\n" + "=" * 60)
    print("  {} passed / {} failed  (of {})".format(
        sum(results), len(results) - sum(results), len(results)))
    print("=" * 60)
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(run())
