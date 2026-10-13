// What the page binds: one view-model per screen, texts already translated (`t(key)` wraps the
// page's $t) and colours as hex. Only the visible screen's model is built. Pure ES5, no @system
// import (unit-tested with Node against the real i18n files).
import { findCard, screenOf, cardAt, MAX_FAVORITES } from './store.js';
import { rowView, stateLook, detailButton, failKey } from './look.js';
import { agoParts, fill } from './format.js';
import { color, iconFile } from './palette.js';

/** "il y a 3 min" / "à l'instant" / "Jamais". */
export function agoText(t, nowMs, thenMs) {
    var p = agoParts(nowMs, thenMs);
    return p ? fill(t(p.key), { n: p.n }) : t('never');
}

/** 'list' | 'error' (5b/5c) | 'empty' (5d) | 'detail' | 'confirm' | 'settings'. */
export function screenName(se) {
    if ((se.nav === 'detail' && findCard(se.st, se.det)) || (se.nav === 'confirm' && findCard(se.st, se.conf)) || se.nav === 'settings') {
        return se.nav;
    }
    if (se.nav === 'error' && se.st.statusErr) {
        return 'error';
    }
    var s = screenOf(se.st);
    return s === 'error_tel' || s === 'error_ha' ? 'error' : s;
}

function stateText(t, look) {
    return look.textKey ? t(look.textKey) : look.text;
}

function statusView(se, t, nowMs) {
    var st = se.st;
    if (st.syncing) {
        return { icon: iconFile('ic_sync_24_act'), text: t('syncing'), color: color('act') };
    }
    if (st.statusErr) {
        var ha = st.statusErr === 'ha';
        return { icon: iconFile(ha ? 'ic_ha_off_24_err' : 'ic_phone_off_24_err'), text: t(ha ? 'status_ha' : 'status_phone'), color: color('err') };
    }
    return { icon: iconFile('ic_sync_24_sub'), text: agoText(t, nowMs, st.lastSyncAt), color: color('sub') };
}

function rowsView(se, t) {
    var out = [];
    for (var i = 0; i < se.st.cards.length; i++) {
        var card = se.st.cards[i];
        var r = rowView(card, se.st.ents[card.k]);
        out.push({ k: card.k, name: card.n, icon: iconFile(r.icon), state: stateText(t, r), color: color(r.stateColor), check: iconFile(r.check || 'ic_check_24_on'), hasCheck: !!r.check });
    }
    return out;
}

/** Detail 4a/4b/4c: while failing, the cached state stays and the failure replaces "Mis à jour". */
function detailView(se, t, nowMs) {
    var card = findCard(se.st, se.det);
    var ent = se.st.ents[card.k];
    var phase = ent ? ent.phase : null;
    var look = phase === 'fail' ? stateLook(card) : rowView(card, ent);
    var btn = detailButton(card);
    return {
        icon: iconFile(rowView(card, ent).icon),
        name: card.n,
        state: stateText(t, look),
        color: color(look.stateColor),
        meta: phase === 'fail' ? t(failKey(ent.err)) : fill(t('updated'), { ago: agoText(t, nowMs, cardAt(se.st, card.k)) }),
        metaColor: color(phase === 'fail' ? 'err' : 'sub'),
        hasButton: !!btn,
        btnText: btn ? t(btn.key) : '',
        btnColor: btn ? color(btn.color) : '',
        btnBorder: btn ? color(btn.border) : '',
        btnOpacity: phase === 'pending' ? 0.4 : 1,
        readOnly: card.d === 'sensor'
    };
}

/** Full-screen messages: 5b phone, 5c Home Assistant (red icon, "Réessayer"), 5d no favorite. */
function messageView(se, t, name) {
    var st = se.st;
    if (name === 'empty') {
        return { icon: iconFile('ic_star_sub'), t1: t('empty_title'), t2: '', b1: t('empty_b1'), b2: t('empty_b2'), btn: t(st.syncing ? 'syncing' : 'resync') };
    }
    if (st.statusErr === 'ha') {
        return { icon: iconFile('ic_ha_off_err'), t1: t('ha_name'), t2: t('err_ha_t2'), b1: t('err_ha_b1'), b2: t('err_ha_b2'), btn: t(st.syncing ? 'connecting' : 'retry') };
    }
    return { icon: iconFile('ic_phone_off_err'), t1: t('err_phone_t1'), t2: t('err_phone_t2'), b1: t('err_phone_b1'), b2: t('err_phone_b2'), btn: t(st.syncing ? 'connecting' : 'retry') };
}

/** Screen 6. Before any answer in this session, phone and HA are "Inconnu" (not drawn in the design). */
function settingsView(se, t, nowMs, version) {
    var err = se.st.statusErr;
    var phone = err === 'tel' ? ['disconnected', 'err'] : (err === 'ha' || se.live ? ['connected', 'lock'] : ['unknown', 'sub']);
    var ha = err === 'ha' ? ['unreachable', 'err'] : (!err && se.live ? ['reachable', 'lock'] : ['unknown', 'sub']);
    return {
        phone: t(phone[0]),
        phoneColor: color(phone[1]),
        ha: t(ha[0]),
        haColor: color(ha[1]),
        btn: t(se.st.syncing ? 'syncing' : 'resync'),
        last: agoText(t, nowMs, se.st.lastSyncAt),
        fav: fill(t('fav_count'), { n: se.st.cards.length, max: MAX_FAVORITES }),
        version: version
    };
}

/** Everything the page needs for one redraw; models of hidden screens are null (kept as they were). */
export function buildView(se, t, nowMs, version) {
    var name = screenName(se);
    var confirmCard = name === 'confirm' ? findCard(se.st, se.conf) : null;
    return {
        screen: name,
        status: name === 'list' ? statusView(se, t, nowMs) : null,
        rows: name === 'list' ? rowsView(se, t) : null,
        detail: name === 'detail' ? detailView(se, t, nowMs) : null,
        confirmName: confirmCard ? confirmCard.n : null,
        message: name === 'error' || name === 'empty' ? messageView(se, t, name) : null,
        settings: name === 'settings' ? settingsView(se, t, nowMs, version) : null
    };
}
