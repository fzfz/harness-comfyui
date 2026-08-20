import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
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

function parseRollbackArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--input' && argument !== '--activation' && argument !== '--health' && argument !== '--output') {
      throw new Error(`unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} requires a path`);
    }
    options[argument.slice(2)] = resolve(value);
    index += 1;
  }
  if (!options.input || !options.activation || !options.health || !options.output) {
    throw new Error('usage: rollback.mjs --input <json> --activation <json> --health <json> --output <json>');
  }
  return options;
}

function failedEvidence(error, extra = {}) {
  return {
    stage: 'rollback',
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
    ...extra,
  };
}

async function loadRollbackContext(inputPath, activationPath, healthPath) {
  const input = await readJson(inputPath);
  const activation = await readJson(activationPath);
  const health = await readJson(healthPath);
  if (activation.stage !== 'activate' || activation.status !== 'passed') {
    throw new Error('activation evidence must have stage=activate and status=passed');
  }
  if (health.stage !== 'health' || health.status !== 'failed' || health.rollbackRequired !== true) {
    throw new Error('rollback requires failed health evidence with rollbackRequired=true');
  }
  const normalized = await validateDeploymentInput(input);
  if (activation.environment !== normalized.environment || !sameArtifact(activation.artifact, normalized.artifact)) {
    throw new Error('activation evidence does not match deployment input');
  }
  if (health.environment !== normalized.environment || !sameArtifact(health.artifact, normalized.artifact)) {
    throw new Error('health evidence does not match deployment input');
  }
  if (activation.activeRelease?.releasePath !== normalized.installation.candidateRelease) {
    throw new Error('activation evidence does not point to the candidate release');
  }
  const deploymentApproval = validateDeploymentApproval(input.deploymentApproval, normalized.environment, normalized.artifact);
  const previousRelease = activation.previousRelease;
  assertReleasePath(previousRelease, normalized.installation.previousRelease, 'activation previous release');
  return { normalized, activation, health, deploymentApproval, previousRelease };
}

export async function runRollback(inputPath, activationPath, healthPath) {
  const { normalized, activation, health, deploymentApproval, previousRelease } = await loadRollbackContext(inputPath, activationPath, healthPath);
  const { installation, commands, artifact, environment } = normalized;
  const activePointer = await readActivePointer(installation.activeReleaseFile);
  assertReleasePath(activePointer, installation.candidateRelease);

  const stopped = await runCommand(commands.stop, {
    cwd: installation.candidateRelease,
    environment,
    releasePath: installation.candidateRelease,
    stage: 'rollback.stop',
  });
  if (stopped.code !== 0) {
    return failedEvidence(new Error(`rollback stop command exited with ${stopped.code}`), {
      failedAt: 'stop',
      activeRelease: activePointer,
      command: { code: stopped.code, signal: stopped.signal },
    });
  }

  try {
    await writeActivePointer(installation.activeReleaseFile, previousRelease);
  } catch (error) {
    return failedEvidence(error, { failedAt: 'switch', activeRelease: activePointer });
  }

  const started = await runCommand(commands.start, {
    cwd: installation.previousRelease,
    environment,
    releasePath: installation.previousRelease,
    stage: 'rollback.start',
  });
  if (started.code !== 0) {
    return failedEvidence(new Error(`rollback start command exited with ${started.code}`), {
      failedAt: 'start',
      activeRelease: await readActivePointer(installation.activeReleaseFile),
      command: { code: started.code, signal: started.signal },
    });
  }

  return {
    stage: 'rollback',
    status: 'passed',
    environment,
    artifact,
    deploymentApproval,
    restoredRelease: previousRelease,
    healthFailure: healthSummary(activation, health),
  };
}

function healthSummary(activation, health) {
  return {
    activationArtifact: activation.artifact,
    failedAt: health.stage,
  };
}

async function main() {
  const options = parseRollbackArgs(process.argv.slice(2));
  let evidence;
  try {
    evidence = await runRollback(options.input, options.activation, options.health);
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
    process.stderr.write(`deployment rollback failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
