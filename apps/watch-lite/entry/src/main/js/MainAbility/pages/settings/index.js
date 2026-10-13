import router from '@system.router';
import getStore from '../../common/store.js';

function ensureStore() {
    var st = getStore();
    if (!st.settings) {
        st.settings = {};
    }

    // defaults
    var s = st.settings;
    if (s.debugMode === undefined) s.debugMode = true;     // like your "Mock data on emulator"
    if (s.connectionMode === undefined) s.connectionMode = 'local'; // local/cloud (future)
    return st;
}

function colorGray() { return '#5A5A5A'; }
function colorBlue() { return '#2F80ED'; }
function colorGreen() { return '#27AE60'; }

export default {
    data: {
        items: []
    },

    onInit: function () {
        ensureStore();
        this._buildItems();
    },

    onShow: function () {
        // when coming back from About or elsewhere
        this._buildItems();
    },

    onSwipe: function (e) {
        if (!e || !e.direction) return;

        if (e.direction === 'right') {
            router.replace({ uri: 'pages/index/index' });
            return;
        }

        if (e.direction === 'down') {
            // refresh UI from store
            this._buildItems();
            return;
        }
    },

    _buildItems: function () {
        var store = ensureStore();
        var s = store.settings;

        var debugState = s.debugMode ? 'On (mock data)' : 'Off';
        var connectionState = (s.connectionMode === 'local')
            ? 'Local (cloud soon)'
            : 'Cloud (soon)';

        this.items = [
            {
                id: 'connection',
                name: 'Connection',
                state: connectionState,
                iconSrc: '/common/icons/connection.png',
                color: colorGray(),
                showChevron: false
            },
            {
                id: 'server',
                name: 'Server',
                state: 'Configure on phone',
                iconSrc: '/common/icons/server.png',
                color: colorGray(),
                showChevron: false
            },
            {
                id: 'debug',
                name: 'Debug mode',
                state: debugState,
                iconSrc: '/common/icons/debug.png',
                color: s.debugMode ? colorGreen() : colorGray(),
                showChevron: false
            },
            {
                id: 'about',
                name: 'About',
                state: 'Home Assistant Wearable',
                iconSrc: '/common/icons/info.png',
                color: colorBlue(),
                showChevron: true
            }
        ];
    },

    onItem: function (item) {
        var id = item && item.id ? String(item.id) : '';
        var store = ensureStore();

        if (id === 'debug') {
            store.settings.debugMode = !store.settings.debugMode;

            // если хочешь, чтобы debugMode влиял на данные на главной:
            // например, при debugMode=false — потом будешь грузить реальное HA через phone.
            this._buildItems();
            return;
        }

        if (id === 'connection') {
            // пока просто переключаем local/cloud (coming soon)
            store.settings.connectionMode = (store.settings.connectionMode === 'local') ? 'cloud' : 'local';
            this._buildItems();
            return;
        }

        if (id === 'about') {
            router.replace({ uri: 'pages/about/index' });
            return;
        }

        // server: nothing yet
    }
};
