#!/usr/bin/env node
// Static checks for the lite watch app, runnable without DevEco:
//  1. each JS bundle (app.js, and each page's hml + css + js) with its local imports: estimated
//     compiled size ≤ 48 KB (lite refuses more on the watch), also with Huawei's wearengine.js in
//     place of the stub; pages must not import core modules; real compiled sizes when built;
//  2. icons: exactly the 26 design icons, each < 1 KB; every PNG's decoded RGBA cost;
//  3. HAP estimate (sources + decoded images) ≤ 10 MB;
//  4. CSS / HML restricted to what lite supports (properties, selectors, components, events);
//  5. no signing material in build-profile.json5 (it must never be committed).
// Limits: docs/platform-constraints.md (the Previewer logs "File exceeds size limit but allowed on
// simulator" above ~48 KB of compiled JS per bundle; the watch refuses it).
// Lite subset: OpenHarmony arkui-js-lite reference.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
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

// ---- 1. Bundle sizes ------------------------------------------------------------------------
// Lite compiles app.js and each page into separate JS bundles and refuses one above ~48 KB on the
// watch (the Previewer only logs "File exceeds size limit but allowed on simulator"). A module imported
// by two bundles is copied into both. Estimate per bundle = its sources without comments × RATIO
// (measured 1.22–1.26 with DevEco 6.1; 1.3 keeps a margin). Huawei's wearengine.js is already plain
// JS: it compiles to about its size without comments (×1.0). The bundle holding the Wear Engine stub is
// also estimated with Huawei's file in its place (HUAWEI_SDK: its size without comments, measured).
const STUB = join(JS_ROOT, 'common/services/wearengine.js');
const RATIO = 1.3;
/** Huawei's lite wearengine.js 5.0.2.306 without comments: 14 951 B (17 576 raw); app.js compiled with it: 46 663 B. */
const HUAWEI_SDK = 15 * KB;
/** Modules of the app-level core (app.js bundle): a page importing one would carry it twice. */
const CORE_ONLY = ['common/logic/session.js', 'common/logic/protocol.js', 'common/logic/cache.js', 'common/app/core.js',
  'common/services/p2pClient.js', 'common/services/haRepository.js', 'common/services/wearengine.js',
  'common/config/peer.js', 'common/config/dev.js', 'common/config/demo.js'].map((f) => join(JS_ROOT, f));

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

const codeOf = (files) => [...files].reduce((n, f) => n + sourceSizes(readFileSync(f, 'utf8'), extname(f)).code, 0);
const rawOf = (files) => [...files].reduce((n, f) => n + sourceSizes(readFileSync(f, 'utf8'), extname(f)).raw, 0);

const config = JSON.parse(readFileSync(join(APP, 'entry/src/main/config.json'), 'utf8'));
const pages = config.module.js[0].pages;
const bundles = [{ name: 'app.js', entries: [join(JS_ROOT, 'app.js')], page: false }]
  .concat(pages.map((p) => ({ name: p, entries: ['.hml', '.css', '.js'].map((ext) => join(JS_ROOT, p + ext)), page: true })));
console.log(`Bundles (estimated compiled size = sources without comments × ${RATIO}; warning 44 KB, error 48 KB per bundle):`);
for (const b of bundles) {
  const seen = new Set();
  for (const f of b.entries) localImports(f, seen);
  const code = codeOf(seen);
  let estimate = Math.round(code * RATIO);
  let note = '';
  if (seen.has(STUB)) {
    const withoutStub = new Set();
    for (const f of b.entries) localImports(f, withoutStub, STUB);
    const stubOnly = [...seen].filter((f) => !withoutStub.has(f));
    const isDemo = readFileSync(STUB, 'utf8').includes('P2pClient.isStub = true');
    const sdk = isDemo ? HUAWEI_SDK : codeOf([STUB]);
    const onWatch = Math.round(codeOf(withoutStub) * RATIO) + sdk;
    note = isDemo
      ? ` · on the watch, with Huawei's wearengine.js (${fmt(HUAWEI_SDK)}) instead of the stub + demo (${stubOnly.map((f) => relative(JS_ROOT, f)).join(', ')}): ~${fmt(onWatch)}`
      : ` · including Huawei's wearengine.js (${fmt(sdk)} without comments, counted ×1)`;
    estimate = isDemo ? Math.max(estimate, onWatch) : onWatch;
  }
  if (b.page) {
    for (const f of seen) if (CORE_ONLY.includes(f)) errors.push(`${b.name} imports ${relative(JS_ROOT, f)}: core modules belong to the app.js bundle (common/app/core.js), the page reaches them through getCore()`);
  }
  if (estimate > PAGE_LIMIT) errors.push(`${b.name}: ~${fmt(estimate)} compiled (estimated) > 48 KB: lite refuses it on the watch`);
  else if (estimate > PLAN_B) warnings.push(`${b.name}: ~${fmt(estimate)} compiled (estimated) > 44 KB`);
  console.log(`  ${estimate > PAGE_LIMIT ? 'BIG' : 'ok '} ${b.name.padEnd(20)} ~${fmt(estimate).padStart(8)} compiled · ${fmt(code)} without comments · ${fmt(rawOf(seen))} raw (${seen.size} files)${note}`);
}

// The real compiled bundles, when DevEco has built them (or LITE_BUNDLE_DIR points at them): the
// authoritative sizes (README § Bundle sizes).
const BUILT = process.env.LITE_BUNDLE_DIR || join(APP, 'entry/build/default/intermediates/loader_out_lite/default/js/MainAbility');
if (existsSync(join(BUILT, 'app.js'))) {
  const srcTime = Math.max(...walk(JS_ROOT).map((f) => statSync(f).mtimeMs));
  const stale = statSync(join(BUILT, 'app.js')).mtimeMs < srcTime;
  console.log(`Compiled bundles in ${relative(APP, BUILT) || BUILT}${stale ? ' (older than the sources: rebuild in DevEco for current sizes)' : ''}:`);
  for (const b of bundles) {
    const f = join(BUILT, b.page ? b.name + '.js' : 'app.js');
    if (!existsSync(f)) continue;
    const size = statSync(f).size;
    if (size > PAGE_LIMIT && !stale) errors.push(`${b.name}: compiled bundle is ${fmt(size)} > 48 KB (${relative(APP, f)})`);
    console.log(`  ${size > PAGE_LIMIT ? 'BIG' : 'ok '} ${b.name.padEnd(20)} ${fmt(size).padStart(9)} compiled`);
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
/** Whether git ignores local edits of the file (`git update-index --skip-worktree`, README § Signature). */
function skipWorktree(file) {
  try {
    return execFileSync('git', ['ls-files', '-v', '--', file], { cwd: APP, encoding: 'utf8' }).startsWith('S ');
  } catch {
    return false; // no git: stay strict
  }
}
if (!/"signingConfigs"\s*:\s*\[\s*\]/.test(profile) || /"?\b(storeFile|storePassword|keyPassword|certpath|profile)\b"?\s*:/.test(profile)) {
  if (skipWorktree('build-profile.json5')) {
    console.log('\nSigning: build-profile.json5 holds your local signing config; git ignores it (skip-worktree): ok');
  } else {
    errors.push('build-profile.json5 contains signing material: keep it local (see apps/watch-lite/README.md § Signature)');
  }
}

console.log('');
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
console.log(errors.length ? `check: ${errors.length} error(s)` : 'check: ok');
if (errors.length) process.exitCode = 1;
