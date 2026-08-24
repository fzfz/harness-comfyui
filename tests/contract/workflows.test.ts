import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

describe('GitHub Actions source quality workflow', () => {
  it('runs the same source quality gates for pull requests and main pushes', () => {
    const source = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
    expect(source).toContain('pull_request:')
    expect(source).toContain('push:')
    expect(source).toContain('branches: [main]')
    expect(source).toContain('group: ci-${{ github.workflow }}-${{ github.ref }}')
    expect(source).toContain('actions/checkout@11d5960a326750d5838078e36cf38b85af677262')
    expect(source).toContain('actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020')
    expect(source).toContain('node-version-file: .node-version')
    expect(source).toContain('npm install --global pnpm@11.7.0')
    const preinstall = source.indexOf('pnpm run quality:preinstall')
    const install = source.indexOf('pnpm install --frozen-lockfile')
    const quality = source.indexOf('pnpm run quality:fast')
    expect(preinstall).toBeGreaterThanOrEqual(0)
    expect(install).toBeGreaterThan(preinstall)
    expect(quality).toBeGreaterThan(install)
    expect(source).not.toMatch(/artifact|deploy|package:pack|release:smoke|\.tgz/iu)
  })

  it('does not define deployment or release packaging workflows', () => {
    expect(existsSync(resolve(root, '.github/workflows/deploy.yml'))).toBe(false)
    expect(existsSync(resolve(root, '.github/workflows/release.yml'))).toBe(false)
  })
})
