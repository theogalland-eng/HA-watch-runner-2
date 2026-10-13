import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripComments, sourceSizes, tighten } from '../lib/size.mjs';
import { MAIN } from './paths.mjs';

test('comments are stripped; strings and regex literals that look like comments are kept', () => {
  const src = [
    '// header',
    "var url = 'https://x.y/*z*/'; /* block */ var n = 4 / 2; // tail",
    'var re = /\\/\\/[a/]*/g;',
    'var s = "a // b";',
  ].join('\n');
  const out = stripComments(src, '.js');
  assert.doesNotMatch(out, /header|block|tail/);
  assert.match(out, /'https:\/\/x\.y\/\*z\*\/'/);
  assert.match(out, /var n = 4 \/ 2;/);
  assert.match(out, /var re = \/\\\/\\\/\[a\/\]\*\/g;/);
  assert.match(out, /"a \/\/ b"/);
  assert.equal(stripComments('a { b: c; } /* x */', '.css').trim(), 'a { b: c; }');
  assert.equal(stripComments('<div><!-- x --></div>', '.hml'), '<div></div>');
  assert.equal(tighten('  a\n\n    b  \n'), 'a\nb');
  assert.deepEqual(sourceSizes('é // c\n', '.js'), { raw: 8, code: 4, tight: 2 });
});

test('every lite JS file still parses once its comments are stripped (what the size check measures)', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.push(p);
    }
  };
  walk(MAIN);
  assert.ok(files.length > 5);
  const dir = mkdtempSync(join(tmpdir(), 'lite-size-'));
  try {
    for (const f of files) {
      const out = join(dir, 'm.mjs');
      writeFileSync(out, stripComments(readFileSync(f, 'utf8'), '.js'));
      execFileSync(process.execPath, ['--check', out]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
