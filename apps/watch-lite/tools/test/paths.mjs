// Shared paths for the tests.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const APP = resolve(here, '../..');
export const LOGIC = resolve(APP, 'entry/src/main/js/MainAbility/common/logic');
export const ICON_DIR = resolve(APP, 'entry/src/main/js/MainAbility/common/icons');
// import() takes a URL: a Windows path (C:\…) would be read as scheme "c:" (ERR_UNSUPPORTED_ESM_URL_SCHEME).
export const logic = (name) => import(pathToFileURL(resolve(LOGIC, name)).href);
