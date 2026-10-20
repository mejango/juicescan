// A function that reads a name before its own `var` of that name gets the hoisted undefined, not the outer binding
// it meant (a cash-out preview once read `slip.sync()` while a later `var slip` shadowed the shared control).
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const isFn = n => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

// `var` declarations made in fn itself (not in nested functions): name -> position of the first one.
function varsOf(fn) {
  const out = new Map();
  (function walk(n) {
    if (n !== fn && isFn(n)) return;
    if (ts.isVariableDeclarationList(n) && !(n.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) {
      for (const d of n.declarations) if (ts.isIdentifier(d.name) && !out.has(d.name.text)) out.set(d.name.text, d.name.getStart());
    }
    ts.forEachChild(n, walk);
  })(fn);
  return out;
}

// Every name fn binds for its nested functions: parameters, variables and function declarations.
function bindingsOf(fn) {
  const names = new Set();
  for (const p of fn.parameters || []) if (ts.isIdentifier(p.name)) names.add(p.name.text);
  (function walk(n) {
    if (n !== fn && isFn(n)) { if (ts.isFunctionDeclaration(n) && n.name) names.add(n.name.text); return; }
    if (ts.isVariableDeclarationList(n)) for (const d of n.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text);
    ts.forEachChild(n, walk);
  })(fn);
  return names;
}

function shadowedEarlyReads(file, text) {
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = [];
  (function visit(n, outer) {
    if (!isFn(n)) return ts.forEachChild(n, c => visit(c, outer));
    const vars = varsOf(n);
    (function walk(m) {
      if (m !== n && isFn(m)) return;
      const key = ts.isPropertyAccessExpression(m.parent) && m.parent.name === m;
      if (ts.isIdentifier(m) && !key && outer.has(m.text) && vars.has(m.text) && m.getStart() < vars.get(m.text)) {
        found.push(file + ':' + (src.getLineAndCharacterOfPosition(m.getStart()).line + 1) + ' ' + m.text);
      }
      ts.forEachChild(m, walk);
    })(n);
    const inner = new Set([...outer, ...bindingsOf(n)]);
    ts.forEachChild(n, c => visit(c, inner));
  })(src, new Set());
  return found;
}

describe('no function reads an outer name before its own var shadows it', () => {
  it('finds the early read', () => {
    expect(shadowedEarlyReads('x.js', 'function f() { var slip = {}; function g() { slip.sync(); var slip = 1; } }')).toEqual(['x.js:1 slip']);
    expect(shadowedEarlyReads('x.js', 'function f() { var slip = {}; function g() { var slip = 1; slip.toFixed(); } }')).toEqual([]);
  });
  it('holds across src', () => {
    const dir = path.resolve(__dirname, '../src');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    expect(files.flatMap(f => shadowedEarlyReads(f, fs.readFileSync(path.join(dir, f), 'utf8')))).toEqual([]);
  });
});
