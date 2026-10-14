// Where the page finds the app-level core created by app.js.
//
// The lite toolchain compiles app.js and each page into separate bundles (a module imported by both is
// copied into both), but runs them in one JS context. On lite, neither `this.$app` nor `getApp()`
// reaches the app object (DevEco 6.1 Previewer engine: `this.$app` is undefined, `getApp()` returns
// undefined), and ES5 has no `globalThis`. A property set on a built-in object is seen by every bundle
// of that context, so the core is published on `JSON` (docs/platform-constraints.md § App-level core).
// Pure ES5, no @system import.

var SLOT = '__haWatchCore';

/** app.js onCreate: makes the core reachable from the pages. */
export function publishCore(core) {
    JSON[SLOT] = core;
}

/** The core published by app.js, or null (app.js did not run, or the app is closing). */
export function getCore() {
    return JSON[SLOT] || null;
}

/** app.js onDestroy. */
export function unpublishCore() {
    JSON[SLOT] = null;
}
