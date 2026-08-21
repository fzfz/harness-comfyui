const EXACT_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

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
