# Home Assistant — Watch GT (lite wearable)

Lite-wearable Home Assistant client for **Huawei Watch GT 4/5/6 and GT Runner 2** (this fork's
target). This is the **lite track**: a different runtime from the ArkTS app in
[`../watch-arkts/`](../watch-arkts/) — see [platform-constraints.md](../../docs/platform-constraints.md)
for why GT needs this.

## Stack

- **FA model**, `config.json`, `deviceType: liteWearable`.
- **JavaScript limited to ES5.1** (no `globalThis`, `?.`, `??`, spread, `async`/`await`, `Promise`).
- UI: **HML + CSS + JS** (no ArkUI, no `ArcList`). Engine: **JerryScript / ACE Lite**.
- Bundle **`io.github.theogallandeng.hawatch`**, the peer the Android companion expects (see [Identifiers](#identifiers)).

## Layout

```
entry/src/main/
  config.json                 FA manifest (liteWearable), one page
  js/MainAbility/
    app.js                    app entry: creates the app-level core and publishes it (own JS bundle)
    pages/index/              the only page: draws the core, every design screen is an `if` block
    common/
      app/                    core.js (Wear Engine client + repository + session, app.js bundle),
                              link.js (publishCore / getCore: how the page reaches it)
      logic/                  pure ES5, unit-tested with Node:
                                core (app.js bundle): session (rules, timers, tap guard), rules
                                (tap / target / busy), store, protocol (v2 codes), cache, utf8;
                                drawing (page bundle): view (view-models), look (looks and texts),
                                format, palette
      services/               p2pClient.js (request/reply by id), haRepository.js (v2 + file cache),
                              wearengine.js = STUB of Huawei's SDK file, simulating the v2 companion
      config/                 peer.js (companion package + fingerprint);
                              dev.js + demo.js (demo switches and favorites, imported by the stub only)
      styles/base.css         shared styles: type sizes, static colours, buttons
      icons/                  the 26 design icons (generated, see tools/)
    i18n/                     fr-FR.json (design labels), en-US.json, ru-RU.json
  resources/                  app icon, strings
tools/                        headless checks (Node ≥ 22.12): ES5 lint, unit tests, size/lite checks, icon generator
```

Same layering as the ArkTS app (state / repository / P2P) and the same
[P2P contract](../../docs/p2p-protocol.md), reimplemented in lite-JS.

## One page, an app-level core, demo mode in the Wear Engine stub

Lite's router has no back stack: `router.replace` destroys the current page with its timers and
callbacks. An action started in the detail, or a row "en cours" when Réglages opens, would lose its
result, and every return to the list would rebuild the page (and resync). So the app has **a
single page**: each design screen (list, detail, unlock confirmation, errors 5b/5c, no favorite 5d,
settings) is an `if` block (not `show`), so only the visible screen's elements exist in memory.

Lite also refuses a JS bundle above about 48 KB once compiled
([platform-constraints.md](../../docs/platform-constraints.md#page-size-and-js-memory)), and app.js and
each page are separate bundles. So the work is split in two:
- **`app.js` bundle, the core** (`common/app/core.js`): Wear Engine P2P client, repository (protocol
  v2, cache file `internal://app/ha_cache.json`), session (rules, timers, tap guard). app.js creates it
  in `onCreate`, starts the cache + sync at once, publishes it (`common/app/link.js`) and destroys it in
  `onDestroy` (timers cleared, receiver unregistered).
- **page bundle, the drawing**: `view.js` (view-models with the design texts), `look.js`, `format`,
  `palette`, HML/CSS. The page gets the core with `getCore()`, draws `core.session` on every change and
  forwards taps (`core.tapRow(k)`, ...). It imports no core module (`npm run check` refuses it).

On lite, `this.$app` and `getApp()` do not reach the app object; app.js and the page share one JS
context, so the core is published on a built-in object (`JSON`,
[platform-constraints.md § App-level core](../../docs/platform-constraints.md#app-level-core)). The
start log says `core=app`; a page without the core logs `[ha] core=MISSING` and draws nothing.

The app always runs the **real chain**: session → `haRepository.js` → `p2pClient.js` → `wearengine.js`.

**Demo mode.** The committed `wearengine.js` is a **stub** of Huawei's SDK file. It answers like the
v2 companion: the design's 10 favorites, the prototype's delays, `stale` on an old favorites
revision, unlocking only with `act: "confirm"`. So the DevEco Previewer/simulator shows every
screen, and the log starts with `[ha] start 1.0.0 (Wear Engine stub) core=app`. `dev.js` and `demo.js` are
imported **only by the stub**: with Huawei's file ([below](#wear-engine-sdk-for-the-watch)), they
leave the build and the app talks to the phone. Edit `common/config/dev.js` and reload the preview
to reproduce each design screen:

| `dev.js` | Design screen |
|----------|---------------|
| `favorites: 5, network: 'ok', cache: true` | 1 dashboard (5a "Synchro…" at launch); tap a row for 2a → 2b |
| `favorites: 10` | long list variant (scroll 0 / 408 / 816 px) |
| `network: 'ha'` (with cache) | 2c on a tap; red indicator "HA injoignable", tap it for 5c |
| `network: 'tel', cache: false` | 5b full screen |
| `network: 'ha', cache: false` | 5c full screen |
| `favorites: 0` | 5d "Aucun favori" |
| tap "Porte d'entrée" / long press a row / Réglages | 3 confirmation / 4a–4c detail / 6 settings |
| `latency: 4000` | every stub reply takes 4 s: "en cours" (blue) stays visible, then the check |
| `trace: true` | one line per redraw in the console: `[ha] paint list r0=Extinction… r1=Éteinte …` |

`cache: true` reads the cache file written by the previous run: the very first run has none (full
screen 5b/5c on a failed sync). `cache: false` neither reads nor writes it. Changing `favorites`
shows the old cached list until the sync answers.

## Wear Engine SDK (for the watch)

Huawei's lite JS SDK file (`wearengine.js`, exporting `P2pClient`, `Message`, `Builder`) is not in
the repo. Download it from HUAWEI Developers (Wear Engine, lite wearable JS SDK) and keep it outside
the repo. Replacing the stub with it removes the whole demo from the build:

```bash
# from the monorepo root
STUB=apps/watch-lite/entry/src/main/js/MainAbility/common/services/wearengine.js
cp ~/huawei/wearengine.js "$STUB"            # Huawei's file over the stub
git update-index --skip-worktree "$STUB"     # git no longer shows or commits it
# build the HAP in DevEco; npm run check now counts Huawei's wearengine.js in the app.js bundle

# back to demo mode (Previewer):
git update-index --no-skip-worktree "$STUB"
git checkout -- "$STUB"
```

- With Huawei's file, the log line is `[ha] start 1.0.0 core=app` (no "stub").
- `dev.js` is no longer read: the cache file is always used, with no trace.
- `npm test` skips the tests that need the stub (they play the scenarios against the simulated
  companion). Run `npm run verify` in demo mode before committing.
- The peer (`common/config/peer.js`) must match `supportLists`; a test checks it. Send result
  **206** means not delivered: package or fingerprint mismatch, no receiver, Bluetooth off, or the
  watch app not in the foreground (Huawei Wear Engine FAQ). The watch then shows "Échec : tél.
  déconnecté".

## Bundle sizes

Lite refuses a JS bundle above about 48 KB of compiled code on the watch; the Previewer still loads
it but logs `File exceeds size limit but allowed on simulator` in `previewer.log`
(`%LOCALAPPDATA%\Huawei\DevEcoStudio6.1\log\`). That line is the authoritative signal
([platform-constraints.md](../../docs/platform-constraints.md#page-size-and-js-memory)).

- `npm run check` estimates each bundle (`app.js` and each page, with their local imports) at
  1.3 × the sources without comments (measured ratio 1.22–1.26) and **fails above 48 KB**, warns
  above 44 KB. Huawei's `wearengine.js` is already plain JS and counts ×1 (its size without comments).
  In demo mode, the `app.js` bundle is also estimated with Huawei's file in place of the stub and its
  demo data (15 KB: SDK 5.0.2.306 is 14 951 bytes without comments, 17 576 raw).
- When DevEco has built the HAP, `npm run check` also prints the **real** compiled bundles from
  `entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/` (`app.js`,
  `pages/index/index.js`) and fails above 48 KB; `LITE_BUNDLE_DIR=<dir> npm run check` points it at
  another build output.

Measured on this version (DevEco 6.1): `app.js` 36 727 bytes and `pages/index/index.js` 38 952 bytes (with the
stub), versus 60.0 KB for the single page that held everything. **With Huawei's `wearengine.js`
5.0.2.306: `app.js` 46 663 bytes** (limit 49 152): about 2.5 KB of margin, so keep new code out of the
app.js bundle or trim it first.

`npm run check` does not fail on a local signing config in `build-profile.json5` when git ignores it
(`skip-worktree`, [Signature](#signature-local-only-never-committed)); the tests check the committed
version.

## Watch test

No lite API gives the free JS memory, so the app is validated **on the Runner 2**, with Huawei's
`wearengine.js` and the companion paired. Run this sequence and read the logs through DevEco
Assistant (查看日志 / View Logs):

1. Start the app: `[ha] start 1.0.0 core=app`, then the list from the cache, then "à l'instant".
2. **10 favorites** in the companion: the whole list shows.
3. **Scroll** to the bottom and back with the crown or a swipe.
4. Tap the locked lock: **confirmation**, then "Déverrouiller", then "en cours" and the new state;
   the row under the button must not toggle.
5. Long press a row: **detail**, act from its button, then swipe back.
6. Open **Réglages**, then "Resynchroniser"; start an action and open Réglages while it runs: back on
   the list, the row ends in its real state.
7. **10 actions in a row** on light/switch rows, each waiting for its result (check or failure).
8. Quit and restart: the list shows the last state at once (cache file).

Pass: no crash, no freeze, no black screen, no "out of memory", JS error or `core=MISSING` in the log,
and each row ends in its real state.

## Design

The UI spec is in [docs/design/watch-lite/](../../docs/design/watch-lite/README.md): screens,
palette, type sizes, 466×466 safe areas, icons, interaction rules, and the gaps with the lite
platform (each with an alternative).

## Identifiers

| | Value | Where |
|---|---|---|
| Watch bundle | `io.github.theogallandeng.hawatch` | `entry/src/main/config.json` → `app.bundleName` |
| Companion allowed to talk to the watch | `io.github.theogallandeng.hawatchcompanion` + the SHA-256 of its signing certificate, without colons | `config.json` → `module.metaData.customizeData` → `supportLists` |

`supportLists` currently holds the companion's **debug** fingerprint
(`0086FAF4…D29667`). **Replace it when the companion is signed with a release key**: the value is
`<companion package>:<SHA-256 of that key, upper case, no colons>`, 255 characters maximum. On the
phone side, the watch app's own fingerprint goes into the companion's `watchPeerFingerprint`
([phone README](../phone-android/README.md#identifiers)).

## Checks without DevEco (`tools/`)

```bash
cd apps/watch-lite/tools
npm ci            # once (ESLint + eslint-plugin-es-x, nothing else)
npm run verify    # = lint + test + check
npm run icons     # regenerate the 26 icons from the design paths (then: git diff shows nothing)
```

Tested on Linux (Node 22) and also on Windows (Node 24). The tools work with native Windows paths:
- modules loaded dynamically go through `pathToFileURL`;
- everything else uses static imports or `node:path`.

- **`npm run lint`**: ESLint with `eslint-plugin-es-x` `restrict-to-es5` on all the lite JS. It
  forbids every ES2015+ feature: `const`/`let`, arrows, classes, template literals, shorthands,
  spread, `?.`, `??`, `async`.
  - Only `import`/`export` is allowed, since the lite toolchain resolves it.
  - Also forbidden: `globalThis`, `Promise`, `Map`, `Set`, `Symbol`, `Proxy`, `Reflect`, and
    `setInterval` (battery).
- **`npm test`**: `node:test` on:
  - the pure logic in `common/logic/`: the interaction rules played with fake timers on the real
    chain (session → repository → P2P client → stub companion) and checked with the real fr-FR
    texts (one tap = one action, 1.5 s / 3 s / 8 s / 10 s, retry, back gesture, late replies,
    favorites revision, cache file);
  - the protocol: the code tables of `protocol.js` equal those of
    [docs/p2p-protocol.md](../../docs/p2p-protocol.md) **and** of the companion's `CardCodes.kt`
    (both parsed); decoding of unknown codes; request sizes;
  - the P2P client and the repository on a fake SDK and a fake `@system.file`;
  - the i18n files (same keys and placeholders in the three languages);
  - the icons (pixels, size, reproducibility) and `config.json`.
- **`npm run check`**:
  - each JS bundle (`app.js`, each page) with its local imports: estimated compiled size ≤ 48 KB,
    also with Huawei's `wearengine.js` instead of the stub; the real compiled sizes when DevEco has
    built them ([Bundle sizes](#bundle-sizes)); no core module imported by a page;
  - the 26 icons, each < 1 KB;
  - decoded RGBA and estimated HAP size;
  - only lite CSS properties/selectors and HML components/events (no `gap`, `box-sizing`,
    descendant selectors, `touchstart`…). One limitation: `:active` is accepted on any class,
    but lite only applies it to `input[type=button]`;
  - every `if`/`show` bound to a boolean named `is…`/`has…` (a string there logs
    `JSI:ValueToBoolean params invalid!` on every render);
  - no fixed `width`/`height` above 454 px: the DevEco Previewer is 454 × 454, the Runner 2 466 ×
    466. Full-width containers are `100%` and the 340 px column is centred by alignment;
  - no signing material in `build-profile.json5`.

These checks do **not** replace DevEco: the build, the round previewer/simulator and the real watch
remain manual. Check the screens in **both** the Previewer (454) and the simulator (466).

## Hard limits (lite wearable)

HAP ≤ 10 MB · ~48 KB of compiled JS per bundle (app.js, each page) · ~1 MB RAM · no background · router has no back-stack · state not
restored after restart · images decoded to raw RGBA (keep icons tiny). Full list:
[platform-constraints.md](../../docs/platform-constraints.md).

## Signature (local only, never committed)

The committed `build-profile.json5` has `"signingConfigs": []`. DevEco writes the keystore path,
the encrypted passwords and the `.p7b`/`.cer` paths **into that same file**, so you must protect it
before configuring signing. Do this once per clone:

```bash
git config core.hooksPath .githooks          # pre-commit hook: refuses signing material and *.p12/*.p7b/*.cer/*.csr
# then, in DevEco: File > Project Structure > Signing Configs (debug cert + .p7b with the watch UDID)
git update-index --skip-worktree apps/watch-lite/build-profile.json5   # git now ignores your local edits
```

- **Template:** [`build-profile.signing.example.json5`](build-profile.signing.example.json5) shows
  what DevEco adds, with placeholder values.
- **Undo the protection** (e.g. to pull a change to the file):
  `git update-index --no-skip-worktree apps/watch-lite/build-profile.json5`, stash your signing,
  pull, re-apply.
- **Never commit:** `*.p12`, `*.p7b`, `*.cer`, `*.csr`; they are git-ignored here. `npm run check`
  also fails if signing material shows up in `build-profile.json5`.

## Build & install (no direct hdc on GT)

GT has no "HDC debugging" / "Debug via Wi-Fi", so install goes **through the phone**:

1. Open `apps/watch-lite/` as the project root in DevEco Studio; configure signing as above, then
   build a **signed** HAP (debug cert + the watch UDID in the `.p7b` profile, via AppGallery
   Connect, for the bundle `io.github.theogallandeng.hawatch`).
2. Push the HAP to the phone, install with **HUAWEI DevEco Assistant** (watch paired, Huawei Health
   running).
3. Logs: **查看日志 / View Logs** in DevEco Assistant (no system `hdc`/`hilog` on GT).

## Gotchas

- **ES5.1 only.** `globalThis` throws `ReferenceError` on JerryScript; `this.$app` and `getApp()`
  do not reach the app object either: the core is shared through `common/app/link.js`.
- **Watch has no internet.** All network goes through the phone companion over Wear Engine P2P
  (`common/services/p2pClient.js`). Without Huawei's `wearengine.js`, the stub simulates the
  companion (demo mode).
- **Timers.** Only `setTimeout`, all owned by the core and cleared in app.js `onDestroy`; no
  `setInterval` (the lint refuses it).
  "il y a 3 min" is recomputed on each redraw, not by a timer.
- **Icons bloat.** A PNG is decoded to raw RGBA in the `.bin`: a large PNG can blow the 10 MB HAP
  limit. The design icons are 48 or 24 px, generated by `tools/` (never resized in CSS).
- **Text spacing.** Lite `text` defaults to `letter-spacing: 2px`: set `0px` explicitly.
- **No RegExp.** A single regex literal blacks the screen out ("Eval JS file failed — TypeError:
  wrong type of argument"). The lint refuses it; use `indexOf` / `slice`.
- **`$t` eats `{name}`.** Placeholders in `i18n/*.json` are `[n]`, `[max]`, `[ago]`, filled by
  `fill()` after `$t`.
- **Quotes.** The lite font draws ’ ‘ “ ” full width (a gap in "Porte d’ entrée"): use `'`.
- **No `if`/`else` inside a `for`.** Rows keep a fixed structure (`show` on the check, one state
  text) so that a data change only updates texts and visibility.
- **No touch events.** Only `click`, `longpress` and `swipe`, so there is no press highlight on rows.
- **Tap guard.** Lite delivers the release of a tap to the screen that tap built ("Déverrouiller" then
  the row under it toggled). Every tap within 500 ms of a screen change is ignored
  (`TAP_GUARD_MS`, `session.js`).
- **Booleans in `if`/`show`.** A string there logs `JSI:ValueToBoolean params invalid!` on every
  render; bind `is…`/`has…` booleans (`npm run check`).
- **1 KB per P2P message.** Wear Engine limits every message; the compact protocol v2 (PR 2b)
  keeps each one ≤ 900 bytes.
