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
    app.js                    app entry
    pages/index/              the only page: every design screen is an `if` block (index.hml + .css + .js)
    common/
      logic/                  pure ES5, unit-tested with Node:
                                session (interaction rules, timers), view (view-models), store (state),
                                look (design rules per domain), format, palette, cache
      repo/mockRepository.js  Mock mode: the design's 10 favorites, prototype latencies
      config/dev.js           Mock switches: 5 / 10 / 0 favorites, network ok / ha / tel, cache
      styles/base.css         shared styles: type sizes, static colours, buttons
      services/               haRepository.js, p2pClient.js (PR 3c)
      icons/                  the 26 design icons (generated, see tools/)
    i18n/                     fr-FR.json (design labels), en-US.json, ru-RU.json
  resources/                  app icon, strings
tools/                        headless checks (Node ≥ 22.12): ES5 lint, unit tests, size/lite checks, icon generator
```

Same layering as the ArkTS app (state / repository / mock / P2P) and the same
[P2P contract](../../docs/p2p-protocol.md), reimplemented in lite-JS.

## One page, Mock mode

Lite's router has no back stack: `router.replace` destroys the current page with its timers and
callbacks. An action started in the detail, or a row "en cours" when Réglages opens, would lose its
result, and every return to the list would rebuild the page (and resync). So the app has **a
single page**:
- each design screen (list, detail, unlock confirmation, errors 5b/5c, no favorite 5d, settings) is
  an `if` block (not `show`): only the visible screen's elements exist in memory;
- the rules live in `common/logic/session.js` (no `@system` import, timers injected), the texts and
  colours of each screen in `common/logic/view.js`; the page only wires them to lite.

**Mock mode** (`common/repo/mockRepository.js`) is used only when Wear Engine is unavailable: the
DevEco previewer/simulator, or a build without the SDK. In this PR it is always used (the Wear
Engine repository comes in PR 3c). Edit `common/config/dev.js` and reload the preview to reproduce
each design screen:

| `dev.js` | Design screen |
|----------|---------------|
| `favorites: 5, network: 'ok', cache: true` | 1 dashboard (5a "Synchro…" at launch); tap a row for 2a → 2b |
| `favorites: 10` | long list variant (scroll 0 / 408 / 816 px) |
| `network: 'ha'` (with cache) | 2c on a tap; red indicator "HA injoignable", tap it for 5c |
| `network: 'tel', cache: false` | 5b full screen |
| `network: 'ha', cache: false` | 5c full screen |
| `favorites: 0` | 5d "Aucun favori" |
| tap "Porte d'entrée" / long press a row / Réglages | 3 confirmation / 4a–4c detail / 6 settings |
| `latency: 4000` | every Mock reply takes 4 s: "en cours" (blue) stays visible, then the check |
| `trace: true` | one line per redraw in `previewer.log`: `[ha] paint list r0=Extinction… r1=Éteinte …` |

## JS memory (main criterion) and plan B

`npm run check` measures the page source (without comments), but what counts on the watch is the
**JS memory at runtime**: the lite simulator shows a limit of 49 144 bytes (48 KB) in non-debug
mode (origin of the 48 KB: see [platform-constraints.md](../../docs/platform-constraints.md)).
Measure it in DevEco, lite simulator, **non-debug** mode, in the worst case:

1. `dev.js` with `favorites: 10`;
2. scroll the list to the bottom;
3. tap "Porte d'entrée" (unlock confirmation open);
4. back, long press a row (detail);
5. back, Réglages.

Note the highest value. Threshold **< 49 144 B**; target **≤ 40 000 B**, to keep room for PR 3c
(protocol, P2P client, cache).

**Plan B**, if the measured margin is too small in PR 3c (decided on the measured memory, not on the
source size):
- move Réglages to its own page (no action starts there);
- keep the session (actions in flight, timers, P2P receiver) in an application-level module instead
  of the page. ⚠ To verify first: lite wearables reportedly do not support the `$def` global data,
  and pass data between pages through storage or files; an application-level module may not be
  shared between pages either.

## Design

The UI spec is in [docs/design/watch-lite/](../../docs/design/watch-lite/README.md): screens,
palette, type sizes, 466×466 safe areas, icons, interaction rules, and the gaps with the lite
platform (each with an alternative).

## Identifiers

| | Value | Where |
|---|---|---|
| Watch bundle | `io.github.theogallandeng.hawatch` | `entry/src/main/config.json` → `app.bundleName` |
| Companion allowed to talk to the watch | `io.github.theogallandeng.hawatch.companion` + the SHA-256 of its signing certificate, without colons | `config.json` → `module.metaData.customizeData` → `supportLists` |

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
  - the pure logic in `common/logic/`: the interaction rules played with fake timers on the Mock
    and checked with the real fr-FR texts (one tap = one action, 1.5 s / 3 s / 8 s / 10 s, retry,
    back gesture, late replies, favorites revision);
  - the i18n files (same keys and placeholders in the three languages);
  - the icons (pixels, size, reproducibility) and `config.json`.
- **`npm run check`**:
  - each page (hml + css + js + local imports) **without comments**: warning above 40 KB (and above
    44 KB, the plan B threshold), error above 48 KB. The raw size and the size without comments or
    indentation are printed too. Comments never reach the watch: the lite toolchain compiles the page;
  - the 26 icons, each < 1 KB;
  - decoded RGBA and estimated HAP size;
  - only lite CSS properties/selectors and HML components/events (no `gap`, `box-sizing`,
    descendant selectors, `touchstart`…). One limitation: `:active` is accepted on any class,
    but lite only applies it to `input[type=button]`;
  - no fixed `width`/`height` above 454 px: the DevEco Previewer is 454 × 454, the Runner 2 466 ×
    466. Full-width containers are `100%` and the 340 px column is centred by alignment;
  - no signing material in `build-profile.json5`.

These checks do **not** replace DevEco: the build, the round previewer/simulator and the real watch
remain manual. Check the screens in **both** the Previewer (454) and the simulator (466).

## Hard limits (lite wearable)

HAP ≤ 10 MB · 48 KB (JS memory or page size, origin to confirm) · ~1 MB RAM · no background · router has no back-stack · state not
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

- **ES5.1 only.** `globalThis` throws `ReferenceError` on JerryScript. The single page needs no
  state shared between pages.
- **Watch has no internet.** All network goes through the phone companion over Wear Engine P2P
  (`common/services/p2pClient.js`, PR 3c). Until then the app runs on the Mock.
- **Timers.** Only `setTimeout`, all cleared in `onDestroy`; no `setInterval` (the lint refuses it).
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
- **1 KB per P2P message.** Wear Engine limits every message; the compact protocol v2 (PR 2b)
  keeps each one ≤ 900 bytes.
