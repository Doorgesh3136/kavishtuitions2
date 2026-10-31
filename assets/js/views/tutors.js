// Tutors: who teaches. Hero with a contents list of the panel · the lead tutor as an editorial profile
// (a technical-drawing monogram plate, bio, exam-margin qualifications, the groups they take) · the rest of
// the panel as an expandable roster · how lessons run, as a one-week line · a signed call to enrol.
// Every block is derived from content.json and hides itself when its data is empty.
import { html, raw, icon, paragraphs, penUnderline } from "../ui.js";
import { visible, levelName, levelExam, sessionsFor, dayShort, safeUrl, DAYS } from "../store.js";

/* ------------------------------------------------------------------ helpers */

const pad = (n) => String(n).padStart(2, "0");
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];
const roman = (i) => ROMAN[i] || String(i + 1);
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const letterOf = (i) => LETTERS[i] || String(i + 1);

const initials = (name) =>
  String(name || "")
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
const firstLetter = (name) => (initials(name) || "?").charAt(0);
const yearsOf = (t) => {
  const y = Math.round(Number(t && t.years));
  return Number.isFinite(y) && y > 0 ? y : 0;
};
const sinceOf = (t) => {
  const y = yearsOf(t);
  return y ? new Date().getFullYear() - y : 0;
};
const shortExam = (content, levelId) => String(levelExam(content, levelId) || "").split("·")[0].trim();
const codeOf = (content, c) => c.code || shortExam(content, c.level) || "—";
const toMin = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const slug = (id) => String(id || "").replace(/[^a-zA-Z0-9_-]/g, "-");
// List fields are edited by hand in content.json: a lone string ("Mathematics") counts as one item,
// anything else that isn't a list as none, so one typo can't take the page down.
const listOf = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : []);
const textList = (v) => listOf(v).map((s) => (typeof s === "string" || typeof s === "number" ? String(s).trim() : "")).filter(Boolean);

function coursesFor(content, tutorId) {
  return visible(content.courses).filter((c) => c.tutorId === tutorId);
}

/** Sessions per week (and the days they fall on) across a tutor's visible courses. */
function loadOf(content, courses) {
  let sessions = 0;
  let minutes = 0;
  const days = new Set();
  courses.forEach((c) =>
    sessionsFor(content, c.id).forEach((s) => {
      sessions += 1;
      minutes += Math.max(0, toMin(s.end) - toMin(s.start));
      days.add(s.day);
    })
  );
  return { sessions, minutes, days: DAYS.filter((d) => days.has(d.id)).map((d) => d.id) };
}

const daysFor = (content, courseId) => {
  const seen = [];
  sessionsFor(content, courseId).forEach((s) => {
    if (!seen.includes(s.day)) seen.push(s.day);
  });
  return seen.map(dayShort).join(" · ");
};

const arrowIcon = (size = 16) => html`<span class="btn__icon">${icon("arrow-right", { size })}</span>`;

/* ------------------------------------------------------------------ plate (monogram as a construction drawing) */

// Construction geometry on a 400 × 500 plate: cap line, baseline, axis, an inscribed circle and diagonals.
const GEO = [
  '<path d="M-600 128H1000M-600 400H1000M-600 264H1000"/>',
  '<path d="M72 -600V1100M328 -600V1100M200 -600V1100"/>',
  '<circle cx="200" cy="264" r="136"/>',
  '<path d="M72 128L328 400M328 128L72 400"/>',
  '<path d="M72 128H328V400H72Z"/>',
].join("");
const TICKS = (() => {
  let d = "";
  for (let x = 72, i = 0; x <= 328; x += 16, i++) d += `M${x} ${i % 4 === 0 ? 452 : 458}V464`;
  return `<path d="${d}"/>`;
})();

function plate(content, t, index) {
  const photo = safeUrl(t.photo);
  const since = sinceOf(t);
  const letter = firstLetter(t.name);
  return html`<figure class="tt-plate${photo ? " has-photo" : ""}"${photo ? "" : raw(' aria-hidden="true"')} data-tilt>
    <div class="tt-plate__frame">
      ${photo
        ? html`<img class="tt-plate__img" src="${photo}" alt="${t.name}" loading="lazy" decoding="async" data-parallax="0.08" />`
        : ""}
      <svg class="tt-plate__geo tt-plate__geo--back" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${raw(GEO + TICKS)}</svg>
      ${photo
        ? ""
        : html`<svg class="tt-plate__glyph" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" data-parallax="0.06"><text x="200" y="400" text-anchor="middle">${letter}</text></svg>`}
      <svg class="tt-plate__geo tt-plate__geo--front" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${raw(GEO)}</svg>
      <svg class="tt-plate__pen pen" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path data-draw d="M62 236C70 160 128 118 204 122c70 4 122 50 132 112" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/><path data-draw d="M326 222l11 14 10-16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
      <span class="tt-plate__k tt-plate__k--tl">Plate ${roman(index).toUpperCase()}</span>
      <span class="tt-plate__k tt-plate__k--tr">${since ? `Since ${since}` : initials(t.name)}</span>
      <span class="tt-plate__k tt-plate__k--bl">${t.name}</span>
      <span class="tt-plate__k tt-plate__k--br">1 : 1</span>
    </div>
  </figure>`;
}

/** Small ink tile with the initial, used in the roster and the signatures. */
function tile(t, cls = "") {
  const photo = safeUrl(t.photo);
  return html`<span class="tt-tile${cls ? ` ${cls}` : ""}${photo ? " has-photo" : ""}" aria-hidden="true">${photo
    ? html`<img src="${photo}" alt="" loading="lazy" decoding="async" />`
    : html`<span class="tt-tile__l">${firstLetter(t.name)}</span>`}</span>`;
}

/* ------------------------------------------------------------------ shared blocks */

function credsBlock(t, id, h = "h3") {
  const creds = textList(t.credentials);
  if (!creds.length) return "";
  return html`<div class="tt-block">
    <${raw(h)} class="tt-label" id="${id}">Qualifications</${raw(h)}>
    <ol class="tt-creds" aria-labelledby="${id}">
      ${creds.map((c, i) => html`<li><span class="tt-creds__q" aria-hidden="true">(${letterOf(i)})</span><span class="tt-creds__t">${c}</span></li>`)}
    </ol>
  </div>`;
}

function subjectsBlock(t, id, h = "h3") {
  const subjects = textList(t.subjects);
  if (!subjects.length) return "";
  return html`<div class="tt-block">
    <${raw(h)} class="tt-label" id="${id}">Teaches</${raw(h)}>
    <ul class="tt-subjects" aria-labelledby="${id}">
      ${subjects.map((s) => html`<li class="tag">${s}</li>`)}
    </ul>
  </div>`;
}

function groupsBlock(content, courses, id, h = "h3") {
  if (!courses.length) return "";
  return html`<div class="tt-block">
    <${raw(h)} class="tt-label" id="${id}">Groups this year <span class="tt-label__n">${pad(courses.length)}</span></${raw(h)}>
    <ul class="tt-groups" aria-labelledby="${id}">
      ${courses.map((c) => {
        const days = daysFor(content, c.id);
        return html`<li>
          <a class="tt-group" href="#/courses/${encodeURIComponent(c.id)}" data-cursor="Course">
            <span class="tt-group__code">${codeOf(content, c)}</span>
            <span class="tt-group__title">${c.title}</span>
            <span class="tt-group__meta"><span>${levelName(content, c.level)}</span>${days ? html`<span class="tt-group__days">${days}</span>` : ""}</span>
            <span class="tt-group__go" aria-hidden="true">${icon("arrow-right", { size: 16 })}</span>
          </a>
        </li>`;
      })}
    </ul>
  </div>`;
}

function factsBlock(content, t, courses, { counts = true } = {}) {
  const years = yearsOf(t);
  const since = sinceOf(t);
  const load = loadOf(content, courses);
  const items = [];
  if (years)
    items.push(
      html`<div><dt>Teaching</dt><dd>${counts ? html`<span data-count="${years}">${years}</span>` : years} <span class="tt-unit">${years === 1 ? "year" : "years"}</span></dd></div>`
    );
  if (since) items.push(html`<div><dt>Since</dt><dd class="num">${since}</dd></div>`);
  if (courses.length) items.push(html`<div><dt>Groups</dt><dd>${courses.length} <span class="tt-unit">this year</span></dd></div>`);
  if (load.sessions)
    items.push(html`<div><dt>Each week</dt><dd>${load.sessions} <span class="tt-unit">${load.sessions === 1 ? "lesson" : "lessons"}</span></dd></div>`);
  if (!items.length) return "";
  return html`<dl class="facts tt-facts" style="--fc:${items.length}">${items}</dl>`;
}

/* ------------------------------------------------------------------ sections */

function heroSection(content, tutors) {
  const n = tutors.length;
  const lead = n
    ? "Groups are small, so the teacher who takes the lesson is the one who marks the homework. Here is who that is."
    : "Tutor profiles are being written. In the meantime, every course page names who teaches it.";
  return html`<header class="view-hero tt-hero">
    <div class="container tt-hero__grid">
      <p class="eyebrow tt-hero__eyebrow" data-intro><span class="eyebrow__num">03</span>Tutors</p>
      <h1 class="h1 tt-hero__title" data-split="intro">${n
        ? html`${cap(word(n))} ${n === 1 ? "teacher" : "teachers"},<br /><em>one <span class="pen-mark">red pen${penUnderline()}</span>.</em>`
        : html`The people who <em>mark your work.</em>`}</h1>
      <p class="lead tt-hero__lead" data-intro>${lead}</p>
      ${n
        ? html`<nav class="tt-index" aria-label="Tutors on this page" data-intro>
            <p class="tt-index__h"><span>On this page</span><span>${pad(n)}</span></p>
            <ol class="tt-index__list">
              ${tutors.map(
                (t, i) => html`<li>
                  <a class="tt-index__link" href="#tutor-${slug(t.id)}" data-scroll-to="#tutor-${slug(t.id)}" data-tutor="${t.id}">
                    <span class="tt-index__no">${roman(i)}.</span>
                    <span class="tt-index__name">${t.name}</span>
                    <span class="tt-index__role">${t.role}</span>
                    <span class="tt-index__yrs">${yearsOf(t) ? `${yearsOf(t)} yrs` : ""}</span>
                    <span class="tt-index__go" aria-hidden="true">${icon("arrow-down", { size: 16 })}</span>
                  </a>
                </li>`
              )}
            </ol>
          </nav>`
        : html`<div class="cluster" data-intro>
            <a class="btn btn--primary" href="#/courses" data-magnetic><span>See the courses</span>${arrowIcon()}</a>
          </div>`}
    </div>
  </header>`;
}

function leadSection(content, t, total) {
  const courses = coursesFor(content, t.id);
  const id = slug(t.id);
  return html`<section class="section tt-lead" id="tutor-${id}" aria-labelledby="tt-name-${id}">
    <div class="container">
      <div class="tt-lead__top">
        <p class="eyebrow" data-reveal><span class="eyebrow__num">01</span>${total > 1 ? "Lead tutor" : "Your tutor"}</p>
        <p class="tt-lead__folio" data-reveal="fade" aria-hidden="true">Plate ${roman(0)} of ${roman(total - 1)}</p>
      </div>
      <div class="tt-lead__grid">
        <div class="tt-lead__aside">
          <div class="tt-lead__sticky" data-reveal="clip">${plate(content, t, 0)}</div>
        </div>
        <div class="tt-lead__body">
          <h2 class="tt-lead__name" id="tt-name-${id}" data-split>${t.name}</h2>
          ${t.role ? html`<p class="tt-lead__role" data-reveal>${t.role}</p>` : ""}
          ${t.bio ? html`<div class="prose tt-lead__bio" data-reveal>${paragraphs(t.bio)}</div>` : ""}
          <div data-reveal>${factsBlock(content, t, courses)}</div>
          <div class="tt-lead__cols">
            <div data-reveal>${credsBlock(t, `tt-creds-${id}`)}</div>
            <div data-reveal>${subjectsBlock(t, `tt-subj-${id}`)}</div>
          </div>
          <div class="tt-lead__groups" data-tt-reveal>${groupsBlock(content, courses, `tt-groups-${id}`)}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function rosterSection(content, others, offset) {
  if (!others.length) return "";
  return html`<section class="section section--paper-2 tt-roster" aria-labelledby="tt-roster-title">
    <div class="container">
      <div class="section-head tt-roster__head">
        <p class="section-head__index eyebrow" data-reveal><span class="eyebrow__num">02</span>The panel</p>
        <h2 class="h1 section-head__title" id="tt-roster-title" data-split>Same marking, <em>other subjects.</em></h2>
        <p class="section-head__aside tt-roster__aside" data-reveal>Open a name for their background, qualifications and the groups they take this year.</p>
      </div>
      <ol class="tt-people" data-tt-reveal>
        ${others.map((t, k) => {
          const i = k + offset;
          const id = slug(t.id);
          const courses = coursesFor(content, t.id);
          const subjects = textList(t.subjects);
          const years = yearsOf(t);
          return html`<li class="tt-person" id="tutor-${id}" data-tutor="${t.id}">
            <h3 class="tt-person__h">
              <button class="tt-person__head" type="button" aria-expanded="false" aria-controls="tt-panel-${id}" id="tt-head-${id}" data-cursor="Open">
                <span class="tt-person__no" aria-hidden="true">${roman(i)}.</span>
                ${tile(t, "tt-person__tile")}
                <span class="tt-person__id">
                  <span class="tt-person__name">${t.name}</span>
                  ${t.role ? html`<span class="tt-person__role">${t.role}</span>` : ""}
                </span>
                <span class="tt-person__subj" aria-hidden="true">${subjects.map((x) => html`<span>${x}</span>`)}</span>
                <span class="tt-person__yrs" aria-hidden="true">${years ? html`<b>${years}</b> ${years === 1 ? "yr" : "yrs"}` : ""}</span>
                <span class="tt-person__toggle" aria-hidden="true"><i></i><i></i></span>
              </button>
            </h3>
            <div class="tt-person__panel" id="tt-panel-${id}" role="region" aria-labelledby="tt-head-${id}" hidden>
              <div class="tt-person__body">
                <div class="tt-person__main">
                  ${t.bio ? html`<div class="prose tt-person__bio">${paragraphs(t.bio)}</div>` : ""}
                  ${factsBlock(content, t, courses, { counts: false })}
                </div>
                <div class="tt-person__side">
                  ${credsBlock(t, `tt-creds-${id}`, "h4")}
                  ${groupsBlock(content, courses, `tt-groups-${id}`, "h4")}
                  ${!courses.length ? subjectsBlock(t, `tt-subj-${id}`, "h4") : ""}
                </div>
              </div>
            </div>
          </li>`;
        })}
      </ol>
    </div>
  </section>`;
}

function weekSection(content, index) {
  const steps = listOf(content.method).filter((m) => m && (m.title || m.text));
  if (!steps.length) return "";
  const n = steps.length;
  return html`<section class="section section--ink tt-week" aria-labelledby="tt-week-title" style="--n:${n}">
    <div class="container">
      <div class="tt-week__head">
        <p class="eyebrow" data-reveal><span class="eyebrow__num">${pad(index)}</span>How lessons run</p>
        <h2 class="h1 tt-week__title" id="tt-week-title" data-split>One week, <em>in order.</em></h2>
        <p class="tt-week__aside" data-reveal>The same ${n === 1 ? "step" : `${word(n)} steps`} in every group, whichever of us is teaching it.</p>
      </div>
      <div class="tt-week__track">
        <div class="tt-week__dim" aria-hidden="true"><span>Every week, in this order</span></div>
        <div class="tt-week__axis" aria-hidden="true"><span class="tt-week__fill"></span></div>
        <ol class="tt-week__steps" data-stagger="0.1">
          ${steps.map(
            (s, i) => html`<li class="tt-step">
              <span class="tt-step__node" aria-hidden="true"></span>
              <p class="tt-step__no"><span>${pad(i + 1)}</span><span class="tt-step__of">/ ${pad(n)}</span></p>
              ${s.title ? html`<h3 class="tt-step__title">${s.title}</h3>` : ""}
              ${s.text ? html`<p class="tt-step__text">${s.text}</p>` : ""}
            </li>`
          )}
        </ol>
        <p class="tt-week__again" data-reveal="fade">…and again next week.</p>
      </div>
    </div>
  </section>`;
}

function ctaSection(content, tutors) {
  const whose = tutors.length === 1 ? `${tutors[0].name}’s` : "their";
  return html`<section class="section tt-cta" aria-labelledby="tt-cta-title">
    <div class="container">
      ${tutors.length
        ? html`<div class="tt-sign">
            <p class="tt-sign__h" data-reveal="fade"><span>Signed</span><span>${tutors.length === 1 ? "Tutor" : "The panel"}</span></p>
            <ul class="tt-sign__list" data-stagger="0.12" style="--n:${Math.min(tutors.length, 4)}">
              ${tutors.map(
                (t) => html`<li class="tt-sign__item">
                  <span class="tt-sign__name">${t.name}</span>
                  <span class="tt-sign__line" aria-hidden="true"></span>
                  <span class="tt-sign__role">${t.role}</span>
                </li>`
              )}
            </ul>
          </div>`
        : ""}
      <div class="tt-cta__row">
        <div class="tt-cta__main">
          <h2 class="h2 tt-cta__title" id="tt-cta-title" data-split>Ask for a place <em>in ${whose} groups.</em></h2>
          <p class="tt-cta__lead" data-reveal>Tell us the level and the subjects. We reply with the days, times, fees and how many seats are left.</p>
        </div>
        <div class="cluster tt-cta__actions" data-tt-reveal>
          <a class="btn btn--primary btn--lg" href="#/enrol" data-magnetic><span>Enrol</span>${arrowIcon(18)}</a>
          <a class="btn btn--ghost btn--lg" href="#/courses"><span>See every course</span></a>
        </div>
      </div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ behaviour */

let active = null; // the mounted instance, for onQuery

function setupRoster(root, ctx, mctx) {
  const gsap = window.gsap;
  const reduced = ctx.motion.reduced || !gsap;
  const items = [...root.querySelectorAll(".tt-person")];
  const refresh = () => ctx.motion.refresh();

  function setOpen(item, open, { animate = true } = {}) {
    const btn = item.querySelector(".tt-person__head");
    const panel = item.querySelector(".tt-person__panel");
    if (!btn || !panel) return;
    const isOpen = btn.getAttribute("aria-expanded") === "true";
    if (open === isOpen) return;
    btn.setAttribute("aria-expanded", String(open));
    item.classList.toggle("is-open", open);
    if (reduced || !animate) {
      if (gsap) gsap.killTweensOf(panel);
      panel.hidden = !open;
      if (gsap) gsap.set(panel, { clearProps: "height" });
      refresh();
      return;
    }
    mctx.add(() => {
      gsap.killTweensOf(panel);
      const kids = panel.querySelectorAll(".tt-person__main > *, .tt-person__side > *");
      if (open) {
        panel.hidden = false;
        gsap.fromTo(panel, { height: panel.offsetHeight ? panel.offsetHeight : 0 }, { height: "auto", duration: 0.85, ease: ctx.motion.ease.out, onComplete: () => { gsap.set(panel, { clearProps: "height" }); refresh(); } });
        gsap.fromTo(kids, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8, ease: ctx.motion.ease.out, stagger: 0.06, delay: 0.12, clearProps: "transform,opacity" });
      } else {
        gsap.to(panel, {
          height: 0,
          duration: 0.6,
          ease: ctx.motion.ease.inOut,
          onComplete: () => {
            panel.hidden = true;
            gsap.set(panel, { clearProps: "height" });
            refresh();
          },
        });
      }
    });
  }

  const onClick = (e) => {
    const btn = e.target.closest(".tt-person__head");
    if (!btn || !root.contains(btn)) return;
    const item = btn.closest(".tt-person");
    setOpen(item, btn.getAttribute("aria-expanded") !== "true");
  };
  root.addEventListener("click", onClick);

  // Index links in the hero: open the person's details on the way down.
  const onIndex = (e) => {
    const a = e.target.closest(".tt-index__link");
    if (!a) return;
    const item = items.find((it) => it.dataset.tutor === a.dataset.tutor);
    if (item) setOpen(item, true, { animate: false });
  };
  root.addEventListener("click", onIndex, true);

  const targetFor = (id) => items.find((it) => it.dataset.tutor === id) || root.querySelector(`#tutor-${slug(id)}`);
  const openById = (id, { scroll = true } = {}) => {
    const item = items.find((it) => it.dataset.tutor === id);
    if (item) setOpen(item, true, { animate: false });
    const target = targetFor(id);
    if (target && scroll) setTimeout(() => ctx.motion.scrollTo(target), 60);
    return !!target;
  };
  const scrollToId = (id) => {
    const target = targetFor(id);
    if (target) ctx.motion.scrollTo(target);
  };

  return {
    openById,
    scrollToId,
    cleanup() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("click", onIndex, true);
      if (gsap) items.forEach((it) => gsap.killTweensOf(it.querySelector(".tt-person__panel")));
    },
  };
}

function setupWeek(root, ctx) {
  const sec = root.querySelector(".tt-week");
  if (!sec) return null;
  const track = sec.querySelector(".tt-week__steps");
  const axis = sec.querySelector(".tt-week__axis");
  const fill = sec.querySelector(".tt-week__fill");
  const nodes = [...sec.querySelectorAll(".tt-step")];
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  if (!track || !axis || !fill || !gsap || !ST || ctx.motion.reduced) {
    sec.classList.add("is-static");
    return null;
  }
  const wide = window.matchMedia("(min-width: 900px)");
  let marks = [];
  const measure = () => {
    const a = axis.getBoundingClientRect();
    marks = nodes.map((n) => {
      const dot = n.querySelector(".tt-step__node");
      const r = (dot || n).getBoundingClientRect();
      return wide.matches ? (r.left + r.width / 2 - a.left) / Math.max(1, a.width) : (r.top + r.height / 2 - a.top) / Math.max(1, a.height);
    });
  };
  const set = (p) => {
    fill.style.transform = wide.matches ? `scaleX(${p})` : `scaleY(${p})`;
    nodes.forEach((n, i) => n.classList.toggle("is-reached", marks[i] !== undefined && p >= marks[i] - 0.002));
  };
  ST.create({
    trigger: track,
    start: () => (wide.matches ? "top 78%" : "top 72%"),
    end: () => (wide.matches ? "bottom 62%" : "bottom 58%"),
    scrub: 0.6,
    invalidateOnRefresh: true,
    onRefresh: (self) => {
      measure();
      set(self.progress);
    },
    onUpdate: (self) => set(self.progress),
  });
  measure();
  set(0);
  return null;
}

// Blocks holding links fade with opacity only (autoAlpha would drop them from the tab order until revealed).
function setupReveals(root, ctx) {
  const gsap = window.gsap;
  if (!gsap || !window.ScrollTrigger || ctx.motion.reduced) return;
  root.querySelectorAll("[data-tt-reveal]").forEach((el) =>
    gsap.fromTo(
      el,
      { opacity: 0, y: 26 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: ctx.motion.ease.out,
        clearProps: "transform,opacity",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
      }
    )
  );
}

/* ------------------------------------------------------------------ view */

export default {
  id: "tutors",
  title: "Tutors",
  scene: "orbit",
  render(ctx) {
    const { content } = ctx;
    const tutors = visible(content.tutors);
    const [lead, ...others] = tutors;
    const weekIndex = others.length ? 3 : 2;
    return html`<section class="view view--tutors" data-view="tutors">
      ${heroSection(content, tutors)}
      ${lead ? leadSection(content, lead, tutors.length) : ""}
      ${rosterSection(content, others, 1)}
      ${weekSection(content, weekIndex)}
      ${ctaSection(content, tutors)}
    </section>`;
  },
  mount(root, ctx) {
    const gsap = window.gsap;
    const mctx = gsap ? gsap.context(() => {}, root) : { add: (fn) => fn(), revert() {} };
    const roster = setupRoster(root, ctx, mctx);
    setupWeek(root, ctx);
    setupReveals(root, ctx);

    // #/tutors?tutor=<id> opens that person straight away (so nothing jumps later), then glides to them
    // once the route transition has finished.
    let timer = 0;
    const want = ctx.query && ctx.query.get("tutor");
    if (want && roster.openById(want, { scroll: false })) {
      const t0 = Date.now();
      const settle = () => {
        const busy = !!(window.KT && window.KT.busy);
        if (busy && Date.now() - t0 < 6000) timer = setTimeout(settle, 120);
        else timer = setTimeout(() => roster.scrollToId(want), ctx.motion.reduced ? 0 : 450);
      };
      timer = setTimeout(settle, 200);
    }

    const self = { root, roster };
    active = self;
    return () => {
      clearTimeout(timer);
      roster.cleanup();
      mctx.revert();
      if (active === self) active = null;
    };
  },
  onQuery(query) {
    const id = query && query.get("tutor");
    if (id && active) active.roster.openById(id);
  },
};
