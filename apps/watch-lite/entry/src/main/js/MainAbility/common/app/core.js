// The app-level core: Wear Engine P2P client, repository (with its file cache) and the interaction
// session, created once by app.js. It lives in the app.js bundle, so the page bundle carries only the
// drawing (view-models, looks, texts, HML/CSS): each bundle stays under lite's ~48 KB of compiled JS
// (docs/platform-constraints.md § Page size). The page draws `session` and forwards taps here.
// Pure ES5: the @system modules and the Wear Engine SDK are passed in by app.js (unit-tested with Node).
import { createSession, open, tapStatus, tapRow, longPressRow, tapDetailButton, confirmYes, confirmNo,
    retry, openSettings, back, destroy } from '../logic/session.js';
import { createP2pClient } from '../services/p2pClient.js';
import { createHaRepository } from '../services/haRepository.js';

function noop() {}

/**
 * o = { sdk: { P2pClient, Message, Builder }, peer, file (@system.file), timers: { set, clear }, now,
 * version }. With the Wear Engine stub, `dev` holds the dev.js settings; with Huawei's SDK it is {}.
 */
export function createCore(o) {
    var isStub = !!o.sdk.P2pClient.isStub;
    var dev = isStub ? o.sdk.P2pClient.dev : {};
    var listener = noop;
    var p2p = createP2pClient(o.sdk, o.peer);
    var repo = createHaRepository(p2p, o.file, o.now, { useCache: dev.cache !== false });
    var se = createSession(repo, o.timers, o.now, function () {
        listener();
    });
    var started = false;
    var dead = false;

    return {
        session: se,
        version: o.version || '',
        isStub: isStub,
        dev: dev,
        /** Cache first, then one sync (app.js onCreate, before the page exists). */
        start: function () {
            if (!started && !dead) {
                started = true;
                open(se);
            }
        },
        /** The page's redraw; null when the page goes away. */
        attach: function (fn) {
            listener = fn || noop;
        },
        tapStatus: function () {
            tapStatus(se);
        },
        tapRow: function (k) {
            tapRow(se, k);
        },
        longPressRow: function (k) {
            longPressRow(se, k);
        },
        tapDetailButton: function () {
            tapDetailButton(se);
        },
        confirmYes: function () {
            confirmYes(se);
        },
        confirmNo: function () {
            confirmNo(se);
        },
        retry: function () {
            retry(se);
        },
        openSettings: function () {
            openSettings(se);
        },
        /** Swipe right. True when the app should quit (back from the list). */
        back: function () {
            return back(se);
        },
        /** app.js onDestroy: every timer cleared, the P2P receiver unregistered, late replies ignored. */
        destroy: function () {
            if (!dead) {
                dead = true;
                listener = noop;
                destroy(se);
            }
        }
    };
}
