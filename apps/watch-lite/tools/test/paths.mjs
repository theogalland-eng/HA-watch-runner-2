// Shared paths for the tests.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const APP = resolve(here, '../..');
export const LOGIC = resolve(APP, 'entry/src/main/js/MainAbility/common/logic');
export const ICON_DIR = resolve(APP, 'entry/src/main/js/MainAbility/common/icons');
export const logic = (name) => import(resolve(LOGIC, name));
