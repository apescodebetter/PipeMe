# PipeMe

A Claude Skill that acts as a virtual software company — Product, Design, Engineering, QA, Security, and DevOps — to turn an app/SaaS idea into AI-agent-ready development documentation.

## What it does

Run `/pipeme` to interview you about your product idea (or `/pipeme this` to analyze an existing codebase/conversation), then generates a token-efficient documentation suite designed for AI coding agents to build from:

- `PRD.md` — problem, users, features, non-goals
- `TECH_SPEC.md` — stack, architecture, data model, API contracts (Full Mode)
- `ROADMAP.md` — phased, task-decomposed, with acceptance criteria and human/agent ownership tags
- `AGENTS.md` — rules file for AI coding agents (conventions, hard constraints, escalation rules)
- `DIAGRAMS.md` — Mermaid diagrams (user flow, architecture, data model)
- `TEST_PLAN.md` — testing strategy and QA gates (Full Mode)
- `CHANGELOG.md` — log of changes made via `/pipeme update`
- `HANDOFF.md` — condensed onboarding brief, generated on demand

## Commands

| Command | Behavior |
|---|---|
| `/pipeme` or `/pipeme help` | Description, command list, current version |
| `/pipeme new` | Fresh interview — prompts for Quick or Full mode |
| `/pipeme quick` | Fresh Quick Mode interview |
| `/pipeme full` | Fresh Full Mode interview |
| `/pipeme this` | Analyze current project/conversation, then interview the gaps |
| `/pipeme update` | Amend existing docs based on new input mid-project, impact-scored 1–5, logged to CHANGELOG.md |
| `/pipeme review` | Audit existing docs/code for drift — no regeneration |
| `/pipeme phase [N]` | Expand one roadmap phase into sprint/task-level detail |
| `/pipeme retro [N]` | Post-phase retrospective, feeds remaining roadmap and risks |
| `/pipeme handoff` | Condense the doc suite + change log into an onboarding brief |

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

Current: **1.1**
