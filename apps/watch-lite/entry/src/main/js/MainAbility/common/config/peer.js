// The companion this watch app talks to: package + SHA-256 of its signing certificate (no colons).
// Same values as `supportLists` in config.json (checked by a test). Debug key for now: change both
// for a release-signed companion (apps/watch-lite/README.md § Identifiers).
export var PEER = {
    pkg: 'io.github.theogallandeng.hawatchcompanion',
    fingerprint: '0086FAF43D2D8B06E39F93614DE0868BCD61628720394C11FDCE4DC506D29667'
};
