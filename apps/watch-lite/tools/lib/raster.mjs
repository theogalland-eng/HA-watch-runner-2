// Stroke rasteriser: a sample is inked when its distance to any path segment is ≤ half the stroke
// width. That yields round caps and round joins, as in the design (stroke-linecap/linejoin: round).
import { flattenPath } from './path.mjs';

/** Supersampling grid per pixel axis: coverage has SS² + 1 levels. */
export const SS = 4;

/**
 * Renders one icon to a coverage map: Uint8Array of `size * size` values in 0..SS².
 * `draw` is the drawn size of the 24-unit viewBox, centred in `size`; `stroke` is in viewBox units.
 */
export function rasterize({ path, size, draw, stroke }) {
  const scale = draw / 24;
  const offset = (size - draw) / 2;
  const half = (stroke * scale) / 2;
  const half2 = half * half;

  const segs = [];
  for (const poly of flattenPath(path)) {
    for (let i = 1; i < poly.length; i++) {
      const ax = offset + poly[i - 1][0] * scale;
      const ay = offset + poly[i - 1][1] * scale;
      const bx = offset + poly[i][0] * scale;
      const by = offset + poly[i][1] * scale;
      segs.push({
        ax, ay, bx, by,
        dx: bx - ax,
        dy: by - ay,
        len2: (bx - ax) ** 2 + (by - ay) ** 2,
        minX: Math.min(ax, bx) - half,
        maxX: Math.max(ax, bx) + half,
        minY: Math.min(ay, by) - half,
        maxY: Math.max(ay, by) + half,
      });
    }
  }

  const out = new Uint8Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        const y = py + (sy + 0.5) / SS;
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          for (const s of segs) {
            if (x < s.minX || x > s.maxX || y < s.minY || y > s.maxY) continue;
            let t = s.len2 === 0 ? 0 : ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.len2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = s.ax + t * s.dx - x;
            const qy = s.ay + t * s.dy - y;
            if (qx * qx + qy * qy <= half2) {
              hits++;
              break;
            }
          }
        }
      }
      out[py * size + px] = hits;
    }
  }
  return out;
}
