// Single source of truth for the 26 watch icons (design: docs/design/watch-lite/README.md § Icônes).
// Paths come verbatim from the Claude Design export (viewBox 0 0 24 24, stroke only, round caps/joins).

/** Palette roles → colour. Same names as `pal()` in the design prototype. */
export const PALETTE = {
  on: '#FFC247', // allumé · ouvert
  off: '#6B6B6B', // éteint · fermé
  sub: '#8C8C8C', // texte secondaire, réglages, capteur
  lock: '#3DD68C', // verrouillé · connecté
  unlock: '#FF8A3D', // déverrouillé
  act: '#41BDF5', // action · en cours
  err: '#FF5A52', // échec · erreur
};

export const PATHS = {
  light: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  switch: 'M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5',
  lock: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V7a4 4 0 0 1 7.8-1.2',
  scene: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM10 8v8l6-4z',
  cover: 'M3 4h18M5 4v16h14V4M5 8h14M5 12h14M5 16h14',
  sensor: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0zM12 9v6',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  pending: 'M4.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0zM10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0zM16.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0z',
  fail: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM12 7v6M12 16.5v.5',
  phone_off: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2M3 3l18 18',
  ha_off: 'M3 11l9-8 9 8M5 9.5V21h14V9.5M10 13l4 4M14 13l-4 4',
  star: 'M12 3l2.8 5.9 6.2.8-4.5 4.3 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.7l6.2-.8z',
  home: 'M3 11l9-8 9 8M5 9.5V21h14V9.5M10 21v-6h4v6',
  sync: 'M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};

/**
 * Geometry per size (from the design component):
 * - 48 px: drawing 40 px (viewBox scaled ×40/24) centred with a 4 px margin; stroke 1.8 → 3 px.
 * - 24 px: drawing 24 px (×1); stroke 2 (2.4 for the check mark).
 */
const S48 = { size: 48, draw: 40, stroke: 1.8 };
const S24 = { size: 24, draw: 24, stroke: 2 };

/** [file base name, path key, geometry, colour roles]. 17 files at 48 px + 9 at 24 px = 26. */
const TABLE = [
  ['ic_light', 'light', S48, ['on', 'off']],
  ['ic_switch', 'switch', S48, ['on', 'off']],
  ['ic_lock', 'lock', S48, ['lock']],
  ['ic_unlock', 'unlock', S48, ['unlock']],
  ['ic_scene', 'scene', S48, ['act']],
  ['ic_cover', 'cover', S48, ['on', 'off']],
  ['ic_sensor', 'sensor', S48, ['sub']],
  ['ic_settings', 'settings', S48, ['sub']],
  ['ic_pending', 'pending', S48, ['act']],
  ['ic_fail', 'fail', S48, ['err']],
  ['ic_phone_off', 'phone_off', S48, ['err']],
  ['ic_ha_off', 'ha_off', S48, ['err']],
  ['ic_star', 'star', S48, ['sub']],
  ['ic_home', 'home', S48, ['act']],
  ['ic_sync_24', 'sync', S24, ['sub', 'act']],
  ['ic_phone_off_24', 'phone_off', S24, ['err']],
  ['ic_ha_off_24', 'ha_off', S24, ['err']],
  ['ic_check_24', 'check', { size: 24, draw: 24, stroke: 2.4 }, ['on', 'off', 'lock', 'unlock', 'act']],
];

/** Flat list of every PNG to produce: `<base>_<role>.png`. */
export const ICONS = TABLE.flatMap(([base, path, geo, roles]) =>
  roles.map((role) => ({
    file: `${base}_${role}.png`,
    path: PATHS[path],
    size: geo.size,
    draw: geo.draw,
    stroke: geo.stroke,
    color: PALETTE[role],
  })),
);

/** Lite budget: each icon must stay under 1 KB on disk. */
export const MAX_ICON_BYTES = 1024;
