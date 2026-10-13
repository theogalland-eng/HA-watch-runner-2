// What the lite JS UI framework accepts (OpenHarmony arkui-js-lite reference: common styles,
// container + text styles, selectors, components, universal events). Animations are left out on
// purpose (design: "aucune animation").

export const CSS_PROPS = new Set([
  'width', 'height', 'padding', 'padding-left', 'padding-top', 'padding-right', 'padding-bottom',
  'margin', 'margin-left', 'margin-top', 'margin-right', 'margin-bottom', 'border-width', 'border-color',
  'border-radius', 'background-color', 'background-image', 'opacity', 'display', 'left', 'top',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
  'color', 'font-size', 'letter-spacing', 'text-align', 'text-overflow', 'font-family', 'line-height',
]);

/** Smallest round screen the app must fit: the DevEco Previewer (454 px; the Runner 2 is 466). */
export const MAX_SIZE_PX = 454;

export const HML_TAGS = new Set([
  'div', 'list', 'list-item', 'stack', 'swiper', 'text', 'image', 'input', 'progress', 'marquee',
  'slider', 'switch', 'picker-view', 'chart', 'canvas', 'qrcode', 'image-animator',
]);

export const HML_EVENTS = new Set(['click', 'longpress', 'swipe', 'scrollend', 'scrolltop', 'scrollbottom', 'change']);

/**
 * Problems in a lite CSS file: unsupported selectors (only .class, #id, :active, :checked) or
 * properties. Limitation: `:active` / `:checked` are accepted on any class here, but lite only
 * honours them on `input[type=button]` (resp. checkbox/radio), for background-color/image only.
 */
export function cssProblems(text) {
  const problems = [];
  // @import statements have no block: drop them, or they would glue onto the next selector.
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '');
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1].trim();
    if (selector.startsWith('@')) continue;
    for (const sel of selector.split(',').map((s) => s.trim())) {
      if (!/^[.#][\w-]+(:(active|checked))?$/.test(sel)) problems.push(`selector "${sel}" not supported on lite (only .class, #id, :active, :checked)`);
    }
    for (const decl of block[2].split(';')) {
      const prop = decl.split(':')[0].trim();
      if (prop && !CSS_PROPS.has(prop)) problems.push(`CSS property "${prop}" not supported on lite`);
      const px = /^\s*(\d+(?:\.\d+)?)px\s*$/.exec(decl.slice(decl.indexOf(':') + 1));
      if ((prop === 'width' || prop === 'height') && px && Number(px[1]) > MAX_SIZE_PX) {
        problems.push(`${sel0(selector)} ${prop}: ${px[1]}px is larger than the smallest screen (${MAX_SIZE_PX} px, DevEco Previewer): use 100% and centre by alignment`);
      }
    }
  }
  return problems;
}

function sel0(selector) {
  return selector.split(',')[0].trim();
}

/** Problems in a lite HML file: unknown components or events (no touch events on lite). */
export function hmlProblems(text) {
  const problems = [];
  const hml = text.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of hml.matchAll(/<([a-z][\w-]*)([^>]*)>/g)) {
    if (!HML_TAGS.has(m[1])) problems.push(`<${m[1]}> is not a lite component`);
    for (const ev of m[2].matchAll(/(?:on:|@|\bon)([a-z]+)(?:\.\w+)?=/g)) {
      if (!HML_EVENTS.has(ev[1])) problems.push(`event "${ev[1]}" on <${m[1]}> not supported on lite`);
    }
  }
  return problems;
}
