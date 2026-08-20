export const UI_WORKFLOW_FIXTURE = {
  last_node_id: 7,
  last_link_id: 9,
  nodes: [
    {
      id: 1,
      type: "CheckpointLoaderSimple",
      pos: [48, 190],
      size: [318, 98],
      flags: {},
      order: 0,
      mode: 0,
      inputs: [],
      outputs: [
        { name: "MODEL", type: "MODEL", links: [1] },
        { name: "CLIP", type: "CLIP", links: [2, 3] },
        { name: "VAE", type: "VAE", links: [8] },
      ],
      properties: { "Node name for S&R": "CheckpointLoaderSimple" },
      widgets_values: ["anima_pencilXL_v11.safetensors"],
    },
    {
      id: 2,
      type: "CLIPTextEncode",
      pos: [420, 28],
      size: [420, 164],
      flags: {},
      order: 1,
      mode: 0,
      inputs: [{ name: "clip", type: "CLIP", link: 2 }],
      outputs: [{ name: "CONDITIONING", type: "CONDITIONING", links: [4] }],
      properties: { "Node name for S&R": "CLIPTextEncode" },
      widgets_values: ["silver short hair, blue-gray eyes, quiet interior, half-body portrait"],
    },
    {
      id: 3,
      type: "CLIPTextEncode",
      pos: [420, 220],
      size: [420, 164],
      flags: {},
      order: 2,
      mode: 0,
      inputs: [{ name: "clip", type: "CLIP", link: 3 }],
      outputs: [{ name: "CONDITIONING", type: "CONDITIONING", links: [5] }],
      properties: { "Node name for S&R": "CLIPTextEncode" },
      widgets_values: ["low quality, distorted hands, duplicate subject"],
    },
    {
      id: 4,
      type: "EmptyLatentImage",
      pos: [500, 430],
      size: [315, 106],
      flags: {},
      order: 3,
      mode: 0,
      inputs: [],
      outputs: [{ name: "LATENT", type: "LATENT", links: [6] }],
      properties: { "Node name for S&R": "EmptyLatentImage" },
      widgets_values: [832, 1216, 1],
    },
    {
      id: 5,
      type: "KSampler",
      pos: [905, 135],
      size: [315, 262],
      flags: {},
      order: 4,
      mode: 0,
      inputs: [
        { name: "model", type: "MODEL", link: 1 },
        { name: "positive", type: "CONDITIONING", link: 4 },
        { name: "negative", type: "CONDITIONING", link: 5 },
        { name: "latent_image", type: "LATENT", link: 6 },
      ],
      outputs: [{ name: "LATENT", type: "LATENT", links: [7] }],
      properties: { "Node name for S&R": "KSampler" },
      widgets_values: [921783418, "fixed", 28, 5.5, "euler_ancestral", "normal", 1],
    },
    {
      id: 6,
      type: "VAEDecode",
      pos: [1260, 155],
      size: [210, 46],
      flags: {},
      order: 5,
      mode: 0,
      inputs: [
        { name: "samples", type: "LATENT", link: 7 },
        { name: "vae", type: "VAE", link: 8 },
      ],
      outputs: [{ name: "IMAGE", type: "IMAGE", links: [9] }],
      properties: { "Node name for S&R": "VAEDecode" },
    },
    {
      id: 7,
      type: "SaveImage",
      pos: [1535, 125],
      size: [260, 270],
      flags: {},
      order: 6,
      mode: 0,
      inputs: [{ name: "images", type: "IMAGE", link: 9 }],
      outputs: [],
      properties: { "Node name for S&R": "SaveImage" },
      widgets_values: ["harness-comfyui/portrait"],
    },
  ],
  links: [
    [1, 1, 0, 5, 0, "MODEL"],
    [2, 1, 1, 2, 0, "CLIP"],
    [3, 1, 1, 3, 0, "CLIP"],
    [4, 2, 0, 5, 1, "CONDITIONING"],
    [5, 3, 0, 5, 2, "CONDITIONING"],
    [6, 4, 0, 5, 3, "LATENT"],
    [7, 5, 0, 6, 0, "LATENT"],
    [8, 1, 2, 6, 1, "VAE"],
    [9, 6, 0, 7, 0, "IMAGE"],
  ],
  groups: [],
  config: {},
  extra: { ds: { scale: 0.82, offset: [54, 82] } },
  version: 0.4,
};

export const API_WORKFLOW_FIXTURE = {
  "1": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "anima_pencilXL_v11.safetensors" },
  },
  "2": {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["1", 1],
      text: "silver short hair, blue-gray eyes, quiet interior, half-body portrait",
    },
  },
  "3": {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["1", 1],
      text: "low quality, distorted hands, duplicate subject",
    },
  },
  "4": {
    class_type: "EmptyLatentImage",
    inputs: { width: 832, height: 1216, batch_size: 1 },
  },
  "5": {
    class_type: "KSampler",
    inputs: {
      model: ["1", 0],
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["4", 0],
      seed: 921783418,
      steps: 28,
      cfg: 5.5,
      sampler_name: "euler_ancestral",
      scheduler: "normal",
      denoise: 1,
    },
  },
  "6": {
    class_type: "VAEDecode",
    inputs: { samples: ["5", 0], vae: ["1", 2] },
  },
  "7": {
    class_type: "SaveImage",
    inputs: { filename_prefix: "harness-comfyui/portrait", images: ["6", 0] },
  },
};

function clone(value) {
  return structuredClone(value);
}

function withRunIdentity(uiWorkflow, apiWorkflow, runId, outputNodeIds) {
  const prefix = `harness-comfyui/${runId}`;
  uiWorkflow.extra = {
    ...uiWorkflow.extra,
    harness_comfyui: { run_id: runId },
  };
  for (const nodeId of outputNodeIds) {
    const uiNode = uiWorkflow.nodes.find((node) => node.id === nodeId);
    if (uiNode?.widgets_values?.length) uiNode.widgets_values[0] = prefix;
    const apiNode = apiWorkflow[String(nodeId)];
    if (apiNode?.inputs && "filename_prefix" in apiNode.inputs) apiNode.inputs.filename_prefix = prefix;
  }
  return { uiWorkflow, apiWorkflow };
}

function imageWorkflow(runId) {
  return withRunIdentity(clone(UI_WORKFLOW_FIXTURE), clone(API_WORKFLOW_FIXTURE), runId, [7]);
}

function videoWorkflow(runId) {
  const uiWorkflow = clone(UI_WORKFLOW_FIXTURE);
  const apiWorkflow = clone(API_WORKFLOW_FIXTURE);
  const outputNode = uiWorkflow.nodes.find((node) => node.id === 7);
  outputNode.type = "VHS_VideoCombine";
  outputNode.properties = { "Node name for S&R": "VHS_VideoCombine" };
  outputNode.widgets_values = [`harness-comfyui/${runId}`, 24, 0, "video/h264-mp4", "yuv420p", 19];
  apiWorkflow["7"] = {
    class_type: "VHS_VideoCombine",
    inputs: {
      images: ["6", 0],
      filename_prefix: `harness-comfyui/${runId}`,
      frame_rate: 24,
      loop_count: 0,
      format: "video/h264-mp4",
      pix_fmt: "yuv420p",
      crf: 19,
    },
  };
  return withRunIdentity(uiWorkflow, apiWorkflow, runId, [7]);
}

function audioWorkflow(runId) {
  const uiWorkflow = {
    last_node_id: 2,
    last_link_id: 1,
    nodes: [
      {
        id: 1,
        type: "EmptyAudio",
        pos: [80, 120],
        size: [290, 110],
        flags: {},
        order: 0,
        mode: 0,
        inputs: [],
        outputs: [{ name: "AUDIO", type: "AUDIO", links: [1] }],
        properties: { "Node name for S&R": "EmptyAudio" },
        widgets_values: [4, 44100, 2],
      },
      {
        id: 2,
        type: "SaveAudio",
        pos: [470, 120],
        size: [280, 120],
        flags: {},
        order: 1,
        mode: 0,
        inputs: [{ name: "audio", type: "AUDIO", link: 1 }],
        outputs: [],
        properties: { "Node name for S&R": "SaveAudio" },
        widgets_values: [`harness-comfyui/${runId}`, "wav"],
      },
    ],
    links: [[1, 1, 0, 2, 0, "AUDIO"]],
    groups: [],
    config: {},
    extra: { ds: { scale: 1, offset: [80, 80] } },
    version: 0.4,
  };
  const apiWorkflow = {
    "1": { class_type: "EmptyAudio", inputs: { duration: 4, sample_rate: 44100, channels: 2 } },
    "2": { class_type: "SaveAudio", inputs: { audio: ["1", 0], filename_prefix: `harness-comfyui/${runId}`, format: "wav" } },
  };
  return withRunIdentity(uiWorkflow, apiWorkflow, runId, [2]);
}

function multimediaWorkflow(runId) {
  const uiWorkflow = clone(UI_WORKFLOW_FIXTURE);
  const apiWorkflow = clone(API_WORKFLOW_FIXTURE);
  const decodedImages = uiWorkflow.nodes.find((node) => node.id === 6);
  decodedImages.outputs[0].links = [9, 10];
  uiWorkflow.nodes.push(
    {
      id: 8,
      type: "VHS_VideoCombine",
      pos: [1535, 430],
      size: [300, 170],
      flags: {},
      order: 7,
      mode: 0,
      inputs: [{ name: "images", type: "IMAGE", link: 10 }],
      outputs: [],
      properties: { "Node name for S&R": "VHS_VideoCombine" },
      widgets_values: [`harness-comfyui/${runId}`, 24, 0, "video/h264-mp4", "yuv420p", 19],
    },
    {
      id: 9,
      type: "EmptyAudio",
      pos: [905, 500],
      size: [280, 110],
      flags: {},
      order: 8,
      mode: 0,
      inputs: [],
      outputs: [{ name: "AUDIO", type: "AUDIO", links: [11] }],
      properties: { "Node name for S&R": "EmptyAudio" },
      widgets_values: [4, 44100, 2],
    },
    {
      id: 10,
      type: "SaveAudio",
      pos: [1260, 500],
      size: [280, 120],
      flags: {},
      order: 9,
      mode: 0,
      inputs: [{ name: "audio", type: "AUDIO", link: 11 }],
      outputs: [],
      properties: { "Node name for S&R": "SaveAudio" },
      widgets_values: [`harness-comfyui/${runId}`, "wav"],
    },
  );
  uiWorkflow.links.push(
    [10, 6, 0, 8, 0, "IMAGE"],
    [11, 9, 0, 10, 0, "AUDIO"],
  );
  uiWorkflow.last_node_id = 10;
  uiWorkflow.last_link_id = 11;
  apiWorkflow["8"] = {
    class_type: "VHS_VideoCombine",
    inputs: { images: ["6", 0], filename_prefix: `harness-comfyui/${runId}`, frame_rate: 24, loop_count: 0, format: "video/h264-mp4", pix_fmt: "yuv420p", crf: 19 },
  };
  apiWorkflow["9"] = { class_type: "EmptyAudio", inputs: { duration: 4, sample_rate: 44100, channels: 2 } };
  apiWorkflow["10"] = { class_type: "SaveAudio", inputs: { audio: ["9", 0], filename_prefix: `harness-comfyui/${runId}`, format: "wav" } };
  return withRunIdentity(uiWorkflow, apiWorkflow, runId, [7, 8, 10]);
}

function loraWorkflow(runId) {
  const uiWorkflow = clone(UI_WORKFLOW_FIXTURE);
  const apiWorkflow = clone(API_WORKFLOW_FIXTURE);
  const checkpoint = uiWorkflow.nodes.find((node) => node.id === 1);
  checkpoint.outputs[0].links = [10];
  checkpoint.outputs[1].links = [11];
  uiWorkflow.nodes.push({
    id: 8,
    type: "LoraLoader",
    pos: [400, 580],
    size: [320, 126],
    flags: {},
    order: 7,
    mode: 0,
    inputs: [
      { name: "model", type: "MODEL", link: 10 },
      { name: "clip", type: "CLIP", link: 11 },
    ],
    outputs: [
      { name: "MODEL", type: "MODEL", links: [1] },
      { name: "CLIP", type: "CLIP", links: [2, 3] },
    ],
    properties: { "Node name for S&R": "LoraLoader" },
    widgets_values: ["fine_line_control.safetensors", 0.65, 0.65],
  });
  uiWorkflow.links[0] = [1, 8, 0, 5, 0, "MODEL"];
  uiWorkflow.links[1] = [2, 8, 1, 2, 0, "CLIP"];
  uiWorkflow.links[2] = [3, 8, 1, 3, 0, "CLIP"];
  uiWorkflow.links.push(
    [10, 1, 0, 8, 0, "MODEL"],
    [11, 1, 1, 8, 1, "CLIP"],
  );
  uiWorkflow.last_node_id = 8;
  uiWorkflow.last_link_id = 11;
  apiWorkflow["2"].inputs.clip = ["8", 1];
  apiWorkflow["3"].inputs.clip = ["8", 1];
  apiWorkflow["5"].inputs.model = ["8", 0];
  apiWorkflow["8"] = {
    class_type: "LoraLoader",
    inputs: { model: ["1", 0], clip: ["1", 1], lora_name: "fine_line_control.safetensors", strength_model: 0.65, strength_clip: 0.65 },
  };
  return withRunIdentity(uiWorkflow, apiWorkflow, runId, [7]);
}

function artifact({ runId, title, templateName, templateRevision, mediaKinds, workflows }) {
  return Object.freeze({
    runId,
    title,
    templateName,
    templateRevision,
    instanceName: "绘图节点 · East GPU",
    mediaKinds: Object.freeze(mediaKinds),
    uiWorkflow: workflows.uiWorkflow,
    apiWorkflow: workflows.apiWorkflow,
  });
}

export const RUN_ARTIFACT_FIXTURES = Object.freeze({
  run_01J8M7H4Q9: artifact({
    runId: "run_01J8M7H4Q9",
    title: "银发调查员 · 半身像",
    templateName: "Anima 角色半身像",
    templateRevision: "17",
    mediaKinds: ["image"],
    workflows: imageWorkflow("run_01J8M7H4Q9"),
  }),
  run_01J8VIDEO42: artifact({
    runId: "run_01J8VIDEO42",
    title: "角色镜头运动",
    templateName: "Anima 角色短视频",
    templateRevision: "8",
    mediaKinds: ["video"],
    workflows: videoWorkflow("run_01J8VIDEO42"),
  }),
  run_01J8AUDIO13: artifact({
    runId: "run_01J8AUDIO13",
    title: "室内环境音",
    templateName: "环境音频输出",
    templateRevision: "3",
    mediaKinds: ["audio"],
    workflows: audioWorkflow("run_01J8AUDIO13"),
  }),
  run_01J8MEDIA03: artifact({
    runId: "run_01J8MEDIA03",
    title: "多媒体角色场景",
    templateName: "Anima 角色多媒体",
    templateRevision: "5",
    mediaKinds: ["image", "video", "audio"],
    workflows: multimediaWorkflow("run_01J8MEDIA03"),
  }),
  run_01J8LORA001: artifact({
    runId: "run_01J8LORA001",
    title: "Fine line control · 0.65",
    templateName: "Anima LoRA 对比",
    templateRevision: "6",
    mediaKinds: ["image"],
    workflows: loraWorkflow("run_01J8LORA001"),
  }),
});

export const RUN_STATE_FIXTURES = Object.freeze({
  run_01J8QUEUE42: Object.freeze({
    runId: "run_01J8QUEUE42",
    state: "queued",
    title: "服装变体 · 暖色背景",
    templateName: "Anima 角色半身像",
    templateRevision: "17",
    instanceName: "绘图节点 · East GPU",
  }),
  run_01J8RUNNING: Object.freeze({
    runId: "run_01J8RUNNING",
    state: "running",
    title: "服装变体 · 夜间室内",
    templateName: "Anima 角色半身像",
    templateRevision: "17",
    instanceName: "绘图节点 · East GPU",
  }),
  run_01J8SAVE003: Object.freeze({
    runId: "run_01J8SAVE003",
    state: "downloading",
    title: "服装变体 · 档案室",
    templateName: "Anima 角色半身像",
    templateRevision: "17",
    instanceName: "绘图节点 · East GPU",
  }),
  run_01J8UNKNOWN: Object.freeze({
    runId: "run_01J8UNKNOWN",
    state: "submission_unknown",
    title: "服装变体 · 逆光走廊",
    templateName: "Anima 角色半身像",
    templateRevision: "17",
    instanceName: "绘图节点 · East GPU",
  }),
  run_01J8FAILED7: Object.freeze({
    runId: "run_01J8FAILED7",
    state: "failed",
    title: "Quiet interior light · 0.50",
    templateName: "Anima LoRA 对比",
    templateRevision: "6",
    instanceName: "绘图节点 · East GPU",
  }),
});

export const TURN_RUN_FIXTURES = Object.freeze({
  turn_portrait_01: Object.freeze({ label: "第 1 轮 · 生成角色半身像", runIds: Object.freeze(["run_01J8M7H4Q9"]) }),
  turn_portrait_02: Object.freeze({ label: "第 2 轮 · 解释背景变化", runIds: Object.freeze([]) }),
  turn_portrait_03: Object.freeze({
    label: "第 3 轮 · 生成四种服装与背景变体",
    runIds: Object.freeze(["run_01J8QUEUE42", "run_01J8RUNNING", "run_01J8SAVE003", "run_01J8UNKNOWN"]),
  }),
  turn_video_01: Object.freeze({ label: "第 1 轮 · 生成 4 秒角色镜头", runIds: Object.freeze(["run_01J8MEDIA03"]) }),
  turn_comparison_01: Object.freeze({ label: "第 1 轮 · 对比两组画风参数", runIds: Object.freeze(["run_01J8LORA001", "run_01J8FAILED7"]) }),
});

export const SESSION_TURN_FIXTURES = Object.freeze({
  portrait: Object.freeze(["turn_portrait_01", "turn_portrait_02", "turn_portrait_03"]),
  video: Object.freeze(["turn_video_01"]),
  comparison: Object.freeze(["turn_comparison_01"]),
});

export const COMFYUI_ASYNC_TASK_FIXTURES = Object.freeze([
  Object.freeze({ runId: "run_01J8UNKNOWN", promptId: null, turnId: "turn_portrait_03", instanceId: 2, instanceName: "win3080", remoteStatus: null, createdAt: "2026-08-20T14:41:00+08:00" }),
  Object.freeze({ runId: "run_01J8SAVE003", promptId: "12000000-0000-4000-8000-000000000007", turnId: "turn_portrait_03", instanceId: 2, instanceName: "win3080", remoteStatus: "completed", createdAt: "2026-08-20T14:40:00+08:00" }),
  Object.freeze({ runId: "run_01J8RUNNING", promptId: "12000000-0000-4000-8000-000000000006", turnId: "turn_portrait_03", instanceId: 2, instanceName: "win3080", remoteStatus: "in_progress", createdAt: "2026-08-20T14:39:00+08:00" }),
  Object.freeze({ runId: "run_01J8QUEUE42", promptId: "12000000-0000-4000-8000-000000000005", turnId: "turn_portrait_03", instanceId: 2, instanceName: "win3080", remoteStatus: "pending", createdAt: "2026-08-20T14:38:00+08:00" }),
  Object.freeze({ runId: "run_01J8M7H4Q9", promptId: "12000000-0000-4000-8000-000000000004", turnId: "turn_portrait_01", instanceId: 2, instanceName: "win3080", remoteStatus: "completed", createdAt: "2026-08-20T14:30:00+08:00" }),
  Object.freeze({ runId: "run_01J8MEDIA03", promptId: "12000000-0000-4000-8000-000000000003", turnId: "turn_video_01", instanceId: 1, instanceName: "mac mini", remoteStatus: "completed", createdAt: "2026-08-20T11:06:00+08:00" }),
  Object.freeze({ runId: "run_01J8FAILED7", promptId: "12000000-0000-4000-8000-000000000002", turnId: "turn_comparison_01", instanceId: 2, instanceName: "win3080", remoteStatus: "failed", createdAt: "2026-08-19T20:11:00+08:00" }),
  Object.freeze({ runId: "run_01J8LORA001", promptId: "12000000-0000-4000-8000-000000000001", turnId: "turn_comparison_01", instanceId: 2, instanceName: "win3080", remoteStatus: "completed", createdAt: "2026-08-19T20:10:00+08:00" }),
]);

export const COMFYUI_OBSERVATION_PATH_FIXTURES = Object.freeze({
  promptTimeoutWithoutId: Object.freeze({
    repositoryState: "submission_unknown",
    remoteObservation: "prompt_response_unconfirmed",
    promptId: null,
    errorCode: "COMFYUI_SUBMISSION_RESULT_UNKNOWN",
    cancellable: false,
    automaticallyResubmit: false,
  }),
  firstJob404BeforeDeadline: Object.freeze({
    repositoryState: "remote_pending",
    remoteObservation: "job_not_found_before_deadline",
    promptId: "14000000-0000-4000-8000-000000000001",
    errorCode: null,
    cancellable: true,
    automaticallyResubmit: false,
  }),
  repeatedJob404AfterDeadline: Object.freeze({
    repositoryState: "failed",
    remoteObservation: "job_not_found_after_deadline",
    promptId: "14000000-0000-4000-8000-000000000002",
    errorCode: "COMFYUI_JOB_MISSING",
    cancellable: false,
    automaticallyResubmit: false,
  }),
});

export const SESSION_MEDIA_FIXTURES = Object.freeze([
  Object.freeze({ mediaId: "media_portrait_01", turnId: "turn_portrait_01", runId: "run_01J8M7H4Q9", outputIndex: 0, kind: "image", title: "银发调查员 · 半身像", mimeType: "image/svg+xml", detail: "832 × 1216", previewUrl: "./fixtures/generated-portrait.svg", originalUrl: "./fixtures/generated-portrait.svg", createdAt: "2026-08-20T14:32:00+08:00" }),
  Object.freeze({ mediaId: "media_video_keyframe_01", turnId: "turn_video_01", runId: "run_01J8MEDIA03", outputIndex: 0, kind: "image", title: "角色镜头 · 起始关键帧", mimeType: "image/svg+xml", detail: "960 × 540", previewUrl: "./fixtures/video-poster.svg", originalUrl: "./fixtures/video-poster.svg", createdAt: "2026-08-20T11:12:06+08:00" }),
  Object.freeze({ mediaId: "media_video_keyframe_02", turnId: "turn_video_01", runId: "run_01J8MEDIA03", outputIndex: 1, kind: "image", title: "角色镜头 · 后退关键帧", mimeType: "image/svg+xml", detail: "960 × 540", previewUrl: "./fixtures/video-poster.svg", originalUrl: "./fixtures/video-poster.svg", createdAt: "2026-08-20T11:12:05+08:00" }),
  Object.freeze({ mediaId: "media_video_keyframe_03", turnId: "turn_video_01", runId: "run_01J8MEDIA03", outputIndex: 2, kind: "image", title: "角色镜头 · 半身关键帧", mimeType: "image/svg+xml", detail: "960 × 540", previewUrl: "./fixtures/video-poster.svg", originalUrl: "./fixtures/video-poster.svg", createdAt: "2026-08-20T11:12:04+08:00" }),
  Object.freeze({ mediaId: "media_video_keyframe_04", turnId: "turn_video_01", runId: "run_01J8MEDIA03", outputIndex: 3, kind: "image", title: "角色镜头 · 结束关键帧", mimeType: "image/svg+xml", detail: "960 × 540", previewUrl: "./fixtures/video-poster.svg", originalUrl: "./fixtures/video-poster.svg", createdAt: "2026-08-20T11:12:03+08:00" }),
  Object.freeze({ mediaId: "media_video_clip_01", turnId: "turn_video_01", runId: "run_01J8MEDIA03", outputIndex: 4, kind: "video", title: "角色镜头运动 · 4 秒", mimeType: "video/mp4", detail: "静态原型 4 秒 fixture", previewUrl: "./fixtures/video-poster.svg", originalUrl: "./fixtures/demo-video.mp4", createdAt: "2026-08-20T11:12:02+08:00" }),
  Object.freeze({ mediaId: "media_video_audio_01", turnId: "turn_video_01", runId: "run_01J8MEDIA03", outputIndex: 5, kind: "audio", title: "室内环境音", mimeType: "audio/wav", detail: "静态原型 4 秒 fixture", previewUrl: null, originalUrl: "./fixtures/demo-audio.wav", createdAt: "2026-08-20T11:12:01+08:00" }),
  Object.freeze({ mediaId: "media_comparison_01", turnId: "turn_comparison_01", runId: "run_01J8LORA001", outputIndex: 0, kind: "image", title: "Fine line control · 0.65", mimeType: "image/svg+xml", detail: "832 × 1216", previewUrl: "./fixtures/generated-portrait.svg", originalUrl: "./fixtures/generated-portrait.svg", createdAt: "2026-08-19T20:14:00+08:00" }),
]);
