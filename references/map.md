# Code Map — what `/pipeme map` installs

A generated index so an agent finds code by grepping a small map instead of reading whole files. It also answers "what breaks if I change this" and flags dead code. JS/TS projects only. The procedure lives in `SKILL.md` → Map Mode; this file holds the formats and the text to install.

## Three layers

| Layer | Holds | Lives in | Written by |
|---|---|---|---|
| Roots | how the parts talk to each other | the architecture diagram in `DIAGRAMS.md` (config `systemMap`) | agent drafts, user approves |
| Branches | per folder: files, functions with line ranges, who uses them, tests, tags | `MAP.md` in each mapped folder; `MAP.<file>.md` outlines for big files | generated |
| Leaves | function bodies | the code | never stored: grep, then a ranged Read |

A folder gets its own `MAP.md` when it is the root, holds 3+ files, or has 2+ mapped subfolders; smaller folders fold into their parent's map. Each map links up to its parent and down to its children. A file with more than 25 symbols gets an outline file. More files get outlines, largest first, until each folder map is at most 150 lines.

## Map line format

```
src/billing/refund.ts  48 lines · tests: src/billing/refund.test.ts
  routes    POST /api/refund
  data      tables payments · rpc issue_refund
  storage   reads lastRefund · writes lastRefund
  labels    "Refund", "Refund issued"
  src/billing/refund.ts:3-20  fn     refund(id: string)  used by 2 files
  src/billing/refund.ts:22  fn     refundAll()  unused  [unused]
```

**Usage** is one of `used by N files` · `in file` · `entry` (a framework or config calls it) · `tests only` · `unused`.

**Words that bridge task language to code.** These come from the code: routes, fetch URLs, tables/buckets/rpc names, storage keys, message types, and UI labels (JSX text, `aria-label`/`title`/`placeholder`/`alt`, `textContent`). A task that says "the Refund button" greps straight to the file.

**Tags** are leads, not verdicts:

| Tag | Meaning | Check before acting |
|---|---|---|
| `[unused]` | nothing references it | grep the name as plain text: strings, HTML, JSON, config |
| `[tests-only]` | only tests use it | is the test the last caller of dead code? |
| `[half-pair]` | storage key read but never written (or the reverse); message sent but never handled (or the reverse) | a key written by another app or by hand |
| `[not in schema: x]` | code queries a table/rpc no SQL file creates | a missing migration, or a typo |
| `[keep until: …]` | from `// REMOVE WHEN: <condition>` above it | the condition |
| `[unused-file]` | nothing imports, loads, or names the file | a manual script → add it to `entryPoints` |

## Comment tags the map reads

The map reads only these four tags. Each one is a one-line fact. Other comments are ignored.

| Tag | Where | Shows as |
|---|---|---|
| `// MODULE: <what this file is for>` | first comment in the file | `purpose` line |
| `// INVARIANT: <rule the code must keep>` | at the constraint | `invariant` line |
| `// REMOVE WHEN: <condition>` | above a symbol | `[keep until: …]` instead of `[unused]` |
| `// covers: path/to/file.ts` | in a test file | links the test to a file it doesn't import |

## Install

Needs git, Node 18+, and the `typescript` package in `node_modules` at the repo root or one folder down. Otherwise set `MAP_TS_PATH` to its folder. Only the parser is used; nothing is type-checked.

| Step | What |
|---|---|
| Scripts | copy the skill's `scripts/map/` to `tools/map/` (skip `test/`) |
| Config | `map.config.json` at the root. Keep only keys that differ from the defaults; see `tools/map/map.config.example.json` |
| Hooks | merge into `.claude/settings.json` (below) |
| Pre-push | `cp tools/map/hooks/pre-push .git/hooks/pre-push && chmod +x .git/hooks/pre-push`; with husky/`core.hooksPath`, add its loop to the existing hook |
| Root `CLAUDE.md` | the "Finding code" section (below) |
| First map | `node tools/map/map.mjs generate`, committed with the install |

**Config keys**

| Key | Default | Set it when |
|---|---|---|
| `entryPoints` | `[]` | files run by hand or by a tool the map can't see (`scripts/**/*.mjs`) |
| `entryNames` | `[]` | names a framework calls by convention |
| `tests` / `exclude` | common globs | added to the defaults, never replace them |
| `schema` | `**/*.sql` | migrations live somewhere unusual |
| `messageSenders` | `[]` | messages go through a wrapper, not `sendMessage`/`postMessage` |
| `systemMap` | none | path to the architecture diagram |
| `docs` | `**/CLAUDE.md`, `**/AGENTS.md`, `**/TECH_SPEC.md`, `README.md` | other docs describe the code as it is now |
| `docsIgnore` | `[]` | names a doc mentions on purpose (external tools, things never to add) |

**`.claude/settings.json`**: merge these into any existing `hooks`; don't replace them.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Read", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/tools/map/map.mjs\" hook-read" }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write|MultiEdit", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/tools/map/map.mjs\" hook-edit" }] }
    ]
  }
}
```

| Hook | Does | Never |
|---|---|---|
| `hook-read` | the first whole-file Read of a file over 800 lines is sent back with: the grep, the outline file, and a ranged Read. Repeating the Read allows it | blocks a ranged Read (≤400 lines), a small file, or a second attempt |
| `hook-edit` | after an edit, lists what it left `unused`, a removed name other files still use, new half-pairs, and new not-in-schema tables | blocks, or writes a MAP file |

Both hooks exit 0 on any internal error. A broken map never stops the agent.

## Root `CLAUDE.md` section

Place it after `## Working rules`. Nested `{dir}/CLAUDE.md` files carry no map content.

```markdown
## Finding code
- Start at `MAP.md`, or `grep -rn --include='MAP*.md' "<word>" .` with a word from the task: route, label, table, storage key, message, function.
- Read the `path:start-end` range, not the file. Not enough? Widen in steps: callers and callees (their ranges are in the map), then the enclosing block, then the whole file.
- Ranges are from the last merge to the main branch; if one looks shifted, grep the name in that file.
- MAP files are generated — never edit them, never regenerate them on a branch.
```

## When the map updates

| Moment | What runs |
|---|---|
| Every edit on a branch | `hook-edit` prints what the edit left unused or dangling. No MAP file changes |
| Merging a branch into the main branch | `node tools/map/map.mjs generate`, then commit the MAP files in the same push |
| Merge conflict in a MAP file | take either side, then `generate`. Never resolve a map by hand |
| Push to main/master | pre-push runs `check`; a stale or uncommitted map blocks the push |

The map is regenerated only on the main branch, so branches never conflict over it.

## Dead-code pass

1. `node tools/map/map.mjs report` lists candidates grouped by tag.
2. For each candidate, grep the name as plain text across the repo. Check the frameworks and configs that call code by name.
3. Then decide:
   - delete it, together with the tests that only it keeps alive
   - or mark it `// REMOVE WHEN: <condition>`
   - for a half-pair, add the missing side or delete the orphan side
4. After each deletion, `hook-edit` names anything that just became unused. Follow the chain; the report doesn't compute it ahead of time.

## Stale names in docs

`node tools/map/map.mjs docs` lists inline-code names (`likeThis`, `path/to/file.ts`) in the `docs` files that no longer exist in the code or the repo. It skips fenced code, URLs, dates, gitignored paths, lines with `map:ignore`, and `docsIgnore` names. Run it in Update Mode's drift check and in Next Cycle's full-suite audit.

## Limits

- JS/TS only (`.js .jsx .ts .tsx .mjs .cjs .mts .cts`), plus SQL for the schema.
- Names are matched by name, not by type. A method counts as used if any `.name` use exists anywhere. Two scripts that share a global name can mask each other.
- No transitive dead code: a function used only by dead code still shows `used by`.
- Pairs see literal keys and consts only. A key built at runtime is invisible.
- Only files git tracks, or untracked files it doesn't ignore.
