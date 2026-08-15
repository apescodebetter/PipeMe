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
| ID | Task | Owner | Depends on | Done when |
| 1.1 | {small, independently verifiable task} | 🤖 | — | - {criterion} - {criterion} |
| 1.2 | | 🤝 | 1.1 | |

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

```markdown
# {Product Name} — AI Agent Rules
> Give this file to any AI coding agent working on the project.

## Project Summary
- {2–3 bullets: what, stack, current phase}

## Conventions
- Language/framework versions: {pinned}
- Code style: {linter/formatter + key rules}
- File/folder structure: {tree, top 2 levels}
- Naming: {patterns}
- Commits: {format, e.g. conventional commits}

## Commands
| Action | Command |
| dev | |
| test | |
| lint | |
| build | |

## Hard Constraints — irreversible or dangerous actions (never do these)
- NEVER commit secrets, API keys, or credentials to the repo
- NEVER delete or overwrite user data, drop tables, or run destructive migrations without an explicit human-confirmed backup
- NEVER force-push to main or rewrite shared git history
- NEVER disable auth checks, input validation, or rate limiting "temporarily"
- NEVER push directly to production without passing the Definition of Done
- {add product-specific irreversibles, e.g. "never trigger real payments in dev"}

## Standards — industry-normal practice (follow by default; deviations allowed only if noted in the task and recorded in TECH_SPEC.md)
- Write tests for new endpoints/logic; run lint + tests before marking done
- New dependencies: prefer established libraries; record additions in TECH_SPEC.md §Stack
- DB schema changes only via migrations
- Follow the conventions above (style, naming, commits)

## Definition of Done
- {checklist applied to every task}

## Capability Limits & Escalation
- Tasks tagged 👤 or 🤝 in ROADMAP.md need human action — do the 🤖-preparable parts, then STOP and hand off.
- If blocked by something you cannot do (missing credential/API key, external account, CAPTCHA/2FA, human-reviewed submission, live third-party testing): STOP. Report: what's blocked, why, exactly what the human must do. NEVER mock, stub, or simulate the blocked capability as if it works — a mock is allowed only if explicitly labeled `MOCK:` in code AND reported.
- If a task turns out impossible or wrongly scoped, say so and propose a re-scope — never silently deliver a lookalike.

## Current Focus
- Phase {n}: see ROADMAP.md — work top-down, respect `Depends on`.
```

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

## CHANGELOG.md

```markdown
# {Product Name} — Change Log
> Created by /pipeme update. One entry per change.

## {date} — {one-line summary}
- Impact: {1-5} ({🟢 Minor | 🟡 Moderate | 🔴 Major})
- Files touched: {list}
- Reason: {one line — why the user wanted this}
- Rework flagged: {task IDs already completed that this invalidates, or "none"}
```

Newest entries at the top. Decision-only — no Q&A transcript.

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
{Condensed timeline of 🟡/🔴 CHANGELOG.md entries only}

---
Full docs: PRD.md, TECH_SPEC.md, ROADMAP.md, AGENTS.md, DIAGRAMS.md, TEST_PLAN.md, CHANGELOG.md, CLAUDE.md
```

Keep to roughly one screen. This is a compression, not a re-export.

---

## CLAUDE.md

```markdown
# {Product Name} — Start Here
> Auto-read by Claude Code at session start. Generated by PipeMe.

## Bootstrap sequence (do this first, every session)
1. Read `AGENTS.md` in full — conventions, commands, and hard constraints are non-negotiable.
2. Read `ROADMAP.md` — find the current phase (see below) and the first task not yet marked done, respecting `Depends on`.
3. Read `PRD.md` only if you need product context beyond the task description.
4. Check `CHANGELOG.md` top entry — if it's newer than your last session, a decision changed; read it before continuing old work.

## Current Phase
Phase {N} — {name}. See `ROADMAP.md` for full task list and acceptance criteria.

## Before you start a task
- Confirm the task's `Depends on` tasks are marked done.
- Check the task's Owner tag (🤖/👤/🤝) in ROADMAP.md. If it's 👤 or partly 👤, do only the 🤖-executable part, then STOP per AGENTS.md's Capability Limits & Escalation section.

## When you finish a task
- Verify against the task's `Done when:` criteria before marking it done.
- Mark the task complete in `ROADMAP.md`.
- If anything you learned should change a future task, a doc, or an assumption — don't edit silently. Flag it in your session output; scope changes go through `/pipeme update`, not ad-hoc edits.

## Don't
- Don't skip to a later task because it "looks easier" — dependencies exist for a reason.
- Don't invent scope not in PRD.md/ROADMAP.md — flag the gap instead.
- Don't mock a blocked 👤 capability and report it as done (see AGENTS.md).
```

Thin by design — sequencing only, never duplicates AGENTS.md/ROADMAP.md content. The "Current Phase" line is updated whenever `/pipeme phase` or `/pipeme retro` advances the project.

