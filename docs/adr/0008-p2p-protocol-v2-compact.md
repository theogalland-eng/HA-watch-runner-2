# 0008. Compact P2P protocol v2 (slots, codes, favorites revision)

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

[ADR-0003](0003-wear-engine-p2p-transport.md) chose Wear Engine P2P with a JSON contract (v1). Its
transport choice stands. Its message shapes do not:

- **1 KB limit.** Huawei documents a limit of **1 KB per P2P message, in both directions**.
- **v1 is too large.** A v1 card is about 200 to 300 bytes: `entity_id`, a localised name, a
  localised primary action with domain, service and data, and `secondary`. A `SYNC_RESPONSE` passes
  1 KB from about 4 favorites, and the watch shows up to 10.
- **Lite watch constraints.** The Watch GT Runner 2 is a lite wearable: about 1 MB of RAM, no
  RegExp, a single font.
- **Battery priority.** The phone calls Home Assistant only when the watch asks
  ([ADR-0007](0007-android-companion-on-demand.md)).
- **The real cost is Bluetooth.** v1 needed two exchanges after an action (`CALL_SERVICE`, then
  `SYNC_ENTITY_REQUEST`). A lock often reports `locking` right after the call.
- **The watch must stay presentation-only.** A slot can point to another entity once the user edits
  the favorites on the phone: an unlock must never reach the wrong lock.

## Decision

We replace v1 with a **compact v2**, with no compatibility (`v: 2`). The contract is
[docs/p2p-protocol.md](../p2p-protocol.md).

- **Card.**
  - Shape: `{k, d, n, s}`: slot (index in the favorites), domain code, name, state code.
  - Codes are one letter, from the tables in the protocol document: `d` (`l`/`s`/`k`, reserved
    `c`/`e`/`n`) and `s` (`1 0 L U x ? g h j`, reserved `o f`).
  - A sensor's `s` is its value: ≤ 12 characters and ≤ 12 JSON bytes.
  - `n`: ’ ‘ become `'`; it is cut to ≤ 20 characters and ≤ 40 JSON bytes.
- **No `entity_id`, action or label on the watch.**
  - `CALL_SERVICE {k, fr, act?}` names a slot; the companion reads the state and picks the service.
  - Unlocking requires `act: "confirm"`, sent only after the watch's confirmation screen.
- **Favorites revision `fr`.**
  - Value: FNV-1a 32-bit of the ordered favorites, on 31 bits. It is stateless and the same after a
    reinstall.
  - Every `SYNC_RESPONSE` carries it, and every action sends it back.
  - A mismatch gets `ACK {ok:false, code:"stale"}` and the watch resyncs.
- **The `ACK` of an action carries the new card.**
  - The card comes from Home Assistant's reply to the service call when it already shows the final
    state.
  - Otherwise the entity is read every 500 ms, for at most 5 s and only during that action. The
    reply then carries the last state, possibly transient.
  - `SYNC_ENTITY_REQUEST` is removed.
- **Short ASCII `ACK.code`s.** `stale`, `confirm`, `denied`, `config`, `auth`, `ha`, `timeout`,
  `bad`, `version`, `internal`. They replace v1's free `error` strings.
- **Size budget.** Every message is **≤ 900 bytes** in the worst case, checked by a test that prints
  the sizes: 896 bytes for a `SYNC_RESPONSE` with 10 favorites, 20-character accented names and
  12-byte sensors.
- **Code tables.** They live in the protocol document. The companion (`CardCodes.kt`) and the watch
  (`protocol.js`, PR 3c) each have a test that parses them from the document, so the two sides
  stay identical.

## Consequences

- **Size.** Messages are 4 to 5 times smaller, and 10 favorites fit with a margin.
- **One exchange per action** instead of two, which saves battery on both devices.
- **No more labels on the wire.** The phone's action labels and their strings (EN/FR/RU) are
  removed; the watch translates the codes itself.
- **Safety.** Unlocking needs an explicit confirmation flag, and a stale slot can never act.
- **Polling during an action.** The companion now reads an entity repeatedly during an action: at
  most about 10 `GET`s over 5 s, never otherwise. ADR-0007's "no polling" still holds between
  requests.
- **Adding a domain.** A new domain needs a code in both tables (document, `CardCodes`,
  `protocol.js`) on top of its `DomainMapper`.
- **`apps/watch-arkts/` stays on v1.** It no longer talks to this companion; it targets the full
  wearables (Watch 4/5/Ultimate), which this fork does not use. Porting it to v2 would be a separate
  change.
- **Slot equals list position.** The watch must not keep row feedback across a new `fr`, since a
  slot may now hold another entity. The lite watch already drops it (PR 3b).

## Alternatives considered

- **Cards as arrays** `[k,d,n,s]` (776 bytes): rejected. It moves away from the named-field shape and
  is harder to read in logs; one-letter codes are enough.
- **Domain in clear text with object cards**: rejected. It gives 923 to 936 bytes, over 900.
- **A separate `SYNC_ENTITY` after each action**: rejected. It costs a second Bluetooth round trip;
  the `ACK` carries the card.
- **A stored revision counter instead of a hash**: rejected. It resets on reinstall and could then
  match an older watch cache.
