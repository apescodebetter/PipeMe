# PipeMe

A Claude Skill that acts as a virtual software company — Product, Engineering, QA, Security, and DevOps — to turn an app/SaaS idea into AI-agent-ready development documentation.

## What it does

Run `/pipeme` to interview you about your product idea (or `/pipeme this` to analyze an existing codebase/conversation), then generates a **context-budgeted** documentation suite designed for AI coding agents to build from:

- `CLAUDE.md` — always-loaded bootstrap: hard constraints, current phase, commands, and a cost-labeled routing table (~600–1,000 tokens)
- `{dir}/CLAUDE.md` — per-surface conventions, loaded only when an agent works in that directory
- `PRD.md` — problem, users, features, non-goals
- `TECH_SPEC.md` — stack, architecture, data model, API contracts, testing strategy (Full Mode)
- `ROADMAP.md` — phased task tables with acceptance criteria and human/agent ownership tags
- `AGENTS.md` — pure cross-reference map: what's where and when to read it
- `DIAGRAMS.md` — Mermaid diagrams (user flow, architecture, data model)
- `HANDOFF.md` — condensed onboarding brief, generated on demand

### Context budget

Docs fall into two cost classes. `CLAUDE.md` and its nested files are **always loaded** — their size is paid on every conversation turn — so they carry only safety-critical rules and a routing table. Everything else is **on demand**, reached through a conditional trigger with its measured token cost stated. PipeMe never generates a "read these files at session start" list, which is what silently turns a small bootstrap file into a large per-session tax.

**Not produced:** changelogs (git history records what changed; a code comment at the constraint records why a rule exists) and brand/design-system docs (visual design is out of scope).

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
| `/pipeme map` | Install a generated code map in a JS/TS repo: per-folder `MAP.md` with line ranges, usage and dead-code tags, `MAP.html` to browse the whole map, a Read hook for large files, an edit hook, a pre-push freshness check |

## Install

Download `pipeme.zip` (or clone this repo and zip the `pipeme/` folder), then in Claude:
**Settings → Capabilities → Skills → Upload skill.**

## Structure

```
pipeme/
├── SKILL.md                       # main skill definition
├── references/
│   ├── interview-guide.md         # question bank, round sizing logic
│   ├── output-templates.md        # document templates + the purity linter
│   ├── document-rules.md          # per-doc literal shape + the one law
│   └── map.md                     # code map: formats, tags, hooks, install text
└── scripts/map/                   # the code map generator, copied into a project by /pipeme map
    ├── map.mjs                    # generate · check · report · docs · hook-read · hook-edit
    ├── lib/                       # parse (TypeScript parser) → graph → render + MAP.html viewer, docs check
    ├── hooks/pre-push             # blocks a push to main/master with a stale map
    └── test/run.mjs               # end-to-end test on a throwaway repo
```

## Version

Current: **1.14**

**1.14** — `MAP.html`: the whole code map as one page for people. `generate` writes it at the root in the same run as the MAP files, from the same graph, and `check` and pre-push cover it, so it never drifts from them. Open it in a browser; there's no command to run. It shows a treemap of every folder and file sized by lines, colored by dead-code tag, striped where no test covers it. Click a folder to open it, or a file to see its functions with line ranges (a click copies `path:start-end` for an agent) and who uses it. Search takes the same task words agents grep for. It's self-contained, works offline, and has light and dark themes. Agents keep reading `MAP.md`; the page's data is one short record per line, so a repo-wide grep that hits it stays small.

Hard rule: MAP files hold only generator output. A structural change goes into the generator; nothing is written into a map by hand. Four guardrails enforce it:
- the "Finding code" rule in the root `CLAUDE.md`
- a PreToolUse guard that refuses any agent edit to a MAP file
- a pre-commit hook that refuses any staged MAP file that isn't byte-for-byte generator output, however it was written
- the existing pre-push check

The map and the `CLAUDE.md` routing table split cleanly. The table points to docs, which say what's decided; the map points to code, as built. "Finding code" is the map's only entry point, so there's no routing row for it, and routing triggers name the decision a doc holds, never code to find.

`generate` no longer walks into hidden folders or nested checkouts, so it can't delete MAP files inside orchestration worktrees. The skill description is shorter.

**1.13.1** — The map leaves its own install folder (`tools/map/`) out without a config line; before, it mapped its own scripts and flagged `map.mjs` as an unused file.

**1.13** — `/pipeme map`: a generated, committed code map for JS/TS repos, so agents grep to the exact line range instead of reading whole files. It has three layers: the architecture diagram as roots (written), per-folder `MAP.md` files as branches (generated), and function bodies as leaves (never stored). Each symbol line carries its range, who uses it, and dead-code tags (`unused`, `tests-only`, `half-pair`, `not in schema`, `keep until`). A Read hook sends whole-file reads of large files to the map first; repeating the Read allows it. An edit hook prints what an edit left unused or dangling. The map regenerates only when a branch merges into the main branch, and a pre-push check blocks a stale one. A `docs` command lists names in `CLAUDE.md`/`AGENTS.md`/`TECH_SPEC.md` that no longer exist in the code. Update Mode's drift check and Next Cycle's audit use it.

**1.12** — Cut and sweep are one pass. Emptying `AGENTS.md` under 1.11 left pointers across the suite that still said "see AGENTS.md" for reasoning that was no longer there. Each of those lines was purity-clean on its own, so no check could see the problem. Golden Rule 6 now treats a pointer as two-directional work: cutting or moving content means updating every reference aimed at it in the same pass. Update Mode's drift check greps for inbound references to anything it cut. `document-rules.md` makes emptying `AGENTS.md` a cut-and-sweep. The purity linter lists every mention of `AGENTS.md` outside the file that still expects rationale there.

**1.11** — Structure becomes enforceable, not just advisory.

`AGENTS.md` redefined: not a rationale file at all anymore, a pure cross-reference map. Confirmed against a real project — even after capping it at 8 entries and enforcing consequence-only framing, every entry eventually lost to further cuts; there was no floor above zero. It now holds only a routing table (extended to cover every doc in the suite, not just `CLAUDE.md` files) and the fixed Capability limits & escalation section — nothing else, no exceptions, unless the user explicitly asks in a specific case. A constraint's *why* now lives in a code comment at the point of the constraint, and every mode that used to route reasoning into `AGENTS.md` (`/pipeme update`, `/pipeme next`'s retro, the archive sweep, `CLAUDE.md`'s rationale pointer) routes there instead.

`ROADMAP.md` is table-only. Tasks are rows — `| ID | Task | Owner | Status | Depends on | Done when |` — with `Done when` cells of 1–2 phrases. No bullet lists, no paragraph blocks under a task, no lineage parentheticals ("carried from Cycle N", "unchanged constraint from Cycle M"), no free-floating prose between tables. Deferred items are rows too (`| Item | Status | Blocker |`), not paragraph bullets.

`DIAGRAMS.md` is fences-only. Diagram names use mermaid `title:` frontmatter *inside* the fence — even a bare `##` heading is markdown sitting outside the thing it names. The only non-fence line is the file title.

The entry standard tightened from 2–3 sentences to **1–2 phrases**, propagated through the live purity check that generation actually runs.

`/pipeme clean` gained a fourth finding type — **structural shape violations** — distinct from purity violations: right content, wrong format. Its action is *restructure*, and "the content is accurate" is explicitly not a reason to keep the wrong shape. `/pipeme update` now writes in the shape from `document-rules.md` and verifies it after, since the linter catches content violations but not structural ones. The "over-budget file" type is gone — `AGENTS.md` is zero-tolerance now, not a cap to judge against.

**1.10** — `document-rules.md`'s shapes were duplicated in full inside `output-templates.md`'s per-file code blocks — two sources of truth for the same structure, the exact drift risk this whole line of work exists to eliminate. `output-templates.md` shrank from ~500 lines to ~160: every per-file section is now a pointer to `document-rules.md` for shape, keeping only what's genuinely unique to it — the Mandatory Mechanical Checks, cycle-close refresh/archive procedures, and the `AGENTS.md` worked example. Every cross-reference in `SKILL.md` repointed to match.

**1.9** — `AGENTS.md` was the one doc in the suite with no ceiling: every other file gets refreshed, archived, or regenerated at cycle close, `AGENTS.md` only ever grew. Fixed: hard cap of 8 `## Why …` entries, enforced (not "3-6 typical"); a pruning test decides what still earns its place ("still reads like a bug on first encounter" survives, "hasn't been questioned in cycles, now embedded in tests" doesn't) — age alone is never the reason to cut. `/pipeme next`'s document handling changed from Accumulate to Prune-then-accumulate. `/pipeme clean` gained a fourth finding type, over-budget file: a doc built entirely from individually-compliant entries can still be too big from sheer count, and no per-entry rule ever catches that — this is the one Clean Mode action that can remove a fully compliant entry, confirmed explicitly, never bulk-approved. New `references/document-rules.md`: every doc's *literal shape* (a skeleton, not a rule list) plus one law — content that doesn't fit the shape doesn't belong, no matter how short or true. New purity linter (`output-templates.md`, Mandatory Mechanical Checks): a real `grep`/`awk` script — not another prose rule — that catches `⭐`/`✅` markers, dated status, incident phrasing, `AGENTS.md`'s entry count, and any text in `DIAGRAMS.md` outside a mermaid fence, mechanically, over every generated file. Wired as a mandatory step into generation, Update Mode's maintenance check, and Clean Mode's scan — because a prose rule alone had already been shown, repeatedly, not to hold under real generation.

**1.8** — Document purity as a hard rule: every doc has exactly one designated purpose, every entry is 2–3 sentences, full stop. Banned everywhere: dated changelog-style status, cycle/task narrative outside `ROADMAP.md`'s own rows, decision-reversal prose, verification/evidence detail, and — the core fix — bug-discovery-and-fix incident framing in any form, dated or not (`AGENTS.md` is an instructions file: rule + consequence, never "X broke, here's how we fixed it"). Checked live on every generate/update, not just at cleanup time. New `/pipeme clean`: sweeps existing docs for purity violations (cut/reframed in place, no migration), misfiled investigations — open bugs, known-unfixed issues, stale docs (moved to `ROADMAP.md`'s Risks table), and cross-file duplicate facts (kept in whichever file matches their designated purpose, not whichever loads cheaper).
**1.7** — Consolidation + verification: removed `/pipeme review` (audits fold into `update`'s touched-doc drift check and `next`'s full-suite audit) and `/pipeme retro` (lives on as `next`'s Round 0 mini-retro); `TEST_PLAN.md` folded into `TECH_SPEC.md §Testing`; hard row format for ROADMAP tasks (completed rows never grow — knowledge routes to AGENTS.md/testing log/git); `## Why …` entries capped; every `Done when:` criterion names its verification method (`[test]`/`[live]`/`[human]`); buy-vs-build interview question with managed-service default. **1.6** — Added `/pipeme next`: post-completion planning cycle. When all phases are done, runs a new interview that builds on existing docs — archives completed phases, extends PRD/TECH_SPEC/ROADMAP in place, never duplicates or versions files.
**1.5** — Removed `/pipeme design` (BRAND.md / DESIGN_SYSTEM.md no longer generated) and changelog generation; decision rationale now routes to `AGENTS.md` as `## Why …` sections.
**1.4** — Context budget as a design constraint: layered `CLAUDE.md` (root + per-directory), cost-labeled routing tables replacing session-start reading lists, `AGENTS.md` reframed as a rationale appendix, mandatory token measurement before handoff.
