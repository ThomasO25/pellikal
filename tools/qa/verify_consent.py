"""Consent Mode v2 (granular) verification against a real browser."""
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:8901"
ALL = ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"]
STATE = """() => { const st={}; for (const i of (window.dataLayer||[]))
  if (i && i[0]==='consent' && (i[1]==='default'||i[1]==='update')) Object.assign(st, i[2]||{}); return st; }"""
ORDER = """() => { const o=[]; (window.dataLayer||[]).forEach((i,n)=>{ if(!i) return;
  if (i[0]==='consent') o.push('consent-'+i[1]); else if (i['gtm.start']) o.push('GTM'); }); return o; }"""
results = []
def check(label, got, want):
    ok = got == want; results.append(ok)
    print(("  PASS  " if ok else "  FAIL  ") + label)
    if not ok: print("          expected:", repr(want)); print("          actual:  ", repr(got))
def st(pg): x = pg.evaluate(STATE); return {k: x.get(k) for k in ALL}
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

        print("\n=== 1. FIRST VISIT ===")
        ctx, pg = fresh(); pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(400)
        check("all four denied", st(pg), DENIED)
        check("banner shown with three choices", pg.evaluate("() => [...document.querySelectorAll('.consent [data-consent-choice]')].map(b=>b.dataset.consentChoice)"), ["all","reject","manage"])
        o = pg.evaluate(ORDER); check("consent default before GTM bootstrap", o.index("consent-default") < o.index("GTM"), True)
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
        ctx.close()
        ctx, pg = fresh(); pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        pg.click('[data-consent-choice="reject"]'); pg.wait_for_timeout(200)
        check("reject -> all denied", st(pg), DENIED); check("cookie v2:a0:d0", cookie(pg).startswith("v2:a0:d0:"), True)
        check("banner dismissed", banner(pg), False)
        pg.goto(BASE+"/faq/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        check("no banner on page 2 after reject", banner(pg), False); check("still denied", st(pg), DENIED)
        ctx.close()

        print("\n=== 3. MANAGE PREFERENCES DIALOG (a11y) ===")
        ctx, pg = fresh(); pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        pg.click('[data-consent-choice="manage"]'); pg.wait_for_timeout(250)
        d = pg.evaluate("""() => { const d=document.querySelector('.consent-dialog'); return d && {role:d.getAttribute('role'), modal:d.getAttribute('aria-modal'), lab:d.getAttribute('aria-labelledby'), focus:document.activeElement.id}; }""")
        check("role=dialog, aria-modal, labelled, focus moved to title", d, {"role":"dialog","modal":"true","lab":"consent-dialog-title","focus":"consent-dialog-title"})
        check("no optional switch pre-selected", pg.evaluate("() => [...document.querySelectorAll('[data-consent-cat]')].map(i=>i.checked)"), [False, False])
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
        check("old v1 'all' cookie is NOT honoured — stays denied", st(pg), DENIED)
        check("banner shown again", banner(pg), True)
        ctx.close()

        print("\n=== 7. RESET, FALLBACKS, PII, ADMIN ===")
        ctx, pg = fresh(); pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        pg.click('[data-consent-choice="all"]'); pg.wait_for_timeout(150)
        pg.evaluate("() => window.PELLIKAL_CONSENT.reset()"); pg.wait_for_timeout(200)
        check("reset() re-denies, clears, re-shows banner", [st(pg), cookie(pg), banner(pg)], [DENIED, "", True])
        pg.goto(BASE+"/?consent=reset", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        check("?consent=reset strips itself from the URL", pg.evaluate("() => location.search"), "")
        ctx.close()
        ctx, pg = fresh(); pg.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})")
        pg.goto(BASE+"/", wait_until="domcontentloaded"); pg.wait_for_timeout(300); pg.click('[data-consent-choice="all"]')
        pg.goto(BASE+"/faq/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        check("localStorage blocked -> cookie alone remembers", [banner(pg), st(pg)], [False, GRANTED]); ctx.close()
        ctx, pg = fresh(); pg.goto(BASE+"/contact/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        pg.click('[data-consent-choice="all"]'); pg.fill("#first-name","Jane"); pg.fill("#email","jane.testperson@example.com"); pg.fill("#phone","5165550147")
        blob = pg.evaluate("() => JSON.stringify({d:window.dataLayer,c:document.cookie,l:JSON.stringify(localStorage)}).toLowerCase()")
        check("no PII in dataLayer/cookie/localStorage", [x for x in ["jane","testperson","example.com","5165550147"] if x in blob], []); ctx.close()
        ctx, pg = fresh(); pg.goto(BASE+"/admin/", wait_until="domcontentloaded"); pg.wait_for_timeout(300)
        check("/admin/ carries no banner and no consent settings", [banner(pg), pg.evaluate("() => !!window.PELLIKAL_CONSENT_SETTINGS")], [False, False]); ctx.close()
        b.close()
    print("\n" + "="*58 + "\n  {} passed / {} failed  (of {})\n".format(sum(results), len(results)-sum(results), len(results)) + "="*58)
    return 0 if all(results) else 1
if __name__ == "__main__": raise SystemExit(run())
