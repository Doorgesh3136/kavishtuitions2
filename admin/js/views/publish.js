// Publish: what will go live, GitHub settings + token guide, publish, pull, import/export, discard.

import { html, raw, icon, render } from "../../../assets/js/ui.js";
import * as store from "../../../assets/js/store.js";
import { state, subscribe, changedSections, sectionLabel, describeChange, markPublished, replaceWorking, setPublished, flush, lastCommitted, SECTIONS } from "../state.js";
import { $, $$, toast, confirmDialog, download, pickFile, fmtAgo, gsap, reduced } from "../dom.js";
import { viewHead } from "./common.js";
import { setGhVerified, ghVerified } from "./overview.js";

const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

function changesTpl() {
  const changed = changedSections();
  if (changed === null) {
    return html`<p class="pub-none">The live <span class="mono-code">content.json</span> couldn't be loaded, so there's nothing to compare with. You can still publish this browser's copy.</p>`;
  }
  if (!changed.length) {
    return html`<p class="pub-none">${icon("check", { size: 18 })}<span>Nothing to publish — the live site matches this browser${state.publishedAt ? html` (published ${fmtAgo(state.publishedAt)}${state.commitUrl ? html` · <a class="link" href="${state.commitUrl}" target="_blank" rel="noopener">commit</a>` : ""})` : ""}.</span></p>`;
  }
  return html`<ol class="diff">
    ${changed.map((k) => {
      const parts = describeChange(k);
      const route = SECTIONS[k]?.route || "overview";
      return html`<li class="diff__row">
        <a class="diff__name" href="${`#${route}`}">${sectionLabel(k)}</a>
        <div class="diff__what">${parts.length
          ? parts.map((p) => html`<p><span class="diff__kind diff__kind--${p.kind.toLowerCase()}">${p.kind}</span>${p.items.length ? html`<span class="diff__items">${p.items.slice(0, 6).join(", ")}${p.items.length > 6 ? ` and ${p.items.length - 6} more` : ""}</span>` : ""}</p>`)
          : html`<p><span class="diff__kind">Changed</span></p>`}</div>
      </li>`;
    })}
  </ol>`;
}

function settingsTpl(cfg) {
  return html`<form class="page-form gh-form" novalidate data-gh-form>
    <div class="fields">
      <div class="f f--half" data-gh="owner"><label class="f__label" for="gh-owner"><span>GitHub user or organisation</span></label><input class="a-input a-input--mono" id="gh-owner" name="owner" value="${cfg.owner}" placeholder="your-username" autocomplete="off" spellcheck="false" /></div>
      <div class="f f--half" data-gh="repo"><label class="f__label" for="gh-repo"><span>Repository</span></label><input class="a-input a-input--mono" id="gh-repo" name="repo" value="${cfg.repo}" placeholder="kavishtuitions2" autocomplete="off" spellcheck="false" /></div>
      <div class="f f--half" data-gh="branch"><label class="f__label" for="gh-branch"><span>Branch</span></label><input class="a-input a-input--mono" id="gh-branch" name="branch" value="${cfg.branch}" placeholder="main" autocomplete="off" spellcheck="false" /></div>
      <div class="f f--half" data-gh="path"><label class="f__label" for="gh-path"><span>Content file</span></label><input class="a-input a-input--mono" id="gh-path" name="path" value="${cfg.path}" placeholder="data/content.json" autocomplete="off" spellcheck="false" /></div>
      <div class="f" data-gh="token">
        <label class="f__label" for="gh-token"><span>Access token</span>${cfg.token ? html`<span class="f__opt">saved in this browser</span>` : ""}</label>
        <div class="f-pass">
          <input class="a-input a-input--mono" id="gh-token" name="token" type="password" value="${cfg.token}" placeholder="github_pat_…" autocomplete="off" spellcheck="false" aria-describedby="gh-token-hint" />
          <button type="button" class="f-pass__toggle" data-gh-reveal aria-pressed="false" aria-controls="gh-token">Show</button>
        </div>
        <p class="f__hint" id="gh-token-hint">Stored only in this browser, never in the website files. Anyone using this browser profile could publish, so forget it on shared computers.</p>
      </div>
    </div>
    <div class="gh-form__acts">
      <button type="submit" class="a-btn a-btn--primary a-btn--sm" data-gh-save>Save settings</button>
      <button type="button" class="a-btn a-btn--ghost a-btn--sm" data-gh-test>${icon("refresh", { size: 16 })}<span>Test connection</span></button>
      ${cfg.token ? html`<button type="button" class="a-link a-link--danger" data-gh-forget>Forget token</button>` : ""}
    </div>
    <div class="gh-result" data-gh-result aria-live="polite"></div>
  </form>`;
}

function guideTpl(cfg) {
  return html`<details class="guide" ${cfg.token ? "" : raw("open")}>
    <summary class="guide__sum"><span class="guide__k">How to get a token</span><span class="guide__t">Five minutes, once.</span>${icon("chevron-down", { size: 18, cls: "guide__chev" })}</summary>
    <ol class="guide__steps">
      <li><span class="guide__n">1</span><p>Sign in to GitHub and open <a class="link" href="${TOKEN_URL}" target="_blank" rel="noopener noreferrer">Settings → Developer settings → Fine-grained tokens → Generate new token ${icon("arrow-up-right", { size: 14 })}</a>.</p></li>
      <li><span class="guide__n">2</span><p>Name it <span class="mono-code">Kavish Tuitions admin</span> and choose an expiry — 90 days or a year. You'll make a new one when it expires.</p></li>
      <li><span class="guide__n">3</span><p>Under <strong>Repository access</strong> choose <strong>Only select repositories</strong> and pick just this website's repository${cfg.repo ? html` (<span class="mono-code">${cfg.repo}</span>)` : ""}.</p></li>
      <li><span class="guide__n">4</span><p>Under <strong>Permissions → Repository permissions</strong>, set <strong>Contents</strong> to <strong>Read and write</strong>. Leave everything else as it is (Metadata stays read-only).</p></li>
      <li><span class="guide__n">5</span><p>Press <strong>Generate token</strong>, copy it (it starts with <span class="mono-code">github_pat_</span>) and paste it above. Then press <strong>Test connection</strong>.</p></li>
    </ol>
    <p class="guide__foot">The token can only change files in that one repository. If it is ever exposed, delete it on the same GitHub page and make a new one.</p>
  </details>`;
}

const bytes = (n) => (n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

export default {
  id: "publish",
  title: "Publish",
  render(ctx) {
    const cfg = store.getGitHubConfig();
    const changed = changedSections() || [];
    return html`${viewHead(ctx, {
      title: "Publish",
      lead: "Your edits are saved in this browser as you work. Publishing commits them to GitHub; the live site updates a minute or two later, on every device.",
    })}
    <div class="pub-grid">
      <div class="pub-main">
        <section class="block pub-a" data-a-intro aria-labelledby="pb-a">
          <header class="block__head"><p class="block__letter">A</p><h2 class="block__title" id="pb-a">What will go live</h2><p class="block__aside" data-pub-count>${changed.length ? `${changed.length} ${changed.length === 1 ? "section" : "sections"} changed` : ""}</p></header>
          <div data-pub-changes>${changesTpl()}</div>
          <form class="pub-form" novalidate data-pub-form>
            <div class="f">
              <label class="f__label" for="pub-msg"><span>Note for the history</span><span class="f__opt">optional</span></label>
              <input class="a-input" id="pub-msg" placeholder="${`e.g. New HSC Chemistry group, ${new Date().getFullYear() + 1} fees`}" autocomplete="off" maxlength="120" />
            </div>
            <button type="submit" class="a-btn a-btn--primary a-btn--lg" data-publish>${icon("upload", { size: 18 })}<span>Publish now</span></button>
          </form>
          <div class="pub-result" data-pub-result aria-live="polite"></div>
        </section>

        <section class="block pub-c" data-a-intro aria-labelledby="pb-c">
          <header class="block__head"><p class="block__letter">C</p><h2 class="block__title" id="pb-c">Copies & recovery</h2></header>
          <ul class="tools">
            <li class="tools__row">
              <div><p class="tools__t">Pull the latest from GitHub</p><p class="tools__d">Replace this browser's copy with the version in the repository — for example after editing on another computer.</p></div>
              <button type="button" class="a-btn a-btn--ghost a-btn--sm" data-tool="pull">${icon("refresh", { size: 16 })}<span>Pull latest</span></button>
            </li>
            <li class="tools__row">
              <div><p class="tools__t">Download content.json</p><p class="tools__d">A backup of everything in this browser's copy (${bytes(JSON.stringify(state.working).length)}). Keep one before big changes.</p></div>
              <button type="button" class="a-btn a-btn--ghost a-btn--sm" data-tool="download">${icon("download", { size: 16 })}<span>Download</span></button>
            </li>
            <li class="tools__row">
              <div><p class="tools__t">Import content.json</p><p class="tools__d">Load a backup or a file someone sent you. It replaces this browser's copy; nothing goes live until you publish.</p></div>
              <button type="button" class="a-btn a-btn--ghost a-btn--sm" data-tool="import">${icon("upload", { size: 16 })}<span>Import</span></button>
            </li>
            <li class="tools__row tools__row--danger">
              <div><p class="tools__t">Discard local changes</p><p class="tools__d">Throw away everything not yet published and go back to the live version.</p></div>
              <button type="button" class="a-btn a-btn--ghost-danger a-btn--sm" data-tool="discard">${icon("trash", { size: 16 })}<span>Discard</span></button>
            </li>
          </ul>
        </section>
      </div>

      <aside class="pub-side">
        <section class="block block--card" data-a-intro aria-labelledby="pb-b">
          <header class="block__head"><p class="block__letter">B</p><h2 class="block__title" id="pb-b">GitHub connection</h2><p class="block__aside" data-gh-badge>${cfg.token && ghVerified() ? html`<span class="a-tag a-tag--lagoon">Connected</span>` : cfg.token ? html`<span class="a-tag a-tag--amber">Not tested</span>` : html`<span class="a-tag a-tag--plain">Not set up</span>`}</p></header>
          <div data-gh-settings>${settingsTpl(cfg)}</div>
          ${guideTpl(cfg)}
        </section>
      </aside>
    </div>`;
  },
  mount(root, ctx) {
    const result = $("[data-pub-result]", root);
    const ghResult = () => $("[data-gh-result]", root);
    const readCfg = () => {
      const f = $("[data-gh-form]", root);
      const v = (n) => f.querySelector(`[name="${n}"]`).value.trim();
      return {
        owner: v("owner").replace(/^https?:\/\/github\.com\//i, "").replace(/\/.*$/, ""),
        repo: v("repo").replace(/\.git$/, ""),
        branch: v("branch") || "main",
        path: v("path").replace(/^\/+/, "") || "data/content.json",
        token: v("token"),
      };
    };
    const refreshSettings = () => {
      render($("[data-gh-settings]", root), settingsTpl(store.getGitHubConfig()));
      const cfg = store.getGitHubConfig();
      render(
        $("[data-gh-badge]", root),
        cfg.token && ghVerified() ? html`<span class="a-tag a-tag--lagoon">Connected</span>` : cfg.token ? html`<span class="a-tag a-tag--amber">Not tested</span>` : html`<span class="a-tag a-tag--plain">Not set up</span>`
      );
    };
    const refreshChanges = () => {
      render($("[data-pub-changes]", root), changesTpl());
      const n = (changedSections() || []).length;
      $("[data-pub-count]", root).textContent = n ? `${n} ${n === 1 ? "section" : "sections"} changed` : "";
    };
    const busy = (btn, on, label) => {
      if (!btn) return;
      btn.disabled = on;
      btn.classList.toggle("is-busy", on);
      const span = btn.querySelector("span");
      if (span && label) {
        if (on) {
          btn.dataset.label = span.textContent;
          span.textContent = label;
        } else if (btn.dataset.label) span.textContent = btn.dataset.label;
      }
    };
    const showResult = (target, tpl) => {
      render(target, tpl);
      const g = gsap();
      if (g && !reduced() && target.firstElementChild) g.fromTo(target.firstElementChild, { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: "power3.out" });
    };
    const errorTpl = (title, msg) => html`<div class="result result--error" role="alert"><p class="result__k">${title}</p><p>${msg}</p></div>`;

    async function test() {
      const cfg = readCfg();
      store.setGitHubConfig(cfg);
      const btn = $("[data-gh-test]", root);
      busy(btn, true, "Testing…");
      try {
        const info = await store.testGitHub(cfg);
        setGhVerified(info.canPush);
        const branchDiffers = info.defaultBranch && info.defaultBranch !== cfg.branch;
        showResult(
          ghResult(),
          html`<div class="result ${info.canPush ? "result--ok" : "result--error"}">
            <p class="result__k">${info.canPush ? "Connected" : "Connected, but read-only"}</p>
            <dl class="dl dl--tight">
              <div><dt>Repository</dt><dd class="mono-code">${info.fullName}</dd></div>
              <div><dt>Visibility</dt><dd>${info.private ? "Private" : "Public"}</dd></div>
              <div><dt>Default branch</dt><dd class="mono-code">${info.defaultBranch}</dd></div>
              <div><dt>Can publish</dt><dd>${info.canPush ? "Yes" : html`<strong>No</strong> — give the token “Contents: Read and write”.`}</dd></div>
              <div><dt>Live site</dt><dd><a class="link" href="${info.pagesUrl}" target="_blank" rel="noopener">${info.pagesUrl}</a></dd></div>
            </dl>
            ${branchDiffers ? html`<p class="result__act">You're set to publish to <span class="mono-code">${cfg.branch}</span>, but the repository's main branch is <span class="mono-code">${info.defaultBranch}</span>. <button type="button" class="a-btn a-btn--ghost a-btn--xs" data-use-branch="${info.defaultBranch}">Use ${info.defaultBranch}</button></p>` : ""}
          </div>`
        );
        render(
          $("[data-gh-badge]", root),
          info.canPush ? html`<span class="a-tag a-tag--lagoon">Connected</span>` : html`<span class="a-tag a-tag--amber">Read-only</span>`
        );
        toast(info.canPush ? `Connected to ${info.fullName}` : "Connected, but this token can't publish", { tone: info.canPush ? "ok" : "error" });
      } catch (e) {
        setGhVerified(false);
        showResult(ghResult(), errorTpl("Couldn't connect", e.message));
      } finally {
        busy(btn, false);
      }
    }

    async function publish(e) {
      e.preventDefault();
      flush();
      const cfg = store.getGitHubConfig();
      if (!cfg.token || !cfg.owner || !cfg.repo) {
        showResult(result, errorTpl("Set up GitHub first", "Fill in the GitHub connection on the right — owner, repository and a token — then publish."));
        $("#gh-token", root)?.focus();
        return;
      }
      const changed = changedSections();
      if (changed && !changed.length) {
        const ok = await confirmDialog({
          eyebrow: "Nothing changed",
          title: "Publish anyway?",
          body: html`<p>The live site already matches this browser. Publishing again just records a new version.</p>`,
          confirmLabel: "Publish anyway",
        });
        if (!ok) return;
      }
      const btn = $("[data-publish]", root);
      busy(btn, true, "Publishing…");
      showResult(result, html`<div class="result result--busy"><p class="result__k">Publishing</p><p>Sending ${changed ? `${changed.length} changed ${changed.length === 1 ? "section" : "sections"}` : "your content"} to ${cfg.owner}/${cfg.repo}…</p><span class="result__bar" aria-hidden="true"></span></div>`);
      try {
        const message = $("#pub-msg", root).value.trim();
        const res = await store.publishContent(state.working, { message: message || undefined, cfg });
        markPublished(res.content, res.commitUrl);
        setGhVerified(true);
        $("#pub-msg", root).value = "";
        showResult(
          result,
          html`<div class="result result--ok">
            <p class="result__k">Published</p>
            <p class="result__big">Committed to <span class="mono-code">${cfg.owner}/${cfg.repo}</span>. The live site updates in about 1–2 minutes.</p>
            <p class="result__links">
              ${res.commitUrl ? html`<a class="a-btn a-btn--ghost a-btn--xs" href="${res.commitUrl}" target="_blank" rel="noopener">${icon("github", { size: 16 })}<span>View the commit</span></a>` : ""}
              <a class="a-btn a-btn--ghost a-btn--xs" href="../" target="_blank" rel="noopener">${icon("arrow-up-right", { size: 16 })}<span>Open the site</span></a>
            </p>
            <p class="result__fine">If the old version still shows after a few minutes, refresh the page — browsers keep a copy for a while.</p>
          </div>`
        );
        toast("Published to GitHub", { tone: "ok", detail: "Live in about 1–2 minutes." });
      } catch (err) {
        showResult(result, errorTpl("Not published", err.message));
        if (err.status === 401 || err.status === 403) setGhVerified(false);
      } finally {
        busy(btn, false);
      }
    }

    async function onClick(e) {
      const reveal = e.target.closest("[data-gh-reveal]");
      if (reveal) {
        const input = $("#gh-token", root);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        reveal.textContent = show ? "Hide" : "Show";
        reveal.setAttribute("aria-pressed", show ? "true" : "false");
        return;
      }
      if (e.target.closest("[data-gh-test]")) return test();
      if (e.target.closest("[data-gh-forget]")) {
        const ok = await confirmDialog({ eyebrow: "GitHub token", title: "Forget the token on this browser?", body: html`<p>You'll need to paste a token again to publish from here. To revoke it completely, delete it on GitHub as well.</p>`, confirmLabel: "Forget token", danger: true });
        if (!ok) return;
        store.clearGitHubToken();
        setGhVerified(false);
        refreshSettings();
        toast("Token forgotten on this browser");
        return;
      }
      const ub = e.target.closest("[data-use-branch]");
      if (ub) {
        store.setGitHubConfig({ branch: ub.dataset.useBranch });
        refreshSettings();
        toast(`Publishing to ${ub.dataset.useBranch}`, { tone: "ok" });
        return;
      }
      const tool = e.target.closest("[data-tool]")?.dataset.tool;
      if (!tool) return;
      const btn = e.target.closest("[data-tool]");
      if (tool === "download") {
        flush();
        download(`content-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(state.working, null, 2)}\n`);
        toast("Downloaded content.json", { tone: "ok" });
      } else if (tool === "import") {
        const file = await pickFile();
        if (!file) return;
        let data;
        try {
          data = JSON.parse(await file.text());
        } catch {
          toast(`“${file.name}” isn't valid JSON.`, { tone: "error" });
          return;
        }
        const problems = store.validateContent(data);
        if (problems.length) {
          await confirmDialog({ eyebrow: "Import", title: "This file can't be imported", body: html`<ul class="confirm__list">${problems.map((p) => html`<li>${p}</li>`)}</ul>`, confirmLabel: "OK", cancelLabel: "Close" });
          return;
        }
        const ok = await confirmDialog({
          eyebrow: "Import",
          title: `Replace this browser's copy with “${file.name}”?`,
          body: html`<p>${(data.courses || []).length} courses, ${(data.tutors || []).length} tutors, ${(data.timetable || []).length} sessions. Unpublished changes in this browser will be overwritten. Nothing goes live until you publish.</p>`,
          confirmLabel: "Import file",
        });
        if (!ok) return;
        replaceWorking(data, { source: "import" });
        toast(`Imported “${file.name}”`, { tone: "ok", detail: "Check it over, then publish." });
      } else if (tool === "pull") {
        const cfg = store.getGitHubConfig();
        if (!cfg.token || !cfg.owner || !cfg.repo) {
          showResult(result, errorTpl("Set up GitHub first", "Pulling reads the file straight from your repository, so it needs the GitHub connection."));
          return;
        }
        busy(btn, true, "Pulling…");
        try {
          const { content } = await store.fetchFromGitHub(cfg);
          const changed = changedSections() || [];
          const ok = await confirmDialog({
            eyebrow: "Pull from GitHub",
            title: "Replace this browser's copy with the repository version?",
            body: html`<p>${changed.length ? html`<strong>${changed.length} unpublished ${changed.length === 1 ? "section" : "sections"}</strong> in this browser will be lost.` : "This browser has no unpublished changes."} The repository version was last updated ${content.meta?.updatedAt ? fmtAgo(content.meta.updatedAt) : "at an unknown time"}.</p>`,
            confirmLabel: "Replace with GitHub version",
            danger: changed.length > 0,
          });
          if (ok) {
            setPublished(content);
            replaceWorking(content, { source: "pull" });
            toast("Pulled the latest version from GitHub", { tone: "ok" });
          }
        } catch (err) {
          showResult(result, errorTpl("Couldn't pull from GitHub", err.message));
        } finally {
          busy(btn, false);
        }
      } else if (tool === "discard") {
        const changed = changedSections() || [];
        if (!changed.length && state.published) {
          toast("There are no local changes to discard.");
          return;
        }
        const ok = await confirmDialog({
          eyebrow: "Discard local changes",
          title: changed.length ? `Discard ${changed.length} unpublished ${changed.length === 1 ? "section" : "sections"}?` : "Discard local changes?",
          body: html`<p>${changed.length ? `${changed.map(sectionLabel).join(", ")} go back to ${lastCommitted() ? `the version you published ${fmtAgo(state.publishedAt)}` : "the live version"}.` : "This browser's copy goes back to the live version."} This can't be undone — download a copy first if unsure.</p>`,
          confirmLabel: "Discard changes",
          danger: true,
        });
        if (!ok) return;
        busy(btn, true, "Loading…");
        try {
          // Straight after a publish, GitHub Pages may still serve the old file: go back to what was committed.
          const committed = lastCommitted();
          const live = committed || (await store.fetchPublished());
          store.clearDraft();
          if (!committed) setPublished(live);
          replaceWorking(live, { source: "discard" });
          toast("Local changes discarded — showing the live version", { tone: "ok" });
        } catch (err) {
          toast(`Couldn't load the live version: ${err.message}`, { tone: "error" });
        } finally {
          busy(btn, false);
        }
      }
    }

    const onSubmit = (e) => {
      if (e.target.matches("[data-pub-form]")) publish(e);
      else if (e.target.matches("[data-gh-form]")) {
        e.preventDefault();
        const cfg = readCfg();
        const prev = store.getGitHubConfig();
        store.setGitHubConfig(cfg);
        if (cfg.token !== prev.token || cfg.repo !== prev.repo || cfg.owner !== prev.owner) setGhVerified(false);
        refreshSettings();
        toast("GitHub settings saved in this browser", { tone: "ok", detail: cfg.token ? "Press “Test connection” to check them." : "" });
      }
    };

    root.addEventListener("click", onClick);
    root.addEventListener("submit", onSubmit);
    const unsub = subscribe((kind) => {
      if (kind === "content" || kind === "replace" || kind === "saved" || kind === "published") refreshChanges();
    });
    return () => {
      unsub();
      root.removeEventListener("click", onClick);
      root.removeEventListener("submit", onSubmit);
    };
  },
};
