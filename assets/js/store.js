// Shared data layer for the public site and the admin panel.
// The site is fully static: published content lives in data/content.json (committed to GitHub).
// Admin edits are kept as a local draft (localStorage) until they are published back to GitHub
// through the Contents API with a personal access token that never leaves this browser.

const KEYS = {
  draft: "kt.draft.v1",
  enquiries: "kt.enquiries.v1",
  session: "kt.admin.session.v1",
  github: "kt.github.v1",
  viewLive: "kt.viewLive.v1",
};

export const CONTENT_URL = new URL("../../data/content.json", import.meta.url).href;
export const SITE_ROOT = new URL("../../", import.meta.url).href;
export const ADMIN_URL = new URL("../../admin/", import.meta.url).href;

export const DEFAULT_PASSWORD = "admin123";
export const DEFAULT_PASSWORD_HASH = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

export const DAYS = [
  { id: "mon", short: "Mon", name: "Monday" },
  { id: "tue", short: "Tue", name: "Tuesday" },
  { id: "wed", short: "Wed", name: "Wednesday" },
  { id: "thu", short: "Thu", name: "Thursday" },
  { id: "fri", short: "Fri", name: "Friday" },
  { id: "sat", short: "Sat", name: "Saturday" },
  { id: "sun", short: "Sun", name: "Sunday" },
];

export const ENQUIRY_STATUSES = ["new", "contacted", "enrolled", "archived"];

export const MODE_LABELS = { online: "Online", "in-person": "In person", hybrid: "Hybrid (room + Zoom)" };

/* ------------------------------------------------------------------ storage */

function read(storage, key, fallback = null) {
  try {
    const raw = storage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const local = () => (typeof localStorage !== "undefined" ? localStorage : null);
const session = () => (typeof sessionStorage !== "undefined" ? sessionStorage : null);

function emit(kind) {
  try {
    window.dispatchEvent(new CustomEvent("kt:store", { detail: { kind } }));
  } catch {}
}

/** Subscribe to draft/enquiry changes from this tab and other tabs. Returns an unsubscribe fn. */
export function onStoreChange(cb) {
  const onLocal = (e) => cb(e.detail.kind);
  const onStorage = (e) => {
    if (e.key === KEYS.draft) cb("draft");
    else if (e.key === KEYS.enquiries) cb("enquiries");
  };
  window.addEventListener("kt:store", onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("kt:store", onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

/* ------------------------------------------------------------------ content */

const EMPTY = {
  meta: { schema: 1, updatedAt: null, sample: false },
  site: {
    name: "",
    wordmark: "",
    tagline: "",
    description: "",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    hours: "",
    mapUrl: "",
    formEndpoint: "",
    social: { facebook: "", instagram: "", youtube: "", tiktok: "" },
    announcement: { enabled: false, text: "", linkLabel: "", href: "" },
    payment: { juice: "", bank: "", note: "" },
  },
  hero: {
    eyebrow: "",
    title: "",
    highlight: "",
    subtitle: "",
    primaryCta: { label: "", href: "" },
    secondaryCta: { label: "", href: "" },
  },
  stats: [],
  levels: [],
  categories: [],
  method: [],
  courses: [],
  tutors: [],
  testimonials: [],
  plans: [],
  timetable: [],
  resources: [],
  quiz: { title: "", intro: "", questions: [], results: [] },
  faqs: [],
  admin: { passwordHash: DEFAULT_PASSWORD_HASH },
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

function mergeShape(shape, value) {
  if (Array.isArray(shape)) return Array.isArray(value) ? value : [];
  if (isObj(shape)) {
    const out = isObj(value) ? { ...value } : {};
    for (const k of Object.keys(shape)) out[k] = mergeShape(shape[k], out[k]);
    return out;
  }
  return value === undefined || value === null ? shape : value;
}

/** Fill in any missing keys so views never crash on partial content. */
export function normalizeContent(content) {
  return mergeShape(EMPTY, content);
}

/** Light sanity check used before importing a JSON file. Returns a list of problems. */
export function validateContent(content) {
  const problems = [];
  if (!isObj(content)) return ["The file is not a JSON object."];
  if (!isObj(content.site)) problems.push("Missing \"site\" section.");
  const lists = ["stats", "levels", "categories", "method", "courses", "tutors", "testimonials", "plans", "timetable", "resources", "faqs"];
  const check = (name, value) => {
    if (value === undefined) return;
    if (!Array.isArray(value)) return problems.push(`"${name}" should be a list.`);
    value.forEach((item, i) => {
      if (!isObj(item)) problems.push(`"${name}" item ${i + 1} isn't an entry (found ${JSON.stringify(item)}).`);
    });
  };
  for (const k of lists) check(k, content[k]);
  if (content.quiz !== undefined) {
    if (!isObj(content.quiz)) problems.push("\"quiz\" should be an object.");
    else {
      check("quiz.questions", content.quiz.questions);
      check("quiz.results", content.quiz.results);
    }
  }
  return problems;
}

export async function fetchPublished() {
  const res = await fetch(`${CONTENT_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load content.json (HTTP ${res.status})`);
  return res.json();
}

/**
 * Load the content the current visitor should see.
 * A local admin draft wins over the published file (so the teacher previews their edits),
 * unless the visitor chose "view live" for this tab. A draft identical to the published
 * file is discarded automatically once the publish has gone live.
 * @returns {Promise<{content: object, published: object|null, source: "draft"|"published"}>}
 */
export async function loadContent({ allowDraft = true } = {}) {
  let published = null;
  let error = null;
  try {
    published = await fetchPublished();
  } catch (e) {
    error = e;
  }
  const draft = allowDraft && !isViewingLive() ? getDraft() : null;
  if (draft && published && sameContent(draft, published)) {
    clearDraft();
    return { content: normalizeContent(published), published, source: "published" };
  }
  if (draft) return { content: normalizeContent(draft), published, source: "draft" };
  if (published) return { content: normalizeContent(published), published, source: "published" };
  throw error || new Error("No content available");
}

export function getDraft() {
  const s = local();
  const d = s ? read(s, KEYS.draft) : null;
  return d && d.content ? d.content : null;
}

export function getDraftInfo() {
  const s = local();
  const d = s ? read(s, KEYS.draft) : null;
  return d && d.content ? { savedAt: d.savedAt } : null;
}

export function saveDraft(content) {
  const s = local();
  const ok = s ? write(s, KEYS.draft, { savedAt: new Date().toISOString(), content }) : false;
  emit("draft");
  return ok;
}

export function clearDraft() {
  const s = local();
  if (s) write(s, KEYS.draft, null);
  emit("draft");
}

export function isViewingLive() {
  const s = session();
  return s ? read(s, KEYS.viewLive, false) === true : false;
}

export function setViewingLive(on) {
  const s = session();
  if (s) write(s, KEYS.viewLive, on ? true : null);
}

/* ------------------------------------------------------------------ enquiries
   Stored on this device only. On a static host there is no server inbox, so the public
   form also hands the enquiry to WhatsApp and (optionally) a Formspree-style endpoint. */

export function listEnquiries() {
  const s = local();
  const list = s ? read(s, KEYS.enquiries, []) : [];
  return (Array.isArray(list) ? list : []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function setEnquiries(list) {
  const s = local();
  if (s) write(s, KEYS.enquiries, list);
  emit("enquiries");
}

export function addEnquiry(data) {
  const record = {
    id: uid("enq"),
    createdAt: new Date().toISOString(),
    status: "new",
    notes: "",
    name: "",
    email: "",
    phone: "",
    level: "",
    courseIds: [],
    mode: "",
    message: "",
    source: "enrol",
    ...data,
  };
  setEnquiries([record, ...listEnquiries()]);
  return record;
}

export function updateEnquiry(id, patch) {
  const list = listEnquiries().map((e) => (e.id === id ? { ...e, ...patch } : e));
  setEnquiries(list);
  return list.find((e) => e.id === id) || null;
}

export function deleteEnquiry(id) {
  setEnquiries(listEnquiries().filter((e) => e.id !== id));
}

export function enquiryMessage(content, e) {
  const courses = (e.courseIds || [])
    .map((id) => byId(content.courses, id))
    .filter(Boolean)
    .map((c) => `${c.title}${c.code ? ` (${c.code})` : ""} — ${levelName(content, c.level)}`);
  const lines = [
    `Hello ${content.site.name || ""}, I would like to enquire about a place.`.replace(/\s+,/, ","),
    "",
    `Name: ${e.name}`,
    e.studentName ? `Student: ${e.studentName}` : null,
    e.phone ? `Phone: ${e.phone}` : null,
    e.email ? `Email: ${e.email}` : null,
    e.level ? `Level: ${levelName(content, e.level)}` : null,
    courses.length ? `Courses: ${courses.join("; ")}` : null,
    e.mode ? `Preferred format: ${MODE_LABELS[e.mode] || e.mode}` : null,
    e.message ? `\n${e.message}` : null,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export function whatsappLink(number, text = "") {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function mailtoLink(email, subject = "", body = "") {
  if (!email) return null;
  const q = new URLSearchParams();
  if (subject) q.set("subject", subject);
  if (body) q.set("body", body);
  const qs = q.toString().replace(/\+/g, "%20");
  return `mailto:${email}${qs ? `?${qs}` : ""}`;
}

/**
 * Save an enquiry locally, forward it to the optional form endpoint, and build WhatsApp/email
 * hand-off links. Never throws for network problems.
 * @returns {Promise<{record: object, remote: boolean|null, whatsappUrl: string|null, mailtoUrl: string|null}>}
 */
export async function submitEnquiry(content, data) {
  const record = addEnquiry(data);
  let remote = null;
  const endpoint = content?.site?.formEndpoint;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...data, _subject: `New enquiry — ${data.name || "website"}` }),
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

/* ------------------------------------------------------------------ admin session
   This is a convenience gate for the editing UI, not real security: anyone can read a static
   site's files. The live site can only be changed by someone holding the GitHub token. */

const SESSION_HOURS = 12;

export async function checkPassword(content, password) {
  const expected = content?.admin?.passwordHash || DEFAULT_PASSWORD_HASH;
  return (await sha256(password)) === expected;
}

export function startSession() {
  const s = session();
  if (s) write(s, KEYS.session, { at: Date.now() });
}

export function hasSession() {
  const s = session();
  const v = s ? read(s, KEYS.session) : null;
  return !!(v && Date.now() - v.at < SESSION_HOURS * 3600e3);
}

export function endSession() {
  const s = session();
  if (s) write(s, KEYS.session, null);
}

export function isDefaultPassword(content) {
  return (content?.admin?.passwordHash || DEFAULT_PASSWORD_HASH) === DEFAULT_PASSWORD_HASH;
}

/* ------------------------------------------------------------------ GitHub publishing */

/** Guess owner/repo when hosted on GitHub Pages (owner.github.io/repo/). */
export function guessRepo() {
  try {
    const { hostname, pathname } = window.location;
    const m = hostname.match(/^([^.]+)\.github\.io$/i);
    if (!m) return { owner: "", repo: "" };
    const first = pathname.split("/").filter(Boolean)[0];
    const repo = first && first !== "admin" ? first : `${m[1]}.github.io`;
    return { owner: m[1], repo };
  } catch {
    return { owner: "", repo: "" };
  }
}

export function getGitHubConfig() {
  const s = local();
  const saved = (s && read(s, KEYS.github)) || {};
  const guess = guessRepo();
  return {
    owner: saved.owner || guess.owner,
    repo: saved.repo || guess.repo,
    branch: saved.branch || "main",
    path: saved.path || "data/content.json",
    token: saved.token || "",
  };
}

export function setGitHubConfig(cfg) {
  const s = local();
  if (s) write(s, KEYS.github, { ...getGitHubConfig(), ...cfg });
}

export function clearGitHubToken() {
  setGitHubConfig({ token: "" });
}

function ghError(status, body) {
  const msg = body && body.message ? ` (${body.message})` : "";
  if (status === 401) return `GitHub rejected the token. Check it was copied fully and hasn't expired${msg}.`;
  if (status === 403) return `The token can't write to this repository. Give it "Contents: Read and write" access${msg}.`;
  if (status === 404) return `Repository, branch or file not found. Check owner, repository and branch names${msg}.`;
  if (status === 409 || status === 422) return `GitHub refused the update because the file changed in the meantime. Pull the latest version and try again${msg}.`;
  return `GitHub returned an error (HTTP ${status})${msg}.`;
}

async function gh(cfg, path, init = {}) {
  if (!cfg.token) throw new Error("Add a GitHub token in Publish settings first.");
  if (!cfg.owner || !cfg.repo) throw new Error("Set the GitHub owner and repository first.");
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new Error("Couldn't reach GitHub. Check your internet connection.");
  }
  let body = null;
  try {
    body = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(ghError(res.status, body));
    err.status = res.status;
    throw err;
  }
  return body;
}

const contentPath = (cfg) => `/contents/${cfg.path.split("/").map(encodeURIComponent).join("/")}`;

/** Check the token and repository. Resolves with repo details or throws a friendly Error. */
export async function testGitHub(cfg = getGitHubConfig()) {
  const repo = await gh(cfg, "");
  const canPush = !repo.permissions || repo.permissions.push !== false;
  return {
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    private: repo.private,
    canPush,
    pagesUrl: `https://${repo.owner?.login || cfg.owner}.github.io/${repo.name === `${cfg.owner}.github.io` ? "" : `${repo.name}/`}`,
  };
}

/** Read content.json straight from the repository (bypasses the GitHub Pages delay). */
export async function fetchFromGitHub(cfg = getGitHubConfig()) {
  const file = await gh(cfg, `${contentPath(cfg)}?ref=${encodeURIComponent(cfg.branch)}`);
  return { content: JSON.parse(base64ToUtf8(file.content)), sha: file.sha };
}

/**
 * Commit content to data/content.json on the configured branch.
 * GitHub Pages usually redeploys within a minute or two.
 */
export async function publishContent(content, { message, cfg = getGitHubConfig() } = {}) {
  let sha;
  try {
    const existing = await gh(cfg, `${contentPath(cfg)}?ref=${encodeURIComponent(cfg.branch)}`);
    sha = existing.sha;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const next = { ...content, meta: { ...(content.meta || {}), updatedAt: new Date().toISOString() } };
  const json = `${JSON.stringify(next, null, 2)}\n`;
  const result = await gh(cfg, contentPath(cfg), {
    method: "PUT",
    body: JSON.stringify({
      message: message || `Update site content (${new Date().toLocaleString("en-GB")})`,
      content: utf8ToBase64(json),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  saveDraft(next);
  return { content: next, commitUrl: result?.commit?.html_url || null, sha: result?.content?.sha || null };
}

/* ------------------------------------------------------------------ helpers */

export function uid(prefix = "id") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${rand}`;
}

export function slugify(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only allow http(s), mailto, tel, hash and relative links in user-editable URLs. */
export function safeUrl(url) {
  // Browsers drop ASCII tab/newline anywhere and C0 controls at the ends before parsing a URL,
  // so "java\tscript:" would otherwise slip past the scheme check.
  const u = String(url || "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!u) return "";
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return "";
  return u;
}

export function formatRs(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return `Rs ${v.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

export function deepClone(v) {
  return typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}

export function sameContent(a, b) {
  return stableStringify(a) === stableStringify(b);
}

export const byId = (list, id) => (Array.isArray(list) ? list.find((x) => x && x.id === id) : undefined) || null;
export const visible = (list) => (Array.isArray(list) ? list.filter((x) => x && x.visible !== false) : []);
export const levelName = (content, id) => byId(content.levels, id)?.name || id || "";
export const levelExam = (content, id) => byId(content.levels, id)?.exam || "";
export const categoryName = (content, id) => byId(content.categories, id)?.name || id || "";
export const tutorFor = (content, course) => byId(content.tutors, course?.tutorId);
export const dayName = (id) => DAYS.find((d) => d.id === id)?.name || id;
export const dayShort = (id) => DAYS.find((d) => d.id === id)?.short || id;

/** Sessions in the timetable for one course, sorted by weekday then time. */
export function sessionsFor(content, courseId) {
  const order = DAYS.map((d) => d.id);
  return (content.timetable || [])
    .filter((s) => s.courseId === courseId)
    .sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day) || String(a.start).localeCompare(String(b.start)));
}

export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** SHA-256 hex digest. Uses WebCrypto when available (HTTPS/localhost), otherwise a JS fallback. */
export async function sha256(text) {
  const data = new TextEncoder().encode(String(text));
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return sha256Fallback(data);
}

function sha256Fallback(bytes) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, len * 8);
  view.setUint32(padded.length - 8, Math.floor((len * 8) / 2 ** 32));
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, "0")).join("");
}
