// Tiny templating + shared visual primitives (icons, pen marks).
// Everything interpolated into html`` is escaped unless it is itself html``/raw().

import { escapeHTML } from "./store.js";

class SafeHTML {
  constructor(value) {
    this.__html = value;
  }
  toString() {
    return this.__html;
  }
}

const isSafe = (v) => v instanceof SafeHTML;

function stringify(value) {
  if (value === null || value === undefined || value === false) return "";
  if (isSafe(value)) return value.__html;
  if (Array.isArray(value)) return value.map(stringify).join("");
  return escapeHTML(value);
}

/** Tagged template that escapes interpolations. Nest html`` freely; arrays are joined. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += stringify(values[i]) + strings[i + 1];
  return new SafeHTML(out);
}

/** Mark a trusted string as HTML. Never pass user/content strings to this. */
export const raw = (str) => new SafeHTML(String(str ?? ""));

/** Render html`` into an element (replaces its children). */
export function render(target, tpl) {
  target.innerHTML = stringify(tpl);
  return target;
}

/** Build a single element from html``. */
export function el(tpl) {
  const t = document.createElement("template");
  t.innerHTML = stringify(tpl).trim();
  return t.content.firstElementChild;
}

/** Text with line breaks: escapes and turns \n into <br>. */
export const lines = (text) => raw(escapeHTML(text).replace(/\n/g, "<br>"));

/** Paragraphs: blank lines split paragraphs, single newlines become <br>. */
export const paragraphs = (text) =>
  raw(
    String(text || "")
      .split(/\n{2,}/)
      .filter((p) => p.trim())
      .map((p) => `<p>${escapeHTML(p.trim()).replace(/\n/g, "<br>")}</p>`)
      .join("")
  );

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ icons
   One consistent hand-tuned set: 24px grid, 1.5 stroke, round caps. Add here rather than inline. */

const ICONS = {
  "arrow-right": '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
  "arrow-left": '<path d="M20 12H5"/><path d="M11 6l-6 6 6 6"/>',
  "arrow-up-right": '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>',
  "arrow-down": '<path d="M12 4v15"/><path d="M6 13l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4.5 12.5l4.5 4.5L19.5 7"/>',
  menu: '<path d="M4 8h16M4 16h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 005.5 5.5l1.5-2 4 1.5v3a2 2 0 01-2 2A16 16 0 014.5 5.5a2 2 0 012-2z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M4 7l8 6 8-6"/>',
  whatsapp:
    '<path d="M4.5 19.5l1.2-3.6A8 8 0 1110 19.2a8 8 0 01-2.9-.6z"/><path d="M9.2 8.6c.2-.4.5-.5.8-.5h.5c.2 0 .4.1.5.4l.6 1.4c.1.2 0 .5-.1.6l-.5.6a5 5 0 002.4 2.3l.6-.5c.2-.2.4-.2.6-.1l1.4.6c.3.1.4.3.4.5v.5c0 .4-.2.7-.6.9-.6.3-1.4.4-2.4 0a8 8 0 01-4.2-4.2c-.3-.9-.2-1.6.1-2.1z"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  download: '<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M4.5 19.5h15"/>',
  upload: '<path d="M12 16V5"/><path d="M7 9.5l5-5 5 5"/><path d="M4.5 19.5h15"/>',
  external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5L11 13"/><path d="M17 14v4.5a1 1 0 01-1 1H5.5a1 1 0 01-1-1V8a1 1 0 011-1H10"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  book: '<path d="M4.5 5.5A2 2 0 016.5 3.5H19v15H6.5a2 2 0 00-2 2z"/><path d="M4.5 20.5v-15"/><path d="M8.5 7.5h6"/>',
  paper: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8.5h5"/><path d="M9 12.5h7M9 16h5"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0115 0"/>',
  users: '<circle cx="9" cy="9" r="3.3"/><path d="M3 19.5a6 6 0 0112 0"/><path d="M15.5 6a3.2 3.2 0 010 6.2M17.5 14.2a6 6 0 013.5 5.3"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  "eye-off": '<path d="M4 4l16 16"/><path d="M9.9 6A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16.8 16.8 0 01-2.7 3.4M6.4 7.7A16.4 16.4 0 002.5 12s3.5 6.5 9.5 6.5a9.4 9.4 0 004.4-1.1"/><path d="M10 10.1a2.8 2.8 0 003.9 3.9"/>',
  edit: '<path d="M4.5 19.5l1-4L16 5a2.1 2.1 0 013 3L8.5 18.5z"/><path d="M14 7l3 3"/>',
  trash: '<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5V5.5a1 1 0 00-1-1h-9a1 1 0 00-1 1v9a1 1 0 001 1h3"/>',
  drag: '<circle cx="9" cy="6.5" r=".9"/><circle cx="15" cy="6.5" r=".9"/><circle cx="9" cy="12" r=".9"/><circle cx="15" cy="12" r=".9"/><circle cx="9" cy="17.5" r=".9"/><circle cx="15" cy="17.5" r=".9"/>',
  github:
    '<path d="M9 19.5c-4.3 1.4-4.3-2.3-6-2.8m12 5.3v-3.5a3 3 0 00-.9-2.4c2.9-.3 6-1.4 6-6.4a5 5 0 00-1.4-3.5 4.6 4.6 0 00-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 00-6.5 0C6 2.4 4.9 2.7 4.9 2.7a4.6 4.6 0 00-.1 3.5 5 5 0 00-1.4 3.5c0 5 3.1 6.1 6 6.4a3 3 0 00-.9 2.4V22"/>',
  logout: '<path d="M14.5 4.5h4a1 1 0 011 1v13a1 1 0 01-1 1h-4"/><path d="M10 16.5L5.5 12 10 7.5"/><path d="M5.5 12H15"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".9"/><circle cx="4.8" cy="12" r=".9"/><circle cx="4.8" cy="17.5" r=".9"/>',
  inbox: '<path d="M3.5 13.5l2.5-8h12l2.5 8v5a1 1 0 01-1 1h-15a1 1 0 01-1-1z"/><path d="M3.5 13.5h5a3.5 3.5 0 007 0h5"/>',
  quote: '<path d="M10 7.5c-3 .8-4.5 3-4.5 6.5v3h4.5v-4.5H7.5M18.5 7.5c-3 .8-4.5 3-4.5 6.5v3h4.5v-4.5H16"/>',
  sparkle: '<path d="M12 4v16M4 12h16"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5z"/>',
  video: '<rect x="3.5" y="6.5" width="12.5" height="11" rx="1.5"/><path d="M16 10.5l4.5-2.5v8L16 13.5"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V20H4z"/><path d="M10 20v-5.5h4V20"/>',
  chart: '<path d="M4.5 19.5h15"/><path d="M7.5 16v-5M12 16V7.5M16.5 16v-3"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 01-13 5.1M4.5 12a7.5 7.5 0 0113-5.1"/><path d="M17.5 3.5v3.5H14M6.5 20.5V17H10"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>',
  "chevron-down": '<path d="M6 9.5l6 6 6-6"/>',
  "chevron-right": '<path d="M9.5 6l6 6-6 6"/>',
  facebook: '<path d="M14 8.5h2.5V5H14a3.5 3.5 0 00-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5L17 11h-3V9a.5.5 0 01.5-.5z"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.2" r=".7"/>',
  youtube: '<rect x="2.5" y="6" width="19" height="12" rx="3.5"/><path d="M10.5 9.5v5l4.3-2.5z"/>',
  tiktok: '<path d="M14 4v10.5a3.5 3.5 0 11-3.5-3.5"/><path d="M14 4c.4 2.6 2 4.2 4.5 4.5"/>',
};

/**
 * Inline SVG icon. icon("arrow-right", { size: 18, label: "Next" })
 * Without a label the icon is aria-hidden (use it next to visible text).
 */
export function icon(name, { size = 20, label = "", cls = "" } = {}) {
  const body = ICONS[name] || ICONS.plus;
  const a11y = label ? `role="img" aria-label="${escapeHTML(label)}"` : 'aria-hidden="true" focusable="false"';
  return raw(
    `<svg class="icon icon--${name}${cls ? ` ${escapeHTML(cls)}` : ""}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`
  );
}

export const ICON_NAMES = Object.keys(ICONS);

/* ------------------------------------------------------------------ pen marks
   Hand-drawn correction-pen strokes. Paths carry data-draw so motion.js animates them in. */

/** Wavy underline that sits under a word. Wrap the word: <span class="pen-mark">word${penUnderline()}</span> */
export function penUnderline({ cls = "" } = {}) {
  return raw(
    `<svg class="pen pen--underline${cls ? ` ${escapeHTML(cls)}` : ""}" viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path data-draw d="M3 15.5C48 9 92 7.5 140 9.5c46 2 98 1 154-5.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/><path data-draw d="M22 20.5c58-5.5 128-7 238-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity=".85"/></svg>`
  );
}

/** Loose ellipse drawn around a word or number. */
export function penCircle({ cls = "" } = {}) {
  return raw(
    `<svg class="pen pen--circle${cls ? ` ${escapeHTML(cls)}` : ""}" viewBox="0 0 240 80" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path data-draw d="M42 14C88 2 176 3 214 21c30 15 14 42-38 50-56 9-128 6-160-14C-6 43 14 20 60 10c26-5 58-6 86-4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`
  );
}

/** Marking tick, as on a corrected exam paper. */
export function penTick({ cls = "" } = {}) {
  return raw(
    `<svg class="pen pen--tick${cls ? ` ${escapeHTML(cls)}` : ""}" viewBox="0 0 40 32" aria-hidden="true" focusable="false"><path data-draw d="M3 17c4 3 8 7 11 12C19 18 27 8 37 3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
}

/** Hand-drawn arrow, for annotations in the margin. */
export function penArrow({ cls = "" } = {}) {
  return raw(
    `<svg class="pen pen--arrow${cls ? ` ${escapeHTML(cls)}` : ""}" viewBox="0 0 120 60" aria-hidden="true" focusable="false"><path data-draw d="M4 50C30 48 66 38 104 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path data-draw d="M86 10l19 1-4 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
}

/**
 * Wrap the first occurrence of `word` in `text` with a red-pen underline.
 * Returns html``; text is escaped. Newlines in text become line breaks (<br>).
 */
export function highlightWord(text, word, mark = penUnderline) {
  const t = String(text || "");
  const w = String(word || "").trim();
  const idx = w ? t.toLowerCase().indexOf(w.toLowerCase()) : -1;
  const br = (s) => raw(escapeHTML(s).replace(/\n/g, "<br>"));
  if (idx < 0) return br(t);
  return html`${br(t.slice(0, idx))}<span class="pen-mark">${t.slice(idx, idx + w.length)}${mark()}</span>${br(t.slice(idx + w.length))}`;
}
