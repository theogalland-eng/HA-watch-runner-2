// The real repository (contract in common/logic/session.js): Home Assistant through the phone
// companion, protocol v2 over Wear Engine P2P, plus the last state cached in a file
// (@system.file: @system.storage values must stay under 128 bytes). ES5, no RegExp.
import { encodeSync, encodeCall, decodeCards, decodeCard, kindOf, newId } from '../logic/protocol.js';
import { serializeCache, parseCache } from '../logic/cache.js';

export var CACHE_URI = 'internal://app/ha_cache.json';

function noop() {}

/** p2p = createP2pClient(...), file = @system.file, opts.useCache = false to ignore the cache file. */
export function createHaRepository(p2p, file, now, opts) {
    var useCache = !opts || opts.useCache !== false;

    function ask(text, id, cb, onReply) {
        p2p.request(text, id, function (err, reply) {
            if (err) {
                cb(err, null);
            } else if (reply.type === 'ACK' && reply.ok === false) {
                cb({ kind: kindOf(reply.code) }, null);
            } else {
                onReply(reply);
            }
        });
    }

    return {
        loadCache: function (cb) {
            if (!useCache) {
                cb(null);
                return;
            }
            file.readText({
                uri: CACHE_URI,
                success: function (data) {
                    cb(parseCache(data && data.text));
                },
                fail: function () {
                    cb(null);
                }
            });
        },
        sync: function (cb) {
            var id = newId('s', now());
            ask(encodeSync(id), id, cb, function (reply) {
                if (reply.type === 'SYNC_RESPONSE' && typeof reply.fr === 'number') {
                    cb(null, { fr: reply.fr, cards: decodeCards(reply.c) });
                } else {
                    cb({ kind: 'ha' }, null);
                }
            });
        },
        act: function (req, cb) {
            var id = newId('a', now());
            ask(encodeCall(id, req.k, req.fr, req.confirm), id, cb, function (reply) {
                if (reply.type === 'ACK') {
                    cb(null, reply.c ? decodeCard(reply.c) : null);
                } else {
                    cb({ kind: 'ha' }, null);
                }
            });
        },
        /** Keeps the last state for the next launch ("le cache d'abord"). */
        persist: function (state) {
            var text = useCache ? serializeCache(state) : null;
            if (text) {
                file.writeText({ uri: CACHE_URI, text: text, success: noop, fail: noop });
            }
        },
        close: function () {
            p2p.close();
        }
    };
}
