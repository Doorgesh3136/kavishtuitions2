// Courses: the catalogue (#/courses) and one page per course (#/courses/<id>).
//
// Catalogue: hero with a contents list by level · a filter panel (sticky column on desktop, sticky
// bar on small screens) synced to ?level=&cat=&q= · a results grid that re-flows with GSAP Flip ·
// a short "where next" band.
// Detail: giant syllabus code + title · the course in two paragraphs · a numbered syllabus that gets
// ticked in red as it scrolls in · the weekly sessions · the tutor · a sticky entry slip (fee, seats,
// enrol / WhatsApp) · related courses.
import { html, icon, paragraphs, penCircle, penTick, penUnderline } from "../ui.js";
import {
  visible,
  formatRs,
  levelName,
  levelExam,
  categoryName,
  tutorFor,
  sessionsFor,
  DAYS,
  dayShort,
  safeUrl,
  whatsappLink,
  mailtoLink,
} from "../store.js";

/* ------------------------------------------------------------------ helpers */

const pad = (n) => String(n).padStart(2, "0");
const MODE = { online: "Online", "in-person": "In person", hybrid: "Hybrid" };
const modeLabel = (m) => MODE[m] || (m ? String(m) : "");
const num = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const norm = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const tokens = (q) => norm(q).split(/[\s,]+/).filter(Boolean);
const examParts = (content, levelId) =>
  String(levelExam(content, levelId) || "")
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
const shortExam = (content, levelId) => examParts(content, levelId)[0] || "";
const codeOf = (content, c) => String(c.code || "").trim() || shortExam(content, c.level);
const toMin = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
const fmtDur = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${pad(m)}` : ""}` : `${m} min`;
};
const firstSentence = (s) => {
  const t = String(s || "").trim();
  const m = t.match(/^(.+?[.!?])(?:\s|$)/s);
  return m ? m[1] : t;
};
const initials = (name) =>
  String(name || "")
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
const courseHref = (c) => `#/courses/${encodeURIComponent(c.id)}`;
const arrow = (size = 16) => html`<span class="btn__icon">${icon("arrow-right", { size })}</span>`;
const sessionsWord = (n) => (n === 1 ? "1 session" : `${n} sessions`);

// The catalogue's last filter state, so "All courses" on a course page returns to the same list.
let lastListQuery = "";
// The mounted catalogue (for onQuery).
let live = null;

function queryOf(st) {
  const q = new URLSearchParams();
  if (st.level) q.set("level", st.level);
  if (st.cat) q.set("cat", st.cat);
  if (st.q && st.q.trim()) q.set("q", st.q.trim());
  return q.toString();
}
const listHref = () => `#/courses${lastListQuery ? `?${lastListQuery}` : ""}`;

/* ------------------------------------------------------------------ data */

function catalogue(content) {
  const courses = visible(content.courses).filter((c) => c && c.id);
  const levels = (content.levels || []).filter((l) => l && l.id);
  const cats = (content.categories || []).filter((c) => c && c.id);
  const levelIds = new Set(levels.map((l) => l.id));
  const groups = levels
    .map((l) => ({ id: l.id, level: l, items: courses.filter((c) => c.level === l.id) }))
    .filter((g) => g.items.length);
  const orphans = courses.filter((c) => !levelIds.has(c.level));
  if (orphans.length) groups.push({ id: "_other", level: null, items: orphans });
  const hay = new Map(
    courses.map((c) => {
      const tutor = tutorFor(content, c);
      return [
        c.id,
        norm(
          [
            c.title,
            c.code,
            c.summary,
            levelName(content, c.level),
            levelExam(content, c.level),
            categoryName(content, c.category),
            modeLabel(c.mode),
            tutor && tutor.visible !== false ? tutor.name : "", // a hidden tutor isn't searchable by name
            ...(Array.isArray(c.topics) ? c.topics : []),
          ]
            .filter(Boolean)
            .join(" · ")
        ),
      ];
    })
  );
  return { courses, levels, cats, groups, hay };
}

function readState(query, cat) {
  const get = (k) => (query && typeof query.get === "function" ? query.get(k) || "" : "");
  const level = get("level");
  const c = get("cat");
  return {
    level: cat.levels.some((l) => l.id === level) ? level : "",
    cat: cat.cats.some((x) => x.id === c) ? c : "",
    q: get("q").slice(0, 60),
  };
}

function test(c, st, hay, skip = "") {
  if (skip !== "level" && st.level && c.level !== st.level) return false;
  if (skip !== "cat" && st.cat && c.category !== st.cat) return false;
  if (skip !== "q") {
    const h = hay.get(c.id) || "";
    for (const t of tokens(st.q)) if (!h.includes(t)) return false;
  }
  return true;
}

// Faceted counts: each chip shows how many courses it would give with the other filters kept.
function facets(cat, st) {
  const level = { "": 0 };
  const category = { "": 0 };
  for (const c of cat.courses) {
    if (test(c, st, cat.hay, "level")) {
      level[""]++;
      level[c.level] = (level[c.level] || 0) + 1;
    }
    if (test(c, st, cat.hay, "cat")) {
      category[""]++;
      category[c.category] = (category[c.category] || 0) + 1;
    }
  }
  return { level, category };
}

function findCourse(content, id) {
  return visible(content.courses).find((c) => c && c.id === id) || null;
}

/* ------------------------------------------------------------------ shared pieces */

function seatDots(seats, left) {
  const total = num(seats);
  const l = num(left);
  if (total === null || l === null || total <= 0 || total > 30) return "";
  const taken = Math.max(0, Math.min(total, total - l));
  return html`<span class="cx-dots" aria-hidden="true">${Array.from({ length: total }, (_, i) => html`<i${i < taken ? html` class="is-taken"` : ""}></i>`)}</span>`;
}

function seatText(c, { long = false } = {}) {
  const total = num(c.seats);
  const left = num(c.seatsLeft);
  if (left === null) return "";
  if (left <= 0) return html`<span class="cx-seat-full">Full</span> · waiting list`;
  const word = left === 1 ? "seat" : "seats";
  const n = left <= 3 ? html`<span class="pen-mark cx-seat-n">${left}${penCircle()}</span>` : html`<span class="cx-seat-n">${left}</span>`;
  if (long && total !== null) return html`${n} of ${total} ${total === 1 ? "seat" : "seats"} left`;
  return html`${n} ${word} left`;
}

function modeBadge(mode) {
  if (!mode) return "";
  return html`<span class="badge${MODE[mode] ? ` badge--${mode}` : ""}">${modeLabel(mode)}</span>`;
}

/** A course card. `pre` keeps ids unique when the same course appears twice on a page. */
function courseCard(content, c, pre = "cx") {
  const code = codeOf(content, c);
  const sessions = sessionsFor(content, c.id);
  const days = [...new Set(sessions.map((s) => s.day))].map(dayShort);
  const left = num(c.seatsLeft);
  const low = left !== null && left > 0 && left <= 3;
  const id = `${pre}-${c.id}`;
  const exam = String(c.code || "").trim() ? shortExam(content, c.level) : "";
  return html`<a class="card card--link cx-card${low ? " is-low" : ""}${left !== null && left <= 0 ? " is-full" : ""}" href="${courseHref(c)}"
      data-tilt="4" data-cursor="View" aria-labelledby="${id}-t ${id}-c" aria-describedby="${id}-d">
      <span class="cx-card__top">
        ${code ? html`<span class="tag cx-card__code" id="${id}-c">${code}</span>` : html`<span id="${id}-c" hidden></span>`}
        ${modeBadge(c.mode)}
      </span>
      <span class="cx-card__level">${levelName(content, c.level)}${exam ? html`<span class="cx-card__exam">${exam}</span>` : ""}</span>
      <span class="cx-card__title" id="${id}-t">${c.title}</span>
      ${c.summary ? html`<span class="cx-card__sum">${c.summary}</span>` : ""}
      <span class="cx-card__facts" id="${id}-d">
        <span class="cx-card__fact">
          <span class="cx-card__k">Each week</span>
          <span class="cx-card__v">${sessions.length ? html`${days.join(" · ")} <span class="cx-card__sub">${sessionsWord(sessions.length)}</span>` : "Times on request"}</span>
        </span>
        <span class="cx-card__fact">
          <span class="cx-card__k">Fee</span>
          <span class="cx-card__v">${num(c.fee) !== null ? html`${formatRs(c.fee)} <span class="cx-card__sub">a month</span>` : "On request"}</span>
        </span>
        ${left !== null
          ? html`<span class="cx-card__seats">
              ${seatDots(c.seats, c.seatsLeft)}
              <span class="cx-card__left">${seatText(c)}</span>
            </span>`
          : ""}
      </span>
    </a>`;
}

/* ------------------------------------------------------------------ catalogue */

function heroIndex(content, cat) {
  const n = cat.courses.length;
  const rows = cat.levels
    .map((l, i) => ({ l, i, n: cat.courses.filter((c) => c.level === l.id).length }))
    .filter((r) => r.n);
  const subjects = new Set(cat.courses.map((c) => c.category).filter(Boolean)).size;
  return html`<div class="cx-hero__index" data-intro>
    <p class="cx-count">
      <span class="cx-count__n" data-count="${n}">${n}</span>
      <span class="cx-count__l">${n === 1 ? "course" : "courses"}${rows.length > 1 ? html`<br />${rows.length} levels` : ""}${subjects > 1 ? html` · ${subjects} subjects` : ""}</span>
    </p>
    ${rows.length
      ? html`<ol class="cx-toc" aria-label="Courses by level">
          ${rows.map(
            (r) => html`<li>
              <a class="cx-toc__row" href="#/courses?level=${encodeURIComponent(r.l.id)}" data-cx-jump="${r.l.id}">
                <span class="cx-toc__i">${pad(r.i + 1)}</span>
                <span class="cx-toc__name">${r.l.name || r.l.id}</span>
                <span class="cx-toc__exam">${r.l.exam || ""}</span>
                <span class="cx-toc__dots" aria-hidden="true"></span>
                <span class="cx-toc__n"><span class="sr-only">, </span>${pad(r.n)}<span class="sr-only"> ${r.n === 1 ? "course" : "courses"}</span></span>
                <span class="cx-toc__go" aria-hidden="true">${icon("arrow-down", { size: 16 })}</span>
              </a>
            </li>`
          )}
        </ol>`
      : ""}
  </div>`;
}

function chip(group, value, label, count, pressed) {
  return html`<button class="chip cx-chip${count ? "" : " is-zero"}" type="button" data-cx-filter="${group}" data-value="${value}" aria-pressed="${pressed ? "true" : "false"}">
    <span>${label}</span><span class="chip__count" data-cx-count>${pad(count)}</span>
  </button>`;
}

function headCell(content, g, i, total, { first = false, hidden = false } = {}) {
  const l = g.level;
  const name = l ? l.name || l.id : "Other courses";
  const exam = l ? l.exam : "";
  const note = l ? firstSentence(l.summary) : "";
  return html`<div class="cx-cell cx-cell--head${first ? " is-first" : ""}" data-cx-cell data-cx-head="${g.id}"${hidden ? html` style="display:none"` : ""}>
    <div class="cx-cell__in cx-head">
      <p class="cx-head__idx">${pad(i + 1)} / ${pad(total)}</p>
      <h2 class="cx-head__title">${name}<sup class="cx-head__n" data-cx-headcount aria-hidden="true">${pad(g.items.length)}</sup></h2>
      <div class="cx-head__aside">
        ${exam ? html`<p class="cx-head__exam">${exam}</p>` : ""}
        ${note ? html`<p class="cx-head__note">${note}</p>` : ""}
      </div>
    </div>
  </div>`;
}

function emptyText(content, st) {
  const what = st.cat ? `${categoryName(content, st.cat)} course` : "course";
  const where = st.level ? ` at ${levelName(content, st.level)}` : "";
  const q = st.q.trim() ? ` matching “${st.q.trim()}”` : "";
  return `There’s no ${what}${where}${q} on the list.`;
}

const hasQuiz = (content) => !!(content.quiz && Array.isArray(content.quiz.questions) && content.quiz.questions.length);

function renderList(ctx) {
  const content = ctx.content || {};
  const cat = catalogue(content);
  const st = readState(ctx.query, cat);
  const total = cat.courses.length;
  const shown = cat.courses.filter((c) => test(c, st, cat.hay));
  const shownIds = new Set(shown.map((c) => c.id));
  const f = facets(cat, st);
  const active = !!(st.level || st.cat || st.q.trim());
  const site = content.site || {};
  const wa = whatsappLink(site.whatsapp, "Hello, I’m looking for a course that isn’t on the list.");
  let firstHead = true;

  return html`<section class="view view--courses cx-list" data-view="courses">
    <header class="view-hero cx-hero" aria-labelledby="cx-title">
      <div class="container cx-hero__grid">
        <p class="eyebrow cx-hero__eyebrow" data-intro><span class="eyebrow__num">02</span>Courses</p>
        <h1 class="cx-hero__title" id="cx-title" data-split="intro">What we teach,<br /><em>and <span class="pen-mark">when.${penUnderline()}</span></em></h1>
        <p class="lead cx-hero__lead" data-intro>
          Every group by level and syllabus code, with its weekly times, the monthly fee and the seats still open.
        </p>
        ${heroIndex(content, cat)}
      </div>
    </header>

    <section class="section cx-register" id="cx-register" aria-labelledby="cx-register-title">
      <h2 class="sr-only" id="cx-register-title">All courses</h2>
      <div class="container cx-register__grid">
        ${total ? html`<div class="cx-filters" id="cx-filters">
          <div class="cx-filters__inner">
            <p class="cx-filters__k" aria-hidden="true"><span>Filter the list</span><span class="cx-filters__k-n">${pad(total)}</span></p>
            <form class="cx-search" role="search" data-cx-search>
              <label class="cx-search__label" for="cx-q">Search</label>
              <div class="cx-search__field">
                ${icon("search", { size: 18, cls: "cx-search__icon" })}
                <input class="cx-search__input" id="cx-q" type="search" name="q" value="${st.q}" placeholder="Code, subject or topic"
                  autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="60" aria-controls="cx-results" />
                <button class="cx-search__x" type="button" data-cx-qclear aria-label="Clear the search"${st.q ? "" : html` hidden`}>${icon("close", { size: 16 })}</button>
              </div>
            </form>
            <div class="cx-chips" data-cx-chips>
              <div class="cx-group" role="group" aria-labelledby="cx-g-level">
                <p class="cx-group__label" id="cx-g-level">Level</p>
                <div class="cx-group__chips">
                  ${chip("level", "", "All levels", f.level[""], !st.level)}
                  ${cat.levels.map((l) => chip("level", l.id, l.name || l.id, f.level[l.id] || 0, st.level === l.id))}
                </div>
              </div>
              <span class="cx-chips__sep" aria-hidden="true"></span>
              <div class="cx-group" role="group" aria-labelledby="cx-g-cat">
                <p class="cx-group__label" id="cx-g-cat">Subject</p>
                <div class="cx-group__chips">
                  ${chip("cat", "", "All subjects", f.category[""], !st.cat)}
                  ${cat.cats.map((x) => chip("cat", x.id, x.name || x.id, f.category[x.id] || 0, st.cat === x.id))}
                </div>
              </div>
            </div>
            <div class="cx-filters__foot">
              <p class="cx-filters__count"><span class="cx-filters__shown" data-cx-shown>${pad(shown.length)}</span><span class="cx-filters__of"> of ${pad(total)}</span><span class="cx-filters__word"> shown</span></p>
              <button class="cx-clear" type="button" data-cx-clear${active ? "" : html` disabled`}>
                ${icon("close", { size: 14 })}<span>Clear<span class="cx-clear__all"> all</span></span>
              </button>
            </div>
          </div>
        </div>` : ""}

        <div class="cx-results${total ? "" : " cx-results--full"}" id="cx-results">
          ${total
            ? html`<div class="cx-grid" data-cx-grid>
                ${cat.groups.map((g, gi) => {
                  const showHead = !st.level && g.items.some((c) => shownIds.has(c.id));
                  const first = showHead && firstHead;
                  if (showHead) firstHead = false;
                  return html`${headCell(content, g, gi, cat.groups.length, { first, hidden: !showHead })}
                    ${g.items.map((c) => {
                      const on = shownIds.has(c.id);
                      return html`<div class="cx-cell" data-cx-cell data-id="${c.id}"${on ? "" : html` style="display:none"`}>
                        <div class="cx-cell__in">${courseCard(content, c)}</div>
                      </div>`;
                    })}`;
                })}
              </div>
              <div class="cx-empty" data-cx-empty${shown.length ? html` hidden` : ""}>
                <p class="cx-empty__zero" aria-hidden="true"><span class="pen-mark">0${penCircle()}</span></p>
                <div class="cx-empty__body">
                  <p class="cx-empty__mark">0 of ${pad(total)} · No match</p>
                  <p class="cx-empty__title">Nothing on the list <em>for that.</em></p>
                  <p class="cx-empty__text" data-cx-empty-text>${emptyText(content, st)} Try a different level or subject, or ask us — we’ll point you to the closest group.</p>
                  <div class="cx-empty__actions">
                    <button class="btn btn--primary btn--sm" type="button" data-cx-clear><span>Clear the filters</span></button>
                    <button class="btn btn--ghost btn--sm" type="button" data-cx-widen hidden><span data-cx-widen-label>Search every level</span></button>
                    ${wa ? html`<a class="link-arrow" href="${wa}" target="_blank" rel="noopener">Ask on WhatsApp${icon("arrow-up-right", { size: 16 })}</a>` : ""}
                  </div>
                </div>
              </div>`
            : html`<div class="cx-empty cx-empty--none">
                <div class="cx-empty__body">
                  <p class="cx-empty__mark">The list is being updated</p>
                  <p class="cx-empty__title">No courses are listed <em>right now.</em></p>
                  <p class="cx-empty__text">The timetable for the next term is being prepared. Ask on WhatsApp or by email and we’ll tell you what’s running.</p>
                  <div class="cx-empty__actions">
                    ${wa ? html`<a class="btn btn--primary btn--sm" href="${wa}" target="_blank" rel="noopener"><span>Ask on WhatsApp</span></a>` : ""}
                    <a class="btn btn--ghost btn--sm" href="#/enrol"><span>Make an enquiry</span></a>
                  </div>
                </div>
              </div>`}
          ${total && hasQuiz(content)
            ? html`<p class="cx-register__foot" data-reveal>
                <span class="cx-register__end">End of list</span>
                <a class="link-arrow" href="#/quiz">Between two levels? Try the placement check${icon("arrow-right", { size: 16 })}</a>
              </p>`
            : ""}
          <p class="sr-only" data-cx-status></p>
        </div>
      </div>
    </section>
  </section>`;
}


/* ------------------------------------------------------------------ course page */

// Same subject at another level first (the natural next/previous year), then the same subject
// family, then other subjects at the same level.
function related(content, c, n = 3) {
  const all = visible(content.courses).filter((x) => x && x.id && x.id !== c.id);
  const t = norm(c.title).trim();
  const score = (x) => {
    if (x.category === c.category && norm(x.title).trim() === t) return 0;
    if (x.category === c.category && x.level === c.level) return 1;
    if (x.category === c.category) return 2;
    if (x.level === c.level) return 3;
    return 9;
  };
  return all
    .map((x, i) => ({ x, i, s: score(x) }))
    .filter((r) => r.s < 9)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .slice(0, n)
    .map((r) => r.x);
}

function weekStrip(sessions) {
  const usesSun = sessions.some((s) => s.day === "sun");
  const days = DAYS.filter((d) => d.id !== "sun" || usesSun);
  return html`<ol class="cx-week" style="--days:${days.length}" data-stagger="0.06">
    ${days.map((d) => {
      const list = sessions.filter((s) => s.day === d.id);
      return html`<li class="cx-day${list.length ? " is-on" : ""}"${list.length ? "" : html` aria-hidden="true"`}>
        <span class="cx-day__name"><span class="cx-day__long">${d.name}</span><span class="cx-day__short" aria-hidden="true">${d.short}</span></span>
        ${list.length
          ? list.map(
              (s) => html`<span class="cx-day__slot">
                <span class="cx-day__time">${s.start}</span>
                <span class="cx-day__end">until ${s.end}</span>
                ${s.room ? html`<span class="cx-day__room">${s.room}</span>` : ""}
              </span>`
            )
          : html`<span class="cx-day__none">—</span>`}
      </li>`;
    })}
  </ol>`;
}

function tutorBlock(content, c) {
  const t = tutorFor(content, c);
  if (!t || t.visible === false) return "";
  const photo = safeUrl(t.photo);
  const others = visible(content.courses).filter((x) => x && x.tutorId === t.id && x.id !== c.id);
  const years = num(t.years);
  return html`<div class="cx-tutor">
    <div class="cx-tutor__face${photo ? " has-photo" : ""}">
      ${photo
        ? html`<img src="${photo}" alt="${t.name}" width="160" height="200" loading="lazy" decoding="async" />`
        : html`<span class="cx-tutor__mono" aria-hidden="true">${initials(t.name) || "?"}</span>`}
      ${years !== null ? html`<span class="cx-tutor__years" aria-hidden="true">${years} yrs</span>` : ""}
    </div>
    <div class="cx-tutor__body">
      <p class="cx-tutor__name">${t.name}</p>
      ${t.role ? html`<p class="cx-tutor__role">${t.role}</p>` : ""}
      ${t.bio ? html`<p class="cx-tutor__bio">${firstSentence(t.bio)}</p>` : ""}
      ${years !== null ? html`<p class="sr-only">${years} years of teaching.</p>` : ""}
      ${others.length
        ? html`<div class="cx-tutor__also">
            <p class="cx-tutor__k">Also teaches</p>
            <ul class="cx-tutor__list">
              ${others.slice(0, 8).map(
                (o) => html`<li><a href="${courseHref(o)}">${o.title}<span class="cx-tutor__code">${codeOf(content, o)}</span></a></li>`
              )}
            </ul>
          </div>`
        : ""}
      <a class="link-arrow cx-tutor__more" href="#/tutors">Meet the tutors${icon("arrow-right", { size: 16 })}</a>
    </div>
  </div>`;
}

function slip(content, c, { wa, mail, enrolHref, rows }) {
  const code = String(c.code || "").trim();
  const sessions = sessionsFor(content, c.id);
  const pay = (content.site && content.site.payment) || {};
  const ways = [pay.juice && "MCB Juice", pay.bank && "bank transfer"].filter(Boolean);
  const left = num(c.seatsLeft);
  const full = left !== null && left <= 0;
  const exam = levelExam(content, c.level);
  return html`<aside class="cx-slip" aria-labelledby="cx-slip-title" style="--rows:${rows}">
    <div class="cx-slip__inner" data-reveal>
      <p class="cx-slip__k"><span>Entry slip</span>${code ? html`<span>No. ${code}</span>` : ""}</p>
      <p class="cx-slip__title" id="cx-slip-title">${c.title}<span class="sr-only"> — fees and places</span></p>
      <p class="cx-slip__level">${levelName(content, c.level)}${exam ? html` · ${exam}` : ""}</p>
      <dl class="cx-slip__rows">
        <div class="cx-slip__row cx-slip__row--fee">
          <dt>Fee</dt>
          <dd>${num(c.fee) !== null ? html`<span class="cx-slip__fee">${formatRs(c.fee)}</span><span class="cx-slip__per">a month</span>` : "On request"}</dd>
        </div>
        ${c.mode ? html`<div class="cx-slip__row"><dt>Format</dt><dd>${modeBadge(c.mode)}</dd></div>` : ""}
        <div class="cx-slip__row">
          <dt>Weekly</dt>
          <dd>${sessions.length
            ? html`<span class="cx-slip__slots">${sessions.map((s) => html`<span>${dayShort(s.day)} ${s.start}</span>`)}</span>`
            : "Times on request"}</dd>
        </div>
        ${left !== null
          ? html`<div class="cx-slip__row cx-slip__row--seats">
              <dt>Seats</dt>
              <dd><span class="cx-slip__left">${seatText(c, { long: true })}</span>${seatDots(c.seats, c.seatsLeft)}</dd>
            </div>`
          : ""}
      </dl>
      <div class="cx-slip__actions">
        <a class="btn btn--primary btn--block" href="${enrolHref}" data-magnetic="0.12">
          <span>${full ? "Join the waiting list" : "Enrol in this course"}</span>${arrow()}
        </a>
        ${wa
          ? html`<a class="btn btn--ghost btn--block" href="${wa}" target="_blank" rel="noopener">
              <span>Ask on WhatsApp<span class="sr-only"> (opens WhatsApp)</span></span><span class="btn__icon">${icon("whatsapp", { size: 18 })}</span>
            </a>`
          : mail
          ? html`<a class="btn btn--ghost btn--block" href="${mail}"><span>Ask by email</span><span class="btn__icon">${icon("mail", { size: 16 })}</span></a>`
          : ""}
      </div>
      ${ways.length ? html`<p class="cx-slip__note">Paid monthly by ${ways.join(" or ")}. <a class="link" href="#/plans">Plans &amp; payment</a></p>` : ""}
    </div>
  </aside>`;
}

function renderDetail(ctx, c) {
  const content = ctx.content || {};
  const site = content.site || {};
  const code = String(c.code || "").trim();
  const big = code || shortExam(content, c.level);
  const lvl = levelName(content, c.level);
  const exam = levelExam(content, c.level);
  const sessions = sessionsFor(content, c.id);
  const mins = sessions.reduce((a, s) => a + Math.max(0, toMin(s.end) - toMin(s.start)), 0);
  const topics = (Array.isArray(c.topics) ? c.topics : []).map((t) => String(t || "").trim()).filter(Boolean);
  const question = `Hello, I’m interested in ${c.title}${code ? ` (${code})` : ""} for ${lvl}. Is there still a place in the group, and when could we start?`;
  const wa = whatsappLink(site.whatsapp, question);
  const mail = !wa && site.email ? mailtoLink(site.email, `${c.title}${code ? ` ${code}` : ""} — ${lvl}`, question) : null;
  const enrolHref = `#/enrol?course=${encodeURIComponent(c.id)}`;
  const tutor = tutorBlock(content, c);
  const rel = related(content, c);
  const left = num(c.seatsLeft);
  const full = left !== null && left <= 0;
  const hasLevel = (content.levels || []).some((l) => l && l.id === c.level);
  const desc = String(c.description || "").trim();
  let part = 0;
  const next = () => pad(++part);
  const rows = (desc ? 1 : 0) + (topics.length ? 1 : 0) + 1 + (tutor ? 1 : 0);

  const about = desc
    ? html`<section class="cx-part cx-part--about" aria-labelledby="cx-p-about">
        <h2 class="eyebrow cx-part__h" id="cx-p-about" data-reveal><span class="eyebrow__num">${next()}</span>The course</h2>
        <div class="cx-about" data-reveal>${paragraphs(desc)}</div>
      </section>`
    : "";

  const syllabus = topics.length
    ? html`<section class="cx-part cx-part--syl" aria-labelledby="cx-p-syl">
        <div class="cx-part__top">
          <h2 class="eyebrow cx-part__h" id="cx-p-syl" data-reveal><span class="eyebrow__num">${next()}</span>Syllabus</h2>
          <p class="cx-part__aside" data-reveal>${topics.length} ${topics.length === 1 ? "topic" : "topics"}${code ? html` · Cambridge ${code}` : ""}</p>
        </div>
        <ol class="cx-syl" style="--half:${Math.ceil(topics.length / 2)}">
          ${topics.map(
            (t, i) => html`<li class="cx-syl__row">
              <span class="cx-syl__n">1.${i + 1}</span>
              <span class="cx-syl__t">${t}</span>
              <span class="cx-syl__tick">${penTick()}</span>
            </li>`
          )}
        </ol>
      </section>`
    : "";

  const week = html`<section class="cx-part cx-part--week" aria-labelledby="cx-p-week">
    <div class="cx-part__top">
      <h2 class="eyebrow cx-part__h" id="cx-p-week" data-reveal><span class="eyebrow__num">${next()}</span>Each week</h2>
      ${sessions.length ? html`<p class="cx-part__aside" data-reveal>${sessionsWord(sessions.length)} · ${fmtDur(mins)} in total</p>` : ""}
    </div>
    ${sessions.length
      ? weekStrip(sessions)
      : html`<p class="cx-week-none" data-reveal>Times for this group are being set. Ask and we’ll send them as soon as they’re fixed.</p>`}
  </section>`;

  const tutorPart = tutor
    ? html`<section class="cx-part cx-part--tutor" aria-labelledby="cx-p-tutor">
        <h2 class="eyebrow cx-part__h" id="cx-p-tutor" data-reveal><span class="eyebrow__num">${next()}</span>Taught by</h2>
        <div data-reveal>${tutor}</div>
      </section>`
    : "";

  return html`<section class="view view--courses cx-detail" data-view="courses">
    <header class="view-hero cx-dhero" aria-labelledby="cx-d-title">
      <div class="container cx-dhero__grid">
        <nav class="cx-crumbs" aria-label="Breadcrumb" data-intro>
          <a class="cx-back" href="${listHref()}">${icon("arrow-left", { size: 16 })}<span>All courses</span></a>
          ${hasLevel
            ? html`<span class="cx-crumbs__sep" aria-hidden="true">/</span>
                <a class="cx-crumbs__lvl" href="#/courses?level=${encodeURIComponent(c.level)}">${lvl}</a>`
            : ""}
        </nav>
        ${big
          ? html`<p class="cx-dhero__code"><span class="sr-only">Syllabus code </span>${[...big].map((ch) => html`<span class="cx-dhero__digit" data-intro="clip">${ch}</span>`)}</p>`
          : ""}
        <h1 class="cx-dhero__title" id="cx-d-title" data-split="intro">${c.title}</h1>
        <ul class="cx-dhero__meta" data-intro>
          <li>${lvl}${exam ? html`<span class="cx-dhero__exam">${exam}</span>` : ""}</li>
          ${c.mode ? html`<li>${modeBadge(c.mode)}</li>` : ""}
          ${sessions.length ? html`<li>${sessionsWord(sessions.length)} a week</li>` : ""}
          ${num(c.fee) !== null ? html`<li>${formatRs(c.fee)} a month</li>` : ""}
        </ul>
        ${c.summary ? html`<p class="lead cx-dhero__lead" data-intro>${c.summary}</p>` : ""}
        <div class="cx-dhero__actions" data-intro>
          <a class="btn btn--primary btn--lg" href="${enrolHref}" data-magnetic>
            <span>${full ? "Join the waiting list" : "Enrol in this course"}</span>${arrow()}
          </a>
          ${wa
            ? html`<a class="btn btn--ghost btn--lg" href="${wa}" target="_blank" rel="noopener" data-magnetic>
                <span>Ask on WhatsApp<span class="sr-only"> (opens WhatsApp)</span></span><span class="btn__icon">${icon("whatsapp", { size: 18 })}</span>
              </a>`
            : mail
            ? html`<a class="btn btn--ghost btn--lg" href="${mail}" data-magnetic><span>Ask by email</span><span class="btn__icon">${icon("mail", { size: 16 })}</span></a>`
            : ""}
        </div>
      </div>
    </header>

    <section class="section cx-body" aria-label="About this course">
      <div class="container cx-body__grid">
        ${about}
        ${slip(content, c, { wa, mail, enrolHref, rows })}
        ${syllabus}
        ${week}
        ${tutorPart}
      </div>
    </section>

    ${rel.length
      ? html`<section class="section section--paper-2 cx-related" aria-labelledby="cx-rel-title">
          <div class="container">
            <div class="cx-related__head">
              <p class="eyebrow" data-reveal><span class="eyebrow__num">${pad(part + 1)}</span>Related</p>
              <h2 class="h2 cx-related__title" id="cx-rel-title" data-split>Same subject, <em>or same year.</em></h2>
              <a class="link-arrow cx-related__all" href="${listHref()}" data-reveal>Back to all courses${icon("arrow-right", { size: 16 })}</a>
            </div>
            <div class="cx-related__grid" data-stagger="0.1">
              ${rel.map((r) => html`<div class="cx-cell">${courseCard(content, r, "cx-rel")}</div>`)}
            </div>
          </div>
        </section>`
      : ""}
  </section>`;
}

function renderMissing(ctx, id) {
  const content = ctx.content || {};
  const cat = catalogue(content);
  const shown = String(id || "").slice(0, 60);
  const words = tokens(shown.replace(/[-_./]+/g, " ")).filter((w) => w.length > 1);
  const sugg = words.length
    ? cat.courses
        .map((c, i) => {
          const h = `${cat.hay.get(c.id) || ""} ${norm(c.id)}`;
          return { c, i, s: words.filter((w) => h.includes(w)).length };
        })
        .filter((x) => x.s)
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .slice(0, 4)
        .map((x) => x.c)
    : [];
  return html`<section class="view view--courses cx-missing" data-view="courses">
    <header class="view-hero cx-hero cx-missing__hero" aria-labelledby="cx-title">
      <div class="container cx-hero__grid">
        <p class="eyebrow cx-hero__eyebrow" data-intro><span class="eyebrow__num">02</span>Courses</p>
        <h1 class="cx-hero__title" id="cx-title" data-split="intro">That course isn’t<br /><em>on the <span class="pen-mark">list.${penUnderline()}</span></em></h1>
        <p class="lead cx-hero__lead" data-intro>We couldn’t find a course at “${shown}”. It may have been renamed, or it isn’t running this year.</p>
        ${sugg.length
          ? html`<div class="cx-missing__sugg" data-intro>
              <p class="cx-missing__k">Did you mean</p>
              <ul class="cx-toc">
                ${sugg.map(
                  (c) => html`<li>
                    <a class="cx-toc__row" href="${courseHref(c)}">
                      <span class="cx-toc__i">${codeOf(content, c) || "—"}</span>
                      <span class="cx-toc__name">${c.title}</span>
                      <span class="cx-toc__exam">${levelName(content, c.level)}</span>
                      <span class="cx-toc__dots" aria-hidden="true"></span>
                      <span class="cx-toc__go" aria-hidden="true">${icon("arrow-right", { size: 16 })}</span>
                    </a>
                  </li>`
                )}
              </ul>
            </div>`
          : ""}
        <div class="cx-missing__actions" data-intro>
          <a class="btn btn--primary" href="#/courses" data-magnetic><span>See all courses</span>${arrow()}</a>
          <a class="btn btn--ghost" href="#/quiz" data-magnetic><span>Try the placement check</span>${arrow()}</a>
        </div>
      </div>
    </header>
  </section>`;
}

/* ------------------------------------------------------------------ mount: catalogue */

function mountList(root, ctx) {
  const gsap = window.gsap;
  const Flip = window.Flip;
  const ST = window.ScrollTrigger;
  const motion = ctx.motion || {};
  const reduced = !!motion.reduced;
  const ease = (motion.ease && motion.ease.out) || "expo.out";
  const content = ctx.content || {};
  const cat = catalogue(content);
  let st = readState(ctx.query, cat);
  lastListQuery = queryOf(st);

  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const grid = $("[data-cx-grid]");
  const empty = $("[data-cx-empty]");
  const emptyText_ = $("[data-cx-empty-text]");
  const form = $("[data-cx-search]");
  const input = $("#cx-q");
  const qclear = $("[data-cx-qclear]");
  const clears = $$("[data-cx-clear]");
  const widen = $("[data-cx-widen]");
  const widenLabel = $("[data-cx-widen-label]");
  const shownEl = $("[data-cx-shown]");
  const status = $("[data-cx-status]");
  const regGrid = $(".cx-register__grid");
  const chipsEl = $("[data-cx-chips]");
  const chips = $$("[data-cx-filter]");
  const cells = grid ? [...grid.querySelectorAll("[data-cx-cell]")] : [];
  const courseCells = cells.filter((c) => c.dataset.id);
  const headCells = cells.filter((c) => c.dataset.cxHead);
  const offs = [];
  const on = (el, type, fn, opts) => {
    if (!el) return;
    el.addEventListener(type, fn, opts);
    offs.push(() => el.removeEventListener(type, fn, opts));
  };

  // Pen strokes can't be measured while hidden: park them and draw when they're first shown.
  const park = (scope) =>
    scope.querySelectorAll("[data-draw]").forEach((p) => {
      p.removeAttribute("data-draw");
      p.setAttribute("data-cx-draw", "");
    });
  const unpark = (scope, delay = 0) => {
    const ps = scope.querySelectorAll("[data-cx-draw]");
    ps.forEach((p) => {
      p.removeAttribute("data-cx-draw");
      p.setAttribute("data-draw", "");
    });
    if (ps.length && !reduced && motion.draw) motion.draw(scope, { delay });
  };
  if (empty) park(empty);
  cells.forEach((cell) => cell.style.display === "none" && park(cell));

  /* ---- card reveal: each row of cards lands like a sheet of paper ----
     Cards wait at opacity 0 (never visibility:hidden), so they stay in the tab order and the
     accessibility tree; keyboard focus arriving before the scroll shows them all at once. */
  const inners = cells.map((c) => c.querySelector(".cx-cell__in")).filter(Boolean);
  let revealed = reduced || !gsap || !ST || !inners.length;
  let batch = [];
  if (!revealed) {
    gsap.set(inners, { opacity: 0, y: 46, rotationX: -12, transformPerspective: 1100, transformOrigin: "50% 0%" });
    batch = ST.batch(inners, {
      start: "top 92%",
      once: true,
      onEnter: (els) =>
        gsap.to(els, { opacity: 1, y: 0, rotationX: 0, duration: 1, ease, stagger: 0.085, overwrite: true, clearProps: "transform,opacity" }),
    });
  }
  const revealAll = () => {
    if (revealed) return;
    revealed = true;
    batch.forEach((t) => t.kill());
    const rest = inners.filter((el) => Number(gsap.getProperty(el, "opacity")) < 1);
    if (rest.length) gsap.to(rest, { opacity: 1, y: 0, rotationX: 0, duration: 0.5, ease, overwrite: true, clearProps: "transform,opacity" });
  };
  on(grid, "focusin", revealAll);

  /* ---- layout changes ---- */
  let refreshT = 0;
  const queueRefresh = () => {
    clearTimeout(refreshT);
    refreshT = setTimeout(() => motion.refresh && motion.refresh(), 120);
  };
  let flipTl = null;
  let enterTw = null;
  let leaveTw = null;
  let hTween = null;
  const settle = () => [flipTl, enterTw, leaveTw, hTween].forEach((t) => t && t.progress(1));

  function relayout(change, animate) {
    if (!grid) return change();
    if (!animate || reduced || !gsap || !Flip) {
      settle();
      change();
      if (gsap && animate) gsap.fromTo(grid, { opacity: 0.3 }, { opacity: 1, duration: 0.18, ease: "power1.out", clearProps: "opacity" });
      queueRefresh();
      return;
    }
    const startH = grid.getBoundingClientRect().height;
    const state = Flip.getState(cells, { props: "opacity" });
    settle();
    change();
    const endH = grid.getBoundingClientRect().height;
    flipTl = Flip.from(state, {
      duration: 0.85,
      ease,
      absoluteOnLeave: true,
      stagger: 0.012,
      onEnter: (els) => {
        enterTw = gsap.fromTo(
          els,
          { opacity: 0, y: 44, scale: 1, rotationX: -14, transformPerspective: 1100, transformOrigin: "50% 0%" },
          { opacity: 1, y: 0, rotationX: 0, duration: 0.85, delay: 0.16, stagger: Math.min(0.045, 0.32 / els.length), ease, overwrite: true, clearProps: "transform,opacity" }
        );
        return enterTw;
      },
      onLeave: (els) => {
        leaveTw = gsap.to(els, { opacity: 0, scale: 0.94, duration: 0.3, ease: "power2.in", overwrite: true });
        return leaveTw;
      },
      onComplete: queueRefresh,
    });
    if (Math.abs(endH - startH) > 1) {
      hTween = gsap.fromTo(grid, { height: startH }, { height: endH, duration: 0.85, ease, clearProps: "height" });
    }
  }

  const scrollToList = () => {
    if (regGrid && motion.scrollTo) motion.scrollTo(regGrid);
  };

  let annT = 0;
  function say(n) {
    clearTimeout(annT);
    annT = setTimeout(() => {
      const msg = n ? `${n} ${n === 1 ? "course" : "courses"} shown` : "No courses match these filters";
      if (ctx.announce) ctx.announce(msg);
      else if (status) status.textContent = msg;
    }, 450);
  }

  // Keep the pressed chip in view inside the horizontal chip row (small screens).
  function revealChip(btn) {
    if (!chipsEl || !btn || chipsEl.scrollWidth <= chipsEl.clientWidth + 2) return;
    const l = btn.offsetLeft - chipsEl.offsetLeft;
    const r = l + btn.offsetWidth;
    const pad_ = 24;
    if (l < chipsEl.scrollLeft + pad_) chipsEl.scrollTo({ left: Math.max(0, l - pad_), behavior: reduced ? "auto" : "smooth" });
    else if (r > chipsEl.scrollLeft + chipsEl.clientWidth - pad_)
      chipsEl.scrollTo({ left: r - chipsEl.clientWidth + pad_, behavior: reduced ? "auto" : "smooth" });
  }

  function apply(next, { animate = true, scroll = false, from = "" } = {}) {
    const prev = st;
    st = { level: next.level || "", cat: next.cat || "", q: String(next.q || "").slice(0, 60) };
    lastListQuery = queryOf(st);
    if (ctx.setQuery) ctx.setQuery({ level: st.level, cat: st.cat, q: st.q.trim() });

    const f = facets(cat, st);
    chips.forEach((b) => {
      const g = b.dataset.cxFilter;
      const v = b.dataset.value || "";
      const pressed = g === "level" ? st.level === v : st.cat === v;
      b.setAttribute("aria-pressed", pressed ? "true" : "false");
      const n = (g === "level" ? f.level[v] : f.category[v]) || 0;
      const cnt = b.querySelector("[data-cx-count]");
      if (cnt) cnt.textContent = pad(n);
      b.classList.toggle("is-zero", !n);
    });
    if (input && from !== "input" && input.value !== st.q) input.value = st.q;
    if (qclear) qclear.hidden = !(input ? input.value : st.q);
    const active = !!(st.level || st.cat || st.q.trim());
    clears.forEach((b) => {
      if (!b.closest("[data-cx-empty]")) b.disabled = !active;
    });

    const shown = cat.courses.filter((c) => test(c, st, cat.hay));
    const ids = new Set(shown.map((c) => c.id));
    const wasEmpty = empty ? !empty.hidden : false;

    if (empty) {
      if (emptyText_) emptyText_.textContent = `${emptyText(content, st)} Try a different level or subject, or ask us — we’ll point you to the closest group.`;
      const wide = st.q.trim() && (st.level || st.cat) ? cat.courses.filter((c) => test(c, { level: "", cat: "", q: st.q }, cat.hay)).length : 0;
      if (widen) {
        widen.hidden = !wide;
        if (widenLabel) widenLabel.textContent = `Search every level and subject (${wide})`;
      }
    }

    const change = () => {
      courseCells.forEach((cell) => {
        cell.style.display = ids.has(cell.dataset.id) ? "" : "none";
      });
      let first = true;
      headCells.forEach((cell) => {
        const g = cat.groups.find((x) => x.id === cell.dataset.cxHead);
        const n = g ? g.items.filter((c) => ids.has(c.id)).length : 0;
        const show = !st.level && n > 0;
        cell.style.display = show ? "" : "none";
        cell.classList.toggle("is-first", show && first);
        if (show) first = false;
        const hc = cell.querySelector("[data-cx-headcount]");
        if (hc) hc.textContent = pad(n);
      });
      if (empty) empty.hidden = ids.size > 0;
      if (shownEl) shownEl.textContent = pad(ids.size);
    };

    revealAll();
    relayout(change, animate);

    // Draw any pen marks that were parked while their card was hidden.
    courseCells.forEach((cell) => ids.has(cell.dataset.id) && unpark(cell, 0.7));
    if (empty && !empty.hidden && !wasEmpty) {
      if (empty.querySelector("[data-cx-draw]")) unpark(empty, 0.35);
      else if (!reduced && motion.draw) motion.draw(empty, { delay: 0.35 });
      if (gsap && !reduced) gsap.fromTo(empty, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, delay: 0.2, ease, clearProps: "transform,opacity" });
    }

    if (scroll) scrollToList();
    else if (regGrid && regGrid.getBoundingClientRect().top < -2) scrollToList();

    if (prev.level !== st.level) revealChip(chips.find((b) => b.dataset.cxFilter === "level" && (b.dataset.value || "") === st.level));
    else if (prev.cat !== st.cat) revealChip(chips.find((b) => b.dataset.cxFilter === "cat" && (b.dataset.value || "") === st.cat));
    say(ids.size);
  }

  /* ---- events ---- */
  on(chipsEl, "click", (e) => {
    const b = e.target.closest("[data-cx-filter]");
    if (!b) return;
    const g = b.dataset.cxFilter === "level" ? "level" : "cat";
    const v = b.dataset.value || "";
    apply({ ...st, [g]: v && st[g] === v ? "" : v });
  });

  let qT = 0;
  on(input, "input", () => {
    if (qclear) qclear.hidden = !input.value;
    clearTimeout(qT);
    qT = setTimeout(() => apply({ ...st, q: input.value }, { from: "input" }), 200);
  });
  on(input, "keydown", (e) => {
    if (e.key === "Escape" && input.value) {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(qT);
      input.value = "";
      apply({ ...st, q: "" });
    }
  });
  on(form, "submit", (e) => {
    e.preventDefault();
    clearTimeout(qT);
    if (input.value !== st.q) apply({ ...st, q: input.value }, { from: "input" });
    if (window.matchMedia && window.matchMedia("(hover: none)").matches) input.blur();
  });
  on(qclear, "click", () => {
    clearTimeout(qT);
    input.value = "";
    apply({ ...st, q: "" });
    input.focus({ preventScroll: true });
  });
  clears.forEach((b) =>
    on(b, "click", () => {
      clearTimeout(qT);
      apply({ level: "", cat: "", q: "" });
      const firstChip = chips[0];
      if (firstChip) firstChip.focus({ preventScroll: true });
    })
  );
  on(widen, "click", () => apply({ level: "", cat: "", q: st.q }));
  $$("[data-cx-jump]").forEach((a) =>
    on(a, "click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      apply({ level: a.getAttribute("data-cx-jump") || "", cat: "", q: "" }, { scroll: true });
    })
  );

  // On small screens the chip row scrolls sideways natively; keep Lenis out of its way there.
  const mq = window.matchMedia ? window.matchMedia("(max-width: 959px)") : null;
  const syncLenis = () => {
    if (!chipsEl) return;
    if (mq && mq.matches) chipsEl.setAttribute("data-lenis-prevent", "");
    else chipsEl.removeAttribute("data-lenis-prevent");
  };
  syncLenis();
  if (mq) {
    if (mq.addEventListener) mq.addEventListener("change", syncLenis);
    offs.push(() => mq.removeEventListener && mq.removeEventListener("change", syncLenis));
  }
  // Start a filtered list (e.g. #/courses?level=sc) with the pressed chip in view.
  requestAnimationFrame(() => {
    const pressed = chips.filter((b) => b.getAttribute("aria-pressed") === "true" && b.dataset.value);
    if (pressed[0]) revealChip(pressed[0]);
  });

  const me = {
    apply(query) {
      const nx = readState(query, cat);
      const same = nx.level === st.level && nx.cat === st.cat && nx.q.trim() === st.q.trim();
      const below = regGrid ? regGrid.getBoundingClientRect().top > window.innerHeight * 0.5 : false;
      if (same) {
        if (below) scrollToList();
        return;
      }
      apply(nx, { scroll: below });
    },
  };
  live = me;

  return () => {
    offs.forEach((off) => off());
    clearTimeout(qT);
    clearTimeout(annT);
    clearTimeout(refreshT);
    [flipTl, enterTw, leaveTw, hTween].forEach((t) => t && t.kill());
    if (live === me) live = null;
  };
}

/* ------------------------------------------------------------------ mount: course page */

// A different plaster model takes centre stage for each subject family.
const SCENE_KEYS = ["sphere", "cube", "cone", "cylinder", "torus", "ico", "pyramid", "prism"];
const SUBJECT_MODEL = { maths: "ico", sciences: "cylinder", commerce: "cube", computing: "prism", languages: "torus" };
function sceneIndex(category) {
  const key = SUBJECT_MODEL[category];
  if (!key) return null;
  const api = window.KT && window.KT.sceneApi;
  const names = api && Array.isArray(api.names) ? api.names : SCENE_KEYS;
  const i = names.indexOf(key);
  return i >= 0 ? i : null;
}

function mountDetail(root, ctx, c) {
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  const motion = ctx.motion || {};
  const reduced = !!motion.reduced;
  const ease = (motion.ease && motion.ease.out) || "expo.out";
  const scene = ctx.scene;
  const focus = sceneIndex(c.category);
  if (scene && focus !== null) scene.focus(focus);

  // The syllabus is marked like a script: each line lands, then gets its tick.
  const rows = [...root.querySelectorAll(".cx-syl__row")];
  if (rows.length && !reduced && gsap && ST) {
    const ticks = rows.map((r) => r.querySelector(".cx-syl__tick"));
    rows.forEach((r) =>
      r.querySelectorAll("[data-draw]").forEach((p) => {
        p.removeAttribute("data-draw");
        p.setAttribute("data-cx-draw", "");
      })
    );
    // Opacity only (not visibility), so screen readers get the whole syllabus before it's scrolled to.
    gsap.set(rows, { opacity: 0, y: 22 });
    gsap.set(ticks, { opacity: 0 });
    ST.batch(rows, {
      start: "top 88%",
      once: true,
      onEnter: (els) => {
        gsap.to(els, { opacity: 1, y: 0, duration: 0.9, ease, stagger: 0.07, overwrite: true, clearProps: "transform,opacity" });
        els.forEach((row, i) => {
          const tick = row.querySelector(".cx-syl__tick");
          gsap.delayedCall(0.35 + i * 0.11, () => {
            if (!row.isConnected || !tick) return;
            tick.querySelectorAll("[data-cx-draw]").forEach((p) => {
              p.removeAttribute("data-cx-draw");
              p.setAttribute("data-draw", "");
            });
            gsap.set(tick, { clearProps: "opacity" });
            if (motion.draw) motion.draw(tick, { duration: 0.45, ease: "power2.out" });
          });
        });
      },
    });
  }

  return () => {
    if (scene && focus !== null) scene.focus(null);
  };
}

/* ------------------------------------------------------------------ view */

export default {
  id: "courses",
  title(ctx) {
    const id = ctx && ctx.params && ctx.params[0];
    if (!id) return "Courses";
    const c = findCourse((ctx && ctx.content) || {}, id);
    if (!c) return "Course not found";
    const code = String(c.code || "").trim();
    const lvl = levelName(ctx.content, c.level);
    return `${c.title}${code ? ` ${code}` : ""}${lvl ? ` · ${lvl}` : ""}`;
  },
  scene: (ctx) => (ctx && ctx.params && ctx.params[0] ? "single" : "shelf"),
  render(ctx) {
    const id = ctx.params && ctx.params[0];
    if (!id) return renderList(ctx);
    const c = findCourse(ctx.content || {}, id);
    return c ? renderDetail(ctx, c) : renderMissing(ctx, id);
  },
  mount(root, ctx) {
    const id = ctx.params && ctx.params[0];
    if (!id) return mountList(root, ctx);
    const c = findCourse(ctx.content || {}, id);
    return c ? mountDetail(root, ctx, c) : undefined;
  },
  onQuery(query, ctx) {
    if (ctx && ctx.params && ctx.params[0]) return;
    if (live) live.apply(query);
  },
};
