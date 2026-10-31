// Collection schemas: what each list looks like in the admin and which fields its editor has.

import { html } from "../../assets/js/ui.js";
import * as store from "../../assets/js/store.js";

const { formatRs, levelName, categoryName, byId, slugify, sessionsFor, dayShort } = store;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const MODES = [
  { value: "hybrid", label: "Hybrid" },
  { value: "in-person", label: "In person" },
  { value: "online", label: "Online" },
];
export const modeLabel = (m) => ({ hybrid: "Hybrid", "in-person": "In person", online: "Online" })[m] || m || "";

export const RESOURCE_TYPES = [
  { value: "past-paper", label: "Past paper" },
  { value: "worksheet", label: "Worksheet" },
  { value: "notes", label: "Notes" },
  { value: "video", label: "Video" },
];
const typeLabel = (t) => RESOURCE_TYPES.find((x) => x.value === t)?.label || t || "";

const visibleField = (what = "on the site") => ({ key: "visible", type: "toggle", label: `Show ${what}`, onText: "Shown", offText: "Hidden" });

/* ------------------------------------------------------------------ courses */

export const courses = {
  path: "courses",
  singular: "course",
  plural: "courses",
  hasVisible: true,
  deps: ["levels", "categories", "tutors", "timetable"],
  cascade: ["timetable"],
  makeId: (c) => [c.level, slugify(c.title)].filter(Boolean).join("-"),
  filters: [{ key: "level", label: "Level", options: "levels" }],
  siteLink: (c) => `../#/courses/${encodeURIComponent(c.id)}`,
  titleOf: (c) => c.title,
  search: (c, content) => [c.title, c.code, c.summary, levelName(content, c.level), categoryName(content, c.category), ...(c.topics || []), byId(content.tutors, c.tutorId)?.name].join(" "),
  row: (c, i, content) => {
    const sessions = sessionsFor(content, c.id);
    return {
      lead: c.code || "—",
      title: c.title,
      meta: [levelName(content, c.level), categoryName(content, c.category), `${formatRs(c.fee)} / mo`, modeLabel(c.mode), byId(content.tutors, c.tutorId)?.name],
      tags: [
        c.featured ? { label: "Featured", tone: "ink" } : null,
        Number(c.seatsLeft) <= 0 ? { label: "Full", tone: "red" } : Number(c.seatsLeft) <= 2 ? { label: `${c.seatsLeft} left`, tone: "amber" } : { label: `${c.seatsLeft} of ${c.seats} left`, tone: "plain" },
        sessions.length ? { label: sessions.map((s) => dayShort(s.day)).join(" "), tone: "plain" } : { label: "Not timetabled", tone: "warn" },
      ],
    };
  },
  create: (content) => ({
    id: "",
    title: "",
    code: "",
    level: content.levels[0]?.id || "",
    category: content.categories[0]?.id || "",
    summary: "",
    description: "",
    topics: [],
    mode: "hybrid",
    fee: 1800,
    seats: 12,
    seatsLeft: 12,
    tutorId: content.tutors[0]?.id || "",
    featured: false,
    visible: true,
  }),
  deleteNote: (c, content) => {
    const n = sessionsFor(content, c.id).length;
    return n ? `${plural(n, "timetable session")} for this course will be removed as well.` : "";
  },
  onDelete: (c, content) => {
    content.timetable = (content.timetable || []).filter((s) => s.courseId !== c.id);
  },
  groups: [
    {
      title: "Basics",
      fields: [
        { key: "title", label: "Course title", required: true, placeholder: "Mathematics", autofocus: true, width: "two" },
        { key: "code", label: "Syllabus code", mono: true, placeholder: "4024", hint: "Cambridge code. Leave blank for NCE.", width: "third", maxlength: 12 },
        { key: "level", label: "Level", type: "select", options: "levels", required: true, width: "half" },
        { key: "category", label: "Subject group", type: "select", options: "categories", required: true, width: "half" },
        { key: "tutorId", label: "Tutor", type: "select", options: "tutors", allowEmpty: true, emptyLabel: "— No tutor shown —", width: "half" },
        { key: "mode", label: "Format", type: "select", options: MODES, required: true, width: "half", hint: "Hybrid: in the room and on Zoom at once." },
      ],
    },
    {
      title: "On the course page",
      fields: [
        { key: "summary", label: "One-line summary", type: "textarea", rows: 2, required: true, counter: 140, hint: "Shown on the course card." },
        { key: "description", label: "Description", type: "textarea", rows: 7, hint: "Leave a blank line between paragraphs." },
        { key: "topics", label: "Topics covered", type: "list", itemLabel: "topic", itemPlaceholder: "e.g. Simultaneous equations", hint: "Enter adds a line · paste a list to add many · Alt + ↑/↓ moves a line." },
      ],
    },
    {
      title: "Fees & places",
      fields: [
        { key: "fee", label: "Monthly fee", type: "number", prefix: "Rs", suffix: "/ month", required: true, integer: true, min: 0, step: 50, width: "half" },
        { key: "seats", label: "Places in the group", type: "number", required: true, integer: true, min: 1, max: 60, width: "quarter" },
        {
          key: "seatsLeft",
          label: "Places left",
          type: "number",
          required: true,
          integer: true,
          min: 0,
          width: "quarter",
          validate: (v, item) => (Number.isFinite(item.seats) && v > item.seats ? "Can't be more than the places in the group." : null),
        },
      ],
    },
    {
      title: "Display",
      fields: [
        { key: "featured", type: "toggle", label: "Feature on the homepage", onText: "Featured", offText: "No" },
        visibleField(),
      ],
    },
  ],
  notes: (c, content) => {
    if (!c.id) return "";
    const s = sessionsFor(content, c.id);
    return s.length
      ? html`<p class="note"><span class="note__k">Timetable</span>${s.map((x) => `${dayShort(x.day)} ${x.start}–${x.end}`).join(" · ")} <a href="#timetable" class="note__link">Edit in Timetable</a></p>`
      : html`<p class="note note--warn"><span class="note__k">Timetable</span>No sessions yet — add them in <a href="#timetable" class="note__link">Timetable</a> so the course page shows when it runs.</p>`;
  },
};

/* ------------------------------------------------------------------ tutors */

export const tutors = {
  path: "tutors",
  singular: "tutor",
  plural: "tutors",
  hasVisible: true,
  deps: ["courses"],
  makeId: (t) => slugify(t.name),
  siteLink: () => "../#/tutors",
  titleOf: (t) => t.name,
  search: (t) => [t.name, t.role, t.bio, ...(t.subjects || [])].join(" "),
  row: (t, i, content) => {
    const n = (content.courses || []).filter((c) => c.tutorId === t.id).length;
    const initials = (String(t.name || "").match(/\p{L}[\p{L}'’-]*/gu) || ["?"]).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    return {
      lead: initials,
      title: t.name,
      meta: [t.role, t.years ? `${t.years} years teaching` : "", plural(n, "course")],
      tags: [t.photo ? { label: "Photo", tone: "plain" } : { label: "Initials", tone: "plain" }],
    };
  },
  create: () => ({ id: "", name: "", role: "", bio: "", subjects: [], credentials: [], years: null, photo: "", visible: true }),
  deleteNote: (t, content) => {
    const n = (content.courses || []).filter((c) => c.tutorId === t.id).length;
    return n ? `${plural(n, "course")} name this tutor; they'll show no tutor until you pick another.` : "";
  },
  onDelete: (t, content) => {
    for (const c of content.courses || []) if (c.tutorId === t.id) c.tutorId = "";
  },
  cascade: ["courses"],
  groups: [
    {
      title: "Who",
      fields: [
        { key: "name", label: "Name", required: true, placeholder: "Priya N.", autofocus: true, width: "half" },
        { key: "role", label: "Role", placeholder: "Chemistry, Biology & Grade 7–9", width: "half" },
        { key: "years", label: "Years teaching", type: "number", integer: true, min: 0, max: 60, width: "quarter" },
        { key: "bio", label: "Short biography", type: "textarea", rows: 5 },
      ],
    },
    {
      title: "Subjects & qualifications",
      fields: [
        { key: "subjects", label: "Subjects", type: "list", variant: "tags", placeholder: "Add a subject and press Enter" },
        { key: "credentials", label: "Qualifications", type: "list", itemLabel: "qualification", itemPlaceholder: "BSc (Hons) Chemistry, University of Mauritius" },
      ],
    },
    {
      title: "Photo & display",
      fields: [
        { key: "photo", label: "Photo address", type: "image", placeholder: "https://… or ../assets/img/tutor-priya.jpg", hint: "Optional. Without a photo the site shows a monogram of their initials.", emptyPreview: "Initials shown" },
        visibleField(),
      ],
    },
  ],
};

/* ------------------------------------------------------------------ testimonials */

export const testimonials = {
  path: "testimonials",
  singular: "testimonial",
  plural: "testimonials",
  hasVisible: true,
  idPrefix: "t",
  siteLink: () => "../#/",
  titleOf: (t) => t.name,
  search: (t) => [t.quote, t.name, t.detail].join(" "),
  row: (t) => ({ title: `“${String(t.quote || "").slice(0, 92)}${String(t.quote || "").length > 92 ? "…" : ""}”`, meta: [t.name, t.detail] }),
  create: () => ({ id: "", quote: "", name: "", detail: "", visible: true }),
  onDuplicate: (t) => (t.name = `${t.name} (copy)`),
  fields: [
    { key: "quote", label: "What they said", type: "textarea", rows: 4, required: true, autofocus: true, counter: 280, hint: "Their words, lightly edited. Ask permission before publishing." },
    { key: "name", label: "Name", required: true, placeholder: "Riya S.", width: "half", hint: "First name and initial is usual." },
    { key: "detail", label: "Detail", placeholder: "SC 2025 · Additional Mathematics", width: "half" },
    visibleField(),
  ],
};

/* ------------------------------------------------------------------ plans */

export const plans = {
  path: "plans",
  singular: "plan",
  plural: "plans",
  hasVisible: true,
  makeId: (p) => slugify(p.name),
  siteLink: () => "../#/plans",
  titleOf: (p) => p.name,
  search: (p) => [p.name, p.description, ...(p.features || [])].join(" "),
  row: (p) => {
    const saving = p.monthly && p.termly ? Math.round((1 - p.termly / (p.monthly * 3)) * 100) : 0;
    return {
      lead: formatRs(p.monthly),
      title: p.name,
      meta: [p.termly ? `${formatRs(p.termly)} a term${saving > 0 ? ` (saves ${saving}%)` : ""}` : "", plural((p.features || []).length, "feature")],
      tags: [p.highlighted ? { label: "Highlighted", tone: "ink" } : null],
    };
  },
  create: () => ({ id: "", name: "", monthly: null, termly: null, description: "", features: [], highlighted: false, ctaLabel: "Enrol", visible: true }),
  groups: [
    {
      title: "Plan",
      fields: [
        { key: "name", label: "Plan name", required: true, placeholder: "Two subjects", autofocus: true },
        { key: "monthly", label: "Per month", type: "number", prefix: "Rs", required: true, integer: true, min: 0, step: 50, width: "half" },
        {
          key: "termly",
          label: "Per term (3 months)",
          type: "number",
          prefix: "Rs",
          integer: true,
          min: 0,
          step: 50,
          width: "half",
          hint: "Optional. Usually a little less than three months.",
          validate: (v, item) => (v && item.monthly && v > item.monthly * 3 ? "That's more than three monthly payments." : null),
        },
        { key: "description", label: "Description", type: "textarea", rows: 3 },
      ],
    },
    {
      title: "What's included",
      fields: [{ key: "features", label: "Features", type: "list", itemLabel: "feature", itemPlaceholder: "Homework marked within 48 hours" }],
    },
    {
      title: "Button & display",
      fields: [
        { key: "ctaLabel", label: "Button label", placeholder: "Choose two subjects", width: "half" },
        { key: "highlighted", type: "toggle", label: "Highlight this plan", onText: "Highlighted", offText: "No", hint: "Highlight one plan at most." },
        visibleField(),
      ],
    },
  ],
  notes: (p, content) => {
    const others = (content.plans || []).filter((x) => x.highlighted && x.id !== p.id);
    return p.highlighted && others.length
      ? html`<p class="note note--warn"><span class="note__k">Note</span>“${others[0].name}” is also highlighted. Highlight one plan so the choice is clear.</p>`
      : "";
  },
};

/* ------------------------------------------------------------------ resources */

export const resources = {
  path: "resources",
  singular: "resource",
  plural: "resources",
  hasVisible: true,
  idPrefix: "r",
  deps: ["levels", "categories"],
  siteLink: () => "../#/resources",
  filters: [
    { key: "type", label: "Type", options: RESOURCE_TYPES, allLabel: "All types" },
    { key: "level", label: "Level", options: "levels" },
  ],
  titleOf: (r) => r.title,
  search: (r, content) => [r.title, r.description, typeLabel(r.type), levelName(content, r.level), categoryName(content, r.category), r.year].join(" "),
  row: (r, i, content) => ({
    lead: typeLabel(r.type),
    title: r.title,
    meta: [levelName(content, r.level), categoryName(content, r.category), r.year],
    tags: [r.url ? { label: "Link", tone: "plain" } : { label: "On request", tone: "plain" }],
  }),
  create: (content) => ({ id: "", title: "", type: "worksheet", level: content.levels[0]?.id || "", category: content.categories[0]?.id || "", year: new Date().getFullYear(), description: "", url: "", visible: true }),
  fields: [
    { key: "title", label: "Title", required: true, autofocus: true, placeholder: "4024 Paper 2, November 2024: worked solutions" },
    { key: "type", label: "Type", type: "select", options: RESOURCE_TYPES, required: true, width: "half" },
    { key: "year", label: "Year", type: "number", integer: true, min: 1990, max: 2100, width: "half" },
    { key: "level", label: "Level", type: "select", options: "levels", required: true, width: "half" },
    { key: "category", label: "Subject group", type: "select", options: "categories", required: true, width: "half" },
    { key: "description", label: "Description", type: "textarea", rows: 3 },
    { key: "url", label: "Link to the file or video", type: "url", placeholder: "https://drive.google.com/…", hint: "Leave blank and the site shows a “Request” button instead, which opens the enquiry form." },
    visibleField(),
  ],
};

/* ------------------------------------------------------------------ FAQs */

export const faqs = {
  path: "faqs",
  singular: "question",
  plural: "questions",
  idPrefix: "f",
  siteLink: () => "../#/plans",
  titleOf: (f) => f.q,
  search: (f) => [f.q, f.a].join(" "),
  row: (f) => ({ title: f.q, meta: [String(f.a || "").slice(0, 110) + (String(f.a || "").length > 110 ? "…" : "")] }),
  create: () => ({ id: "", q: "", a: "" }),
  onDuplicate: (f) => (f.q = `${f.q} (copy)`),
  fields: [
    { key: "q", label: "Question", required: true, autofocus: true, placeholder: "Can my child try a lesson before we pay?" },
    { key: "a", label: "Answer", type: "textarea", rows: 6, required: true },
  ],
};

/* ------------------------------------------------------------------ site building blocks */

export const levels = {
  path: "levels",
  singular: "level",
  plural: "levels",
  deps: ["courses"],
  noDuplicate: true,
  makeId: (l) => slugify(l.name),
  titleOf: (l) => l.name,
  search: (l) => [l.name, l.exam, l.summary].join(" "),
  row: (l, i, content) => ({ lead: l.id, title: l.name, meta: [l.exam, plural((content.courses || []).filter((c) => c.level === l.id).length, "course")] }),
  create: () => ({ id: "", name: "", exam: "", summary: "" }),
  deleteNote: (l, content) => {
    const n = (content.courses || []).filter((c) => c.level === l.id).length;
    return n ? `${plural(n, "course")} use this level. Move them to another level first, or they won't appear under any level.` : "";
  },
  fields: [
    { key: "name", label: "Name", required: true, autofocus: true, placeholder: "Grade 10–11", width: "half" },
    { key: "exam", label: "Exam", placeholder: "SC · Cambridge O Level", width: "half" },
    { key: "summary", label: "Summary", type: "textarea", rows: 5 },
  ],
};

export const categories = {
  path: "categories",
  singular: "subject group",
  plural: "subject groups",
  deps: ["courses"],
  noDuplicate: true,
  makeId: (c) => slugify(c.name),
  titleOf: (c) => c.name,
  search: (c) => c.name,
  row: (c, i, content) => ({ lead: c.id, title: c.name, meta: [plural((content.courses || []).filter((x) => x.category === c.id).length, "course")] }),
  create: () => ({ id: "", name: "" }),
  deleteNote: (c, content) => {
    const n = (content.courses || []).filter((x) => x.category === c.id).length;
    return n ? `${plural(n, "course")} are in this group. Move them first so the subject filter still finds them.` : "";
  },
  fields: [{ key: "name", label: "Name", required: true, autofocus: true, placeholder: "Sciences" }],
};

export const stats = {
  path: "stats",
  singular: "number",
  plural: "numbers",
  idField: false,
  titleOf: (s) => s.label,
  search: (s) => [s.value, s.label].join(" "),
  row: (s) => ({ lead: `${s.prefix || ""}${s.value ?? ""}${s.suffix || ""}`, title: s.label }),
  create: () => ({ value: null, prefix: "", suffix: "", label: "" }),
  onDuplicate: (s) => (s.label = `${s.label} (copy)`),
  editorIntro: "Keep these modest and checkable. Parents trust “12 students at most” more than “10,000+ success stories”.",
  fields: [
    { key: "value", label: "Number", type: "number", required: true, min: 0, autofocus: true, width: "third" },
    { key: "prefix", label: "Before", placeholder: "Rs", width: "third", maxlength: 6 },
    { key: "suffix", label: "After", placeholder: "h", width: "third", maxlength: 6 },
    { key: "label", label: "Label", required: true, placeholder: "students in a group, at most" },
  ],
};

export const method = {
  path: "method",
  singular: "step",
  plural: "steps",
  idField: false,
  titleOf: (m) => m.title,
  search: (m) => [m.title, m.text].join(" "),
  row: (m) => ({ title: m.title, meta: [String(m.text || "").slice(0, 100) + (String(m.text || "").length > 100 ? "…" : "")] }),
  create: () => ({ title: "", text: "" }),
  onDuplicate: (m) => (m.title = `${m.title} (copy)`),
  fields: [
    { key: "title", label: "Step", required: true, autofocus: true, placeholder: "Homework, marked" },
    { key: "text", label: "What happens", type: "textarea", rows: 4, required: true },
  ],
};

/* ------------------------------------------------------------------ quiz */

export const questions = {
  path: "quiz.questions",
  singular: "question",
  plural: "questions",
  idPrefix: "q",
  deps: ["levels", "categories"],
  drawerSize: "lg",
  siteLink: () => "../#/quiz",
  filters: [
    { key: "category", label: "Subject", options: "categories", allLabel: "All subjects" },
    { key: "level", label: "Level", options: "levels" },
  ],
  titleOf: (q) => q.prompt,
  search: (q, content) => [q.prompt, ...(q.options || []), q.explain, categoryName(content, q.category), levelName(content, q.level)].join(" "),
  row: (q, i, content) => {
    const ok = Array.isArray(q.options) && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length;
    return {
      num: `Q.${String(i + 1).padStart(2, "0")}`,
      title: q.prompt,
      meta: [categoryName(content, q.category), levelName(content, q.level), plural((q.options || []).length, "option"), ok ? `answer ${"ABCDEF"[q.answer]}` : ""],
      tags: [ok ? null : { label: "Check answer", tone: "red" }],
      warn: !ok,
    };
  },
  create: (content) => ({ id: "", category: content.categories[0]?.id || "", level: content.levels[0]?.id || "", prompt: "", options: ["", "", "", ""], answer: 0, explain: "" }),
  onDuplicate: (q) => (q.prompt = `${q.prompt} (copy)`),
  groups: [
    {
      title: "Question",
      fields: [
        { key: "category", label: "Subject group", type: "select", options: "categories", required: true, width: "half" },
        { key: "level", label: "Level", type: "select", options: "levels", required: true, width: "half" },
        { key: "prompt", label: "Question", type: "textarea", rows: 3, required: true, autofocus: true },
      ],
    },
    {
      title: "Options",
      note: "Circle the correct answer by clicking its letter. Two to six options.",
      fields: [
        {
          key: "options",
          label: "Answer options",
          type: "choices",
          get: (q) => ({ options: q.options || [], answer: q.answer }),
          set: (q, v) => {
            q.options = v.options;
            q.answer = v.answer;
          },
        },
      ],
    },
    {
      title: "Feedback",
      fields: [{ key: "explain", label: "Explanation shown after answering", type: "textarea", rows: 3, hint: "One or two sentences: why the right answer is right." }],
    },
  ],
};

export const results = {
  path: "quiz.results",
  singular: "result band",
  plural: "result bands",
  idField: false,
  noDuplicate: true,
  deps: ["levels"],
  titleOf: (r) => r.title,
  search: (r) => [r.title, r.text].join(" "),
  row: (r, i, content) => ({ lead: `${r.min ?? "?"}–${r.max ?? "?"}%`, title: r.title, meta: [r.recommend ? `Suggests ${levelName(content, r.recommend)}` : "No level suggested"] }),
  create: (content) => {
    const list = content.quiz?.results || [];
    const top = list.reduce((m, r) => Math.max(m, Number(r.max) || 0), -1);
    const min = Math.min(100, top + 1);
    return { min, max: 100, title: "", text: "", recommend: "" };
  },
  insertAt: (r, list) => {
    const i = list.findIndex((x) => Number(x.min) > Number(r.min));
    return i < 0 ? list.length : i;
  },
  fields: [
    { key: "min", label: "From", type: "number", suffix: "%", integer: true, min: 0, max: 100, required: true, width: "quarter" },
    {
      key: "max",
      label: "To",
      type: "number",
      suffix: "%",
      integer: true,
      min: 0,
      max: 100,
      required: true,
      width: "quarter",
      validate: (v, r) => (Number.isFinite(r.min) && v < r.min ? "“To” must be at least “From”." : null),
    },
    { key: "recommend", label: "Suggest level", type: "select", options: "levels", allowEmpty: true, width: "half" },
    { key: "title", label: "Result title", required: true, autofocus: true, placeholder: "Ready for SC work" },
    { key: "text", label: "What to tell them", type: "textarea", rows: 4, required: true },
  ],
};

/* ------------------------------------------------------------------ timetable */

export const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

export const sessions = {
  path: "timetable",
  singular: "session",
  plural: "sessions",
  idPrefix: "s",
  deps: ["courses", "tutors"],
  titleOf: (s, content) => {
    const c = byId(content?.courses, s.courseId);
    return c ? `${c.code ? `${c.code} · ` : ""}${c.title}` : "Session";
  },
  create: (content) => ({ id: "", day: "mon", start: "15:30", end: "17:00", courseId: content.courses[0]?.id || "", room: "" }),
  fields: [
    { key: "courseId", label: "Course", type: "select", options: "courses", required: true, autofocus: true },
    { key: "day", label: "Day", type: "select", options: "days", required: true, width: "third" },
    { key: "start", label: "Starts", type: "time", required: true, width: "third" },
    {
      key: "end",
      label: "Ends",
      type: "time",
      required: true,
      width: "third",
      validate: (v, s) => (toMin(v) <= toMin(s.start) ? "Must be later than the start time." : null),
    },
    { key: "room", label: "Room or link", placeholder: "Room A + Zoom", hint: "Shown next to the time, e.g. “Room B · Quatre Bornes” or “Online · Zoom”." },
  ],
};

/* ------------------------------------------------------------------ enquiries (manual add) */

export const enquiryFields = [
  { key: "name", label: "Name", required: true, autofocus: true, width: "half", placeholder: "Who contacted you" },
  { key: "studentName", label: "Student", width: "half", placeholder: "If different" },
  { key: "phone", label: "Phone / WhatsApp", width: "half", inputmode: "tel", placeholder: "+230 5…" },
  { key: "email", label: "Email", type: "email", width: "half", placeholder: "name@example.com" },
  { key: "level", label: "Level", type: "select", options: "levels", allowEmpty: true, emptyLabel: "— Not sure —", width: "half" },
  { key: "mode", label: "Preferred format", type: "select", options: [{ value: "", label: "— No preference —" }, ...MODES], width: "half" },
  { key: "courseIds", label: "Courses", type: "checks", options: "courses" },
  { key: "message", label: "Message", type: "textarea", rows: 4 },
];
