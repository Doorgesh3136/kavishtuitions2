// Shared bits for admin views: the view header and the collection-page factory.

import { html, icon } from "../../../assets/js/ui.js";
import { $ } from "../dom.js";
import { mountCollection } from "../collection.js";
import { flush } from "../state.js";

/**
 * View header: mono index, big serif title (with optional italic word), lead, actions.
 * title is a string; `italic` (optional) is a word inside it to set in italic.
 */
export function viewHead(ctx, { title, italic = "", lead = "", actions = "", aside = "" } = {}) {
  const t = String(title);
  let titleTpl = t;
  if (italic && t.includes(italic)) {
    const i = t.indexOf(italic);
    titleTpl = html`${t.slice(0, i)}<em>${italic}</em>${t.slice(i + italic.length)}`;
  }
  return html`<header class="vh" data-a-intro>
    <p class="vh__index"><span class="vh__num">${ctx.num}</span><span class="vh__group">${ctx.group}</span></p>
    <div class="vh__row">
      <div class="vh__main">
        <h1 class="vh__title" tabindex="-1" data-view-title><span class="vh__mask"><span class="vh__line">${titleTpl}</span></span></h1>
        ${lead ? html`<p class="vh__lead">${lead}</p>` : ""}
      </div>
      ${actions ? html`<div class="vh__actions">${actions}</div>` : ""}
    </div>
    ${aside}
  </header>`;
}

export const siteLink = (href, label = "View on site") =>
  html`<a class="a-btn a-btn--ghost a-btn--sm" href="${href}" target="_blank" rel="noopener" data-flush>${label}${icon("arrow-up-right", { size: 16 })}</a>`;

/** A view that is just a heading + a collection editor. */
export function collectionView({ id, title, italic, lead, schema, sitePath, note = null }) {
  return {
    id,
    title,
    render(ctx) {
      return html`${viewHead(ctx, { title, italic, lead, actions: sitePath ? siteLink(sitePath) : "" })}
        ${note ? html`<div class="callout" data-a-intro>${note(ctx)}</div>` : ""}
        <section class="block" data-a-intro data-coll-host aria-label="${title}"></section>`;
    },
    mount(root, ctx) {
      const coll = mountCollection($("[data-coll-host]", root), schema, {
        openKey: ctx.params[0] ? decodeURIComponent(ctx.params[0]) : null,
        onRoute: (itemId) => ctx.replaceRoute(itemId ? `${id}/${encodeURIComponent(itemId)}` : id),
      });
      const onFlush = (e) => {
        if (e.target.closest("[data-flush]")) flush();
      };
      root.addEventListener("click", onFlush);
      this._coll = coll;
      return () => {
        coll.destroy();
        root.removeEventListener("click", onFlush);
      };
    },
    onParams(params) {
      if (params[0] && this._coll) this._coll.open(decodeURIComponent(params[0]));
    },
  };
}
