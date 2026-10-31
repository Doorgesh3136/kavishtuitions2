// Security: change the admin password, explain how protection works, sign out.

import { html, icon, render } from "../../../assets/js/ui.js";
import * as store from "../../../assets/js/store.js";
import { state, commit } from "../state.js";
import { $, toast, confirmDialog } from "../dom.js";
import { renderFields, bindForm, focusFirstError, showError } from "../fields.js";
import { viewHead } from "./common.js";
import { setGhVerified } from "./overview.js";

const fields = [
  { key: "current", label: "Current password", type: "password", required: true, autocomplete: "current-password", requiredMsg: "Enter your current password." },
  {
    key: "next",
    label: "New password",
    type: "password",
    required: true,
    autocomplete: "new-password",
    hint: "At least 8 characters. A short sentence is easy to remember and hard to guess.",
    validate: (v) => (v.length < 8 ? `Use at least 8 characters (${v.length} so far).` : v === "admin123" ? "That's the default password — choose another." : null),
  },
  {
    key: "confirm",
    label: "New password again",
    type: "password",
    required: true,
    autocomplete: "new-password",
    validate: (v, item) => (v !== item.next ? "The two new passwords don't match." : null),
  },
];

export default {
  id: "security",
  title: "Security",
  render(ctx) {
    const isDefault = store.isDefaultPassword(state.working);
    const gh = store.getGitHubConfig();
    return html`${viewHead(ctx, {
      title: "Security",
      lead: "The admin password keeps casual visitors out of these screens. The GitHub token is what actually lets someone change the live site.",
    })}
    <div class="sec-grid">
      <section class="block" data-a-intro aria-labelledby="sc-a">
        <header class="block__head"><p class="block__letter">A</p><h2 class="block__title" id="sc-a">Change the password</h2>
          <p class="block__aside">${isDefault ? html`<span class="a-tag a-tag--red">Still the default</span>` : html`<span class="a-tag a-tag--lagoon">Changed</span>`}</p></header>
        ${isDefault ? html`<p class="callout callout--margin"><span class="callout__k">Default password</span>This admin still accepts <span class="mono-code">admin123</span>, which is printed in the setup guide. Change it before you share the site.</p>` : ""}
        <form class="page-form pw-form" novalidate data-pw-form autocomplete="on">
          <input type="text" name="username" autocomplete="username" value="admin" hidden />
          ${renderFields(fields, { current: "", next: "", confirm: "" }, state.working)}
          <div class="pw-form__acts"><button type="submit" class="a-btn a-btn--primary a-btn--sm">${icon("lock", { size: 16 })}<span>Change password</span></button></div>
          <p class="pw-form__fine">The new password works in this browser straight away. Other devices keep the old one until you <a class="link" href="#publish">publish</a>.</p>
        </form>
      </section>

      <section class="block" data-a-intro aria-labelledby="sc-b">
        <header class="block__head"><p class="block__letter">B</p><h2 class="block__title" id="sc-b">How this is protected</h2></header>
        <ol class="facts">
          <li><span class="facts__n">i</span><p><strong>The password is a gate, not a vault.</strong> The site is a set of static files, so its scrambled form (a SHA-256 hash) sits in the public <span class="mono-code">content.json</span>. A long, unusual password makes it impractical to guess.</p></li>
          <li><span class="facts__n">ii</span><p><strong>Only the GitHub token can change the live site.</strong> It's stored in this browser alone and is never published. Without it, anyone who gets past the password can only edit their own browser's copy.</p></li>
          <li><span class="facts__n">iii</span><p><strong>Sign out on shared computers</strong>, and forget the token there too. Sessions also end when this tab is closed, or after 12 hours.</p></li>
        </ol>
      </section>

      <section class="block block--card" data-a-intro aria-labelledby="sc-c">
        <header class="block__head"><p class="block__letter">C</p><h2 class="block__title" id="sc-c">This browser</h2></header>
        <ul class="tools">
          <li class="tools__row"><div><p class="tools__t">Signed in</p><p class="tools__d">Until this tab closes or 12 hours pass.</p></div><button type="button" class="a-btn a-btn--ghost a-btn--sm" data-sec="signout">${icon("logout", { size: 16 })}<span>Sign out</span></button></li>
          <li class="tools__row"><div><p class="tools__t">GitHub token</p><p class="tools__d" data-token-state>${gh.token ? "Saved in this browser." : "None saved in this browser."}</p></div>${gh.token ? html`<button type="button" class="a-btn a-btn--ghost-danger a-btn--sm" data-sec="forget">Forget token</button>` : html`<a class="a-btn a-btn--ghost a-btn--sm" href="#publish">Set up</a>`}</li>
        </ul>
      </section>
    </div>`;
  },
  mount(root, ctx) {
    const formEl = $("[data-pw-form]", root);
    const draft = { current: "", next: "", confirm: "" };
    const form = bindForm(formEl, fields, { item: draft, content: state.working, onField: (f, v) => (draft[f.key] = v) });
    const onSubmit = async (e) => {
      e.preventDefault();
      form.collect(draft);
      const errors = form.validateAll();
      if (errors.length) return focusFirstError(errors);
      const btn = formEl.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        const ok = await store.checkPassword(state.working, draft.current);
        if (!ok) {
          const el = form.field("current");
          showError(el, "That isn't the current password.");
          el.querySelector("input").focus();
          return;
        }
        const hash = await store.sha256(draft.next);
        commit((c) => {
          c.admin = { ...(c.admin || {}), passwordHash: hash };
        }, { path: "admin" });
        formEl.reset();
        Object.assign(draft, { current: "", next: "", confirm: "" });
        toast("Password changed", { tone: "ok", detail: "Publish to use it on other devices." });
        ctx.rerender();
      } finally {
        btn.disabled = false;
      }
    };
    const onClick = async (e) => {
      const act = e.target.closest("[data-sec]")?.dataset.sec;
      if (act === "signout") ctx.signOut();
      else if (act === "forget") {
        const ok = await confirmDialog({ eyebrow: "GitHub token", title: "Forget the token on this browser?", body: html`<p>You'll need to paste a token again to publish from here.</p>`, confirmLabel: "Forget token", danger: true });
        if (!ok) return;
        store.clearGitHubToken();
        setGhVerified(false);
        toast("Token forgotten on this browser");
        ctx.rerender();
      }
    };
    formEl.addEventListener("submit", onSubmit);
    root.addEventListener("click", onClick);
    return () => {
      form.destroy();
      formEl.removeEventListener("submit", onSubmit);
      root.removeEventListener("click", onClick);
    };
  },
};
