import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
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

  it.each(['fixture-a', 'fixture-b'])('activate stops the %s fixture, switches the active pointer, and starts the candidate', async (environment) => {
    const fixture = await createFixture(environment);
    await writeFile(fixture.inputPath, JSON.stringify(fixture.input), 'utf8');

    const preflight = await runNode(preflightScript, ['--input', fixture.inputPath, '--output', fixture.outputPath]);
    expect(preflight.exitCode, preflight.stderr).toBe(0);
    const result = await runNode(join(repositoryRoot, 'scripts/deploy/activate.mjs'), [
      '--input', fixture.inputPath,
      '--preflight', fixture.outputPath,
      '--output', fixture.activationPath,
    ]);

    expect(result.exitCode, result.stderr).toBe(0);
    const evidence = JSON.parse(await readFile(fixture.activationPath, 'utf8')) as Record<string, any>;
    expect(evidence).toMatchObject({ stage: 'activate', status: 'passed', environment });
    expect(evidence.activeRelease.releasePath).toBe(fixture.input.installation.candidateRelease);
    const activePointer = JSON.parse(await readFile(fixture.input.installation.activeReleaseFile, 'utf8')) as Record<string, any>;
    expect(activePointer.releasePath).toBe(fixture.input.installation.candidateRelease);
    expect((await readFile(fixture.commandLog, 'utf8')).trim().split('\n')).toEqual(['activate.stop', 'activate.start']);
  });

  it('health checks the active fixture after activation without changing its release pointer', async () => {
    const fixture = await createFixture();
    await writeFile(fixture.inputPath, JSON.stringify(fixture.input), 'utf8');
    expect((await runNode(preflightScript, ['--input', fixture.inputPath, '--output', fixture.outputPath])).exitCode).toBe(0);
    expect((await runNode(join(repositoryRoot, 'scripts/deploy/activate.mjs'), [
      '--input', fixture.inputPath,
      '--preflight', fixture.outputPath,
      '--output', fixture.activationPath,
    ])).exitCode).toBe(0);

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
    expect((await runNode(join(repositoryRoot, 'scripts/deploy/activate.mjs'), [
      '--input', fixture.inputPath,
      '--preflight', fixture.outputPath,
      '--output', fixture.activationPath,
    ])).exitCode).toBe(0);
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
    expect((await readFile(fixture.commandLog, 'utf8')).trim().split('\n')).toEqual(['activate.stop', 'activate.start', 'rollback.stop', 'rollback.start']);
  });

  it('stops activation immediately when stopping the previous fixture fails', async () => {
    const fixture = await createFixture();
    fixture.input.commands.stop = [process.execPath, '-e', 'process.exit(1)'];
    await writeFile(fixture.inputPath, JSON.stringify(fixture.input), 'utf8');
    expect((await runNode(preflightScript, ['--input', fixture.inputPath, '--output', fixture.outputPath])).exitCode).toBe(0);

    const result = await runNode(join(repositoryRoot, 'scripts/deploy/activate.mjs'), [
      '--input', fixture.inputPath,
      '--preflight', fixture.outputPath,
      '--output', fixture.activationPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(await readFile(fixture.activationPath, 'utf8'))).toMatchObject({
      stage: 'activate', status: 'failed', failedAt: 'stop',
    });
    const activePointer = JSON.parse(await readFile(fixture.input.installation.activeReleaseFile, 'utf8')) as Record<string, any>;
    expect(activePointer.releasePath).toBe(fixture.input.installation.previousRelease);
    expect((await readFile(fixture.commandLog, 'utf8')).trim()).toBe('');
  });

  it('restores the previous fixture when candidate startup fails', async () => {
    const fixture = await createFixture();
    fixture.input.commands.start = [
      process.execPath,
      '-e',
      `require('node:fs').appendFileSync(${JSON.stringify(fixture.commandLog)}, process.env.DEPLOYMENT_STAGE + '\\n'); if (process.env.DEPLOYMENT_RELEASE_PATH === ${JSON.stringify(fixture.input.installation.candidateRelease)}) process.exit(1);`,
    ];
    await writeFile(fixture.inputPath, JSON.stringify(fixture.input), 'utf8');
    expect((await runNode(preflightScript, ['--input', fixture.inputPath, '--output', fixture.outputPath])).exitCode).toBe(0);

    const result = await runNode(join(repositoryRoot, 'scripts/deploy/activate.mjs'), [
      '--input', fixture.inputPath,
      '--preflight', fixture.outputPath,
      '--output', fixture.activationPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(await readFile(fixture.activationPath, 'utf8'))).toMatchObject({
      stage: 'activate', status: 'failed', failedAt: 'start', rollback: { status: 'passed' },
    });
    const activePointer = JSON.parse(await readFile(fixture.input.installation.activeReleaseFile, 'utf8')) as Record<string, any>;
    expect(activePointer.releasePath).toBe(fixture.input.installation.previousRelease);
    expect((await readFile(fixture.commandLog, 'utf8')).trim().split('\n')).toEqual(['activate.stop', 'activate.start', 'activate.rollback-start']);
  });

  it('blocks production and missing deployment approval before running fixture commands', async () => {
    const productionFixture = await createFixture();
    productionFixture.input.environment = 'production';
    await writeFile(productionFixture.inputPath, JSON.stringify(productionFixture.input), 'utf8');
    const productionResult = await runNode(preflightScript, ['--input', productionFixture.inputPath, '--output', productionFixture.outputPath]);
    expect(productionResult.exitCode).toBe(1);

    const approvalFixture = await createFixture();
    delete (approvalFixture.input as Record<string, unknown>).deploymentApproval;
    await writeFile(approvalFixture.inputPath, JSON.stringify(approvalFixture.input), 'utf8');
    expect((await runNode(preflightScript, ['--input', approvalFixture.inputPath, '--output', approvalFixture.outputPath])).exitCode).toBe(0);
    const approvalResult = await runNode(join(repositoryRoot, 'scripts/deploy/activate.mjs'), [
      '--input', approvalFixture.inputPath,
      '--preflight', approvalFixture.outputPath,
      '--output', approvalFixture.activationPath,
    ]);
    expect(approvalResult.exitCode).toBe(1);
    expect(JSON.parse(await readFile(approvalFixture.activationPath, 'utf8'))).toMatchObject({ stage: 'activate', status: 'failed' });
    expect((await readFile(approvalFixture.commandLog, 'utf8')).trim()).toBe('');
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
