# Platform constraints: full wearable vs lite wearable

Everything we established about which Huawei watches can run this app, with on-device and
byte-level evidence. Read this before assuming anything about the target device — it overrides
older statements (including the original README) that called the Watch GT series a target.

## TL;DR

- **Target device class: full wearable** — Huawei **Watch 4 / 5 / Ultimate** (HarmonyOS Next,
  ArkTS Stage Model, ArkUI). This is what the ArkTS code in this repo runs on.
- **Huawei Watch GT 4 / 5 / 6 are `lite wearable`** for third-party developers. They **cannot run
  third-party ArkTS Stage apps** — only lite JS (FA model, HML/CSS/JS, JerryScript). Verified on a
  physical GT 6 (firmware 6.0.0.188), 2026-06-14.
- A lite (JS) Home Assistant client for GT is a **separate track** (different language + runtime),
  not a build variant of this project. What is shared between tracks is the **architecture and the
  [P2P protocol contract](p2p-protocol.md)**, not the binary.

## Two HarmonyOS runtimes for watches

These are two different languages → compilers → bytecode formats → engines. They are not
interchangeable; the source looking "JS-like" in both cases is superficial.

| | **Full wearable** (this repo) | **Lite wearable** (GT series) |
|---|---|---|
| Model | Stage (`UIAbility`, `module.json5`) | FA (`MainAbility`, `config.json`) |
| `deviceType` | `wearable` | `liteWearable` |
| Language | ArkTS (TypeScript+, decorators, static types) | JS limited to **ES5.1** (no `globalThis`, `?.`, `??`, spread, `async`/`await`, `Promise`) |
| UI | ArkUI declarative (`@Component`/`build()`, `ArcList`) | HML + CSS + JS (Vue-like); **no `ArcList`** |
| Compiler | ArkCompiler → `.abc` | haptobin → `.bin` |
| Bytecode magic | `PANDA` (`50 41 4E 44 41`) | haptobin header (`be 00 00 00 …` + bundleName) |
| Engine / VM | ARK JS Runtime (`ark13.0.1.0`), full ACE | JerryScript, ACE Lite |
| OS tier | standard-ish HarmonyOS | LiteOS mini-system |
| Devices | Watch 4 / 5 / Ultimate | Watch GT 3/4/5/6, Band, Fit |

## Evidence

This is not inference — it was confirmed directly.

**Field test (physical GT 6, firmware 6.0.0.188, 2026-06-14):**
- A minimal, correctly signed ArkTS Stage HAP fails to install with:
  `Installation failed: Failed to decompress entry-default-signed.hap`.
  The **signature passed** (no `9568xxx` signature errors) — it died at the *decompress/format*
  stage. The device's lite installer cannot unpack the Stage container. → **format/runtime
  absence**, not a policy gate.
- A lite (FA/JS) HAP installs and runs on the same watch (`Application onCreate` in the logs).
- DevEco *does* offer an ArkTS Stage target for "Wearable" — so the barrier is **in the device,
  not the toolchain**.

**Byte-level comparison of the two builds** (`lite.zip` / `wearable.zip`):
- `wearable.hap` → `ets/modules.abc` starts with `PANDA` (ARK bytecode, VM `ark13.0.1.0`), plus a
  Stage `module.json` (`virtualMachine: ark13.0.1.0`, `compileMode: esmodule`, `deviceType:
  wearable`) and normal `resources/`.
- `lite.hap` → a single `entry-default-signed.bin` (haptobin container; JerryScript code + images
  decoded to **raw RGBA bitmaps**, which is why lite HAPs bloat — a 139 KB PNG became ~17 MB).

The GT 6 installer expects the haptobin `.bin`; the Stage HAP carries `PANDA` `.abc` in a Stage
zip structure → "Failed to decompress". This is the physical root cause.

## Why every bypass fails (do not re-attempt)

All four explored paths hit the same wall: **third-party code on GT 6 gets only the JerryScript /
ACE-Lite sandbox, which is isolated from the system ARK Runtime / full ACE** where ArkTS and
`ArcList` live. The boundary is a separate runtime + privileges + firmware, not a flag.

| Attempt | Why it's blocked |
|---|---|
| Hack-install the Stage HAP | Device can't unpack the format (field test) |
| Sign-as-lite / run-as-ArkTS | "System" needs Huawei's platform key + `hos_system_app` APL; installer verifies it |
| Mimic the ArkTS build as lite | No `.abc`→JerryScript converter; ArkUI ≠ HML; language must drop to ES5.1 = a full rewrite |
| Embed ArkTS components in a lite app | JerryScript has no `.abc` loader; no NAPI on mini-system; `libace` is privileged, no `.so` path |
| Bootloader / custom firmware | Locked since 2018; no GT root/port exists; brick risk |

Exotic paths were also considered and rejected — listed so they are not re-proposed: **root /
firmware patch** (no retail unlock, can't write to system, brick risk); **0-day jailbreak** (a
separate multi-week security project, none exists publicly for GT 6, breaks on every OTA, and still
needs ArkTS integrated afterward); **an `.abc` interpreter written on top of lite JS** (a VM-in-a-VM
in ~1 MB with no access to `libace` — absurd). None yields a practical result.

The system UI *does* render with native ArkUI (proven: `ArcList` edge-scaling is impossible on the
lite framework) — but that runtime is behind the wall, with no door for third-party code.

## Lite wearable limits (reference for the GT/lite track)

If a lite-JS client is built for GT, these constraints apply:

- HAP ≤ 10 MB; ~1 MB RAM; no background; router has no back-stack; state not restored after
  restart.
- **48 KB: page size or JS memory, not enforced by the DevEco Previewer.** To be confirmed on the
  Runner 2: see [Page size and JS memory](#page-size-and-js-memory) below.
- Images are decoded to raw RGBA → keep icons tiny (a few PNGs, no large graphics).
- ES5.1 only, **no** `globalThis`. The lite app keeps a single page, so it shares no state between
  pages (`$def` reportedly unsupported, see above).
- No watch-side internet → all network goes through the phone companion over Wear Engine P2P.
- **No RegExp** in ACE Lite's JerryScript. One regex literal in a module of the page is enough for
  a black screen in the lite Previewer: `previewer.log` shows "Eval JS file failed — TypeError: wrong
  type of argument" (verified in DevEco 6.1). The ES5 lint of `apps/watch-lite/tools/` refuses regex
  literals, `RegExp`, and `match` / `matchAll` / `search`; use `indexOf` / `slice`.
- **`$t` interpolates `{name}` itself**: without parameters it removes the placeholder ("{n} min ago"
  became " min ago"). The lite app's texts use `[n]` placeholders, filled by `fill()`
  (`common/logic/format.js`).
- Text: a single font (SourceHanSansSC-Regular, no weights), and `letter-spacing` defaults to
  **2 px**, so set it to 0 explicitly. The font draws typographic quotes (’ U+2019, ‘ “ ”) full
  width, which leaves a gap: write `'`, and the watch normalises received names (`plainQuotes`).
- Events: only `click`, `longpress`, `swipe`; no touch events. `:active` only on
  `input[type=button]`, and only for the background.
- `@system.storage` values must be **< 128 bytes**, so a data cache goes through `@system.file`
  (`internal://app/`).
- Wear Engine P2P: **1 KB per message**, in both directions (Huawei docs). Hence the compact
  protocol v2.
- No direct `hdc` (GT has no "HDC debugging"/"Debug via Wi-Fi"). Install + logs via the phone app
  **HUAWEI DevEco Assistant** (`查看日志` / View Logs).

## Page size and JS memory

**Where the 48 KB comes from.**
- This repo first read it as a per-page source size limit.
- One unofficial source describes it as the **JS memory limit at runtime**: 49 144 bytes, shown by
  the lite simulator. It is a 2022 HarmonyOS lite-wearable tutorial, found by a web search and not
  opened from here: [developer.aliyun.com/article/1059616](https://developer.aliyun.com/article/1059616).
  - Debug mode lifts the limit and shows only the current use, because the debugger takes memory.
  - The same search reports that lite wearables do not support the `$def` global data: pages share
    data through storage or files.

**Measured by the maintainer** (DevEco 6.1, lite Previewer, `master` after PR #7):

| Measure | Value |
|---------|-------|
| Compiled page `loader_out_lite/.../pages/index/index.js` | **48 177 bytes**, while `npm run check` reported 39.4 KB without comments or indentation |
| Same page with about 33 KB of dummy code added | **84 803 bytes** compiled: it loads and renders normally in the Previewer |
| Previewer JS heap | `memoryUsage.totalBytes` = 524 280 (512 KB) |
| Previewer `allocBytes` | about 92 KB with **and** without the dummy code: it does not track the page, so it is not usable |

**Consequences.**
- The Previewer does not enforce 48 KB, and its memory reading cannot decide either way.
- `npm run check` (`apps/watch-lite/tools/`) measures the page source **without comments** (comments
  never reach the watch). It only **warns**: above 40 KB, above 44 KB (plan B threshold) and above
  48 KB ("to be confirmed on the watch"). It also prints the share of the Wear Engine stub, which
  Huawei's SDK file replaces on the watch.
- No lite API gives the free JS memory. The decision (plan B or not) is taken **on the real
  Runner 2**, with the checklist in
  [apps/watch-lite/README.md](../apps/watch-lite/README.md#watch-test-decides-plan-b): 10 favorites,
  scrolling, confirmation, detail, Réglages, then 10 actions in a row.

## Future outlook

No Huawei roadmap opens third-party ArkTS on the GT series. HarmonyOS 6.1.0.117 (GT 6, 2026) is a
user-feature update only. The unification trend favors ArkTS-on-everything, but via the **Watch**
line, not GT — treat GT→ArkTS as unconfirmed speculation. Re-test signal: an ArkTS-Stage wearable
template *for GT specifically* in DevEco, or a watch-side AppGallery for GT.

## What is portable between the two tracks

Not the binary — the design:

- **[P2P protocol](p2p-protocol.md)** — identical contract; Wear Engine P2P works in both FA-lite
  and ArkTS-Stage.
- **Domain model** (`EntityCard`, `EntityAction`, message DTOs) — same data shapes, ported by hand.
- **Architecture** (repository + mock fallback, layering) — same concepts, reimplemented per runtime.
- Pure logic in TypeScript *can* be transpiled (`tsc --target ES5`) for lite reuse; anything touching
  the framework (ArkUI, decorators) must be rewritten.
