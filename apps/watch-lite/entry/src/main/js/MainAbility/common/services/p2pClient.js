// Wear Engine P2P (lite JS SDK, common/services/wearengine.js) behind request/reply: one receiver
// for the page's lifetime, replies correlated by `id` (they may come out of order). No timer here:
// the session owns the 8 s timeout. Send failure = phone unreachable. API names from Huawei's lite
// Wear Engine docs; they are only used in this file. ES5, no RegExp.
import { decodeReply } from '../logic/protocol.js';

var MAX_PENDING = 8;

function noop() {}

/** sdk = { P2pClient, Message, Builder }; peer = { pkg, fingerprint } (common/config/peer.js). */
export function createP2pClient(sdk, peer) {
    var client = new sdk.P2pClient();
    var pending = {};
    var order = [];

    client.setPeerPkgName(peer.pkg);
    client.setPeerFingerPrint(peer.fingerprint);

    function take(id) {
        var cb = pending[id] || null;
        if (cb) {
            delete pending[id];
            order.splice(order.indexOf(id), 1);
        }
        return cb;
    }

    var receiver = {
        onSuccess: noop,
        onFailure: noop,
        onReceiveMessage: function (data) {
            var reply = typeof data === 'string' ? decodeReply(data) : null; // files are not used
            var cb = reply ? take(reply.id) : null;
            if (cb) {
                cb(null, reply);
            }
        }
    };
    client.registerReceiver(receiver);

    function failed(id) {
        var cb = take(id);
        if (cb) {
            cb({ kind: 'tel' }, null);
        }
    }

    return {
        /** Sends `text`; `cb(err, reply)` once, with err.kind 'tel' when it could not be sent. */
        request: function (text, id, cb) {
            if (order.length >= MAX_PENDING) {
                take(order[0]); // the oldest was long abandoned by the session's 8 s timeout
            }
            pending[id] = cb;
            order.push(id);
            var builder = new sdk.Builder();
            builder.setDescription(text);
            var message = new sdk.Message();
            message.setBuilder(builder);
            client.send(message, {
                onSuccess: noop,
                onFailure: function () {
                    failed(id);
                },
                onSendResult: function (result) {
                    // 206 = not delivered: peer package/fingerprint mismatch, no receiver, Bluetooth off
                    // (Huawei Wear Engine FAQ). 207 = sent.
                    if (result && result.code === 206) {
                        failed(id);
                    }
                },
                onSendProgress: noop
            });
        },
        close: function () {
            pending = {};
            order = [];
            client.unregisterReceiver(receiver);
        }
    };
}
