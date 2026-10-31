// Site & homepage: site.* details, contact & payment, hero with live preview, levels/subjects, numbers & method.

import { html, icon, render, highlightWord } from "../../../assets/js/ui.js";
import * as store from "../../../assets/js/store.js";
import { state, commit, subscribe } from "../state.js";
import { $, $$, riseIn, debounce } from "../dom.js";
import { renderGroups, bindForm, applyValue } from "../fields.js";
import { mountCollection } from "../collection.js";
import * as S from "../schemas.js";
import { viewHead, siteLink } from "./common.js";
import { fmtWa } from "./enquiries.js";

const TABS = [
  { id: "details", label: "Details" },
  { id: "contact", label: "Contact & payment" },
  { id: "homepage", label: "Homepage hero" },
  { id: "levels", label: "Levels & subjects" },
  { id: "method", label: "Numbers & method" },
];

const GROUPS = {
  details: [
    {
      title: "Identity",
      fields: [
        { key: "site.name", label: "Business name", required: true, width: "half", placeholder: "Kavish Tuitions" },
        { key: "site.wordmark", label: "Wordmark", required: true, width: "half", maxlength: 24, hint: "The short name in the logo." },
        { key: "site.tagline", label: "Tagline", type: "textarea", rows: 2, hint: "One sentence under the name in the footer." },
        { key: "site.description", label: "Search & sharing description", type: "textarea", rows: 3, counter: 160, hint: "What Google and WhatsApp previews show. About 150 characters." },
      ],
    },
    {
      title: "Announcement bar",
      note: "A thin bar above the menu on every page — for enrolment dates, holidays, a new group.",
      fields: [
        { key: "site.announcement.enabled", type: "toggle", label: "Show the announcement bar", onText: "On", offText: "Off" },
        { key: "site.announcement.text", label: "Message", placeholder: "2027 enrolment is open. HSC groups are capped at 12.", maxlength: 140 },
        { key: "site.announcement.linkLabel", label: "Link text", width: "half", placeholder: "Reserve a place" },
        { key: "site.announcement.href", label: "Link to", type: "url", hash: true, width: "half", placeholder: "#/enrol", hint: "A page such as #/enrol, #/plans, or a full https:// address." },
        { key: "_announcePreview", type: "note", render: () => html`<div class="announce-prev" data-announce-preview></div>` },
      ],
    },
  ],
  contact: [
    {
      title: "Contact",
      fields: [
        { key: "site.phone", label: "Phone", width: "half", inputmode: "tel", placeholder: "+230 5xxx xxxx" },
        {
          key: "site.whatsapp",
          label: "WhatsApp number",
          width: "half",
          inputmode: "numeric",
          mono: true,
          placeholder: "2305xxxxxxx",
          pattern: /^\d{8,15}$/,
          patternMsg: "Digits only, starting with 230 — e.g. 23057001234.",
          hint: "Digits only, with the country code 230. Enquiries are sent here.",
          validate: (v) => (v && /^5\d{7}$/.test(v) ? "Add the country code: 230 in front." : null),
        },
        { key: "site.email", label: "Email", type: "email", width: "half", placeholder: "hello@yourdomain.mu" },
        { key: "site.hours", label: "Opening hours", width: "half", placeholder: "Mon–Fri 15:30–20:30 · Sat 08:00–16:00" },
        { key: "site.address", label: "Address", placeholder: "Avenue des Palmiers, Quatre Bornes" },
        { key: "site.mapUrl", label: "Google Maps link", type: "url", web: true, placeholder: "https://maps.app.goo.gl/…", hint: "Optional. In Google Maps: Share → Copy link." },
        { key: "_wa", type: "note", render: () => html`<p class="note" data-wa-test></p>` },
      ],
    },
    {
      title: "Enquiries by email",
      note: "The enquiry form always opens WhatsApp. With a form endpoint it also emails you a copy — useful because this website has no server of its own.",
      fields: [
        {
          key: "site.formEndpoint",
          label: "Form endpoint",
          type: "url",
          web: true,
          spellcheck: false,
          placeholder: "https://formspree.io/f/xxxxxxx",
          hint: "Free option: create a form at formspree.io with your email address, then paste its endpoint here.",
        },
      ],
    },
    {
      title: "Payment",
      note: "Shown on the Plans page and in the enrolment confirmation.",
      fields: [
        { key: "site.payment.juice", label: "MCB Juice number", width: "half", inputmode: "tel", placeholder: "+230 5xxx xxxx" },
        { key: "site.payment.bank", label: "Bank transfer", width: "half", placeholder: "MCB · 000 000 000 00 · Account name" },
        { key: "site.payment.note", label: "Payment note", type: "textarea", rows: 2, placeholder: "Use the student's full name as the payment reference." },
      ],
    },
    {
      title: "Social links",
      note: "Leave blank to hide. Full addresses, starting with https://",
      fields: [
        { key: "site.social.facebook", label: "Facebook", type: "url", web: true, width: "half", placeholder: "https://facebook.com/…" },
        { key: "site.social.instagram", label: "Instagram", type: "url", web: true, width: "half", placeholder: "https://instagram.com/…" },
        { key: "site.social.youtube", label: "YouTube", type: "url", web: true, width: "half", placeholder: "https://youtube.com/@…" },
        { key: "site.social.tiktok", label: "TikTok", type: "url", web: true, width: "half", placeholder: "https://tiktok.com/@…" },
      ],
    },
  ],
  homepage: [
    {
      title: "Headline",
      fields: [
        { key: "hero.eyebrow", label: "Small line above", placeholder: "Grade 7 – 13 · NCE · SC · HSC" },
        { key: "hero.title", label: "Headline", type: "textarea", rows: 3, required: true, hint: "Each new line here is a new line on the site." },
        { key: "hero.highlight", label: "Underlined word", width: "half", placeholder: "properly", hint: "A word from the headline that gets the red pen underline." },
        { key: "hero.subtitle", label: "Text under the headline", type: "textarea", rows: 3 },
      ],
    },
    {
      title: "Buttons",
      fields: [
        { key: "hero.primaryCta.label", label: "Main button", width: "half", placeholder: "See the courses" },
        { key: "hero.primaryCta.href", label: "Goes to", type: "url", hash: true, width: "half", placeholder: "#/courses" },
        { key: "hero.secondaryCta.label", label: "Second button", width: "half", placeholder: "Try the placement check" },
        { key: "hero.secondaryCta.href", label: "Goes to", type: "url", hash: true, width: "half", placeholder: "#/quiz" },
      ],
    },
  ],
};

function heroPreview(c) {
  const h = c.hero || {};
  const t = String(h.title || "");
  const w = String(h.highlight || "").trim();
  const found = !w || t.toLowerCase().includes(w.toLowerCase());
  return html`<div class="hero-prev" aria-label="Preview of the homepage headline">
    <p class="hero-prev__k">Preview</p>
    <div class="hero-prev__paper">
      ${h.eyebrow ? html`<p class="hero-prev__eyebrow">${h.eyebrow}</p>` : ""}
      <p class="hero-prev__title">${t ? highlightWord(t, w) : html`<span class="muted">Your headline</span>`}</p>
      ${h.subtitle ? html`<p class="hero-prev__sub">${h.subtitle}</p>` : ""}
      <p class="hero-prev__ctas">
        ${h.primaryCta?.label ? html`<span class="hero-prev__btn hero-prev__btn--fill">${h.primaryCta.label}<span class="hero-prev__arrow">${icon("arrow-right", { size: 14 })}</span></span>` : ""}
        ${h.secondaryCta?.label ? html`<span class="hero-prev__btn">${h.secondaryCta.label}</span>` : ""}
      </p>
    </div>
    ${found ? "" : html`<p class="note note--warn"><span class="note__k">Underline</span>“${w}” isn't in the headline, so no word is underlined.</p>`}
  </div>`;
}

function announcePreview(c) {
  const a = c.site?.announcement || {};
  if (!a.enabled) return html`<p class="announce-prev__off">The bar is switched off.</p>`;
  return html`<div class="announce-prev__bar"><span>${a.text || "Your message"}</span>${a.linkLabel ? html`<span class="announce-prev__link">${a.linkLabel} ${icon("arrow-right", { size: 14 })}</span>` : ""}</div>`;
}

function waNote(c) {
  const d = String(c.site?.whatsapp || "");
  if (!/^\d{8,15}$/.test(d)) return "";
  const link = store.whatsappLink(d, `Hello ${c.site?.name || ""}, this is a test from the admin.`);
  return html`<span class="note__k">Test</span>Enquiries open a chat with <span class="num">${fmtWa(d)}</span>. <a class="note__link" href="${link}" target="_blank" rel="noopener">Send a test message ${icon("arrow-up-right", { size: 14 })}</a>`;
}

export default {
  id: "site",
  title: "Site & homepage",
  render(ctx) {
    const tab = TABS.some((t) => t.id === ctx.params[0]) ? ctx.params[0] : "details";
    return html`${viewHead(ctx, {
      title: "Site & homepage",
      italic: "homepage",
      lead: "The details that appear on every page — name, contact, payment — plus the homepage headline and the building blocks the courses use.",
      actions: siteLink("../#/"),
    })}
    <nav class="tabs" aria-label="Site sections" data-a-intro>
      <div class="tabs__list" role="tablist">
        ${TABS.map((t) => html`<a class="tabs__tab" role="tab" href="${`#site/${t.id}`}" id="${`tab-${t.id}`}" aria-controls="site-panel" aria-selected="${t.id === tab ? "true" : "false"}" tabindex="${t.id === tab ? "0" : "-1"}" data-tab="${t.id}">${t.label}</a>`)}
        <span class="tabs__ink" aria-hidden="true"></span>
      </div>
    </nav>
    <div class="tab-panel" id="site-panel" role="tabpanel" aria-labelledby="${`tab-${tab}`}" data-site-panel data-a-intro></div>`;
  },
  mount(root, ctx) {
    const panel = $("[data-site-panel]", root);
    let cleanup = [];
    let tab = TABS.some((t) => t.id === ctx.params[0]) ? ctx.params[0] : "details";

    const moveInk = (animate = true) => {
      const ink = $(".tabs__ink", root);
      const sel = $(`[data-tab="${tab}"]`, root);
      if (!ink || !sel) return;
      const list = sel.parentElement;
      const x = sel.offsetLeft;
      const w = sel.offsetWidth;
      if (animate && window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) window.gsap.to(ink, { x, width: w, duration: 0.5, ease: "expo.out" });
      else Object.assign(ink.style, { transform: `translateX(${x}px)`, width: `${w}px` });
      if (sel.offsetLeft < list.scrollLeft || sel.offsetLeft + w > list.scrollLeft + list.clientWidth) sel.scrollIntoView({ block: "nearest", inline: "center" });
    };

    const showTab = (id, { animate = true } = {}) => {
      cleanup.forEach((f) => f());
      cleanup = [];
      tab = id;
      $$("[data-tab]", root).forEach((a) => {
        const on = a.dataset.tab === id;
        a.setAttribute("aria-selected", on ? "true" : "false");
        a.tabIndex = on ? 0 : -1;
      });
      panel.setAttribute("aria-labelledby", `tab-${id}`);
      moveInk(animate);
      const c = state.working;

      if (GROUPS[id]) {
        const isHome = id === "homepage";
        render(
          panel,
          html`<div class="${isHome ? "split" : ""}">
            <form class="page-form" novalidate data-page-form>
              <p class="page-form__state" data-form-state aria-live="polite">Changes save as you type</p>
              ${renderGroups(GROUPS[id], c, c)}
            </form>
            ${isHome ? html`<aside class="split__aside" data-hero-preview>${heroPreview(c)}</aside>` : ""}
          </div>`
        );
        const formEl = $("[data-page-form]", panel);
        const stateEl = $("[data-form-state]", panel);
        const fields = GROUPS[id].flatMap((g) => g.fields);
        const refreshPreviews = () => {
          const hp = $("[data-hero-preview]", panel);
          if (hp) render(hp, heroPreview(state.working));
          const ap = $("[data-announce-preview]", panel);
          if (ap) render(ap, announcePreview(state.working));
          const wa = $("[data-wa-test]", panel);
          if (wa) {
            render(wa, waNote(state.working));
            wa.hidden = !wa.textContent.trim();
          }
        };
        refreshPreviews();
        const form = bindForm(formEl, fields, {
          item: () => state.working,
          content: () => state.working,
          onField: (field, value, error) => {
            if (error) {
              stateEl.textContent = "Not saved — check the highlighted field";
              stateEl.dataset.tone = "error";
              return;
            }
            commit((cc) => applyValue(field, cc, value), { path: field.key.split(".")[0], source: "form" });
            const n = formEl.querySelectorAll(".is-invalid").length;
            stateEl.textContent = n ? "Some fields aren't saved yet" : "Saved in this browser";
            stateEl.dataset.tone = n ? "error" : "ok";
            refreshPreviews();
          },
        });
        cleanup.push(() => form.destroy());
      } else if (id === "levels") {
        render(
          panel,
          html`<div class="stack-blocks">
            <section class="block" aria-labelledby="lv-a"><header class="block__head"><p class="block__letter">A</p><h2 class="block__title" id="lv-a">Levels</h2><p class="block__aside">Every course belongs to one level. The site groups the catalogue by these.</p></header><div data-c="levels"></div></section>
            <section class="block" aria-labelledby="lv-b"><header class="block__head"><p class="block__letter">B</p><h2 class="block__title" id="lv-b">Subject groups</h2><p class="block__aside">Used for the subject filter on the Courses page.</p></header><div data-c="categories"></div></section>
          </div>`
        );
        const a = mountCollection($('[data-c="levels"]', panel), S.levels, { compact: true });
        const b = mountCollection($('[data-c="categories"]', panel), S.categories, { compact: true });
        cleanup.push(() => a.destroy(), () => b.destroy());
      } else if (id === "method") {
        render(
          panel,
          html`<div class="stack-blocks">
            <section class="block" aria-labelledby="mt-a"><header class="block__head"><p class="block__letter">A</p><h2 class="block__title" id="mt-a">Numbers on the homepage</h2><p class="block__aside">Modest, true numbers. They count up when they scroll into view.</p></header><div data-c="stats"></div></section>
            <section class="block" aria-labelledby="mt-b"><header class="block__head"><p class="block__letter">B</p><h2 class="block__title" id="mt-b">How a week works</h2><p class="block__aside">The method steps, in order.</p></header><div data-c="method"></div></section>
          </div>`
        );
        const a = mountCollection($('[data-c="stats"]', panel), S.stats, { compact: true });
        const b = mountCollection($('[data-c="method"]', panel), S.method, { compact: true });
        cleanup.push(() => a.destroy(), () => b.destroy());
      }
      if (animate) riseIn([...panel.querySelectorAll(".fset, .block, .split__aside")], { y: 12, stagger: 0.04, duration: 0.5 });
    };

    const onClick = (e) => {
      const t = e.target.closest("[data-tab]");
      if (!t) return;
      e.preventDefault();
      if (t.dataset.tab === tab) return;
      if (panel.querySelector(".is-invalid")) {
        ctx.toast("Some fields on this tab weren't saved because they have errors.", { tone: "error" });
      }
      ctx.replaceRoute(`site/${t.dataset.tab}`);
      showTab(t.dataset.tab);
    };
    const onKey = (e) => {
      const t = e.target.closest("[data-tab]");
      if (!t || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const i = TABS.findIndex((x) => x.id === t.dataset.tab);
      const j = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + (e.key === "ArrowLeft" ? -1 : 1) + TABS.length) % TABS.length;
      const next = $(`[data-tab="${TABS[j].id}"]`, root);
      next.focus();
      next.click();
    };
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
    const onResize = debounce(() => moveInk(false), 120);
    window.addEventListener("resize", onResize);
    const unsub = subscribe((kind) => {
      if (kind === "replace") showTab(tab, { animate: false });
    });

    showTab(tab, { animate: false });
    requestAnimationFrame(() => moveInk(false));
    document.fonts?.ready?.then(() => moveInk(false));
    this._show = (id) => {
      if (TABS.some((t) => t.id === id) && id !== tab) showTab(id);
    };
    return () => {
      cleanup.forEach((f) => f());
      unsub();
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  },
  onParams(params) {
    if (this._show) this._show(params[0] || "details");
  },
  pendingErrors(root) {
    return root.querySelectorAll("[data-page-form] .is-invalid").length;
  },
};
