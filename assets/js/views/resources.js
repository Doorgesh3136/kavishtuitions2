// Resources: the past-paper & notes library, presented as a register. Hero with a contents page ·
// search + filters (type, level, subject) and "arrange by section / year", synced to the URL ·
// a dense register on desktop that becomes cards on mobile, animated with GSAP Flip · how access works.
import { html, icon, render } from "../ui.js";
import { visible, levelName, levelExam, categoryName, safeUrl, whatsappLink } from "../store.js";

/* ------------------------------------------------------------------ helpers */

const pad = (n) => String(n).padStart(2, "0");
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const SECTIONS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const norm = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const TYPE_ORDER = ["past-paper", "worksheet", "notes", "video"];
const TYPE_LABEL = {
  "past-paper": ["Past paper", "Past papers"],
  worksheet: ["Worksheet", "Worksheets"],
  notes: ["Notes", "Notes"],
  video: ["Video", "Videos"],
};
const typeLabel = (t, plural = false) =>
  TYPE_LABEL[t] ? TYPE_LABEL[t][plural ? 1 : 0] : cap(String(t || "Other").replace(/[-_]+/g, " "));
const typeClass = (t) => (TYPE_LABEL[t] ? t : "other");
const shortExam = (content, id) => String(levelExam(content, id) || "").split("·")[0].trim();
const yearOf = (r) => {
  const y = parseInt(r && r.year, 10);
  return Number.isFinite(y) ? y : 0;
};

/* ------------------------------------------------------------------ model */

function buildModel(content) {
  const items = visible(content.resources)
    .filter((r) => r && String(r.title || "").trim())
    .map((r, i) => ({ ...r, key: String(r.id || `res-${i}`), order: i }));

  const present = (list) => [...new Set(list)];
  const types = [
    ...TYPE_ORDER.filter((t) => items.some((r) => r.type === t)),
    ...present(items.map((r) => r.type || "other").filter((t) => !TYPE_ORDER.includes(t))),
  ];
  const typeIndex = (t) => types.indexOf(t || "other");
  const byYear = (a, b) => yearOf(b) - yearOf(a) || a.order - b.order;
  const byType = (a, b) => typeIndex(a.type) - typeIndex(b.type) || a.order - b.order;

  // Catalogue numbers stay fixed whatever the filters or arrangement: A.01, A.02 … per section.
  const number = new Map();
  types.forEach((t, ti) =>
    items
      .filter((r) => (r.type || "other") === t)
      .sort(byYear)
      .forEach((r, i) => number.set(r.key, `${SECTIONS[ti] || ti + 1}.${pad(i + 1)}`))
  );

  const known = (list, ids) => {
    const out = (list || []).filter((x) => x && x.id && ids.includes(x.id)).map((x) => ({ id: x.id, name: x.name || x.id }));
    ids.filter((id) => id && !out.some((o) => o.id === id)).forEach((id) => out.push({ id, name: id }));
    return out;
  };
  const levels = known(content.levels, present(items.map((r) => r.level).filter(Boolean)));
  const cats = known(content.categories, present(items.map((r) => r.category).filter(Boolean)));
  const years = present(items.map(yearOf)).sort((a, b) => b - a);

  items.forEach((r) => {
    r.hay = norm(
      [r.title, r.description, typeLabel(r.type), typeLabel(r.type, true), levelName(content, r.level), levelExam(content, r.level), categoryName(content, r.category), r.year].join(" ")
    );
  });

  function groups(by) {
    if (by === "year")
      return years.map((y) => ({
        key: `y-${y}`,
        mark: y ? "Year" : "Undated",
        title: y ? String(y) : "Undated",
        items: items.filter((r) => yearOf(r) === y).sort(byType),
      }));
    return types.map((t, i) => ({
      key: `t-${t}`,
      mark: `Section ${SECTIONS[i] || i + 1}`,
      title: typeLabel(t, true),
      items: items.filter((r) => (r.type || "other") === t).sort(byYear),
    }));
  }

  return { items, types, levels, cats, years, number, groups, byKey: new Map(items.map((r) => [r.key, r])) };
}

/* ------------------------------------------------------------------ filters */

function readFilters(query, m) {
  const get = (k) => (query && query.get(k)) || "";
  const pick = (v, ok) => (ok.includes(v) ? v : "");
  return {
    type: pick(get("type"), m.types),
    level: pick(get("level"), m.levels.map((l) => l.id)),
    subject: pick(get("subject"), m.cats.map((c) => c.id)),
    q: get("q").trim().slice(0, 80),
    group: get("group") === "year" ? "year" : "type",
  };
}

const tokensOf = (q) => norm(q).split(/\s+/).filter(Boolean);

function matches(r, f, tokens, skip = "") {
  if (skip !== "type" && f.type && (r.type || "other") !== f.type) return false;
  if (skip !== "level" && f.level && r.level !== f.level) return false;
  if (skip !== "subject" && f.subject && r.category !== f.subject) return false;
  return tokens.every((t) => r.hay.includes(t));
}

const isFiltered = (f) => !!(f.type || f.level || f.subject || f.q);

/** Title with the search terms marked. Plain text in, escaped html`` out. */
function marked(text, tokens) {
  const t = String(text || "");
  if (!tokens.length) return t;
  const lower = t.toLowerCase();
  const ranges = [];
  tokens.forEach((tok) => {
    if (!tok) return;
    let i = lower.indexOf(tok);
    while (i >= 0) {
      ranges.push([i, i + tok.length]);
      i = lower.indexOf(tok, i + tok.length);
    }
  });
  if (!ranges.length) return t;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  ranges.forEach((r) => {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  });
  const out = [];
  let at = 0;
  merged.forEach(([a, b]) => {
    out.push(t.slice(at, a), html`<mark class="rs-hl">${t.slice(a, b)}</mark>`);
    at = b;
  });
  out.push(t.slice(at));
  return out;
}

/* ------------------------------------------------------------------ markup */

function typeTag(t) {
  return html`<span class="tag rs-type rs-type--${typeClass(t)}">${t === "video" ? icon("play", { size: 10 }) : ""}${typeLabel(t)}</span>`;
}

function action(r) {
  const url = safeUrl(r.url);
  if (url)
    return html`<a class="rs-act rs-act--open" href="${url}" target="_blank" rel="noopener noreferrer"><span>Open</span><span class="rs-act__i" aria-hidden="true">${icon("arrow-up-right", { size: 14 })}</span><span class="sr-only">: ${r.title} (opens in a new tab)</span></a>`;
  return html`<a class="rs-act" href="#/enrol?resource=${encodeURIComponent(r.id || r.key)}"><span>Request</span><span class="rs-act__i" aria-hidden="true">${icon("arrow-right", { size: 14 })}</span><span class="sr-only">: ${r.title}</span></a>`;
}

function row(content, m, r, on, tokens) {
  const exam = shortExam(content, r.level);
  return html`<li class="rs-row${on ? "" : " is-out"}" data-key="${r.key}">
    <span class="rs-row__no">${m.number.get(r.key) || ""}</span>
    <span class="rs-row__type">${typeTag(r.type || "other")}</span>
    <span class="rs-row__year">${yearOf(r) || "—"}</span>
    <div class="rs-row__main">
      <h4 class="rs-row__title">${marked(r.title, tokens)}</h4>
      ${r.description ? html`<p class="rs-row__desc">${r.description}</p>` : ""}
    </div>
    <span class="rs-row__meta">
      <span class="rs-row__level">${r.level ? html`${levelName(content, r.level)}${exam ? html`<small>${exam}</small>` : ""}` : "—"}</span>
      <span class="rs-row__subject">${r.category ? categoryName(content, r.category) : "—"}</span>
    </span>
    <span class="rs-row__act">${action(r)}</span>
  </li>`;
}

function groupShell(g, count) {
  return html`<section class="rs-group" data-group="${g.key}">
    <h3 class="rs-group__head${count ? "" : " is-out"}"><span class="rs-group__mark">${g.mark}</span><span class="rs-group__title">${g.title}</span><span class="rs-group__n">${pad(count)}</span></h3>
    <ol class="rs-group__rows"></ol>
  </section>`;
}

function groupsMarkup(content, m, f) {
  const tokens = tokensOf(f.q);
  return m.groups(f.group).map((g) => {
    const on = g.items.filter((r) => matches(r, f, tokens));
    return html`<section class="rs-group" data-group="${g.key}">
      <h3 class="rs-group__head${on.length ? "" : " is-out"}"><span class="rs-group__mark">${g.mark}</span><span class="rs-group__title">${g.title}</span><span class="rs-group__n">${pad(on.length)}</span></h3>
      <ol class="rs-group__rows">${g.items.map((r) => row(content, m, r, on.includes(r), tokens))}</ol>
    </section>`;
  });
}

function facetCounts(m, f) {
  const tokens = tokensOf(f.q);
  const count = (skip, test) => m.items.filter((r) => matches(r, f, tokens, skip) && test(r)).length;
  return {
    type: Object.fromEntries([["", count("type", () => true)], ...m.types.map((t) => [t, count("type", (r) => (r.type || "other") === t)])]),
    level: Object.fromEntries([["", count("level", () => true)], ...m.levels.map((l) => [l.id, count("level", (r) => r.level === l.id)])]),
    subject: Object.fromEntries([["", count("subject", () => true)], ...m.cats.map((c) => [c.id, count("subject", (r) => r.category === c.id)])]),
    shown: m.items.filter((r) => matches(r, f, tokens)).length,
  };
}

function heroSection(m) {
  const total = m.items.length;
  return html`<header class="view-hero rs-hero">
    <div class="container rs-hero__grid">
      <p class="eyebrow rs-hero__eyebrow" data-intro><span class="eyebrow__num">04</span>Resources</p>
      <h1 class="h1 rs-hero__title" data-split="intro">Past papers,<br /><em>with the working shown.</em></h1>
      <p class="lead rs-hero__lead" data-intro>Worked solutions, worksheets, revision notes and short videos, written for our groups and set out the way the mark scheme reads.</p>
      ${total
        ? html`<nav class="rs-contents" aria-label="Sections of the register" data-intro>
            <p class="rs-contents__h"><span>Contents</span><span>Items</span></p>
            <ol class="rs-contents__list">
              ${m.types.map((t, i) => {
                const n = m.items.filter((r) => (r.type || "other") === t).length;
                return html`<li>
                  <a class="rs-contents__link" href="#/resources?type=${encodeURIComponent(t)}" data-type="${t}">
                    <span class="rs-contents__sec">${SECTIONS[i] || i + 1}</span>
                    <span class="rs-contents__name">${typeLabel(t, true)}</span>
                    <span class="rs-contents__dots" aria-hidden="true"></span>
                    <span class="rs-contents__n">${pad(n)}</span>
                  </a>
                </li>`;
              })}
            </ol>
            <p class="rs-contents__total">This register consists of ${total} ${total === 1 ? "item" : "items"} in ${word(m.types.length)} ${m.types.length === 1 ? "section" : "sections"}.</p>
          </nav>`
        : ""}
    </div>
  </header>`;
}

function filtersMarkup(m, f, counts) {
  const opt = (id, name, n, sel) => html`<option value="${id}"${sel ? " selected" : ""}>${name}${n !== undefined ? ` (${n})` : ""}</option>`;
  return html`<form class="rs-filters" role="search" aria-label="Search and filter the register" novalidate>
    <div class="field rs-filters__search">
      <label class="field__label" for="rs-q">Search the register</label>
      <div class="rs-search">
        ${icon("search", { size: 22, cls: "rs-search__icon" })}
        <input class="input rs-search__input" id="rs-q" name="q" type="search" value="${f.q}" placeholder="A code, a topic or a year: try 9709" autocomplete="off" spellcheck="false" enterkeyhint="search" />
        <button class="rs-search__clear" type="button" aria-label="Clear the search"${f.q ? "" : " hidden"}>${icon("close", { size: 16 })}</button>
      </div>
    </div>
    <div class="field rs-filters__level">
      <label class="field__label" for="rs-level">Level</label>
      <select class="select" id="rs-level" name="level">
        ${opt("", "All levels", counts.level[""], !f.level)}
        ${m.levels.map((l) => opt(l.id, l.name, counts.level[l.id], f.level === l.id))}
      </select>
    </div>
    <div class="field rs-filters__subject">
      <label class="field__label" for="rs-subject">Subject</label>
      <select class="select" id="rs-subject" name="subject">
        ${opt("", "All subjects", counts.subject[""], !f.subject)}
        ${m.cats.map((c) => opt(c.id, c.name, counts.subject[c.id], f.subject === c.id))}
      </select>
    </div>
    <div class="rs-filters__types">
      <p class="field__label" id="rs-type-label">Type</p>
      <div class="chip-row rs-chips" role="group" aria-labelledby="rs-type-label">
        <button class="chip" type="button" data-type="" aria-pressed="${!f.type}">All <span class="chip__count">${counts.type[""]}</span></button>
        ${m.types.map(
          (t) => html`<button class="chip${!counts.type[t] && f.type !== t ? " is-zero" : ""}" type="button" data-type="${t}" aria-pressed="${f.type === t}">${typeLabel(t, true)} <span class="chip__count">${counts.type[t]}</span></button>`
        )}
      </div>
    </div>
    <div class="rs-filters__arrange">
      <p class="field__label" id="rs-arrange-label">Arrange by</p>
      <div class="rs-seg" role="group" aria-labelledby="rs-arrange-label">
        <button type="button" data-group="type" aria-pressed="${f.group === "type"}">Section</button>
        <button type="button" data-group="year" aria-pressed="${f.group === "year"}">Year</button>
      </div>
    </div>
  </form>`;
}

function librarySection(content, m, f) {
  const counts = facetCounts(m, f);
  return html`<section class="section rs-lib" id="register" aria-labelledby="rs-lib-title">
    <div class="container">
      <div class="rs-lib__head">
        <p class="eyebrow rs-lib__eyebrow" data-reveal><span class="eyebrow__num">01</span>The register</p>
        <h2 class="h2 rs-lib__title" id="rs-lib-title" data-split>Find it by code, <em>topic or year.</em></h2>
        <p class="margin-note rs-lib__note" data-reveal>Nothing here is locked away: press Request and we send it to you.<a class="margin-note__marks rs-lib__more" href="#access" data-scroll-to="#access">[see how access works]</a></p>
      </div>
      <div data-rs-reveal>${filtersMarkup(m, f, counts)}</div>
      <div class="rs-status" data-rs-reveal>
        <p class="rs-status__count"><span class="rs-status__n">${counts.shown}</span> of ${m.items.length} shown</p>
        <button class="rs-status__reset link" type="button" data-reset${isFiltered(f) ? "" : " hidden"}>Clear filters</button>
      </div>
      <div class="rs-register">
        <div class="rs-cols" aria-hidden="true">
          <span>No.</span><span>Type</span><span>Year</span><span>Title</span><span>Level</span><span>Subject</span><span></span>
        </div>
        <div class="rs-groups">${groupsMarkup(content, m, f)}</div>
        <div class="empty-state rs-empty${counts.shown ? " is-out" : ""}">
          <p class="empty-state__mark">[0 marks]</p>
          <p class="empty-state__title">Nothing in the register matches that.</p>
          <p class="empty-state__text">Try a syllabus code such as 9709, or fewer filters. If the paper you need isn’t listed, ask: we will tell you what we have.</p>
          <div class="cluster rs-empty__actions">
            <button class="btn btn--ghost btn--sm" type="button" data-reset>Clear filters</button>
            <a class="link-arrow" href="#/enrol">Ask for a paper ${icon("arrow-right", { size: 16 })}</a>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function accessSection(content, m) {
  const wa = whatsappLink(content.site && content.site.whatsapp, "Hello, I'd like to ask about a resource on your website.");
  const anyOpen = m.items.some((r) => safeUrl(r.url));
  const steps = [
    ["Enrolled students", "Everything in this register is in your group’s class folder from the first week, next to the lesson recordings and the board notes."],
    ["Not enrolled yet", "Press Request on any item and tell us the student’s level. We send that item, with the days and times of the group it was written for."],
    anyOpen
      ? ["Marked Open", "Some items are public. They open in a new tab and need no login or sign-up."]
      : ["Official papers", "Question papers and mark schemes are published by Cambridge. What we add is the working, the method marks and the mistakes students usually make."],
  ];
  return html`<section class="section section--paper-2 rs-access" id="access" aria-labelledby="rs-access-title">
    <div class="container rs-access__grid">
      <div class="rs-access__head">
        <p class="eyebrow" data-reveal><span class="eyebrow__num">02</span>How access works</p>
        <h2 class="h1 rs-access__title" id="rs-access-title" data-split>Kept in the <em>class folder.</em></h2>
      </div>
      <div class="rs-access__body">
        <ol class="rs-access__list" data-stagger="0.1">
          ${steps.map(
            ([h, p], i) => html`<li class="rs-access__item">
              <span class="rs-access__no">${pad(i + 1)}</span>
              <div>
                <h3 class="rs-access__h">${h}</h3>
                <p class="rs-access__p">${p}</p>
              </div>
            </li>`
          )}
        </ol>
        <div class="cluster rs-access__cta" data-rs-reveal>
          <a class="btn btn--primary" href="#/enrol" data-magnetic><span>Enrol</span><span class="btn__icon">${icon("arrow-right", { size: 16 })}</span></a>
          ${wa
            ? html`<a class="btn btn--ghost" href="${wa}" target="_blank" rel="noopener noreferrer"><span>Ask on WhatsApp</span><span class="btn__icon">${icon("whatsapp", { size: 16 })}</span></a>`
            : ""}
        </div>
      </div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ behaviour */

let active = null; // mounted instance, for onQuery

function setupLibrary(root, ctx) {
  const lib = root.querySelector(".rs-lib");
  if (!lib) return null;
  const { content, motion } = ctx;
  const gsap = window.gsap;
  const Flip = window.Flip;
  const ST = window.ScrollTrigger;
  const reduced = motion.reduced;
  const m = buildModel(content);
  let f = readFilters(ctx.query, m);

  const form = lib.querySelector(".rs-filters");
  const input = lib.querySelector("#rs-q");
  const clearBtn = lib.querySelector(".rs-search__clear");
  const levelSel = lib.querySelector("#rs-level");
  const subjectSel = lib.querySelector("#rs-subject");
  const groupsEl = lib.querySelector(".rs-groups");
  const empty = lib.querySelector(".rs-empty");
  const countEl = lib.querySelector(".rs-status__n");
  const resetBtn = lib.querySelector(".rs-status__reset");
  const rowsByKey = () => new Map([...groupsEl.querySelectorAll(".rs-row")].map((el) => [el.dataset.key, el]));

  let flip = null;
  let typing = 0;
  let announceT = 0;
  let revealTriggers = [];

  /* first reveal of the rows: opacity only, so links stay in the tab order */
  if (gsap && ST && !reduced) {
    const rows = [...groupsEl.querySelectorAll(".rs-row:not(.is-out), .rs-group__head:not(.is-out)")];
    gsap.set(rows, { opacity: 0, y: 18 });
    revealTriggers = ST.batch(rows, {
      start: "top 94%",
      once: true,
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.85, ease: motion.ease.out, stagger: 0.05, overwrite: true, clearProps: "transform,opacity" }),
    });
  }
  const settleReveal = () => {
    if (!revealTriggers.length) return;
    revealTriggers.forEach((t) => t.kill());
    revealTriggers = [];
    if (gsap) gsap.set(groupsEl.querySelectorAll(".rs-row, .rs-group__head"), { clearProps: "transform,opacity" });
  };

  function syncControls() {
    if (input.value !== f.q) input.value = f.q;
    clearBtn.hidden = !f.q;
    levelSel.value = f.level;
    subjectSel.value = f.subject;
    lib.querySelectorAll(".rs-chips .chip").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.type || "") === f.type)));
    lib.querySelectorAll(".rs-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.group === f.group)));
  }

  function syncCounts(counts) {
    lib.querySelectorAll(".rs-chips .chip").forEach((b) => {
      const c = b.querySelector(".chip__count");
      const n = counts.type[b.dataset.type || ""] ?? 0;
      if (c) c.textContent = String(n);
      b.classList.toggle("is-zero", !n && b.getAttribute("aria-pressed") !== "true");
    });
    const label = (sel, list, key, allLabel) =>
      [...sel.options].forEach((o) => {
        const item = list.find((x) => x.id === o.value);
        o.textContent = `${o.value ? (item ? item.name : o.value) : allLabel} (${counts[key][o.value] ?? 0})`;
      });
    label(levelSel, m.levels, "level", "All levels");
    label(subjectSel, m.cats, "subject", "All subjects");
    countEl.textContent = String(counts.shown);
    resetBtn.hidden = !isFiltered(f);
  }

  function regroup() {
    const rows = rowsByKey();
    const groups = m.groups(f.group);
    render(groupsEl, html`${groups.map((g) => groupShell(g, 0))}`);
    const shells = groupsEl.querySelectorAll(".rs-group__rows");
    groups.forEach((g, i) => g.items.forEach((r) => rows.get(r.key) && shells[i].appendChild(rows.get(r.key))));
  }

  function applyVisibility() {
    const tokens = tokensOf(f.q);
    const rows = rowsByKey();
    m.items.forEach((r) => {
      const el = rows.get(r.key);
      if (!el) return;
      const on = matches(r, f, tokens);
      el.classList.toggle("is-out", !on);
      const title = el.querySelector(".rs-row__title");
      if (title) render(title, html`${marked(r.title, tokens)}`);
    });
    groupsEl.querySelectorAll(".rs-group").forEach((sec) => {
      const n = sec.querySelectorAll(".rs-row:not(.is-out)").length;
      const head = sec.querySelector(".rs-group__head");
      head.classList.toggle("is-out", !n);
      const c = head.querySelector(".rs-group__n");
      if (c) c.textContent = pad(n);
    });
    const counts = facetCounts(m, f);
    empty.classList.toggle("is-out", counts.shown > 0);
    syncCounts(counts);
    return counts;
  }

  function update({ regroup: doRegroup = false, animate = true, announce = true, push = true } = {}) {
    settleReveal();
    const targets = () => [...groupsEl.querySelectorAll(".rs-row, .rs-group__head"), empty];
    const canFlip = animate && !reduced && gsap && Flip;
    const state = canFlip ? Flip.getState(targets()) : null;
    if (flip) {
      flip.kill();
      flip = null;
    }
    if (doRegroup) regroup();
    syncControls();
    const counts = applyVisibility();
    if (state) {
      flip = Flip.from(state, {
        targets: targets(),
        duration: 0.7,
        ease: motion.ease.out,
        absoluteOnLeave: true,
        stagger: doRegroup ? 0.012 : 0,
        onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.55, delay: 0.1, ease: motion.ease.out, stagger: 0.025, overwrite: true, clearProps: "transform,opacity" }),
        onLeave: (els) => gsap.to(els, { opacity: 0, duration: 0.2, ease: "power1.out", overwrite: true }),
        onComplete: () => {
          flip = null;
          motion.refresh();
        },
      });
    } else {
      motion.refresh();
    }
    if (push) ctx.setQuery({ type: f.type, level: f.level, subject: f.subject, q: f.q, group: f.group === "year" ? "year" : "" });
    if (announce) {
      clearTimeout(announceT);
      announceT = setTimeout(() => {
        const n = counts.shown;
        ctx.announce(n ? `${n} of ${m.items.length} ${m.items.length === 1 ? "item" : "items"} shown` : "No items match. Clear the filters to see everything.");
      }, 650);
    }
  }

  const set = (patch, opts) => {
    const regroupNeeded = patch.group !== undefined && patch.group !== f.group;
    f = { ...f, ...patch };
    update({ regroup: regroupNeeded, ...opts });
  };

  const goToRegister = () => {
    const target = lib.querySelector(".rs-lib__head") || lib;
    setTimeout(() => motion.scrollTo(target), 40);
  };

  /* events */
  const onSubmit = (e) => {
    e.preventDefault();
    clearTimeout(typing);
    set({ q: input.value.trim().slice(0, 80) });
    if (window.matchMedia("(hover: none)").matches) input.blur();
  };
  const onInput = () => {
    clearBtn.hidden = !input.value;
    clearTimeout(typing);
    typing = setTimeout(() => set({ q: input.value.trim().slice(0, 80) }), 180);
  };
  const onKey = (e) => {
    if (e.key === "Escape" && input.value) {
      e.preventDefault();
      input.value = "";
      clearTimeout(typing);
      set({ q: "" });
    }
  };
  const onChange = (e) => {
    if (e.target === levelSel) set({ level: levelSel.value });
    else if (e.target === subjectSel) set({ subject: subjectSel.value });
  };
  const onClick = (e) => {
    const chip = e.target.closest(".rs-chips .chip");
    if (chip) return set({ type: chip.dataset.type || "" });
    const seg = e.target.closest(".rs-seg button");
    if (seg) return set({ group: seg.dataset.group === "year" ? "year" : "type" });
    if (e.target.closest(".rs-search__clear")) {
      input.value = "";
      clearTimeout(typing);
      set({ q: "" });
      input.focus();
      return;
    }
    const reset = e.target.closest("[data-reset]");
    if (reset) {
      clearTimeout(typing);
      set({ type: "", level: "", subject: "", q: "" });
      if (reset.closest(".rs-empty")) input.focus();
    }
  };
  // Contents links in the hero: show that section and glide down to it (no route change needed).
  const onContents = (e) => {
    const a = e.target.closest(".rs-contents__link");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    const t = a.dataset.type || "";
    const regroupNeeded = f.group !== "type";
    f = { ...f, type: m.types.includes(t) ? t : "", level: "", subject: "", q: "", group: "type" };
    update({ regroup: regroupNeeded, animate: false });
    goToRegister();
  };

  form.addEventListener("submit", onSubmit);
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKey);
  form.addEventListener("change", onChange);
  lib.addEventListener("click", onClick);
  root.addEventListener("click", onContents);

  return {
    fromQuery(query) {
      const next = readFilters(query, m);
      const regroupNeeded = next.group !== f.group;
      f = next;
      update({ regroup: regroupNeeded, push: false, animate: false });
      goToRegister();
    },
    cleanup() {
      clearTimeout(typing);
      clearTimeout(announceT);
      if (flip) flip.kill();
      revealTriggers.forEach((t) => t.kill());
      form.removeEventListener("submit", onSubmit);
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKey);
      form.removeEventListener("change", onChange);
      lib.removeEventListener("click", onClick);
      root.removeEventListener("click", onContents);
    },
  };
}

// Blocks holding controls fade with opacity only (autoAlpha would drop them from the tab order).
function setupReveals(root, ctx) {
  const gsap = window.gsap;
  if (!gsap || !window.ScrollTrigger || ctx.motion.reduced) return;
  root.querySelectorAll("[data-rs-reveal]").forEach((el) =>
    gsap.fromTo(
      el,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 1, ease: ctx.motion.ease.out, clearProps: "transform,opacity", scrollTrigger: { trigger: el, start: "top 92%", once: true } }
    )
  );
}

/* ------------------------------------------------------------------ view */

export default {
  id: "resources",
  title: "Resources",
  scene: "scatter",
  render(ctx) {
    const { content } = ctx;
    const m = buildModel(content);
    const f = readFilters(ctx.query, m);
    return html`<section class="view view--resources" data-view="resources">
      ${heroSection(m)}
      ${m.items.length
        ? librarySection(content, m, f)
        : html`<section class="section rs-lib rs-lib--empty">
            <div class="container">
              <div class="empty-state">
                <p class="empty-state__mark">[Register empty]</p>
                <p class="empty-state__title">The register is being filled in.</p>
                <p class="empty-state__text">Worked papers and notes will be listed here. Enrolled students already have them in their class folder.</p>
                <a class="link-arrow" href="#/enrol">Ask about a paper ${icon("arrow-right", { size: 16 })}</a>
              </div>
            </div>
          </section>`}
      ${accessSection(content, m)}
    </section>`;
  },
  mount(root, ctx) {
    const lib = setupLibrary(root, ctx);
    setupReveals(root, ctx);
    const self = { lib };
    active = self;
    return () => {
      if (lib) lib.cleanup();
      if (active === self) active = null;
    };
  },
  onQuery(query) {
    if (active && active.lib) active.lib.fromQuery(query);
  },
};
