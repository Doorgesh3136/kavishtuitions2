// Enquiries inbox. Data lives on this device only (store.listEnquiries); the site has no server.

import { html, icon, render } from "../../../assets/js/ui.js";
import * as store from "../../../assets/js/store.js";
import { state } from "../state.js";
import { $, $$, toast, confirmDialog, openDrawer, fmtDate, fmtAgo, download, debounce, flash } from "../dom.js";
import { renderFields, bindForm, focusFirstError } from "../fields.js";
import { enquiryFields, modeLabel } from "../schemas.js";
import { viewHead } from "./common.js";

const STATUSES = store.ENQUIRY_STATUSES;
const LABEL = { new: "New", contacted: "Contacted", enrolled: "Enrolled", archived: "Archived" };
const SOURCE = { enrol: "Website form", demo: "Demo data", manual: "Added by hand", quiz: "Placement check", resource: "Resource request" };

const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";

/** wa.me needs the full international number; Mauritian numbers are 7–8 digits without 230. */
export function waNumber(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 7 || d.length === 8) d = `230${d}`;
  return d;
}

function courseList(c, e) {
  return (e.courseIds || []).map((id) => store.byId(c.courses, id) || { id, title: id, code: "", missing: true });
}

function replyText(c, e) {
  const owner = firstName(c.tutors?.[0]?.name) || "";
  const site = c.site?.name || "";
  const courses = courseList(c, e).filter((x) => !x.missing).map((x) => `${x.title}${x.code ? ` (${x.code})` : ""}`);
  const about = courses.length ? (courses.length > 1 ? `${courses.slice(0, -1).join(", ")} and ${courses[courses.length - 1]}` : courses[0]) : "lessons";
  const student = e.studentName && e.studentName !== e.name ? ` for ${firstName(e.studentName)}` : "";
  return [
    `Hello ${firstName(e.name)},`,
    "",
    `This is ${owner ? `${owner} from ` : ""}${site || "the tuition centre"}. Thank you for your enquiry about ${about}${student}.`,
    "There is a place available, and the first lesson is a free trial. When would be a good time to call, so we can agree on the right group?",
    "",
    "Kind regards,",
    owner || site,
  ].join("\n");
}

const DEMO = [
  {
    hoursAgo: 3,
    status: "new",
    name: "Anjali Ramdhony",
    studentName: "Kiran Ramdhony",
    phone: "+230 5000 0101",
    email: "anjali.r@example.com",
    level: "sc",
    courseIds: ["sc-mathematics", "sc-physics"],
    mode: "hybrid",
    message: "Kiran is in Grade 10 and finding simultaneous equations and forces hard this term. Is there still a place in the Tuesday Mathematics group? We live in Rose-Hill, so Room A or Zoom both work for us.",
  },
  {
    hoursAgo: 26,
    status: "new",
    name: "Kevin Li Kwong",
    studentName: "",
    phone: "+230 5000 0102",
    email: "kevin.lk@example.com",
    level: "hsc",
    courseIds: ["hsc-mathematics"],
    mode: "online",
    message: "I'm in Lower Six. Can I join Pure 1 halfway through the term? I would need the recordings for what I've missed.",
  },
  {
    hoursAgo: 52,
    status: "contacted",
    name: "Ravi Gopaul",
    studentName: "Priyanka Gopaul",
    phone: "+230 5000 0103",
    email: "",
    level: "sc",
    courseIds: ["sc-accounting"],
    mode: "online",
    message: "Do you teach 7707 Accounting on Zoom? My daughter is in Grade 11 and needs help with final accounts before the mocks.",
    notes: "Sent fees on WhatsApp 28 Oct. Calling back Monday evening.",
  },
  {
    hoursAgo: 75,
    status: "contacted",
    name: "Nadia Bholah",
    studentName: "Zara Bholah",
    phone: "+230 5000 0104",
    email: "nadia.bholah@example.com",
    level: "lower",
    courseIds: ["lower-mathematics", "lower-science"],
    mode: "in-person",
    message: "Zara is in Grade 8. Her teacher says her fractions are weak. Saturday mornings suit us best — is the Science group on Saturdays?",
    notes: "Trial lesson booked: Tue 15:30, Room B.",
  },
  {
    hoursAgo: 150,
    status: "enrolled",
    name: "Jean-Marc Pierre",
    studentName: "Lucas Pierre",
    phone: "+230 5000 0105",
    email: "jm.pierre@example.com",
    level: "hsc",
    courseIds: ["hsc-economics", "hsc-general-paper"],
    mode: "hybrid",
    message: "For my son Lucas, Upper Six. He would like a full Economics paper marked before November, and help planning General Paper essays.",
    notes: "Paid Term 1 by Juice (ref LUCAS PIERRE).",
  },
  {
    hoursAgo: 222,
    status: "archived",
    name: "Sophie Lam",
    studentName: "Emma Lam",
    phone: "+230 5000 0106",
    email: "sophie.lam@example.com",
    level: "sc",
    courseIds: ["sc-chemistry", "sc-biology"],
    mode: "in-person",
    message: "Looking for Chemistry and Biology for Grade 11 next year. What would two subjects cost per term?",
    notes: "Chose a centre nearer Curepipe. Keep for next year.",
  },
];

function addDemo() {
  const c = state.working;
  const ids = new Set((c.courses || []).map((x) => x.id));
  const now = Date.now();
  const existing = store.listEnquiries();
  const records = DEMO.map((d, i) => {
    const { hoursAgo, ...rest } = d;
    const courseIds = rest.courseIds.filter((id) => ids.has(id));
    if (!courseIds.length && c.courses?.[i]) courseIds.push(c.courses[i].id);
    return {
      id: store.uid("enq"),
      createdAt: new Date(now - hoursAgo * 3600e3).toISOString(),
      notes: "",
      source: "demo",
      ...rest,
      level: (c.levels || []).some((l) => l.id === rest.level) ? rest.level : "",
      courseIds,
    };
  });
  store.setEnquiries([...records, ...existing]);
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function exportCsv(list) {
  const c = state.working;
  const head = ["Received", "Status", "Name", "Student", "Phone", "Email", "Level", "Courses", "Format", "Message", "Notes", "Source", "ID"];
  const rows = list.map((e) => [
    new Date(e.createdAt).toISOString().replace("T", " ").slice(0, 16),
    LABEL[e.status] || e.status,
    e.name,
    e.studentName || "",
    e.phone,
    e.email,
    store.levelName(c, e.level),
    courseList(c, e).map((x) => `${x.code ? `${x.code} ` : ""}${x.title}`).join("; "),
    modeLabel(e.mode),
    e.message,
    e.notes,
    SOURCE[e.source] || e.source || "",
    e.id,
  ]);
  const csv = `﻿${[head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
  download(`enquiries-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
}

/* ------------------------------------------------------------------ detail drawer */

function openDetail(id, ctx, { onClose } = {}) {
  const c = state.working;
  let e = store.listEnquiries().find((x) => x.id === id);
  if (!e) {
    toast("That enquiry isn't on this device any more.");
    return null;
  }
  const wa = e.phone ? store.whatsappLink(waNumber(e.phone), replyText(c, e)) : null;
  const mail = e.email ? store.mailtoLink(e.email, `Your enquiry — ${c.site?.name || "tuition"}`, replyText(c, e)) : null;
  const courses = courseList(c, e);
  const body = html`
    <div class="enq">
      <div class="seg" role="radiogroup" aria-label="Status">
        ${STATUSES.map((s) => html`<button type="button" class="seg__opt seg__opt--${s}" role="radio" aria-checked="${e.status === s ? "true" : "false"}" data-status="${s}" tabindex="${e.status === s ? "0" : "-1"}">${LABEL[s]}</button>`)}
      </div>

      <div class="enq__reply">
        ${wa
          ? html`<a class="a-btn a-btn--primary a-btn--sm" href="${wa}" target="_blank" rel="noopener" data-replied>${icon("whatsapp", { size: 18 })}<span>Reply on WhatsApp</span></a>`
          : html`<span class="a-btn a-btn--ghost a-btn--sm" aria-disabled="true">${icon("whatsapp", { size: 18 })}<span>No phone number</span></span>`}
        ${mail
          ? html`<a class="a-btn a-btn--ghost a-btn--sm" href="${mail}" data-replied>${icon("mail", { size: 18 })}<span>Reply by email</span></a>`
          : html`<span class="a-btn a-btn--ghost a-btn--sm" aria-disabled="true">${icon("mail", { size: 18 })}<span>No email</span></span>`}
      </div>
      <p class="enq__hint">Both open a polite reply you can edit before sending. Replying marks the enquiry as contacted.</p>

      <dl class="dl">
        <div><dt>Received</dt><dd class="num">${fmtDate(e.createdAt)} <span class="muted">(${fmtAgo(e.createdAt)})</span></dd></div>
        ${e.studentName ? html`<div><dt>Student</dt><dd>${e.studentName}</dd></div>` : ""}
        <div><dt>Phone</dt><dd class="num">${e.phone ? html`<a class="link" href="${`tel:${String(e.phone).replace(/[^\d+]/g, "")}`}">${e.phone}</a>` : html`<span class="muted">—</span>`}</dd></div>
        <div><dt>Email</dt><dd>${e.email ? html`<a class="link" href="${`mailto:${e.email}`}">${e.email}</a>` : html`<span class="muted">—</span>`}</dd></div>
        <div><dt>Level</dt><dd>${e.level ? store.levelName(c, e.level) : html`<span class="muted">Not given</span>`}</dd></div>
        <div><dt>Courses</dt><dd>${courses.length
          ? html`<ul class="dl__list">${courses.map((x) => html`<li>${x.code ? html`<span class="mono-code">${x.code}</span>` : ""}${x.title}${x.missing ? html` <span class="muted">(no longer in the catalogue)</span>` : ""}</li>`)}</ul>`
          : html`<span class="muted">None chosen</span>`}</dd></div>
        <div><dt>Format</dt><dd>${modeLabel(e.mode) || html`<span class="muted">No preference</span>`}</dd></div>
        <div><dt>Source</dt><dd>${SOURCE[e.source] || e.source || "Website form"}</dd></div>
      </dl>

      ${e.message ? html`<figure class="enq__msg"><figcaption>Their message</figcaption><blockquote>${e.message}</blockquote></figure>` : ""}

      <div class="f f--textarea">
        <label class="f__label" for="enq-notes"><span>Your notes</span><span class="f__opt" data-notes-state>Saved automatically</span></label>
        <textarea class="a-input a-textarea" id="enq-notes" rows="4" placeholder="Called on Monday, trial lesson Tuesday 15:30…" data-autosize>${e.notes || ""}</textarea>
      </div>
    </div>`;

  const drawer = openDrawer({
    eyebrow: `Enquiry · ${fmtDate(e.createdAt)}`,
    title: e.name || "Unnamed enquiry",
    body,
    footer: html`<button type="button" class="a-btn a-btn--ghost-danger a-btn--sm" data-del>${icon("trash", { size: 16 })}<span>Delete</span></button><span class="drawer__spacer"></span><button type="button" class="a-btn a-btn--ghost" data-drawer-close>Close</button>`,
    initialFocus: '.seg [aria-checked="true"]',
    onClose,
  });
  const root = drawer.dialog;
  const notes = $("#enq-notes", root);
  const notesState = $("[data-notes-state]", root);
  const autosize = () => {
    notes.style.height = "auto";
    notes.style.height = `${Math.min(notes.scrollHeight + 2, 480)}px`;
  };
  requestAnimationFrame(autosize);
  const saveNotes = debounce(() => {
    e = store.updateEnquiry(e.id, { notes: notes.value }) || e;
    notesState.textContent = "Saved";
  }, 400);
  notes.addEventListener("input", () => {
    autosize();
    notesState.textContent = "Saving…";
    saveNotes();
  });
  notes.addEventListener("blur", () => saveNotes.flush());

  const setStatus = (s, { quiet = false } = {}) => {
    if (e.status === s) return;
    e = store.updateEnquiry(e.id, { status: s }) || e;
    $$(".seg__opt", root).forEach((b) => {
      const on = b.dataset.status === s;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    if (!quiet) toast(`Marked as ${LABEL[s].toLowerCase()}`);
  };

  root.addEventListener("click", async (ev) => {
    const st = ev.target.closest("[data-status]");
    if (st) {
      setStatus(st.dataset.status);
      return;
    }
    if (ev.target.closest("[data-replied]") && e.status === "new") setStatus("contacted", { quiet: true });
    if (ev.target.closest("[data-del]")) {
      const ok = await confirmDialog({
        eyebrow: "Delete enquiry",
        title: `Delete the enquiry from ${e.name || "this person"}?`,
        body: html`<p>It is removed from this device. This can't be undone.</p>`,
        confirmLabel: "Delete enquiry",
        danger: true,
      });
      if (ok) {
        store.deleteEnquiry(e.id);
        await drawer.close();
        toast("Enquiry deleted");
      }
    }
  });
  // Arrow keys move between statuses (radio group pattern).
  $(".seg", root).addEventListener("keydown", (ev) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(ev.key)) return;
    ev.preventDefault();
    const i = STATUSES.indexOf(e.status);
    const next = STATUSES[(i + (ev.key === "ArrowLeft" || ev.key === "ArrowUp" ? -1 : 1) + STATUSES.length) % STATUSES.length];
    setStatus(next);
    $(`[data-status="${next}"]`, root).focus();
  });
  return drawer;
}

function openAdd(ctx) {
  const draft = { name: "", studentName: "", phone: "", email: "", level: "", mode: "", courseIds: [], message: "" };
  const drawer = openDrawer({
    eyebrow: "New enquiry",
    title: "Add an enquiry",
    body: html`<p class="drawer__intro">For enquiries that came in by WhatsApp, phone or email — keep them here with the rest.</p><form class="drawer-form" novalidate data-form>${renderFields(enquiryFields, draft, state.working)}</form>`,
    footer: html`<span class="drawer__spacer"></span><button type="button" class="a-btn a-btn--ghost" data-drawer-close>Cancel</button><button type="button" class="a-btn a-btn--primary" data-save>Add enquiry</button>`,
  });
  const form = bindForm(drawer.body, enquiryFields, { item: draft, content: state.working, onField: () => {} });
  const save = () => {
    const errors = form.validateAll();
    if (errors.length) return focusFirstError(errors);
    form.collect(draft);
    const rec = store.addEnquiry({ ...draft, source: "manual" });
    drawer.close();
    toast(`Added the enquiry from ${rec.name}`, { tone: "ok" });
  };
  drawer.dialog.addEventListener("click", (e) => {
    if (e.target.closest("[data-save]")) save();
  });
  drawer.dialog.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    }
  });
}

/* ------------------------------------------------------------------ view */

export const fmtWa = (d) => {
  const s = String(d || "").replace(/\D/g, "");
  const m = /^230(\d{4})(\d{4})$/.exec(s);
  return m ? `+230 ${m[1]} ${m[2]}` : s ? `+${s}` : "";
};

function callout(c) {
  const wa = c.site?.whatsapp;
  return html`<aside class="callout callout--margin" data-a-intro>
    <p class="callout__k">Where enquiries come from</p>
    <p>This website has no server, so this list only holds enquiries <strong>made in this browser</strong>, or added here by hand. When a parent enquires from their own phone, the form opens WhatsApp with their message to ${wa ? html`<span class="num">${fmtWa(wa)}</span>` : "your WhatsApp number"}${c.site?.formEndpoint ? html` and sends a copy to your email through the form endpoint` : ""}. ${c.site?.formEndpoint
      ? ""
      : html`To receive them by email as well, add a <a class="link" href="#site/contact">form endpoint</a>.`}</p>
  </aside>`;
}

export default {
  id: "enquiries",
  title: "Enquiries",
  render(ctx) {
    return html`${viewHead(ctx, {
      title: "Enquiries",
      lead: "Parents and students who asked about a place. Keep notes and statuses here; reply on WhatsApp or by email in one click.",
      actions: html`<button type="button" class="a-btn a-btn--primary a-btn--sm" data-enq="add">${icon("plus", { size: 16 })}<span>Add enquiry</span></button>
        <button type="button" class="a-btn a-btn--ghost a-btn--sm" data-enq="csv">${icon("download", { size: 16 })}<span>Export CSV</span></button>`,
    })}
    ${callout(state.working)}
    <section class="block" data-a-intro aria-label="Enquiries">
      <div class="coll__bar">
        <label class="search">${icon("search", { size: 18 })}<span class="sr-only">Search enquiries</span><input type="search" class="search__input" placeholder="Search names, courses, messages" data-enq-q autocomplete="off" /></label>
        <div class="chips" role="group" aria-label="Filter by status" data-enq-chips></div>
      </div>
      <div data-enq-list></div>
      <div class="enq-tools" data-enq-tools>
        <button type="button" class="a-link" data-enq="demo">Add demo enquiries</button>
        <span aria-hidden="true">·</span>
        <button type="button" class="a-link a-link--danger" data-enq="clear">Clear all</button>
      </div>
    </section>`;
  },
  mount(root, ctx) {
    const ui = { q: "", status: "" };
    const listEl = $("[data-enq-list]", root);
    const chipsEl = $("[data-enq-chips]", root);
    let current = null;

    const draw = () => {
      const c = state.working;
      const all = store.listEnquiries();
      const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((e) => e.status === s).length]));
      render(
        chipsEl,
        html`<button type="button" class="a-chip" aria-pressed="${ui.status === "" ? "true" : "false"}" data-chip="">All <span class="a-chip__n">${all.length}</span></button>
          ${STATUSES.map((s) => html`<button type="button" class="a-chip" aria-pressed="${ui.status === s ? "true" : "false"}" data-chip="${s}">${LABEL[s]} <span class="a-chip__n">${counts[s]}</span></button>`)}`
      );
      const q = ui.q.trim().toLowerCase();
      const list = all.filter((e) => {
        if (ui.status && e.status !== ui.status) return false;
        if (!q) return true;
        const text = [e.name, e.studentName, e.email, e.phone, e.message, e.notes, ...courseList(c, e).map((x) => `${x.code} ${x.title}`)].join(" ").toLowerCase();
        return q.split(/\s+/).every((w) => text.includes(w));
      });
      $("[data-enq-tools]", root).hidden = !all.length;
      if (!all.length) {
        render(
          listEl,
          html`<div class="empty">
            <p class="empty__title">No enquiries on this device yet.</p>
            <p class="empty__text">When someone sends the enquiry form in this browser it appears here. To see how the inbox works, add a few demo enquiries — you can clear them afterwards.</p>
            <div class="empty__acts"><button type="button" class="a-btn a-btn--ghost a-btn--sm" data-enq="demo">Add demo enquiries</button></div>
          </div>`
        );
        return;
      }
      if (!list.length) {
        render(listEl, html`<div class="empty empty--slim"><p class="empty__title">Nothing matches.</p><p class="empty__text">Try another status or search.</p></div>`);
        return;
      }
      render(
        listEl,
        html`<table class="table enq-table">
          <thead><tr><th scope="col">Received</th><th scope="col">From</th><th scope="col">Interested in</th><th scope="col">Contact</th><th scope="col">Status</th></tr></thead>
          <tbody>
            ${list.map((e) => {
              const cs = courseList(c, e);
              return html`<tr class="enq-row${e.status === "new" ? " is-new" : ""}" data-id="${e.id}">
                <td class="enq-row__date num"><span>${fmtDate(e.createdAt, { time: false })}</span><span class="muted">${fmtAgo(e.createdAt)}</span></td>
                <td class="enq-row__who"><button type="button" class="enq-row__open" data-open="${e.id}"><span class="enq-row__name">${e.name || "Unnamed"}</span>${e.studentName && e.studentName !== e.name ? html`<span class="muted">for ${e.studentName}</span>` : ""}</button></td>
                <td class="enq-row__courses">${cs.length ? cs.map((x) => html`<span class="mono-code" title="${x.title}">${x.code || x.title}</span>`) : html`<span class="muted">—</span>`}${e.message ? html`<span class="enq-row__msg">${e.message}</span>` : ""}</td>
                <td class="enq-row__contact num">${e.phone || ""}${e.email ? html`<span class="muted">${e.email}</span>` : ""}</td>
                <td><span class="chip-status chip-status--${e.status}">${LABEL[e.status] || e.status}</span></td>
              </tr>`;
            })}
          </tbody>
        </table>`
      );
    };

    const open = (id) => {
      current = openDetail(id, ctx, {
        onClose: () => {
          current = null;
          ctx.replaceRoute("enquiries");
          const row = listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
          if (row) flash(row);
        },
      });
      if (current) ctx.replaceRoute(`enquiries/${encodeURIComponent(id)}`);
    };

    const onClick = async (e) => {
      const chip = e.target.closest("[data-chip]");
      if (chip) {
        ui.status = chip.dataset.chip;
        draw();
        chipsEl.querySelector(`[data-chip="${ui.status}"]`)?.focus();
        return;
      }
      const openBtn = e.target.closest("[data-open]");
      const row = e.target.closest(".enq-row");
      if (openBtn || row) {
        open((openBtn || row).dataset.open || row.dataset.id);
        return;
      }
      const act = e.target.closest("[data-enq]")?.dataset.enq;
      if (act === "add") openAdd(ctx);
      else if (act === "csv") {
        const list = store.listEnquiries();
        if (!list.length) return toast("There are no enquiries to export yet.");
        exportCsv(list);
        toast(`Exported ${list.length} ${list.length === 1 ? "enquiry" : "enquiries"} as CSV`, { tone: "ok" });
      } else if (act === "demo") {
        addDemo();
        toast("Added 6 demo enquiries", { detail: "They're marked “Demo data”. Clear them before you go live." });
      } else if (act === "clear") {
        const n = store.listEnquiries().length;
        if (!n) return toast("The inbox is already empty.");
        const ok = await confirmDialog({
          eyebrow: "Clear inbox",
          title: `Delete all ${n} ${n === 1 ? "enquiry" : "enquiries"}?`,
          body: html`<p>They're removed from this device. Export a CSV first if you want to keep a copy.</p>`,
          confirmLabel: "Delete all",
          danger: true,
        });
        if (ok) {
          store.setEnquiries([]);
          toast("Inbox cleared");
        }
      }
    };
    const onInput = debounce((e) => {
      ui.q = e.target.value;
      draw();
    }, 120);
    const onIn = (e) => {
      if (e.target.matches("[data-enq-q]")) onInput(e);
    };
    root.addEventListener("click", onClick);
    root.addEventListener("input", onIn);
    const unsub = store.onStoreChange((kind) => {
      if (kind === "enquiries") draw();
    });
    draw();
    if (ctx.params[0]) setTimeout(() => open(decodeURIComponent(ctx.params[0])), 60);
    this._open = open;
    return () => {
      unsub();
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onIn);
    };
  },
  onParams(params) {
    if (params[0] && this._open) this._open(decodeURIComponent(params[0]));
  },
};
