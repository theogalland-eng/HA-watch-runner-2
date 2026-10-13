import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP } from './paths.mjs';

const config = JSON.parse(readFileSync(join(APP, 'entry/src/main/config.json'), 'utf8'));

test('watch bundle matches the companion’s expected peer (AGENTS.md identifiers)', () => {
  assert.equal(config.app.bundleName, 'io.github.theogallandeng.hawatch');
  assert.deepEqual(config.module.deviceType, ['liteWearable']);
});

test('companion declared in supportLists as "package:SHA-256" (no colons, ≤ 255 chars)', () => {
  const entry = config.module.metaData.customizeData.find((d) => d.name === 'supportLists');
  assert.ok(entry, 'supportLists present');
  assert.match(entry.value, /^io\.github\.theogallandeng\.hawatch\.companion:[0-9A-F]{64}$/);
  assert.ok(entry.value.length <= 255);
});

test('committed build-profile.json5 carries no signing material', () => {
  const profile = readFileSync(join(APP, 'build-profile.json5'), 'utf8');
  assert.match(profile, /"signingConfigs"\s*:\s*\[\s*\]/);
  assert.doesNotMatch(profile, /"?\b(storeFile|storePassword|keyPassword|certpath|profile)\b"?\s*:/);
});
