# SBDP — verification report

Automated with the pre-installed Chromium (Playwright) + a Node harness over the real modules.
Screenshots exported to `sbdp/screens-generated/` (login, dashboard, group, add, expense/voice, share, settle pre/post, dark, Bengali/Hindi/Tamil, gallery).

## 1. Numeric consistency (`src/money.js`, seed fixtures)

| Check | Expected | Result |
| --- | --- | --- |
| Group spending | ₹11,600.00 | ✅ ₹11,600.00 |
| Share each | ₹2,900.00 | ✅ |
| Balances | Sam +5,100 / Ananya −500 / Rohit −1,700 / Meera −2,900 | ✅ |
| Settlement | Meera→Sam 2,900; Rohit→Sam 1,700; Ananya→Sam 500 | ✅ |
| Unequal draft (equal+extra, Sam +₹200) | Sam ₹450, others ₹250, unallocated ₹0 | ✅ |
| Post-confirm (Meera pays ₹1,000) | Sam owed ₹4,100; Meera owes ₹1,900; spend still ₹11,600 | ✅ |
| Calculator `(850+650)/2` | 750 | ✅ |
| Calculator `5/0` | "Can't divide by zero" | ✅ |
| Calculator `50%` | 0.5 | ✅ |

Pre-payment and post-confirmation are separate navigable states (`#/settle`, `#/settle?state=post`); the proposed payment and unequal draft do not mutate the base ledger.

## 2. Interaction

- Calculator opens beside the amount field, inserts `750`, live preview splits to ₹187.50 ×4. ✅
- Split-mode switch (equal→exact→percent→shares→equal+extra) re-renders config + preview; unallocated/excess shown inline. ✅
- Subset selection and Paid-by change work independently. ✅
- Save expense → new row persists (idempotent `client_id`), lands in group Expenses + Activity. ✅
- Draft (amount, description) preserved across split-mode change **and** language switch. ✅
- Voice note: mic requested only on Record; typed fallback present; denied/unsupported states render. ✅
- Share: native sheet capability-detected; cancel is silent (no "sent"/error). ✅

## 3. Responsive / layout

- No horizontal overflow at 320, 390, 768, 1024, 1440 px (stat columns shrink; verified post-fix). ✅
- Mobile bottom nav + reachable Add expense / Save; desktop 240px sidebar with lockup. ✅

## 4. Scripts & languages

- All eight languages in the selector; live UI switch. ✅
- Bengali dashboard, Hindi expense form, Tamil group render without clipping; Noto Sans fallbacks applied. ✅
- Names (Sam/Ananya/Rohit/Meera), free text and currency stay untranslated; brand lockup stays English. ✅
- **Flagged:** all non-English catalogues are `needsReview: true` — some hint/subtitle strings remain English pending full locale copy and native review. Translation-key completeness is *not* treated as language quality.

## 5. Theme & a11y

- Light/Dark/System, persisted; dark screens exported. ✅
- Semantic landmarks, skip link, `aria-live` region, visible focus ring, keyboard calculator, reduced-motion media query. ✅
- Console: no errors/pageerrors across all captured routes. ✅

## 6. Boundaries (explicitly not production-ready)

- No real Google auth in preview; sign-in button states Google is not connected. ⛔→ configure Supabase.
- Persistence, RLS, private Storage are schema/contract only until a Supabase project is provisioned.
- Screenshots are design evidence, not proof of backend readiness.
