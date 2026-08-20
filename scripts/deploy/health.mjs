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
  writeJson,
} from './preflight.mjs';

function parseHealthArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--input' && argument !== '--activation' && argument !== '--output') {
      throw new Error(`unknown option: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} requires a path`);
    }
    options[argument.slice(2)] = resolve(value);
    index += 1;
  }
  if (!options.input || !options.activation || !options.output) {
    throw new Error('usage: health.mjs --input <json> --activation <json> --output <json>');
  }
  return options;
}

function failedEvidence(error, extra = {}) {
  return {
    stage: 'health',
    status: 'failed',
    rollbackRequired: true,
    error: error instanceof Error ? error.message : String(error),
    ...extra,
  };
}

async function loadHealthContext(inputPath, activationPath) {
  const input = await readJson(inputPath);
  const activation = await readJson(activationPath);
  if (activation.stage !== 'activate' || activation.status !== 'passed') {
    throw new Error('activation evidence must have stage=activate and status=passed');
  }
  const normalized = await validateDeploymentInput(input);
  if (activation.environment !== normalized.environment || !sameArtifact(activation.artifact, normalized.artifact)) {
    throw new Error('activation evidence does not match deployment input');
  }
  if (activation.activeRelease?.releasePath !== normalized.installation.candidateRelease) {
    throw new Error('activation evidence does not point to the candidate release');
  }
  const deploymentApproval = validateDeploymentApproval(input.deploymentApproval, normalized.environment, normalized.artifact);
  return { normalized, activation, deploymentApproval };
}

export async function runHealth(inputPath, activationPath) {
  const { normalized, activation, deploymentApproval } = await loadHealthContext(inputPath, activationPath);
  const { installation, commands, artifact, environment } = normalized;
  const activePointer = await readActivePointer(installation.activeReleaseFile);
  assertReleasePath(activePointer, installation.candidateRelease);
  if (activePointer.artifact?.sha256 !== artifact.sha256
    || activePointer.artifact?.version !== artifact.version
    || activePointer.artifact?.commit !== artifact.commit) {
    throw new Error('active release pointer artifact does not match deployment input');
  }

  const result = await runCommand(commands.health, {
    cwd: installation.candidateRelease,
    environment,
    releasePath: installation.candidateRelease,
    stage: 'health',
  });
  if (result.code !== 0) {
    return failedEvidence(new Error(`health command exited with ${result.code}`), {
      environment,
      artifact,
      deploymentApproval,
      activeRelease: activePointer,
      command: { code: result.code, signal: result.signal },
    });
  }

  return {
    stage: 'health',
    status: 'passed',
    rollbackRequired: false,
    environment,
    artifact,
    deploymentApproval,
    activeRelease: activePointer,
    activationArtifact: activation.artifact,
  };
}

async function main() {
  const options = parseHealthArgs(process.argv.slice(2));
  let evidence;
  try {
    evidence = await runHealth(options.input, options.activation);
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
    process.stderr.write(`deployment health failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
