// Overview: greeting, register of counts, launch checklist, today's lessons, enquiries, nearly-full groups.

import { html, icon, render, penTick } from "../../../assets/js/ui.js";
import * as store from "../../../assets/js/store.js";
import { state, commit, subscribe, status, sectionLabel, changedSections } from "../state.js";
import { $, fmtAgo, two, gsap, reduced } from "../dom.js";
import { toMin, entries } from "../schemas.js";
import { ownerName } from "./common.js";

const GH_VERIFIED = "kt.admin.ghVerified.v1";
export function ghVerified() {
  try {
    return localStorage.getItem(GH_VERIFIED) === "1";
  } catch {
    return false;
  }
}
export function setGhVerified(on) {
  try {
    if (on) localStorage.setItem(GH_VERIFIED, "1");
    else localStorage.removeItem(GH_VERIFIED);
  } catch {}
}

const PLACEHOLDERS = [/5000\s?0000/, /50000000/, /example\.(com|org|net)/i, /000 000 000/];
const CONTACT_FIELDS = [
  ["site.phone", "phone"],
  ["site.whatsapp", "WhatsApp number"],
  ["site.email", "email"],
  ["site.payment.juice", "MCB Juice number"],
  ["site.payment.bank", "bank account"],
];
const get = (o, p) => p.split(".").reduce((x, k) => (x == null ? x : x[k]), o);

export function placeholderFields(c) {
  return CONTACT_FIELDS.filter(([p]) => {
    const v = String(get(c, p) || "");
    return !v || PLACEHOLDERS.some((re) => re.test(v));
  }).map(([, label]) => label);
}

export function checklist(c) {
  const gh = store.getGitHubConfig();
  const ghReady = !!(gh.token && gh.owner && gh.repo);
  const ph = placeholderFields(c);
  return [
    {
      id: "sample",
      title: "Replace the sample content",
      text: c.meta?.sample
        ? "The courses, tutors, fees and testimonials are realistic examples written for this template. Go through each section, make it yours, then tick this off."
        : "Marked as replaced. The site is showing your own content.",
      done: !c.meta?.sample,
      action: c.meta?.sample
        ? html`<button type="button" class="a-btn a-btn--ghost a-btn--xs" data-ov="sample-off">${icon("check", { size: 16 })}<span>Mark as replaced</span></button>`
        : html`<button type="button" class="a-link" data-ov="sample-on">Undo</button>`,
    },
    {
      id: "password",
      title: "Change the default password",
      text: store.isDefaultPassword(c) ? "Anyone who has seen “admin123” can open these screens." : "The admin password is no longer the default.",
      done: !store.isDefaultPassword(c),
      action: store.isDefaultPassword(c) ? html`<a class="a-btn a-btn--ghost a-btn--xs" href="#security">Change password${icon("arrow-right", { size: 16 })}</a>` : "",
    },
    {
      id: "github",
      title: "Connect GitHub publishing",
      text: ghVerified() && ghReady
        ? `Connected to ${gh.owner}/${gh.repo}. “Publish” updates the live site.`
        : ghReady
          ? "A token is saved in this browser but hasn't been tested yet."
          : "Add a GitHub token once, so the Publish button can update the live site from this browser.",
      done: ghReady && ghVerified(),
      action: ghReady && ghVerified() ? "" : html`<a class="a-btn a-btn--ghost a-btn--xs" href="#publish">Set up publishing${icon("arrow-right", { size: 16 })}</a>`,
    },
    {
      id: "contact",
      title: "Replace the placeholder contact details",
      text: ph.length ? `Still a placeholder: ${ph.join(", ")}.` : "Phone, WhatsApp, email and payment details are filled in.",
      done: ph.length === 0,
      action: ph.length ? html`<a class="a-btn a-btn--ghost a-btn--xs" href="#site/contact">Edit contact details${icon("arrow-right", { size: 16 })}</a>` : "",
    },
    {
      id: "endpoint",
      title: "Set a form endpoint",
      optional: true,
      text: c.site?.formEndpoint
        ? "Enquiries made on other people's devices are also emailed to you."
        : "So that enquiries made on other people's phones also reach your email, not only WhatsApp. A free Formspree form works.",
      done: !!c.site?.formEndpoint,
      action: c.site?.formEndpoint ? "" : html`<a class="a-link" href="#site/contact">Add one</a>`,
    },
  ];
}

const DAY_IDS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const firstName = (n) => String(n || "").trim().split(/\s+/)[0].replace(/[.,]$/, "");

function weekNumber(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}

function sessionsOn(c, dayId) {
  return (c.timetable || []).filter((s) => s.day === dayId).sort((a, b) => toMin(a.start) - toMin(b.start));
}

function teachingDay(c, now) {
  const today = DAY_IDS[now.getDay()];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const list = sessionsOn(c, today);
  // Show today's lessons until the last one has finished, then the next teaching day.
  if (list.length && list.some((s) => toMin(s.end) > nowMin)) return { dayId: today, list, isToday: true };
  for (let i = 1; i <= 7; i++) {
    const id = DAY_IDS[(now.getDay() + i) % 7];
    const l = sessionsOn(c, id);
    if (l.length) return { dayId: id, list: l, isToday: false, label: i === 1 ? "Tomorrow" : "Next lessons" };
  }
  return { dayId: today, list, isToday: true };
}

const STATUS_LABEL = { new: "New", contacted: "Contacted", enrolled: "Enrolled", archived: "Archived" };

function renderBody(ctx) {
  const w = state.working;
  // Read-only view of the content with unreadable list entries left out, so one bad entry in a
  // hand-edited content.json can't take the whole overview down.
  const c = { ...w, courses: entries(w.courses), timetable: entries(w.timetable), tutors: entries(w.tutors), levels: entries(w.levels) };
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const owner = ownerName(w);
  const enquiries = store.listEnquiries();
  const fresh = enquiries.filter((e) => e.status === "new");
  const st = status();
  const changed = changedSections() || [];
  const courses = c.courses || [];
  const shown = courses.filter((x) => x.visible !== false);
  const nearly = shown.filter((x) => Number(x.seatsLeft) <= 2).sort((a, b) => a.seatsLeft - b.seatsLeft);
  const hours = (c.timetable || []).reduce((m, s) => m + Math.max(0, toMin(s.end) - toMin(s.start) || 0), 0) / 60;
  const seats = shown.reduce((m, x) => m + (Number(x.seats) || 0), 0);
  const left = shown.reduce((m, x) => m + (Number(x.seatsLeft) || 0), 0);
  const list = checklist(c);
  const doneCount = list.filter((x) => x.done).length;
  const day = teachingDay(c, now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const parts = [];
  if (fresh.length) parts.push(`${fresh.length} new ${fresh.length === 1 ? "enquiry" : "enquiries"}`);
  if (changed.length) parts.push(`${changed.length} ${changed.length === 1 ? "section" : "sections"} waiting to be published`);
  if (nearly.length) parts.push(`${nearly.length} ${nearly.length === 1 ? "group" : "groups"} nearly full`);
  const summary = parts.length
    ? `${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}.`
    : "Nothing needs you right now. The live site matches this browser.";
  const sentence = summary.charAt(0).toUpperCase() + summary.slice(1);

  const dateLine = `${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · Week ${weekNumber(now)}`;
  const dayName = store.dayName(day.dayId);
  const todayTpl = html`
    <section class="panel ov-today" data-a-intro aria-labelledby="ov-today-t">
      <header class="panel__head">
        <h2 class="panel__title" id="ov-today-t">${day.isToday ? html`Today <span class="panel__soft">· ${dayName}</span>` : html`${day.label} <span class="panel__soft">· ${dayName}</span>`}</h2>
        <a class="a-link" href="#timetable">Timetable</a>
      </header>
      ${day.list.length
        ? html`<ol class="day">
            ${day.list.map((s) => {
              const course = store.byId(c.courses, s.courseId);
              const tutor = course ? store.byId(c.tutors, course.tutorId) : null;
              const a = toMin(s.start);
              const b = toMin(s.end);
              const phase = !day.isToday ? "" : nowMin >= b ? "done" : nowMin >= a ? "now" : "";
              return html`<li class="day__row${phase ? ` is-${phase}` : ""}">
                <span class="day__time">${s.start}<span class="day__dash">–</span>${s.end}</span>
                <span class="day__code">${course?.code || "—"}</span>
                <span class="day__what"><span class="day__title">${course ? course.title : "Missing course"}</span><span class="day__meta">${[course ? store.levelName(c, course.level) : "", s.room, tutor?.name].filter(Boolean).join(" · ")}</span></span>
                ${phase === "now" ? html`<span class="a-tag a-tag--lagoon">Now</span>` : phase === "done" ? html`<span class="a-tag a-tag--plain">Done</span>` : html`<span></span>`}
              </li>`;
            })}
          </ol>`
        : html`<p class="empty__text">No sessions in the timetable yet.</p>`}
    </section>

`;

  return html`
  <header class="vh vh--overview" data-a-intro>
    <p class="vh__index"><span class="vh__num">${ctx.num}</span><span class="vh__group">${dateLine}</span></p>
    <h1 class="vh__title vh__title--xl" tabindex="-1" data-view-title><span class="vh__mask"><span class="vh__line">${greet}${owner ? html`, <em>${owner}</em>` : ""}.</span></span></h1>
    <p class="vh__lead vh__lead--lg">${sentence}</p>
  </header>

  <section class="register" aria-label="At a glance" data-a-intro>
    <a class="register__cell" href="#courses"><span class="register__num">${two(courses.length)}</span><span class="register__label">Courses</span><span class="register__sub">${shown.length} shown${courses.length - shown.length ? ` · ${courses.length - shown.length} hidden` : ""}</span></a>
    <a class="register__cell" href="#timetable"><span class="register__num">${two((c.timetable || []).length)}</span><span class="register__label">Sessions a week</span><span class="register__sub">${Math.round(hours * 10) / 10} teaching hours</span></a>
    <a class="register__cell" href="#courses"><span class="register__num">${two(left)}</span><span class="register__label">Places left</span><span class="register__sub">of ${seats} in visible groups</span></a>
    <a class="register__cell" href="#tutors"><span class="register__num">${two((c.tutors || []).length)}</span><span class="register__label">Tutors</span><span class="register__sub">${(c.tutors || []).map((t) => firstName(t.name)).join(", ") || "None yet"}</span></a>
    <a class="register__cell" href="#enquiries"><span class="register__num">${two(enquiries.length)}</span><span class="register__label">Enquiries</span><span class="register__sub">${fresh.length ? html`<span class="red-ink">${fresh.length} new</span>` : "none new"} · on this device</span></a>
  </section>

  <div class="ov-grid">
    <div class="ov-col ov-col--main">
    <section class="panel ov-check" data-a-intro aria-labelledby="ov-check-t">
      <header class="panel__head">
        <h2 class="panel__title" id="ov-check-t">Before you launch</h2>
        <p class="panel__marks" aria-label="${`${doneCount} of ${list.length} done`}"><span>${doneCount}</span>/${list.length}</p>
      </header>
      <ol class="check">
        ${list.map(
          (it, i) => html`<li class="check__item${it.done ? " is-done" : ""}" data-check="${it.id}">
            <span class="check__q">Q.${two(i + 1)}</span>
            <div class="check__body">
              <p class="check__title">${it.title}${it.optional ? html` <span class="check__opt">optional</span>` : ""}</p>
              <p class="check__text">${it.text}</p>
              ${it.action ? html`<div class="check__act">${it.action}</div>` : ""}
            </div>
            <span class="check__mark" aria-hidden="true">${it.done ? penTick({ cls: "check__tick" }) : html`<span class="check__box"></span>`}</span>
            <span class="sr-only">${it.done ? "Done" : "Not done yet"}</span>
          </li>`
        )}
      </ol>
    </section>
    ${todayTpl}
    </div>
    <div class="ov-col ov-col--side">
    <section class="panel panel--ink ov-status" data-a-intro aria-labelledby="ov-status-t">
      <p class="panel__eyebrow"><span class="dot dot--${st.tone}"></span>${st.tone === "draft" ? "Not live yet" : st.tone === "live" ? "Live" : "Attention"}</p>
      <h2 class="ov-status__title" id="ov-status-t">${st.tone === "draft" ? html`${changed.length} ${changed.length === 1 ? "section" : "sections"} <em>waiting</em>` : st.tone === "live" ? html`Everything is <em>live</em>.` : st.short}</h2>
      <p class="ov-status__text">${st.tone === "draft"
        ? html`Saved in this browser${state.savedAt ? ` ${fmtAgo(state.savedAt)}` : ""}, not on the live site yet: ${changed.map(sectionLabel).join(", ")}.`
        : st.tone === "live"
          ? state.publishedAt
            ? state.pulled
              ? "This browser matches the latest version on GitHub. GitHub Pages takes a minute or two to show it on the live site."
              : "Published from this browser. GitHub Pages takes a minute or two to update the live site."
            : "The live site matches this browser. Your edits save here first and only reach visitors when you publish."
          : st.text}</p>
      <div class="ov-status__acts">
        ${st.tone === "draft" ? html`<a class="a-btn a-btn--light a-btn--sm" href="#publish">Review & publish${icon("arrow-right", { size: 16 })}</a>` : ""}
        <a class="a-btn a-btn--on-ink a-btn--sm" href="../" target="_blank" rel="noopener" data-flush>${st.tone === "draft" ? "Preview the site" : "View the site"}${icon("arrow-up-right", { size: 16 })}</a>
      </div>
    </section>

    <section class="panel ov-enq" data-a-intro aria-labelledby="ov-enq-t">
      <header class="panel__head">
        <h2 class="panel__title" id="ov-enq-t">Newest enquiries</h2>
        <a class="a-link" href="#enquiries">All${enquiries.length ? ` ${enquiries.length}` : ""}</a>
      </header>
      ${enquiries.length
        ? html`<ul class="mini">
            ${enquiries.slice(0, 4).map((e) => {
              const codes = (e.courseIds || []).map((id) => store.byId(c.courses, id)).filter(Boolean).map((x) => x.code || x.title);
              return html`<li><a class="mini__row" href="${`#enquiries/${encodeURIComponent(e.id)}`}">
                <span class="mini__main"><span class="mini__title">${e.name || "Unnamed"}</span><span class="mini__meta">${[codes.join(" · "), fmtAgo(e.createdAt)].filter(Boolean).join(" — ")}</span></span>
                <span class="chip-status chip-status--${e.status}">${STATUS_LABEL[e.status] || e.status}</span>
              </a></li>`;
            })}
          </ul>`
        : html`<p class="empty__text">None on this device yet. Enquiries from other people's phones arrive on WhatsApp${c.site?.formEndpoint ? " and by email" : ""}.</p>`}
    </section>

    <section class="panel ov-full" data-a-intro aria-labelledby="ov-full-t">
      <header class="panel__head">
        <h2 class="panel__title" id="ov-full-t">Nearly full</h2>
        <span class="panel__soft">2 places or fewer</span>
      </header>
      ${nearly.length
        ? html`<ul class="mini">
            ${nearly.map(
              (x) => html`<li><a class="mini__row" href="${`#courses/${encodeURIComponent(x.id)}`}">
                <span class="mini__code">${x.code || "—"}</span>
                <span class="mini__main"><span class="mini__title">${x.title}</span><span class="mini__meta">${store.levelName(c, x.level)}</span></span>
                <span class="seats" aria-label="${`${x.seatsLeft} of ${x.seats} places left`}"><span class="seats__n${Number(x.seatsLeft) <= 0 ? " is-full" : ""}">${x.seatsLeft}</span>/${x.seats}</span>
              </a></li>`
            )}
          </ul>`
        : html`<p class="empty__text">No group is close to full.</p>`}
    </section>
    </div>
  </div>`;
}

export default {
  id: "overview",
  title: "Overview",
  render(ctx) {
    return html`<div data-ov-root>${renderBody(ctx)}</div>`;
  },
  mount(root, ctx) {
    const host = $("[data-ov-root]", root);
    const drawTicks = (scope) => {
      const g = gsap();
      if (!g || reduced()) return;
      scope.querySelectorAll(".check__tick path").forEach((p, i) => {
        const len = p.getTotalLength ? p.getTotalLength() : 60;
        g.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut", delay: 0.35 + i * 0.12 });
      });
    };
    drawTicks(host);
    const rerender = () => {
      const act = document.activeElement?.dataset?.ov;
      render(host, renderBody(ctx));
      if (act) {
        host.querySelector('[data-check="sample"] [data-ov]')?.focus({ preventScroll: true });
      }
    };
    const onClick = (e) => {
      const b = e.target.closest("[data-ov]");
      if (!b) return;
      const on = b.dataset.ov === "sample-on";
      commit((c) => {
        c.meta = { ...(c.meta || {}), sample: on };
      }, { path: "meta" });
      rerender();
      if (!on) drawTicks(host.querySelector('[data-check="sample"]'));
      ctx.toast(on ? "Marked as sample content again" : "Ticked off: sample content replaced", { tone: on ? "default" : "ok" });
    };
    host.addEventListener("click", onClick);
    const unsub = subscribe((kind) => {
      if (kind === "replace" || kind === "published") rerender();
    });
    const unsubStore = store.onStoreChange((kind) => {
      if (kind === "enquiries") rerender();
    });
    const timer = setInterval(() => {
      if (!document.hidden) rerender();
    }, 60000);
    return () => {
      host.removeEventListener("click", onClick);
      unsub();
      unsubStore();
      clearInterval(timer);
    };
  },
};
