// DOM helpers for the admin: toasts, confirm dialogs, drawers, small animation wrappers, downloads.

import { html, el, render, icon } from "../../assets/js/ui.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
export const reduced = () => !!(mq && mq.matches);
export const gsap = () => (typeof window !== "undefined" && window.gsap) || null;

export function debounce(fn, ms = 300) {
  let t = null;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => clearTimeout(t);
  d.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  return d;
}

let seq = 0;
export const nextId = (p = "a") => `${p}${++seq}`;

/* ------------------------------------------------------------------ animation helpers
   Everything degrades to instant changes without GSAP, and to short fades with reduced motion. */

export function tween(target, vars) {
  const g = gsap();
  if (!g || !target) {
    if (vars.onComplete) vars.onComplete();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = vars.onComplete;
    g.to(target, {
      ...vars,
      onComplete() {
        if (done) done();
        resolve();
      },
    });
  });
}

/** Rise + fade items in (used for view entry and lists). */
export function riseIn(targets, { y = 14, stagger = 0.035, delay = 0, duration = 0.6 } = {}) {
  const g = gsap();
  const list = Array.isArray(targets) ? targets.filter(Boolean) : targets;
  if (!g || !list || (Array.isArray(list) && !list.length)) return;
  if (reduced()) {
    g.fromTo(list, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, delay: Math.min(delay, 0.05), clearProps: "opacity,visibility" });
    return;
  }
  g.fromTo(
    list,
    { autoAlpha: 0, y },
    { autoAlpha: 1, y: 0, duration, ease: "power3.out", stagger, delay, clearProps: "transform,opacity,visibility" }
  );
}

/** Brief highlight on a row after it was saved. */
export function flash(node) {
  if (!node) return;
  node.classList.remove("is-flash");
  void node.offsetWidth;
  node.classList.add("is-flash");
  setTimeout(() => node.classList.remove("is-flash"), 1600);
}

/* ------------------------------------------------------------------ scroll lock while dialogs are open */

let lockCount = 0;
function lock() {
  if (lockCount++ === 0) document.documentElement.classList.add("is-locked");
}
function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.documentElement.classList.remove("is-locked");
}

/* ------------------------------------------------------------------ toasts */

let toastHost = null;
function host() {
  if (toastHost && toastHost.isConnected) return toastHost;
  toastHost = el(html`<div class="toasts" popover="manual" aria-label="Notifications"></div>`);
  document.body.append(toastHost);
  return toastHost;
}

function raiseToasts() {
  const h = host();
  if (typeof h.showPopover !== "function") return;
  try {
    if (h.matches(":popover-open")) h.hidePopover();
    h.showPopover();
  } catch {}
}

/**
 * toast("Saved", { tone: "ok" | "error" | "default", action: { label, run }, duration })
 */
export function toast(message, { tone = "default", action = null, duration = 4200, detail = "" } = {}) {
  const h = host();
  const t = el(html`<div class="toast toast--${tone}" role="${tone === "error" ? "alert" : "status"}">
    <span class="toast__mark" aria-hidden="true"></span>
    <span class="toast__body"><span class="toast__msg">${message}</span>${detail ? html`<span class="toast__detail">${detail}</span>` : ""}</span>
    ${action ? html`<button type="button" class="toast__action">${action.label}</button>` : ""}
    <button type="button" class="toast__close" aria-label="Dismiss">${icon("close", { size: 16 })}</button>
  </div>`);
  h.append(t);
  raiseToasts();
  const g = gsap();
  if (g && !reduced()) g.fromTo(t, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: "power3.out" });
  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    if (!t.isConnected) return;
    const finish = () => {
      t.remove();
      if (!h.children.length && typeof h.hidePopover === "function") {
        try {
          h.hidePopover();
        } catch {}
      }
    };
    if (g && !reduced()) g.to(t, { autoAlpha: 0, y: 8, duration: 0.25, ease: "power2.in", onComplete: finish });
    else finish();
  };
  const arm = () => {
    clearTimeout(timer);
    if (duration > 0) timer = setTimeout(dismiss, duration);
  };
  t.addEventListener("mouseenter", () => clearTimeout(timer));
  t.addEventListener("mouseleave", arm);
  t.querySelector(".toast__close").addEventListener("click", dismiss);
  if (action) {
    t.querySelector(".toast__action").addEventListener("click", () => {
      dismiss();
      action.run();
    });
  }
  arm();
  while (h.children.length > 4) h.firstElementChild.remove();
  return dismiss;
}

/* ------------------------------------------------------------------ confirm dialog */

/**
 * await confirmDialog({ title, body, confirmLabel, cancelLabel, danger }) → boolean
 */
export function confirmDialog({ title, body = "", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, eyebrow = "" } = {}) {
  return new Promise((resolve) => {
    const id = nextId("dlg");
    const dlg = el(html`<dialog class="confirm" aria-labelledby="${id}-t" aria-describedby="${id}-b">
      <form method="dialog" class="confirm__card">
        ${eyebrow ? html`<p class="confirm__eyebrow">${eyebrow}</p>` : ""}
        <h2 class="confirm__title" id="${id}-t">${title}</h2>
        <div class="confirm__body" id="${id}-b">${body}</div>
        <div class="confirm__actions">
          <button type="button" class="a-btn a-btn--ghost" data-v="no">${cancelLabel}</button>
          <button type="button" class="a-btn ${danger ? "a-btn--danger" : "a-btn--primary"}" data-v="yes">${confirmLabel}</button>
        </div>
      </form>
    </dialog>`);
    const opener = document.activeElement;
    document.body.append(dlg);
    lock();
    dlg.showModal();
    // Focus the safe choice for destructive actions.
    (danger ? dlg.querySelector('[data-v="no"]') : dlg.querySelector('[data-v="yes"]')).focus();
    const g = gsap();
    const card = dlg.querySelector(".confirm__card");
    if (g && !reduced()) g.fromTo(card, { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: "power3.out" });
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      const close = () => {
        try {
          dlg.close();
        } catch {}
        dlg.remove();
        unlock();
        if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
        resolve(v);
      };
      if (g && !reduced()) g.to(card, { y: 10, autoAlpha: 0, duration: 0.18, ease: "power2.in", onComplete: close });
      else close();
    };
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      finish(false);
    });
    dlg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (b) finish(b.dataset.v === "yes");
      else if (e.target === dlg) finish(false);
    });
  });
}

/* ------------------------------------------------------------------ drawers */

const openDrawers = [];
export const drawerOpen = () => openDrawers.length > 0;
export const topDrawer = () => openDrawers[openDrawers.length - 1] || null;

/**
 * Open a side sheet (a modal <dialog>): focus is trapped, Esc and the scrim request close.
 * openDrawer({ eyebrow, title, body, footer, side: "right"|"left", size: "md"|"lg"|"nav",
 *              onRequestClose: async () => boolean, onClose, onMount(api) })
 */
export function openDrawer({ eyebrow = "", title = "", body = "", footer = "", side = "right", size = "md", headExtra = "", onRequestClose = null, onClose = null, onMount = null, initialFocus = null } = {}) {
  const id = nextId("drw");
  const dlg = el(html`<dialog class="drawer drawer--${side} drawer--${size}" aria-labelledby="${id}-t">
    <div class="drawer__scrim" data-scrim></div>
    <div class="drawer__panel">
      <header class="drawer__head">
        <div class="drawer__heading">
          ${eyebrow ? html`<p class="drawer__eyebrow" data-drawer-eyebrow>${eyebrow}</p>` : ""}
          <h2 class="drawer__title" id="${id}-t" data-drawer-title>${title}</h2>
        </div>
        ${headExtra}
        <button type="button" class="icon-btn drawer__close" data-drawer-close aria-label="Close">${icon("close")}</button>
      </header>
      <div class="drawer__body" data-drawer-body>${body}</div>
      ${footer ? html`<footer class="drawer__foot" data-drawer-foot>${footer}</footer>` : ""}
    </div>
  </dialog>`);
  const opener = document.activeElement;
  document.body.append(dlg);
  lock();
  dlg.showModal();
  const panel = dlg.querySelector(".drawer__panel");
  const scrim = dlg.querySelector(".drawer__scrim");
  const g = gsap();
  if (g) {
    if (reduced()) {
      g.fromTo([panel, scrim], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18 });
    } else {
      const from = side === "left" ? -100 : 100;
      g.fromTo(scrim, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, ease: "power2.out" });
      g.fromTo(panel, { xPercent: from }, { xPercent: 0, duration: 0.62, ease: "expo.out" });
      const inner = panel.querySelectorAll(".drawer__heading, .drawer__body > *:not(script)");
      g.fromTo(inner, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.03, delay: 0.12, clearProps: "transform,opacity,visibility" });
    }
  }

  let closing = false;
  const api = {
    dialog: dlg,
    panel,
    body: dlg.querySelector("[data-drawer-body]"),
    foot: dlg.querySelector("[data-drawer-foot]"),
    setTitle(text) {
      const t = dlg.querySelector("[data-drawer-title]");
      if (t) t.textContent = text;
    },
    setEyebrow(text) {
      const t = dlg.querySelector("[data-drawer-eyebrow]");
      if (t) t.textContent = text;
    },
    async requestClose() {
      if (closing) return false;
      if (onRequestClose) {
        const ok = await onRequestClose();
        if (!ok) return false;
      }
      await api.close();
      return true;
    },
    close() {
      if (closing) return Promise.resolve();
      closing = true;
      return new Promise((resolve) => {
        const done = () => {
          try {
            dlg.close();
          } catch {}
          dlg.remove();
          unlock();
          const i = openDrawers.indexOf(api);
          if (i >= 0) openDrawers.splice(i, 1);
          if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
          if (onClose) onClose();
          resolve();
        };
        if (g && !reduced()) {
          g.to(scrim, { autoAlpha: 0, duration: 0.3, ease: "power2.in" });
          g.to(panel, { xPercent: side === "left" ? -100 : 100, duration: 0.42, ease: "expo.in", onComplete: done });
        } else if (g) {
          g.to([panel, scrim], { autoAlpha: 0, duration: 0.15, onComplete: done });
        } else done();
      });
    },
  };
  openDrawers.push(api);

  dlg.addEventListener("cancel", (e) => {
    e.preventDefault();
    api.requestClose();
  });
  dlg.addEventListener("click", (e) => {
    if (e.target.closest("[data-drawer-close]") || e.target.hasAttribute("data-scrim")) api.requestClose();
  });

  if (onMount) onMount(api);
  const focusTarget = (initialFocus && dlg.querySelector(initialFocus)) || dlg.querySelector("[data-autofocus]") || dlg.querySelector(".drawer__close");
  if (focusTarget) focusTarget.focus({ preventScroll: true });
  return api;
}

/* ------------------------------------------------------------------ files */

export function download(filename, text, type = "application/json") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept = "application/json,.json") {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.className = "sr-only";
    input.addEventListener("change", () => {
      resolve(input.files && input.files[0] ? input.files[0] : null);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

/* ------------------------------------------------------------------ formatting */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

export function fmtDate(iso, { time = true } = {}) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const s = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const y = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
  return time ? `${s}${y} · ${pad(d.getHours())}:${pad(d.getMinutes())}` : `${s}${y}`;
}

export function fmtAgo(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} ${d === 1 ? "day" : "days"} ago`;
  return fmtDate(iso, { time: false });
}

export const two = (n) => String(n).padStart(2, "0");

export { html, el, render, icon };
