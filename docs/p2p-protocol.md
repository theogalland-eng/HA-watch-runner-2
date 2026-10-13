# Wear Engine P2P Protocol (Watch ↔ Phone)

**Status:** active contract · **Protocol version:** `v: 1`

This is the wire contract between the watch apps (`apps/watch-arkts/`, `apps/watch-lite/`) and the
Android **companion** app ([`apps/phone-android/`](../apps/phone-android/)). All sides MUST conform to
this document. Changing a message shape is a breaking change — bump `v` and update all sides
together (see [ADR-0003](adr/0003-wear-engine-p2p-transport.md)).

The authoritative ArkTS definitions are in
[`P2pMessages.ets`](../apps/watch-arkts/entry/src/main/ets/domain/model/P2pMessages.ets) and
[`EntityCard.ets`](../apps/watch-arkts/entry/src/main/ets/domain/model/EntityCard.ets). This doc must stay in
sync with them; if they diverge, the `.ets` files win and this doc is a bug.

## Transport

- **Channel:** Wear Engine P2P messaging (`@kit.WearEngine`).
- **Encoding:** each message is a single UTF-8 JSON string (one JSON object per P2P message).
- **Peer pairing:** the watch resolves the first connected device and targets the companion by
  `remoteApp = { bundleName, fingerprint }`. ⚠️ These are configured via
  `WearEngineP2pClient.setRemoteApp(...)` and are **currently commented out** in
  [`Services.ets`](../apps/watch-arkts/entry/src/main/ets/app/Services.ets) — real-device P2P will not connect
  until the companion's bundleName + signing fingerprint are filled in.
- **Phone side:** the companion uses the Android Wear Engine SDK (`com.huawei.hms:wearengine`)
  with `setPeerPkgName(<watch bundleName>)` and `setPeerFingerPrint(<watch app fingerprint>)`, set
  from the Gradle properties `watchPeerPkg` and `watchPeerFingerprint`. On the lite watch the mirror
  setting is the companion package and fingerprint in `config.json` (`supportLists`). See
  [apps/phone-android/README.md](../apps/phone-android/README.md#identifiers).
- **Direction:** the watch is always the initiator. The companion only sends replies (it never
  pushes unsolicited messages in v1).

## Correlation & timeouts

Every message carries an `id`. The watch sends a request, parks a pending promise keyed by `id`,
and resolves it when a reply with the same `id` arrives. Implications for the companion:

- **Echo the request `id` verbatim** in the reply. A reply with a wrong/missing `id` is dropped.
- Replies may be returned **out of order**; the watch correlates by `id`, not by arrival order.
- The watch enforces an **8s timeout** per request
  ([`P2pHomeAssistantRepository`](../apps/watch-arkts/entry/src/main/ets/data/repository/P2pHomeAssistantRepository.ets)).
  After that the promise rejects and the reply is ignored even if it arrives late.
- During startup, `hasConnectedPeer()` and repo init are additionally bounded to **1200ms**
  before the app falls back to mock data.

## Envelope

Every message extends `BaseMsg`:

| Field | Type | Notes |
|-------|------|-------|
| `v` | `number` | Protocol version. Always `1` today. |
| `id` | `string` | Correlation id (watch-generated, e.g. `sync-…`, `svc-…`). Echo it back. |
| `type` | `MsgType` | One of the message types below. |

`MsgType = 'SYNC_REQUEST' | 'SYNC_RESPONSE' | 'SYNC_ENTITY_REQUEST' | 'SYNC_ENTITY_RESPONSE' | 'CALL_SERVICE' | 'ACK'`

## Messages

### `SYNC_REQUEST` → `SYNC_RESPONSE`
Fetch all entity cards (full list refresh).

Watch sends:
```json
{ "v": 1, "id": "sync-ab12", "type": "SYNC_REQUEST" }
```
Companion replies:
```json
{ "v": 1, "id": "sync-ab12", "type": "SYNC_RESPONSE", "cards": [ /* EntityCard[] */ ] }
```
If `cards` is absent, the watch treats it as an empty list.

### `SYNC_ENTITY_REQUEST` → `SYNC_ENTITY_RESPONSE`
Refresh a single entity after an action or pull.

Watch sends:
```json
{ "v": 1, "id": "get_card-cd34", "type": "SYNC_ENTITY_REQUEST", "entity_id": "light.kitchen" }
```
Companion replies:
```json
{ "v": 1, "id": "get_card-cd34", "type": "SYNC_ENTITY_RESPONSE", "card": { /* EntityCard | omitted */ } }
```
Omit `card` (or send it absent) if the entity no longer exists — the watch keeps the old card.

### `CALL_SERVICE` → `ACK`
Invoke a Home Assistant service.

Watch sends:
```json
{ "v": 1, "id": "svc-ef56", "type": "CALL_SERVICE",
  "domain": "light", "service": "toggle", "data": { "entity_id": "light.kitchen" } }
```
Companion replies:
```json
{ "v": 1, "id": "svc-ef56", "type": "ACK", "ok": true }
```
On failure:
```json
{ "v": 1, "id": "svc-ef56", "type": "ACK", "ok": false, "error": "HA returned 401" }
```
When `ok` is `false`, the watch throws `error` (or a generic message) and surfaces it via
`store.lastError`.

### `ACK` as a failure reply to sync requests
The companion may answer a `SYNC_REQUEST` / `SYNC_ENTITY_REQUEST` with an `ACK { ok: false }`
to signal an error. The watch interprets that as "empty list" / "no card" respectively rather
than crashing.

## Payload types

### `EntityCard`
```ts
interface EntityCard {
  entity_id: string;          // e.g. "light.kitchen"
  domain: string;             // "light" | "switch" | "lock" (MVP)
  name: string;               // display name (companion may localize)
  state: string;              // "on"/"off", "locked"/"unlocked", …
  icon?: string;              // optional icon hint
  primary: EntityAction;      // main tap action
  secondary: EntityAction[];  // extra actions in the details screen
}
```

### `EntityAction`
A self-describing HA service call. The watch renders `label` and, on tap, sends `domain` +
`service` + `data` back as a `CALL_SERVICE`. The watch does **not** interpret HA semantics —
the companion decides which actions exist.
```ts
interface EntityAction {
  kind: 'SERVICE';            // only kind today
  label: string;             // UI text (companion-localized)
  domain: string;            // HA domain, e.g. "light"
  service: string;           // HA service, e.g. "toggle" / "turn_on" / "lock"
  data: Record<string, string>;  // at minimum { entity_id }
}
```

## Companion implementer checklist

Implemented by [`apps/phone-android/`](../apps/phone-android/) (`core/…/bridge/WatchRequestHandler.kt`):

- [x] Listen for P2P messages, parse one JSON object per message.
- [x] Echo `id` and `v` on every reply.
- [x] Map `SYNC_REQUEST` → HA states → `EntityCard[]`, build `primary`/`secondary` actions.
- [x] Map `CALL_SERVICE` → HA REST service call → `ACK { ok }` (with `error` on failure).
- [x] Reply within 8s; prefer fast partial data over a slow complete reply.
- [x] Localize `name`/`label` (the watch renders them as-is).
- [x] Reuse `entity_id`s consistently so single-entity refresh and list refresh agree.

## Companion behaviour (v1 clarifications)

What the Android companion does within the v1 shapes above. These are **not** shape changes, so `v`
stays `1`. Watch apps can rely on them.

- **Favorites only.** `SYNC_RESPONSE.cards` contains only the entities the user picked on the phone
  (at most 10), in the user's order. `SYNC_ENTITY_REQUEST` for a non-favorite returns no `card`.
- **No polling, no push.** The companion calls Home Assistant only when a request arrives:
  - `SYNC_REQUEST` → one `GET /api/states/<id>` per favorite;
  - `SYNC_ENTITY_REQUEST` → one `GET /api/states/<id>`;
  - `CALL_SERVICE` → one `POST /api/services/<domain>/<service>`.

  It replies within about 6.5 s. On a slow sync, entities not fetched by then are left out (partial
  list).
- **Actions.** `primary` is chosen from the current state and `secondary` is `[]` (short messages):

  | Domain | State | `primary.service` |
  |--------|-------|-------------------|
  | `light`, `switch` | `on` | `turn_off` |
  | `light`, `switch` | `off` | `turn_on` |
  | `light`, `switch` | other (`unavailable`, …) | `toggle` |
  | `lock` | `locked` | `unlock` |
  | `lock` | other | `lock` |

  **Home Assistant has no `lock.toggle` service**, so a watch must not synthesize one. `icon` is
  omitted: the watch picks a local icon from `domain`.
- **`CALL_SERVICE` guard.** The call is refused with `ACK { ok: false, error: "not allowed" }` in
  any of these cases:
  - `data.entity_id` is not a favorite;
  - the domain does not match the entity;
  - the service is not allowed for the domain (`turn_on`/`turn_off`/`toggle`, `lock`/`unlock`).

  Only `entity_id` is forwarded to HA.
- **`ACK.error` strings** are short ASCII values. The watch may show them as-is.

  | `error` | Meaning |
  |---------|---------|
  | `companion not configured` | No URL or token set on the phone |
  | `HA returned <code>` | HTTP error from Home Assistant, e.g. `401` = token rejected |
  | `HA timeout` | Home Assistant did not answer in time |
  | `HA unreachable` | Home Assistant is offline, the URL is wrong, or there is no network |
  | `HA bad response` | The reply was not the expected JSON |
  | `timeout` | The 6.5 s reply deadline was hit |
  | `not allowed` | Refused by the `CALL_SERVICE` guard above |
  | `unsupported type` | Unknown message `type` |
  | `unsupported version` | `v` is not `1` |
  | `missing entity_id`, `missing domain/service`, `bad data` | Malformed request |

  They never contain the token or the URL. A message with no readable `id` gets no reply at all.
