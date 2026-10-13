import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { APP } from './paths.mjs';

const eslint = new ESLint({ cwd: APP, overrideConfigFile: resolve(APP, 'tools/eslint.config.mjs') });
const FILE = resolve(APP, 'entry/src/main/js/MainAbility/common/logic/__probe__.js');

async function problems(code) {
  const [result] = await eslint.lintText(code, { filePath: FILE });
  return result.messages.map((m) => m.ruleId || m.message);
}

test('plain ES5 with import/export passes', async () => {
  assert.deepEqual(await problems("import x from './x.js';\nexport function f(a) { var b = [a]; return b.indexOf(x); }\n"), []);
});

test('ES2015+ syntax and runtime APIs JerryScript lacks are rejected', async () => {
  const cases = {
    'const a = 1; export default a;\n': 'es-x/no-block-scoped-variables',
    'export var f = function (a) { return a.n.includes("x"); };\n': 'es-x/no-array-prototype-includes',
    'export var f = function (list) { return list.find(function (c) { return c; }); };\n': 'es-x/no-array-prototype-find',
    'export var f = function (s) { return s.startsWith("a"); };\n': 'es-x/no-string-prototype-startswith',
    'export var o = Object.assign({}, {});\n': 'es-x/no-object-assign',
    'export var p = new Promise(function () {});\n': 'no-restricted-globals',
    'export var g = globalThis;\n': 'no-restricted-globals',
    'export var t = setInterval(function () {}, 1000);\n': 'no-restricted-globals',
    'export var f = function (a) { return a?.b; };\n': 'Parsing error',
    'export var f = function (s) { return s.replace(/x/g, "y"); };\n': 'no-restricted-syntax',
    'export var r = new RegExp("x");\n': 'no-restricted-syntax',
    'export var r = RegExp("x");\n': 'no-restricted-syntax',
    'export var f = function (s) { return s.match("x"); };\n': 'no-restricted-properties',
    'export var f = function (s) { return s.search("x"); };\n': 'no-restricted-properties',
  };
  for (const [code, rule] of Object.entries(cases)) {
    const found = await problems(code);
    assert.ok(found.some((r) => r.includes(rule)), `${code.trim()} → expected ${rule}, got ${JSON.stringify(found)}`);
  }
});
