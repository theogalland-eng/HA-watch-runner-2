# Wear Engine P2P Protocol (Watch ↔ Phone)

**Status:** active contract · **Protocol version:** `v: 2` (compact) · Decision:
[ADR-0008](adr/0008-p2p-protocol-v2-compact.md)

This is the wire contract between the lite watch app ([`apps/watch-lite/`](../apps/watch-lite/), Huawei
Watch GT Runner 2) and the Android **companion** ([`apps/phone-android/`](../apps/phone-android/)). Both
sides MUST conform to this document. Changing a message shape is a breaking change: bump `v` and update
both sides, this document and the code-table tests in the same PR.

- **Why v2.** Wear Engine limits a P2P message to **1 KB, in both directions**. The v1 card
  (`entity_id`, localised actions, labels) went over that from about 4 favorites. v2 replaces v1 with
  no compatibility.
- **Who uses it.** The companion answers only `v: 2`; it answers any other `v` with
  `ACK { ok: false, code: "version" }`. `apps/watch-arkts/` still speaks v1 and is not a target of this
  fork (see ADR-0008).

## Transport

- **Channel.** Wear Engine P2P messaging. Each message is one UTF-8 JSON object.
- **Size budget.** Every message is **≤ 900 bytes**, in the worst case: 10 favorites, 20-character
  accented names, 12-byte sensor values, 16-character ids and the largest `fr`. `ProtocolCodecTest`
  checks it and prints the sizes:

  | Message | Worst case |
  |---------|------------|
  | `SYNC_RESPONSE` | 896 bytes |
  | `ACK` with a card | 140 bytes |
  | `CALL_SERVICE` | 91 bytes |
  | `SYNC_REQUEST` | 53 bytes |

- **Pairing.**
  - On the phone, `setPeerPkgName` / `setPeerFingerPrint` read the Gradle properties `watchPeerPkg`
    and `watchPeerFingerprint`.
  - On the watch, the companion's package and fingerprint go into `supportLists` in `config.json`.
  - See [apps/phone-android/README.md](../apps/phone-android/README.md#identifiers).
- **Direction.** The watch always starts an exchange; the companion only replies, never pushes.

## Correlation and timeouts

- Every request carries an `id`. The companion **echoes it verbatim**; a reply with another `id` is
  dropped.
- `id` is ASCII `[A-Za-z0-9_-]`, 1 to 16 characters. A message without a valid `id` gets no reply.
- Replies may arrive out of order: the watch correlates by `id`.
- The watch gives up after **8 s**. The companion replies within **6.5 s**.

## Envelope

| Field | Type | Notes |
|-------|------|-------|
| `v` | number | Always `2`. |
| `id` | string | Correlation id, see above. |
| `type` | string | `SYNC_REQUEST`, `SYNC_RESPONSE`, `CALL_SERVICE` or `ACK`. |

Unknown fields are ignored. Absent optional fields are omitted, never sent as `null`.

## Messages

### `SYNC_REQUEST` → `SYNC_RESPONSE`

The favorites, with their state. The watch sends this when it opens (and on "Resynchroniser").

```json
{"v":2,"id":"s1","type":"SYNC_REQUEST"}
```
```json
{"v":2,"id":"s1","type":"SYNC_RESPONSE","fr":55808668,"c":[{"k":0,"d":"l","n":"Kitchen","s":"1"},{"k":1,"d":"k","n":"Front door","s":"L"}]}
```

- `fr` is the **favorites revision** (see below).
- `c` lists the cards in the user's order.
- A favorite that does not exist any more (404), was not read before the deadline, or failed on its
  own is **left out** of `c`. The other slots keep their `k`. The watch treats a missing slot as
  "unknown right now".
- If no card at all can be read, or on an auth failure, the reply is an `ACK { ok: false }` instead.

### `CALL_SERVICE` → `ACK`

Act on one favorite. The watch only says **which slot**; the companion picks the service.

```json
{"v":2,"id":"a1","type":"CALL_SERVICE","k":0,"fr":55808668}
{"v":2,"id":"a2","type":"CALL_SERVICE","k":1,"fr":55808668,"act":"confirm"}
```
```json
{"v":2,"id":"a1","type":"ACK","ok":true,"c":{"k":0,"d":"l","n":"Kitchen","s":"0"}}
{"v":2,"id":"a2","type":"ACK","ok":false,"code":"stale"}
```

| Field | Meaning |
|-------|---------|
| `k` | Slot of the favorite (index in the user's list, 0–9). |
| `fr` | The revision the watch's list comes from. If it is not the current one, the reply is `code: "stale"`: the slots may point to other entities, so the watch resyncs. |
| `act` | `"confirm"`: the user confirmed **unlocking** on the watch. Required to unlock, ignored otherwise. Any other value is `code: "bad"`. |

What the companion does:
1. It checks `fr` (`stale`) and `k` (`denied` if the slot holds no supported favorite).
2. It reads the entity's state (`GET /api/states/<id>`) and picks the service:

   | Domain | State read | Service |
   |--------|------------|---------|
   | `light`, `switch` | `on` / `off` / other | `turn_off` / `turn_on` / `toggle` |
   | `lock` | `locked`, without `act` | none: `ACK { ok: false, code: "confirm" }` |
   | `lock` | `locked` (or anything but unlocked/open), with `act: "confirm"` | `unlock` |
   | `lock` | `unlocked` or `open`, with `act: "confirm"` | none: already unlocked, `ACK { ok: true, c }` |
   | `lock` | anything but `locked`, without `act` | `lock` |

   Home Assistant has no `lock.toggle`, and `lock.open` (unlatch) is never used. Only `entity_id` is
   sent to Home Assistant.
3. It calls `POST /api/services/<domain>/<service>`. Home Assistant answers with the states changed
   during the call: if the entity is there in a **final** state different from before, the reply goes
   out at once.
4. Otherwise it reads the entity again every **500 ms**, for **5 s** at most after the call (and never
   past the 6.5 s deadline), until the state has changed and is not transient (`locking`,
   `unlocking`, `opening`, `closing`). This happens **only during an action**: there is no other
   polling.
5. `ACK { ok: true, c }` carries the last state read:
   - if it is still transient, the watch shows the row "en cours", never as a success, and the next
     sync corrects it;
   - if it is unchanged, the device did not react within 5 s;
   - `c` is absent if the entity could not be read back.

   On failure, `ACK { ok: false, code }` carries no card: the watch restores its cached state.

`SYNC_ENTITY_REQUEST` (v1) no longer exists: the `ACK` of an action already carries the new state, in
one Bluetooth round trip instead of two.

## Payload: the card `{k, d, n, s}`

| Field | Content |
|-------|---------|
| `k` | Slot: index of the favorite in the user's list (0–9). |
| `d` | Domain code, see below. |
| `n` | Name (HA `friendly_name`, else the object id). The companion makes it fit (see Limits below). |
| `s` | State code, see below. For a sensor (`d = n`), the value itself. |

**Limits.**
- `n`: ’ ‘ become `'` (the watch font draws them full width) and control characters are dropped.
  It is then cut to **20 characters** and **40 bytes** of JSON, on a character boundary.
- Sensor `s`: **12 characters** and **12 bytes** of JSON. For example `21,5 °C` is 8 bytes.

A receiver shows an **unknown code as "unknown"** and never fails on it.

### Domain codes (`d`)

| Code | HA domain | Companion |
|------|-----------|-----------|
| `l` | `light` | mapped |
| `s` | `switch` | mapped |
| `k` | `lock` | mapped |
| `c` | `cover` | reserved |
| `e` | `scene` | reserved |
| `n` | `sensor` | reserved |

### State codes (`s`)

| Code | HA state | Notes |
|------|----------|-------|
| `1` | `on` | |
| `0` | `off` | |
| `L` | `locked` | |
| `U` | `unlocked` | A lock's `open` is sent as `U`. |
| `x` | `unavailable` | |
| `?` | `unknown` | Also any state without a code. |
| `g` | `locking` | Transient. |
| `h` | `unlocking` | Transient. A lock's `opening` is sent as `h`. |
| `j` | `jammed` | |
| `o` | `open` | Cover, reserved. |
| `f` | `closed` | Cover, reserved. |

These two tables are the reference. They are mirrored in `CardCodes.kt` (companion) and in
`common/logic/protocol.js` (watch, PR 3c). A test on each side parses them from this file, so the two
implementations stay identical.

### Favorites revision `fr`

- **Value.** FNV-1a 32-bit over the UTF-8 bytes of the ordered entity ids joined with `\n`, masked to
  31 bits.
  - It is stateless: the same list gives the same `fr`, even after a reinstall.
  - Any change of list or order changes it, except with probability about 2⁻³¹.
- **Golden values** (tested on both sides):

  | Favorites | `fr` |
  |-----------|------|
  | `["light.kitchen", "lock.front_door"]` | `55808668` |
  | `["lock.front_door", "light.kitchen"]` | `815892064` |
  | `[]` | `18652613` |

## `ACK` codes

`code` is short ASCII. It never contains the token or the URL.

| `code` | Meaning | Watch (3c) |
|--------|---------|------------|
| `stale` | `fr` is not the current favorites revision | resync, no red row |
| `confirm` | Unlocking without `act: "confirm"` | failure |
| `denied` | `k` holds no supported favorite (or the entity no longer exists) | failure |
| `config` | No URL or token set on the phone | failure "HA injoignable" |
| `auth` | Token rejected (401/403) or not sendable (non-ASCII) | failure "HA injoignable" |
| `ha` | Home Assistant unreachable, timed out, HTTP error or unexpected reply | failure "HA injoignable" |
| `timeout` | The 6.5 s reply deadline was hit | "Échec : délai dépassé" |
| `bad` | Malformed request or unknown `type` | failure |
| `version` | `v` is not `2` | failure |
| `internal` | Unexpected failure in the companion (it still replies) | failure |

No reply at all, for example because the phone is out of reach, gives "Échec : tél. déconnecté" on the
watch after 8 s.

## Battery

- The companion calls Home Assistant **only when a request arrives**. It holds no WebSocket and never
  polls between requests.
- **`SYNC_REQUEST`:** one `GET /api/states/<id>` per favorite (≤ 10, 4 in parallel).
- **`CALL_SERVICE`:** one `GET`, one `POST`, then while the state settles at most one `GET` every
  500 ms for 5 s, and only during that action.
- See [ADR-0007](adr/0007-android-companion-on-demand.md).
