// The app's only page: it draws the app-level core (common/app/core.js, created by app.js) and
// forwards taps to it. Rules live in common/logic/session.js, view-models in view.js (both
// unit-tested); this file wires them to lite: $t, the redraw, the router-less back gesture. Wear
// Engine, the cache and the session are in the app.js bundle, the drawing in this one: each stays
// under lite's ~48 KB of compiled JS (docs/platform-constraints.md § Page size).
import app from '@system.app';
import { buildView } from '../../common/logic/view.js';
import { getCore } from '../../common/app/link.js';

var core = null;

function now() {
    return Date.now();
}

/** dev.js `trace`: one log line per redraw, to tell "data not updated" from "lite did not redraw". */
function trace(v) {
    var line = '[ha] paint ' + v.screen;
    for (var i = 0; v.rows && i < v.rows.length; i++) {
        line += ' r' + v.rows[i].k + '=' + v.rows[i].state + (v.rows[i].hasCheck ? '+check' : '');
    }
    console.info(line);
}

export default {
    data: {
        isList: false,
        isMessage: false,
        isDetail: false,
        isConfirm: false,
        isSettings: false,
        status: { icon: '', text: '', color: '' },
        rows: [],
        message: { icon: '', t1: '', t2: '', hasT2: false, b1: '', b2: '', btn: '' },
        detail: { icon: '', name: '', state: '', color: '', meta: '', metaColor: '', hasButton: false, btnText: '', btnColor: '', btnBorder: '', btnOpacity: 1, isReadOnly: false },
        confirmName: '',
        settings: { phone: '', phoneColor: '', ha: '', haColor: '', btn: '', last: '', fav: '', version: '' }
    },

    onInit: function () {
        var self = this;
        core = getCore();
        if (!core) {
            console.error('[ha] core=MISSING: app.js did not publish the core');
            return;
        }
        core.attach(function () {
            self.paint();
        });
        this.paint();
    },

    onDestroy: function () {
        if (core) {
            core.attach(null); // app.js onDestroy destroys the core
            core = null;
        }
    },

    paint: function () {
        var self = this;
        if (!core) {
            return;
        }
        var v = buildView(core.session, function (key) {
            return self.$t('strings.' + key);
        }, now(), core.version);
        var show = {
            isList: v.screen === 'list',
            isMessage: v.screen === 'error' || v.screen === 'empty',
            isDetail: v.screen === 'detail',
            isConfirm: v.screen === 'confirm',
            isSettings: v.screen === 'settings'
        };
        var flag;
        // Data first, then hide the leaving screen, then show the entering one: two screens never
        // coexist and a screen is never built with stale data (memory peak on ~1 MB).
        if (v.status) {
            this.status = v.status;
            this.rows = v.rows;
        }
        if (v.message) {
            this.message = v.message;
        }
        if (v.detail) {
            this.detail = v.detail;
        }
        if (v.confirmName !== null) {
            this.confirmName = v.confirmName;
        }
        if (v.settings) {
            this.settings = v.settings;
        }
        if (core.dev.trace) {
            trace(v);
        }
        for (flag in show) {
            if (show.hasOwnProperty(flag) && !show[flag] && this[flag]) {
                this[flag] = false;
            }
        }
        for (flag in show) {
            if (show.hasOwnProperty(flag) && show[flag] && !this[flag]) {
                this[flag] = true;
            }
        }
    },

    onStatus: function () {
        if (core) {
            core.tapStatus();
        }
    },
    onRow: function (k) {
        if (core) {
            core.tapRow(k);
        }
    },
    onRowLong: function (k) {
        if (core) {
            core.longPressRow(k);
        }
    },
    onSettings: function () {
        if (core) {
            core.openSettings();
        }
    },
    onSync: function () {
        if (core) {
            core.retry();
        }
    },
    onDetailButton: function () {
        if (core) {
            core.tapDetailButton();
        }
    },
    onConfirmYes: function () {
        if (core) {
            core.confirmYes();
        }
    },
    onConfirmNo: function () {
        if (core) {
            core.confirmNo();
        }
    },
    onSwipe: function (e) {
        if (e && e.direction === 'right' && core && core.back()) {
            app.terminate();
        }
    }
};
