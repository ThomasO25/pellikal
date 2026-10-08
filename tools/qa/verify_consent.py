"""Consent Mode v2 (granular, REGIONAL defaults) verification against a real browser.

What this suite can and cannot prove
------------------------------------
It proves which consent commands every generated page EMITS, in what order,
and what those commands resolve to for a visitor Google would place in a
listed region (e.g. ES) versus anywhere else (e.g. US) - by applying Google's
documented rules locally: a region-specific default applies to the regions
it lists, a default without `region` applies to everyone else, updates apply
in order. It does NOT exercise Google's geographic resolution: nothing in a
local browser can. Regional behaviour must also be checked by a person with
Tag Assistant (docs/CONVERSION-DEBUG.md -> "Manual regional verification").
"""
import json, os, re
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:8901"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ALL = ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"]
# Resolve the emitted commands for a hypothetical region code (default 'US' =
# a New York visitor). Region-specific default wins for a listed region (most
# specific), the region-less default covers everyone else; updates apply after.
STATE = """(region) => { const dl = window.dataLayer||[]; let general = {}, regional = null; const ups = [];
  for (const i of dl) { if (!i || i[0] !== 'consent') continue; const p = Object.assign({}, i[2]||{});
    if (i[1] === 'default') { const r = p.region; delete p.region;
      if (Array.isArray(r)) { if (r.includes(region)) regional = Object.assign(regional||{}, p); }
      else Object.assign(general, p); }
    else if (i[1] === 'update') ups.push(p); }
  const st = Object.assign({}, general, regional||{}); for (const u of ups) Object.assign(st, u); return st; }"""
ORDER = """() => { const o=[]; (window.dataLayer||[]).forEach((i,n)=>{ if(!i) return;
  if (i[0]==='consent') o.push('consent-'+i[1]); else if (i[0]==='config') o.push('config-'+i[1]); else if (i[0]==='js') o.push('js');
  else if (i['gtm.start']) o.push('GTM'); }); return o; }"""
DEFAULTS = """() => (window.dataLayer||[]).filter(i => i && i[0]==='consent' && i[1]==='default').map(i => Object.assign({}, i[2]||{}))"""
UPDATES_BEFORE_GTM = """() => { const dl = window.dataLayer||[]; const g = dl.findIndex(i => i && i['gtm.start']);
  return dl.slice(0, g < 0 ? dl.length : g).filter(i => i && i[0]==='consent' && i[1]==='update').map(i => Object.assign({}, i[2]||{})); }"""
results = []
def check(label, got, want):
    ok = got == want; results.append(ok)
    print(("  PASS  " if ok else "  FAIL  ") + label)
    if not ok: print("          expected:", repr(want)); print("          actual:  ", repr(got))
def st(pg, region="US"): x = pg.evaluate(STATE, region); return {k: x.get(k) for k in ALL}
def banner(pg): return pg.evaluate("() => !!document.querySelector('.consent')")
def dialog(pg): return pg.evaluate("() => !!document.querySelector('.consent-dialog')")
def cookie(pg): return pg.evaluate("() => decodeURIComponent((document.cookie.match(/pellikal_consent=([^;]*)/)||[,''])[1])")
DENIED = {k: "denied" for k in ALL}; GRANTED = {k: "granted" for k in ALL}
ANALYTICS_ONLY = {"ad_storage":"denied","analytics_storage":"granted","ad_user_data":"denied","ad_personalization":"denied"}
ADS_ONLY = {"ad_storage":"granted","analytics_storage":"denied","ad_user_data":"granted","ad_personalization":"granted"}

def run():
    with sync_playwright() as p:
        b = p.chromium.launch()
        def fresh(**kw):
            ctx = b.new_context(**kw)
            for pat in ["**://*.googletagmanager.com/**","**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://*.supabase.co/**"]:
                ctx.route(pat, lambda r: r.abort())
            return ctx, ctx.new_page()

        print("\n=== 0. GENERATED SOURCE - every tracked page emits the right commands in the right order ===")
        cfg = json.load(open(os.path.join(ROOT, "site.config.json")))
        WANT_REGIONS = [c.upper() for c in cfg["analytics"]["consent"]["regionalDefaults"]["deniedRegions"]]
        EEA = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IS","IE","IT","LV","LI","LT","LU",
               "MT","NL","NO","PL","PT","RO","SK","SI","ES","SE"]
        check("config region list is exactly EEA (27 EU + IS/LI/NO) + GB + CH, 32 codes", WANT_REGIONS, EEA + ["GB", "CH"])
        check("config: elsewhere = granted", cfg["analytics"]["consent"]["regionalDefaults"]["elsewhere"], "granted")
        tracked = [pg_["file"] for pg_ in cfg["pages"] if pg_.get("partials", True)] + ["404.html"]
        GA4 = cfg["analytics"]["ga4MeasurementId"]; DIRECT = bool(cfg["analytics"].get("ga4DirectTag"))
        check("config: ga4MeasurementId is G-J8SQ4CC7BT", GA4, "G-J8SQ4CC7BT")
        print("        (ga4DirectTag = {} - the GA4 checks below assert {})".format(DIRECT, "exactly one direct tag, correctly placed" if DIRECT else "NO direct tag (rollback mode)"))
        untracked = [pg_["file"] for pg_ in cfg["pages"] if not pg_.get("partials", True)]
        CMD = re.compile(r"gtag\('consent','default',\{(.*?)\}\);", re.S)
        for f in tracked:
            html = open(os.path.join(ROOT, f), encoding="utf-8").read()
            head = html.split("</head>")[0]
            blk_start = head.find("Google Consent Mode v2 defaults - GENERATED")
            gtm_at = head.find("<!-- Google Tag Manager -->")
            check("{}: consent block present in <head>, GTM snippet after it".format(f), blk_start > -1 and gtm_at > blk_start and head.find("googletagmanager.com/gtm.js") > gtm_at, True)
            if blk_start < 0 or gtm_at < 0: continue
            blk = head[blk_start:gtm_at]
            cmds = CMD.findall(blk)
            i_dl, i_gt, i_first = blk.find("w.dataLayer=w.dataLayer||[]"), blk.find("function gtag("), blk.find("gtag('consent','default'")
            check("{}: dataLayer created, then gtag() defined, then the consent commands".format(f), 0 <= i_dl < i_gt < i_first, True)
            check("{}: exactly two default commands, regional (denied) FIRST, general (granted) second".format(f),
                  [len(cmds), "'region':" in cmds[0] if cmds else None, "'region'" not in cmds[1] if len(cmds) > 1 else None], [2, True, True])
            if len(cmds) != 2: continue
            regional, general = cmds
            four = lambda c, v: all(("'{}':'{}'".format(k, v)) in c for k in ALL)
            check("{}: regional default has all four v2 keys = denied (+functionality/security granted)".format(f),
                  [four(regional, "denied"), "'functionality_storage':'granted'" in regional, "'security_storage':'granted'" in regional], [True, True, True])
            check("{}: general default has all four v2 keys = granted and NO region property".format(f),
                  [four(general, "granted"), "region" not in general], [True, True])
            m = re.search(r"'region':\[(.*?)\]", regional, re.S)
            got = re.findall(r"'([A-Z]{2}(?:-[A-Z0-9]{1,3})?)'", m.group(1)) if m else None
            check("{}: region array is exactly the intended EEA + GB + CH list".format(f), got, WANT_REGIONS)
            check("{}: property spelled 'region' (singular), never 'regions', inside the commands".format(f),
                  ["'region':" in regional, "regions" not in regional, "regions" not in general], [True, True, True])
            i_gen_end = blk.find("gtag('consent','default'", i_first + 1)
            check("{}: both defaults, ads_data_redaction and the stored-choice restore all sit before the GTM loader".format(f),
                  [i_first < i_gen_end < blk.find("ads_data_redaction") < blk.find("gtag('consent','update'"), "gtm.start" not in blk], [True, True])
            check("{}: the stored-choice restore is unconditional (a saved Reject is re-applied too)".format(f),
                  "if(a||ad){gtag('consent','update'" not in blk and "gtag('consent','update',{" in blk, True)
            # ---- GA4 base tag as the page's own Google tag (7 Oct 2026) ----
            loader = 'src="https://www.googletagmanager.com/gtag/js?id=' + GA4 + '"'
            cfgcmd = "gtag('config','" + GA4 + "')"
            if DIRECT:
                i_end_consent, i_loader, i_cfg, i_gtm = head.find("End Google Consent Mode v2 defaults"), head.find(loader), head.find(cfgcmd), gtm_at
                check("{}: direct GA4 tag sits AFTER the consent block (defaults + restore) and BEFORE the GTM snippet".format(f),
                      0 < i_end_consent < i_loader < i_cfg < i_gtm, True)
                check("{}: exactly ONE gtag.js loader, ONE gtag('config') for G-J8SQ4CC7BT, ONE GTM-MK2PHWB; no gtag('event'); no AW- in code".format(f),
                      [html.count("gtag/js?id="), html.count(loader), html.count("gtag('config'"), html.count(cfgcmd), html.count("GTM-MK2PHWB"), html.count("gtag('event'"),
                       len(re.findall(r"AW-\d", re.sub(r"<p[^>]*>.*?</p>|<li[^>]*>.*?</li>", "", html, flags=re.S)))],
                      [1, 1, 1, 1, 1, 0, 0])
                check("{}: GA4 config is guarded on the consent block having run, and reuses the page's gtag() (no second dataLayer/gtag definition)".format(f),
                      ["if(window.PELLIKAL_CONSENT_SETTINGS&&typeof window.gtag==='function'){" in head[i_loader:i_gtm],
                       head[i_loader:i_gtm].count("function gtag"), head[i_loader:i_gtm].count("window.dataLayer = window.dataLayer")], [True, 0, 0])
            else:
                check("{}: ga4DirectTag is false - no gtag.js loader / config on the page".format(f), [html.count("gtag/js?id="), html.count("gtag('config'")], [0, 0])
        for f in untracked:
            html = open(os.path.join(ROOT, f), encoding="utf-8").read()
            check("{}: NOT tracked - no consent commands, no GTM, no GA4 tag".format(f), ["gtag('consent'" in html, "googletagmanager.com" in html, "gtag/js" in html, "G-J8SQ4" in html], [False, False, False, False])

        print("\n=== 1. FIRST VISIT (no stored choice) ===")
        ctx, pg = fresh(); pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(400)
        check("resolved for a visitor Google places in ES / GB / CH: all four DENIED",
              [st(pg, "ES"), st(pg, "GB"), st(pg, "CH")], [DENIED, DENIED, DENIED])
        check("resolved for a New York visitor (US) and anywhere unlisted (e.g. CA, AU): all four GRANTED",
              [st(pg, "US"), st(pg, "CA"), st(pg, "AU")], [GRANTED, GRANTED, GRANTED])
        d = pg.evaluate(DEFAULTS)
        check("runtime dataLayer: two defaults, the regional one first (has region[]), the general one second (no region)",
              [len(d), isinstance(d[0].get("region"), list) if d else None, "region" in d[1] if len(d) > 1 else None], [2, True, False])
        check("no consent update pushed before the visitor chooses (only the defaults)", pg.evaluate(ORDER).count("consent-update"), 0)
        check("runtime order: default, default, [js, config(G-J8SQ4CC7BT)], GTM - the GA4 config is queued after the consent defaults and before gtm.start",
              pg.evaluate(ORDER), ["consent-default", "consent-default"] + (["js", "config-G-J8SQ4CC7BT"] if DIRECT else []) + ["GTM"])
        check("banner copy says plainly that outside the listed regions tracking is on until you choose",
              pg.evaluate("() => document.querySelector('.consent__text').textContent"), 
              "We use optional analytics and advertising technologies to understand site usage and measure our advertising. Outside the EEA, the UK and Switzerland they are on by default until you choose otherwise. You can accept optional tracking, reject it, or choose by category.")
        check("banner shown with three choices", pg.evaluate("() => [...document.querySelectorAll('.consent [data-consent-choice]')].map(b=>b.dataset.consentChoice)"), ["all","reject","manage"])
        o = pg.evaluate(ORDER); check("both consent defaults before GTM bootstrap", [o[:2], o.index("GTM")], [["consent-default", "consent-default"], 4 if DIRECT else 2])
        g = pg.evaluate("""() => [...document.querySelectorAll('.consent [data-consent-choice]')].map(b=>{const r=b.getBoundingClientRect(),c=getComputedStyle(b);return [Math.round(r.height),c.fontSize,c.fontWeight,c.paddingTop];})""")
        check("Accept and Reject identical height/size/weight/padding", g[0]==g[1], True)
        check("Manage same height as Accept", g[2][0]==g[0][0], True)
        check("no GTM noscript iframe in the document", pg.evaluate("() => !!document.querySelector('noscript iframe, iframe[src*=\"ns.html\"]')"), False)
        check("referrer policy meta present", pg.evaluate("() => document.querySelector('meta[name=referrer]')?.content"), "strict-origin-when-cross-origin")
        check("vendored Supabase build loaded (no CDN)", pg.evaluate("() => typeof window.supabase?.createClient === 'function' && ![...document.scripts].some(s=>s.src.includes('jsdelivr'))"), True)
        ctx.close()

        print("\n=== 2. ACCEPT ALL / REJECT ===")
        ctx, pg = fresh(); pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        pg.click('[data-consent-choice="all"]'); pg.wait_for_timeout(200)
        check("accept -> all granted", st(pg), GRANTED); check("cookie v2:a1:d1", cookie(pg).startswith("v2:a1:d1:"), True)
        pg.goto(BASE+"/contact/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        check("no banner on page 2", banner(pg), False); check("granted restored on page 2", st(pg), GRANTED)
        o = pg.evaluate(ORDER); check("restored update lands BEFORE GTM bootstrap", o.index("consent-update") < o.index("GTM"), True)
        if DIRECT:
            check("...and BEFORE the GA4 config, so the direct tag replays the saved choice first", o.index("consent-update") < o.index("config-G-J8SQ4CC7BT"), True)
        ctx.close()
        ctx, pg = fresh(); pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        pg.click('[data-consent-choice="reject"]'); pg.wait_for_timeout(200)
        check("reject -> all denied", st(pg), DENIED); check("cookie v2:a0:d0", cookie(pg).startswith("v2:a0:d0:"), True)
        check("banner dismissed", banner(pg), False)
        pg.goto(BASE+"/faq/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        check("no banner on page 2 after reject", banner(pg), False); check("still denied - for a US visitor whose default would be granted", st(pg, "US"), DENIED)
        o = pg.evaluate(ORDER); check("restored REJECT update lands BEFORE GTM bootstrap (no granted window)", o.index("consent-update") < o.index("GTM"), True)
        if DIRECT:
            check("...and BEFORE the GA4 config: saved Reject is queued ahead of gtag('config')", o.index("consent-update") < o.index("config-G-J8SQ4CC7BT"), True)
        check("...and that pre-GTM update is all four denied", pg.evaluate(UPDATES_BEFORE_GTM), [DENIED])
        ctx.close()

        print("\n=== 2b. SAVED CHOICES RESTORED BEFORE GTM ON EVERY TRACKED PAGE (cookie set before load) ===")
        pages = ["/", "/residential/", "/commercial/", "/window-inserts/", "/contact/", "/about/", "/faq/", "/solutions/", "/privacy/", "/terms/", "/accessibility/", "/thankyou/", "/404.html"]
        for raw, want, label in [("v2%3Aa0%3Ad0%3A2026-09-20", DENIED, "saved Reject"), ("v2%3Aa1%3Ad1%3A2026-09-20", GRANTED, "saved Accept"),
                                 ("v2%3Aa1%3Ad0%3A2026-09-20", ANALYTICS_ONLY, "saved Analytics-only")]:
            ctx, pg = fresh(); ctx.add_cookies([{"name":"pellikal_consent","value":raw,"url":BASE}])
            bad = []
            for path in pages:
                pg.goto(BASE+path, wait_until="domcontentloaded"); pg.wait_for_timeout(150)
                o = pg.evaluate(ORDER); ups = pg.evaluate(UPDATES_BEFORE_GTM)
                ok = ("consent-update" in o and "GTM" in o and o.index("consent-update") < o.index("GTM")
                      and (not DIRECT or ("config-G-J8SQ4CC7BT" in o and o.index("consent-update") < o.index("config-G-J8SQ4CC7BT") < o.index("GTM")
                                          and o.count("config-G-J8SQ4CC7BT") == 1))
                      and ups == [want] and st(pg, "US") == want and st(pg, "ES") == want and not banner(pg))
                if not ok: bad.append((path, o, ups, st(pg, "US"), st(pg, "ES"), banner(pg)))
            check("{}: restored as an update BEFORE the GA4 config and BEFORE gtm.start on all {} tracked pages (one config each); resolves the same for US and ES; no banner".format(label, len(pages)), bad, [])
            ctx.close()

        print("\n=== 3. MANAGE PREFERENCES DIALOG (a11y) ===")
        ctx, pg = fresh(); pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        pg.click('[data-consent-choice="manage"]'); pg.wait_for_timeout(250)
        d = pg.evaluate("""() => { const d=document.querySelector('.consent-dialog'); return d && {role:d.getAttribute('role'), modal:d.getAttribute('aria-modal'), lab:d.getAttribute('aria-labelledby'), focus:document.activeElement.id}; }""")
        check("role=dialog, aria-modal, labelled, focus moved to title", d, {"role":"dialog","modal":"true","lab":"consent-dialog-title","focus":"consent-dialog-title"})
        check("no optional switch pre-selected (even though the US default is granted)", pg.evaluate("() => [...document.querySelectorAll('[data-consent-cat]')].map(i=>i.checked)"), [False, False])
        check("dialog intro tells a first-time visitor the regional default applies until they save",
              pg.evaluate("() => document.getElementById('consent-dialog-intro').textContent"),
              "Choose which optional technologies may run. Necessary functions always run. You have not saved a choice yet, so our default applies: optional tracking is off for visitors in the EEA, the UK and Switzerland and on everywhere else. Nothing below is pre-selected. Changes take effect when you save.")
        check("necessary is on and disabled", pg.evaluate("() => { const n=document.getElementById('consent-necessary'); return [n.checked, n.disabled]; }"), [True, True])
        pg.keyboard.press("Shift+Tab"); pg.wait_for_timeout(50)
        inside = pg.evaluate("() => !!document.activeElement.closest('.consent-dialog')")
        check("Shift+Tab from the start stays inside the dialog (focus contained)", inside, True)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        check("Escape closes without a choice", [dialog(pg), cookie(pg)], [False, ""])
        check("focus returned to the Manage button", pg.evaluate("() => document.activeElement.dataset.consentChoice"), "manage")
        check("banner still there (no decision made)", banner(pg), True)

        print("\n=== 4. ANALYTICS ONLY ===")
        pg.click('[data-consent-choice="manage"]'); pg.wait_for_timeout(200)
        pg.click('label[for="consent-analytics"]'); pg.wait_for_timeout(50)
        check("analytics switch toggled by its label (44px target)", pg.evaluate("() => document.getElementById('consent-analytics').checked"), True)
        pg.click('[data-consent-choice="save"]'); pg.wait_for_timeout(200)
        check("analytics granted, all three ad categories denied", st(pg), ANALYTICS_ONLY)
        check("cookie v2:a1:d0", cookie(pg).startswith("v2:a1:d0:"), True)
        ev = pg.evaluate("() => (window.dataLayer||[]).filter(x=>x&&x.event==='consent_update').pop()")
        check("consent_update event carries per-category state", [ev.get("consent_choice"), ev.get("consent_analytics"), ev.get("consent_advertising")], ["custom","granted","denied"])
        pg.goto(BASE+"/residential/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        check("analytics-only restored on page 2", st(pg), ANALYTICS_ONLY)
        check("redaction still ON because advertising is denied", pg.evaluate("() => { let v=null; for (const i of window.dataLayer) if (i&&i[0]==='set'&&i[1]==='ads_data_redaction') v=i[2]; return v; }"), True)

        print("\n=== 5. ADVERTISING ONLY, via footer reopen ===")
        pg.evaluate("() => document.querySelector('.footer [data-consent-open]').click()"); pg.wait_for_timeout(250)
        check("reopened dialog reflects current choice (analytics on, ads off)", pg.evaluate("() => [document.getElementById('consent-analytics').checked, document.getElementById('consent-advertising').checked]"), [True, False])
        pg.click('label[for="consent-analytics"]'); pg.click('label[for="consent-advertising"]'); pg.click('[data-consent-choice="save"]'); pg.wait_for_timeout(200)
        check("advertising granted x3, analytics denied", st(pg), ADS_ONLY)
        check("redaction OFF once advertising is granted", pg.evaluate("() => { let v=null; for (const i of window.dataLayer) if (i&&i[0]==='set'&&i[1]==='ads_data_redaction') v=i[2]; return v; }"), False)
        pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        check("persists across reload", st(pg), ADS_ONLY)
        ctx.close()

        print("\n=== 6. VERSION BUMP RE-ASKS v1 VISITORS ===")
        ctx, pg = fresh(); ctx.add_cookies([{"name":"pellikal_consent","value":"v1%3Aall%3A2026-09-12","url":BASE}])
        pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(400)
        check("old v1 'all' cookie is NOT honoured: no update, so the defaults stand (ES denied, US granted)", [pg.evaluate(ORDER).count("consent-update"), st(pg, "ES"), st(pg, "US")], [0, DENIED, GRANTED])
        check("banner shown again", banner(pg), True)
        ctx.close()

        print("\n=== 7. RESET, FALLBACKS, PII, ADMIN ===")
        ctx, pg = fresh(); pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        pg.click('[data-consent-choice="all"]'); pg.wait_for_timeout(150)
        pg.evaluate("() => window.PELLIKAL_CONSENT.reset()"); pg.wait_for_timeout(200)
        check("reset() pushes an explicit update to denied, clears the store, re-shows the banner", [st(pg, "US"), cookie(pg), banner(pg)], [DENIED, "", True])
        pg.goto(BASE+"/?consent=reset", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        check("?consent=reset strips itself from the URL", pg.evaluate("() => location.search"), "")
        ctx.close()
        ctx, pg = fresh(); pg.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})")
        pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(300); pg.click('[data-consent-choice="all"]')
        pg.goto(BASE+"/faq/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        check("localStorage blocked -> cookie alone remembers", [banner(pg), st(pg)], [False, GRANTED]); ctx.close()
        ctx, pg = fresh(); pg.goto(BASE+"/contact/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        pg.click('[data-consent-choice="all"]'); pg.fill("#name","Jane Testperson"); pg.fill("#email","jane.testperson@example.com"); pg.fill("#phone","5165550147"); pg.fill("#zip","11570")
        blob = pg.evaluate("() => JSON.stringify({d:window.dataLayer,c:document.cookie,l:JSON.stringify(localStorage)}).toLowerCase()")
        check("no PII in dataLayer/cookie/localStorage", [x for x in ["jane","testperson","example.com","5165550147","11570"] if x in blob], []); ctx.close()
        ctx, pg = fresh(); pg.goto(BASE+"/admin/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        check("/admin/ carries no banner and no consent settings", [banner(pg), pg.evaluate("() => !!window.PELLIKAL_CONSENT_SETTINGS")], [False, False]); ctx.close()

        print("\n=== 8. FORMS + generate_lead UNCHANGED UNDER THE REGIONAL DEFAULTS (saved Reject, Formspree stubbed 200) ===")
        ctx, pg = fresh(); ctx.add_cookies([{"name":"pellikal_consent","value":"v2%3Aa0%3Ad0%3A2026-09-20","url":BASE}])
        ctx.route("**://formspree.io/**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"ok":true}'))
        pg.add_init_script("""(() => { const rec = o => { try { const c = JSON.parse(sessionStorage.getItem('__ev')||'[]'); c.push(JSON.parse(JSON.stringify(o, (k,v) => typeof v === 'function' ? '[fn]' : v))); sessionStorage.setItem('__ev', JSON.stringify(c)); } catch (e) {} };
          const wrap = a => { if (!a || a.__w) return a; const p = a.push.bind(a); a.push = function (o) { rec(o); return p(o); }; a.__w = true; return a; };
          let real = wrap([]); Object.defineProperty(window, 'dataLayer', { configurable: true, get() { return real; }, set(v) { real = wrap(v||[]); } }); })()""")
        for path in ["/", "/residential/", "/commercial/", "/window-inserts/", "/contact/"]:
            pg.goto(BASE+path, wait_until="domcontentloaded"); pg.wait_for_timeout(200)
            check("{}: form unchanged - exactly name, phone, email, zip; same Formspree action; no banner (choice saved)".format(path),
                  pg.evaluate("""() => { const f = document.querySelector('#quote-form'); return [[...f.querySelectorAll('input:not([type=hidden])')].filter(e => !e.closest('.hp')).map(e => e.name), f.getAttribute('action')]; }""") + [banner(pg)],
                  [["name", "phone", "email", "zip"], "https://formspree.io/f/maewnodj", False])
        pg.goto(BASE+"/residential/", wait_until="domcontentloaded"); pg.wait_for_timeout(200)
        pg.fill("#name", "Jane Testperson"); pg.fill("#phone", "5165550147"); pg.fill("#zip", "11570")
        pg.click("#quote-form button[type=submit]"); pg.wait_for_url("**/thankyou/**", timeout=6000); pg.wait_for_timeout(300)
        rec = pg.evaluate("() => JSON.parse(sessionStorage.getItem('__ev')||'[]')")
        evs = [x.get("event") for x in rec if isinstance(x, dict) and x.get("event")]
        check("Formspree 2xx -> exactly ONE generate_lead, contact_form_submit before it, then /thankyou/", [evs.count("generate_lead"), "contact_form_submit" in evs, pg.url.endswith("/thankyou/")], [1, True, True])
        check("/thankyou/ after converting with a saved Reject: still all four denied (US resolution), update before GTM, one GA4 page-view config, no Ads conversion / gtag('event') on the page",
              [st(pg, "US"), pg.evaluate(ORDER).index("consent-update") < pg.evaluate(ORDER).index("GTM"),
               pg.evaluate("() => (document.documentElement.innerHTML.match(/AW-\\d|gtag\\(\\s*['\"]event['\"]/g)||[])"),
               pg.evaluate("() => (document.documentElement.innerHTML.match(/gtag\\(\\s*['\"]config['\"]/g)||[]).length")], [DENIED, True, [], 1 if DIRECT else 0])
        check("no PII in any dataLayer push during the conversion", [x for x in ["jane", "testperson", "5165550147", "11570"] if x in repr(rec).lower()], [])
        ctx.close()
        b.close()
    print("\n" + "="*58 + "\n  {} passed / {} failed  (of {})\n".format(sum(results), len(results)-sum(results), len(results)) + "="*58)
    return 0 if all(results) else 1
if __name__ == "__main__": raise SystemExit(run())
