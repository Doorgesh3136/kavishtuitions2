// Declarative motion bindings for the public site (see SPEC "motion.js").
// Views add data-* attributes; the shell calls motion.bind(root) after mount and motion.intro(root)
// after the route transition. Every binding is guarded: if GSAP is missing, a plugin throws, or the
// visitor prefers reduced motion, content is simply shown.

const gsapRef = () => window.gsap || null;
const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {}, removeEventListener() {} });

const reducedMQ = mq("(prefers-reduced-motion: reduce)");
const pointerMQ = mq("(hover: hover) and (pointer: fine)");

export const EASE = { out: "ktOut", inOut: "ktInOut", soft: "ktSoft" };

const LINE_CLASS = "split-line";
const START = "top 86%";

let ready = false;
let lenis = null;
let scrollVel = 0; // px per frame, decays
let lastNativeY = 0;

function warn(where, err) {
  // Never let one broken binding stop the page; keep a trace for QA.
  if (window.console) console.warn(`[motion] ${where}:`, err && err.message ? err.message : err);
}

function guard(where, fn) {
  try {
    return fn();
  } catch (e) {
    warn(where, e);
    return undefined;
  }
}

function setup() {
  if (ready) return !!gsapRef();
  ready = true;
  const gsap = gsapRef();
  if (!gsap) return false;
  guard("plugins", () => {
    const plugins = [window.ScrollTrigger, window.SplitText, window.Flip, window.CustomEase].filter(Boolean);
    if (plugins.length) gsap.registerPlugin(...plugins);
  });
  guard("eases", () => {
    if (window.CustomEase) {
      window.CustomEase.create(EASE.out, "M0,0 C0.16,1 0.3,1 1,1");
      window.CustomEase.create(EASE.inOut, "M0,0 C0.76,0 0.24,1 1,1");
      window.CustomEase.create(EASE.soft, "M0,0 C0.33,1 0.68,1 1,1");
    }
  });
  if (!window.CustomEase) {
    EASE.out = "expo.out";
    EASE.inOut = "expo.inOut";
    EASE.soft = "power2.out";
  }
  guard("ScrollTrigger config", () => {
    if (window.ScrollTrigger) window.ScrollTrigger.config({ ignoreMobileResize: true });
  });
  // Scroll velocity for marquees when Lenis is not driving the page.
  window.addEventListener(
    "scroll",
    () => {
      if (lenis && !lenis.isShim) return;
      const y = window.scrollY;
      scrollVel = y - lastNativeY;
      lastNativeY = y;
    },
    { passive: true }
  );
  gsap.ticker.add(() => {
    scrollVel *= 0.9;
    if (Math.abs(scrollVel) < 0.01) scrollVel = 0;
  });
  // One delegated handler for in-page smooth scrolling (the URL hash belongs to the router).
  document.addEventListener("click", onScrollToClick);
  return true;
}

/* ------------------------------------------------------------------ helpers */

function all(root, sel) {
  const list = [...root.querySelectorAll(sel)];
  if (root.matches && root.matches(sel)) list.unshift(root);
  return list;
}

const num = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

function headerOffset() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--header-h");
  return (parseFloat(v) || 72) + 16;
}

function onScrollToClick(e) {
  const trigger = e.target && e.target.closest ? e.target.closest("[data-scroll-to]") : null;
  if (!trigger) return;
  const sel = trigger.getAttribute("data-scroll-to");
  let target = null;
  try {
    target = sel ? document.querySelector(sel) : null;
  } catch {
    target = null;
  }
  if (!target) return;
  e.preventDefault();
  scrollTo(target);
  if (!target.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) target.setAttribute("tabindex", "-1");
  setTimeout(() => guard("focus", () => target.focus({ preventScroll: true })), motion.reduced ? 0 : 900);
}

/** Smooth-scroll to an element, selector or y position (respects reduced motion). */
export function scrollTo(target, opts = {}) {
  let el = target;
  if (typeof target === "string") {
    try {
      el = document.querySelector(target);
    } catch {
      el = null;
    }
    if (!el) return;
  }
  const offset = opts.offset != null ? opts.offset : typeof el === "number" ? 0 : -headerOffset();
  if (lenis && !lenis.isShim && !motion.reduced) {
    lenis.scrollTo(el, { offset, duration: opts.duration || 1.2, immediate: !!opts.immediate, force: true });
    return;
  }
  const y = typeof el === "number" ? el : el.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top: Math.max(0, y), behavior: motion.reduced || opts.immediate ? "auto" : "smooth" });
}

/* pen strokes ------------------------------------------------------------ */

function strokeLength(path) {
  let len = 0;
  try {
    len = path.getTotalLength();
  } catch {
    len = 0;
  }
  let s = 1;
  try {
    const m = path.getScreenCTM();
    if (m) s = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  } catch {}
  // Over-estimating is always safe (the dash just covers the stroke a little longer).
  return Math.ceil(len * Math.max(1, s) + 4);
}

function prepDraw(paths) {
  paths.forEach((p) => {
    const len = strokeLength(p);
    p.style.strokeDasharray = `${len} ${len}`;
    p.style.strokeDashoffset = `${len}`;
  });
}

function clearDraw(paths) {
  paths.forEach((p) => {
    p.style.strokeDasharray = "";
    p.style.strokeDashoffset = "";
  });
}

function drawTween(paths, vars = {}) {
  const gsap = gsapRef();
  return gsap.to(paths, {
    strokeDashoffset: 0,
    duration: 0.85,
    ease: "power2.inOut",
    stagger: 0.16,
    ...vars,
    onComplete() {
      clearDraw(paths);
      if (vars.onComplete) vars.onComplete();
    },
  });
}

const drawPathsIn = (el) => all(el, "[data-draw]").filter((p) => p instanceof SVGGeometryElement || p.getTotalLength);

/* counting --------------------------------------------------------------- */

function countFormat(el) {
  const decimals = Math.max(0, Math.min(4, num(el.dataset.countDecimals, 0)));
  const prefix = el.dataset.countPrefix || "";
  const suffix = el.dataset.countSuffix || "";
  return (v) => `${prefix}${Number(v).toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
}

function countTween(el, to, vars = {}) {
  const gsap = gsapRef();
  const fmt = countFormat(el);
  const o = { v: 0 };
  el.textContent = fmt(0);
  return gsap.to(o, {
    v: to,
    duration: 1.6,
    ease: "power3.out",
    ...vars,
    onUpdate: () => {
      el.textContent = fmt(o.v);
    },
    onComplete: () => {
      el.textContent = fmt(to);
    },
  });
}

/* ------------------------------------------------------------------ bind */

const introQueues = new WeakMap(); // root -> { items, ctx, open, opened }
const bound = new WeakSet();

/**
 * Bind every declarative animation inside `root`. Returns a cleanup function.
 * The shell calls bind(viewRoot, { intro: true }); views may call bind(subtree) for content
 * they inject later (data-intro is then treated as visible, data-split="intro" as a scroll split).
 */
function bind(root, { intro = false } = {}) {
  if (!root || !root.querySelectorAll) return () => {};
  const gsap = gsapRef();
  const ok = setup() && gsap;
  const cleanups = [];
  const own = [];
  const mark = (el) => {
    bound.add(el);
    own.push(el);
  };
  const fresh = (el) => !bound.has(el);

  if (!ok || motion.reduced) {
    bindStatic(root, fresh, mark);
    if (intro) introQueues.set(root, { items: [], ctx: null, open() {}, opened: true });
    return () => own.forEach((el) => bound.delete(el));
  }

  // Gate: scroll-triggered reveals that fire before the view intro wait for it,
  // so nothing animates unseen under the transition panel.
  let opened = !intro;
  const waiting = [];
  const gated = (fn) => {
    if (opened) fn(0);
    else waiting.push(fn);
  };
  const open = () => {
    if (opened) return;
    opened = true;
    waiting.splice(0).forEach((fn, i) => guard("gated", () => fn(0.35 + i * 0.06)));
  };

  // Content waiting for its scroll reveal is only faded/moved (opacity + transform, never
  // visibility), so it stays in the tab order and the accessibility tree. If keyboard focus
  // lands inside it before its ScrollTrigger fires (focus may scroll it only to the bottom
  // edge, below the start line), it is revealed at once so the focused control is visible.
  const pending = new Map(); // element -> reveal it now
  const revealOnce = (el, run) => {
    let fired = false;
    const fire = (delay = 0) => {
      if (fired) return;
      fired = true;
      pending.delete(el);
      run(delay);
    };
    pending.set(el, () => fire(0));
    return fire;
  };
  const onFocusIn = (e) => {
    if (!pending.size) return;
    for (let n = e.target; n && n !== root.parentNode; n = n.parentNode) {
      const reveal = pending.get(n);
      if (reveal) guard("focus reveal", reveal);
    }
  };
  root.addEventListener("focusin", onFocusIn);
  cleanups.push(() => root.removeEventListener("focusin", onFocusIn));
  const later = (delay, fn) => (delay > 0 ? gsap.delayedCall(delay, fn) : fn());

  const items = [];
  let ctx = null;
  const inCtx = (fn) => (ctx ? ctx.add(fn) : fn());
  const ST = window.ScrollTrigger;
  const Split = window.SplitText;
  const mm = gsap.matchMedia();

  ctx = gsap.context(() => {
    /* ---- splits ------------------------------------------------------- */
    all(root, "[data-split]")
      .filter(fresh)
      .forEach((el) =>
        guard("data-split", () => {
          mark(el);
          const isIntro = intro && el.getAttribute("data-split") === "intro";
          if (!Split) return;
          const state = { played: false, tl: null, split: null };
          state.split = Split.create(el, {
            type: "lines",
            mask: "lines",
            linesClass: LINE_CLASS,
            autoSplit: true,
            onSplit(self) {
              const make = () => {
                if (state.tl) state.tl.kill();
                const paths = drawPathsIn(el);
                const tl = gsap.timeline({ paused: true, onComplete: () => el.classList.add("is-revealed") });
                tl.fromTo(
                  self.lines,
                  { yPercent: 118 },
                  { yPercent: 0, duration: 1.05, ease: EASE.out, stagger: 0.075 }
                );
                if (paths.length) {
                  prepDraw(paths);
                  tl.add(drawTween(paths), Math.min(0.55, 0.3 + self.lines.length * 0.06));
                }
                state.tl = tl;
                if (state.played) tl.progress(1);
              };
              inCtx(make);
              el.classList.add("is-split");
            },
          });
          if (isIntro) {
            items.push({
              el,
              step: 0.12,
              play() {
                state.played = true;
                return state.tl ? state.tl.play(0) : null;
              },
              finish() {
                state.played = true;
                if (state.tl) state.tl.progress(1);
                el.classList.add("is-revealed");
              },
            });
          } else if (ST) {
            const reveal = revealOnce(el, (delay) => {
              state.played = true;
              if (state.tl) later(delay, () => state.tl.play(0));
            });
            ST.create({
              trigger: el,
              start: START,
              once: true,
              onEnter: () => gated(reveal),
            });
          }
        })
      );

    /* ---- intro elements ---------------------------------------------- */
    if (intro) {
      all(root, "[data-intro]")
        .filter(fresh)
        .forEach((el) =>
          guard("data-intro", () => {
            mark(el);
            const kind = el.getAttribute("data-intro");
            const extra = num(kind, 0);
            const paths = drawPathsIn(el).filter((p) => !p.closest("[data-split]"));
            const counts = all(el, "[data-count]");
            counts.forEach(mark);
            const from =
              kind === "fade"
                ? { opacity: 0 }
                : kind === "clip"
                ? { clipPath: "inset(100% 0% 0% 0%)" }
                : { opacity: 0, y: 28 };
            gsap.set(el, from);
            if (paths.length) prepDraw(paths);
            counts.forEach((c) => {
              c.textContent = countFormat(c)(0);
            });
            items.push({
              el,
              step: 0.09,
              delay: extra,
              play() {
                const tl = gsap.timeline();
                const to =
                  kind === "clip"
                    ? { clipPath: "inset(0% 0% 0% 0%)", duration: 1.1, ease: EASE.inOut }
                    : { opacity: 1, y: 0, duration: 1, ease: EASE.out };
                tl.to(el, { ...to, clearProps: kind === "clip" ? "clipPath" : "transform" });
                if (paths.length) tl.add(drawTween(paths), 0.45);
                counts.forEach((c) => tl.add(countTween(c, num(c.dataset.count, 0)), 0.15));
                return tl;
              },
              finish() {
                gsap.set(el, { opacity: 1, clearProps: "transform,clipPath" });
                clearDraw(paths);
                counts.forEach((c) => {
                  c.textContent = countFormat(c)(num(c.dataset.count, 0));
                });
              },
            });
          })
        );
      // Keep DOM order between data-intro and data-split="intro".
      items.sort((a, b) => (a.el === b.el ? 0 : a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    }

    /* ---- staggered groups -------------------------------------------- */
    all(root, "[data-stagger]")
      .filter(fresh)
      .forEach((parent) =>
        guard("data-stagger", () => {
          mark(parent);
          const kids = [...parent.children].filter((k) => !k.hasAttribute("data-intro"));
          kids.forEach(mark);
          if (!kids.length) return;
          const each = num(parent.getAttribute("data-stagger"), 0.08);
          const tween = gsap.fromTo(
            kids,
            { opacity: 0, y: 24 },
            { opacity: 1, y: 0, duration: 0.95, ease: EASE.out, stagger: each, paused: true, clearProps: "transform" }
          );
          if (!ST) return tween.progress(1);
          const reveal = revealOnce(parent, (delay) => later(delay, () => tween.play()));
          ST.create({
            trigger: parent,
            start: START,
            once: true,
            onEnter: () => gated(reveal),
          });
        })
      );

    /* ---- reveals ------------------------------------------------------ */
    all(root, "[data-reveal]")
      .filter(fresh)
      .forEach((el) =>
        guard("data-reveal", () => {
          mark(el);
          const kind = el.getAttribute("data-reveal");
          let tween;
          if (kind === "clip") {
            tween = gsap.fromTo(
              el,
              { clipPath: "inset(100% 0% 0% 0%)" },
              { clipPath: "inset(0% 0% 0% 0%)", duration: 1.2, ease: EASE.inOut, paused: true, clearProps: "clipPath" }
            );
          } else if (kind === "fade") {
            tween = gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 1, ease: "power2.out", paused: true });
          } else {
            tween = gsap.fromTo(
              el,
              { opacity: 0, y: 24 },
              { opacity: 1, y: 0, duration: 1, ease: EASE.out, paused: true, clearProps: "transform" }
            );
          }
          if (!ST) return tween.progress(1);
          const reveal = revealOnce(el, (delay) => later(delay, () => tween.play()));
          ST.create({
            trigger: el,
            start: START,
            once: true,
            onEnter: () => gated(reveal),
          });
        })
      );

    /* ---- pen strokes (outside splits / intro elements) ---------------- */
    const groups = new Map();
    all(root, "[data-draw]")
      .filter(fresh)
      .forEach((p) => {
        if (p.closest("[data-split]") || (intro && p.closest("[data-intro]"))) return;
        const svg = p.ownerSVGElement || p.closest("svg") || p;
        if (!groups.has(svg)) groups.set(svg, []);
        groups.get(svg).push(p);
      });
    groups.forEach((paths, svg) =>
      guard("data-draw", () => {
        paths.forEach(mark);
        prepDraw(paths);
        const tween = drawTween(paths, { paused: true });
        if (!ST) return tween.progress(1);
        ST.create({
          trigger: svg.closest(".pen-mark") || svg,
          start: "top 88%",
          once: true,
          onEnter: () => gated((delay) => gsap.delayedCall(delay + 0.15, () => tween.play())),
        });
      })
    );

    /* ---- counters ----------------------------------------------------- */
    all(root, "[data-count]")
      .filter(fresh)
      .forEach((el) =>
        guard("data-count", () => {
          mark(el);
          const to = num(el.dataset.count, 0);
          const fmt = countFormat(el);
          el.textContent = fmt(0);
          if (!ST) {
            el.textContent = fmt(to);
            return;
          }
          ST.create({
            trigger: el,
            start: "top 90%",
            once: true,
            onEnter: () => gated((delay) => countTween(el, to, { delay })),
          });
        })
      );

    /* ---- parallax (≥ 768px only) ------------------------------------- */
    const parallax = all(root, "[data-parallax]").filter(fresh);
    parallax.forEach(mark);
    if (parallax.length && ST) {
      mm.add("(min-width: 768px)", () => {
        parallax.forEach((el) =>
          guard("data-parallax", () => {
            const speed = num(el.getAttribute("data-parallax"), 0.2);
            const travel = () => (window.innerHeight + el.offsetHeight) * speed * 0.5;
            gsap.fromTo(
              el,
              { y: () => -travel() },
              {
                y: () => travel(),
                ease: "none",
                scrollTrigger: {
                  trigger: el.parentElement || el,
                  start: "top bottom",
                  end: "bottom top",
                  scrub: true,
                  invalidateOnRefresh: true,
                },
              }
            );
          })
        );
      });
    }

    /* ---- pinned horizontal scroll (≥ 1024px) -------------------------- */
    const pins = all(root, "[data-pin-horizontal]").filter(fresh);
    pins.forEach(mark);
    if (pins.length && ST) {
      mm.add("(min-width: 1024px)", () => {
        pins.forEach((sec) =>
          guard("data-pin-horizontal", () => {
            const track = sec.querySelector("[data-track]");
            if (!track) return;
            sec.classList.add("is-pinned-h");
            const dist = () => Math.max(0, track.scrollWidth - track.clientWidth);
            const tween = gsap.to(track, {
              x: () => -dist(),
              ease: "none",
              scrollTrigger: {
                trigger: sec,
                start: "top top",
                end: () => `+=${Math.max(1, dist())}`,
                pin: true,
                scrub: 0.6,
                invalidateOnRefresh: true,
                anticipatePin: 1,
              },
            });
            sec.__ktHorizontal = tween;
            sec.dispatchEvent(new CustomEvent("kt:horizontal", { detail: { tween } }));
            return () => {
              sec.classList.remove("is-pinned-h");
              delete sec.__ktHorizontal;
            };
          })
        );
        return () => pins.forEach((sec) => sec.classList.remove("is-pinned-h"));
      });
    }
  }, root);

  /* ---- pointer effects (outside ScrollTrigger) ------------------------ */
  if (pointerMQ.matches) {
    all(root, "[data-magnetic]")
      .filter(fresh)
      .forEach((el) => guard("data-magnetic", () => cleanups.push(magnetic(el, mark))));
    all(root, "[data-tilt]")
      .filter(fresh)
      .forEach((el) => guard("data-tilt", () => cleanups.push(tilt(el, mark))));
  }

  /* ---- marquees -------------------------------------------------------- */
  all(root, "[data-marquee]")
    .filter(fresh)
    .forEach((el) => guard("data-marquee", () => cleanups.push(marquee(el, mark))));

  if (intro) {
    const q = {
      items,
      ctx,
      open,
      opened: false,
    };
    introQueues.set(root, q);
    // Safety net: never leave intro content hidden if the shell forgets to call intro().
    const t = setTimeout(() => {
      if (!q.opened) intro_(root, { instant: true });
    }, 5000);
    cleanups.push(() => clearTimeout(t));
  }

  return () => {
    cleanups.forEach((fn) => guard("cleanup", () => fn && fn()));
    guard("matchMedia revert", () => mm.revert());
    guard("context revert", () => ctx && ctx.revert());
    own.forEach((el) => bound.delete(el));
    introQueues.delete(root);
  };
}

/** Reduced motion / no GSAP: just make sure everything is visible and final. */
function bindStatic(root, fresh, mark) {
  all(root, "[data-count]")
    .filter(fresh)
    .forEach((el) =>
      guard("static count", () => {
        mark(el);
        el.textContent = countFormat(el)(num(el.dataset.count, 0));
      })
    );
  all(root, "[data-marquee]")
    .filter(fresh)
    .forEach((el) => {
      mark(el);
      el.classList.add("is-static");
    });
  all(root, "[data-split]").filter(fresh).forEach((el) => {
    mark(el);
    el.classList.add("is-revealed");
  });
}

/* ------------------------------------------------------------------ intro */

function intro_(root, { instant = false, delay = 0 } = {}) {
  const q = root && introQueues.get(root);
  if (!q || q.opened) return Promise.resolve();
  q.opened = true;
  const gsap = gsapRef();
  if (instant || !gsap || motion.reduced || !q.items.length) {
    q.items.forEach((it) => guard("intro finish", () => it.finish()));
    q.open();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const build = () => {
      const tl = gsap.timeline({ delay, onComplete: resolve });
      let t = 0;
      q.items.forEach((it) => {
        guard("intro item", () => {
          const anim = it.play();
          if (anim) tl.add(anim, t + (it.delay || 0));
        });
        t += it.step;
      });
      // Let scroll-triggered reveals already in view follow the intro.
      tl.call(() => q.open(), [], Math.min(0.5, t));
      if (!tl.duration()) {
        q.open();
        resolve();
      }
      return tl;
    };
    if (q.ctx) q.ctx.add(build);
    else build();
  });
}

/* ------------------------------------------------------------------ pointer */

function magnetic(el, mark) {
  mark(el);
  const gsap = gsapRef();
  const strength = num(el.getAttribute("data-magnetic"), 0.28);
  const max = 14;
  const xTo = gsap.quickTo(el, "x", { duration: 0.7, ease: "power3.out" });
  const yTo = gsap.quickTo(el, "y", { duration: 0.7, ease: "power3.out" });
  const inner = el.querySelector(".btn__icon");
  const ixTo = inner ? gsap.quickTo(inner, "x", { duration: 0.7, ease: "power3.out" }) : null;
  const iyTo = inner ? gsap.quickTo(inner, "y", { duration: 0.7, ease: "power3.out" }) : null;
  let rect = null;
  const clamp = (v) => Math.max(-max, Math.min(max, v));
  const enter = () => {
    rect = el.getBoundingClientRect();
  };
  const move = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    if (!rect) rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    xTo(clamp(dx * strength));
    yTo(clamp(dy * strength));
    if (ixTo) {
      ixTo(clamp(dx * strength * 0.5));
      iyTo(clamp(dy * strength * 0.5));
    }
  };
  const leave = () => {
    rect = null;
    xTo(0);
    yTo(0);
    if (ixTo) {
      ixTo(0);
      iyTo(0);
    }
  };
  el.addEventListener("pointerenter", enter);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);
  return () => {
    el.removeEventListener("pointerenter", enter);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerleave", leave);
    // Kill the quickTo tweens themselves: gsap.killTweensOf([el, inner]) skips ones that never
    // started, and those would keep the detached button (and its whole old view) in memory.
    [xTo, yTo, ixTo, iyTo].forEach((to) => to && to.tween && to.tween.kill());
    gsap.killTweensOf(el);
    if (inner) gsap.killTweensOf(inner);
    gsap.set(inner ? [el, inner] : el, { clearProps: "transform" });
  };
}

function tilt(el, mark) {
  mark(el);
  const gsap = gsapRef();
  const maxDeg = Math.min(8, num(el.getAttribute("data-tilt"), 6) || 6);
  gsap.set(el, { transformPerspective: 900 });
  const rxTo = gsap.quickTo(el, "rotationX", { duration: 0.8, ease: "power3.out" });
  const ryTo = gsap.quickTo(el, "rotationY", { duration: 0.8, ease: "power3.out" });
  let rect = null;
  const enter = () => {
    rect = el.getBoundingClientRect();
  };
  const move = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    if (!rect) rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    ryTo(px * 2 * maxDeg);
    rxTo(-py * 2 * maxDeg);
  };
  const leave = () => {
    rect = null;
    rxTo(0);
    ryTo(0);
  };
  el.addEventListener("pointerenter", enter);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);
  return () => {
    el.removeEventListener("pointerenter", enter);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerleave", leave);
    [rxTo, ryTo].forEach((to) => to && to.tween && to.tween.kill());
    gsap.killTweensOf(el);
    gsap.set(el, { clearProps: "transform" });
  };
}

/* ------------------------------------------------------------------ marquee */

function marquee(el, mark) {
  mark(el);
  const gsap = gsapRef();
  const source = el.firstElementChild;
  if (!source) return () => {};
  el.classList.add("is-running");
  const speed = Math.max(4, num(el.getAttribute("data-marquee"), 60));
  const dir = el.getAttribute("data-marquee-direction") === "right" ? 1 : -1;
  const inner = document.createElement("div");
  inner.className = "marquee__inner";
  el.insertBefore(inner, source);
  inner.appendChild(source);
  let clones = [];
  let unit = 0;
  let x = 0;
  let onScreen = true;

  const build = () => {
    clones.forEach((c) => c.remove());
    clones = [];
    const gap = parseFloat(getComputedStyle(inner).columnGap) || 0;
    unit = source.getBoundingClientRect().width + gap;
    if (unit < 2) return;
    const n = Math.min(24, Math.ceil(el.clientWidth / unit) + 1);
    for (let i = 0; i < n; i++) {
      const c = source.cloneNode(true);
      c.setAttribute("aria-hidden", "true");
      c.setAttribute("inert", "");
      c.querySelectorAll("[id]").forEach((n2) => n2.removeAttribute("id"));
      inner.appendChild(c);
      clones.push(c);
    }
  };
  build();

  const tick = (time, dt) => {
    if (!onScreen || unit < 2) return;
    const v = lenis && !lenis.isShim ? lenis.velocity || 0 : scrollVel;
    const boost = 1 + Math.min(Math.abs(v) * 0.12, 5);
    x += (dir * speed * boost * Math.min(dt, 64)) / 1000;
    x = ((x % unit) - unit) % unit; // keep in (-unit, 0]
    inner.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
  };
  gsap.ticker.add(tick);

  let ro = null;
  let io = null;
  let raf = 0;
  if (window.ResizeObserver) {
    let lastW = el.clientWidth;
    ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - lastW) < 2) return;
      lastW = el.clientWidth;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(build);
    });
    ro.observe(el);
  }
  if (window.IntersectionObserver) {
    io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
    });
    io.observe(el);
  }
  // Fonts can change the width after first measure.
  if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(() => el.isConnected && build());

  return () => {
    gsap.ticker.remove(tick);
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    if (io) io.disconnect();
  };
}

/* ------------------------------------------------------------------ public API */

const motion = {
  /** True when the visitor prefers reduced motion (fixed for the session). */
  reduced: reducedMQ.matches,
  ease: EASE,
  bind,
  /** Play the view-entry intro for a bound root. Resolves when done. */
  intro: (root, opts) => intro_(root, opts),
  /** Recalculate ScrollTrigger positions (after images load, accordions open, etc.). */
  refresh() {
    guard("refresh", () => window.ScrollTrigger && window.ScrollTrigger.refresh());
  },
  /** Split an element into masked lines for a custom animation. Returns the SplitText instance or null. */
  splitLines(el, opts = {}) {
    if (!el || !setup() || !window.SplitText) return null;
    return guard("splitLines", () =>
      window.SplitText.create(el, { type: "lines", mask: "lines", linesClass: LINE_CLASS, autoSplit: false, ...opts })
    ) || null;
  },
  /** Draw pen strokes ([data-draw] paths) inside el. Returns the tween (or null). */
  draw(el, vars = {}) {
    if (!el || !setup() || motion.reduced) return null;
    const paths = drawPathsIn(el);
    if (!paths.length) return null;
    prepDraw(paths);
    return drawTween(paths, vars);
  },
  /** Count an element's text up to `to` using its data-count-* formatting. */
  count(el, to, vars = {}) {
    if (!el) return null;
    if (!setup() || motion.reduced) {
      el.textContent = countFormat(el)(to);
      return null;
    }
    return countTween(el, to, vars);
  },
  scrollTo,
  /** Internal: the shell hands over its Lenis instance (or a native shim). */
  attach({ lenis: l } = {}) {
    lenis = l || null;
  },
  get pointer() {
    return pointerMQ.matches;
  },
};

export default motion;
