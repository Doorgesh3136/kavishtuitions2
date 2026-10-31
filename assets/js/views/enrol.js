// Enrol (#/enrol): the enquiry form, laid out like an exam answer booklet — numbered questions in
// the left margin, sub-parts (a)/(b), and an examiner's margin on the right that ticks each
// question off in red pen as it is answered. Prefills from the query (?course= ?plan= ?resource=
// ?quiz= ?level=), validates inline, saves with store.submitEnquiry() and then hands the enquiry to
// WhatsApp or email. A contact card and a payment note sit alongside.

import { html, raw, icon, penTick } from "../ui.js";
import { visible, byId, levelName, levelExam, formatRs, safeUrl, whatsappLink, mailtoLink, enquiryMessage, submitEnquiry, updateEnquiry } from "../store.js";

const gsapRef = () => window.gsap || null;
const flipRef = () => window.Flip || null;

const SNAPSHOT_MS = 2500;
const str = (v) => (v === null || v === undefined ? "" : String(v));
const pad = (n) => String(n).padStart(2, "0");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const examShort = (content, id) => str(levelExam(content, id)).split("·")[0].trim();
const MODES = [
  { value: "online", label: "Online", note: "Live on Zoom or Google Meet, from home" },
  { value: "in-person", label: "In person", note: "In the room, with the group" },
  { value: "", label: "Either", note: "Whichever group fits the timetable" },
];

/* ------------------------------------------------------------------ helpers */

function phoneDigits(v) {
  return str(v).replace(/[\s().\-/]/g, "");
}

/** Mauritian numbers: 8-digit mobiles starting with 5, 7-digit landlines; +230 optional. Other countries: + and 8–15 digits. */
function phoneProblem(v) {
  const raw0 = phoneDigits(v);
  if (!raw0) return "";
  if (!/^\+?\d+$/.test(raw0)) return "Use digits only, with an optional + at the start.";
  let d = raw0.replace(/^\+/, "");
  const intl = raw0.startsWith("+") || raw0.startsWith("00");
  if (raw0.startsWith("00")) d = d.slice(2);
  if (d.startsWith("230") && (d.length === 10 || d.length === 11)) d = d.slice(3);
  else if (intl) return d.length >= 8 && d.length <= 15 ? "" : "That number looks too short or too long.";
  if (d.length === 8) return d.startsWith("5") ? "" : "Mauritian mobiles start with 5, like 5712 3456.";
  if (d.length === 7) return "";
  return "Mauritian numbers have 8 digits for a mobile (5712 3456) or 7 for a landline.";
}

const emailOk = (v) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(str(v).trim());

function prettyWhatsapp(digits) {
  const d = str(digits).replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("230") && d.length === 11) return `+230 ${d.slice(3, 7)} ${d.slice(7)}`;
  return `+${d}`;
}

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** How to greet the person who wrote the form: "Priya Ramdin" → "Priya", "Mrs Anjali Devi" → "Mrs Devi",
    "A. Ramdin" → "A. Ramdin". A title or an initial on its own is never used as a first name. */
const HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|prof|mme|mlle|m|sir|madam)\.?$/i;
function greeting(name) {
  const parts = str(name).trim().split(/\s+/).filter(Boolean);
  let out = parts[0] || "";
  if (HONORIFIC.test(out)) out = parts.length > 1 ? `${out} ${parts[parts.length - 1]}` : "";
  else if (/^\p{L}\.?$/u.test(out) && parts.length > 1) out = parts.join(" ");
  out = out.replace(/\.+$/, "");
  // Typed all in lower case on a phone: "priya" → "Priya".
  return out === out.toLowerCase() ? out.replace(/(^|[\s-])(\p{L})/gu, (_, a, c) => a + c.toUpperCase()) : out;
}

function bandFor(content, pct) {
  const bands = (content.quiz && Array.isArray(content.quiz.results) ? content.quiz.results : [])
    .filter((r) => r && Number.isFinite(Number(r.min)) && Number.isFinite(Number(r.max)))
    .sort((a, b) => Number(a.min) - Number(b.min));
  return bands.find((b) => pct >= Number(b.min) && pct <= Number(b.max)) || null;
}

/* ------------------------------------------------------------------ model */

function model(content) {
  const site = content.site || {};
  const levels = (Array.isArray(content.levels) ? content.levels : []).filter((l) => l && l.id);
  const courses = visible(content.courses).filter((c) => c && c.id && str(c.title).trim());
  const groups = levels.map((l) => ({ id: l.id, name: str(l.name) || l.id, exam: str(l.exam), courses: courses.filter((c) => c.level === l.id) })).filter((g) => g.courses.length);
  const loose = courses.filter((c) => !levels.some((l) => l.id === c.level));
  if (loose.length) groups.push({ id: "", name: "Other courses", exam: "", courses: loose });
  const wa = whatsappLink(site.whatsapp);
  const phone = str(site.phone).trim();
  const email = str(site.email).trim();
  const nearlyFull = courses
    .filter((c) => c.seatsLeft !== "" && c.seatsLeft !== null && c.seatsLeft !== undefined && Number(c.seatsLeft) > 0 && Number(c.seatsLeft) <= 3)
    .sort((a, b) => Number(a.seatsLeft) - Number(b.seatsLeft))
    .slice(0, 4);
  return { content, site, levels, courses, groups, wa, phone, email, nearlyFull };
}

/** What the query asks us to fill in, plus a human summary of it. */
function prefillFrom(m, query) {
  const get = (k) => (query && typeof query.get === "function" ? str(query.get(k)).trim() : "");
  const getAll = (k) => (query && typeof query.getAll === "function" ? query.getAll(k) : []);
  const out = { level: "", courseIds: [], lines: [], notes: [], source: "enrol", meta: {} };
  getAll("course")
    .flatMap((v) => str(v).split(","))
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((id) => {
      const c = m.courses.find((x) => x.id === id);
      if (!c || out.courseIds.includes(c.id)) return;
      out.courseIds.push(c.id);
      out.notes.push({ k: "Course", v: `${c.code ? `${c.code} ` : ""}${c.title}`, sub: levelName(m.content, c.level) });
    });
  if (out.courseIds.length) {
    out.level = m.courses.find((c) => c.id === out.courseIds[0]).level || "";
    out.source = "course";
  }
  const lv = get("level");
  if (!out.level && m.levels.some((l) => l.id === lv)) out.level = lv;

  const plan = byId(visible(m.content.plans), get("plan"));
  if (plan) {
    out.notes.push({ k: "Plan", v: str(plan.name), sub: formatRs(plan.monthly) ? `${formatRs(plan.monthly)} a month` : "" });
    out.lines.push(`We'd like to ask about the ${str(plan.name)} plan.`);
    out.source = "plan";
    out.meta.planId = plan.id;
  }
  const res = byId(visible(m.content.resources), get("resource"));
  if (res) {
    out.notes.push({ k: "Resource", v: str(res.title), sub: res.level ? levelName(m.content, res.level) : "" });
    out.lines.push(`Please send me “${str(res.title)}”.`);
    if (!out.level && m.levels.some((l) => l.id === res.level)) out.level = res.level;
    out.source = "resource";
    out.meta.resourceId = res.id;
  }
  const q = get("quiz");
  if (/^\d{1,3}$/.test(q) && Number(q) <= 100) {
    const pct = Number(q);
    // A paper for one stage (?quizlevel=) is read against that stage, so say which paper it was. The
    // mixed paper's band names a level: quote it only when it agrees with the group asked about.
    const paperLevel = m.levels.some((l) => l.id === get("quizlevel")) ? get("quizlevel") : "";
    const band = paperLevel ? null : bandFor(m.content, pct);
    const title = band && str(band.title) && (!out.level || !band.recommend || band.recommend === out.level) ? str(band.title) : "";
    const paper = paperLevel ? `${levelName(m.content, paperLevel)} paper` : "";
    out.notes.push({ k: "Placement check", v: `${pct}%`, sub: paper || title });
    out.lines.push(`Placement check score: ${pct}%${paper ? ` on the ${paper}` : title ? ` (${title})` : ""}.`);
    out.source = "quiz";
    out.meta.quizScore = pct;
  }
  return out;
}

/* ------------------------------------------------------------------ saving a correction */

const ENQUIRY_KEYS = ["name", "studentName", "phone", "email", "level", "courseIds", "mode", "message"];
const sameEnquiry = (a, b) => ENQUIRY_KEYS.every((k) => JSON.stringify(a[k] ?? "") === JSON.stringify(b[k] ?? ""));

/**
 * "Change something" corrects the enquiry already saved: the record on this device is updated in
 * place (same reference), the form endpoint is told it is a correction, and the WhatsApp/email
 * hand-off carries the corrected text. Never throws for network problems.
 */
async function resubmit(content, prev, data) {
  const id = prev.res && prev.res.record && prev.res.record.id;
  const record = id ? updateEnquiry(id, { ...data, updatedAt: new Date().toISOString() }) : null;
  if (!record) return submitEnquiry(content, data); // removed meanwhile (e.g. from the admin inbox on this device)
  let remote = null;
  const endpoint = content?.site?.formEndpoint;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...data, _subject: `${prev.res.remote ? "Corrected enquiry" : "New enquiry"} — ${data.name || "website"}` }),
      });
      remote = res.ok;
    } catch {
      remote = false;
    }
  }
  const text = enquiryMessage(content, record);
  return {
    record,
    remote,
    whatsappUrl: whatsappLink(content?.site?.whatsapp, text),
    mailtoUrl: mailtoLink(content?.site?.email, `Enquiry — ${record.name}`, text),
  };
}

/* ------------------------------------------------------------------ markup */

function hero(m) {
  return html`<header class="view-hero en-hero">
    <div class="container en-hero__inner">
      <p class="eyebrow en-hero__eyebrow" data-intro><span class="eyebrow__num">07</span>Enrol</p>
      <h1 class="display en-hero__title" data-split="intro">Reserve a <em>place.</em></h1>
      <div class="en-hero__row">
        <p class="lead en-hero__lead" data-intro>Tell us who is joining and what they study. We reply with the right group, its timetable and a first lesson to try.</p>
        <div class="en-hero__actions" data-intro>
          <a class="btn btn--primary btn--lg" href="#enrol-form" data-enrol-start data-magnetic>
            <span>Fill in the form</span><span class="btn__icon">${icon("arrow-down", { size: 18 })}</span>
          </a>
          ${m.wa
            ? html`<a class="en-hero__wa" href="${m.wa}" target="_blank" rel="noopener">
                ${icon("whatsapp", { size: 20 })}<span>or message us on WhatsApp</span>
              </a>`
            : ""}
        </div>
      </div>
      ${m.nearlyFull.length
        ? html`<div class="en-seats" data-intro="fade">
            <p class="en-seats__k"><span class="en-seats__dot" aria-hidden="true"></span>Nearly full</p>
            <ul class="en-seats__list">
              ${m.nearlyFull.map((c) => {
                const n = Number(c.seatsLeft);
                return html`<li>
                  <a href="#/courses/${encodeURIComponent(c.id)}">
                    <span class="en-seats__code">${c.code || examShort(m.content, c.level)}</span>
                    <span class="en-seats__name">${c.title}</span>
                    <span class="en-seats__left">${n} of ${Number(c.seats) || "?"} left</span>
                  </a>
                </li>`;
              })}
            </ul>
          </div>`
        : ""}
    </div>
  </header>`;
}

function prefillNote(pre) {
  if (!pre.notes.length) return "";
  return html`<div class="en-prefill" role="note">
    <p class="en-prefill__k">Filled in for you</p>
    <ul class="en-prefill__list">
      ${pre.notes.map(
        (n) => html`<li><span class="en-prefill__label">${n.k}</span><span class="en-prefill__v">${n.v}</span>${n.sub ? html`<span class="en-prefill__sub">${n.sub}</span>` : ""}</li>`
      )}
    </ul>
    <button class="en-prefill__clear" type="button" data-action="clear-prefill">Clear</button>
  </div>`;
}

function chip(m, c, checked) {
  const left = Number(c.seatsLeft);
  const few = c.seatsLeft !== "" && c.seatsLeft !== null && c.seatsLeft !== undefined && Number.isFinite(left) && left > 0 && left <= 3;
  return html`<label class="en-chip" data-course="${c.id}">
    <input type="checkbox" name="courseIds" value="${c.id}" ${checked ? raw("checked") : ""} />
    <span class="en-chip__tick" aria-hidden="true">${icon("check", { size: 14 })}</span>
    ${c.code ? html`<span class="en-chip__code">${c.code}</span>` : ""}
    <span class="en-chip__name">${c.title}</span>
    ${few ? html`<span class="en-chip__few"><span class="sr-only">, </span>${left} left</span>` : ""}
  </label>`;
}

function courseGroups(m, pre) {
  if (!m.groups.length) return html`<p class="field__hint">The course list is being updated. Say what you are looking for in question 5.</p>`;
  return html`<div class="en-groups">
    ${m.groups.map(
      (g) => html`<div class="en-group" data-level="${g.id}" ${pre.level && g.id !== pre.level ? raw("hidden") : ""}>
        <p class="en-group__k">${g.name}${g.exam ? html`<span> · ${g.exam}</span>` : ""}</p>
        <div class="en-chips">${g.courses.map((c) => chip(m, c, pre.courseIds.includes(c.id)))}</div>
      </div>`
    )}
  </div>`;
}

function question(n, title, hint, body, { id = "" } = {}) {
  return html`<li class="en-q" data-q="${n}" ${id ? raw(`id="${id}"`) : ""}>
    <span class="en-q__n" aria-hidden="true">${n}</span>
    <fieldset class="en-q__body">
      <legend class="en-q__title"><span class="sr-only">Question ${n}: </span>${title}</legend>
      ${hint ? html`<p class="en-q__hint">${hint}</p>` : ""}
      ${body}
    </fieldset>
    <span class="en-q__mark" aria-hidden="true"></span>
  </li>`;
}

function field({ id, name, label, part, opt = false, hint = "", type = "text", attrs = "" }) {
  return html`<div class="field en-field" data-field="${name}">
    <label class="field__label" for="${id}"><span>${part ? html`<span class="en-part">(${part})</span>` : ""}${label}</span>${opt ? html`<span class="field__opt">optional</span>` : ""}</label>
    <input class="input" id="${id}" name="${name}" type="${type}" ${raw(attrs)} aria-describedby="${id}-hint ${id}-err" />
    ${hint ? html`<p class="field__hint" id="${id}-hint">${hint}</p>` : ""}
    <p class="field__error" id="${id}-err"></p>
  </div>`;
}

function formMarkup(m, pre) {
  const message = pre.lines.join("\n");
  return html`<form class="en-form" novalidate aria-labelledby="en-form-title">
    <div class="en-form__head">
      <p class="eyebrow">Enquiry form</p>
      <h2 class="h2 en-form__title" id="en-form-title" data-split>Five short <em>questions.</em></h2>
      <p class="en-form__intro">Only the first two are needed. It takes about two minutes, and nothing is sent until you choose WhatsApp or email at the end.</p>
    </div>
    ${prefillNote(pre)}
    <ol class="en-qs">
      ${question(
        1,
        "Who is the place for?",
        "",
        html`<div class="en-parts">
          ${field({ id: "en-name", name: "name", label: "Your name", part: "a", hint: "Parent, guardian, or the student.", attrs: 'autocomplete="name" required maxlength="80"' })}
          ${field({ id: "en-student", name: "studentName", label: "Student’s name", part: "b", opt: true, hint: "If it isn’t you.", attrs: 'autocomplete="off" maxlength="80"' })}
        </div>`,
        { id: "en-q1" }
      )}
      ${question(
        2,
        "How do we reach you?",
        "One of the two is enough. We usually reply on WhatsApp.",
        html`<div class="en-parts">
          ${field({ id: "en-phone", name: "phone", label: "Phone or WhatsApp", part: "a", type: "tel", hint: "Mobile: 5712 3456. Add +230 if you like.", attrs: 'autocomplete="tel" inputmode="tel" maxlength="24"' })}
          ${field({ id: "en-email", name: "email", label: "Email", part: "b", type: "email", hint: "For the timetable and receipts.", attrs: 'autocomplete="email" inputmode="email" maxlength="120" spellcheck="false"' })}
        </div>
        <p class="field__error en-q__err" id="en-contact-err"></p>`
      )}
      ${question(
        3,
        "What will they study?",
        "",
        html`<div class="field en-field en-field--level" data-field="level">
            <label class="field__label" for="en-level"><span><span class="en-part">(a)</span>Level</span><span class="field__opt">optional</span></label>
            <select class="select" id="en-level" name="level">
              <option value="">Not sure yet</option>
              ${m.levels.map((l) => html`<option value="${l.id}" ${pre.level === l.id ? raw("selected") : ""}>${l.name}${l.exam ? ` · ${l.exam}` : ""}</option>`)}
            </select>
          </div>
          <div class="field en-field en-field--courses" data-field="courseIds">
            <p class="field__label" id="en-courses-label"><span><span class="en-part">(b)</span>Courses</span><span class="field__opt" data-course-count>${pre.courseIds.length ? `${pre.courseIds.length} ticked` : "tick any"}</span></p>
            <div role="group" aria-labelledby="en-courses-label">${courseGroups(m, pre)}</div>
            <p class="field__hint">Not sure of the level? <a class="link" href="#/quiz">Take the placement check</a>.</p>
          </div>`
      )}
      ${question(
        4,
        "Online or in the room?",
        "",
        html`<div class="en-modes" role="radiogroup" aria-label="Preferred format">
          ${MODES.map(
            (md) => html`<label class="choice en-mode">
              <input type="radio" name="mode" value="${md.value}" />
              <span class="en-mode__txt"><span class="en-mode__label">${md.label}</span><span class="en-mode__note">${md.note}</span></span>
            </label>`
          )}
        </div>`
      )}
      ${question(
        5,
        "Anything we should know?",
        "Exam dates, topics that worry them, days that don’t work.",
        html`<div class="field en-field" data-field="message">
          <label class="field__label sr-only" for="en-message">Message</label>
          <textarea class="textarea" id="en-message" name="message" rows="4" maxlength="1500">${message}</textarea>
        </div>`
      )}
    </ol>
    <div class="en-submit">
      <div class="en-errors" role="alert" hidden></div>
      <div class="en-submit__row">
        <button class="btn btn--primary btn--lg en-submit__btn" type="submit" data-magnetic>
          <span data-submit-label>Send enquiry</span><span class="btn__icon">${icon("arrow-right", { size: 18 })}</span>
        </button>
        <p class="en-submit__tally" aria-live="polite"><span data-answered>0</span> of 5 answered</p>
      </div>
      <p class="en-submit__small">Your enquiry is saved on this device, then you send it to us on WhatsApp or by email. It is not shared with anyone else.</p>
    </div>
  </form>`;
}

function contactAside(m) {
  const s = m.site;
  const pay = s.payment || {};
  const hours = str(s.hours).split(/\s+·\s+|\n/).map((h) => h.trim()).filter(Boolean);
  const tel = m.phone ? `tel:${m.phone.replace(/[^\d+]/g, "")}` : "";
  const map = safeUrl(s.mapUrl);
  const rows = [
    m.wa && { k: "WhatsApp", v: html`<a href="${m.wa}" target="_blank" rel="noopener">${prettyWhatsapp(s.whatsapp)}</a>` },
    m.phone && { k: "Phone", v: html`<a href="${tel}">${m.phone}</a>` },
    m.email && { k: "Email", v: html`<a href="mailto:${m.email}">${m.email}</a>` },
    s.address && {
      k: "Address",
      v: html`<span>${s.address}</span>${map ? html`<a class="en-contact__map" href="${map}" target="_blank" rel="noopener">Open the map ${icon("arrow-up-right", { size: 14 })}</a>` : ""}`,
    },
    hours.length && { k: "Hours", v: html`${hours.map((h) => html`<span class="en-contact__line">${h}</span>`)}` },
  ].filter(Boolean);
  const hasPay = pay.juice || pay.bank || pay.note;
  if (!rows.length && !hasPay) return "";
  return html`<aside class="en-aside" aria-label="Contact and payment">
    <div class="en-card on-ink">
      ${rows.length
        ? html`<div class="en-card__part">
            <p class="en-card__k">Or reach us directly</p>
            <dl class="en-contact">${rows.map((r) => html`<div><dt>${r.k}</dt><dd>${r.v}</dd></div>`)}</dl>
          </div>`
        : ""}
      ${hasPay
        ? html`<div class="en-pay">
            <p class="en-card__k">Paying</p>
            <p class="en-pay__text">Nothing is paid now. Once the group is confirmed, fees go monthly or by the term${pay.juice && pay.bank ? " by MCB Juice or bank transfer" : pay.juice ? " by MCB Juice" : pay.bank ? " by bank transfer" : ""}.</p>
            ${pay.note ? html`<p class="en-pay__note">${pay.note}</p>` : ""}
            <a class="link-arrow link-arrow--light" href="#/plans"><span>Plans and fees</span>${icon("arrow-right", { size: 16 })}</a>
          </div>`
        : ""}
    </div>
  </aside>`;
}

function successMarkup(m, res, data) {
  const r = res.record || {};
  const first = greeting(data.name);
  const ref = str(r.id).replace(/^enq-/, "").slice(-6).toUpperCase();
  const courses = (data.courseIds || []).map((id) => byId(m.content.courses, id)).filter(Boolean);
  const modeLabel = MODES.find((md) => md.value === data.mode && md.value)?.label || "Either";
  const entry = [
    ["Reference", html`<span class="num">${ref || "—"}</span>`],
    ["Received", fmtWhen(r.createdAt)],
    r.updatedAt && ["Updated", fmtWhen(r.updatedAt)],
    ["Name", data.name],
    data.studentName && ["Student", data.studentName],
    data.phone && ["Phone", data.phone],
    data.email && ["Email", data.email],
    ["Level", data.level ? levelName(m.content, data.level) : "Not sure yet"],
    ["Courses", courses.length ? html`<ul class="en-entry__courses">${courses.map((c) => html`<li>${c.code ? html`<span class="en-entry__code">${c.code}</span>` : ""}${c.title}</li>`)}</ul>` : "To be decided"],
    ["Format", modeLabel],
  ].filter(Boolean);
  const hours = str(m.site.hours).trim();
  return html`<div class="en-done" tabindex="-1" aria-labelledby="en-done-title">
    <p class="eyebrow en-done__eyebrow">${r.updatedAt ? "Enquiry updated" : "Enquiry saved"}${ref ? html` · Ref <span class="num">${ref}</span>` : ""}</p>
    <h2 class="h1 en-done__title" id="en-done-title">Thank you${first ? html`, <em>${first}.</em>` : "."}<span class="en-done__tick">${penTick()}</span></h2>
    <p class="lead en-done__lead">${res.whatsappUrl || res.mailtoUrl
      ? "One more step: send it to us. WhatsApp opens with every answer already written out, so you only press send."
      : "We have it on this device. Call us and mention the reference, or send the details by message."}</p>
    <div class="en-done__actions">
      ${res.whatsappUrl
        ? html`<a class="btn btn--primary btn--lg en-done__wa" href="${res.whatsappUrl}" target="_blank" rel="noopener" data-magnetic>
            ${icon("whatsapp", { size: 20 })}<span>Send on WhatsApp</span><span class="btn__icon">${icon("arrow-up-right", { size: 18 })}</span>
          </a>`
        : ""}
      ${res.mailtoUrl
        ? html`<a class="btn ${res.whatsappUrl ? "btn--ghost" : "btn--primary"} btn--lg" href="${res.mailtoUrl}">${icon("mail", { size: 20 })}<span>${res.whatsappUrl ? "Email instead" : "Send by email"}</span></a>`
        : ""}
      ${!res.whatsappUrl && !res.mailtoUrl && m.phone
        ? html`<a class="btn btn--primary btn--lg" href="tel:${m.phone.replace(/[^\d+]/g, "")}">${icon("phone", { size: 20 })}<span>Call ${m.phone}</span></a>`
        : ""}
    </div>
    ${res.remote === true
      ? html`<p class="en-done__remote">${icon("check", { size: 16 })}It also reached our inbox.</p>`
      : res.remote === false
      ? html`<p class="en-done__remote en-done__remote--warn">Our online inbox didn’t answer, so please use WhatsApp or email above.</p>`
      : ""}
    <div class="en-done__grid">
      <section class="en-entry" aria-labelledby="en-entry-title">
        <h3 class="en-entry__title" id="en-entry-title">Statement of entry</h3>
        <dl class="en-entry__rows">${entry.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      </section>
      <section class="en-next" aria-labelledby="en-next-title">
        <h3 class="en-entry__title" id="en-next-title">What happens next</h3>
        <ol class="en-next__list">
          <li><span class="en-next__n">01</span><div><p class="en-next__h">We read it and reply</p><p>On WhatsApp or by email${hours ? `, during opening hours (${hours})` : ""}.</p></div></li>
          <li><span class="en-next__n">02</span><div><p class="en-next__h">A first lesson to try</p><p>We suggest the group that fits, with a lesson to join in the room or on Zoom.</p></div></li>
          <li><span class="en-next__n">03</span><div><p class="en-next__h">Then the fees</p><p>Only once the group suits. Monthly or by the term; the details are on <a class="link" href="#/plans">Plans</a>.</p></div></li>
        </ol>
      </section>
    </div>
    <div class="en-done__more">
      <button class="en-done__btn" type="button" data-action="edit">${icon("edit", { size: 16 })}<span>Change something</span></button>
      <button class="en-done__btn" type="button" data-action="new">${icon("plus", { size: 16 })}<span>Start another enquiry</span></button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ view */

let active = null;
let snapshot = null;

export default {
  id: "enrol",
  title: "Enrol",
  scene: "grid",

  render(ctx) {
    const m = model(ctx.content || {});
    const pre = prefillFrom(m, ctx.query);
    return html`<section class="view view--enrol" data-view="enrol">
      ${hero(m)}
      <section class="section en-main" id="enrol-form" aria-label="Enquiry form">
        <div class="container en-main__grid">
          <div class="en-main__form" data-slot="form">${formMarkup(m, pre)}</div>
          ${contactAside(m)}
        </div>
      </section>
    </section>`;
  },

  mount(root, ctx) {
    const gsap = gsapRef();
    const motion = ctx.motion;
    const reduced = !gsap || !!(motion && motion.reduced);
    const slot = root.querySelector('[data-slot="form"]');
    if (!slot) return undefined;
    const m = model(ctx.content || {});
    const g = gsap ? gsap.context(() => {}, root) : null;
    const add = (fn) => (g ? g.add(fn) : fn());
    const ease = (motion && motion.ease) || { out: "expo.out", inOut: "expo.inOut" };
    const say = (msg) => ctx.announce && ctx.announce(msg);
    let alive = true;
    let pre = prefillFrom(m, ctx.query);
    let source = pre.source;
    let meta = { ...pre.meta };
    let done = null; // { res, data } once submitted
    let editing = null; // the { res, data } that "Change something" is correcting
    const written = new Set(pre.lines); // message lines the prefill wrote (cleared with it)
    let sending = false;
    let slotUnbind = null;
    const touched = new Set();
    let submitted = false;
    const complete = new Map(); // question number → ticked

    const $ = (s, el = slot) => el.querySelector(s);
    const $$ = (s, el = slot) => [...el.querySelectorAll(s)];
    const form = () => $(".en-form");

    /* ---- reading the form ------------------------------------------------ */

    function collect() {
      const f = form();
      if (!f) return null;
      const val = (n) => str(f.elements[n] && f.elements[n].value).trim();
      const level = val("level");
      const courseIds = $$('input[name="courseIds"]:checked', f).map((i) => i.value);
      const modeInput = $('input[name="mode"]:checked', f);
      return {
        name: val("name"),
        studentName: val("studentName"),
        phone: val("phone"),
        email: val("email"),
        level,
        courseIds,
        mode: modeInput ? modeInput.value : "",
        modeChosen: !!modeInput,
        message: str(f.elements.message && f.elements.message.value).trim(),
      };
    }

    function problems(d) {
      const out = {};
      if (d.name.length < 2) out.name = d.name ? "Please write the full name." : "Please write your name.";
      const p = phoneProblem(d.phone);
      if (p) out.phone = p;
      if (d.email && !emailOk(d.email)) out.email = "Check the email address: it needs an @ and a domain, like name@example.com.";
      if (!d.phone && !d.email) out.contact = "Add a phone number or an email, so we can reply.";
      return out;
    }

    const FIELD_ID = { name: "en-name", phone: "en-phone", email: "en-email" };

    function showErrors(d, { all = false } = {}) {
      const errs = problems(d);
      const f = form();
      if (!f) return errs;
      ["name", "phone", "email"].forEach((k) => {
        const id = FIELD_ID[k];
        const input = $(`#${id}`, f);
        const box = $(`#${id}-err`, f);
        const wrap = input && input.closest(".field");
        const show = (all || touched.has(k)) && errs[k];
        const contact = (all || (touched.has("phone") && touched.has("email"))) && errs.contact && (k === "phone" || k === "email");
        if (box) box.innerHTML = show ? String(html`${icon("close", { size: 14 })}<span>${errs[k]}</span>`) : "";
        if (input) input.setAttribute("aria-invalid", show || contact ? "true" : "false");
        if (wrap) wrap.classList.toggle("is-invalid", !!(show || contact));
      });
      const cbox = $("#en-contact-err", f);
      const cshow = (all || (touched.has("phone") && touched.has("email"))) && errs.contact;
      if (cbox) cbox.innerHTML = cshow ? String(html`${icon("close", { size: 14 })}<span>${errs.contact}</span>`) : "";
      ["en-phone", "en-email"].forEach((id) => {
        const input = $(`#${id}`, f);
        if (input) input.setAttribute("aria-describedby", `${id}-hint ${id}-err${cshow ? " en-contact-err" : ""}`);
      });
      return errs;
    }

    let lastSummary = "";
    function summary(errs) {
      const box = $(".en-errors");
      if (!box) return;
      // role="alert" re-announces on every change: only rewrite it when the problems change.
      const key = JSON.stringify(errs);
      if (key === lastSummary && !box.hidden === !!Object.keys(errs).length) return;
      lastSummary = key;
      const list = [
        errs.name && { id: "en-name", q: "1(a)", t: errs.name },
        (errs.phone || errs.contact) && { id: "en-phone", q: "2(a)", t: errs.phone || errs.contact },
        errs.email && { id: "en-email", q: "2(b)", t: errs.email },
      ].filter(Boolean);
      if (!list.length) {
        box.hidden = true;
        box.innerHTML = "";
        return;
      }
      box.hidden = false;
      box.innerHTML = String(html`<p class="en-errors__title">${list.length === 1 ? "One answer needs another look" : `${list.length} answers need another look`}</p>
        <ul>${list.map((e) => html`<li><button type="button" data-focus="${e.id}"><span class="en-errors__q">${e.q}</span>${e.t}</button></li>`)}</ul>`);
    }

    /* ---- examiner's margin ------------------------------------------------ */

    function tally({ animate = true } = {}) {
      const d = collect();
      if (!d) return;
      const errs = problems(d);
      const state = {
        1: !errs.name,
        2: !errs.contact && !errs.phone && !errs.email,
        3: !!(d.level || d.courseIds.length),
        4: d.modeChosen,
        5: d.message.length > 0,
      };
      let n = 0;
      Object.entries(state).forEach(([q, ok]) => {
        if (ok) n += 1;
        const was = complete.get(q) || false;
        if (ok === was) return;
        complete.set(q, ok);
        const mark = $(`.en-q[data-q="${q}"] .en-q__mark`);
        if (!mark) return;
        if (ok) {
          mark.innerHTML = String(penTick());
          mark.classList.add("is-on");
          if (animate && !reduced && motion) add(() => motion.draw(mark, { duration: 0.5 }));
        } else {
          mark.classList.remove("is-on");
          mark.innerHTML = "";
        }
      });
      const out = $("[data-answered]");
      if (out) out.textContent = String(n);
      const cc = $("[data-course-count]");
      if (cc) cc.textContent = d.courseIds.length ? `${d.courseIds.length} ticked` : "tick any";
    }

    /* ---- courses filtered by level (Flip) ---------------------------------- */

    function filterLevel(level, { animate = true } = {}) {
      const groups = $$(".en-group");
      if (!groups.length) return;
      const Flip = flipRef();
      const announce = () => {
        const n = $$(".en-group:not([hidden]) .en-chip").length;
        say(level ? `${plural(n, "course")} for ${levelName(m.content, level)}` : `All ${plural(n, "course")} shown`);
      };
      const doIt = () => {
        groups.forEach((gEl) => {
          const show = !level || gEl.dataset.level === level;
          gEl.hidden = !show;
          if (!show) $$('input[type="checkbox"]:checked', gEl).forEach((i) => (i.checked = false));
        });
      };
      if (!animate || reduced || !Flip) {
        doIt();
        if (animate) announce();
        return;
      }
      add(() => {
        const st = Flip.getState(groups);
        doIt();
        Flip.from(st, {
          duration: 0.6,
          ease: ease.out,
          absolute: false,
          nested: true,
          onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: ease.out, clearProps: "transform,opacity" }),
          onLeave: (els) => gsap.to(els, { opacity: 0, duration: 0.2 }),
          onComplete: () => motion && motion.refresh(),
        });
      });
      announce();
    }

    /* ---- submit ----------------------------------------------------------- */

    async function submit() {
      if (sending) return;
      const d = collect();
      if (!d) return;
      submitted = true;
      ["name", "phone", "email"].forEach((k) => touched.add(k));
      const errs = showErrors(d, { all: true });
      summary(errs);
      if (Object.keys(errs).length) {
        const first = errs.name ? "en-name" : errs.phone || errs.contact ? "en-phone" : "en-email";
        const el = $(`#${first}`);
        if (el) {
          scrollToEl(el, -160);
          setTimeout(() => alive && el.focus({ preventScroll: true }), reduced ? 0 : 450);
        }
        say(`${plural(Object.keys(errs).length, "answer")} need${Object.keys(errs).length === 1 ? "s" : ""} another look.`);
        return;
      }
      // A single level is implied by the courses ticked.
      let level = d.level;
      if (!level && d.courseIds.length) {
        const lvls = [...new Set(d.courseIds.map((id) => byId(m.content.courses, id)?.level).filter(Boolean))];
        if (lvls.length === 1) level = lvls[0];
      }
      const data = {
        name: d.name,
        studentName: d.studentName,
        phone: d.phone,
        email: d.email,
        level,
        courseIds: d.courseIds,
        mode: d.mode,
        message: d.message,
        source,
        ...meta,
      };
      // Sent again unchanged after "Change something": nothing to save or send twice.
      if (editing && sameEnquiry(editing.data, data)) {
        done = editing;
        editing = null;
        showDone(true);
        return;
      }
      sending = true;
      const btn = $(".en-submit__btn");
      const label = $("[data-submit-label]");
      if (btn) {
        btn.setAttribute("aria-disabled", "true");
        btn.setAttribute("aria-busy", "true");
      }
      if (label) label.textContent = "Saving…";
      let res = null;
      try {
        res = editing ? await resubmit(ctx.content, editing, data) : await submitEnquiry(ctx.content, data);
      } catch (e) {
        console.warn("[enrol] could not save the enquiry", e);
      }
      sending = false;
      if (!alive) return;
      if (!res) {
        if (btn) {
          btn.removeAttribute("aria-disabled");
          btn.removeAttribute("aria-busy");
        }
        if (label) label.textContent = "Send enquiry";
        const box = $(".en-errors");
        if (box) {
          box.hidden = false;
          box.innerHTML = String(html`<p class="en-errors__title">This browser wouldn’t save the enquiry.</p><p>Please send it on WhatsApp or by email using the contact details alongside.</p>`);
        }
        return;
      }
      done = { res, data };
      editing = null;
      showDone(true);
    }

    function scrollToEl(el, offset = -120) {
      const l = ctx.lenis;
      if (l && typeof l.scrollTo === "function") {
        if (!l.isShim && typeof l.scroll === "number" && Math.abs(l.scroll - window.scrollY) > 2) l.scrollTo(window.scrollY, { immediate: true });
        l.scrollTo(el, reduced ? { offset, immediate: true } : { offset, duration: 0.9 });
      } else el.scrollIntoView();
    }

    function bindSlot() {
      if (slotUnbind) slotUnbind();
      slotUnbind = null;
      if (!motion) return;
      const offs = $$("[data-magnetic]").map((b) => motion.bind(b));
      slotUnbind = () => offs.forEach((off) => off && off());
    }

    function swap(markup, after, { animate = true } = {}) {
      const go = () => {
        slot.innerHTML = String(markup);
        bindSlot();
        after();
        if (motion) motion.refresh();
      };
      const cur = slot.firstElementChild;
      if (!animate || reduced || !cur) return go();
      add(() => {
        gsap.to(cur, {
          opacity: 0,
          y: -16,
          duration: 0.4,
          ease: "power2.in",
          onComplete: () => alive && go(),
        });
      });
      return undefined;
    }

    function showDone(animate) {
      swap(
        successMarkup(m, done.res, done.data),
        () => {
          const box = $(".en-done");
          scrollToEl(slot, -110);
          if (box) setTimeout(() => alive && box.focus({ preventScroll: true }), reduced || !animate ? 0 : 500);
          say("Enquiry saved. Send it on WhatsApp or by email to finish.");
          if (!animate || reduced) return;
          add(() => {
            const kids = [...box.children];
            const tl = gsap.timeline();
            tl.fromTo(kids, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.95, ease: ease.out, stagger: 0.08, clearProps: "transform" }, 0.1);
            const tick = $(".en-done__tick", box);
            const tw = tick && motion && motion.draw(tick, { duration: 0.7 });
            if (tw) {
              tw.pause();
              tl.add(tw.play(), 0.7);
            }
            const rows = $$(".en-entry__rows > div", box);
            tl.fromTo(rows, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.6, ease: ease.out, stagger: 0.04, clearProps: "transform" }, 0.55);
          });
        },
        { animate }
      );
    }

    // onReady runs once the form is in the page (after the old content's fade-out, however long
    // that frame takes), so focus never lands on a button that has just been removed.
    function showForm({ keep = null, animate = true, prefill = pre, onReady = null } = {}) {
      done = null;
      submitted = false;
      lastSummary = "";
      touched.clear();
      complete.clear();
      swap(
        formMarkup(m, prefill),
        () => {
          if (keep) restoreValues(keep);
          tally();
          if (onReady) onReady();
          if (motion) {
            // The heading's line reveal and the pen marks inside come with the swap.
            const h = $(".en-form__title");
            if (h) h.removeAttribute("data-split");
          }
          if (!animate || reduced) return;
          add(() => {
            gsap.fromTo([...form().children], { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.9, ease: ease.out, stagger: 0.07, clearProps: "transform" });
          });
        },
        { animate }
      );
    }

    function restoreValues(d) {
      const f = form();
      if (!f || !d) return;
      ["name", "studentName", "phone", "email", "message"].forEach((k) => {
        if (f.elements[k] && d[k] !== undefined) f.elements[k].value = d[k];
      });
      if (f.elements.level) f.elements.level.value = d.level || "";
      filterLevel(d.level || "", { animate: false });
      $$('input[name="courseIds"]', f).forEach((i) => (i.checked = (d.courseIds || []).includes(i.value)));
      if (d.modeChosen || d.mode) {
        const r = $$('input[name="mode"]', f).find((i) => i.value === (d.mode || ""));
        if (r) r.checked = true;
      }
    }

    /* ---- events ----------------------------------------------------------- */

    const onInput = (e) => {
      const t = e.target;
      if (!t || !t.name || done) return;
      if (submitted || touched.has(t.name)) {
        const d = collect();
        const errs = showErrors(d, { all: submitted });
        if (submitted) summary(errs);
      }
      tally();
    };
    const onChange = (e) => {
      const t = e.target;
      if (!t || done) return;
      if (t.name === "level") filterLevel(t.value);
      tally();
    };
    const onBlur = (e) => {
      const t = e.target;
      if (!t || !t.name || done) return;
      if (!["name", "phone", "email"].includes(t.name)) return;
      if (!t.value.trim() && !submitted) return; // don't scold an empty field you just tabbed past
      touched.add(t.name);
      const d = collect();
      showErrors(d, { all: submitted });
    };
    const onSubmit = (e) => {
      if (!e.target || !e.target.classList || !e.target.classList.contains("en-form")) return;
      e.preventDefault();
      submit();
    };
    const onClick = (e) => {
      const t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      const focusBtn = t.closest("[data-focus]");
      if (focusBtn) {
        const el = $(`#${CSS.escape(focusBtn.getAttribute("data-focus"))}`);
        if (el) {
          scrollToEl(el, -160);
          setTimeout(() => alive && el.focus({ preventScroll: true }), reduced ? 0 : 450);
        }
        return;
      }
      const act = t.closest("[data-action]");
      if (!act || !slot.contains(act)) return;
      const a = act.getAttribute("data-action");
      if (a === "clear-prefill") {
        const d = collect();
        pre = prefillFrom(m, null);
        source = "enrol";
        meta = {};
        if (ctx.setQuery) ctx.setQuery({});
        // The sentences the prefill wrote go with it; anything the visitor typed stays.
        const msg = str(d.message)
          .split("\n")
          .filter((l) => !written.has(l.trim()))
          .join("\n")
          .trim();
        written.clear();
        const keep = { ...d, level: "", courseIds: [], message: msg };
        const note = $(".en-prefill");
        const finish = () => {
          showForm({ keep, animate: false, prefill: pre });
          say("Pre-filled answers cleared");
          const f = form();
          if (f && f.elements.name) f.elements.name.focus({ preventScroll: true });
        };
        if (note && !reduced) add(() => gsap.to(note, { opacity: 0, height: 0, marginBottom: 0, paddingBlock: 0, duration: 0.45, ease: ease.inOut, onComplete: finish }));
        else finish();
      } else if (a === "edit" && done) {
        editing = done;
        const keep = { ...done.data, modeChosen: true };
        showForm({ keep, prefill: { ...prefillFrom(m, null), notes: [] }, onReady: focusName });
      } else if (a === "new" && done) {
        pre = prefillFrom(m, null);
        source = "enrol";
        meta = {};
        editing = null;
        written.clear();
        if (ctx.setQuery) ctx.setQuery({});
        showForm({ prefill: pre, onReady: focusName });
      }
    };
    // The form is taller than the receipt it replaces: bring its first question into view too.
    function focusName() {
      const f = form();
      if (!alive || !f) return;
      if (slot.getBoundingClientRect().top < 0) scrollToEl(slot, -110);
      if (f.elements.name) f.elements.name.focus({ preventScroll: true });
    }

    slot.addEventListener("input", onInput);
    slot.addEventListener("change", onChange);
    slot.addEventListener("focusout", onBlur);
    slot.addEventListener("submit", onSubmit);
    slot.addEventListener("click", onClick);

    active = {
      onQuery(query) {
        const next = prefillFrom(m, query);
        if (!next.notes.length && !next.level) return;
        const d = done ? null : collect();
        if (done) {
          editing = null; // a fresh enquiry, not a correction of the one just sent
          written.clear();
        }
        next.lines.forEach((l) => written.add(l));
        pre = next;
        source = next.source;
        meta = { ...next.meta };
        const keep = d
          ? {
              ...d,
              level: next.level || d.level,
              courseIds: [...new Set([...(next.level && next.level !== d.level ? [] : d.courseIds), ...next.courseIds])],
              message: [d.message, ...next.lines.filter((l) => !d.message.includes(l))].filter(Boolean).join("\n"),
            }
          : null;
        showForm({ keep, prefill: next });
        scrollToEl(slot, -110);
      },
    };
    const instance = active;

    /* ---- restore after an in-place re-render (admin live preview) ---------- */

    const snap = snapshot;
    snapshot = null;
    // Only an in-place re-render (admin live preview) restores: the hash is unchanged then. Leaving
    // and coming back, even quickly, starts afresh with the new query's prefill.
    if (snap && Date.now() - snap.at < SNAPSHOT_MS && snap.hash === location.hash) {
      source = snap.source;
      meta = snap.meta;
      editing = snap.editing || null;
      (snap.written || []).forEach((l) => written.add(l));
      if (snap.done) {
        done = snap.done;
        showDone(false);
      } else if (snap.values) {
        restoreValues(snap.values);
        snap.touched.forEach((k) => touched.add(k));
        submitted = snap.submitted;
        if (submitted || touched.size) showErrors(collect(), { all: submitted });
      }
    }
    // Questions already answered by the prefill: the shell's motion.bind draws these ticks on scroll.
    tally({ animate: false });

    const onRootClick = (e) => {
      const a = e.target && e.target.closest ? e.target.closest("[data-enrol-start]") : null;
      if (!a) return;
      e.preventDefault();
      const q1 = root.querySelector("#en-q1") || slot;
      scrollToEl(q1, -110);
      setTimeout(() => {
        const f = form();
        const input = f && f.elements.name;
        if (alive && input) input.focus({ preventScroll: true });
      }, reduced ? 0 : 950);
    };
    root.addEventListener("click", onRootClick);

    return () => {
      alive = false;
      snapshot = { at: Date.now(), hash: location.hash, source, meta, done, editing, written: [...written], values: done ? null : collect(), touched: [...touched], submitted };
      slot.removeEventListener("input", onInput);
      slot.removeEventListener("change", onChange);
      slot.removeEventListener("focusout", onBlur);
      slot.removeEventListener("submit", onSubmit);
      slot.removeEventListener("click", onClick);
      root.removeEventListener("click", onRootClick);
      if (slotUnbind) slotUnbind();
      if (g) g.revert();
      if (active === instance) active = null;
    };
  },

  onQuery(query) {
    if (active) active.onQuery(query);
  },
};
