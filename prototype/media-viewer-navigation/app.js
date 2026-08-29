const MEDIA_ITEMS = Object.freeze([
  Object.freeze({
    mediaId: "media_01J8Q3Z9A1",
    kind: "image",
    title: "银发调查员 · 安静室内光",
    createdAt: "2026-08-28 14:42",
    source: "../generation-workbench/fixtures/generated-portrait.svg",
    alt: "银色短发、蓝灰色眼睛、深色制服的调查员半身立绘",
    positivePrompt: "1girl, solo, silver short hair, blue-gray eyes, dark investigator uniform, half body portrait, quiet interior, soft window light, low contrast background, clean contour, clear cel shading, centered composition",
  }),
  Object.freeze({
    mediaId: "media_01J8Q3Q7M4",
    kind: "video",
    title: "银发调查员 · 轻微推进镜头",
    createdAt: "2026-08-28 14:38",
    source: "../generation-workbench/fixtures/demo-video.mp4",
    poster: "../generation-workbench/fixtures/video-poster.svg",
    alt: "银发调查员短视频",
    positivePrompt: "silver-haired investigator standing by an archive window, subtle camera push-in, restrained breathing motion, soft blue-gray daylight, quiet cinematic pacing, stable face and uniform details",
  }),
  Object.freeze({
    mediaId: "media_01J8Q3H2T8",
    kind: "image",
    title: "档案室 · 横向构图",
    createdAt: "2026-08-28 14:35",
    source: "../generation-workbench/fixtures/video-poster.svg",
    alt: "档案室中的银发调查员横向构图示例",
    positivePrompt: "1girl, silver pixie cut, investigator uniform, archive room, wide composition, subject on the right third, layered shelves, cool morning light, muted blue-gray palette, editorial illustration, precise linework",
  }),
  Object.freeze({
    mediaId: "media_01J8Q36P5K",
    kind: "image",
    title: "银发调查员 · 正面定稿",
    createdAt: "2026-08-28 14:31",
    source: "../generation-workbench/fixtures/generated-portrait.svg",
    alt: "银发调查员正面定稿立绘",
    positivePrompt: "masterpiece, 1girl, silver hair, blue-gray eyes, calm expression, navy investigator coat, front view, upper body, symmetrical framing, diffuse daylight, pale architectural background, crisp cel shading",
  }),
  Object.freeze({
    mediaId: "media_01J8Q2T1W7",
    kind: "video",
    title: "早期镜头测试",
    createdAt: "2026-08-28 14:24",
    source: "../generation-workbench/fixtures/demo-video.mp4",
    poster: "../generation-workbench/fixtures/video-poster.svg",
    alt: "早期镜头测试视频",
    positivePrompt: null,
  }),
]);

const VARIANTS = Object.freeze([
  Object.freeze({ id: "A", name: "原页增强" }),
  Object.freeze({ id: "B", name: "时间边轨" }),
  Object.freeze({ id: "C", name: "画册说明" }),
]);

const root = document.querySelector("#prototype-root");
const navigationStatus = document.querySelector("#navigation-status");
const initialUrl = new URL(window.location.href);
let variantId = VARIANTS.some((variant) => variant.id === initialUrl.searchParams.get("variant"))
  ? initialUrl.searchParams.get("variant")
  : "A";
let mediaIndex = Math.min(
  MEDIA_ITEMS.length - 1,
  Math.max(0, Number.parseInt(initialUrl.searchParams.get("media") ?? "3", 10) - 1 || 0),
);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function chevronIcon(direction) {
  const path = direction < 0 ? "m14.5 4-6 6 6 6" : "m9.5 4 6 6-6 6";
  return `<svg viewBox="0 0 24 20" aria-hidden="true"><path d="${path}" /></svg>`;
}

function currentItem() {
  return MEDIA_ITEMS[mediaIndex];
}

function adjacentItem(direction) {
  return MEDIA_ITEMS[mediaIndex + direction] ?? null;
}

function mediaMarkup(item, className = "viewer-media") {
  if (item.kind === "video") {
    return `<video class="${className}" src="${escapeHtml(item.source)}" poster="${escapeHtml(item.poster)}" controls preload="metadata" aria-label="${escapeHtml(item.alt)}"></video>`;
  }
  return `<img class="${className}" src="${escapeHtml(item.source)}" alt="${escapeHtml(item.alt)}" />`;
}

function promptMarkup(item, className = "prompt-panel") {
  const prompt = item.positivePrompt === null
    ? "这项媒体的生成记录没有保存正面提示词。"
    : item.positivePrompt;
  return `<section class="${className}" aria-labelledby="positive-prompt-title">
    <div class="prompt-heading">
      <h2 id="positive-prompt-title">正面提示词</h2>
      <span>${item.positivePrompt === null ? "未保存" : "生成时保存"}</span>
    </div>
    <p${item.positivePrompt === null ? ' class="is-empty"' : ""}>${escapeHtml(prompt)}</p>
  </section>`;
}

function navigationButton(direction, className = "media-navigation") {
  const adjacent = adjacentItem(direction);
  const side = direction < 0 ? "left" : "right";
  const directionLabel = direction < 0 ? "较新" : "较早";
  const boundaryLabel = direction < 0 ? "当前媒体已是本会话最新媒体" : "当前媒体已是本会话最早媒体";
  const label = adjacent === null
    ? boundaryLabel
    : `${directionLabel}的媒体，第 ${mediaIndex + direction + 1} 项，${adjacent.createdAt}`;
  return `<button
    class="${className} is-${side}"
    type="button"
    data-media-direction="${direction}"
    aria-label="${escapeHtml(label)}"
    ${adjacent === null ? "disabled" : ""}
  >
    ${chevronIcon(direction)}
    <span class="navigation-copy"><strong>${directionLabel}</strong><small>${adjacent?.createdAt.slice(11) ?? boundaryLabel}</small></span>
  </button>`;
}

function headerMarkup(item, className = "viewer-header") {
  return `<header class="${className}">
    <div><span class="section-kicker">SESSION MEDIA</span><h1>本会话媒体</h1></div>
    <div class="current-media-meta">
      <strong>${mediaIndex + 1} / ${MEDIA_ITEMS.length}</strong>
      <span>${escapeHtml(item.createdAt)} · ${escapeHtml(item.title)}</span>
    </div>
  </header>`;
}

function renderVariantA(item) {
  return `<article class="media-viewer layout-a" data-layout="immersive">
    ${headerMarkup(item)}
    <div class="a-stage">
      ${navigationButton(-1, "media-navigation a-navigation")}
      <figure class="a-media-shell">${mediaMarkup(item)}<figcaption>${escapeHtml(item.mediaId)}</figcaption></figure>
      ${navigationButton(1, "media-navigation a-navigation")}
    </div>
    ${promptMarkup(item, "prompt-panel a-prompt-panel")}
  </article>`;
}

function renderVariantB(item) {
  return `<article class="media-viewer layout-b" data-layout="time-rails">
    ${headerMarkup(item, "viewer-header b-header")}
    <div class="b-stage">
      <aside class="time-rail is-newer" aria-label="较新媒体方向">
        <span class="rail-line" aria-hidden="true"></span>
        ${navigationButton(-1, "media-navigation rail-navigation")}
      </aside>
      <figure class="b-media-shell">
        ${mediaMarkup(item)}
        <figcaption><code>${escapeHtml(item.mediaId)}</code><span>${escapeHtml(item.title)}</span></figcaption>
      </figure>
      <aside class="time-rail is-older" aria-label="较早媒体方向">
        <span class="rail-line" aria-hidden="true"></span>
        ${navigationButton(1, "media-navigation rail-navigation")}
      </aside>
    </div>
    ${promptMarkup(item, "prompt-panel b-prompt-panel")}
  </article>`;
}

function renderVariantC(item) {
  return `<article class="media-viewer layout-c" data-layout="album-caption">
    ${headerMarkup(item, "viewer-header c-header")}
    <div class="c-stage">
      ${navigationButton(-1, "media-navigation c-navigation")}
      <figure class="c-album-frame">
        <div class="c-media-mat">${mediaMarkup(item)}</div>
        <figcaption>
          <div class="c-caption-meta"><span>${escapeHtml(item.title)}</span><code>${escapeHtml(item.mediaId)}</code></div>
          ${promptMarkup(item, "prompt-panel c-prompt-panel")}
        </figcaption>
      </figure>
      ${navigationButton(1, "media-navigation c-navigation")}
    </div>
  </article>`;
}

function prototypeSwitcherMarkup() {
  const currentVariantIndex = VARIANTS.findIndex((variant) => variant.id === variantId);
  return `<nav class="prototype-switcher" aria-label="静态原型方案">
    <button type="button" data-variant-step="-1" aria-label="查看上一个界面方案">${chevronIcon(-1)}</button>
    <div class="variant-options">
      ${VARIANTS.map((variant) => `<button type="button" data-variant="${variant.id}" aria-current="${variant.id === variantId ? "true" : "false"}">${variant.id} · ${variant.name}</button>`).join("")}
    </div>
    <button type="button" data-variant-step="1" aria-label="查看下一个界面方案">${chevronIcon(1)}</button>
    <span>Shift + ← / → 切换方案</span>
  </nav>`;
}

function updateUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", variantId);
  url.searchParams.set("media", String(mediaIndex + 1));
  window.history.replaceState(null, "", url);
}

function render({ announce = false, focusDirection = null } = {}) {
  const item = currentItem();
  const renderer = { A: renderVariantA, B: renderVariantB, C: renderVariantC }[variantId];
  document.body.dataset.variant = variantId;
  document.title = `${item.title} · 媒体 ${mediaIndex + 1} / ${MEDIA_ITEMS.length}`;
  root.innerHTML = `${renderer(item)}${prototypeSwitcherMarkup()}`;
  updateUrl();
  if (announce) navigationStatus.textContent = `已显示第 ${mediaIndex + 1} 项媒体，${item.title}，${item.createdAt}`;
  if (focusDirection !== null) {
    root.querySelector(`[data-media-direction="${focusDirection}"]:not(:disabled)`)?.focus();
  }
}

function navigateMedia(direction) {
  const nextIndex = mediaIndex + direction;
  if (nextIndex < 0 || nextIndex >= MEDIA_ITEMS.length) return;
  mediaIndex = nextIndex;
  render({ announce: true, focusDirection: direction });
}

function selectVariant(nextVariantId) {
  if (!VARIANTS.some((variant) => variant.id === nextVariantId)) return;
  variantId = nextVariantId;
  render();
}

function stepVariant(direction) {
  const currentIndex = VARIANTS.findIndex((variant) => variant.id === variantId);
  const nextIndex = (currentIndex + direction + VARIANTS.length) % VARIANTS.length;
  selectVariant(VARIANTS[nextIndex].id);
}

document.addEventListener("click", (event) => {
  const mediaButton = event.target.closest("[data-media-direction]");
  if (mediaButton) {
    navigateMedia(Number(mediaButton.dataset.mediaDirection));
    return;
  }
  const variantButton = event.target.closest("[data-variant]");
  if (variantButton) {
    selectVariant(variantButton.dataset.variant);
    return;
  }
  const variantStepButton = event.target.closest("[data-variant-step]");
  if (variantStepButton) stepVariant(Number(variantStepButton.dataset.variantStep));
});

document.addEventListener("keydown", (event) => {
  const tagName = event.target.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName) || event.target.isContentEditable) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const direction = event.key === "ArrowLeft" ? -1 : 1;
  if (event.shiftKey) stepVariant(direction);
  else navigateMedia(direction);
});

render();
