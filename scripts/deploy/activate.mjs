import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  artifactIdentity,
  assertReleasePath,
  readActivePointer,
  readJson,
  runCommand,
  sameArtifact,
  validateDeploymentApproval,
  validateDeploymentInput,
  writeActivePointer,
  writeJson,
} from './preflight.mjs';

function parseActivateArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--input' && argument !== '--preflight' && argument !== '--output') {
      throw new Error(`unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} requires a path`);
    }
    options[argument.slice(2)] = resolve(value);
    index += 1;
  }
  if (!options.input || !options.preflight || !options.output) {
    throw new Error('usage: activate.mjs --input <json> --preflight <json> --output <json>');
  }
  return options;
}

function failedEvidence(error, extra = {}) {
  return {
    stage: 'activate',
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
    ...extra,
  };
}

async function loadActivationContext(inputPath, preflightPath) {
  const input = await readJson(inputPath);
  const preflight = await readJson(preflightPath);
  if (preflight.stage !== 'preflight' || preflight.status !== 'passed') {
    throw new Error('preflight evidence must have stage=preflight and status=passed');
  }
  const normalized = await validateDeploymentInput(input);
  if (preflight.environment !== normalized.environment || !sameArtifact(preflight.artifact, normalized.artifact)) {
    throw new Error('preflight evidence does not match deployment input');
  }
  if (preflight.installation.candidateRelease !== normalized.installation.candidateRelease
    || preflight.installation.previousRelease !== normalized.installation.previousRelease
    || preflight.installation.activeReleaseFile !== normalized.installation.activeReleaseFile) {
    throw new Error('preflight installation paths do not match deployment input');
  }
  const deploymentApproval = validateDeploymentApproval(input.deploymentApproval, normalized.environment, normalized.artifact);
  return { normalized, preflight, deploymentApproval };
}

export async function runActivate(inputPath, preflightPath) {
  const { normalized, preflight, deploymentApproval } = await loadActivationContext(inputPath, preflightPath);
  const { installation, commands, artifact, environment } = normalized;
  const previousPointer = await readActivePointer(installation.activeReleaseFile);
  assertReleasePath(previousPointer, installation.previousRelease);

  const stopped = await runCommand(commands.stop, {
    cwd: installation.previousRelease,
    environment,
    releasePath: installation.previousRelease,
    stage: 'activate.stop',
  });
  if (stopped.code !== 0) {
    return failedEvidence(new Error(`stop command exited with ${stopped.code}`), {
      failedAt: 'stop',
      activeRelease: previousPointer,
      command: { code: stopped.code, signal: stopped.signal },
    });
  }

  const candidatePointer = {
    releasePath: installation.candidateRelease,
    environment,
    artifact: artifactIdentity(artifact),
  };
  try {
    await writeActivePointer(installation.activeReleaseFile, candidatePointer);
  } catch (error) {
    return failedEvidence(error, { failedAt: 'switch', activeRelease: previousPointer });
  }

  const started = await runCommand(commands.start, {
    cwd: installation.candidateRelease,
    environment,
    releasePath: installation.candidateRelease,
    stage: 'activate.start',
  });
  if (started.code !== 0) {
    let rollbackError = null;
    let previousStart = null;
    try {
      await writeActivePointer(installation.activeReleaseFile, previousPointer);
      previousStart = await runCommand(commands.start, {
        cwd: installation.previousRelease,
        environment,
        releasePath: installation.previousRelease,
        stage: 'activate.rollback-start',
      });
      if (previousStart.code !== 0) {
        rollbackError = `previous release start command exited with ${previousStart.code}`;
      }
    } catch (error) {
      rollbackError = error.message;
    }
    return failedEvidence(new Error(`start command exited with ${started.code}`), {
      failedAt: 'start',
      activeRelease: await readActivePointer(installation.activeReleaseFile),
      command: { code: started.code, signal: started.signal },
      rollback: {
        status: rollbackError ? 'failed' : 'passed',
        error: rollbackError,
        previousStart: previousStart ? { code: previousStart.code, signal: previousStart.signal } : null,
      },
    });
  }

  return {
    stage: 'activate',
    status: 'passed',
    environment,
    artifact: artifact,
    deploymentApproval,
    previousRelease: previousPointer,
    activeRelease: candidatePointer,
    preflightArtifact: preflight.artifact,
  };
}

async function main() {
  const options = parseActivateArgs(process.argv.slice(2));
  let evidence;
  try {
    evidence = await runActivate(options.input, options.preflight);
  } catch (error) {
    evidence = failedEvidence(error);
  }
  await writeJson(options.output, evidence);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  if (evidence.status !== 'passed') {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`deployment activate failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
