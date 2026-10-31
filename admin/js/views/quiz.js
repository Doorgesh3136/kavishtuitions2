// Quiz editor: title/intro (autosaved), questions (collection with filters), result bands + coverage check.

import { html, icon, render } from "../../../assets/js/ui.js";
import * as store from "../../../assets/js/store.js";
import { state, commit, subscribe } from "../state.js";
import { $ } from "../dom.js";
import { renderFields, bindForm, applyValue } from "../fields.js";
import { mountCollection } from "../collection.js";
import { questions, results, entries } from "../schemas.js";
import { viewHead, siteLink } from "./common.js";

const metaFields = [
  { key: "quiz.title", label: "Quiz title", required: true, width: "two" },
  { key: "quiz.intro", label: "Introduction", type: "textarea", rows: 3, hint: "Shown before the first question. Say how long it takes and that there's no sign-up." },
];

/** Check that the result bands cover 0–100 exactly once. */
export function coverage(bands) {
  const list = (bands || [])
    .map((b, i) => ({ i, min: Number(b.min), max: Number(b.max), title: b.title }))
    .filter((b) => Number.isFinite(b.min) && Number.isFinite(b.max))
    .sort((a, b) => a.min - b.min || a.max - b.max);
  const problems = [];
  let next = 0;
  for (const b of list) {
    if (b.max < b.min) {
      problems.push(`“${b.title || `Band ${b.i + 1}`}” ends before it starts (${b.min}–${b.max}%).`);
      continue;
    }
    if (b.min > next) problems.push(`Scores ${next}–${b.min - 1}% aren't covered by any band.`);
    else if (b.min < next) problems.push(`“${b.title || `Band ${b.i + 1}`}” overlaps the band before it at ${b.min}${b.min === next - 1 ? "" : `–${Math.min(next - 1, b.max)}`}%.`);
    next = Math.max(next, b.max + 1);
  }
  if (!list.length) problems.push("There are no result bands, so the quiz can't show a result.");
  else if (next <= 100) problems.push(`Scores ${next}–100% aren't covered by any band.`);
  return { ok: problems.length === 0, problems, list };
}

function rulerTpl(c) {
  const bands = c.quiz?.results || [];
  const cov = coverage(bands);
  const segs = cov.list.filter((b) => b.max >= b.min);
  return html`<div class="ruler-wrap">
    <div class="ruler" aria-hidden="true">
      ${segs.map((b, k) => html`<span class="ruler__seg ruler__seg--${k % 3}" style="${`--a:${Math.max(0, b.min)};--b:${Math.min(100, b.max + 1)}`}"><span class="ruler__lab">${b.title || `Band ${b.i + 1}`}</span></span>`)}
      ${[0, 25, 50, 75, 100].map((t) => html`<span class="ruler__tick" style="${`--a:${t}`}"><span>${t}</span></span>`)}
    </div>
    ${cov.ok
      ? html`<p class="ok-line">${icon("check", { size: 16 })}Every score from 0 to 100% gets exactly one result.</p>`
      : html`<div class="issues" role="status"><p class="issues__k">Result bands need attention</p><ul>${cov.problems.map((p) => html`<li>${p}</li>`)}</ul></div>`}
  </div>`;
}

/** The public quiz asks at most this many per run (assets/js/views/quiz.js, MAX_QUESTIONS). */
const PER_RUN = 10;

function statsTpl(c) {
  const qs = entries(c.quiz?.questions);
  const byLevel = entries(c.levels).map((l) => ({ name: l.name, n: qs.filter((q) => q.level === l.id).length }));
  return html`<p class="quiz-stats"><span class="num">${qs.length}</span> questions${byLevel.map((l) => html` · <span class="num">${l.n}</span> at ${l.name}`)}${qs.length > PER_RUN ? html` · a mixed run asks <span class="num">${PER_RUN}</span> of them` : ""}</p>`;
}

export default {
  id: "quiz",
  title: "Quiz",
  render(ctx) {
    const c = state.working;
    return html`${viewHead(ctx, {
      title: "Placement check",
      italic: "check",
      lead: `The short quiz that suggests a level. Visitors pick a subject or a mixed paper; questions run level by level, easiest first, and in this order within each level. A run asks up to ${PER_RUN}, spread evenly through them. The score picks the result band below.`,
      actions: siteLink("../#/quiz", "Try the quiz"),
    })}
    <section class="block block--split" data-a-intro aria-labelledby="qz-a">
      <header class="block__head"><p class="block__letter">A</p><h2 class="block__title" id="qz-a">Title & introduction</h2><p class="block__state" data-meta-state aria-live="polite">Saved as you type</p></header>
      <form class="page-form" novalidate data-meta-form>${renderFields(metaFields, c, c)}</form>
    </section>
    <section class="block" data-a-intro aria-labelledby="qz-b">
      <header class="block__head"><p class="block__letter">B</p><h2 class="block__title" id="qz-b">Questions</h2><div data-quiz-stats>${statsTpl(c)}</div></header>
      <div data-questions></div>
    </section>
    <section class="block" data-a-intro aria-labelledby="qz-c">
      <header class="block__head"><p class="block__letter">C</p><h2 class="block__title" id="qz-c">Result bands</h2><p class="block__aside">Percent of questions answered correctly.</p></header>
      <div data-ruler>${rulerTpl(c)}</div>
      <div data-results></div>
    </section>`;
  },
  mount(root, ctx) {
    const metaForm = $("[data-meta-form]", root);
    const metaState = $("[data-meta-state]", root);
    const form = bindForm(metaForm, metaFields, {
      item: () => state.working,
      content: () => state.working,
      onField: (field, value, error) => {
        if (error) {
          metaState.textContent = "Not saved — fix the field above";
          metaState.dataset.tone = "error";
          return;
        }
        commit((c) => applyValue(field, c, value), { path: "quiz", source: "form" });
        metaState.textContent = "Saved in this browser";
        metaState.dataset.tone = "";
      },
    });
    const qs = mountCollection($("[data-questions]", root), questions, {
      compact: true,
      openKey: ctx.params[0] ? decodeURIComponent(ctx.params[0]) : null,
      onRoute: (id) => ctx.replaceRoute(id ? `quiz/${encodeURIComponent(id)}` : "quiz"),
    });
    const rs = mountCollection($("[data-results]", root), results, { compact: true });
    const unsub = subscribe((kind, info) => {
      if (kind === "replace" || (kind === "content" && (!info.path || String(info.path).startsWith("quiz") || info.path === "levels"))) {
        render($("[data-ruler]", root), rulerTpl(state.working));
        render($("[data-quiz-stats]", root), statsTpl(state.working));
      }
      if (kind === "replace") {
        // Reflect replaced title/intro in the form.
        const t = form.field("quiz.title")?.querySelector("input");
        const i = form.field("quiz.intro")?.querySelector("textarea");
        if (t) t.value = state.working.quiz?.title || "";
        if (i) i.value = state.working.quiz?.intro || "";
      }
    });
    this._qs = qs;
    return () => {
      unsub();
      form.destroy();
      qs.destroy();
      rs.destroy();
    };
  },
  onParams(params) {
    if (params[0] && this._qs) this._qs.open(decodeURIComponent(params[0]));
  },
  /** Fields left invalid (unsaved) when leaving the page. */
  pendingErrors(root) {
    return root.querySelectorAll("[data-meta-form] .is-invalid").length;
  },
};
