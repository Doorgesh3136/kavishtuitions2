// Schema-driven form fields: render, read, validate. Used by drawers and by the page-level forms.
//
// A field: { key, label, type, required, hint, placeholder, width: "half"|"third", ...type options }
// Types: text, email, password, textarea, number, select, toggle, list (variant "lines"|"tags"),
//        url, image, time, checks, choices (quiz options + correct answer).
// `key` may be a dotted path ("site.social.facebook"). A field may define get(item)/set(item, value).

import { html, raw, icon } from "../../assets/js/ui.js";
import * as store from "../../assets/js/store.js";
import { nextId, $$, debounce, reduced } from "./dom.js";

/* ------------------------------------------------------------------ paths */

export function getPath(obj, path) {
  return String(path)
    .split(".")
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const ks = String(path).split(".");
  let o = obj;
  for (const k of ks.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== "object") o[k] = {};
    o = o[k];
  }
  o[ks[ks.length - 1]] = value;
}

export const valueOf = (field, item) => (field.get ? field.get(item) : getPath(item, field.key));
export const applyValue = (field, item, v) => (field.set ? field.set(item, v) : setPath(item, field.key, v));

/* ------------------------------------------------------------------ options */

const isEntry = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const entries = (v) => (Array.isArray(v) ? v.filter(isEntry) : []);

/** A list field's value as a list of strings: a lone string counts as one entry, blanks are dropped. */
export const asLines = (v) =>
  (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : [])
    .filter((x) => x != null && typeof x !== "object" && String(x).trim() !== "")
    .map((x) => String(x));

const SOURCES = {
  levels: (c) => entries(c.levels).map((l) => ({ value: l.id, label: l.exam ? `${l.name} (${String(l.exam).split(" ·")[0]})` : l.name })),
  categories: (c) => entries(c.categories).map((x) => ({ value: x.id, label: x.name })),
  tutors: (c) => entries(c.tutors).map((t) => ({ value: t.id, label: t.name })),
  courses: (c) =>
    entries(c.courses).map((x) => ({
      value: x.id,
      label: `${x.code ? `${x.code} · ` : ""}${x.title || x.id} — ${store.levelName(c, x.level)}`,
      group: store.levelName(c, x.level),
    })),
  days: () => store.DAYS.map((d) => ({ value: d.id, label: d.name })),
};

export function resolveOptions(field, content) {
  const o = typeof field.options === "function" ? field.options(content) : field.options;
  if (typeof o === "string") return SOURCES[o] ? SOURCES[o](content) : [];
  return (o || []).map((x) => (typeof x === "string" ? { value: x, label: x } : x));
}

/* ------------------------------------------------------------------ rendering */

const cls = (...xs) => xs.filter(Boolean).join(" ");

function labelFor(field, id) {
  return html`<label class="f__label" for="${id}"><span>${field.label}</span>${field.required ? html`<span class="f__req">required</span>` : field.optional ? html`<span class="f__opt">optional</span>` : ""}</label>`;
}
function labelText(field, id) {
  return html`<p class="f__label" id="${id}-label"><span>${field.label}</span>${field.required ? html`<span class="f__req">required</span>` : field.optional ? html`<span class="f__opt">optional</span>` : ""}</p>`;
}

function attrs(field, id, describedBy) {
  return raw(
    [
      `id="${id}"`,
      `name="${store.escapeHTML(field.key)}"`,
      describedBy ? `aria-describedby="${describedBy}"` : "",
      field.placeholder ? `placeholder="${store.escapeHTML(field.placeholder)}"` : "",
      field.required ? 'aria-required="true"' : "",
      field.autocomplete ? `autocomplete="${store.escapeHTML(field.autocomplete)}"` : 'autocomplete="off"',
      field.maxlength ? `maxlength="${field.maxlength}"` : "",
      field.spellcheck === false ? 'spellcheck="false"' : "",
      field.autofocus ? "data-autofocus" : "",
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function lineItem(field, value, i) {
  const n = i + 1;
  const what = field.itemLabel || "line";
  return html`<li class="f-lines__item">
    <span class="f-lines__n" aria-hidden="true">${String(n).padStart(2, "0")}</span>
    <input class="a-input" type="text" value="${value}" aria-label="${`${what[0].toUpperCase()}${what.slice(1)} ${n}`}" placeholder="${field.itemPlaceholder || ""}" autocomplete="off" />
    <button type="button" class="icon-btn icon-btn--sm" data-line="remove" aria-label="${`Remove ${what} ${n}`}">${icon("close", { size: 16 })}</button>
  </li>`;
}

function tagItem(value) {
  return html`<li class="f-tag"><span class="f-tag__text">${value}</span><button type="button" class="f-tag__x" data-tag="remove" aria-label="${`Remove ${value}`}">${icon("close", { size: 14 })}</button></li>`;
}

const LETTERS = "ABCDEF";
function choiceItem(name, value, i, checked) {
  const L = LETTERS[i] || String(i + 1);
  return html`<li class="f-choice">
    <label class="f-choice__mark" title="Mark as the correct answer">
      <input type="radio" name="${name}" value="${i}" ${checked ? raw("checked") : ""} />
      <span class="f-choice__letter" aria-hidden="true">${L}</span>
      <span class="sr-only">${`Option ${L} is the correct answer`}</span>
    </label>
    <input class="a-input" type="text" value="${value}" aria-label="${`Option ${L}`}" autocomplete="off" />
    <button type="button" class="icon-btn icon-btn--sm" data-choice="remove" aria-label="${`Remove option ${L}`}">${icon("close", { size: 16 })}</button>
  </li>`;
}

export function renderField(field, item, content) {
  const id = nextId("f");
  const hintId = field.hint ? `${id}-hint` : "";
  const errId = `${id}-err`;
  const describedBy = [hintId, errId].filter(Boolean).join(" ");
  const value = valueOf(field, item);
  const type = field.type || "text";
  let control;
  let label = labelFor(field, id);

  switch (type) {
    case "textarea": {
      const v = value == null ? "" : String(value);
      control = html`<textarea class="a-input a-textarea${field.mono ? " a-input--mono" : ""}" rows="${field.rows || 3}" ${attrs(field, id, describedBy)} data-autosize>${v}</textarea>
        ${field.counter ? html`<span class="f__count${v.length > field.counter ? " is-over" : ""}" data-count-for="${id}" aria-hidden="true">${v.length} / ${field.counter}</span>` : ""}`;
      break;
    }
    case "number": {
      const v = value == null || value === "" ? "" : String(value);
      const input = html`<input class="a-input a-input--num" type="number" inputmode="${field.integer ? "numeric" : "decimal"}" value="${v}" ${field.min != null ? raw(`min="${field.min}"`) : ""} ${field.max != null ? raw(`max="${field.max}"`) : ""} step="${field.step || (field.integer ? 1 : "any")}" ${attrs(field, id, describedBy)} />`;
      control = field.prefix || field.suffix
        ? html`<div class="a-affix">${field.prefix ? html`<span class="a-affix__pre">${field.prefix}</span>` : ""}${input}${field.suffix ? html`<span class="a-affix__suf">${field.suffix}</span>` : ""}</div>`
        : input;
      break;
    }
    case "select": {
      const opts = resolveOptions(field, content);
      const v = value == null ? "" : String(value);
      const known = opts.some((o) => String(o.value) === v);
      const groups = [...new Set(opts.map((o) => o.group).filter(Boolean))];
      const optionTags = (list) => list.map((o) => html`<option value="${o.value}" ${String(o.value) === v ? raw("selected") : ""}>${o.label}</option>`);
      control = html`<div class="a-select-wrap"><select class="a-input a-select" ${attrs(field, id, describedBy)}>
        ${field.allowEmpty || !known ? html`<option value="" ${v === "" || !known ? raw("selected") : ""}>${field.emptyLabel || "— None —"}</option>` : ""}
        ${!known && v ? html`<option value="${v}" selected>${`${v} (missing)`}</option>` : ""}
        ${groups.length > 1 ? groups.map((g) => html`<optgroup label="${g}">${optionTags(opts.filter((o) => o.group === g))}</optgroup>`) : optionTags(opts)}
      </select>${icon("chevron-down", { size: 16, cls: "a-select__chev" })}</div>`;
      break;
    }
    case "toggle": {
      const on = !!value;
      label = "";
      control = html`<button type="button" class="switch" role="switch" id="${id}" aria-checked="${on ? "true" : "false"}" ${describedBy ? raw(`aria-describedby="${describedBy}"`) : ""}>
        <span class="switch__track" aria-hidden="true"><span class="switch__thumb"></span></span>
        <span class="switch__label">${field.label}</span>
        ${field.onText ? html`<span class="switch__state" aria-hidden="true" data-on="${field.onText}" data-off="${field.offText || ""}">${on ? field.onText : field.offText || ""}</span>` : ""}
      </button>`;
      break;
    }
    case "list": {
      const list = asLines(value);
      label = labelText(field, id);
      if (field.variant === "tags") {
        control = html`<div class="f-tags" data-tags role="group" aria-labelledby="${id}-label" ${describedBy ? raw(`aria-describedby="${describedBy}"`) : ""}>
          <ul class="f-tags__list">${list.map((v) => tagItem(v))}</ul>
          <input class="f-tags__input" type="text" id="${id}" placeholder="${field.placeholder || "Type and press Enter"}" aria-label="${`Add to ${field.label}`}" autocomplete="off" />
        </div>`;
      } else {
        control = html`<div class="f-lines" data-lines role="group" aria-labelledby="${id}-label" ${describedBy ? raw(`aria-describedby="${describedBy}"`) : ""}>
          <ol class="f-lines__list">${list.map((v, i) => lineItem(field, v, i))}</ol>
          <button type="button" class="a-btn a-btn--quiet a-btn--xs" data-line="add">${icon("plus", { size: 16 })}<span>${`Add ${field.itemLabel || "line"}`}</span></button>
        </div>`;
      }
      break;
    }
    case "checks": {
      const opts = resolveOptions(field, content);
      const set = new Set(Array.isArray(value) ? value : []);
      label = labelText(field, id);
      control = html`<div class="f-checks" role="group" aria-labelledby="${id}-label" ${describedBy ? raw(`aria-describedby="${describedBy}"`) : ""}>
        ${opts.map((o) => html`<label class="f-check"><input type="checkbox" value="${o.value}" ${set.has(o.value) ? raw("checked") : ""} /><span class="f-check__box" aria-hidden="true">${icon("check", { size: 14 })}</span><span class="f-check__label">${o.label}</span></label>`)}
        ${opts.length ? "" : html`<p class="f__hint">Nothing to choose from yet.</p>`}
      </div>`;
      break;
    }
    case "choices": {
      const v = value || { options: [], answer: 0 };
      const opts = Array.isArray(v.options) && v.options.length ? v.options.map((o) => (o == null || typeof o === "object" ? "" : String(o))) : ["", ""];
      const name = `${id}-correct`;
      label = labelText(field, id);
      control = html`<fieldset class="f-choices" data-choices aria-labelledby="${id}-label" ${describedBy ? raw(`aria-describedby="${describedBy}"`) : ""}>
        <p class="f-choices__head" aria-hidden="true"><span>Correct</span><span>Option text</span></p>
        <ol class="f-choices__list">${opts.map((o, i) => choiceItem(name, o, i, i === Number(v.answer)))}</ol>
        <button type="button" class="a-btn a-btn--quiet a-btn--xs" data-choice="add">${icon("plus", { size: 16 })}<span>Add option</span></button>
      </fieldset>`;
      break;
    }
    case "image": {
      const v = value || "";
      control = html`<div class="f-image">
        <input class="a-input" type="text" inputmode="url" value="${v}" ${attrs(field, id, describedBy)} spellcheck="false" />
        <figure class="f-image__preview" data-image-preview aria-hidden="true">
          <img alt="" ${v ? raw(`src="${store.escapeHTML(store.safeUrl(v))}"`) : raw("hidden")} />
          <span class="f-image__empty" ${v ? raw("hidden") : ""}>${field.emptyPreview || "No image"}</span>
          <span class="f-image__broken" hidden>Couldn't load this image</span>
        </figure>
      </div>`;
      break;
    }
    case "url": {
      const v = value || "";
      const href = store.safeUrl(v);
      const ext = /^https?:\/\//i.test(href);
      control = html`<div class="f-url">
        <input class="a-input" type="text" inputmode="url" value="${v}" ${attrs(field, id, describedBy)} spellcheck="false" />
        <a class="f-url__test" href="${ext ? href : "#"}" target="_blank" rel="noopener noreferrer" ${ext ? "" : raw("hidden")}>Open ${icon("arrow-up-right", { size: 14 })}</a>
      </div>`;
      break;
    }
    case "password": {
      control = html`<div class="f-pass">
        <input class="a-input" type="password" value="${value || ""}" ${attrs(field, id, describedBy)} spellcheck="false" />
        <button type="button" class="f-pass__toggle" data-reveal aria-pressed="false" aria-controls="${id}">Show</button>
      </div>`;
      break;
    }
    case "time": {
      control = html`<input class="a-input a-input--num" type="time" step="300" value="${value || ""}" ${attrs(field, id, describedBy)} />`;
      break;
    }
    default: {
      const v = value == null ? "" : String(value);
      const t = type === "email" ? "email" : "text";
      control = html`<input class="a-input${field.mono ? " a-input--mono" : ""}" type="${t}" ${field.inputmode ? raw(`inputmode="${field.inputmode}"`) : ""} value="${v}" ${attrs(field, id, describedBy)} />`;
    }
  }

  return html`<div class="${cls("f", `f--${type}`, field.width && `f--${field.width}`, field.variant && `f--${field.variant}`)}" data-field="${field.key}" data-type="${type}">
    ${label}
    ${control}
    ${field.hint ? html`<p class="f__hint" id="${hintId}">${field.hint}</p>` : ""}
    <p class="f__error" id="${errId}" role="alert" hidden></p>
  </div>`;
}

export function renderFields(fields, item, content) {
  return html`<div class="fields">${fields.map((f) => (f.type === "note" ? html`<div class="f f--note">${f.render ? f.render(item, content) : f.text}</div>` : renderField(f, item, content)))}</div>`;
}

/** Fieldsets with exam-paper section letters: "A · Basics". */
export function renderGroups(groups, item, content) {
  return groups.map(
    (g, i) => html`<fieldset class="fset">
      <legend class="fset__legend"><span class="fset__letter">${String.fromCharCode(65 + i)}</span><span>${g.title}</span></legend>
      ${g.note ? html`<p class="fset__note">${g.note}</p>` : ""}
      ${renderFields(g.fields, item, content)}
    </fieldset>`
  );
}

/* ------------------------------------------------------------------ reading */

export function readField(fieldEl, field) {
  const type = field.type || "text";
  const input = fieldEl.querySelector("input, textarea, select");
  switch (type) {
    case "toggle":
      return fieldEl.querySelector('[role="switch"]').getAttribute("aria-checked") === "true";
    case "number": {
      const i = fieldEl.querySelector("input");
      if (i.validity && i.validity.badInput) return NaN;
      const raw = i.value.trim();
      if (raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : NaN;
    }
    case "list": {
      if (field.variant === "tags") {
        const tags = $$(".f-tag__text", fieldEl).map((s) => s.textContent.trim()).filter(Boolean);
        const pending = fieldEl.querySelector(".f-tags__input").value.trim();
        return pending ? [...tags, pending] : tags;
      }
      return $$(".f-lines__item input", fieldEl).map((i) => i.value.trim()).filter(Boolean);
    }
    case "checks":
      return $$('input[type="checkbox"]', fieldEl).filter((i) => i.checked).map((i) => i.value);
    case "choices": {
      const items = $$(".f-choice", fieldEl);
      const options = items.map((li) => li.querySelector('input[type="text"]').value.trim());
      const idx = items.findIndex((li) => li.querySelector('input[type="radio"]').checked);
      return { options, answer: idx };
    }
    case "textarea":
      return input.value.replace(/\r\n/g, "\n").trim();
    case "select":
      return field.numeric ? Number(input.value) : input.value;
    case "password":
      return input.value;
    default:
      return input ? input.value.trim() : "";
  }
}

/* ------------------------------------------------------------------ validation */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateValue(field, value, item, content) {
  const type = field.type || "text";
  if (type === "number") {
    if (Number.isNaN(value)) return "Enter a number.";
    if (value === null) return field.required ? "Enter a number." : null;
    if (field.integer && !Number.isInteger(value)) return "Use a whole number.";
    if (field.min != null && value < field.min) return `Must be ${field.min} or more.`;
    if (field.max != null && value > field.max) return `Must be ${field.max} or less.`;
  } else if (type === "choices") {
    const opts = value?.options || [];
    if (opts.length < 2) return "Give at least two options.";
    if (opts.some((o) => !o)) return "Fill in every option, or remove the empty ones.";
    if (!(value.answer >= 0 && value.answer < opts.length)) return "Choose the correct answer with the letter on the left.";
  } else if (field.required) {
    const empty = Array.isArray(value) ? value.length === 0 : value === "" || value == null;
    if (empty) return field.requiredMsg || (type === "select" ? "Choose one." : "This can't be empty.");
  }
  if ((type === "url" || type === "image") && value) {
    const safe = store.safeUrl(value);
    if (!safe) return "That kind of link isn't allowed. Use a web address (https://…), mailto:, tel: or a #/ page link.";
    if (field.web && !/^https?:\/\//i.test(value)) return /^www\.|^[a-z0-9-]+\.[a-z]{2,}/i.test(value) ? "Add https:// at the start." : "Use a full web address starting with https://";
    if (field.hash && !/^(https?:\/\/|#\/|mailto:|tel:)/i.test(value)) return "Use a page link such as #/courses, or a full https:// address.";
  }
  if (type === "email" && value && !EMAIL.test(value)) return "That doesn't look like an email address.";
  if (field.pattern && value && !field.pattern.test(value)) return field.patternMsg || "Check the format.";
  if (field.validate) return field.validate(value, item, content) || null;
  return null;
}

export function showError(fieldEl, message) {
  const err = fieldEl.querySelector(".f__error");
  const controls = $$("input:not([type=radio]):not([type=checkbox]), textarea, select, [role=switch]", fieldEl);
  if (message) {
    fieldEl.classList.add("is-invalid");
    err.textContent = message;
    err.hidden = false;
    controls.forEach((c) => c.setAttribute("aria-invalid", "true"));
  } else {
    fieldEl.classList.remove("is-invalid");
    err.textContent = "";
    err.hidden = true;
    controls.forEach((c) => c.removeAttribute("aria-invalid"));
  }
}

/* ------------------------------------------------------------------ behaviour */

function autosize(t) {
  t.style.height = "auto";
  t.style.height = `${Math.min(t.scrollHeight + 2, 640)}px`;
}

function renumberLines(fieldEl, field) {
  const what = field.itemLabel || "line";
  $$(".f-lines__item", fieldEl).forEach((li, i) => {
    const n = i + 1;
    li.querySelector(".f-lines__n").textContent = String(n).padStart(2, "0");
    li.querySelector("input").setAttribute("aria-label", `${what[0].toUpperCase()}${what.slice(1)} ${n}`);
    li.querySelector('[data-line="remove"]').setAttribute("aria-label", `Remove ${what} ${n}`);
  });
}

function renumberChoices(fieldEl) {
  const items = $$(".f-choice", fieldEl);
  items.forEach((li, i) => {
    const L = LETTERS[i] || String(i + 1);
    li.querySelector('input[type="radio"]').value = String(i);
    li.querySelector(".f-choice__letter").textContent = L;
    li.querySelector(".f-choice__mark .sr-only").textContent = `Option ${L} is the correct answer`;
    li.querySelector('input[type="text"]').setAttribute("aria-label", `Option ${L}`);
    li.querySelector('[data-choice="remove"]').setAttribute("aria-label", `Remove option ${L}`);
    li.querySelector('[data-choice="remove"]').disabled = items.length <= 2;
  });
  const add = fieldEl.querySelector('[data-choice="add"]');
  if (add) add.disabled = items.length >= 6;
}

function updateImagePreview(fieldEl) {
  const input = fieldEl.querySelector("input");
  const fig = fieldEl.querySelector("[data-image-preview]");
  if (!fig) return;
  const img = fig.querySelector("img");
  const v = store.safeUrl(input.value.trim());
  fig.querySelector(".f-image__broken").hidden = true;
  if (!v) {
    img.hidden = true;
    img.removeAttribute("src");
    fig.querySelector(".f-image__empty").hidden = false;
    return;
  }
  fig.querySelector(".f-image__empty").hidden = true;
  img.hidden = false;
  if (img.getAttribute("src") !== v) img.setAttribute("src", v);
}

function updateUrlTest(fieldEl) {
  const input = fieldEl.querySelector("input");
  const a = fieldEl.querySelector(".f-url__test");
  if (!a) return;
  const v = store.safeUrl(input.value.trim());
  const ext = /^https?:\/\/[^\s]+\.[^\s]+/i.test(v);
  a.hidden = !ext;
  a.href = ext ? v : "#";
}

/**
 * Wire up a rendered form.
 * bindForm(root, fields, { item, content, onField(field, value, error, el), submitted })
 * Returns { validateAll(), read(key), field(key), markSubmitted(), destroy() }.
 */
export function bindForm(root, fields, { item = null, content = null, onField = null } = {}) {
  const byKey = new Map(fields.filter((f) => f.type !== "note").map((f) => [f.key, f]));
  let submitted = false;
  const getItem = () => (typeof item === "function" ? item() : item);
  const getContent = () => (typeof content === "function" ? content() : content);

  const fieldEl = (key) => $$("[data-field]", root).find((n) => n.dataset.field === key) || null;

  function evaluate(el, { force = false } = {}) {
    const field = byKey.get(el.dataset.field);
    if (!field) return null;
    const value = readField(el, field);
    const error = validateValue(field, value, getItem(), getContent());
    if (force || submitted || el.dataset.touched || el.classList.contains("is-invalid")) showError(el, error);
    return { field, value, error };
  }

  function changed(el, opts = {}) {
    const r = evaluate(el, opts);
    if (r && onField) onField(r.field, r.value, r.error, el);
    return r;
  }

  const fieldOf = (target) => {
    const el = target.closest("[data-field]");
    return el && root.contains(el) && byKey.has(el.dataset.field) ? el : null;
  };

  const previewSoon = debounce(updateImagePreview, 350);

  const onInput = (e) => {
    const el = fieldOf(e.target);
    if (!el) return;
    if (e.target.matches("[data-autosize]")) autosize(e.target);
    const count = e.target.id && root.querySelector(`[data-count-for="${e.target.id}"]`);
    if (count) {
      const f = byKey.get(el.dataset.field);
      count.textContent = `${e.target.value.length} / ${f.counter}`;
      count.classList.toggle("is-over", e.target.value.length > f.counter);
    }
    if (el.dataset.type === "image") previewSoon(el);
    if (el.dataset.type === "url") updateUrlTest(el);
    if (e.target.classList.contains("f-tags__input")) return; // tags commit on Enter / blur
    changed(el);
  };

  const onChange = (e) => {
    const el = fieldOf(e.target);
    if (!el) return;
    if (e.type === "change" && (e.target.type === "radio" || e.target.type === "checkbox" || e.target.tagName === "SELECT" || e.target.type === "time")) {
      el.dataset.touched = "1";
      changed(el);
    }
  };

  const onFocusOut = (e) => {
    const el = fieldOf(e.target);
    if (!el) return;
    if (e.target.classList.contains("f-tags__input") && e.target.value.trim()) commitTag(el, e.target);
    // Only mark touched once focus leaves the field entirely.
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    el.dataset.touched = "1";
    evaluate(el);
  };

  function commitTag(el, input) {
    const parts = input.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const list = el.querySelector(".f-tags__list");
    const existing = new Set($$(".f-tag__text", el).map((s) => s.textContent.trim().toLowerCase()));
    for (const p of parts) {
      if (existing.has(p.toLowerCase())) continue;
      list.insertAdjacentHTML("beforeend", String(tagItem(p)));
      existing.add(p.toLowerCase());
    }
    input.value = "";
    changed(el);
  }

  const onClick = (e) => {
    const sw = e.target.closest('[role="switch"]');
    if (sw && fieldOf(sw)) {
      const on = sw.getAttribute("aria-checked") !== "true";
      sw.setAttribute("aria-checked", on ? "true" : "false");
      const st = sw.querySelector(".switch__state");
      if (st) st.textContent = on ? st.dataset.on : st.dataset.off;
      changed(fieldOf(sw));
      return;
    }
    const reveal = e.target.closest("[data-reveal]");
    if (reveal) {
      const input = reveal.parentElement.querySelector("input");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      reveal.textContent = show ? "Hide" : "Show";
      reveal.setAttribute("aria-pressed", show ? "true" : "false");
      return;
    }
    const lineBtn = e.target.closest("[data-line]");
    if (lineBtn) {
      const el = fieldOf(lineBtn);
      const field = byKey.get(el.dataset.field);
      if (lineBtn.dataset.line === "add") {
        const list = el.querySelector(".f-lines__list");
        list.insertAdjacentHTML("beforeend", String(lineItem(field, "", list.children.length)));
        list.lastElementChild.querySelector("input").focus();
      } else {
        const li = lineBtn.closest(".f-lines__item");
        const next = li.nextElementSibling || li.previousElementSibling;
        li.remove();
        renumberLines(el, field);
        (next ? next.querySelector("input") : el.querySelector('[data-line="add"]')).focus();
        changed(el);
      }
      return;
    }
    const tagBtn = e.target.closest('[data-tag="remove"]');
    if (tagBtn) {
      const el = fieldOf(tagBtn);
      tagBtn.closest(".f-tag").remove();
      el.querySelector(".f-tags__input").focus();
      changed(el);
      return;
    }
    const ch = e.target.closest("[data-choice]");
    if (ch) {
      const el = fieldOf(ch);
      const list = el.querySelector(".f-choices__list");
      let removedAnswer = false;
      if (ch.dataset.choice === "add") {
        if (list.children.length >= 6) return;
        const name = list.querySelector('input[type="radio"]')?.name || nextId("c");
        list.insertAdjacentHTML("beforeend", String(choiceItem(name, "", list.children.length, false)));
        list.lastElementChild.querySelector('input[type="text"]').focus();
      } else {
        if (list.children.length <= 2) return;
        const li = ch.closest(".f-choice");
        const wasChecked = li.querySelector('input[type="radio"]').checked;
        const next = li.nextElementSibling || li.previousElementSibling;
        li.remove();
        // The correct answer stays on the same option (radios move with their rows). If the removed
        // option was the correct one, nothing is ticked and the field asks for a new answer —
        // never silently promote option A.
        if (wasChecked) {
          el.dataset.touched = "1";
          removedAnswer = true;
        }
        next.querySelector('input[type="text"]').focus();
      }
      renumberChoices(el);
      changed(el);
      if (removedAnswer) showError(el, "You removed the correct answer. Choose the new one with the letter on the left.");
    }
  };

  const onKey = (e) => {
    const el = fieldOf(e.target);
    if (!el) return;
    const field = byKey.get(el.dataset.field);
    if (e.target.classList.contains("f-tags__input")) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        commitTag(el, e.target);
      } else if (e.key === "Backspace" && !e.target.value) {
        const last = el.querySelector(".f-tags__list .f-tag:last-child");
        if (last) {
          last.remove();
          changed(el);
        }
      }
      return;
    }
    const li = e.target.closest(".f-lines__item");
    if (li && e.target.tagName === "INPUT") {
      if (e.key === "Enter") {
        e.preventDefault();
        li.insertAdjacentHTML("afterend", String(lineItem(field, "", 0)));
        renumberLines(el, field);
        li.nextElementSibling.querySelector("input").focus();
      } else if (e.key === "Backspace" && !e.target.value && el.querySelectorAll(".f-lines__item").length > 0) {
        e.preventDefault();
        const prev = li.previousElementSibling || li.nextElementSibling;
        li.remove();
        renumberLines(el, field);
        if (prev) {
          const i = prev.querySelector("input");
          i.focus();
          i.setSelectionRange(i.value.length, i.value.length);
        } else el.querySelector('[data-line="add"]').focus();
        changed(el);
      } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const sib = e.key === "ArrowUp" ? li.previousElementSibling : li.nextElementSibling;
        if (!sib) return;
        if (e.key === "ArrowUp") sib.before(li);
        else sib.after(li);
        renumberLines(el, field);
        e.target.focus();
        changed(el);
      }
    }
  };

  const onPaste = (e) => {
    const li = e.target.closest(".f-lines__item");
    if (!li) return;
    const text = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    const parts = text.split(/\r?\n/).map((s) => s.replace(/^[\s•\-*\d.)]+/, "").trim()).filter(Boolean);
    if (parts.length < 2) return;
    e.preventDefault();
    const el = fieldOf(li);
    const field = byKey.get(el.dataset.field);
    const input = e.target;
    input.value = (input.value + parts[0]).trim();
    let after = li;
    for (const p of parts.slice(1)) {
      after.insertAdjacentHTML("afterend", String(lineItem(field, p, 0)));
      after = after.nextElementSibling;
    }
    renumberLines(el, field);
    after.querySelector("input").focus();
    changed(el);
  };

  const onImgError = (e) => {
    if (e.target.tagName !== "IMG") return;
    const fig = e.target.closest("[data-image-preview]");
    if (!fig) return;
    e.target.hidden = true;
    fig.querySelector(".f-image__broken").hidden = false;
  };

  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("focusout", onFocusOut);
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKey);
  root.addEventListener("paste", onPaste);
  root.addEventListener("error", onImgError, true);

  // Initial UI state.
  $$("[data-autosize]", root).forEach((t) => requestAnimationFrame(() => autosize(t)));
  $$('[data-field][data-type="choices"]', root).forEach(renumberChoices);

  return {
    field: fieldEl,
    read(key) {
      const el = fieldEl(key);
      return el ? readField(el, byKey.get(key)) : undefined;
    },
    /** Validate everything, show all errors, return [{field, el, error}] for the invalid ones. */
    validateAll() {
      submitted = true;
      const errors = [];
      for (const el of $$("[data-field]", root)) {
        if (!byKey.has(el.dataset.field)) continue;
        const r = evaluate(el, { force: true });
        if (r && r.error) errors.push({ ...r, el });
      }
      return errors;
    },
    /** Read all fields into an object via applyValue. */
    collect(target) {
      for (const el of $$("[data-field]", root)) {
        const field = byKey.get(el.dataset.field);
        if (field) applyValue(field, target, readField(el, field));
      }
      return target;
    },
    errorCount() {
      let n = 0;
      for (const el of $$("[data-field]", root)) {
        const field = byKey.get(el.dataset.field);
        if (field && validateValue(field, readField(el, field), getItem(), getContent())) n++;
      }
      return n;
    },
    resize() {
      $$("[data-autosize]", root).forEach(autosize);
    },
    destroy() {
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onChange);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKey);
      root.removeEventListener("paste", onPaste);
      root.removeEventListener("error", onImgError, true);
    },
  };
}

/** Focus and scroll to the first invalid field. */
export function focusFirstError(errors) {
  const first = errors[0];
  if (!first) return;
  const target = first.el.querySelector("input:not([type=radio]), textarea, select, [role=switch], button") || first.el;
  first.el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
  setTimeout(() => target.focus({ preventScroll: true }), 220);
}
