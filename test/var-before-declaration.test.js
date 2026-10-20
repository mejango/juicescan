// A function that reads a name before its own `var` of that name gets the hoisted undefined, not the outer binding
// it meant (a cash-out preview once read `slip.sync()` while a later `var slip` shadowed the shared control).
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const isFn = n => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)
  || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isClassStaticBlockDeclaration(n);

// Every identifier a binding name declares, destructuring included.
function namesIn(name, out) {
  if (ts.isIdentifier(name)) out.push(name);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) namesIn(el.name, out);
  return out;
}

// `var` names declared in scope itself (not in nested functions): name -> position of the first one.
function varsOf(scope) {
  const out = new Map();
  (function walk(n) {
    if (n !== scope && isFn(n)) return;
    if (ts.isVariableDeclarationList(n) && !(n.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) {
      for (const d of n.declarations) for (const id of namesIn(d.name, [])) if (!out.has(id.text)) out.set(id.text, id.getStart());
    }
    ts.forEachChild(n, walk);
  })(scope);
  return out;
}

// Every name scope binds for the functions inside it: parameters, imports, variables, functions and classes.
function bindingsOf(scope) {
  const names = new Set();
  for (const p of scope.parameters || []) for (const id of namesIn(p.name, [])) names.add(id.text);
  // A named function expression binds its own name inside itself.
  if (ts.isFunctionExpression(scope) && scope.name) names.add(scope.name.text);
  (function walk(n) {
    if (n !== scope && isFn(n)) { if (ts.isFunctionDeclaration(n) && n.name) names.add(n.name.text); return; }
    if (ts.isVariableDeclaration(n)) for (const id of namesIn(n.name, [])) names.add(id.text);
    if ((ts.isClassDeclaration(n) || ts.isClassExpression(n) || ts.isImportClause(n) || ts.isImportSpecifier(n) || ts.isNamespaceImport(n)) && n.name) names.add(n.name.text);
    ts.forEachChild(n, walk);
  })(scope);
  return names;
}

// An identifier that reads a variable, not a property name, a key or a declaration's own name.
function isRead(id) {
  const p = id.parent;
  if ((ts.isPropertyAccessExpression(p) || ts.isQualifiedName(p)) && p.name === id) return false;
  if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p)) && p.name === id) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p)) && p.name === id) return false;
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
  return !isAssignedTo(id);
}

// A target an assignment or a for-in/of loop writes, destructuring included (its defaults and member bases are reads).
function isAssignedTo(id) {
  let node = id;
  for (;;) {
    const p = node.parent;
    const assigns = ts.isBinaryExpression(p) && p.left === node && p.operatorToken.kind === ts.SyntaxKind.EqualsToken;
    if (assigns && (ts.isArrayLiteralExpression(p.parent) || ts.isObjectLiteralExpression(p.parent) || ts.isPropertyAssignment(p.parent))) { node = p; continue; }
    if (assigns) return true;
    if ((ts.isForOfStatement(p) || ts.isForInStatement(p)) && p.initializer === node) return true;
    if (ts.isArrayLiteralExpression(p) || ts.isObjectLiteralExpression(p) || ts.isSpreadElement(p) || ts.isSpreadAssignment(p) || ts.isParenthesizedExpression(p)
      || (ts.isShorthandPropertyAssignment(p) && p.name === node) || (ts.isPropertyAssignment(p) && p.initializer === node)) { node = p; continue; }
    return false;
  }
}

function shadowedEarlyReads(file, text) {
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = [];
  (function visit(n, outer) {
    if (!isFn(n)) return ts.forEachChild(n, c => visit(c, outer));
    const vars = varsOf(n);
    // Parameters and local function declarations are bound before any line runs: a later var keeps their value.
    const params = new Set((n.parameters || []).flatMap(p => namesIn(p.name, []).map(id => id.text)));
    // Only a function declared directly in this body is bound up front; one in a nested block is not.
    for (const s of (n.body && ts.isBlock(n.body) ? n.body.statements : [])) if (ts.isFunctionDeclaration(s) && s.name) params.add(s.name.text);
    (function walk(m) {
      if (m !== n && isFn(m)) return;
      const ownName = ts.isFunctionExpression(n) && n.name && n.name !== m && n.name.text === m.text;
      if (ts.isIdentifier(m) && isRead(m) && (ownName || outer.some(scope => scope.has(m.text))) && !params.has(m.text) && vars.has(m.text) && m.getStart() < vars.get(m.text)) {
        found.push(file + ':' + (src.getLineAndCharacterOfPosition(m.getStart()).line + 1) + ' ' + m.text);
      }
      ts.forEachChild(m, walk);
    })(n);
    const inner = [...outer, bindingsOf(n)];
    ts.forEachChild(n, c => visit(c, inner));
  })(src, [bindingsOf(src)]);
  return found;
}

describe('no function reads an outer name before its own var shadows it', () => {
  it('finds the early read', () => {
    expect(shadowedEarlyReads('x.js', 'function f() { var slip = {}; function g() { slip.sync(); var slip = 1; } }')).toEqual(['x.js:1 slip']);
    expect(shadowedEarlyReads('x.js', 'function f() { var slip = {}; function g() { var slip = 1; slip.toFixed(); } }')).toEqual([]);
    // A module binding, an import and a destructured binding are outer names too.
    expect(shadowedEarlyReads('x.js', 'var slip = {}; function g() { slip.sync(); var slip = 1; }')).toEqual(['x.js:1 slip']);
    expect(shadowedEarlyReads('x.js', "import { slip } from 'y'; function g() { slip(); var slip = 1; }")).toEqual(['x.js:1 slip']);
    expect(shadowedEarlyReads('x.js', 'var { slip } = o; function g() { slip.sync(); var [slip] = a; }')).toEqual(['x.js:1 slip']);
    // Keys, member names and a parameter the var redeclares are not early reads.
    expect(shadowedEarlyReads('x.js', 'var slip; function g() { var o = { slip: 1 }; o.slip = 2; var slip = 3; }')).toEqual([]);
    expect(shadowedEarlyReads('x.js', 'var slip; function g(slip) { slip.sync(); var slip = 1; }')).toEqual([]);
    expect(shadowedEarlyReads('x.js', 'var slip; function g() { slip = 1; var slip; }')).toEqual([]);
    expect(shadowedEarlyReads('x.js', 'var slip; function g() { slip(); function slip() {} var slip; }')).toEqual([]);
    // A named function expression's own name, and a class static block as its own scope.
    expect(shadowedEarlyReads('x.js', 'const f = function slip() { return () => { slip(); var slip; }; };')).toEqual(['x.js:1 slip']);
    expect(shadowedEarlyReads('x.js', 'var slip = {}; function g() { slip.sync(); class C { static { var slip; } } }')).toEqual([]);
    expect(shadowedEarlyReads('x.js', 'var slip = {}; class C { static { slip.sync(); var slip; } }')).toEqual(['x.js:1 slip']);
    expect(shadowedEarlyReads('x.js', 'const f = function slip() { slip.name; var slip; };')).toEqual(['x.js:1 slip']);
    expect(shadowedEarlyReads('x.js', 'const C = class Slip { m() { Slip.x; var Slip; } };')).toEqual(['x.js:1 Slip']);
    // A function declared in a nested block is not bound up front.
    expect(shadowedEarlyReads('x.js', 'var slip = {}; function g() { slip.sync(); if (x) { function slip() {} } var slip; }')).toEqual(['x.js:1 slip']);
    // Destructuring and loop targets are writes; their defaults and member bases are reads.
    expect(shadowedEarlyReads('x.js', 'var slip; function g() { [slip] = [1]; ({ slip } = o); for (slip of xs); var slip; }')).toEqual([]);
    expect(shadowedEarlyReads('x.js', 'var slip, o; function g() { [o.a = slip] = []; var slip; }')).toEqual(['x.js:1 slip']);
  });
  it('holds across src', { timeout: 120_000 }, () => {
    const dir = path.resolve(__dirname, '../src');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    expect(files.flatMap(f => shadowedEarlyReads(f, fs.readFileSync(path.join(dir, f), 'utf8')))).toEqual([]);
  });
});
