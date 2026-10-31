// Site shell: boot + loader, hash router with ink-panel transitions, header/menu/footer,
// announcement + draft-preview banners, Lenis smooth scroll, custom cursor and the 3D scene hookup.
// Views live in ./views/<name>.js (see SPEC "Shell ↔ view contract").

import * as store from "./store.js";
import * as ui from "./ui.js";
import { html, render, icon, penUnderline, penCircle } from "./ui.js";
import motion from "./motion.js";

const gsap = window.gsap || null;
const ST = window.ScrollTrigger || null;
const reduced = motion.reduced;
const finePointer = !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
const docEl = document.documentElement;

// The inline watchdog in index.html means "the app never started" (old browser, blocked script).
// This module is running, so stand it down — and take back an overlay it may already have shown
// while a slow connection was still delivering the scripts. Slow or failed content goes through
// bootError() from here on.
window.__ktStarted = true;
window.clearTimeout(window.__ktBootTimer);
docEl.classList.remove("boot-failed");

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (fn, where = "shell") => {
  try {
    return fn();
  } catch (e) {
    console.error(`[kt] ${where}`, e);
    return undefined;
  }
};

/* ------------------------------------------------------------------ routes */

const ROUTES = [
  { key: "", id: "home", module: "home", index: "01", title: "Home" },
  { key: "courses", id: "courses", module: "courses", index: "02", title: "Courses" },
  { key: "tutors", id: "tutors", module: "tutors", index: "03", title: "Tutors" },
  { key: "resources", id: "resources", module: "resources", index: "04", title: "Resources" },
  { key: "plans", id: "plans", module: "plans", index: "05", title: "Plans" },
  { key: "quiz", id: "quiz", module: "quiz", index: "06", title: "Quiz" },
  { key: "enrol", id: "enrol", module: "enrol", index: "07", title: "Enrol" },
];
const NAV_KEYS = ["courses", "tutors", "resources", "plans", "quiz"];
const routeByKey = (k) => ROUTES.find((r) => r.key === k) || null;

function decode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parseHash(hash = location.hash) {
  let s = String(hash || "").replace(/^#/, "");
  if (!s.startsWith("/")) s = `/${s}`;
  const qi = s.indexOf("?");
  const pathPart = qi >= 0 ? s.slice(0, qi) : s;
  const qs = qi >= 0 ? s.slice(qi + 1) : "";
  const segs = pathPart.split("/").filter(Boolean).map(decode);
  const key = (segs[0] || "").toLowerCase();
  const def = routeByKey(key);
  const path = `/${segs.map(encodeURIComponent).join("/")}`;
  return {
    key,
    def,
    id: def ? def.id : "not-found",
    params: segs.slice(1),
    query: new URLSearchParams(qs),
    path,
    hash: `#${path}${qs ? `?${qs}` : ""}`,
  };
}

const sameRoute = (a, b) => !!a && !!b && a.key === b.key && a.params.join("/") === b.params.join("/");

/* ------------------------------------------------------------------ state */

const state = {
  content: null,
  published: null,
  source: "published",
  current: null, // parsed route currently shown
  mounted: null, // { view, root, ctx, gctx, cleanup, unbind }
  busy: false,
  queued: false,
  scene: null,
  lenis: null,
  heroIO: null,
  heroVisible: true,
  menuOpen: false,
  booted: false,
};

const els = {
  view: $("#view"),
  loader: $("#loader"),
  canvas: $("#scene"),
  fallback: $(".scene-fallback"),
  top: $("#site-top"),
  announce: $("#announce"),
  header: $("#site-header"),
  menu: $("#menu"),
  footer: $("#site-footer"),
  transition: $("#route-transition"),
  draft: $("#draft-banner"),
  live: $("#live-region"),
  progress: $("#scroll-progress"),
  cursor: $("#cursor"),
  cursorDot: $("#cursor-dot"),
};

/* ------------------------------------------------------------------ scene */

const noop = () => {};
const resolved = () => Promise.resolve();
const STUB_SCENE = {
  supported: false,
  setLoadProgress: noop,
  intro: resolved,
  setLayout: resolved,
  setScroll: noop,
  setVisible: noop,
  pulse: noop,
  focus: noop,
  resize: noop,
  destroy: noop,
};
state.scene = STUB_SCENE;

// Stable facade: views keep one reference even if the real scene attaches late; errors never escape.
const scene = {
  get supported() {
    return !!state.scene.supported;
  },
  get ready() {
    return state.scene !== STUB_SCENE;
  },
  /** Model keys in index order (for focus(index)); empty until the scene attaches. */
  get names() {
    return Array.isArray(state.scene.names) ? state.scene.names.slice() : [];
  },
  /** How many models are on stage (fewer on small screens). */
  get count() {
    return Number(state.scene.count) || 0;
  },
  get layouts() {
    return Array.isArray(state.scene.layouts) ? state.scene.layouts.slice() : [];
  },
  get layout() {
    return typeof state.scene.layout === "string" ? state.scene.layout : sceneLayout;
  },
};
for (const name of ["setLoadProgress", "intro", "setLayout", "setScroll", "setVisible", "pulse", "focus", "resize", "destroy"]) {
  scene[name] = (...args) => {
    try {
      const r = state.scene[name] ? state.scene[name](...args) : undefined;
      return r && typeof r.then === "function" ? r.catch(() => {}) : r;
    } catch (e) {
      console.warn(`[kt] scene.${name} failed`, e);
      return name === "intro" || name === "setLayout" ? Promise.resolve() : undefined;
    }
  };
}

let sceneLayout = "hero";

async function initScene(onProgress) {
  if (!els.canvas) return STUB_SCENE;
  try {
    const mod = await import("./scene.js");
    if (!mod || typeof mod.createScene !== "function") throw new Error("scene.js has no createScene export");
    // fallback:false — the shell shows its own .scene-fallback illustration when WebGL is missing.
    const api = await mod.createScene(els.canvas, { onProgress, reducedMotion: reduced, fallback: false });
    return api && typeof api === "object" ? api : STUB_SCENE;
  } catch (e) {
    console.warn("[kt] 3D scene unavailable, using the static illustration.", e && e.message ? e.message : e);
    return STUB_SCENE;
  }
}

function showSceneFallback() {
  docEl.classList.add("no-webgl");
  if (els.canvas) els.canvas.hidden = true;
  const img = els.fallback && els.fallback.querySelector("img[data-src]");
  if (img && !img.getAttribute("src")) img.setAttribute("src", img.getAttribute("data-src"));
}

function layoutFor(view, ctx) {
  try {
    const l = typeof view.scene === "function" ? view.scene(ctx) : view.scene;
    return typeof l === "string" && l ? l : "hero";
  } catch {
    return "hero";
  }
}

// The scene renders only while the view hero is on screen, the tab is visible and the
// full-screen menu isn't covering it.
const sceneShouldRender = () => state.heroVisible && !document.hidden && !state.menuOpen;

function setSceneVisible(v) {
  state.heroVisible = v;
  scene.setVisible(sceneShouldRender());
}

function observeHero(root) {
  if (state.heroIO) state.heroIO.disconnect();
  state.heroIO = null;
  const always = root && root.getAttribute && root.getAttribute("data-scene-visible") === "always";
  const hero = root && root.querySelector ? root.querySelector(".view-hero") : null;
  if (!hero || always || !window.IntersectionObserver) {
    setSceneVisible(true);
    return;
  }
  state.heroIO = new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    setSceneVisible(e.isIntersecting);
  });
  state.heroIO.observe(hero);
}

document.addEventListener("visibilitychange", () => scene.setVisible(sceneShouldRender()));

/* ------------------------------------------------------------------ scrolling */

function nativeScroller() {
  const listeners = new Set();
  let last = window.scrollY;
  let raf = 0;
  const shim = {
    isShim: true,
    velocity: 0,
    get scroll() {
      return window.scrollY;
    },
    get limit() {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    },
    get progress() {
      const lim = this.limit;
      return lim ? Math.min(1, Math.max(0, window.scrollY / lim)) : 0;
    },
    scrollTo(target, opts = {}) {
      motion.scrollTo(target, { ...opts, offset: opts.offset != null ? opts.offset : typeof target === "number" ? 0 : undefined });
    },
    stop() {
      docEl.classList.add("scroll-locked");
    },
    start() {
      docEl.classList.remove("scroll-locked");
    },
    on(evt, cb) {
      if (evt === "scroll") listeners.add(cb);
      return () => listeners.delete(cb);
    },
    off(evt, cb) {
      listeners.delete(cb);
    },
    resize: noop,
    raf: noop,
  };
  window.addEventListener(
    "scroll",
    () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        shim.velocity = y - last;
        last = y;
        listeners.forEach((cb) => cb(shim));
        if (ST) ST.update();
      });
    },
    { passive: true }
  );
  return shim;
}

function setupScroll() {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  let lenis = null;
  if (!reduced && window.Lenis && gsap) {
    try {
      lenis = new window.Lenis({
        lerp: 0.105,
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 1,
        syncTouch: false,
        prevent: (node) => !!(node && node.closest && node.closest("[data-lenis-prevent], .menu, .draft-banner")),
      });
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
      if (ST) lenis.on("scroll", ST.update);
    } catch (e) {
      console.warn("[kt] Lenis failed, using native scroll", e);
      lenis = null;
    }
  }
  if (!lenis) lenis = nativeScroller();
  state.lenis = lenis;
  motion.attach({ lenis });
  lenis.on("scroll", onScroll);
}

let lastY = 0;
let travel = 0;
function onScroll(l) {
  const y = l.scroll;
  const dy = y - lastY;
  lastY = y;
  const top = els.top;
  if (top) {
    top.classList.toggle("is-scrolled", y > 8);
    if (Math.sign(dy) !== Math.sign(travel)) travel = 0;
    travel += dy;
    if (y < 140 || state.menuOpen) top.classList.remove("is-hidden");
    else if (travel > 48) top.classList.add("is-hidden");
    else if (travel < -24) top.classList.remove("is-hidden");
  }
  const p = typeof l.progress === "number" ? l.progress : 0;
  if (els.progress) els.progress.style.transform = `scaleX(${p.toFixed(4)})`;
  scene.setScroll(p, l.velocity || 0);
}

function resetScroll() {
  const l = state.lenis;
  if (l && !l.isShim) l.scrollTo(0, { immediate: true, force: true });
  window.scrollTo(0, 0);
  if (ST) {
    safe(() => ST.clearScrollMemory && ST.clearScrollMemory("manual"), "scroll memory");
    safe(() => ST.update(), "scroll update");
  }
  if (els.top) els.top.classList.remove("is-hidden", "is-scrolled");
  if (els.progress) els.progress.style.transform = "scaleX(0)";
}

function lockScroll(on) {
  const l = state.lenis;
  if (l) on ? l.stop() : l.start();
  docEl.classList.toggle("scroll-locked", on);
}

/* ------------------------------------------------------------------ chrome: header */

function brand() {
  const site = (state.content && state.content.site) || {};
  const name = site.name || site.wordmark || "Kavish Tuitions";
  const word = site.wordmark || name.split(/\s+/)[0] || name;
  let rest = "";
  if (name.toLowerCase().startsWith(word.toLowerCase())) rest = name.slice(word.length).trim();
  return { name, word, rest };
}

// motion.bind() cleanups for the chrome, which re-renders on every live-preview edit.
let headerUnbind = null;
let footerUnbind = null;

function renderHeader() {
  const b = brand();
  const nav = NAV_KEYS.map((k) => routeByKey(k));
  if (headerUnbind) safe(headerUnbind, "header unbind");
  headerUnbind = null;
  render(
    els.header,
    html`<div class="site-header__inner">
      <a class="wordmark" href="#/" aria-label="${b.name} — home" data-nav="home">
        <span class="wordmark__word">${b.word}</span>${b.rest ? html`<span class="wordmark__rest">${b.rest}</span>` : ""}
      </a>
      <nav class="site-nav" aria-label="Primary">
        <ul class="site-nav__list">
          ${nav.map(
            (r) => html`<li>
              <a class="site-nav__link" href="#/${r.key}" data-nav="${r.id}">
                <span class="site-nav__idx">${r.index}</span><span class="site-nav__label">${r.title}</span>
              </a>
            </li>`
          )}
        </ul>
      </nav>
      <div class="site-header__actions">
        <a class="btn btn--primary btn--sm site-header__cta" href="#/enrol" data-nav="enrol" data-magnetic="0.2">
          <span>Enrol</span><span class="btn__icon">${icon("arrow-right", { size: 16 })}</span>
        </a>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu">
          <span class="menu-toggle__label">Menu</span>
          <span class="menu-toggle__icon" aria-hidden="true"><i></i><i></i></span>
        </button>
      </div>
    </div>`
  );
  $(".menu-toggle", els.header).addEventListener("click", () => toggleMenu(true));
  if (!reduced && finePointer) headerUnbind = motion.bind(els.header);
  markActive();
}

function markActive({ drawDelay = -1 } = {}) {
  const id = state.current ? state.current.id : "home";
  $$("[data-nav]", document).forEach((a) => {
    const on = a.getAttribute("data-nav") === id;
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  // Red-pen underline under the active desktop nav link.
  $$(".site-nav__link", els.header).forEach((a) => {
    const on = a.getAttribute("data-nav") === id;
    const host = $(".site-nav__label", a) || a;
    let pen = $(".pen", host);
    if (on && !pen) {
      host.insertAdjacentHTML("beforeend", String(penUnderline({ cls: "site-nav__pen" })));
      pen = $(".pen", host);
      if (!reduced && gsap && drawDelay >= 0) motion.draw(pen, { duration: 0.7, delay: drawDelay });
    } else if (!on && pen) pen.remove();
  });
}

/* ------------------------------------------------------------------ chrome: mobile menu */

function renderMenu() {
  const site = state.content.site || {};
  const b = brand();
  const wa = store.whatsappLink(site.whatsapp, `Hello ${b.name}, I have a question about classes.`);
  const tel = site.phone ? `tel:${String(site.phone).replace(/[^\d+]/g, "")}` : "";
  render(
    els.menu,
    html`<div class="menu__inner">
      <div class="menu__top">
        <a class="wordmark wordmark--light" href="#/" data-nav="home"><span class="wordmark__word">${b.word}</span>${b.rest ? html`<span class="wordmark__rest">${b.rest}</span>` : ""}</a>
        <button class="menu__close" type="button" aria-label="Close menu">
          <span class="menu-toggle__label">Close</span>${icon("close", { size: 20 })}
        </button>
      </div>
      <nav class="menu__nav" aria-label="Menu">
        <ol class="menu__list">
          ${ROUTES.map(
            (r) => html`<li class="menu__item">
              <a class="menu__link" href="#/${r.key}" data-nav="${r.id}">
                <span class="menu__idx">${r.index}</span><span class="menu__label">${r.title}</span>
              </a>
            </li>`
          )}
        </ol>
      </nav>
      <div class="menu__foot">
        ${tel ? html`<a class="menu__contact" href="${tel}">${icon("phone", { size: 18 })}<span>${site.phone}</span></a>` : ""}
        ${wa ? html`<a class="menu__contact" href="${wa}" target="_blank" rel="noopener">${icon("whatsapp", { size: 18 })}<span>WhatsApp</span></a>` : ""}
        ${site.email ? html`<a class="menu__contact" href="${store.mailtoLink(site.email)}">${icon("mail", { size: 18 })}<span>${site.email}</span></a>` : ""}
        ${site.hours ? html`<p class="menu__hours">${site.hours}</p>` : ""}
      </div>
    </div>`
  );
  $(".menu__close", els.menu).addEventListener("click", () => toggleMenu(false));
  markActive();
}

let menuTween = null;
let menuReturnFocus = null;

function toggleMenu(open, { instant = false } = {}) {
  if (!els.menu || open === state.menuOpen) return;
  state.menuOpen = open;
  const toggle = $(".menu-toggle", els.header);
  if (toggle) toggle.setAttribute("aria-expanded", String(open));
  if (menuTween) menuTween.kill();
  const inertTargets = [els.view, els.footer, els.top, els.draft].filter(Boolean);
  if (open) {
    menuReturnFocus = document.activeElement;
    els.menu.hidden = false;
    docEl.classList.add("menu-open");
    lockScroll(true);
    inertTargets.forEach((n) => (n.inert = true));
    const links = $$(".menu__label, .menu__idx", els.menu);
    const foot = $(".menu__foot", els.menu);
    // The opaque menu covers the whole canvas: stop rendering the scene once it does.
    const hideScene = () => state.menuOpen && scene.setVisible(false);
    if (reduced || !gsap || instant) {
      if (gsap) gsap.set([els.menu, ...links, foot], { clearProps: "all" });
      hideScene();
    } else {
      menuTween = gsap
        .timeline()
        .fromTo(els.menu, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.75, ease: motion.ease.inOut })
        .call(hideScene, [], 0.75)
        .fromTo(links, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: motion.ease.out, stagger: 0.035 }, 0.3)
        .fromTo(foot, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: motion.ease.out }, 0.55);
    }
    const first = $(".menu__link[aria-current]", els.menu) || $(".menu__link", els.menu);
    setTimeout(() => first && first.focus({ preventScroll: true }), reduced ? 0 : 320);
  } else {
    const done = () => {
      els.menu.hidden = true;
      docEl.classList.remove("menu-open");
      if (gsap) gsap.set(els.menu, { clearProps: "clipPath" });
    };
    inertTargets.forEach((n) => (n.inert = false));
    lockScroll(false);
    scene.setVisible(sceneShouldRender()); // live again before the wipe uncovers it
    if (reduced || !gsap || instant) done();
    else menuTween = gsap.to(els.menu, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.55, ease: motion.ease.inOut, onComplete: done });
    const back = menuReturnFocus && menuReturnFocus.isConnected ? menuReturnFocus : toggle;
    if (back && !instant) back.focus({ preventScroll: true });
  }
}

function onMenuKeydown(e) {
  if (!state.menuOpen) return;
  if (e.key === "Escape") {
    e.preventDefault();
    toggleMenu(false);
    return;
  }
  if (e.key !== "Tab") return;
  const focusables = $$('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])', els.menu).filter((n) => n.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/* ------------------------------------------------------------------ chrome: announcement */

const ANNOUNCE_KEY = "kt.announce.dismissed";

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}

function setAnnounceHeight() {
  const h = els.announce && !els.announce.hidden ? els.announce.offsetHeight : 0;
  docEl.style.setProperty("--announce-h", `${h}px`);
}

function renderAnnouncement() {
  const a = (state.content.site && state.content.site.announcement) || {};
  const text = String(a.text || "").trim();
  const show = !!a.enabled && !!text && readSession(ANNOUNCE_KEY) !== text;
  if (!show) {
    els.announce.hidden = true;
    els.announce.innerHTML = "";
    setAnnounceHeight();
    return;
  }
  const href = store.safeUrl(a.href);
  render(
    els.announce,
    html`<div class="announce__inner">
      <p class="announce__text">
        <span class="announce__tag">Notice</span>
        <span class="announce__msg">${text}</span>
        ${href && a.linkLabel ? html`<a class="announce__link" href="${href}">${a.linkLabel}${icon("arrow-right", { size: 14 })}</a>` : ""}
      </p>
      <button class="announce__close" type="button" aria-label="Dismiss notice">${icon("close", { size: 16 })}</button>
    </div>`
  );
  els.announce.hidden = false;
  $(".announce__close", els.announce).addEventListener("click", () => {
    writeSession(ANNOUNCE_KEY, text);
    const finish = () => {
      els.announce.hidden = true;
      if (gsap) gsap.set(els.announce, { clearProps: "height,opacity" });
      setAnnounceHeight();
      motion.refresh();
    };
    if (reduced || !gsap) finish();
    else gsap.to(els.announce, { height: 0, opacity: 0, duration: 0.45, ease: motion.ease.inOut, onComplete: finish });
    $(".site-header .wordmark")?.focus({ preventScroll: true });
  });
  setAnnounceHeight();
}

/* ------------------------------------------------------------------ chrome: footer */

function renderFooter() {
  const c = state.content;
  const site = c.site || {};
  const b = brand();
  const wa = store.whatsappLink(site.whatsapp, `Hello ${b.name}, I have a question about classes.`);
  const tel = site.phone ? `tel:${String(site.phone).replace(/[^\d+]/g, "")}` : "";
  const mail = site.email ? store.mailtoLink(site.email) : "";
  const map = store.safeUrl(site.mapUrl);
  const socials = [
    ["facebook", "Facebook"],
    ["instagram", "Instagram"],
    ["youtube", "YouTube"],
    ["tiktok", "TikTok"],
  ]
    .map(([k, label]) => ({ k, label, href: store.safeUrl(site.social && site.social[k]) }))
    .filter((s) => s.href);
  const levels = (c.levels || []).filter((l) => l && l.id);
  const year = new Date().getFullYear();

  if (footerUnbind) safe(footerUnbind, "footer unbind");
  footerUnbind = null;
  render(
    els.footer,
    html`<div class="footer__inner">
      <div class="footer__sign">
        <p class="eyebrow eyebrow--light"><span class="eyebrow__num">${String(ROUTES.length + 1).padStart(2, "0")}</span>Before you enrol</p>
        <p class="footer__line">Not sure which group fits? <em>Ask ${b.word}.</em></p>
        <div class="footer__ctas">
          ${wa
            ? html`<a class="btn btn--light" href="${wa}" target="_blank" rel="noopener" data-magnetic>
                <span>Message on WhatsApp</span><span class="btn__icon">${icon("whatsapp", { size: 16 })}</span>
              </a>`
            : ""}
          <a class="btn btn--ghost" href="#/enrol" data-magnetic>
            <span>Enrol online</span><span class="btn__icon">${icon("arrow-right", { size: 16 })}</span>
          </a>
          ${tel ? html`<a class="footer__phone" href="${tel}"><span class="mono">or call</span> ${site.phone}</a>` : ""}
        </div>
      </div>

      <div class="footer__cols">
        <div class="footer__col">
          <h2 class="footer__h">Contact</h2>
          <ul class="footer__list">
            ${tel ? html`<li><a href="${tel}">${site.phone}</a></li>` : ""}
            ${wa ? html`<li><a href="${wa}" target="_blank" rel="noopener">WhatsApp</a></li>` : ""}
            ${mail ? html`<li><a href="${mail}">${site.email}</a></li>` : ""}
          </ul>
        </div>
        <div class="footer__col">
          <h2 class="footer__h">Visit</h2>
          ${site.address ? html`<p class="footer__text">${site.address}</p>` : ""}
          ${site.hours ? html`<p class="footer__text footer__text--mono">${site.hours}</p>` : ""}
          ${map ? html`<a class="link-arrow link-arrow--light" href="${map}" target="_blank" rel="noopener">Open in Maps ${icon("arrow-up-right", { size: 15 })}</a>` : ""}
        </div>
        <div class="footer__col">
          <h2 class="footer__h">Explore</h2>
          <ul class="footer__list">
            ${ROUTES.filter((r) => r.key).map((r) => html`<li><a href="#/${r.key}" data-nav="${r.id}">${r.title}</a></li>`)}
          </ul>
        </div>
        ${levels.length
          ? html`<div class="footer__col">
              <h2 class="footer__h">Levels</h2>
              <ul class="footer__list footer__list--levels">
                ${levels.map(
                  (l) => html`<li>
                    <a href="#/courses?level=${encodeURIComponent(l.id)}"><span>${l.name}</span>${l.exam ? html`<span class="footer__exam">${l.exam}</span>` : ""}</a>
                  </li>`
                )}
              </ul>
            </div>`
          : ""}
      </div>

      <div class="footer__mark-row">
        <div class="footer__mark" aria-hidden="true">${b.word}</div>
        ${site.tagline ? html`<p class="footer__tagline">${site.tagline}</p>` : ""}
      </div>

      <div class="footer__base">
        <p class="footer__copy">© ${year} ${b.name}</p>
        <p class="footer__end mono">— End of paper —</p>
        <div class="footer__base-links">
          ${socials.length
            ? html`<ul class="footer__social" aria-label="Social media">
                ${socials.map((s) => html`<li><a href="${s.href}" target="_blank" rel="noopener" aria-label="${s.label}">${icon(s.k, { size: 18 })}</a></li>`)}
              </ul>`
            : ""}
          <a class="footer__admin" href="admin/">Admin</a>
          <button class="footer__top" type="button" data-cursor="Top">Back to top ${icon("arrow-up-right", { size: 15, cls: "footer__top-icon" })}</button>
        </div>
      </div>
    </div>`
  );
  $(".footer__top", els.footer).addEventListener("click", () => {
    if (state.lenis && !state.lenis.isShim) state.lenis.scrollTo(0, { duration: 1.6 });
    else window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    const first = $(".wordmark", els.header);
    if (first) setTimeout(() => first.focus({ preventScroll: true }), reduced ? 0 : 900);
  });
  if (!reduced && finePointer) footerUnbind = motion.bind(els.footer);
  markActive();
}

// The footer's "Before you enrol" sign is the closing call to action for pages that don't end on
// one. It stands aside on the enrol page itself and after a view whose last section already asks
// the visitor to enrol, so two near-identical CTA bands never stack. A view can also decide
// explicitly with data-footer-cta="on" | "off" on its root.
function syncFooterCta(root, info) {
  if (!els.footer) return;
  const pref = root && root.getAttribute ? root.getAttribute("data-footer-cta") : null;
  let on = true;
  if (pref === "on" || pref === "off") on = pref === "on";
  else if (info && info.id === "enrol") on = false;
  else {
    const last = root && root.lastElementChild;
    on = !(last && last.querySelector('a[href^="#/enrol"]'));
  }
  els.footer.dataset.cta = on ? "on" : "off";
}

/* ------------------------------------------------------------------ chrome: draft banner */

const PUBLISH_KEY = "kt.admin.lastPublish.v1"; // written by the admin after a successful Publish
const PAGES_WINDOW = 20 * 60e3;

/**
 * True when the draft being previewed is exactly what this browser just published.
 * store.publishContent() stamps meta.updatedAt and saves the committed copy as the draft, so the
 * site keeps "previewing" it until GitHub Pages serves the new data/content.json. Those edits are
 * published, not unpublished — the live file just lags a minute or two behind.
 */
function justPublished(draft) {
  const at = Date.parse((draft && draft.meta && draft.meta.updatedAt) || "");
  if (!Number.isFinite(at) || Date.now() - at > PAGES_WINDOW) return false;
  const liveAt = Date.parse((state.published && state.published.meta && state.published.meta.updatedAt) || "");
  if (Number.isFinite(liveAt) && liveAt >= at) return false;
  try {
    const rec = JSON.parse(localStorage.getItem(PUBLISH_KEY) || "null");
    if (rec && rec.content) return store.sameContent(store.normalizeContent(rec.content), store.normalizeContent(draft));
  } catch {}
  // No admin record: the draft is the committed copy if nobody has saved over it since.
  const saved = Date.parse((store.getDraftInfo() || {}).savedAt || "");
  return Number.isFinite(saved) && saved - at < 60e3;
}

function renderDraftBanner() {
  if (!els.draft) return;
  const draft = store.getDraft();
  const hasDraft = !!draft;
  const live = store.isViewingLive();
  if (state.source === "draft" && justPublished(draft)) {
    render(
      els.draft,
      html`<span class="draft-banner__dot draft-banner__dot--live" aria-hidden="true"></span>
        <span class="draft-banner__text">Published — the live site updates in a minute or two</span>
        <span class="draft-banner__sep" aria-hidden="true">·</span>
        <button class="draft-banner__link" type="button" data-draft="live">View live site</button>`
    );
  } else if (state.source === "draft") {
    render(
      els.draft,
      html`<span class="draft-banner__dot" aria-hidden="true"></span>
        <span class="draft-banner__text">Previewing unpublished edits</span>
        <span class="draft-banner__sep" aria-hidden="true">—</span>
        <a class="draft-banner__link" href="admin/">Open admin</a>
        <span class="draft-banner__sep" aria-hidden="true">·</span>
        <button class="draft-banner__link" type="button" data-draft="live">View live site</button>`
    );
  } else if (live && hasDraft) {
    render(
      els.draft,
      html`<span class="draft-banner__dot draft-banner__dot--live" aria-hidden="true"></span>
        <span class="draft-banner__text">Viewing the live site</span>
        <span class="draft-banner__sep" aria-hidden="true">—</span>
        <button class="draft-banner__link" type="button" data-draft="preview">Show my unpublished edits</button>`
    );
  } else {
    els.draft.hidden = true;
    els.draft.innerHTML = "";
    return;
  }
  els.draft.hidden = false;
  const btn = $("[data-draft]", els.draft);
  btn.addEventListener("click", () => {
    store.setViewingLive(btn.getAttribute("data-draft") === "live");
    reloadContent({ announceMsg: btn.getAttribute("data-draft") === "live" ? "Showing the live site" : "Showing your unpublished edits" });
  });
}

/* ------------------------------------------------------------------ meta */

function setMeta(name, value, attr = "name") {
  if (!value) return;
  let m = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!m) {
    m = document.createElement("meta");
    m.setAttribute(attr, name);
    document.head.appendChild(m);
  }
  m.setAttribute("content", value);
}

function applySiteMeta() {
  const site = state.content.site || {};
  const b = brand();
  setMeta("description", site.description || site.tagline);
  setMeta("og:site_name", b.name, "property");
  setMeta("og:title", site.tagline ? `${b.name} — ${site.tagline}` : b.name, "property");
  setMeta("og:description", site.description || site.tagline, "property");
  try {
    localStorage.setItem("kt.shell.brand", JSON.stringify({ name: b.name, word: b.word }));
  } catch {}
}

function setTitle(viewTitle) {
  const b = brand();
  const site = state.content.site || {};
  document.title = !viewTitle || viewTitle === "Home" ? `${b.name}${site.tagline ? ` — ${site.tagline}` : ""}` : `${viewTitle} — ${b.name}`;
}

function announce(msg) {
  if (!els.live) return;
  els.live.textContent = "";
  setTimeout(() => {
    els.live.textContent = String(msg || "");
  }, 60);
}

function renderChrome() {
  renderAnnouncement();
  renderHeader();
  renderMenu();
  renderFooter();
  renderDraftBanner();
}

/* ------------------------------------------------------------------ inline views */

const NOT_FOUND = {
  id: "not-found",
  title: "Page not found",
  scene: "away",
  render() {
    return html`<section class="view view--not-found" data-view="not-found">
      <header class="view-hero view-hero--compact shell-hero">
        <div class="container shell-hero__grid">
          <p class="eyebrow" data-intro><span class="eyebrow__num">Q.404</span>Unanswered</p>
          <h1 class="display shell-hero__title" data-split="intro">This page isn’t<br />on the <span class="pen-mark"><em>syllabus.</em>${penCircle()}</span></h1>
          <p class="lead shell-hero__lead" data-intro>The link may be old, or the page has moved. Everything we teach is one click away.</p>
          <div class="shell-hero__actions" data-intro>
            <a class="btn btn--primary" href="#/" data-magnetic><span>Back to the start</span><span class="btn__icon">${icon("arrow-right", { size: 16 })}</span></a>
            <a class="btn btn--ghost" href="#/courses" data-magnetic><span>Browse courses</span><span class="btn__icon">${icon("arrow-right", { size: 16 })}</span></a>
          </div>
          <p class="margin-note shell-hero__note" data-intro="fade">No answer at this address.<span class="margin-note__marks">[0 marks]</span></p>
        </div>
      </header>
    </section>`;
  },
};

function unavailableView(def, err) {
  return {
    id: def ? def.id : "unavailable",
    title: def ? def.title : "Unavailable",
    scene: "scatter",
    unavailable: true,
    render() {
      return html`<section class="view view--unavailable" data-view="unavailable">
        <header class="view-hero view-hero--compact shell-hero">
          <div class="container shell-hero__grid">
            <p class="eyebrow" data-intro><span class="eyebrow__num">${def ? def.index : "00"}</span>${def ? def.title : "Page"}</p>
            <h1 class="display shell-hero__title" data-split="intro">This page didn’t<br /><em>load</em> properly.</h1>
            <p class="lead shell-hero__lead" data-intro>It’s usually a weak connection. Try again — or reach us directly, we reply quickly.</p>
            <div class="shell-hero__actions" data-intro>
              <button class="btn btn--primary" type="button" data-retry><span>Try again</span><span class="btn__icon">${icon("refresh", { size: 16 })}</span></button>
              <a class="btn btn--ghost" href="#/"><span>Home</span><span class="btn__icon">${icon("arrow-right", { size: 16 })}</span></a>
            </div>
            ${err ? html`<p class="shell-hero__err mono" data-intro>${String(err.message || err).slice(0, 160)}</p>` : ""}
          </div>
        </header>
      </section>`;
    },
    mount(root) {
      const b = $("[data-retry]", root);
      const retry = () => {
        state.current = null;
        go(parseHash());
      };
      if (b) b.addEventListener("click", retry);
      return () => b && b.removeEventListener("click", retry);
    },
  };
}

const viewCache = new Map();
const viewFailures = new Map();

async function loadView(info) {
  if (!info.def) return NOT_FOUND;
  const name = info.def.module;
  if (viewCache.has(name)) return viewCache.get(name);
  // Browsers remember a failed module import forever; a retry needs a fresh URL.
  const fails = viewFailures.get(name) || 0;
  try {
    const mod = await import(fails ? `./views/${name}.js?retry=${fails}` : `./views/${name}.js`);
    const view = mod && mod.default;
    if (!view || typeof view.render !== "function") throw new Error(`views/${name}.js has no default export with render()`);
    viewCache.set(name, view);
    return view;
  } catch (e) {
    viewFailures.set(name, fails + 1);
    console.error(`[kt] Could not load the "${name}" page`, e);
    return unavailableView(info.def, e);
  }
}

/* ------------------------------------------------------------------ mount / unmount */

function makeCtx(info) {
  const ctx = {
    content: state.content,
    source: state.source,
    params: info.params,
    query: info.query,
    route: info.id,
    path: info.path,
    navigate,
    setQuery: (obj) => setQuery(obj, ctx),
    announce,
    store,
    ui,
    motion,
    scene,
    lenis: state.lenis,
  };
  return ctx;
}

function viewTitle(view, ctx, info) {
  try {
    const t = typeof view.title === "function" ? view.title(ctx) : view.title;
    if (t) return String(t);
  } catch {}
  return info.def ? info.def.title : "Page";
}

function toMarkup(out) {
  if (out == null || out === false) return "";
  if (typeof out === "string") return out;
  if (Array.isArray(out)) return out.map(toMarkup).join("");
  return String(out);
}

function mountView(view, info, { intro = true } = {}) {
  const ctx = makeCtx(info);
  let markup;
  try {
    markup = toMarkup(view.render(ctx));
  } catch (e) {
    console.error(`[kt] ${view.id || info.id}.render failed`, e);
    view = unavailableView(info.def, e);
    markup = toMarkup(view.render(ctx));
  }
  els.view.innerHTML = markup;
  const root = els.view.querySelector("[data-view]") || els.view.firstElementChild || els.view;
  els.view.setAttribute("data-route", info.id);

  let cleanup = null;
  let gctx = null;
  const run = () => {
    if (typeof view.mount !== "function") return;
    const r = view.mount(root, ctx);
    if (typeof r === "function") cleanup = r;
    else if (r && typeof r.then === "function") r.then((fn) => typeof fn === "function" && (m.cleanup = fn)).catch((e) => console.error(`[kt] ${view.id}.mount failed`, e));
  };
  const m = { view, root, ctx, gctx: null, cleanup: null, unbind: null, info };
  try {
    if (gsap) {
      gctx = gsap.context(() => {}, root);
      gctx.add(run);
    } else run();
  } catch (e) {
    console.error(`[kt] ${view.id || info.id}.mount failed`, e);
  }
  m.gctx = gctx;
  if (cleanup) m.cleanup = cleanup;
  m.unbind = safe(() => motion.bind(root, { intro }), "motion.bind");
  state.mounted = m;
  state.current = info;
  syncFooterCta(root, info);
  watchImages(root);
  observeHero(root);
  return m;
}

function unmountView() {
  const m = state.mounted;
  if (!m) return;
  safe(() => m.cleanup && m.cleanup(), "view cleanup");
  safe(() => m.unbind && m.unbind(), "motion unbind");
  safe(() => m.gctx && m.gctx.revert(), "context revert");
  if (state.heroIO) state.heroIO.disconnect();
  state.heroIO = null;
  state.mounted = null;
  els.view.innerHTML = "";
}

// Lazy images change the page height: keep ScrollTrigger positions honest.
let refreshTimer = 0;
function queueRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => motion.refresh(), 180);
}
function watchImages(root) {
  $$("img", root).forEach((img) => {
    if (!img.complete) img.addEventListener("load", queueRefresh, { once: true });
  });
}
if (window.ResizeObserver) {
  let lastH = 0;
  new ResizeObserver(() => {
    const h = els.view.offsetHeight;
    if (Math.abs(h - lastH) > 4) {
      lastH = h;
      if (state.booted && !state.busy) queueRefresh();
    }
  }).observe(els.view);
}

function focusView(root) {
  const target = $("h1", root) || els.view;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  safe(() => target.focus({ preventScroll: true }), "focus");
}

/* ------------------------------------------------------------------ navigation */

function navigate(hash) {
  const h = String(hash || "#/");
  const target = h.startsWith("#") ? h : `#${h.startsWith("/") ? "" : "/"}${h}`;
  if (target === location.hash) {
    onHashChange();
    return;
  }
  location.hash = target;
}

function setQuery(obj, ctx) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v)) v.filter((x) => x !== "" && x != null).forEach((x) => q.append(k, String(x)));
    else q.set(k, String(v));
  }
  const path = (ctx && ctx.path) || (state.current && state.current.path) || "/";
  const qs = q.toString();
  const hash = `#${path}${qs ? `?${qs}` : ""}`;
  try {
    history.replaceState(history.state, "", hash);
  } catch {}
  if (ctx) ctx.query = q;
  if (state.current && state.current.path === path) state.current = { ...state.current, query: q, hash };
  return q;
}

function labelFor(info) {
  if (!info.def) return { index: "00", title: "Not found" };
  if (info.key === "courses" && info.params[0] && state.content) {
    const c = store.byId(state.content.courses, info.params[0]);
    if (c) return { index: info.def.index, title: c.title };
  }
  return { index: info.def.index, title: info.def.title };
}

function onHashChange() {
  if (!state.booted) return; // boot reads the hash again when it finishes
  const raw = location.hash || "";
  if (raw && raw !== "#" && !raw.startsWith("#/")) {
    handleAnchor(raw);
    return;
  }
  const info = parseHash(raw);
  const cur = state.current;
  if (!state.busy && cur && sameRoute(info, cur)) {
    if (info.query.toString() === cur.query.toString()) return;
    const m = state.mounted;
    if (m && typeof m.view.onQuery === "function") {
      state.current = info;
      m.ctx.query = info.query;
      safe(() => m.view.onQuery(info.query, m.ctx), "onQuery");
      return;
    }
  }
  go(info);
}

function handleAnchor(raw) {
  const id = decode(raw.slice(1));
  const back = (state.current && state.current.hash) || "#/";
  try {
    history.replaceState(history.state, "", back);
  } catch {}
  const target = id && document.getElementById(id);
  if (!target) return;
  if (target === els.view) {
    const h1 = $("h1", els.view);
    (h1 || els.view).focus({ preventScroll: true });
    return;
  }
  motion.scrollTo(target);
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  setTimeout(() => target.focus({ preventScroll: true }), reduced ? 0 : 800);
}

async function go(info) {
  if (state.busy) {
    state.queued = true;
    return;
  }
  state.busy = true;
  try {
    await transitionTo(info);
  } catch (e) {
    console.error("[kt] navigation failed", e);
  } finally {
    state.busy = false;
  }
  // A live-preview edit that arrived mid-transition was held back (see reloadContent).
  const pending = rerenderPending;
  rerenderPending = false;
  if (state.queued) {
    state.queued = false;
    const latest = parseHash();
    if (!(state.current && sameRoute(latest, state.current) && latest.query.toString() === state.current.query.toString())) {
      go(latest); // mounts from the fresh state.content, so the held edit needs no extra pass
      return;
    }
  }
  if (pending) {
    rerenderInPlace();
    announce("Preview updated");
  }
}

/* ---- the ink panel ---------------------------------------------------- */

function setTransitionLabel(label) {
  const t = els.transition;
  $(".route-transition__idx", t).textContent = label.index;
  $(".route-transition__title", t).textContent = label.title;
  $(".route-transition__count", t).textContent = `${label.index} / ${String(ROUTES.length).padStart(2, "0")}`;
}

function wipeIn(label) {
  const t = els.transition;
  setTransitionLabel(label);
  const panel = $(".route-transition__panel", t);
  const edge = $(".route-transition__edge", t);
  const parts = $$(".route-transition__mask > *", t);
  t.classList.add("is-active");
  return new Promise((resolve) => {
    gsap
      .timeline({ onComplete: resolve })
      .set(t, { autoAlpha: 1 })
      .fromTo(panel, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.62, ease: motion.ease.inOut }, 0)
      .fromTo(edge, { yPercent: 0, y: () => window.innerHeight, autoAlpha: 1 }, { y: 0, duration: 0.62, ease: motion.ease.inOut }, 0)
      .to(edge, { autoAlpha: 0, duration: 0.2 }, 0.5)
      .fromTo(parts, { yPercent: 110 }, { yPercent: 0, duration: 0.75, ease: motion.ease.out, stagger: 0.06 }, 0.28);
  });
}

function wipeOut(onMidway) {
  const t = els.transition;
  const panel = $(".route-transition__panel", t);
  const parts = $$(".route-transition__mask > *", t);
  return new Promise((resolve) => {
    gsap
      .timeline({
        onComplete: () => {
          gsap.set(t, { autoAlpha: 0 });
          gsap.set(panel, { clipPath: "inset(100% 0% 0% 0%)" });
          t.classList.remove("is-active");
          resolve();
        },
      })
      .to(parts, { yPercent: -110, duration: 0.45, ease: "power3.in", stagger: 0.03 }, 0)
      .to(panel, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.72, ease: motion.ease.inOut }, 0.22)
      .call(() => onMidway && onMidway(), [], 0.55);
  });
}

async function transitionTo(info) {
  const viewP = loadView(info);
  const animated = !reduced && !!gsap && state.booted;
  const label = labelFor(info);
  const prevId = state.current ? state.current.id : null;

  if (animated) {
    await Promise.all([wipeIn(label), Promise.race([viewP, sleep(4000)])]);
  } else if (state.booted) {
    if (gsap) await new Promise((r) => gsap.to(els.view, { autoAlpha: 0, duration: 0.1, ease: "none", onComplete: r }));
    else els.view.style.opacity = "0";
  }
  const view = await viewP;
  if (state.menuOpen) toggleMenu(false, { instant: true });
  unmountView();
  resetScroll();
  const m = mountView(view, info, { intro: true });
  const title = viewTitle(view, m.ctx, info);
  setTitle(title);
  markActive({ drawDelay: animated ? 0.75 : -1 });
  sceneLayout = layoutFor(view, m.ctx);
  scene.setLayout(sceneLayout);
  if (prevId !== info.id) scene.pulse();
  motion.refresh();
  // ScrollTrigger.refresh() restores the scroll position it cached before the reset: reset again.
  resetScroll();

  if (animated) {
    let introP = null;
    await wipeOut(() => {
      introP = motion.intro(m.root);
    });
    focusView(m.root);
    await introP;
  } else {
    if (gsap) gsap.to(els.view, { autoAlpha: 1, duration: 0.1, ease: "none", clearProps: "opacity,visibility" });
    else els.view.style.opacity = "";
    motion.intro(m.root, { instant: true });
    if (state.booted) focusView(m.root);
  }
  announce(`${title} page`);
}

/* ------------------------------------------------------------------ live preview */

let reloadTimer = 0;
let rerenderPending = false;

async function reloadContent({ announceMsg = "Preview updated" } = {}) {
  let res;
  try {
    res = await store.loadContent();
  } catch (e) {
    console.warn("[kt] content reload failed", e);
    return;
  }
  state.content = res.content;
  state.published = res.published;
  state.source = res.source;
  window.KT.content = res.content;
  window.KT.source = res.source;
  applySiteMeta();
  renderChrome();
  if (state.busy) {
    rerenderPending = true;
    return;
  }
  rerenderInPlace();
  announce(announceMsg);
}

function rerenderInPlace() {
  const m = state.mounted;
  if (!m || !state.current) return;
  const y = window.scrollY;
  const info = state.current;
  const view = m.view;
  const swap = () => {
    unmountView();
    const next = mountView(view, info, { intro: true });
    motion.intro(next.root, { instant: true });
    setTitle(viewTitle(view, next.ctx, info));
    markActive();
    motion.refresh();
    const l = state.lenis;
    if (l && !l.isShim) l.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
    if (gsap) gsap.to(els.view, { autoAlpha: 1, duration: reduced ? 0.1 : 0.3, ease: "power1.out", clearProps: "opacity,visibility" });
  };
  if (gsap) gsap.to(els.view, { autoAlpha: 0, duration: reduced ? 0.08 : 0.15, ease: "power1.in", onComplete: swap });
  else swap();
}

store.onStoreChange((kind) => {
  if (kind !== "draft") return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => reloadContent(), 350);
});

/* ------------------------------------------------------------------ cursor */

function setupCursor() {
  const c = els.cursor;
  const dot = els.cursorDot;
  if (!c || !dot || reduced || !finePointer || !gsap) return;
  const ring = $(".cursor__ring", c);
  const label = $(".cursor__label", c);
  docEl.classList.add("has-cursor");
  let x = -100;
  let y = -100;
  let rx = x;
  let ry = y;
  let visible = false;
  let kind = "";
  // Filled controls (buttons, chips) have their own hover state: the ring steps aside there.
  const SOLID = '.btn, .chip, .menu-toggle, .menu__close, .announce__close, .footer__social a';
  const INTERACTIVE = 'a[href], button, [role="button"], summary, label, select, input[type="checkbox"], input[type="radio"]';
  const TEXT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]';
  const INK = ".section--ink, .on-ink, .site-footer, .menu, .announce, .draft-banner, .route-transition, [data-cursor-invert]";

  const setKind = (k, text = "") => {
    if (k === kind && text === label.textContent) return;
    kind = k;
    c.dataset.state = k;
    dot.dataset.state = k;
    label.textContent = text;
  };

  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      if (!visible) {
        visible = true;
        rx = x;
        ry = y;
        c.classList.add("is-visible");
        dot.classList.add("is-visible");
      }
    },
    { passive: true }
  );
  document.addEventListener("pointerover", (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    c.classList.toggle("is-inverted", !!t.closest(INK));
    if (t.closest(TEXT)) return setKind("text");
    const labelled = t.closest("[data-cursor]");
    if (labelled) return setKind("label", labelled.getAttribute("data-cursor") || "");
    if (t.closest(SOLID)) return setKind("solid");
    if (t.closest(INTERACTIVE)) return setKind("link");
    setKind("");
  });
  const hide = () => {
    visible = false;
    c.classList.remove("is-visible");
    dot.classList.remove("is-visible");
  };
  document.documentElement.addEventListener("mouseleave", hide);
  window.addEventListener("blur", hide);
  window.addEventListener("pointerdown", () => c.classList.add("is-down"), { passive: true });
  window.addEventListener("pointerup", () => c.classList.remove("is-down"), { passive: true });

  gsap.ticker.add((time, dt) => {
    if (!visible) return;
    const k = 1 - Math.pow(1 - 0.24, Math.min(dt, 64) / 16.67);
    rx += (x - rx) * k;
    ry += (y - ry) * k;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    ring.style.transform = `translate3d(${rx.toFixed(2)}px, ${ry.toFixed(2)}px, 0)`;
  });
}

/* ------------------------------------------------------------------ global links */

function onDocumentClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
  if (!a || a.target === "_blank") return;
  const href = a.getAttribute("href") || "";
  if (!href.startsWith("#")) return;
  if (href.startsWith("#/") || href === "#") {
    const next = parseHash(href);
    if (state.current && next.hash === state.current.hash) {
      // Same page: glide back to the top instead of a no-op.
      e.preventDefault();
      if (state.menuOpen) toggleMenu(false);
      if (window.scrollY > 4) {
        if (state.lenis && !state.lenis.isShim) state.lenis.scrollTo(0, { duration: 1.2 });
        else window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      }
      return;
    }
    if (state.menuOpen && reduced) toggleMenu(false, { instant: true });
  }
}

/* ------------------------------------------------------------------ loader + boot */

const MIN_LOAD = reduced ? 400 : 1400;
const MAX_LOAD = 6000;
const SLOW_HINT = 12000;
const CONTENT_TIMEOUT = 45000;

function cachedBrand() {
  try {
    const v = JSON.parse(localStorage.getItem("kt.shell.brand") || "null");
    return v && v.word ? v : null;
  } catch {
    return null;
  }
}

function setLoaderBrand(name, word, animate) {
  const nameEl = $("[data-loader='name']", els.loader);
  const wordEl = $("[data-loader='word']", els.loader);
  if (!nameEl || !wordEl) return;
  if (nameEl.textContent === name && wordEl.textContent === word) return;
  nameEl.textContent = name;
  wordEl.textContent = word;
  if (animate && gsap && !reduced) {
    gsap.fromTo([wordEl, nameEl], { yPercent: 105 }, { yPercent: 0, duration: 1, ease: motion.ease.out, stagger: 0.08 });
  }
}

async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  await Promise.race([
    Promise.all([
      document.fonts.load('400 1em "Instrument Serif"'),
      document.fonts.load('italic 400 1em "Instrument Serif"'),
      document.fonts.load('400 1em "Geist"'),
      document.fonts.load('500 1em "Geist"'),
      document.fonts.load('400 1em "Geist Mono"'),
    ]).then(() => document.fonts.ready),
    sleep(3500),
  ]).catch(() => {});
}

function runLoader() {
  const numEl = $(".loader__num", els.loader);
  const fill = $(".loader__rule-fill", els.loader);
  const parts = { fonts: 0, content: 0, view: 0, scene: 0 };
  const W = { fonts: 0.15, content: 0.25, view: 0.15, scene: 0.45 };
  const start = performance.now();
  let shown = 0;
  let forced = false;
  let finished = false;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  // After MAX_LOAD the loader stops waiting for the 3D scene, fonts and view, but never claims 100
  // before the content (timetable, fees) has actually arrived.
  const target = () => Object.keys(W).reduce((s, k) => s + W[k] * Math.min(1, forced && k !== "content" ? 1 : parts[k]), 0);
  const maxTimer = setTimeout(() => (forced = true), MAX_LOAD);

  let lastText = "";
  let prev = start;
  let raf = 0;
  const frame = (now, stalled = false) => {
    if (finished) return;
    const dt = Math.min(100, Math.max(0, now - prev));
    prev = now;
    const t = Math.min(1, (now - start) / MIN_LOAD);
    const cap = 0.5 - Math.cos(Math.PI * t) / 2; // eased minimum duration
    const goal = Math.min(target(), cap);
    if (reduced || stalled) shown = goal;
    else {
      const k = 1 - Math.pow(1 - 0.1, dt / 16.67);
      shown = Math.min(goal, shown + Math.max((goal - shown) * k, (0.35 * dt) / 1000));
    }
    if (goal - shown < 0.002) shown = goal;
    const n = Math.round(shown * 100);
    const text = String(n).padStart(3, "0");
    if (text !== lastText) {
      numEl.textContent = text;
      lastText = text;
    }
    if (fill) fill.style.transform = `scaleX(${shown.toFixed(4)})`;
    scene.setLoadProgress(shown);
    if (shown >= 0.999 && target() >= 0.999) {
      finished = true;
      clearTimeout(maxTimer);
      clearInterval(stallTimer);
      cancelAnimationFrame(raf);
      numEl.textContent = "100";
      resolveDone();
      return;
    }
    if (!raf) raf = requestAnimationFrame(onFrame);
  };
  const onFrame = (now) => {
    raf = 0;
    frame(now);
  };
  // Browsers pause requestAnimationFrame in background tabs. A tab opened in the background
  // must still finish booting, so a slow timer takes over whenever frames stop arriving
  // (at once when the tab is hidden; after a long stall otherwise, so a busy frame or two
  // never makes the counter jump).
  const stallTimer = setInterval(() => {
    const now = performance.now();
    if (now - prev > (document.hidden ? 200 : 1000)) frame(now, true);
  }, 250);
  raf = requestAnimationFrame(onFrame);
  return {
    set(k, v) {
      parts[k] = Math.max(parts[k], v);
    },
    done,
  };
}

// The scene animates loader → the initial route's layout (intro accepts the target layout name).
function sceneIntro() {
  return scene.intro(sceneLayout);
}

async function exitLoader(root) {
  const L = els.loader;
  const headerParts = $$(".announce__inner, .site-header__inner");
  if (reduced || !gsap) {
    if (gsap) await new Promise((r) => gsap.to(L, { autoAlpha: 0, duration: 0.2, onComplete: r }));
    L.hidden = true;
    docEl.classList.remove("is-loading");
    sceneIntro();
    motion.intro(root, { instant: reduced });
    return;
  }
  const tick = $(".loader__tick", L);
  const tickPaths = tick ? $$("[data-draw]", tick) : [];
  const ui = $$(".loader__mask > *", L);
  const rule = $(".loader__rule", L);
  const top = $(".loader__panel--top", L);
  const bottom = $(".loader__panel--bottom", L);
  let introP = null;
  await new Promise((resolve) => {
    const tl = gsap.timeline({
      onComplete: resolve,
    });
    if (tickPaths.length) {
      tl.set(tick, { autoAlpha: 1 }, 0);
      tl.add(motion.draw(tick, { duration: 0.45, stagger: 0 }) || gsap.to({}, { duration: 0.01 }), 0);
    }
    if (tick) tl.to(tick, { autoAlpha: 0, y: -12, duration: 0.45, ease: "power3.in" }, 0.5);
    tl.to(ui, { yPercent: -110, duration: 0.6, ease: "power3.in", stagger: 0.025 }, 0.42)
      .to(rule, { scaleX: 0, transformOrigin: "100% 50%", duration: 0.55, ease: "power3.in" }, 0.5)
      .to(top, { yPercent: -100, duration: 1.15, ease: motion.ease.inOut }, 0.78)
      .to(bottom, { yPercent: 100, duration: 1.15, ease: motion.ease.inOut }, 0.78)
      .call(() => sceneIntro(), [], 0.7)
      .fromTo(headerParts, { y: -18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9, ease: motion.ease.out, stagger: 0.06, clearProps: "transform,opacity,visibility" }, 1.3)
      .call(() => {
        introP = motion.intro(root);
      }, [], 1.2)
      .call(() => docEl.classList.remove("is-loading"), [], 1.93);
  });
  L.hidden = true;
  docEl.classList.remove("is-loading");
  await introP;
}

function bootError(message) {
  window.clearTimeout(window.__ktBootTimer);
  // html.boot-failed hides the loader, and with it this box and its "Try again" button.
  docEl.classList.remove("boot-failed");
  const box = $(".loader__error", els.loader);
  if (!box) return;
  render(
    box,
    html`<p class="loader__error-title">The site couldn’t load its content.</p>
      <p class="loader__error-text">${message}</p>
      <button class="btn btn--light btn--sm" type="button" onclick="location.reload()"><span>Try again</span><span class="btn__icon">${icon("refresh", { size: 14 })}</span></button>`
  );
  box.hidden = false;
  els.loader.classList.add("has-error");
}

async function boot() {
  setupScroll();
  const cached = cachedBrand();
  if (cached) setLoaderBrand(cached.name, cached.word, false);

  const loader = runLoader();
  const initial = parseHash();
  if (location.hash && !location.hash.startsWith("#/") && location.hash !== "#") {
    try {
      history.replaceState(null, "", "#/");
    } catch {}
  }

  const fontsP = loadFonts().then(() => loader.set("fonts", 1));
  const viewP = loadView(initial).then((v) => {
    loader.set("view", 1);
    return v;
  });
  let sceneAttached = false;
  const sceneP = initScene((p) => loader.set("scene", Number(p) || 0)).then((api) => {
    loader.set("scene", 1);
    return api;
  });
  // Attach the scene whenever it is ready, even if that is after the loader gave up waiting.
  sceneP.then((api) => {
    state.scene = api;
    window.KT.sceneApi = api;
    if (!api.supported) showSceneFallback();
    if (sceneAttached) sceneIntro();
    scene.setVisible(sceneShouldRender());
  });

  // A very slow connection keeps the loader up: say so after a while, and offer a retry
  // (instead of an endless loader) if the content never arrives.
  const hint = $(".loader__hint", els.loader);
  const slowTimer = setTimeout(() => {
    if (hint) hint.textContent = "Still loading — the connection is slow.";
  }, SLOW_HINT);
  let giveUpTimer = 0;
  const giveUp = new Promise((resolve, reject) => {
    giveUpTimer = setTimeout(() => reject(new Error("The connection is too slow to load the timetable and fees right now. Check it and try again.")), CONTENT_TIMEOUT);
  });
  let content;
  try {
    content = await Promise.race([store.loadContent(), giveUp]);
  } catch (e) {
    console.error("[kt] content failed to load", e);
    bootError(e && e.message ? e.message : "Check that data/content.json exists and is valid JSON.");
    return;
  } finally {
    clearTimeout(slowTimer);
    clearTimeout(giveUpTimer);
  }
  state.content = content.content;
  state.published = content.published;
  state.source = content.source;
  loader.set("content", 1);
  window.KT.content = state.content;
  window.KT.source = state.source;
  const b = brand();
  setLoaderBrand(b.name, b.word, !cached || cached.word !== b.word);
  applySiteMeta();

  await Promise.all([fontsP, viewP]);
  renderChrome();
  // Ready to show something: wait for the counter (min time, scene progress or the 6s cap).
  await loader.done;
  sceneAttached = true;

  const view = await viewP;
  const m = mountView(view, initial, { intro: true });
  setTitle(viewTitle(view, m.ctx, initial));
  markActive({ drawDelay: reduced ? -1 : 2 });
  sceneLayout = layoutFor(view, m.ctx);
  motion.refresh();
  state.booted = true;
  window.clearTimeout(window.__ktBootTimer);
  docEl.classList.remove("boot-failed");
  docEl.classList.add("is-booted");

  state.busy = true;
  try {
    await exitLoader(m.root);
  } finally {
    state.busy = false;
  }
  motion.refresh();
  if (rerenderPending) {
    rerenderPending = false;
    rerenderInPlace();
    announce("Preview updated");
  }
  // The visitor may have used back/forward while the loader was showing.
  const latest = parseHash();
  if (!sameRoute(latest, state.current) || latest.query.toString() !== state.current.query.toString()) onHashChange();
}

/* ------------------------------------------------------------------ wire up */

window.KT = {
  content: null,
  source: null,
  navigate,
  scene,
  sceneApi: null,
  motion,
  get lenis() {
    return state.lenis;
  },
  get route() {
    return state.current ? { id: state.current.id, params: state.current.params, query: Object.fromEntries(state.current.query), hash: state.current.hash } : null;
  },
  get busy() {
    return state.busy;
  },
  announce,
};

window.addEventListener("hashchange", onHashChange);
document.addEventListener("click", onDocumentClick);
document.addEventListener("keydown", onMenuKeydown);
window.addEventListener("resize", () => {
  setAnnounceHeight();
  if (state.menuOpen && window.innerWidth >= 960) toggleMenu(false, { instant: true });
});

setupCursor();
boot().catch((e) => {
  console.error("[kt] boot failed", e);
  bootError(e && e.message ? e.message : String(e));
});
