// Home: the showpiece. Every section is derived from content.json and hides itself when its data is empty.
// Sections: hero · syllabus band · how a week works · featured groups (pinned track) · levels staircase ·
// lead tutor · figures · testimonial deck · places band.
import { html, raw, icon, highlightWord, penCircle, penTick, penArrow, paragraphs } from "../ui.js";
import { visible, formatRs, levelName, levelExam, sessionsFor, dayShort, safeUrl, whatsappLink } from "../store.js";

/* ------------------------------------------------------------------ helpers */

const pad = (n) => String(n).padStart(2, "0");
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const word = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];
const roman = (i) => ROMAN[i] || String(i + 1);
const fmtNum = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-GB") : String(v ?? ""));
const firstSentence = (s) => {
  const t = String(s || "").trim();
  const m = t.match(/^(.+?[.!?])\s+(.+)$/s);
  return m ? [m[1], m[2]] : [t, ""];
};
const shortExam = (content, levelId) => String(levelExam(content, levelId) || "").split("·")[0].trim();
const codeOf = (content, c) => c.code || shortExam(content, c.level) || levelName(content, c.level);
const initials = (name) =>
  String(name || "")
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
// "Grade 10–11" → { label: "Grade", num: "10–11" }; anything else stays whole.
const splitGrade = (name) => {
  const m = String(name || "").match(/^(\D*?)\s*(\d[\d\s–\-+/]*)$/);
  return m && m[1] ? { label: m[1].trim(), num: m[2].trim() } : { label: "", num: String(name || "") };
};
const modeLabel = { online: "Online", "in-person": "In person", hybrid: "Hybrid" };
const toMin = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
// Weekly sessions, reordered so the next one to start (from now) comes first.
function upcoming(content, courseId) {
  const list = sessionsFor(content, courseId);
  if (list.length < 2) return list;
  const now = new Date();
  const ids = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const nowMin = now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();
  const week = 7 * 1440;
  const until = (s) => {
    const d = ids.indexOf(s.day);
    if (d < 0) return week * 2;
    return (((d * 1440 + toMin(s.start) - nowMin) % week) + week) % week;
  };
  return [...list].sort((a, b) => until(a) - until(b));
}

// Small outline glyphs from the plaster set, used as marquee separators.
const GLYPHS = [
  '<circle cx="12" cy="12" r="8"/>',
  '<path d="M12 4l8.5 15h-17z"/>',
  '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  '<ellipse cx="12" cy="12" rx="9" ry="4.5"/><ellipse cx="12" cy="12" rx="3.6" ry="1.6"/>',
];
const glyph = (i) =>
  html`<svg class="home-band__glyph" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">${raw(GLYPHS[i % GLYPHS.length])}</svg>`;

const arrowIcon = (size = 16) => html`<span class="btn__icon">${icon("arrow-right", { size })}</span>`;

/* ------------------------------------------------------------------ sections */

function heroSection(content, courses) {
  const h = content.hero || {};
  const site = content.site || {};
  const tutors = visible(content.tutors);
  const title = String(h.title || site.name || "");
  const rows = title.split("\n").filter((l) => l.trim());
  const hl = String(h.highlight || "").trim().toLowerCase();
  const hlRow = hl ? rows.findIndex((r) => r.toLowerCase().includes(hl)) : -1;
  const titleHtml = rows.map((r, i) => {
    let inner = highlightWord(r, "");
    if (i === hlRow) {
      const at = r.toLowerCase().indexOf(hl);
      const word = r.slice(at, at + hl.length);
      const after = r.slice(at + hl.length);
      const stick = (after.match(/^[^\s]*/) || [""])[0];
      inner = html`${r.slice(0, at)}<span class="home-hero__nowrap">${highlightWord(word, word)}${stick}</span>${after.slice(stick.length)}`;
    }
    const last = rows.length > 1 && i === rows.length - 1;
    return html`${i ? html`<br />` : ""}${last ? html`<em>${inner}</em>` : inner}`;
  });
  const primary = h.primaryCta || {};
  const secondary = h.secondaryCta || {};
  const pHref = safeUrl(primary.href) || "#/courses";
  const sHref = safeUrl(secondary.href);
  const facts = [
    courses.length ? `${courses.length} ${courses.length === 1 ? "course" : "courses"}` : "",
    tutors.length ? `${tutors.length} ${tutors.length === 1 ? "tutor" : "tutors"}` : "",
    site.hours || "",
  ].filter(Boolean);

  return html`<header class="view-hero view-hero--full home-hero" aria-labelledby="home-title">
    <div class="home-hero__margin" aria-hidden="true"><span>Do not write in this margin</span></div>
    <div class="container home-hero__inner">
      ${h.eyebrow ? html`<p class="eyebrow home-hero__eyebrow" data-intro>${h.eyebrow}</p>` : ""}
      <h1 class="display home-hero__title" id="home-title" data-split="intro">${titleHtml}</h1>
      <div class="home-hero__row">
        ${h.subtitle ? html`<p class="lead home-hero__sub" data-intro>${h.subtitle}</p>` : ""}
        <div class="home-hero__actions" data-intro>
          <a class="btn btn--primary btn--lg" href="${pHref}" data-magnetic>
            <span>${primary.label || "See the courses"}</span>${arrowIcon()}
          </a>
          ${sHref && secondary.label
            ? html`<div class="home-hero__quiz">
                <a class="btn btn--ghost btn--lg" href="${sHref}" data-magnetic>
                  <span>${secondary.label}</span>${arrowIcon()}
                </a>
                <p class="home-hero__note">
                  <span class="home-hero__note-text">Not sure which level? Start here.</span>
                  ${penArrow({ cls: "home-hero__arrow" })}
                </p>
              </div>`
            : ""}
        </div>
      </div>
      <div class="home-hero__base" data-intro="fade">
        ${facts.length ? html`<ul class="home-hero__facts">${facts.map((f) => html`<li>${f}</li>`)}</ul>` : html`<span></span>`}
        ${courses.length
          ? html`<a class="home-hero__turn" href="#home-syllabus" data-scroll-to="#home-syllabus">
              <span>[Turn over</span>${icon("arrow-down", { size: 14 })}
            </a>`
          : ""}
      </div>
    </div>
  </header>`;
}

function bandSection(content, courses) {
  if (!courses.length) return "";
  // One entry per syllabus (code + title), in catalogue order.
  const seen = new Set();
  const items = courses.filter((c) => {
    const k = `${codeOf(content, c)}|${c.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return html`<section class="section section--flush home-band" id="home-syllabus" aria-label="Subjects and syllabus codes">
    <div class="marquee home-band__marquee" data-marquee="46">
      <ul class="home-band__list">
        ${items.map(
          (c, i) => html`<li class="home-band__item">
            <span class="home-band__code">${codeOf(content, c)}</span>
            <span class="home-band__name">${c.title}</span>
            ${glyph(i)}
          </li>`
        )}
      </ul>
    </div>
  </section>`;
}

function methodSection(content) {
  const steps = (content.method || []).filter((m) => m && (m.title || m.text));
  if (!steps.length) return "";
  return html`<section class="section home-method" aria-labelledby="home-method-title">
    <div class="container home-method__grid">
      <div class="home-method__aside">
        <div class="home-method__sticky">
          <p class="eyebrow" data-reveal><span class="eyebrow__num">01</span>Every week, every group</p>
          <h2 class="h1 home-method__title" id="home-method-title" data-split>How a week <em>works</em></h2>
          <div class="home-method__rubric" data-reveal>
            <p class="home-method__rubric-h">Instructions</p>
            <p>Answer all questions.</p>
            <p>The number of marks is given in brackets [ ] at the end of each question.</p>
          </div>
        </div>
      </div>
      <div class="home-method__paper">
        <span class="home-method__rule" aria-hidden="true"></span>
        <ol class="home-method__list">
          ${steps.map(
            (s, i) => html`<li class="home-q" data-reveal>
              <span class="home-q__num">Q.${pad(i + 1)}</span>
              <div class="home-q__body">
                <h3 class="home-q__title">${s.title}</h3>
                ${s.text ? html`<p class="home-q__text">${s.text}</p>` : ""}
              </div>
              <div class="home-q__mark" aria-hidden="true">
                <span class="home-q__box">${penTick()}</span>
                <span class="marks">1</span>
              </div>
            </li>`
          )}
        </ol>
        <p class="home-method__total" data-reveal>
          <span class="home-method__total-label">[Total: ${steps.length}]</span>
          <span class="pen-mark home-method__score" aria-label="${steps.length} out of ${steps.length}">${steps.length}/${steps.length}${penCircle()}</span>
        </p>
      </div>
    </div>
  </section>`;
}

function courseCard(content, c, i) {
  const sessions = upcoming(content, c.id).slice(0, 2);
  const seats = Number(c.seats);
  const left = Number(c.seatsLeft);
  const hasSeats = Number.isFinite(left);
  const low = hasSeats && left > 0 && left <= 3;
  const exam = levelExam(content, c.level);
  const idBase = `home-c-${i}`;
  const topics = (c.topics || []).filter(Boolean);
  return html`<li class="home-feat__slot">
    <a class="home-course" href="#/courses/${encodeURIComponent(c.id)}" data-tilt data-cursor="View"
      aria-labelledby="${idBase}-t ${idBase}-c" aria-describedby="${idBase}-d">
      <div class="home-course__top">
        <span class="home-course__code" id="${idBase}-c">${codeOf(content, c)}</span>
        <span class="home-course__level">
          <span>${levelName(content, c.level)}</span>
          ${exam ? html`<span class="home-course__exam">${exam}</span>` : ""}
        </span>
      </div>
      <h3 class="home-course__title" id="${idBase}-t">${c.title}</h3>
      ${c.summary ? html`<p class="home-course__sum">${c.summary}</p>` : ""}
      ${topics.length
        ? html`<p class="home-course__topics"><span class="home-course__topics-k">Covers</span>${topics.slice(0, 3).join(" · ")}${topics.length > 3 ? html` <span class="home-course__more">+${topics.length - 3} more</span>` : ""}</p>`
        : ""}
      <div class="home-course__detail" id="${idBase}-d">
        ${sessions.length
          ? html`<div class="home-course__sessions">
              <p class="home-course__label"><span>Next sessions</span>${c.mode ? html`<span class="badge badge--${c.mode}">${modeLabel[c.mode] || c.mode}</span>` : ""}</p>
              <ul>
                ${sessions.map(
                  (s, k) => html`<li>
                    <span class="home-course__day">${k === 0 ? html`<i>Next</i>` : ""}${dayShort(s.day)}</span>
                    <span class="home-course__time">${s.start}–${s.end}</span>
                    <span class="home-course__room">${s.room}</span>
                  </li>`
                )}
              </ul>
            </div>`
          : c.mode
          ? html`<p class="home-course__label"><span>Times on request</span><span class="badge badge--${c.mode}">${modeLabel[c.mode] || c.mode}</span></p>`
          : ""}
        <div class="home-course__foot">
          <p class="home-course__fee">
            ${Number.isFinite(Number(c.fee)) && c.fee !== "" ? html`<span class="home-course__rs">${formatRs(c.fee)}</span><span class="home-course__per">a month</span>` : ""}
          </p>
          ${hasSeats
            ? left <= 0
              ? html`<p class="home-course__seats is-full"><span class="home-course__seat-n">Full</span><span class="home-course__seat-l">waiting list</span></p>`
              : html`<p class="home-course__seats${low ? " is-low" : ""}">
                  ${low
                    ? html`<span class="pen-mark home-course__seat-n">${left}${penCircle()}</span>`
                    : html`<span class="home-course__seat-n">${left}</span>`}
                  <span class="home-course__seat-l">${left === 1 ? "seat" : "seats"} left${Number.isFinite(seats) && seats > 0 ? html`<br />of ${seats}` : ""}</span>
                </p>`
            : ""}
        </div>
      </div>
    </a>
  </li>`;
}

function featuredSection(content, courses) {
  const featured = courses.filter((c) => c.featured);
  if (!featured.length) return "";
  const cats = (content.categories || [])
    .map((cat) => ({ name: cat.name, n: courses.filter((c) => c.category === cat.id).length }))
    .filter((x) => x.n);
  const total = featured.length + 1;
  const all = featured.length >= courses.length;
  return html`<section class="section section--paper-2 home-feat" data-pin-horizontal aria-labelledby="home-feat-title">
    <div class="container home-feat__head">
      <p class="eyebrow home-feat__eyebrow" data-reveal><span class="eyebrow__num">02</span>Featured groups</p>
      <h2 class="h1 home-feat__title" id="home-feat-title" data-split>
        ${all ? html`Every group, <em>with times</em>` : html`${cap(word(featured.length))} of the <em>${word(courses.length)}</em>`}
      </h2>
      <div class="home-feat__aside" data-reveal>
        <p class="home-feat__lede">Weekly times, the monthly fee and the seats still open, for the groups most students ask about first.</p>
        <div class="home-feat__progress" aria-hidden="true">
          <span class="home-feat__count"><b data-feat-count>01</b> / ${pad(total)}</span>
          <span class="home-feat__bar"><i data-feat-bar></i></span>
        </div>
      </div>
    </div>
    <div class="container home-feat__wrap">
      <ol class="home-feat__track" data-track>
        ${featured.map((c, i) => courseCard(content, c, i))}
        <li class="home-feat__slot home-feat__slot--all">
          <a class="home-all" href="#/courses" data-cursor="Open">
            <span class="home-all__top">
              <span class="home-all__k">The full list</span>
              <span class="home-all__icon">${icon("arrow-up-right", { size: 22 })}</span>
            </span>
            <span class="home-all__title">See all <em>${courses.length}</em> courses</span>
            ${cats.length
              ? html`<span class="home-all__cats">
                  ${cats.map((x) => html`<span class="home-all__cat"><span>${x.name}</span><span class="home-all__n">${pad(x.n)}</span></span>`)}
                </span>`
              : ""}
          </a>
        </li>
      </ol>
    </div>
  </section>`;
}

function levelsSection(content, courses) {
  const levels = (content.levels || []).filter((l) => l && l.id);
  if (!levels.length) return "";
  const n = levels.length;
  return html`<section class="section section--ink home-levels" aria-labelledby="home-levels-title" style="--n:${n}">
    <div class="container">
      <div class="home-levels__head">
        <p class="eyebrow" data-reveal><span class="eyebrow__num">03</span>By level</p>
        <h2 class="h1 home-levels__title" id="home-levels-title" data-split>${cap(word(n))} ${n === 1 ? "stage" : "stages"}, <em>one method</em></h2>
        <p class="home-levels__aside" data-reveal>Each stage has its own groups, papers and pace. Choose one to see its courses, codes and weekly times.</p>
      </div>
      <ol class="home-levels__steps">
        ${levels.map((l, i) => {
          const g = splitGrade(l.name);
          const list = courses.filter((c) => c.level === l.id);
          return html`<li class="home-level" style="--i:${i}">
            <a class="home-level__link" href="#/courses?level=${encodeURIComponent(l.id)}" data-cursor="Open">
              <span class="home-level__idx">Stage ${i + 1} / ${n}</span>
              <span class="home-level__grade">
                ${g.label ? html`<span class="home-level__label">${g.label}</span>` : ""}
                <span class="home-level__num">${g.num}</span>
              </span>
              ${l.exam ? html`<span class="home-level__exam">${l.exam}</span>` : ""}
              ${l.summary ? html`<span class="home-level__sum">${l.summary}</span>` : ""}
              ${list.length
                ? html`<span class="home-level__list">
                    ${list.map((c) => html`<span class="home-level__row"><span class="home-level__code">${codeOf(content, c)}</span><span>${c.title}</span></span>`)}
                  </span>`
                : ""}
              <span class="home-level__cta">
                <span>${list.length ? `${list.length} ${list.length === 1 ? "course" : "courses"}` : "See courses"}</span>
                ${icon("arrow-right", { size: 16 })}
              </span>
            </a>
          </li>`;
        })}
      </ol>
    </div>
  </section>`;
}

function tutorSection(content) {
  const tutors = visible(content.tutors);
  const t = tutors[0];
  if (!t) return "";
  const photo = safeUrl(t.photo);
  const years = Number(t.years);
  const since = Number.isFinite(years) && years > 0 ? new Date().getFullYear() - years : null;
  const subjects = (t.subjects || []).filter(Boolean);
  const creds = (t.credentials || []).filter(Boolean);
  const mono = initials(t.name) || "?";
  return html`<section class="section home-tutor" aria-labelledby="home-tutor-title">
    <div class="container home-tutor__grid">
      <figure class="home-tutor__fig" data-reveal="clip"${photo ? "" : html` aria-hidden="true"`}>
        <div class="home-tutor__frame${photo ? " has-photo" : ""}">
          ${photo
            ? html`<img class="home-tutor__img" src="${photo}" alt="${t.name}" loading="lazy" decoding="async" data-parallax="0.12" />`
            : html`<span class="home-tutor__mono${mono.length > 1 ? " is-pair" : ""}" aria-hidden="true" data-parallax="0.14">${mono}</span>`}
          <span class="home-tutor__fig-k" aria-hidden="true">Fig. 1 — ${t.name}</span>
          ${since ? html`<span class="home-tutor__since" aria-hidden="true">Teaching since ${since}</span>` : ""}
        </div>
      </figure>
      <div class="home-tutor__text">
        <p class="eyebrow" data-reveal><span class="eyebrow__num">04</span>${tutors.length > 1 ? "Lead tutor" : "Your tutor"}</p>
        <h2 class="h1 home-tutor__name" id="home-tutor-title" data-split>${t.name}</h2>
        ${t.role ? html`<p class="home-tutor__role" data-reveal>${t.role}</p>` : ""}
        ${t.bio ? html`<div class="prose home-tutor__bio" data-reveal>${paragraphs(t.bio)}</div>` : ""}
        <dl class="home-tutor__facts" data-reveal>
          ${Number.isFinite(years) && years > 0
            ? html`<div><dt>Experience</dt><dd><span class="home-tutor__years">${years}</span> years</dd></div>`
            : ""}
          ${subjects.length ? html`<div><dt>Teaches</dt><dd>${subjects.join(", ")}</dd></div>` : ""}
        </dl>
        ${creds.length ? html`<ul class="ticks home-tutor__creds" data-stagger="0.07">${creds.map((c) => html`<li>${c}</li>`)}</ul>` : ""}
        <p class="home-tutor__more" data-home-reveal>
          <a class="link-arrow" href="#/tutors">${tutors.length > 1 ? `Meet all ${word(tutors.length)} tutors` : `More about ${t.name}`} ${icon("arrow-right", { size: 16 })}</a>
        </p>
      </div>
    </div>
  </section>`;
}

function statsSection(content) {
  const stats = (content.stats || []).filter((s) => s && s.label != null && Number.isFinite(Number(s.value)));
  if (!stats.length) return "";
  return html`<section class="section section--tight home-stats" aria-labelledby="home-stats-title">
    <div class="container home-stats__grid">
      <div class="home-stats__head">
        <p class="eyebrow" data-reveal><span class="eyebrow__num">05</span>In figures</p>
        <h2 class="h2 home-stats__title" id="home-stats-title" data-split>${cap(word(stats.length))} ${stats.length === 1 ? "number" : "numbers"} <em>worth checking</em></h2>
      </div>
      <div class="home-stats__sheet" data-reveal style="--cols:${Math.min(stats.length, 4)}">
        <p class="home-stats__cap" aria-hidden="true"><span>For examiner’s use</span><span>${roman(0)}–${roman(stats.length - 1)}</span></p>
        <ul class="home-stats__list">
          ${stats.map(
            (s, i) => html`<li class="home-stat">
              <span class="home-stat__q" aria-hidden="true">${roman(i)}</span>
              <span class="home-stat__val"
                data-count="${Number(s.value)}"
                data-count-prefix="${s.prefix || ""}"
                data-count-suffix="${s.suffix || ""}">${s.prefix || ""}${fmtNum(s.value)}${s.suffix || ""}</span>
              <span class="home-stat__label">${s.label}</span>
            </li>`
          )}
        </ul>
      </div>
    </div>
  </section>`;
}

function voicesSection(content) {
  const list = visible(content.testimonials).filter((t) => t.quote);
  if (!list.length) return "";
  const n = list.length;
  return html`<section class="section section--paper-2 home-voices" aria-labelledby="home-voices-title">
    <div class="container home-voices__grid">
      <div class="home-voices__head">
        <p class="eyebrow" data-reveal><span class="eyebrow__num">06</span>Students and parents</p>
        <h2 class="h1 home-voices__title" id="home-voices-title" data-split>In their <em>own words</em></h2>
        ${n > 1
          ? html`<div class="home-voices__controls" data-home-reveal>
              <p class="home-voices__count" aria-hidden="true"><b data-deck-count>01</b> / ${pad(n)}</p>
              <div class="home-voices__btns">
                <button class="home-voices__btn" type="button" data-deck-prev aria-label="Previous card">${icon("arrow-left", { size: 18 })}</button>
                <button class="home-voices__btn" type="button" data-deck-next aria-label="Next card">${icon("arrow-right", { size: 18 })}</button>
              </div>
              <p class="home-voices__hint"><span class="home-voices__hint-fine">Drag the top card aside, or use the arrows.</span><span class="home-voices__hint-touch">Swipe the top card aside.</span></p>
            </div>`
          : ""}
      </div>
      <div class="home-deck${n > 1 ? " is-deck" : ""}" data-deck data-home-reveal
        role="region" aria-roledescription="carousel" aria-label="What students and parents say"${n > 1 ? html` tabindex="0"` : ""}>
        ${list.map(
          (t, i) => html`<figure class="home-card" data-card="${i}" role="group" aria-roledescription="card" aria-label="${i + 1} of ${n}">
            <div class="home-card__head">
              <span class="home-card__no">No. ${pad(i + 1)}</span>
              ${t.detail ? html`<span class="home-card__detail">${t.detail}</span>` : ""}
              ${penTick({ cls: "home-card__tick" })}
            </div>
            <blockquote class="home-card__quote${t.quote.length < 90 ? " is-short" : ""}"><p>${t.quote}</p></blockquote>
            ${t.name ? html`<figcaption class="home-card__name">— ${t.name}</figcaption>` : ""}
          </figure>`
        )}
      </div>
    </div>
  </section>`;
}

function placesSection(content, courses) {
  const site = content.site || {};
  const a = site.announcement || {};
  const now = new Date();
  const intake = now.getFullYear() + (now.getMonth() >= 6 ? 1 : 0);
  const [headline, rest] = a.enabled !== false && a.text ? firstSentence(a.text) : [`Places for ${intake}.`, ""];
  const year = (headline.match(/\b(19|20)\d{2}\b/) || [])[0] || "";
  const ctaLabel = (a.enabled !== false && a.linkLabel) || "Reserve a place";
  const ctaHref = (a.enabled !== false && safeUrl(a.href)) || "#/enrol";
  const wa = whatsappLink(site.whatsapp, `Hello ${site.name || ""}, I would like to ask about a place${year ? ` for ${year}` : ""}.`.replace(/\s+,/, ","));
  const open = courses.filter((c) => Number.isFinite(Number(c.seatsLeft)) && Number(c.seatsLeft) > 0);
  const low = open.filter((c) => Number(c.seatsLeft) <= 3);
  const shortlist = (low.length ? low : open)
    .slice()
    .sort((x, y) => Number(x.seatsLeft) - Number(y.seatsLeft))
    .slice(0, 5);
  return html`<section class="section section--ink home-places" aria-labelledby="home-places-title">
    <div class="container home-places__grid">
      <div class="home-places__main">
        <p class="eyebrow" data-reveal><span class="eyebrow__num">07</span>Enrolment</p>
        <h2 class="display home-places__title" id="home-places-title" data-split>${year ? highlightWord(headline, year, penCircle) : headline}</h2>
        ${rest ? html`<p class="lead home-places__lead" data-reveal>${rest}</p>` : ""}
        <div class="home-places__ctas" data-home-reveal>
          <a class="btn btn--light btn--lg" href="${ctaHref}" data-magnetic>
            <span>${ctaLabel}</span>${arrowIcon()}
          </a>
          ${wa
            ? html`<a class="btn btn--ghost btn--lg" href="${wa}" target="_blank" rel="noopener" data-magnetic>
                <span>Ask on WhatsApp</span><span class="btn__icon">${icon("whatsapp", { size: 18 })}</span>
              </a>`
            : ""}
        </div>
      </div>
      ${shortlist.length
        ? html`<aside class="home-places__list" aria-labelledby="home-places-list-title" data-home-reveal>
            <p class="home-places__list-h" id="home-places-list-title">
              <span>${low.length ? "Nearly full" : "Fewest seats left"}</span><span>Seats</span>
            </p>
            <ul>
              ${shortlist.map(
                (c) => html`<li>
                  <a href="#/courses/${encodeURIComponent(c.id)}">
                    <span class="home-places__code">${codeOf(content, c)}</span>
                    <span class="home-places__name">${c.title}<span>${levelName(content, c.level)}</span></span>
                    <span class="home-places__seats">${c.seatsLeft}<span class="sr-only"> ${Number(c.seatsLeft) === 1 ? "seat" : "seats"} left</span></span>
                  </a>
                </li>`
              )}
            </ul>
            <p class="home-places__foot">Groups are kept small, so seats are counted, not estimated.</p>
          </aside>`
        : ""}
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ behaviour */

function setupFeatured(root, ctx) {
  const sec = root.querySelector(".home-feat");
  if (!sec) return () => {};
  const track = sec.querySelector("[data-track]");
  const slots = [...sec.querySelectorAll(".home-feat__slot")];
  const countEl = sec.querySelector("[data-feat-count]");
  const bar = sec.querySelector("[data-feat-bar]");
  const n = slots.length;
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  let last = -1;
  const show = (p) => {
    const q = Math.max(0, Math.min(1, p || 0));
    if (bar) bar.style.transform = `scaleX(${Math.max(0.0001, q).toFixed(4)})`;
    const idx = Math.min(n, Math.max(1, Math.round(q * (n - 1)) + 1));
    if (idx !== last && countEl) {
      countEl.textContent = pad(idx);
      last = idx;
    }
  };
  show(0);

  // Native scroll-snap row (below 1024px or reduced motion).
  const onScroll = () => {
    if (sec.classList.contains("is-pinned-h")) return;
    const max = track.scrollWidth - track.clientWidth;
    show(max > 0 ? track.scrollLeft / max : 0);
  };
  track.addEventListener("scroll", onScroll, { passive: true });

  // Pinned horizontal scrub (≥ 1024px): progress + cards turning in as they arrive.
  const extras = [];
  let pinTween = null;
  const onPinned = (e) => {
    const tween = e.detail && e.detail.tween;
    if (!tween || !gsap) return;
    pinTween = tween;
    show(tween.progress());
    tween.eventCallback("onUpdate", () => show(tween.progress()));
    if (!ST || ctx.motion.reduced) return;
    slots.forEach((slot, i) => {
      if (i === 0) return;
      const t = gsap.fromTo(
        slot,
        { rotationY: 20, z: -40, transformOrigin: "0% 50%" },
        {
          rotationY: 0,
          z: 0,
          ease: "none",
          scrollTrigger: { containerAnimation: tween, trigger: slot, start: "left 102%", end: "left 62%", scrub: true },
        }
      );
      extras.push(t);
      const pen = slot.querySelector(".home-course__seats.is-low .pen-mark");
      if (pen) {
        extras.push(
          ST.create({
            containerAnimation: tween,
            trigger: slot,
            start: "left 72%",
            once: true,
            onEnter: () => {
              gsap.killTweensOf(pen.querySelectorAll("[data-draw]"));
              ctx.motion.draw(pen, { delay: 0.1 });
            },
          })
        );
      }
    });
  };
  sec.addEventListener("kt:horizontal", onPinned);

  // Keyboard: a card focused inside the pinned track may sit off-screen to the right.
  // Scroll the page to the point in the scrub where that card is centred.
  let restoring = false;
  const onFocusIn = (e) => {
    if (restoring || !pinTween || !sec.classList.contains("is-pinned-h")) return;
    const slot = e.target.closest && e.target.closest(".home-feat__slot");
    const st = pinTween.scrollTrigger;
    if (!slot || !st || !e.target.matches(":focus-visible")) return;
    const dist = track.scrollWidth - track.clientWidth;
    if (dist <= 0) return;
    const left = slot.getBoundingClientRect().left - track.getBoundingClientRect().left;
    const p = Math.max(0, Math.min(1, (left - (track.clientWidth - slot.offsetWidth) / 2) / dist));
    ctx.lenis.scrollTo(st.start + p * (st.end - st.start), { duration: 0.8, force: true });
  };
  sec.addEventListener("focusin", onFocusIn);

  // A ScrollTrigger refresh briefly swaps the pin spacer out of the DOM, which drops focus.
  // Put it back where it was.
  let saved = null;
  const onRefreshInit = () => {
    const a = document.activeElement;
    saved = a && a !== document.body && sec.contains(a) ? a : null;
  };
  const onRefresh = () => {
    const el = saved;
    saved = null;
    if (!el || !el.isConnected || document.activeElement === el) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    restoring = true;
    try {
      el.focus({ preventScroll: true });
    } catch {}
    restoring = false;
  };
  if (ST) {
    ST.addEventListener("refreshInit", onRefreshInit);
    ST.addEventListener("refresh", onRefresh);
  }

  return () => {
    track.removeEventListener("scroll", onScroll);
    sec.removeEventListener("kt:horizontal", onPinned);
    sec.removeEventListener("focusin", onFocusIn);
    if (ST) {
      ST.removeEventListener("refreshInit", onRefreshInit);
      ST.removeEventListener("refresh", onRefresh);
    }
    extras.forEach((x) => {
      if (x && x.scrollTrigger) x.scrollTrigger.kill();
      if (x && x.kill) x.kill();
    });
    if (gsap) gsap.set(slots, { clearProps: "transform,transformOrigin" });
  };
}

function setupDeck(root, ctx) {
  const deck = root.querySelector("[data-deck].is-deck");
  if (!deck) return () => {};
  const cards = [...deck.querySelectorAll(".home-card")];
  const n = cards.length;
  const sec = deck.closest(".home-voices");
  const countEl = sec.querySelector("[data-deck-count]");
  const prevBtn = sec.querySelector("[data-deck-prev]");
  const nextBtn = sec.querySelector("[data-deck-next]");
  const gsap = window.gsap;
  const reduced = ctx.motion.reduced || !gsap;
  const ease = ctx.motion.ease.out;
  let order = cards.map((_, i) => i); // order[0] is the card on top
  const DEPTH = 4;
  // Each card keeps its own slight angle in the pile; the top card is picked up straight.
  const ROT = [-2.4, 1.8, -1.1, 2.7, -1.9, 1.2, -2.8, 0.9];
  const OFF = [-6, 8, -10, 5, -4, 10, -8, 3];
  const pose = (idx, k) =>
    k === 0
      ? { x: 0, y: 0, rotation: 0, scale: 1, autoAlpha: 1 }
      : {
          x: OFF[idx % OFF.length] * Math.min(k, 2),
          y: Math.min(k, DEPTH) * 12,
          rotation: ROT[idx % ROT.length],
          scale: 1 - Math.min(k, DEPTH) * 0.025,
          autoAlpha: k < DEPTH ? 1 : 0,
        };
  const setPose = (card, idx, k, animate, extra = {}) => {
    const p = pose(idx, k);
    if (!gsap) {
      card.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg) scale(${p.scale})`;
      card.style.visibility = p.autoAlpha ? "visible" : "hidden";
      return;
    }
    if (animate && !reduced) gsap.to(card, { ...p, duration: 0.85, ease, overwrite: "auto", ...extra });
    else gsap.set(card, p);
  };
  const sync = () => {
    order.forEach((idx, k) => {
      const card = cards[idx];
      card.style.zIndex = String(n - k);
      const top = k === 0;
      card.classList.toggle("is-top", top);
      if (top) {
        card.removeAttribute("aria-hidden");
        card.inert = false;
      } else {
        card.setAttribute("aria-hidden", "true");
        card.inert = true;
      }
    });
    if (countEl) countEl.textContent = pad(order[0] + 1);
  };
  const layout = (animate) => {
    order.forEach((idx, k) => setPose(cards[idx], idx, k, animate));
    sync();
  };
  layout(false);

  const say = () => {
    const card = cards[order[0]];
    const name = card.querySelector(".home-card__name");
    ctx.announce(`Card ${order[0] + 1} of ${n}${name ? `, ${name.textContent.replace(/^—\s*/, "")}` : ""}`);
  };

  // Throw the top card off (dir −1 left, +1 right); it settles at the back of the pile.
  const next = (dir = -1, fromX = 0) => {
    const idx = order[0];
    const card = cards[idx];
    order = [...order.slice(1), idx];
    sync();
    if (reduced) {
      if (gsap) gsap.set(card, { x: 0 });
      layout(false);
      if (gsap) gsap.fromTo(cards[order[0]], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18 });
      say();
      return;
    }
    card.style.zIndex = String(n + 1);
    const w = deck.offsetWidth;
    gsap.fromTo(
      card,
      { x: fromX },
      {
        x: dir * w * 0.85,
        y: -24,
        rotation: dir * 9,
        autoAlpha: 0,
        duration: 0.55,
        ease: "power2.in",
        overwrite: true,
        onComplete: () => {
          const k = order.indexOf(idx);
          card.style.zIndex = String(n - k);
          const p = pose(idx, k);
          gsap.set(card, { ...p, autoAlpha: 0, y: p.y + 18 });
          if (p.autoAlpha) gsap.to(card, { autoAlpha: 1, y: p.y, duration: 0.6, ease });
        },
      }
    );
    order.forEach((j, k) => {
      if (j !== idx) setPose(cards[j], j, k, true, { delay: 0.06 });
    });
    say();
  };
  const prev = () => {
    const idx = order[n - 1];
    const card = cards[idx];
    order = [idx, ...order.slice(0, n - 1)];
    sync();
    if (reduced) {
      layout(false);
      if (gsap) gsap.fromTo(card, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18 });
      say();
      return;
    }
    card.style.zIndex = String(n + 1);
    const w = deck.offsetWidth;
    gsap.fromTo(
      card,
      { x: -w * 0.85, y: -24, rotation: -9, autoAlpha: 0 },
      { ...pose(idx, 0), duration: 0.8, ease, overwrite: true, onComplete: () => (card.style.zIndex = String(n - order.indexOf(idx))) }
    );
    order.forEach((j, k) => {
      if (j !== idx) setPose(cards[j], j, k, true);
    });
    say();
  };

  const onPrev = () => prev();
  const onNext = () => next(-1);
  prevBtn && prevBtn.addEventListener("click", onPrev);
  nextBtn && nextBtn.addEventListener("click", onNext);
  const onKey = (e) => {
    if (e.target !== deck) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next(-1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
  };
  deck.addEventListener("keydown", onKey);

  // Drag / swipe the top card aside.
  let drag = null;
  const onDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const card = cards[order[0]];
    if (!card.contains(e.target)) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), dx: 0, card, live: false };
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.live) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) {
        if (Math.abs(dy) > 12) drag = null; // a vertical scroll: let it go
        return;
      }
      drag.live = true;
      deck.classList.add("is-dragging");
      try {
        deck.setPointerCapture(e.pointerId);
      } catch {}
    }
    drag.dx = dx;
    if (gsap) gsap.set(drag.card, { x: dx, y: Math.abs(dx) * -0.04, rotation: dx * 0.035, overwrite: true });
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    deck.classList.remove("is-dragging");
    if (!d.live) return;
    try {
      deck.releasePointerCapture(e.pointerId);
    } catch {}
    const v = d.dx / Math.max(1, performance.now() - d.t0);
    if (e.type !== "pointercancel" && (Math.abs(d.dx) > deck.offsetWidth * 0.2 || Math.abs(v) > 0.65)) next(d.dx < 0 ? -1 : 1, d.dx);
    else if (gsap) gsap.to(d.card, { ...pose(order[0], 0), duration: 0.7, ease, overwrite: true });
  };
  deck.addEventListener("pointerdown", onDown);
  deck.addEventListener("pointermove", onMove);
  deck.addEventListener("pointerup", onUp);
  deck.addEventListener("pointercancel", onUp);

  return () => {
    prevBtn && prevBtn.removeEventListener("click", onPrev);
    nextBtn && nextBtn.removeEventListener("click", onNext);
    deck.removeEventListener("keydown", onKey);
    deck.removeEventListener("pointerdown", onDown);
    deck.removeEventListener("pointermove", onMove);
    deck.removeEventListener("pointerup", onUp);
    deck.removeEventListener("pointercancel", onUp);
    if (gsap) gsap.killTweensOf(cards);
  };
}

// Scroll-linked touches (created synchronously in mount, so the shell's gsap.context reverts them).
function setupScroll(root, ctx) {
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  if (!gsap || !ST || ctx.motion.reduced) return;

  // Hero copy eases up and dims as the page turns over.
  const hero = root.querySelector(".home-hero");
  const inner = hero && hero.querySelector(".home-hero__inner");
  if (inner) {
    gsap.to(inner, {
      yPercent: -9,
      opacity: 0.25,
      ease: "none",
      scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
    });
  }

  // The red margin line beside the questions fills as you read down the paper.
  const paper = root.querySelector(".home-method__paper");
  const rule = paper && paper.querySelector(".home-method__rule");
  if (rule) {
    gsap.fromTo(
      rule,
      { scaleY: 0 },
      { scaleY: 1, ease: "none", scrollTrigger: { trigger: paper, start: "top 72%", end: "bottom 72%", scrub: 0.4 } }
    );
  }

  // Groups holding links or buttons fade with opacity only: autoAlpha's visibility:hidden would take
  // them out of the tab order until scrolled to. Tabbing to one scrolls it into view, which reveals it.
  root.querySelectorAll("[data-home-reveal]").forEach((el) =>
    gsap.fromTo(
      el,
      { opacity: 0, y: 24 },
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

  // The level staircase assembles: higher steps travel further.
  const steps = [...root.querySelectorAll(".home-level")];
  if (steps.length) {
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", () => {
      steps.forEach((s, i) =>
        gsap.fromTo(
          s,
          { y: 70 + i * 70, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            ease: "none",
            scrollTrigger: { trigger: s.parentElement, start: "top 92%", end: "top 38%", scrub: 0.5 },
          }
        )
      );
    });
    mm.add("(max-width: 1023px)", () => {
      steps.forEach((s) =>
        gsap.fromTo(s, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: ctx.motion.ease.out, clearProps: "transform,opacity", scrollTrigger: { trigger: s, start: "top 88%", once: true } })
      );
    });
  }
}

/* ------------------------------------------------------------------ view */

export default {
  id: "home",
  title: "Home",
  scene: "hero",
  render({ content }) {
    const courses = visible(content.courses);
    return html`<section class="view view--home" data-view="home">
      ${heroSection(content, courses)}
      ${bandSection(content, courses)}
      ${methodSection(content)}
      ${featuredSection(content, courses)}
      ${levelsSection(content, courses)}
      ${tutorSection(content)}
      ${statsSection(content)}
      ${voicesSection(content)}
      ${placesSection(content, courses)}
    </section>`;
  },
  mount(root, ctx) {
    const cleanups = [setupFeatured(root, ctx), setupDeck(root, ctx)];
    setupScroll(root, ctx);
    return () => cleanups.forEach((fn) => fn && fn());
  },
};
