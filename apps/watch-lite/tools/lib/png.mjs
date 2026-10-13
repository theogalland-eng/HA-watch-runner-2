// Tiny PNG codec (node:zlib only). Encodes single-colour icons as indexed PNG with transparency
// (PLTE + tRNS): one palette entry per coverage level, all the same RGB. Decodes any 8-bit PNG we
// produce (and reads the size of any PNG) for the tests and the size checks.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/**
 * @param size icon width = height
 * @param coverage Uint8Array (size²) of levels 0..maxLevel
 * @param maxLevel coverage value meaning "fully inked"
 * @param color '#RRGGBB'
 */
export function encodeIcon(size, coverage, maxLevel, color) {
  // Palette = the coverage levels actually used, sorted (index 0 = transparent background).
  const used = [...new Set(coverage)].sort((a, b) => a - b);
  if (used[0] !== 0) used.unshift(0);
  const indexOf = new Map(used.map((lvl, i) => [lvl, i]));
  const [r, g, b] = hexToRgb(color);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // colour type: indexed
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace

  const plte = Buffer.alloc(used.length * 3);
  const trns = Buffer.alloc(used.length);
  used.forEach((lvl, i) => {
    plte[i * 3] = r;
    plte[i * 3 + 1] = g;
    plte[i * 3 + 2] = b;
    trns[i] = Math.round((lvl * 255) / maxLevel);
  });

  const raw = Buffer.alloc(size * (size + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) raw[y * (size + 1) + 1 + x] = indexOf.get(coverage[y * size + x]);
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('tRNS', trns),
    chunk('IDAT', deflateSync(raw, { level: 9, memLevel: 9, strategy: 0 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function readChunks(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG');
  const chunks = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    chunks.push({ type, data: buf.subarray(off + 8, off + 8 + len) });
    off += 12 + len;
  }
  return chunks;
}

/** Width/height of any PNG (from IHDR). */
export function pngSize(buf) {
  const ihdr = readChunks(buf).find((c) => c.type === 'IHDR').data;
  return { width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4) };
}

/** Decodes an 8-bit PNG (indexed, grey, RGB, RGBA…) to RGBA. Enough for our icons and checks. */
export function decodeRgba(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const type = ihdr[9];
  if (depth !== 8 || ihdr[12] !== 0) throw new Error('Only 8-bit non-interlaced PNG supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const plte = chunks.find((c) => c.type === 'PLTE')?.data;
  const trns = chunks.find((c) => c.type === 'tRNS')?.data;
  const data = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));

  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = data[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const raw = data[y * (stride + 1) + 1 + x];
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let v;
      if (f === 0) v = raw;
      else if (f === 1) v = raw + a;
      else if (f === 2) v = raw + b;
      else if (f === 3) v = raw + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      pixels[y * stride + x] = v & 0xff;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let px;
    if (type === 3) {
      const idx = pixels[i];
      px = [plte[idx * 3], plte[idx * 3 + 1], plte[idx * 3 + 2], trns && idx < trns.length ? trns[idx] : 255];
    } else if (type === 0) px = [pixels[i], pixels[i], pixels[i], 255];
    else if (type === 4) px = [pixels[i * 2], pixels[i * 2], pixels[i * 2], pixels[i * 2 + 1]];
    else if (type === 2) px = [pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2], 255];
    else px = [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2], pixels[i * 4 + 3]];
    rgba.set(px, i * 4);
  }
  return { width, height, rgba };
}
