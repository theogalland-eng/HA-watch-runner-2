#!/usr/bin/env node
// Runs ESLint on the lite JS from the app root (cross-platform, no shell tricks).
import { ESLint } from 'eslint';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const eslint = new ESLint({ cwd: resolve(here, '..'), overrideConfigFile: resolve(here, 'eslint.config.mjs') });
const results = await eslint.lintFiles(['entry/src/main/js/**/*.js']);
const formatter = await eslint.loadFormatter('stylish');
const output = await formatter.format(results);
const problems = results.reduce((n, r) => n + r.errorCount + r.warningCount, 0);
if (output) console.log(output);
console.log(`ES5 lint: ${results.length} file(s), ${problems} problem(s).`);
if (problems > 0) process.exitCode = 1;
