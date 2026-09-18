# tools/qa — browser verification suites

These are the Playwright suites behind the "42/42" and "120/120" figures in
the reports. They run against a local static server; Formspree, GTM, Google
Fonts and Supabase are stubbed or blocked at the network layer, so nothing
here touches a live account.

```
pip install playwright && python3 -m playwright install chromium
cd <repo root>
python3 -m http.server 8901 --bind 127.0.0.1 &      # serve the site
python3 tools/qa/verify_consent.py                   # Consent Mode v2: defaults, dialog, storage
python3 tools/qa/verify_leadflow.py                  # forms, validation, events, /thankyou/, layout
```

Both print PASS/FAIL per check and a total, and exit non-zero on any
failure. `verify_leadflow.py` stubs Formspree with a 200 (and, in its
failure section, a 422 and a network abort), so "confirmed success" and
"failure never fires generate_lead" are both exercised deterministically.
They do not run as part of `tools/build.py` and have no effect on the site.
