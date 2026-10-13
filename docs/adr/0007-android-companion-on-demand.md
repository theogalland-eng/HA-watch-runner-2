# 0007. Android companion: stack and on-demand bridge model

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

The watch apps cannot reach Home Assistant themselves ([ADR-0003](0003-wear-engine-p2p-transport.md)).
The Android companion in `apps/phone-android/` is the bridge. The constraints come from the
maintainer's own hardware: a Huawei Watch GT Runner 2 (lite wearable) paired to a Xiaomi Redmi
Note 13 Pro+ running HyperOS.

- **Battery comes first on both devices.** The watch syncs only when it opens and refreshes a
  single entity after an action. The phone must not hold a WebSocket or poll HA.
- **HyperOS** aggressively kills background apps. Wear Engine only delivers messages to a phone
  app that is *running*.
- **The HA long-lived token is a full-access credential.** It must never end up in code, logs,
  tests or commits.
- **The lite watch** has about 1 MB of RAM and a small round screen. Messages must stay short.

## Decision

- **Stack.** Kotlin with Jetpack Compose (Material 3). minSdk 26, targetSdk 35. Two Gradle modules:
  - `core`: pure JVM. It holds the protocol, the HA REST client (OkHttp), the domain mapping and the
    request handler, all unit-tested on the JVM with MockWebServer.
  - `app`: Android. It holds the UI, storage, the foreground service and the Wear Engine transport.
  - The Wear Engine SDK (`com.huawei.hms:wearengine`) sits behind a `WatchTransport` interface. Tests
    use a fake implementation.
- **On demand only.** A `connectedDevice` foreground service keeps the Wear Engine receiver
  registered and does nothing else: no wakelock, no timer, no network. Each watch request triggers
  one burst of HA REST calls and the reply has to go out within 6.5 s (the watch times out at 8 s).
  The full `GET /api/states` list is fetched only by the favorites picker, and only when the user
  opens it.
- **Favorites only.** The user picks at most 10 entities, in order. Only those are sent to the watch.
  `CALL_SERVICE` is refused unless its entity is a favorite and the service is allowed for that
  domain. Cards carry a single state-dependent primary action, and `secondary` is empty, to keep
  messages short. The phone localizes the labels (EN/FR/RU).
- **Token at rest.** It is encrypted with an AES-256-GCM key held in the Android Keystore
  (non-exportable). We do not use the deprecated `EncryptedSharedPreferences`. HTTPS is mandatory,
  there is no HTTP logging, and app data is excluded from backup and device transfer.

## Consequences

- With no watch traffic, the phone does no network work. With it, each request costs a few short
  HTTPS calls.
- The user has to allow autostart and set "No restrictions" for battery, both for the companion
  and for Huawei Health, under HyperOS. The README documents this.
- The `v1` contract is unchanged. The companion's behaviour (lock/unlock rather than toggle,
  favorites-only guard, error strings) is clarified in [p2p-protocol.md](../p2p-protocol.md).
- Real-device P2P needs Huawei-side setup that cannot be committed:
  - the Wear Engine service registered on HUAWEI Developers;
  - the watch app's signing fingerprint (`watchPeerFingerprint`);
  - a stable phone signing key.
- A new domain needs one `DomainMapper` in `core` and an `allowedServices` entry. The watch side
  stays presentation-only.

## Alternatives considered

- **HA WebSocket subscription with state pushed to the watch.** Rejected: the connection stays open
  and the radio stays awake, which is the battery cost we are avoiding. The v1 protocol also never
  pushes.
- **Polling HA on a timer.** Rejected for the same reason.
- **A single `GET /api/states` filtered on each sync.** Rejected: the payload grows with the whole
  installation. One `GET /api/states/<id>` per favorite (at most 10, 4 in parallel) stays small.
- **`EncryptedSharedPreferences`.** Rejected because androidx.security deprecated it. The Keystore
  gives the same guarantee without the dependency.
- **No foreground service, the app runs only while open.** Rejected: under HyperOS the watch could
  almost never reach the phone.
