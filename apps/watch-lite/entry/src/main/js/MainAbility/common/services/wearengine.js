// STUB of Huawei's Wear Engine lite JS SDK file (P2pClient / Message / Builder), for the DevEco
// Previewer and simulator. It answers like the v2 companion (docs/p2p-protocol.md) with the design's
// demo favorites, so the page always runs the real chain (protocol, P2P client, repository).
//
// For the watch, replace this file with Huawei's `wearengine.js` (apps/watch-lite/README.md § Wear
// Engine SDK): the demo data and dev.js are imported only here, so they leave the build with it.
import { DEV } from '../config/dev.js';
import { DEMO } from '../config/demo.js';
import { DOMAINS, STATES } from '../logic/protocol.js';
import { targetOf } from '../logic/look.js';

var FR = 1;
var cfg = {
    dev: DEV,
    timers: {
        set: function (fn, ms) {
            return setTimeout(fn, ms);
        },
        clear: function (id) {
            clearTimeout(id);
        }
    }
};
var cards = [];
var DOMAIN_CODE = invert(DOMAINS);
var STATE_CODE = invert(STATES);

function invert(table) {
    var out = {};
    for (var code in table) {
        if (table.hasOwnProperty(code)) {
            out[table[code]] = code;
        }
    }
    return out;
}

function reset() {
    var n = cfg.dev.favorites === 10 || cfg.dev.favorites === 0 ? cfg.dev.favorites : 5;
    cards = [];
    for (var i = 0; i < n; i++) {
        cards.push({ k: DEMO[i].k, d: DEMO[i].d, n: DEMO[i].n, s: DEMO[i].s });
    }
}
reset();

/** Tests (and only tests) swap the dev settings and the timers; the demo state restarts. */
export function configureStub(dev, timers) {
    cfg.dev = dev;
    cfg.timers = timers;
    reset();
}

function net() {
    return cfg.dev.network === 'ha' || cfg.dev.network === 'tel' ? cfg.dev.network : 'ok';
}

/** The prototype's delays: sync 1.5 s (0.9 s without phone), action 1.3 s (0.5 s), or dev.latency. */
function delay(type) {
    if (cfg.dev.latency > 0) {
        return cfg.dev.latency;
    }
    if (type === 'SYNC_REQUEST') {
        return net() === 'tel' ? 900 : 1500;
    }
    return net() === 'tel' ? 500 : 1300;
}

function wire(c) {
    return { k: c.k, d: DOMAIN_CODE[c.d], n: c.n, s: c.d === 'sensor' ? c.s : (STATE_CODE[c.s] || '?') };
}

function ack(req, code, card) {
    return code ? { v: 2, id: req.id, type: 'ACK', ok: false, code: code } : { v: 2, id: req.id, type: 'ACK', ok: true, c: card };
}

/** The companion's answer (ADR-0008): stale revision, unlock only with act "confirm", new card. */
function answer(req) {
    if (net() === 'ha') {
        return ack(req, 'ha');
    }
    if (req.type === 'SYNC_REQUEST') {
        var c = [];
        for (var i = 0; i < cards.length; i++) {
            c.push(wire(cards[i]));
        }
        return { v: 2, id: req.id, type: 'SYNC_RESPONSE', fr: FR, c: c };
    }
    var card = null;
    for (var j = 0; j < cards.length; j++) {
        if (cards[j].k === req.k) {
            card = cards[j];
        }
    }
    if (req.fr !== FR) {
        return ack(req, 'stale');
    }
    if (!card || card.d === 'sensor') {
        return ack(req, 'denied');
    }
    if (card.d === 'lock' && card.s === 'locked' && req.act !== 'confirm') {
        return ack(req, 'confirm');
    }
    card.s = targetOf(card.d, card.s);
    return ack(req, null, wire(card));
}

export function Builder() {
    this.text = '';
}
Builder.prototype.setDescription = function (text) {
    this.text = text;
};

export function Message() {
    this.builder = null;
}
Message.prototype.setBuilder = function (builder) {
    this.builder = builder;
};

export function P2pClient() {
    this.receiver = null;
    this.timerIds = [];
}
/** Lets the page tell the stub (demo mode) from Huawei's SDK. */
P2pClient.isStub = true;
P2pClient.dev = DEV;
P2pClient.prototype.setPeerPkgName = function () {};
P2pClient.prototype.setPeerFingerPrint = function () {};
P2pClient.prototype.registerReceiver = function (receiver) {
    this.receiver = receiver;
};
/** Page closed: replies still on their way are dropped. */
P2pClient.prototype.unregisterReceiver = function () {
    this.receiver = null;
    for (var i = 0; i < this.timerIds.length; i++) {
        cfg.timers.clear(this.timerIds[i]);
    }
    this.timerIds = [];
};
P2pClient.prototype.send = function (message, callback) {
    var self = this;
    var req;
    try {
        req = JSON.parse(message.builder.text);
    } catch (e) {
        return;
    }
    var id = cfg.timers.set(function () {
        self.timerIds.splice(self.timerIds.indexOf(id), 1);
        if (net() === 'tel') {
            callback.onFailure(); // no phone: the message cannot be delivered
        } else if (self.receiver) {
            self.receiver.onReceiveMessage(JSON.stringify(answer(req)));
        }
    }, delay(req.type));
    this.timerIds.push(id);
};
