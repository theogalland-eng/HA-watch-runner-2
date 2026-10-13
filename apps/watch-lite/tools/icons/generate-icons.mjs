#!/usr/bin/env node
// Generates the 26 watch icons (PNG, one per colour) from the design's SVG paths.
// Deterministic and dependency-free. The guarantee is pixel-identical output (checked by
// test/icons.test.mjs on every run); the PNG bytes are also identical as long as Node's bundled zlib
// is the same, so after `npm run icons` a `git diff` on the same Node major shows nothing.
//
// Usage: node icons/generate-icons.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS, MAX_ICON_BYTES } from './spec.mjs';
import { rasterize, SS } from '../lib/raster.mjs';
import { encodeIcon } from '../lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ICON_DIR = resolve(here, '../../entry/src/main/js/MainAbility/common/icons');

/** Renders one icon spec to PNG bytes. */
export function renderIcon(icon) {
  return encodeIcon(icon.size, rasterize(icon), SS * SS, icon.color);
}

function main() {
  const outDir = process.argv[2] ? resolve(process.argv[2]) : ICON_DIR;
  mkdirSync(outDir, { recursive: true });
  let failed = false;
  for (const icon of ICONS) {
    const png = renderIcon(icon);
    writeFileSync(join(outDir, icon.file), png);
    const flag = png.length < MAX_ICON_BYTES ? 'ok' : 'TOO BIG';
    if (png.length >= MAX_ICON_BYTES) failed = true;
    console.log(`${icon.file.padEnd(26)} ${String(icon.size).padStart(2)}px ${String(png.length).padStart(4)} B  ${flag}`);
  }
  console.log(`${ICONS.length} icons → ${outDir}`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
