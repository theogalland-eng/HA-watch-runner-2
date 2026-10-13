import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ICON_DIR } from './paths.mjs';
import { ICONS, MAX_ICON_BYTES, PALETTE } from '../icons/spec.mjs';
import { renderIcon } from '../icons/generate-icons.mjs';
import { decodeRgba, pngSize } from '../lib/png.mjs';
import { flattenPath } from '../lib/path.mjs';

test('the design asks for 26 icons: 17 at 48 px and 9 at 24 px', () => {
  assert.equal(ICONS.length, 26);
  assert.equal(ICONS.filter((i) => i.size === 48).length, 17);
  assert.equal(ICONS.filter((i) => i.size === 24).length, 9);
  assert.equal(new Set(ICONS.map((i) => i.file)).size, 26);
});

test('committed icons: right size, < 1 KB, single colour from the palette, transparent background', () => {
  const files = new Set(readdirSync(ICON_DIR));
  const colours = new Set(Object.values(PALETTE).map((h) => h.toLowerCase()));
  for (const icon of ICONS) {
    assert.ok(files.has(icon.file), `${icon.file} missing: run npm run icons`);
    const buf = readFileSync(join(ICON_DIR, icon.file));
    assert.ok(buf.length < MAX_ICON_BYTES, `${icon.file}: ${buf.length} B`);
    assert.deepEqual(pngSize(buf), { width: icon.size, height: icon.size });
    const { rgba } = decodeRgba(buf);
    let inked = 0;
    for (let p = 0; p < rgba.length; p += 4) {
      if (rgba[p + 3] === 0) continue;
      inked++;
      const hex = '#' + [rgba[p], rgba[p + 1], rgba[p + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      assert.equal(hex, icon.color.toLowerCase(), `${icon.file}: only ${icon.color}`);
      assert.ok(colours.has(hex));
    }
    assert.ok(inked > icon.size, `${icon.file} draws something`);
    assert.equal(rgba[3], 0, `${icon.file}: corner is transparent`);
  }
});

test('regenerating gives the same pixels as the committed icons (reproducible)', () => {
  for (const icon of ICONS) {
    const committed = decodeRgba(readFileSync(join(ICON_DIR, icon.file))).rgba;
    const fresh = decodeRgba(renderIcon(icon)).rgba;
    assert.ok(committed.equals(fresh), `${icon.file} differs: run npm run icons`);
  }
});

test('rendering is deterministic within a Node install (byte-identical renders)', () => {
  // Pixels are the cross-machine guarantee (previous test); bytes also depend on Node's zlib build.
  for (const icon of ICONS.slice(0, 5)) assert.ok(renderIcon(icon).equals(renderIcon(icon)));
});

test('path flattening handles arcs, relative commands and closepath', () => {
  // Full circle of radius 10 centred on (12, 12), drawn as two relative arcs.
  const [circle] = flattenPath('M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z');
  for (const [x, y] of circle) assert.ok(Math.abs(Math.hypot(x - 12, y - 12) - 10) < 1e-6);
  const xs = circle.map((p) => p[0]);
  assert.ok(Math.abs(Math.min(...xs) - 2) < 0.05 && Math.abs(Math.max(...xs) - 22) < 0.05);
  // Asymmetric arc (the sync icon's first stroke): sweep=1, small arc from (20,12) to (6,17.3) on a
  // radius-8 circle centred near (12,12) must pass *below* the centre (y > 12). Inverting sweep or
  // large-arc would send it above.
  const [sync] = flattenPath('M20 12a8 8 0 0 1-14 5.3');
  const mid = sync[Math.floor(sync.length / 2)];
  assert.ok(mid[1] > 12, `arc midpoint ${mid}`);
  for (const [x, y] of sync) assert.ok(Math.abs(Math.hypot(x - 12, y - 12) - 8) < 0.2, `${x},${y} on the circle`);
  // A number after z must be an error, not an endless loop.
  assert.throws(() => flattenPath('M1 1L2 2z3 3'), /Unexpected number/);
  // Implicit lineto pairs after l and an absolute H/V.
  const [poly] = flattenPath('M1 1l1 1 1 1H10V20');
  assert.deepEqual(poly, [[1, 1], [2, 2], [3, 3], [10, 3], [10, 20]]);
});
