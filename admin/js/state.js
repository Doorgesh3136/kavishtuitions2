// Working copy of the site content, autosaved to the local draft, compared against the published file.

import * as store from "../../assets/js/store.js";

/** Top-level sections, in the order the admin talks about them. */
export const SECTIONS = {
  site: { label: "Site details", route: "site" },
  hero: { label: "Homepage hero", route: "site/homepage" },
  stats: { label: "Numbers", route: "site/method" },
  method: { label: "Method steps", route: "site/method" },
  levels: { label: "Levels", route: "site/levels" },
  categories: { label: "Subjects", route: "site/levels" },
  courses: { label: "Courses", route: "courses" },
  timetable: { label: "Timetable", route: "timetable" },
  tutors: { label: "Tutors", route: "tutors" },
  testimonials: { label: "Testimonials", route: "testimonials" },
  plans: { label: "Plans", route: "plans" },
  resources: { label: "Resources", route: "resources" },
  quiz: { label: "Quiz", route: "quiz" },
  faqs: { label: "FAQs", route: "faqs" },
  meta: { label: "Launch checklist", route: "overview" },
  admin: { label: "Password", route: "security" },
};

const PUBLISH_KEY = "kt.admin.lastPublish.v1";
const PAGES_DELAY_MS = 3 * 60e3;

export const state = {
  working: null,
  published: null, // normalised copy of what is live (or was just committed)
  source: "published",
  savedAt: null,
  saving: false,
  saveError: false,
  publishedAt: null, // set when this browser committed recently and Pages may still be building
  commitUrl: null,
};

const subs = new Set();
let timer = null;

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function notify(kind, info = {}) {
  for (const fn of [...subs]) {
    try {
      fn(kind, info);
    } catch (e) {
      console.error(e);
    }
  }
}

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeLocal(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function init({ content, published, source }) {
  state.working = store.normalizeContent(store.deepClone(content));
  state.published = published ? store.normalizeContent(store.deepClone(published)) : null;
  state.source = source;
  state.savedAt = store.getDraftInfo()?.savedAt || null;
  state.publishedAt = null;
  state.commitUrl = null;

  // A publish from this browser may not have reached GitHub Pages yet: use the committed copy as the
  // baseline for a while so the status doesn't claim the just-published edits are "not live".
  const rec = readLocal(PUBLISH_KEY);
  if (rec && rec.content) {
    const committed = store.normalizeContent(rec.content);
    const age = Date.now() - Date.parse(rec.at || 0);
    if (state.published && store.sameContent(committed, state.published)) {
      writeLocal(PUBLISH_KEY, null);
    } else if (age < 20 * 60e3) {
      state.published = committed;
      state.publishedAt = rec.at;
      state.commitUrl = rec.commitUrl || null;
    } else {
      writeLocal(PUBLISH_KEY, null);
    }
  }
}

export const working = () => state.working;

/** Section keys whose content differs from the published copy. null = published copy unavailable. */
export function changedSections() {
  if (!state.published) return null;
  const keys = new Set([...Object.keys(SECTIONS), ...Object.keys(state.working || {})]);
  return [...keys].filter((k) => store.stableStringify(state.working?.[k]) !== store.stableStringify(state.published?.[k]));
}

export const sectionLabel = (k) => SECTIONS[k]?.label || k;

/** Apply a change to the working copy and autosave it (debounced). */
export function commit(mutator, info = {}) {
  mutator(state.working);
  saveSoon();
  notify("content", info);
}

/** Replace the whole working copy (import, pull, discard). Saves immediately. */
export function replaceWorking(content, info = {}) {
  state.working = store.normalizeContent(store.deepClone(content));
  flush();
  notify("replace", info);
}

export function saveSoon() {
  clearTimeout(timer);
  state.saving = true;
  notify("saving");
  timer = setTimeout(flush, 420);
}

/** Write the draft now. A working copy identical to the live one clears the draft instead. */
export function flush() {
  clearTimeout(timer);
  timer = null;
  if (!state.working) return;
  const changed = changedSections();
  let ok = true;
  if (changed && changed.length === 0 && !state.publishedAt) {
    store.clearDraft();
    state.savedAt = null;
  } else {
    ok = store.saveDraft(state.working);
    state.savedAt = store.getDraftInfo()?.savedAt || new Date().toISOString();
  }
  state.saving = false;
  state.saveError = !ok;
  notify("saved", { ok });
  return ok;
}

export const hasPendingSave = () => timer !== null;

/** After a successful publish: the committed content becomes the baseline. */
export function markPublished(content, commitUrl) {
  state.working = store.normalizeContent(store.deepClone(content));
  state.published = store.normalizeContent(store.deepClone(content));
  state.publishedAt = new Date().toISOString();
  state.commitUrl = commitUrl || null;
  writeLocal(PUBLISH_KEY, { at: state.publishedAt, commitUrl, content });
  // publishContent already saved the committed copy as the draft (the public site previews it until Pages catches up).
  state.savedAt = store.getDraftInfo()?.savedAt || state.publishedAt;
  notify("published");
  notify("replace", { source: "publish" });
}

/** Replace the baseline with a freshly fetched published copy (e.g. after "Discard local changes"). */
export function setPublished(published) {
  state.published = published ? store.normalizeContent(store.deepClone(published)) : null;
  notify("saved", { ok: true });
}

/** The copy this browser committed recently (Pages may not serve it yet), or null. */
export function lastCommitted() {
  if (!state.publishedAt) return null;
  const rec = readLocal(PUBLISH_KEY);
  return rec && rec.content ? rec.content : null;
}

/** True while GitHub Pages is probably still deploying a commit made from this browser. */
export function pagesPending() {
  if (!state.publishedAt) return false;
  return Date.now() - Date.parse(state.publishedAt) < PAGES_DELAY_MS;
}

/** The status line shown in the top bar / sidebar. Always tells the truth. */
export function status() {
  if (state.saveError) {
    return { tone: "error", short: "Not saved", text: "Couldn't save in this browser — download a copy from Publish" };
  }
  const changed = changedSections();
  if (changed === null) {
    return { tone: "warn", short: "Live copy unavailable", text: "Couldn't load the live content.json to compare — your edits are saved in this browser" };
  }
  if (changed.length === 0) {
    if (pagesPending()) return { tone: "live", short: "Published", text: "Published — the live site updates in a minute or two" };
    return { tone: "live", short: "All live", text: "All changes are live" };
  }
  const n = changed.length;
  return {
    tone: "draft",
    short: `${n} unpublished`,
    text: `${n} ${n === 1 ? "section" : "sections"} changed — saved in this browser, not live yet`,
    changed,
  };
}

/* ------------------------------------------------------------------ diff for the Publish page */

const titleOf = (item) =>
  item?.title || item?.name || item?.q || item?.prompt || item?.label || item?.quote?.slice(0, 48) || item?.id || "item";

/**
 * Human summary of what changed in one section, e.g.
 * ["Edited: Mathematics, Physics", "Added: Statistics", "Order changed"].
 */
export function describeChange(key) {
  const a = state.published?.[key];
  const b = state.working?.[key];
  const out = [];
  if (Array.isArray(a) && Array.isArray(b)) {
    const keyed = b.every((x) => x && x.id) && a.every((x) => x && x.id);
    if (keyed) {
      const A = new Map(a.map((x) => [x.id, x]));
      const B = new Map(b.map((x) => [x.id, x]));
      const added = b.filter((x) => !A.has(x.id));
      const removed = a.filter((x) => !B.has(x.id));
      const edited = b.filter((x) => A.has(x.id) && store.stableStringify(x) !== store.stableStringify(A.get(x.id)));
      if (edited.length) out.push({ kind: "Edited", items: edited.map(titleOf) });
      if (added.length) out.push({ kind: "Added", items: added.map(titleOf) });
      if (removed.length) out.push({ kind: "Removed", items: removed.map(titleOf) });
      const orderA = a.filter((x) => B.has(x.id)).map((x) => x.id).join("|");
      const orderB = b.filter((x) => A.has(x.id)).map((x) => x.id).join("|");
      if (orderA !== orderB) out.push({ kind: "Reordered", items: [] });
    } else {
      const n = Math.max(a.length, b.length);
      let edited = 0;
      for (let i = 0; i < n; i++) if (store.stableStringify(a[i]) !== store.stableStringify(b[i])) edited++;
      if (b.length !== a.length) out.push({ kind: "Count", items: [`${a.length} → ${b.length}`] });
      if (edited) out.push({ kind: "Edited", items: [`${edited} ${edited === 1 ? "entry" : "entries"}`] });
    }
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    const fields = [];
    const walk = (x, y, prefix) => {
      const keys = new Set([...Object.keys(x || {}), ...Object.keys(y || {})]);
      for (const k of keys) {
        const p = prefix ? `${prefix}.${k}` : k;
        const xv = x?.[k];
        const yv = y?.[k];
        if (store.stableStringify(xv) === store.stableStringify(yv)) continue;
        if (xv && yv && typeof xv === "object" && typeof yv === "object" && !Array.isArray(xv) && !Array.isArray(yv)) walk(xv, yv, p);
        else fields.push(p);
      }
    };
    walk(a, b, "");
    const human = (p) =>
      ({ sample: "sample content", updatedAt: "last published date", "primaryCta.label": "main button", "primaryCta.href": "main button link", "secondaryCta.label": "second button", "secondaryCta.href": "second button link", formEndpoint: "form endpoint", mapUrl: "map link" })[p] ||
      p.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(".").join(" › ");
    if (key === "admin") out.push({ kind: "Changed", items: ["admin password"] });
    else if (fields.length) out.push({ kind: "Changed", items: fields.map(human) });
  } else {
    out.push({ kind: "Changed", items: [] });
  }
  return out;
}
