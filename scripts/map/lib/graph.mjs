// MODULE: joins per-file facts into one picture: who uses each symbol and file, which tests cover it, and the dead-code tags.
import path from 'node:path';
import { matchAny, SOURCE_RE, resolveLoose, frameworkRoute } from './analyze.mjs';

const NEXT_SPECIAL = /(?:^|\/)app\/(?:.*\/)?(page|layout|route|loading|error|global-error|not-found|template|default|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.(js|jsx|ts|tsx)$/;
const ROOT_SPECIAL = /(?:^|\/)(middleware|proxy|instrumentation|instrumentation-client)\.(js|ts|mjs)$/;
const CONFIG_FILE = /(?:^|\/)[^/]+\.config\.(js|cjs|mjs|ts|mts|cts)$|(?:^|\/)sentry\.[\w.-]+\.(js|ts)$/;
const FRAMEWORK_NAMES = new Set(['default', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'metadata',
  'generateMetadata', 'generateStaticParams', 'generateViewport', 'viewport', 'dynamic', 'dynamicParams', 'revalidate',
  'runtime', 'fetchCache', 'preferredRegion', 'maxDuration', 'config', 'middleware', 'proxy', 'register',
  'onRequestError', 'onRouterTransitionStart']);
export const MESSAGE_LIKE = /^[a-z]+[A-Z]\w*$|^[A-Z][A-Z0-9_]{2,}$|^[\w-]+:[\w:-]+$/;
const uniqList = (a) => [...new Set(a)];

export function buildGraph(files, ctx) {
  const { cfg, resolve, textRefs, byBase, schema } = ctx;
  const fileSet = new Set(files.keys());
  const isTest = (rel) => matchAny(cfg._tests, rel);
  const entryNames = new Set(cfg.entryNames);

  // name → files mentioning it (as a bare identifier, or as .property)
  const byIdent = new Map();
  const byProp = new Map();
  const index = (map, name, rel) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(rel); };
  for (const [rel, f] of files) {
    for (const n of f.identNames) index(byIdent, n, rel);
    for (const n of f.propNames) index(byProp, n, rel);
  }
  const topNames = new Map();
  for (const [rel, f] of files) topNames.set(rel, new Set(f.symbols.filter((s) => !s.method).map((s) => s.name)));

  // symbol users: key "file\0name" → Set of files
  const users = new Map();
  const addUser = (file, name, user) => {
    const k = `${file}\0${name}`;
    if (!users.has(k)) users.set(k, new Set());
    users.get(k).add(user);
  };
  const fileRefs = new Map(); // file → Set of files that import it or name it
  const addFileRef = (file, from) => { if (!fileRefs.has(file)) fileRefs.set(file, new Set()); fileRefs.get(file).add(from); };

  const exportsOf = (rel) => {
    const out = new Map();
    for (const s of files.get(rel)?.symbols || []) for (const as of s.exported || []) out.set(as, s.name);
    return out;
  };
  const exportCache = new Map();
  const exp = (rel) => { if (!exportCache.has(rel)) exportCache.set(rel, exportsOf(rel)); return exportCache.get(rel); };

  // which file really defines `name` when it's imported from `rel` (follows barrels / re-exports)
  const definers = (rel, name, depth = 0) => {
    if (depth > 5 || !files.has(rel)) return [];
    const local = exp(rel).get(name);
    if (local) return [[rel, local]];
    const out = [];
    for (const re of files.get(rel).reexports) {
      const t = resolve(re.spec, rel);
      if (!t) continue;
      if (re.star) out.push(...definers(t, name, depth + 1));
      else for (const n of re.names || []) if (n.as === name) { addFileRef(t, rel); out.push(...definers(t, n.imported, depth + 1)); }
    }
    return out;
  };

  for (const [g, f] of files) {
    for (const imp of f.imports) {
      const t = resolve(imp.spec, g);
      if (!t || t === g) continue;
      addFileRef(t, g);
      const names = [];
      if (imp.default) names.push('default');
      for (const n of imp.named || []) names.push(n.imported);
      for (const n of names) for (const [d, local] of definers(t, n)) { addUser(d, local, g); addFileRef(d, g); }
      if (imp.ns) {
        // namespace import / require / import(): count the exports the importer touches as .name, and the default
        for (const [as, local] of exp(t)) if (as === 'default' || f.propNames.includes(as)) addUser(t, local, g);
        for (const re of files.get(t).reexports) {
          const rt = resolve(re.spec, t);
          if (rt) for (const [as, local] of exp(rt)) if (f.propNames.includes(as)) addUser(rt, local, g);
        }
      }
    }
    for (const re of f.reexports) {
      const t = resolve(re.spec, g);
      if (!t) continue;
      addFileRef(t, g);
      // a framework file re-exporting by name (`export { updateSession as proxy } from …`) is the framework using it;
      // an ordinary barrel is not — its importers are credited through definers() instead
      if (NEXT_SPECIAL.test(g) || ROOT_SPECIAL.test(g) || CONFIG_FILE.test(g) || matchAny(cfg._entry, g)) {
        for (const nm of re.names || []) for (const [d, local] of definers(t, nm.imported)) addUser(d, local, g);
      }
    }
    for (const s of f.strings) {
      if (!SOURCE_RE.test(s)) continue;
      const hit = resolveLoose(s, path.posix.dirname(g), fileSet, byBase);
      if (hit && hit !== g) addFileRef(hit, g);
    }
  }

  // scripts without import/export share one global scope with other scripts (and the tests that load them).
  // A name declared inside a script's IIFE is private: other files reach it only through a window.X = {…} member.
  const sameWorld = (g) => !files.get(g).module || isTest(g);
  for (const [rel, f] of files) {
    if (f.module) continue;
    const exposed = new Set(f.globals.flatMap((gl) => gl.members));
    for (const s of f.symbols) {
      let pool;
      if (s.method) pool = byProp.get(s.method) || [];
      else {
        pool = [...(exposed.has(s.name) ? byProp.get(s.name) || [] : [])];
        if (!s.private) pool.push(...(byIdent.get(s.name) || []));
      }
      for (const g of pool) {
        if (g === rel || !sameWorld(g)) continue;
        if (!s.method && !s.private && topNames.get(g).has(s.name)) continue; // that file has its own
        addUser(rel, s.name, g);
      }
    }
  }
  // class methods in modules: any .method use outside the class counts (names are not resolved by type)
  for (const [rel, f] of files) {
    if (!f.module) continue;
    for (const s of f.symbols) if (s.method) for (const g of byProp.get(s.method) || []) if (g !== rel) addUser(rel, s.name, g);
  }

  // project-wide pairs
  const pairsIn = (pick) => {
    const m = new Map();
    for (const [rel, f] of files) for (const k of pick(f)) { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(rel); }
    return m;
  };
  const reads = pairsIn((f) => f.storage.read);
  const writes = pairsIn((f) => f.storage.write);
  const handled = pairsIn((f) => f.messages.handled.filter((v) => MESSAGE_LIKE.test(v)));
  const literals = pairsIn((f) => f.messages.literals);
  const strings = pairsIn((f) => f.strings);
  const objKeys = pairsIn((f) => f.objectKeys || []);
  // a message name counts as handled/sent if it shows up anywhere else too: a Set of names, a lookup table, a switch on a local
  const mentionedElsewhere = (v, except) => [...(strings.get(v) || []), ...(objKeys.get(v) || [])]
    .some((g) => !except.has(g) && !(files.get(g).messages.literals.includes(v) && !files.get(g).messages.handled.includes(v)));

  const out = new Map();
  const summary = { unused: 0, 'tests-only': 0, 'half-pair': 0, 'not-in-schema': 0, keep: 0, 'unused-file': 0 };
  for (const [rel, f] of files) {
    const test = isTest(rel);
    const special = NEXT_SPECIAL.test(rel) || ROOT_SPECIAL.test(rel) || CONFIG_FILE.test(rel);
    const configured = matchAny(cfg._entry, rel);
    const textRef = textRefs.get(rel);
    const refs = fileRefs.get(rel) || new Set();
    const rec = { rel, facts: f, test, routes: frameworkRoute(rel, f), symbols: [], pairs: [], notInSchema: [], tags: [], users: new Set(), tests: new Set() };

    const keepAt = f.removeWhen.map((r) => ({ ...r, sym: f.symbols.find((s) => s.start > r.line && s.start <= r.line + 4) || f.symbols.find((s) => s.start <= r.line && s.end >= r.line) }));
    for (const s of f.symbols) {
      const u = users.get(`${rel}\0${s.name}`) || new Set();
      const outside = [...u].filter((g) => !isTest(g));
      const inTests = [...u].filter((g) => isTest(g));
      outside.forEach((g) => rec.users.add(g));
      inTests.forEach((g) => rec.tests.add(g));
      const entry = entryNames.has(s.name)
        || (special && (s.exported || []).some((e) => FRAMEWORK_NAMES.has(e)))
        || (configured && (!f.module || (s.exported || []).length > 0))
        || (CONFIG_FILE.test(rel) && (s.exported || []).length > 0);
      let status;
      const tags = [];
      if (entry) status = 'entry';
      else if (outside.length) status = `used by ${outside.length} file${outside.length > 1 ? 's' : ''}`;
      else if (s.inFile > 0) status = 'in file';
      else if (inTests.length) { status = 'tests only'; tags.push('tests-only'); }
      else { status = 'unused'; tags.push('unused'); }
      const keep = keepAt.find((k) => k.sym === s);
      if (keep) { tags.length = 0; tags.push(`keep until: ${keep.text}`); }
      if (test) tags.length = 0;
      for (const t of tags) summary[t.startsWith('keep') ? 'keep' : t] += 1;
      rec.symbols.push({ ...s, status, tags });
    }

    // file-level: is anything loading this file at all?
    const loaded = special || configured || test || !!textRef || refs.size > 0 || rec.users.size > 0
      || /(^|\/)(index|main|app|server|cli)\.[mc]?[jt]sx?$/.test(rel) && !rel.includes('/');
    if (!loaded) { rec.tags.push('unused-file'); summary['unused-file'] += 1; }

    for (const g of refs) if (isTest(g)) rec.tests.add(g);
    for (const [trel, tf] of files) if (isTest(trel) && tf.covers.some((c) => c === rel || rel.endsWith('/' + c))) rec.tests.add(trel);

    if (!test) for (const k of f.storage.read) if (!writes.has(k)) rec.pairs.push({ kind: 'storage', key: k, issue: 'read, never written' });
    if (!test) for (const k of f.storage.write) if (!reads.has(k)) rec.pairs.push({ kind: 'storage', key: k, issue: 'written, never read' });
    if (!test) for (const k of uniqList(f.messages.handled.filter((v) => MESSAGE_LIKE.test(v)))) {
      if (!literals.has(k) && !mentionedElsewhere(k, handled.get(k))) rec.pairs.push({ kind: 'message', key: k, issue: 'handled, never sent' });
    }
    if (!test) for (const k of uniqList(f.messages.sent.filter((v) => MESSAGE_LIKE.test(v)))) {
      if (!handled.has(k) && !mentionedElsewhere(k, new Set([rel]))) rec.pairs.push({ kind: 'message', key: k, issue: 'sent, never handled' });
    }
    summary['half-pair'] += rec.pairs.length;

    if (schema.tables.size) for (const t of f.tables) if (!schema.tables.has(t.toLowerCase())) rec.notInSchema.push(t);
    if (schema.fns.size) for (const r of f.rpcs) if (!schema.fns.has(r.toLowerCase())) rec.notInSchema.push(`rpc ${r}`);
    summary['not-in-schema'] += rec.notInSchema.length;

    out.set(rel, rec);
  }
  return { files: out, summary, users };
}
