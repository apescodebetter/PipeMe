// MODULE: finds names in the docs (`likeThis`, `path/to/file.ts`) that no longer exist anywhere in the code.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { globToRegex, matchAny } from './analyze.mjs';

const CODEY = /[a-z][A-Z]|_|\$|\./;             // camelCase, snake_case, $name, dotted — plain words are skipped
const IDENT = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
const FILEISH = /\.(m?[jt]sx?|c[jt]s|json|md|sql|css|html?|ya?ml|toml|sh|ps1|py|txt|env)$/i;
// a bare file name is only checked when it's a code or config file; `example.html` in prose is usually hypothetical
const SOURCE_NAME = /\.(m?[jt]sx?|c[jt]s|json|sql|mjs)$/i;

export function staleNames(env, facts) {
  const { root, cfg, list } = env;
  const known = new Set();
  const addWords = (s) => { for (const w of s.split(/[^\w$]+/)) if (w) known.add(w); };
  for (const f of facts.values()) {
    for (const s of f.symbols) { known.add(s.name); if (s.method) known.add(s.method); }
    for (const x of f.identNames) known.add(x);
    for (const x of f.propNames) known.add(x);
    for (const x of f.strings) { known.add(x); addWords(x); }
  }
  for (const rel of [...list.schema, ...list.texts]) {
    try { addWords(fs.readFileSync(path.join(root, rel), 'utf8')); } catch { /* unreadable: skip */ }
  }
  for (const n of cfg.docsIgnore) known.add(n);
  const allFiles = new Set(list.all);
  const dirs = new Set();
  for (const f of list.all) { let d = path.posix.dirname(f); while (d !== '.' && !dirs.has(d)) { dirs.add(d); d = path.posix.dirname(d); } }
  const pathKnown = (p, docDir) => {
    const clean = p.replace(/^\.\//, '').replace(/\/$/, '').replace(/[#:].*$/, '');
    if (!clean) return true;
    for (const c of [clean, path.posix.join(docDir, clean)]) if (allFiles.has(c) || dirs.has(c)) return true;
    for (const f of allFiles) if (f.endsWith('/' + clean)) return true;
    for (const d of dirs) if (d.endsWith('/' + clean)) return true;
    return false;
  };

  const include = cfg.docs.map(globToRegex);
  const exclude = cfg.docsExclude.map(globToRegex);
  const docs = list.docs.filter((d) => matchAny(include, d) && !matchAny(exclude, d));
  const found = [];
  for (const doc of docs) {
    const lines = fs.readFileSync(path.join(root, doc), 'utf8').split('\n');
    let fenced = false;
    lines.forEach((line, i) => {
      if (/^\s*```/.test(line)) { fenced = !fenced; return; }
      if (fenced || line.includes('map:ignore')) return;
      for (const m of line.matchAll(/`([^`\n]+)`/g)) {
        let span = m[1].trim();
        // skip commands, placeholders, flags, URLs, routes, dates/versions, anchors, bare extensions
        if (/\s|[<>{}*…|=@]|^-|:\/\/|^\/|^\d|^#|^\.[\w]+$/.test(span)) continue;
        span = span.replace(/\(.*\)$/, '').replace(/[,;:]$/, '');
        const docDir = path.posix.dirname(doc) === '.' ? '' : path.posix.dirname(doc);
        if (span.includes('/') || SOURCE_NAME.test(span)) {
          if (/^[\w-]+(\.[\w-]+)*\.[a-z]{2,}\//i.test(span) && !FILEISH.test(span.split('/')[0])) continue; // domain/path
          if (!pathKnown(span, docDir)) found.push({ doc, line: i + 1, name: span, why: 'no such file or folder', paths: [span, path.posix.join(docDir, span)] });
        } else if (IDENT.test(span) && CODEY.test(span)) {
          const last = span.split('.').pop();
          if (!known.has(span) && !known.has(last)) found.push({ doc, line: i + 1, name: span, why: 'not found in the code' });
        }
      }
    });
  }
  // paths git ignores (build output, local profiles) are expected not to be in the repo
  const candidates = [...new Set(found.flatMap((f) => (f.paths || []).map((p) => p.replace(/\/$/, ''))))];
  let ignored = new Set();
  if (candidates.length) {
    const r = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: root, input: candidates.join('\n'), encoding: 'utf8' });
    ignored = new Set((r.stdout || '').split('\n').filter(Boolean));
  }
  return found.filter((f) => !(f.paths || []).some((p) => ignored.has(p.replace(/\/$/, '')))).map(({ paths, ...rest }) => rest);
}
