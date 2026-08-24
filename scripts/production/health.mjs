import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateSourceRuntime } from './contract.mjs';
import {
  assertProcessStateOwnership,
  probePort,
  probePortOwnedByProcess,
  readProcessIdentity,
  readProcessState,
  sameProcessIdentity,
  validateRunningAgentPresetRoster,
  writeAtomicJson,
} from './process.mjs';

const PRODUCT_HEALTH_CHECKS = Object.freeze([
  'process',
  'sourceRuntime',
  'agentPresetRuntime',
  'agentPresetRoster',
  'harnessWeb',
  'clientBundle',
  'pluginStatus',
  'runRepository',
  'savedMedia',
]);

function failedCheck(error) {
  return { status: 'failed', error };
}

function agentPresetRuntimeEvidence(productAgent, requiredEntries) {
  const artifactRoot = `${productAgent.agentPresetArtifactRelativeRoot}/${productAgent.agentPresetId}`;
  const artifactPrefix = `${artifactRoot}/`;
  return {
    status: 'passed',
    agentPresetRelativeRoot: `${productAgent.agentPresetInstallRelativeRoot}/${productAgent.agentPresetId}`,
    requiredFiles: requiredEntries
      .filter(entry => entry.startsWith(artifactPrefix))
      .map(entry => entry.slice(artifactPrefix.length)),
    skillRelativeRoot: productAgent.skillRelativeRoot,
  };
}

function initialProductHealthEvidence() {
  return {
    stage: 'health',
    status: 'failed',
    ...Object.fromEntries(PRODUCT_HEALTH_CHECKS.map(name => [name, failedCheck('not-run')])),
  };
}

async function fetchHealth(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function healthBaseUrl(runtime) {
  const host = runtime.host.includes(':') ? `[${runtime.host}]` : runtime.host;
  return `http://${host}:${runtime.port}`;
}

function parseHealthBootGraph(html) {
  const match = html.match(/window\.__DSH_BOOT__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/u);
  if (!match?.[1]) throw new Error('boot graph missing');
  let graph;
  try {
    graph = JSON.parse(match[1]);
  } catch {
    throw new Error('boot graph malformed');
  }
  if (graph === null || typeof graph !== 'object' || Array.isArray(graph)
    || typeof graph.rev !== 'string' || !Array.isArray(graph.entries)) {
    throw new Error('boot graph invalid');
  }
  const entries = graph.entries.map(entry => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)
      || typeof entry.id !== 'string' || typeof entry.url !== 'string' || entry.url.length === 0) {
      throw new Error('boot graph entry invalid');
    }
    return { id: entry.id, url: entry.url };
  });
  return { rev: graph.rev, entries };
}

async function readProductPackageManifest(runtimeTarget) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(runtimeTarget.packageRoot, 'package.json'), 'utf8'));
  } catch {
    throw new Error('source runtime package manifest unavailable');
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)
    || manifest.name !== 'harness-comfyui' || typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error('source runtime package manifest invalid');
  }
  return { name: manifest.name, version: manifest.version };
}

async function probeDirectory(path) {
  await mkdir(path, { recursive: true });
  const probePath = join(path, `.harness-comfyui-health-${process.pid}-${randomUUID()}.probe`);
  let failure;
  try {
    await writeFile(probePath, '{\n  "probe": true\n}\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    const contents = await readFile(probePath, 'utf8');
    if (contents !== '{\n  "probe": true\n}\n') throw new Error('directory probe changed');
  } catch (error) {
    failure = error;
  }
  try {
    await rm(probePath, { force: true });
  } catch (error) {
    if (failure === undefined) failure = error;
  }
  if (failure !== undefined) throw failure;
}

async function probeRunRepository(runtime) {
  await probeDirectory(runtime.paths.dataDir);
  try {
    const stats = await lstat(runtime.paths.runRepositoryFile);
    if (!stats.isFile()) throw new Error('run repository is not a file');
    await access(runtime.paths.runRepositoryFile, fsConstants.R_OK | fsConstants.W_OK);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function probeSavedMedia(runtime) {
  await probeDirectory(runtime.paths.savedMediaDirectory);
}

async function inspectHarnessWeb(runtime) {
  const baseUrl = healthBaseUrl(runtime);
  const response = await fetchHealth(`${baseUrl}/`);
  if (!response.ok) throw new Error('Harness Web root unavailable');
  const graph = parseHealthBootGraph(await response.text());
  const requiredIds = [
    '@deepseek-ai/dsh-client-ui-conversation',
    'harness-comfyui',
  ];
  for (const id of requiredIds) {
    if (!graph.entries.some(entry => entry.id === id)) {
      throw new Error(`Harness Web boot graph missing required bundle "${id}"`);
    }
  }
  const disabledId = '@deepseek-ai/dsh-client-ui-layout';
  if (graph.entries.some(entry => entry.id === disabledId)) {
    throw new Error(`Harness Web boot graph contains disabled bundle "${disabledId}"`);
  }
  return { baseUrl, graph };
}

async function inspectClientBundle(web) {
  const entry = web.graph.entries.find(candidate => candidate.id === 'harness-comfyui');
  if (entry === undefined) throw new Error('Harness Client bundle entry missing');
  const url = new URL(entry.url, web.baseUrl);
  const base = new URL(web.baseUrl);
  if (url.origin !== base.origin) throw new Error('Harness Client bundle escaped Harness Web');
  const response = await fetchHealth(url);
  if (!response.ok || (await response.text()).trim().length === 0) {
    throw new Error('Harness Client bundle unavailable');
  }
}

async function inspectPluginStatus(runtime, packageManifest, web) {
  const response = await fetchHealth(`${web.baseUrl}/api/pluginStatus/get`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'health',
      method: 'pluginStatus/get',
      payload: { args: {} },
    }),
  });
  if (!response.ok) throw new Error('pluginStatus Remote unavailable');
  let wire;
  try {
    wire = await response.json();
  } catch {
    throw new Error('pluginStatus Remote response malformed');
  }
  const value = wire?.result?.value;
  const expected = {
    packageName: packageManifest.name,
    packageVersion: packageManifest.version,
    configurationProfile: runtime.configurationProfile,
    hostLoaded: true,
  };
  if (wire?.type !== 'server-response' || wire?.result?.ok !== true
    || value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('pluginStatus projection mismatch');
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)
    || value.packageName !== expected.packageName
    || value.packageVersion !== expected.packageVersion
    || value.configurationProfile !== expected.configurationProfile
    || value.hostLoaded !== expected.hostLoaded) {
    throw new Error('pluginStatus projection mismatch');
  }
  return expected;
}

export async function runSourceHealth(input, runtimeTarget, runtimeResolutionError = undefined) {
  const evidence = initialProductHealthEvidence();
  let runtime;
  try {
    runtime = validateSourceRuntime(input);
  } catch {
    evidence.process = failedCheck('runtime-invalid');
    return evidence;
  }

  let active = runtimeTarget;
  let packageManifest;
  let productAgent;
  let agentPresetRequiredEntries;
  try {
    if (active === undefined) throw runtimeResolutionError ?? new Error('runtime target is unavailable');
    packageManifest = await readProductPackageManifest(active);
    if (packageManifest.version !== active.activeVersion) throw new Error('source runtime version mismatch');
    productAgent = active.productAgent;
    agentPresetRequiredEntries = active.requiredEntries;
    evidence.sourceRuntime = { status: 'passed', version: packageManifest.version };
    evidence.agentPresetRuntime = agentPresetRuntimeEvidence(productAgent, agentPresetRequiredEntries);
  } catch (error) {
    evidence.sourceRuntime = failedCheck('source-runtime-invalid');
    evidence.agentPresetRuntime = failedCheck(error instanceof Error ? error.message : String(error));
  }

  if (active !== undefined) {
    try {
      const state = await readProcessState(resolve(runtime.runtimeRoot, 'state/process.json'));
      if (state === null) throw new Error('process state missing');
      assertProcessStateOwnership(state, runtime, active.activeVersion);
      const identity = await readProcessIdentity(state.pid);
      if (identity === null || !sameProcessIdentity(state.processIdentity, identity)) throw new Error('process identity mismatch');
      if (!(await probePort(runtime.host, runtime.port))) throw new Error('Host port is not running');
      if (!(await probePortOwnedByProcess(runtime.host, runtime.port, state.pid))) {
        throw new Error(`Host port is not owned by managed Host PID ${state.pid}`);
      }
      evidence.process = { status: 'passed' };
    } catch (error) {
      evidence.process = failedCheck(error instanceof Error ? error.message : String(error));
    }
  } else {
    evidence.process = failedCheck('source-runtime-required');
  }

  if (evidence.process.status !== 'passed') {
    evidence.agentPresetRoster = failedCheck('process readiness required');
  } else if (active !== undefined && productAgent !== undefined) {
    try {
      const roster = await validateRunningAgentPresetRoster(runtime, productAgent);
      evidence.agentPresetRoster = { status: 'passed', ...roster };
    } catch (error) {
      evidence.agentPresetRoster = failedCheck(error instanceof Error ? error.message : String(error));
    }
  } else {
    evidence.agentPresetRoster = failedCheck('source-runtime-required');
  }

  let web;
  try {
    web = await inspectHarnessWeb(runtime);
    evidence.harnessWeb = { status: 'passed' };
  } catch {
    evidence.harnessWeb = failedCheck('harness-web-invalid');
  }

  if (web !== undefined) {
    try {
      await inspectClientBundle(web);
      evidence.clientBundle = { status: 'passed' };
    } catch {
      evidence.clientBundle = failedCheck('client-bundle-invalid');
    }
    if (packageManifest !== undefined) {
      try {
        const pluginStatus = await inspectPluginStatus(runtime, packageManifest, web);
        evidence.pluginStatus = { status: 'passed', ...pluginStatus };
      } catch {
        evidence.pluginStatus = failedCheck('plugin-status-invalid');
      }
    } else {
      evidence.pluginStatus = failedCheck('source-runtime-required');
    }
  } else {
    evidence.clientBundle = failedCheck('harness-web-required');
    evidence.pluginStatus = failedCheck('harness-web-required');
  }

  try {
    await probeRunRepository(runtime);
    evidence.runRepository = { status: 'passed' };
  } catch {
    evidence.runRepository = failedCheck('run-repository-invalid');
  }
  try {
    await probeSavedMedia(runtime);
    evidence.savedMedia = { status: 'passed' };
  } catch {
    evidence.savedMedia = failedCheck('saved-media-invalid');
  }

  evidence.status = PRODUCT_HEALTH_CHECKS.every(name => evidence[name].status === 'passed') ? 'passed' : 'failed';
  await writeAtomicJson(join(runtime.runtimeRoot, 'state/last-health.json'), evidence);
  return evidence;
}
