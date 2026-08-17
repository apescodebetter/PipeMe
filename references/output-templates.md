# PipeMe Output Templates

All documents follow these rules:
- Bullets and tables, minimal prose. No adjectives that don't change behavior.
- Every decision: `Decision: X. Reason: Y (one line).` Mark user-unspecified choices `(default)`.
- Every task: acceptance criteria as `Done when:` list.
- Diagrams: Mermaid only.
- Cross-reference by file name (`see TECH_SPEC.md §Data Model`), never duplicate content between files.

---

## PRD.md

```markdown
# {Product Name} — PRD
> Version 1.0 · {date} · Mode: {Quick|Full}

## Problem
- {1–3 bullets}

## Target Users
| User type | Description | Primary need |

## Value Proposition
- {1 sentence}

## Features (MoSCoW)
### Must (v1)
- F1: {name} — {one line}
### Should (v1 if time allows)
### Could (v2+)
### Won't (non-goals)
- {explicit exclusions — critical for AI agents}

## User Journeys
- J1: {step → step → step}

## Success Metrics
| Metric | Target | When |

## Monetization
Decision: {model}. Reason: {one line}.
```

Quick Mode "lite" version: Problem, Target Users, Must-features, Non-goals, main Journey only.

---

## TECH_SPEC.md

```markdown
# {Product Name} — Technical Specification
> Version 1.0 · {date}

## Stack
| Layer | Choice | Reason |
| Frontend | | |
| Backend | | |
| Database | | |
| Hosting | | |
| Auth | | |

## Architecture
- {bullets: services/components and responsibilities}
- Diagram: see DIAGRAMS.md §Architecture

## Data Model
| Entity | Key fields | Relations |
- Diagram: see DIAGRAMS.md §Data Model

## API Contracts
| Method | Path | Purpose | Auth | Request → Response (shape only) |

## External Integrations
| Service | Purpose | Notes |

## AI Features (omit section if none)
| Feature | Model | Strategy | Fallback |
- Prompting notes: {bullets}

## Security & Compliance
- {auth flow, data protection, GDPR notes}

## Environments
| Env | Purpose | URL/notes |
```

---

## ROADMAP.md

```markdown
# {Product Name} — Roadmap
> Version 1.0 · {date}

## Phases Overview
| Phase | Goal | Ships when |

## Phase 1 — {name}
Goal: {one line}
| ID | Task | Owner | Status | Depends on | Done when |
| 1.1 | {small, independently verifiable task} | 🤖 | todo | — | - {criterion} - {criterion} |
| 1.2 | | 🤝 | todo | 1.1 | |

Status values: `todo` / `in-progress` / `done`. Updated in this file when a task completes and at every phase transition — the file is ground truth, not session memory.

Owner legend: 🤖 agent-executable · 👤 human-only (accounts, credentials, purchases, legal, human-reviewed submissions) · 🤝 hybrid (agent prepares everything, human performs the final action — e.g. agent drafts store listing, human submits)

## Phase 2 — {name}
...

## Human Action Queue
All 👤 and 🤝 tasks across phases, listed up front so the human can start them in parallel (many have external wait times: store reviews, OAuth verification, account approvals):
| Task ID | Human action | Needed before | External wait? |

## Risks
| Risk | Impact | Mitigation |
```

Task sizing rule: each task completable by one AI agent session (~a few hours of human-equivalent work). If bigger — split.

---

## AGENTS.md

`AGENTS.md` is the **rationale appendix and cross-tool map** — not a second copy of the rules. `CLAUDE.md` and the nested directory files hold the rules, because they load automatically and cheaply. Duplicating them here guarantees drift: two copies of a convention diverge the first time one is edited.

This file carries what does *not* belong in an always-loaded file: the reasoning behind constraints that agents are tempted to weaken, and a map for agents that don't auto-load `CLAUDE.md`.

```markdown
# AGENTS.md — {Product Name}

**This file is the rationale appendix, not the rule list.** The rules live where they load cheapest:

| What | Where | Loads |
|---|---|---|
| Hard constraints, commands, definition of done, git | `/CLAUDE.md` (repo root) | every session |
| {Surface} conventions | `/{dir}/CLAUDE.md` | when working in `{dir}/` |
| {Surface} conventions | `/{dir}/CLAUDE.md` | when working in `{dir}/` |

Every rule lives in exactly one place. If you're an agent that doesn't auto-load `CLAUDE.md`, read the root file plus the directory file for wherever you're working — that is the complete rule set.

This file exists for the handful of constraints whose *reasoning* matters when you're tempted to change them. Read the relevant entry before weakening a rule, never as routine bootstrap.

---

## Why {constraint} is {stricter/broader} than it looks

{The reasoning. Include the asymmetry that justifies it — what a false
positive costs vs. what a false negative costs. Agents narrow over-broad
rules unless told why the breadth is deliberate.}

## Why {architectural choice} is the way it is

{Reasoning for a decision that looks wrong or inconsistent without context —
the deliberate exception to a stated convention, and what breaks without it.}

## Why {doc/file} is frozen / absent / not to be extended

{Reasoning for negative space: things deliberately missing or off-limits.
Absences get "helpfully" filled in unless the absence is explained.}

## Capability limits & escalation

Roadmap tasks carry ownership tags: 🤖 agent-executable, 👤 human-only, 🤝 hybrid. Human-only triggers are external accounts, API keys, purchases, human-reviewed submissions, legal signatures, CAPTCHAs/2FA, live third-party testing, and production secrets.

On a 👤 or 🤝 task: do the 🤖-executable part, then **stop and report** — what's blocked, why, and exactly what the human must do. Never mock, stub, or simulate a blocked capability and report it done; a mock is allowed only if labeled `MOCK:` in code *and* reported.

If a task turns out impossible or wrongly scoped, say so and propose a re-scope — never silently deliver a lookalike.
```

Write a `## Why …` section only where the reasoning genuinely changes behavior. Three to six is typical; a file with a section per constraint has become the rule list again.

Universal hard constraints (never commit secrets, never force-push shared history, never disable auth "temporarily", never run destructive migrations without a confirmed backup, never push to production without passing the Definition of Done) belong in the root `CLAUDE.md` constraint list alongside the product-specific ones — they are safety-critical and must load every session.

---

## DIAGRAMS.md

```markdown
# {Product Name} — Diagrams

## User Flow
​```mermaid
flowchart TD
​```

## Architecture
​```mermaid
flowchart LR
​```

## Data Model  (Full Mode)
​```mermaid
erDiagram
​```

## Key Sequences  (Full Mode — only flows with non-obvious logic, e.g. auth, payment, AI pipeline)
​```mermaid
sequenceDiagram
​```
```

Keep each diagram under ~25 nodes. Split rather than cram.

---

## TEST_PLAN.md (Full Mode only)

```markdown
# {Product Name} — Test Plan

## Strategy
| Level | Tooling | Coverage target |
| Unit | | |
| Integration | | |
| E2E | | |

## Critical Paths (must never break)
- CP1: {flow} — covered by: {test level}

## QA Gates
| Phase | Gate to pass before next phase |

## Edge Cases Register
- {bullets gathered during interview}
```

---

## No changelog

PipeMe does not generate `CHANGELOG.md`. Git history already records *what* changed and when, at higher fidelity and zero context cost. A prose changelog duplicates it, grows without bound, and — measured on real projects — is written far more often than it is read.

What git cannot hold is **why a rule exists**, which is what stops a future agent from "helpfully" undoing it. That belongs in `AGENTS.md` as a `## Why …` section (see its template). Update and Retro modes route reasoning there; everything else is left to git.

If a project already has a `CHANGELOG.md` from an older PipeMe version, don't delete it unasked — mention that it's no longer maintained and offer to remove it, noting git retains the content either way.

---

## HANDOFF.md

```markdown
# {Product Name} — Handoff Brief
> Generated by /pipeme handoff · {date}

## Project
{2-3 bullets from PRD: problem, users, value}

## Status
Current phase: {N} — {name}
- Done: {phases/tasks complete}
- In progress: {current phase tasks}
- Pending: {remaining phases, one line each}

## Key Decisions
{Bulleted, from TECH_SPEC — decisions only, not full spec}

## Hard Constraints
{From AGENTS.md — the never-do list}

## Recent Changes
{Condensed timeline from `git log --oneline -20` — notable changes only, not every commit}

---
Full docs: CLAUDE.md (+ nested {dir}/CLAUDE.md), PRD.md, TECH_SPEC.md, ROADMAP.md, AGENTS.md, DIAGRAMS.md, TEST_PLAN.md
```

Keep to roughly one screen. This is a compression, not a re-export.

---

## CLAUDE.md

**This file is auto-loaded into every single conversation turn.** Its size is a permanent tax on the project. Everything in it must be either (a) safety-critical, or (b) needed in the majority of sessions. Everything else is a conditional pointer with its cost labeled.

**Never write a "read these files at session start" list.** That is the single most expensive mistake in this template — it converts every referenced file's size into a per-session cost. Write conditional triggers instead: *"When doing X, read Y (~N tokens)."*

Target: **600–1,000 tokens.** Measure before delivering (see Token budgeting below).

```markdown
# CLAUDE.md — {Product Name}

{One-line product description: what it is, who for, key compliance/domain context.}

**Current phase: {N} — {name}.** {One line: what's done, what's blocked.}

## Golden constraints (never violate)

{The full hard-constraint list, one terse line each. These are safety-critical —
they load every session by design. Compress the rationale out, not the rule.
Point to AGENTS.md for the two or three whose reasoning matters when tempted.}

Extended rationale for constraints {N, N}: `docs/AGENTS.md`.

## Commands

```
{dev / build / lint / test / syntax-check — the ones run most often}
```

{One line on any non-obvious local setup, e.g. required .env file, manual load steps.}

{If no test suite exists, say so explicitly here — agents assume one does.}

## Definition of done

{Single dense line, criteria separated by · — not a bulleted list.}

## Working rules

- Update task status in `ROADMAP.md` **in the file, immediately** — not at session end.
- Don't skip ahead to an easier task; `Depends on` exists for a reason.
- Don't invent scope outside PRD/ROADMAP — flag the gap instead.
- Scope changes go through `/pipeme update`, not ad-hoc doc edits.
- On a 👤/🤝 task, do the 🤖 part then stop. Never mock a blocked capability and report it done.
- After context compaction: re-read this file, then reconcile `ROADMAP.md` against actual code. Code checked against `Done when:` decides.

## Git

{Branch policy · commit/push policy · commit granularity. Two lines max.}

## Load only what the task needs

Directory rules load automatically when you open files there: {list nested CLAUDE.md paths}. Everything below is a deliberate read — check the cost first.

| Read when | File | ~Tokens |
|---|---|---|
| You need task detail / acceptance criteria | `docs/ROADMAP.md` | {N} |
| Scope or non-goals are in question | `docs/PRD.md` | {N} |
| Writing backend/architecture code | `docs/TECH_SPEC.md` | {N} |
| You need a constraint's full rationale | `docs/AGENTS.md` | {N} |
| Writing tests or QA gates | `docs/TEST_PLAN.md` | {N} |
| You need a diagram | `docs/DIAGRAMS.md` | {N} |

There is no changelog. `git log` is the record of what changed; `docs/AGENTS.md` holds the *why* behind decisions that still constrain the code.

{Any conditional trigger with real consequences, e.g. legal/compliance documents
that must be read before touching specific features. Name the actions, state the
consequence of skipping.}

## Maintenance

Maintained by PipeMe. `/pipeme phase` and `/pipeme retro` update the Current Phase line; `/pipeme claude.md` regenerates. **This file's structure is a token budget — regeneration must preserve the always-on/on-demand split, not flatten it back into a session-start reading list.**
```

### Nested `CLAUDE.md` files (generate one per major surface)

Claude Code loads a directory's `CLAUDE.md` **only when it reads files in that directory**. This is the primary lever for keeping the root file small: per-surface conventions cost nothing until they're relevant.

Generate one for each top-level code surface (`frontend/`, `backend/`, `extension/`, `mobile/`, `infra/`, …), 200–500 tokens each:

```markdown
# {dir}/ — {stack summary}

Loaded automatically when working in this directory. Golden constraints live in the root `CLAUDE.md`{, note which ones bind hardest here}.

## Conventions
{Stack-specific patterns, file layout, framework choices, naming.}

## Rules with teeth
{Conventions where violating has a real consequence. State the consequence —
"X already drifted once and silently under-reported" beats "keep X in sync".
These are the rules agents actually follow.}

## {Domain-specific section as needed}
```

**Every rule lives in exactly one file.** A convention in both `AGENTS.md` and a nested file will drift. When a rule moves into a nested file, replace it in `AGENTS.md` with a pointer, never a copy.

### Token budgeting (mandatory before delivering any of these files)

Measure — don't estimate by eye:

```bash
for f in CLAUDE.md */CLAUDE.md docs/*.md; do
  printf "%-28s ~%s tokens\n" "$f" "$(( $(wc -w < "$f") * 135 / 100 ))"
done
```

Then state in the handoff: the always-on cost (root + typical nested file) and the worst case if every conditional doc were read. Fill the real numbers into the routing table — a cost column with placeholders is worse than no column, because it trains agents to ignore it.

If the root file exceeds ~1,000 tokens, move per-surface content into nested files. If it exceeds 1,000 with nothing left to move, the constraint list itself is too verbose — compress rationale into `AGENTS.md` and keep only the rule.

---

