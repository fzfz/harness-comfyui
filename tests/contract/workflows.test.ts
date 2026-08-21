import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');

async function workflow(name: string) {
  return readFile(join(repositoryRoot, '.github/workflows', name), 'utf8');
}

function commandIndex(source: string, command: string) {
  return source.indexOf(`run: ${command}`);
}

function count(source: string, value: string) {
  return source.split(value).length - 1;
}

function expectPreinstallGates(source: string) {
  const manifest = commandIndex(source, 'pnpm run check:manifest-lock');
  const advisories = commandIndex(source, 'pnpm run security:advisories');
  const buildScripts = commandIndex(source, 'pnpm run security:build-scripts');
  const frozenInstall = commandIndex(source, 'pnpm install --frozen-lockfile');
  expect(manifest).toBeGreaterThanOrEqual(0);
  expect(advisories).toBeGreaterThan(manifest);
  expect(buildScripts).toBeGreaterThan(advisories);
  expect(frozenInstall).toBeGreaterThan(buildScripts);
}

function expectCommonRuntimeSetup(source: string) {
  expect(source).toContain('actions/checkout@v4');
  expect(source).toContain('actions/setup-node@v4');
  expect(source).toContain('node-version-file: .node-version');
  expect(source).not.toMatch(/node-version:\s*['"]?\d/u);
  expect(source).toContain('corepack prepare pnpm@11.7.0 --activate');
  expect(source).not.toMatch(/secrets\./i);
}

describe('workflow orchestration contracts', () => {
  it('CI runs the three preinstall gates before frozen install and one quality command', async () => {
    const source = await workflow('ci.yml');
    expect(source).toContain('pull_request:');
    expect(source).toContain('branches: [main]');
    expectCommonRuntimeSetup(source);
    expectPreinstallGates(source);
    expect(commandIndex(source, 'pnpm quality')).toBeGreaterThan(commandIndex(source, 'pnpm install --frozen-lockfile'));
    expect(count(source, 'pnpm quality')).toBe(1);
    expect(source).not.toMatch(/pnpm\s+(?:run\s+)?(?:build|package:pack)/u);
  });

  it('release accepts explicit SemVer and exact main commit and previews the one quality artifact without publication', async () => {
    const source = await workflow('release.yml');
    expectCommonRuntimeSetup(source);
    expect(source).toContain('workflow_dispatch:');
    expect(source).toMatch(/version:\n\s+description:[^\n]+\n\s+required: true\n\s+type: string/u);
    expect(source).toMatch(/commit:\n\s+description:[^\n]+\n\s+required: true\n\s+type: string/u);
    expect(source).toMatch(/ref:\s*\$\{\{\s*inputs\.commit\s*\}\}/);
    expect(source).toContain('git fetch --no-tags origin main:refs/remotes/origin/main');
    expect(source).toContain('git rev-parse HEAD');
    expect(source).toContain('git merge-base --is-ancestor');
    expect(source).toContain('assertExpectedIdentity');
    expectPreinstallGates(source);
    expect(commandIndex(source, 'pnpm quality')).toBeGreaterThan(commandIndex(source, 'pnpm install --frozen-lockfile'));
    expect(count(source, 'pnpm quality')).toBe(1);
    expect(source).not.toMatch(/pnpm\s+(?:run\s+)?(?:build|package:pack)/u);
    expect(source).toContain('.release/quality/artifact.json');
    expect(source).toContain('.release/quality/*.tgz');
    expect(source).toMatch(/node scripts\/release\/preview\.mjs .*--expected-version .*inputs\.version.*--expected-commit .*inputs\.commit/);
    expect(source).not.toContain('release:dry-run');
    expect(source).toMatch(/Release Preview|release-preview/);
    expect(source).not.toMatch(/\bgit\s+(?:tag|push)\b|gh\s+release|create-release|softprops\/action-gh-release/i);
  });

  it('deploy validates the repository lifecycle artifact without user targets or production writes', async () => {
    const source = await workflow('deploy.yml');
    expectCommonRuntimeSetup(source);
    expect(source).toContain('workflow_dispatch:');
    expect(source).not.toMatch(/workflow_dispatch:\n\s+inputs:/u);
    expect(source).not.toMatch(/artifactPath|artifactSha256|artifactVersion|artifactCommit|targetEnvironment|releaseSmokePassed/u);
    expect(source).not.toMatch(/deploy:(?:activate|preflight|health|rollback)|production-binding|production-write|external target|ssh|curl|https?:\/\//iu);
    expectPreinstallGates(source);
    expect(commandIndex(source, 'pnpm test:deploy')).toBeGreaterThan(commandIndex(source, 'pnpm install --frozen-lockfile'));
    expect(count(source, 'pnpm test:deploy')).toBe(1);
    expect(source).not.toMatch(/pnpm\s+(?:run\s+)?(?:quality|build|package:pack|package:validate|test:(?:unit|contract|integration|prototype|composition|e2e)|release:smoke)\b/u);
  });
});
