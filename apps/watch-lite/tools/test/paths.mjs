// Shared paths for the tests.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const APP = resolve(here, '../..');
export const MAIN = resolve(APP, 'entry/src/main/js/MainAbility');
export const LOGIC = resolve(MAIN, 'common/logic');
export const ICON_DIR = resolve(MAIN, 'common/icons');
// import() takes a URL: a Windows path (C:\…) would be read as scheme "c:" (ERR_UNSUPPORTED_ESM_URL_SCHEME).
export const logic = (name) => import(pathToFileURL(resolve(LOGIC, name)).href);
/** Any lite module, by its path under MainAbility/ (e.g. 'common/repo/mockRepository.js'). */
export const main = (rel) => import(pathToFileURL(resolve(MAIN, rel)).href);
/** The `strings` of an i18n file, e.g. strings('fr-FR'). */
export const strings = (lang) => JSON.parse(readFileSync(resolve(MAIN, 'i18n', lang + '.json'), 'utf8')).strings;
