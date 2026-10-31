// Timetable: a visual week grid (Mon–Sat, 08:00–21:00) and a plain list, with clash warnings.

import { html, icon, render } from "../../../assets/js/ui.js";
import * as store from "../../../assets/js/store.js";
import { state, subscribe } from "../state.js";
import { $, $$, riseIn, two } from "../dom.js";
import { openItemEditor, deleteItem, listOf } from "../collection.js";
import { sessions as schema, toMin, entries } from "../schemas.js";
import { viewHead, siteLink } from "./common.js";

const VIEW_KEY = "kt.admin.ttView.v1";
const fmt = (m) => `${two(Math.floor(m / 60))}:${two(m % 60)}`;

/** A room both sessions can't be in at once. Online-only sessions ("Online · Zoom") don't share a room. */
const roomKey = (r) => String(r || "").trim().replace(/\s+/g, " ").toLowerCase();
const onlineOnly = (r) => /^(online|zoom|google meet|meet|teams)\b/.test(r);

/** Clashes and broken sessions. Returns { issues: [{kind, text, ids}], bad: Set<id> } */
export function analyse(c) {
  const list = entries(c.timetable);
  const issues = [];
  const bad = new Set();
  for (const s of list) {
    const course = store.byId(c.courses, s.courseId);
    if (!course) {
      issues.push({ kind: "missing", text: `${store.dayName(s.day)} ${s.start}: the course for this session no longer exists.`, ids: [s.id] });
      bad.add(s.id);
    }
    if (!(toMin(s.end) > toMin(s.start))) {
      issues.push({ kind: "time", text: `${store.dayName(s.day)} ${s.start}–${s.end}${course ? ` (${course.title})` : ""}: the end time is not after the start time.`, ids: [s.id] });
      bad.add(s.id);
    }
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.day !== b.day) continue;
      if (!(toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end))) continue;
      const ca = store.byId(c.courses, a.courseId);
      const cb = store.byId(c.courses, b.courseId);
      const sameTutor = !!(ca && cb && ca.tutorId && ca.tutorId === cb.tutorId);
      const room = roomKey(a.room);
      if (!sameTutor && room && room === roomKey(b.room) && !onlineOnly(room)) {
        const what = (x, s) => `${x ? `${x.title}${x.code ? ` (${x.code})` : ""}` : "a session"} ${s.start}–${s.end}`;
        issues.push({
          kind: "room",
          text: `${String(a.room).trim()} is booked twice on ${store.dayName(a.day)}: ${what(ca, a)} and ${what(cb, b)}.`,
          ids: [a.id, b.id],
        });
        bad.add(a.id);
        bad.add(b.id);
      }
      if (!sameTutor) continue;
      const t = store.byId(c.tutors, ca.tutorId);
      issues.push({
        kind: "clash",
        text: `${t ? t.name : "The same tutor"} is booked twice on ${store.dayName(a.day)}: ${ca.title}${ca.code ? ` (${ca.code})` : ""} ${a.start}–${a.end} and ${cb.title}${cb.code ? ` (${cb.code})` : ""} ${b.start}–${b.end}.`,
        ids: [a.id, b.id],
      });
      bad.add(a.id);
      bad.add(b.id);
    }
  }
  return { issues, bad };
}

/** Lay out overlapping sessions side by side within a day column. */
function lanes(items) {
  const sorted = [...items].sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(b.end) - toMin(a.end));
  const out = new Map();
  let cluster = [];
  let clusterEnd = -1;
  const flushCluster = () => {
    const laneEnds = [];
    const assigned = cluster.map((s) => {
      let lane = laneEnds.findIndex((end) => end <= toMin(s.start));
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = Math.max(toMin(s.end), toMin(s.start) + 15);
      return [s, lane];
    });
    for (const [s, lane] of assigned) out.set(s, { lane, count: laneEnds.length });
    cluster = [];
    clusterEnd = -1;
  };
  for (const s of sorted) {
    const a = toMin(s.start);
    if (cluster.length && a >= clusterEnd) flushCluster();
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, Math.max(toMin(s.end), a + 15));
  }
  if (cluster.length) flushCluster();
  return out;
}

const levelTone = (c, course) => {
  if (!course) return "missing";
  const i = (c.levels || []).findIndex((l) => l.id === course.level);
  return ["l0", "l1", "l2"][i] || "l1";
};

function gridTpl(c, analysis) {
  const list = entries(c.timetable);
  const days = store.DAYS.filter((d) => d.id !== "sun" || list.some((s) => s.day === "sun"));
  let from = 8 * 60;
  let to = 21 * 60;
  for (const s of list) {
    const a = toMin(s.start);
    const b = toMin(s.end);
    if (Number.isFinite(a)) from = Math.min(from, Math.floor(a / 60) * 60);
    if (Number.isFinite(b)) to = Math.max(to, Math.ceil(b / 60) * 60);
  }
  const hours = [];
  for (let m = from; m < to; m += 60) hours.push(m);
  const span = to - from;
  const today = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return html`<div class="tt-scroll" tabindex="0" aria-label="Week grid — scroll sideways on small screens">
    <div class="tt" style="${`--rows:${span / 60};--cols:${days.length}`}" data-from="${from}" data-to="${to}">
      <div class="tt__corner" aria-hidden="true"></div>
      ${days.map((d) => {
        const n = list.filter((s) => s.day === d.id).length;
        return html`<div class="tt__day${d.id === today ? " is-today" : ""}"><span class="tt__dayname">${d.short}</span><span class="tt__daycount">${n ? `${n}` : "–"}</span></div>`;
      })}
      <div class="tt__times" aria-hidden="true">${hours.map((m) => html`<span class="tt__time" style="${`--at:${(m - from) / span}`}">${fmt(m)}</span>`)}</div>
      ${days.map((d) => {
        const items = list.filter((s) => s.day === d.id && Number.isFinite(toMin(s.start)));
        const layout = lanes(items);
        return html`<div class="tt__col${d.id === today ? " is-today" : ""}" data-day="${d.id}" aria-label="${d.name}">
          ${hours.map((m) => html`<span class="tt__hour" aria-hidden="true"></span>`)}
          ${d.id === today && nowMin > from && nowMin < to ? html`<span class="tt__now" style="${`--at:${(nowMin - from) / span}`}" aria-hidden="true"><span>${fmt(nowMin)}</span></span>` : ""}
          ${items.map((s) => {
            const course = store.byId(c.courses, s.courseId);
            const a = toMin(s.start);
            const b = Math.max(toMin(s.end) || a + 30, a + 30);
            const { lane, count } = layout.get(s) || { lane: 0, count: 1 };
            const tone = levelTone(c, course);
            const isBad = analysis.bad.has(s.id);
            const tutor = course ? store.byId(c.tutors, course.tutorId) : null;
            // Read after the visible text, so the button's name starts with what's on it (label in name).
            const more = `, ${store.dayName(s.day)} ${s.start} to ${s.end}${course ? `, ${store.levelName(c, course.level)}` : ""}${s.room ? `, ${s.room}` : ""}${isBad ? ". Has a problem" : ""}. Edit`;
            return html`<button type="button" class="tt__s tt__s--${tone}${isBad ? " is-bad" : ""}${b - a < 75 ? " is-short" : ""}${count > 1 ? " is-narrow" : ""}" data-sid="${s.id}" title="${`${course ? `${course.code ? `${course.code} ` : ""}${course.title}` : "Missing course"} · ${s.start}–${s.end}${s.room ? ` · ${s.room}` : ""}`}"
              style="${`--top:${(a - from) / span};--h:${(b - a) / span};--lane:${lane};--lanes:${count}`}">
              <span class="tt__s-top"><span class="tt__s-code">${course?.code || (course ? store.levelExam(c, course.level).split(" ")[0] : "") || "—"}</span>${isBad ? html`<span class="tt__s-flag" aria-hidden="true">!</span>` : ""}</span>
              <span class="tt__s-title">${course ? course.title : "Missing course"}</span>
              <span class="tt__s-meta">${s.start}<span class="tt__s-end">–${s.end}</span>${tutor ? html`<span class="tt__s-who"> · ${tutor.name.split(" ")[0]}</span>` : ""}</span>
              <span class="sr-only">${more}</span>
            </button>`;
          })}
        </div>`;
      })}
    </div>
  </div>`;
}

function listTpl(c, analysis) {
  const list = entries(c.timetable);
  const days = store.DAYS.filter((d) => list.some((s) => s.day === d.id));
  if (!list.length) return "";
  return html`<div class="tt-list">
    ${days.map((d) => {
      const items = list.filter((s) => s.day === d.id).sort((a, b) => toMin(a.start) - toMin(b.start));
      return html`<section class="tt-list__day" aria-labelledby="${`ttl-${d.id}`}">
        <h2 class="tt-list__dayname" id="${`ttl-${d.id}`}">${d.name} <span>${items.length}</span></h2>
        <ol class="ledger ledger--plain">
          ${items.map((s) => {
            const course = store.byId(c.courses, s.courseId);
            const tutor = course ? store.byId(c.tutors, course.tutorId) : null;
            const isBad = analysis.bad.has(s.id);
            return html`<li class="lrow lrow--tt${isBad ? " is-warn" : ""}" data-sid="${s.id}">
              <span class="lrow__num tt-list__time">${s.start}–${s.end}</span>
              <button type="button" class="lrow__main" data-edit="${s.id}">
                <span class="sr-only">Edit </span>
                <span class="lrow__lead">${course?.code || "—"}</span>
                <span class="lrow__text"><span class="lrow__title">${course ? course.title : "Missing course"}</span><span class="lrow__meta">${[course ? store.levelName(c, course.level) : "", tutor?.name, s.room].filter(Boolean).join("  ·  ")}</span></span>
              </button>
              <span class="lrow__tags">${isBad ? html`<span class="a-tag a-tag--red">Check</span>` : ""}</span>
              <span class="lrow__acts">
                <button type="button" class="icon-btn" data-dup="${s.id}" aria-label="${`Duplicate ${course?.title || "session"} on ${d.name} ${s.start}`}" title="Duplicate">${icon("copy", { size: 18 })}</button>
                <button type="button" class="icon-btn icon-btn--danger" data-del="${s.id}" aria-label="${`Delete ${course?.title || "session"} on ${d.name} ${s.start}`}" title="Delete">${icon("trash", { size: 18 })}</button>
              </span>
            </li>`;
          })}
        </ol>
      </section>`;
    })}
  </div>`;
}

function tutorLoad(c) {
  const by = new Map();
  for (const s of entries(c.timetable)) {
    const course = store.byId(c.courses, s.courseId);
    const t = course ? store.byId(c.tutors, course.tutorId) : null;
    if (!t) continue;
    const m = Math.max(0, toMin(s.end) - toMin(s.start) || 0);
    by.set(t, (by.get(t) || 0) + m);
  }
  return [...by.entries()].map(([t, m]) => ({ name: t.name, hours: Math.round((m / 60) * 10) / 10 }));
}

function bodyTpl(c, mode) {
  const analysis = analyse(c);
  const list = entries(c.timetable);
  const hours = list.reduce((m, s) => m + Math.max(0, toMin(s.end) - toMin(s.start) || 0), 0) / 60;
  return html`
    <div class="tt-bar">
      <div class="seg seg--sm" role="group" aria-label="Layout">
        <button type="button" class="seg__opt" aria-pressed="${mode === "grid" ? "true" : "false"}" data-mode="grid">${icon("grid", { size: 16 })}<span>Week</span></button>
        <button type="button" class="seg__opt" aria-pressed="${mode === "list" ? "true" : "false"}" data-mode="list">${icon("list", { size: 16 })}<span>List</span></button>
      </div>
      <p class="tt-bar__stats"><span class="num">${list.length}</span> sessions · <span class="num">${Math.round(hours * 10) / 10}</span> h a week${tutorLoad(c).map((t) => html`<span class="tt-bar__load"> · ${t.name.split(" ")[0]} <span class="num">${t.hours}</span> h</span>`)}</p>
      <ul class="tt-legend" aria-label="Levels">
        ${(c.levels || []).slice(0, 3).map((l, i) => html`<li><span class="tt-legend__sw tt-legend__sw--l${i}" aria-hidden="true"></span>${l.name}</li>`)}
      </ul>
    </div>
    ${analysis.issues.length
      ? html`<div class="issues" role="status">
          <p class="issues__k">${analysis.issues.length} ${analysis.issues.length === 1 ? "problem" : "problems"} to check</p>
          <ul>${analysis.issues.map((i) => html`<li><button type="button" class="issues__btn" data-sid-jump="${i.ids[0]}">${i.text}</button></li>`)}</ul>
        </div>`
      : list.length
        ? html`<p class="ok-line">${icon("check", { size: 16 })}No clashes: no tutor or room is booked twice at the same time.</p>`
        : ""}
    ${list.length
      ? mode === "grid"
        ? gridTpl(c, analysis)
        : listTpl(c, analysis)
      : html`<div class="empty"><p class="empty__title">The timetable is empty.</p><p class="empty__text">Add the first session. Course pages show their times from here.</p><button type="button" class="a-btn a-btn--ghost a-btn--sm" data-add>${icon("plus", { size: 16 })}<span>Add session</span></button></div>`}
  `;
}

function clashNotes(draft, c, index) {
  const tmp = { ...c, timetable: (c.timetable || []).map((s, i) => (i === index ? draft : s)) };
  if (index < 0) tmp.timetable = [...(c.timetable || []), { ...draft, id: draft.id || "__new" }];
  const id = index < 0 ? draft.id || "__new" : (c.timetable || [])[index]?.id;
  const mine = analyse(tmp).issues.filter((i) => i.ids.includes(id) && (i.kind === "clash" || i.kind === "room"));
  const course = store.byId(c.courses, draft.courseId);
  const tutor = course ? store.byId(c.tutors, course.tutorId) : null;
  return html`${mine.map((i) => html`<p class="note note--warn"><span class="note__k">${i.kind === "room" ? "Room" : "Clash"}</span>${i.text}</p>`)}
    ${course ? html`<p class="note"><span class="note__k">Course</span>${store.levelName(c, course.level)} · ${tutor ? `taught by ${tutor.name}` : "no tutor set"} · ${course.seatsLeft} of ${course.seats} places left</p>` : ""}`;
}

const sessionSchema = { ...schema, notes: clashNotes };

export default {
  id: "timetable",
  title: "Timetable",
  render(ctx) {
    return html`${viewHead(ctx, {
      title: "Timetable",
      lead: "The weekly lessons. Course pages and the Plans page read their times from here. Click a session to change it, or an empty slot to add one there.",
      actions: html`${siteLink("../#/plans")}<button type="button" class="a-btn a-btn--primary a-btn--sm" data-add>${icon("plus", { size: 16 })}<span>Add session</span></button>`,
    })}
    <section class="block" data-a-intro data-tt aria-label="Timetable"></section>`;
  },
  mount(root, ctx) {
    const host = $("[data-tt]", root);
    let mode = "grid";
    try {
      mode = localStorage.getItem(VIEW_KEY) || (window.innerWidth < 700 ? "list" : "grid");
    } catch {}
    const draw = () => render(host, bodyTpl(state.working, mode));
    draw();

    const indexOf = (id) => listOf(schema).findIndex((s) => s && s.id === id);
    const edit = (id) => {
      const i = indexOf(id);
      if (i < 0) return ctx.replaceRoute("timetable"); // e.g. a link to a session deleted since
      openItemEditor(sessionSchema, {
        index: i,
        onOpen: () => ctx.replaceRoute(`timetable/${encodeURIComponent(id)}`),
        onClose: () => ctx.replaceRoute("timetable"),
        onSaved: () => {
          const b = host.querySelector(`[data-sid="${CSS.escape(id)}"]`);
          b?.classList.add("is-flash");
          setTimeout(() => b?.classList.remove("is-flash"), 1600);
        },
      });
    };
    const add = (prefill = null) =>
      openItemEditor(sessionSchema, {
        prefill,
        onSaved: (s) => {
          const b = host.querySelector(`[data-sid="${CSS.escape(s.id)}"]`);
          if (b) {
            b.classList.add("is-flash");
            b.scrollIntoView({ block: "nearest", inline: "nearest" });
            setTimeout(() => b.classList.remove("is-flash"), 1600);
          }
        },
      });

    const onClick = async (e) => {
      const m = e.target.closest("[data-mode]");
      if (m) {
        mode = m.dataset.mode;
        try {
          localStorage.setItem(VIEW_KEY, mode);
        } catch {}
        draw();
        riseIn([host.querySelector(".tt-scroll, .tt-list")].filter(Boolean), { y: 8, duration: 0.45 });
        host.querySelector(`[data-mode="${mode}"]`)?.focus();
        return;
      }
      if (e.target.closest("[data-add]")) return add();
      const jump = e.target.closest("[data-sid-jump]");
      if (jump) return edit(jump.dataset.sidJump);
      const s = e.target.closest(".tt__s");
      if (s) return edit(s.dataset.sid);
      const ed = e.target.closest("[data-edit]");
      if (ed) return edit(ed.dataset.edit);
      const del = e.target.closest("[data-del]");
      if (del) {
        const i = indexOf(del.dataset.del);
        if (i >= 0) await deleteItem(sessionSchema, i);
        return;
      }
      const dup = e.target.closest("[data-dup]");
      if (dup) {
        const src = listOf(schema).find((x) => x && x.id === dup.dataset.dup);
        if (src) add({ ...store.deepClone(src), id: "" });
        return;
      }
      // Click on an empty slot in the grid → add a session there.
      const col = e.target.closest(".tt__col");
      if (col && e.target === col || (col && e.target.classList.contains("tt__hour"))) {
        const grid = col.closest(".tt");
        const from = Number(grid.dataset.from);
        const to = Number(grid.dataset.to);
        const r = col.getBoundingClientRect();
        const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
        let start = Math.floor((from + y * (to - from)) / 15) * 15;
        start = Math.min(start, to - 60);
        add({ day: col.dataset.day, start: fmt(start), end: fmt(Math.min(start + 90, to)) });
      }
    };

    // A faint ghost under the pointer shows where a click would add a session.
    const onMove = (e) => {
      const col = e.target.closest(".tt__col");
      $$(".tt__ghost", host).forEach((g) => g.remove());
      if (!col || e.target.closest(".tt__s")) return;
      const grid = col.closest(".tt");
      const from = Number(grid.dataset.from);
      const to = Number(grid.dataset.to);
      const r = col.getBoundingClientRect();
      const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      const start = Math.min(Math.floor((from + y * (to - from)) / 15) * 15, to - 60);
      const g = document.createElement("span");
      g.className = "tt__ghost";
      g.setAttribute("aria-hidden", "true");
      g.style.setProperty("--top", (start - from) / (to - from));
      g.style.setProperty("--h", 90 / (to - from));
      g.textContent = `+ ${fmt(start)}`;
      col.append(g);
    };
    const onLeave = () => $$(".tt__ghost", host).forEach((g) => g.remove());

    root.addEventListener("click", onClick);
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
      host.addEventListener("pointermove", onMove);
      host.addEventListener("pointerleave", onLeave);
    }
    const unsub = subscribe((kind) => {
      if (kind === "content" || kind === "replace") draw();
    });
    if (ctx.params[0]) setTimeout(() => edit(decodeURIComponent(ctx.params[0])), 60);
    this._edit = edit;
    return () => {
      unsub();
      root.removeEventListener("click", onClick);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  },
  onParams(params) {
    if (params[0] && this._edit) this._edit(decodeURIComponent(params[0]));
  },
};
