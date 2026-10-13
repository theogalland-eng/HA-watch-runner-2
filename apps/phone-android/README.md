# Phone companion (Android)

Android bridge between the Huawei watch apps and Home Assistant:

```
Watch (lite-JS on GT Runner 2) ──Wear Engine P2P──▶ this app ──HA REST (HTTPS)──▶ Home Assistant
```

The watch has no network access of its own. This app does three things:
- holds the Home Assistant URL and the token, encrypted;
- answers the watch's requests using the [compact P2P contract v2](../../docs/p2p-protocol.md)
  ([ADR-0008](../../docs/adr/0008-p2p-protocol-v2-compact.md)), every message ≤ 900 bytes;
- calls the HA REST API, **only when the watch asks**.

Design decisions: [ADR-0007](../../docs/adr/0007-android-companion-on-demand.md).

Stack: Kotlin, Jetpack Compose (Material 3), OkHttp, kotlinx.serialization, and the Huawei Wear
Engine SDK `com.huawei.hms:wearengine:5.0.3.304`. minSdk 26, targetSdk 35. Reference phone:
Redmi Note 13 Pro+ (HyperOS).

## Identifiers

| What | Value | Where it is set |
|------|-------|-----------------|
| Companion package (`applicationId`) | `io.github.theogallandeng.hawatch.companion` | `app/build.gradle.kts` |
| Watch app bundle (lite, GT Runner 2) | `io.github.theogallandeng.hawatch` | `watchPeerPkg` (Gradle property) |
| Watch app signing fingerprint | **placeholder** | `watchPeerFingerprint` (Gradle property) |

The watch side declares this companion in `supportLists`
([apps/watch-lite/README.md](../watch-lite/README.md#identifiers)). Until `watchPeerFingerprint`
holds the watch app's fingerprint, the two sides do not recognize each other.

## Layout

```
core/   pure Kotlin/JVM, unit-tested without Android
  protocol/   v2 messages, Card {k,d,n,s}, CardCodes (code tables, size limits, favorites revision), ProtocolCodec
  ha/         HaClient + OkHttpHaClient (GET /api/, /api/states, /api/states/<id>, POST /api/services/…)
  mapping/    EntityCardMapper + DomainMapper per domain (light, switch, lock): card + service choice ← add new domains here
  bridge/     WatchTransport (interface), WatchRequestHandler (protocol core), CompanionBridge
  config/     CompanionSettings, HaInput (URL/token validation)
app/    Android
  data/       SecureTokenStore (Android Keystore AES-GCM), SettingsStore, AndroidCompanionConfig
  wear/       WearEngineTransport (real WatchTransport), WearEngineStatus
  service/    WatchBridgeService (foreground, connectedDevice), BootReceiver
  ui/         SettingsScreen, FavoritesScreen (Compose) + ViewModels
```

Adding an HA domain (e.g. `cover`, `fan`):
1. Add a `DomainMapper` to `EntityCardMapper.DEFAULT_MAPPERS`; its `serviceFor(state, confirmed)`
   picks the service.
2. Give it a domain code (and any new state codes) in `CardCodes` **and** in the tables of
   [p2p-protocol.md](../../docs/p2p-protocol.md#domain-codes-d); `CardCodesTest` checks they match.
3. Add tests.

The watch side needs the same codes in `protocol.js`, plus an icon and colour for the new domain.

## Battery model

| When | Phone | Watch traffic |
|------|-------|---------------|
| Idle (most of the time) | Foreground service with the Wear Engine receiver registered. **No wakelock, no timer, no network.** | none |
| Watch app opens | `SYNC_REQUEST` → one `GET /api/states/<id>` per favorite (≤ 10, 4 in parallel) | 1 reply ≤ 900 bytes |
| Action on the watch | `CALL_SERVICE` → one `GET`, one `POST`, then while the state settles one `GET` every 500 ms for 5 s at most (this action only) | 1 reply with the new card |
| Favorites screen opened on the phone | one `GET /api/states` | none |

Other properties:
- No WebSocket and no polling.
- Replies leave in under 6.5 s (the watch gives up at 8 s). A slow sync returns partial data:
  favorites that time out or fail individually are left out. See
  [p2p-protocol.md](../../docs/p2p-protocol.md#sync_request--sync_response).
- Idle HTTPS sockets are closed after 60 s.
- Every message stays ≤ 900 bytes, the worst case included (Wear Engine's limit is 1 KB; checked and
  printed by `ProtocolCodecTest`).

## Security model

- **Token at rest.** It is encrypted with AES-256-GCM. The key lives in the Android Keystore and
  cannot be exported. Only the IV and the ciphertext are stored. Once saved, the token is never
  shown again; you can only replace it.
- **Token in transit.** It only goes into the `Authorization` header, over **HTTPS** (`http://` URLs
  are refused). There is no HTTP logging. Errors sent to the watch never contain the token or the URL.
- **Backups.** App data is excluded from cloud backup and from device transfer.
- **What the watch can do.** It can only read and act on the favorites, by slot. The companion
  picks the service from the current state. Unlocking requires the watch's confirmation
  (`act: "confirm"`), and `lock.open` is never used. Only `entity_id` is forwarded to HA.
- **Never commit:** `local.properties`, `keystore.properties`, `*.jks`, `*.keystore` (git-ignored).

## Build

Requirements:
- JDK 17 or newer;
- Android SDK with platform 35 and build-tools 35.0.0. Point `local.properties` at it with
  `sdk.dir=…`, or let Android Studio do it.

Open `apps/phone-android/` in Android Studio, or use the command line:

```bash
cd apps/phone-android
./gradlew test                  # JVM unit tests (core + app)
./gradlew :app:assembleDebug    # → app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:lintDebug        # Android lint
```

The Huawei Maven repository (`https://developer.huawei.com/repo/`) is declared in
`settings.gradle.kts` and restricted to `com.huawei.*` artifacts.

### Watch peer identity (`local.properties`)

```properties
sdk.dir=/path/to/Android/sdk
watchPeerPkg=io.github.theogallandeng.hawatch
watchPeerFingerprint=<signing fingerprint of the watch app>
```

`gradle.properties` provides defaults, and the fingerprint default is a placeholder. While the
placeholder is in place, the app builds but shows a warning, and real P2P will not connect.

### Release signing (`keystore.properties`, not committed)

Huawei ties the Wear Engine permission to the **SHA-256 of the phone app's signing certificate**.
That certificate must stay stable: sign with your own key, not with a per-machine debug key.

```properties
storeFile=release.jks
storePassword=…
keyAlias=…
keyPassword=…
```

Then run `./gradlew :app:assembleRelease`. To read the SHA-256:
`keytool -list -v -keystore release.jks -alias <alias>`.

## Huawei prerequisites (one-time)

1. Install **Huawei Health** (Huawei Santé) on the phone, sign in, and pair the watch.
2. On **HUAWEI Developers**, apply for the **Wear Engine** service for the package
   `io.github.theogallandeng.hawatch.companion`, with the SHA-256 of your signing certificate.
   Follow Huawei's Wear Engine documentation for the current console steps. Without it, Wear Engine
   calls fail (for example with codes 8 or 9, unauthorized).
3. Sign the watch app (phase 3) and put its fingerprint in `watchPeerFingerprint`.

## Install

```bash
adb install -r app/build/outputs/apk/release/app-release.apk   # or app-debug.apk for testing
```

Copying the APK to the phone and opening it also works, if installing from unknown sources is
allowed.

## First-run setup (in the app)

1. **Home Assistant.**
   1. Enter the URL, e.g. `https://<your-domain>:8123`. `https://` is added automatically if you
      leave it out.
   2. Paste a long-lived access token (HA → Profile → Security → Long-lived access tokens).
   3. Tap **Save**, then **Test connection**.
2. **Favorites.** Tap **Choose favorites** and tick up to 10 lights, switches or locks. They appear
   on the watch in the order you pick them.
3. **Watch.**
   1. Tap **Authorize Wear Engine**; Huawei's consent screen opens.
   2. Allow the service notification.
   3. Leave **Companion service** on.
   4. Tap **Preview watch sync**. It runs exactly what the watch's `SYNC_REQUEST` would trigger and
      shows the number of cards and the size of the reply. Use it to check the phone side without
      the watch.

## HyperOS settings (Redmi / Xiaomi)

HyperOS kills background apps aggressively, and Wear Engine only reaches a phone app that is
running. Apply these settings to **this app and to Huawei Health**. Menu names vary a little
between HyperOS versions.

1. **Autostart.** Settings → Apps → Manage apps → *app* → **Autostart** → on.
2. **Battery.** Settings → Apps → Manage apps → *app* → Battery saver → **No restrictions**.
3. **Recent apps.** Open the recents screen, long-press the app, and tap the **lock** icon.
4. **Notifications.** Keep the companion's notification allowed. It is silent and minimised, and
   it is what keeps the service in the foreground.

The app's **HyperOS / MIUI** section has buttons that open both apps' settings pages.

## Troubleshooting

- **Logs.** `adb logcat -s HaCompanion`. Only message types, ids, sizes and Wear Engine error codes
  are logged, never contents or secrets.
- **Wear Engine codes** (`WearEngineErrorCode`):
  - `2`: Huawei Health is not installed.
  - `8` / `9`: not authorized (Huawei registration or user consent).
  - `15`: Huawei Health is not allowed to autostart.
  - `16`: the watch is not connected.
  - `206`: the message could not be delivered.
- **The watch gets `code: "ha"`.** Check that the phone has network access and that HA is online.
- **The watch gets `code: "auth"`.** The token was revoked: replace it in the app.
- **The watch gets `code: "stale"`.** The favorites changed on the phone; the watch resyncs on its own.

## Known limits

- **Not verified on real hardware yet:** Wear Engine pairing and P2P. They need the Huawei
  registration and the signed watch app (phase 3). The unit tests cover everything behind the
  `WatchTransport` interface.
- **Watches paired after the service started.** Receivers are registered for every watch bonded
  when the service starts or when Huawei Health reconnects. A watch paired later is picked up the
  next time the companion app is opened.
- **Watch disconnected at boot (to test on the device).** If Wear Engine refuses to register a
  receiver for a bonded but disconnected watch, for example right after a phone reboot, the bridge
  stays silent until the companion app is opened.
  - **How to test:** reboot the phone with the watch away, bring the watch back, and open the watch
    app without touching the phone. Run `adb logcat -s HaCompanion` and look for
    `receiver registration failed: 16`.
  - **If it happens:** the event-driven fix is the SDK's `MonitorClient` with
    `MonitorItem.MONITOR_ITEM_CONNECTION` (re-register on connect, still with no polling). It is not
    wired yet because it cannot be verified without the hardware.
- **Certificates.** Self-signed HA certificates are not supported; use a publicly trusted
  certificate (e.g. Let's Encrypt via DuckDNS).
- **Dependency versions.** They are pinned to versions that work with compileSdk 35. Lint reports
  newer releases, which would require SDK 36.
