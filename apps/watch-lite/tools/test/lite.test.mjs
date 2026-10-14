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

test('lite CSS: the rule right after an @import is checked too', () => {
  const p = cssProblems("@import '../../common/styles/base.css';\n\n.root { gap: 4px; }\n.b { gap: 2px; }");
  assert.equal(p.filter((x) => x.includes('"gap"')).length, 2);
  assert.deepEqual(cssProblems("@import 'base.css';\n.root { width: 340px; }"), []);
});

test('lite CSS: no fixed width or height beyond the 454 px Previewer screen', () => {
  const p = cssProblems('.root { width: 466px; height: 466px; } .col { width: 340px; } .full { width: 100%; height: 100%; }');
  assert.equal(p.length, 2);
  assert.ok(p.every((x) => x.includes('454')));
  assert.deepEqual(cssProblems('.a { width: 454px; height: 100%; margin-left: 500px; }').filter((x) => x.includes('454')), []);
});

test('lite HML: if/show only take booleans named is…/has… (no ValueToBoolean)', () => {
  assert.deepEqual(hmlProblems('<div if="{{isList}}"><image show="{{$item.hasCheck}}"></image><text if="{{detail.isReadOnly}}"></text><text else></text></div>'), []);
  const p = hmlProblems('<text if="{{message.t2}}"></text><div show="{{rows.length}}"></div><div if="{{isA && isB}}"></div>');
  assert.equal(p.length, 3);
  assert.ok(p.every((x) => x.includes('ValueToBoolean')));
});
