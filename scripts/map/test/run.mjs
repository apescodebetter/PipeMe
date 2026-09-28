// MODULE: end-to-end test — builds a small throwaway git repo, runs every map command and both hooks, checks the results.
// Run: node scripts/map/test/run.mjs   (needs the typescript package; set MAP_TS_PATH if it isn't installed next to this repo)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'map.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeme-map-test-'));
const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const run = (args, input) => spawnSync(process.execPath, [MAP, ...args], { cwd: dir, input, encoding: 'utf8' });
const read = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`ok   ${name}`); } catch (e) { console.log(`FAIL ${name}\n     ${e.message.split('\n').join('\n     ')}`); process.exitCode = 1; } };

// ---------------------------------------------------------------- fixture
w('package.json', JSON.stringify({ name: 'fixture', scripts: { seed: 'node scripts/seed.js' } }));
w('tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] }, jsx: 'react-jsx' } }));
w('CLAUDE.md', '# fixture\n');
w('db/001_init.sql', 'create table passes (id int);\ncreate table if not exists users (id int);\ncreate or replace function claim_quota() returns int as $$ select 1 $$ language sql;\n');
w('src/db/client.ts', 'export const db = { from: (t: string) => t, rpc: (f: string) => f };\n');
w('src/billing/plan.ts', `// MODULE: plans, quotas, refunds.
import { db } from '@/db/client';

// INVARIANT: quota counters are integers — a claim is one guarded UPDATE.
export function getPlan(userId: string) { return db.from('passes') + userId; }

export function claimQuota(userId: string) { return db.rpc('claim_quota') + userId; }

export function oldHelper() { return 1; }

export function onlyTested() { return 2; }

// REMOVE WHEN: no v1 rows remain
export function planFromV1() { return 3; }

export function coupons() { return db.from('coupons'); }
`);
w('src/billing/refund.ts', 'export function refund(id: string) { return id; }\n');
w('src/billing/index.ts', "export { getPlan, claimQuota } from './plan';\nexport * from './refund';\n");
w('src/web/checkout.tsx', `import { getPlan } from '@/billing';
import { coupons } from '../billing/plan';
export default function CheckoutPage() {
  fetch('/api/refund', { method: 'POST' });
  coupons();
  return <button aria-label="Pay now">{getPlan('x') ? 'Buy' : 'Loading…'}</button>;
}
`);
w('src/web/account.tsx', `import * as billing from '../billing';
export function PlanCard() {
  billing.getPlan('a');
  billing.refund('1');
  return <div>Request a refund</div>;
}
`);
w('src/app/account/page.tsx', "import { PlanCard } from '@/web/account';\nexport default function Page() { return <PlanCard />; }\n");
w('src/app/api/refund/route.ts', "import { refund } from '@/billing';\nexport async function POST() { return refund('x'); }\n");
w('ext/manifest.json', JSON.stringify({ background: { scripts: ['bg.js'] }, content_scripts: [{ js: ['shared.js', 'panel.js'] }] }));
w('ext/bg.js', `(function () {
  const KEY = "extToken";
  function handle(msg) {
    if (msg.type === "extPing") return 1;
    if (msg.type === "extGhost") return 2;
  }
  chrome.runtime.onMessage.addListener(handle);
  chrome.storage.local.get(KEY);
  chrome.storage.local.get("extNeverWritten");
  function deadInside() { return 0; }
})();
`);
w('ext/panel.js', `(function () {
  chrome.runtime.sendMessage({ type: "extPing" });
  chrome.runtime.sendMessage({ type: "extOrphan" });
  chrome.storage.local.set({ extToken: "t" });
  window.shared.helper();
})();
`);
w('ext/shared.js', '(function () {\n  function helper() { return 1; }\n  function unusedShared() { return 2; }\n  window.shared = { helper, unusedShared };\n})();\n');
w('ext/orphan.js', 'function lonely() { return 1; }\n');
w('tests/plan.test.ts', "import { onlyTested } from '../src/billing/plan';\nonlyTested();\n");
w('scripts/seed.js', 'console.log("seed");\n');
w('src/big.js', Array.from({ length: 900 }, (_, i) => `// line ${i}`).join('\n') + '\n');
w('src/billing/CLAUDE.md', 'Uses `getPlan` and `src/billing/plan.ts`. Old: `removedThing`, `src/nowhere.ts`. Build: `dist/app.js`, since `09/2014`, see `example.com/jobs`.\n');
w('.gitignore', 'dist/\ntools/\n');
w('ROADMAP.md', 'Next: add `futureThing`.\n');
execFileSync('git', ['init', '-q'], { cwd: dir });
execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: dir });
execFileSync('git', ['add', '-A'], { cwd: dir });
execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'fixture'], { cwd: dir });

// ---------------------------------------------------------------- generate
const gen = run(['generate']);
test('generate runs', () => assert.equal(gen.status, 0, gen.stderr));
const all = () => fs.readdirSync(dir, { recursive: true }).filter((p) => /(^|[\\/])MAP(\.[^\\/]+)?\.md$/.test(p)).map((p) => read(p)).join('\n');
const maps = all();
const line = (needle) => maps.split('\n').find((l) => l.includes(needle)) || '';

test('unused export is tagged', () => assert.match(line('plan.ts:9 '), /oldHelper\(\)\s+unused\s+\[unused\]/));
test('export used only by tests is tagged', () => assert.match(line('onlyTested()'), /tests only\s+\[tests-only\]/));
test('REMOVE WHEN comment becomes keep-until', () => assert.match(line('planFromV1()'), /\[keep until: no v1 rows remain\]/));
test('import through a barrel counts', () => assert.match(line('getPlan(userId)'), /used by 2 files/));
test('barrel re-export alone is not a use', () => assert.match(line('claimQuota(userId)'), /\[unused\]/));
test('namespace import through star re-export counts', () => assert.match(line('refund(id)'), /used by 2 files/));
test('table missing from the schema is flagged', () => assert.match(maps, /tables passes, coupons.*\[not in schema: coupons\]|tables coupons, passes.*\[not in schema: coupons\]/));
test('rpc that exists is not flagged', () => assert.doesNotMatch(maps, /not in schema: .*rpc claim_quota/));
test('framework page and route are entries', () => { assert.match(line('page.tsx:2'), /entry/); assert.match(line('route.ts:2'), /entry/); });
test('routes and fetch calls are recorded', () => { assert.match(maps, /routes {4}POST \/api\/refund/); assert.match(maps, /routes {4}page \/account/); assert.match(maps, /calls {5}\/api\/refund/); });
test('labels are recorded', () => { assert.match(maps, /"Pay now"/); assert.match(maps, /"Request a refund"/); assert.match(maps, /"Loading…"/); });
test('invariant is listed', () => assert.match(maps, /invariant src\/billing\/plan\.ts:4 {2}quota counters are integers/));
test('module purpose comes from MODULE:', () => assert.match(maps, /purpose {3}plans, quotas, refunds\./));
test('tests covering a file are listed', () => assert.match(line('src/billing/plan.ts  '), /tests: tests\/plan\.test\.ts/));
test('private IIFE function with no callers is unused', () => assert.match(line('deadInside()'), /\[unused\]/));
test('window-exposed helper used by another script', () => assert.match(line('helper()'), /used by 1 file/));
test('window-exposed but never called is unused', () => assert.match(line('unusedShared()'), /\[unused\]/));
test('message handled but never sent', () => assert.match(maps, /message extGhost: handled, never sent {2}\[half-pair\]/));
test('message sent but never handled', () => assert.match(maps, /message extOrphan: sent, never handled {2}\[half-pair\]/));
test('storage read but never written', () => assert.match(maps, /storage extNeverWritten: read, never written {2}\[half-pair\]/));
test('storage pair via a constant is complete', () => assert.doesNotMatch(maps, /extToken: /));
test('file nothing loads is unused-file', () => assert.match(maps, /ext\/orphan\.js[\s\S]*\[unused-file\]/));
test('script named in package.json is loaded', () => assert.doesNotMatch(maps, /scripts\/seed\.js[^\n]*\n[^\n]*unused-file/));
test('root map has find instructions and tag totals', () => { const r = read('MAP.md'); assert.match(r, /grep -rn --include='MAP\*\.md'/); assert.match(r, /Tags: unused \d/); });

// ---------------------------------------------------------------- MAP.html
const html = read('MAP.html');
test('MAP.html is written with the maps', () => {
  assert.match(html, /^<!DOCTYPE html>\n<!-- MAP /);
  const data = JSON.parse(html.match(/<script type="application\/json" id="map-data">([\s\S]*?)<\/script>/)[1]);
  assert.ok(data.some((r) => r[0] === 'S' && r[1] === 'getPlan'), 'a row for getPlan');
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]); // the viewer compiles
});
test('MAP.html never counts as a reference', () => assert.match(run(['report']).stdout, /## unused-file \(\d+\)\n(?: {2}.*\n)* {2}ext\/orphan\.js/));

// ---------------------------------------------------------------- check, report, docs
test('check passes right after generate', () => assert.equal(run(['check']).status, 0));
test('check notices a stale MAP.html', () => {
  fs.writeFileSync(path.join(dir, 'MAP.html'), html.replace('"getPlan"', '"getPlanX"'));
  const r = run(['check']);
  fs.writeFileSync(path.join(dir, 'MAP.html'), html);
  assert.equal(r.status, 1); assert.match(r.stderr, /stale\s+MAP\.html/);
});
w('src/billing/refund.ts', 'export function refund(id: string) { return id; }\nexport function refundAll() { return 0; }\n');
test('check fails when code changed', () => { const r = run(['check']); assert.equal(r.status, 1); assert.match(r.stderr, /stale\s+src\/billing\/MAP\.md|stale\s+src\/MAP\.md|stale\s+MAP\.md/); });
test('report lists candidates by tag', () => { const r = run(['report']).stdout; assert.match(r, /## unused/); assert.match(r, /refundAll/); });
test('docs finds names that no longer exist', () => {
  const r = run(['docs']).stdout;
  assert.match(r, /CLAUDE\.md:1 {2}removedThing/); assert.match(r, /src\/nowhere\.ts/);
  for (const noise of ['dist/app.js', '09/2014', 'example.com', 'futureThing']) assert.ok(!r.includes(noise), noise);
  assert.doesNotMatch(r, / getPlan /); assert.doesNotMatch(r, /src\/billing\/plan\.ts {2}—/);
});
fs.cpSync(path.dirname(MAP), path.join(dir, 'tools/map'), { recursive: true, filter: (p) => !p.includes(`${path.sep}test`) });
const prePush = (remoteRef) => spawnSync('sh', [path.join(dir, 'tools/map/hooks/pre-push')], { cwd: dir, input: `refs/heads/x 1 ${remoteRef} 0\n`, encoding: 'utf8' });
test('pre-push blocks uncommitted MAP files', () => assert.match(prePush('refs/heads/master').stderr, /uncommitted/));
execFileSync('git', ['add', '-A'], { cwd: dir });
execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'maps'], { cwd: dir });
test('pre-push blocks a stale map going to master', () => { const r = prePush('refs/heads/master'); assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /stale/); });
test('pre-push ignores other branches', () => assert.equal(prePush('refs/heads/feature').status, 0));

// ---------------------------------------------------------------- hooks
const readHook = (session, extra = {}) => run(['hook-read'], JSON.stringify({ session_id: session, cwd: dir, tool_name: 'Read', tool_input: { file_path: path.join(dir, 'src/big.js'), ...extra } }));
test('hook-read blocks the first whole read of a large file', () => { const r = readHook('s1'); assert.equal(r.status, 2); assert.match(r.stderr, /900 lines/); assert.match(r.stderr, /repeat this exact Read/); });
test('hook-read allows the second attempt', () => assert.equal(readHook('s1').status, 0));
test('hook-read allows a ranged read', () => assert.equal(readHook('s2', { offset: 100, limit: 50 }).status, 0));
test('hook-read ignores small files', () => {
  const r = run(['hook-read'], JSON.stringify({ session_id: 's3', cwd: dir, tool_input: { file_path: path.join(dir, 'src/db/client.ts') } }));
  assert.equal(r.status, 0);
});

run(['generate']);
const editHook = (rel) => run(['hook-edit'], JSON.stringify({ session_id: 's4', cwd: dir, tool_name: 'Edit', tool_input: { file_path: path.join(dir, rel) } }));
w('src/web/checkout.tsx', read('src/web/checkout.tsx').replace("import { coupons } from '../billing/plan';\n", '').replace('  coupons();\n', ''));
test('hook-edit says what an edit left unused', () => {
  const r = editHook('src/web/checkout.tsx');
  assert.equal(r.status, 0);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /now unused: src\/billing\/plan\.ts:\d+(-\d+)? coupons\(\)/);
});
w('src/billing/refund.ts', 'export function refundAll() { return 0; }\n');
test('hook-edit says when a removed function is still used', () => {
  const ctx = JSON.parse(editHook('src/billing/refund.ts').stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /removed refund from src\/billing\/refund\.ts, but .*src\/app\/api\/refund\/route\.ts/);
});
test('hook-edit stays quiet when nothing changed', () => assert.equal(editHook('src/billing/refund.ts').stdout, ''));
test('hooks never fail loudly on bad input', () => { for (const h of ['hook-edit', 'hook-read', 'hook-guard']) assert.equal(run([h], 'not json').status, 0, h); assert.equal(run(['hook-read'], '{}').status, 0); });

// ---------------------------------------------------------------- guardrails: MAP files hold only generator output
const guard = (file) => run(['hook-guard'], JSON.stringify({ session_id: 'g', cwd: dir, tool_name: 'Edit', tool_input: { file_path: path.join(dir, file) } }));
test('hook-guard refuses an edit to a MAP file', () => { const r = guard('src/MAP.md'); assert.equal(r.status, 2); assert.match(r.stderr, /refused[\s\S]*only what `generate` writes/); });
test('hook-guard refuses MAP.html and a new MAP-named file', () => { assert.equal(guard('MAP.html').status, 2); assert.equal(guard('docs/MAP.notes.md').status, 2); });
test('hook-guard lets every other file through', () => { assert.equal(guard('src/billing/plan.ts').status, 0); assert.equal(guard('docs/map.md').status, 0); });
run(['generate']);
execFileSync('git', ['add', '-A'], { cwd: dir });
const preCommit = () => spawnSync('sh', [path.join(dir, 'tools/map/hooks/pre-commit')], { cwd: dir, encoding: 'utf8' });
test('pre-commit accepts freshly generated MAP files', () => { const r = preCommit(); assert.equal(r.status, 0, r.stderr); });
fs.appendFileSync(path.join(dir, 'src/MAP.md'), '\nTODO: refactor this folder later\n');
w('docs/MAP.notes.md', '# notes about the map\n');
execFileSync('git', ['add', '-A'], { cwd: dir });
test('pre-commit refuses a hand edit and a hand-made MAP file', () => {
  const r = preCommit();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /hand-edited\s+src\/MAP\.md/); assert.match(r.stderr, /not generated\s+docs\/MAP\.notes\.md/);
});
test('check flags a MAP-named file the generator did not write', () => assert.match(run(['check']).stderr, /not generated\s+docs\/MAP\.notes\.md/));
test('generate leaves a stray MAP-named file for a person to rename', () => { run(['generate']); assert.ok(fs.existsSync(path.join(dir, 'docs/MAP.notes.md'))); });
execFileSync('git', ['reset', '-q'], { cwd: dir });
fs.rmSync(path.join(dir, 'docs/MAP.notes.md'));
w('.worktrees/other/MAP.md', '# MAP — another branch checked out here\n');
test('generate never touches MAP files in hidden folders (worktrees)', () => { run(['generate']); assert.ok(fs.existsSync(path.join(dir, '.worktrees/other/MAP.md'))); });
test('an installed copy leaves its own folder out of the map', () => {
  w('.gitignore', 'dist/\n');
  const out = path.join(dir, '.preview');
  const r = spawnSync(process.execPath, [path.join(dir, 'tools/map/map.mjs'), 'generate', '--out', out], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const text = fs.readdirSync(out, { recursive: true }).filter((p) => p.endsWith('.md')).map((p) => fs.readFileSync(path.join(out, p), 'utf8')).join('\n');
  assert.match(text, /src\/billing/); assert.doesNotMatch(text, /^\s*tools\/map\//m);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''} · fixture: ${dir}`);
if (!process.exitCode) fs.rmSync(dir, { recursive: true, force: true });
