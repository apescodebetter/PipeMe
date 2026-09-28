// MODULE: finds the project's files, parses them (with a per-file cache), and resolves how they reference each other.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseSource } from './parse.mjs';

export const SOURCE_RE = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/;
const TEXT_REF_RE = /\.(json|html?|ya?ml|toml|sh|ps1|bat|webmanifest)$/;
const LOCKFILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/;
const CACHE_VERSION = 5;

export const DEFAULTS = {
  exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/out/**', '**/.next/**', '**/coverage/**', '**/*.min.js', '**/vendor/**', '**/*.d.ts'],
  skipHidden: true,
  tests: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**', '**/tests/**', '**/test/**', '**/e2e/**'],
  entryPoints: [],
  entryNames: [],
  schema: ['**/*.sql'],
  messageProps: ['type', 'action'],
  messageSenders: [],
  systemMap: null,
  mapName: 'MAP.md',
  maxMapLines: 150,
  minFilesForOwnMap: 3,
  outlineOver: 25,
  largeFileLines: 800,
  maxReadLines: 400,
  // docs that describe the code as it is now; plans and roadmaps name things that don't exist yet
  docs: ['**/CLAUDE.md', '**/AGENTS.md', '**/TECH_SPEC.md', 'README.md'],
  docsExclude: ['**/archive/**', '**/node_modules/**'],
  docsIgnore: [], // names the docs mention on purpose that aren't in this code (external tools, APIs, things never to add)
};

export function repoRoot(start = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: start, encoding: 'utf8' }).trim();
}

export function loadConfig(root, configPath) {
  const file = configPath || path.join(root, 'map.config.json');
  let user = {};
  if (fs.existsSync(file)) user = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cfg = { ...DEFAULTS, ...user };
  for (const k of ['exclude', 'tests']) cfg[k] = [...DEFAULTS[k], ...(user[k] || [])];
  cfg._exclude = cfg.exclude.map(globToRegex);
  cfg._include = (cfg.include || []).map(globToRegex);
  cfg._tests = cfg.tests.map(globToRegex);
  cfg._entry = cfg.entryPoints.map(globToRegex);
  cfg._schema = cfg.schema.map(globToRegex);
  return cfg;
}

export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
export const matchAny = (res, p) => res.some((r) => r.test(p));

export function loadTs(root) {
  if (process.env.MAP_TS_PATH) return createRequire(import.meta.url)(process.env.MAP_TS_PATH);
  const dirs = [root];
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (d.isDirectory() && !d.name.startsWith('.') && fs.existsSync(path.join(root, d.name, 'node_modules', 'typescript'))) dirs.push(path.join(root, d.name));
  }
  for (const dir of dirs) {
    try { return createRequire(path.join(dir, 'noop.js'))('typescript'); } catch { /* try the next place */ }
  }
  try { return createRequire(import.meta.url)('typescript'); } catch { /* fall through */ }
  throw new Error('the map needs the "typescript" package (it only uses its parser). Install it: npm i -D typescript');
}

export function listFiles(root, cfg) {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const all = out.split('\0').filter(Boolean).filter((p) => fs.existsSync(path.join(root, p)));
  const keep = (p) => !matchAny(cfg._exclude, p)
    && !(cfg.skipHidden && p.split('/').some((seg) => seg.startsWith('.')))
    && (cfg._include.length === 0 || matchAny(cfg._include, p));
  const sources = all.filter((p) => SOURCE_RE.test(p) && keep(p)).sort();
  const texts = all.filter((p) => TEXT_REF_RE.test(p) && !LOCKFILES.test(p) && keep(p)).sort();
  const schema = all.filter((p) => matchAny(cfg._schema, p) && keep(p)).sort();
  const docs = all.filter((p) => p.endsWith('.md') && !/(^|\/)MAP(\.[^/]+)?\.md$/.test(p)).sort();
  return { sources, texts, schema, docs, all };
}

// ---- cache: parsed facts live in the OS temp folder, keyed by path + size + mtime, never in the repo
function cachePath(root) {
  const id = crypto.createHash('sha1').update(root).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), 'pipeme-map', `facts-${id}.json`);
}
export function readCache(root) {
  try {
    const c = JSON.parse(fs.readFileSync(cachePath(root), 'utf8'));
    return c.v === CACHE_VERSION ? c.files : {};
  } catch { return {}; }
}
export function writeCache(root, files) {
  const p = cachePath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ v: CACHE_VERSION, files }));
}

export function parseFiles(ts, root, rels, cfg, cache = {}) {
  const facts = new Map();
  const fresh = {};
  const opts = { messageProps: cfg.messageProps, messageSenders: cfg.messageSenders };
  for (const rel of rels) {
    const abs = path.join(root, rel);
    const st = fs.statSync(abs);
    const key = `${st.size}:${Math.floor(st.mtimeMs)}`;
    let f = cache[rel] && cache[rel].key === key ? cache[rel].facts : null;
    if (!f) f = parseSource(ts, rel, fs.readFileSync(abs, 'utf8'), opts);
    fresh[rel] = { key, facts: f };
    facts.set(rel, f);
  }
  return { facts, cache: fresh };
}

// ---- tsconfig paths, so '@/lib/x' resolves like the bundler resolves it
export function loadTsconfigs(ts, root, all) {
  const out = [];
  for (const rel of all.filter((p) => /(^|\/)(tsconfig[^/]*|jsconfig)\.json$/.test(p))) {
    try {
      const { config } = ts.parseConfigFileTextToJson(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
      const co = (config && config.compilerOptions) || {};
      const dir = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
      const baseUrl = co.baseUrl ? path.posix.normalize(path.posix.join(dir, co.baseUrl)) : null;
      out.push({ dir, main: /(tsconfig|jsconfig)\.json$/.test(rel), baseUrl, baseDir: baseUrl ?? dir, paths: co.paths || {} });
    } catch { /* unreadable config: skip */ }
  }
  return out.sort((a, b) => b.dir.length - a.dir.length || Number(b.main) - Number(a.main));
}

export function makeResolver(fileSet, tsconfigs) {
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
  const tryExt = (b) => {
    b = path.posix.normalize(b).replace(/^\.\//, '');
    for (const e of exts) if (fileSet.has(b + e)) return b + e;
    const m = b.match(/\.[mc]?js$/);
    if (m) { const s = b.slice(0, -m[0].length); for (const e of ['.ts', '.tsx', '.mts', '.cts']) if (fileSet.has(s + e)) return s + e; }
    for (const e of exts.slice(1)) if (fileSet.has(`${b}/index${e}`)) return `${b}/index${e}`;
    return null;
  };
  return (spec, fromRel) => {
    const bases = [];
    if (spec.startsWith('.')) bases.push(path.posix.join(path.posix.dirname(fromRel), spec));
    else {
      const cfg = tsconfigs.find((c) => c.dir === '' || fromRel.startsWith(c.dir + '/'));
      if (cfg) {
        for (const [pat, targets] of Object.entries(cfg.paths)) {
          const star = pat.indexOf('*');
          const hit = star === -1 ? spec === pat : spec.startsWith(pat.slice(0, star)) && spec.endsWith(pat.slice(star + 1));
          if (!hit) continue;
          const mid = star === -1 ? '' : spec.slice(star, spec.length - (pat.length - star - 1));
          for (const t of targets) bases.push(path.posix.join(cfg.baseDir, t.replace('*', mid)));
        }
        if (cfg.baseUrl) bases.push(path.posix.join(cfg.baseUrl, spec));
      }
    }
    for (const b of bases) { const r = tryExt(b); if (r) return r; }
    return null;
  };
}

// ---- tables and RPC functions the database actually has, replayed from the SQL files in order
export function readSchema(root, schemaFiles) {
  const tables = new Set();
  const fns = new Set();
  const name = (s) => s.replace(/"/g, '').split('.').pop().toLowerCase();
  for (const rel of schemaFiles) {
    const sql = fs.readFileSync(path.join(root, rel), 'utf8').replace(/--[^\n]*/g, '');
    const re = /\b(create|drop|alter)\s+(?:or\s+replace\s+)?(?:unlogged\s+|temporary\s+|temp\s+)?(table|view|materialized\s+view|function)\s+(?:if\s+(?:not\s+)?exists\s+)?([\w."]+)(?:[\s\S]{0,40}?\brename\s+to\s+([\w."]+))?/gi;
    let m;
    while ((m = re.exec(sql))) {
      const [, verb, kindRaw, target, renamed] = m;
      const kind = kindRaw.toLowerCase();
      const set = kind === 'function' ? fns : tables;
      const n = name(target);
      if (verb.toLowerCase() === 'create') set.add(n);
      else if (verb.toLowerCase() === 'drop') set.delete(n);
      else if (renamed) { set.delete(n); set.add(name(renamed)); }
    }
  }
  return { tables, fns };
}

// ---- files named in JSON/HTML/shell files (manifests, package.json scripts, <script src>)
export function textReferences(root, texts, fileSet) {
  const byBase = new Map();
  for (const f of fileSet) {
    const b = path.posix.basename(f);
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(f);
  }
  const refs = new Map(); // source file → Set of referencing text files
  const add = (target, from) => { if (!refs.has(target)) refs.set(target, new Set()); refs.get(target).add(from); };
  for (const rel of texts) {
    let text;
    try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { continue; }
    if (text.length > 2_000_000) continue;
    const dir = path.posix.dirname(rel);
    for (const m of text.matchAll(/[\w./@-]+\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)\b/g)) {
      const hit = resolveLoose(m[0], dir, fileSet, byBase);
      if (hit) add(hit, rel);
    }
  }
  return { refs, byBase };
}
export function resolveLoose(str, dir, fileSet, byBase) {
  const s = str.replace(/^\.\//, '');
  for (const cand of [path.posix.join(dir, s), s]) {
    const n = path.posix.normalize(cand);
    if (fileSet.has(n)) return n;
  }
  const same = byBase.get(path.posix.basename(s)) || [];
  const suffix = same.filter((f) => f.endsWith('/' + s) || f === s);
  if (suffix.length === 1) return suffix[0];
  const near = same.filter((f) => f.startsWith(dir.split('/')[0] + '/'));
  if (same.length === 1) return same[0];
  if (near.length === 1) return near[0];
  return null;
}

// ---- routes a web framework serves from the file path (Next.js app/ and pages/ routers)
export function frameworkRoute(rel, facts) {
  const m = rel.match(/(?:^|\/)app\/(.*\/)?(page|route|layout)\.(?:js|jsx|ts|tsx)$/);
  if (m) {
    const segs = (m[1] || '').split('/').filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
    const url = '/' + segs.join('/');
    if (m[2] === 'page') return [`page ${url}`];
    if (m[2] === 'layout') return [`layout ${url}`];
    const verbs = facts.symbols.filter((s) => s.exported && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(s.name)).map((s) => s.name);
    return [`${verbs.join(',') || 'route'} ${url}`];
  }
  const p = rel.match(/(?:^|\/)pages\/(.*)\.(?:js|jsx|ts|tsx)$/);
  if (p && !/(^|\/)_(app|document|error)$/.test(p[1])) {
    const url = '/' + p[1].replace(/(^|\/)index$/, '').replace(/^\/?/, '');
    return [url.startsWith('/api') ? `api ${url}` : `page ${url}`];
  }
  return [];
}
