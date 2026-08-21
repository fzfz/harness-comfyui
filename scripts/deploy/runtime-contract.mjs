const EXACT_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

const RUNTIME_WORKSPACE_POLICY = Object.freeze({
  strictDepBuilds: true,
  allowBuilds: Object.freeze({
    '@deepseek-ai/dsh-subprocess-local@0.1.0-rc.7': true,
    '@google/genai@1.52.0': true,
    'koffi@3.1.5': true,
    'node-pty@1.2.0-beta.15': true,
    'protobufjs@7.6.5': true,
  }),
  overrides: Object.freeze({
    'brace-expansion@>=5.0.0 <5.0.9': '5.0.9',
    'fast-uri@>=3.0.0 <3.1.5': '3.1.5',
    'ip-address@>=10.0.0 <10.3.1': '10.3.1',
    'js-yaml@>=4.0.0 <4.3.1': '4.3.1',
    'nanoid@>=3.0.0 <3.3.18': '3.3.18',
    'postcss@>=8.0.0 <8.5.23': '8.5.23',
    'undici@>=7.0.0 <7.29.0': '7.29.0',
  }),
})

export const RUNTIME_DEPENDENCY_POLICY = Object.freeze({
  packages: Object.freeze([
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-web-app',
  ]),
  install: Object.freeze({
    strictDepBuilds: true,
    strictPeerDependencies: true,
  }),
  workspace: RUNTIME_WORKSPACE_POLICY,
})

export function readPnpmPackageManagerVersion(manifest, label = 'package.json') {
  const packageManager = manifest?.packageManager
  if (typeof packageManager !== 'string' || packageManager.length === 0) {
    throw new Error(`${label}.packageManager must be pnpm@<exact-version>`)
  }
  const match = /^pnpm@(.+)$/u.exec(packageManager)
  if (match === null || !EXACT_VERSION_PATTERN.test(match[1])) {
    throw new Error(`${label}.packageManager must be pnpm@<exact-version>`)
  }
  return match[1]
}

export function runtimeInstallNpmrc() {
  const { strictDepBuilds, strictPeerDependencies } = RUNTIME_DEPENDENCY_POLICY.install
  return `strict-dep-builds=${String(strictDepBuilds)}\nstrict-peer-dependencies=${String(strictPeerDependencies)}\n`
}

export function runtimeInstallEnvironment(environment) {
  const { strictDepBuilds, strictPeerDependencies } = RUNTIME_DEPENDENCY_POLICY.install
  const sanitized = { ...environment }
  for (const key of [
    'NPM_CONFIG_STRICT_DEP_BUILDS',
    'npm_config_strict_dep_builds',
    'NPM_CONFIG_STRICT_PEER_DEPENDENCIES',
    'npm_config_strict_peer_dependencies',
  ]) delete sanitized[key]
  return {
    ...sanitized,
    NPM_CONFIG_STRICT_DEP_BUILDS: String(strictDepBuilds),
    NPM_CONFIG_STRICT_PEER_DEPENDENCIES: String(strictPeerDependencies),
  }
}
