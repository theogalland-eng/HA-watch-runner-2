// Favorites state for the watch UI: cards (v2 compact shape { k, d, n, s }), the favorites revision
// `fr`, the sync indicator and the per-row action feedback. Plain mutable object (low memory on
// lite), no timers here: pages own the 1.5 s / 3 s / 8 s / 10 s timers and call back into these
// functions. Pure ES5, no @system import (unit-tested with Node).

/** At most 10 favorites (same cap as the companion). */
export var MAX_FAVORITES = 10;
/** Names are capped at 20 characters by the companion (v2); the watch never trusts more. */
export var MAX_NAME = 20;

export function createState() {
    return {
        cards: [], // in the user's order (= the order the companion sent)
        fr: null, // favorites revision from the last SYNC_RESPONSE; null = never synced
        lastSyncAt: 0, // ms timestamp of the last successful sync (or cache load)
        syncing: false,
        statusErr: null, // null | 'tel' | 'ha': drives the red indicator and the error screens
        ents: {}, // k → { phase: null|'pending'|'ok'|'fail', to, err, tok }
        updated: {}, // k → ms timestamp of a single-entity refresh newer than lastSyncAt
        tok: 0 // action token counter: a late callback for an old action is ignored
    };
}

/**
 * Typographic quotes ’ ‘ become ': the lite font (SourceHanSansSC) draws them full width, which
 * leaves a gap ("Porte d’ entrée"). No RegExp on lite.
 */
export function plainQuotes(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        out += ch === '\u2019' || ch === '\u2018' ? "'" : ch;
    }
    return out;
}

/** Validates and copies a card; returns null when the shape is wrong. */
export function normalizeCard(c) {
    if (!c || typeof c !== 'object') {
        return null;
    }
    if (typeof c.k !== 'number' || c.k % 1 !== 0 || c.k < 0 || c.k >= MAX_FAVORITES) {
        return null;
    }
    if (typeof c.d !== 'string' || typeof c.n !== 'string' || typeof c.s !== 'string') {
        return null;
    }
    return { k: c.k, d: c.d, n: plainQuotes(c.n.slice(0, MAX_NAME)), s: c.s };
}

/** Keeps valid cards, in order, dropping duplicate slots and anything beyond MAX_FAVORITES. */
export function normalizeCards(list) {
    var out = [];
    var seen = {};
    if (!list || typeof list.length !== 'number') {
        return out;
    }
    for (var i = 0; i < list.length && out.length < MAX_FAVORITES; i++) {
        var c = normalizeCard(list[i]);
        if (c && !seen[c.k]) {
            seen[c.k] = true;
            out.push(c);
        }
    }
    return out;
}

export function findCard(state, k) {
    for (var i = 0; i < state.cards.length; i++) {
        if (state.cards[i].k === k) {
            return state.cards[i];
        }
    }
    return null;
}

/** Whether there is anything to show without the phone (design: errors stay discreet with a cache). */
export function hasData(state) {
    return state.fr !== null;
}

/** Starts a sync; false when one is already running (taps on the indicator are then ignored). */
export function startSync(state) {
    if (state.syncing) {
        return false;
    }
    state.syncing = true;
    return true;
}

/**
 * Applies a full favorites list (SYNC_RESPONSE or cache). Row feedback survives only if the
 * favorites revision is unchanged: with a new `fr`, a slot may now hold another entity, so all
 * feedback is dropped (and a late reply to the old action is ignored by its token).
 */
export function applySync(state, fr, cards, now) {
    var nextFr = fr === undefined ? null : fr;
    var sameFavorites = nextFr !== null && nextFr === state.fr;
    state.cards = normalizeCards(cards);
    state.fr = nextFr;
    state.lastSyncAt = now;
    state.syncing = false;
    state.statusErr = null;
    state.updated = {};
    var kept = {};
    if (sameFavorites) {
        for (var i = 0; i < state.cards.length; i++) {
            var k = state.cards[i].k;
            if (state.ents[k]) {
                kept[k] = state.ents[k];
            }
        }
    }
    state.ents = kept;
}

/** A sync failed: 'tel' (phone unreachable) or 'ha' (phone answered, HA did not). */
export function failSync(state, kind) {
    state.syncing = false;
    state.statusErr = kind === 'ha' ? 'ha' : 'tel';
}

/** Replaces one card after a single-entity refresh received at `now`. False if the slot is unknown. */
export function applyEntity(state, card, now) {
    var c = normalizeCard(card);
    if (!c) {
        return false;
    }
    for (var i = 0; i < state.cards.length; i++) {
        if (state.cards[i].k === c.k) {
            state.cards[i] = c;
            if (now) {
                state.updated[c.k] = now;
            }
            return true;
        }
    }
    return false;
}

/**
 * Marks a row "en cours". Returns the action token, or 0 when the tap must be ignored (unknown
 * slot, read-only sensor, or an action already pending on that row).
 */
export function startAction(state, k, to) {
    var card = findCard(state, k);
    if (!card || card.d === 'sensor') {
        return 0;
    }
    var ent = state.ents[k];
    if (ent && ent.phase === 'pending') {
        return 0;
    }
    state.tok += 1;
    state.ents[k] = { phase: 'pending', to: to, err: null, tok: state.tok };
    return state.tok;
}

function current(state, k, tok) {
    var ent = state.ents[k];
    return ent && ent.tok === tok ? ent : null;
}

/** The row's action is still waiting: a reply after the 8 s timeout changes no feedback. */
function waiting(state, k, tok) {
    var ent = current(state, k, tok);
    return ent && ent.phase === 'pending' ? ent : null;
}

/** Confirmed by Home Assistant: new state (if known) + check mark. False if stale or already settled. */
export function actionSucceeded(state, k, tok, newState) {
    var ent = waiting(state, k, tok);
    if (!ent) {
        return false;
    }
    if (typeof newState === 'string') {
        var card = findCard(state, k);
        if (card) {
            card.s = newState;
        }
    }
    ent.phase = 'ok';
    ent.to = null;
    return true;
}

/** Failure: red row; 'tel'/'ha' also turn the indicator red ('timeout' leaves it unchanged). */
export function actionFailed(state, k, tok, kind) {
    var ent = waiting(state, k, tok);
    if (!ent) {
        return false;
    }
    ent.phase = 'fail';
    ent.to = null;
    ent.err = kind;
    if (kind === 'tel' || kind === 'ha') {
        state.statusErr = kind;
    }
    return true;
}

/** When the watch last received this card ("Mis à jour il y a …" in the detail). */
export function cardAt(state, k) {
    return state.updated[k] || state.lastSyncAt;
}

/** End of the 1.5 s success / 3 s failure display: the row shows its cached state again. */
export function clearPhase(state, k, tok) {
    var ent = current(state, k, tok);
    if (!ent) {
        return false;
    }
    delete state.ents[k];
    return true;
}

/**
 * Which full screen the dashboard shows:
 * - 'list'  favorites (with the sync indicator, even while the first sync runs);
 * - 'empty' synced, but no favorite chosen on the phone (5d);
 * - 'error_tel' / 'error_ha' no data at all and the sync failed (5b / 5c), also while "Réessayer"
 *   runs (the design keeps the error screen until a sync succeeds). With data, errors stay discreet
 *   (red indicator).
 */
export function screenOf(state) {
    if (!hasData(state)) {
        if (state.statusErr) {
            return state.statusErr === 'ha' ? 'error_ha' : 'error_tel';
        }
        return 'list';
    }
    return state.cards.length === 0 ? 'empty' : 'list';
}
