// The app's only page. Rules live in common/logic/session.js and view-models in view.js (both
// unit-tested); this file wires them to lite: timers, $t, the router-less back gesture.
// Mock mode for now (PR 3b); the Wear Engine repository replaces it when the SDK is present (PR 3c).
import app from '@system.app';
import { createSession, open, tapStatus, tapRow, longPressRow, tapDetailButton, confirmYes, confirmNo,
    retry, openSettings, back, destroy } from '../../common/logic/session.js';
import { buildView } from '../../common/logic/view.js';
import { createMockRepository } from '../../common/repo/mockRepository.js';
import { DEV } from '../../common/config/dev.js';

var session = null;
var version = '';

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
    data: {
        isList: false,
        isMessage: false,
        isDetail: false,
        isConfirm: false,
        isSettings: false,
        status: { icon: '', text: '', color: '' },
        rows: [],
        message: { icon: '', t1: '', t2: '', b1: '', b2: '', btn: '' },
        detail: { icon: '', name: '', state: '', color: '', meta: '', metaColor: '', hasButton: false, btnText: '', btnColor: '', btnBorder: '', btnOpacity: 1, readOnly: false },
        confirmName: '',
        settings: { phone: '', phoneColor: '', ha: '', haColor: '', btn: '', last: '', fav: '', version: '' }
    },

    onInit: function () {
        var self = this;
        var info = app.getInfo();
        version = info && info.versionName ? String(info.versionName) : '';
        session = createSession(createMockRepository(DEV, timers, now), timers, now, function () {
            self.paint();
        });
        open(session);
        this.paint();
    },

    onDestroy: function () {
        if (session) {
            destroy(session);
            session = null;
        }
    },

    paint: function () {
        var self = this;
        if (!session) {
            return;
        }
        var v = buildView(session, function (key) {
            return self.$t('strings.' + key);
        }, now(), version);
        this.isList = v.screen === 'list';
        this.isMessage = v.screen === 'error' || v.screen === 'empty';
        this.isDetail = v.screen === 'detail';
        this.isConfirm = v.screen === 'confirm';
        this.isSettings = v.screen === 'settings';
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
    },

    onStatus: function () {
        tapStatus(session);
    },
    onRow: function (k) {
        tapRow(session, k);
    },
    onRowLong: function (k) {
        longPressRow(session, k);
    },
    onSettings: function () {
        openSettings(session);
    },
    onSync: function () {
        retry(session);
    },
    onDetailButton: function () {
        tapDetailButton(session);
    },
    onConfirmYes: function () {
        confirmYes(session);
    },
    onConfirmNo: function () {
        confirmNo(session);
    },
    onSwipe: function (e) {
        if (e && e.direction === 'right' && back(session)) {
            app.terminate();
        }
    }
};
