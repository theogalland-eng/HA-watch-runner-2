// Demo settings, read only by the Wear Engine stub (common/services/wearengine.js), i.e. in the DevEco
// Previewer/simulator. With Huawei's real wearengine.js this file is not in the build.
// Change a value and reload the preview to reproduce each design screen (docs/design/watch-lite/):
//   favorites: 5 | 10 | 0       5 = dashboard, 10 = long list variant, 0 = "Aucun favori" (5d)
//   network: 'ok' | 'ha' | 'tel'  'ha' = HA unreachable (5c), 'tel' = phone not connected (5b)
//   cache: true | false         true = read the file cache (kept from the previous run); false = start
//                               without it (full-screen errors 5b/5c on a failed sync)
//   latency: 0 | ms             0 = the prototype's delays; e.g. 4000 = every reply takes 4 s ("en cours" visible)
//   trace: false | true         true = one line per redraw in the log ("[ha] paint list r0=… r1=…")
export var DEV = { favorites: 5, network: 'ok', cache: true, latency: 0, trace: false };
