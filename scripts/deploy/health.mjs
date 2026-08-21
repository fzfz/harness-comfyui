import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  readDiscovery,
  validateDiscovery,
} from './preflight.mjs';
import { validateInstallation } from './contracts.mjs';
import {
  assertProcessStateOwnership,
  probePort,
  readActiveRelease,
  readProcessIdentity,
  readProcessState,
  sameProcessIdentity,
  writeAtomicJson,
} from './lifecycle.mjs';

const PRODUCT_HEALTH_CHECKS = Object.freeze([
  'process',
  'activeRelease',
  'harnessWeb',
  'clientBundle',
  'pluginStatus',
  'catalogContract',
  'sourceContract',
  'runRepository',
  'savedMedia',
]);

function failedCheck(error) {
  return { status: 'failed', error };
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

function healthBaseUrl(installation) {
  const host = installation.host.includes(':') ? `[${installation.host}]` : installation.host;
  return `http://${host}:${installation.port}`;
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

async function readProductPackageManifest(active) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(active.releasePath, 'package/package.json'), 'utf8'));
  } catch {
    throw new Error('active release package manifest unavailable');
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)
    || manifest.name !== 'harness-comfyui' || typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error('active release package manifest invalid');
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

async function probeRunRepository(installation) {
  await probeDirectory(installation.paths.dataDir);
  try {
    const stats = await lstat(installation.paths.runRepositoryFile);
    if (!stats.isFile()) throw new Error('run repository is not a file');
    await access(installation.paths.runRepositoryFile, fsConstants.R_OK | fsConstants.W_OK);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function probeSavedMedia(installation) {
  await probeDirectory(installation.paths.savedMediaDirectory);
}

async function inspectHarnessWeb(installation) {
  const baseUrl = healthBaseUrl(installation);
  const response = await fetchHealth(`${baseUrl}/`);
  if (!response.ok) throw new Error('Harness Web root unavailable');
  const graph = parseHealthBootGraph(await response.text());
  const requiredIds = [
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-conversation',
    'harness-comfyui',
  ];
  if (requiredIds.some(id => !graph.entries.some(entry => entry.id === id))) {
    throw new Error('Harness Web boot graph missing required bundle');
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

async function inspectPluginStatus(installation, packageManifest, web) {
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
    configurationProfile: installation.configurationProfile,
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

async function inspectDiscovery(installation, path, name) {
  const discovery = validateDiscovery(await readDiscovery(path, name), name, installation);
  return {
    status: 'passed',
    contractId: discovery.contract_id,
    contractVersion: discovery.contract_version,
  };
}

export async function runProductHealth(input) {
  const evidence = initialProductHealthEvidence();
  let installation;
  try {
    installation = validateInstallation(input);
  } catch {
    evidence.process = failedCheck('installation-invalid');
    return evidence;
  }

  let active;
  let packageManifest;
  try {
    active = await readActiveRelease(installation.root, installation.installationId);
    packageManifest = await readProductPackageManifest(active);
    if (packageManifest.version !== active.activeVersion) throw new Error('active release version mismatch');
    evidence.activeRelease = { status: 'passed', version: packageManifest.version };
  } catch {
    evidence.activeRelease = failedCheck('active-release-invalid');
  }

  if (active !== undefined) {
    try {
      const state = await readProcessState(resolve(installation.root, 'state/process.json'));
      if (state === null) throw new Error('process state missing');
      assertProcessStateOwnership(state, installation, active.activeVersion);
      const identity = await readProcessIdentity(state.pid);
      if (identity === null || !sameProcessIdentity(state.processIdentity, identity)) throw new Error('process identity mismatch');
      if (!(await probePort(installation.host, installation.port))) throw new Error('Host port is not running');
      evidence.process = { status: 'passed' };
    } catch {
      evidence.process = failedCheck('process-invalid');
    }
  } else {
    evidence.process = failedCheck('active-release-required');
  }

  let web;
  try {
    web = await inspectHarnessWeb(installation);
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
        const pluginStatus = await inspectPluginStatus(installation, packageManifest, web);
        evidence.pluginStatus = { status: 'passed', ...pluginStatus };
      } catch {
        evidence.pluginStatus = failedCheck('plugin-status-invalid');
      }
    } else {
      evidence.pluginStatus = failedCheck('active-release-required');
    }
  } else {
    evidence.clientBundle = failedCheck('harness-web-required');
    evidence.pluginStatus = failedCheck('harness-web-required');
  }

  try {
    evidence.catalogContract = await inspectDiscovery(installation, installation.source.catalogCliPath, 'catalog');
  } catch {
    evidence.catalogContract = failedCheck('catalog-contract-invalid');
  }
  try {
    evidence.sourceContract = await inspectDiscovery(installation, installation.source.sourceCliPath, 'source');
  } catch {
    evidence.sourceContract = failedCheck('source-contract-invalid');
  }
  if (evidence.catalogContract.status === 'passed' && evidence.sourceContract.status === 'passed'
    && (evidence.catalogContract.contractId !== evidence.sourceContract.contractId
      || evidence.catalogContract.contractVersion !== evidence.sourceContract.contractVersion)) {
    evidence.catalogContract = failedCheck('discovery-identity-mismatch');
    evidence.sourceContract = failedCheck('discovery-identity-mismatch');
  }

  try {
    await probeRunRepository(installation);
    evidence.runRepository = { status: 'passed' };
  } catch {
    evidence.runRepository = failedCheck('run-repository-invalid');
  }
  try {
    await probeSavedMedia(installation);
    evidence.savedMedia = { status: 'passed' };
  } catch {
    evidence.savedMedia = failedCheck('saved-media-invalid');
  }

  evidence.status = PRODUCT_HEALTH_CHECKS.every(name => evidence[name].status === 'passed') ? 'passed' : 'failed';
  await writeAtomicJson(join(installation.root, 'state/last-health.json'), evidence);
  return evidence;
}
