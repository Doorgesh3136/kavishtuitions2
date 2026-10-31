// Plans & timetable: fees with a monthly/termly switch, a printed fee slip for paying (copy buttons),
// the weekly timetable (Mon–Sat grid positioned by time on desktop, day tabs + list on mobile),
// questions (accordion) and a closing call to action. Everything is derived from content.json.

import { html, raw, icon, paragraphs, render as put, penUnderline, penTick, penArrow, penCircle } from "../ui.js";
import { visible, formatRs, byId, levelName, DAYS, whatsappLink, tutorFor } from "../store.js";

const gsapRef = () => window.gsap || null;
const stRef = () => window.ScrollTrigger || null;

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n) => WORDS[n] || String(n);
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const pad = (n) => String(n).padStart(2, "0");
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
const num = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString("en-GB");
const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const LETTERS = "ABCDEFGH";

/* ------------------------------------------------------------------ model */

function levelMap(content) {
  const map = new Map();
  (Array.isArray(content.levels) ? content.levels : []).filter((l) => l && l.id).forEach((l, i) => {
    const exam = String(l.exam || "").split("·")[0].trim();
    const short = exam && exam.length <= 6 ? exam : String(l.name || l.id).replace(/^Grade\s+/i, "G");
    map.set(l.id, { id: l.id, name: l.name || l.id, short, rank: Math.min(i, 2) });
  });
  return map;
}

// Overlapping sessions in one day share the column side by side.
function layoutLanes(list) {
  let cluster = [];
  let end = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach((s) => {
      let i = lanes.findIndex((e) => e <= s.a);
      if (i < 0) {
        i = lanes.length;
        lanes.push(0);
      }
      lanes[i] = s.b;
      s.lane = i;
    });
    cluster.forEach((s) => {
      s.lanes = lanes.length;
    });
    cluster = [];
  };
  list.forEach((s) => {
    if (cluster.length && s.a >= end) {
      flush();
      end = -1;
    }
    cluster.push(s);
    end = Math.max(end, s.b);
  });
  if (cluster.length) flush();
}

function timetableModel(content) {
  const levels = levelMap(content);
  const courses = Array.isArray(content.courses) ? content.courses : [];
  const order = DAYS.map((d) => d.id);
  const sessions = (Array.isArray(content.timetable) ? content.timetable : [])
    .map((s, i) => {
      if (!s) return null;
      const c = byId(courses, s.courseId);
      if (!c || c.visible === false) return null;
      const day = String(s.day || "").toLowerCase().slice(0, 3);
      if (!order.includes(day)) return null;
      const a = toMin(s.start);
      const b = toMin(s.end);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
      const level = levels.get(c.level) || {
        id: String(c.level || ""),
        name: levelName(content, c.level) || "",
        short: String(c.level || "").toUpperCase().slice(0, 6),
        rank: 1,
      };
      return { key: String(s.id || `s${i}`), day, a, b, start: hhmm(a), end: hhmm(b), room: String(s.room || "").trim(), course: c, level };
    })
    .filter(Boolean)
    .sort((x, y) => order.indexOf(x.day) - order.indexOf(y.day) || x.a - y.a || x.b - y.b);

  const days = DAYS.filter((d, i) => i < 6 || sessions.some((s) => s.day === d.id)).map((d) => {
    const list = sessions.filter((s) => s.day === d.id);
    layoutLanes(list);
    return { ...d, list };
  });
  const lo = sessions.length ? Math.floor(Math.min(...sessions.map((s) => s.a)) / 60) * 60 : 0;
  const hi = sessions.length ? Math.ceil(Math.max(...sessions.map((s) => s.b)) / 60) * 60 : 0;
  const lv = [...levels.values()].filter((l) => sessions.some((s) => s.level.id === l.id));
  return { sessions, days, lo, hi, levels: lv };
}

function planModel(p) {
  const m = num(p.monthly);
  const t0 = num(p.termly);
  const t = t0 !== null && t0 > 0 ? t0 : null;
  const save = m !== null && t !== null ? m * 3 - t : 0;
  return { p, m, t, save: save > 0 ? save : 0, pct: save > 0 ? (save / (m * 3)) * 100 : 0 };
}

function bankParts(bank) {
  const s = String(bank || "").trim();
  if (!s) return null;
  const parts = s.split(/\s*[·•|]\s*|\s*\n\s*/).map((x) => x.trim()).filter(Boolean);
  const idx = parts.findIndex((p) => p.replace(/\D/g, "").length >= 6);
  if (idx < 0) return { raw: s };
  return { bank: parts.slice(0, idx).join(" · "), account: parts[idx], name: parts.slice(idx + 1).join(" · "), raw: s };
}

function billingFrom(query, hasTerm) {
  return hasTerm && query && query.get && query.get("billing") === "termly" ? "termly" : "monthly";
}
function levelFrom(query, tt) {
  const l = query && query.get ? query.get("level") || "" : "";
  return tt.levels.some((x) => x.id === l) ? l : "";
}

function model(ctx) {
  const content = ctx.content || {};
  const site = content.site || {};
  const pay = site.payment || {};
  const plans = visible(content.plans).map(planModel);
  const hasTerm = plans.some((x) => x.t !== null);
  const maxPct = plans.reduce((a, x) => Math.max(a, x.pct), 0);
  const tt = timetableModel(content);
  const faqs = (Array.isArray(content.faqs) ? content.faqs : []).filter((f) => f && String(f.q || "").trim());
  const juice = String(pay.juice || "").trim();
  const bank = bankParts(pay.bank);
  const note = String(pay.note || "").trim();
  const hasPay = !!(juice || bank || note);
  const sections = [
    { id: "pl-fees", t: "Fees", n: plans.length, sr: `${plans.length} ${plural(plans.length, "plan")}` },
    hasPay && { id: "pl-pay", t: "Paying", n: (juice ? 1 : 0) + (bank ? 1 : 0), sr: "ways to pay" },
    { id: "pl-timetable", t: "Timetable", n: tt.sessions.length, sr: `${tt.sessions.length} ${plural(tt.sessions.length, "lesson")} a week` },
    faqs.length && { id: "pl-faq", t: "Questions", n: faqs.length, sr: `${faqs.length} ${plural(faqs.length, "question")}` },
  ]
    .filter(Boolean)
    .map((s, i) => ({ ...s, letter: LETTERS[i] }));
  const sec = Object.fromEntries(sections.map((s) => [s.id, s]));
  return {
    content,
    site,
    plans,
    hasTerm,
    maxPct,
    tt,
    faqs,
    juice,
    bank,
    note,
    hasPay,
    sections,
    sec,
    billing: billingFrom(ctx.query, hasTerm),
    level: levelFrom(ctx.query, tt),
  };
}

/* ------------------------------------------------------------------ pieces */

const arrow = (size = 16) => html`<span class="btn__icon">${icon("arrow-right", { size })}</span>`;

function secLabel(s) {
  return s ? html`<p class="pl-sec"><span class="pl-sec__k">Section ${s.letter}</span><span class="pl-sec__t">${s.t}</span></p>` : "";
}

function hero(M) {
  const first = !M.plans.length
    ? "Fees, times and how to pay, kept in one place."
    : M.hasTerm && M.maxPct >= 0.5
    ? "Pay by the month, or by the term for a little less."
    : "Fees are paid by the month.";
  const more = [
    M.tt.sessions.length && "the whole week’s timetable",
    M.hasPay && "how to pay",
    M.faqs.length && "answers to the usual questions",
  ].filter(Boolean);
  const list = more.length > 1 ? `${more.slice(0, -1).join(", ")}, and ${more[more.length - 1]}` : more[0] || "";
  const lead = list ? `${first} Further down: ${list}.` : first;
  return html`<header class="view-hero pl-hero" aria-labelledby="pl-title">
    <div class="container pl-hero__grid">
      <p class="eyebrow pl-hero__eyebrow" data-intro><span class="eyebrow__num">05</span>Plans &amp; timetable</p>
      <h1 class="h1 pl-hero__title" id="pl-title" data-split="intro">What it costs,<br /><em>and when we <span class="pen-mark">meet${penUnderline()}</span>.</em></h1>
      <p class="lead pl-hero__lead" data-intro>${lead}</p>
      <nav class="pl-toc" aria-label="On this page" data-intro>
        <ol class="pl-toc__list">
          ${M.sections.map(
            (s) => html`<li>
              <a class="pl-toc__link" href="#${s.id}" data-scroll-to="#${s.id}">
                <span class="pl-toc__k">${s.letter}</span>
                <span class="pl-toc__t">${s.t}</span>
                ${s.n ? html`<span class="marks pl-toc__n" aria-hidden="true">${s.n}</span><span class="sr-only">, ${s.sr}</span>` : ""}
              </a>
            </li>`
          )}
        </ol>
      </nav>
    </div>
  </header>`;
}

/* ---- fees */

function billingSwitch(M) {
  if (!M.hasTerm) return "";
  const pct = Math.round(M.maxPct);
  return html`<div class="pl-bill">
    <fieldset class="pl-switch" data-pl-switch>
      <legend class="pl-switch__legend">Show fees</legend>
      <div class="pl-switch__track">
        <span class="pl-switch__thumb" aria-hidden="true"></span>
        <label class="pl-switch__opt">
          <input type="radio" name="pl-billing" value="monthly" ${M.billing === "monthly" ? "checked" : ""} />
          <span>Monthly</span>
        </label>
        <label class="pl-switch__opt">
          <input type="radio" name="pl-billing" value="termly" ${M.billing === "termly" ? "checked" : ""} />
          <span>Termly</span>
        </label>
      </div>
    </fieldset>
    ${pct >= 1
      ? html`<p class="pl-bill__note">
          ${penArrow({ cls: "pl-bill__arrow" })}
          <span class="margin-note">Pay per term and save up to ${pct}%<span class="margin-note__marks">1 term = 3 months</span></span>
        </p>`
      : ""}
  </div>`;
}

function priceBlock(x, i, billing) {
  const { m, t, save } = x;
  if (m === null && t === null) return html`<div class="pl-plan__price"><p class="pl-price pl-price--ask">Fee on request</p></div>`;
  const mm = m !== null ? m : t; // termly-only plan: show the term price either way
  const cur = billing === "termly" && t !== null ? t : mm;
  const both = m !== null && t !== null;
  return html`<div class="pl-plan__price">
    <p class="pl-price" aria-hidden="true">
      <span class="pl-price__cur">Rs</span>
      <span class="pl-price__num" data-pl-amount data-m="${mm}" data-t="${t !== null ? t : ""}">${fmtNum(cur)}</span>
      <span class="pl-price__per">${both
        ? html`<span class="pl-when pl-when--m">a month</span><span class="pl-when pl-when--t">a term</span>`
        : m !== null
        ? "a month"
        : "a term"}</span>
    </p>
    <p class="sr-only">${both
      ? html`<span class="pl-when pl-when--m">${formatRs(m)} a month</span><span class="pl-when pl-when--t">${formatRs(t)} a term of three months</span>`
      : m !== null
      ? `${formatRs(m)} a month`
      : `${formatRs(t)} a term`}</p>
    <p class="pl-plan__alt">
      ${both
        ? html`<span class="pl-swap"><span class="pl-when pl-when--m">or ${formatRs(t)} a term</span><span class="pl-when pl-when--t">Works out at ${formatRs(Math.round(t / 3))} a month</span></span>`
        : html`<span>${m !== null ? "Paid monthly" : "Paid by the term"}</span>`}
      ${save ? html`<span class="pl-plan__save">Term saves ${formatRs(save)}</span>` : ""}
    </p>
  </div>`;
}

function planCard(x, i, M) {
  const p = x.p;
  const hi = !!p.highlighted;
  const feats = (Array.isArray(p.features) ? p.features : []).map((f) => String(f || "").trim()).filter(Boolean);
  const href = `#/enrol?plan=${encodeURIComponent(p.id || "")}`;
  return html`<article class="pl-plan${hi ? " pl-plan--hi on-ink" : ""}" aria-labelledby="pl-plan-${i}">
    <p class="pl-plan__meta">
      <span>Plan ${pad(i + 1)}</span>
      ${hi ? html`<span class="pl-plan__pick"><span class="pen-mark">Recommended${penCircle()}</span></span>` : ""}
    </p>
    <h3 class="pl-plan__name" id="pl-plan-${i}">${p.name || `Plan ${i + 1}`}</h3>
    ${priceBlock(x, i, M.billing)}
    ${p.description ? html`<p class="pl-plan__desc">${p.description}</p>` : html`<span></span>`}
    ${feats.length
      ? html`<ul class="pl-plan__feats" aria-label="Included">
          ${feats.map((f) => html`<li>${penTick({ cls: "pl-plan__tick" })}<span>${f}</span></li>`)}
        </ul>`
      : html`<span></span>`}
    <div class="pl-plan__cta">
      <a class="btn ${hi ? "btn--primary" : "btn--ghost"} btn--block" href="${href}" data-magnetic="0.1">
        <span>${p.ctaLabel || "Enrol"}</span>${arrow()}
      </a>
    </div>
  </article>`;
}

function fees(M) {
  const s = M.sec["pl-fees"];
  const n = M.plans.length;
  const cols = Math.min(Math.max(n, 1), 3);
  const rows = Math.ceil(n / cols) || 1;
  return html`<section class="section pl-fees" id="pl-fees" aria-labelledby="pl-fees-title">
    <div class="container">
      <div class="pl-fees__head">
        ${secLabel(s)}
        <h2 class="h2 pl-fees__title" id="pl-fees-title" data-split>${M.hasTerm ? html`Pay by the month, <em>or by the term.</em>` : html`Fees, <em>by the month.</em>`}</h2>
        ${billingSwitch(M)}
      </div>
      ${n
        ? html`<div class="pl-plans" data-n="${n}" style="--cols:${cols};--tracks:${rows * 6}" data-stagger="0.1">
            ${M.plans.map((x, i) => planCard(x, i, M))}
          </div>
          <div class="pl-fees__foot" data-reveal>
            <p>Plans are shown at the usual SC fee. Each course page lists its own monthly fee${M.hasTerm ? "; a term covers three months, paid at the start" : ""}.</p>
            <a class="link-arrow" href="#/courses"><span>Compare course fees</span>${icon("arrow-right", { size: 16 })}</a>
          </div>`
        : html`<div class="empty-state pl-empty" data-reveal>
            <p class="empty-state__mark">Fees</p>
            <p class="empty-state__title">This term’s fees are being updated.</p>
            <p class="empty-state__text">Each course page shows its monthly fee, or ask and we will send the current fees.</p>
            <a class="btn btn--primary" href="#/enrol" data-magnetic><span>Ask about fees</span>${arrow()}</a>
          </div>`}
    </div>
  </section>`;
}

/* ---- paying */

function copyBtn(value, name) {
  return html`<button class="pl-copy" type="button" data-copy="${value}" data-copy-name="${name}">
    <span class="pl-copy__icon" aria-hidden="true">${icon("copy", { size: 14 })}${icon("check", { size: 14 })}</span>
    <span class="pl-copy__label">Copy</span><span class="sr-only"> ${name}</span>
  </button>`;
}

function stamp(M) {
  const name = String(M.site.name || M.site.wordmark || "Tuition").toUpperCase();
  const ring = `${name} · FEES RECEIVED · `;
  return html`<svg class="pl-stamp" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
    <defs>
      <path id="pl-stamp-ring" d="M80 80m-58 0a58 58 0 1 1 116 0a58 58 0 1 1-116 0" />
      <filter id="pl-stamp-ink" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 2.05" result="holes" />
        <feComposite in="SourceGraphic" in2="holes" operator="in" />
      </filter>
    </defs>
    <g filter="url(#pl-stamp-ink)">
      <circle cx="80" cy="80" r="75" fill="none" stroke="currentColor" stroke-width="2.8" />
      <circle cx="80" cy="80" r="70" fill="none" stroke="currentColor" stroke-width="0.9" />
      <circle cx="80" cy="80" r="44" fill="none" stroke="currentColor" stroke-width="1.3" />
      <text class="pl-stamp__ring"><textPath href="#pl-stamp-ring" textLength="362" lengthAdjust="spacing">${ring}</textPath></text>
      <text class="pl-stamp__mid" x="80" y="78" text-anchor="middle">Thank</text>
      <text class="pl-stamp__mid" x="80" y="98" text-anchor="middle">you</text>
    </g>
  </svg>`;
}

function slip(M) {
  const site = M.site;
  const name = site.name || site.wordmark || "";
  const wm = site.wordmark || name.split(/\s+/)[0] || name;
  const rest = name.toLowerCase().startsWith(wm.toLowerCase()) ? name.slice(wm.length).trim() : "";
  const d = new Date();
  const printed = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const b = M.bank;
  return html`<figure class="pl-slip" data-pl-slip aria-labelledby="pl-slip-title">
    <div class="pl-slip__paper">
      <header class="pl-slip__head">
        <p class="pl-slip__brand"><span class="pl-slip__word">${wm}</span>${rest ? html`<span class="pl-slip__rest">${rest}</span>` : ""}</p>
        <p class="pl-slip__kind" id="pl-slip-title">Fee slip<span class="sr-only">: how to pay</span></p>
      </header>
      ${site.address ? html`<p class="pl-slip__addr">${site.address}</p>` : ""}
      <p class="pl-slip__date">Printed <time datetime="${iso}">${printed}</time></p>

      ${M.juice || b
        ? html`<div class="pl-slip__cut" aria-hidden="true"></div>
          <dl class="pl-slip__rows">
            ${M.juice
              ? html`<div class="pl-slip__row">
                  <dt>MCB Juice</dt>
                  <dd><span class="pl-slip__val" data-pl-val>${M.juice}</span>${copyBtn(M.juice, "Juice number")}</dd>
                </div>`
              : ""}
            ${b && b.account
              ? html`${b.bank ? html`<div class="pl-slip__row"><dt>Bank transfer</dt><dd><span class="pl-slip__val">${b.bank}</span></dd></div>` : ""}
                <div class="pl-slip__row">
                  <dt>Account no.</dt>
                  <dd><span class="pl-slip__val" data-pl-val>${b.account}</span>${copyBtn(b.account, "account number")}</dd>
                </div>
                ${b.name
                  ? html`<div class="pl-slip__row">
                      <dt>Account name</dt>
                      <dd><span class="pl-slip__val" data-pl-val>${b.name}</span>${copyBtn(b.name, "account name")}</dd>
                    </div>`
                  : ""}`
              : b
              ? html`<div class="pl-slip__row">
                  <dt>Bank transfer</dt>
                  <dd><span class="pl-slip__val" data-pl-val>${b.raw}</span>${copyBtn(b.raw, "bank details")}</dd>
                </div>`
              : ""}
          </dl>`
        : ""}

      ${M.plans.some((x) => x.m !== null || x.t !== null)
        ? html`<div class="pl-slip__cut" aria-hidden="true"></div>
          <table class="pl-slip__items">
            <caption class="sr-only">Plan fees</caption>
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col" class="pl-slip__per">${M.hasTerm ? html`<span class="pl-swap"><span class="pl-when pl-when--m">Rs / month</span><span class="pl-when pl-when--t">Rs / term</span></span>` : "Rs / month"}</th>
              </tr>
            </thead>
            <tbody>
              ${M.plans
                .filter((x) => x.m !== null || x.t !== null)
                .map((x) => {
                  const mm = x.m !== null ? x.m : x.t;
                  const cur = M.billing === "termly" && x.t !== null ? x.t : mm;
                  return html`<tr>
                    <th scope="row"><span class="pl-slip__item">${x.p.name}</span></th>
                    <td><span data-pl-amount data-m="${mm}" data-t="${x.t !== null ? x.t : ""}">${fmtNum(cur)}</span></td>
                  </tr>`;
                })}
            </tbody>
          </table>`
        : ""}

      <div class="pl-slip__cut" aria-hidden="true"></div>
      <div class="pl-slip__code" aria-hidden="true"></div>
      <p class="pl-slip__thanks" aria-hidden="true">Keep this slip</p>
    </div>
    ${stamp(M)}
  </figure>`;
}

function paying(M) {
  if (!M.hasPay) return "";
  const s = M.sec["pl-pay"];
  const ways = [M.juice && "MCB Juice", M.bank && "bank transfer"].filter(Boolean);
  const pct = Math.round(M.maxPct);
  const steps = [
    M.hasTerm
      ? { t: "Choose monthly or termly", d: pct >= 1 ? `A term covers three months and costs about ${pct}% less.` : "A term covers three months." }
      : { t: "Pay at the start of the month", d: "Each course page shows its monthly fee." },
    ways.length && { t: `Send it by ${ways.join(" or ")}`, d: "Every number on the slip has a copy button, so nothing is mistyped." },
    M.note && { t: "Add the reference", d: M.note },
  ].filter(Boolean);
  return html`<section class="section section--ink pl-pay" id="pl-pay" aria-labelledby="pl-pay-title">
    <div class="container pl-pay__grid">
      <div class="pl-pay__text">
        ${secLabel(s)}
        <h2 class="h2 pl-pay__title" id="pl-pay-title" data-split>${ways.length === 2
          ? html`Two ways to pay, <em>${M.note ? "one reference." : "same fee."}</em>`
          : html`How to <em>pay.</em>`}</h2>
        <ol class="pl-steps" data-stagger="0.1">
          ${steps.map(
            (st, i) => html`<li class="pl-steps__item">
              <span class="pl-steps__n">${pad(i + 1)}</span>
              <span class="pl-steps__body"><span class="pl-steps__t">${st.t}</span><span class="pl-steps__d">${st.d}</span></span>
            </li>`
          )}
        </ol>
      </div>
      <div class="pl-pay__slip">${slip(M)}</div>
    </div>
  </section>`;
}

/* ---- timetable */

// The short names students write on their own timetables; used only when a lane is too narrow.
const SHORT = [
  [/\bAdditional Mathematics\b/gi, "Add Maths"],
  [/\bMathematics\b/gi, "Maths"],
  [/\bComputer Science\b/gi, "Comp Sci"],
  [/\bEnglish Language\b/gi, "English"],
  [/\bGeneral Paper\b/gi, "GP"],
  [/\bEconomics\b/gi, "Econ"],
  [/\bAccounting\b/gi, "Accts"],
  [/\bChemistry\b/gi, "Chem"],
  [/\bBiology\b/gi, "Bio"],
  [/\bPhysics\b/gi, "Phys"],
];
const shortTitle = (t) => SHORT.reduce((acc, [re, to]) => acc.replace(re, to), String(t || ""));

function sessionBlock(s, M) {
  const c = s.course;
  const t = (s.a - M.tt.lo) / (M.tt.hi - M.tt.lo);
  const h = (s.b - s.a) / (M.tt.hi - M.tt.lo);
  const out = M.level && s.level.id !== M.level;
  const code = String(c.code || "").trim();
  return html`<li class="pl-blk pl-lv-${s.level.rank}${out ? " is-out" : ""}" style="--t:${t.toFixed(5)};--h:${h.toFixed(5)};--l:${(s.lane / s.lanes).toFixed(4)};--w:${(1 / s.lanes).toFixed(4)}"
      data-pl-session data-course="${c.id}" data-level="${s.level.id}" data-a="${s.a}" data-b="${s.b}" data-day="${s.day}"${out ? " inert" : ""}>
    <a class="pl-blk__link" href="#/courses/${encodeURIComponent(c.id)}">
      <span class="pl-blk__top"><span class="pl-blk__code">${code || s.level.short}</span>${code ? html`<span class="pl-blk__lvl">${s.level.short}</span>` : ""}</span>
      <span class="pl-blk__title">${shortTitle(c.title) !== c.title
        ? html`<span class="pl-blk__full">${c.title}</span><span class="pl-blk__short" aria-hidden="true">${shortTitle(c.title)}</span>`
        : c.title}</span>
      <span class="pl-blk__time"><time>${s.start}</time><span class="pl-blk__end">–<time>${s.end}</time></span></span>
      ${s.room ? html`<span class="pl-blk__room">${s.room}</span>` : ""}
      <span class="pl-blk__live" aria-hidden="true">In session</span>
    </a>
  </li>`;
}

function grid(M) {
  const { days, lo, hi } = M.tt;
  const span = hi - lo;
  const hours = [];
  for (let m = lo; m <= hi; m += 60) hours.push(m);
  // Weekday mornings are school: shade them, up to the first weekday lesson.
  const weekdays = days.slice(0, 5);
  const firstWeekday = Math.min(...weekdays.flatMap((d) => d.list.map((s) => s.a)), Infinity);
  const bandEnd = Math.min(15 * 60, firstWeekday);
  const band = Number.isFinite(firstWeekday) && bandEnd - lo >= 120 ? (bandEnd - lo) / span : 0;
  const count = (d) => d.list.filter((s) => !M.level || s.level.id === M.level).length;
  return html`<div class="pl-grid" style="--days:${days.length};--hours:${span / 60}" data-pl-grid>
    <div class="pl-grid__head" aria-hidden="true">
      <span class="pl-grid__corner">${hhmm(lo).slice(0, 2)}–${hhmm(hi).slice(0, 2)}h</span>
      ${days.map(
        (d) => html`<p class="pl-grid__day" data-pl-day="${d.id}">
          <span class="pl-grid__dname">${d.name}</span>
          <span class="pl-grid__dmeta"><span class="pl-grid__today">Today</span><span data-pl-count="${d.id}" data-fmt="long">${count(d)} ${plural(count(d), "lesson")}</span></span>
        </p>`
      )}
    </div>
    <div class="pl-grid__body">
      <div class="pl-grid__axis" aria-hidden="true">
        ${hours.map((m) => html`<span class="pl-grid__hour" style="--t:${((m - lo) / span).toFixed(5)}">${hhmm(m)}</span>`)}
      </div>
      <div class="pl-grid__lines" aria-hidden="true">
        ${hours.map((m) => html`<span class="pl-grid__hr" style="--t:${((m - lo) / span).toFixed(5)}"></span>`)}
      </div>
      ${band
        ? html`<div class="pl-grid__band" style="--h:${band.toFixed(5)}" aria-hidden="true">
            <p class="pl-grid__band-label"><span>School hours</span><span>Weekday lessons start at ${hhmm(firstWeekday)}</span></p>
          </div>`
        : ""}
      ${days.map(
        (d, i) => html`<div class="pl-grid__col" style="grid-column:${i + 2}" data-pl-day="${d.id}">
          <h3 class="sr-only" id="pl-col-${d.id}">${d.name}</h3>
          ${d.list.length
            ? html`<ul class="pl-grid__list" aria-labelledby="pl-col-${d.id}">${d.list.map((s) => sessionBlock(s, M))}</ul>`
            : html`<p class="sr-only">No lessons</p>`}
        </div>`
      )}
      <div class="pl-grid__now" data-pl-now hidden aria-hidden="true"><span class="pl-grid__now-t"></span></div>
    </div>
  </div>`;
}

function dayLists(M) {
  const { days } = M.tt;
  const sel = (days.find((d) => d.list.length) || days[0] || {}).id;
  return html`<div class="pl-days" data-pl-days style="--n:${days.length};--i:${Math.max(0, days.findIndex((d) => d.id === sel))}">
    <div class="pl-tabs" role="tablist" aria-label="Day of the week">
      <span class="pl-tabs__thumb" aria-hidden="true"></span>
      ${days.map((d) => {
        const n = d.list.filter((s) => !M.level || s.level.id === M.level).length;
        const on = d.id === sel;
        return html`<button class="pl-tab" type="button" role="tab" id="pl-tab-${d.id}" aria-controls="pl-panel-${d.id}" aria-selected="${on ? "true" : "false"}" tabindex="${on ? "0" : "-1"}" data-pl-tab="${d.id}" data-pl-day="${d.id}">
          <span class="pl-tab__d">${d.short}</span>
          <span class="pl-tab__n" data-pl-count="${d.id}">${n}</span><span class="sr-only"> lessons</span>
        </button>`;
      })}
    </div>
    ${days.map(
      (d) => html`<div class="pl-panel" role="tabpanel" id="pl-panel-${d.id}" aria-labelledby="pl-tab-${d.id}" data-pl-panel="${d.id}" tabindex="0"${d.id === sel ? "" : " hidden"}>
        <p class="pl-panel__h"><span>${d.name}</span><span class="pl-panel__today" data-pl-day="${d.id}">Today</span></p>
        ${d.list.length
          ? html`<ol class="pl-rows">
              ${d.list.map((s) => {
                const c = s.course;
                const code = String(c.code || "").trim();
                const out = M.level && s.level.id !== M.level;
                return html`<li class="pl-row pl-lv-${s.level.rank}" data-pl-row data-level="${s.level.id}" data-course="${c.id}" data-a="${s.a}" data-b="${s.b}" data-day="${s.day}"${out ? " hidden" : ""}>
                  <a class="pl-row__link" href="#/courses/${encodeURIComponent(c.id)}">
                    <span class="pl-row__time"><time>${s.start}</time><span class="pl-row__end">to <time>${s.end}</time></span></span>
                    <span class="pl-row__main">
                      <span class="pl-row__meta"><span class="pl-key" aria-hidden="true"></span>${code ? html`<span>${code}</span><span class="pl-row__dot" aria-hidden="true">·</span>` : ""}<span>${s.level.short}</span><span class="pl-row__live">In session</span></span>
                      <span class="pl-row__title">${c.title}</span>
                      ${s.room ? html`<span class="pl-row__room">${s.room}</span>` : ""}
                    </span>
                    <span class="pl-row__go" aria-hidden="true">${icon("arrow-right", { size: 18 })}</span>
                  </a>
                </li>`;
              })}
            </ol>`
          : ""}
        <p class="pl-panel__empty" data-pl-empty="${d.id}"${d.list.some((s) => !M.level || s.level.id === M.level) ? " hidden" : ""}>${d.list.length
          ? "No lessons at this level on this day."
          : "No lessons on this day."}</p>
      </div>`
    )}
  </div>`;
}

function timetable(M) {
  const s = M.sec["pl-timetable"];
  const { sessions, days, levels } = M.tt;
  const active = days.filter((d) => d.list.length);
  const range = active.length > 1 ? `${active[0].name} to ${active[active.length - 1].name}` : active.length ? active[0].name : "";
  const countFor = (id) => sessions.filter((x) => !id || x.level.id === id).length;
  return html`<section class="section pl-tt" id="pl-timetable" aria-labelledby="pl-tt-title" data-level="${M.level}">
    <div class="container">
      <div class="pl-tt__head">
        ${secLabel(s)}
        <h2 class="h2 pl-tt__title" id="pl-tt-title" data-split>The week, <em>hour by hour.</em></h2>
        ${sessions.length
          ? html`<p class="pl-tt__intro" data-reveal>${cap(word(sessions.length))} lessons a week${range ? `, ${range}` : ""}. Each group meets at the same time every week; select a lesson to open its course.</p>`
          : ""}
      </div>
      ${sessions.length
        ? html`<div class="pl-tt__bar" data-reveal>
            <div class="pl-filter" role="group" aria-label="Show lessons for">
              <span class="pl-filter__k" aria-hidden="true">Show</span>
              <button class="chip pl-chip" type="button" data-pl-level="" aria-pressed="${M.level ? "false" : "true"}">All levels<span class="chip__count">${countFor("")}</span></button>
              ${levels.map(
                (l) => html`<button class="chip pl-chip pl-lv-${l.rank}" type="button" data-pl-level="${l.id}" aria-pressed="${M.level === l.id ? "true" : "false"}">
                  <span class="pl-key" aria-hidden="true"></span>${l.name}<span class="chip__count">${countFor(l.id)}</span>
                </button>`
              )}
            </div>
            <p class="pl-tt__key" aria-hidden="true">
              ${levels.map((l) => html`<span class="pl-lv-${l.rank}"><span class="pl-key"></span>${l.short}</span>`)}
            </p>
          </div>
          <div class="pl-tt__desk" data-reveal="fade">${grid(M)}</div>
          <p class="pl-tt__readout" data-pl-readout aria-hidden="true"><span class="pl-ro__hint">Point at a lesson to see the rest of its week.</span></p>
          <div class="pl-tt__mob">${dayLists(M)}</div>`
        : html`<div class="empty-state pl-empty" data-reveal>
            <p class="empty-state__mark">Timetable</p>
            <p class="empty-state__title">Next term’s timetable is being written.</p>
            <p class="empty-state__text">Ask and we will send the days and times for the groups you are interested in.</p>
            <a class="btn btn--primary" href="#/enrol" data-magnetic><span>Ask about times</span>${arrow()}</a>
          </div>`}
    </div>
  </section>`;
}

/* ---- questions + close */

function questions(M) {
  if (!M.faqs.length) return "";
  const s = M.sec["pl-faq"];
  const wa = whatsappLink(M.site.whatsapp, `Hello ${M.site.name || ""}, I have a question about fees and times.`.replace(/\s+,/, ","));
  return html`<section class="section section--paper-2 pl-faq" id="pl-faq" aria-labelledby="pl-faq-title">
    <div class="container pl-faq__grid">
      <div class="pl-faq__side">
        ${secLabel(s)}
        <h2 class="h2 pl-faq__title" id="pl-faq-title" data-split>Questions parents <em>ask first.</em></h2>
        <p class="pl-faq__ask" data-reveal>
          <span>Something else?</span>
          ${wa
            ? html`<a class="link-arrow" href="${wa}" target="_blank" rel="noopener"><span>Ask on WhatsApp</span><span class="sr-only"> (opens WhatsApp)</span>${icon("arrow-up-right", { size: 16 })}</a>`
            : html`<a class="link-arrow" href="#/enrol"><span>Send a question</span>${icon("arrow-right", { size: 16 })}</a>`}
        </p>
      </div>
      <div class="accordion pl-faq__list" data-stagger="0.06">
        ${M.faqs.map(
          (f) => html`<details>
            <summary>${f.q}</summary>
            <div class="accordion__body">${paragraphs(f.a)}</div>
          </details>`
        )}
      </div>
    </div>
  </section>`;
}

// A tear-off reply slip, as at the bottom of a school letter. Each plan box is a link to enrol.
const replyTick = () => raw(String(penTick({ cls: "pl-reply__tick" })).replace(/ data-draw/g, ""));

function closing(M) {
  const site = M.site;
  const tight = visible(M.content.courses)
    .filter((c) => {
      const l = num(c.seatsLeft);
      return l !== null && l > 0 && l <= 3;
    })
    .sort((a, b) => num(a.seatsLeft) - num(b.seatsLeft));
  const shown = tight.slice(0, 3);
  const opts = M.plans.filter((x) => x.p && x.p.id);
  return html`<section class="section pl-end" aria-labelledby="pl-end-title">
    <p class="pl-end__cut" aria-hidden="true"><span>Please detach and return</span></p>
    <div class="container">
      <div class="pl-reply">
        <p class="pl-reply__head" aria-hidden="true"><span>Reply slip</span><span>${site.name || ""}</span></p>
        <div class="pl-reply__grid">
          <h2 class="h1 pl-end__title" id="pl-end-title" data-split>Choose the plan,<br /><em>then the groups.</em></h2>
          ${shown.length
            ? html`<p class="pl-end__note" data-reveal>
                <span class="pl-end__k">Nearly full</span>
                ${cap(word(tight.length))} ${plural(tight.length, "group has", "groups have")} three seats or fewer left, including
                ${shown.map(
                  (c, i) => html`${i ? (i === shown.length - 1 ? " and " : ", ") : ""}<a class="link" href="#/courses/${encodeURIComponent(c.id)}">${c.code ? `${c.code} ` : ""}${c.title}</a>`
                )}.
              </p>`
            : html`<p class="pl-end__note" data-reveal>Tell us the level and subjects. We reply with the days, times and fee for each group.</p>`}
        </div>
        ${opts.length
          ? html`<div class="pl-reply__row" data-reveal>
              <p class="pl-reply__label" id="pl-reply-label">Tick one</p>
              <ul class="pl-reply__opts" aria-labelledby="pl-reply-label">
                ${opts.map(
                  (x) => html`<li>
                    <a class="pl-reply__opt" href="#/enrol?plan=${encodeURIComponent(x.p.id)}">
                      <span class="pl-reply__box" aria-hidden="true">${replyTick()}</span>
                      <span class="pl-reply__name">${x.p.name || x.p.id}</span>
                      ${x.m !== null ? html`<span class="pl-reply__fee">${formatRs(x.m)}<span class="sr-only"> a month</span></span>` : ""}
                      <span class="sr-only">: enrol with this plan</span>
                    </a>
                  </li>`
                )}
              </ul>
            </div>`
          : ""}
        <div class="pl-reply__foot" data-reveal>
          <div class="pl-end__actions">
            <a class="btn btn--primary btn--lg" href="#/enrol" data-magnetic><span>Reserve a place</span>${arrow(18)}</a>
            <a class="btn btn--ghost btn--lg" href="#/quiz" data-magnetic><span>Try the placement check</span>${arrow(18)}</a>
          </div>
          <p class="pl-reply__sign" aria-hidden="true"><span class="pl-reply__line"></span><span>Signed, parent or guardian</span></p>
        </div>
      </div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ behaviour helpers */

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}

function selectText(el) {
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } catch {}
}

function mauritiusNow() {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Indian/Mauritius",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
    return { day: get("weekday").toLowerCase().slice(0, 3), min: Number(get("hour")) * 60 + Number(get("minute")) };
  } catch {
    const d = new Date();
    return { day: DAYS[(d.getDay() + 6) % 7].id, min: d.getHours() * 60 + d.getMinutes() };
  }
}

let live = null; // the mounted instance, for onQuery

/* ------------------------------------------------------------------ view */

export default {
  id: "plans",
  title: "Plans & timetable",
  scene: "stack",

  render(ctx) {
    const M = model(ctx);
    return html`<section class="view view--plans" data-view="plans" data-billing="${M.billing}">
      ${hero(M)}
      ${fees(M)}
      ${paying(M)}
      ${timetable(M)}
      ${questions(M)}
      ${closing(M)}
    </section>`;
  },

  mount(root, ctx) {
    const gsap = gsapRef();
    const ST = stRef();
    const motion = ctx.motion || {};
    const reduced = !!motion.reduced || !gsap;
    const ease = (motion.ease && motion.ease.out) || "power3.out";
    const easeInOut = (motion.ease && motion.ease.inOut) || "power3.inOut";
    const M = model(ctx);
    const tt = M.tt;
    const $ = (s, r = root) => r.querySelector(s);
    const $$ = (s, r = root) => [...r.querySelectorAll(s)];
    const offs = [];
    const timers = new Set();
    const on = (el, ev, fn, opts) => {
      if (!el) return;
      el.addEventListener(ev, fn, opts);
      offs.push(() => el.removeEventListener(ev, fn, opts));
    };
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    };
    const state = { billing: M.billing, level: M.level };
    let hl = ""; // course id currently highlighted in the grid
    const sync = () => ctx.setQuery({ billing: state.billing === "termly" ? "termly" : null, level: state.level || null });

    /* ---- billing ------------------------------------------------------ */
    const amounts = $$("[data-pl-amount]").map((el) => ({
      el,
      m: num(el.dataset.m),
      t: num(el.dataset.t),
      o: { v: num(String(el.textContent).replace(/[^\d.]/g, "")) || 0 },
    }));
    const target = (a) => (state.billing === "termly" && a.t !== null ? a.t : a.m);
    const write = (a) => {
      a.el.textContent = fmtNum(a.o.v);
    };
    const radios = $$('input[name="pl-billing"]');

    function setBilling(mode, { animate = true, user = false } = {}) {
      const next = M.hasTerm && mode === "termly" ? "termly" : "monthly";
      const changed = next !== state.billing;
      state.billing = next;
      root.dataset.billing = next;
      radios.forEach((r) => {
        r.checked = r.value === next;
      });
      amounts.forEach((a) => {
        const to = target(a);
        if (to === null) return;
        if (!animate || reduced) {
          if (gsap) gsap.killTweensOf(a.o);
          a.o.v = to;
          write(a);
          return;
        }
        gsap.to(a.o, { v: to, duration: 0.95, ease, overwrite: true, onUpdate: () => write(a) });
      });
      if (user) sync();
      if (user && changed) ctx.announce(next === "termly" ? "Showing fees per term of three months" : "Showing monthly fees");
    }
    radios.forEach((r) => on(r, "change", () => r.checked && setBilling(r.value, { user: true })));

    /* ---- copy buttons ------------------------------------------------- */
    $$("[data-copy]").forEach((btn) =>
      on(btn, "click", async () => {
        const ok = await copyText(btn.dataset.copy || "");
        const label = $(".pl-copy__label", btn);
        const name = btn.dataset.copyName || "Details";
        btn.classList.toggle("is-done", ok);
        btn.classList.toggle("is-fail", !ok);
        if (label) label.textContent = ok ? "Copied" : "Press Ctrl+C";
        if (!ok) {
          const v = btn.parentElement && $("[data-pl-val]", btn.parentElement);
          if (v) selectText(v);
        }
        ctx.announce(ok ? `${cap(name)} copied` : `Couldn’t copy automatically. The ${name} is selected; press Control C to copy it.`);
        clearTimeout(btn.__plT);
        btn.__plT = later(() => {
          btn.classList.remove("is-done", "is-fail");
          if (label) label.textContent = "Copy";
        }, 2400);
      })
    );

    /* ---- timetable: level filter ------------------------------------- */
    const ttSec = $(".pl-tt");
    const chips = $$("[data-pl-level]");
    const blocks = $$("[data-pl-session]");
    const rows = $$("[data-pl-row]");

    function setLevel(id, { user = false } = {}) {
      const next = tt.levels.some((l) => l.id === id) ? id : "";
      const changed = next !== state.level;
      state.level = next;
      if (ttSec) ttSec.dataset.level = next;
      chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.plLevel === next)));
      let i = 0;
      blocks.forEach((b) => {
        const out = !!next && b.dataset.level !== next;
        b.classList.toggle("is-out", out);
        b.toggleAttribute("inert", out);
        if (!out) b.style.setProperty("--i", String(i++));
      });
      rows.forEach((r) => {
        r.hidden = !!next && r.dataset.level !== next;
      });
      tt.days.forEach((d) => {
        const n = d.list.filter((s) => !next || s.level.id === next).length;
        $$(`[data-pl-count="${d.id}"]`).forEach((el) => {
          el.textContent = el.dataset.fmt === "long" ? `${n} ${plural(n, "lesson")}` : String(n);
        });
        const empty = $(`[data-pl-empty="${d.id}"]`);
        if (empty) empty.hidden = n > 0;
      });
      if (hl) highlight("");
      if (user) {
        sync();
        if (changed) {
          const n = tt.sessions.filter((s) => !next || s.level.id === next).length;
          const lv = tt.levels.find((l) => l.id === next);
          ctx.announce(next ? `${n} ${plural(n, "lesson")} for ${lv ? lv.name : next} shown` : `All ${n} lessons shown`);
        }
      }
    }
    chips.forEach((c) => on(c, "click", () => setLevel(c.dataset.plLevel || "", { user: true })));

    /* ---- timetable: linked hover / focus + readout -------------------- */
    const gridEl = $("[data-pl-grid]");
    const readout = $("[data-pl-readout]");
    const hint = readout ? readout.innerHTML : "";

    function readoutFor(id) {
      const c = byId(M.content.courses, id);
      if (!c) return "";
      const list = tt.sessions.filter((s) => s.course.id === id);
      const tutor = tutorFor(M.content, c);
      const left = num(c.seatsLeft);
      const lvl = list[0] ? list[0].level.name : levelName(M.content, c.level);
      const rooms = [...new Set(list.map((s) => s.room).filter(Boolean))];
      const bits = [
        lvl,
        tutor && tutor.name,
        rooms.length === 1 ? rooms[0] : "",
        num(c.fee) !== null ? `${formatRs(c.fee)} a month` : "",
        left !== null ? (left > 0 ? `${left} ${plural(left, "seat")} left` : "Waiting list") : "",
      ].filter(Boolean);
      return html`<span class="pl-ro__code">${c.code || lvl}</span>
        <span class="pl-ro__title">${c.title}</span>
        <span class="pl-ro__slots">${list.map((s) => html`<span>${DAYS.find((d) => d.id === s.day)?.short || s.day} ${s.start}</span>`)}</span>
        <span class="pl-ro__meta">${bits.join(" · ")}</span>
        <span class="pl-ro__go">Open course ${icon("arrow-right", { size: 14 })}</span>`;
    }

    function highlight(id) {
      if (id === hl) return;
      hl = id;
      if (!gridEl) return;
      gridEl.classList.toggle("has-hl", !!id);
      blocks.forEach((b) => b.classList.toggle("is-hl", !!id && b.dataset.course === id));
      if (readout) {
        if (id) put(readout, readoutFor(id));
        else readout.innerHTML = hint;
        readout.classList.toggle("is-on", !!id);
        readout.classList.remove("is-swap");
        void readout.offsetWidth;
        readout.classList.add("is-swap");
      }
    }
    if (gridEl) {
      on(gridEl, "pointerover", (e) => {
        if (e.pointerType && e.pointerType !== "mouse") return;
        const b = e.target.closest("[data-pl-session]");
        if (b && !b.classList.contains("is-out")) highlight(b.dataset.course);
      });
      on(gridEl, "pointerleave", () => {
        if (!gridEl.contains(document.activeElement)) highlight("");
      });
      on(gridEl, "focusin", (e) => {
        const b = e.target.closest("[data-pl-session]");
        highlight(b ? b.dataset.course : "");
      });
      on(gridEl, "focusout", (e) => {
        if (!gridEl.contains(e.relatedTarget)) highlight("");
      });
    }

    /* ---- timetable: day tabs (small screens) ------------------------- */
    const daysEl = $("[data-pl-days]");
    const tabs = $$("[data-pl-tab]");
    const panels = $$("[data-pl-panel]");
    function selectDay(id, { focus = false, animate = true } = {}) {
      const idx = Math.max(0, tabs.findIndex((t) => t.dataset.plTab === id));
      tabs.forEach((t, i) => {
        const sel = i === idx;
        t.setAttribute("aria-selected", String(sel));
        t.tabIndex = sel ? 0 : -1;
        if (sel && focus) t.focus();
      });
      if (daysEl) daysEl.style.setProperty("--i", String(idx));
      panels.forEach((p) => {
        const sel = p.dataset.plPanel === (tabs[idx] && tabs[idx].dataset.plTab);
        const was = !p.hidden;
        p.hidden = !sel;
        if (sel && !was && animate && !reduced) {
          const items = $$(".pl-row:not([hidden]), .pl-panel__empty:not([hidden])", p);
          gsap.fromTo(items, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.55, ease, stagger: 0.045, overwrite: true, clearProps: "opacity,visibility,transform" });
        }
      });
    }
    tabs.forEach((t, i) => {
      on(t, "click", () => selectDay(t.dataset.plTab));
      on(t, "keydown", (e) => {
        let j = -1;
        if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = tabs.length - 1;
        if (j < 0) return;
        e.preventDefault();
        selectDay(tabs[j].dataset.plTab, { focus: true });
      });
    });

    /* ---- timetable: today + "now" line (Mauritius time) -------------- */
    const nowLine = $("[data-pl-now]");
    let firstTick = true;
    function tick() {
      const now = mauritiusNow();
      $$("[data-pl-day]").forEach((el) => el.classList.toggle("is-today", el.dataset.plDay === now.day));
      const col = gridEl && $(`.pl-grid__col[data-pl-day="${now.day}"]`, gridEl);
      if (nowLine) {
        if (col && tt.hi > tt.lo && now.min >= tt.lo && now.min <= tt.hi) {
          if (nowLine.parentElement !== col) col.appendChild(nowLine);
          nowLine.style.setProperty("--t", ((now.min - tt.lo) / (tt.hi - tt.lo)).toFixed(5));
          const label = $(".pl-grid__now-t", nowLine);
          if (label) label.textContent = hhmm(now.min);
          nowLine.hidden = false;
        } else nowLine.hidden = true;
      }
      [...blocks, ...rows].forEach((el) => {
        const a = Number(el.dataset.a);
        const b = Number(el.dataset.b);
        el.classList.toggle("is-live", el.dataset.day === now.day && now.min >= a && now.min < b);
      });
      if (firstTick) {
        firstTick = false;
        const today = tt.days.find((d) => d.id === now.day && d.list.length);
        if (today) selectDay(today.id, { animate: false });
      }
    }
    tick();
    const iv = setInterval(tick, 30000);

    /* ---- questions: JS height animation where ::details-content can't animate */
    let dcSupported = false;
    try {
      dcSupported = !!(window.CSS && CSS.supports && CSS.supports("selector(::details-content)"));
    } catch {}
    if (!dcSupported && !reduced) {
      $$(".pl-faq details").forEach((d) => {
        const sum = $("summary", d);
        const body = $(".accordion__body", d);
        if (!sum || !body) return;
        on(sum, "click", (e) => {
          e.preventDefault();
          if (d.__plAnim) d.__plAnim.kill();
          body.style.overflow = "hidden";
          if (!d.open || d.classList.contains("is-closing")) {
            d.classList.remove("is-closing");
            d.open = true;
            d.__plAnim = gsap.fromTo(body, { height: d.__plH || 0 }, { height: "auto", duration: 0.6, ease, clearProps: "height,overflow" });
          } else {
            d.classList.add("is-closing");
            d.__plAnim = gsap.to(body, {
              height: 0,
              duration: 0.45,
              ease: easeInOut,
              onUpdate() {
                d.__plH = body.offsetHeight;
              },
              onComplete() {
                d.open = false;
                d.__plH = 0;
                d.classList.remove("is-closing");
                gsap.set(body, { clearProps: "height,overflow" });
              },
            });
          }
        });
      });
    }

    /* ---- scroll choreography (inside the shell's gsap.context) -------- */
    if (!reduced && ST) {
      // Prices count up the first time they come into view.
      amounts.forEach((a) => {
        const to = target(a);
        if (to === null) return;
        a.o.v = 0;
        write(a);
        ST.create({
          trigger: a.el,
          start: "top 92%",
          once: true,
          onEnter: () => gsap.to(a.o, { v: target(a), duration: 1.5, ease: "power3.out", overwrite: true, onUpdate: () => write(a) }),
        });
      });

      // The fee slip slides out of the printer; the stamp lands.
      const slipEl = $("[data-pl-slip]");
      if (slipEl) {
        const paper = $(".pl-slip__paper", slipEl);
        const st = $(".pl-stamp", slipEl);
        gsap.set(paper, { clipPath: "inset(0% 0% 100% 0%)", yPercent: -6 });
        if (st) gsap.set(st, { autoAlpha: 0, scale: 1.9 });
        ST.create({
          trigger: slipEl,
          start: "top 78%",
          once: true,
          onEnter: () => {
            const tl = gsap.timeline();
            tl.to(paper, { clipPath: "inset(0% 0% 0% 0%)", yPercent: 0, duration: 1.5, ease: easeInOut, clearProps: "clipPath,transform" });
            if (st) {
              tl.to(st, { autoAlpha: 0.9, scale: 1, duration: 0.32, ease: "power4.in" }, 1.25);
              tl.fromTo(paper, { y: 0 }, { y: 3, duration: 0.07, yoyo: true, repeat: 1, ease: "power1.out", clearProps: "transform" }, 1.57);
            }
          },
        });
      }

      // Timetable: hour lines rule across, then the week fills in, day by day.
      if (gridEl) {
        const lines = $$(".pl-grid__hr", gridEl);
        const inner = $$(".pl-blk__link", gridEl);
        const band = $(".pl-grid__band", gridEl);
        gsap.set(lines, { scaleX: 0, transformOrigin: "0% 50%" });
        gsap.set(inner, { autoAlpha: 0, y: 16 });
        if (band) gsap.set(band, { autoAlpha: 0 });
        ST.create({
          trigger: gridEl,
          start: "top 72%",
          once: true,
          onEnter: () => {
            gsap.to(lines, { scaleX: 1, duration: 1.1, ease: easeInOut, stagger: 0.035, clearProps: "transform" });
            if (band) gsap.to(band, { autoAlpha: 1, duration: 1.2, ease: "power2.out", delay: 0.3 });
            gsap.to(inner, { autoAlpha: 1, y: 0, duration: 0.8, ease, stagger: 0.028, delay: 0.25, clearProps: "opacity,visibility,transform" });
          },
        });
      }
    }

    live = {
      apply(query) {
        setBilling(billingFrom(query, M.hasTerm), { animate: true });
        setLevel(levelFrom(query, tt));
      },
    };

    return () => {
      offs.forEach((fn) => fn());
      clearInterval(iv);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      if (gsap) {
        amounts.forEach((a) => gsap.killTweensOf(a.o));
        $$(".pl-panel *").forEach((el) => gsap.killTweensOf(el));
        $$(".pl-faq .accordion__body").forEach((el) => gsap.killTweensOf(el));
      }
      live = null;
    };
  },

  onQuery(query, ctx) {
    if (live) live.apply(query || (ctx && ctx.query));
  },
};
