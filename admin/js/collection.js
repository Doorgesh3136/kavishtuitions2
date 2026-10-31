// Generic, schema-driven collection editor: a ledger list with search, filters, visibility, duplicate,
// delete, reorder (buttons + drag), and an editor drawer with typed fields.

import { html, raw, icon, render } from "../../assets/js/ui.js";
import * as store from "../../assets/js/store.js";
import { state, commit, subscribe, flush, readExternal, adoptExternal } from "./state.js";
import { $, $$, toast, confirmDialog, openDrawer, flash, gsap, reduced, two, debounce, relocator, focusBack } from "./dom.js";
import { renderGroups, renderFields, bindForm, focusFirstError, getPath } from "./fields.js";

/* ------------------------------------------------------------------ helpers */

const keys = new WeakMap();
let keySeq = 0;
export const keyOf = (item) => {
  if (!item || typeof item !== "object") return "k0";
  if (!keys.has(item)) keys.set(item, `k${++keySeq}`);
  return keys.get(item);
};
/** A saved copy takes over its original's row key, so focus, flash and Flip follow it. */
const inheritKey = (next, prev) => {
  if (next && prev && typeof next === "object" && typeof prev === "object") keys.set(next, keyOf(prev));
};

/** A real list entry (hand-edited JSON can leave numbers, strings or null in a list). */
export const isEntry = (x) => !!x && typeof x === "object" && !Array.isArray(x);

export function listOf(schema, content = state.working) {
  const v = getPath(content, schema.path);
  return Array.isArray(v) ? v : [];
}

const rootKey = (schema) => String(schema.path).split(".")[0];

function uniqueId(base, list) {
  const ids = new Set(list.map((x) => x && x.id));
  if (!ids.has(base)) return base;
  let n = 2;
  while (ids.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function newId(schema, item, list) {
  const base = schema.makeId ? schema.makeId(item) : "";
  return uniqueId(base && base !== "-" ? base : store.uid(schema.idPrefix || "id"), list);
}

const allFields = (schema) => (schema.groups ? schema.groups.flatMap((g) => g.fields) : schema.fields || []);
const hasId = (schema) => schema.idField !== false && Object.prototype.hasOwnProperty.call(schema.create(state.working), "id");

/* ------------------------------------------------------------------ editor drawer */

/**
 * Open the editor for one item (index) or a new one (index = null).
 * opts: { prefill, onSaved(item, index), onOpen(item), onClose(), afterRender(api, draft) }
 */
export function openItemEditor(schema, opts = {}) {
  const { index = null, prefill = null, onSaved = null, onOpen = null, onClose = null } = opts;
  const content = state.working;
  const list = listOf(schema);
  const isNew = index == null || !isEntry(list[index]);
  const original = isNew ? null : list[index];
  const origSnap = isNew ? "" : store.stableStringify(original);
  const draft = isNew ? { ...schema.create(content), ...(prefill || {}) } : store.deepClone(original);
  // Re-taken once the form is bound: the baseline is what the untouched form reads back, so values the
  // form can't hold as-is (null text, a string where a list belongs) don't count as edits.
  let start = store.stableStringify(draft);
  const fields = allFields(schema);
  const name = () => (schema.titleOf ? schema.titleOf(draft, content) : draft.title || draft.name) || "";
  const label = schema.singular;
  const Label = label[0].toUpperCase() + label.slice(1);
  const siteHref = !isNew && schema.siteLink ? schema.siteLink(original) : null;

  /** Where this item sits in a list now: same object, same id, same content, or (no id) the same place. */
  const findIn = (l) => {
    if (isNew) return -1;
    const k = l.indexOf(original);
    if (k >= 0) return k;
    if (original.id) return l.findIndex((x) => isEntry(x) && x.id === original.id);
    const same = l.findIndex((x) => isEntry(x) && store.stableStringify(x) === origSnap);
    if (same >= 0) return same;
    return isEntry(l[index]) ? index : -1;
  };

  const body = html`
    ${schema.editorIntro ? html`<p class="drawer__intro">${schema.editorIntro}</p>` : ""}
    <div class="drawer-sync" data-sync aria-live="polite"></div>
    <form class="drawer-form" novalidate data-form>
      ${schema.groups ? renderGroups(schema.groups, draft, content) : renderFields(fields, draft, content)}
      <div class="drawer-notes" data-notes aria-live="polite"></div>
    </form>`;

  const footer = html`
    <p class="drawer__state" data-state aria-live="polite">${isNew ? "Not added yet" : "No changes yet"}</p>
    ${!isNew ? html`<button type="button" class="icon-btn icon-btn--danger" data-del aria-label="${`Delete this ${label}`}" title="${`Delete this ${label}`}">${icon("trash")}</button>` : ""}
    <button type="button" class="a-btn a-btn--ghost" data-cancel>Cancel</button>
    <button type="button" class="a-btn a-btn--primary" data-save>${isNew ? `Add ${label}` : "Save changes"}</button>`;

  let form = null;
  let saved = false;
  const dirty = () => {
    if (!form) return false;
    form.collect(draft);
    return store.stableStringify(draft) !== start;
  };

  const drawer = openDrawer({
    eyebrow: isNew ? `New ${label}` : `${Label}${original.id ? ` · ${original.id}` : ` · ${two(index + 1)}`}`,
    title: name() || (isNew ? `New ${label}` : "Untitled"),
    body,
    footer,
    size: schema.drawerSize || "md",
    headExtra: siteHref
      ? html`<a class="drawer__site" href="${siteHref}" target="_blank" rel="noopener" data-site-link>On the site ${icon("arrow-up-right", { size: 14 })}</a>`
      : "",
    onRequestClose: async () => {
      if (saved || !dirty()) return true;
      return confirmDialog({
        eyebrow: "Unsaved changes",
        title: `Discard changes to this ${label}?`,
        body: html`<p>You've edited this ${label} but haven't saved it. Discarded edits can't be recovered.</p>`,
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
        danger: true,
      });
    },
    onClose: () => {
      window.removeEventListener("beforeunload", guard);
      unsubSync();
      if (onClose) onClose();
    },
  });

  const guard = (e) => {
    if (!saved && dirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", guard);

  const stateEl = $("[data-state]", drawer.dialog);
  const notesEl = $("[data-notes]", drawer.dialog);
  const setState = (text, tone = "") => {
    stateEl.textContent = text;
    stateEl.dataset.tone = tone;
  };
  const renderNotes = () => {
    if (!schema.notes) return;
    render(notesEl, schema.notes(draft, state.working, isNew ? -1 : index) || "");
  };

  // Another tab saved while this editor is open: say what that means for this item.
  const syncEl = $("[data-sync]", drawer.dialog);
  const theirState = () => {
    if (isNew) return "other";
    const theirs = readExternal();
    if (!theirs) return "other";
    const l = listOf(schema, theirs);
    const k = findIn(l);
    if (k < 0) return "gone";
    return store.stableStringify(l[k]) !== origSnap ? "changed" : "other";
  };
  const showSync = () => {
    if (!state.external) return render(syncEl, "");
    const st = theirState();
    render(
      syncEl,
      html`<p class="note note--warn"><span class="note__k">Other tab</span><span>${st === "changed"
        ? `This ${label} was changed in another tab while you had it open. Load their version, or save to keep yours.`
        : st === "gone"
          ? `This ${label} was deleted in another tab. Saving adds it back with your changes.`
          : `Changes were saved in another tab. They're kept when you save this ${label}.`}</span>${st === "changed" ? html`<button type="button" class="a-btn a-btn--ghost a-btn--xs" data-load-theirs>Load their version</button>` : ""}</p>`
    );
  };
  let unsubSync = () => {};

  form = bindForm(drawer.body, fields, {
    item: draft,
    content,
    onField: () => {
      form.collect(draft);
      drawer.setTitle(name() || (isNew ? `New ${label}` : "Untitled"));
      renderNotes();
      const n = form.errorCount();
      if (store.stableStringify(draft) === start) setState(isNew ? "Not added yet" : "No changes yet");
      else if (n && drawer.dialog.querySelector(".is-invalid")) setState(`${n} ${n === 1 ? "field needs" : "fields need"} attention`, "error");
      else setState("Unsaved changes", "dirty");
      if (schema.onDraftChange) schema.onDraftChange(draft, drawer, form);
    },
  });
  form.collect(draft);
  start = store.stableStringify(draft);
  renderNotes();
  if (schema.afterRender) schema.afterRender(drawer, draft, form);
  unsubSync = subscribe((kind) => {
    if (kind === "external") showSync();
  });
  showSync();

  let busy = false;
  const save = async () => {
    if (busy || saved) return;
    const errors = form.validateAll();
    if (errors.length) {
      setState(`${errors.length} ${errors.length === 1 ? "field needs" : "fields need"} attention`, "error");
      focusFirstError(errors);
      return;
    }
    form.collect(draft);
    if (!isNew && store.stableStringify(draft) === start) {
      // Nothing edited: don't write the copy opened earlier over anything newer.
      saved = true;
      drawer.close();
      return;
    }
    if (schema.beforeSave) schema.beforeSave(draft, state.working);
    if (state.external && theirState() === "changed") {
      busy = true;
      const ok = await confirmDialog({
        eyebrow: "Changed in another tab",
        title: `Replace the other tab's version of this ${label}?`,
        body: html`<p>This ${label} was also edited in another tab. Saving keeps your version of it. Their changes to everything else are kept either way.</p>`,
        confirmLabel: "Save my version",
        cancelLabel: "Keep editing",
      });
      busy = false;
      if (!ok) return;
    }
    let target = original;
    let at = index;
    // commit() first takes in anything another tab saved, so this applies to the latest copy.
    commit(
      (c) => {
        const l = listOf(schema, c);
        if (isNew) {
          if (hasId(schema)) draft.id = newId(schema, draft, l);
          at = schema.insertAt ? schema.insertAt(draft, l) : l.length;
          l.splice(at, 0, draft);
          target = draft;
          return;
        }
        const k = findIn(l);
        if (k >= 0 && l[k] === original) {
          for (const key of Object.keys(original)) delete original[key];
          Object.assign(original, draft);
          at = k;
          return;
        }
        inheritKey(draft, original);
        target = draft;
        if (k >= 0) {
          l[k] = draft;
          at = k;
        } else {
          at = Math.min(index, l.length);
          l.splice(at, 0, draft);
        }
      },
      { path: schema.path }
    );
    saved = true;
    const title = name() || label;
    drawer.close();
    toast(isNew ? `Added “${title}”` : `Saved “${title}”`, { tone: "ok" });
    if (onSaved) onSaved(target, at);
  };

  drawer.dialog.addEventListener("click", async (e) => {
    if (e.target.closest("[data-save]")) save();
    else if (e.target.closest("[data-load-theirs]")) {
      // Reopen this item from the other tab's copy (closing lets the admin take that copy in).
      saved = true;
      await drawer.close();
      if (state.external) adoptExternal();
      const k = findIn(listOf(schema));
      if (k >= 0) openItemEditor(schema, { ...opts, index: k, prefill: null });
    } else if (e.target.closest("[data-cancel]")) drawer.requestClose();
    else if (e.target.closest("[data-del]")) {
      const ok = await deleteItem(schema, index);
      if (ok) {
        saved = true;
        drawer.close();
      }
    } else if (e.target.closest("[data-site-link]")) flush();
  });
  drawer.dialog.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    } else if (e.key === "Enter" && e.target.matches('input.a-input:not(.f-lines__item input):not(.f-tags__input)') && !e.target.closest(".f-choice")) {
      e.preventDefault();
      save();
    }
  });
  if (onOpen) onOpen(original || draft);
  return drawer;
}

/* ------------------------------------------------------------------ actions */

export async function deleteItem(schema, index) {
  const list = listOf(schema);
  const item = list[index];
  if (!isEntry(item)) return false;
  const snap = store.stableStringify(item);
  const name = (schema.titleOf ? schema.titleOf(item, state.working) : item.title || item.name) || `this ${schema.singular}`;
  const note = schema.deleteNote ? schema.deleteNote(item, state.working) : "";
  const ok = await confirmDialog({
    eyebrow: `Delete ${schema.singular}`,
    title: `Delete “${name}”?`,
    body: html`${note ? html`<p class="confirm__warn">${note}</p>` : ""}<p>It disappears from the site once you publish. You can undo straight after deleting.</p>`,
    confirmLabel: `Delete ${schema.singular}`,
    danger: true,
  });
  if (!ok) return false;
  const back = relocator(document.activeElement);
  const touched = [rootKey(schema), ...(schema.cascade || [])];
  let snapshot = null;
  commit(
    (c) => {
      // Snapshot here, inside commit, so Undo restores the copy the delete applied to.
      snapshot = Object.fromEntries(touched.map((k) => [k, store.deepClone(c[k])]));
      const l = listOf(schema, c);
      let k = l.indexOf(item);
      if (k < 0) k = item.id ? l.findIndex((x) => isEntry(x) && x.id === item.id) : l.findIndex((x) => isEntry(x) && store.stableStringify(x) === snap);
      if (k < 0) return;
      l.splice(k, 1);
      if (schema.onDelete) schema.onDelete(item, c);
    },
    { path: schema.path }
  );
  // The row (and the button that was focused) is gone: move to the row now in its place.
  focusBack(back);
  toast(`Deleted “${name}”`, {
    action: {
      label: "Undo",
      run: () => {
        commit((c) => Object.assign(c, store.deepClone(snapshot)), { path: schema.path });
        toast(`Restored “${name}”`, { tone: "ok" });
      },
    },
    duration: 7000,
  });
  return true;
}

/* ------------------------------------------------------------------ list view */

/**
 * Mount a collection editor into `host`.
 * opts: { openKey: id or index to open on mount, onRoute(id|null) to mirror the open item in the URL, compact }
 */
export function mountCollection(host, schema, { openKey = null, onRoute = null, compact = false, heading = null } = {}) {
  const ui = { q: "", filters: {} };
  const filters = schema.filters || [];
  const Plural = schema.plural[0].toUpperCase() + schema.plural.slice(1);
  const deps = new Set([rootKey(schema), ...(schema.deps || [])]);

  render(
    host,
    html`<div class="coll${compact ? " coll--compact" : ""}" data-coll>
      ${heading || ""}
      <div class="coll__bar">
        <label class="search">
          ${icon("search", { size: 18 })}
          <span class="sr-only">${`Search ${schema.plural}`}</span>
          <input type="search" class="search__input" data-q placeholder="${`Search ${schema.plural}`}" autocomplete="off" spellcheck="false" />
        </label>
        ${filters.map(
          (f) => html`<label class="filter">
            <span class="sr-only">${f.label}</span>
            <select class="filter__select" data-filter="${f.key}">
              <option value="">${f.allLabel || `All ${f.label.toLowerCase()}s`}</option>
            </select>
            ${icon("chevron-down", { size: 14, cls: "filter__chev" })}
          </label>`
        )}
        <p class="coll__count" data-count aria-live="polite"></p>
        <button type="button" class="a-btn a-btn--primary a-btn--sm coll__add" data-add>${icon("plus", { size: 16 })}<span>${`Add ${schema.singular}`}</span></button>
      </div>
      <div class="coll__rows" data-rows></div>
      <p class="sr-only" aria-live="polite" data-announce></p>
    </div>`
  );

  const rowsEl = $("[data-rows]", host);
  const countEl = $("[data-count]", host);
  const announce = (t) => {
    const a = $("[data-announce]", host);
    a.textContent = "";
    requestAnimationFrame(() => (a.textContent = t));
  };

  function fillFilters() {
    for (const f of filters) {
      const sel = $(`[data-filter="${f.key}"]`, host);
      const opts = typeof f.options === "function" ? f.options(state.working) : resolveSource(f.options, state.working);
      const cur = ui.filters[f.key] || "";
      sel.innerHTML = String(
        html`<option value="">${f.allLabel || `All ${f.label.toLowerCase()}s`}</option>${opts.map((o) => html`<option value="${o.value}" ${o.value === cur ? raw("selected") : ""}>${o.label}</option>`)}`
      );
    }
  }

  const isFiltered = () => !!ui.q.trim() || Object.values(ui.filters).some(Boolean);

  function visibleIndexes(list) {
    const q = ui.q.trim().toLowerCase();
    return list
      .map((_, i) => i)
      .filter((i) => {
        const item = list[i];
        if (!isEntry(item)) return false;
        for (const f of filters) {
          const want = ui.filters[f.key];
          if (want && String(f.get ? f.get(item) : item[f.key]) !== want) return false;
        }
        if (!q) return true;
        const text = (schema.search ? schema.search(item, state.working) : JSON.stringify(item)).toLowerCase();
        return q.split(/\s+/).every((w) => text.includes(w));
      });
  }

  function rowTpl(item, i, n, filtered) {
    const r = schema.row(item, i, state.working);
    const hidden = schema.hasVisible && item.visible === false;
    const name = r.title || "Untitled";
    return html`<li class="lrow${hidden ? " is-hidden" : ""}${r.warn ? " is-warn" : ""}" data-i="${i}" data-key="${keyOf(item)}" data-flip-id="${keyOf(item)}">
      ${filtered
        ? html`<span class="lrow__handle is-off" aria-hidden="true"></span>`
        : html`<span class="lrow__handle" data-drag aria-hidden="true" title="Drag to reorder">${icon("drag", { size: 18 })}</span>`}
      <span class="lrow__num" aria-hidden="true">${r.num || two(i + 1)}</span>
      <button type="button" class="lrow__main" data-act="edit">
        <span class="sr-only">Edit </span>
        ${r.lead ? html`<span class="lrow__lead">${r.lead}</span>` : ""}
        <span class="lrow__text">
          <span class="lrow__title">${name}</span>
          ${r.meta && r.meta.filter(Boolean).length ? html`<span class="lrow__meta">${r.meta.filter(Boolean).join("  ·  ")}</span>` : ""}
        </span>
      </button>
      <span class="lrow__tags">${(r.tags || []).filter(Boolean).map((t) => html`<span class="a-tag a-tag--${t.tone || "plain"}">${t.label}</span>`)}</span>
      ${schema.hasVisible
        ? html`<button type="button" class="vis" role="switch" aria-checked="${hidden ? "false" : "true"}" data-act="visible" aria-label="${`Show ${name} on the site`}">
            <span class="vis__track" aria-hidden="true"><span class="vis__thumb"></span></span><span class="vis__text" aria-hidden="true">${hidden ? "Hidden" : "Shown"}</span>
          </button>`
        : ""}
      <span class="lrow__acts">
        <button type="button" class="icon-btn" data-act="up" aria-label="${`Move ${name} up`}" ${i === 0 || filtered ? raw("disabled") : ""}>${icon("arrow-down", { size: 18, cls: "is-flipped" })}</button>
        <button type="button" class="icon-btn" data-act="down" aria-label="${`Move ${name} down`}" ${i === n - 1 || filtered ? raw("disabled") : ""}>${icon("arrow-down", { size: 18 })}</button>
        ${schema.noDuplicate ? "" : html`<button type="button" class="icon-btn" data-act="duplicate" aria-label="${`Duplicate ${name}`}" title="Duplicate">${icon("copy", { size: 18 })}</button>`}
        <button type="button" class="icon-btn icon-btn--danger" data-act="delete" aria-label="${`Delete ${name}`}" title="Delete">${icon("trash", { size: 18 })}</button>
      </span>
    </li>`;
  }

  function renderRows() {
    const list = listOf(schema);
    const idx = visibleIndexes(list);
    const filtered = isFiltered();
    const n = list.filter(isEntry).length;
    const junk = list.length - n;
    const shown = schema.hasVisible ? list.filter((x) => isEntry(x) && x.visible !== false).length : null;
    countEl.textContent = filtered
      ? `${idx.length} of ${n}`
      : `${n} ${n === 1 ? schema.singular : schema.plural}${shown != null && shown !== n ? ` · ${n - shown} hidden` : ""}`;

    // Keep focus on the same control across re-renders.
    const active = document.activeElement;
    const activeRow = active && rowsEl.contains(active) ? active.closest(".lrow") : null;
    const focusKey = activeRow ? activeRow.dataset.key : null;
    const focusAct = active && active.dataset ? active.dataset.act : null;

    if (!n) {
      render(
        rowsEl,
        html`<div class="empty">
          <p class="empty__title">${schema.emptyTitle || `No ${schema.plural} yet.`}</p>
          <p class="empty__text">${schema.emptyText || `Add the first one and it will appear on the site straight away in this browser’s preview.`}</p>
          <button type="button" class="a-btn a-btn--ghost a-btn--sm" data-add>${icon("plus", { size: 16 })}<span>${`Add ${schema.singular}`}</span></button>
        </div>`
      );
      return;
    }
    if (!idx.length) {
      render(
        rowsEl,
        html`<div class="empty empty--slim">
          <p class="empty__title">Nothing matches.</p>
          <p class="empty__text">${ui.q ? html`No ${schema.plural} contain “${ui.q}”${Object.values(ui.filters).some(Boolean) ? " with these filters" : ""}.` : "Try another filter."}</p>
          <button type="button" class="a-btn a-btn--ghost a-btn--sm" data-clear>Clear search</button>
        </div>`
      );
      return;
    }
    render(
      rowsEl,
      html`${filtered ? html`<p class="coll__hint">Showing a filtered list — clear the search to reorder.</p>` : ""}
        ${junk ? html`<p class="coll__hint">${junk} ${junk === 1 ? "entry in this list isn't" : "entries in this list aren't"} readable (for example a bare number in <span class="mono-code">content.json</span>) and ${junk === 1 ? "is" : "are"} skipped here. Import a corrected file from <a class="link" href="#publish">Publish</a> to remove ${junk === 1 ? "it" : "them"}.</p>` : ""}
        <ol class="ledger" role="list">${idx.map((i) => rowTpl(list[i], i, list.length, filtered))}</ol>`
    );
    if (focusKey) {
      const row = rowsEl.querySelector(`[data-key="${focusKey}"]`);
      let target = row && focusAct ? row.querySelector(`[data-act="${focusAct}"]`) : null;
      if (target && target.disabled) target = row.querySelector(`[data-act="${focusAct === "up" ? "down" : "up"}"]`);
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  }

  const rerender = () => {
    fillFilters();
    renderRows();
  };

  function openEditor(i, opts = {}) {
    const list = listOf(schema);
    const item = i == null ? null : list[i];
    openItemEditor(schema, {
      index: i,
      ...opts,
      onOpen: (it) => onRoute && it && it.id && i != null && onRoute(it.id),
      onClose: () => onRoute && onRoute(null),
      onSaved: (saved) => {
        const row = rowsEl.querySelector(`[data-key="${keyOf(saved)}"]`);
        if (row) {
          flash(row);
          if (i == null) row.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
        }
      },
    });
    return item;
  }

  function move(i, dir) {
    const list = listOf(schema);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const Flip = window.Flip;
    const flipState = Flip && !reduced() ? Flip.getState($$(".lrow", rowsEl)) : null;
    const name = (schema.row(list[i], i, state.working).title || "Item").toString();
    commit((c) => {
      const l = listOf(schema, c);
      [l[i], l[j]] = [l[j], l[i]];
    }, { path: schema.path });
    if (flipState) Flip.from(flipState, { duration: 0.42, ease: "power3.inOut", targets: $$(".lrow", rowsEl) });
    announce(`${name} moved to position ${j + 1} of ${list.length}`);
  }

  async function onClick(e) {
    if (e.target.closest("[data-add]")) {
      openEditor(null);
      return;
    }
    if (e.target.closest("[data-clear]")) {
      ui.q = "";
      ui.filters = {};
      $("[data-q]", host).value = "";
      rerender();
      $("[data-q]", host).focus();
      return;
    }
    const btn = e.target.closest("[data-act]");
    if (!btn || !rowsEl.contains(btn)) return;
    const row = btn.closest(".lrow");
    const i = Number(row.dataset.i);
    const list = listOf(schema);
    const item = list[i];
    if (!item) return;
    const act = btn.dataset.act;
    const name = schema.row(item, i, state.working).title || "Item";
    if (act === "edit") openEditor(i);
    else if (act === "up") move(i, -1);
    else if (act === "down") move(i, 1);
    else if (act === "visible") {
      const nowHidden = item.visible !== false;
      commit(() => (item.visible = !nowHidden), { path: schema.path });
      toast(nowHidden ? `“${name}” is hidden from the site` : `“${name}” is shown on the site`);
    } else if (act === "duplicate") {
      const copy = store.deepClone(item);
      if (schema.onDuplicate) schema.onDuplicate(copy);
      else if ("title" in copy) copy.title = `${copy.title} (copy)`;
      else if ("name" in copy) copy.name = `${copy.name} (copy)`;
      if (schema.hasVisible) copy.visible = false;
      commit((c) => {
        const l = listOf(schema, c);
        if (hasId(schema)) copy.id = newId(schema, copy, l);
        l.splice(i + 1, 0, copy);
      }, { path: schema.path });
      const r = rowsEl.querySelector(`[data-key="${keyOf(copy)}"]`);
      flash(r);
      toast(`Duplicated “${name}”`, { detail: schema.hasVisible ? "The copy stays hidden until you switch it on." : "" });
    } else if (act === "delete") {
      await deleteItem(schema, i);
    }
  }

  /* ---------------- drag to reorder (pointer events: mouse, pen and touch) */

  function onPointerDown(e) {
    const handle = e.target.closest("[data-drag]");
    if (!handle || isFiltered() || e.button > 0) return;
    const li = handle.closest(".lrow");
    const ol = li.parentElement;
    e.preventDefault();
    const g = gsap();
    const startOrder = $$(".lrow", ol).map((r) => r.dataset.i).join(",");
    // baseY: distance from the pointer to the row's natural top, in page coordinates.
    const baseY = e.clientY + window.scrollY - li.offsetTop;
    let lastY = e.clientY;
    let offset = 0;
    let raf = 0;
    li.classList.add("is-dragging");
    ol.classList.add("is-sorting");

    const place = () => {
      const pageY = lastY + window.scrollY;
      const myTop = pageY - baseY;
      offset = myTop - li.offsetTop;
      li.style.transform = `translateY(${offset}px)`;
      const prev = li.previousElementSibling;
      const next = li.nextElementSibling;
      const mid = (n) => n.offsetTop + n.offsetHeight / 2;
      const myBottom = myTop + li.offsetHeight;
      const swap = (sib, after) => {
        const before = sib.offsetTop;
        if (after) sib.after(li);
        else sib.before(li);
        offset = myTop - li.offsetTop;
        li.style.transform = `translateY(${offset}px)`;
        const delta = before - sib.offsetTop;
        if (g && !reduced()) g.fromTo(sib, { y: delta }, { y: 0, duration: 0.24, ease: "power2.out", clearProps: "transform", overwrite: true });
      };
      if (next && myBottom > mid(next) + 1) swap(next, true);
      else if (prev && myTop < mid(prev) - 1) swap(prev, false);
    };
    const tick = () => {
      const edge = 72;
      if (lastY < edge) window.scrollBy(0, -Math.ceil((edge - lastY) / 6));
      else if (lastY > window.innerHeight - edge) window.scrollBy(0, Math.ceil((lastY - (window.innerHeight - edge)) / 6));
      place();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onMove = (ev) => {
      lastY = ev.clientY;
    };
    const onUp = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const finish = () => {
        li.classList.remove("is-dragging");
        ol.classList.remove("is-sorting");
        li.style.transform = "";
        const order = $$(".lrow", ol).map((r) => Number(r.dataset.i));
        if (order.join(",") === startOrder) return;
        commit((c) => {
          const l = listOf(schema, c);
          const copy = order.map((k) => l[k]);
          // Entries the list doesn't show (unreadable ones) keep their place at the end.
          const rest = l.filter((_, k) => !order.includes(k));
          l.splice(0, l.length, ...copy, ...rest);
        }, { path: schema.path });
        flash(rowsEl.querySelector(`[data-key="${li.dataset.key}"]`));
        announce("Order saved");
      };
      li.style.transform = "";
      if (g && !reduced() && Math.abs(offset) > 1) g.fromTo(li, { y: offset }, { y: 0, duration: 0.2, ease: "power2.out", clearProps: "transform", onComplete: finish });
      else finish();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const onSearch = debounce(() => renderRows(), 110);
  const onInput = (e) => {
    if (e.target.matches("[data-q]")) {
      ui.q = e.target.value;
      onSearch();
    }
  };
  const onChange = (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) {
      ui.filters[f.dataset.filter] = f.value;
      renderRows();
    }
  };

  host.addEventListener("click", onClick);
  host.addEventListener("input", onInput);
  host.addEventListener("change", onChange);
  host.addEventListener("pointerdown", onPointerDown);

  const unsub = subscribe((kind, info) => {
    if (kind === "replace") rerender();
    else if (kind === "content") {
      const k = info && info.path ? String(info.path).split(".")[0] : null;
      if (!k || deps.has(k)) rerender();
    }
  });

  rerender();

  if (openKey != null) {
    const list = listOf(schema);
    const i = list.findIndex((x) => isEntry(x) && x.id === openKey);
    if (i >= 0) setTimeout(() => openEditor(i), 60);
    else if (onRoute) onRoute(null); // a link to an item that's gone: show the list's own address
  }

  return {
    open: (id) => {
      const i = listOf(schema).findIndex((x) => x && x.id === id);
      if (i >= 0) openEditor(i);
    },
    add: (prefill) => openEditor(null, { prefill }),
    refresh: rerender,
    destroy() {
      unsub();
      host.removeEventListener("click", onClick);
      host.removeEventListener("input", onInput);
      host.removeEventListener("change", onChange);
      host.removeEventListener("pointerdown", onPointerDown);
    },
  };
}

function resolveSource(src, content) {
  if (Array.isArray(src)) return src.map((x) => (typeof x === "string" ? { value: x, label: x } : x));
  const map = {
    levels: (c) => c.levels.filter(isEntry).map((l) => ({ value: l.id, label: l.name })),
    categories: (c) => c.categories.filter(isEntry).map((x) => ({ value: x.id, label: x.name })),
    tutors: (c) => c.tutors.filter(isEntry).map((t) => ({ value: t.id, label: t.name })),
  };
  return map[src] ? map[src](content) : [];
}
