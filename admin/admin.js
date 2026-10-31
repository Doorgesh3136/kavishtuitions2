// Kavish Tuitions — admin ("the mark book").
// Boot → login gate → app shell with hash routing (#courses, #courses/<id>, #site/contact …).

import * as store from "../assets/js/store.js";
import { html, raw, icon, render, el } from "../assets/js/ui.js";
import * as S from "./js/state.js";
import { $, $$, toast, confirmDialog, openDrawer, drawerOpen, topDrawer, onAllDrawersClosed, keepFocus, download, gsap, reduced, tween, fmtAgo, two } from "./js/dom.js";

import overview from "./js/views/overview.js";
import enquiries from "./js/views/enquiries.js";
import timetable from "./js/views/timetable.js";
import quiz from "./js/views/quiz.js";
import site from "./js/views/site.js";
import publish from "./js/views/publish.js";
import security from "./js/views/security.js";
import * as C from "./js/views/collections.js";

if (window.gsap && window.Flip) window.gsap.registerPlugin(window.Flip);

const NAV = [
  {
    group: "Desk",
    items: [
      { id: "overview", label: "Overview", view: overview },
      { id: "enquiries", label: "Enquiries", view: enquiries, count: () => store.listEnquiries().filter((e) => e.status === "new").length, countTone: "red" },
    ],
  },
  {
    group: "Content",
    items: [
      { id: "courses", label: "Courses", view: C.courses, count: () => S.state.working.courses.length },
      { id: "timetable", label: "Timetable", view: timetable, count: () => S.state.working.timetable.length },
      { id: "tutors", label: "Tutors", view: C.tutors, count: () => S.state.working.tutors.length },
      { id: "testimonials", label: "Testimonials", view: C.testimonials, count: () => S.state.working.testimonials.length },
      { id: "plans", label: "Plans", view: C.plans, count: () => S.state.working.plans.length },
      { id: "resources", label: "Resources", view: C.resources, count: () => S.state.working.resources.length },
      { id: "quiz", label: "Quiz", view: quiz, count: () => S.state.working.quiz.questions.length },
      { id: "faqs", label: "FAQs", view: C.faqs, count: () => S.state.working.faqs.length },
      { id: "site", label: "Site & homepage", view: site },
    ],
  },
  {
    group: "Go live",
    items: [
      { id: "publish", label: "Publish", view: publish },
      { id: "security", label: "Security", view: security },
    ],
  },
];

const ROUTES = new Map();
let n = 0;
for (const g of NAV) for (const it of g.items) ROUTES.set(it.id, { ...it, group: g.group, num: two(++n) });

const app = document.getElementById("app");
let current = null; // { id, params, view, root, cleanup }
let navBusy = false;
let queued = null;

/* ------------------------------------------------------------------ boot */

async function boot() {
  let loaded = null;
  let error = null;
  try {
    loaded = await store.loadContent({ allowDraft: true });
    // "View live site" (a per-tab public-site preference) must never hide the draft from the admin.
    if (loaded.source === "published" && store.getDraft()) {
      loaded = { content: store.normalizeContent(store.getDraft()), published: loaded.published, source: "draft" };
    }
  } catch (e) {
    error = e;
  }
  await document.fonts?.ready?.catch(() => {});
  if (!loaded) return showLoadError(error);
  S.init(loaded);
  document.title = `Admin · ${S.state.working.site.name || "Tuition site"}`;
  if (store.hasSession()) showApp({ fromGate: false });
  else showGate();
}

function showLoadError(err) {
  render(
    app,
    html`<div class="gate gate--error">
      <main class="gate__main">
        <div class="gate__intro">
          <p class="gate__eyebrow">Admin</p>
          <h1 class="gate__title">The content file <em>didn't load</em>.</h1>
          <p class="gate__lead">${err?.message || "Unknown error."} The admin reads <span class="mono-code">data/content.json</span> from the website, so open it through the website's address (for example <span class="mono-code">…github.io/kavishtuitions2/admin/</span>), not as a file on your computer.</p>
          <p><button type="button" class="a-btn a-btn--primary" data-retry>${icon("refresh", { size: 18 })}<span>Try again</span></button> <a class="a-btn a-btn--ghost" href="../">Back to the site</a></p>
        </div>
      </main>
    </div>`
  );
  $("[data-retry]", app).addEventListener("click", () => location.reload());
}

/* ------------------------------------------------------------------ login gate */

let failures = 0;
let lockedUntil = 0;

function showGate({ message = "" } = {}) {
  const c = S.state.working;
  const isDefault = store.isDefaultPassword(c);
  const name = c.site.name || "your tuition site";
  render(
    app,
    html`<div class="gate" data-gate>
      <header class="gate__top">
        <a class="gate__brand" href="../"><span class="gate__mark">${c.site.wordmark || c.site.name || "Admin"}</span><span class="gate__tag">Admin</span></a>
        <a class="gate__back" href="../">${icon("arrow-left", { size: 16 })}<span>Back to the site</span></a>
      </header>
      <main class="gate__main">
        <div class="gate__intro">
          <p class="gate__eyebrow"><span>Paper 0</span><span>Sign in</span></p>
          <h1 class="gate__title"><span class="gate__mask"><span class="gate__line">The <em>mark</em></span></span><span class="gate__mask"><span class="gate__line">book.</span></span></h1>
          <p class="gate__lead">Courses, timetable, fees and enquiries for ${name}. Edit here, preview on the site, publish when it's right.</p>
        </div>
        <form class="gate__form" novalidate data-gate-form>
          <p class="gate__k">Instructions to candidates</p>
          <ul class="gate__rules">
            <li>Enter the admin password.</li>
            <li>Your edits stay in this browser until you publish them.</li>
          </ul>
          <input type="text" name="username" value="admin" autocomplete="username" hidden />
          <div class="gate__field">
            <label class="gate__label" for="gate-pw">Password</label>
            <div class="gate__line-input">
              <input id="gate-pw" type="password" autocomplete="current-password" spellcheck="false" aria-describedby="gate-err${isDefault ? " gate-default" : ""}" required />
              <button type="button" class="gate__reveal" data-reveal aria-pressed="false" aria-controls="gate-pw">Show</button>
            </div>
            <p class="gate__err" id="gate-err" role="alert" ${message ? "" : raw("hidden")}>${message}</p>
          </div>
          <button type="submit" class="a-btn a-btn--primary a-btn--lg gate__submit" data-gate-submit><span>Sign in</span><span class="a-btn__ico">${icon("arrow-right", { size: 18 })}</span></button>
          ${isDefault
            ? html`<p class="gate__default" id="gate-default"><span class="gate__default-k">Default password</span><span><strong class="mono-code">admin123</strong> — change it in Security once you're in.</span></p>`
            : ""}
        </form>
      </main>
      <footer class="gate__foot"><span>Not indexed by search engines</span><span>Signing in lasts until you close this tab</span></footer>
    </div>`
  );
  const g = gsap();
  if (g && !reduced()) {
    const tl = g.timeline({ defaults: { ease: "expo.out" } });
    tl.from(".gate__line", { yPercent: 108, duration: 1.1, stagger: 0.08 }, 0.05)
      .from([".gate__eyebrow", ".gate__lead"], { autoAlpha: 0, y: 14, duration: 0.8, stagger: 0.06 }, 0.25)
      .from(".gate__form", { autoAlpha: 0, y: 24, duration: 0.9 }, 0.2)
      .from([".gate__top", ".gate__foot"], { autoAlpha: 0, duration: 0.6 }, 0.35);
  }
  const form = $("[data-gate-form]", app);
  const input = $("#gate-pw", app);
  const err = $("#gate-err", app);
  const submit = $("[data-gate-submit]", app);
  setTimeout(() => input.focus({ preventScroll: true }), reduced() ? 0 : 420);

  $("[data-reveal]", app).addEventListener("click", (e) => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    e.currentTarget.textContent = show ? "Hide" : "Show";
    e.currentTarget.setAttribute("aria-pressed", show ? "true" : "false");
    input.focus();
  });
  input.addEventListener("input", () => {
    if (Date.now() >= lockedUntil) {
      err.hidden = true;
      form.classList.remove("is-wrong");
    }
  });

  let countdown = null;
  const lock = (ms) => {
    lockedUntil = Date.now() + ms;
    submit.disabled = true;
    clearInterval(countdown);
    const tick = () => {
      const left = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(countdown);
        submit.disabled = false;
        err.textContent = "That password isn't right. Try again.";
        return;
      }
      err.textContent = `That password isn't right. Try again in ${left}s.`;
    };
    tick();
    countdown = setInterval(tick, 250);
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (Date.now() < lockedUntil) return;
    const pw = input.value;
    if (!pw) {
      err.hidden = false;
      err.textContent = "Enter the password.";
      input.focus();
      return;
    }
    submit.disabled = true;
    submit.classList.add("is-busy");
    const ok = await store.checkPassword(S.state.working, pw);
    submit.classList.remove("is-busy");
    if (ok) {
      failures = 0;
      store.startSession();
      clearInterval(countdown);
      await leaveGate();
      showApp({ fromGate: true });
      return;
    }
    failures++;
    err.hidden = false;
    form.classList.remove("is-wrong");
    void form.offsetWidth;
    form.classList.add("is-wrong");
    input.select();
    // Brief, growing delay after wrong attempts: 1s, 2s, 4s … capped at 15s.
    lock(Math.min(15000, 1000 * 2 ** Math.max(0, failures - 1)));
  });
}

async function leaveGate() {
  const gate = $("[data-gate]", app);
  const g = gsap();
  if (!gate || !g) return;
  if (reduced()) return tween(gate, { autoAlpha: 0, duration: 0.18 });
  await new Promise((resolve) => {
    const tl = g.timeline({ onComplete: resolve });
    tl.to(".gate__form, .gate__lead, .gate__eyebrow, .gate__top, .gate__foot", { autoAlpha: 0, y: -10, duration: 0.3, ease: "power2.in", stagger: 0.02 })
      .to(".gate__line", { yPercent: -108, duration: 0.5, ease: "expo.in", stagger: 0.05 }, 0.05)
      .to(gate, { clipPath: "inset(0 0 100% 0)", duration: 0.6, ease: "expo.inOut" }, 0.35);
  });
}

/* ------------------------------------------------------------------ app shell */

function navTpl(prefix = "") {
  return html`<nav class="nav" aria-label="Admin sections">
    ${NAV.map(
      (g) => html`<div class="nav__group">
        <p class="nav__label">${g.group}</p>
        <ul class="nav__list" role="list">
          ${g.items.map((it) => {
            const r = ROUTES.get(it.id);
            return html`<li><a class="nav__link" href="${`#${it.id}`}" data-nav="${it.id}" id="${`${prefix}nav-${it.id}`}">
              <span class="nav__num">${r.num}</span><span class="nav__text">${it.label}</span><span class="nav__count${it.countTone ? ` nav__count--${it.countTone}` : ""}" data-count="${it.id}"></span>
            </a></li>`;
          })}
        </ul>
      </div>`
    )}
    <span class="nav__marker" aria-hidden="true"></span>
  </nav>`;
}

function shellTpl() {
  const c = S.state.working;
  return html`<div class="app" data-shell>
    <a class="skip" href="#main">Skip to content</a>
    <aside class="side" aria-label="Admin">
      <div class="side__brand">
        <a class="brand" href="#overview"><span class="brand__mark">${c.site.wordmark || c.site.name || "Admin"}</span><span class="brand__tag">Admin</span></a>
        <p class="brand__sub">Mark book · ${new Date().getFullYear()}</p>
      </div>
      ${navTpl()}
      <div class="side__foot">
        <a class="side__link" href="../" target="_blank" rel="noopener" data-flush><span>View site</span>${icon("arrow-up-right", { size: 16 })}</a>
        <button type="button" class="side__link side__link--quiet" data-signout><span>Sign out</span>${icon("logout", { size: 16 })}</button>
      </div>
    </aside>
    <div class="frame">
      <header class="topbar">
        <button type="button" class="icon-btn topbar__menu" data-menu aria-label="Open menu" aria-expanded="false">${icon("menu")}</button>
        <a class="topbar__brand" href="#overview"><span class="brand__mark">${c.site.wordmark || c.site.name || "Admin"}</span><span class="brand__tag">Admin</span></a>
        <p class="crumb" data-crumb></p>
        <a class="pill" href="#publish" data-pill aria-live="polite"></a>
        <a class="a-btn a-btn--primary a-btn--xs topbar__publish" href="#publish" data-top-publish>${icon("upload", { size: 16 })}<span>Publish</span></a>
        <a class="icon-btn topbar__site" href="../" target="_blank" rel="noopener" data-flush aria-label="View site (opens in a new tab)">${icon("arrow-up-right")}</a>
        <span class="routebar" aria-hidden="true"></span>
      </header>
      <main class="main" id="main" tabindex="-1"><div class="view-host" data-view-host></div></main>
    </div>
  </div>`;
}

function showApp({ fromGate }) {
  render(app, shellTpl());
  updateChrome();
  const g = gsap();
  if (g && !reduced() && fromGate) {
    g.from(".side", { xPercent: -6, autoAlpha: 0, duration: 0.8, ease: "expo.out" });
    g.from(".topbar", { autoAlpha: 0, y: -8, duration: 0.6, ease: "power3.out", delay: 0.1 });
    g.from(".nav__link", { autoAlpha: 0, x: -10, duration: 0.5, ease: "power3.out", stagger: 0.025, delay: 0.15 });
  }
  wireShell();
  if (!location.hash || !ROUTES.has(parseHash().id)) history.replaceState(null, "", "#overview");
  // After signing in, put focus on the page heading (as route changes do) so it's announced.
  go(parseHash(), { first: true, focusTitle: fromGate });
}

function parseHash() {
  let h = location.hash.replace(/^#\/?/, "");
  try {
    h = decodeURI(h);
  } catch {}
  const [id = "", ...params] = h.split("/").filter((x, i) => i === 0 || x !== "");
  return { id: ROUTES.has(id) ? id : "overview", params: params.map((p) => {
      try {
        return encodeURIComponent(decodeURIComponent(p));
      } catch {
        return encodeURIComponent(p);
      }
    }) };
}

let shellWired = false;
function wireShell() {
  if (shellWired) return;
  shellWired = true;
  window.addEventListener("hashchange", onHash);
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onDocKey);
  S.subscribe(onState);
  store.onStoreChange((kind) => {
    if (kind === "enquiries") updateCounts();
  });
  window.addEventListener("storage", onStorage);
  // Edits another tab saved while an editor was open here are taken in once it closes.
  onAllDrawersClosed(() => {
    if (S.state.external && $("[data-shell]")) takeOtherTab();
  });
  window.addEventListener("pagehide", () => S.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) S.flush();
    else if (!store.hasSession() && $("[data-shell]")) {
      toast("Signed out after 12 hours. Sign in again to continue.");
      signOut({ quiet: true });
    } else updateChrome();
  });
  window.addEventListener("resize", () => moveMarker(false));
  window.addEventListener("beforeunload", (e) => {
    if (current?.view?.pendingErrors && current.root && current.view.pendingErrors(current.root) > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

/* ------------------------------------------------------------------ routing + transitions */

async function onHash() {
  if (!$("[data-shell]")) return;
  const next = parseHash();
  // A modal drawer is open (e.g. a link inside it, or the Back button): close it first.
  if (drawerOpen()) {
    const prevHash = current ? `#${[current.id, ...current.params].join("/")}` : "#overview";
    const closed = await topDrawer().requestClose();
    if (!closed) {
      // Kept editing: put the editor's address back as a new entry. Replacing would overwrite the
      // entry Back just moved to, and the next Back would then leave the admin altogether.
      history.pushState(null, "", prevHash);
      return;
    }
    // Closing the drawer rewrote the URL to the list; put the requested address back.
    history.replaceState(null, "", `#${[next.id, ...next.params].join("/")}`);
    if (current && next.id === current.id) {
      current.params = next.params;
      return;
    }
  }
  go(next);
}

function makeCtx(r, params) {
  const ctx = {
    id: r.id,
    num: r.num,
    group: r.group,
    params,
    navigate: (hash) => (location.hash = hash),
    replaceRoute: (route) => {
      // Only the page on screen owns the address: a late callback from a page that has gone mustn't rewrite it.
      if (!current || current.ctx !== ctx) return;
      const h = `#${route}`;
      if (location.hash !== h) history.replaceState(null, "", h);
      current.params = route.split("/").slice(1);
    },
    toast,
    rerender: () => rerender(),
    signOut: () => signOut(),
  };
  return ctx;
}

/* A view that failed to render: says so plainly and offers the ways out (Publish, a download, retry). */
const ERROR_VIEW = { id: "error", render: () => "" };

function errorTpl(r, err) {
  const onPublish = r.id === "publish";
  return html`<header class="vh" data-a-intro>
      <p class="vh__index"><span class="vh__num">${r.num}</span><span class="vh__group">${r.group}</span></p>
      <div class="vh__row">
        <div class="vh__main">
          <h1 class="vh__title" tabindex="-1" data-view-title><span class="vh__mask"><span class="vh__line">${r.label} <em>didn't open</em>.</span></span></h1>
          <p class="vh__lead">Something in the content stopped this page from loading — usually an entry with the wrong shape, for example after <span class="mono-code">content.json</span> was edited by hand. Nothing has been changed or lost.</p>
        </div>
      </div>
    </header>
    <section class="block view-error" data-a-intro aria-labelledby="ve-k">
      <p class="view-error__k" id="ve-k">What you can do</p>
      <ol class="view-error__steps">
        <li><span class="view-error__n">1</span><p>Download a copy of this browser's content, so nothing can be lost.</p></li>
        <li><span class="view-error__n">2</span><p>${onPublish
          ? "Reload the admin. If the page still won't open, import a good backup from another browser."
          : html`Open <strong>Publish</strong> to import a good backup, pull the latest from GitHub, or discard local changes and go back to the live version.`}</p></li>
      </ol>
      <p class="view-error__acts">
        <button type="button" class="a-btn a-btn--ghost a-btn--sm" data-err="download">${icon("download", { size: 16 })}<span>Download a copy</span></button>
        ${onPublish
          ? html`<button type="button" class="a-btn a-btn--primary a-btn--sm" data-err="reload">${icon("refresh", { size: 16 })}<span>Reload the admin</span></button>`
          : html`<a class="a-btn a-btn--primary a-btn--sm" href="#publish">${icon("upload", { size: 16 })}<span>Open Publish</span></a>
            <button type="button" class="a-link" data-err="retry">Try again</button>`}
      </p>
      <p class="view-error__detail"><span class="view-error__dk">Details</span><span class="mono-code">${String(err?.message || err || "Unknown error").slice(0, 240)}</span></p>
    </section>`;
}

function showViewError(host, r, params, ctx, err) {
  console.error(`[admin] ${r.id} view failed`, err);
  const root = el(html`<div class="view view--error" data-view="error"></div>`);
  render(root, errorTpl(r, err));
  host.replaceChildren(root);
  current = { id: r.id, params, view: ERROR_VIEW, root, ctx, cleanup: null, failed: true };
  return root;
}

async function go(next, { first = false, focusTitle = false } = {}) {
  if (navBusy) {
    queued = next;
    return;
  }
  const r = ROUTES.get(next.id);
  if (current && current.id === next.id && !current.failed) {
    current.params = next.params;
    if (current.view.onParams) current.view.onParams(next.params);
    return;
  }
  if (current && current.view.pendingErrors && current.view.pendingErrors(current.root) > 0) {
    const ok = await confirmDialog({
      eyebrow: "Unsaved fields",
      title: "Leave with unsaved fields?",
      body: html`<p>Some fields on this page have errors, so those values weren't saved. Everything else is saved.</p>`,
      confirmLabel: "Leave anyway",
      cancelLabel: "Stay and fix",
    });
    if (!ok) {
      // Stayed: restore this page's address as a new entry (see onHash) so Back still works.
      history.pushState(null, "", `#${[current.id, ...current.params].join("/")}`);
      return;
    }
  }
  navBusy = true;
  const host = $("[data-view-host]");
  let root = null;
  let ctx = null;
  routeBar(true);
  // Whatever a view does, navigation must keep working: a view that throws shows the error page instead.
  try {
    const g = gsap();
    const old = host.firstElementChild;
    // The outgoing page is on its way out: a click on it now would open an editor for a page that's
    // about to go, left over the new one with the old page's address.
    if (old) old.inert = true;
    if (old && !first && g) {
      await tween(old, reduced() ? { autoAlpha: 0, duration: 0.12 } : { autoAlpha: 0, y: -10, duration: 0.2, ease: "power2.in" });
    }
    if (current && current.cleanup) {
      const fn = current.cleanup;
      current.cleanup = null;
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
    const view = r.view;
    ctx = makeCtx(r, next.params);
    root = el(html`<div class="view view--${r.id}" data-view="${r.id}"></div>`);
    render(root, view.render(ctx));
    host.replaceChildren(root);
    current = { id: r.id, params: next.params, view, root, ctx, cleanup: null };
    current.cleanup = view.mount ? view.mount(root, ctx) || null : null;
  } catch (err) {
    if (current && current.root === root && current.cleanup) {
      try {
        current.cleanup();
      } catch {}
    }
    root = showViewError(host, r, next.params, ctx || makeCtx(r, next.params), err);
  } finally {
    navBusy = false;
    routeBar(false);
  }
  window.scrollTo(0, 0);
  setActiveNav(r.id, !first);
  updateChrome();
  document.title = `${r.label} · Admin · ${S.state.working.site.name || "Tuition site"}`;
  intro(root);
  if (!first || focusTitle) {
    const title = root.querySelector("[data-view-title]");
    if (title) title.focus({ preventScroll: true });
  }
  if (queued) {
    const q = queued;
    queued = null;
    if (q.id !== current.id || current.failed) go(q);
    else if (current.view.onParams) current.view.onParams(q.params);
  }
}

function rerender() {
  if (!current || current.failed) return;
  const restore = keepFocus();
  try {
    if (current.cleanup) {
      const fn = current.cleanup;
      current.cleanup = null;
      fn();
    }
    render(current.root, current.view.render(current.ctx));
    current.cleanup = current.view.mount ? current.view.mount(current.root, current.ctx) || null : null;
  } catch (err) {
    showViewError($("[data-view-host]"), ROUTES.get(current.id), current.params, current.ctx, err);
    const title = current.root.querySelector("[data-view-title]");
    if (title) title.focus({ preventScroll: true });
    return;
  }
  restore();
}

function intro(root) {
  const g = gsap();
  if (!g) return;
  const lines = root.querySelectorAll(".vh__line");
  const blocks = [...root.querySelectorAll("[data-a-intro]")];
  const parts = blocks.flatMap((b) => (b.classList.contains("vh") ? [...b.querySelectorAll(".vh__index, .vh__lead, .vh__actions")] : [b]));
  if (reduced()) {
    g.fromTo([...lines, ...parts], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, clearProps: "opacity,visibility" });
    return;
  }
  g.fromTo(lines, { yPercent: 105 }, { yPercent: 0, duration: 0.9, ease: "expo.out", clearProps: "transform" });
  g.fromTo(parts, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.045, delay: 0.08, clearProps: "transform,opacity,visibility" });
  const cells = root.querySelectorAll(".register__cell");
  if (cells.length) g.fromTo(cells, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out", stagger: 0.05, delay: 0.18, clearProps: "transform,opacity,visibility" });
}

function routeBar(start) {
  const bar = $(".routebar");
  const g = gsap();
  if (!bar || !g || reduced()) return;
  if (start) g.fromTo(bar, { scaleX: 0, autoAlpha: 1, transformOrigin: "0 50%" }, { scaleX: 0.7, duration: 0.25, ease: "power2.out" });
  else g.to(bar, { scaleX: 1, duration: 0.3, ease: "power2.out", onComplete: () => g.to(bar, { autoAlpha: 0, duration: 0.3 }) });
}

function setActiveNav(id, animate) {
  $$("[data-nav]").forEach((a) => {
    if (a.dataset.nav === id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  moveMarker(animate);
}

function moveMarker(animate) {
  const nav = $(".side .nav");
  if (!nav) return;
  const marker = $(".nav__marker", nav);
  const link = $('.nav__link[aria-current="page"]', nav);
  if (!marker || !link) return;
  const navTop = nav.getBoundingClientRect().top;
  const r = link.getBoundingClientRect();
  const y = r.top - navTop + nav.scrollTop;
  const g = gsap();
  if (g && animate && !reduced()) g.to(marker, { y, height: r.height, autoAlpha: 1, duration: 0.55, ease: "expo.out" });
  else {
    if (g) g.set(marker, { y, height: r.height, autoAlpha: 1 });
    else Object.assign(marker.style, { transform: `translateY(${y}px)`, height: `${r.height}px`, opacity: 1 });
  }
}

/* ------------------------------------------------------------------ chrome */

function onState(kind) {
  if (kind === "saving" || kind === "saved" || kind === "content" || kind === "replace" || kind === "published") updateChrome();
  if (kind === "saved" && S.state.saveError) toast("Couldn't save in this browser — storage may be full or blocked. Download a copy from Publish.", { tone: "error", duration: 9000 });
}

function updateChrome() {
  const pill = $("[data-pill]");
  if (pill) {
    const st = S.status();
    const saving = S.state.saving;
    pill.className = `pill pill--${st.tone}${saving ? " is-saving" : ""}`;
    pill.title = S.state.savedAt ? `Last saved in this browser ${fmtAgo(S.state.savedAt)}` : st.text;
    render(
      pill,
      html`<span class="pill__dot" aria-hidden="true"></span><span class="pill__long">${saving ? "Saving in this browser…" : st.text}</span><span class="pill__short">${saving ? "Saving…" : st.short}</span>`
    );
    const pub = $("[data-top-publish]");
    if (pub) pub.hidden = st.tone !== "draft" || current?.id === "publish";
  }
  const crumb = $("[data-crumb]");
  if (crumb && current) {
    const r = ROUTES.get(current.id);
    render(crumb, html`<span class="crumb__num">${r.num}</span><span class="crumb__group">${r.group}</span><span class="crumb__sep" aria-hidden="true">/</span><span class="crumb__here">${r.label}</span>`);
  }
  // The name and wordmark are editable here (Site & homepage): keep the brand and tab title in step.
  const site = S.state.working?.site || {};
  const mark = site.wordmark || site.name || "Admin";
  $$("[data-shell] .brand__mark").forEach((n) => {
    if (n.textContent !== mark) n.textContent = mark;
  });
  if (current && $("[data-shell]")) document.title = `${ROUTES.get(current.id).label} · Admin · ${site.name || "Tuition site"}`;
  updateCounts();
}

function updateCounts() {
  for (const g of NAV) {
    for (const it of g.items) {
      if (!it.count) continue;
      let v = 0;
      try {
        v = it.count();
      } catch {}
      $$(`[data-count="${it.id}"]`).forEach((n) => {
        n.textContent = v ? String(v) : it.countTone ? "" : "0";
        n.setAttribute("aria-label", it.id === "enquiries" ? `${v} new` : `${v}`);
      });
    }
  }
}

/* ------------------------------------------------------------------ global events */

function onDocClick(e) {
  if (e.target.closest("a.skip")) {
    // The hash is the route here: following "#main" would open Overview. Move focus instead.
    e.preventDefault();
    $("#main")?.focus();
    return;
  }
  if (e.target.closest("[data-flush]") || e.target.closest('a[href="../"]')) S.flush();
  if (e.target.closest("[data-signout]")) {
    e.preventDefault();
    signOut();
  }
  if (e.target.closest("[data-menu]")) openMenu();
  const err = e.target.closest("[data-err]");
  if (err) {
    const act = err.dataset.err;
    if (act === "download") {
      S.flush();
      download(`content-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(S.state.working, null, 2)}\n`);
      toast("Downloaded content.json", { tone: "ok" });
    } else if (act === "reload") location.reload();
    else if (act === "retry") go(parseHash());
  }
}

function onDocKey(e) {
  if (e.key === "/" && !e.metaKey && !e.ctrlKey && !drawerOpen() && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") && !document.activeElement?.isContentEditable) {
    const q = $("[data-view-host] [data-q], [data-view-host] [data-enq-q]");
    if (q) {
      e.preventDefault();
      q.focus();
    }
  }
}

function openMenu() {
  const btn = $("[data-menu]");
  btn?.setAttribute("aria-expanded", "true");
  const c = S.state.working;
  const drawer = openDrawer({
    side: "left",
    size: "nav",
    eyebrow: "Admin",
    title: c.site.wordmark || c.site.name || "Menu",
    body: html`${navTpl("m-")}
      <div class="side__foot side__foot--drawer">
        <a class="side__link" href="../" target="_blank" rel="noopener" data-flush><span>View site</span>${icon("arrow-up-right", { size: 16 })}</a>
        <button type="button" class="side__link side__link--quiet" data-signout><span>Sign out</span>${icon("logout", { size: 16 })}</button>
      </div>`,
    initialFocus: '.nav__link[aria-current="page"]',
    onClose: () => btn?.setAttribute("aria-expanded", "false"),
    onMount: (api) => {
      if (current) $$("[data-nav]", api.dialog).forEach((a) => a.dataset.nav === current.id && a.setAttribute("aria-current", "page"));
      updateCounts();
      api.dialog.addEventListener("click", async (ev) => {
        const link = ev.target.closest("[data-nav]");
        if (link) {
          ev.preventDefault();
          await api.close();
          location.hash = link.getAttribute("href");
        } else if (ev.target.closest("[data-signout]")) {
          await api.close();
        }
      });
    },
  });
  return drawer;
}

function onStorage(e) {
  if (e.storageArea !== localStorage) return;
  updateCounts();
  const info = store.getDraftInfo();
  const theirs = info?.savedAt || null;
  if (theirs === S.state.savedAt || S.hasPendingSave()) return;
  if (e.key && !/draft/i.test(e.key)) return;
  if (drawerOpen()) {
    // An editor is open: don't swap the content under it. The editor offers to load the other tab's
    // version; saving merges into it, and closing takes it in (see onAllDrawersClosed above).
    S.markExternal();
    return;
  }
  takeOtherTab();
}

function takeOtherTab() {
  const next = S.readExternal();
  if (!next) {
    S.state.external = false;
    return;
  }
  if (!S.adoptExternal(next)) return;
  if (current) rerender();
  toast("Updated with changes made in another tab");
}

async function signOut({ quiet = false } = {}) {
  S.flush();
  store.endSession();
  if (current && current.cleanup) current.cleanup();
  current = null;
  const g = gsap();
  const shell = $("[data-shell]");
  if (shell && g && !reduced()) await tween(shell, { autoAlpha: 0, duration: 0.3, ease: "power2.in" });
  history.replaceState(null, "", location.pathname + location.search);
  showGate({ message: "" });
  if (!quiet) toast("Signed out. Your edits are saved in this browser.");
}

boot();
