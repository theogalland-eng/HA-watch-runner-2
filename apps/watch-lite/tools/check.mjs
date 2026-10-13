#!/usr/bin/env node
// Static checks for the lite watch app, runnable without DevEco:
//  1. each page (hml + css + js + imported local modules): size without comments, with warnings
//     from 40 KB, 44 KB (plan B) and 48 KB (to be confirmed on the watch); raw and comment- and
//     indentation-free sizes are shown too, and the share of the Wear Engine stub (demo only);
//  2. icons: exactly the 26 design icons, each < 1 KB; every PNG's decoded RGBA cost;
//  3. HAP estimate (sources + decoded images) ≤ 10 MB;
//  4. CSS / HML restricted to what lite supports (properties, selectors, components, events);
//  5. no signing material in build-profile.json5 (it must never be committed).
// Limits: docs/platform-constraints.md. The 48 KB is not enforced by the DevEco Previewer (an 84.8 KB
// compiled page loads): it is a warning until the watch test decides (README § Watch test).
// Lite subset: OpenHarmony arkui-js-lite reference.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS, MAX_ICON_BYTES } from './icons/spec.mjs';
import { pngSize } from './lib/png.mjs';
import { cssProblems, hmlProblems } from './lib/lite.mjs';
import { sourceSizes } from './lib/size.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '..');
const JS_ROOT = join(APP, 'entry/src/main/js/MainAbility');
const MEDIA = join(APP, 'entry/src/main/resources');

const KB = 1024;
const PAGE_LIMIT = 48 * KB;
const PAGE_WARN = 40 * KB;
const PLAN_B = 44 * KB;
const HAP_LIMIT = 10 * KB * KB;

const errors = [];
const warnings = [];
const fmt = (n) => (n >= KB ? `${(n / KB).toFixed(1)} KB` : `${n} B`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---- 1. Page sizes -------------------------------------------------------------------------
const STUB = join(JS_ROOT, 'common/services/wearengine.js');

function localImports(file, seen, skip) {
  if (seen.has(file) || file === skip || !existsSync(file)) return;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  const re = extname(file) === '.css' ? /@import\s+['"]([^'"]+)['"]/g : /import\s+(?:[^'"]*?from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const m of src.matchAll(re)) {
    let target = resolve(dirname(file), m[1]);
    if (!extname(target)) target += extname(file) === '.css' ? '.css' : '.js';
    localImports(target, seen, skip);
  }
}

const config = JSON.parse(readFileSync(join(APP, 'entry/src/main/config.json'), 'utf8'));
const pages = config.module.js[0].pages;
console.log('Pages (hml + css + js + local imports; warnings on the size without comments: 40 KB, 44 KB plan B, 48 KB to confirm on the watch):');
for (const page of pages) {
  const seen = new Set();
  for (const ext of ['.hml', '.css', '.js']) localImports(join(JS_ROOT, page + ext), seen);
  const size = { raw: 0, code: 0, tight: 0 };
  for (const f of seen) {
    const s = sourceSizes(readFileSync(f, 'utf8'), extname(f));
    size.raw += s.raw;
    size.code += s.code;
    size.tight += s.tight;
  }
  const ok = size.code <= PAGE_LIMIT;
  if (!ok) warnings.push(`${page}: ${fmt(size.code)} without comments > 48 KB: to be confirmed on the watch, not enforced by the Previewer (README § Watch test)`);
  else if (size.code > PLAN_B) warnings.push(`${page}: ${fmt(size.code)} without comments > 44 KB (plan B threshold): the watch test decides (README § Watch test)`);
  else if (size.code > PAGE_WARN) warnings.push(`${page}: ${fmt(size.code)} without comments > 40 KB`);
  console.log(`  ${ok ? 'ok ' : 'big'} ${page.padEnd(20)} ${fmt(size.code).padStart(8)} without comments · ${fmt(size.raw)} raw · ${fmt(size.tight)} without comments or indentation  (${seen.size} files)`);
  const app = new Set();
  for (const ext of ['.hml', '.css', '.js']) localImports(join(JS_ROOT, page + ext), app, STUB);
  const stub = [...seen].filter((f) => !app.has(f));
  if (stub.length) {
    const code = stub.reduce((n, f) => n + sourceSizes(readFileSync(f, 'utf8'), extname(f)).code, 0);
    const demo = readFileSync(STUB, 'utf8').includes('P2pClient.isStub = true');
    const what = demo ? "the Wear Engine stub and its demo data (replaced by Huawei's file on the watch)" : "Huawei's wearengine.js";
    console.log(`      of which ${what}: ${fmt(code)} without comments (${stub.map((f) => relative(JS_ROOT, f)).join(', ')})`);
  }
}

// ---- 2. Icons + decoded image cost ------------------------------------------------------------
const iconDir = join(JS_ROOT, 'common/icons');
const expected = new Set(ICONS.map((i) => i.file));
const present = readdirSync(iconDir).filter((f) => f.endsWith('.png'));
for (const f of expected) if (!present.includes(f)) errors.push(`missing icon ${f} (run: npm run icons)`);
let iconBytes = 0;
for (const f of present) {
  const size = statSync(join(iconDir, f)).size;
  iconBytes += size;
  if (expected.has(f)) {
    if (size >= MAX_ICON_BYTES) errors.push(`icon ${f} is ${size} B (must be < 1 KB)`);
  } else {
    errors.push(`unexpected icon ${f}: icons come from tools/icons/spec.mjs`);
  }
}
const designIcons = present.filter((f) => expected.has(f));
console.log(`\nIcons: ${designIcons.length}/${expected.size} design icons, largest ${fmt(Math.max(...designIcons.map((f) => statSync(join(iconDir, f)).size)))}, all < 1 KB: ${designIcons.every((f) => statSync(join(iconDir, f)).size < MAX_ICON_BYTES)}`);

const images = [...walk(JS_ROOT), ...walk(MEDIA)].filter((f) => f.endsWith('.png'));
let decoded = 0;
for (const f of images) {
  const { width, height } = pngSize(readFileSync(f));
  decoded += width * height * 4;
}
const designDecoded = ICONS.reduce((n, i) => n + i.size * i.size * 4, 0);
console.log(`Decoded RGBA (lite stores bitmaps raw): all PNGs ${fmt(decoded)}, of which the 26 design icons ${fmt(designDecoded)}`);

// ---- 3. HAP estimate ---------------------------------------------------------------------------
const sources = walk(join(APP, 'entry/src/main')).filter((f) => !f.endsWith('.png'));
const sourceBytes = sources.reduce((n, f) => n + statSync(f).size, 0);
const hap = sourceBytes + decoded;
if (hap > HAP_LIMIT) errors.push(`HAP estimate ${fmt(hap)} > 10 MB`);
console.log(`HAP estimate: sources ${fmt(sourceBytes)} + decoded images ${fmt(decoded)} = ${fmt(hap)} (limit 10 MB)`);

// ---- 4. Lite CSS / HML subset ------------------------------------------------------------------
const files = walk(JS_ROOT);
for (const f of files.filter((x) => x.endsWith('.css'))) {
  for (const p of cssProblems(readFileSync(f, 'utf8'))) errors.push(`${relative(APP, f)}: ${p}`);
}
for (const f of files.filter((x) => x.endsWith('.hml'))) {
  for (const p of hmlProblems(readFileSync(f, 'utf8'))) errors.push(`${relative(APP, f)}: ${p}`);
}

// ---- 5. No signing material committed -----------------------------------------------------------
const profile = readFileSync(join(APP, 'build-profile.json5'), 'utf8');
if (!/"signingConfigs"\s*:\s*\[\s*\]/.test(profile) || /"?\b(storeFile|storePassword|keyPassword|certpath|profile)\b"?\s*:/.test(profile)) {
  errors.push('build-profile.json5 contains signing material: keep it local (see apps/watch-lite/README.md § Signature)');
}

console.log('');
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
console.log(errors.length ? `check: ${errors.length} error(s)` : 'check: ok');
if (errors.length) process.exitCode = 1;
