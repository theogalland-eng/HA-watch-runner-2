// ES5.1 guard for the lite watch app (JerryScript). Lite only supports ES5.1 at runtime, plus the
// ES-module `import`/`export` syntax that the lite toolchain itself resolves. See
// docs/platform-constraints.md (lite limits) and docs/design/watch-lite/README.md.
import esx from 'eslint-plugin-es-x';

const ES5 = esx.configs['flat/restrict-to-es5'];

export default [
  {
    files: ['entry/src/main/js/**/*.js'],
    // The Huawei Wear Engine SDK file is vendored as-is (not our code).
    ignores: ['entry/src/main/js/**/wearengine.js'],
    languageOptions: {
      // 2015 only so that the parser accepts import/export; every ES2015+ feature is then
      // forbidden by the es-x rules below.
      ecmaVersion: 2015,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        getApp: 'readonly',
        JSON: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        String: 'readonly',
        Number: 'readonly',
        Object: 'readonly',
        Array: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        isNaN: 'readonly',
      },
    },
    plugins: ES5.plugins,
    // Aggressive: also report ES2015+ prototype methods when the receiver's type is unknown
    // (e.g. `card.n.includes(x)`, `list.find(fn)`), which would throw on JerryScript.
    settings: { 'es-x': { aggressive: true } },
    rules: {
      ...ES5.rules,
      'es-x/no-modules': 'off',
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-restricted-globals': [
        'error',
        { name: 'globalThis', message: 'Not defined on JerryScript (ES5.1).' },
        { name: 'Promise', message: 'No Promise on lite: use callbacks.' },
        { name: 'Symbol', message: 'ES2015, not available on lite.' },
        { name: 'Map', message: 'ES2015, not available on lite: use a plain object.' },
        { name: 'Set', message: 'ES2015, not available on lite: use a plain object.' },
        { name: 'WeakMap', message: 'ES2015, not available on lite.' },
        { name: 'WeakSet', message: 'ES2015, not available on lite.' },
        { name: 'Proxy', message: 'ES2015, not available on lite.' },
        { name: 'Reflect', message: 'ES2015, not available on lite.' },
        { name: 'setInterval', message: 'No periodic timers (battery): see AGENTS.md / ADR-0007.' },
      ],
    },
  },
];
