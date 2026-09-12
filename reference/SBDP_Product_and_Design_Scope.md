# SBDP

**Split Bills, Divide Payments.**  
**by Propelr.in**

## Product, design and engineering scope

Version 1.1 | 10 September 2026 | Implementation handoff for Claude Code

This specification defines a responsive web application for recording shared expenses, allocating costs fairly, explaining balances and recording repayments. It includes the visual system, screens, interactions, calculation rules, permissions, browser fallbacks, delivery sequence and release acceptance criteria. It is a build specification, not a completed application.

## 1. Product direction

SBDP should feel like a small, exceptionally well-made everyday tool. Users should understand what they paid, what they owe and what to do next within seconds. The experience should be calm, minimal, premium and approachable across all eight supported languages.

The core journey is: create a group or choose a person, enter an expense, choose the split, review the result, share when needed, and settle. Advanced controls should appear only when users need them.

### Required identity

- App name: **SBDP**. Preserve capitalisation.
- Tagline: **Split Bills, Divide Payments.**
- Attribution: **by Propelr.in**. Link attribution to https://propelr.in.
- Use the full lockup on the welcome screen and desktop sidebar. On narrow authenticated screens, show SBDP in the header and retain the tagline and attribution in the menu or footer.
- Do not invent an expansion of SBDP or replace the requested tagline.

### Product principles

1. An equal split needs no tutorial.
2. Who paid and who owes are separate questions.
3. Every amount must be explainable.
4. Sharing should work without demanding app installation.
5. Language support applies to the whole experience.
6. Saving, syncing, sharing and receiving payment are different states.
7. Correction must be easy and traceable.
8. A premium interface earns trust through clarity, consistency and speed.

### Primary use cases

| Situation | Required behaviour |
| --- | --- |
| Friends travelling | Group expenses, different subsets per expense, multiple payers, final settlement summary |
| Couples | Percentage or weighted splits, individual expenses, repeated participants |
| Flatmates | Ongoing group, rent and utilities, monthly filtering, partial repayments |
| Dinner or event | Quick equal split, exact amounts, calculator, optional item allocation |
| One organiser managing everything | Named participants without accounts, recorded repayments, shareable personal statements |
| Collaborative group | Members add expenses, inspect changes and acknowledge repayments |

## 2. Decisions and established brand source

The following are proposed implementation defaults, so development can proceed without a lengthy discovery phase:

| Decision | Default |
| --- | --- |
| Delivery | Mobile-first responsive web app with optional installation as a PWA |
| Account model | Organiser account for durable groups; participants can remain unregistered |
| Login | Email magic link; additional identity providers later |
| Currency | INR at launch; currency code and minor-unit fields retained in the data model |
| Group limits | Up to 50 participants and 5,000 expenses per group, with pagination |
| Voice note meaning | Record and play an audio attachment on an expense or group update |
| Voice automation | Transcription and voice-to-expense are separate later features |
| Payments | Record externally completed payments; no wallet or custody of funds |
| Appearance | Light, dark and system preference using established Propelr theme tokens |
| Sharing | Native share menu where available, plus copy and channel fallbacks |
| Offline | Locally saved text drafts, not automatic offline financial mutations |

### Propelr brand source of truth

The existing **PROPELR_BRAND_GUIDELINES_FOR_CLAUDE_CODE.md**, version 2.0, dated 5 August 2026, is the visual, content, accessibility and component source of truth. It was recovered from the user's prior work and read in full for this revision. Its canonical identity is `libfile_b1f50e47f2dc8191872396520b9a73db`. The unavailable public website is no longer a dependency for design decisions.

Use the exact brand and semantic tokens below. Keep provenance in `docs/brand-source.md`. This SBDP scope supplies product behaviour; the established guide supplies the brand system. Accessibility and usability take priority, followed by product clarity, brand consistency and visual polish. Do not import Pathways-specific goals, XP or career features from the guide into SBDP.

Preserve the user's exact product name, tagline and attribution: SBDP; Split Bills, Divide Payments.; by Propelr.in. This product-specific lockup takes precedence over the guide's generic endorsement format. Do not add Propelr's career promise or campaign line as competing SBDP taglines.

Canonical logo filenames are `propelr-logo-black.svg`, `propelr-logo-white.svg`, `propelr-logo-yellow.svg` and `propelr-icon.svg`. Use black on light surfaces, white on dark surfaces and yellow only with strong contrast. Maintain clear space at least equal to the icon height or lowercase r height in the supplied artwork. Minimum logo height is 32 px; standalone icon 24 px; navigation logo 32 to 40 px. Do not stretch, rotate, recolour, apply shadows or gradients, crop, animate continuously or place the logo in arbitrary shapes. Do not repeat SBDP directly beneath a logo already containing SBDP.

The guide identifies the required logo filenames but does not itself provide the SVG bytes. Reuse genuine assets from the implementation repository or supplied brand files. Until those bytes are available, render the exact text attribution without claiming it is the official logo. The font, colour and component rules are established, not provisional.

## 3. Scope and release boundaries

All explicitly requested capabilities belong in the initial public release. The internal milestones in Section 19 organise delivery; they are not permission to omit languages, calculator, voice notes or sharing.

| Area | Initial public release | Later extension |
| --- | --- | --- |
| Groups | Create, invite, edit, archive, member roles, non-account participants | Templates and nested households |
| Expenses | Create, edit, void, receipt, notes, date, category, multiple payers | Recurring generation and bank imports |
| Splits | Equal, exact, percentage, weighted, subset and equal-with-adjustment | Full item-by-item tax and discount allocation |
| Calculator | Arithmetic, parentheses, percentage, history in the current session, insert result | Scientific functions are not planned |
| Language | English, Hindi, Bengali, Tamil, Telugu, Gujarati, Malayalam, Kannada | Additional languages |
| Voice | Record, preview, save, play, delete, typed alternative | Reviewed transcription and voice-to-expense |
| Sharing | Group invites, expense/personal summaries, settlement requests, native sharing, copy, email and channel shortcuts | Automated channel delivery |
| Settlement | Suggested transfers, partial payments, acknowledgements, reversal history | Verified payment-provider integration |
| Statements | CSV and print-friendly statement with browser Save as PDF | Rich image cards and scheduled statements |
| Connectivity | Online financial writes; text draft recovery | Conflict-safe offline mutation queue |
| Notifications | In-app activity, manual shareable reminders, preferences | Optional web push and automated reminders |
| Analytics | Basic total spending and category/date filters | Budgeting and advanced analytics |

Out of scope: lending, investments, credit scoring, advertising, social feeds, public expense discovery, automatic bank access, background microphone recording and native mobile apps. Do not introduce subscriptions or monetisation gates without a separate product decision.

## 4. Account, guest and group behaviour

### Onboarding

The welcome screen has one primary action, “Start splitting”, and a secondary “Sign in”. Language selection is visible before login. A local quick split can demonstrate the calculator and allocation without an account. Clearly label it “Not saved to a group”. Creating a durable group requires login. After login, resume the pending action and retain the draft.

Ask only for display name and email. Do not require phone number, contacts, profile photograph, notification permission or microphone access during onboarding. Email verification errors must preserve the user's progress.

### Group creation

Require only a group name and at least two participants including the organiser. Group type, icon, description and dates are optional. Use initials and a restrained colour tile as the default group visual. Participants can be added by display name alone. Assign immutable IDs so duplicate names remain separate.

Group membership controls access; expense participation controls allocation. A newly added group member does not become responsible for earlier expenses. Removing a participant from future expenses must not remove their previous balances.

### Permissions

| Actor | Read | Financial changes | Administration |
| --- | --- | --- | --- |
| Owner | Entire group | Add and edit any expense with audit event; record payments | Invite, remove access, transfer ownership, archive |
| Member | Entire group, including receipts and group audio | Add expense; edit/void own expense; report own sent payments; confirm own receipts | Manage own profile and leave future participation |
| Unregistered named participant | No access until given a share link | None by default | None |
| Scoped statement link holder | Only explicitly shared statement | None | None |
| Invite link visitor | Minimal group invitation preview | None until authenticated and admitted | None |

Display the group visibility policy before someone joins. Group owners must not impersonate another person's acknowledgement. Owner-recorded repayments involving unregistered people are labelled “Recorded by [name]”, with verification set to organiser-recorded.

Invites expire after seven days by default and are revocable. Invite acceptance requires sign-in and a clear joining action. Claiming an existing named participant requires owner confirmation or a separately issued claim invitation; matching names alone is insufficient. Transfer ownership before the sole owner leaves. Archived groups are read-only until reopened.

## 5. Expense entry and management

### Default form

Present amount first, with an adjacent calculator button. Follow with description, “Paid by”, group/person and participants. Default to equal split and the current group. On the first expense, include all current group participants; for later expenses, start with the last selected set and visibly show “Split between N people” so exclusions cannot go unnoticed.

The split preview updates as users type. A normal expense should fit into one focused screen, with secondary fields under “More details”. Keep the save action reachable above the mobile keyboard.

Required fields: positive amount, non-empty description, currency, date, at least one payer and at least one beneficiary. A payer may owe no share. A beneficiary may have paid nothing. All payer and beneficiary IDs must belong to the same ledger.

Optional fields: category, text note, receipt, voice note and calculator expression. Store the expression as explanatory metadata only; the confirmed monetary value is authoritative.

### Splitting rules

| Mode | Input | Behaviour |
| --- | --- | --- |
| Equal | Selected beneficiaries | Divide total equally, using deterministic rounding |
| Exact | Amount per person | Must sum exactly to total; show unallocated or excess amount live |
| Percentage | Percent per person, up to two decimals | Must sum to 100%; convert through integer basis points |
| Shares | Positive integer weight per person | Allocate proportionally; zero-weight people are excluded |
| Subset | Selected beneficiaries | Available in every split mode |
| Equal plus adjustment | Named positive extras | Allocate extras first; split the remaining amount equally among selected beneficiaries |

For the adjustment mode, show the complete result. Example: ₹1,200 between four people with ₹200 extra assigned to A gives A ₹450 and the others ₹250 each. Reject extras greater than the total. A later itemised mode may assign every item independently; do not make this launch adjustment mode masquerade as item-level splitting.

Multiple payer amounts must sum to the expense total. Switching split modes keeps the total and selected people, regenerates the allocation and asks the user to review changes. Never retain stale hidden allocations.

### Changes and refunds

Editing an expense creates a new revision and an audit event. Voiding removes its active financial effect while preserving history. Show affected users the change and resulting balance. If a payment has already occurred, editing the original expense does not erase that payment.

Refunds are linked credit events against the original expense, capped at its remaining refundable amount. Record who actually received the refund and how much of the original cost is returned to each beneficiary. Do not imply that the original payer always received it. Reject refund allocations exceeding each beneficiary's remaining original share.

Draft, saving, saved, failed and conflict states require distinct UI. A timeout followed by retry must not create duplicate expenses.

## 6. Calculation engine and financial invariants

Implement the engine as pure functions, independent of React, storage and translations. Use integer minor units for stored currency. Never use binary floating-point arithmetic as the authoritative source for money allocation. Parse decimal strings using exact decimal or integer arithmetic. Proposed maximum expense: ₹1 crore; validate on client and server and guard all intermediate arithmetic.

For participant i:

`balance[i] = paid[i] - allocated_cost[i] + confirmed_repayments_sent[i] - confirmed_repayments_received[i]`

Positive means the participant is owed money. Negative means they owe money. For a refund, subtract the cash received from `paid` and subtract the credited share from `allocated_cost`. Pending repayments do not affect this authoritative balance.

Required invariants:

- Sum of payer amounts equals expense total.
- Sum of allocated shares equals expense total.
- Group balances sum to zero after every committed transaction.
- Repayments are transfers, never new spending.
- Expenses, refunds, transfers and revisions remain isolated to their group and currency.
- Editing or retrying has exactly one active financial effect.

For proportional splits, calculate exact quotas, floor to minor units, then allocate remaining minor units by largest fractional remainder. Resolve ties by stored participant order, then immutable ID. Persist final allocations rather than recomputing old records with a newer algorithm.

### Mandatory calculation fixtures

| Case | Expected result |
| --- | --- |
| ₹100 equally between A, B, C | ₹33.34, ₹33.33, ₹33.33 using stored tie order |
| ₹1,200, A paid ₹800 and B ₹400; A/B/C owe ₹600/₹400/₹200 | Balances A +₹200, B ₹0, C -₹200 |
| Same case, C repays A ₹100 and payment is confirmed | A +₹100, C -₹100; spending remains ₹1,200 |
| A pays ₹1,000 split equally with B; A receives ₹200 proportional refund | A +₹400, B -₹400; net spending ₹800 |
| ₹1,000 shared 2:1 | ₹666.67 and ₹333.33 |
| ₹1,000 shared 60:40 | ₹600 and ₹400 |
| ₹1,200 with ₹200 extra for A, four beneficiaries | A ₹450, B/C/D ₹250 each |
| A/B/C group, A pays ₹900 only for B/C | A +₹900, B/C each -₹450 |
| Retry a successful save with same idempotency key | One expense and one ledger effect |

Suggested settlements can pair the largest debtor and creditor repeatedly. Describe this as reducing transfers, not guaranteeing the mathematically minimum number. Show that suggestions may route payment to someone other than the original payer. Suggestions are derived from the current group balance and never rewrite historical expenses. Do not combine separate groups automatically.

## 7. Built-in calculator

The calculator is available from amount fields and a global utility action. On mobile it opens as a bottom sheet; on desktop as a compact anchored panel. It must return users to the exact field and preserve their form.

Support digits, decimal point, addition, subtraction, multiplication, division, parentheses, backspace, clear, equals and percentage. Define `%` consistently as divide by 100: `10% = 0.1`; `100 + 10% = 100.1`. Provide explicit “Add tax/tip %” and “Apply discount %” actions to avoid ambiguity: 10% added to ₹100 produces ₹110.

Show expression above result and a clearly labelled “Use ₹1,250.00” action. Round only the final inserted value to paise and show that inserted value before confirmation. Do not insert negative, zero, infinite or invalid results into an expense amount. Explain division-by-zero errors inline.

Support keyboard entry and Enter to evaluate. Escape closes the calculator without discarding the expense. Keep the last ten calculations in memory for the current session only. Opening the calculator alone must not create an expense or analytics event containing an amount. Use a restricted arithmetic parser, never `eval` or arbitrary JavaScript execution.

## 8. Built-in voice notes

A voice note is an audio attachment, not an automatic expense instruction. The initial release records and plays audio in any spoken language; it does not promise speech recognition in eight languages.

### Recording journey

Tap “Add voice note” within an expense or group update, see who will hear it, grant microphone access when requested, record, stop, preview, and choose “Attach” or “Discard”. Show a timer, recording indicator, stop button and duration limit. Proposed limit: two minutes and 10 MB per note, one note per expense or update. Provide play/pause, seek and duration for saved audio. No autoplay.

Request microphone access only after the recording action. Browser recording uses microphone permission over a secure context; implement `getUserMedia` and `MediaRecorder` capability checks and MIME negotiation rather than assuming a single recording format. Release microphone tracks on stop, cancel, navigation and component cleanup. [Microphone API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder).

If recording is denied, unsupported, interrupted or unavailable in an embedded browser, explain the issue and offer a typed note or supported audio upload. Validate size, real media type and duration server-side. Confirm cross-device playback or transcode into a tested playback format. A failed upload must not lose the typed expense: offer “Save expense without audio” or retry explicitly.

Provide an adjacent text-equivalent field and require a short written equivalent before sharing a voice note. This keeps the information available to users who cannot hear or play audio; a summary must convey the material content, not just say “voice note”. Transcription can be added later with separate consent and editing.

Audio stays private to the group. Shared statements exclude it by default; including it requires explicit selection and the same scoped access checks as other attachments. Stop and preserve available recorded data when the page loses visibility; communicate browser interruption limits without promising background recording.

## 9. Language and localisation

| Language | Selector label | Locale |
| --- | --- | --- |
| English | English | en-IN |
| Hindi | हिन्दी | hi-IN |
| Bengali | বাংলা | bn-IN |
| Tamil | தமிழ் | ta-IN |
| Telugu | తెలుగు | te-IN |
| Gujarati | ગુજરાતી | gu-IN |
| Malayalam | മലയാളം | ml-IN |
| Kannada | ಕನ್ನಡ | kn-IN |

Expose the selector before sign-in and in settings. Display languages in their own scripts, optionally with the English name. Do not use country flags. Detect a supported browser preference initially; otherwise choose English. The user's explicit selection overrides detection and persists locally and in their account. Changing language preserves the current route, draft, calculator state and selected group.

Translate navigation, forms, validation, accessibility labels, confirmations, empty states, notifications, calculator controls, voice controls, share templates, statement labels, authentication screens and help. Translate server error codes through the same message catalogue. Do not translate user-entered names, expense descriptions or audio automatically.

Keep SBDP, the exact tagline and “by Propelr.in” as the brand lockup in English. Supporting explanation and controls use the selected language. Store complete messages with placeholders and proper plural handling; do not build translated sentences by concatenating fragments. Maintain a glossary for owe, paid, share, received, refund and settlement.

Use locale-aware number and date formatting, with Latin digits as a deliberate launch default across languages for easier entry and cross-language reconciliation. Accept local-script digits by normalising them before strict validation. Currency remains INR when language changes. `Intl.NumberFormat` supports locale-sensitive formatting; presentation must remain separate from stored monetary values. [Number formatting reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat).

Use script-appropriate fonts and permit labels to wrap. Do not fix button heights so tightly that Indic vowel marks are clipped. Human review of core financial terminology in all seven non-English languages is a launch requirement. Automated key parity alone does not establish translation quality.

## 10. Sharing in a web app

The primary “Share” action opens a preview with content scope, language and format. Then offer “More apps”, WhatsApp, Telegram, Email, Copy text and Copy link. The operating system determines which compatible installed apps appear. SBDP cannot list every installed app or guarantee every app accepts every payload.

Use the native Web Share API when supported and invoked by a user gesture. Check file-sharing support before offering files. Fall back to copyable text/link and tested channel links. Cancelling sharing is neutral, and share completion does not prove delivery or reading. [Web sharing reference](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share).

| Content | Default disclosure |
| --- | --- |
| Invite | Group name and inviter; no balance history |
| Expense summary | Description, date, amount, payer and selected split details |
| Personal statement | Relevant person's entries and totals, not unrelated group debts |
| Payment request | Payer, recipient, current requested amount and group context |
| Settlement record | Amount, date and accurately labelled confirmation state |
| Group statement | Group totals and detailed ledger, owner/member initiated |

Channel shortcuts open a composer, never send automatically. Users choose the actual recipient in the destination app. Verify WhatsApp and Telegram sharing URL formats against their official documentation during implementation. Email uses a subject and body with a length-safe summary and link; do not promise automatic attachment via `mailto`.

### Link security and freshness

Full group pages require authenticated membership. Read-only snapshot links use high-entropy opaque tokens stored as hashes, default seven-day expiry and revocation. Explain “Anyone with this link can view this statement” before creation. A snapshot has a generated-at timestamp and expense versions; if underlying data changes, show “This statement is out of date” rather than silently presenting it as current. Revoke old snapshots when explicitly replacing a statement.

Use neutral page titles and social preview metadata on protected links. Do not expose names, amounts or access tokens to third-party analytics, search indexing or referrer headers. Preview bots must not redeem invitation or claim tokens. Revoking a link prevents future access; the app cannot retract text or files already sent to another app.

Example share copy: “SBDP | Goa trip. You owe Ananya ₹650 based on the statement generated on 10 September. View the breakdown: [link]. Split Bills, Divide Payments. by Propelr.in”. Translate the explanatory text into the selected sharing language.

## 11. Balances, repayment and notifications

Home shows “You owe” and “You are owed” as separate totals. Calculate these from negative and positive per-group balances, without cancelling debts across groups. Within a group, “Your share” means allocated cost; “You paid” means cash paid for expenses. Neither is interchangeable with the balance.

### Repayment states

| State | Financial effect | Who can trigger |
| --- | --- | --- |
| Draft | None | Initiator |
| Reported sent | None; shown separately as pending | Sender |
| Confirmed | Transfer affects both balances once | Registered recipient |
| Recorded | Transfer affects both balances once, labelled organiser-recorded | Owner, where an endpoint is unregistered |
| Rejected/cancelled | None | Recipient rejects or sender cancels a pending report |
| Reversed | Compensating transfer restores prior effect | Owner with reason, notifying endpoints |

Store status and verification source separately. Require amount, sender, recipient and date; payment method and reference are optional. Allow partial repayment. Warn when repayment exceeds the currently suggested amount, permit an explicitly acknowledged real overpayment and show the resulting credit. This is a ledger, so it must be able to represent what actually happened.

Default settlement action is “Record payment”. A future payment-app handoff must show the payee and amount for review and must never mark success merely because the user returned to SBDP. No payment processing or automatic verification is included in this scope.

Notifications cover expenses affecting the user, revisions, repayment reports and confirmations. Owners can send manual reminders through sharing. No unattended WhatsApp, Telegram or email messages. Batch routine activity and avoid notification storms when several expenses are entered together.

## 12. Information architecture and screen specifications

Mobile navigation: Home, Groups, Activity, Settings. A prominent Add expense action sits above the navigation or in the header, never obscuring content. Calculator is available inside entry and from the utility menu. Desktop uses a 240 px sidebar and a focused content region.

| Route | Screen | Layout and primary action |
| --- | --- | --- |
| `/` | Welcome | Brand lockup, one-line benefit, language selector, Start splitting |
| `/quick-split` | Local calculation | Amount, people, calculator and split preview; Save to a group |
| `/auth` | Sign-in | Email, magic-link state, return-to-draft behaviour |
| `/home` | Dashboard | Two balance cards, active groups, recent activity, Add expense |
| `/groups` | Group list | Search, active/archive filter, Create group |
| `/groups/new` | New group | Name, participants, optional details, Create |
| `/groups/:id` | Group detail | Summary, Expenses/Balances/Activity tabs, Add expense |
| `/groups/:id/members` | People and access | Roles, pending invites, named participants, Invite |
| `/expenses/new` | Expense entry | Amount-first form, split preview, Save expense |
| `/expenses/:id` | Expense detail | Payers, shares, receipt/audio, history, Share |
| `/groups/:id/settle` | Settle | Suggested transfers, pending payments, Record payment |
| `/activity` | Activity | Chronological financial changes with group filter |
| `/settings` | Preferences | Language, profile, privacy, notification preferences, export |
| `/invite/:token` | Invite landing | Minimal preview, sign-in/join, expired/revoked state |
| `/s/:token` | Scoped statement | Read-only snapshot, timestamp, expiry/stale status |

### Dashboard composition

Top: SBDP, optional greeting and language utility. Next: balance cards with large amounts and explicit labels. Next: active groups as tidy rows, with group name, participant count, latest activity and personal balance. Finish with recent expenses. Avoid default graphs; users need actions and trustworthy numbers first.

### Group composition

Use group name and member avatars in the header; show net group spending, your paid total, your allocated share and balance with plain labels. Expenses tab lists category icon, description, payer/date and amount; personal share appears as secondary text. Balances tab explains each person's status and suggested repayments. Activity records edits, invitations and settlement actions.

### Expense entry composition

Large amount input and calculator icon, description, payer row, participant chips, split-mode control, allocation preview, optional notes/receipt/voice, sticky Save expense. Use a full-screen mobile entry route rather than stacking nested sheets. Split details can open one subpanel with a clear return action.

### Empty, error and special states

Design no-groups, no-expenses, settled-up, no-search-results, failed-save, offline-draft, expired-link, denied-microphone, audio-upload-failed, access-revoked and edit-conflict states. Provide one useful next action for each. Example: “Your draft is saved on this device. Connect to save it to the group.” Never show an unsynced draft as a settled financial fact.

## 13. Premium visual design system

### Direction

Follow the established minimal, matte, premium, practical and human Propelr direction. Quality comes from spacing, typography, hierarchy and precision. Use neutral canvas and surfaces, charcoal typography and restrained yellow accents. As guidance, approximately 65 to 75 percent of the interface is background/whitespace, 15 to 25 percent neutral surfaces/type, and 5 to 10 percent yellow. Red is reserved for errors, failures, critical alerts and destructive actions.

Do not use green as the brand accent. Success and warning colours have semantic roles only. Avoid gradients, neon, glass effects, glossy surfaces, decorative charts, yellow glows, cartoon icons and excessive card grids. Do not make normal debt status red merely because someone owes money.

### Established colour tokens

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--color-background` | `#F7F7F7` | `#0C0C0C` | Canvas |
| `--color-surface` | `#FFFFFF` | `#1A1A1A` | Cards, sheets, navigation |
| `--color-surface-subtle` | `#F7F7F7` | `#151515` | Quiet nested surfaces |
| `--color-surface-elevated` | `#FFFFFF` | `#222222` | Overlays |
| `--color-text-primary` | `#2C2C2C` | `#FFFFFF` | Text and financial amounts |
| `--color-text-secondary` | `#6A6A6A` | `#B5B5B5` | Supporting text |
| `--color-text-disabled` | `#9A9A9A` | `#777777` | Disabled labels only |
| `--color-accent` | `#FFD700` | `#FFD700` | Restrained active indicators and selections |
| `--color-on-accent` | `#2C2C2C` | `#2C2C2C` | Text/icons on yellow |
| `--color-border` | `#D9D9D9` | `#2F2F2F` | Standard dividers |
| `--color-border-strong` | `#A8A8A8` | `#555555` | Strong borders |
| `--color-success` | `#28A745` | `#34C759` | Success indicators |
| `--color-success-text` | `#166534` | `#34C759` | Success text |
| `--color-warning` | `#F5A623` | `#FF9500` | Warning indicators |
| `--color-warning-text` | `#8A4B00` | `#FF9500` | Warning text |
| `--color-error` | `#D92D20` | `#FF453A` | Accessible error treatment |
| `--color-focus` | `#2C2C2C` | `#FFD700` | Focus outline |

Core brand constants also include dark grey `#4B4B4B` and brand red `#FF0000`. Use the semantic error token for ordinary UI errors. Never use white text on yellow. Never use yellow for long text on white. Validate actual text, controls, borders and interaction-state pairings for contrast; the existence of a brand token is not proof that every use of it is accessible. Where a standard border cannot identify a control accessibly, use an existing darker neutral and document the role.

### Typography

| Role | Typeface | Weight and treatment |
| --- | --- | --- |
| Headings and display | Poppins | 600 or 700; not long paragraphs |
| Body, controls, tables and amounts | Inter | 400, 500 or 600; tabular numerals for money |
| Technical metadata and keyboard hints | Space Mono | 400 or 700, used sparingly |

Brand fallbacks: Poppins to Inter/Arial/sans-serif; Inter to Aptos/Calibri/Arial/sans-serif; Space Mono to Courier New/monospace. Use script-specific Noto Sans fallbacks for Bengali, Tamil, Telugu, Gujarati, Malayalam and Kannada, and Devanagari where required, only when the established fonts cannot render the selected script. This is an SBDP multilingual accessibility extension, not a replacement display-font identity. Document coverage and load only needed subsets.

| Style | Desktop | Mobile | Weight | Line height |
| --- | --- | --- | --- | --- |
| H1 | 40 px | 32 px | 700 | 1.15 |
| H2 | 32 px | 26 px | 600 | 1.2 |
| H3 | 24 px | 22 px | 600 | 1.3 |
| H4 | 20 px | 18 px | 600 | 1.35 |
| Body | 16 px | 16 px | 400 | 1.6 |
| Body small | 14 px | 14 px | 400 | 1.5 |
| Label | 14 px | 14 px | 600 | 1.3 |
| Caption/technical | 12 px | 12 px | 400 | 1.4 |

Use Inter for financial values with tabular numerals, using the H1 size range for the main balance. Right-align numeric table columns and use Indian grouping. Keep paragraphs within 700 px. Do not use weights below 400, clip Indic vowel marks, aggressively letter-space Indic scripts or truncate amounts. Increase line height for script legibility when needed.

### Spacing, geometry and elevation

Use the 8 px grid with 4 px half-steps. Canonical scale: 0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96 and 128 px. Maximum page width is 1,280 px; primary container 1,140 px; focused SBDP forms approximately 640 px. Desktop/tablet/mobile gutters are 24/20/16 px. Product vertical padding is 24 to 40 px desktop and 16 to 24 px mobile.

Radii: small controls 8 px; buttons and inputs 12 px; cards 16 px; large cards, drawers and dialogs 20 px; pills 999 px. Borders are 1 px, with 2 px for selected or strong emphasis. Prefer borders before shadows. Card padding is 16 to 24 px mobile and 24 to 32 px desktop.

Use established shadows: light cards `0 6px 16px rgba(44,44,44,0.08)`; light overlays `0 16px 40px rgba(44,44,44,0.14)`; dark cards `0 8px 24px rgba(0,0,0,0.32)`; dark overlays `0 20px 48px rgba(0,0,0,0.48)`. Do not introduce coloured shadows or arbitrary spacing values when an existing token works.

### Button and component treatments

Light-mode primary buttons are charcoal `#2C2C2C` with white text. On hover, use yellow `#FFD700` with charcoal text. Dark-mode primary buttons are yellow with charcoal text; hover uses the approved interaction overlay, not a new colour. Use one dominant primary action per decision group. Secondary buttons use a neutral surface, border and primary text; ghost buttons use transparent backgrounds and subtle neutral hover.

Medium buttons are 44 px high; large buttons 52 px. All touch areas are at least 44 by 44 px; calculator keys target 48 by 48 px. Inputs are normally 48 px high with visible labels above and help text below. Permit controls to grow where translated text requires it. Loading should not change button width.

Choose Lucide as SBDP's single icon library from the guide's approved options. Use outline icons with rounded caps/joins and 2 px strokes: 16 px inline, 20 px controls, 24 px navigation and 32 to 48 px empty states. Pair unfamiliar actions with labels. Do not use emojis as the primary icon system.

Required reusable components: BrandLockup, AppShell, ThemeProvider, BalanceCard, GroupRow, ExpenseRow, AmountInput, ParticipantPicker, PayerEditor, SplitEditor, AllocationPreview, CalculatorPanel, VoiceRecorder, AudioNotePlayer, SharePreview, SettlementRow, LanguagePicker, StatusBadge, EmptyState, ErrorState and ConfirmationDialog.

Each interactive component defines default, hover, focus, pressed, disabled, loading, success and error states where relevant, with behaviour in both themes. Light focus is a 2 px charcoal outline, dark focus a 2 px yellow outline, both offset 3 px. Financial status always has text: “You owe”, “You are owed”, “Pending confirmation” or “Settled”. Important errors remain inline. Do not put every icon, tag or card on a yellow background.

### Responsive, theme and motion behaviour

- Breakpoints: xs below 480 px; sm 480 to 767 px; md 768 to 1,023 px; lg 1,024 to 1,279 px; xl at least 1,280 px.
- Below 768 px: single column, bottom navigation, contextual sheets and full-screen complex forms.
- At 768 to 1,023 px: wider single column or compact sidebar when helpful.
- At least 1,024 px: 240 px sidebar and a second content column only where it improves comprehension.
- Test widths of 320, 390, 768, 1,024 and 1,440 px plus 200% zoom. Respect safe-area insets and mobile keyboards; no hover-only actions.
- Include Light, Dark and System appearance options. Start with system preference and persist explicit selection. Apply themes through semantic variables, including export/print treatment and correct logo variants.
- Motion: 120 ms feedback, 180 ms standard transition, 240 ms drawers/dialogs and 360 ms only for rare meaningful emphasis. Use `cubic-bezier(0.2,0,0,1)` as standard easing.
- Respect reduced motion. Do not animate the logo continuously, delay saves for animation, use confetti or obscure amounts with counting effects.

## 14. Accessibility and usability gates

Target WCAG 2.2 AA. Check normal text contrast of at least 4.5:1, large text 3:1 and applicable non-text UI contrast 3:1. Provide keyboard access, meaningful focus order, labelled fields, live status announcements and focus restoration after dialogs. Our 44 px touch-target design target is a product choice, not a claim that WCAG AA universally requires 44 px. [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

Never use colour alone for debt direction or settlement status. Pair visual audio controls with readable labels and a text equivalent. Use semantic headings and proper tables for tabular statements. Screen readers must hear the currency and financial direction, not an unexplained signed number.

Proposed usability acceptance: test five people unfamiliar with the product. At least four should create a four-person group and add an equal-split expense without coaching. Returning users should be able to add a basic expense in roughly 20 seconds in a prepared group. Treat these as test targets, not measured results. Test an unequal split, language change and share-link opening as separate tasks.

## 15. Technical architecture

Recommended default: Next.js with React and TypeScript, a PostgreSQL database, managed authentication and private object storage. Supabase is a practical combined backend option. Use a small accessible component system styled with CSS tokens; Tailwind is optional. Confirm compatible stable dependency versions at implementation and pin a lockfile. Do not hardcode versions from this document. [Next.js documentation](https://nextjs.org/docs).

The browser handles presentation, previews, recording and local drafts. The server owns authentication, authorisation, validation, idempotency and authoritative financial writes. Database constraints and transactional writes enforce ledger invariants. Objects are private, with short-lived access URLs issued only after authorisation. If using Supabase, apply and test row-level security policies; privileged keys must remain server-side. [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

Suggested code organisation: `app/` for routes; `components/` for reusable UI; `domain/money/` for exact calculations; `domain/ledger/` for balances and settlements; `server/` for authorised operations; `messages/` for eight locale catalogues; `styles/tokens.css` for design tokens; `tests/` for financial and integration tests; `docs/` for decisions, brand provenance and release notes.

### Data model

| Entity | Key fields and responsibilities |
| --- | --- |
| User | Auth ID, display name, preferred locale, timestamps |
| Group | ID, name, type, currency, owner, archived status, version |
| Participant | Group ID, immutable ID, display name, optional user ID, active status |
| Membership | User/group/participant association, role and access status |
| Expense | Group, description, amount_minor, currency, date, creator, active revision, void status |
| ExpenseRevision | Expense ID, immutable version, split mode, full previous/current data, actor |
| PayerContribution | Revision ID, participant ID, amount_minor |
| ExpenseShare | Revision ID, participant ID, amount_minor, input weight/percentage/extras |
| Refund | Original expense, actual recipients, beneficiary credits, amount, revision |
| Settlement | Group, sender, recipient, amount, date, status, verification source, idempotency key |
| SettlementEvent | State changes, acknowledgements and reversal references |
| Attachment | Parent entity, private storage key, MIME, size, duration, text equivalent |
| GroupUpdate | Author, group, text, optional audio attachment |
| Invite/ClaimInvite | Token hash, scope, expiry, issuer, usage and revocation state |
| SharedSnapshot | Token hash, scope, captured versions, expiry, revocation and generated-at |
| AuditEvent | Actor, entity, event type, revision, timestamp, minimal structured change |
| Notification | Recipient, event ID, read status, preferences |

A two-person expense uses a private two-person ledger internally without forcing the user to name a group. Do not merge unrelated named participants across groups based only on display name. Store dates as user-selected calendar dates where appropriate and timestamps in UTC.

### Server operation contracts

Define typed create/update/void expense, create refund, report/confirm/reject/reverse settlement, create/revoke invite, accept invite, issue/revoke snapshot and initiate/finalise attachment operations. Financial mutation requests include an idempotency key and expected revision. Return structured errors such as `SPLIT_TOTAL_MISMATCH`, `STALE_REVISION`, `ACCESS_REVOKED` and `UPLOAD_TOO_LARGE`; translate these in the UI.

Commit the financial write, audit event and notification outbox entry transactionally. Process attachment uploads separately; only attach a successfully validated object. On a version conflict, preserve the user's draft and show the changed record for review. Never silently overwrite another person's financial edit.

## 16. Privacy, reliability and operations

Enforce authorisation on every server operation and attachment request. Add rate limits to authentication, token redemption and uploads. Sanitise rendered user content, validate redirects, avoid formula execution in CSV exports and enforce upload content checks. Keep tokens and expense details out of telemetry and error-report payloads.

Allow export, account deletion requests and removal of attachments. Account removal must revoke sessions and memberships; shared financial records need an explicit retention/anonymisation policy before production, because deleting one person's account must not corrupt others' ledger. Present the chosen policy clearly. This specification does not establish legal compliance by itself.

Store draft text in IndexedDB, label it as device-local and clear it on explicit discard or logout. Do not cache private audio or receipts in the service worker by default. Offline financial actions remain drafts until validated online. When access changes, cached data must not be shown as an authorised fresh response.

Use pagination, lazy-load calculator/audio/export code and load language fonts selectively. Proposed engineering budgets: core app JavaScript no more than 250 KB gzip before optional modules, and save acknowledgement within two seconds under the agreed test environment. Establish a repeatable mid-range Android/network test profile and record actual results. These are budgets to validate, not guaranteed production measurements.

Production setup requires HTTPS, separate test/production environments, secret management, database migrations, tested backups and restore, upload cleanup, error monitoring, and a rollback procedure. Operational metrics may include save failure rate, rejected conflicts and upload failures. Never include financial amounts, notes, audio or recipient identities in general analytics.

## 17. Browser support and degradation

Test current and previous major Chrome/Edge releases, Firefox and Safari, plus Chrome on Android and Safari on iOS. Record exact versions and devices in the release report. Installation, recording and share capabilities must be feature-detected, not inferred solely from browser name.

| Capability unavailable | Required fallback |
| --- | --- |
| Native sharing | Copy text/link, channel composer shortcuts and print |
| Sharing files | Share a text/link summary or download statement |
| Clipboard permission | Selectable text field and manual-copy guidance |
| Microphone permission or recording | Typed equivalent or supported audio upload |
| Audio playback format | Tested alternate/transcoded source plus text equivalent |
| PWA installation | Full browser experience continues |
| Network | Recoverable local draft with honest unsaved status |
| Persistent local storage | Explain draft limitation and keep current in-memory entry |

## 18. Acceptance and test matrix

| ID | Test | Pass condition |
| --- | --- | --- |
| A01 | Fresh start | Brand text exact; language selector available before login |
| A02 | Group without accounts | Owner saves expenses for named participants without invites |
| A03 | Equal split | Rounding fixture sums exactly to total |
| A04 | Unequal split | All five launch allocation modes validate and persist correctly |
| A05 | Multiple payers/subset | Payers and beneficiaries independent; balances correct |
| A06 | Calculator | Precedence, parentheses, percent semantics, zero division and insertion tested |
| A07 | Localisation | Eight catalogues complete; financial terms reviewed; no clipped scripts |
| A08 | Language change | Route, amounts and draft retained; UI and share templates change |
| A09 | Audio happy path | Record, stop, preview, attach and play across tested devices |
| A10 | Audio failure | Denial/interruption/upload failure preserve typed expense and stop microphone |
| A11 | Sharing | Native and fallback paths work; cancellation is neutral |
| A12 | Scoped access | Unrelated group data inaccessible by URL/API/storage manipulation |
| A13 | Tokens | Expiry, revocation, stale snapshot and preview-bot behaviour tested |
| A14 | Partial repayment | Confirmed transfer adjusts balances once and leaves spending unchanged |
| A15 | Pending payment | Does not reduce authoritative balance; no false receipt claim |
| A16 | Reversal/refund | Compensating events and refund recipients produce correct balances |
| A17 | Concurrent edits | Stale revision rejected; user's draft preserved |
| A18 | Retry | Repeated idempotency key cannot duplicate ledger effects |
| A19 | Exit/removal | Historical balances survive; access revoked appropriately |
| A20 | Responsive/a11y/brand | Specified widths, zoom, keyboard, contrast, scripts, both themes, exact brand tokens and logo rules pass |
| A21 | Export | CSV totals match ledger; print statement has currency, timestamp and scope |
| A22 | Production readiness | Real persistence, policies, backups, limits and error states verified |

Prioritise unit and property-based tests for monetary conservation, split rounding and reversals; integration tests for permissions, transactions and tokens; end-to-end tests for the primary user journeys. Visual review must use realistic long names, large amounts and each supported script. Use at least one physical Android and one physical iOS device for recording and sharing checks. Browser emulation alone is insufficient for those two capabilities.

## 19. Claude Code delivery sequence

### Milestone 1: Foundation and visual language

Inspect the repository and existing instructions. Record chosen dependencies and the established version 2.0 brand source. Establish routes, design tokens, fonts, accessible primitives, all eight message catalogues, and mobile/desktop shells. Deliver a navigable UI using explicitly labelled test fixtures. Fixtures are not a production backend.

### Milestone 2: Financial core and durable groups

Build the pure calculation engine and fixtures first. Add authentication, participants, permissions, database migrations, transactional expense writes, split modes, revisions, refunds and balance screens. Verify isolation and money invariants before layering optional UI polish.

### Milestone 3: Calculator, collaboration and sharing

Integrate calculator insertion, membership invites, scoped snapshots, channel fallbacks, statements and manual reminders. Verify non-account participant use and expired-link flows.

### Milestone 4: Voice and settlement

Build recording, text equivalents, private uploads, playback, interruption handling, repayment reports, confirmation and reversal flows. Finish in-app notifications and activity history.

### Milestone 5: Release hardening

Complete translation review, accessibility, device testing, performance budgets, account/privacy flows, backup restore and deployment documentation. Use the established brand system and genuine logo assets when available. Document unresolved external dependencies explicitly; do not label placeholders complete.

### Definition of done

Every initial-release feature is connected to real persistence where relevant; no dummy save buttons, mock payment success or fake audio waveforms. Financial and permission tests pass. Eight languages cover the complete UI. Sharing and voice have real-device evidence and fallbacks. Brand deviations are recorded. Deliver source, lockfile, `.env.example` without secrets, migrations, tests, seed fixtures, setup guide, deployment guide and release checklist.

## 20. Paste-ready Claude Code instruction

> Build SBDP according to this entire specification. The required identity is “SBDP”, “Split Bills, Divide Payments.” and “by Propelr.in”. Create a premium, minimal, mobile-first responsive web app. Implement groups and individual expenses, flexible unequal splits, multiple payers, exact money calculations, a built-in calculator, all eight specified interface languages, actual voice-note recording/playback, sharing with browser fallbacks, and traceable settlements.
>
> First inspect the repository, its instructions and supplied brand assets. Use the established Propelr Brand and Product Interface Guidelines v2.0 and the exact tokens reproduced here. Keep branding centralised, preserve the requested SBDP lockup and document the multilingual font fallback extension. Use the recommended architecture unless the existing project gives a concrete reason to adapt it; document that decision.
>
> Execute the milestones in order, with a working end-to-end increment at each stage. Build and test the financial engine before relying on UI calculations. Enforce authorisation server-side and in database policies. Preserve drafts and support meaningful error states. Use progressive disclosure so a basic expense remains simple.
>
> Do not confuse recording audio with transcription, opening a share composer with message delivery, or recording a payment with bank verification. Do not mark unsupported browser features as implemented without working fallbacks. Do not substitute localStorage demo data for a durable collaborative backend.
>
> Maintain a checklist mapped to A01 through A22. At completion, provide setup commands, environment variables, migrations, test results, device checks and specific remaining dependencies. Continue through reversible implementation work without repeatedly asking about routine design choices. Ask only when an unresolved decision changes access, costs, deployment or essential product behaviour.

## 21. Inputs to provide before final sign-off

1. Actual canonical logo SVG files if they are absent from the implementation repository. Palette, typography and component guidance have already been recovered; do not ask the user to supply them again.
2. Production domain and hosting/backend account details when deployment begins. A possible subdomain is a proposal, not a configured address.
3. Native-language reviewers for critical financial wording.
4. Confirmation if “voice note” is intended to include automatic transcription or spoken expense creation; this document includes audio recording and playback as the default.

## 22. Sources and evidence notes

The product scope, priorities, limits and usability budgets are design recommendations grounded in the user brief. Brand colours, typography, geometry and components are grounded in the recovered Propelr Brand and Product Interface Guidelines v2.0, dated 5 August 2026, filename `PROPELR_BRAND_GUIDELINES_FOR_CLAUDE_CODE.md`, canonical ID `libfile_b1f50e47f2dc8191872396520b9a73db`. The SBDP script fallbacks are an explicit accessibility extension. Browser and framework implementation constraints are supported by these primary documentation sources, consulted on 10 September 2026:

- [MDN: Navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share): native share targets, browser availability and user activation.
- [MDN: MediaDevices.getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia): microphone permission and secure contexts.
- [MDN: MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder): browser audio capture interface.
- [MDN: Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat): locale-aware number presentation.
- [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/): accessibility requirements.
- [Next.js documentation](https://nextjs.org/docs): framework implementation reference.
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): database access-control reference.
- [Propelr.in](https://propelr.in): brand website, inaccessible during preparation. The existing v2.0 brand document, read in full, supplies the implementation rules instead.
