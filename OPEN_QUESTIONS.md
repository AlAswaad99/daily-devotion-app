# Abide — Deferred Decisions & Open Questions

Running log of decisions consciously postponed. Nothing here blocks starting
implementation, but each one has a "decide by" point where it starts to cost
rework.

---

## DEFERRED BY DECISION

### Q12 — Authentication methods
**Status:** Deferred (2026-08-29)
**Question:** Which sign-in methods? Phone/OTP, email+password, Google, Apple?
**Context:**
- Phone/OTP suits an Ethiopian youth ministry but costs per SMS and Ethio
  Telecom deliverability is an unknown.
- Apple requires Sign in with Apple if any other third-party social login is
  offered on iOS.
- Google sign-in needs Play Services (fine on most devices, not all).
**Decide by:** Before the auth module is built. The abstraction can be written
provider-agnostic, so this is cheap to defer — but not past first user testing.
**Leaning:** email+password + Google for v1; phone/OTP as a later provider.

### Q13 — Registration gating
**Status:** Deferred (2026-08-29)
**Question:** Is signup open to anyone, or restricted to ministry members?
Options: open · invite code · admin approval queue · church selected at signup.
**Context:** Interacts with Q14 (multi-tenancy). If a `church_id` is required on
every user, signup has to establish it somehow — a code is the usual answer.
**Decide by:** Before the registration screen is built.
**Leaning:** Invite/join code that maps a user to a church + ministry. Scales
cleanly to multi-tenant later.

---

## OPEN — NEEDS AN ANSWER SOON

### Bible text licensing  **[SHIP GATE — decided 2026-08-29]**
**Decision:** Develop against the supplied NIV + Amharic NASV XML. Ministry will
formally request permission from Biblica in parallel.
**Both texts are © Biblica, Inc.** — NIV, and Amharic NASV (አዲሱ መደበኛ ትርጕም)
© 2001. Neither is open source; the XMLs are scraped from bible.com.
**This is a hard gate on public distribution, not on development.** The app must
not ship to any store or to users outside the dev team until written permission
exists. Build the reader translation-agnostic so a public-domain text (KJV/WEB)
can be substituted if permission is refused.
**Owner:** ministry. **Escalate if:** no answer by the time the reader is
feature-complete.

### `.zbl` files — DO NOT USE
`bibles/am-nasv.zbl` and `en-niv.zbl` are **encrypted** commercial Bible-app
packages (`encrypted="true"`, obfuscated asset paths, embedded Biblica notice).
Extracting the text requires circumventing a technical protection measure, which
is a separate legal problem from copyright and one that a permission grant from
Biblica would not cure.
**Resolution:** not used as a text source. The plaintext `manifest.bible` inside
the Amharic package was used for the book-name/chapter-count lexicon only —
names of books of the Bible are not themselves copyrightable.

### Font licensing  **[BLOCKER]**
Prototype embeds Nokia Pure Headline / Nokia Ethiopic (Nokia proprietary) and
Niyala (Microsoft, Windows-bundled). Neither is licensable for app embedding.
Replacement candidates: Noto Sans/Serif Ethiopic, Abyssinica SIL (both OFL).
**Decide by:** Before design finalisation — metrics differ, layouts will shift.

### iOS Screen Time entitlement
The distraction-blocking focus mode needs Apple's `family-controls`
entitlement. Application is a form + review, approval not guaranteed, and
turnaround is weeks.
**Decide by:** Apply early if wanted — it is the long pole, not the code.

---

### Q11 — Amharic book-name abbreviation lexicon
**Status:** Deferred by user, then **resolved incidentally** (2026-08-29).
The plaintext manifest in the NASV package yielded all 66 canonical Amharic book
names with chapter counts. Abbreviation variants were hand-derived from the forms
actually used in the devotion JSONs. Encoded in `tools/validate_refs.py`.
**Remaining:** the ministry may still want to supply an official abbreviation
list if they have house style; current lexicon covers everything in the data.

---

## RESOLVED

- **2026-08-29 — Book-name lexicon.** Extracted from NASV `manifest.bible`.
  See `tools/validate_refs.py`.
- **2026-08-29 — Cross-reference data quality.** 109/115 references validate
  against the bundled text. 6 need ministry review, logged in
  `CONTENT_ISSUES.md`.
- **2026-08-29 — Distraction blocking.** Android DND + screen pinning +
  leave-detection for v1; iOS Screen Time entitlement applied for in parallel.
  No Accessibility-Service app blocker (Play policy risk).
- **2026-08-29 — Stack.** React Native (Expo) + Supabase/Postgres + Next.js
  admin dashboard. Offline-first via bundled SQLite + write outbox.
