import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const spawnAsync = promisify(spawn);
const repositoryRoot = resolve(import.meta.dirname, '../..');
const preflightScript = join(repositoryRoot, 'scripts/deploy/preflight.mjs');
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createFixture(environment = 'fixture-a') {
  const root = await mkdtemp(join(tmpdir(), 'harness-deploy-'));
  temporaryRoots.push(root);
  const releaseRoot = join(root, 'releases');
  const previousRelease = join(releaseRoot, `${environment}-previous`);
  const candidateRelease = join(releaseRoot, `${environment}-candidate`);
  const activeReleaseFile = join(releaseRoot, 'active.json');
  const commandLog = join(root, 'commands.log');
  await mkdir(previousRelease, { recursive: true });
  await mkdir(candidateRelease, { recursive: true });
  await writeFile(activeReleaseFile, JSON.stringify({ releasePath: previousRelease }), 'utf8');
  await writeFile(commandLog, '', 'utf8');

  const tarballPath = join(root, 'harness-comfyui-0.1.0-fixture.tgz');
  const tarball = Buffer.from('fixture release artifact\n', 'utf8');
  await writeFile(tarballPath, tarball);

  const command = (exitCode = 0) => [
    process.execPath,
    '-e',
    `require('node:fs').appendFileSync(${JSON.stringify(commandLog)}, process.env.DEPLOYMENT_STAGE + '\\n'); process.exit(${exitCode});`,
  ];

  return {
    root,
    inputPath: join(root, 'preflight-input.json'),
    outputPath: join(root, 'preflight-output.json'),
    activationPath: join(root, 'activation-output.json'),
    healthPath: join(root, 'health-output.json'),
    rollbackPath: join(root, 'rollback-output.json'),
    commandLog,
    input: {
      environment,
      artifact: {
        tarballPath,
        version: '0.1.0-fixture.1',
        commit: '0123456789abcdef0123456789abcdef01234567',
        byteLength: tarball.byteLength,
        sha256: createHash('sha256').update(tarball).digest('hex'),
        smokePassed: true,
      },
      deploymentApproval: {
        approved: true,
        id: 'fixture-approval-1',
        environment,
        artifactSha256: createHash('sha256').update(tarball).digest('hex'),
      },
      installation: {
        root: releaseRoot,
        activeReleaseFile,
        candidateRelease,
        previousRelease,
      },
      commands: {
        stop: command(),
        start: command(),
        health: command(),
      },
    },
  };
}

async function runNode(script: string, args: string[]) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, PATH: [process.env.PATH, join(repositoryRoot, 'node_modules/.bin')].filter(Boolean).join(delimiter) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const [stdout, stderr] = await Promise.all([
    new Promise<string>((resolveOutput) => {
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stdout.on('end', () => resolveOutput(output));
    }),
    new Promise<string>((resolveOutput) => {
      let output = '';
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.stderr.on('end', () => resolveOutput(output));
    }),
  ]);
  const exitCode = await new Promise<number>((resolveExit) => child.on('close', (code) => resolveExit(code ?? 1)));
  return { exitCode, stdout, stderr };
}

function expectedIdentityArgs(fixture: Awaited<ReturnType<typeof createFixture>>, overrides: Record<string, string> = {}) {
  const values = {
    '--environment': fixture.input.environment,
    '--artifact-sha256': fixture.input.artifact.sha256,
    '--artifact-version': fixture.input.artifact.version,
    '--artifact-commit': fixture.input.artifact.commit,
    '--smoke-passed': 'true',
    ...overrides,
  };
  return Object.entries(values).flatMap(([flag, value]) => [flag, value]);
}

async function prepareLegacyActivation(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const artifact = fixture.input.artifact;
  const identity = {
    version: artifact.version,
    commit: artifact.commit,
    sha256: artifact.sha256,
    byteLength: artifact.byteLength,
  };
  await writeFile(fixture.input.installation.activeReleaseFile, JSON.stringify({
    releasePath: fixture.input.installation.candidateRelease,
    environment: fixture.input.environment,
    artifact: identity,
  }), 'utf8');
  await writeFile(fixture.activationPath, JSON.stringify({
    stage: 'activate',
    status: 'passed',
    environment: fixture.input.environment,
    artifact,
    deploymentApproval: fixture.input.deploymentApproval,
    previousRelease: { releasePath: fixture.input.installation.previousRelease },
    activeRelease: {
      releasePath: fixture.input.installation.candidateRelease,
      environment: fixture.input.environment,
      artifact: identity,
    },
  }), 'utf8');
}

async function runProductActivation(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  installation: { root: string; installationId: string },
  candidate: Record<string, unknown>,
  outputPath: string,
) {
  const scriptPath = join(fixture.root, 'activate-product-helper.mjs');
  await writeFile(scriptPath, `import { writeFile } from 'node:fs/promises'
import { activateProductRelease } from ${JSON.stringify(pathToFileURL(join(repositoryRoot, 'scripts/deploy/activate.mjs')).href)}
const installation = JSON.parse(process.argv[2])
const candidate = JSON.parse(process.argv[3])
const outputPath = process.argv[4]
try {
  const evidence = await activateProductRelease(installation, candidate)
  await writeFile(outputPath, JSON.stringify(evidence) + '\\n', 'utf8')
} catch (error) {
  process.stderr.write(String(error?.message ?? error) + '\\n')
  process.exitCode = 1
}
`, 'utf8');
  return runNode(scriptPath, [JSON.stringify(installation), JSON.stringify(candidate), outputPath]);
}

describe('deployment public CLIs', () => {
  it('preflight accepts an isolated fixture release with a verified artifact identity', async () => {
    const fixture = await createFixture();
    await writeFile(fixture.inputPath, JSON.stringify(fixture.input), 'utf8');

    const result = await runNode(preflightScript, [
      '--input', fixture.inputPath,
      '--output', fixture.outputPath,
      ...expectedIdentityArgs(fixture),
    ]);

    expect(result.exitCode, result.stderr).toBe(0);
    const evidence = JSON.parse(await readFile(fixture.outputPath, 'utf8')) as Record<string, unknown>;
    expect(evidence).toMatchObject({ stage: 'preflight', status: 'passed', environment: 'fixture-a' });
    expect(evidence.artifact).toMatchObject(fixture.input.artifact);
  });

  it('activateProductRelease atomically switches the product state and records the previous release', async () => {
    const fixture = await createFixture();
    const root = join(fixture.root, 'product-installation');
    const previousRelease = join(root, 'releases/0.1.0-fixture.1');
    const candidateRelease = join(root, 'releases/0.1.0-fixture.2');
    const statePath = join(root, 'state/active-release.json');
    const outputPath = join(fixture.root, 'activation-product-output.json');
    await mkdir(previousRelease, { recursive: true });
    await mkdir(candidateRelease, { recursive: true });
    await mkdir(join(root, 'state'), { recursive: true });
    await writeFile(statePath, JSON.stringify({
      schemaVersion: 1,
      installationId: 'product-fixture',
      activeVersion: '0.1.0-fixture.1',
      releasePath: previousRelease,
      previousRelease: null,
    }), 'utf8');

    const result = await runProductActivation(fixture, { root, installationId: 'product-fixture' }, {
      activeVersion: '0.1.0-fixture.2',
      releasePath: candidateRelease,
    }, outputPath);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({
      schemaVersion: 1,
      installationId: 'product-fixture',
      activeVersion: '0.1.0-fixture.2',
      releasePath: candidateRelease,
      previousRelease: { activeVersion: '0.1.0-fixture.1', releasePath: previousRelease },
    });
    expect(JSON.parse(await readFile(outputPath, 'utf8')).active.previousRelease).toEqual({
      activeVersion: '0.1.0-fixture.1',
      releasePath: previousRelease,
    });
  });

  it('activateProductRelease rejects a non-exact candidate shape without changing active state', async () => {
    const fixture = await createFixture();
    const root = join(fixture.root, 'product-installation');
    const previousRelease = join(root, 'releases/0.1.0-fixture.1');
    const candidateRelease = join(root, 'releases/0.1.0-fixture.2');
    const statePath = join(root, 'state/active-release.json');
    const outputPath = join(fixture.root, 'activation-product-invalid-output.json');
    await mkdir(previousRelease, { recursive: true });
    await mkdir(candidateRelease, { recursive: true });
    await mkdir(join(root, 'state'), { recursive: true });
    const before = JSON.stringify({
      schemaVersion: 1,
      installationId: 'product-fixture',
      activeVersion: '0.1.0-fixture.1',
      releasePath: previousRelease,
      previousRelease: null,
    });
    await writeFile(statePath, before, 'utf8');

    const result = await runProductActivation(fixture, { root, installationId: 'product-fixture' }, {
      artifact: { version: '0.1.0-fixture.2' },
      releasePath: candidateRelease,
    }, outputPath);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/only activeVersion and releasePath/u);
    expect(await readFile(statePath, 'utf8')).toBe(before);
  });

  it('health checks the active fixture after activation without changing its release pointer', async () => {
    const fixture = await createFixture();
    await writeFile(fixture.inputPath, JSON.stringify(fixture.input), 'utf8');
    expect((await runNode(preflightScript, ['--input', fixture.inputPath, '--output', fixture.outputPath])).exitCode).toBe(0);
    await prepareLegacyActivation(fixture);

    const result = await runNode(join(repositoryRoot, 'scripts/deploy/health.mjs'), [
      '--input', fixture.inputPath,
      '--activation', fixture.activationPath,
      '--output', fixture.healthPath,
    ]);

    expect(result.exitCode, result.stderr).toBe(0);
    const evidence = JSON.parse(await readFile(fixture.healthPath, 'utf8')) as Record<string, any>;
    expect(evidence).toMatchObject({ stage: 'health', status: 'passed', environment: 'fixture-a', rollbackRequired: false });
    const activePointer = JSON.parse(await readFile(fixture.input.installation.activeReleaseFile, 'utf8')) as Record<string, any>;
    expect(activePointer.releasePath).toBe(fixture.input.installation.candidateRelease);
  });

  it('health failure produces rollback evidence and rollback restores the previous fixture explicitly', async () => {
    const fixture = await createFixture();
    fixture.input.commands.health = [process.execPath, '-e', 'process.exit(1)'];
    await writeFile(fixture.inputPath, JSON.stringify(fixture.input), 'utf8');
    expect((await runNode(preflightScript, ['--input', fixture.inputPath, '--output', fixture.outputPath])).exitCode).toBe(0);
    await prepareLegacyActivation(fixture);
    const health = await runNode(join(repositoryRoot, 'scripts/deploy/health.mjs'), [
      '--input', fixture.inputPath,
      '--activation', fixture.activationPath,
      '--output', fixture.healthPath,
    ]);
    expect(health.exitCode).toBe(1);
    expect(JSON.parse(await readFile(fixture.healthPath, 'utf8'))).toMatchObject({
      stage: 'health',
      status: 'failed',
      rollbackRequired: true,
    });

    const result = await runNode(join(repositoryRoot, 'scripts/deploy/rollback.mjs'), [
      '--input', fixture.inputPath,
      '--activation', fixture.activationPath,
      '--health', fixture.healthPath,
      '--output', fixture.rollbackPath,
    ]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(await readFile(fixture.rollbackPath, 'utf8'))).toMatchObject({
      stage: 'rollback',
      status: 'passed',
      restoredRelease: { releasePath: fixture.input.installation.previousRelease },
    });
    const activePointer = JSON.parse(await readFile(fixture.input.installation.activeReleaseFile, 'utf8')) as Record<string, any>;
    expect(activePointer.releasePath).toBe(fixture.input.installation.previousRelease);
    expect((await readFile(fixture.commandLog, 'utf8')).trim().split('\n')).toEqual(['rollback.stop', 'rollback.start']);
  });

  it('keeps preflight and approval checks scoped to the legacy deployment fixture', async () => {
    const productionFixture = await createFixture();
    productionFixture.input.environment = 'production';
    await writeFile(productionFixture.inputPath, JSON.stringify(productionFixture.input), 'utf8');
    const productionResult = await runNode(preflightScript, ['--input', productionFixture.inputPath, '--output', productionFixture.outputPath]);
    expect(productionResult.exitCode).toBe(1);

    const approvalFixture = await createFixture();
    delete (approvalFixture.input as Record<string, unknown>).deploymentApproval;
    await writeFile(approvalFixture.inputPath, JSON.stringify(approvalFixture.input), 'utf8');
    expect((await runNode(preflightScript, ['--input', approvalFixture.inputPath, '--output', approvalFixture.outputPath])).exitCode).toBe(0);
    expect((await readFile(approvalFixture.outputPath, 'utf8')).length).toBeGreaterThan(0);
  });

  it.each([
    ['--environment', 'fixture-b'],
    ['--artifact-sha256', '0'.repeat(64)],
    ['--artifact-version', '0.1.0-fixture.2'],
    ['--artifact-commit', 'fedcba9876543210fedcba9876543210fedcba98'],
    ['--smoke-passed', 'false'],
  ])('rejects dispatch %s values that differ from the structured input', async (flag, value) => {
    const fixture = await createFixture();
    await writeFile(fixture.inputPath, JSON.stringify(fixture.input), 'utf8');
    const mismatch = await runNode(preflightScript, [
      '--input', fixture.inputPath,
      '--output', fixture.outputPath,
      ...expectedIdentityArgs(fixture, { [flag]: value }),
    ]);
    expect(mismatch.exitCode).toBe(1);
  });

  it('requires all expected identity parameters when workflow mode is used', async () => {
    const fixture = await createFixture();
    await writeFile(fixture.inputPath, JSON.stringify(fixture.input), 'utf8');
    const partial = await runNode(preflightScript, [
      '--input', fixture.inputPath,
      '--output', fixture.outputPath,
      '--environment', fixture.input.environment,
    ]);
    expect(partial.exitCode).toBe(1);
  });

  it('rejects duplicate expected identity parameters and malformed smoke values', async () => {
    const duplicateFixture = await createFixture();
    await writeFile(duplicateFixture.inputPath, JSON.stringify(duplicateFixture.input), 'utf8');
    const duplicate = await runNode(preflightScript, [
      '--input', duplicateFixture.inputPath,
      '--output', duplicateFixture.outputPath,
      ...expectedIdentityArgs(duplicateFixture),
      '--environment', duplicateFixture.input.environment,
    ]);
    expect(duplicate.exitCode).toBe(1);

    const malformedFixture = await createFixture();
    await writeFile(malformedFixture.inputPath, JSON.stringify(malformedFixture.input), 'utf8');
    const malformed = await runNode(preflightScript, [
      '--input', malformedFixture.inputPath,
      '--output', malformedFixture.outputPath,
      ...expectedIdentityArgs(malformedFixture, { '--smoke-passed': 'TRUE' }),
    ]);
    expect(malformed.exitCode).toBe(1);
  });
});
