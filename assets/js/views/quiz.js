// Placement check (#/quiz): a short multiple-choice paper, marked as you go in red pen.
// Stages: intro (choose a paper and, optionally, a level) → one question at a time → result
// (score, the matching band, suggested groups, the marked script). The 3D scene follows along:
// each question brings one plaster model forward (scene.focus).
// Everything comes from content.quiz / content.courses and tolerates missing or partial data.

import { html, raw, icon, penCircle, penTick } from "../ui.js";
import { visible, byId, levelName, levelExam, categoryName, formatRs } from "../store.js";

const gsapRef = () => window.gsap || null;

const MAX_QUESTIONS = 10;
const SECONDS_EACH = 30;
const MAX_OPTIONS = 9;
const LETTERS = "ABCDEFGHI";
const SNAPSHOT_MS = 2500;

const pad = (n) => String(n).padStart(2, "0");
const str = (v) => (v === null || v === undefined ? "" : String(v));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const modeLabel = { online: "Online", "in-person": "In person", hybrid: "Hybrid" };
const examShort = (content, id) => str(levelExam(content, id)).split("·")[0].trim();

/** Italicise the last `n` words of a heading (serif italic accent). */
function accent(text, n = 1) {
  const words = str(text).trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words.join(" ");
  const k = Math.min(n, words.length - 1);
  return html`${words.slice(0, -k).join(" ")} <em>${words.slice(-k).join(" ")}</em>`;
}

/* Red-pen cross, in the same hand as ui.js penTick (paths carry data-draw). */
const penCross = (cls = "") =>
  raw(
    `<svg class="pen pen--cross${cls ? ` ${cls}` : ""}" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path data-draw d="M8 7c6 7 14 16 25 28" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path data-draw d="M33 6c-9 8-17 17-26 28" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`
  );
/* A line struck through a wrong answer. */
const penStrike = () =>
  raw(
    `<svg class="pen qz-strike" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path data-draw d="M2 8C40 5.5 96 7 150 5.2 170 4.6 186 4.8 198 3.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`
  );

/* ------------------------------------------------------------------ model */

function normQuestion(q, i) {
  if (!q || typeof q !== "object") return null;
  const prompt = str(q.prompt).trim();
  if (!prompt) return null;
  const raw0 = Array.isArray(q.options) ? q.options : [];
  const answer = Number(q.answer);
  const options = [];
  let ans = -1;
  raw0.forEach((o, k) => {
    const t = str(o).trim();
    if (!t || options.length >= MAX_OPTIONS) return;
    if (k === answer) ans = options.length;
    options.push(t);
  });
  if (options.length < 2 || ans < 0) return null;
  return {
    key: str(q.id) || `q${i}`,
    category: str(q.category),
    level: str(q.level),
    prompt,
    options,
    answer: ans,
    explain: str(q.explain).trim(),
    order: i,
  };
}

function model(content) {
  const quiz = (content && content.quiz) || {};
  const levels = (Array.isArray(content.levels) ? content.levels : []).filter((l) => l && l.id);
  const rank = (id) => {
    const i = levels.findIndex((l) => l.id === id);
    return i < 0 ? levels.length : i;
  };
  // Easy to hard: by level, then the order the teacher wrote them in.
  const questions = (Array.isArray(quiz.questions) ? quiz.questions : [])
    .map(normQuestion)
    .filter(Boolean)
    .sort((a, b) => rank(a.level) - rank(b.level) || a.order - b.order);
  const levelsIn = (qs) => levels.filter((l) => qs.some((q) => q.level === l.id));
  const papers = (Array.isArray(content.categories) ? content.categories : [])
    .filter((c) => c && c.id)
    .map((c) => {
      const qs = questions.filter((q) => q.category === c.id);
      return qs.length ? { id: c.id, name: str(c.name) || c.id, count: qs.length, levels: levelsIn(qs) } : null;
    })
    .filter(Boolean);
  const bands = (Array.isArray(quiz.results) ? quiz.results : [])
    .filter((r) => r && r.min !== "" && r.max !== "" && Number.isFinite(Number(r.min)) && Number.isFinite(Number(r.max)))
    .map((r) => ({ ...r, min: Number(r.min), max: Number(r.max), title: str(r.title).trim(), text: str(r.text).trim(), recommend: str(r.recommend) }))
    .sort((a, b) => a.min - b.min);
  return {
    content,
    title: str(quiz.title).trim() || "Placement check",
    intro: str(quiz.intro).trim(),
    questions,
    papers,
    levels,
    levelsIn,
    bands,
  };
}

const pool = (m, paper, level) => m.questions.filter((q) => (paper === "all" || q.category === paper) && (!level || q.level === level));

/** Evenly spaced picks so a long pool still runs easy → hard. */
function sample(list, n = MAX_QUESTIONS) {
  if (list.length <= n) return list.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.round((i * (list.length - 1)) / (n - 1))]);
  return out;
}

function normSel(m, paper, level) {
  const p = paper === "all" || m.papers.some((x) => x.id === paper) ? paper : "all";
  const l = level && pool(m, p, level).length ? level : "";
  return { paper: p, level: l };
}

function selFromQuery(m, query) {
  const get = (k) => (query && typeof query.get === "function" ? query.get(k) || "" : "");
  return normSel(m, get("subject") || "all", get("level"));
}

const paperName = (m, paper) => (paper === "all" ? "Mixed paper" : m.papers.find((p) => p.id === paper)?.name || categoryName(m.content, paper));
const levelLabel = (m, level) => (level ? levelName(m.content, level) : "All levels");

function metaFor(m, paper, level) {
  const n = sample(pool(m, paper, level)).length;
  const mins = Math.max(1, Math.round((n * SECONDS_EACH) / 60));
  return { n, count: plural(n, "question"), time: `${mins} min` };
}

function bandFor(bands, pct) {
  return bands.find((b) => pct >= b.min && pct <= b.max) || [...bands].reverse().find((b) => pct >= b.min) || bands[0] || null;
}

function tally(run, keyOf) {
  const map = new Map();
  run.qs.forEach((q, k) => {
    const key = keyOf(q);
    const t = map.get(key) || { key, right: 0, total: 0 };
    t.total += 1;
    if (run.picks[k] === q.answer) t.right += 1;
    map.set(key, t);
  });
  return [...map.values()];
}

/* The mark scheme's bands are written for the mixed paper, where the score itself points to a stage.
   A paper for one stage only says how secure that stage is, so its score is read against the stage the
   student chose, never more than one stage away: the bottom band steps back one stage (when there is
   one), a middle band stays, and the top band stays too, with the next stage's paper as the real test
   of moving up. A Grade 7–9 student who aces their paper is not sent straight to A Level. */
function relative(m, run, pct, band) {
  const order = m.levels.map((l) => l.id);
  const i = order.indexOf(run.level);
  const n = m.bands.length;
  const bi = band ? m.bands.indexOf(band) : -1;
  const tier = n >= 2 && bi >= 0 ? (bi === 0 ? "low" : bi === n - 1 ? "high" : "mid") : pct < 40 ? "low" : pct >= 75 ? "high" : "mid";
  const prev = i > 0 ? order[i - 1] : "";
  const next = i >= 0 && i < order.length - 1 ? order[i + 1] : "";
  // The next stage's paper, in the same subject when there are questions for it.
  const nextPaper = tier !== "high" || !next ? "" : pool(m, run.paper, next).length ? run.paper : pool(m, "all", next).length ? "all" : "";
  return { tier, chosen: run.level, level: tier === "low" && prev ? prev : run.level, prev, next, nextPaper };
}

/** A stage name kept on one line in running text ("Grade 10–11" never breaks at the dash). */
const stage = (m, id) => html`<span class="qz-nw">${levelName(m.content, id)}</span>`;

/** Result copy for a single-stage paper, in the voice of the mark scheme. */
function relativeCopy(m, rel) {
  const name = levelName(m.content, rel.chosen);
  const L = stage(m, rel.chosen);
  const P = rel.prev ? stage(m, rel.prev) : "";
  const N = rel.next ? stage(m, rel.next) : "";
  if (rel.tier === "high") {
    return {
      title: `Secure at ${name}`,
      accent: name.split(/\s+/).length,
      text: N
        ? html`The ${L} questions came out clean. A ${L} group keeps that method sharp. Whether ${N} work is within reach is ${rel.nextPaper ? html`what the ${N} paper is for: try it next.` : "something a free trial lesson will show."}`
        : html`You handled the ${L} questions with clean method. A ${L} group will suit you: the work there is depth and speed. Choose your subjects and come to a free trial lesson.`,
    };
  }
  if (rel.tier === "mid") {
    return {
      title: `Ready for ${name} work`,
      accent: 1,
      text: html`The core of ${L} is mostly there. What is missing is accuracy under time and knowing what each question wants, and that is what a ${L} group, with work marked every week, is for.`,
    };
  }
  return {
    title: "Start with the foundations",
    accent: 1,
    text: P
      ? html`Several of the basics under ${L} are not automatic yet, and that is what costs marks later. A term in a ${P} group, or a slower start at ${L}, will fix it faster than pushing on. Book a free trial lesson and we will confirm which.`
      : html`Several of the basics are not automatic yet, and that is what costs marks later. A ${L} group rebuilds them step by step, with short homework checked every week.`,
  };
}

const TIER_WORD = { low: "Foundations", mid: "Ready", high: "Secure" };

function result(m, run) {
  const n = run.qs.length;
  const right = run.qs.reduce((a, q, k) => a + (run.picks[k] === q.answer ? 1 : 0), 0);
  const pct = n ? Math.round((right / n) * 100) : 0;
  const band = bandFor(m.bands, pct);
  const rel = run.level ? relative(m, run, pct, band) : null;
  const byLevel = tally(run, (q) => q.level).sort((a, b) => m.levels.findIndex((l) => l.id === a.key) - m.levels.findIndex((l) => l.id === b.key));
  // Weakest subject first: that is where a group helps most.
  const byCat = tally(run, (q) => q.category).sort((a, b) => a.right / a.total - b.right / b.total || b.total - a.total);
  const lvl = rel ? rel.level : band && band.recommend;
  const courses = visible(m.content.courses).filter((c) => c && c.id);
  const cats = run.paper === "all" ? byCat.map((t) => t.key) : [run.paper];
  let recs = lvl ? courses.filter((c) => c.level === lvl && cats.includes(c.category)) : [];
  recs.sort((a, b) => cats.indexOf(a.category) - cats.indexOf(b.category));
  let fallback = false;
  if (!recs.length && lvl) {
    recs = courses.filter((c) => c.level === lvl);
    fallback = recs.length > 0;
  }
  const levelTotal = lvl ? courses.filter((c) => c.level === lvl).length : 0;
  const copy = rel
    ? relativeCopy(m, rel)
    : {
        title: band && band.title ? band.title : "Paper marked",
        accent: 1,
        text: band && band.text ? band.text : "Every group starts with a conversation about where the gaps are. Send us your score and we will suggest one.",
      };
  return { n, right, pct, band, rel, copy, byLevel, byCat, level: lvl, recs: recs.slice(0, 4), recsTotal: recs.length, levelTotal, fallback };
}

/* ------------------------------------------------------------------ markup: intro */

function introStage(m, sel, first) {
  const I = first ? raw(" data-intro") : "";
  const split = first ? raw(' data-split="intro"') : "";
  const head = html`
    <p class="eyebrow qz-intro__eyebrow"${I}><span class="eyebrow__num">06</span>Placement check</p>
    <h1 class="h1 qz-intro__title" id="qz-h1"${split}>${accent(m.title, 2)}</h1>`;
  if (!m.questions.length) {
    return html`<div class="qz-intro qz-intro--empty">
      ${head}
      <div class="qz-sheet">
        <div class="empty-state qz-empty"${I}>
          <p class="empty-state__mark">Paper not set yet</p>
          <p class="empty-state__title">The questions are still being written.</p>
          <p class="empty-state__text">Meanwhile, each course page lists the topics it covers, level by level.</p>
          <a class="link-arrow" href="#/courses"><span>Browse the courses</span>${icon("arrow-right", { size: 16 })}</a>
        </div>
      </div>
    </div>`;
  }
  const allLevels = m.levelsIn(m.questions);
  const examList = (lv) => lv.map((l) => examShort(m.content, l.id) || l.name).join(" · ");
  const rows = [
    { id: "all", name: "Mixed", desc: m.papers.length > 1 ? "A little of every subject" : "Every question", levels: allLevels },
    ...m.papers.map((p) => ({ id: p.id, name: p.name, desc: "", levels: p.levels })),
  ];
  return html`<div class="qz-intro">
    ${head}
    <div class="qz-sheet">
      ${m.intro ? html`<p class="lead qz-intro__lead"${I}>${m.intro}</p>` : ""}
      <form class="qz-setup" novalidate aria-label="Choose a paper"${I}>
        ${allLevels.length > 1
          ? html`<fieldset class="qz-set qz-set--level">
              <legend class="qz-set__legend"><span class="qz-set__key">A</span><span>Level</span><span class="qz-set__opt">optional</span></legend>
              <div class="qz-levels">${levelChips(m, sel)}</div>
            </fieldset>`
          : ""}
        <fieldset class="qz-set">
          <legend class="qz-set__legend"><span class="qz-set__key">${allLevels.length > 1 ? "B" : "A"}</span><span>Choose a paper to start</span></legend>
          <div class="qz-papers">
            ${rows.map((r, i) => {
              const meta = metaFor(m, r.id, sel.level);
              return html`<button class="qz-paper${sel.paper === r.id ? " is-current" : ""}" type="submit" name="qz-paper" value="${r.id}" ${meta.n ? "" : raw("disabled")}>
                <span class="qz-paper__no" aria-hidden="true">${pad(i + 1)}</span>
                <span class="qz-paper__name">${r.name}</span>
                <span class="qz-paper__desc">${r.desc || examList(r.levels)}</span>
                <span class="qz-paper__count" data-paper-meta="${r.id}"><span>${meta.count}</span><span class="qz-paper__time"> · ${meta.time}</span></span>
                <span class="qz-paper__go" aria-hidden="true">${icon("arrow-right", { size: 16 })}</span>
              </button>`;
            })}
          </div>
        </fieldset>
      </form>
    </div>
  </div>`;
}

function levelChips(m, sel) {
  const lv = m.levelsIn(m.questions);
  return html`<label class="qz-chip">
      <input type="radio" name="qz-level" value="" ${sel.level ? "" : raw("checked")} /><span>All levels</span>
    </label>
    ${lv.map(
      (l) => html`<label class="qz-chip">
        <input type="radio" name="qz-level" value="${l.id}" ${sel.level === l.id ? raw("checked") : ""} />
        <span>${l.name}</span><span class="qz-chip__n">${pool(m, "all", l.id).length}</span>
      </label>`
    )}`;
}

/* ------------------------------------------------------------------ markup: question */

function ledger(run) {
  return html`<div class="qz-ledger" aria-hidden="true">
    <p class="qz-ledger__cap">For examiner’s use</p>
    <div class="qz-ledger__grid" style="--n:${run.qs.length}">
      <span class="qz-ledger__th">Q</span>
      ${run.qs.map((q, k) => html`<span class="qz-ledger__q${k === run.i ? " is-current" : ""}">${k + 1}</span>`)}
      <span class="qz-ledger__th">Mark</span>
      ${run.qs.map((q, k) => {
        const p = run.picks[k];
        const done = k < run.i || (k === run.i && run.marked);
        const state = !done || p === undefined ? "" : p === q.answer ? "right" : "wrong";
        return html`<span class="qz-ledger__m" data-k="${k}" data-state="${state}">${state === "right" ? penTick() : state === "wrong" ? penCross() : ""}</span>`;
      })}
    </div>
  </div>`;
}

function runStage(m, run) {
  const n = run.qs.length;
  const done = run.i + (run.marked ? 1 : 0);
  return html`<div class="qz-run">
    <h1 class="sr-only" id="qz-h1" tabindex="-1">Placement check: ${paperName(m, run.paper)}, ${levelLabel(m, run.level)}</h1>
    <div class="qz-run__head">
      <p class="qz-run__count" aria-hidden="true">
        <span class="qz-run__q">Q.</span><span class="qz-roll"><span class="qz-roll__n">${pad(run.i + 1)}</span></span><span class="qz-run__of">/ ${pad(n)}</span>
      </p>
      <p class="qz-run__paper">
        <span class="qz-run__name">${paperName(m, run.paper)}</span>
        <span class="qz-run__level">${levelLabel(m, run.level)}</span>
      </p>
      ${ledger(run)}
    </div>
    <div class="qz-bar" role="progressbar" aria-label="Questions marked" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${done}">
      <span class="qz-bar__fill" style="transform:scaleX(${n ? done / n : 0})"></span>
    </div>
    <form class="qz-q" novalidate>
      <div class="qz-q__body">${questionBody(m, run)}</div>
      <div class="qz-q__actions">
        <button class="btn btn--primary qz-q__go" type="submit" data-go ${run.picks[run.i] === undefined ? raw("disabled") : ""}>
          <span data-go-label>Mark it</span><span class="btn__icon" data-go-icon>${icon("check", { size: 16 })}</span>
        </button>
        <p class="qz-q__keys" id="qz-keys">
          <kbd>1</kbd>–<kbd>${Math.min(9, run.qs[run.i].options.length)}</kbd> to choose, <kbd>Enter</kbd> to mark
        </p>
        <button class="qz-q__quit" type="button" data-action="restart">Start over</button>
      </div>
    </form>
  </div>`;
}

function questionBody(m, run) {
  const q = run.qs[run.i];
  const lv = q.level ? levelName(m.content, q.level) : "";
  const cat = q.category ? categoryName(m.content, q.category) : "";
  const pick = run.picks[run.i];
  return html`
    <p class="qz-q__meta">${lv ? html`<span>${lv}</span>` : ""}${cat ? html`<span>${cat}</span>` : ""}<span class="marks">1</span></p>
    <h2 class="qz-q__prompt" id="qz-prompt" tabindex="-1">${q.prompt}</h2>
    <div class="qz-opts" role="radiogroup" aria-labelledby="qz-prompt" aria-describedby="qz-keys">
      ${q.options.map(
        (o, k) => html`<label class="qz-opt${pick === k ? " is-picked" : ""}" data-k="${k}">
          <input class="qz-opt__input" type="radio" name="qz-answer" value="${k}" ${pick === k ? raw("checked") : ""} />
          <span class="qz-opt__key">${LETTERS[k]}</span>
          <span class="qz-opt__text"><span class="qz-opt__t">${o}</span></span>
          <span class="qz-opt__mark" aria-hidden="true"></span>
          <span class="qz-opt__kbd" aria-hidden="true">${k + 1}</span>
        </label>`
      )}
    </div>
    <div class="qz-fb" hidden></div>`;
}

function feedback(q, k) {
  const right = k === q.answer;
  return html`<p class="qz-fb__verdict">
      <span class="qz-fb__word">${right ? "Correct." : "Not quite."}</span>
      ${right ? "" : html`<span class="qz-fb__ans">The answer is ${LETTERS[q.answer]}.</span>`}
      <span class="qz-fb__marks">${right ? "1" : "0"} / 1</span>
    </p>
    ${q.explain ? html`<p class="qz-fb__explain">${q.explain}</p>` : ""}`;
}

/* ------------------------------------------------------------------ markup: result */

function scale(m, pct, rel) {
  const bands = m.bands;
  const n = bands.length;
  // A single-stage paper is read against that stage, so its bands are named for what they mean there.
  const label = (b, i) =>
    rel
      ? TIER_WORD[i === 0 ? "low" : i === n - 1 ? "high" : "mid"]
      : examShort(m.content, b.recommend) || levelName(m.content, b.recommend) || `${b.min}–${b.max}`;
  return html`<div class="qz-scale" style="--x:${Math.max(0, Math.min(100, pct))}%" aria-hidden="true">
    <div class="qz-scale__track">
      ${bands.map(
        (b, i) => html`<span class="qz-scale__band${pct >= b.min && pct <= b.max ? " is-hit" : ""}" style="left:${Math.max(0, b.min)}%;width:${Math.max(0, Math.min(100, b.max + (b.max >= 100 ? 0 : 1)) - Math.max(0, b.min))}%">
          <span class="qz-scale__label">${label(b, i)}</span>
        </span>`
      )}
      <span class="qz-scale__you"></span>
    </div>
    <div class="qz-scale__nums"><span>0</span><span>50</span><span>100</span></div>
  </div>`;
}

function resultStage(m, run, res) {
  const { title, text } = res.copy;
  const rel = res.rel;
  const nextName = rel && rel.nextPaper ? levelName(m.content, rel.next) : "";
  // Each segment keeps its words together, so a wrap never strands one word ("Levels") on a line.
  const seg = (t) => html`<span class="qz-res__seg">${t}</span>`;
  return html`<div class="qz-res">
    <p class="eyebrow qz-res__eyebrow"><span class="eyebrow__num">${pad(res.n)}</span><span>${seg("Marked")} · ${seg(paperName(m, run.paper))} · ${seg(levelLabel(m, run.level))}</span></p>
    <div class="qz-res__score">
      <p class="qz-res__fig" aria-hidden="true">
        <span class="pen-mark qz-res__circle"><span class="qz-res__num">${res.right}</span>${penCircle()}</span><span class="qz-res__out">/${res.n}</span>
      </p>
      <div class="qz-res__side">
        <p class="qz-res__pct"><span class="num" data-count-suffix="%">${res.pct}%</span></p>
        ${m.bands.length > 1 || (m.bands.length && !rel) ? scale(m, res.pct, rel) : ""}
      </div>
      <p class="sr-only">You scored ${res.right} out of ${res.n}: ${res.pct} percent.</p>
    </div>
    <h1 class="h1 qz-res__title" id="qz-h1" tabindex="-1">${accent(title, res.copy.accent)}</h1>
    <p class="lead qz-res__text">${text}</p>
    ${res.byLevel.length > 1
      ? html`<dl class="qz-res__levels">
          ${res.byLevel.map(
            (t) => html`<div class="qz-res__lv">
              <dt>${t.key ? levelName(m.content, t.key) : "Other"}</dt>
              <dd><span class="num">${t.right}/${t.total}</span><span class="qz-res__meter" style="--v:${t.total ? t.right / t.total : 0}"></span></dd>
            </div>`
          )}
        </dl>`
      : ""}
    <div class="qz-res__actions">
      <a class="btn btn--primary btn--lg" href="#qz-after" data-scroll-to="#qz-after" data-magnetic>
        <span>${res.recs.length ? "See the suggested groups" : "See your marked paper"}</span><span class="btn__icon">${icon("arrow-down", { size: 18 })}</span>
      </a>
      ${nextName
        ? html`<button class="btn btn--ghost btn--lg" type="button" data-action="next-stage"><span>Try the ${nextName} paper</span><span class="btn__icon">${icon("arrow-right", { size: 18 })}</span></button>`
        : html`<button class="btn btn--ghost btn--lg" type="button" data-action="retry"><span>Try again</span></button>`}
      <button class="qz-res__other" type="button" data-action="restart">Choose another paper</button>
    </div>
  </div>`;
}

function recRow(m, c, run, pct, i) {
  const lv = levelName(m.content, c.level);
  const exam = examShort(m.content, c.level);
  const left = Number(c.seatsLeft);
  const known = c.seatsLeft !== "" && c.seatsLeft !== null && c.seatsLeft !== undefined && Number.isFinite(left);
  const id = encodeURIComponent(c.id);
  return html`<li class="qz-rec">
    <p class="qz-rec__no" aria-hidden="true">${pad(i + 1)}</p>
    <div class="qz-rec__code">
      ${c.code ? html`<span class="qz-rec__syl">${c.code}</span>` : ""}
      ${modeLabel[c.mode] ? html`<span class="badge badge--${c.mode}">${modeLabel[c.mode]}</span>` : ""}
    </div>
    <div class="qz-rec__main">
      <h3 class="qz-rec__title"><a href="#/courses/${id}">${c.title}</a></h3>
      <p class="qz-rec__level">${lv}${exam && exam !== lv ? ` · ${exam}` : ""}</p>
    </div>
    ${c.summary ? html`<p class="qz-rec__summary">${c.summary}</p>` : html`<span></span>`}
    <div class="qz-rec__fee">
      ${formatRs(c.fee) ? html`<p><span class="num">${formatRs(c.fee)}</span><span class="qz-rec__per"> a month</span></p>` : ""}
      ${known && left <= 0 ? html`<span class="tag">Waiting list</span>` : known && left <= 3 ? html`<span class="tag tag--amber">${plural(left, "place")} left</span>` : ""}
    </div>
    <div class="qz-rec__actions">
      <a class="btn btn--primary btn--sm" href="#/enrol?course=${id}&quiz=${pct}${run.level ? `&quizlevel=${encodeURIComponent(run.level)}` : ""}"><span>Enrol</span><span class="btn__icon">${icon("arrow-right", { size: 14 })}</span></a>
      <a class="link-arrow link-arrow--muted" href="#/courses/${id}"><span>Course page</span></a>
    </div>
  </li>`;
}

function afterMarkup(m, run, res) {
  const lvName = res.level ? levelName(m.content, res.level) : "";
  const rel = res.rel;
  const showCats = res.byCat.length > 1;
  return html`<div class="container">
    ${res.recs.length
      ? html`<div class="qz-after__recs">
          <div class="section-head qz-after__head">
            <p class="section-head__index">Suggested groups</p>
            <h2 class="h2 section-head__title" data-split>Start at <em>${lvName}</em></h2>
            <p class="section-head__aside small muted" data-reveal>
              ${res.fallback
                ? `There is no ${lvName} group for ${paperName(m, run.paper)} yet, so these are the closest fits at that level.`
                : rel && rel.level !== rel.chosen
                ? html`One stage below the ${stage(m, rel.chosen)} paper, where the basics become automatic. Ask about a slower start at ${stage(m, rel.chosen)} in the trial lesson.`
                : rel && rel.tier === "high" && rel.next
                ? html`Groups for the stage you chose. ${rel.nextPaper ? html`The ${stage(m, rel.next)} paper` : "A trial lesson"} will show whether the next stage is within reach.`
                : run.paper === "all" && res.byCat.length > 1
                ? "Ordered by where marks were lost: the first subject is where a group will help most."
                : "Every course page has the full topic list, the timetable and who teaches it."}
            </p>
          </div>
          <ol class="qz-recs" data-stagger="0.08">${res.recs.map((c, i) => recRow(m, c, run, res.pct, i))}</ol>
          ${res.levelTotal > res.recs.length
            ? html`<p class="qz-after__more" data-reveal>
                <a class="link-arrow" href="#/courses?level=${encodeURIComponent(res.level)}"><span>All ${plural(res.levelTotal, `${lvName} course`)}</span>${icon("arrow-right", { size: 16 })}</a>
              </p>`
            : ""}
        </div>`
      : ""}
    <div class="qz-script grid-12">
      <div class="qz-script__side">
        <p class="eyebrow">The marked paper</p>
        <h2 class="h3 qz-script__title" data-reveal>Every answer, with the <em>working.</em></h2>
        ${showCats
          ? html`<dl class="qz-script__cats" data-reveal>
              ${res.byCat.map(
                (t) => html`<div><dt>${categoryName(m.content, t.key) || "Other"}</dt><dd class="num">${t.right}/${t.total}</dd></div>`
              )}
            </dl>`
          : ""}
      </div>
      <div class="accordion qz-script__list" data-reveal>
        ${run.qs.map((q, k) => {
          const p = run.picks[k];
          const right = p === q.answer;
          return html`<details>
            <summary>
              <span class="qz-script__sum">
                <span class="qz-script__prompt">${q.prompt}</span>
                <span class="qz-script__mark qz-script__mark--${right ? "right" : "wrong"}">${right ? penTick() : penCross()}<span class="sr-only">${right ? "Correct" : "Incorrect"}</span></span>
              </span>
            </summary>
            <div class="accordion__body">
              <dl class="qz-script__ans">
                <div class="${right ? "is-right" : "is-wrong"}"><dt>Your answer</dt><dd><span class="qz-script__key">${p === undefined ? "–" : LETTERS[p]}</span>${p === undefined ? "Not answered" : q.options[p]}</dd></div>
                ${right ? "" : html`<div><dt>Answer</dt><dd><span class="qz-script__key">${LETTERS[q.answer]}</span>${q.options[q.answer]}</dd></div>`}
              </dl>
              ${q.explain ? html`<p>${q.explain}</p>` : ""}
            </div>
          </details>`;
        })}
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ markup: mark scheme */

/** How the same cut-offs read on a single-stage paper (see relative()). */
function stageNote(m) {
  const b = m.bands;
  if (b.length < 2 || m.levelsIn(m.questions).length < 2) return "";
  const range = (lo, hi) => html`<span class="qz-nw">${lo}–${hi}%</span>`;
  const low = range(b[0].min, b[0].max);
  const high = range(b[b.length - 1].min, b[b.length - 1].max);
  const mid = b.length > 2 ? range(b[1].min, b[b.length - 2].max) : "";
  return html`<p class="qz-scheme__note" data-reveal>
    <span class="qz-scheme__note-k">Papers for one stage</span>
    <span>These bands read the mixed paper. Choose a stage and the same cut-offs are read against it: ${low} means a stage lower or a slower start${mid ? html`, ${mid} is ready for that stage` : ""}, and ${high} is secure in it. The next stage’s paper is then the test of moving up.</span>
  </p>`;
}

function schemeSection(m) {
  if (!m.bands.length) return "";
  const widths = m.bands.map((b) => Math.max(8, Math.min(100, b.max + 1) - Math.max(0, b.min)));
  return html`<section class="section section--paper-2 qz-scheme" aria-labelledby="qz-scheme-title">
    <div class="container">
      <div class="section-head">
        <p class="section-head__index">Mark scheme</p>
        <h2 class="h2 section-head__title" id="qz-scheme-title" data-split>How the paper <em>is read.</em></h2>
        <p class="section-head__aside small" data-reveal>The percentage points to a level, not a verdict. We confirm the right group in a first lesson.</p>
      </div>
      <div class="qz-ruler" data-reveal="fade" aria-hidden="true">
        <div class="qz-ruler__ticks"></div>
        <div class="qz-ruler__nums">${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => html`<span style="left:${n}%">${n}</span>`)}</div>
        ${m.bands.slice(1).map((b) => html`<span class="qz-ruler__cut" style="left:${Math.max(0, Math.min(100, b.min))}%"></span>`)}
        <span class="qz-ruler__you" hidden><span class="qz-ruler__you-label">You</span></span>
      </div>
      <ol class="qz-bands" style="--cols:${widths.map((w) => `${w}fr`).join(" ")}" data-stagger="0.1">
        ${m.bands.map(
          (b, i) => html`<li class="qz-band" data-band="${i}">
            <p class="qz-band__range"><span class="num">${b.min}–${b.max}</span>%</p>
            <h3 class="qz-band__title">${b.title || "—"}</h3>
            ${b.recommend
              ? html`<p class="qz-band__rec">Suggests <strong>${levelName(m.content, b.recommend)}</strong>${examShort(m.content, b.recommend) ? html` · ${levelExam(m.content, b.recommend)}` : ""}</p>`
              : ""}
            ${b.text ? html`<p class="qz-band__text">${b.text}</p>` : ""}
            ${b.recommend
              ? html`<a class="link-arrow qz-band__link" href="#/courses?level=${encodeURIComponent(b.recommend)}"><span>${levelName(m.content, b.recommend)} courses</span>${icon("arrow-right", { size: 16 })}</a>`
              : ""}
          </li>`
        )}
      </ol>
      ${stageNote(m)}
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ view */

let active = null; // the mounted instance (for onQuery)
let snapshot = null; // survives an in-place re-render (admin live preview)

export default {
  id: "quiz",
  title: "Quick check",
  scene: "single",

  render(ctx) {
    const m = model(ctx.content || {});
    const sel = selFromQuery(m, ctx.query);
    return html`<section class="view view--quiz" data-view="quiz">
      <header class="view-hero view-hero--full view-hero--top qz-hero">
        <div class="container qz-hero__inner">
          <div class="qz-stage" data-stage="intro">${introStage(m, sel, true)}</div>
        </div>
      </header>
      <section class="section qz-after" id="qz-after" aria-label="Your marked paper" hidden></section>
      ${schemeSection(m)}
    </section>`;
  },

  mount(root, ctx) {
    const gsap = gsapRef();
    const motion = ctx.motion;
    const reduced = !gsap || !!(motion && motion.reduced);
    const stageEl = root.querySelector(".qz-stage");
    const afterEl = root.querySelector(".qz-after");
    const schemeEl = root.querySelector(".qz-scheme");
    if (!stageEl) return undefined;

    const m = model(ctx.content || {});
    const g = gsap ? gsap.context(() => {}, root) : null;
    const add = (fn) => (g ? g.add(fn) : fn());
    const ease = (motion && motion.ease) || { out: "expo.out", inOut: "expo.inOut", soft: "power2.out" };
    const scene = ctx.scene || { focus() {} };
    const say = (msg) => ctx.announce && ctx.announce(msg);

    let sel = selFromQuery(m, ctx.query);
    let run = null;
    let stage = "intro";
    let busy = false;
    let alive = true;
    let stageUnbind = null;
    let afterUnbind = null;
    let lastRes = null;

    const $ = (s, el = stageEl) => el.querySelector(s);
    const $$ = (s, el = stageEl) => [...el.querySelectorAll(s)];
    const focus = (el) => {
      if (!el) return;
      if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT)$/.test(el.tagName)) el.setAttribute("tabindex", "-1");
      try {
        el.focus({ preventScroll: true });
      } catch {}
    };
    const draw = (el, vars = {}) => {
      if (!el || reduced || !motion) return null;
      let tw = null;
      add(() => {
        tw = motion.draw(el, { duration: 0.55, stagger: 0.14, ease: "power2.inOut", ...vars });
      });
      return tw;
    };
    // Lenis can lag behind a scroll it did not see (e.g. focus or find-in-page): resync first.
    const scrollToY = (y, duration) => {
      const l = ctx.lenis;
      if (!l || typeof l.scrollTo !== "function") return window.scrollTo(0, y);
      if (!l.isShim && typeof l.scroll === "number" && Math.abs(l.scroll - window.scrollY) > 2) l.scrollTo(window.scrollY, { immediate: true });
      l.scrollTo(y, reduced ? { immediate: true } : { duration });
      return undefined;
    };
    const scrollTop = () => {
      if (window.scrollY >= 4) scrollToY(0, 0.9);
    };
    // Keep an element (e.g. the Next button after marking) inside the viewport on small screens.
    const reveal = (el) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const over = r.bottom - (window.innerHeight - 20);
      if (over > 0) scrollToY(window.scrollY + over, 0.8);
    };
    const setQuery = () => {
      if (ctx.setQuery) ctx.setQuery({ subject: sel.paper === "all" ? "" : sel.paper, level: sel.level });
    };

    /* ---- stage swapping ------------------------------------------------ */

    function markupFor(name) {
      if (name === "question") return runStage(m, run);
      if (name === "result") return resultStage(m, run, (lastRes = result(m, run)));
      return introStage(m, sel, false);
    }

    function swapStage(name) {
      if (stageUnbind) stageUnbind();
      stageUnbind = null;
      stageEl.innerHTML = String(markupFor(name));
      stageEl.dataset.stage = name;
      stage = name;
      // Only the magnetic buttons are bound: pen marks and counters here are animated by hand.
      if (motion) {
        const offs = $$("[data-magnetic]").map((b) => motion.bind(b));
        stageUnbind = () => offs.forEach((off) => off && off());
      }
    }

    function goStage(name, { instant = false } = {}) {
      busy = true;
      if (!instant) scrollTop();
      const done = () => {
        swapStage(name);
        enterStage(name, instant || reduced);
      };
      const cur = stageEl.firstElementChild;
      if (instant || reduced || !cur) return done();
      add(() => {
        gsap.to([...cur.children], {
          autoAlpha: 0,
          y: -18,
          duration: 0.42,
          ease: "power2.in",
          stagger: 0.025,
          overwrite: true,
          onComplete: () => alive && done(),
        });
      });
    }

    function enterStage(name, instant) {
      const el = stageEl.firstElementChild;
      // Input is accepted as soon as the new stage is in the DOM; the entrance is decoration.
      busy = false;
      const finish = () => {};
      if (name === "intro") {
        scene.focus(null);
        hideAfter();
        markScheme(null);
        focus($("#qz-h1"));
        say("Choose a paper to start");
        if (instant) return finish();
        add(() => {
          const h = $("#qz-h1");
          const split = motion && motion.splitLines ? motion.splitLines(h) : null;
          const tl = gsap.timeline({ onComplete: () => (split && split.revert && split.revert(), finish()) });
          if (split && split.lines && split.lines.length) tl.fromTo(split.lines, { yPercent: 118 }, { yPercent: 0, duration: 1, ease: ease.out, stagger: 0.07 }, 0);
          tl.fromTo([...el.children].filter((c) => c !== h), { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9, ease: ease.out, stagger: 0.07, clearProps: "transform" }, 0.08);
        });
        return undefined;
      }
      if (name === "question") {
        scene.focus(run.i % 8);
        if (run.marked) {
          applyMarks(false);
          goButton("next");
        }
        focus($("#qz-prompt"));
        say(`Question ${run.i + 1} of ${run.qs.length}`);
        if (instant) return finish();
        add(() => {
          const head = [$(".qz-run__head"), $(".qz-bar")];
          const tl = gsap.timeline({ onComplete: finish });
          tl.fromTo(head, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: ease.out, stagger: 0.06, clearProps: "transform" }, 0);
          tl.add(questionIn(), 0.12);
          tl.fromTo($(".qz-q__actions"), { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.out" }, 0.5);
        });
        return undefined;
      }
      // result
      const res = lastRes;
      scene.focus(null);
      showAfter(res);
      markScheme(res);
      focus($("#qz-h1"));
      say(`Paper marked: ${res.right} out of ${res.n}, ${res.pct} percent. ${res.copy.title}.`);
      if (instant) return finish();
      add(() => {
        const fig = $(".qz-res__fig");
        const num = $(".qz-res__num");
        const pctEl = $(".qz-res__pct .num");
        const rest = [...el.children].filter((c) => !c.classList.contains("qz-res__score"));
        const tl = gsap.timeline({ onComplete: finish });
        tl.fromTo(fig, { opacity: 0, yPercent: 14 }, { opacity: 1, yPercent: 0, duration: 1, ease: ease.out, clearProps: "transform" }, 0);
        tl.fromTo($(".qz-res__side"), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9, ease: ease.out, clearProps: "transform" }, 0.12);
        tl.fromTo(rest, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.95, ease: ease.out, stagger: 0.07, clearProps: "transform" }, 0.2);
        if (num && motion) tl.add(motion.count(num, res.right, { duration: 1.1 }) || gsap.timeline(), 0.1);
        if (pctEl && motion) tl.add(motion.count(pctEl, res.pct, { duration: 1.3 }) || gsap.timeline(), 0.15);
        const circle = $(".qz-res__circle .pen");
        if (circle) {
          const tw = motion && motion.draw(circle, { duration: 0.9, ease: "power2.inOut" });
          if (tw) {
            tw.pause();
            tl.add(tw.play(), 0.75);
          }
        }
        const you = $(".qz-scale__you");
        if (you) tl.fromTo(you, { left: "0%" }, { left: `${Math.max(0, Math.min(100, res.pct))}%`, duration: 1.3, ease: ease.out, clearProps: "left" }, 0.2);
      });
      return undefined;
    }

    // Prompt lines rise out of a mask; options follow one by one.
    function questionIn() {
      const tl = gsap.timeline();
      const prompt = $("#qz-prompt");
      const meta = $(".qz-q__meta");
      const opts = $$(".qz-opt");
      const split = motion && motion.splitLines ? motion.splitLines(prompt) : null;
      if (meta) tl.fromTo(meta, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6, ease: ease.out, clearProps: "transform" }, 0);
      if (split && split.lines && split.lines.length) {
        tl.fromTo(split.lines, { yPercent: 118 }, { yPercent: 0, duration: 0.95, ease: ease.out, stagger: 0.07 }, 0.04);
        tl.call(() => split.revert && split.revert(), [], ">");
      } else if (prompt) tl.fromTo(prompt, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, ease: ease.out, clearProps: "transform" }, 0.04);
      tl.fromTo(opts, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.8, ease: ease.out, stagger: 0.06, clearProps: "transform" }, 0.22);
      return tl;
    }

    /* ---- the after section (suggested groups + marked script) ------------ */

    function showAfter(res) {
      if (!afterEl || !res) return;
      if (afterUnbind) afterUnbind();
      afterEl.innerHTML = String(afterMarkup(m, run, res));
      afterEl.hidden = false;
      afterUnbind = motion ? motion.bind(afterEl) : null;
      if (motion) motion.refresh();
    }
    function hideAfter() {
      if (!afterEl || afterEl.hidden) return;
      if (afterUnbind) afterUnbind();
      afterUnbind = null;
      afterEl.hidden = true;
      afterEl.innerHTML = "";
      if (motion) motion.refresh();
    }
    function markScheme(res) {
      if (!schemeEl) return;
      // A single-stage paper is not read by the mixed paper's bands, so none of them is "your band".
      const hitIndex = res && res.band && !res.rel ? m.bands.indexOf(res.band) : -1;
      schemeEl.querySelectorAll(".qz-band").forEach((li, i) => li.classList.toggle("is-hit", i === hitIndex));
      const you = schemeEl.querySelector(".qz-ruler__you");
      if (you) {
        you.hidden = !res;
        if (res) you.style.left = `${Math.max(0, Math.min(100, res.pct))}%`;
        const label = you.querySelector(".qz-ruler__you-label");
        if (label && res) label.textContent = `You · ${res.pct}%`;
      }
    }

    /* ---- answering ------------------------------------------------------- */

    function goButton(kind) {
      const btn = $("[data-go]");
      if (!btn) return null;
      const label = $("[data-go-label]", btn);
      const ic = $("[data-go-icon]", btn);
      const last = run && run.i >= run.qs.length - 1;
      if (kind === "mark") {
        label.textContent = "Mark it";
        ic.innerHTML = String(icon("check", { size: 16 }));
        btn.disabled = run.picks[run.i] === undefined;
      } else {
        label.textContent = last ? "See my result" : "Next question";
        ic.innerHTML = String(icon("arrow-right", { size: 16 }));
        btn.disabled = false;
      }
      const keys = $(".qz-q__keys");
      if (keys) {
        const n = Math.min(9, run.qs[run.i].options.length);
        keys.innerHTML =
          kind === "mark"
            ? String(html`<kbd>1</kbd>–<kbd>${n}</kbd> to choose, <kbd>Enter</kbd> to mark`)
            : String(html`<kbd>Enter</kbd> for the ${last ? "result" : "next question"}`);
      }
      return btn;
    }

    function pick(k, { focusInput = false } = {}) {
      if (!run || run.marked || stage !== "question") return;
      const q = run.qs[run.i];
      if (!(k >= 0 && k < q.options.length)) return;
      run.picks[run.i] = k;
      $$(".qz-opt").forEach((o, j) => {
        o.classList.toggle("is-picked", j === k);
        const inp = $("input", o);
        if (j === k && inp && !inp.checked) inp.checked = true;
        if (j === k && focusInput && inp) focus(inp);
      });
      goButton("mark");
      const key = $(`.qz-opt[data-k="${k}"] .qz-opt__key`);
      if (key && !reduced) add(() => gsap.fromTo(key, { scale: 0.82 }, { scale: 1, duration: 0.5, ease: ease.out, clearProps: "scale" }));
    }

    // Pen marks on the options, the feedback note and the examiner's grid.
    function applyMarks(animate) {
      const q = run.qs[run.i];
      const k = run.picks[run.i];
      const right = k === q.answer;
      const form = $(".qz-q");
      if (form) form.classList.add("is-marked");
      const opts = $$(".qz-opt");
      opts.forEach((o, j) => {
        const inp = $("input", o);
        if (inp) inp.disabled = true;
        o.classList.toggle("is-chosen", j === k);
        o.classList.toggle("is-answer", j === q.answer);
        o.classList.toggle("is-right", j === k && right);
        o.classList.toggle("is-wrong", j === k && !right);
        o.classList.toggle("is-other", j !== k && j !== q.answer);
      });
      const chosen = opts[k];
      const answer = opts[q.answer];
      const marks = [];
      if (chosen) {
        const slot = $(".qz-opt__mark", chosen);
        slot.innerHTML = String(right ? penTick() : penCross());
        marks.push(slot);
        if (!right) {
          const t = $(".qz-opt__t", chosen);
          if (t && !$(".qz-strike", t)) t.insertAdjacentHTML("beforeend", String(penStrike()));
          if (t) marks.unshift($(".qz-strike", t));
        }
      }
      if (!right && answer) {
        const slot = $(".qz-opt__mark", answer);
        slot.innerHTML = String(penTick());
        marks.push(slot);
      }
      const fb = $(".qz-fb");
      if (fb) {
        fb.innerHTML = String(feedback(q, k));
        fb.classList.toggle("is-right", right);
        fb.classList.toggle("is-wrong", !right);
        fb.hidden = false;
      }
      const cell = $(`.qz-ledger__m[data-k="${run.i}"]`);
      if (cell) {
        cell.dataset.state = right ? "right" : "wrong";
        cell.innerHTML = String(right ? penTick() : penCross());
      }
      const bar = $(".qz-bar");
      if (bar) {
        bar.setAttribute("aria-valuenow", String(run.i + 1));
        const fill = $(".qz-bar__fill", bar);
        if (fill) fill.style.transform = `scaleX(${(run.i + 1) / run.qs.length})`;
      }
      if (!animate || reduced) return;
      add(() => {
        const tl = gsap.timeline();
        marks.forEach((el, i) => {
          const tw = draw(el, { duration: el.classList && el.classList.contains("qz-strike") ? 0.45 : 0.5 });
          if (tw) {
            tw.pause();
            tl.add(tw.play(), i * 0.22);
          }
        });
        if (fb) tl.fromTo(fb, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, ease: ease.out, clearProps: "transform" }, 0.18);
        const tw = draw(cell, { duration: 0.4 });
        if (tw) {
          tw.pause();
          tl.add(tw.play(), 0.3);
        }
        const others = opts.filter((o, j) => j !== k && j !== q.answer);
        tl.to(others, { opacity: 0.38, duration: 0.5, ease: "power1.out", overwrite: "auto" }, 0);
      });
    }

    function mark() {
      if (busy || !run || run.marked || stage !== "question") return;
      const k = run.picks[run.i];
      if (k === undefined) return;
      run.marked = true;
      const q = run.qs[run.i];
      const right = k === q.answer;
      const btn = goButton("next");
      focus(btn); // before the radios are disabled, so focus is never lost
      applyMarks(true);
      say(
        right
          ? `Correct. ${q.explain}`
          : `Not quite. The answer is ${LETTERS[q.answer]}: ${q.options[q.answer]}. ${q.explain}`
      );
      if (!reduced && gsap) add(() => gsap.delayedCall(0.35, () => alive && reveal($(".qz-q__actions"))));
      else reveal($(".qz-q__actions"));
    }

    function next() {
      if (busy || !run || !run.marked || stage !== "question") return;
      if (run.i >= run.qs.length - 1) {
        goStage("result");
        return;
      }
      busy = true;
      const body = $(".qz-q__body");
      const swap = () => {
        if (!alive) return;
        run.i += 1;
        run.marked = false;
        const form = $(".qz-q");
        if (form) form.classList.remove("is-marked");
        body.innerHTML = String(questionBody(m, run));
        goButton("mark");
        const roll = $(".qz-roll");
        $$(".qz-ledger__q").forEach((c, j) => c.classList.toggle("is-current", j === run.i));
        scene.focus(run.i % 8);
        focus($("#qz-prompt"));
        say(`Question ${run.i + 1} of ${run.qs.length}`);
        busy = false; // answers are accepted while the new question animates in
        if (reduced) {
          const n = $(".qz-roll__n", roll);
          if (n) n.textContent = pad(run.i + 1);
          return;
        }
        add(() => {
          rollTo(roll, pad(run.i + 1));
          questionIn();
        });
      };
      if (window.scrollY > 4) scrollTop();
      if (reduced) return swap();
      add(() => {
        gsap.to([...body.children], { autoAlpha: 0, y: -20, duration: 0.34, ease: "power2.in", stagger: 0.025, overwrite: true, onComplete: swap });
      });
    }

    // Odometer-style question number.
    function rollTo(roll, text) {
      if (!roll) return;
      const old = $$(".qz-roll__n", roll);
      const nu = document.createElement("span");
      nu.className = "qz-roll__n";
      nu.textContent = text;
      roll.appendChild(nu);
      const tl = gsap.timeline({ onComplete: () => old.forEach((o) => o.remove()) });
      tl.to(old, { yPercent: -105, duration: 0.7, ease: ease.inOut }, 0);
      tl.fromTo(nu, { yPercent: 105 }, { yPercent: 0, duration: 0.7, ease: ease.inOut }, 0);
    }

    function start(paper) {
      if (busy) return;
      sel = normSel(m, paper || sel.paper, sel.level);
      setQuery();
      const qs = sample(pool(m, sel.paper, sel.level));
      if (!qs.length) return;
      run = { paper: sel.paper, level: sel.level, qs, i: 0, picks: [], marked: false };
      goStage("question");
    }
    function retry() {
      if (busy || !run) return;
      run = { ...run, i: 0, picks: [], marked: false };
      hideAfter();
      markScheme(null);
      goStage("question");
    }
    // From a secure result, the next stage's paper: the real test of whether that stage is within reach.
    function nextStage() {
      const r = lastRes && lastRes.rel;
      if (busy || !run || !r || !r.nextPaper) return;
      sel = normSel(m, r.nextPaper, r.next);
      hideAfter();
      markScheme(null);
      start(sel.paper);
    }
    function restart() {
      if (busy) return;
      if (run) sel = normSel(m, run.paper, run.level);
      run = null;
      goStage("intro");
    }

    /* ---- setup form ------------------------------------------------------ */

    function refreshSetup() {
      $$('input[name="qz-level"]').forEach((inp) => (inp.checked = inp.value === sel.level));
      $$(".qz-paper").forEach((b) => {
        const meta = metaFor(m, b.value, sel.level);
        b.disabled = meta.n === 0;
        b.classList.toggle("is-current", b.value === sel.paper);
        const out = $(`[data-paper-meta="${CSS.escape(b.value)}"]`, b);
        if (out) out.innerHTML = String(html`<span>${meta.count}</span><span class="qz-paper__time"> · ${meta.time}</span>`);
      });
    }

    /* ---- events ---------------------------------------------------------- */

    const onChange = (e) => {
      const t = e.target;
      if (!t || !t.name) return;
      if (t.name === "qz-level") {
        sel = { paper: sel.paper, level: pool(m, "all", t.value).length ? t.value : "" };
        refreshSetup();
        setQuery();
        const n = $$(".qz-paper:not(:disabled)").length;
        say(`${sel.level ? levelName(m.content, sel.level) : "All levels"}: ${plural(n, "paper")} available`);
      } else if (t.name === "qz-answer") {
        pick(Number(t.value));
      }
    };
    const onSubmit = (e) => {
      const f = e.target;
      if (!f || !f.classList) return;
      if (f.classList.contains("qz-setup")) {
        e.preventDefault();
        const b = e.submitter && e.submitter.classList.contains("qz-paper") ? e.submitter : $(".qz-paper.is-current:not(:disabled)") || $(".qz-paper:not(:disabled)");
        if (b) start(b.value);
      } else if (f.classList.contains("qz-q")) {
        e.preventDefault();
        if (run && run.marked) next();
        else mark();
      }
    };
    const onClick = (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const act = t.closest("[data-action]");
      if (act && root.contains(act)) {
        const a = act.getAttribute("data-action");
        if (a === "retry") retry();
        else if (a === "next-stage") nextStage();
        else if (a === "restart") restart();
        return;
      }
      // Clicking the option that is already chosen marks it (a quick double tap works too).
      const opt = t.closest(".qz-opt");
      if (opt && !t.closest("input") && run && !run.marked) {
        const inp = $("input", opt);
        if (inp && inp.checked && run.picks[run.i] === Number(inp.value)) {
          e.preventDefault();
          mark();
        }
      }
    };
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || stage !== "question" || !run) return;
      if (document.documentElement.classList.contains("menu-open")) return;
      const t = e.target;
      if (t && t.closest && t.closest('textarea, select, [contenteditable="true"], input:not([type="radio"])')) return;
      if (t && t.closest && t.closest(".site-top, .menu")) return;
      const q = run.qs[run.i];
      const n = q.options.length;
      const key = e.key;
      if (key === "Enter") {
        if (t && t.closest && t.closest("a[href], button, summary") && !t.closest(".qz-opt")) return; // native activation
        e.preventDefault();
        if (busy) return;
        if (run.marked) next();
        else mark();
        return;
      }
      if (run.marked || busy) return;
      let k = -1;
      if (/^[1-9]$/.test(key)) k = Number(key) - 1;
      else if (key.length === 1 && LETTERS.slice(0, n).toLowerCase().includes(key.toLowerCase())) k = LETTERS.indexOf(key.toUpperCase());
      else if (key === "ArrowDown" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowLeft") {
        if (t && t.closest && t.closest(".qz-opt")) return; // native radio-group behaviour
        const cur = run.picks[run.i];
        const dir = key === "ArrowDown" || key === "ArrowRight" ? 1 : -1;
        k = cur === undefined ? (dir > 0 ? 0 : n - 1) : (cur + dir + n) % n;
      }
      if (k < 0 || k >= n) return;
      e.preventDefault();
      pick(k, { focusInput: true });
    };

    root.addEventListener("change", onChange);
    root.addEventListener("submit", onSubmit);
    root.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);

    const instance = {
      onQuery(query) {
        if (busy) return;
        const next = selFromQuery(m, query);
        const explicit = !!(query && query.get && (query.get("subject") || query.get("level")));
        if (stage === "intro") {
          sel = next;
          refreshSetup();
          return;
        }
        // A plain link to #/quiz mid-paper keeps the paper going.
        if (!explicit || (run && next.paper === run.paper && next.level === run.level)) {
          setQuery();
          scrollTop();
          return;
        }
        sel = next;
        run = null;
        goStage("intro");
      },
    };
    active = instance;

    /* ---- restore after an in-place re-render (admin live preview) ---------- */

    const snap = snapshot;
    snapshot = null;
    // Only an in-place re-render (admin live preview) restores: the hash is unchanged then.
    if (snap && Date.now() - snap.at < SNAPSHOT_MS && snap.hash === location.hash) {
      sel = normSel(m, snap.sel.paper, snap.sel.level);
      if (snap.run) {
        const qs = snap.run.keys.map((key) => m.questions.find((q) => q.key === key));
        if (qs.length && qs.every(Boolean)) {
          run = { paper: snap.run.paper, level: snap.run.level, qs, i: Math.min(snap.run.i, qs.length - 1), picks: snap.run.picks.slice(), marked: snap.run.marked };
          if (run.marked && run.picks[run.i] === undefined) run.marked = false;
        }
      }
      if (run && snap.stage !== "intro") {
        swapStage(snap.stage);
        enterStage(snap.stage, true);
      } else if (snap.stage === "intro") {
        refreshSetup();
        scene.focus(null);
      }
    } else {
      scene.focus(null);
    }
    busy = false;

    return () => {
      alive = false;
      snapshot = {
        at: Date.now(),
        hash: location.hash,
        stage,
        sel: { ...sel },
        run: run && { paper: run.paper, level: run.level, keys: run.qs.map((q) => q.key), i: run.i, picks: run.picks.slice(), marked: run.marked },
      };
      root.removeEventListener("change", onChange);
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      if (stageUnbind) stageUnbind();
      if (afterUnbind) afterUnbind();
      if (g) g.revert();
      scene.focus(null);
      if (active === instance) active = null;
    };
  },

  onQuery(query) {
    if (active) active.onQuery(query);
  },
};
