// Page size as the watch sees it: comments never reach the device (the lite toolchain compiles
// HML/CSS/JS), so the page limits apply to the source without comments. The raw size and the size
// without comments or indentation are reported next to it.

// JS without line and block comments; strings and regex literals are kept intact (ES5: no template
// literals).
export function stripJsComments(src) {
  let out = '';
  let i = 0;
  let prev = ''; // last significant character, to tell a regex literal from a division
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      prev = c;
      i = j + 1;
    } else if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
    } else if (c === '/' && (prev === '' || '(,=:[!&|?{};'.includes(prev))) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== '\n' && (inClass || src[j] !== '/')) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        j++;
      }
      out += src.slice(i, j + 1);
      prev = '/';
      i = j + 1;
    } else {
      out += c;
      if (!/\s/.test(c)) prev = c;
      i++;
    }
  }
  return out;
}

/** Source without comments, by file type (.js, .css, .hml). */
export function stripComments(text, ext) {
  if (ext === '.js') return stripJsComments(text);
  if (ext === '.css') return text.replace(/\/\*[\s\S]*?\*\//g, '');
  if (ext === '.hml') return text.replace(/<!--[\s\S]*?-->/g, '');
  return text;
}

/** Without comments, each line trimmed, blank lines dropped. */
export function tighten(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

/** { raw, code, tight } byte sizes of one source file. */
export function sourceSizes(text, ext) {
  const code = stripComments(text, ext);
  return { raw: Buffer.byteLength(text), code: Buffer.byteLength(code), tight: Buffer.byteLength(tighten(code)) };
}
