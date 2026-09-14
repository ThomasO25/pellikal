# OWNER-LEGAL-REVIEW.md

Decisions and facts the code **cannot** safely invent. Each needs the owner,
and where marked, a lawyer. Nothing here blocks the code from being deployed
— but some of it blocks the site from being *finished*.

The privacy policy, terms and accessibility statement on this site are
technical/business documents written to match what the code actually does.
They are not a substitute for attorney review.

---

## BLOCKERS — please provide

| # | Needed | Why |
|---|---|---|
| 1 | **Legal business name.** Is "Pellikal Window Enhancements" the registered entity, or a trade name / DBA? | Terms and privacy policy name the business. If it is a DBA, the legal entity should appear at least once, typically in the Terms. Not guessed. |
| 2 | **Business mailing address** (if legally or operationally required in NY for the Terms/privacy contact, and mandatory if promotional email is ever sent — CAN-SPAM). | The site currently gives phone and email only. |
| 3 | **Warranty language.** The Terms now say warranties are the *manufacturer's* — film manufacturer for film, insert manufacturer for inserts — and that Pellikal installs but does not manufacture. Confirm this is accurate for every product sold, and provide the actual warranty terms/limits if any are to be quoted. | No warranty coverage was invented. |
| 4 | **Data retention.** How long are enquiry emails and Formspree submissions kept? The policy says "as long as needed to respond and to maintain normal business records". Replace with a real period if you have one. | Truthful but vague. |

## DECISIONS — owner

| # | Question | Default in the code today |
|---|---|---|
| 5 | Mount the CMS **gallery** on a page? No page shows it; the admin can upload to it. | Not mounted. |
| 6 | Keep **Microsoft Clarity**? If yes: gate it on `analytics_storage` in GTM, add it to the Analytics category text in the privacy policy and `COOKIE-TRACKING-INVENTORY.md`, and check its masking covers the form fields (session replay). | Policy says *not currently enabled* — true only once it is paused in GTM. |
| 7 | **Self-host Mulish** (SIL OFL) to remove the Google Fonts request? | External, disclosed in the policy. |
| 8 | **Promotional email** in future? Adds: accurate sender identity, physical postal address, working unsubscribe, opt-out processed promptly (CAN-SPAM). The quote form's "We will not add you to any marketing list" must then change — with a separate, explicit opt-in. | No marketing email; form promise stands. |
| 9 | **Promotional SMS / automated calling** in future? Separate TCPA review and explicit written consent language required. Do **not** reuse the quote form's consent for this. | None. |
| 10 | Regenerate **`og-image.png`** with the corrected logo. Needs the design source. | Old pane order in social previews only. |

## NOT DONE ON PURPOSE (and why)

- **No age gate.** A home-improvement service is not child-directed; FTC COPPA
  guidance says ordinary adult-oriented content is not covered merely because
  a child could visit. The policy states the site is not intended for children.
- **No "Do Not Sell My Information" link, no CCPA apparatus.** CCPA applies
  above revenue / consumer-count / data-sale thresholds Pellikal has not been
  shown to meet. Add these only if legal review establishes applicability or
  the owner chooses to honour those rights voluntarily.
- **No claim of ADA / WCAG / GDPR / SHIELD compliance anywhere.** WCAG 2.2 AA
  is stated as an engineering target. NY SHIELD "reasonable safeguards" is
  addressed by the architecture (MFA-gated writes, RLS, no PII in analytics,
  session-only admin auth) — a lawyer decides whether that is sufficient.
- **No CAPTCHA.** Honeypot plus Formspree's filtering is proportionate until
  real spam says otherwise.

## FOR A LAWYER

- Terms of Use and Privacy Policy wording, against NY law and the business's
  actual practices.
- Whether the EEA/UK-style consent design (deny by default, granular
  categories) creates any obligation the business would rather not carry, or
  whether it is simply good practice — it was built as good practice.
- Trademark usage of LLumar® and SelectPro™ (see `LLUMAR-USAGE-REVIEW.md`,
  `TRADEMARK-REVIEW.md`) and manufacturer imagery permissions
  (`WINDOW-INSERTS-ASSETS.md`).
