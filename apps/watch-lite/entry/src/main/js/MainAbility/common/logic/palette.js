// Design palette (docs/design/watch-lite/README.md § Palette). Roles, not raw colours, travel through
// the logic; pages turn them into hex here. Pure ES5, no @system import (unit-tested with Node).

export var COLORS = {
    bg: '#000000',
    txt: '#E0E0E0', // texte principal
    sub: '#8C8C8C', // texte secondaire
    off: '#6B6B6B', // éteint · fermé · contour neutre
    on: '#FFC247', // allumé · ouvert
    lock: '#3DD68C', // verrouillé · connecté
    unlock: '#FF8A3D', // déverrouillé
    act: '#41BDF5', // action · en cours
    err: '#FF5A52' // échec · erreur
};

/** Hex colour of a palette role (falls back to the main text colour). */
export function color(role) {
    return COLORS[role] || COLORS.txt;
}

/** Path of a generated icon, e.g. iconFile('ic_light_on') → '/common/icons/ic_light_on.png'. */
export function iconFile(name) {
    return '/common/icons/' + name + '.png';
}
