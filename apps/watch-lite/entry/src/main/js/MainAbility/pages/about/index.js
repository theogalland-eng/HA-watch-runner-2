import router from '@system.router';
import getStore from '../../common/store.js';

function ensureStore() {
    var st = getStore();
    if (!st.settings) {
        st.settings = {};
    }
    return st;
}

export default {
    data: {
        versionName: '1.0.0',
        logoSrc: '/common/icons/logo_mono.png'
    },

    onInit: function () {
        var store = ensureStore();

        // optional: allow settings to override
        if (store.settings && store.settings.versionName) {
            this.versionName = String(store.settings.versionName);
        }
    },

    onSwipe: function (e) {
        if (!e || !e.direction) return;

        // back to settings
        if (e.direction === 'right') {
            router.replace({ uri: 'pages/settings/index' });
        }
    }
};
