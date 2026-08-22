# Document Rules — the shape of every file PipeMe writes

Not a rulebook. A shape book. For each file below: its purpose, its literal structural skeleton, and one law that follows from having a skeleton at all.

**The law, stated once because it's the same for every file:** if a piece of content doesn't fit one of the shapes shown for that file, it does not belong in that file — full stop, no matter how short, how true, or how useful it is. There is no "brief exception," no "just a one-line note," no fluff text between or around the shapes. A file with a defined structure has no free space in it. Content that has no shape to fit goes to whichever file it *does* fit, or it goes nowhere.

This file states the shape; it doesn't check anything. What actually catches a shape violation mechanically — the `⭐`/`✅` markers, dated status, incident phrasing, the `AGENTS.md` entry count, `DIAGRAMS.md`'s "nothing outside a fence" rule — is the **purity linter** in `output-templates.md`'s Mandatory Mechanical Checks, run before any generate/update/clean pass is considered done.

---

## DIAGRAMS.md

**Purpose:** current-state diagrams. Nothing else has ever been true of this file.

**Shape:**
```markdown
# {Product Name} — Diagrams

## 1. {Diagram name}

​```mermaid
{flowchart | erDiagram | sequenceDiagram | stateDiagram-v2}
{...diagram body...}
​```

## 2. {Diagram name}

​```mermaid
{...}
​```
```

**The law, applied:** a bare `# title` and a bare `## N. {name}` heading per diagram are the only text in this file that isn't inside a `mermaid` fence. Everything else is diagram syntax — nodes, edges, labels — or it doesn't exist here. Concretely rejected, all real examples:
- A paragraph before the first diagram explaining when it was last regenerated. Not a diagram. Cut, or if it's genuinely load-bearing, it's a git commit message.
- A blockquote caption after a diagram explaining a fact the diagram can't show (e.g. "autofill is free, only the AI branch is metered"). Still not a diagram — the fact belongs in `TECH_SPEC.md`, referenced from nowhere in this file.
- A `⭐` or cycle tag inside a node label, an ER relationship label, or a section heading (`RESEND[Resend ⭐ Cycle 3<br/>...]`, `"⭐ has (Cycle 3)"`, `## 6. Sequence — buying credits ⭐ Phase 16`). A label names what the node *is*; it is never a status field.
- A paragraph comparing the current data model to a removed one ("structurally different from the removed Cycle 2 top-up..."). History, not a diagram — cut entirely, git has it.

Keep each diagram under ~25 nodes — split into a new numbered diagram rather than cram.

---

## ROADMAP.md

**Purpose:** phases → tasks, ground truth for what's actionable now.

**Shape:**
```markdown
# {Product Name} — Roadmap
> Version 1.0 · {date}

## Phases Overview
| Phase | Goal | Ships when |

## Phase 1 — {name}
Goal: {one line}
| ID | Task | Owner | Status | Depends on | Done when |
| 1.1 | {task} | 🤖 | todo | — | - {criterion} `[test]` |

## Human Action Queue
| Task ID | Human action | Needed before | External wait? |

## Risks
| Risk | Impact | Mitigation |
```

**The law, applied:** a task is a table row with exactly those six fields — nothing free-floats between rows, nothing follows `Done when:` beyond its criteria. A row that's `done` shrinks to: original task text + `done` + date + **at most one** `Note:` line — never grows past that shape on completion, no matter what happened during the work. Rejected, real examples: build narrative in a Done row, verification evidence in a Done row, a decision-rationale paragraph attached to a task, ⚠️ warnings floating outside the table. All of it routes elsewhere: *why* → `AGENTS.md`, evidence → the testing log, everything else → the git commit that did the work.

At cycle close: the whole file moves to `ROADMAP_CYCLE_{N}.md` (unchanged, human reference only), a fresh file starts at the next phase — the Risks table is the only thing carried forward, and it carries as rows, not prose.

---

## PRD.md

**Purpose:** current scope and decisions — what's in, what's out, why (in one line).

**Shape:**
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
### Should / Could / Won't
- {same shape}

## User Journeys
- J1: {step → step → step}

## Success Metrics
| Metric | Target | When |

## Monetization
Decision: {model}. Reason: {one line}.
```

**The law, applied:** a feature is one line, a journey is one line of arrows, a metric is a table row, a decision is `Decision: X. Reason: Y.` — never a paragraph. Rejected, real examples: a Success Metric with a dated achievement note (`✅ Achieved 2026-08-19 (Stripe test-mode round-trip verified...)`) — the row's shape has no field for a date or a verification story, so it shrinks to the metric and whether it hit; a Risks row kept around after resolution as a trophy (`✅ Resolved: ...`) — a resolved risk isn't a risk, the row is deleted, not annotated.

---

## TECH_SPEC.md

**Purpose:** current architecture facts an agent needs to build or integrate against.

**Shape:**
```markdown
# {Product Name} — Technical Specification
> Version 1.0 · {date}

## Stack
| Layer | Choice | Reason |

## Architecture
- {bullets: services/components and responsibilities}
- Diagram: see DIAGRAMS.md §Architecture

## Data Model
| Entity | Key fields | Relations |

## API Contracts
| Method | Path | Purpose | Auth | Request → Response (shape only) |

## External Integrations
| Service | Purpose | Notes |

## Testing
| Level | Tooling | Coverage target |
Critical paths: CP1: {flow} — covered by: {level}.

## Security & Compliance
- {auth flow, data protection, GDPR notes}

## Environments
| Env | Purpose | URL/notes |
```

**The law, applied:** an Architecture bullet is what a component *is and does*, present tense, no more. Rejected, real example: a `## 4` paragraph opening with `✅ Fixed 2026-08-21 (was: "every AI type currently broken"...)` followed by a root-cause narrative and a load-test count — none of that is a Stack/Architecture/Data-Model/API/Integration/Testing/Security/Environment fact in the shapes above. What survived the cut was one durable architecture sentence (how an n8n auth failure looks from the gateway's side); the changelog paragraph around it had no shape to fit and was cut whole.

At cycle close: stable, unchanged components condense to `| Component | Purpose | Status |` — full detail stays only where a component is actually changing this cycle.

---

## AGENTS.md

**Purpose:** the *why* behind constraints an agent might otherwise "helpfully" undo. Not the rules — a map to them, and the reasoning the rules alone can't carry.

**Shape:**
```markdown
# AGENTS.md — {Product Name}

| What | Where | Loads |
|---|---|---|
| Hard constraints, commands, DoD, git | `/CLAUDE.md` | every session |
| {Surface} conventions | `/{dir}/CLAUDE.md` | when working in `{dir}/` |

## Why {constraint} is {stricter/broader} than it looks
{Bold rule already stated above as the heading. One more line: the asymmetry
that justifies it — what a false positive costs vs. a false negative.}

## Why {architectural choice} is the way it is
{One line: what breaks without it.}

## Why {doc/file} is frozen / absent
{One line: why the absence is deliberate.}

## Capability limits & escalation
{Fixed section — ownership tags, stop-and-report rule.}
```

**The law, applied:** every `## Why …` heading IS the rule — the body under it is at most one more line of rationale plus, only if needed, one pointer. That's the whole shape; there is no wider paragraph mode for this file. **Hard cap: 8 `## Why …` sections, total.** A 9th means cutting or merging one first, always — the shape doesn't grow by adding rows the way a table can. Rejected, real, common pattern: an entry whose body is 4+ sentences of "X used to break, here's when we found out and how we patched it, verified across N executions" — none of that is "one more line of rationale plus a pointer," so it doesn't matter that every sentence in it is true; it gets rewritten down to the shape (rule stated, consequence stated, pointer if needed) or it doesn't survive.

**Pruning test, applied before any addition and at every cycle close:** would a competent agent still plausibly undo this constraint on first read, without the explanation? Still looks like a bug (an over-broad matcher, a frozen file) → keep. Now embedded in a test or simply unquestioned across cycles → cut, the shape has no room for sentimental entries. Age alone is never the reason; being no-longer-surprising is.

At cycle close: **prune, then accumulate** — the one file in the suite with no archive, so it's the one place a size limit has to be enforced by cutting, not by resetting.

---

## `CLAUDE.md` (root)

**Purpose:** the always-loaded bootstrap. Highest-cost file in the suite — every line is paid every turn, forever.

**Shape:**
```markdown
# CLAUDE.md — {Product Name}

{One-line product description.}

**Current phase: {N} — {name}.** {One line: what's done, what's blocked.}

## Golden constraints (never violate)
{One terse line each. Point to AGENTS.md by number for the ones whose reasoning matters.}

## Commands
​```
{dev / build / lint / test — the ones run most often}
​```

## Definition of done
{Single dense line, criteria separated by ·.}

## Working rules
- {bullets — behavioral rules, not architecture}

## Git
{Branch · commit/push policy. Two lines max.}

## Load only what the task needs
| Read when | File | ~Tokens |
|---|---|---|

## Maintenance
{One line: what regenerates this file.}
```

**The law, applied:** a Golden constraint is one line, present tense, no date, no cycle tag — the shape is `{rule}`, not `{rule} + {when it was added}`. Rejected, real examples: `As of 2026-08-22, the Supabase MCP is connected` (a status report, not a constraint — the shape has no date field), `⭐ Cycle 3: RESEND_API_KEY env var required` (the star and cycle tag aren't part of any field in the constraint-list shape; the constraint is just `RESEND_API_KEY env var required for expiry-reminder emails`). Budget: 600–1,000 tokens, measured, not estimated.

---

## `{dir}/CLAUDE.md` (nested, one per surface)

**Purpose:** per-surface conventions, loaded only when that directory is touched.

**Shape:**
```markdown
# {dir}/ — {stack summary}

Golden constraints live in the root `CLAUDE.md`.

## Conventions
{Stack-specific patterns, file layout, naming.}

## Rules with teeth
{Convention + the consequence of violating it, one line each.}

## {Domain-specific section as needed}
```

**The law, applied:** "golden constraints live in the root `CLAUDE.md`" is the whole allowed reference to root — this file never restates a root constraint's text, only its existence. A "Rule with teeth" is `{convention} — {consequence}`, present tense; there's no field in that shape for when the rule was added or what used to happen before it existed. Rejected, real examples: `RLS on every user table... This is root constraint 9` (restating constraint 9's text instead of just citing "constraint 9"), `that list is hand-enumerated (it has drifted before)` (the parenthetical isn't a consequence, it's an incident — the shape becomes `hand-enumerated — a table left off it silently breaks the GDPR export promise`). Never the same rule written in full in two different `{dir}/CLAUDE.md` files — one canonical home, a citation from the other. Budget: 200–500 tokens each.

---

## `HANDOFF.md` (on demand only, via `/pipeme handoff`)

**Purpose:** a one-screen compression for a newcomer — human or AI session with zero context.

**Shape:**
```markdown
# {Product Name} — Handoff Brief
> Generated by /pipeme handoff · {date}

## Project
{2–3 bullets from PRD}

## Status
Current phase: {N} — {name}
- Done / In progress / Pending: {one line each}

## Key Decisions
{Bulleted, from TECH_SPEC — decisions only}

## Hard Constraints
{From AGENTS.md's never-do list}

## Recent Changes
{Condensed from `git log --oneline -20`}

---
Full docs: {pointer list}
```

**The law, applied:** every section is a bulleted compression of another file, not new prose — this file originates nothing. If a sentence here isn't traceable to a bullet in `PRD.md`, a decision in `TECH_SPEC.md`, a constraint in `CLAUDE.md`, or a commit in `git log`, it doesn't have a shape to fit. Roughly one screen; longer means it's stopped being a brief.

---

## Not produced, ever

`CHANGELOG.md`, `BRAND.md`, `DESIGN_SYSTEM.md`, a standalone `TEST_PLAN.md`. These have no shape in this suite at all — not "keep them short," they don't exist. An absence is a decision, not a gap to fill in.
