// App entry. Creates the app-level core once (common/app/core.js: Wear Engine, repository + cache,
// session) and publishes it for the page (common/app/link.js). The core is in this bundle and not in
// the page's, so that each stays under lite's ~48 KB of compiled JS (docs/platform-constraints.md).
// With the Wear Engine stub (common/services/wearengine.js) the companion is simulated (DevEco
// Previewer); with Huawei's file it is the real phone.
import app from '@system.app';
import file from '@system.file';
import { P2pClient, Message, Builder } from './common/services/wearengine.js';
import { PEER } from './common/config/peer.js';
import { createCore } from './common/app/core.js';
import { publishCore, getCore, unpublishCore } from './common/app/link.js';

var timers = {
    set: function (fn, ms) {
        return setTimeout(fn, ms);
    },
    clear: function (id) {
        clearTimeout(id);
    }
};

function now() {
    return Date.now();
}

export default {
    onCreate: function () {
        var info = app.getInfo();
        var version = info && info.versionName ? String(info.versionName) : '';
        var core = createCore({
            sdk: { P2pClient: P2pClient, Message: Message, Builder: Builder },
            peer: PEER,
            file: file,
            timers: timers,
            now: now,
            version: version
        });
        publishCore(core);
        core.start();
        // No lite API exposes the JS memory: the watch checklist decides (README § Watch test).
        console.info('[ha] start ' + version + (core.isStub ? ' (Wear Engine stub)' : '') + ' core=app');
    },
    onDestroy: function () {
        var core = getCore();
        if (core) {
            core.destroy();
        }
        unpublishCore();
    }
};
