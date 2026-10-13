// Demo repository (Mock mode): only when Wear Engine is unavailable (DevEco previewer/simulator).
// It plays the design prototype: the 10 favorites of the mock-up as v2 cards { k, d, n, s }, a sync
// in 1.5 s (0.9 s without phone), an action in 1.3 s (0.5 s without phone), and the companion's
// rules (unlocking needs the confirmation, a stale favorites revision is refused). Same contract as
// the real repository (common/logic/session.js). Timers are injected so tests can fake them.
import { targetOf } from '../logic/look.js';

export var DEMO = [
    { k: 0, d: 'light', n: 'Salon', s: 'on' },
    { k: 1, d: 'light', n: 'Cuisine', s: 'off' },
    { k: 2, d: 'switch', n: 'Prise bureau', s: 'on' },
    { k: 3, d: 'lock', n: 'Porte d’entrée', s: 'locked' },
    { k: 4, d: 'lock', n: 'Garage', s: 'unlocked' },
    { k: 5, d: 'light', n: 'Lampe de chevet parents', s: 'off' },
    { k: 6, d: 'cover', n: 'Volet séjour', s: 'open' },
    { k: 7, d: 'sensor', n: 'Température salon', s: '21,5 °C' },
    { k: 8, d: 'scene', n: 'Bonne nuit', s: 'idle' },
    { k: 9, d: 'switch', n: 'Ventilation', s: 'off' }
];

var FR = 1;
var CACHE_AGE_MS = 3 * 60000; // the design's "il y a 3 min"

function copy(c) {
    return { k: c.k, d: c.d, n: c.n, s: c.s };
}

function copyAll(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
        out.push(copy(list[i]));
    }
    return out;
}

/** dev = { favorites: 5 | 10 | 0, network: 'ok' | 'ha' | 'tel', cache: boolean } (common/config/dev.js). */
export function createMockRepository(dev, timers, now) {
    var count = dev.favorites === 10 || dev.favorites === 0 ? dev.favorites : 5;
    var net = dev.network === 'ha' || dev.network === 'tel' ? dev.network : 'ok';
    var cards = copyAll(DEMO.slice(0, count));
    var pending = [];

    function after(ms, fn) {
        var id = timers.set(function () {
            pending.splice(pending.indexOf(id), 1);
            fn();
        }, ms);
        pending.push(id);
    }

    function find(k) {
        for (var i = 0; i < cards.length; i++) {
            if (cards[i].k === k) {
                return cards[i];
            }
        }
        return null;
    }

    return {
        loadCache: function (cb) {
            cb(dev.cache ? { fr: FR, syncedAt: now() - CACHE_AGE_MS, cards: copyAll(cards) } : null);
        },
        sync: function (cb) {
            after(net === 'tel' ? 900 : 1500, function () {
                if (net === 'ok') {
                    cb(null, { fr: FR, cards: copyAll(cards) });
                } else {
                    cb({ kind: net }, null);
                }
            });
        },
        act: function (req, cb) {
            after(net === 'tel' ? 500 : 1300, function () {
                var c = find(req.k);
                if (net !== 'ok') {
                    cb({ kind: net }, null);
                } else if (!c || req.fr !== FR) {
                    cb({ kind: 'stale' }, null);
                } else if (c.d === 'lock' && c.s === 'locked' && !req.confirm) {
                    cb({ kind: 'ha' }, null); // the companion refuses an unlock without act: "confirm"
                } else {
                    c.s = targetOf(c.d, c.s);
                    cb(null, copy(c));
                }
            });
        },
        close: function () {
            for (var i = 0; i < pending.length; i++) {
                timers.clear(pending[i]);
            }
            pending = [];
        }
    };
}
