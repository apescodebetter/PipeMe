// MODULE: turns one JS/TS source file into plain facts — symbols, imports, references, and the words people use for it.
// Uses only TypeScript's parser (no type checker), so one file parses in milliseconds and the result can be cached.

const SENDERS = new Set(['sendMessage', 'postMessage']);
const LABEL_ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label']);
const LABEL_PROPS = new Set(['textContent', 'innerText', 'title', 'placeholder', 'ariaLabel']);
const HTTP_VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'options', 'head']);
const TAG_RE = /^\s*(?:\/\/+|\/\*+|\*+)\s*(MODULE|INVARIANT|REMOVE WHEN|covers)\s*:\s*(.*?)\s*(?:\*\/)?\s*$/;

export function parseSource(ts, rel, text, opts = {}) {
  const messageProps = new Set(opts.messageProps || ['type', 'action']);
  const senders = new Set([...SENDERS, ...(opts.messageSenders || [])]);
  const scriptKind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX
    : /\.[mc]?ts$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, scriptKind);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const jsxFile = /\.(jsx|tsx)$/.test(rel);

  const facts = {
    lines: text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
    module: ts.isExternalModule(sf) ? 'esm' : null,
    directive: null,
    purpose: null,
    symbols: [],
    imports: [],
    reexports: [],
    globals: [],
    identNames: [],
    propNames: [],
    strings: [],
    labels: [],
    fetches: [],
    routes: [],
    tables: [],
    buckets: [],
    rpcs: [],
    storage: { read: [], write: [] },
    messages: { sent: [], handled: [], literals: [] },
    invariants: [],
    removeWhen: [],
    covers: [],
  };

  // ---- comments: MODULE / INVARIANT / REMOVE WHEN / covers, and the file's header line
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TAG_RE);
    if (!m) continue;
    const [, tag, body] = m;
    if (tag === 'MODULE' && !facts.purpose) facts.purpose = clip(body, 110);
    else if (tag === 'INVARIANT') facts.invariants.push({ line: i + 1, text: clip(body, 140) });
    else if (tag === 'REMOVE WHEN') facts.removeWhen.push({ line: i + 1, text: clip(body, 90) });
    else if (tag === 'covers') facts.covers.push(...body.split(/[,\s]+/).filter(Boolean));
  }
  if (!facts.purpose) facts.purpose = headerLine(lines);

  // ---- top level: file statements plus the body of any top-level IIFE
  const top = [];
  const collectTop = (stmts, fromIife) => {
    for (const s of stmts) {
      top.push([s, fromIife]);
      const body = iifeBody(ts, s);
      if (body) collectTop(body, true);
    }
  };
  collectTop(sf.statements, false);
  let inIife = false; // declarations inside a top-level IIFE are private to this file

  const first = sf.statements[0];
  if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression)) {
    const d = first.expression.text;
    if (d === 'use client' || d === 'use server') facts.directive = d;
  }

  const constStrings = new Map();
  const propStrings = new Map();   // { KEY: "value" } anywhere in the file, to resolve computed keys like [this.KEY]
  const objectKeys = new Set();
  const skip = new Set();            // identifier nodes that are export markers, not uses
  const exportedLocal = new Map();   // local name → exported name(s)
  const symByName = new Map();

  const addSym = (name, kind, node, extra = {}) => {
    const sym = {
      name,
      kind,
      start: lineOf(node.getStart(sf)),
      end: lineOf(node.end),
      sig: extra.sig ?? name,
      exported: extra.exported ?? null,
      method: extra.method ?? null,
      private: inIife,
    };
    facts.symbols.push(sym);
    if (!symByName.has(name)) symByName.set(name, sym);
    return sym;
  };
  const markExport = (local, as) => {
    if (!exportedLocal.has(local)) exportedLocal.set(local, new Set());
    exportedLocal.get(local).add(as);
  };

  for (const [st, fromIife] of top) {
    inIife = fromIife;
    const exp = hasMod(ts, st, ts.SyntaxKind.ExportKeyword);
    const def = hasMod(ts, st, ts.SyntaxKind.DefaultKeyword);
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const c = st.importClause;
      const imp = { spec: st.moduleSpecifier.text };
      if (!c) imp.sideEffect = true;
      else {
        if (c.name) imp.default = true;
        if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) imp.ns = true;
        else if (c.namedBindings) imp.named = c.namedBindings.elements.map((el) => ({ imported: (el.propertyName || el.name).text, local: el.name.text }));
      }
      facts.imports.push(imp);
    } else if (ts.isFunctionDeclaration(st) && st.body) {
      const name = st.name ? st.name.text : 'default';
      addSym(name, isComp(name, jsxFile) ? 'comp' : 'fn', st, { sig: `${name}(${params(ts, st, sf)})` });
      if (exp) markExport(name, def ? 'default' : name);
    } else if (ts.isClassDeclaration(st)) {
      const name = st.name ? st.name.text : 'default';
      addSym(name, 'class', st);
      if (exp) markExport(name, def ? 'default' : name);
      for (const m of st.members) {
        const mName = m.name && (ts.isIdentifier(m.name) || ts.isPrivateIdentifier(m.name)) ? m.name.text : null;
        if (!mName) continue;
        const isFnProp = ts.isPropertyDeclaration(m) && m.initializer && isFnLike(ts, unwrap(ts, m.initializer));
        if (ts.isMethodDeclaration(m) || ts.isGetAccessor(m) || ts.isSetAccessor(m) || isFnProp) {
          const fn = isFnProp ? unwrap(ts, m.initializer) : m;
          addSym(`${name}.${mName}`, 'method', m, { sig: `${name}.${mName}(${params(ts, fn, sf)})`, method: mName });
        }
      }
    } else if (ts.isVariableStatement(st)) {
      const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const name = d.name.text;
        const init = d.initializer ? unwrap(ts, d.initializer) : null;
        if (init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) && isConst) constStrings.set(name, init.text);
        const fn = init && fnInside(ts, init);
        if (fn) {
          addSym(name, isComp(name, jsxFile) ? 'comp' : 'fn', d, { sig: `${name}(${params(ts, fn, sf)})` });
        } else if (init && ts.isClassExpression(init)) {
          addSym(name, 'class', d);
        } else if (exp) {
          addSym(name, 'const', d);
        }
        if (exp) markExport(name, name);
      }
    } else if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) && exp) {
      addSym(st.name.text, 'type', st);
      markExport(st.name.text, st.name.text);
    } else if (ts.isEnumDeclaration(st)) {
      addSym(st.name.text, 'enum', st);
      if (exp) markExport(st.name.text, st.name.text);
    } else if (ts.isExportAssignment(st)) {
      const e = unwrap(ts, st.expression);
      if (ts.isIdentifier(e)) { skip.add(e); markExport(e.text, 'default'); }
      else if (isFnLike(ts, e) || ts.isClassExpression(e)) {
        const name = e.name ? e.name.text : 'default';
        addSym(name, ts.isClassExpression(e) ? 'class' : 'fn', st, { sig: `${name}(${isFnLike(ts, e) ? params(ts, e, sf) : ''})` });
        markExport(name, 'default');
      } else {
        const fn = fnInside(ts, e);
        if (fn) { addSym('default', 'comp', st, { sig: `default(${params(ts, fn, sf)})` }); markExport('default', 'default'); }
      }
    } else if (ts.isExportDeclaration(st)) {
      const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      if (spec) {
        if (!st.exportClause) facts.reexports.push({ spec, star: true });
        else if (ts.isNamedExports(st.exportClause)) {
          facts.reexports.push({ spec, names: st.exportClause.elements.map((el) => ({ imported: (el.propertyName || el.name).text, as: el.name.text })) });
        } else facts.reexports.push({ spec, star: true });
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          markExport((el.propertyName || el.name).text, el.name.text);
          skip.add(el.name); if (el.propertyName) skip.add(el.propertyName);
        }
      }
    } else if (ts.isExpressionStatement(st) && ts.isBinaryExpression(st.expression)
      && st.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      commonJsOrGlobal(ts, st.expression, sf, facts, { addSym, markExport, skip, jsxFile });
    }
  }

  for (const s of facts.symbols) {
    const as = exportedLocal.get(s.name);
    if (as) s.exported = [...as].sort();
  }

  // ---- whole-tree walk: references, strings, words, pairs
  const identLines = new Map();
  const propLines = new Map();
  const push = (map, k, line) => { if (!map.has(k)) map.set(k, []); map.get(k).push(line); };
  const strings = new Set();
  const labels = [];
  const labelSet = new Set();
  const addLabel = (s) => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t.length < 2 || t.length > 60 || !/[A-Za-z]/.test(t) || /[{}<>=;]|^\w+[A-Z]\w*$|^[\w-]+\.[\w-]+$|^https?:/.test(t)) return;
    if (!labelSet.has(t)) { labelSet.add(t); labels.push(t); }
  };

  const constSeen = new Map(); // const NAME = "value" at any depth; a name bound to two values is ambiguous
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isStr(ts, unwrap(ts, node.initializer))
      && node.parent && (node.parent.flags & ts.NodeFlags.Const)) {
      const v = unwrap(ts, node.initializer).text;
      const prev = constSeen.get(node.name.text);
      constSeen.set(node.name.text, prev === undefined || prev === v ? v : null);
    }
    if (ts.isIdentifier(node)) {
      if (!skip.has(node)) {
        const role = identRole(ts, node);
        if (role === 'ref') push(identLines, node.text, lineOf(node.getStart(sf)));
        else if (role === 'prop') push(propLines, node.text, lineOf(node.getStart(sf)));
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text.length <= 120) strings.add(node.text);
      if (inJsxExpression(ts, node)) addLabel(node.text);
    } else if (ts.isJsxText(node)) {
      addLabel(node.text);
    } else if (ts.isJsxAttribute(node)) {
      const an = node.name.getText(sf);
      if (LABEL_ATTRS.has(an) && node.initializer && ts.isStringLiteral(node.initializer)) addLabel(node.initializer.text);
    } else if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left)
        && LABEL_PROPS.has(node.left.name.text) && isStr(ts, node.right)) addLabel(node.right.text);
      if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken
        || op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken) {
        for (const [a, b] of [[node.left, node.right], [node.right, node.left]]) {
          if (isMsgProp(ts, a, messageProps) && isStr(ts, b)) facts.messages.handled.push(b.text);
        }
      }
    } else if (ts.isSwitchStatement(node) && isMsgProp(ts, node.expression, messageProps)) {
      for (const c of node.caseBlock.clauses) if (ts.isCaseClause(c) && isStr(ts, c.expression)) facts.messages.handled.push(c.expression.text);
    } else if (ts.isObjectLiteralExpression(node)) {
      for (const p of node.properties) {
        const pk = (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) ? propKey(ts, p.name) : null;
        if (pk && pk.length <= 60) objectKeys.add(pk);
        if (pk && ts.isPropertyAssignment(p) && isStr(ts, p.initializer) && !propStrings.has(pk)) propStrings.set(pk, p.initializer.text);
        if (ts.isPropertyAssignment(p) && propKey(ts, p.name) && messageProps.has(propKey(ts, p.name)) && isStr(ts, p.initializer)) {
          facts.messages.literals.push(p.initializer.text);
          const call = node.parent;
          if (call && ts.isCallExpression(call) && senders.has(lastName(ts, call.expression))) facts.messages.sent.push(p.initializer.text);
        }
      }
    } else if (ts.isCallExpression(node)) {
      onCall(ts, node, sf, facts, { constStrings, messageProps, lineOf, addLabel, pendingStorage });
    }
    ts.forEachChild(node, visit);
  };
  const pendingStorage = [];
  visit(sf);
  for (const [k, v] of constSeen) if (v !== null && !constStrings.has(k)) constStrings.set(k, v);
  for (const { arg, read } of pendingStorage) {
    (read ? facts.storage.read : facts.storage.write).push(...storageKeys(ts, arg, constStrings, propStrings));
  }

  // references to each symbol inside this file, not counting its own body (recursion is not a use)
  for (const s of facts.symbols) {
    const hits = (s.method ? propLines.get(s.method) : identLines.get(s.name)) || [];
    s.inFile = hits.filter((l) => l < s.start || l > s.end).length;
  }

  facts.objectKeys = [...objectKeys].sort();
  facts.identNames = [...identLines.keys()].sort();
  facts.propNames = [...propLines.keys()].sort();
  facts.strings = [...strings].sort();
  facts.labels = labels;
  for (const k of ['fetches', 'tables', 'buckets', 'rpcs']) facts[k] = uniq(facts[k]);
  facts.storage.read = uniq(facts.storage.read);
  facts.storage.write = uniq(facts.storage.write);
  for (const k of ['sent', 'handled', 'literals']) facts.messages[k] = uniq(facts.messages[k]);
  facts.covers = uniq(facts.covers);
  return facts;
}

// ---- call expressions: imports, tables, storage, fetch, routes, labels
function onCall(ts, node, sf, facts, ctx) {
  const callee = node.expression;
  const a0 = node.arguments[0];
  if (ts.isIdentifier(callee) && callee.text === 'require' && a0 && isStr(ts, a0)) {
    facts.module = facts.module || 'cjs';
    const p = node.parent;
    if (p && ts.isVariableDeclaration(p) && ts.isObjectBindingPattern(p.name)) {
      facts.imports.push({ spec: a0.text, named: p.name.elements.map((e) => ({ imported: (e.propertyName || e.name).getText(sf), local: e.name.getText(sf) })) });
    } else facts.imports.push({ spec: a0.text, ns: true });
    return;
  }
  if (callee.kind === ts.SyntaxKind.ImportKeyword && a0 && isStr(ts, a0)) { facts.imports.push({ spec: a0.text, ns: true }); return; }
  const name = lastName(ts, callee);
  const dotted = dottedName(ts, callee);
  if (ts.isPropertyAccessExpression(callee) && a0 && isStr(ts, a0)) {
    if (name === 'from' && /^[A-Za-z_][\w]*$/.test(a0.text)) {
      const inner = callee.expression;
      if (ts.isPropertyAccessExpression(inner) && inner.name.text === 'storage') facts.buckets.push(a0.text);
      else if (!(ts.isIdentifier(inner) && /^(Array|Object|Buffer|Uint8Array)$/.test(inner.text))) facts.tables.push(a0.text);
    } else if (name === 'rpc') facts.rpcs.push(a0.text);
    else if (HTTP_VERBS.has(name) && a0.text.startsWith('/') && node.arguments.length >= 2) {
      facts.routes.push(`${name.toUpperCase()} ${a0.text}`);
    } else if (name === 'setAttribute' && LABEL_PROPS_ATTR.has(a0.text) && node.arguments[1] && isStr(ts, node.arguments[1])) {
      ctx.addLabel(node.arguments[1].text);
    }
  }
  if (name === 'fetch' && a0) {
    const p = urlHead(ts, a0);
    if (p && p.startsWith('/')) facts.fetches.push(p);
  }
  const st = dotted.match(/(?:^|\.)storage\.(?:local|session|sync|managed)\.(get|set)$/) || dotted.match(/(?:^|\.)(?:localStorage|sessionStorage)\.(getItem|setItem)$/);
  if (st && a0) ctx.pendingStorage.push({ arg: a0, read: /get/i.test(st[1]) }); // resolved after the walk
  if (ts.isPropertyAccessExpression(callee) && name === 'includes' && a0 && isMsgProp(ts, a0, ctx.messageProps)
    && ts.isArrayLiteralExpression(callee.expression)) {
    for (const el of callee.expression.elements) if (isStr(ts, el)) facts.messages.handled.push(el.text);
  }
}
const LABEL_PROPS_ATTR = new Set(['aria-label', 'title', 'placeholder']);

function commonJsOrGlobal(ts, bin, sf, facts, ctx) {
  const left = bin.left;
  const right = unwrap(ts, bin.right);
  const leftText = dottedName(ts, left);
  if (leftText === 'module.exports') {
    facts.module = facts.module || 'cjs';
    if (ts.isIdentifier(right)) { ctx.skip.add(right); ctx.markExport(right.text, 'default'); }
    else if (ts.isObjectLiteralExpression(right)) {
      for (const p of right.properties) {
        if (ts.isShorthandPropertyAssignment(p)) { ctx.skip.add(p.name); ctx.markExport(p.name.text, p.name.text); }
        else if (ts.isPropertyAssignment(p) && propKey(ts, p.name)) {
          const key = propKey(ts, p.name);
          const v = unwrap(ts, p.initializer);
          if (ts.isIdentifier(v)) { ctx.skip.add(v); ctx.markExport(v.text, key); }
          else if (isFnLike(ts, v)) { ctx.addSym(key, 'fn', p, { sig: `${key}(${params(ts, v, sf)})` }); ctx.markExport(key, key); }
        } else if (ts.isMethodDeclaration(p) && propKey(ts, p.name)) {
          const key = propKey(ts, p.name);
          ctx.addSym(key, 'fn', p, { sig: `${key}(${params(ts, p, sf)})` }); ctx.markExport(key, key);
        }
      }
    } else if (isFnLike(ts, right) || ts.isClassExpression(right)) {
      const name = right.name ? right.name.text : 'default';
      ctx.addSym(name, ts.isClassExpression(right) ? 'class' : 'fn', bin, { sig: `${name}(${isFnLike(ts, right) ? params(ts, right, sf) : ''})` });
      ctx.markExport(name, 'default');
    }
    return;
  }
  const cjs = leftText.match(/^(?:module\.)?exports\.([A-Za-z_$][\w$]*)$/);
  if (cjs) {
    facts.module = facts.module || 'cjs';
    const key = cjs[1];
    if (isFnLike(ts, right)) ctx.addSym(key, 'fn', bin, { sig: `${key}(${params(ts, right, sf)})` });
    else if (ts.isIdentifier(right)) { ctx.skip.add(right); ctx.markExport(right.text, key); return; }
    ctx.markExport(key, key);
    return;
  }
  const glob = leftText.match(/^(?:window|globalThis|self)\.([A-Za-z_$][\w$]*)$/);
  if (glob && ts.isObjectLiteralExpression(right)) {
    const members = [];
    for (const p of right.properties) {
      if (ts.isShorthandPropertyAssignment(p)) { ctx.skip.add(p.name); members.push(p.name.text); }
      else if (ts.isPropertyAssignment(p) && propKey(ts, p.name)) {
        const v = unwrap(ts, p.initializer);
        if (ts.isIdentifier(v)) ctx.skip.add(v);
        members.push(propKey(ts, p.name));
      } else if (ts.isMethodDeclaration(p) && propKey(ts, p.name)) members.push(propKey(ts, p.name));
    }
    facts.globals.push({ name: glob[1], members });
  }
}

// ---- small helpers
function identRole(ts, id) {
  const p = id.parent;
  if (!p) return 'ref';
  if (ts.isPropertyAccessExpression(p) && p.name === id) return 'prop';
  if (ts.isQualifiedName(p) && p.right === id) return 'prop';
  if (ts.isBindingElement(p) && p.propertyName === id) return 'prop';
  if (ts.isShorthandPropertyAssignment(p)) return 'ref';
  if ('name' in p && p.name === id && (
    ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p)
    || ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)
    || ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isGetAccessor(p)
    || ts.isSetAccessor(p) || ts.isEnumDeclaration(p) || ts.isEnumMember(p) || ts.isInterfaceDeclaration(p)
    || ts.isTypeAliasDeclaration(p) || ts.isTypeParameterDeclaration(p) || ts.isBindingElement(p)
    || ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isImportEqualsDeclaration(p)
    || ts.isExportSpecifier(p) || ts.isModuleDeclaration(p) || ts.isJsxAttribute(p) || ts.isNamespaceExport(p))) return 'decl';
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return 'decl';
  if (ts.isLabeledStatement(p) || ts.isBreakStatement(p) || ts.isContinueStatement(p)) return 'decl';
  if (ts.isMetaProperty(p)) return 'decl';
  return 'ref';
}

function iifeBody(ts, stmt) {
  if (!ts.isExpressionStatement(stmt)) return null;
  let e = stmt.expression;
  for (;;) {
    if (ts.isParenthesizedExpression(e)) e = e.expression;
    else if (ts.isPrefixUnaryExpression(e)) e = e.operand;
    else if (ts.isVoidExpression(e) || ts.isAwaitExpression(e)) e = e.expression;
    else break;
  }
  if (!ts.isCallExpression(e)) return null;
  let f = e.expression;
  while (ts.isParenthesizedExpression(f)) f = f.expression;
  if ((ts.isFunctionExpression(f) || ts.isArrowFunction(f)) && f.body && ts.isBlock(f.body)) return f.body.statements;
  return null;
}

function unwrap(ts, e) {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)
    || ts.isTypeAssertionExpression(e) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)))) e = e.expression;
  return e;
}
const isFnLike = (ts, e) => !!e && (ts.isArrowFunction(e) || ts.isFunctionExpression(e));
function fnInside(ts, e) {
  if (isFnLike(ts, e)) return e;
  // memo(fn), forwardRef(fn), React.memo(fn), observer(fn): the wrapped function is the symbol
  if (ts.isCallExpression(e) && /^(memo|forwardRef|observer|lazy|React\.memo|React\.forwardRef|React\.lazy)$/.test(dottedName(ts, e.expression))) {
    const a = e.arguments[0] && unwrap(ts, e.arguments[0]);
    if (isFnLike(ts, a)) return a;
  }
  return null;
}
const isComp = (name, jsxFile) => jsxFile && /^[A-Z]/.test(name);
function hasMod(ts, node, kind) {
  const mods = ts.canHaveModifiers && ts.canHaveModifiers(node) ? ts.getModifiers(node) : node.modifiers;
  return !!mods && mods.some((m) => m.kind === kind);
}
function params(ts, fn, sf) {
  if (!fn || !fn.parameters) return '';
  const out = fn.parameters.map((p) => {
    const n = ts.isIdentifier(p.name) ? p.name.text : ts.isObjectBindingPattern(p.name) ? '{…}' : '[…]';
    return (p.dotDotDotToken ? '...' : '') + n;
  }).join(', ');
  return out.length > 44 ? out.slice(0, 43) + '…' : out;
}
const isStr = (ts, n) => !!n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));
function isMsgProp(ts, n, props) {
  return !!n && (ts.isPropertyAccessExpression(n) && props.has(n.name.text));
}
function propKey(ts, name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}
function lastName(ts, e) {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
}
function dottedName(ts, e) {
  if (ts.isIdentifier(e)) return e.text;
  if (e.kind === ts.SyntaxKind.ThisKeyword) return 'this';
  if (ts.isPropertyAccessExpression(e)) { const l = dottedName(ts, e.expression); return l ? `${l}.${e.name.text}` : e.name.text; }
  return '';
}
function storageKeys(ts, a, consts, props) {
  a = unwrap(ts, a);
  const key = (n) => (isStr(ts, n) ? n.text
    : ts.isIdentifier(n) ? consts.get(n.text) ?? null
      : ts.isPropertyAccessExpression(n) ? props.get(n.name.text) ?? null : null);
  if (ts.isArrayLiteralExpression(a)) return a.elements.map(key).filter(Boolean);
  if (ts.isConditionalExpression(a)) return [...storageKeys(ts, a.whenTrue, consts, props), ...storageKeys(ts, a.whenFalse, consts, props)];
  if (ts.isObjectLiteralExpression(a)) {
    return a.properties.flatMap((p) => {
      if (ts.isSpreadAssignment(p)) return storageKeys(ts, p.expression, consts, props);
      if (!p.name) return [];
      if (ts.isComputedPropertyName(p.name)) return [key(p.name.expression)];
      return [propKey(ts, p.name)];
    }).filter(Boolean);
  }
  const k = key(a);
  return k ? [k] : [];
}
function urlHead(ts, a) {
  if (isStr(ts, a)) return a.text.split('?')[0];
  if (ts.isTemplateExpression(a)) return a.head.text.split('?')[0] + (a.head.text.includes('?') ? '' : '…');
  return null;
}
function inJsxExpression(ts, n) {
  let p = n.parent;
  for (let i = 0; i < 3 && p; i++) {
    if (ts.isJsxExpression(p)) return !!p.parent && !ts.isJsxAttribute(p.parent) || (p.parent && ts.isJsxAttribute(p.parent) && LABEL_ATTRS.has(p.parent.name.getText()));
    if (!(ts.isConditionalExpression(p) || ts.isBinaryExpression(p) || ts.isParenthesizedExpression(p))) return false;
    p = p.parent;
  }
  return false;
}
// the file's opening comment, joined across lines and cut at its first sentence
function headerLine(lines) {
  let i = 0;
  while (i < lines.length && i < 12) {
    const l = lines[i].trim();
    if (l && !l.startsWith('#!') && !/^['"]use (client|server|strict)['"];?$/.test(l)) break;
    i++;
  }
  const parts = [];
  for (; i < lines.length && parts.join(' ').length < 220; i++) {
    const m = lines[i].trim().match(/^(?:\/\/+|\/\*+|\*)\s*(.*?)\s*(?:\*\/)?$/);
    if (!m) break;
    if (!m[1]) { if (parts.length) break; continue; }
    if (/^(eslint|@ts-|prettier|global |jshint|@flow)/.test(m[1])) return null;
    parts.push(m[1]);
    if (/\*\/\s*$/.test(lines[i])) break;
  }
  if (!parts.length) return null;
  const text = parts.join(' ');
  const end = text.search(/[.;](\s|$)/);
  return clip(end > 20 ? text.slice(0, end + 1) : text, 130);
}
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const uniq = (a) => [...new Set(a)].sort();
