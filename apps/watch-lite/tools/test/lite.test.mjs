import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cssProblems, hmlProblems } from '../lib/lite.mjs';

test('lite CSS: the design’s web-only properties and selectors are caught', () => {
  assert.deepEqual(cssProblems('.row { width: 340px; height: 96px; letter-spacing: 0px; } .btn:active { background-color: #1A1A1A; }'), []);
  const p = cssProblems('.row { gap: 16px; box-sizing: border-box; min-width: 240px; } .list .row { color: red; } .row:hover { opacity: 0.4; }');
  assert.ok(p.some((x) => x.includes('"gap"')));
  assert.ok(p.some((x) => x.includes('"box-sizing"')));
  assert.ok(p.some((x) => x.includes('"min-width"')));
  assert.ok(p.some((x) => x.includes('".list .row"')));
  assert.ok(p.some((x) => x.includes('".row:hover"')));
});

test('lite HML: unknown components and touch events are caught', () => {
  assert.deepEqual(hmlProblems('<div on:swipe="back"><list><list-item onclick="tap" @longpress="detail"><text>{{x}}</text></list-item></list></div>'), []);
  const p = hmlProblems('<div on:touchstart="down"><button @click="x"></button><span></span></div><!-- <svg> in a comment is fine -->');
  assert.ok(p.some((x) => x.includes('"touchstart"')));
  assert.ok(p.some((x) => x.includes('<button>')));
  assert.ok(p.some((x) => x.includes('<span>')));
  assert.ok(!p.some((x) => x.includes('<svg>')));
});
