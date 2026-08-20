import { COMFYUI_ASYNC_TASK_FIXTURES, RUN_ARTIFACT_FIXTURES, RUN_STATE_FIXTURES, SESSION_MEDIA_FIXTURES, SESSION_TURN_FIXTURES, TURN_RUN_FIXTURES } from "./fixtures/workflow-fixtures.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const stateOrder = [
  "success",
  "empty",
  "streaming",
  "context-error",
  "queued",
  "running",
  "downloading",
  "media",
  "failed",
  "unknown",
];

const baseModelFilters = [
  { id: "all", title: "全部" },
  { id: "base-anima", title: "Anima aesthetic v1.1" },
  { id: "base-illustrious", title: "Illustrious XL" },
  { id: "base-wai", title: "WAI-NSFW-illustrious" },
];

const baseModelScopedKinds = new Set(["model", "lora", "style", "artist-string", "comfyui-template"]);

const kindDefinitions = [
  { id: "model", label: "生成模型", icon: "MD", count: 13 },
  { id: "lora", label: "LoRA", icon: "LR", count: 86 },
  { id: "work", label: "作品", icon: "WK", count: 3760 },
  { id: "character", label: "角色", icon: "CH", count: 39936 },
  { id: "style", label: "画师或画风", icon: "ST", count: 12413 },
  { id: "artist-string", label: "画师串", icon: "AS", count: 0 },
  { id: "comfyui-instance", label: "ComfyUI 实例", icon: "CI", count: 2 },
  { id: "comfyui-template", label: "Workflow 模板", icon: "WF", count: 35 },
  { id: "media", label: "已保存媒体", icon: "ME", count: 18 },
];

const catalog = {
  model: [
    {
      id: "model-anima-pencil",
      baseModelId: "base-anima",
      title: "anima_pencilXL_v11",
      subtitle: "作者：NoobAI Catalog · Anima aesthetic v1.1",
      tag: "在线",
      description: "当前 Workflow 模板引用的文生图模型。模型文件信息来自数据源目录。",
      fields: { "稳定 ID": "generation_model_13", "文件名": "anima_pencilXL_v11.safetensors", "底模": "Anima aesthetic v1.1" },
    },
    {
      id: "model-anima-soft",
      baseModelId: "base-anima",
      title: "anima_softlight_v3",
      subtitle: "作者：NoobAI Catalog · Anima aesthetic v1.1",
      tag: "在线",
      description: "适合低对比度照明和柔和肤色表现的生成模型。",
      fields: { "稳定 ID": "generation_model_12", "文件名": "anima_softlight_v3.safetensors", "底模": "Anima aesthetic v1.1" },
    },
  ],
  lora: [
    {
      id: "lora-line-42",
      baseModelId: "base-anima",
      title: "Fine line control",
      subtitle: "触发词：fine line, clean contour",
      tag: "0.65",
      description: "为角色轮廓增加稳定线条。权重值只作为本次草稿参数，发送后写入不可变上下文。",
      fields: { "稳定 ID": "generation_lora_42", "底模": "Anima aesthetic v1.1", "建议权重": "0.55–0.75" },
    },
    {
      id: "lora-light-18",
      baseModelId: "base-anima",
      title: "Quiet interior light",
      subtitle: "触发词：soft window light",
      tag: "0.50",
      description: "降低室内背景对比度，并保留人物面部方向性光照。",
      fields: { "稳定 ID": "generation_lora_18", "底模": "Anima aesthetic v1.1", "建议权重": "0.40–0.60" },
    },
  ],
  work: [
    {
      id: "work-3760",
      title: "北境调查局",
      subtitle: "别名：North Bureau",
      tag: "12 角色",
      description: "包含当前银发调查员角色的作品目录项。",
      fields: { "稳定 ID": "work_3760", "角色数量": "12", "来源": "数据源语义目录" },
    },
  ],
  character: [
    {
      id: "character-39936",
      title: "银发调查员",
      subtitle: "作品：北境调查局 · 别名：艾琳",
      tag: "角色",
      description: "银色短发、蓝灰色眼睛与深色调查员制服构成该角色的稳定外观信息。",
      fields: { "稳定 ID": "character_39936", "作品": "北境调查局", "别名": "艾琳 / Irene" },
    },
    {
      id: "character-39912",
      title: "档案室管理员",
      subtitle: "作品：北境调查局 · 别名：洛文",
      tag: "角色",
      description: "深褐色长发、圆框眼镜和档案员制服构成该角色的稳定外观信息。",
      fields: { "稳定 ID": "character_39912", "作品": "北境调查局", "别名": "洛文" },
    },
  ],
  style: [
    {
      id: "style-clear-cel",
      baseModelId: "base-anima",
      title: "清透赛璐璐",
      subtitle: "明确轮廓、低饱和阴影、局部柔光",
      tag: "画风",
      description: "使用清晰轮廓和受控明暗面塑造人物，背景保持低信息密度。",
      fields: { "稳定 ID": "style_12108", "底模": "Anima aesthetic v1.1", "别名": "clear cel shading" },
    },
    {
      id: "style-quiet-editorial",
      baseModelId: "base-anima",
      title: "安静编辑插画",
      subtitle: "留白构图、低对比背景、纸张质感",
      tag: "画风",
      description: "用较大留白和克制背景支撑单人肖像，避免背景元素争夺注意力。",
      fields: { "稳定 ID": "style_11992", "底模": "Anima aesthetic v1.1", "别名": "quiet editorial" },
    },
  ],
  "artist-string": [],
  "comfyui-instance": [
    {
      id: "instance-east-gpu",
      title: "绘图节点 · East GPU",
      subtitle: "在线 · 支持图片、视频和音频输出",
      tag: "可用",
      description: "该安全投影只展示实例名称、可用状态和能力。浏览器不会获得连接地址或凭据。",
      fields: { "稳定 ID": "comfyui_instance_2", "状态": "可用", "能力": "image, video, audio" },
    },
    {
      id: "instance-local-lab",
      title: "本地实验节点",
      subtitle: "维护中 · 只支持图片输出",
      tag: "维护",
      description: "当前不可用于创建新运行的实验实例。",
      fields: { "稳定 ID": "comfyui_instance_1", "状态": "维护中", "能力": "image" },
    },
  ],
  "comfyui-template": [
    {
      id: "template-17",
      baseModelId: "base-anima",
      coverUrl: "./fixtures/generated-portrait.svg",
      title: "Anima 角色半身像",
      subtitle: "832 × 1216 · 支持宽高、CFG、提示词与 LoRA",
      tag: "rev.17",
      description: "完整 Workflow 模板来自数据源。创建运行时，当前仓库保存模板来源快照，再生成本次实际 Workflow JSON。",
      fields: { "稳定 ID": "comfyui_template_17", "模板 revision": "17", "底模": "Anima aesthetic v1.1", "输出": "image/png" },
    },
    {
      id: "template-24",
      baseModelId: "base-anima",
      coverUrl: "./fixtures/video-poster.svg",
      title: "Anima 角色短视频",
      subtitle: "4 秒 · 支持提示词、分辨率、帧数与 CFG",
      tag: "rev.8",
      description: "用于生成短镜头运动的视频 Workflow 模板。",
      fields: { "稳定 ID": "comfyui_template_24", "模板 revision": "8", "底模": "Anima aesthetic v1.1", "输出": "video/mp4" },
    },
    {
      id: "template-31",
      baseModelId: "base-anima",
      title: "Anima LoRA 对比",
      subtitle: "双方案 · 固定 seed 与构图参数",
      tag: "rev.4",
      description: "使用同一组基础参数创建多项独立运行，适合比较 LoRA 组合。",
      fields: { "稳定 ID": "comfyui_template_31", "模板 revision": "4", "底模": "Anima aesthetic v1.1", "输出": "image/png" },
    },
    {
      id: "template-35",
      baseModelId: "base-anima",
      title: "Anima 高分辨率细化",
      subtitle: "1024 × 1536 · 两阶段采样",
      tag: "rev.6",
      description: "在基础角色图之后执行高分辨率细化并保存最终图片。",
      fields: { "稳定 ID": "comfyui_template_35", "模板 revision": "6", "底模": "Anima aesthetic v1.1", "输出": "image/png" },
    },
    {
      id: "template-38",
      baseModelId: "base-anima",
      title: "Anima 铅笔草图",
      subtitle: "768 × 1152 · 低 CFG 草图",
      tag: "rev.3",
      description: "生成适合作为后续细化输入的低对比铅笔草图。",
      fields: { "稳定 ID": "comfyui_template_38", "模板 revision": "3", "底模": "Anima aesthetic v1.1", "输出": "image/png" },
    },
    {
      id: "template-41",
      baseModelId: "base-anima",
      title: "Anima 横幅场景",
      subtitle: "1536 × 864 · 环境构图",
      tag: "rev.5",
      description: "为横向环境叙事保留更宽的构图空间和角色站位。",
      fields: { "稳定 ID": "comfyui_template_41", "模板 revision": "5", "底模": "Anima aesthetic v1.1", "输出": "image/png" },
    },
    {
      id: "template-44",
      baseModelId: "base-anima",
      title: "Anima 声画短片",
      subtitle: "6 秒 · 视频与环境音输出",
      tag: "rev.2",
      description: "一次运行保存视频和环境音两个输出。",
      fields: { "稳定 ID": "comfyui_template_44", "模板 revision": "2", "底模": "Anima aesthetic v1.1", "输出": "video/mp4, audio/wav" },
    },
  ],
  media: [
    {
      id: "media-portrait-0",
      title: "银发调查员 · 半身像",
      subtitle: "run_01J8M7H4Q9 · output 0",
      tag: "PNG",
      description: "当前仓库为已完成运行保存的图片输出。该条目可以作为后续消息的参考媒体上下文。",
      fields: { "稳定 ID": "media_01J8M7H4Q9_0", "媒体种类": "image", "创建时间": "2026-08-20 14:32" },
    },
    {
      id: "media-video-0",
      title: "角色镜头运动",
      subtitle: "run_01J8VIDEO42 · output 0",
      tag: "MP4",
      description: "当前仓库为已完成运行保存的视频输出。",
      fields: { "稳定 ID": "media_01J8VIDEO42_0", "媒体种类": "video", "创建时间": "2026-08-20 11:12" },
    },
  ],
};

const initialConversationMarkup = $("#message-list").innerHTML;
const initialSessionConversationMarkup = {
  portrait: initialConversationMarkup,
  video: `<section class="conversation-turn is-selected" data-turn-id="turn_video_01">
  <div class="turn-heading"><button type="button" data-select-turn="turn_video_01"><span>第 1 轮 · 生成 4 秒角色镜头</span><strong>查看 1 项 ComfyUI 运行</strong></button></div>
  <article class="message agent-message">
    <div class="message-avatar">DS</div><div class="message-body"><div class="message-byline"><strong>图像生成 Agent</strong><time>11:04</time></div><p>请说明镜头运动、持续时间和目标分辨率。我会核对 Workflow 模板是否暴露对应运行时参数。</p></div>
  </article>
  <article class="message user-message"><div class="message-body"><div class="message-byline"><strong>你</strong><time>11:06</time></div><p>从人物近景缓慢后退到半身，持续 4 秒，不改变角色脸部。</p><details class="context-snapshot"><summary>已记录 2 项上下文</summary><ul><li><span>Workflow 模板</span>Anima 角色短视频</li><li><span>已保存媒体</span>银发调查员 · 半身像</li></ul></details></div></article>
  <article class="message agent-message"><div class="message-avatar">DS</div><div class="message-body"><div class="message-byline"><strong>图像生成 Agent</strong><time>11:12</time></div><p>视频、参考图片和环境音已经保存到当前仓库的运行目录。</p><button class="tool-call" type="button" data-focus-run="run_01J8MEDIA03"><span class="tool-call-icon" aria-hidden="true">↳</span><span><strong>generate_with_comfyui</strong><small>运行 run_01J8MEDIA03 已完成</small></span><span class="tool-call-action">定位结果</span></button></div></article></section>`,
  comparison: `<section class="conversation-turn is-selected" data-turn-id="turn_comparison_01">
  <div class="turn-heading"><button type="button" data-select-turn="turn_comparison_01"><span>第 1 轮 · 对比两组画风参数</span><strong>查看 2 项 ComfyUI 运行</strong></button></div>
  <article class="message agent-message">
    <div class="message-avatar">DS</div><div class="message-body"><div class="message-byline"><strong>图像生成 Agent</strong><time>周三 20:08</time></div><p>这个普通聊天轮次可以使用同一提示词和 seed 创建两项独立运行，并分别记录 LoRA 名称与权重。</p></div>
  </article>
  <article class="message user-message"><div class="message-body"><div class="message-byline"><strong>你</strong><time>周三 20:10</time></div><p>比较 Fine line control 0.65 和 Quiet interior light 0.50，其他参数保持一致。</p><details class="context-snapshot"><summary>已记录 3 项上下文</summary><ul><li><span>Workflow 模板</span>Anima LoRA 对比</li><li><span>LoRA</span>Fine line control</li><li><span>LoRA</span>Quiet interior light</li></ul></details></div></article>
  <article class="message agent-message"><div class="message-avatar">DS</div><div class="message-body"><div class="message-byline"><strong>图像生成 Agent</strong><time>周三 20:14</time></div><p>第一组已经完成；第二组因为 ComfyUI 实例缺少 LoRA 文件而失败。</p><button class="tool-call" type="button" data-focus-run="run_01J8FAILED7"><span class="tool-call-icon" aria-hidden="true">↳</span><span><strong>generate_with_comfyui</strong><small>运行 run_01J8FAILED7 失败</small></span><span class="tool-call-action">定位结果</span></button></div></article></section>`,
};
const initialDraftRefs = ["template-17", "character-39936"];
const draftRefs = new Map();
for (const refId of initialDraftRefs) {
  const item = Object.values(catalog).flat().find((candidate) => candidate.id === refId);
  if (item) draftRefs.set(refId, item);
}

let activeBaseModelId = "base-anima";
let activeKind = "comfyui-template";
let activeCandidateId = catalog[activeKind][0]?.id ?? null;
let pendingDialogRefs = new Map();
let activePrototypeState = "success";
let activeSessionId = "portrait";
let activeTurnId = "turn_portrait_03";
let streamTimer = null;
let queryErrorActive = false;
let contextReturnFocus = null;
let liveTurnCounter = 0;
let sessionMediaPage = 1;
let sessionMediaKindFilter = "all";
let sessionMediaTurnFilter = "all";
let sessionMediaTimeFilter = "all";
let globalMediaPage = 1;
let globalMediaSessionFilter = "all";
let globalMediaTurnFilter = "all";
let globalMediaKindFilter = "all";
let globalMediaTimeFilter = "all";
let mediaLibraryReturnFocus = null;
let taskLibraryPage = 1;
let taskLibrarySessionFilter = "all";
let taskLibraryTurnFilter = "all";
let taskLibraryTimeFilter = "all";
let taskLibraryReturnFocus = null;
let cancelTaskReturnFocus = null;
let pendingCancelRunId = null;
let contextCandidatePage = 1;

const SESSION_MEDIA_PAGE_SIZE = 4;
const GLOBAL_MEDIA_PAGE_SIZE = 8;
const GLOBAL_TASK_PAGE_SIZE = 5;
const CONTEXT_CANDIDATE_PAGE_SIZE = 6;

const sessionInfo = {
  portrait: { title: "角色立绘调整", state: "success", defaultTurnId: "turn_portrait_03" },
  video: { title: "测试视频工作流", state: "media", defaultTurnId: "turn_video_01" },
  comparison: { title: "画风参数对比", state: "failed", defaultTurnId: "turn_comparison_01" },
};

const turnRunFixtures = structuredClone(TURN_RUN_FIXTURES);
const runArtifactFixtures = Object.fromEntries(
  Object.entries(RUN_ARTIFACT_FIXTURES).map(([runId, artifact]) => [runId, structuredClone(artifact)]),
);
const sessionMediaFixtures = structuredClone(SESSION_MEDIA_FIXTURES);
const comfyuiAsyncTaskFixtures = structuredClone(COMFYUI_ASYNC_TASK_FIXTURES);
const runtimeRunStates = Object.fromEntries(Object.keys(runArtifactFixtures).map((runId) => [runId, "succeeded"]));
for (const fixture of Object.values(RUN_STATE_FIXTURES)) runtimeRunStates[fixture.runId] = fixture.state;
const runtimeRemoteJobStates = Object.fromEntries(comfyuiAsyncTaskFixtures.map((task) => [task.runId, task.remoteStatus]));
const sessionRuntimeState = Object.fromEntries(
  Object.entries(sessionInfo).map(([sessionId, info]) => [sessionId, {
    conversationMarkup: initialSessionConversationMarkup[sessionId],
    turnIds: [...SESSION_TURN_FIXTURES[sessionId]],
    selectedTurnId: info.defaultTurnId,
  }]),
);

function sessionRunIds(sessionId) {
  return [...new Set(
    (sessionRuntimeState[sessionId]?.turnIds ?? []).flatMap((turnId) => turnRunFixtures[turnId]?.runIds ?? []),
  )];
}

function updateSessionRunCount(sessionId) {
  const count = sessionRunIds(sessionId).length;
  const row = $(`[data-session-id="${sessionId}"]`);
  const countElement = $(".run-count", row);
  if (countElement) {
    countElement.textContent = `${count} 项运行`;
  }
  if (sessionId === activeSessionId) $("#result-total").textContent = `本会话共 ${count} 项运行`;
}

function updateCurrentTurnBinding(turnId) {
  $("#current-turn-id").textContent = turnId;
  $("#current-turn-label").textContent = turnRunFixtures[turnId]?.label ?? "未选择聊天轮次";
}

function persistActiveConversation() {
  const messageList = $("#message-list");
  if (!messageList || $(".empty-conversation", messageList)) return;
  sessionRuntimeState[activeSessionId].conversationMarkup = messageList.innerHTML;
}

function createRuntimeArtifact(runId, ordinal) {
  const sourceRunId = "run_01J8M7H4Q9";
  const source = runArtifactFixtures[sourceRunId];
  const artifact = JSON.parse(JSON.stringify(source).replaceAll(sourceRunId, runId));
  artifact.title = `静态消息生成 · 第 ${ordinal} 次`;
  runArtifactFixtures[runId] = artifact;
  runtimeRunStates[runId] = "queued";
  return artifact;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function findKindByItemId(itemId) {
  return kindDefinitions.find((definition) =>
    (catalog[definition.id] ?? []).some((item) => item.id === itemId),
  );
}

function downloadIcon() {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m0 0 3-3m-3 3L7 9M4 14v3h12v-3" /></svg>`;
}

function workflowRailMarkup(doneCount, activeIndex = -1) {
  return `<div class="workflow-rail" aria-hidden="true">${[0, 1, 2, 3]
    .map((index) => `<span class="${index < doneCount ? "done" : ""} ${index === activeIndex ? "active" : ""}"></span>`)
    .join("")}</div>`;
}

function runMetaMarkup({ template = "Anima 角色半身像 · rev.17", instance = "绘图节点 · East GPU" } = {}) {
  return `<div class="run-meta">
    <div class="run-meta-row"><span>Workflow 模板</span><span>${escapeHtml(template)}</span></div>
    <div class="run-meta-row"><span>ComfyUI 实例</span><span>${escapeHtml(instance)}</span></div>
  </div>`;
}

function imageMediaMarkup(title = "银发调查员 · 半身像") {
  return `<figure class="media-output" data-media-kind="image">
    <img src="./fixtures/generated-portrait.svg" alt="静态原型中的${escapeHtml(title)}图片示例" width="832" height="1216" loading="lazy" />
    <figcaption class="media-caption"><span><strong>${escapeHtml(title)}</strong>image/png · 832 × 1216</span><span class="output-index">output 0</span></figcaption>
  </figure>`;
}

function videoMediaMarkup(title = "角色镜头运动") {
  return `<figure class="media-output" data-media-kind="video">
    <div class="media-static-preview">
      <img src="./fixtures/video-poster.svg" alt="${escapeHtml(title)}的视频结果静态封面" width="960" height="540" loading="lazy" />
      <span>视频结果静态预览</span>
    </div>
    <figcaption class="media-caption"><span><strong>${escapeHtml(title)}</strong>video/mp4 · 原型不提供播放交互</span><span class="output-index">output 1</span></figcaption>
  </figure>`;
}

function audioMediaMarkup(title = "室内环境音") {
  const heights = [18, 31, 22, 39, 27, 46, 33, 25, 40, 19, 35, 48, 29, 42, 24, 36, 17, 31];
  return `<figure class="media-output" data-media-kind="audio">
    <div class="audio-visual" role="img" aria-label="${escapeHtml(title)}的音频波形静态预览">${heights.map((height) => `<span style="--height:${height}px"></span>`).join("")}</div>
    <figcaption class="media-caption"><span><strong>${escapeHtml(title)}</strong>audio/wav · 原型不提供播放交互</span><span class="output-index">output 2</span></figcaption>
  </figure>`;
}

function downloadMarkup(runId) {
  return `<div class="download-section">
    <p>本次 Workflow JSON 保留实际运行使用的节点、连接、参数和 ComfyUI 画布信息，可以导入 ComfyUI。</p>
    <div class="download-actions">
      <button class="download-button" type="button" data-download-workflow data-run-id="${runId}">
        ${downloadIcon()}<span>下载本次 Workflow JSON（可导入 ComfyUI）</span>
      </button>
    </div>
  </div>`;
}

function successRunMarkup(runId = "run_01J8M7H4Q9") {
  const artifact = runArtifactFixtures[runId];
  if (!artifact) throw new Error(`Unknown static run fixture: ${runId}`);
  const mediaMarkup = artifact.mediaKinds.map((kind) => {
    const outputTitle = artifact.mediaKinds.length > 1
      ? `${artifact.title} · ${{ image: "关键帧", video: "镜头", audio: "环境音" }[kind]}`
      : artifact.title;
    return ({ image: imageMediaMarkup, video: videoMediaMarkup, audio: audioMediaMarkup })[kind](outputTitle);
  }).join("");
  return `<article class="run-card" data-run-id="${artifact.runId}" data-state="succeeded" data-media-kinds="${artifact.mediaKinds.join(" ")}">
    ${workflowRailMarkup(4)}
    <div class="run-header">
      <div><h3 class="run-title">${escapeHtml(artifact.title)}</h3><code class="run-id">${artifact.runId}</code></div>
      <span class="status-badge success">已完成</span>
    </div>
    ${runMetaMarkup({ template: `${artifact.templateName} · rev.${artifact.templateRevision}`, instance: artifact.instanceName })}
    <div class="media-stack">${mediaMarkup}</div>
    ${downloadMarkup(artifact.runId)}
  </article>`;
}

function queuedRunMarkup(runId = "run_01J8QUEUE42") {
  const fixture = RUN_STATE_FIXTURES[runId];
  const artifact = runArtifactFixtures[runId];
  const title = fixture?.title ?? artifact?.title ?? "角色立绘调整";
  return `<article class="run-card" data-run-id="${escapeHtml(runId)}" data-state="queued">
    ${workflowRailMarkup(1, 1)}
    <div class="run-header">
      <div><h3 class="run-title">${escapeHtml(title)}</h3><code class="run-id">${escapeHtml(runId)}</code></div>
      <span class="status-badge pending">队列等待</span>
    </div>
    ${runMetaMarkup({ template: fixture ? `${fixture.templateName} · rev.${fixture.templateRevision}` : undefined, instance: fixture?.instanceName })}
    <div class="run-progress">
      <div class="progress-heading"><span>等待 ComfyUI 调度</span><span>队列前方 2 项</span></div>
      <div class="progress-track"><span style="width:22%"></span></div>
    </div>
    <p class="run-note">当前仓库已经保存本次实际 Workflow JSON 与 API Workflow JSON，并正在观察远端队列。</p>
  </article>`;
}

function runningRunMarkup(runId = "run_01J8RUNNING") {
  const fixture = RUN_STATE_FIXTURES[runId] ?? RUN_STATE_FIXTURES.run_01J8RUNNING;
  return `<article class="run-card" data-run-id="${escapeHtml(runId)}" data-state="running">
    ${workflowRailMarkup(2, 2)}
    <div class="run-header">
      <div><h3 class="run-title">${escapeHtml(fixture.title)}</h3><code class="run-id">${escapeHtml(runId)}</code></div>
      <span class="status-badge pending">远端运行</span>
    </div>
    ${runMetaMarkup({ template: `${fixture.templateName} · rev.${fixture.templateRevision}`, instance: fixture.instanceName })}
    <div class="run-progress">
      <div class="progress-heading"><span>KSampler · 18 / 28 步</span><span>64%</span></div>
      <div class="progress-track"><span style="width:64%"></span></div>
    </div>
    <p class="run-note">ComfyUI 已返回 <code>prompt_id</code>。当前仓库会继续查询该 <code>prompt_id</code> 的 ComfyUI Job 状态。</p>
  </article>`;
}

function downloadingRunMarkup(runId = "run_01J8SAVE003") {
  const fixture = RUN_STATE_FIXTURES[runId] ?? RUN_STATE_FIXTURES.run_01J8SAVE003;
  return `<article class="run-card" data-run-id="${escapeHtml(runId)}" data-state="downloading">
    ${workflowRailMarkup(3, 3)}
    <div class="run-header">
      <div><h3 class="run-title">${escapeHtml(fixture.title)}</h3><code class="run-id">${escapeHtml(runId)}</code></div>
      <span class="status-badge pending">保存媒体</span>
    </div>
    ${runMetaMarkup({ template: `${fixture.templateName} · rev.${fixture.templateRevision}`, instance: fixture.instanceName })}
    <div class="run-progress">
      <div class="progress-heading"><span>验证并保存 output 1 / 2</span><span>86%</span></div>
      <div class="progress-track"><span style="width:86%"></span></div>
    </div>
    <p class="run-note">当前仓库正在读取 ComfyUI 输出，并依据响应 Content-Type 与文件签名确认媒体类型。</p>
  </article>`;
}

function failedRunMarkup(runId = "run_01J8FAILED7") {
  const fixture = RUN_STATE_FIXTURES[runId] ?? RUN_STATE_FIXTURES.run_01J8FAILED7;
  return `<article class="run-card" data-run-id="${escapeHtml(runId)}" data-state="failed">
    ${workflowRailMarkup(2, 2)}
    <div class="run-header">
      <div><h3 class="run-title">${escapeHtml(fixture.title)}</h3><code class="run-id">${escapeHtml(runId)}</code></div>
      <span class="status-badge failed">运行失败</span>
    </div>
    ${runMetaMarkup({ template: `${fixture.templateName} · rev.${fixture.templateRevision}`, instance: fixture.instanceName })}
    <div class="run-error"><code class="error-code">COMFYUI_REMOTE_EXECUTION_FAILED</code>ComfyUI Job 详情显示 KSampler 节点执行失败：LoRA 模型文件不存在。请在中列说明要更换的 LoRA 或实例文件，再发送新消息。Agent 收到新消息后可以创建具有新 <code>run_id</code> 的运行。</div>
  </article>`;
}

function unknownRunMarkup(runId = "run_01J8UNKNOWN") {
  const fixture = RUN_STATE_FIXTURES[runId] ?? RUN_STATE_FIXTURES.run_01J8UNKNOWN;
  return `<article class="run-card" data-run-id="${escapeHtml(runId)}" data-state="submission_unknown">
    ${workflowRailMarkup(1, 1)}
    <div class="run-header">
      <div><h3 class="run-title">${escapeHtml(fixture.title)}</h3><code class="run-id">${escapeHtml(runId)}</code></div>
      <span class="status-badge unknown">提交结果未知</span>
    </div>
    ${runMetaMarkup({ template: `${fixture.templateName} · rev.${fixture.templateRevision}`, instance: fixture.instanceName })}
    <div class="unknown-warning"><code class="error-code">COMFYUI_SUBMISSION_RESULT_UNKNOWN</code>当前仓库在 <code>/prompt</code> 返回成功响应前失去确认，因此没有保存可查询的 <code>prompt_id</code>。系统无法确认 ComfyUI 是否已经接收该请求，也不会自动重新提交。若用户需要再次提交，用户必须在中列明确要求 Agent 创建具有新 <code>run_id</code> 的运行。</div>
  </article>`;
}

function cancellingRunMarkup(runId) {
  const fixture = RUN_STATE_FIXTURES[runId];
  const artifact = runArtifactFixtures[runId];
  const task = comfyuiAsyncTaskFixtures.find((item) => item.runId === runId);
  return `<article class="run-card" data-run-id="${escapeHtml(runId)}" data-state="cancelling">
    ${workflowRailMarkup(2, 2)}
    <div class="run-header">
      <div><h3 class="run-title">${escapeHtml(fixture?.title ?? artifact?.title ?? "ComfyUI 异步任务")}</h3><code class="run-id">${escapeHtml(runId)}</code></div>
      <span class="status-badge unknown">正在取消</span>
    </div>
    ${runMetaMarkup({ template: fixture ? `${fixture.templateName} · rev.${fixture.templateRevision}` : `${artifact?.templateName ?? "Workflow"} · rev.${artifact?.templateRevision ?? "-"}`, instance: task?.instanceName ?? fixture?.instanceName ?? artifact?.instanceName })}
    <div class="run-progress">
      <div class="progress-heading"><span>等待 ComfyUI 确认取消</span><span>处理中</span></div>
      <div class="progress-track"><span style="width:72%"></span></div>
    </div>
    <p class="run-note">当前仓库已经发送单任务取消请求，并正在重新查询 <code>GET /api/jobs/${escapeHtml(task?.promptId ?? "{prompt_id}")}</code>。</p>
  </article>`;
}

function cancelledRunMarkup(runId) {
  const fixture = RUN_STATE_FIXTURES[runId];
  const artifact = runArtifactFixtures[runId];
  const task = comfyuiAsyncTaskFixtures.find((item) => item.runId === runId);
  return `<article class="run-card" data-run-id="${escapeHtml(runId)}" data-state="cancelled">
    ${workflowRailMarkup(2)}
    <div class="run-header">
      <div><h3 class="run-title">${escapeHtml(fixture?.title ?? artifact?.title ?? "ComfyUI 异步任务")}</h3><code class="run-id">${escapeHtml(runId)}</code></div>
      <span class="status-badge cancelled">已取消</span>
    </div>
    ${runMetaMarkup({ template: fixture ? `${fixture.templateName} · rev.${fixture.templateRevision}` : `${artifact?.templateName ?? "Workflow"} · rev.${artifact?.templateRevision ?? "-"}`, instance: task?.instanceName ?? fixture?.instanceName ?? artifact?.instanceName })}
    <p class="run-note">ComfyUI Jobs API 已把任务 <code>${escapeHtml(task?.promptId ?? "")}</code> 标记为 <code>cancelled</code>。当前仓库不会自动重新提交该任务。</p>
  </article>`;
}

function emptyResultMarkup() {
  return `<div class="empty-results">
    <svg viewBox="0 0 90 62" aria-hidden="true"><rect x="3" y="17" width="22" height="18"/><rect x="64" y="28" width="22" height="18"/><path d="M25 26h18v11h21M43 26v-14h21"/></svg>
    <h3>当前会话还没有生成运行</h3>
    <p>在中列描述任务并发送消息。Agent 调用 Harness Tool <code>generate_with_comfyui</code> 后，右列会按 <code>run_id</code> 显示 ComfyUI 运行状态和结果。</p>
  </div>`;
}

function noRunForTurnMarkup(turnId) {
  return `<div class="empty-results">
    <svg viewBox="0 0 90 62" aria-hidden="true"><rect x="3" y="17" width="22" height="18"/><rect x="64" y="28" width="22" height="18"/><path d="M25 26h18v11h21M43 26v-14h21"/></svg>
    <h3>此轮对话没有创建 ComfyUI 运行</h3>
    <p>在聊天轮次 <code>${escapeHtml(turnId)}</code> 中，获得 <code>generate_with_comfyui</code> Tool 权限的普通 Skill 未调用该 Tool，因此该轮次没有关联 <code>run_id</code>。本会话其他轮次的结果仍保留在“本会话结果”。</p>
  </div>`;
}

function mediaGalleryEmptyMarkup({ libraryScope, totalCount, sessionFilter, kindFilter, turnFilter, timeFilter }) {
  const mediaLabel = { all: "全部媒体", image: "图片", video: "视频", audio: "音频" }[kindFilter];
  const timeLabel = { all: "全部时间", today: "今天", yesterday: "昨天", older: "更早" }[timeFilter];
  const turnLabel = turnFilter === "all"
    ? "全部聊天轮次"
    : turnRunFixtures[turnFilter]?.label ?? turnFilter;
  const sessionLabel = libraryScope === "session"
    ? sessionInfo[activeSessionId]?.title ?? activeSessionId
    : sessionFilter === "all"
      ? "全部会话"
      : sessionInfo[sessionFilter]?.title ?? sessionFilter;
  const hasSavedMedia = totalCount > 0;
  return `<div class="empty-results">
    <svg viewBox="0 0 90 62" aria-hidden="true"><rect x="3" y="17" width="22" height="18"/><rect x="64" y="28" width="22" height="18"/><path d="M25 26h18v11h21M43 26v-14h21"/></svg>
    <h3>${hasSavedMedia
      ? "当前筛选没有匹配的已保存媒体"
      : libraryScope === "session" ? "当前会话还没有已保存媒体" : "当前 Workspace 还没有已保存媒体"}</h3>
    <p>${hasSavedMedia
      ? `当前生效条件：会话 = “${escapeHtml(sessionLabel)}”、聊天轮次 = “${escapeHtml(turnLabel)}”、媒体种类 = “${escapeHtml(mediaLabel)}”、保存时间 = “${escapeHtml(timeLabel)}”。请选择其他筛选条件。`
      : "获得 generate_with_comfyui Tool 权限的普通 Skill 调用该 Tool，且当前仓库完成媒体保存后，图片、视频和音频会显示在这里。"}</p>
  </div>`;
}

function renderRunById(runId) {
  if (runtimeRunStates[runId] === "cancelling") return cancellingRunMarkup(runId);
  if (runtimeRunStates[runId] === "cancelled") return cancelledRunMarkup(runId);
  if (runtimeRunStates[runId] === "queued") return queuedRunMarkup(runId);
  if (runtimeRunStates[runId] === "running") return runningRunMarkup(runId);
  if (runtimeRunStates[runId] === "downloading") return downloadingRunMarkup(runId);
  if (runtimeRunStates[runId] === "submission_unknown") return unknownRunMarkup(runId);
  if (runtimeRunStates[runId] === "failed") return failedRunMarkup(runId);
  if (runArtifactFixtures[runId]) return successRunMarkup(runId);
  return "";
}

function syncTurnSelection() {
  $$(".conversation-turn").forEach((turn) => {
    turn.classList.toggle("is-selected", turn.dataset.turnId === activeTurnId);
  });
}

function scrollSelectedTurnIntoView() {
  const messageList = $("#message-list");
  const selectedTurn = $(".conversation-turn.is-selected", messageList);
  if (!messageList || !selectedTurn) return;
  messageList.scrollTop = Math.max(0, selectedTurn.offsetTop - 18);
}

function renderSelectedTurnRuns(turnId) {
  const turn = turnRunFixtures[turnId];
  activeTurnId = turnId;
  syncTurnSelection();
  updateCurrentTurnBinding(turnId);
  $("#current-run-list").innerHTML = turn?.runIds.length
    ? turn.runIds.map(renderRunById).join("")
    : noRunForTurnMarkup(turnId);
  setResultTab("current");
  if (sessionRuntimeState[activeSessionId]) sessionRuntimeState[activeSessionId].selectedTurnId = turnId;
}

function selectTurn(turnId) {
  if (!turnRunFixtures[turnId]) return;
  renderSelectedTurnRuns(turnId);
  if (window.matchMedia("(max-width: 900px)").matches) setMobilePanel("results");
}

function streamingMessageMarkup() {
  return `<article class="message agent-message" id="demo-streaming-message">
    <div class="message-avatar">DS</div>
    <div class="message-body">
      <div class="message-byline"><strong>图像生成 Agent</strong><time>正在输出</time></div>
      <p>我已经读取本次消息中的 Workflow 模板和角色上下文。接下来会固定角色外观，并把背景调整为<span class="stream-caret" aria-label="Agent 正在流式输出"></span></p>
    </div>
  </article>`;
}

function renderCurrentRuns(state) {
  const target = $("#current-run-list");
  if (["success", "context-error"].includes(state) && turnRunFixtures[activeTurnId]) {
    const runIds = turnRunFixtures[activeTurnId].runIds;
    target.innerHTML = runIds.length ? runIds.map(renderRunById).join("") : noRunForTurnMarkup(activeTurnId);
    return;
  }
  const states = {
    success: successRunMarkup(),
    empty: emptyResultMarkup(),
    streaming: queuedRunMarkup(),
    "context-error": successRunMarkup(),
    queued: queuedRunMarkup(),
    running: runningRunMarkup(),
    downloading: downloadingRunMarkup(),
    media: successRunMarkup("run_01J8MEDIA03"),
    failed: failedRunMarkup(),
    unknown: unknownRunMarkup(),
  };
  target.innerHTML = states[state] ?? states.success;
}

function sessionMediaItems(sessionId) {
  const turnIds = new Set(sessionRuntimeState[sessionId]?.turnIds ?? []);
  return sessionMediaFixtures
    .filter((item) => turnIds.has(item.turnId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function allMediaItems() {
  const visibleTurnIds = new Set(Object.values(sessionRuntimeState).flatMap((session) => session.turnIds));
  return sessionMediaFixtures
    .filter((item) => visibleTurnIds.has(item.turnId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function sessionIdForTurn(turnId) {
  return Object.entries(sessionRuntimeState).find(([, session]) => session.turnIds.includes(turnId))?.[0] ?? null;
}

function localDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function relativeDateKey(dayOffset) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return localDateKey(date);
}

function matchesMediaTime(item, timeFilter) {
  if (timeFilter === "all") return true;
  const itemDate = localDateKey(item.createdAt);
  if (timeFilter === "today") return itemDate === relativeDateKey(0);
  if (timeFilter === "yesterday") return itemDate === relativeDateKey(-1);
  return itemDate < relativeDateKey(-1);
}

function formatMediaCreatedAt(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function renderSessionMediaTurnOptions() {
  const select = $("#turn-filter");
  const turnIds = sessionRuntimeState[activeSessionId]?.turnIds ?? [];
  if (sessionMediaTurnFilter !== "all" && !turnIds.includes(sessionMediaTurnFilter)) {
    sessionMediaTurnFilter = "all";
  }
  select.innerHTML = [
    `<option value="all">全部聊天轮次</option>`,
    ...turnIds.map((turnId) => `<option value="${escapeHtml(turnId)}">${escapeHtml(turnRunFixtures[turnId]?.label ?? turnId)}</option>`),
  ].join("");
  select.value = sessionMediaTurnFilter;
}

function sessionMediaPreviewMarkup(item) {
  if (item.kind === "audio") {
    const heights = [20, 35, 26, 48, 31, 54, 38, 29, 45, 24, 41, 57, 34, 50, 27, 43, 22, 36];
    return `<div class="session-audio-preview" role="img" aria-label="${escapeHtml(item.title)}的音频波形静态预览">${heights.map((height) => `<span style="--height:${height}px"></span>`).join("")}</div>`;
  }
  return `<img src="${escapeHtml(item.previewUrl)}" alt="${escapeHtml(item.title)}的${item.kind === "video" ? "视频封面" : "图片预览"}" width="960" height="540" loading="lazy" />`;
}

function sessionMediaCardMarkup(item, libraryScope) {
  const turnLabel = turnRunFixtures[item.turnId]?.label ?? item.turnId;
  const sessionId = sessionIdForTurn(item.turnId);
  const sessionTitle = sessionInfo[sessionId]?.title ?? "未知会话";
  const kindLabel = { image: "图片", video: "视频", audio: "音频" }[item.kind] ?? item.kind;
  return `<article class="session-media-card" data-media-id="${escapeHtml(item.mediaId)}" data-turn-id="${escapeHtml(item.turnId)}" data-run-id="${escapeHtml(item.runId)}">
    <a class="session-media-original" href="${escapeHtml(item.originalUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在新窗口打开原文件：${escapeHtml(item.title)}">
      <div class="session-media-preview" data-media-kind="${escapeHtml(item.kind)}">
        ${sessionMediaPreviewMarkup(item)}
        <span class="session-media-kind">${escapeHtml(kindLabel)}</span>
        <span class="session-media-open" aria-hidden="true">↗</span>
      </div>
      <div class="session-media-card-body">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.mimeType)} · ${escapeHtml(item.detail)}</p>
        <small>${escapeHtml(sessionTitle)} · ${escapeHtml(turnLabel)}</small>
        <small>${escapeHtml(formatMediaCreatedAt(item.createdAt))} · output ${item.outputIndex}</small>
        <code>${escapeHtml(item.runId)}</code>
      </div>
    </a>
    <div class="session-media-card-actions">
      <button type="button" data-download-workflow data-artifact-scope="${escapeHtml(libraryScope)}" data-run-id="${escapeHtml(item.runId)}">${downloadIcon()}<span>下载本次 Workflow JSON（可导入 ComfyUI）</span></button>
    </div>
  </article>`;
}

function renderSessionMediaGallery() {
  const allItems = sessionMediaItems(activeSessionId);
  const filteredItems = allItems.filter((item) => {
    const matchesTurn = sessionMediaTurnFilter === "all" || item.turnId === sessionMediaTurnFilter;
    const matchesKind = sessionMediaKindFilter === "all" || item.kind === sessionMediaKindFilter;
    return matchesTurn && matchesKind && matchesMediaTime(item, sessionMediaTimeFilter);
  });
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / SESSION_MEDIA_PAGE_SIZE));
  sessionMediaPage = Math.min(Math.max(1, sessionMediaPage), pageCount);
  const pageStart = (sessionMediaPage - 1) * SESSION_MEDIA_PAGE_SIZE;
  const pageItems = filteredItems.slice(pageStart, pageStart + SESSION_MEDIA_PAGE_SIZE);

  $("#session-media-count").textContent = filteredItems.length === allItems.length
    ? `${allItems.length} 个已保存媒体`
    : `${filteredItems.length} / ${allItems.length} 个已保存媒体`;
  $("#session-media-grid").innerHTML = pageItems.map((item) => sessionMediaCardMarkup(item, "session")).join("") || mediaGalleryEmptyMarkup({
    libraryScope: "session",
    totalCount: allItems.length,
    sessionFilter: activeSessionId,
    kindFilter: sessionMediaKindFilter,
    turnFilter: sessionMediaTurnFilter,
    timeFilter: sessionMediaTimeFilter,
  });
  $("#media-page-status").textContent = `第 ${sessionMediaPage} / ${pageCount} 页 · 共 ${filteredItems.length} 个媒体`;
  $("#media-page-previous").disabled = sessionMediaPage === 1;
  $("#media-page-next").disabled = sessionMediaPage === pageCount;
  updateSessionRunCount(activeSessionId);
}

function renderGlobalMediaSessionOptions() {
  const select = $("#library-session-filter");
  if (globalMediaSessionFilter !== "all" && !sessionRuntimeState[globalMediaSessionFilter]) {
    globalMediaSessionFilter = "all";
  }
  select.innerHTML = [
    `<option value="all">全部会话</option>`,
    ...Object.entries(sessionInfo).map(([sessionId, info]) => `<option value="${escapeHtml(sessionId)}">${escapeHtml(info.title)}</option>`),
  ].join("");
  select.value = globalMediaSessionFilter;
}

function renderGlobalMediaTurnOptions() {
  const select = $("#library-turn-filter");
  const turnIds = globalMediaSessionFilter === "all"
    ? Object.values(sessionRuntimeState).flatMap((session) => session.turnIds)
    : sessionRuntimeState[globalMediaSessionFilter]?.turnIds ?? [];
  if (globalMediaTurnFilter !== "all" && !turnIds.includes(globalMediaTurnFilter)) {
    globalMediaTurnFilter = "all";
  }
  select.innerHTML = [
    `<option value="all">全部聊天轮次</option>`,
    ...turnIds.map((turnId) => {
      const sessionTitle = sessionInfo[sessionIdForTurn(turnId)]?.title ?? "未知会话";
      const turnLabel = turnRunFixtures[turnId]?.label ?? turnId;
      return `<option value="${escapeHtml(turnId)}">${escapeHtml(sessionTitle)} · ${escapeHtml(turnLabel)}</option>`;
    }),
  ].join("");
  select.value = globalMediaTurnFilter;
}

function renderGlobalMediaGallery() {
  const allItems = allMediaItems();
  const filteredItems = allItems.filter((item) => {
    const sessionId = sessionIdForTurn(item.turnId);
    const matchesSession = globalMediaSessionFilter === "all" || sessionId === globalMediaSessionFilter;
    const matchesTurn = globalMediaTurnFilter === "all" || item.turnId === globalMediaTurnFilter;
    const matchesKind = globalMediaKindFilter === "all" || item.kind === globalMediaKindFilter;
    return matchesSession && matchesTurn && matchesKind && matchesMediaTime(item, globalMediaTimeFilter);
  });
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / GLOBAL_MEDIA_PAGE_SIZE));
  globalMediaPage = Math.min(Math.max(1, globalMediaPage), pageCount);
  const pageStart = (globalMediaPage - 1) * GLOBAL_MEDIA_PAGE_SIZE;
  const pageItems = filteredItems.slice(pageStart, pageStart + GLOBAL_MEDIA_PAGE_SIZE);

  $("#all-media-entry-count").textContent = allItems.length;
  $("#library-media-count").textContent = filteredItems.length === allItems.length
    ? `${allItems.length} 个已保存媒体`
    : `${filteredItems.length} / ${allItems.length} 个已保存媒体`;
  $("#library-media-grid").innerHTML = pageItems.map((item) => sessionMediaCardMarkup(item, "workspace")).join("") || mediaGalleryEmptyMarkup({
    libraryScope: "workspace",
    totalCount: allItems.length,
    sessionFilter: globalMediaSessionFilter,
    kindFilter: globalMediaKindFilter,
    turnFilter: globalMediaTurnFilter,
    timeFilter: globalMediaTimeFilter,
  });
  $("#library-page-status").textContent = `第 ${globalMediaPage} / ${pageCount} 页 · 共 ${filteredItems.length} 个媒体`;
  $("#library-page-previous").disabled = globalMediaPage === 1;
  $("#library-page-next").disabled = globalMediaPage === pageCount;
}

function openMediaLibrary() {
  mediaLibraryReturnFocus = document.activeElement;
  globalMediaPage = 1;
  renderGlobalMediaSessionOptions();
  renderGlobalMediaTurnOptions();
  renderGlobalMediaGallery();
  const dialog = $("#media-library-dialog");
  if (!dialog.open) dialog.showModal();
}

function allComfyuiAsyncTasks() {
  const visibleTurnIds = new Set(Object.values(sessionRuntimeState).flatMap((session) => session.turnIds));
  return comfyuiAsyncTaskFixtures
    .filter((task) => visibleTurnIds.has(task.turnId))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function taskStatusPresentation(state) {
  return {
    succeeded: { label: "已完成", badgeClass: "success" },
    queued: { label: "队列等待", badgeClass: "pending" },
    running: { label: "远端运行", badgeClass: "pending" },
    downloading: { label: "保存媒体", badgeClass: "pending" },
    submission_unknown: { label: "提交结果未知", badgeClass: "unknown" },
    failed: { label: "运行失败", badgeClass: "failed" },
    cancelling: { label: "正在取消", badgeClass: "unknown" },
    cancelled: { label: "已取消", badgeClass: "cancelled" },
  }[state] ?? { label: state, badgeClass: "unknown" };
}

function taskTitle(task) {
  return RUN_STATE_FIXTURES[task.runId]?.title ?? runArtifactFixtures[task.runId]?.title ?? task.runId;
}

function taskActionMarkup(task, state) {
  if (state === "queued") {
    return `<button class="task-cancel-button" type="button" data-cancel-task="${escapeHtml(task.runId)}">取消排队任务</button>`;
  }
  if (state === "running") {
    return `<button class="task-cancel-button" type="button" data-cancel-task="${escapeHtml(task.runId)}">取消运行中任务</button>`;
  }
  if (state === "cancelling") return `<span class="task-action-note">等待 ComfyUI 确认</span>`;
  if (state === "downloading") return `<span class="task-action-note">远端已完成，正在保存媒体</span>`;
  if (state === "submission_unknown") return `<span class="task-action-note">本仓库没有可查询的 prompt_id；不能查询或取消 ComfyUI Job</span>`;
  if (state === "succeeded") return `<span class="task-action-note">ComfyUI Job 已完成；取消请求是 no-op</span>`;
  if (state === "failed") return `<span class="task-action-note">ComfyUI Job 已失败，不能取消</span>`;
  if (state === "cancelled") return `<span class="task-action-note">ComfyUI Job 已取消，无需再次取消</span>`;
  return `<span class="task-action-note">当前仓库状态不接受取消</span>`;
}

function taskRowMarkup(task) {
  const state = runtimeRunStates[task.runId];
  const status = taskStatusPresentation(state);
  const sessionId = sessionIdForTurn(task.turnId);
  const sessionTitle = sessionInfo[sessionId]?.title ?? sessionId ?? "未知会话";
  const turnLabel = turnRunFixtures[task.turnId]?.label ?? task.turnId;
  const remoteStatus = runtimeRemoteJobStates[task.runId];
  const remoteStatusMarkup = task.promptId === null
    ? `<small>ComfyUI Job：尚无可查询的 prompt_id</small>`
    : `<small>ComfyUI Job 原始状态：<code>${escapeHtml(remoteStatus)}</code></small>`;
  const promptIdMarkup = task.promptId === null
    ? `<small>prompt_id=未确认</small>`
    : `<small>prompt_id=${escapeHtml(task.promptId)}</small>`;
  return `<article class="task-row" role="row" data-task-run-id="${escapeHtml(task.runId)}">
    <div class="task-cell task-identity" role="cell">
      <strong>${escapeHtml(taskTitle(task))}</strong>
      <code>${escapeHtml(task.runId)}</code>
      <small>${escapeHtml(task.instanceName)} · instance_id=${task.instanceId}</small>
      ${promptIdMarkup}
    </div>
    <div class="task-cell task-conversation" role="cell">
      <strong>${escapeHtml(sessionTitle)}</strong>
      <span>${escapeHtml(turnLabel)}</span>
    </div>
    <time class="task-cell task-created-at" role="cell" datetime="${escapeHtml(task.createdAt)}">${escapeHtml(formatMediaCreatedAt(task.createdAt))}</time>
    <div class="task-cell task-status" role="cell">
      <small>本仓库状态</small>
      <span class="status-badge ${status.badgeClass}">${escapeHtml(status.label)}</span>
      ${remoteStatusMarkup}
    </div>
    <div class="task-cell task-actions" role="cell">${taskActionMarkup(task, state)}</div>
  </article>`;
}

function taskLibraryEmptyMarkup(totalCount) {
  const sessionLabel = taskLibrarySessionFilter === "all"
    ? "全部会话"
    : sessionInfo[taskLibrarySessionFilter]?.title ?? taskLibrarySessionFilter;
  const turnLabel = taskLibraryTurnFilter === "all"
    ? "全部聊天轮次"
    : turnRunFixtures[taskLibraryTurnFilter]?.label ?? taskLibraryTurnFilter;
  const timeLabel = { all: "全部时间", today: "今天", yesterday: "昨天", older: "更早" }[taskLibraryTimeFilter];
  return `<div class="empty-results task-library-empty">
    <h3>${totalCount > 0 ? "当前筛选没有匹配的异步任务" : "当前 Workspace 还没有 ComfyUI 异步任务"}</h3>
    <p>${totalCount > 0
      ? `当前生效条件：会话 = “${escapeHtml(sessionLabel)}”、聊天轮次 = “${escapeHtml(turnLabel)}”、创建时间 = “${escapeHtml(timeLabel)}”。请选择其他筛选条件。`
      : "普通 Skill 通过 Harness Tool 创建 ComfyUI 任务后，当前仓库会保存任务与会话、聊天轮次的关联；收到 /prompt 成功响应后，当前仓库再保存 prompt_id。"}</p>
  </div>`;
}

function renderTaskSessionOptions() {
  const select = $("#task-session-filter");
  if (taskLibrarySessionFilter !== "all" && !sessionRuntimeState[taskLibrarySessionFilter]) taskLibrarySessionFilter = "all";
  select.innerHTML = [
    `<option value="all">全部会话</option>`,
    ...Object.entries(sessionInfo).map(([sessionId, info]) => `<option value="${escapeHtml(sessionId)}">${escapeHtml(info.title)}</option>`),
  ].join("");
  select.value = taskLibrarySessionFilter;
}

function renderTaskTurnOptions() {
  const select = $("#task-turn-filter");
  const turnIds = taskLibrarySessionFilter === "all"
    ? Object.values(sessionRuntimeState).flatMap((session) => session.turnIds)
    : sessionRuntimeState[taskLibrarySessionFilter]?.turnIds ?? [];
  if (taskLibraryTurnFilter !== "all" && !turnIds.includes(taskLibraryTurnFilter)) taskLibraryTurnFilter = "all";
  select.innerHTML = [
    `<option value="all">全部聊天轮次</option>`,
    ...turnIds.map((turnId) => {
      const sessionTitle = sessionInfo[sessionIdForTurn(turnId)]?.title ?? "未知会话";
      return `<option value="${escapeHtml(turnId)}">${escapeHtml(sessionTitle)} · ${escapeHtml(turnRunFixtures[turnId]?.label ?? turnId)}</option>`;
    }),
  ].join("");
  select.value = taskLibraryTurnFilter;
}

function renderTaskLibrary() {
  const allTasks = allComfyuiAsyncTasks();
  const filteredTasks = allTasks.filter((task) => {
    const sessionId = sessionIdForTurn(task.turnId);
    const matchesSession = taskLibrarySessionFilter === "all" || sessionId === taskLibrarySessionFilter;
    const matchesTurn = taskLibraryTurnFilter === "all" || task.turnId === taskLibraryTurnFilter;
    return matchesSession && matchesTurn && matchesMediaTime(task, taskLibraryTimeFilter);
  });
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / GLOBAL_TASK_PAGE_SIZE));
  taskLibraryPage = Math.min(Math.max(1, taskLibraryPage), pageCount);
  const pageStart = (taskLibraryPage - 1) * GLOBAL_TASK_PAGE_SIZE;
  const pageTasks = filteredTasks.slice(pageStart, pageStart + GLOBAL_TASK_PAGE_SIZE);

  $("#all-task-entry-count").textContent = allTasks.length;
  $("#task-library-count").textContent = filteredTasks.length === allTasks.length
    ? `${allTasks.length} 项异步任务`
    : `${filteredTasks.length} / ${allTasks.length} 项异步任务`;
  $("#task-list").innerHTML = pageTasks.map(taskRowMarkup).join("") || taskLibraryEmptyMarkup(allTasks.length);
  $("#task-page-status").textContent = `第 ${taskLibraryPage} / ${pageCount} 页 · 共 ${filteredTasks.length} 项任务`;
  $("#task-page-previous").disabled = taskLibraryPage === 1;
  $("#task-page-next").disabled = taskLibraryPage === pageCount;
}

function openTaskLibrary() {
  taskLibraryReturnFocus = document.activeElement;
  taskLibraryPage = 1;
  renderTaskSessionOptions();
  renderTaskTurnOptions();
  renderTaskLibrary();
  const dialog = $("#task-library-dialog");
  if (!dialog.open) dialog.showModal();
}

function openCancelTaskDialog(runId, trigger) {
  const task = comfyuiAsyncTaskFixtures.find((item) => item.runId === runId);
  const state = runtimeRunStates[runId];
  if (!task || !["queued", "running"].includes(state)) return;
  pendingCancelRunId = runId;
  cancelTaskReturnFocus = trigger;
  $("#cancel-task-description").textContent = state === "queued"
    ? "ComfyUI 将从等待队列删除这个 prompt_id。该任务不会开始执行。"
    : "ComfyUI 将按 prompt_id 原子中断这个正在执行的任务，不会中断同一实例中的其他任务。";
  $("#cancel-task-target").innerHTML = `<strong>${escapeHtml(taskTitle(task))}</strong><code>${escapeHtml(runId)}</code><code>prompt_id=${escapeHtml(task.promptId)}</code><span>${escapeHtml(task.instanceName)}</span>`;
  const dialog = $("#cancel-task-dialog");
  if (!dialog.open) dialog.showModal();
}

function refreshCurrentTurnRunCards() {
  const runIds = turnRunFixtures[activeTurnId]?.runIds ?? [];
  $("#current-run-list").innerHTML = runIds.length ? runIds.map(renderRunById).join("") : noRunForTurnMarkup(activeTurnId);
}

function confirmTaskCancellation() {
  const runId = pendingCancelRunId;
  if (!runId || !["queued", "running"].includes(runtimeRunStates[runId])) return;
  runtimeRunStates[runId] = "cancelling";
  $("#cancel-task-dialog").close("confirmed");
  renderTaskLibrary();
  refreshCurrentTurnRunCards();
  window.setTimeout(() => {
    runtimeRunStates[runId] = "cancelled";
    runtimeRemoteJobStates[runId] = "cancelled";
    pendingCancelRunId = null;
    renderTaskLibrary();
    refreshCurrentTurnRunCards();
    showToast(`ComfyUI 已取消任务 ${runId}`, "success");
  }, 700);
}

function renderConversation(state) {
  const messageList = $("#message-list");
  if (state === "empty") {
    messageList.innerHTML = `<div class="empty-conversation">
      <svg class="empty-node-map" viewBox="0 0 160 96" aria-hidden="true"><rect x="8" y="31" width="42" height="30"/><rect x="109" y="10" width="42" height="30"/><rect x="109" y="57" width="42" height="30"/><path d="M50 46h30v-21h29M80 46v26h29"/></svg>
      <h3>从一条带上下文的消息开始</h3>
      <p>您可以先用底模筛选 Workflow 模板和 LoRA，再把需要的候选项添加到消息上下文；也可以直接描述任务，让 Agent 决定是否调用 Skill。</p>
      <button class="primary-button" type="button" data-empty-add-context>添加本次消息上下文</button>
    </div>`;
    return;
  }

  messageList.innerHTML = sessionRuntimeState[activeSessionId]?.conversationMarkup ?? initialConversationMarkup;
  syncTurnSelection();
  window.requestAnimationFrame(scrollSelectedTurnIntoView);
  if (state === "streaming") {
    messageList.insertAdjacentHTML("beforeend", streamingMessageMarkup());
    messageList.scrollTop = messageList.scrollHeight;
  }
}

function setPrototypeState(state, { updateUrl = true, openContextError = true } = {}) {
  if (!stateOrder.includes(state)) state = "success";
  activePrototypeState = state;
  $("#prototype-state").value = state;
  renderConversation(state);
  renderCurrentRuns(state);
  updateCurrentTurnBinding(activeTurnId);
  setResultTab("current");
  $("#result-total").textContent = state === "empty" ? "本会话共 0 项运行" : `本会话共 ${sessionRunIds(activeSessionId).length} 项运行`;
  $("#composer-box").classList.toggle("is-error", state === "context-error");
  $("#composer-status").textContent = state === "context-error"
    ? "上下文解析失败。正文和全部上下文仍保留在草稿中。"
    : "Enter 发送 · Shift + Enter 换行";
  $("#send-message").disabled = false;

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("state", state);
    history.replaceState({}, "", url);
  }

  if (state === "context-error" && openContextError) {
    window.setTimeout(() => {
      openContextDialog();
      renderQueryError();
    }, 20);
  }
}

function cyclePrototypeState(direction) {
  const currentIndex = stateOrder.indexOf(activePrototypeState);
  const nextIndex = (currentIndex + direction + stateOrder.length) % stateOrder.length;
  setPrototypeState(stateOrder[nextIndex]);
}

function setResultTab(tabName) {
  $$('[data-result-tab]').forEach((button) => {
    const selected = button.dataset.resultTab === tabName;
    button.setAttribute("aria-selected", String(selected));
    const panel = $(`#panel-${button.dataset.resultTab}`);
    panel.hidden = !selected;
  });
}

function setMobilePanel(panelName) {
  $$('[data-panel]').forEach((panel) => panel.classList.toggle("is-mobile-active", panel.dataset.panel === panelName));
  $$('[data-mobile-panel]').forEach((button) => button.classList.toggle("is-active", button.dataset.mobilePanel === panelName));
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.textContent = message;
  $("#toast-region").append(toast);
  window.setTimeout(() => toast.remove(), 3400);
}

function renderContextChips() {
  const target = $("#context-chips");
  target.innerHTML = "";
  for (const [id, item] of draftRefs) {
    const kind = findKindByItemId(id);
    const chip = document.createElement("span");
    chip.className = "context-chip";
    chip.dataset.refId = id;
    chip.innerHTML = `<span class="chip-kind">${escapeHtml(kind?.label ?? "资源")}</span>${escapeHtml(item.title)}<button type="button" aria-label="移除${escapeHtml(kind?.label ?? "资源")} ${escapeHtml(item.title)}">×</button>`;
    target.append(chip);
  }
  const count = draftRefs.size;
  $("#draft-context-count").textContent = count === 0 ? "未添加上下文" : `${count} 项，将与正文一起写入会话`;
}

function renderKindList() {
  $("#resource-kind-list").innerHTML = kindDefinitions.map((kind) => `
    <button type="button" class="resource-kind-button ${kind.id === activeKind ? "is-active" : ""}" data-kind="${kind.id}">
      <span class="kind-icon">${kind.icon}</span><span class="kind-name">${kind.label}</span><span class="kind-count">${kind.count}</span>
    </button>`).join("");
}

function activeBaseModelTitle() {
  return baseModelFilters.find((baseModel) => baseModel.id === activeBaseModelId)?.title ?? "未选择底模";
}

function renderBaseModelFilter() {
  const select = $("#base-model-filter");
  select.innerHTML = baseModelFilters.map((baseModel) =>
    `<option value="${baseModel.id}">${escapeHtml(baseModel.title)}</option>`,
  ).join("");
  select.value = activeBaseModelId;
}

function renderCandidateDetail(item) {
  const kind = kindDefinitions.find((definition) => definition.id === activeKind);
  if (!item) {
    $("#candidate-detail").innerHTML = `<p class="detail-kind">${escapeHtml(kind?.label ?? "资源")}</p><h3>选择一个候选项</h3><p class="detail-description">候选项详情会显示稳定 ID 和本次选择需要确认的信息。</p>`;
    return;
  }
  const rows = Object.entries(item.fields ?? {}).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  const hint = activeKind === "comfyui-instance"
    ? "浏览器只获得实例的安全投影。连接地址和凭据保留在 Harness Host 私有适配器中。"
    : activeKind === "comfyui-template"
      ? "创建运行时，当前仓库会保存模板来源快照；之后的数据源变更不会改变该运行的两个 Workflow JSON。"
      : "发送消息时，Harness 会按稳定 ID 解析该引用，并把不可变上下文与用户正文一起记录。";
  $("#candidate-detail").innerHTML = `<p class="detail-kind">${escapeHtml(kind?.label ?? "资源")}</p><h3>${escapeHtml(item.title)}</h3><p class="detail-description">${escapeHtml(item.description)}</p><dl class="detail-table">${rows}</dl><p class="detail-hint">${escapeHtml(hint)}</p>`;
}

function candidateCoverMarkup(item, kind) {
  if (item.coverUrl) {
    return `<img class="candidate-cover-image" src="${escapeHtml(item.coverUrl)}" alt="${escapeHtml(item.title)}的资源封面" width="150" height="88" loading="lazy" />`;
  }
  return `<span class="candidate-cover-placeholder" role="img" aria-label="${escapeHtml(item.title)}没有封面图"><span>${escapeHtml(kind?.icon ?? "RS")}</span><small>暂无封面</small></span>`;
}

function renderCandidatePagination(totalCount) {
  const totalPages = Math.max(1, Math.ceil(totalCount / CONTEXT_CANDIDATE_PAGE_SIZE));
  contextCandidatePage = Math.min(Math.max(contextCandidatePage, 1), totalPages);
  $("#candidate-page-status").textContent = `第 ${contextCandidatePage} / ${totalPages} 页 · ${totalCount} 项`;
  $("#candidate-page-previous").disabled = contextCandidatePage === 1;
  $("#candidate-page-next").disabled = contextCandidatePage === totalPages;
}

function renderCandidates() {
  queryErrorActive = false;
  const query = $("#context-search").value.trim().toLocaleLowerCase("zh-CN");
  const candidates = (catalog[activeKind] ?? []).filter((item) => {
    const matchesBaseModel = !baseModelScopedKinds.has(activeKind)
      || activeBaseModelId === "all"
      || item.baseModelId === activeBaseModelId;
    const matchesQuery = `${item.title} ${item.subtitle}`.toLocaleLowerCase("zh-CN").includes(query);
    return matchesBaseModel && matchesQuery;
  });
  const activeDefinition = kindDefinitions.find((definition) => definition.id === activeKind);
  $("#context-search").placeholder = `搜索${activeDefinition?.label ?? "资源"}`;
  const filterNotice = $("#filter-notice");
  if (baseModelScopedKinds.has(activeKind)) {
    filterNotice.hidden = false;
    filterNotice.textContent = `查询条件：底模 = “${activeBaseModelTitle()}”。底模不会写入消息上下文。`;
  } else {
    filterNotice.hidden = true;
  }

  if (candidates.length === 0) {
    const emptyTitle = activeKind === "artist-string" ? "当前数据源没有画师串" : "没有符合条件的候选项";
    const emptyCopy = activeKind === "artist-string"
      ? "空结果是当前数据状态，不是查询错误。您可以改选“画师或画风”，也可以关闭选择器继续编辑消息。"
      : baseModelScopedKinds.has(activeKind)
        ? `底模“${activeBaseModelTitle()}”下没有符合当前搜索词的${activeDefinition?.label ?? "资源"}候选项。请修改底模筛选或搜索词。`
        : "修改搜索词，或者改选其他资源种类。";
    $("#candidate-list").innerHTML = `<div class="query-state"><span class="query-state-icon" style="color:var(--muted);background:var(--soft-canvas)">0</span><strong>${emptyTitle}</strong><p>${emptyCopy}</p></div>`;
    renderCandidatePagination(0);
    renderCandidateDetail(null);
    return;
  }

  renderCandidatePagination(candidates.length);
  const pageStart = (contextCandidatePage - 1) * CONTEXT_CANDIDATE_PAGE_SIZE;
  const pageItems = candidates.slice(pageStart, pageStart + CONTEXT_CANDIDATE_PAGE_SIZE);
  if (!pageItems.some((candidate) => candidate.id === activeCandidateId)) activeCandidateId = pageItems[0].id;
  $("#candidate-list").innerHTML = pageItems.map((item) => {
    const selected = pendingDialogRefs.has(item.id) || draftRefs.has(item.id);
    return `<button type="button" class="candidate-card ${item.id === activeCandidateId ? "is-active" : ""} ${selected ? "is-selected" : ""}" data-candidate-id="${item.id}" aria-pressed="${selected}">
      <span class="candidate-cover">
        ${candidateCoverMarkup(item, activeDefinition)}
        <span class="candidate-check" aria-hidden="true">✓</span>
        <span class="candidate-tag">${escapeHtml(item.tag)}</span>
      </span>
      <span class="candidate-card-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)}</small></span>
    </button>`;
  }).join("");
  renderCandidateDetail(candidates.find((candidate) => candidate.id === activeCandidateId));
}

function updateDialogSelectionSummary() {
  const count = pendingDialogRefs.size;
  $("#dialog-selection-summary").textContent = count === 0 ? "尚未新增上下文" : `将新增 ${count} 项上下文`;
  $("#confirm-context").disabled = count === 0;
}

function openContextDialog() {
  contextReturnFocus = document.activeElement;
  pendingDialogRefs = new Map();
  queryErrorActive = false;
  activeKind = "comfyui-template";
  activeCandidateId = catalog[activeKind][0]?.id ?? null;
  contextCandidatePage = 1;
  $("#context-search").value = "";
  renderBaseModelFilter();
  renderKindList();
  renderCandidates();
  updateDialogSelectionSummary();
  const dialog = $("#context-dialog");
  if (!dialog.open) dialog.showModal();
}

function renderQueryError() {
  queryErrorActive = true;
  $("#candidate-list").innerHTML = `<div class="query-state"><span class="query-state-icon">!</span><strong>数据源没有返回${escapeHtml(kindDefinitions.find((definition) => definition.id === activeKind)?.label ?? "资源")}结果</strong><p><code>GENERATION_CATALOG_SOURCE_UNAVAILABLE</code><br />Harness Tool 无法完成本次只读查询。页面不会删除已经选择的上下文。</p><button class="secondary-button" type="button" id="retry-context-query">重新查询</button></div>`;
  renderCandidatePagination(0);
  $("#candidate-detail").innerHTML = `<p class="detail-kind">查询错误</p><h3>当前草稿保持不变</h3><p class="detail-description">关闭选择器后，用户正文和已经选择的上下文仍保留。重新发送前需要完成失败引用的解析。</p>`;
}

function confirmContextSelection(event) {
  event.preventDefault();
  for (const [id, item] of pendingDialogRefs) draftRefs.set(id, item);
  const count = pendingDialogRefs.size;
  renderContextChips();
  $("#context-dialog").close("default");
  if (count > 0) showToast(`已向本次消息添加 ${count} 项上下文`);
}

function downloadWorkflowJson(runId) {
  const artifact = runArtifactFixtures[runId];
  if (!artifact) {
    showToast(`当前静态原型没有运行 ${runId} 的 Workflow fixture`, "error");
    return;
  }
  const payload = structuredClone(artifact.uiWorkflow);
  const filename = `comfyui-run-${runId}-workflow.json`;
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast(`静态原型已下载该运行的 fixture 文件：${filename}`);
}

function appendUserMessage(text) {
  const contextItems = [...draftRefs.entries()].map(([id, item]) => {
    const kind = findKindByItemId(id);
    return `<li><span>${escapeHtml(kind?.label ?? "资源")}</span>${escapeHtml(item.title)}</li>`;
  }).join("");
  const snapshot = contextItems
    ? `<details class="context-snapshot"><summary>已记录 ${draftRefs.size} 项上下文</summary><ul>${contextItems}</ul></details>`
    : "";
  liveTurnCounter += 1;
  const turnId = `turn_${activeSessionId}_live_${liveTurnCounter}`;
  const runtimeSession = sessionRuntimeState[activeSessionId];
  const turnNumber = runtimeSession.turnIds.length + 1;
  const taskSummary = text.length > 20 ? `${text.slice(0, 20)}…` : text;
  const runId = `run_DEMO_${activeSessionId.toUpperCase()}_${String(liveTurnCounter).padStart(3, "0")}`;
  const promptId = `13000000-0000-4000-8000-${String(liveTurnCounter).padStart(12, "0")}`;
  const createdAt = new Date().toISOString();
  createRuntimeArtifact(runId, liveTurnCounter);
  turnRunFixtures[turnId] = { label: `第 ${turnNumber} 轮 · ${taskSummary}`, runIds: [runId] };
  comfyuiAsyncTaskFixtures.push({
    runId,
    promptId,
    turnId,
    instanceId: 2,
    instanceName: "win3080",
    remoteStatus: "pending",
    createdAt,
  });
  runtimeRemoteJobStates[runId] = "pending";
  runtimeSession.turnIds.push(turnId);
  runtimeSession.selectedTurnId = turnId;
  activeTurnId = turnId;
  $("#message-list").insertAdjacentHTML("beforeend", `<section class="conversation-turn is-selected" data-turn-id="${turnId}"><div class="turn-heading"><button type="button" data-select-turn="${turnId}"><span>${escapeHtml(turnRunFixtures[turnId].label)}</span><strong>正在创建 ComfyUI 运行…</strong></button></div><article class="message user-message"><div class="message-body"><div class="message-byline"><strong>你</strong><time>刚刚</time></div><p>${escapeHtml(text)}</p>${snapshot}</div></article></section>`);
  syncTurnSelection();
  updateCurrentTurnBinding(turnId);
  persistActiveConversation();
  updateSessionRunCount(activeSessionId);
  renderTaskSessionOptions();
  renderTaskTurnOptions();
  renderTaskLibrary();
  return { turnId, runId };
}

function startAgentSimulation(turnId, runId) {
  const fullText = "我已经把本次消息的不可变上下文写入会话，并准备了本次运行参数。接下来会调用 Harness Tool generate_with_comfyui 创建新的 ComfyUI 运行。";
  const turnElement = $(`[data-turn-id="${turnId}"]`);
  turnElement.insertAdjacentHTML("beforeend", `<article class="message agent-message" data-agent-turn-id="${turnId}"><div class="message-avatar">DS</div><div class="message-body"><div class="message-byline"><strong>图像生成 Agent</strong><time>正在输出</time></div><p><span class="live-agent-text"></span><span class="stream-caret" aria-label="Agent 正在流式输出"></span></p></div></article>`);
  const agentMessage = $(`[data-agent-turn-id="${turnId}"]`, turnElement);
  const textTarget = $(".live-agent-text", agentMessage);
  let cursor = 0;
  $("#current-run-list").innerHTML = queuedRunMarkup(runId);
  updateCurrentTurnBinding(turnId);
  setResultTab("current");
  $("#send-message").disabled = true;
  persistActiveConversation();
  streamTimer = window.setInterval(() => {
    cursor = Math.min(fullText.length, cursor + 2);
    textTarget.textContent = fullText.slice(0, cursor);
    $("#message-list").scrollTop = $("#message-list").scrollHeight;
    if (cursor >= fullText.length) {
      window.clearInterval(streamTimer);
      streamTimer = null;
      $(".stream-caret", agentMessage)?.remove();
      $("time", agentMessage).textContent = "刚刚";
      $(".message-body", agentMessage).insertAdjacentHTML("beforeend", `<button class="tool-call" type="button" data-focus-run="${runId}"><span class="tool-call-icon" aria-hidden="true">↳</span><span><strong>generate_with_comfyui</strong><small>运行 ${runId} 已完成</small></span><span class="tool-call-action">定位结果</span></button>`);
      $("strong", $(".turn-heading", turnElement)).textContent = "查看 1 项 ComfyUI 运行";
      runtimeRunStates[runId] = "succeeded";
      runtimeRemoteJobStates[runId] = "completed";
      if (!sessionMediaFixtures.some((item) => item.runId === runId && item.outputIndex === 0)) {
        sessionMediaFixtures.push({
          mediaId: `media_${runId}_0`,
          turnId,
          runId,
          outputIndex: 0,
          kind: "image",
          title: runArtifactFixtures[runId].title,
          mimeType: "image/svg+xml",
          detail: "832 × 1216",
          previewUrl: "./fixtures/generated-portrait.svg",
          originalUrl: "./fixtures/generated-portrait.svg",
          createdAt: new Date().toISOString(),
        });
      }
      $("#send-message").disabled = false;
      persistActiveConversation();
      renderSessionMediaTurnOptions();
      renderSessionMediaGallery();
      renderGlobalMediaGallery();
      renderSelectedTurnRuns(turnId);
      renderTaskLibrary();
      showToast("静态演示运行已完成");
    }
  }, 34);
}

function sendMessage() {
  const input = $("#message-input");
  const text = input.value.trim();
  if (streamTimer) {
    $("#composer-status").textContent = "请等待当前 Agent 流式输出完成后再发送下一条消息。";
    return;
  }
  if (!text) {
    $("#composer-status").textContent = "请输入本次任务后再发送。";
    input.focus();
    return;
  }
  if (activePrototypeState === "context-error") {
    $("#composer-box").classList.add("is-error");
    $("#composer-status").textContent = "上下文解析失败。正文和全部上下文仍保留在草稿中。";
    showToast("发送失败：一项上下文无法从数据源解析", "error");
    return;
  }
  if (activePrototypeState === "empty") {
    $("#message-list").innerHTML = "";
    sessionRuntimeState[activeSessionId].turnIds = [];
    sessionRuntimeState[activeSessionId].conversationMarkup = "";
    activePrototypeState = "success";
    $("#prototype-state").value = "success";
    const url = new URL(window.location.href);
    url.searchParams.set("state", "success");
    history.replaceState({}, "", url);
  }
  const { turnId, runId } = appendUserMessage(text);
  input.value = "";
  draftRefs.clear();
  renderContextChips();
  $("#composer-status").textContent = "Enter 发送 · Shift + Enter 换行";
  startAgentSimulation(turnId, runId);
}

function focusRun(runId) {
  renderSelectedTurnRuns(activeTurnId);
  setResultTab("current");
  setMobilePanel("results");
  window.setTimeout(() => {
    const card = $(`[data-run-id="${runId}"]`) ?? $(".run-card");
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("is-focused");
    void card.offsetWidth;
    card.classList.add("is-focused");
  }, 20);
}

function selectSession(sessionId) {
  const session = sessionInfo[sessionId];
  if (!session) return;
  if (streamTimer) {
    showToast("请等待当前 Agent 流式输出完成后再切换会话", "error");
    return;
  }
  persistActiveConversation();
  activeSessionId = sessionId;
  activeTurnId = sessionRuntimeState[sessionId].selectedTurnId ?? session.defaultTurnId;
  $$(".session-row").forEach((row) => row.classList.toggle("is-current", row.dataset.sessionId === sessionId));
  $("#conversation-title").textContent = session.title;
  setPrototypeState(session.state, { openContextError: false });
  renderSelectedTurnRuns(activeTurnId);
  sessionMediaKindFilter = "all";
  sessionMediaTurnFilter = "all";
  sessionMediaTimeFilter = "all";
  sessionMediaPage = 1;
  $("#media-filter").value = sessionMediaKindFilter;
  $("#session-time-filter").value = sessionMediaTimeFilter;
  renderSessionMediaTurnOptions();
  renderSessionMediaGallery();
  setResultTab("session");
  setMobilePanel("conversation");
}

$("#open-context").addEventListener("click", openContextDialog);
$("#open-media-library").addEventListener("click", openMediaLibrary);
$("#open-task-library").addEventListener("click", openTaskLibrary);
$("#confirm-context").addEventListener("click", confirmContextSelection);
$("#simulate-query-error").addEventListener("click", renderQueryError);

$("#resource-kind-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-kind]");
  if (!button) return;
  activeKind = button.dataset.kind;
  activeCandidateId = catalog[activeKind][0]?.id ?? null;
  contextCandidatePage = 1;
  $("#context-search").value = "";
  renderKindList();
  renderCandidates();
});

$("#candidate-list").addEventListener("click", (event) => {
  const retryButton = event.target.closest("#retry-context-query");
  if (retryButton) {
    renderCandidates();
    return;
  }
  const row = event.target.closest("[data-candidate-id]");
  if (!row) return;
  const id = row.dataset.candidateId;
  const item = (catalog[activeKind] ?? []).find((candidate) => candidate.id === id);
  if (!item) return;
  activeCandidateId = id;
  if (!draftRefs.has(id)) {
    if (pendingDialogRefs.has(id)) pendingDialogRefs.delete(id);
    else pendingDialogRefs.set(id, item);
  }
  renderCandidates();
  updateDialogSelectionSummary();
});

$("#context-search").addEventListener("input", () => {
  if (queryErrorActive) queryErrorActive = false;
  contextCandidatePage = 1;
  renderCandidates();
});

$("#base-model-filter").addEventListener("change", (event) => {
  activeBaseModelId = event.target.value;
  activeCandidateId = null;
  contextCandidatePage = 1;
  renderCandidates();
});

$("#candidate-page-previous").addEventListener("click", () => {
  if (contextCandidatePage === 1) return;
  contextCandidatePage -= 1;
  activeCandidateId = null;
  renderCandidates();
});

$("#candidate-page-next").addEventListener("click", () => {
  contextCandidatePage += 1;
  activeCandidateId = null;
  renderCandidates();
});

$("#context-chips").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const chip = event.target.closest("[data-ref-id]");
  if (!button || !chip) return;
  draftRefs.delete(chip.dataset.refId);
  renderContextChips();
});

$("#send-message").addEventListener("click", sendMessage);
$("#message-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendMessage();
  }
});

$("#session-list").addEventListener("click", (event) => {
  const row = event.target.closest("[data-session-id]");
  if (row) selectSession(row.dataset.sessionId);
});

$("#session-search").addEventListener("input", (event) => {
  const query = event.target.value.trim().toLocaleLowerCase("zh-CN");
  $$(".session-row").forEach((row) => {
    row.hidden = !row.textContent.toLocaleLowerCase("zh-CN").includes(query);
  });
});

$$('[data-result-tab]').forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.resultTab === "session") renderSessionMediaGallery();
  setResultTab(button.dataset.resultTab);
}));
$$('[data-mobile-panel]').forEach((button) => button.addEventListener("click", () => setMobilePanel(button.dataset.mobilePanel)));

$("#turn-filter").addEventListener("change", (event) => {
  sessionMediaTurnFilter = event.target.value;
  sessionMediaPage = 1;
  renderSessionMediaGallery();
});

$("#media-filter").addEventListener("change", (event) => {
  sessionMediaKindFilter = event.target.value;
  sessionMediaPage = 1;
  renderSessionMediaGallery();
});

$("#session-time-filter").addEventListener("change", (event) => {
  sessionMediaTimeFilter = event.target.value;
  sessionMediaPage = 1;
  renderSessionMediaGallery();
});

$("#media-page-previous").addEventListener("click", () => {
  sessionMediaPage -= 1;
  renderSessionMediaGallery();
});

$("#media-page-next").addEventListener("click", () => {
  sessionMediaPage += 1;
  renderSessionMediaGallery();
});

$("#library-session-filter").addEventListener("change", (event) => {
  globalMediaSessionFilter = event.target.value;
  globalMediaTurnFilter = "all";
  globalMediaPage = 1;
  renderGlobalMediaTurnOptions();
  renderGlobalMediaGallery();
});

$("#library-turn-filter").addEventListener("change", (event) => {
  globalMediaTurnFilter = event.target.value;
  globalMediaPage = 1;
  renderGlobalMediaGallery();
});

$("#library-kind-filter").addEventListener("change", (event) => {
  globalMediaKindFilter = event.target.value;
  globalMediaPage = 1;
  renderGlobalMediaGallery();
});

$("#library-time-filter").addEventListener("change", (event) => {
  globalMediaTimeFilter = event.target.value;
  globalMediaPage = 1;
  renderGlobalMediaGallery();
});

$("#library-page-previous").addEventListener("click", () => {
  globalMediaPage -= 1;
  renderGlobalMediaGallery();
});

$("#library-page-next").addEventListener("click", () => {
  globalMediaPage += 1;
  renderGlobalMediaGallery();
});

$("#media-library-dialog").addEventListener("close", () => mediaLibraryReturnFocus?.focus());
$("#media-library-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close("cancel");
});

$("#task-session-filter").addEventListener("change", (event) => {
  taskLibrarySessionFilter = event.target.value;
  taskLibraryTurnFilter = "all";
  taskLibraryPage = 1;
  renderTaskTurnOptions();
  renderTaskLibrary();
});

$("#task-turn-filter").addEventListener("change", (event) => {
  taskLibraryTurnFilter = event.target.value;
  taskLibraryPage = 1;
  renderTaskLibrary();
});

$("#task-time-filter").addEventListener("change", (event) => {
  taskLibraryTimeFilter = event.target.value;
  taskLibraryPage = 1;
  renderTaskLibrary();
});

$("#task-page-previous").addEventListener("click", () => {
  taskLibraryPage -= 1;
  renderTaskLibrary();
});

$("#task-page-next").addEventListener("click", () => {
  taskLibraryPage += 1;
  renderTaskLibrary();
});

$("#task-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-cancel-task]");
  if (button) openCancelTaskDialog(button.dataset.cancelTask, button);
});

$("#task-library-dialog").addEventListener("close", () => taskLibraryReturnFocus?.focus());
$("#task-library-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close("cancel");
});

$("#cancel-task-back").addEventListener("click", () => $("#cancel-task-dialog").close("cancel"));
$("#confirm-task-cancel").addEventListener("click", confirmTaskCancellation);
$("#cancel-task-dialog").addEventListener("close", (event) => {
  if (event.target.returnValue !== "confirmed") {
    pendingCancelRunId = null;
    cancelTaskReturnFocus?.focus();
  }
});
$("#cancel-task-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close("cancel");
});

$("#prototype-state").addEventListener("change", (event) => setPrototypeState(event.target.value));
$("#previous-state").addEventListener("click", () => cyclePrototypeState(-1));
$("#next-state").addEventListener("click", () => cyclePrototypeState(1));

document.addEventListener("click", (event) => {
  const downloadButton = event.target.closest("[data-download-workflow]");
  if (downloadButton) {
    downloadWorkflowJson(downloadButton.dataset.runId);
    return;
  }
  const turnButton = event.target.closest("[data-select-turn]");
  if (turnButton) {
    selectTurn(turnButton.dataset.selectTurn);
    return;
  }
  const toolCall = event.target.closest("[data-focus-run]");
  if (toolCall) {
    const turnElement = toolCall.closest("[data-turn-id]");
    if (turnElement) {
      activeTurnId = turnElement.dataset.turnId;
      syncTurnSelection();
    }
    focusRun(toolCall.dataset.focusRun);
    return;
  }
  const emptyAddContext = event.target.closest("[data-empty-add-context]");
  if (emptyAddContext) {
    setPrototypeState("success", { openContextError: false });
    openContextDialog();
    return;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#cancel-task-dialog").open) {
    event.preventDefault();
    $("#cancel-task-dialog").close("cancel");
    return;
  }
  if (event.key === "Escape" && $("#task-library-dialog").open) {
    event.preventDefault();
    $("#task-library-dialog").close("cancel");
    return;
  }
  if (event.key === "Escape" && $("#media-library-dialog").open) {
    event.preventDefault();
    $("#media-library-dialog").close("cancel");
    return;
  }
  if (event.key === "Escape" && $("#context-dialog").open) {
    event.preventDefault();
    $("#context-dialog").close("cancel");
    contextReturnFocus?.focus();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase("zh-CN") === "k") {
    event.preventDefault();
    $("#session-search").focus();
  }
  const tag = event.target.tagName;
  const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target.isContentEditable;
  if (!editing && event.shiftKey && event.key === "ArrowLeft") cyclePrototypeState(-1);
  if (!editing && event.shiftKey && event.key === "ArrowRight") cyclePrototypeState(1);
});

renderContextChips();
renderSessionMediaTurnOptions();
renderSessionMediaGallery();
renderGlobalMediaSessionOptions();
renderGlobalMediaTurnOptions();
renderGlobalMediaGallery();
renderTaskSessionOptions();
renderTaskTurnOptions();
renderTaskLibrary();
const initialState = new URL(window.location.href).searchParams.get("state") ?? "success";
setPrototypeState(initialState, { updateUrl: false });
