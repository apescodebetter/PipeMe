# PipeMe

A Claude Skill that acts as a virtual software company — Product, Engineering, QA, Security, and DevOps — to turn an app/SaaS idea into AI-agent-ready development documentation.

## What it does

Run `/pipeme` to interview you about your product idea (or `/pipeme this` to analyze an existing codebase/conversation), then generates a **context-budgeted** documentation suite designed for AI coding agents to build from:

- `CLAUDE.md` — always-loaded bootstrap: hard constraints, current phase, commands, and a cost-labeled routing table (~600–1,000 tokens)
- `{dir}/CLAUDE.md` — per-surface conventions, loaded only when an agent works in that directory
- `PRD.md` — problem, users, features, non-goals
- `TECH_SPEC.md` — stack, architecture, data model, API contracts (Full Mode)
- `ROADMAP.md` — phased, task-decomposed, with acceptance criteria and human/agent ownership tags
- `AGENTS.md` — rationale appendix: *why* constraints exist, plus a cross-tool map
- `DIAGRAMS.md` — Mermaid diagrams (user flow, architecture, data model)
- `TEST_PLAN.md` — testing strategy and QA gates (Full Mode)
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
| `/pipeme review` | Audit existing docs/code for drift — no regeneration |
| `/pipeme phase [N]` | Expand one roadmap phase into sprint/task-level detail |
| `/pipeme retro [N]` | Post-phase retrospective, feeds remaining roadmap and risks |
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

Current: **1.6**

**1.6** — Added `/pipeme next`: post-completion planning cycle. When all phases are done, runs a new interview that builds on existing docs — archives completed phases, extends PRD/TECH_SPEC/ROADMAP in place, never duplicates or versions files.
**1.5** — Removed `/pipeme design` (BRAND.md / DESIGN_SYSTEM.md no longer generated) and changelog generation; decision rationale now routes to `AGENTS.md` as `## Why …` sections.
**1.4** — Context budget as a design constraint: layered `CLAUDE.md` (root + per-directory), cost-labeled routing tables replacing session-start reading lists, `AGENTS.md` reframed as a rationale appendix, mandatory token measurement before handoff.
