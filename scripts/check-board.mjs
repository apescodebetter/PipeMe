// Usage: node check-board.mjs <ROADMAP.md> [archive.md]   (read only; nothing is written)
import assert from 'node:assert/strict';
import fs from 'node:fs';

const [roadPath, archPath] = process.argv.slice(2);
if (!roadPath) { console.error('usage: node check-board.mjs <ROADMAP.md> [archive.md]'); process.exit(2); }

const html = fs.readFileSync(new URL('../assets/roadmap-board.html', import.meta.url), 'utf8');
const code = /<script id="roadmap-core">([\s\S]*?)<\/script>/.exec(html)[1];
const C = new Function(code + '\nreturn RoadmapCore;')();

const read = p => new TextDecoder('utf-8', { ignoreBOM: true }).decode(fs.readFileSync(p));
const road = read(roadPath), arch = archPath ? read(archPath) : null;
const lines = t => C.splitLines(t).map(l => l.t + l.e);
const diff = (a, b) => { const x = lines(a), y = lines(b); return { x, y, changed: x.map((l, i) => l !== y[i] ? i : -1).filter(i => i >= 0) }; };
const doc = C.parseDoc(road);
let n = 0;
const ok = name => console.log('ok  ' + name, ++n);

// 1. no-edit round trip, and a no-op edit
assert.equal(C.joinLines(C.splitLines(road)), road);
assert.equal(C.applyEdits(road, []).text, road);
if (arch !== null) assert.equal(C.joinLines(C.splitLines(arch)), arch);
const first = doc.phases.find(p => p.rows.length).rows[0];
assert.equal(C.applyEdits(road, [{ op: 'set', id: first.id, f: { task: first.task, status: first.status, owner: first.owner } }]).text, road);
ok('round trip is byte-identical (roadmap' + (arch !== null ? ' and archive' : '') + ', no-op edit)');

// 2. one status edit changes exactly one line, and only the status cell
const target = doc.phases.flatMap(p => p.rows).find(r => r.st.word === 'todo');
const edited = C.applyEdits(road, [{ op: 'set', id: target.id, f: { status: 'done 2099-01-01' } }]).text;
const d2 = diff(road, edited);
assert.deepEqual(d2.changed, [target.line]);
assert.equal(d2.x.length, d2.y.length);
const before = d2.x[target.line].split(/(?<!\\)\|/), after = d2.y[target.line].split(/(?<!\\)\|/);
assert.equal(before.length, after.length);
before.forEach((c, i) => i === 4 ? assert.match(after[i], /^ done 2099-01-01 $/) : assert.equal(c, after[i]));
ok('status edit on ' + target.id + ' changes one line, one cell');

// 3. new row goes after the phase's last row, with the next ID
const withRows = doc.phases.filter(p => p.table && p.rows.length);
for (const ph of withRows) {
  const id = C.nextId(doc, ph.heading, arch);
  if (!id) continue;
  const prefix = id.replace(/\.\d+$/, '');
  assert.ok(ph.rows.some(r => r.id.startsWith(prefix + '.')), ph.heading);
  const nums = [...(road + (arch || '')).matchAll(new RegExp('^\\|\\s*' + prefix.replace(/\./g, '\\.') + '\\.(\\d+)\\s*\\|', 'gm'))].map(m => +m[1]);
  assert.equal(id, prefix + '.' + (Math.max(...nums) + 1), ph.heading);
}
const ph3 = withRows.find(p => p.heading.startsWith('Phase 47')) || withRows.at(-1);
const id3 = C.nextId(doc, ph3.heading, arch);
const added = C.applyEdits(road, [{ op: 'add', phase: ph3.heading, id: id3, f: { task: 'New | task', owner: '🤖', status: 'todo', deps: '—', done: 'x' } }]).text;
const d3 = diff(road, added);
assert.equal(d3.y.length, d3.x.length + 1);
assert.equal(d3.y[ph3.lastRow + 1], `| ${id3} | New \\| task | 🤖 | todo | — | x |` + (road.includes('\r\n') ? '\r\n' : '\n'));
assert.equal(C.joinLines(C.splitLines(added).filter((_, i) => i !== ph3.lastRow + 1)), road);
const doc3 = C.parseDoc(added);
assert.equal(C.findRow(doc3, id3).row.task, 'New | task');
assert.equal(C.nextId(doc3, ph3.heading, arch), id3.replace(/\d+$/, m => +m + 1));
assert.equal(C.nextId(C.parseDoc('## Empty\n\n' + C.HEADER + '\n' + C.SEPLINE + '\n'), 'Empty'), null);
ok('new row ' + id3 + ' sits after ' + ph3.heading + ' row ' + ph3.rows.at(-1).id);

// 4. archive a done row: line leaves the roadmap, lands under the matching heading (section created when missing)
const doneRow = doc.phases.flatMap(p => p.rows).find(r => r.st.word === 'done');
const sample = doneRow ? { id: doneRow.id } : { id: target.id, pre: [{ op: 'set', id: target.id, f: { status: 'done 2099-01-01' } }] };
const r4 = C.applyEdits(road, [...(sample.pre || []), { op: 'archive', id: sample.id }]);
assert.equal(r4.moved.length, 1);
const lineOut = lines(sample.pre ? edited : road)[(C.findRow(C.parseDoc(sample.pre ? edited : road), sample.id).row.line)];
assert.equal(lines(r4.text).length, lines(road).length - 1);
assert.ok(!r4.text.includes(lineOut));
const eolR = road.includes('\r\n') ? '\r\n' : '\n';
for (const archive of [arch ?? '# A' + eolR + eolR, '# New archive' + eolR + eolR]) {
  const out = C.archiveInto(archive, r4.moved, eolR);
  const ls = lines(out), h = ls.findIndex(l => l.trimEnd() === '## ' + r4.moved[0].heading);
  assert.ok(h >= 0, 'heading present');
  const nx = ls.findIndex((l, i) => i > h && /^## /.test(l)), section = ls.slice(h + 1, nx < 0 ? undefined : nx);
  assert.ok(section.some(l => l.trimEnd() === r4.moved[0].text.trimEnd()), 'row under heading');
  assert.equal(out.indexOf(r4.moved[0].text + eolR) > -1, true);
  if (!archive.includes('## ' + r4.moved[0].heading)) {
    assert.ok(ls[h + 2].startsWith('| ID |') && ls[h + 3].startsWith('|---|'), 'section created with header and separator');
    assert.equal(ls.at(-1), r4.moved[0].text + eolR);
  }
  assert.equal(out.length - archive.length > 0, true);
}
if (arch !== null) { // existing section: the row is appended after the section's last table line
  const heading = doc.phases.find(p => arch.includes('## ' + p.heading))?.heading;
  if (heading) {
    const out = C.archiveInto(arch, [{ heading, text: '| 9.9 | probe | 🤖 | done | — | — |' }], eolR);
    const ls = lines(out), h = ls.findIndex(l => l.trimEnd() === '## ' + heading);
    const end = ls.findIndex((l, i) => i > h && /^## /.test(l));
    const tbl = ls.slice(h, end < 0 ? undefined : end).filter(l => l.startsWith('|'));
    assert.ok(tbl.at(-1).startsWith('| 9.9 |'));
    assert.equal(lines(out).length, lines(arch).length + 1);
  }
}
ok('archive moves ' + sample.id + ' under "' + r4.moved[0].heading + '" (existing section and created section)');

// 5. escaped pipe survives
const pipe = ['## P', '', C.HEADER, C.SEPLINE, '| 1.1 | a \\| b `x\\|y` | 🤖 | todo | — | c \\| d |', ''].join('\n');
const dp = C.parseDoc(pipe);
assert.equal(dp.phases[0].rows[0].task, 'a | b `x|y`');
assert.equal(C.applyEdits(pipe, [{ op: 'set', id: '1.1', f: { owner: '👤' } }]).text, pipe.replace('🤖', '👤'));
assert.equal(C.applyEdits(pipe, [{ op: 'set', id: '1.1', f: { status: 'done 2099-01-01 Note: a|b' } }]).text, pipe.replace('todo', 'done 2099-01-01 Note: a\\|b'));
assert.equal(C.applyEdits(pipe, [{ op: 'set', id: '1.1', f: { task: 'a | b `x|y`' } }]).text, pipe);
ok('escaped pipe survives edits and a round trip');

// 6. CRLF stays CRLF; LF stays LF; no final newline stays without
const lf = C.joinLines(C.splitLines(road)).replace(/\r\n/g, '\n'), crlf = lf.replace(/\n/g, '\r\n');
for (const [name, src, nl] of [['LF', lf, '\n'], ['CRLF', crlf, '\r\n']]) {
  const d = C.parseDoc(src);
  const id = C.nextId(d, ph3.heading, null);
  const ops = [{ op: 'set', id: target.id, f: { status: 'done 2099-01-01', task: 'edited' } }, { op: 'add', phase: ph3.heading, id, f: { task: 't', owner: '🤖', status: 'todo', deps: '—', done: '' } }, { op: 'archive', id: first.id }];
  const r = C.applyEdits(src, ops);
  const bare = nl === '\r\n' ? /(?<!\r)\n/ : /\r\n/;
  assert.ok(!bare.test(r.text), name + ' keeps its line endings');
  assert.ok(!bare.test(C.archiveInto('# A' + nl + nl, r.moved, nl)), name + ' archive keeps its line endings');
}
const noEnd = pipe.trimEnd();
const addNoEnd = C.applyEdits(noEnd, [{ op: 'add', phase: 'P', id: '1.2', f: { task: 't', owner: '🤖', status: 'todo', deps: '—', done: '' } }]).text;
assert.ok(!addNoEnd.endsWith('\n') && addNoEnd.includes('\n| 1.2 |'));
assert.equal(C.applyEdits(pipe, [{ op: 'set', id: 'nope', f: { task: 'x' } }]).missing[0], 'nope');
ok('line endings and final newline preserved; missing row reported');

// What the parser treats as raw or skips
const raw = doc.phases.flatMap(p => p.rows).filter(r => r.st.raw !== undefined);
console.log(`tables: ${doc.phases.filter(p => p.table).length}, rows: ${doc.phases.reduce((a, p) => a + p.rows.length, 0)}, skipped lines: ${doc.skipped.length}, raw statuses: ${raw.length}`);
raw.forEach(r => console.log('  raw status', r.id, JSON.stringify(r.status)));
doc.skipped.forEach(s => console.log('  skipped line', s.line + 1, s.text.slice(0, 60)));
console.log('all checks passed');
