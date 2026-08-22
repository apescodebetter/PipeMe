# PipeMe

A Claude Skill that acts as a virtual software company — Product, Engineering, QA, Security, and DevOps — to turn an app/SaaS idea into AI-agent-ready development documentation.

## What it does

Run `/pipeme` to interview you about your product idea (or `/pipeme this` to analyze an existing codebase/conversation), then generates a **context-budgeted** documentation suite designed for AI coding agents to build from:

- `CLAUDE.md` — always-loaded bootstrap: hard constraints, current phase, commands, and a cost-labeled routing table (~600–1,000 tokens)
- `{dir}/CLAUDE.md` — per-surface conventions, loaded only when an agent works in that directory
- `PRD.md` — problem, users, features, non-goals
- `TECH_SPEC.md` — stack, architecture, data model, API contracts, testing strategy (Full Mode)
- `ROADMAP.md` — phased, task-decomposed, with acceptance criteria and human/agent ownership tags
- `AGENTS.md` — rationale appendix: *why* constraints exist, plus a cross-tool map
- `DIAGRAMS.md` — Mermaid diagrams (user flow, architecture, data model)
- `HANDOFF.md` — condensed onboarding brief, generated on demand

### Context budget

Docs fall into two cost classes. `CLAUDE.md` and its nested files are **always loaded** — their size is paid on every conversation turn — so they carry only safety-critical rules and a routing table. Everything else is **on demand**, reached through a conditional trigger with its measured token cost stated. PipeMe never generates a "read these files at session start" list, which is what silently turns a small bootstrap file into a large per-session tax.

**Not produced:** changelogs (git history records what changed; `AGENTS.md` records why a rule exists) and brand/design-system docs (visual design is out of scope).

## Commands

| Command | Behavior |
|---|---|
| `/pipeme` or `/pipeme help` | Description, command list, current version |
| `/pipeme new` | Fresh interview — prompts for Quick or Full mode |
| `/pipeme quick` | Fresh Quick Mode interview |
| `/pipeme full` | Fresh Full Mode interview |
| `/pipeme this` | Analyze current project/conversation, then interview the gaps |
| `/pipeme update` | Amend existing docs based on new input mid-project, impact-scored 1–5 |
| `/pipeme clean` | Sweep existing docs for content that doesn't belong (history, status updates, restated rationale) and strip it |
| `/pipeme phase [N]` | Expand one roadmap phase into sprint/task-level detail |
| `/pipeme handoff` | Condense the doc suite into an onboarding brief |
| `/pipeme claude.md` | Generate or rebuild `CLAUDE.md` + nested files (asks before overwriting; preserves hand-tuned structure) |
| `/pipeme next` | Post-completion planning — close the current cycle, interview for the next one, update all docs in place |

## Install

Download `pipeme.zip` (or clone this repo and zip the `pipeme/` folder), then in Claude:
**Settings → Capabilities → Skills → Upload skill.**

## Structure

```
pipeme/
├── SKILL.md                       # main skill definition
└── references/
    ├── interview-guide.md         # question bank, round sizing logic
    └── output-templates.md        # document templates
```

## Version

Current: **1.8**

**1.8** — Document purity as a hard rule: every doc has exactly one designated purpose, and content that doesn't serve it (dated changelog-style entries, cycle/task history outside `ROADMAP.md`'s own rows, decision-reversal prose, verification evidence, restated `AGENTS.md` rationale) is banned, checked live on every generate/update, not just at cleanup time. New `/pipeme clean`: sweeps existing docs for drift against this rule, flags it grouped by file, and deletes on confirmation (no migration — git is the backup).
**1.7** — Consolidation + verification: removed `/pipeme review` (audits fold into `update`'s touched-doc drift check and `next`'s full-suite audit) and `/pipeme retro` (lives on as `next`'s Round 0 mini-retro); `TEST_PLAN.md` folded into `TECH_SPEC.md §Testing`; hard row format for ROADMAP tasks (completed rows never grow — knowledge routes to AGENTS.md/testing log/git); `## Why …` entries capped; every `Done when:` criterion names its verification method (`[test]`/`[live]`/`[human]`); buy-vs-build interview question with managed-service default. **1.6** — Added `/pipeme next`: post-completion planning cycle. When all phases are done, runs a new interview that builds on existing docs — archives completed phases, extends PRD/TECH_SPEC/ROADMAP in place, never duplicates or versions files.
**1.5** — Removed `/pipeme design` (BRAND.md / DESIGN_SYSTEM.md no longer generated) and changelog generation; decision rationale now routes to `AGENTS.md` as `## Why …` sections.
**1.4** — Context budget as a design constraint: layered `CLAUDE.md` (root + per-directory), cost-labeled routing tables replacing session-start reading lists, `AGENTS.md` reframed as a rationale appendix, mandatory token measurement before handoff.
