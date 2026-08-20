import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { API_WORKFLOW_FIXTURE, COMFYUI_ASYNC_TASK_FIXTURES, COMFYUI_OBSERVATION_PATH_FIXTURES, RUN_ARTIFACT_FIXTURES, RUN_STATE_FIXTURES, SESSION_MEDIA_FIXTURES, SESSION_TURN_FIXTURES, TURN_RUN_FIXTURES, UI_WORKFLOW_FIXTURE } from "../fixtures/workflow-fixtures.mjs";

const prototypeRoot = new URL("../", import.meta.url);
const [html, css, javascript] = await Promise.all([
  readFile(new URL("index.html", prototypeRoot), "utf8"),
  readFile(new URL("styles.css", prototypeRoot), "utf8"),
  readFile(new URL("app.js", prototypeRoot), "utf8"),
]);

test("the static page references only local runtime assets", () => {
  const runtimeReferences = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((reference) => !reference.startsWith("#"));
  assert.deepEqual(runtimeReferences, ["./styles.css", "./app.js"]);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(css, /@import|url\(\s*["']?https?:\/\//);
  assert.doesNotMatch(javascript, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/);
});

test("all prototype state branches have a selectable fixture", () => {
  const stateOrderMatch = javascript.match(/const stateOrder = \[([\s\S]*?)\];/);
  assert.ok(stateOrderMatch);
  const stateKeys = [...stateOrderMatch[1].matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);
  const stateSelect = html.match(/<select id="prototype-state">([\s\S]*?)<\/select>/);
  assert.ok(stateSelect);
  const optionValues = [...stateSelect[1].matchAll(/<option value="([a-z-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(optionValues, stateKeys);
  assert.equal(new Set(stateKeys).size, stateKeys.length);
});

test("the browser exposes only the importable Workflow JSON download", () => {
  assert.match(javascript, /new Blob\(/);
  assert.match(javascript, /type: "application\/json"/);
  assert.match(javascript, /comfyui-run-\$\{runId\}-workflow\.json/);
  assert.match(javascript, /structuredClone\(artifact\.uiWorkflow\)/);
  assert.doesNotMatch(javascript, /structuredClone\(artifact\.apiWorkflow\)|api-workflow|data-download-kind/);
  assert.match(javascript, /data-download-workflow/);
  assert.doesNotMatch(html + javascript, /下载本次 API Workflow JSON|提交文件/);
});

function assertUiWorkflowConnections(uiWorkflow) {
  assert.equal(uiWorkflow.version, 0.4);
  assert.equal(uiWorkflow.last_node_id, Math.max(...uiWorkflow.nodes.map((node) => node.id)));
  assert.equal(uiWorkflow.last_link_id, Math.max(...uiWorkflow.links.map((link) => link[0])));
  const nodes = new Map(uiWorkflow.nodes.map((node) => [node.id, node]));
  for (const [linkId, originNodeId, originSlot, targetNodeId, targetSlot] of uiWorkflow.links) {
    const originNode = nodes.get(originNodeId);
    const targetNode = nodes.get(targetNodeId);
    assert.ok(originNode, `link ${linkId} origin node exists`);
    assert.ok(targetNode, `link ${linkId} target node exists`);
    assert.ok(originNode.outputs[originSlot].links.includes(linkId), `link ${linkId} is present on the origin output`);
    assert.equal(targetNode.inputs[targetSlot].link, linkId, `link ${linkId} is present on the target input`);
  }
}

test("every downloadable UI Workflow fixture has complete node-link references", () => {
  assertUiWorkflowConnections(UI_WORKFLOW_FIXTURE);
  for (const artifact of Object.values(RUN_ARTIFACT_FIXTURES)) {
    assertUiWorkflowConnections(artifact.uiWorkflow);
  }
});

function assertApiWorkflowReferences(apiWorkflow) {
  const nodeIds = new Set(Object.keys(apiWorkflow));
  for (const node of Object.values(apiWorkflow)) {
    for (const value of Object.values(node.inputs)) {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string") {
        assert.ok(nodeIds.has(value[0]), `API node reference ${value[0]} exists`);
      }
    }
  }
}

test("every internally persisted API Workflow fixture references existing API nodes", () => {
  assert.equal(API_WORKFLOW_FIXTURE["7"].class_type, "SaveImage");
  assert.equal(API_WORKFLOW_FIXTURE["6"].class_type, "VAEDecode");
  assertApiWorkflowReferences(API_WORKFLOW_FIXTURE);
  for (const artifact of Object.values(RUN_ARTIFACT_FIXTURES)) {
    assertApiWorkflowReferences(artifact.apiWorkflow);
  }
});

test("each run owns matching metadata, media outputs, UI Workflow, and API Workflow", () => {
  const outputClassByMediaKind = {
    image: "SaveImage",
    video: "VHS_VideoCombine",
    audio: "SaveAudio",
  };
  for (const [runId, artifact] of Object.entries(RUN_ARTIFACT_FIXTURES)) {
    assert.equal(artifact.runId, runId);
    assert.equal(artifact.uiWorkflow.extra.harness_comfyui.run_id, runId);
    assert.ok(artifact.title);
    assert.ok(artifact.templateName);
    assert.ok(artifact.templateRevision);

    const uiNodes = new Map(artifact.uiWorkflow.nodes.map((node) => [String(node.id), node]));
    assert.deepEqual(new Set(Object.keys(artifact.apiWorkflow)), new Set(uiNodes.keys()));
    for (const [nodeId, apiNode] of Object.entries(artifact.apiWorkflow)) {
      assert.equal(apiNode.class_type, uiNodes.get(nodeId).type, `run ${runId} node ${nodeId} class matches`);
    }

    const apiClassTypes = new Set(Object.values(artifact.apiWorkflow).map((node) => node.class_type));
    for (const mediaKind of artifact.mediaKinds) {
      assert.ok(apiClassTypes.has(outputClassByMediaKind[mediaKind]), `run ${runId} has ${mediaKind} output node`);
    }

    const filenamePrefixes = Object.values(artifact.apiWorkflow)
      .map((node) => node.inputs.filename_prefix)
      .filter(Boolean);
    assert.ok(filenamePrefixes.length > 0);
    assert.ok(filenamePrefixes.every((prefix) => prefix.includes(runId)), `run ${runId} owns its output prefix`);
  }
});

test("chat turns cover zero, one, and multiple associated runs", () => {
  const associatedRunCounts = Object.values(TURN_RUN_FIXTURES).map((turn) => turn.runIds.length);
  assert.ok(associatedRunCounts.includes(0));
  assert.ok(associatedRunCounts.includes(1));
  assert.ok(associatedRunCounts.some((count) => count > 1));
  for (const turn of Object.values(TURN_RUN_FIXTURES)) {
    for (const runId of turn.runIds) {
      assert.ok(RUN_ARTIFACT_FIXTURES[runId] || RUN_STATE_FIXTURES[runId], `turn run ${runId} has a card fixture`);
    }
  }
});

test("each session run set is exactly the union of its chat-turn run sets", () => {
  assert.deepEqual(SESSION_TURN_FIXTURES.portrait, ["turn_portrait_01", "turn_portrait_02", "turn_portrait_03"]);
  for (const turnIds of Object.values(SESSION_TURN_FIXTURES)) {
    const union = [...new Set(turnIds.flatMap((turnId) => TURN_RUN_FIXTURES[turnId].runIds))];
    assert.equal(union.length, turnIds.flatMap((turnId) => TURN_RUN_FIXTURES[turnId].runIds).length);
    for (const runId of union) {
      assert.ok(RUN_ARTIFACT_FIXTURES[runId] || RUN_STATE_FIXTURES[runId]);
    }
  }
});

test("saved Session media belongs to a chat turn and links to a local original file", () => {
  const mediaIds = new Set();
  for (const media of SESSION_MEDIA_FIXTURES) {
    assert.ok(!mediaIds.has(media.mediaId), `media id ${media.mediaId} is unique`);
    mediaIds.add(media.mediaId);
    const turn = TURN_RUN_FIXTURES[media.turnId];
    assert.ok(turn, `media ${media.mediaId} has a known chat turn`);
    assert.ok(turn.runIds.includes(media.runId), `media ${media.mediaId} belongs to its run`);
    assert.ok(["image", "video", "audio"].includes(media.kind));
    assert.match(media.originalUrl, /^\.\/fixtures\//);
    assert.ok(media.title && media.mimeType && media.detail && media.createdAt);
  }
  const videoSessionMedia = SESSION_MEDIA_FIXTURES.filter((media) => media.turnId === "turn_video_01");
  assert.ok(videoSessionMedia.length > 4, "the video Session demonstrates more than one media page");
  assert.ok(videoSessionMedia.some((media) => media.originalUrl.endsWith("demo-video.mp4")));
  assert.ok(videoSessionMedia.some((media) => media.originalUrl.endsWith("demo-audio.wav")));
});

test("LoRA remains a run parameter and does not create a dedicated session type", () => {
  assert.deepEqual(SESSION_TURN_FIXTURES.comparison, ["turn_comparison_01"]);
  assert.equal(SESSION_TURN_FIXTURES.lora, undefined);
  assert.doesNotMatch(html, /data-session-id="lora"|<span class="session-title">LoRA 对比<\/span>/);
  assert.match(html, /data-session-id="comparison"/);
});

test("visible controls are implemented and chat-turn labels explain their result projection", () => {
  assert.doesNotMatch(html, /aria-label="新建会话"|aria-label="会话选项"/);
  assert.doesNotMatch(html + javascript, /data-demo-new-run|data-create-new-run|confirm-new-run/);
  assert.doesNotMatch(javascript, /<video\b|<audio\b/);
  assert.doesNotMatch(html, /<span>轮次 \d+<\/span>|<strong>\d+ 个运行<\/strong>/);
  assert.match(html, /第 3 轮 · 生成四种服装与背景变体/);
  assert.match(html, /查看 4 项 ComfyUI 运行/);
  assert.match(html, /当前结果来自/);
  assert.match(html, /id="current-turn-label"/);
  for (const turn of Object.values(TURN_RUN_FIXTURES)) {
    assert.match(turn.label, /^第 \d+ 轮 · \S/);
  }
});

test("the base model is a query filter and never a message-context reference", () => {
  assert.match(html, /<select id="base-model-filter"[^>]+aria-label="用于筛选上下文资源的底模"/);
  assert.match(html, /底模只用于筛选生成模型、LoRA、画师或画风、画师串和 Workflow 模板候选项，不会写入消息上下文/);
  assert.doesNotMatch(javascript, /\{ id: "base-model", label: "底模"/);
  assert.doesNotMatch(html + javascript, /data-ref-id="base-|移除底模|<li><span>底模<\/span>/);
  assert.match(javascript, /const initialDraftRefs = \["template-17", "character-39936"\]/);
  assert.match(javascript, /const baseModelScopedKinds = new Set\(\["model", "lora", "style", "artist-string", "comfyui-template"\]\)/);
  assert.match(javascript, /\{ id: "all", title: "全部" \}/);
  assert.match(javascript, /activeBaseModelId === "all"/);
  assert.match(javascript, /item\.baseModelId === activeBaseModelId/);
  assert.match(javascript, /\$\("#base-model-filter"\)\.addEventListener\("change"/);
});

test("Tool execution details remain owned by the DeepSeek Harness trace", () => {
  assert.doesNotMatch(html, /tab-tool|panel-tool|所选 Tool 调用|HARNESS TOOL|tool-result-json/);
  assert.doesNotMatch(javascript, /toolCallIdForRun|clearToolDetail|updateToolDetail|copy-tool-result|tool-result-json/);
  assert.match(html, />当前轮次结果<\/button>/);
  assert.match(html, />本会话结果<\/button>/);
});

test("Session results use fixed media cards with turn filters and independent pagination", () => {
  assert.match(javascript, /视频结果静态预览/);
  assert.match(javascript, /audio\/wav · 原型不提供播放交互/);
  assert.match(html, /id="turn-filter"/);
  assert.match(html, /id="media-filter"/);
  assert.match(html, /id="session-time-filter"/);
  assert.match(html, /id="session-media-grid"/);
  assert.match(html, /id="media-page-previous"/);
  assert.match(html, /id="media-page-next"/);
  assert.match(javascript, /const SESSION_MEDIA_PAGE_SIZE = 4/);
  assert.match(javascript, /item\.turnId === sessionMediaTurnFilter/);
  assert.match(javascript, /item\.kind === sessionMediaKindFilter/);
  assert.match(javascript, /matchesMediaTime\(item, sessionMediaTimeFilter\)/);
  assert.match(javascript, /filteredItems\.slice\(pageStart, pageStart \+ SESSION_MEDIA_PAGE_SIZE\)/);
  assert.match(javascript, /target="_blank" rel="noopener noreferrer"/);
  assert.match(javascript, /href="\$\{escapeHtml\(item\.originalUrl\)\}"/);
  assert.match(javascript, /session-media-card-actions[\s\S]*?data-download-workflow data-artifact-scope="\$\{escapeHtml\(libraryScope\)\}" data-run-id="\$\{escapeHtml\(item\.runId\)\}"/);
  assert.match(javascript, />下载本次 Workflow JSON（可导入 ComfyUI）<\/span>/);
  assert.match(javascript, /sessionMediaCardMarkup\(item, "session"\)/);
  assert.match(javascript, /当前生效条件：会话 =/);
  assert.match(javascript, /获得 generate_with_comfyui Tool 权限的普通 Skill/);
  assert.doesNotMatch(javascript, /媒体生成 Skill/);
  assert.doesNotMatch(javascript, /function renderSessionRuns/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.session-media-preview \{[\s\S]*?height: 118px/);
});

test("the left-side all-media entry opens a centered cross-Session media library", () => {
  assert.match(html, /id="open-media-library"/);
  assert.match(html, /id="media-library-dialog"/);
  assert.match(html, /id="library-session-filter"/);
  assert.match(html, /id="library-turn-filter"/);
  assert.match(html, /id="library-kind-filter"/);
  assert.match(html, /id="library-time-filter"/);
  assert.match(html, /id="library-page-previous"/);
  assert.match(html, /id="library-page-next"/);
  assert.match(javascript, /const GLOBAL_MEDIA_PAGE_SIZE = 8/);
  assert.match(javascript, /sessionId === globalMediaSessionFilter/);
  assert.match(javascript, /item\.turnId === globalMediaTurnFilter/);
  assert.match(javascript, /item\.kind === globalMediaKindFilter/);
  assert.match(javascript, /matchesMediaTime\(item, globalMediaTimeFilter\)/);
  assert.match(javascript, /sessionMediaCardMarkup\(item, "workspace"\)/);
  assert.match(javascript, /data-artifact-scope/);
  assert.match(javascript, /dialog\.showModal\(\)/);
  assert.match(css, /\.media-library-dialog \{[\s\S]*?width: min\(1180px, calc\(100vw - 48px\)\)/);
  assert.match(css, /\.global-media-grid \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});

test("every visible ComfyUI async task belongs to exactly one Session chat turn", () => {
  const visibleRunIds = Object.values(SESSION_TURN_FIXTURES)
    .flatMap((turnIds) => turnIds)
    .flatMap((turnId) => TURN_RUN_FIXTURES[turnId].runIds);
  assert.deepEqual(new Set(COMFYUI_ASYNC_TASK_FIXTURES.map((task) => task.runId)), new Set(visibleRunIds));
  assert.ok(COMFYUI_ASYNC_TASK_FIXTURES.length > 5, "the global task list demonstrates pagination");
  for (const task of COMFYUI_ASYNC_TASK_FIXTURES) {
    assert.ok(TURN_RUN_FIXTURES[task.turnId].runIds.includes(task.runId));
    if (RUN_STATE_FIXTURES[task.runId]?.state === "submission_unknown") {
      assert.equal(task.promptId, null);
      assert.equal(task.remoteStatus, null);
    } else {
      assert.match(task.promptId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.ok(["pending", "in_progress", "completed", "failed"].includes(task.remoteStatus));
    }
    assert.ok([1, 2].includes(task.instanceId));
    assert.ok(task.createdAt);
  }
});

test("submission timeout and Jobs API 404 paths have one repository outcome each", () => {
  assert.deepEqual(COMFYUI_OBSERVATION_PATH_FIXTURES.promptTimeoutWithoutId, {
    repositoryState: "submission_unknown",
    remoteObservation: "prompt_response_unconfirmed",
    promptId: null,
    errorCode: "COMFYUI_SUBMISSION_RESULT_UNKNOWN",
    cancellable: false,
    automaticallyResubmit: false,
  });
  assert.deepEqual(COMFYUI_OBSERVATION_PATH_FIXTURES.firstJob404BeforeDeadline, {
    repositoryState: "remote_pending",
    remoteObservation: "job_not_found_before_deadline",
    promptId: "14000000-0000-4000-8000-000000000001",
    errorCode: null,
    cancellable: true,
    automaticallyResubmit: false,
  });
  assert.deepEqual(COMFYUI_OBSERVATION_PATH_FIXTURES.repeatedJob404AfterDeadline, {
    repositoryState: "failed",
    remoteObservation: "job_not_found_after_deadline",
    promptId: "14000000-0000-4000-8000-000000000002",
    errorCode: "COMFYUI_JOB_MISSING",
    cancellable: false,
    automaticallyResubmit: false,
  });
});

test("the left-side task entry opens a filtered and paginated ComfyUI async task list", () => {
  assert.match(html, /id="open-task-library"/);
  assert.match(html, /id="task-library-dialog"/);
  assert.match(html, /id="task-session-filter"/);
  assert.match(html, /id="task-turn-filter"/);
  assert.match(html, /id="task-time-filter"/);
  assert.match(html, /id="task-page-previous"/);
  assert.match(html, /id="task-page-next"/);
  assert.match(javascript, /const GLOBAL_TASK_PAGE_SIZE = 5/);
  assert.match(javascript, /sessionId === taskLibrarySessionFilter/);
  assert.match(javascript, /task\.turnId === taskLibraryTurnFilter/);
  assert.match(javascript, /matchesMediaTime\(task, taskLibraryTimeFilter\)/);
  assert.match(javascript, /filteredTasks\.slice\(pageStart, pageStart \+ GLOBAL_TASK_PAGE_SIZE\)/);
  assert.match(javascript, /Date\.parse\(right\.createdAt\) - Date\.parse\(left\.createdAt\)/);
  assert.match(javascript, /ComfyUI Job 原始状态：<code>\$\{escapeHtml\(remoteStatus\)\}<\/code>/);
  assert.match(javascript, /ComfyUI Job：尚无可查询的 prompt_id/);
  assert.match(javascript, /prompt_id=未确认/);
  assert.match(javascript, /<small>本仓库状态<\/small>/);
  assert.match(css, /\.task-table-header,\s*\.task-row \{[\s\S]*?grid-template-columns:/);
});

test("queued and running ComfyUI Jobs use the prompt-scoped idempotent cancel endpoint", () => {
  assert.match(html, /POST \/api\/jobs\/\{prompt_id\}\/cancel/);
  assert.match(javascript, />取消排队任务<\/button>/);
  assert.match(javascript, />取消运行中任务<\/button>/);
  assert.match(javascript, /\["queued", "running"\]\.includes\(state\)/);
  assert.match(javascript, /runtimeRunStates\[runId\] = "cancelling"/);
  assert.match(javascript, /runtimeRunStates\[runId\] = "cancelled"/);
  assert.match(javascript, /runtimeRemoteJobStates\[runId\] = "cancelled"/);
  assert.match(javascript, /按 prompt_id 原子中断这个正在执行的任务，不会中断同一实例中的其他任务/);
  assert.match(javascript, /state === "downloading"[\s\S]*?远端已完成，正在保存媒体/);
  assert.match(javascript, /state === "submission_unknown"[\s\S]*?本仓库没有可查询的 prompt_id；不能查询或取消 ComfyUI Job/);
  assert.match(javascript, /state === "succeeded"[\s\S]*?ComfyUI Job 已完成；取消请求是 no-op/);
  assert.match(javascript, /state === "failed"[\s\S]*?ComfyUI Job 已失败，不能取消/);
  assert.match(javascript, /state === "cancelled"[\s\S]*?ComfyUI Job 已取消，无需再次取消/);
  assert.doesNotMatch(html + javascript, /POST \/interrupt|POST \/queue|prompt-scoped-interrupt|实例能力/);
});

test("the audited interface labels inputs, exposes a skip target, and reserves media dimensions", () => {
  assert.match(html, /<a class="skip-link" href="#main-workbench">跳到生成工作区<\/a>/);
  assert.match(html, /<main class="workbench-grid" id="main-workbench"/);
  assert.match(html, /<textarea id="message-input" name="message"[^>]+aria-label="本次发送给图像生成 Agent 的消息"/);
  assert.match(html, /<input id="session-search" name="session-search"[^>]+aria-label="搜索会话"/);
  assert.match(javascript, /width="832" height="1216" loading="lazy"/);
  assert.match(css, /overscroll-behavior: contain/);
});

test("the default conversation turn exposes queued, running, media-saving, and submission-unknown runs", () => {
  const expectedStates = ["queued", "running", "downloading", "submission_unknown"];
  const runIds = TURN_RUN_FIXTURES.turn_portrait_03.runIds;
  assert.deepEqual(runIds.map((runId) => RUN_STATE_FIXTURES[runId].state), expectedStates);
  assert.match(html, /data-turn-id="turn_portrait_03"/);
  assert.match(html, /data-focus-run="run_01J8RUNNING"/);
  assert.match(html, /<option value="success">当前轮次：混合运行状态<\/option>/);
  assert.match(javascript, /requestAnimationFrame\(scrollSelectedTurnIntoView\)/);
  for (const state of expectedStates) assert.match(javascript, new RegExp(`runtimeRunStates\\[runId\\] === "${state}"`));
});

test("new chat turns receive scoped Agent elements and unique runtime run ids", () => {
  assert.match(javascript, /run_DEMO_\$\{activeSessionId\.toUpperCase\(\)\}_\$\{String\(liveTurnCounter\)/);
  assert.match(javascript, /const promptId = `13000000-0000-4000-8000-\$\{String\(liveTurnCounter\)\.padStart\(12, "0"\)\}`/);
  assert.match(javascript, /comfyuiAsyncTaskFixtures\.push\(\{[\s\S]*?runId,[\s\S]*?promptId,[\s\S]*?turnId,[\s\S]*?remoteStatus: "pending"/);
  assert.match(javascript, /runtimeRemoteJobStates\[runId\] = "pending"/);
  assert.match(javascript, /runtimeRemoteJobStates\[runId\] = "completed"/);
  assert.match(javascript, /renderTaskSessionOptions\(\);[\s\S]*?renderTaskTurnOptions\(\);[\s\S]*?renderTaskLibrary\(\)/);
  assert.match(javascript, /data-agent-turn-id=/);
  assert.match(javascript, /\$\("\.live-agent-text", agentMessage\)/);
  assert.doesNotMatch(javascript, /id="live-agent-(?:message|text)"/);
});

test("run cards describe Jobs API observations instead of legacy history polling", () => {
  assert.match(javascript, /继续查询该 <code>prompt_id<\/code> 的 ComfyUI Job 状态/);
  assert.match(javascript, /ComfyUI Job 详情显示 KSampler 节点执行失败/);
  assert.doesNotMatch(html + javascript, /查询远端历史状态|ComfyUI 历史记录显示|ComfyUI history/);
});

test("the project layer does not implement the DeepSeek Harness native Skill chooser", () => {
  assert.doesNotMatch(html, /skill-trigger|skill-menu|data-skill|选择 Skill|预选 Skill/);
  assert.doesNotMatch(javascript, /selectedSkill|skill-trigger|skill-menu|data-skill/);
});

test("run focus restores the selected turn projection before highlighting a card", () => {
  const focusRunBody = javascript.match(/function focusRun\(runId\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(focusRunBody, /renderSelectedTurnRuns\(activeTurnId\)/);
  assert.match(focusRunBody, /data-run-id/);
});

test("a native modal dialog backs the context picker", () => {
  assert.match(html, /<dialog class="context-dialog" id="context-dialog"/);
  assert.match(javascript, /dialog\.showModal\(\)/);
  assert.doesNotMatch(html + javascript, /risk-dialog/);
});

test("message-context candidates use fixed three-column cards with covers and pagination", () => {
  assert.match(html, /id="candidate-list"[^>]+aria-label="上下文资源候选卡片"/);
  assert.match(html, /id="candidate-page-previous"/);
  assert.match(html, /id="candidate-page-status"/);
  assert.match(html, /id="candidate-page-next"/);
  assert.match(css, /grid-template-columns: repeat\(3, 150px\)/);
  assert.match(css, /grid-auto-rows: 160px/);
  assert.match(css, /\.candidate-card[\s\S]*?height: 160px;[\s\S]*?width: 150px;/);
  assert.match(javascript, /const CONTEXT_CANDIDATE_PAGE_SIZE = 6/);
  assert.match(javascript, /candidates\.slice\(pageStart, pageStart \+ CONTEXT_CANDIDATE_PAGE_SIZE\)/);
  assert.match(javascript, /item\.coverUrl[\s\S]*?candidate-cover-image/);
  assert.match(javascript, /candidate-cover-placeholder[\s\S]*?暂无封面/);
  assert.match(javascript, /\.\/fixtures\/generated-portrait\.svg/);
  assert.ok((javascript.match(/id: "template-/g) ?? []).length > 6, "the default Workflow Template kind spans multiple pages");
});
