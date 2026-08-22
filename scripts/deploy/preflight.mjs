import { randomUUID } from 'node:crypto';
import { deepStrictEqual } from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAbsolute, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import {
  SOURCE_CONTRACT_ID,
  validateInstallation,
} from './contracts.mjs';
import {
  RUNTIME_DEPENDENCY_POLICY,
  readPnpmPackageManagerVersion,
} from './runtime-contract.mjs';

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

function requireRelativePath(value, name) {
  const path = requireString(value, name);
  if (isAbsolute(path) || path.includes('\\') || path.startsWith('./') || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${name} must be a normalized package-relative path`);
  }
  return path;
}

export function parseProductAgentConfig(value, source = 'config/product-agent.json') {
  const config = requireRecord(value, source);
  const agentPresetId = requireString(config.agentPresetId, `${source}.agentPresetId`);
  if (agentPresetId.includes('/') || agentPresetId.includes('\\')) {
    throw new Error(`${source}.agentPresetId must be a single path segment`);
  }
  const parsed = {
    agentPresetId,
    agentPresetArtifactRelativeRoot: requireRelativePath(
      config.agentPresetArtifactRelativeRoot,
      `${source}.agentPresetArtifactRelativeRoot`,
    ),
    agentPresetInstallRelativeRoot: requireRelativePath(
      config.agentPresetInstallRelativeRoot,
      `${source}.agentPresetInstallRelativeRoot`,
    ),
    skillRelativeRoot: requireRelativePath(config.skillRelativeRoot, `${source}.skillRelativeRoot`),
    agentPluginExport: requireString(config.agentPluginExport, `${source}.agentPluginExport`),
    sessionListConvergenceTimeoutMs: config.sessionListConvergenceTimeoutMs,
  };
  if (!parsed.agentPluginExport.startsWith('./') || parsed.agentPluginExport.includes('\\')) {
    throw new Error(`${source}.agentPluginExport must be a package-relative export`);
  }
  if (!Number.isInteger(parsed.sessionListConvergenceTimeoutMs) || parsed.sessionListConvergenceTimeoutMs <= 0) {
    throw new Error(`${source}.sessionListConvergenceTimeoutMs must be a positive integer`);
  }
  return parsed;
}

export async function readProductAgentConfig(packageRoot) {
  const path = join(packageRoot, 'config/product-agent.json');
  let value;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${path}: ${error.message}`);
  }
  return parseProductAgentConfig(value, path);
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
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const RUNTIME_ENTRIES = Object.freeze([
  'deployment/runtime/package.json',
  'deployment/runtime/pnpm-lock.yaml',
  'deployment/runtime/pnpm-workspace.yaml',
]);
const CONFIG_ENTRY_PREFIX = 'config/';
export const PROFILE_VALIDATOR_ENTRY = 'lib/config-profile-validator.js';
const AGENT_PRESET_FILES = Object.freeze(['preset.yml', 'agent.cordis.yml']);
const AGENT_PROFILE_PATCH_ENTRY = 'profiles/comfyui-workbench/cordis.patch.yml';

function agentPluginExportTarget(productAgent) {
  const exportSuffix = productAgent.agentPluginExport.slice(2);
  if (exportSuffix.length === 0 || exportSuffix.endsWith('/') || exportSuffix.includes('..')) {
    throw new Error('product Agent plugin export must identify a package entrypoint');
  }
  return `./lib/${exportSuffix}.js`;
}

function agentPresetRelativeRoot(productAgent) {
  return `${productAgent.agentPresetArtifactRelativeRoot}/${productAgent.agentPresetId}`;
}

function agentPresetRequiredEntries(productAgent) {
  const presetRoot = agentPresetRelativeRoot(productAgent);
  return [
    ...AGENT_PRESET_FILES.map(file => `${presetRoot}/${file}`),
    agentPluginExportTarget(productAgent).slice(2),
    'config/product-agent.json',
    AGENT_PROFILE_PATCH_ENTRY,
  ];
}

export function validateProductAgentManifest(manifest, productAgent, source = 'package/package.json') {
  requireRecord(manifest, source);
  const exportTarget = agentPluginExportTarget(productAgent);
  const exports = requireRecord(manifest.exports, `${source}.exports`);
  const exportValue = exports[productAgent.agentPluginExport];
  if (!isRecord(exportValue) || exportValue.default !== exportTarget) {
    throw new Error(`${source}.exports[${productAgent.agentPluginExport}] must default to ${exportTarget}`);
  }
  if (!Array.isArray(manifest.files)) throw new Error(`${source}.files must be an array`);
  const declared = new Set(manifest.files);
  for (const entry of agentPresetRequiredEntries(productAgent)) {
    if (!declared.has(entry)) throw new Error(`${source}.files must contain ${entry}`);
  }
  return { exportTarget, requiredEntries: agentPresetRequiredEntries(productAgent) };
}

function validateAgentPresetProfilePatch(text, productAgent, source) {
  const expected = [
    '- id: agent-presets',
    '  config:',
    `    default: ${productAgent.agentPresetId}`,
    '    includeUserRoot: true',
    '',
  ].join('\n');
  if (text.replace(/\r\n/gu, '\n') !== expected) {
    throw new Error(`${source} must equal exactly the four-line agent-presets patch with default: ${productAgent.agentPresetId} and includeUserRoot: true`);
  }
}

async function assertRegularDirectoryPath(root, relativePath, name) {
  let current = root;
  for (const segment of relativePath.split('/')) {
    current = join(current, segment);
    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      throw new Error(`${name} does not exist: ${current}: ${error.message}`);
    }
    if (stats.isSymbolicLink()) throw new Error(`${name} must not be a symlink: ${current}`);
    if (!stats.isDirectory()) throw new Error(`${name} must be a directory: ${current}`);
  }
}

async function assertRegularFilePath(root, relativePath, name) {
  const segments = relativePath.split('/');
  segments.pop();
  if (segments.length > 0) await assertRegularDirectoryPath(root, segments.join('/'), `${name} parent`);
  const path = join(root, relativePath);
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    throw new Error(`${name} does not exist: ${path}: ${error.message}`);
  }
  if (stats.isSymbolicLink()) throw new Error(`${name} must not be a symlink: ${path}`);
  if (!stats.isFile()) throw new Error(`${name} must be a regular file: ${path}`);
  return path;
}

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
  const devDependencies = requireRecord(manifest.devDependencies, 'artifact package.json.devDependencies');
  const runtimeVersions = {};
  for (const packageName of RUNTIME_DEPENDENCY_POLICY.packages) {
    const packageVersion = devDependencies[packageName];
    if (typeof packageVersion !== 'string' || !SEMVER_PATTERN.test(packageVersion)) {
      throw new Error(`artifact package.json.devDependencies.${packageName} must be a non-empty exact version`);
    }
    runtimeVersions[packageName] = packageVersion;
  }
  const engines = requireRecord(manifest.engines, 'artifact package.json.engines');
  const nodeEngine = requireString(engines.node, 'artifact package.json.engines.node');
  if (!satisfiesNodeEngine(nodeEngine, process.versions.node)) {
    throw new Error(`current Node ${process.versions.node} does not satisfy artifact package.json.engines.node ${nodeEngine}`);
  }
  return { name: PRODUCT_PACKAGE_NAME, version, nodeEngine, runtimeVersions, manifest };
}

async function readArtifactEntry(artifactPath, entry, description = entry) {
  const normalizedArtifactPath = requireAbsolutePath(artifactPath, 'artifact');
  const result = await runExternal('tar', ['-xOzf', normalizedArtifactPath, `package/${entry}`]);
  if (result.timedOut) throw new Error(`artifact entry package/${entry} extraction timed out`);
  if (result.code !== 0) {
    const detail = result.stderr.trim();
    throw new Error(`artifact must contain package/${entry} (${description})${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

async function listArtifactEntries(artifactPath) {
  const normalizedArtifactPath = requireAbsolutePath(artifactPath, 'artifact');
  const result = await runExternal('tar', ['-tzf', normalizedArtifactPath]);
  if (result.timedOut) throw new Error('artifact tarball listing timed out');
  if (result.code !== 0) {
    const detail = result.stderr.trim();
    throw new Error(`artifact tarball cannot be listed${detail ? `: ${detail}` : ''}`);
  }
  return new Set(result.stdout.split(/\r?\n/u).filter(Boolean));
}

async function readArtifactJsonEntry(artifactPath, entry, profileName) {
  let text;
  try {
    text = await readArtifactEntry(artifactPath, entry, `Configuration Profile "${profileName}"`);
  } catch (error) {
    throw new Error(`Configuration Profile "${profileName}" requires artifact entry package/${entry}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Configuration Profile "${profileName}" has malformed artifact entry package/${entry}: ${error.message}`);
  }
}

export async function validateProductAgentArtifact(artifactPath, manifest, productAgent) {
  const { requiredEntries } = validateProductAgentManifest(manifest, productAgent, 'artifact package.json');
  const entries = await listArtifactEntries(artifactPath);
  for (const entry of requiredEntries) {
    if (!entries.has(`package/${entry}`)) {
      const description = entry === agentPluginExportTarget(productAgent).slice(2) ? 'Agent bundle' : 'Agent artifact';
      throw new Error(`artifact ${description} is missing package/${entry}`);
    }
  }
  const profilePatch = await readArtifactEntry(artifactPath, AGENT_PROFILE_PATCH_ENTRY, 'Agent Preset profile patch');
  validateAgentPresetProfilePatch(profilePatch, productAgent, `artifact package/${AGENT_PROFILE_PATCH_ENTRY}`);
  return { requiredEntries };
}

export async function validateProductAgentRelease(releaseRoot) {
  const normalizedReleaseRoot = resolve(releaseRoot);
  await assertRegularDirectoryPath(normalizedReleaseRoot, 'package', 'release package root');
  const packageRoot = join(normalizedReleaseRoot, 'package');
  const productAgent = await readProductAgentConfig(packageRoot);
  const manifest = await readJson(join(packageRoot, 'package.json'));
  const { requiredEntries } = validateProductAgentManifest(manifest, productAgent, 'release package.json');
  const presetArtifactRoot = agentPresetRelativeRoot(productAgent);
  await assertRegularDirectoryPath(packageRoot, presetArtifactRoot, 'Preset artifact root');
  for (const file of AGENT_PRESET_FILES) {
    await assertRegularFilePath(packageRoot, `${presetArtifactRoot}/${file}`, `Preset artifact ${file}`);
  }
  await assertRegularFilePath(packageRoot, agentPluginExportTarget(productAgent).slice(2), 'Agent bundle');
  await assertRegularFilePath(packageRoot, AGENT_PROFILE_PATCH_ENTRY, 'Agent Preset profile patch');
  validateAgentPresetProfilePatch(
    await readFile(join(packageRoot, AGENT_PROFILE_PATCH_ENTRY), 'utf8'),
    productAgent,
    `release package/${AGENT_PROFILE_PATCH_ENTRY}`,
  );
  const presetInstallRoot = `${productAgent.agentPresetInstallRelativeRoot}/${productAgent.agentPresetId}`;
  await assertRegularDirectoryPath(normalizedReleaseRoot, presetInstallRoot, 'Preset release root');
  for (const file of AGENT_PRESET_FILES) {
    await assertRegularFilePath(normalizedReleaseRoot, `${presetInstallRoot}/${file}`, `Preset release ${file}`);
  }
  await assertRegularDirectoryPath(packageRoot, productAgent.skillRelativeRoot, 'Skill root');
  return { productAgent, requiredEntries };
}

function assertRuntimeLock(lockText, runtimeVersions) {
  if (!/^lockfileVersion:\s*['"]9\.0['"]\s*$/mu.test(lockText)) {
    throw new Error('artifact deployment/runtime/pnpm-lock.yaml must use lockfileVersion 9.0');
  }
  if (!/^importers:\s*$/mu.test(lockText) || !/^  \.:\s*$/mu.test(lockText)) {
    throw new Error('artifact deployment/runtime/pnpm-lock.yaml must declare importer .');
  }
  const lines = lockText.split(/\r?\n/u);
  const importersIndex = lines.findIndex(line => /^importers:\s*$/u.test(line));
  const importerIndex = lines.findIndex((line, index) => index > importersIndex && /^  \.:\s*$/u.test(line));
  if (importersIndex < 0 || importerIndex < 0) {
    throw new Error('artifact deployment/runtime/pnpm-lock.yaml must declare importer .');
  }
  const importerLines = [];
  for (let index = importerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().length > 0 && !line.startsWith(' ')) break;
    importerLines.push(line);
  }
  for (const packageName of RUNTIME_DEPENDENCY_POLICY.packages) {
    const dependencyIndex = importerLines.findIndex(line => line.trim() === "'" + packageName + "':");
    const specifier = dependencyIndex < 0
      ? undefined
      : importerLines[dependencyIndex + 1]?.match(/^ {8}specifier:\s*['"]?([^'"]+)['"]?\s*$/u)?.[1];
    const resolved = dependencyIndex < 0
      ? undefined
      : importerLines[dependencyIndex + 2]?.match(/^ {8}version:\s*['"]?([^'"]+)['"]?\s*$/u)?.[1]?.replace(/\([^)]*\)$/u, '');
    if (specifier !== runtimeVersions[packageName] || resolved !== runtimeVersions[packageName]) {
      throw new Error(`artifact deployment/runtime/pnpm-lock.yaml importer . must resolve ${packageName}@${runtimeVersions[packageName]}`);
    }
    const resolutionPrefix = "  '" + packageName + '@' + runtimeVersions[packageName];
    if (!lines.some(line => line.startsWith(resolutionPrefix) && line.endsWith("':"))) {
      throw new Error(`artifact deployment/runtime/pnpm-lock.yaml is missing package resolution ${packageName}@${runtimeVersions[packageName]}`);
    }
  }
}

function assertRuntimeWorkspace(workspaceText) {
  const lines = workspaceText.split(/\r?\n/u);
  const packagesIndex = lines.findIndex(line => /^packages:\s*$/u.test(line));
  if (packagesIndex < 0) {
    throw new Error('artifact deployment/runtime/pnpm-workspace.yaml must declare only package .');
  }
  const packageEntries = [];
  for (let index = packagesIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().length === 0) continue;
    if (!line.startsWith(' ')) break;
    const entry = line.match(/^ {2}-\s+(.+)\s*$/u);
    if (entry === null) {
      throw new Error('artifact deployment/runtime/pnpm-workspace.yaml must declare only package .');
    }
    packageEntries.push(entry[1]);
  }
  if (packageEntries.length !== 1 || packageEntries[0] !== '.') {
    throw new Error('artifact deployment/runtime/pnpm-workspace.yaml must declare only package .');
  }
  if (!/^strictDepBuilds:\s*true\s*$/mu.test(workspaceText)) {
    throw new Error('artifact deployment/runtime/pnpm-workspace.yaml must set strictDepBuilds: true');
  }
  const readMap = (sectionName) => {
    const values = {};
    let active = false;
    let found = false;
    for (const [lineNumber, sourceLine] of lines.entries()) {
      const line = sourceLine.trimEnd();
      if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue;
      const topLevel = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*$/u);
      if (topLevel !== null) {
        active = topLevel[1] === sectionName;
        found ||= active;
        continue;
      }
      if (!active) continue;
      if (!line.startsWith('  ') || line.startsWith('    ')) {
        throw new Error(`artifact deployment/runtime/pnpm-workspace.yaml ${sectionName} has malformed entry on line ${lineNumber + 1}`);
      }
      const entry = line.match(/^ {2}([^:]+):\s*(.+)$/u);
      if (entry === null) {
        throw new Error(`artifact deployment/runtime/pnpm-workspace.yaml ${sectionName} has malformed entry on line ${lineNumber + 1}`);
      }
      const key = entry[1].trim().replace(/^'(.*)'$/u, '$1').replace(/^"(.*)"$/u, '$1');
      const scalar = entry[2].trim();
      const value = scalar === 'true'
        ? true
        : scalar === 'false'
          ? false
          : scalar.replace(/^'(.*)'$/u, '$1').replace(/^"(.*)"$/u, '$1');
      if (Object.hasOwn(values, key)) {
        throw new Error(`artifact deployment/runtime/pnpm-workspace.yaml ${sectionName} contains duplicate key ${key}`);
      }
      values[key] = value;
    }
    if (!found || Object.keys(values).length === 0) {
      throw new Error(`artifact deployment/runtime/pnpm-workspace.yaml must retain the frozen ${sectionName} policy`);
    }
    return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
  };
  const actualPolicy = {
    strictDepBuilds: true,
    allowBuilds: readMap('allowBuilds'),
    overrides: readMap('overrides'),
  };
  const differences = [];
  for (const field of ['strictDepBuilds', 'allowBuilds', 'overrides']) {
    try {
      deepStrictEqual(actualPolicy[field], RUNTIME_DEPENDENCY_POLICY.workspace[field]);
    } catch {
      differences.push(field);
    }
  }
  if (differences.length > 0) {
    throw new Error(`artifact deployment/runtime/pnpm-workspace.yaml frozen workspace policy ${differences.join(', ')} differs from the runtime contract`);
  }
}

async function validateArtifactRuntime(artifactPath, rootManifest) {
  const entries = await listArtifactEntries(artifactPath);
  if (!entries.has(`package/${PROFILE_VALIDATOR_ENTRY}`)) {
    throw new Error(`artifact must contain package/${PROFILE_VALIDATOR_ENTRY}`);
  }
  for (const required of RUNTIME_ENTRIES) {
    if (!entries.has(`package/${required}`)) {
      throw new Error(`artifact must contain package/${required}`);
    }
  }
  for (const entry of entries) {
    if (entry.endsWith('/pnpm-lock.yaml') && entry !== 'package/deployment/runtime/pnpm-lock.yaml') {
      throw new Error(`artifact contains a second pnpm lock entry: ${entry}`);
    }
  }
  const runtimeManifestText = await readArtifactEntry(artifactPath, RUNTIME_ENTRIES[0]);
  let runtimeManifest;
  try {
    runtimeManifest = JSON.parse(runtimeManifestText);
  } catch (error) {
    throw new Error(`artifact deployment/runtime/package.json is malformed JSON: ${error.message}`);
  }
  requireRecord(runtimeManifest, 'artifact deployment/runtime/package.json');
  const packageManagerVersion = readPnpmPackageManagerVersion(runtimeManifest, 'artifact deployment/runtime/package.json');
  const dependencies = requireRecord(runtimeManifest.dependencies, 'artifact deployment/runtime/package.json.dependencies');
  const dependencyNames = Object.keys(dependencies).sort();
  const expectedNames = [...RUNTIME_DEPENDENCY_POLICY.packages].sort();
  if (JSON.stringify(dependencyNames) !== JSON.stringify(expectedNames)) {
    throw new Error('artifact deployment/runtime/package.json dependencies must contain exactly the frozen runtime packages');
  }
  for (const packageName of RUNTIME_DEPENDENCY_POLICY.packages) {
    if (dependencies[packageName] !== rootManifest.runtimeVersions[packageName]) {
      throw new Error(`runtime dependency ${packageName} must equal exact root package.json.devDependencies.${packageName} ${rootManifest.runtimeVersions[packageName]}`);
    }
  }
  if (runtimeManifest.devDependencies !== undefined || runtimeManifest.peerDependencies !== undefined) {
    throw new Error('artifact deployment/runtime/package.json must not define a second runtime version source');
  }
  const lockText = await readArtifactEntry(artifactPath, RUNTIME_ENTRIES[1]);
  const workspaceText = await readArtifactEntry(artifactPath, RUNTIME_ENTRIES[2]);
  assertRuntimeLock(lockText, rootManifest.runtimeVersions);
  assertRuntimeWorkspace(workspaceText);
  return {
    packageManagerVersion,
    dependencies,
    lockfileVersion: '9.0',
    strictDepBuilds: true,
  };
}

function profileEnvironment(installation) {
  return {
    HARNESS_COMFYUI_DATA_DIR: installation.paths.dataDir,
    HARNESS_COMFYUI_RUN_REPOSITORY_FILE: installation.paths.runRepositoryFile,
    HARNESS_COMFYUI_RUN_DIRECTORY: installation.paths.runDirectory,
    HARNESS_COMFYUI_SAVED_MEDIA_DIRECTORY: installation.paths.savedMediaDirectory,
    HARNESS_COMFYUI_LOG_DIRECTORY: installation.paths.logDirectory,
    HARNESS_COMFYUI_DEFAULT_INSTANCE_ID: installation.comfyui.defaultInstanceId,
    HARNESS_COMFYUI_CATALOG_CLI_PATH: installation.source.catalogCliPath,
    HARNESS_COMFYUI_SOURCE_CLI_PATH: installation.source.sourceCliPath,
    HARNESS_COMFYUI_CLIENT_RUN_REFRESH_INTERVAL_MS: String(installation.client.runRefreshIntervalMs),
    HARNESS_COMFYUI_SERVER_HOST: installation.host,
    HARNESS_COMFYUI_SERVER_PORT: String(installation.port),
  };
}

async function loadSharedProfileLoader() {
  const bundlePath = fileURLToPath(new URL('../../lib/config-profile-validator.js', import.meta.url));
  let bundle;
  try {
    bundle = await import(`${pathToFileURL(bundlePath).href}?configuration-profile-preflight=${randomUUID()}`);
  } catch (error) {
    throw new Error(`cannot load the built Host Configuration Profile loader from ${bundlePath}: ${error.message}`);
  }
  if (typeof bundle.loadProfile !== 'function') {
    throw new Error(`built Host Configuration Profile loader ${bundlePath} does not export loadProfile`);
  }
  return bundle.loadProfile;
}

async function validateArtifactConfiguration(artifactPath, installation) {
  const profileName = installation.configurationProfile;
  const profileEntry = `${CONFIG_ENTRY_PREFIX}profiles/${profileName}.json`;
  const configRoot = await mkdtemp(join(tmpdir(), `harness-comfyui-preflight-${process.pid}-`));
  try {
    const [base, profile, overrides] = await Promise.all([
      readArtifactJsonEntry(artifactPath, 'config/base.json', profileName),
      readArtifactJsonEntry(artifactPath, profileEntry, profileName),
      readArtifactJsonEntry(artifactPath, 'config/environment-overrides.json', profileName),
    ]);
    await mkdir(join(configRoot, 'profiles'), { recursive: true });
    await writeFile(join(configRoot, 'base.json'), `${JSON.stringify(base)}\n`, 'utf8');
    await writeFile(join(configRoot, 'profiles', `${profileName}.json`), `${JSON.stringify(profile)}\n`, 'utf8');
    await writeFile(join(configRoot, 'environment-overrides.json'), `${JSON.stringify(overrides)}\n`, 'utf8');
    const loadProfile = await loadSharedProfileLoader();
    try {
      return loadProfile(profileName, {
        configRoot,
        // Preflight accepts only values mapped from installation.json. Ambient
        // HARNESS_COMFYUI_* variables are intentionally not passed through.
        environment: profileEnvironment(installation),
      });
    } catch (error) {
      throw new Error(`Configuration Profile "${profileName}" failed for artifact entries package/config/base.json, package/${profileEntry}, and package/config/environment-overrides.json: ${error.message}`);
    }
  } finally {
    await rm(configRoot, { recursive: true, force: true });
  }
}

async function readPnpmVersion(expectedVersion) {
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
  if (version !== expectedVersion) {
    throw new Error(`pnpm version must be ${expectedVersion}, got ${version || '(empty)'}`);
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
  const artifactRead = await readArtifactPackageJson(artifactPath);
  const { manifest: artifactManifest, ...artifact } = artifactRead;
  const productAgent = parseProductAgentConfig(
    await readArtifactJsonEntry(artifactPath, 'config/product-agent.json', 'product-agent configuration'),
    'artifact package/config/product-agent.json',
  );
  const agentArtifact = await validateProductAgentArtifact(artifactPath, artifactManifest, productAgent);
  const runtimeClosure = await validateArtifactRuntime(artifactPath, artifact);
  const configuration = await validateArtifactConfiguration(artifactPath, installation);
  const pnpmVersion = await readPnpmVersion(runtimeClosure.packageManagerVersion);

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
    productAgent,
    agentArtifact,
    configuration: {
      profile: configuration.configurationProfile,
      server: configuration.server,
    },
    runtimeClosure,
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
