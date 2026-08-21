import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import {
  SOURCE_CONTRACT_ID,
  validateInstallation,
} from './contracts.mjs';

export async function readJson(path) {
  let contents;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`malformed JSON in ${path}: ${error.message}`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, name) {
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function requireAbsolutePath(value, name) {
  const path = requireString(value, name);
  if (!isAbsolute(path)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return resolve(path);
}

async function requireFile(path, name) {
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    throw new Error(`${name} does not exist: ${error.message}`);
  }
  if (!stats.isFile()) {
    throw new Error(`${name} must be a regular file`);
  }
  return stats;
}

const PRODUCT_PACKAGE_NAME = 'harness-comfyui';
const PRODUCT_PNPM_VERSION = '11.7.0';
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

async function runExternal(command, args, { timeoutMs = 10000 } = {}) {
  return new Promise((resolveResult, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let forceKillTimer;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 500);
    }, timeoutMs);

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      callback(value);
    };

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => settle(reject, error));
    child.on('close', (code, signal) => settle(resolveResult, {
      code: code ?? 1,
      signal,
      stdout,
      stderr,
      timedOut,
    }));
  });
}

function parseSemver(value, name) {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) throw new Error(`${name} must be a valid SemVer`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function addVersion(left, major, minor, patch) {
  return { major: left.major + major, minor: left.minor + minor, patch: left.patch + patch };
}

function satisfiesSimpleNodeRange(range, current) {
  if (range === '*' || range === 'x' || range === 'X') return true;
  const operator = range.match(/^(\^|~|>=|<=|>|<|=)?(.*)$/u);
  if (!operator) return false;
  const versionText = operator[2];
  const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/u.exec(versionText);
  if (!versionMatch) return false;
  const target = {
    major: Number(versionMatch[1]),
    minor: Number(versionMatch[2]),
    patch: Number(versionMatch[3]),
  };
  const comparison = compareVersions(current, target);
  switch (operator[1] ?? '=') {
    case '>=': return comparison >= 0;
    case '<=': return comparison <= 0;
    case '>': return comparison > 0;
    case '<': return comparison < 0;
    case '=': return comparison === 0;
    case '~': return comparison >= 0 && compareVersions(current, addVersion(target, 0, 1, 0)) < 0;
    case '^': {
      const upperBound = target.major > 0
        ? addVersion(target, 1, -target.minor, -target.patch)
        : target.minor > 0
          ? addVersion(target, 0, 1, -target.patch)
          : addVersion(target, 0, 0, 1);
      return comparison >= 0 && compareVersions(current, upperBound) < 0;
    }
    default: return false;
  }
}

function satisfiesNodeEngine(engine, currentVersion) {
  const current = parseSemver(currentVersion, 'current Node version');
  return engine.split('||').some((alternative) => {
    const ranges = alternative.trim().split(/\s+/u).filter(Boolean);
    return ranges.length > 0 && ranges.every(range => satisfiesSimpleNodeRange(range, current));
  });
}

async function readArtifactPackageJson(artifactPath) {
  const normalizedArtifactPath = requireAbsolutePath(artifactPath, 'artifact');
  await requireFile(normalizedArtifactPath, 'artifact');
  const result = await runExternal('tar', ['-xOzf', normalizedArtifactPath, 'package/package.json']);
  if (result.timedOut) throw new Error('artifact package/package.json extraction timed out');
  if (result.code !== 0) {
    const detail = result.stderr.trim();
    throw new Error(`artifact must contain package/package.json${detail ? `: ${detail}` : ''}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`artifact package/package.json is malformed JSON: ${error.message}`);
  }
  requireRecord(manifest, 'artifact package.json');
  if (manifest.name !== PRODUCT_PACKAGE_NAME) {
    throw new Error(`artifact package.json.name must be ${PRODUCT_PACKAGE_NAME}`);
  }
  const version = requireString(manifest.version, 'artifact package.json.version');
  parseSemver(version, 'artifact package.json.version');
  const engines = requireRecord(manifest.engines, 'artifact package.json.engines');
  const nodeEngine = requireString(engines.node, 'artifact package.json.engines.node');
  if (!satisfiesNodeEngine(nodeEngine, process.versions.node)) {
    throw new Error(`current Node ${process.versions.node} does not satisfy artifact package.json.engines.node ${nodeEngine}`);
  }
  return { name: PRODUCT_PACKAGE_NAME, version, nodeEngine };
}

async function readPnpmVersion() {
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  let result;
  try {
    result = await runExternal(pnpmCommand, ['--version']);
  } catch (error) {
    throw new Error(`cannot execute pnpm --version: ${error.message}`);
  }
  if (result.timedOut || result.code !== 0) {
    const detail = result.stderr.trim();
    throw new Error(`pnpm --version failed${detail ? `: ${detail}` : ''}`);
  }
  const version = result.stdout.trim();
  if (version !== PRODUCT_PNPM_VERSION) {
    throw new Error(`pnpm version must be ${PRODUCT_PNPM_VERSION}, got ${version || '(empty)'}`);
  }
  return version;
}

async function probePersistentDirectory(path, name) {
  await mkdir(path, { recursive: true });
  const probePath = join(path, `.harness-comfyui-preflight-${process.pid}-${randomUUID()}.probe`);
  const probeContents = `${name}\n`;
  let failure;
  try {
    await writeFile(probePath, probeContents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    const contents = await readFile(probePath, 'utf8');
    if (contents !== probeContents) throw new Error('probe contents changed');
  } catch (error) {
    failure = error;
  }
  try {
    await rm(probePath, { force: true });
  } catch (error) {
    if (!failure) failure = error;
  }
  if (failure) throw new Error(`${name} read/write probe failed: ${failure.message}`);
}

async function probeRunRepositoryLocation(path) {
  try {
    const stats = await lstat(path);
    if (!stats.isFile()) throw new Error('existing path is not a regular file');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw new Error(`installation.paths.runRepositoryFile is not usable: ${error.message}`);
  }
}

async function probePort(host, port) {
  const server = createServer();
  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolveListen);
    });
  } catch (error) {
    throw new Error(`port ${host}:${port} is unavailable: ${error.message}`);
  } finally {
    if (server.listening) {
      await new Promise((resolveClose, rejectClose) => {
        server.close(error => error ? rejectClose(error) : resolveClose());
      });
    }
  }
}

export async function readDiscovery(path, name) {
  let result;
  try {
    result = await runExternal(path, ['--discovery-json']);
  } catch (error) {
    throw new Error(`${name} discovery CLI could not start: ${error.message}`);
  }
  if (result.timedOut) throw new Error(`${name} discovery CLI timed out`);
  if (result.code !== 0) {
    const detail = result.stderr.trim();
    throw new Error(`${name} discovery CLI failed with exit code ${result.code}${detail ? `: ${detail}` : ''}`);
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`${name} discovery CLI returned malformed JSON: ${error.message}`);
  }
}

export function validateDiscovery(value, name, installation) {
  const discovery = requireRecord(value, `${name} discovery`);
  const expectedVersion = installation.source.supportedContractVersions[0];
  if (discovery.contract_id !== SOURCE_CONTRACT_ID) {
    throw new Error(`${name} discovery contract_id must be ${SOURCE_CONTRACT_ID}`);
  }
  if (discovery.contract_version !== expectedVersion) {
    throw new Error(`${name} discovery contract_version must be ${expectedVersion}`);
  }
  const openapi = requireRecord(discovery.openapi, `${name} discovery.openapi`);
  if (typeof openapi.openapi !== 'string' || !/^3\.1(?:\.\d+)?$/u.test(openapi.openapi)) {
    throw new Error(`${name} discovery.openapi.openapi must be an OpenAPI 3.1 version`);
  }
  requireRecord(openapi.info, `${name} discovery.openapi.info`);
  requireRecord(openapi.paths, `${name} discovery.openapi.paths`);
  return {
    contract_id: discovery.contract_id,
    contract_version: discovery.contract_version,
    openapi,
  };
}

export async function runProductPreflight(input, artifactPath, options = {}) {
  const installation = validateInstallation(input);
  const artifact = await readArtifactPackageJson(artifactPath);
  const pnpmVersion = await readPnpmVersion();

  for (const [name, path] of [
    ['installation.paths.dataDir', installation.paths.dataDir],
    ['installation.paths.runDirectory', installation.paths.runDirectory],
    ['installation.paths.savedMediaDirectory', installation.paths.savedMediaDirectory],
    ['installation.paths.logDirectory', installation.paths.logDirectory],
  ]) {
    await probePersistentDirectory(path, name);
  }
  await probeRunRepositoryLocation(installation.paths.runRepositoryFile);
  if (options.allowKnownPortUse !== true) await probePort(installation.host, installation.port);

  const catalogDiscovery = validateDiscovery(
    await readDiscovery(installation.source.catalogCliPath, 'catalog'),
    'catalog',
    installation,
  );
  const sourceDiscovery = validateDiscovery(
    await readDiscovery(installation.source.sourceCliPath, 'source'),
    'source',
    installation,
  );
  if (catalogDiscovery.contract_id !== sourceDiscovery.contract_id
    || catalogDiscovery.contract_version !== sourceDiscovery.contract_version) {
    throw new Error('catalog and source discovery contract identities do not match');
  }

  return {
    stage: 'preflight',
    status: 'passed',
    installation,
    artifact,
    runtime: {
      node: process.versions.node,
      pnpm: pnpmVersion,
    },
    source: {
      catalog: catalogDiscovery,
      source: sourceDiscovery,
    },
  };
}
