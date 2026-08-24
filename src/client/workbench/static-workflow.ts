export interface StaticUiWorkflowNode {
  readonly id: number
  readonly type: string
  readonly [key: string]: unknown
}

export type StaticUiWorkflowLink = readonly [number, number, number, number, number, string]

export interface StaticUiWorkflow {
  readonly last_node_id: number
  readonly last_link_id: number
  readonly nodes: readonly StaticUiWorkflowNode[]
  readonly links: readonly StaticUiWorkflowLink[]
  readonly groups: readonly unknown[]
  readonly config: Readonly<Record<string, unknown>>
  readonly extra: Readonly<Record<string, unknown>>
  readonly version: number
}

const STATIC_ACTUAL_WORKFLOW = {
  last_node_id: 7,
  last_link_id: 9,
  nodes: [
    {
      id: 1,
      type: 'CheckpointLoaderSimple',
      pos: [48, 190],
      size: [318, 98],
      flags: {},
      order: 0,
      mode: 0,
      inputs: [],
      outputs: [
        { name: 'MODEL', type: 'MODEL', links: [1] },
        { name: 'CLIP', type: 'CLIP', links: [2, 3] },
        { name: 'VAE', type: 'VAE', links: [8] },
      ],
      properties: { 'Node name for S&R': 'CheckpointLoaderSimple' },
      widgets_values: ['anima_pencilXL_v11.safetensors'],
    },
    {
      id: 2,
      type: 'CLIPTextEncode',
      pos: [420, 28],
      size: [420, 164],
      flags: {},
      order: 1,
      mode: 0,
      inputs: [{ name: 'clip', type: 'CLIP', link: 2 }],
      outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [4] }],
      properties: { 'Node name for S&R': 'CLIPTextEncode' },
      widgets_values: ['silver short hair, blue-gray eyes, quiet interior, half-body portrait'],
    },
    {
      id: 3,
      type: 'CLIPTextEncode',
      pos: [420, 220],
      size: [420, 164],
      flags: {},
      order: 2,
      mode: 0,
      inputs: [{ name: 'clip', type: 'CLIP', link: 3 }],
      outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [5] }],
      properties: { 'Node name for S&R': 'CLIPTextEncode' },
      widgets_values: ['low quality, distorted hands, duplicate subject'],
    },
    {
      id: 4,
      type: 'EmptyLatentImage',
      pos: [500, 430],
      size: [315, 106],
      flags: {},
      order: 3,
      mode: 0,
      inputs: [],
      outputs: [{ name: 'LATENT', type: 'LATENT', links: [6] }],
      properties: { 'Node name for S&R': 'EmptyLatentImage' },
      widgets_values: [832, 1216, 1],
    },
    {
      id: 5,
      type: 'KSampler',
      pos: [905, 135],
      size: [315, 262],
      flags: {},
      order: 4,
      mode: 0,
      inputs: [
        { name: 'model', type: 'MODEL', link: 1 },
        { name: 'positive', type: 'CONDITIONING', link: 4 },
        { name: 'negative', type: 'CONDITIONING', link: 5 },
        { name: 'latent_image', type: 'LATENT', link: 6 },
      ],
      outputs: [{ name: 'LATENT', type: 'LATENT', links: [7] }],
      properties: { 'Node name for S&R': 'KSampler' },
      widgets_values: [921783418, 'fixed', 28, 5.5, 'euler_ancestral', 'normal', 1],
    },
    {
      id: 6,
      type: 'VAEDecode',
      pos: [1260, 155],
      size: [210, 46],
      flags: {},
      order: 5,
      mode: 0,
      inputs: [
        { name: 'samples', type: 'LATENT', link: 7 },
        { name: 'vae', type: 'VAE', link: 8 },
      ],
      outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [9] }],
      properties: { 'Node name for S&R': 'VAEDecode' },
    },
    {
      id: 7,
      type: 'SaveImage',
      pos: [1535, 125],
      size: [260, 270],
      flags: {},
      order: 6,
      mode: 0,
      inputs: [{ name: 'images', type: 'IMAGE', link: 9 }],
      outputs: [],
      properties: { 'Node name for S&R': 'SaveImage' },
      widgets_values: ['harness-comfyui/run_01J8QUEUE42'],
    },
  ],
  links: [
    [1, 1, 0, 5, 0, 'MODEL'],
    [2, 1, 1, 2, 0, 'CLIP'],
    [3, 1, 1, 3, 0, 'CLIP'],
    [4, 2, 0, 5, 1, 'CONDITIONING'],
    [5, 3, 0, 5, 2, 'CONDITIONING'],
    [6, 4, 0, 5, 3, 'LATENT'],
    [7, 5, 0, 6, 0, 'LATENT'],
    [8, 1, 2, 6, 1, 'VAE'],
    [9, 6, 0, 7, 0, 'IMAGE'],
  ],
  groups: [],
  config: {},
  extra: {
    ds: { scale: 0.82, offset: [54, 82] },
    harness_comfyui: { run_id: 'run_01J8QUEUE42' },
  },
  version: 0.4,
} as const satisfies StaticUiWorkflow

export interface StaticWorkflowDownloadArtifact {
  readonly filename: string
  readonly mimeType: 'application/json'
  readonly content: string
}

export function createStaticWorkflowDownload(runId: string): StaticWorkflowDownloadArtifact {
  const workflow = {
    ...STATIC_ACTUAL_WORKFLOW,
    nodes: STATIC_ACTUAL_WORKFLOW.nodes.map(node => (
      node.id === 7
        ? { ...node, widgets_values: [`harness-comfyui/${runId}`] }
        : node
    )),
    extra: {
      ...STATIC_ACTUAL_WORKFLOW.extra,
      harness_comfyui: { run_id: runId },
    },
  }
  return {
    filename: `comfyui-run-${runId}-workflow.json`,
    mimeType: 'application/json',
    content: `${JSON.stringify(workflow, null, 2)}\n`,
  }
}

export function downloadStaticWorkflow(runId: string): void {
  const artifact = createStaticWorkflowDownload(runId)
  const blob = new Blob([artifact.content], { type: artifact.mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = artifact.filename
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}
