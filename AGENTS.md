# AGENTS.md

Single source of truth for AI coding agents (Claude Code, Cursor, Copilot, Codex, Gemini, …)
working in this repository. Plain Markdown per the [agents.md](https://agents.md/) standard.
`CLAUDE.md` imports this file; do not duplicate content there.

Keep this file lean: include only what an agent can't infer from the code, what it would get
wrong by default, and how this repo expects work to happen. Prune anything that stops being true.

## What this is

A wearable **Home Assistant** client for Huawei **Watch 4/5/Ultimate** (full wearable class) on
**HarmonyOS Next**, written in **ArkTS + ArkUI**. The **Watch GT** series is *not* a target — it runs
as lite wearable and physically rejects this ArkTS HAP (see
[docs/platform-constraints.md](docs/platform-constraints.md)). The watch has no direct network path to
Home Assistant: it talks to
an Android **companion app** over **Wear Engine P2P**, and the companion holds the HA REST
connection. The companion lives in [`apps/phone-android/`](apps/phone-android/) — the wire
contract in [docs/p2p-protocol.md](docs/p2p-protocol.md) is what all sides build against.

Maturity: clean MVP. Three entity domains (`light`, `switch`, `lock`), EN + RU localization.

## This fork: target hardware & identifiers

The maintainer of this fork runs:

- **Watch:** Huawei **Watch GT Runner 2**. It is a *lite wearable*, so its app is
  **`apps/watch-lite/`**. `apps/watch-arkts/` cannot run on it.
  Its UI follows the design spec in [docs/design/watch-lite/](docs/design/watch-lite/README.md).
- **Phone:** Xiaomi **Redmi Note 13 Pro+** on **HyperOS**, with Huawei Health. Its app is
  **`apps/phone-android/`**.
- **Priority: battery, on both devices.**
  - No periodic polling and no WebSocket.
  - The watch syncs on open, then refreshes one entity after an action, keeps a cache of the last
    state, shows a short favorites list on a black background.
  - The phone calls HA REST only when the watch asks ([ADR-0007](docs/adr/0007-android-companion-on-demand.md)).
- **The HA token never appears** in code, tests, logs or commits. The user types it in the
  companion, which stores it encrypted with the Android Keystore.

| App | Package / bundle | Status |
|-----|------------------|--------|
| Watch (`apps/watch-lite/`) | `io.github.theogallandeng.hawatch` | Done: protocol v2, P2P client, file cache, app-level core in app.js (two bundles under 48 KB); `supportLists` = companion **debug** fingerprint. Demo stub until Huawei's `wearengine.js` is copied in |
| Companion (`apps/phone-android/`) | `io.github.theogallandeng.hawatchcompanion` (Kotlin namespace `io.github.theogallandeng.hawatch.companion`) | Done; needs `hmsAppId` + `watchPeerFingerprint` in `local.properties` |

Still to do:
- **Watch SDK:** Huawei's lite `wearengine.js` is not in git. Copy it over the stub for a watch build
  ([procedure](apps/watch-lite/README.md#wear-engine-sdk-for-the-watch)); `npm run verify` runs with
  the stub. Then run the watch test
  ([checklist](apps/watch-lite/README.md#watch-test)).
- **Watch architecture:** one page (screens are `if` blocks) + the app-level core in `app.js`
  (`common/app/core.js`, reached through `common/app/link.js`): lite refuses a JS bundle above
  ~48 KB compiled, and `this.$app` / `getApp()` do not work on lite
  ([platform-constraints.md § App-level core](docs/platform-constraints.md#app-level-core)). A page
  must not import a core module (`npm run check` fails).
- **Release:** `supportLists` in `apps/watch-lite/entry/src/main/config.json` holds the companion's
  *debug* SHA-256. Replace it with the release key's fingerprint
  ([details](apps/watch-lite/README.md#identifiers)).
- **Companion:** put the watch app's fingerprint in the companion's `watchPeerFingerprint`
  ([details](apps/phone-android/README.md#identifiers)).
- **Signing never goes in git.** DevEco writes keystore paths and passwords into
  `build-profile.json5`. Enable the hook (`git config core.hooksPath .githooks`) and follow
  [apps/watch-lite/README.md § Signature](apps/watch-lite/README.md#signature-local-only-never-committed).

**Watch lite checks without DevEco** (Node ≥ 22.12), from `apps/watch-lite/tools/`:
`npm ci && npm run verify`.
- **Lint:** ES5 lint (no ES2015+, no `Promise`/`globalThis`/`setInterval`).
- **Tests:** unit tests of `common/logic/` and `common/services/`, on the real chain against the
  stub companion. The code tables of `protocol.js`, `docs/p2p-protocol.md` and `CardCodes.kt` must
  stay identical (a test parses all three).
- **Check:** estimated compiled size of each JS bundle (`app.js`, each page) ≤ 48 KB, plus the real
  bundles when DevEco has built them; no core module in a page; `if`/`show` bound to `is…`/`has…`
  booleans; the 26 icons < 1 KB; lite-only CSS/HML; no signing material
  ([details](apps/watch-lite/README.md#bundle-sizes)).
- **Icons:** `npm run icons` regenerates the 26 icons from the design paths.

## Repository layout (monorepo)

This repo hosts **multiple apps** that drive the same Home Assistant over one shared P2P contract:

- `apps/watch-arkts/` — **this** ArkTS app (full wearable: Watch 4/5/Ultimate). **Default subject of this file.**
- `apps/watch-lite/` — lite-wearable **JS** app for Watch GT (FA model, ES5.1, HML/CSS/JS, JerryScript). Mirror architecture, *different runtime* — see [docs/platform-constraints.md](docs/platform-constraints.md).
- `apps/phone-android/` — Android companion (Kotlin + Compose, Gradle). See [its section](#phone-companion-appsphone-android) below.
- root: shared AI + knowledge layer (`AGENTS.md`, `CLAUDE.md`, `DEVELOPMENT.md`, `docs/`, `.claude/`).

Unless stated otherwise, everything below describes **`apps/watch-arkts/`** (the companion has its
own section at the end). The lite app shares only
**design** (the [P2P contract](docs/p2p-protocol.md), domain model, architecture) — never code, since
ArkTS and lite-JS are different languages/compilers/runtimes ([why](docs/platform-constraints.md)).
Each app is opened as its own project root in its IDE (`apps/watch-arkts/` and `apps/watch-lite/` in
DevEco Studio; `apps/phone-android/` in Android Studio) — the git root is the monorepo root.

## Quick facts

| | |
|---|---|
| Platform | HarmonyOS Next, `wearable` device type, round screen — **Watch 4/5/Ultimate, not Watch GT** ([why](docs/platform-constraints.md)) |
| Language / UI | ArkTS, ArkUI (`@kit.ArkUI`), `ArcList`/`ArcScrollBar` |
| SDK | target `6.0.1(21)`, compatible `6.0.0(20)`; minAPI 20 / targetAPI 21 |
| Bundle | `ru.gentslava.homeassistant`, version `1.0.0` |
| State mgmt | ArkUI **V2 only** (`@ComponentV2`/`@ObservedV2`/`@Trace`/`AppStorageV2`) |
| Transport | Wear Engine P2P (`@kit.WearEngine`), UTF-8 JSON, `v:1` protocol |
| Production deps | **none** (pure ArkTS) — keep it that way unless discussed (watch apps; the companion has its own deps) |
| Test/mock libs | `@ohos/hypium`, `@ohos/hamock` (devDependencies) |
| Module | single `entry` module, source under `apps/watch-arkts/entry/src/main/ets/` |
| Repo | **monorepo** — `apps/watch-arkts` (this), `apps/watch-lite` (GT/lite-JS), `apps/phone-android` (companion, Kotlin) |

## Build / run / test / lint

This project is driven from **DevEco Studio** — there is **no committed `hvigorw` wrapper**, so
prefer the IDE actions below. **Open `apps/watch-arkts/` as the DevEco project root** (the git root is
the monorepo root, one level up). Do not invent CLI build commands; if a headless `hvigorw`/`ohpm`
CLI is available in the environment, the equivalents are listed but are not the assumed path.

| Task | DevEco Studio | CLI equivalent (only if tooling present) |
|------|---------------|------------------------------------------|
| Install deps | auto on sync | `ohpm install` |
| Build HAP | Build ▸ Build Hap(s)/APP(s) | `hvigorw assembleHap` |
| Run | Run on a **wearable emulator** (lands on Mock — see gotchas) | — |
| Local unit tests | run `entry/src/test/**` (`LocalUnit.test.ets`, `List.test.ets`) | `hvigorw test` |
| Instrumented tests | run `entry/src/ohosTest/**` on emulator/device | — |
| Lint | Code ▸ Code Linter (uses `code-linter.json5`) | `code_linter` |

Test framework is **hypium** (`describe`/`it`/`expect`); `hamock` for mocks. Workflow notes in
[DEVELOPMENT.md](DEVELOPMENT.md).

## Where things live

```
apps/
  watch-arkts/    ArkTS — full wearable (THIS app)
    entry/src/main/ets/
      pages/          Index, EntityDetails, Settings, About   (route targets)
      presentation/   store/ (HomeAssistantStore) + ui/components, WatchInsets
      domain/         model/ (EntityCard, EntityAction, P2pMessages) + repository/ (interface)
      data/           repository/ (P2p + Mock) + p2p/ (WearEngineP2pClient, PeerDeviceResolver)
      app/            Services (DI + fallback), AppKeys, AppInfo
      core/           json, log, utils (uid)
    entry/src/main/resources/   base/ (EN) + ru_RU/ strings, colors, media; profile/main_pages.json
    entry/src/{test,ohosTest}/  local unit + instrumented tests
  watch-lite/     lite-JS — Watch GT (mirror architecture, different runtime)
    entry/src/main/js/MainAbility/   pages/index (single page) + common/ (logic, repo, config, styles, services, icons) + i18n
  phone-android/  Android companion (Kotlin + Compose, Gradle wrapper committed)
    core/           pure JVM: protocol/, ha/ (REST client), mapping/ (domains), bridge/ (handler, WatchTransport)
    app/            Android: ui/ (Compose), data/ (Keystore token, settings), wear/ (Wear Engine), service/
docs/             architecture.md, p2p-protocol.md, platform-constraints.md, adr/
AGENTS.md  CLAUDE.md  DEVELOPMENT.md   shared AI layer (root)
```

Full picture: [docs/architecture.md](docs/architecture.md). Decisions: [docs/adr/](docs/adr/).
Platform constraints (why Watch, not GT): [docs/platform-constraints.md](docs/platform-constraints.md).
Contribution process & "add a new HA domain" walkthrough: [CONTRIBUTING.md](CONTRIBUTING.md).

## Architecture in one paragraph

Clean Architecture, dependencies inward: `presentation → domain ← data`. The seam is the
`HomeAssistantRepository` interface, implemented by `P2pHomeAssistantRepository` (real) and
`MockHomeAssistantRepository` (emulator). `Services` (composition root) picks one at startup with a
non-blocking fallback. UI binds to the `@Trace` fields of the single `HomeAssistantStore`. Why it's
shaped this way: [ADR-0001](docs/adr/0001-clean-architecture-layering.md)..[0004](docs/adr/0004-componentv2-appstoragev2-state.md).

## Code style (strict ArkTS — these differ from plain TypeScript)

- **No `any` / `unknown`.** Type everything; the linter is strict.
- **State: V2 decorators only.** Never mix V1 (`@State`/`@Observed`/`@Prop`/`AppStorage`) with V2.
- **Don't pass functions via `@Param`/`@Prop`.** Use other patterns for callbacks.
- **Keep `build()` UI-only.** Avoid `const`/`let` inside `build()` if the linter flags it.
- **Navigation:** prefer the UIContext router (`getUIContext().getRouter()`), not deprecated router APIs.
- **Round screen:** use `ArcList`/`ArcScrollBar` for scrollable content; verify no clipping on a round emulator.
- **No production dependencies** without discussion — the app is intentionally pure ArkTS.
- **i18n:** every user-facing string goes through `$r('app.string.…')` with both `base` (EN) and
  `ru_RU` entries. Never hardcode display text.
- Respect the layer rules: `domain/` imports no framework/`data`/`presentation`; `presentation/`
  never imports `data/` directly.

## Gotchas (non-obvious, will bite you)

- **Emulator always uses Mock.** No paired phone ⇒ `hasConnectedPeer()` is false ⇒ fallback to
  `MockHomeAssistantRepository`. This is by design, not a bug. Any change must keep Mock working.
- **`setRemoteApp(bundleName, fingerprint)` is commented out** in
  [`Services.ets`](apps/watch-arkts/entry/src/main/ets/app/Services.ets) — real-device P2P won't connect until the
  companion's bundleName + signing fingerprint are filled in.
- **`module.json5` metadata are placeholders:** `client_id = PUT_YOUR_CLIENT_ID_HERE`,
  `wearEngineRemoteAppNameList = com.yourcompany.ha.bridge`. Don't treat them as real values.
- **`Services.initWithFallback` is fire-and-forget** (not awaited in `EntryAbility`) — intentional,
  so UI never blocks on P2P/network. Don't "fix" it by awaiting.
- **P2P requests correlate by `id` with an 8s timeout**; replies may arrive out of order. Changing
  message shapes is a breaking change — bump `v` and update [docs/p2p-protocol.md](docs/p2p-protocol.md).
- **Phone-side behavior lives in `apps/phone-android/`.** Any change to the watch↔phone exchange
  updates [docs/p2p-protocol.md](docs/p2p-protocol.md) **and** the companion's `core/` (plus its tests)
  in the same PR.
- **The companion speaks protocol v2** (compact, [ADR-0008](docs/adr/0008-p2p-protocol-v2-compact.md)),
  with the lite watch as its client. This ArkTS app still speaks v1, so it no longer talks to the
  companion.

## Phone companion (`apps/phone-android/`)

Kotlin + Jetpack Compose, minSdk 26 / targetSdk 35. Package (`applicationId`) `io.github.theogallandeng.hawatchcompanion`, the one registered with Huawei; Kotlin namespace `io.github.theogallandeng.hawatch.companion`.
Open `apps/phone-android/` in Android Studio. Full guide: [its README](apps/phone-android/README.md).
Decision record: [ADR-0007](docs/adr/0007-android-companion-on-demand.md).

| Task | Command (from `apps/phone-android/`) |
|------|--------------------------------------|
| Unit tests (JVM, incl. MockWebServer) | `./gradlew test` |
| Debug APK | `./gradlew :app:assembleDebug` |
| Lint | `./gradlew :app:lintDebug` |

Rules:
- **Protocol logic goes in `core/`** (pure JVM, no Android imports) and must be unit-tested there.
  `app/` only holds the Android adapters (UI, Keystore, foreground service, Wear Engine).
- **Wear Engine SDK** (`com.huawei.hms:wearengine`, Huawei Maven repo) is only touched in `app/…/wear/`,
  behind `WatchTransport`. Tests use a fake.
- **Battery contract.**
  - HA REST runs only in response to a watch request, or to a user action on the phone.
  - No polling, timers, WebSocket or wakelocks. The foreground service only keeps the receiver registered.
  - Reply within the 6.5 s deadline (the watch times out at 8 s).
- **Secrets.**
  - The token is encrypted with the Keystore (`SecureTokenStore`), sent only over HTTPS, and never
    logged or written into an `ACK.error`.
  - Logs carry only types, ids, sizes and error codes.
  - Never commit `local.properties` / `keystore.properties` / `*.jks`.
- **i18n.** Every string lives in `values/` (EN), `values-fr/` and `values-ru/`. A unit test enforces
  the same keys and placeholders. Nothing localised is sent to the watch (v2 sends codes).
- **New HA domain.** Add a `DomainMapper` in `core/mapping/` (it picks the service from the state),
  a code in `CardCodes` **and** in the tables of [docs/p2p-protocol.md](docs/p2p-protocol.md), plus tests.
- **Message size.** Every P2P message stays ≤ 900 bytes (Wear Engine: 1 KB). `ProtocolCodecTest`
  checks the worst case.

Gotchas:
- **`watchPeerFingerprint` is a placeholder** (`gradle.properties`; override in `local.properties`).
  Real P2P will not connect until it holds the watch app's fingerprint. Do not invent one.
- **Huawei-side registration is manual.** It means the Wear Engine service on HUAWEI Developers,
  registered with the companion package plus the SHA-256 of a *stable* signing key. It cannot be
  verified from CI.
- **HyperOS.** The user must allow autostart and "No restrictions" for battery, for the companion
  **and** for Huawei Health (Wear Engine error 15 = Health not allowed to autostart).
- **Maven Central rate limits (HTTP 429)** can hit sandboxed/CI environments; retry, or use a mirror
  through a *local* Gradle init script. Do not commit mirrors.

## Working in this repo

- **Verify before claiming done:** the emulator (Mock mode) must still run, and the linter must
  report no new ArkTS errors/warnings. See the PR checklist in [CONTRIBUTING.md](CONTRIBUTING.md).
  For the companion: `./gradlew test` and `./gradlew :app:assembleDebug :app:lintDebug` pass.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`), one focused change per PR.
- **Process & agent roles** (Explore → Plan → Code → Commit, review/test agents): [DEVELOPMENT.md](DEVELOPMENT.md).
- **Scope discipline:** touch only what the task needs; don't refactor adjacent code or remove
  comments/placeholders (e.g. the commented `setRemoteApp`) you don't fully understand.
