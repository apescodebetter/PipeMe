#!/usr/bin/env node
// MODULE: command line for the code map — generate, check, report, docs, and the Claude Code hooks.
//   generate [--out DIR]   write the MAP files and MAP.html (into the repo, or into DIR to preview)
//   check [--staged]       exit 1 unless every MAP file on disk (or staged for commit) is exactly what generate writes
//   report                 dead-code candidates, grouped by tag
//   docs                   names in the docs (`like this`) that no longer exist in the code
//   hook-read              PreToolUse(Read): send whole-file reads of large files to the map first
//   hook-guard             PreToolUse(Edit|Write|MultiEdit): refuse any hand edit to a MAP file
//   hook-edit              PostToolUse(Edit|Write|MultiEdit): say what an edit left unused or dangling
// Shared flags: --root DIR (default: the git repo around the current folder), --config FILE (default: map.config.json)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  repoRoot, loadConfig, loadTs, listFiles, parseFiles, readCache, writeCache, loadTsconfigs,
  makeResolver, readSchema, textReferences, SOURCE_RE, MAP_FILE_RE, matchAny,
} from './lib/analyze.mjs';
import { parseSource } from './lib/parse.mjs';
import { buildGraph } from './lib/graph.mjs';
import { renderMaps, outlinePath } from './lib/render.mjs';
import { renderView } from './lib/view.mjs';
import { staleNames } from './lib/docs.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
// only files this tool wrote: a MAP*.md starting with "# MAP", or MAP.html carrying the marker comment on its second line
const isGenerated = (text) => text.startsWith('# MAP') || /^<!DOCTYPE html>\r?\n<!-- MAP /.test(text);
const HARD_RULE = 'MAP files hold only what `generate` writes: no notes, TODOs or explanations. '
  + 'To change what a map says, change the code it describes or the generator (tools/map/), then run generate.';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };

try {
  if (cmd === 'hook-read') await hookRead();
  else if (cmd === 'hook-guard') await hookGuard();
  else if (cmd === 'hook-edit') await hookEdit();
  else if (cmd === 'generate') generate();
  else if (cmd === 'check') check();
  else if (cmd === 'report') report();
  else if (cmd === 'docs') docs();
  else {
    process.stdout.write(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 10).map((l) => l.replace(/^\/\/ ?/, '')).join('\n') + '\n');
    process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  if (cmd && cmd.startsWith('hook-')) process.exit(0); // a broken hook must never block the agent
  console.error(`map: ${e.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------- pipeline
function setup(root = flag('--root') || repoRoot()) {
  const cfg = loadConfig(root, flag('--config'));
  const ts = loadTs(root);
  const list = listFiles(root, cfg);
  return { root, cfg, ts, list };
}

function analyze({ root, cfg, ts, list }, override) {
  const cache = readCache(root);
  const { facts, cache: fresh } = parseFiles(ts, root, list.sources, cfg, cache);
  writeCache(root, fresh);
  if (override) for (const [rel, f] of override) { if (f) facts.set(rel, f); else facts.delete(rel); }
  return { facts, ...graphFor(facts, { root, cfg, ts, list }) };
}

function graphFor(facts, { root, cfg, ts, list }) {
  const fileSet = new Set(facts.keys());
  const resolve = makeResolver(fileSet, loadTsconfigs(ts, root, list.all));
  const { refs: textRefs, byBase } = textReferences(root, list.texts, fileSet);
  const schema = readSchema(root, list.schema);
  return { graph: buildGraph(facts, { cfg, resolve, textRefs, byBase, schema }) };
}

function maps(env, graph) {
  const inside = !path.relative(env.root, TOOL_DIR).startsWith('..');
  const command = env.cfg.command || (inside ? `node ${path.relative(env.root, path.join(TOOL_DIR, 'map.mjs')).split(path.sep).join('/')}` : 'node tools/map/map.mjs');
  const ctx = {
    cfg: env.cfg,
    docs: new Set(env.list.docs),
    readDoc: (p) => fs.readFileSync(path.join(env.root, p), 'utf8'),
    repoName: env.cfg.name || path.basename(env.root),
    command,
  };
  const out = renderMaps(graph, ctx);
  out.set('MAP.html', renderView(graph, ctx));
  return out;
}

// MAP-named files under root: `generated` carry this tool's marker, `stray` don't (someone wrote them by hand).
// Hidden folders and nested checkouts (.claude/worktrees/…) belong to other branches: never read, never cleaned.
function scanMaps(root) {
  const generated = [];
  const stray = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      const rel = path.relative(root, p).split(path.sep).join('/');
      if (e.isDirectory()) { if (!fs.existsSync(path.join(p, '.git'))) walk(p); }
      else if (MAP_FILE_RE.test(e.name)) (isGenerated(fs.readFileSync(p, 'utf8')) ? generated : stray).push(rel);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return { generated, stray };
}
function existingMaps(root) { return scanMaps(root).generated; }

// ---------------------------------------------------------------- commands
function generate() {
  const env = setup();
  const { graph } = analyze(env);
  const out = maps(env, graph);
  const target = flag('--out') ? path.resolve(flag('--out')) : env.root;
  const keep = new Set(out.keys());
  for (const old of existingMaps(target)) if (!keep.has(old)) fs.rmSync(path.join(target, old));
  let bytes = 0;
  for (const [rel, text] of out) {
    const p = path.join(target, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    if (rel.endsWith('.md')) bytes += Buffer.byteLength(text);
  }
  console.log(`map: ${out.size - 1} MAP files, ~${Math.round(bytes / 4 / 1000)}k tokens for agents → ${target === env.root ? 'repo' : target}`);
  console.log(`view: ${path.join(target, 'MAP.html')} (${Math.round(Buffer.byteLength(out.get('MAP.html')) / 1024)} KB) — open it in a browser`);
  console.log(`tags: ${Object.entries(graph.summary).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}`);
}

function check() {
  const env = setup();
  if (args.includes('--staged')) return checkStaged(env);
  const { graph } = analyze(env);
  const out = maps(env, graph);
  const { generated, stray } = scanMaps(env.root);
  const onDisk = new Set(generated);
  const problems = [];
  for (const [rel, text] of out) {
    if (!onDisk.has(rel)) problems.push(`missing  ${rel}`);
    else if (fs.readFileSync(path.join(env.root, rel), 'utf8').replace(/\r\n/g, '\n') !== text) problems.push(`stale    ${rel}`);
  }
  for (const rel of onDisk) if (!out.has(rel)) problems.push(`extra    ${rel}`);
  for (const rel of stray) problems.push(`not generated  ${rel} — MAP file names belong to the map; rename it`);
  if (problems.length) {
    console.error(`map: ${problems.length} map file(s) don't match the code:\n  ${problems.slice(0, 20).join('\n  ')}`);
    console.error(`${HARD_RULE}\nRun: ${env.cfg.command || 'node tools/map/map.mjs'} generate — then commit the MAP files.`);
    process.exit(1);
  }
  console.log('map: up to date');
}

// pre-commit: every staged MAP file must be byte-for-byte what generate writes — however it was edited (tool, shell, editor, person)
function checkStaged(env) {
  const raw = execFileSync('git', ['diff', '--cached', '--name-status', '--no-renames', '-z'], { cwd: env.root, encoding: 'utf8' });
  const parts = raw.split('\0').filter(Boolean);
  const staged = [];
  for (let i = 0; i + 1 < parts.length; i += 2) if (MAP_FILE_RE.test(parts[i + 1])) staged.push({ status: parts[i], rel: parts[i + 1] });
  if (!staged.length) return;
  const { graph } = analyze(env);
  const out = maps(env, graph);
  const problems = [];
  for (const { status, rel } of staged) {
    if (status === 'D') { if (out.has(rel)) problems.push(`deleted        ${rel} — generate still writes it`); continue; }
    const text = execFileSync('git', ['show', `:${rel}`], { cwd: env.root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).replace(/\r\n/g, '\n');
    if (!out.has(rel)) problems.push(`not generated  ${rel} — MAP file names belong to the map`);
    else if (text !== out.get(rel)) problems.push(`hand-edited    ${rel} — or generated from older code`);
  }
  if (problems.length) {
    console.error(`map: commit refused — ${problems.length} staged MAP file(s) aren't generator output:\n  ${problems.join('\n  ')}`);
    console.error(`${HARD_RULE}\nUndo: git restore --staged <file> && git restore <file>. Or regenerate: ${env.cfg.command || 'node tools/map/map.mjs'} generate, then stage the result.`);
    process.exit(1);
  }
}

function report() {
  const env = setup();
  const { graph } = analyze(env);
  const groups = {};
  const add = (tag, line) => { (groups[tag] ||= []).push(line); };
  for (const [rel, r] of [...graph.files].sort(([a], [b]) => a.localeCompare(b))) {
    for (const s of r.symbols) for (const t of s.tags) add(t.startsWith('keep') ? 'keep' : t, `${rel}:${s.start}  ${s.sig}${t.startsWith('keep') ? `  (${t})` : ''}`);
    for (const p of r.pairs) add('half-pair', `${rel}  ${p.kind} ${p.key}: ${p.issue}`);
    for (const x of r.notInSchema) add('not-in-schema', `${rel}  ${x}`);
    for (const t of r.tags) add(t, rel);
  }
  const order = ['unused-file', 'unused', 'tests-only', 'half-pair', 'not-in-schema', 'keep'];
  let total = 0;
  for (const k of order) {
    if (!groups[k]) continue;
    total += groups[k].length;
    console.log(`\n## ${k} (${groups[k].length})`);
    for (const l of groups[k]) console.log(`  ${l}`);
  }
  console.log(total ? `\n${total} candidates. Before deleting: grep the name as plain text (strings, message types, HTML) and check it isn't called by a framework or config.` : 'No dead-code candidates.');
}

function docs() {
  const env = setup();
  const { facts } = analyze(env);
  const found = staleNames(env, facts);
  for (const f of found) console.log(`${f.doc}:${f.line}  ${f.name}  — ${f.why}`);
  console.log(found.length ? `\n${found.length} name(s) in the docs don't match the code.` : 'docs: every code name found.');
  if (found.length && args.includes('--strict')) process.exit(1);
}

// ---------------------------------------------------------------- hooks
async function stdinJson() {
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  return JSON.parse(s || '{}');
}

function rootFrom(input) {
  const start = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try { return repoRoot(start); } catch { return start; }
}

async function hookRead() {
  const input = await stdinJson();
  const ti = input.tool_input || {};
  const file = ti.file_path;
  if (!file || /\.(png|jpe?g|gif|webp|bmp|ico|svg|pdf|ipynb|zip|gz)$/i.test(file) || !fs.existsSync(file)) return;
  const root = rootFrom(input);
  const cfg = loadConfig(root, null);
  if (typeof ti.limit === 'number' && ti.limit <= cfg.maxReadLines) return;
  if (fs.statSync(file).size > 64 * 1024 * 1024) return;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  if (lines <= cfg.largeFileLines) return;

  const stateFile = path.join(os.tmpdir(), 'pipeme-map', `read-${String(input.session_id || 'none').replace(/[^\w-]/g, '')}.json`);
  let seen = [];
  try { seen = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* first large read this session */ }
  const key = path.resolve(file);
  if (seen.includes(key)) return; // second attempt: the agent decided it needs the whole file
  seen.push(key);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(seen));

  const rel = path.relative(root, file).split(path.sep).join('/');
  const inside = !rel.startsWith('..');
  const outline = inside && fs.existsSync(path.join(root, outlinePath(rel))) ? outlinePath(rel) : null;
  const msg = [
    `${inside ? rel : file} is ${lines.toLocaleString('en-US')} lines. Read only the part you need:`,
    `  1. Find it: grep -n "<function or text>" ${inside ? rel : file}${inside ? `   or   grep -rn --include='MAP*.md' "<word>" .` : ''}`,
    outline ? `     This file's outline (every function with its line range): ${outline}` : null,
    `  2. Read that range: Read with offset and limit (up to ${cfg.maxReadLines} lines).`,
    '  3. Not enough? Widen step by step: the functions it calls and its callers, then the surrounding block.',
    '  If you really need the whole file, repeat this exact Read — it will be allowed.',
  ].filter(Boolean).join('\n');
  process.stderr.write(msg + '\n');
  process.exit(2);
}

// Refuses Edit/Write/MultiEdit on any MAP-named file: maps change only by `generate`, never by hand
async function hookGuard() {
  const input = await stdinJson();
  const ti = input.tool_input || {};
  const hit = [ti.file_path, ...((ti.file_edits || []).map((e) => e.file_path))].filter(Boolean).find((p) => MAP_FILE_RE.test(path.basename(p)));
  if (!hit) return;
  process.stderr.write(`${path.basename(hit)} is generated by the code map — this edit is refused.\n${HARD_RULE}\n`
    + 'The map is regenerated when a branch merges into the main branch.\n');
  process.exit(2);
}

async function hookEdit() {
  const input = await stdinJson();
  const ti = input.tool_input || {};
  const paths = [ti.file_path, ...((ti.file_edits || []).map((e) => e.file_path))].filter(Boolean);
  const root = rootFrom(input);
  const rels = paths.map((p) => path.relative(root, path.resolve(root, p)).split(path.sep).join('/')).filter((r) => !r.startsWith('..') && SOURCE_RE.test(r));
  if (!rels.length) return;
  const env = setup(root);
  const rel = rels[0];
  if (!env.list.sources.includes(rel)) return;

  // "before" = what the cache last saw for this file, else the committed version
  const cache = readCache(root);
  let before = cache[rel]?.facts ?? null;
  if (!before) {
    try {
      const old = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
      before = parseSource(env.ts, rel, old, { messageProps: env.cfg.messageProps, messageSenders: env.cfg.messageSenders });
    } catch { before = null; }
  }
  const now = analyze(env);
  const beforeFacts = new Map(now.facts);
  if (before) beforeFacts.set(rel, before); else beforeFacts.delete(rel);
  const was = graphFor(beforeFacts, env).graph;
  const is = now.graph;

  const notes = [];
  const tagged = (g) => {
    const m = new Map();
    for (const [f, r] of g.files) for (const s of r.symbols) if (s.tags.some((t) => t === 'unused' || t === 'tests-only')) m.set(`${f}\0${s.name}`, { f, s });
    return m;
  };
  const wasTagged = tagged(was);
  for (const [k, { f, s }] of tagged(is)) {
    const existed = was.files.get(f)?.symbols.some((x) => x.name === s.name);
    if (!wasTagged.has(k) && existed) notes.push(`now ${s.tags[0]}: ${f}:${s.start}-${s.end} ${s.sig} — delete it, or mark it // REMOVE WHEN: <condition>`);
  }
  // names this edit removed that other files still mention
  const afterNames = new Set((now.facts.get(rel)?.symbols || []).map((s) => s.name));
  for (const s of before?.symbols || []) {
    if (afterNames.has(s.name) || s.method) continue;
    const users = was.users.get(`${rel}\0${s.name}`) || new Set();
    const still = [...users].filter((u) => {
      const f = now.facts.get(u);
      return f && (f.identNames.includes(s.name) || f.imports.some((i) => (i.named || []).some((x) => x.imported === s.name)));
    });
    if (still.length) notes.push(`removed ${s.name} from ${rel}, but ${still.slice(0, 4).join(', ')}${still.length > 4 ? ` +${still.length - 4}` : ''} still use it`);
  }
  const pairKey = (p) => `${p.kind}\0${p.key}\0${p.issue}`;
  const oldPairs = new Set((was.files.get(rel)?.pairs || []).map(pairKey));
  for (const p of is.files.get(rel)?.pairs || []) if (!oldPairs.has(pairKey(p))) notes.push(`${p.kind} ${p.key} is now ${p.issue} (${rel})`);
  const oldSchema = new Set(was.files.get(rel)?.notInSchema || []);
  for (const t of is.files.get(rel)?.notInSchema || []) if (!oldSchema.has(t)) notes.push(`${rel} uses ${t}, which the database schema doesn't have`);

  if (!notes.length) return;
  const text = `Code map after editing ${rel}:\n- ${notes.slice(0, 12).join('\n- ')}${notes.length > 12 ? `\n- …and ${notes.length - 12} more (run: map report)` : ''}`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }));
}

export { matchAny };
