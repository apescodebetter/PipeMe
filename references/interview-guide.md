# PipeMe Interview Guide

This is a question BANK, not a script. **Budget: 5–15 questions PER ROUND (Full Mode), scaled by that role's impact on this specific project.** Quick Mode: 2 rounds, 4–8 each.

## Sizing a round by impact

Before each round, assess how much this role's domain shapes the project, then size:

| Round depth | When | Questions |
|---|---|---|
| Lean | Domain barely affects this product, or defaults cover it | 5–6 |
| Standard | Domain matters normally | 7–10 |
| Deep | Domain is central to the product's success or risk | 11–15 |

Examples: AI-first product → Round 4 deep. Health/finance data → Round 5 deep. Design-led consumer app → Round 3 deep. Internal tool behind VPN → Rounds 3 & 5 lean. Every round's goal: give that role the most efficient and effective information to analyze and summarize — no more, no less.

## How to run a round

1. Label the round and the role(s) asking: `### Round 2 — 📋 Product Owner`
2. Deliver questions in **batches of 3–5** — never a full 15-question wall. Continue batching until the round's budget is spent or the role has what it needs.
3. Every technical question carries a default inline: *"(If unsure: I'd recommend X — the current industry standard.)"* "I don't know" always advances the interview.
4. After each round, the asking role gives a 2–3 line **summary of what they heard and what they'll do with it** — then the mandatory checkpoint: *"Anything to add, change, or ask before the next round? You can also revise any earlier answer."* Fold responses into the decision log before proceeding. The user can invoke "revisit round N" / "change X" at any point in the session, including after documents exist.
5. **Follow-ups**: if an answer leaves a development-critical gap, ask one surgical follow-up immediately (doesn't count against budget). Example: "users upload files" → "What file types and max size?"
6. Questions marked ★ are core — ask them (or confirm their answer from context) in every session.

---

## Full Mode Rounds

### Round 1 — Product Discovery (🎯 Product Manager)
Core:
- ★ What problem does this product solve, and for whom? (one sentence each)
- ★ How do those people solve this problem today, and what's broken about it?
- ★ How will the product make money (subscription, one-off, freemium, ads, internal/free)?
Standard:
- Who are the 1–3 closest competitors or alternatives? What makes yours different?
- What does success look like 6 months after launch? (users, revenue, another measurable)
- Is there a deadline or event driving the timeline (launch date, demo, funding round)?
Deep (market-driven or crowded-category products):
- How will the first 100 users find the product? (Affects whether SEO, sharing, or integrations belong in v1.)
- Is this a new behavior or replacing an existing tool? (Replacement → import/migration features matter.)
- Any pricing sensitivity you already know from talking to potential users?
- Will pricing tiers gate features? Which ones? (Affects feature-flag architecture from day one.)

### Round 2 — Scope & Users (📋 Product Owner + Product Manager)
Core:
- ★ Which SINGLE feature is the product's core — the thing it cannot ship without?
- ★ What else is must-have for v1? (We'll sort together: Must / Should / Could / Won't.)
- ★ Describe the main user journey in plain words: user opens the app → ... → gets value.
- ★ What is explicitly OUT of scope for v1? (I'll propose non-goals if you're unsure.)
Standard:
- Are there different user types/roles (admin, regular, guest)? What can each do?
- What does the user see the very first time they open the app, before any data exists? (Empty states and onboarding are real development work.)
- Is there a free tier / trial? What's limited?
Deep (multi-sided or workflow-heavy products):
- Walk me through the journey of each secondary user type (e.g. the admin's day, the recipient's experience).
- Which actions need to notify other users, and how (in-app, email, push)?
- What happens when two users act on the same thing at once? (Shared data → conflict rules.)
- Any user-generated content? Who can see it, and does it need moderation?

### Round 3 — Design & Platforms (🎨 Product Design Manager)
Core:
- ★ Platforms: web, mobile (iOS/Android), desktop, browser extension? (Default: responsive web app first — cheapest to build and iterate.)
- ★ Look & feel: 1–2 products you admire, or adjectives (minimal, playful, corporate, dark-mode)?
Standard:
- Is the product used mostly on desktop at work, or on phones on the go? (Drives which layout we design first.)
- Does it need to work offline or in poor connectivity?
- Localization: which languages at launch? (Default: one language, i18n-ready structure.)
Deep (design-led consumer products, or accessibility-critical audiences):
- Who is the least tech-savvy person who must succeed with this app? Describe them.
- Any accessibility requirements beyond baseline (screen readers, motor, low vision)? (Default: WCAG AA basics.)
- Information density: dashboard-style (lots at once) or focused flow (one thing per screen)?
- Should the interface feel like a brand (custom, distinctive) or a tool (standard components, fast to build)? (Big cost difference — standard components ship ~2× faster.)
- Any existing brand assets (logo, colors, fonts) to honor?

### Round 4 — Technical Architecture (🔧 Technical Lead + 🤖 AI Engineer)
Core:
- ★ Stack preferences or existing code? (Default meta for SaaS: Next.js/React + TypeScript, PostgreSQL, Tailwind, on Vercel/Railway.)
- ★ What external services must it talk to (payments, email, maps, calendars, social logins)? (Defaults: Stripe, Resend, Google OAuth.)
- ★ Does the product include AI features? If yes: what should the AI do?
Standard:
- What data does the app create and store, roughly? (I'll draft the data model from this.)
- Expected scale year 1 — tens, thousands, millions of users? (Default: build for thousands, design so millions is possible.)
- Real-time needs (live updates, chat, collaboration) or is refresh-to-see-changes fine? (Real-time is a significant complexity step.)
Deep — AI products (🤖 AI Engineer leads):
- Should AI responses stream live or is a short wait fine? (Streaming affects the whole request pipeline.)
- How wrong is the AI allowed to be? What happens on a bad output — user retries, edits, flags? (Defines fallback UX.)
- Does the AI need the user's own data/documents to answer (→ retrieval/RAG), or general knowledge only?
- Rough budget per user for AI costs? (Drives model tier: frontier vs fast/cheap.) (Default: fast model for high-volume features, frontier for high-stakes ones.)
- Any content the AI must refuse or never produce in your domain?
Deep — integration/data-heavy products:
- For each integration: read data, write data, or both? Real-time sync or periodic?
- Any data imported from existing systems at onboarding (CSV, API migration)?
- Files/media involved? Types, sizes, who can access what?

### Round 5 — Quality, Security & Operations (✅ QA Manager + 🛡️ Security Engineer + ⚙️ DevOps)
Core:
- ★ What data does the app store, and is any of it sensitive — personal, financial, health, minors' data? Where are your users (EU → GDPR)?
- ★ How do users sign in? (Default: email magic-link + Google OAuth.)
- ★ What's the worst thing a malicious user could try to do with the product (steal data, spam others, abuse free tier, scrape content)? (🛡️ Defines the threat model.)
- ★ What must NEVER break? (✅ Defines the critical-path test suite.)
Standard:
- Hosting preference / infrastructure budget ceiling? (Default: managed platform ~$0–20/mo to start.)
- Who maintains this after launch — you, a team, mostly AI agents? (Affects monitoring and docs automation.)
- How bad is an hour of downtime — annoying or business-critical? (Sets the reliability bar honestly.)
Deep (sensitive data, payments, or compliance-heavy products):
- Who inside YOUR side can see user data? (Admin access needs rules too.)
- Data retention: when a user deletes their account, what must disappear and by when? (GDPR: full erasure.)
- Do users need to export their data (GDPR portability, trust feature)?
- Payments: one-time, subscriptions, usage-based? Refund policy? (All flow through the payment integration spec.)
- Any audit/logging needs — "who did what when" records?
- Backups: how much data loss is tolerable — a day, an hour, none? (Default: daily automated backups, tested restore.)

**🛡️ Security baseline (applied WITHOUT asking, every Full Mode session):** the Security Engineer specs these into TECH_SPEC.md regardless of answers — OWASP Top 10 mitigations, hashed credentials (never plaintext), secrets in env vars (never in code), input validation on every endpoint, rate limiting on auth and public endpoints, HTTPS-only, least-privilege DB access, automated backups with tested restore. Questions capture what's product-specific; the baseline is non-negotiable engineering hygiene.

---

## Quick Mode Rounds (2 rounds, 4–8 questions each)

### Round 1 — Product & Scope (🎯 PM + 📋 PO)
- ★ Problem + target user, one sentence each?
- ★ Core feature the product cannot ship without? Any other must-haves for v1?
- ★ Main user journey in plain words?
- ★ What's explicitly OUT of scope for v1?
- (If relevant) Monetization — paid, free, internal?
- (If relevant) Different user types/roles?

### Round 2 — Technical Essentials (🔧 Tech Lead + 🛡️ Security)
- ★ Platform and stack preference? (Default: responsive web app, Next.js + TypeScript + PostgreSQL.)
- Sign-in needed? External services (payments etc.)? (Default: Google OAuth; Stripe if paid.)
- ★ AI features — yes/no, and what should the AI do?
- ★ Any sensitive data stored (personal, financial, health), and are users in the EU? (🛡️ Can't be skipped even in Quick Mode — it changes the data design. Security baseline defaults still apply to AGENTS.md constraints.)
- (If relevant) Real-time features or refresh-is-fine?
- (If relevant) Files/media uploads — types and sizes?

---

## Brainstorming Protocol

When the user wants to explore rather than answer:
- Offer 2–3 concrete options with one-line trade-offs each.
- Give YOUR recommendation and why (one line).
- Converge: "Which direction feels right?" Then record the decision and resume the interview.
Never let brainstorming end without a recorded decision or an explicit "parked for later" note.
