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
  config.json                 FA manifest (liteWearable)
  js/MainAbility/
    app.js                    app entry (onCreate / onShow)
    pages/{index,entity,settings,about}/  index.hml + .css + .js
    common/
      store.js                shared state (via getApp()/singleton module — NOT globalThis)
      services/               haRepository.js, p2pClient.js
      repo/                   MockHomeAssistantRepository.js
      logic/                  pure ES5 logic, unit-tested with Node: format, look (design rules), store, cache, palette
      constants/, utils/
      icons/                  the 26 design icons (generated, see tools/) + legacy icons until PR 3b
    i18n/                     en-US.json, ru-RU.json
  resources/                  app icon, strings
tools/                        headless checks (Node ≥ 22.12): ES5 lint, unit tests, size/lite checks, icon generator
```

This **mirrors** the ArkTS app's architecture (store / repository / mock / P2P / 4 pages /
EN+RU) — same design, reimplemented in lite-JS. The shared contract is
[../../docs/p2p-protocol.md](../../docs/p2p-protocol.md).

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
- **`npm test`**: `node:test` on the pure logic in `common/logic/`, the icons (pixels, size,
  reproducibility) and `config.json`.
- **`npm run check`**:
  - each page (hml + css + js + local imports) ≤ 48 KB;
  - the 26 icons, each < 1 KB;
  - decoded RGBA and estimated HAP size;
  - only lite CSS properties/selectors and HML components/events (no `gap`, `box-sizing`,
    descendant selectors, `touchstart`…). One limitation: `:active` is accepted on any class,
    but lite only applies it to `input[type=button]`;
  - no signing material in `build-profile.json5`.

These checks do **not** replace DevEco: the build, the round previewer/simulator and the real watch
remain manual.

## Hard limits (lite wearable)

HAP ≤ 10 MB · page ≤ 48 KB · ~1 MB RAM · no background · router has no back-stack · state not
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

- **ES5.1 only.** Share state via `getApp().data` / a singleton module — `globalThis` throws
  `ReferenceError` on JerryScript.
- **Watch has no internet.** All network goes through the phone companion over Wear Engine P2P
  (`common/services/p2pClient.js`); `haRepository.js` is currently a mock.
- **Icons bloat.** A PNG is decoded to raw RGBA in the `.bin`: a large PNG can blow the 10 MB HAP
  limit. The design icons are 48 or 24 px, generated by `tools/` (never resized in CSS).
- **Text spacing.** Lite `text` defaults to `letter-spacing: 2px`: set `0px` explicitly.
- **No touch events.** Only `click`, `longpress` and `swipe`, so there is no press highlight on rows.
- **1 KB per P2P message.** Wear Engine limits every message; the compact protocol v2 (PR 2b)
  keeps each one ≤ 900 bytes.
