// Minimal SVG path → polylines (M L H V C S Q T A Z, absolute and relative). No dependency.
// Curves and arcs are flattened finely enough for icons drawn at ≤ 48 px.

const PARAMS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function reader(d) {
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
  };
  return {
    done() {
      skip();
      return i >= d.length;
    },
    peekCommand() {
      skip();
      return /[a-zA-Z]/.test(d[i] || '') ? d[i] : null;
    },
    command() {
      skip();
      return d[i++];
    },
    number() {
      skip();
      const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(d.slice(i));
      if (!m) throw new Error(`Bad number at ${i} in path: ${d}`);
      i += m[0].length;
      return parseFloat(m[0]);
    },
    flag() {
      skip();
      const c = d[i++];
      if (c !== '0' && c !== '1') throw new Error(`Bad arc flag at ${i - 1} in path: ${d}`);
      return c === '1';
    },
  };
}

function cubic(out, p0, p1, p2, p3, n = 16) {
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

function quadratic(out, p0, p1, p2, n = 12) {
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
}

// SVG spec, appendix F.6.5: endpoint → centre parameterisation.
function arc(out, p0, rx, ry, phiDeg, largeArc, sweep, p1) {
  if (p0[0] === p1[0] && p0[1] === p1[1]) return;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) {
    out.push([p1[0], p1[1]]);
    return;
  }
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2;
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;
  const angle = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dTheta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  const n = Math.max(4, Math.ceil(Math.abs(dTheta) / (Math.PI / 32)));
  for (let k = 1; k <= n; k++) {
    const t = theta1 + (dTheta * k) / n;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  out[out.length - 1] = [p1[0], p1[1]]; // land exactly on the endpoint
}

/** Returns subpaths as arrays of [x, y] points (polylines), in path coordinates. */
export function flattenPath(d) {
  const r = reader(d);
  const subpaths = [];
  let pts = null;
  let cur = [0, 0];
  let start = [0, 0];
  let lastCtrl = null; // for S/T reflection
  let lastCmd = '';
  let cmd = null;

  while (!r.done()) {
    const next = r.peekCommand();
    if (next) {
      cmd = r.command();
    } else if (!cmd) {
      throw new Error(`Path must start with a command: ${d}`);
    } else if (cmd === 'M') {
      cmd = 'L'; // implicit lineto after moveto
    } else if (cmd === 'm') {
      cmd = 'l';
    }
    const C = cmd.toUpperCase();
    if (!(C in PARAMS)) throw new Error(`Unsupported command ${cmd}`);
    const rel = cmd !== C;
    const ox = rel ? cur[0] : 0;
    const oy = rel ? cur[1] : 0;

    switch (C) {
      case 'M': {
        cur = [ox + r.number(), oy + r.number()];
        start = cur;
        pts = [cur];
        subpaths.push(pts);
        lastCtrl = null;
        break;
      }
      case 'L': {
        cur = [ox + r.number(), oy + r.number()];
        pts.push(cur);
        lastCtrl = null;
        break;
      }
      case 'H': {
        cur = [(rel ? cur[0] : 0) + r.number(), cur[1]];
        pts.push(cur);
        lastCtrl = null;
        break;
      }
      case 'V': {
        cur = [cur[0], (rel ? cur[1] : 0) + r.number()];
        pts.push(cur);
        lastCtrl = null;
        break;
      }
      case 'C': {
        const c1 = [ox + r.number(), oy + r.number()];
        const c2 = [ox + r.number(), oy + r.number()];
        const end = [ox + r.number(), oy + r.number()];
        cubic(pts, cur, c1, c2, end);
        lastCtrl = c2;
        cur = end;
        break;
      }
      case 'S': {
        const c1 = lastCtrl && /[CcSs]/.test(lastCmd) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
        const c2 = [ox + r.number(), oy + r.number()];
        const end = [ox + r.number(), oy + r.number()];
        cubic(pts, cur, c1, c2, end);
        lastCtrl = c2;
        cur = end;
        break;
      }
      case 'Q': {
        const c = [ox + r.number(), oy + r.number()];
        const end = [ox + r.number(), oy + r.number()];
        quadratic(pts, cur, c, end);
        lastCtrl = c;
        cur = end;
        break;
      }
      case 'T': {
        const c = lastCtrl && /[QqTt]/.test(lastCmd) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
        const end = [ox + r.number(), oy + r.number()];
        quadratic(pts, cur, c, end);
        lastCtrl = c;
        cur = end;
        break;
      }
      case 'A': {
        const rx = r.number();
        const ry = r.number();
        const rot = r.number();
        const large = r.flag();
        const sweep = r.flag();
        const end = [ox + r.number(), oy + r.number()];
        arc(pts, cur, rx, ry, rot, large, sweep, end);
        cur = end;
        lastCtrl = null;
        break;
      }
      case 'Z': {
        pts.push(start);
        cur = start;
        pts = [cur];
        subpaths.push(pts);
        lastCtrl = null;
        break;
      }
      default:
        break;
    }
    lastCmd = cmd;
  }
  return subpaths.filter((p) => p.length > 1);
}
