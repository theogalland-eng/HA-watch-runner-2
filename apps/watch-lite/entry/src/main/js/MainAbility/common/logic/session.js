// Interaction rules of the design (docs/design/watch-lite/README.md § Règles d'interaction): which
// screen is shown, sync on open, one tap = one action, unlock confirmation, row feedback and its
// 1.5 s / 3 s / 8 s / 10 s timers. Page-independent: the page passes a repository, the timer
// functions and a redraw callback, so it is unit-tested with fake timers and could move to an
// application-level module (README § Plan B). Pure ES5, no @system import.
//
// Repository contract (callbacks, no Promise on lite):
//   loadCache(cb(cache|null))          cache = { fr, syncedAt, cards }
//   sync(cb(err, { fr, cards }))       err = { kind: 'tel' | 'ha' }
//   act({ k, fr, confirm }, cb(err, card|null))   err.kind adds 'timeout' | 'stale'
//   close()                            drops pending replies (page destroyed)
import { createState, findCard, startSync, applySync, failSync, applyEntity, startAction,
    actionSucceeded, actionFailed, clearPhase } from './store.js';
import { tapAction, targetOf, detailButton } from './look.js';

/** Design timings. TIMEOUT also bounds a sync (P2P requests time out at 8 s). */
export var TIMEOUT_MS = 8000;
export var OK_MS = 1500;
export var FAIL_MS = 3000;
export var CONFIRM_MS = 10000;

function noop() {}

/**
 * nav: 'dash' (list, or what the data imposes: errors 5b/5c without cache, no favorite 5d),
 * 'detail', 'confirm', 'settings' or 'error' (opened from the red indicator).
 */
export function createSession(repo, timers, now, onChange) {
    return {
        st: createState(), nav: 'dash', det: -1, conf: -1, ret: 'dash', confTimer: 0,
        live: false, // a sync succeeded since the app opened (settings: "Connecté", "Joignable")
        repo: repo, timers: timers, now: now, onChange: onChange || noop,
        timerIds: {}, syncTok: 0, dead: false
    };
}

function later(se, ms, fn) {
    var id = se.timers.set(function () {
        delete se.timerIds[id];
        if (!se.dead) {
            fn();
            se.onChange();
        }
    }, ms);
    se.timerIds[id] = true;
    return id;
}

function cancel(se, id) {
    if (id && se.timerIds[id]) {
        se.timers.clear(id);
        delete se.timerIds[id];
    }
}

function isPending(se, k) {
    var ent = se.st.ents[k];
    return !!ent && ent.phase === 'pending';
}

/** App opened: the cache first, then one sync in the background. */
export function open(se) {
    se.repo.loadCache(function (cache) {
        if (se.dead) {
            return;
        }
        if (cache && se.st.fr === null) {
            applySync(se.st, cache.fr, cache.cards, cache.syncedAt);
        }
        sync(se, null);
    });
}

/** Starts a sync unless one is running; `done(ok)` runs after it. */
function sync(se, done) {
    if (!startSync(se.st)) {
        return;
    }
    se.syncTok += 1;
    var tok = se.syncTok;
    var guard = later(se, TIMEOUT_MS, function () {
        endSync(se, tok, { kind: 'tel' }, null, done);
    });
    se.repo.sync(function (err, res) {
        if (se.dead) {
            return;
        }
        cancel(se, guard);
        endSync(se, tok, err, res, done);
        se.onChange();
    });
    se.onChange();
}

function endSync(se, tok, err, res, done) {
    if (tok !== se.syncTok || !se.st.syncing) {
        return; // late reply after the 8 s guard
    }
    if (err) {
        failSync(se.st, err.kind);
    } else {
        var sameFavorites = res.fr === se.st.fr;
        applySync(se.st, res.fr, res.cards, se.now());
        se.live = true;
        // A slot may now hold another entity: never leave a detail or an unlock confirmation open on it.
        if ((se.nav === 'detail' || se.nav === 'confirm') && (!sameFavorites || !findCard(se.st, se.nav === 'detail' ? se.det : se.conf))) {
            cancel(se, se.confTimer);
            se.nav = 'dash';
        }
    }
    if (done) {
        done(!err);
    }
}

/** Tap on the sync indicator: resync; when red, open the matching error screen. Ignored while syncing. */
export function tapStatus(se) {
    if (se.st.syncing) {
        return;
    }
    if (se.st.statusErr) {
        se.nav = 'error';
        se.onChange();
        return;
    }
    sync(se, null);
}

/** "Réessayer" / "Resynchroniser": syncs in place; a successful retry leaves the error screen. */
export function retry(se) {
    sync(se, function (ok) {
        if (ok && se.nav === 'error') {
            se.nav = 'dash';
        }
    });
}

export function tapRow(se, k) {
    var card = findCard(se.st, k);
    if (!card || isPending(se, k)) {
        return;
    }
    var what = tapAction(card);
    if (what === 'detail') {
        longPressRow(se, k);
    } else if (what === 'confirm') {
        askConfirm(se, k, 'dash');
    } else if (what === 'run') {
        run(se, k, false);
    }
}

/** Long press (or tap on a sensor): the detail screen. */
export function longPressRow(se, k) {
    if (findCard(se.st, k)) {
        se.nav = 'detail';
        se.det = k;
        se.onChange();
    }
}

/** The detail's single button; greyed and ignored while the action runs. */
export function tapDetailButton(se) {
    var card = findCard(se.st, se.det);
    if (!card || isPending(se, card.k) || !detailButton(card)) {
        return;
    }
    if (tapAction(card) === 'confirm') {
        askConfirm(se, card.k, 'detail');
    } else {
        run(se, card.k, false);
    }
}

function askConfirm(se, k, ret) {
    se.nav = 'confirm';
    se.conf = k;
    se.ret = ret;
    se.confTimer = later(se, CONFIRM_MS, function () {
        closeConfirm(se);
    });
    se.onChange();
}

function closeConfirm(se) {
    cancel(se, se.confTimer);
    se.confTimer = 0;
    se.nav = se.ret;
}

export function confirmYes(se) {
    if (se.nav !== 'confirm') {
        return;
    }
    var card = findCard(se.st, se.conf);
    closeConfirm(se);
    if (card && tapAction(card) === 'confirm') {
        run(se, card.k, true);
    }
    se.onChange();
}

export function confirmNo(se) {
    if (se.nav === 'confirm') {
        closeConfirm(se);
        se.onChange();
    }
}

export function openSettings(se) {
    se.nav = 'settings';
    se.onChange();
}

/** Swipe right. Returns true when the app should quit (back from the list). */
export function back(se) {
    if (se.nav === 'confirm') {
        closeConfirm(se);
    } else if (se.nav === 'dash') {
        return true;
    } else {
        se.nav = 'dash';
    }
    se.onChange();
    return false;
}

/** One tap = one action. Success needs Home Assistant's answer: no optimistic state. */
function run(se, k, confirmed) {
    var card = findCard(se.st, k);
    var to = targetOf(card.d, card.s);
    var tok = startAction(se.st, k, to);
    if (!tok) {
        return;
    }
    var guard = later(se, TIMEOUT_MS, function () {
        fail(se, k, tok, 'timeout');
    });
    se.repo.act({ k: k, fr: se.st.fr, confirm: confirmed }, function (err, fresh) {
        if (se.dead) {
            return;
        }
        cancel(se, guard);
        if (err && err.kind === 'stale') {
            // The phone's favorites changed: drop the feedback and resync (v2 protocol).
            if (clearPhase(se.st, k, tok)) {
                sync(se, null);
            }
        } else if (err) {
            fail(se, k, tok, err.kind);
        } else {
            if (fresh) {
                applyEntity(se.st, fresh, se.now());
            }
            if (actionSucceeded(se.st, k, tok, fresh ? fresh.s : to)) {
                later(se, OK_MS, function () {
                    clearPhase(se.st, k, tok);
                });
            }
        }
        se.onChange();
    });
    se.onChange();
}

function fail(se, k, tok, kind) {
    if (actionFailed(se.st, k, tok, kind)) {
        later(se, FAIL_MS, function () {
            clearPhase(se.st, k, tok);
        });
    }
}

/** Page destroyed: no timer survives, late replies are ignored (lite has no background). */
export function destroy(se) {
    se.dead = true;
    for (var id in se.timerIds) {
        if (se.timerIds.hasOwnProperty(id)) {
            se.timers.clear(Number(id));
        }
    }
    se.timerIds = {};
    se.repo.close();
    se.onChange = noop;
}
