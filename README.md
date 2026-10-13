# Home Assistant for Huawei Wearables — monorepo

A [Home Assistant](https://www.home-assistant.io/) client for Huawei smartwatches, plus its phone
companion. The watch has no direct network path to Home Assistant — it talks to an Android companion
over **Wear Engine P2P**, and the companion holds the HA REST connection.

Huawei splits watches into two incompatible developer platforms, so there are **two watch apps**
sharing one design and one wire contract — see [docs/platform-constraints.md](docs/platform-constraints.md).

## Apps

| Path | What | Target | Stack |
|------|------|--------|-------|
| [`apps/watch-arkts/`](apps/watch-arkts/) | Full-wearable watch app | **Watch 4/5/Ultimate** | ArkTS + ArkUI (Stage), `ArcList` |
| [`apps/watch-lite/`](apps/watch-lite/) | Lite-wearable watch app | **Watch GT 4/5/6, GT Runner 2** | JS (FA), HML/CSS, JerryScript (ES5.1) |
| [`apps/phone-android/`](apps/phone-android/) | Phone companion (P2P ↔ HA REST) | Android 8+ (tested target: HyperOS) | Kotlin + Compose, Wear Engine SDK |

The two watch apps are **mirror architectures in different runtimes** — they share the
[P2P protocol](docs/p2p-protocol.md), the domain model, and the layering, but **no code**
(ArkTS compiles to `PANDA` bytecode, lite-JS to a haptobin `.bin` — different engines).

### This fork's target hardware

- **Watch:** Huawei **Watch GT Runner 2**. It is a lite wearable, so it uses `apps/watch-lite/`.
- **Phone:** Xiaomi **Redmi Note 13 Pro+** on **HyperOS**, with Huawei Health. It uses
  `apps/phone-android/`.
- **Priority: battery** on both devices.
  - The watch syncs when it opens and refreshes one entity after an action.
  - The phone holds no WebSocket and does no polling: it calls Home Assistant only when the watch
    asks ([ADR-0007](docs/adr/0007-android-companion-on-demand.md)).

Companion build, install and HyperOS setup: [apps/phone-android/README.md](apps/phone-android/README.md).

## Why two apps

Watch GT (4/5/6) is a **lite wearable**: it physically rejects third-party ArkTS Stage HAPs
(`Failed to decompress`, verified on a GT 6) and only runs lite-JS. Full ArkTS/ArkUI — and a native
`ArcList` round-screen UI — exists only on the **Watch 4/5/Ultimate** class. The full story, with
on-device and byte-level evidence, is in [docs/platform-constraints.md](docs/platform-constraints.md)
and [ADR-0005](docs/adr/0005-target-full-wearable-not-lite.md).

## Repository layout

```
apps/                this monorepo's three apps (open each as its own project root in its IDE)
docs/
  architecture.md      system map (watch-arkts)
  p2p-protocol.md      watch ↔ phone wire contract (shared, versioned)
  platform-constraints.md   full wearable vs lite — the device-platform truth
  adr/                 architecture decision records
AGENTS.md  CLAUDE.md  DEVELOPMENT.md   AI + workflow layer (see below)
CONTRIBUTING.md
```

## Working in this repo (AI-managed)

This repository is set up for AI-first development. Start here:

- [AGENTS.md](AGENTS.md) — single source of truth for AI agents (commands, layout, rules, gotchas).
- [CLAUDE.md](CLAUDE.md) — Claude Code entry point (imports AGENTS.md).
- [DEVELOPMENT.md](DEVELOPMENT.md) — the Explore → Plan → Code → Commit workflow and role subagents.
- [docs/adr/](docs/adr/) — why key decisions were made (don't re-litigate; supersede).

## License

MIT.
