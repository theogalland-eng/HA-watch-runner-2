// Demo settings for Mock mode (DevEco previewer/simulator, where Wear Engine is unavailable).
// Change a value and reload the preview to reproduce each design screen (docs/design/watch-lite/):
//   favorites: 5 | 10 | 0       5 = dashboard, 10 = long list variant, 0 = "Aucun favori" (5d)
//   network: 'ok' | 'ha' | 'tel'  'ha' = HA unreachable (5c), 'tel' = phone not connected (5b)
//   cache: true | false         true = launch with a 3-min-old cache; false = first launch (full-screen errors)
export var DEV = { favorites: 5, network: 'ok', cache: true };
