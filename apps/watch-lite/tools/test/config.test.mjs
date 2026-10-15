import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { APP, main } from './paths.mjs';

const config = JSON.parse(readFileSync(join(APP, 'entry/src/main/config.json'), 'utf8'));

test('watch bundle matches the companion’s expected peer (AGENTS.md identifiers)', () => {
  assert.equal(config.app.bundleName, 'io.github.theogallandeng.hawatch');
  assert.deepEqual(config.module.deviceType, ['liteWearable']);
});

test('companion declared in supportLists as "package:SHA-256" (no colons, ≤ 255 chars)', () => {
  const entry = config.module.metaData.customizeData.find((d) => d.name === 'supportLists');
  assert.ok(entry, 'supportLists present');
  // The companion's package as registered with Huawei (AppGallery Connect + Wear Engine): no dot before "companion".
  assert.match(entry.value, /^io\.github\.theogallandeng\.hawatchcompanion:[0-9A-F]{64}$/);
  assert.ok(entry.value.length <= 255);
});

test('committed build-profile.json5 carries no signing material', () => {
  // What git commits (the index), not the working file: locally it holds the developer's signing
  // config, kept out of git with skip-worktree (README § Signature). Without git, the working file.
  let profile;
  try {
    profile = execFileSync('git', ['show', ':./build-profile.json5'], { cwd: APP, encoding: 'utf8' });
  } catch {
    profile = readFileSync(join(APP, 'build-profile.json5'), 'utf8');
  }
  assert.match(profile, /"signingConfigs"\s*:\s*\[\s*\]/);
  assert.doesNotMatch(profile, /"?\b(storeFile|storePassword|keyPassword|certpath|profile)\b"?\s*:/);
});

test('the P2P peer (common/config/peer.js) is the companion declared in supportLists', async () => {
  const { PEER } = await main('common/config/peer.js');
  const entry = config.module.metaData.customizeData.find((d) => d.name === 'supportLists');
  assert.equal(`${PEER.pkg}:${PEER.fingerprint}`, entry.value);
});
