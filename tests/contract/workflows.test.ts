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

describe('workflow orchestration contracts', () => {
  it('CI runs the three preinstall gates before frozen install and one quality command', async () => {
    const source = await workflow('ci.yml');
    expect(source).toContain('pull_request:');
    expect(source).toContain('branches: [main]');
    const manifest = commandIndex(source, 'pnpm run check:manifest-lock');
    const advisories = commandIndex(source, 'pnpm run security:advisories');
    const buildScripts = commandIndex(source, 'pnpm run security:build-scripts');
    const frozenInstall = commandIndex(source, 'pnpm install --frozen-lockfile');
    const quality = commandIndex(source, 'pnpm quality');
    expect(manifest).toBeGreaterThanOrEqual(0);
    expect(advisories).toBeGreaterThan(manifest);
    expect(buildScripts).toBeGreaterThan(advisories);
    expect(frozenInstall).toBeGreaterThan(buildScripts);
    expect(quality).toBeGreaterThan(frozenInstall);
    expect((source.match(/pnpm quality/g) ?? []).length).toBe(1);
    expect(source).not.toMatch(/secrets\.(PRODUCTION|PROD|HOST|CLIENT)/i);
  });

  it('release accepts explicit SemVer and exact main commit and previews the one quality artifact without publication', async () => {
    const source = await workflow('release.yml');
    expect(source).toContain('workflow_dispatch:');
    expect(source).toContain('version:');
    expect(source).toContain('commit:');
    expect(source).toMatch(/ref:\s*\$\{\{\s*inputs\.commit\s*\}\}/);
    expect(source).toContain('pnpm run check:manifest-lock');
    expect(source).toContain('pnpm run security:advisories');
    expect(source).toContain('pnpm run security:build-scripts');
    expect(source).toContain('pnpm install --frozen-lockfile');
    expect((source.match(/pnpm quality/g) ?? []).length).toBe(1);
    expect(source).toContain('.release/quality/artifact.json');
    expect(source).toMatch(/node scripts\/release\/preview\.mjs .*--expected-version .*inputs\.version.*--expected-commit .*inputs\.commit/);
    expect(source).not.toContain('release:dry-run');
    expect(source).toMatch(/Release Preview|release-preview/);
    expect(source).not.toMatch(/\bgit\s+(tag|push)\b|gh\s+release|create-release/i);
  });

  it('deploy accepts only a smoke-passed artifact identity and keeps approval boundaries without building', async () => {
    const source = await workflow('deploy.yml');
    expect(source).toContain('workflow_dispatch:');
    expect(source).toContain('artifactPath:');
    expect(source).toContain('artifactSha256:');
    expect(source).toContain('artifactVersion:');
    expect(source).toContain('artifactCommit:');
    expect(source).toContain('targetEnvironment:');
    expect(source).toContain('releaseSmokePassed:');
    expect(source).toContain('deployment-approval');
    expect(source).toContain('production-binding');
    expect(source).toContain('production-write-approval');
    expect(source).toContain('pnpm deploy:preflight');
    expect(source).toContain('pnpm deploy:activate');
    expect(source).toContain('pnpm deploy:health');
    expect(source).toContain('pnpm deploy:rollback');
    expect(source).toMatch(/if:\s*\$\{\{[^\n]*failure\(\)/);
    const preflightCommand = source.split('\n').find((line) => line.includes('pnpm deploy:preflight')) ?? '';
    expect(preflightCommand).not.toBe('');
    expect(preflightCommand).toContain('--environment "${{ inputs.targetEnvironment }}"');
    expect(preflightCommand).toContain('--artifact-sha256 "${{ inputs.artifactSha256 }}"');
    expect(preflightCommand).toContain('--artifact-version "${{ inputs.artifactVersion }}"');
    expect(preflightCommand).toContain('--artifact-commit "${{ inputs.artifactCommit }}"');
    expect(preflightCommand).toContain('--smoke-passed "${{ inputs.releaseSmokePassed }}"');
    expect(source).not.toMatch(/test\s+-[ne]\s+.*ARTIFACT|RELEASE_SMOKE_PASSED.*test/i);
    expect(source).not.toMatch(/pnpm\s+(build|package:pack)|pnpm\s+quality/);
    expect(source).not.toMatch(/secrets\.(PRODUCTION|PROD|HOST|CLIENT)/i);
  });
});
