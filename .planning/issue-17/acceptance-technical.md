# Issue #17 技术验收记录

## 验收边界

- 执行工作目录：`/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17`
- 候选 commit：`b48bc5b3d14dee510daa334480a405b8a9249deb`
- 分支：`codex/issue-17-session-binding`
- 验收日期：2026-08-24（Asia/Shanghai）
- 未跟踪 `node_modules` symlink：保留，不暂存
- 本记录不修改 source、tests、docs、config、version 或 release 文件

## 已读取的验收依据

- 仓库 `AGENTS.md`
- GitHub Issue #17：`gh issue view 17 --json body`
- `docs/v0.1/PRDS/16-workbench-session-preset-binding.md`
- `docs/operations/test-gates.md`
- `docs/operations/install-and-run.md`

## 初始工作区证据

```text
HEAD b48bc5b3d14dee510daa334480a405b8a9249deb
?? node_modules -> /Volumes/4Tdisk/work/AI2/harness-comfyui/node_modules
```

### 1. Contract（直接入口）

- 命令：`node_modules/.bin/vitest run tests/contract tests/deploy/deployment-scripts.test.ts tests/release-package/dry-run.test.ts tests/release-package/package-scripts.test.ts tests/security/audit-lockfile.test.ts tests/security/check-build-scripts.test.ts tests/security/check-manifest-lock.test.ts`
- 结果：PASS
- 退出码：`0`
- 命令耗时：约 `4.25s`
- 测试结果：`9` 个 Test Files 通过，`103` 个 Tests 通过

完整输出：

```text

 RUN  v4.1.8 /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17

release dry-run completed without publish or deployment actions
package artifact: /var/folders/td/trvrwv_d2bxb0ns9qgpmmlqm0000gn/T/harness-comfyui-package-TSO4GM/.release/quality/harness-comfyui-0.1.0-test.1.tgz (3fec6560dab8767aa346a99d67fefbffa29f48370837460f5a754faa33d82b9a)
package validated: harness-comfyui-0.1.0-test.1.tgz (566b6e41473cb92d73ecf8f3e79361df7bd301894c5abd27b91afb4f413d7e89)
package validated: harness-comfyui-0.1.0-test.1.tgz (3ab75ba090a2e2647c625aac9d308b174b453effea124e4c501065a17a07daa2)
package validated: harness-comfyui-0.1.0-test.1.tgz (e870e1f0074e362efe08087588fde6696eddc9222be2c42d448c3b47ff540145)
package validated: harness-comfyui-0.1.0-test.1.tgz (566b6e41473cb92d73ecf8f3e79361df7bd301894c5abd27b91afb4f413d7e89)

 Test Files  9 passed (9)
      Tests  103 passed (103)
   Start at  01:36:21
   Duration  4.03s (transform 369ms, setup 0ms, import 484ms, tests 12.33s, environment 1ms)

```

## 环境入口裁决

主线程裁决：上述 `pnpm run test:contract` 失败发生在 `pnpm` 依赖状态预检查，Vitest 未启动，因此不计为 contract 门禁结果，也不构成测试体重复执行。禁止设置 `CI` 触发 reinstall，禁止执行 install。后续门禁使用 `package.json` 已声明命令对应的直接可执行入口；每个实际测试体最多执行一次。

## 高成本门禁

按父线程指定顺序执行，每项命令最多执行一次；已通过的 binding/client/sidebar 31/31、tsc 不重复执行；不执行已知受 main 基线版本断言阻断的 `quality:fast`、`quality:artifact`、`test:coverage`。

### 1. `pnpm run test:contract`

- 结果：FAIL（命令执行约 0.81 秒）
- 退出码：`1`
- 后续门禁：按验收规则停止，未执行

完整输出：

```text
[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY

If you are running pnpm in CI, set the CI environment variable to "true", or set "confirmModulesPurge" to "false".
[ERROR] Command failed with exit code 1: pnpm install

pnpm: Command failed with exit code 1: pnpm install
    at getFinalError (file:///Users/fzfz/Library/pnpm/.tools/pnpm/11.7.0_tmp_31651_0/node_modules/pnpm/dist/pnpm.mjs:34109:14)
    at makeError (file:///Users/fzfz/Library/pnpm/.tools/pnpm/11.7.0_tmp_31651_0/node_modules/pnpm/dist/pnpm.mjs:36416:21)
    at getSyncResult (file:///Users/fzfz/Library/pnpm/.tools/pnpm/11.7.0_tmp_31651_0/node_modules/pnpm/dist/pnpm.mjs:38260:10)
    at spawnSubprocessSync (file:///Users/fzfz/Library/pnpm/.tools/pnpm/11.7.0_tmp_31651_0/node_modules/pnpm/dist/pnpm.mjs:38220:14)
    at runPnpmCli (file:///Users/fzfz/Library/pnpm/.tools/pnpm/11.7.0_tmp_31651_0/node_modules/pnpm/dist/pnpm.mjs:245101:5)
    at runDepsStatusCheck (file:///Users/fzfz/Library/pnpm/.tools/pnpm/11.7.0_tmp_31651_0/node_modules/pnpm/dist/pnpm.mjs:246833:7)
```

## 2. Build gate

### 2.1 `node_modules/.bin/tsc -b tsconfig.host.json`

- 结果：PASS
- 退出码：`0`
- 命令耗时：约 `1.01s`
- 标准输出：无

### 2.2 `node_modules/.bin/tsdown --config tsdown.config.ts`

- 结果：PASS
- 退出码：`0`
- 命令耗时：约 `2.29s`

完整输出：

```text
ℹ tsdown v0.22.2 powered by rolldown v1.1.5
ℹ config file: /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/tsdown.config.ts
ℹ entry: src/agent/plugin.ts
ℹ target: node22.19.0
ℹ tsconfig: tsconfig.json
ℹ entry: src/config/profile-validator.ts
ℹ target: node22.19.0
ℹ tsconfig: tsconfig.json
ℹ entry: src/index.ts, src/client/index.tsx
ℹ target: node22.19.0
ℹ tsconfig: tsconfig.json
ℹ entry: lib/types/src/index.js, lib/types/src/types.js
ℹ target: node22.19.0
ℹ tsconfig: tsconfig.json
ℹ entry: src/types.ts
ℹ target: node22.19.0
ℹ tsconfig: tsconfig.json
ℹ entry: lib/types/src/index.js
ℹ target: node22.19.0
ℹ tsconfig: tsconfig.json
ℹ Build start
ℹ Hint: consider adding deps.onlyBundle option to avoid unintended bundling of dependencies, or set deps.onlyBundle: false to disable this hint.
See more at https://tsdown.dev/options/dependencies#deps-onlybundle
Detected dependencies in bundle:
- @deepseek-ai/cosmokit
- @deepseek-ai/schemastery
ℹ lib/agent.js  3.43 kB │ gzip: 1.29 kB
ℹ 1 files, total: 3.43 kB
ℹ .local/typert-workspace/packages/harness-comfyui/lib/index.js  11.25 kB │ gzip: 3.50 kB
ℹ 1 files, total: 11.25 kB
✔ Build complete in 1015ms
ℹ lib/index.js  11.25 kB │ gzip: 3.50 kB
ℹ lib/types.js   0.01 kB │ gzip: 0.03 kB
ℹ 2 files, total: 11.26 kB
ℹ lib/config-profile-validator.js  36.84 kB │ gzip: 9.56 kB
ℹ 1 files, total: 36.84 kB
✔ Build complete in 2096ms
✔ Build complete in 2096ms
✔ Build complete in 2096ms
ℹ lib/types/types.d.ts  0.57 kB │ gzip: 0.31 kB
ℹ 1 files, total: 0.57 kB
✔ Build complete in 2108ms
ℹ lib/types/index.d.ts   1.94 kB │ gzip: 0.69 kB
ℹ lib/types/client.d.ts  0.57 kB │ gzip: 0.34 kB
ℹ 2 files, total: 2.51 kB
✔ Build complete in 2112ms
```

### 2.3 `node scripts/build/bundle-generated-typert.ts`

- 结果：PASS
- 退出码：`0`
- 命令耗时：约 `0.08s`

完整输出：

```text
ℹ entry: lib/typert.host.js
ℹ target: node22.19
ℹ tsconfig: tsconfig.json
ℹ Build start
ℹ entry: lib/typert.remote-client.js
ℹ target: es2022
ℹ tsconfig: tsconfig.json
ℹ Build start
ℹ Hint: consider adding deps.onlyBundle option to avoid unintended bundling of dependencies, or set deps.onlyBundle: false to disable this hint.
See more at https://tsdown.dev/options/dependencies#deps-onlybundle
Detected dependencies in bundle:
- zod
ℹ Hint: consider adding deps.onlyBundle option to avoid unintended bundling of dependencies, or set deps.onlyBundle: false to disable this hint.
See more at https://tsdown.dev/options/dependencies#deps-onlybundle
Detected dependencies in bundle:
- zod
✔ Build complete in 49ms
✔ Build complete in 49ms
```

### 2.4 `node scripts/build/tsdown-client-bundle.ts`

- 结果：PASS
- 退出码：`0`
- 命令耗时：约 `0.06s`

完整输出：

```text
ℹ entry: .local/build/client-entry.ts
ℹ target: es2022
ℹ tsconfig: tsconfig.json
ℹ Build start
ℹ lib/client.js      634.71 kB │ gzip: 94.99 kB
ℹ lib/client.js.map    1.08 MB
ℹ 2 files, total: 1.71 MB
✔ Build complete in 54ms
```


## 3. Pack

### `node scripts/release/pack.mjs`

- 结果：PASS
- 退出码：`0`
- 命令耗时：约 `0.52s`
- artifact：`/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz`
- artifact bytes：`未由该命令直接报告`
- artifact SHA-256：`7bf50b726ef19a086bb932dd24e1136b55cccb72b39135a99a7528ca59e591a1`

完整输出：

```text
package: harness-comfyui@0.1.3
Tarball Contents
agent-presets/harness-comfyui/agent.cordis.yml
agent-presets/harness-comfyui/preset.yml
config/base.json
config/environment-overrides.json
config/product-agent.json
config/profiles/development.json
config/profiles/production.json
config/profiles/release-smoke.json
config/profiles/test.json
config/source-contract-v0.82.2.json
cordis.patch.yml
deployment/runtime/package.json
deployment/runtime/pnpm-lock.yaml
deployment/runtime/pnpm-workspace.yaml
lib/agent.js
lib/client.js
lib/client.js.map
lib/config-profile-validator.js
lib/index.js
lib/typert.host.d.ts
lib/typert.host.js
lib/typert.host.js.map
lib/typert.remote-client.d.ts
lib/typert.remote-client.d.ts.map
lib/typert.remote-client.js
lib/typert.remote-client.js.map
lib/types.js
lib/types/client.d.ts
lib/types/index.d.ts
lib/types/types.d.ts
package.json
profiles/comfyui-workbench/cordis.patch.yml
profiles/comfyui-workbench/package.json
profiles/comfyui-workbench/pnpm-workspace.yaml
README.md
scripts/deploy/activate.mjs
scripts/deploy/cli.mjs
scripts/deploy/contracts.mjs
scripts/deploy/health.mjs
scripts/deploy/install.mjs
scripts/deploy/lifecycle.mjs
scripts/deploy/logs.mjs
scripts/deploy/preflight.mjs
scripts/deploy/restart.mjs
scripts/deploy/runtime-contract.mjs
scripts/deploy/start.mjs
scripts/deploy/status.mjs
scripts/deploy/stop.mjs
scripts/deploy/upgrade.mjs
Tarball Details
/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz
package artifact: /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz (7bf50b726ef19a086bb932dd24e1136b55cccb72b39135a99a7528ca59e591a1)
```

## 4. Validate

### 4.1 `node scripts/release/validate-package.mjs`

- 结果：PASS
- 退出码：`0`
- 命令耗时：约 `0.00s`

完整输出：

```text
package validated: harness-comfyui-0.1.3.tgz (7bf50b726ef19a086bb932dd24e1136b55cccb72b39135a99a7528ca59e591a1)
```

### 4.2 `node_modules/.bin/vitest run tests/build-artifacts.test.ts tests/release-package/runtime-closure.test.ts`

- 结果：PASS
- 退出码：`0`
- 命令耗时：约 `2.36s`
- 测试结果：`2` 个 Test Files 通过，`3` 个 Tests 通过

完整输出：

```text

 RUN  v4.1.8 /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17


 Test Files  2 passed (2)
      Tests  3 passed (3)
   Start at  01:38:28
   Duration  2.13s (transform 73ms, setup 0ms, import 225ms, tests 2.27s, environment 0ms)

```

## 5. Deploy

### `node_modules/.bin/vitest run tests/deploy --maxWorkers=1 --no-file-parallelism`

- 结果：FAIL
- 测试体实际失败后按规则终止同一前台 Vitest session，未重试
- Vitest 失败测试文件耗时：`255827ms`
- 最终进程退出码：`130`（失败已出现后发送终止信号）
- 后续 Composition、E2E、Release smoke：未执行

完整已观察输出：

```text

 RUN  v4.1.8 /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17

 ❯ tests/deploy/artifact-upgrade-rollback.test.ts (4 tests | 4 failed) 255827ms
     × upgrades the verified artifact to one candidate Host and exits the foreground upgrade on external stop 73133ms
     × start failure restores the original active release and healthy Host 55048ms
     × health failure restores the original active release and healthy Host 63838ms
     × rolls back the active candidate to previous release, keeps health passing, and exits both foreground commands on stop 63807ms
```

测试体在报告上述 4 个失败后没有输出更具体的断言堆栈；主线程已收到失败文件、测试名称、耗时和终止退出码。

## 失败后只读状态

- `git status --short --branch`：仍为 `codex/issue-17-session-binding`，仅有未跟踪 `node_modules` symlink；未发现 source、tests、docs、config、version 或 release 文件变更。
- `ps` 检查：前台 Deploy Vitest 已退出，未发现 `vitest run tests/deploy`、`artifact-upgrade-rollback` 或该 worktree 的残留测试进程。
- production installation：未创建。
- production Host：未启动。
- 使用过的 Pack artifact：`/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz`。
- Pack artifact SHA-256：`7bf50b726ef19a086bb932dd24e1136b55cccb72b39135a99a7528ca59e591a1`。

## Deploy diagnosis Phase 1

### 指定单场景反馈环

- 命令：`node_modules/.bin/vitest run tests/deploy/artifact-upgrade-rollback.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose -t "upgrades the verified artifact to one candidate Host and exits the foreground upgrade on external stop"`
- 执行次数：1 次
- 结果：FAIL；Vitest 自然退出，未发送终止信号
- 退出码：`1`
- 失败测试耗时：`53596ms`
- Vitest 总耗时：`53.76s`
- 测试汇总：`1` failed，`3` skipped，`1` 个测试文件 failed
- 诊断结论：失败发生在 `installAndStartFixture()` 的 `fixture.preflight()`，测试尚未进入 candidate Host upgrade 生命周期。

完整 stdout/stderr 合并捕获：

```text

 RUN  v4.1.8 /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17

 × tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > upgrades the verified artifact to one candidate Host and exits the foreground upgrade on external stop 53596ms
   → promise rejected "Error: product CLI preflight failed with …" instead of resolving
 ↓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > start failure restores the original active release and healthy Host
 ↓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > health failure restores the original active release and healthy Host
 ↓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > rolls back the active candidate to previous release, keeps health passing, and exits both foreground commands on stop

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > upgrades the verified artifact to one candidate Host and exits the foreground upgrade on external stop
AssertionError: promise rejected "Error: product CLI preflight failed with …" instead of resolving
 ❯ installAndStartFixture tests/deploy/artifact-upgrade-rollback.test.ts:101:36

     99|   const fixture = await createProfileFixture({ configuration: 'test' })
    100|   fixtures.push(fixture)
    101|   await expect(fixture.preflight()).resolves.toMatchObject({ stage: 'p…
       |                                    ^
    102|   await fixture.install()
    103|   await fixture.start()
 ❯ tests/deploy/artifact-upgrade-rollback.test.ts:175:21

Caused by: Error: product CLI preflight failed with 1: harness-comfyui: pnpm version must be 11.7.0, got 10.32.1
npm notice
npm notice New minor version of npm available! 11.11.1 -> 11.19.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.19.0
npm notice To update run: npm install -g npm@11.19.0
npm notice

 ❯ parseJsonResult src/testing/profile-fixture.ts:340:32
 ❯ ProfileFixtureImpl.preflight src/testing/profile-fixture.ts:470:12
 ❯ installAndStartFixture tests/deploy/artifact-upgrade-rollback.test.ts:101:3
 ❯ tests/deploy/artifact-upgrade-rollback.test.ts:175:21

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  01:46:14
   Duration  53.76s (transform 37ms, setup 0ms, import 52ms, tests 53.60s, environment 0ms)

```

### 资源清理只读检查

- 进程检查：`pgrep -af '[v]itest.*artifact-upgrade-rollback|[h]arness-comfyui-issue-17/.*/harness-comfyui'` 无输出；未发现 Vitest、artifact-upgrade-rollback 或 Harness Host 残留进程。
- 临时 installation 检查：`find /var/folders -type f -name 'installation.json' -path '*harness-comfyui*' -print` 无输出；未发现残留 fixture installation。
- 测试 fixture 的临时目录前缀来自 `src/testing/profile-fixture.ts`：configuration `test` 使用 `harness-comfyui-composition-`，installation 路径为临时根目录下的 `installation/`；本次搜索无匹配结果。
- 资源清理状态：测试自然退出；未执行删除、停止或其它写操作。

## Deploy diagnosis Phase 2

### 环境假设验证

- 反馈环命令：`PATH=/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH command -v pnpm && PATH=/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH pnpm --version`
- 结果：PASS
- 退出码：`0`
- 输出：

```text
/Users/fzfz/.nvm/versions/node/v24.14.0/bin/pnpm
11.7.0
```

### 同一 PATH 前缀下的首个有效生命周期执行

- 命令执行次数：1 次
- 命令：`PATH=/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH node_modules/.bin/vitest run tests/deploy/artifact-upgrade-rollback.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose -t "upgrades the verified artifact to one candidate Host and exits the foreground upgrade on external stop"`
- 结果：FAIL；Vitest 自然退出，未发送终止信号
- 退出码：`1`
- 失败测试耗时：`67222ms`
- Vitest 总耗时：`67.35s`
- 测试汇总：`1` failed，`3` skipped，`1` 个测试文件 failed
- 同一 Pack artifact：`/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz`
- artifact SHA-256：`7bf50b726ef19a086bb932dd24e1136b55cccb72b39135a99a7528ca59e591a1`

完整 stdout/stderr 合并捕获：

```text

 × tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > upgrades the verified artifact to one candidate Host and exits the foreground upgrade on external stop 67222ms
   → promise rejected "Error: product CLI preflight failed with …" instead of resolving
 ↓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > start failure restores the original active release and healthy Host
 ↓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > health failure restores the original active release and healthy Host
 ↓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > rolls back the active candidate to previous release, keeps health passing, and exits both foreground commands on stop

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > upgrades the verified artifact to one candidate Host and exits the foreground upgrade on external stop
AssertionError: promise rejected "Error: product CLI preflight failed with …" instead of resolving
 ❯ installAndStartFixture tests/deploy/artifact-upgrade-rollback.test.ts:101:36
     99|   const fixture = await createProfileFixture({ configuration: 'test' })
    100|   fixtures.push(fixture)
    101|   await expect(fixture.preflight()).resolves.toMatchObject({ stage: 'p…
       |                                    ^
    102|   await fixture.install()
    103|   await fixture.start()
 ❯ tests/deploy/artifact-upgrade-rollback.test.ts:175:21

Caused by: Error: product CLI preflight failed with 1: harness-comfyui: pnpm version must be 11.7.0, got 10.32.1
npm notice
npm notice New minor version of npm available! 11.9.0 -> 11.19.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.19.0
npm notice To update run: npm install -g npm@11.19.0
npm notice

 ❯ parseJsonResult src/testing/profile-fixture.ts:340:32
 ❯ ProfileFixtureImpl.preflight src/testing/profile-fixture.ts:470:12
 ❯ installAndStartFixture tests/deploy/artifact-upgrade-rollback.test.ts:101:3
 ❯ tests/deploy/artifact-upgrade-rollback.test.ts:175:21

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  01:50:03
   Duration  67.35s (transform 38ms, setup 0ms, import 50ms, tests 67.22s, environment 0ms)

```

### 假设判定

- 假设 H1（外层 shell 解析到 pnpm 10.32.1 是唯一原因）：不成立。授权 PATH 下的 `command -v pnpm` 已解析到 `/Users/fzfz/.nvm/versions/node/v24.14.0/bin/pnpm`，版本为 `11.7.0`，但 product CLI preflight 仍报告 `got 10.32.1`。
- 当前有效信号：失败发生在 fixture 调用的 product CLI preflight 子流程；该子流程使用的 pnpm 仍为 `10.32.1`。本阶段只确认了父 Vitest 进程 PATH 修正不能改变该子流程的实际版本，尚未修改或追踪其解析逻辑。
- 结论：环境纠正后的首个生命周期执行仍为红；按指令停止，不运行另外三个 deploy 场景。

### Phase 2 资源清理只读证据

- `pgrep -af '[v]itest.*artifact-upgrade-rollback|[h]arness-comfyui-issue-17/.*/harness-comfyui'`：无输出，未发现测试或 Harness Host 残留进程。
- `find /var/folders -type f -name 'installation.json' -path '*harness-comfyui*' -print 2>/dev/null | head -50`：无输出，未发现临时 installation。
- `git status --short --branch`：仍为 `codex/issue-17-session-binding`，仅有未跟踪 `node_modules` symlink。
- production installation：未创建；production Host：未启动。
- 未执行删除、停止、安装或其它写操作。

## Deploy diagnosis Phase 4

### npm-exec PATH probe

- 命令执行次数：1 次
- 命令：`PATH=/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH /Users/fzfz/.nvm/versions/node/v24.14.0/bin/npm exec --yes --package=/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz -- node -e 'const {spawnSync}=require("node:child_process"); for (const c of [["which",["pnpm"]],["pnpm",["--version"]]]) { const r=spawnSync(c[0],c[1],{encoding:"utf8",env:process.env}); console.log(JSON.stringify({command:c[0],status:r.status,stdout:r.stdout.trim(),stderr:r.stderr.trim()})); } console.log(process.env.PATH)'`
- 结果：PASS（probe 自身退出码 `0`）
- 命令耗时：约 `56.34s`
- 使用 artifact：`/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz`
- probe 未运行 Vitest、product CLI preflight 或 install。

完整 stdout/stderr 合并捕获：

```text
npm warn Unknown project config "strict-dep-builds". This will stop working in the next major version of npm.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm.
{"command":"which","status":0,"stdout":"/Users/fzfz/.nvm/versions/node/v24.14.0/bin/pnpm","stderr":""}
{"command":"pnpm","status":0,"stdout":"11.7.0","stderr":""}
/Users/fzfz/.npm/_npx/5c01172ec27a2e26/node_modules/.bin:/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/node_modules/.bin:/Volumes/4Tdisk/work/AI2/node_modules/.bin:/Volumes/4Tdisk/work/node_modules/.bin:/Volumes/4Tdisk/node_modules/.bin:/Volumes/node_modules/.bin:/node_modules/.bin:/Users/fzfz/.nvm/versions/node/v24.14.0/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/Users/fzfz/.codex/tmp/arg0/codex-arg01FeM0s:/Users/fzfz/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override:/Users/fzfz/.bun/bin:/Users/fzfz/.claude/bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:/Users/fzfz/.orbstack/bin:/Users/fzfz/.local/bin:/Users/fzfz/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/Applications/ChatGPT.app/Contents/Resources:/Users/fzfz/.orbstack/bin:/Users/fzfz/.local/bin
```

### Probe 判定

- npm exec 环境内部的 `which pnpm` 与 `pnpm --version` 均解析到显式 NVM 目录的 `pnpm 11.7.0`。
- 因此“npm exec 普遍重写 PATH 导致 pnpm 10.32.1”被否证；下一步应检查 `harness-comfyui` CLI 专属环境或其子进程环境。
- 按指令在本 probe 后停止，未运行其它测试或生命周期命令。

## Deploy diagnosis Phase 4 instrumentation

### 临时 probe 入口修正

- 临时文件：`.debug-issue17/env-probe.test.ts`。
- 首次执行结果：Vitest 4 在加载阶段拒绝已移除的 `test(name, fn, options)` 签名，实际 probe 测试体未执行；退出码 `1`，`Tests no tests`。
- 处理：仅使用 apply_patch 将临时 probe 改为 Vitest 4 的 `test(name, options, fn)` 签名；未修改仓库代码。

首次入口失败输出：

```text
⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯

 FAIL  .debug-issue17/env-probe.test.ts [ .debug-issue17/env-probe.test.ts ]
TypeError: Signature "test(name, fn, { ... })" was deprecated in Vitest 3 and removed in Vitest 4. Please, provide options as a second argument instead.
 ❯ .debug-issue17/env-probe.test.ts:25:1

 Test Files  1 failed (1)
      Tests  no tests
   Duration  91ms (transform 12ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)
```

### 修正后临时 probe

- 执行命令：`PATH=/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH node_modules/.bin/vitest run .debug-issue17/env-probe.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose`
- 实际 probe 执行次数：1 次
- 结果：PASS
- 退出码：`0`
- Vitest 总耗时：`54.87s`；测试耗时：`54.78s`
- 测试汇总：`1` file / `1` test passed
- 使用 artifact：`/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz`
- probe 只执行 worker 环境记录与隔离 npm exec PATH 记录；未运行 production CLI、preflight、install 或 lifecycle。

worker 证据（完整字段）：

```json
{
  "execPath": "/Users/fzfz/.nvm/versions/node/v24.14.0/bin/node",
  "PATH": "/Users/fzfz/.nvm/versions/node/v24.14.0/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/Users/fzfz/.codex/tmp/arg0/codex-arg01FeM0s:/Users/fzfz/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override:/Users/fzfz/.bun/bin:/Users/fzfz/.claude/bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:/Users/fzfz/.orbstack/bin:/Users/fzfz/.local/bin:/Users/fzfz/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/Applications/ChatGPT.app/Contents/Resources:/Users/fzfz/.orbstack/bin:/Users/fzfz/.local/bin",
  "whichNpm": "/Users/fzfz/.nvm/versions/node/v24.14.0/bin/npm",
  "npmVersion": "11.9.0",
  "whichPnpm": "/Users/fzfz/.nvm/versions/node/v24.14.0/bin/pnpm",
  "pnpmVersion": "11.7.0"
}
```

isolated npm exec 子进程证据：

```json
{
  "status": 0,
  "execPath": "/Users/fzfz/.nvm/versions/node/v24.14.0/bin/node",
  "whichNpm": "/Users/fzfz/.nvm/versions/node/v24.14.0/bin/npm",
  "npmVersion": "11.9.0",
  "whichPnpm": "/Users/fzfz/.nvm/versions/node/v24.14.0/bin/pnpm",
  "pnpmVersion": "11.7.0",
  "PATH_PREFIX": "/var/folders/td/trvrwv_d2bxb0ns9qgpmmlqm0000gn/T/issue17-pnpm-probe-3wu6TT/npm-cache/_npx/5c01172ec27a2e26/node_modules/.bin:/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/node_modules/.bin:/Volumes/4Tdisk/work/AI2/node_modules/.bin:/Volumes/4Tdisk/work/node_modules/.bin:/Volumes/4Tdisk/node_modules/.bin:/Volumes/node_modules/.bin:/node_modules/.bin:/Users/fzfz/.nvm/versions/node/v24.14.0/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin",
  "stderr": "npm warn Unknown project config \\\"strict-dep-builds\\\".\\nnpm notice New minor version of npm available! 11.9.0 -> 11.19.0"
}
```

完整 probe 输出中的关键 npm warnings：

```text
npm warn Unknown project config "strict-dep-builds". This will stop working in the next major version of npm.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm.
npm notice New minor version of npm available! 11.9.0 -> 11.19.0
```

### instrumentation 清理

- 临时 probe 文件已使用 apply_patch 删除。
- 空目录 `.debug-issue17` 已移除。
- `test ! -e /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.debug-issue17`：通过，目录不存在。
- `pgrep -af '[n]pm exec.*harness-comfyui-0.1.3|[i]ssue17-pnpm-probe|[e]nv-probe.test'`：无输出，未发现残留 npm/node/probe 进程。
- `git status --short --branch`：仍为 `codex/issue-17-session-binding`，仅有未跟踪 `node_modules` symlink。
- probe 的 `[DEBUG-issue17-pnpm]` instrumentation 已随临时目录删除；未提交。

### Probe 判定

- 隔离 HOME/NPM_CONFIG_CACHE 的 npm exec 子进程仍解析到 `pnpm 11.7.0`，未显示 `10.32.1`。
- npm exec PATH 重写与临时 HOME/cache 隔离均不能复现 preflight 的 `10.32.1`；差异进一步限定在 `harness-comfyui` CLI 专属环境或其 preflight 子进程逻辑。
- 按指令在 instrumentation 后停止，未运行任何 lifecycle。

## Deploy diagnosis Phase 4 preload preflight probe

- 临时 preload：`.debug-issue17/preload.cjs`，仅包装 `child_process.spawn` 的精确 `pnpm` command，并调用 `syncBuiltinESMExports()`。
- 临时 installation：`.debug-issue17/installation.json`，`configurationProfile: test`，`host: 127.0.0.1`，空闲端口 `53749`；catalog/source discovery scripts 均位于同一临时目录。
- 使用 artifact：`/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz`，SHA-256 `7bf50b726ef19a086bb932dd24e1136b55cccb72b39135a99a7528ca59e591a1`。
- 指定 product CLI 命令只执行 1 次；未运行 Vitest、install 或其它 lifecycle。
- CLI 结果：执行达到约 `300s` 超时边界仍未自然退出，随后为停止递归子进程发送终止信号，最终退出码 `130`。
- CLI stdout/stderr：已捕获的合并输出只有以下两条 npm warning；没有 product CLI JSON 或其它 preflight 输出。没有单独 stdout/stderr 文件，故明确记录：`exit/stdout 未保留`；本记录保留了退出码 `130` 与已观察 warning。

CLI 已捕获输出：

```text
npm warn Unknown project config "strict-dep-builds". This will stop working in the next major version of npm.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm.
```

spawn-log 已在删除临时目录前读取到 1 条 `[DEBUG-issue17-pnpm]` 记录：

```json
{
  "tag": "[DEBUG-issue17-pnpm]",
  "execPath": "/Users/fzfz/.nvm/versions/node/v24.14.0/bin/node",
  "argv1": "/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.debug-issue17/npm-cache/_npx/5c01172ec27a2e26/node_modules/.bin/harness-comfyui",
  "processPath": "/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.debug-issue17/npm-cache/_npx/5c01172ec27a2e26/node_modules/.bin:/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/node_modules/.bin:/Volumes/4Tdisk/work/AI2/node_modules/.bin:/Volumes/4Tdisk/work/node_modules/.bin:/Volumes/4Tdisk/node_modules/.bin:/Volumes/node_modules/.bin:/node_modules/.bin:/Users/fzfz/.nvm/versions/node/v24.14.0/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/Users/fzfz/.codex/tmp/arg0/codex-arg01FeM0s:/Users/fzfz/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override:/Users/fzfz/.bun/bin:/Users/fzfz/.claude/bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:/Users/fzfz/.orbstack/bin:/Users/fzfz/.local/bin:/Users/fzfz/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:/Applications/ChatGPT.app/Contents/Resources:/Users/fzfz/.orbstack/bin:/Users/fzfz/.local/bin",
  "optionsPath": "",
  "whichPnpm": "/Users/fzfz/.nvm/versions/node/v24.14.0/bin/pnpm",
  "realpath": "/Users/fzfz/.nvm/versions/node/v24.14.0/lib/node_modules/pnpm/bin/pnpm.cjs"
}
```

### Probe 判定与清理

- preload 捕获的实际 `pnpm` spawn 解析到显式 NVM `pnpm`，realpath 为 `.../pnpm/bin/pnpm.cjs`；未观察到 `10.32.1`。
- preflight 进程树在超时前递归出现 `pnpm add pnpm@11.7.0 --loglevel=error --ignore-scripts --config.strict-dep-builds=false --config.node-linker=hoisted --config.bin=bin`；该行为解释了为何 CLI 没有进入后续 preflight 输出。
- `.debug-issue17` 中的 preload、installation、discovery scripts、spawn-log、隔离 HOME/cache 已全部删除；空目录已移除。
- 已有只读检查：未发现本次 `npm exec`、`harness-comfyui preflight` 或递归 `pnpm add pnpm@11.7.0` 进程。
- 已有 worktree 状态：`codex/issue-17-session-binding`，仅有未跟踪 `node_modules` symlink。
- debug tag 仅保留在本 acceptance 记录中；临时目录无 `[DEBUG-issue17-pnpm]` 残留。

## Deploy diagnosis Phase 5

### 进程级 pnpm 配置 probe

- 命令执行次数：1 次
- 命令：`PATH=/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH npm_config_manage_package_manager_versions=false pnpm config get manage-package-manager-versions && PATH=/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH npm_config_manage_package_manager_versions=false pnpm --version`
- 结果：FAIL，未满足继续执行条件
- 退出码：`0`，但版本断言失败
- 完整输出：

```text
false
10.32.1
```

- 预期：`false` 与 `11.7.0`。
- 实际：配置值为 `false`，`pnpm --version` 为 `10.32.1`。
- 后续 lifecycle：未执行。
- 资源清理：本 probe 未创建临时文件、未启动 lifecycle/Host、未产生 pnpm add 子进程；未修改仓库或全局配置。

## Deploy diagnosis Phase 5 wrapper correction

### 已有 pnpm 11.7.0 包只读验证

- 命令：`node -p 'require("/Users/fzfz/.npm/_npx/36898ac2e9783e89/node_modules/pnpm/package.json").version'`
- 结果：PASS，输出 `11.7.0`。
- 未联网、未安装、未修改全局 pnpm。

### 隔离 wrapper 版本 probe

- wrapper：`/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin/pnpm`，按要求保留供后续门禁；wrapper 不在 Issue worktree。
- 初始版本 probe 命令误用了 `/Volumes/4Tdisk/work/AI2/.planning/...` 路径，退出码 `127`，未启动 pnpm；随后仅修正为授权 wrapper 绝对路径。
- 正确 probe 使用一次 `mktemp -d` 隔离 cwd/HOME，wrapper 目录置于 PATH 首位、NVM bin 第二位，并设置 `npm_config_manage_package_manager_versions=false`。
- 正确 probe 结果：PASS，退出码 `0`，输出 `11.7.0`；无 `pnpm add` 或 install 输出。
- 隔离 temp dir `/var/folders/td/trvrwv_d2bxb0ns9qgpmmlqm0000gn/T/tmp.RR2HWf8H3e` 已清理。

### 首个 lifecycle 场景

- 命令执行次数：1 次
- 命令：`PATH=/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH npm_config_manage_package_manager_versions=false node_modules/.bin/vitest run tests/deploy/artifact-upgrade-rollback.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose -t "upgrades the verified artifact to one candidate Host and exits the foreground upgrade on external stop"`
- 结果：PASS；Vitest 自然退出，未发送终止信号
- 退出码：`0`
- 测试耗时：`125997ms`
- Vitest 总耗时：`126.12s`
- 测试汇总：`1` passed，`3` skipped，`1` 个测试文件 passed
- 其余 deploy 场景：未执行
- 使用 artifact：`/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz`，SHA-256 `7bf50b726ef19a086bb932dd24e1136b55cccb72b39135a99a7528ca59e591a1`。

完整生命周期输出：

```text

 RUN  v4.1.8 /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17

 ✓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > upgrades the verified artifact to one candidate Host and exits the foreground upgrade on external stop 125997ms
 ↓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > start failure restores the original active release and healthy Host
 ↓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > health failure restores the original active release and healthy Host
 ↓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > rolls back the active candidate to previous release, keeps health passing, and exits both foreground commands on stop

 Test Files  1 passed (1)
      Tests  1 passed | 3 skipped (4)
   Start at  02:18:04
   Duration  126.12s (transform 40ms, setup 0ms, import 52ms, tests 126.00s, environment 0ms)

```

### Phase 5 资源清理与状态

- 只读进程检查无匹配的 lifecycle/Vitest 进程。
- `harness-comfyui-composition-*` 临时 installation 搜索无输出。
- 版本 probe temp dir 不存在。
- wrapper 保持可执行并暂留；未提交。
- Issue worktree `git status --short --branch`：仅 `?? node_modules`。
- production installation/Host：未创建/未启动。

## Deploy gate completion with pnpm 11.7.0 wrapper

### A. artifact-upgrade 剩余 3 个场景

- 命令：`PATH=/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH npm_config_manage_package_manager_versions=false node_modules/.bin/vitest run tests/deploy/artifact-upgrade-rollback.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose --testNamePattern="start failure restores the original active release and healthy Host|health failure restores the original active release and healthy Host|rolls back the active candidate to previous release, keeps health passing, and exits both foreground commands on stop"`
- 结果：PASS；自然退出，未重试
- 退出码：`0`
- 测试汇总：`3 passed | 1 skipped (4)`；已通过的首个场景显示 skipped
- 总耗时：`403.55s`
- 场景耗时：start failure `126527ms`；health failure `150328ms`；rollback `126568ms`

完整输出：

```text
 RUN  v4.1.8 /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17
 ↓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > upgrades the verified artifact to one candidate Host and exits the foreground upgrade on external stop
 ✓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > start failure restores the original active release and healthy Host 126527ms
 ✓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > health failure restores the original active release and healthy Host 150328ms
 ✓ tests/deploy/artifact-upgrade-rollback.test.ts > verified release artifact upgrade and rollback lifecycle > rolls back the active candidate to previous release, keeps health passing, and exits both foreground commands on stop 126568ms

 Test Files  1 passed (1)
      Tests  3 passed | 1 skipped (4)
   Start at  02:22:27
   Duration  403.55s (transform 37ms, setup 0ms, import 50ms, tests 403.42s, environment 0ms)
```

### B. deploy 其余文件

- 命令：`PATH=/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH npm_config_manage_package_manager_versions=false node_modules/.bin/vitest run tests/deploy --exclude tests/deploy/artifact-upgrade-rollback.test.ts --maxWorkers=1 --no-file-parallelism`
- 结果：PASS；自然退出，未重试
- 退出码：`0`
- 测试汇总：`13 passed`；`160 passed | 1 skipped (161)`
- 总耗时：`290.17s`

完整输出：

```text
 RUN  v4.1.8 /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17

 Test Files  13 passed (13)
      Tests  160 passed | 1 skipped (161)
   Start at  02:29:19
   Duration  290.17s (transform 166ms, setup 0ms, import 314ms, tests 289.04s, environment 1ms)
```

### Deploy gate 清理与 artifact 状态

- A/B 均使用同一 artifact：`/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz`，SHA-256 `7bf50b726ef19a086bb932dd24e1136b55cccb72b39135a99a7528ca59e591a1`。
- A/B 之后的只读检查未发现 deploy Vitest 进程或 `harness-comfyui-composition-*` 临时 installation。
- wrapper `/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin/pnpm` 保持可执行并暂留；未修改 source/tests/fixture。
- Issue worktree `git status --short --branch`：仅 `?? node_modules`。
- production installation/Host：未创建/未启动。
- 后续门禁：按主线程指令在 B PASS 后停止，未运行 Composition、E2E 或 Release smoke。

## Final gate attempt: Composition

- 命令：`PATH=/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH npm_config_manage_package_manager_versions=false node_modules/.bin/vitest run tests/composition`
- 结果：FAIL；测试体实际失败后按规则终止唯一前台 Vitest session，未重试
- 失败测试文件：`tests/composition/profile-composition.test.ts`
- 失败测试：`uses one existing artifact through the product CLI and keeps native AppFrame slots unoccupied`
- Vitest 失败测试耗时：`95342ms`
- 最终进程退出码：`130`（失败出现后发送终止信号）
- E2E、Release smoke、production installation/Host：未执行

已观察完整输出：

```text

 RUN  v4.1.8 /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17

 ❯ tests/composition/profile-composition.test.ts (1 test | 1 failed) 95343ms
     × uses one existing artifact through the product CLI and keeps native AppFrame slots unoccupied 95342ms
```

失败出现后测试进程未输出断言堆栈即被停止；未重试。只读清理检查未发现 Composition Vitest/profile-composition 进程或 `harness-comfyui-composition-*` 临时 installation；Issue worktree 仍仅有 `?? node_modules`。

## Composition diagnosis Phase 1

- 命令执行次数：1 次
- 命令：`PATH=/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH npm_config_manage_package_manager_versions=false node_modules/.bin/vitest run tests/composition/profile-composition.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose -t "uses one existing artifact through the product CLI and keeps native AppFrame slots unoccupied"`
- 结果：PASS；Vitest 自然退出，未在 `×` 后终止
- 退出码：`0`
- 测试耗时：`83226ms`
- Vitest 总耗时：`83.35s`
- 测试汇总：`1` file / `1` test passed
- 其它 composition、E2E：未执行

完整输出：

```text

 RUN  v4.1.8 /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17

 ✓ tests/composition/profile-composition.test.ts > release artifact composition > uses one existing artifact through the product CLI and keeps native AppFrame slots unoccupied 83226ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  02:39:29
   Duration  83.35s (transform 34ms, setup 0ms, import 45ms, tests 83.23s, environment 0ms)

```

### 资源清理与诊断结论

- afterEach/测试自然清理后，进程检查未发现 Composition Vitest 或 `profile-composition` 残留进程。
- `harness-comfyui-composition-*` 临时 installation 搜索无输出。
- Issue worktree `git status --short --branch`：仅 `?? node_modules`。
- 该诊断通过，说明先前 Composition gate 的 FAIL 来自失败出现后过早终止，不能作为测试体的最终失败证据。

## Final gate continuation after Composition timing ruling

### Composition root/tool-scope combination

- 主线程时序裁决：首次全组 profile 场景约 95 秒超过 90 秒 test timeout；自然单场 `83.226s` PASS 作为 profile 有效证据，不重跑 profile 文件。
- 命令：`PATH=/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH npm_config_manage_package_manager_versions=false node_modules/.bin/vitest run tests/composition/root-boot-order.test.ts tests/composition/tool-scope-composition.test.ts`
- 结果：PASS；自然退出，退出码 `0`
- 测试汇总：`2` files / `3` tests passed
- Vitest 输出耗时：`169.74s`（tests timing `263.79s`）

完整输出：

```text
 RUN  v4.1.8 /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17

 Test Files  2 passed (2)
      Tests  3 passed (3)
   Start at  02:42:02
   Duration  169.74s (transform 74ms, setup 0ms, import 96ms, tests 263.79s, environment 0ms)
```

### E2E

- 命令：`PATH=/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH npm_config_manage_package_manager_versions=false node_modules/.bin/vitest run tests/e2e --maxWorkers=1 --no-file-parallelism`
- 结果：FAIL；Vitest 自然退出，未手动终止，未重试
- 退出码：`1`
- 测试汇总：`1` failed、`2` passed；`4` passed、`1` failed tests
- 失败测试耗时：`72121ms`
- Vitest 总耗时：`147.82s`
- Release smoke、production installation/Host：未执行

完整失败输出：

```text
 ❯ tests/e2e/workbench-browser.test.ts (1 test | 1 failed) 72122ms
     × exposes the public Session service and deterministic fixture snapshot on the project workbench surface 72121ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯

 FAIL  tests/e2e/workbench-browser.test.ts > Issue 3 real Harness workbench browser seam > exposes the public Session service and deterministic fixture snapshot on the project workbench surface
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "session-64c683e1-dd85-4b20-abe0-84162c620e57",
+ ]

 ❯ tests/e2e/workbench-browser.test.ts:61:31
     59|     )
     60|     expect(result.bodyText).toContain('生成工作台')
     61|     expect(result.sessionIds).toEqual([])
       |                               ^
     62|     expect(result.sessionTitles).toEqual([])
     63|     expect(result.serviceKeys).toContain('list')

 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 4 passed (5)
   Start at  02:44:58
   Duration  147.82s (transform 39ms, setup 0ms, import 75ms, tests 147.54s, environment 0ms)
```

### E2E 清理与停止边界

- E2E 自然退出后只读检查未发现 E2E Vitest/workbench-browser 残留进程或临时 installation。
- wrapper 保持可执行；Issue worktree 仍仅有 `?? node_modules`。
- 按失败即停规则，未运行 Release smoke，未创建 production installation/Host。
## Test-only commit artifact rebind attempt

- Candidate HEAD: `4ab14e7833fa663d2c7eb70902ca41bd2b2a5273`.
- Existing artifact identity before rebind: `byteLength=800413`, SHA-256 `7bf50b726ef19a086bb932dd24e1136b55cccb72b39135a99a7528ca59e591a1`.
- Command executed exactly once with the retained wrapper-first PATH and `npm_config_manage_package_manager_versions=false`:

  ```text
  PATH=/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH npm_config_manage_package_manager_versions=false node scripts/release/pack.mjs
  ```

- Result: PASS, exit `0`; `pack.mjs` produced the tarball at `/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz`.
- New `.release/quality/artifact.json` records commit `4ab14e7833fa663d2c7eb70902ca41bd2b2a5273`, `byteLength=802504`, and SHA-256 `af31167277582a0c789c7cef2263aab69b9ee9f6a2f65479b6abe610d495d0da`.
- Independent `stat` confirmed `802504` bytes; independent `shasum -a 256` confirmed `af31167277582a0c789c7cef2263aab69b9ee9f6a2f65479b6abe610d495d0da`.
- The new bytes and SHA differ from the previous artifact identity, so the condition “test-only commit rebind; product artifact bytes unchanged” is not satisfied. Stopped immediately; no contract/build/validate/deploy/composition/E2E/release-smoke rerun and no production installation or Host start.
## HEAD-bound artifact revalidation

- Artifact under test: `/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz`; manifest commit `4ab14e7833fa663d2c7eb70902ca41bd2b2a5273`; `byteLength=802504`; SHA-256 `af31167277582a0c789c7cef2263aab69b9ee9f6a2f65479b6abe610d495d0da`. Previous `800413`/`7bf50b726ef19a086bb932dd24e1136b55cccb72b39135a99a7528ca59e591a1` identity is superseded.
- Environment for every command in this section: wrapper-first PATH `/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH` and `npm_config_manage_package_manager_versions=false`.
- `node scripts/release/validate-package.mjs`: PASS, exit `0`, output confirmed SHA `af31167277582a0c789c7cef2263aab69b9ee9f6a2f65479b6abe610d495d0da`.
- `node_modules/.bin/vitest run tests/build-artifacts.test.ts tests/release-package/runtime-closure.test.ts`: PASS, 2 files / 3 tests, Vitest duration `2.06s`, exit `0`.
- `node_modules/.bin/vitest run tests/deploy --maxWorkers=1 --no-file-parallelism`: PASS, natural exit `0`; 14 files passed, 164 tests passed and 1 skipped (165 total), Vitest duration `832.35s` (`tests 831.15s`).
- `node_modules/.bin/vitest run tests/composition/profile-composition.test.ts`: FAIL, natural exit `1`; artifact identity remained commit `4ab14e7833fa663d2c7eb70902ca41bd2b2a5273`, `byteLength=802504`, SHA-256 `af31167277582a0c789c7cef2263aab69b9ee9f6a2f65479b6abe610d495d0da`.

  ```text
   ❯ tests/composition/profile-composition.test.ts (1 test | 1 failed) 90005ms
       × uses one existing artifact through the product CLI and keeps native AppFrame slots unoccupied 90005ms

  ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

   FAIL  tests/composition/profile-composition.test.ts > release artifact composition > uses one existing artifact through the product CLI and keeps native AppFrame slots unoccupied
  Error: Test timed out in 90000ms.
  If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
   ❯ tests/composition/profile-composition.test.ts:14:3
       12|
       13| describe('release artifact composition', () => {
       14|   it('uses one existing artifact through the product CLI and keeps nat…
         |   ^
       15|     const fixture = await createProfileFixture({
       16|       configuration: 'test',

  ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

  Test Files  1 failed (1)
       Tests  1 failed (1)
    Start at  03:11:41
    Duration  90.11s (transform 31ms, setup 0ms, import 41ms, tests 90.01s, environment 0ms)
  ```

- Per the gate rule, stopped after this failure; root-boot-order/tool-scope composition, E2E, release-smoke, production installation, and Host start were not run in this artifact-bound pass.
## HEAD-bound profile composition final retry

- Authorized final retry for the new artifact identity, using the same wrapper-first PATH and `npm_config_manage_package_manager_versions=false`; no timeout/test changes were made.
- `node_modules/.bin/vitest run tests/composition/profile-composition.test.ts`: PASS, natural exit `0`; 1 file / 1 test, Vitest duration `80.81s` (`tests 80.71s`). Artifact: commit `4ab14e7833fa663d2c7eb70902ca41bd2b2a5273`, `byteLength=802504`, SHA-256 `af31167277582a0c789c7cef2263aab69b9ee9f6a2f65479b6abe610d495d0da`.
- `node_modules/.bin/vitest run tests/composition/root-boot-order.test.ts tests/composition/tool-scope-composition.test.ts`: PASS, natural exit `0`; 2 files / 3 tests, Vitest duration `151.26s` (`tests 230.34s`). Artifact remained commit `4ab14e7833fa663d2c7eb70902ca41bd2b2a5273`, `byteLength=802504`, SHA-256 `af31167277582a0c789c7cef2263aab69b9ee9f6a2f65479b6abe610d495d0da`.
- `node_modules/.bin/vitest run tests/e2e --maxWorkers=1 --no-file-parallelism`: PASS, natural exit `0`; 3 files / 5 tests, Vitest duration `150.26s` (`tests 149.96s`). Artifact remained commit `4ab14e7833fa663d2c7eb70902ca41bd2b2a5273`, `byteLength=802504`, SHA-256 `af31167277582a0c789c7cef2263aab69b9ee9f6a2f65479b6abe610d495d0da`.
- `HARNESS_COMFYUI_ARTIFACT_MANIFEST_PATH=/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/artifact.json node_modules/.bin/vitest run tests/release-smoke --maxWorkers=1 --no-file-parallelism`: FAIL, natural exit `1`; artifact remained commit `4ab14e7833fa663d2c7eb70902ca41bd2b2a5273`, `byteLength=802504`, SHA-256 `af31167277582a0c789c7cef2263aab69b9ee9f6a2f65479b6abe610d495d0da`.

  ```text
   ❯ tests/release-smoke/release-smoke.test.ts (4 tests | 1 failed) 83091ms
       × uses the existing artifact through npm exec and then only the stable lifecycle CLI 80785ms

  ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯

   FAIL  tests/release-smoke/release-smoke.test.ts > release artifact smoke > uses the existing artifact through npm exec and then only the stable lifecycle CLI
  AssertionError: expected [ …(42) ] to deeply equal ArrayContaining{…}

  - Expected
  + Received

  - ArrayContaining [
  -   "@deepseek-ai/dsh-client-ui-layout",
  + [
  +   "@deepseek-ai/dsh-typert-registry",
  +   "@deepseek-ai/dsh-api-gateway",
  +   "@deepseek-ai/dsh-session-log-export",
  +   "@deepseek-ai/dsh-client-hmr",
  +   "@deepseek-ai/dsh-client-modules",
  +   "@deepseek-ai/dsh-client-connection",
  +   "@deepseek-ai/dsh-api-remotes",
  +   "@deepseek-ai/dsh-client-runtime",
  +   "@deepseek-ai/dsh-cordis-client-runner",
  +   "@deepseek-ai/dsh-client-ui-theme",
  +   "@deepseek-ai/dsh-client-locale",
  +   "@deepseek-ai/dsh-client-ui-renderer",
  +   "@deepseek-ai/dsh-client-ui-sidebar",
  +   "@deepseek-ai/dsh-client-ui-settings",
  +   "@deepseek-ai/dsh-client-ui-settings-general",
  +   "@deepseek-ai/dsh-client-ui-settings-models",
  +   "@deepseek-ai/dsh-client-ui-settings-plugin-inventory",
  +   "@deepseek-ai/dsh-client-ui-conversation",
  +   "@deepseek-ai/dsh-client-ui-brand-official",
  +   "@deepseek-ai/dsh-client-ui-attachment",
  +   "@deepseek-ai/dsh-client-ui-tool",
  +   "@deepseek-ai/dsh-client-ui-cordis",
  +   "@deepseek-ai/dsh-client-ui-workflow-run",
  +   "@deepseek-ai/dsh-client-ui-deliverables",
  +   "@deepseek-ai/dsh-client-ui-workspace",
  +   "@deepseek-ai/dsh-client-ui-input-trigger",
  +   "@deepseek-ai/dsh-client-ui-commands",
  +   "@deepseek-ai/dsh-client-ui-skill",
  +   "@deepseek-ai/dsh-client-ui-subagent",
  +   "@deepseek-ai/dsh-client-ui-reference",
  +   "@deepseek-ai/dsh-client-ui-jobs",
  +   "@deepseek-ai/dsh-client-ui-goal",
  +   "@deepseek-ai/dsh-client-ui-message-feedback",
  +   "@deepseek-ai/dsh-client-ui-model-selection",
  +   "@deepseek-ai/dsh-client-ui-permission-presets",
  +   "@deepseek-ai/dsh-client-ui-agent-preset",
  +   "@deepseek-ai/dsh-client-ui-settings-plugins",
  +   "@deepseek-ai/dsh-client-ui-plan",
  +   "@deepseek-ai/dsh-client-ui-user-questions",
  +   "@deepseek-ai/dsh-client-ui-trajectory",
  +   "harness-comfyui",
  +   "@deepseek-ai/dsh-client-ui-directory-picker-native",
   ]

   ❯ tests/release-smoke/release-smoke.test.ts:138:51
      136|       const boot = await fixture.readBootGraph()
      137|       expect(boot.entries.map(entry => entry.id)).toEqual(expect.array…
         |                                                   ^
      138|         '@deepseek-ai/dsh-client-ui-layout',
      139|         '@deepseek-ai/dsh-client-ui-conversation',

  Test Files  1 failed | 1 passed (2)
       Tests  1 failed | 4 passed (5)
    Start at  03:21:18
    Duration  83.46s (transform 39ms, setup 0ms, import 57ms, tests 83.24s, environment 0ms)
  ```

- Per the gate rule, stopped after this failure; no production installation was created and no production install/preflight/start/status/health/logs commands were run.
## Production acceptance — artifact `af311672...d495d0da`

- Release-smoke is recorded above as a pre-existing PRD 02 conflict (`ui-layout` is required disabled by PRD 02 while the smoke assertion requires it); it was not changed or used to expand Issue #17.
- Artifact identity used for every production command: `/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz`; manifest commit `4ab14e7833fa663d2c7eb70902ca41bd2b2a5273`; manifest `byteLength=802504`; independent `stat` `802504`; independent SHA-256 `af31167277582a0c789c7cef2263aab69b9ee9f6a2f65479b6abe610d495d0da`.
- Published v0.82.2 Source CLI paths were read-only confirmed as `/Users/fzfz/.local/bin/imagegen-semantic-query` and `/Users/fzfz/.local/bin/imagegen-comfyui-source-read`; the source checkout package identity read-only reported version `0.82.2`. No source script was executed directly.
- Precondition: `lsof -nP -iTCP:4173 -sTCP:LISTEN` returned no listener; `runtime/production` was absent. The production installation was therefore created as the only installation in this worktree.
- Installation file created with `apply_patch`: `/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/installation.json`. It pins `installationId=harness-comfyui-production`, `configurationProfile=production`, root and all shared paths under `runtime/production`, `127.0.0.1:4173`, `imagegen-source-contract`, source release `0.82.2`, `runRefreshIntervalMs=1000`, and `shutdownTimeoutMs=15000`.
- All product lifecycle commands used wrapper-first PATH `/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH` with `npm_config_manage_package_manager_versions=false`.

### Product CLI lifecycle

- Install command (single tarball path used for both `npm exec --package` and `--artifact`):

  ```text
  npm exec --yes --package=/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz -- harness-comfyui install --installation /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/installation.json --artifact /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz
  ```

  Result: PASS, exit `0`, approximately `67.8s`; product reported release `0.1.3`, runtime Node `24.14.0`, pnpm `11.7.0`, and release path `runtime/production/releases/0.1.3`.
- Stable preflight command:

  ```text
  /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/bin/harness-comfyui preflight --installation /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/installation.json --artifact /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/.release/quality/harness-comfyui-0.1.3.tgz
  ```

  Result: PASS, exit `0`, approximately `0.50s`; reported runtime closure pnpm `11.7.0`, strict dependency builds, production configuration, and product-agent contract.
- Foreground start command:

  ```text
  /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/bin/harness-comfyui start --installation /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/installation.json
  ```

  Result: running in tracked foreground PTY session `37738`; ready output `dsh web: http://127.0.0.1:4173` observed after approximately `31s`. The Host was not backgrounded or hidden.
- Status command:

  ```text
  /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/bin/harness-comfyui status --json --installation /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/installation.json
  ```

  Result: PASS, exit `0`, approximately `0.02s`; `installationId=harness-comfyui-production`, `activeVersion=0.1.3`, `pid=19777`, `startedAt=2026-08-23T19:27:45.675Z`, `host=127.0.0.1`, `port=4173`, `status=running`.
- Health command:

  ```text
  /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/bin/harness-comfyui health --json --installation /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/installation.json
  ```

  Result: PASS, exit `0`, approximately `0.05s`; process, active release, Harness Web, Client bundle, pluginStatus, Run Repository, and Saved Media passed. `agentPresetInstallation` passed with release-relative root `dsh-home/.agent-presets/harness-comfyui` and skill root `package/skills`; `agentPresetRoster` passed with `id=harness-comfyui`, `trust=user`, `isDefault=true`, no `broken` field. `pluginStatus` reported package `harness-comfyui@0.1.3`, configuration `production`, `hostLoaded=true`.
- Logs command:

  ```text
  /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/bin/harness-comfyui logs --installation /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/installation.json --source all --lines 50
  ```

  Result: PASS, exit `0`, approximately `0.20s`; output contained the Web URL, passed install/preflight operations, the foreground `start` operation, and passed status/health operations. No credential or secret was printed.

### Public Host/Client and Session evidence

- Public `POST /api/session.list` before Workbench Session creation returned `result.ok=true`, `items=[]`: initial project Session count `0`, IDs `[]`.
- Public `POST /api/host.describe` returned `cwd=/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package`, `attachedSessions=0`, `canOpenPath=true`.
- Public `POST /api/session.create` with that `cwd` and `agentPreset=harness-comfyui` returned `result.ok=true`, `sessionId=session-e8b95544-34c0-4e4f-b2a3-2be6796d400b`, `agentPreset=harness-comfyui`.
- Public `POST /api/session.list` after creation returned exactly one item with the same Session ID, `cwd` equal to the production release package, `agentPreset=harness-comfyui`, `running=false`, and `blank=true`. This is public API evidence; no internal database was read.
- Public `GET /` boot graph probe passed: revision `85ad53123a7e`, 42 entries, `hasHarness=true`, `hasConversation=true`, `hasUiLayout=false`. The boot graph therefore contains `harness-comfyui` and `@deepseek-ai/dsh-client-ui-conversation`, and does not contain `@deepseek-ai/dsh-client-ui-layout`, matching the PRD 02 disabled-row decision.
- One initial shell-only boot parser attempt failed before any Host mutation because of an invalid regular-expression escape; the equivalent no-regex read-only probe immediately passed and is the boot evidence above. This was not a product or lifecycle failure.

- Host remains running in foreground PTY session `37738` at `http://127.0.0.1:4173`, PID `19777`; waiting for the authorized real-browser and independent visual review. Final stop was not run.

### Public workspace/session association follow-up

- Scope: real production Host at `http://127.0.0.1:4173`; no source, package, installation configuration, or test was changed or rerun. The existing project Session ID remained `session-e8b95544-34c0-4e4f-b2a3-2be6796d400b` throughout.
- Read-only RPC request before association:

  ```text
  POST /api/workspace.list
  {"type":"client-request","rpcId":"issue17-acceptance-workspace-list-before","method":"workspace.list","payload":{}}
  ```

  Result: `result.ok=true`, `items=[]`, `archivedSessionIds=[]`. The production release cwd was not yet registered as a workspace.
- Public workspace registration request (same cwd as the existing Session and Host):

  ```text
  POST /api/workspace.create
  {"type":"client-request","rpcId":"issue17-acceptance-workspace-create-production-cwd","method":"workspace.create","payload":{"path":"/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package"}}
  ```

  Result: `result.ok=true`, `created=true`; `workspaceId=ddb6bc7c-ebda-4d3e-8878-f4f72b671cd9`, `path=/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package`, `title=package`, initial `sessionIds=[]`.
- Public idempotent association request using the existing Session ID (no new Session ID was requested):

  ```text
  POST /api/session.create
  {"type":"client-request","rpcId":"issue17-acceptance-session-attach-existing","method":"session.create","payload":{"workspaceId":"ddb6bc7c-ebda-4d3e-8878-f4f72b671cd9","sessionId":"session-e8b95544-34c0-4e4f-b2a3-2be6796d400b","agentPreset":"harness-comfyui"}}
  ```

  Result: `result.ok=true`, returned exactly `sessionId=session-e8b95544-34c0-4e4f-b2a3-2be6796d400b`, `agentPreset=harness-comfyui`. No second project Session was created.
- Read-only verification after association:

  ```text
  POST /api/workspace.list
  {"type":"client-request","rpcId":"issue17-acceptance-workspace-list-after-attach","method":"workspace.list","payload":{}}
  ```

  Result: `result.ok=true`; exactly one workspace, `workspaceId=ddb6bc7c-ebda-4d3e-8878-f4f72b671cd9`, with `sessionIds=["session-e8b95544-34c0-4e4f-b2a3-2be6796d400b"]`; `archivedSessionIds=[]`.

  ```text
  POST /api/session.list
  {"type":"client-request","rpcId":"issue17-acceptance-session-list-after-attach","method":"session.list","payload":{}}
  ```

  Result: `result.ok=true`; exactly one Session item, the same `session-e8b95544-34c0-4e4f-b2a3-2be6796d400b`, with `cwd=/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package`, `agentPreset=harness-comfyui`, `running=false`, `blank=true`.

  ```text
  POST /api/host.describe
  {"type":"client-request","rpcId":"issue17-acceptance-host-describe-after-attach","method":"host.describe","payload":{}}
  ```

  Result: `result.ok=true`; `cwd` remained the same production release package, `attachedSessions=1`, `canOpenPath=true`.
- The public RPC evidence proves the existing Session is now accounted for by the production workspace without creating a second project Session. For the real IAB, reload `http://127.0.0.1:4173`, wait for the workspace list refresh, click the workspace row titled `package`, expand it if collapsed, then click the child row for `session-e8b95544-34c0-4e4f-b2a3-2be6796d400b`. The workspace textarea should become enabled after that workspace/Session selection; do not click “new session.”
- The installed public RPC registry exposes `workspace.list/create` and `session.create` for this association; it does not expose a wire-level `workspace.open` or `session.open` method. The public same-ID `session.create` retry is therefore the idempotent Host association path, while the browser “open” action is the workspace/Session row selection described above.

### Restart acceptance — temporary approved credential store injection

- Scope: authorized runtime-only operation. No source, test, release artifact, installation JSON, or package was changed; no test was run. The only temporary runtime file is the release-local credential store recorded below. Credential contents were never read into output, printed, decoded, or recorded.
- Source credential store metadata (read-only): `/Users/fzfz/.dsh/.credentials.yaml`, regular file, mode `0600`, uid `501`, gid `20`, `415` bytes. The trusted user root store contains a non-empty `OPENCODE_GO_API_KEY` entry; the value was not accessed for output.
- Target precondition: `runtime/production/releases/0.1.3/dsh-home` was an ordinary non-symlink directory; `runtime/production/releases/0.1.3/dsh-home/.credentials.yaml` was absent. The source store was copied once to `runtime/production/releases/0.1.3/dsh-home/.credentials.yaml` with `cp -p`; target metadata was regular file, mode `0600`, uid `501`, gid `20`, `415` bytes. The target is inside `runtime/production`; it remains temporarily present for the running Host/browser reconnect and is pending deletion after final acceptance.
- Old Host stop command:

  ```text
  /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/bin/harness-comfyui stop --installation /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/installation.json
  ```

  Result: JSON stage `stop`, installation `harness-comfyui-production`, active version `0.1.3`, status `stopped`. Read-only checks immediately after returned `old-pid-19777=absent` and `port-4173=free`.
- New foreground Host start command (wrapper-first PATH and `npm_config_manage_package_manager_versions=false`):

  ```text
  /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/bin/harness-comfyui start --installation /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/installation.json
  ```

  Result: tracked foreground PTY session `90869`, URL output `dsh web: http://127.0.0.1:4173`. The Host remains foreground and was not hidden or backgrounded.
- Restart `status --json`: PASS; `installationId=harness-comfyui-production`, `activeVersion=0.1.3`, new Host `pid=21446`, `startedAt=2026-08-23T19:48:28.939Z`, `host=127.0.0.1`, `port=4173`, `status=running`.
- Restart `health --json`: PASS; process, active release, Harness Web, Client bundle, pluginStatus, Run Repository, and Saved Media passed. Preset installation/roster remained valid (`harness-comfyui`, user trust, default, no broken state); plugin `harness-comfyui@0.1.3` was loaded under production.
- Public RPC `POST /api/credentials.describe` after restart, ref `OPENCODE_GO_API_KEY`: `result.ok=true`, `configured=true`, `source=file`, `writable=true`. No credential value was returned or recorded.
- Public RPC `POST /api/host.describe` after restart: `result.ok=true`, cwd remained `/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package`, `provider=opencode-go`, `model=deepseek-v4-flash`, `attachedSessions=1`, `canOpenPath=true`.
- Public RPC `POST /api/session.list` after restart: `result.ok=true`; exactly one project Session remains, ID `session-e8b95544-34c0-4e4f-b2a3-2be6796d400b`, cwd unchanged, `agentPreset=harness-comfyui`, `running=false`, `blank=false` after the real browser message. No new Session was created.
- Public RPC `POST /api/workspace.list` after restart: `result.ok=true`; exactly one workspace remains, ID `ddb6bc7c-ebda-4d3e-8878-f4f72b671cd9`, path unchanged, with `sessionIds=["session-e8b95544-34c0-4e4f-b2a3-2be6796d400b"]`; `archivedSessionIds=[]`.
- Restart acceptance state: PASS for credential resolution, Host liveness, Session continuity, and workspace continuity. New Host remains in foreground PTY `90869` at `http://127.0.0.1:4173`, PID `21446`; final stop and deletion of the temporary target store remain pending the parent’s final browser acceptance/cleanup instruction.

### Second ordinary message runtime diagnosis — PID 21446

- Scope: read-only inspection only; no test, restart, stop, RPC mutation, credential read, or request-header output was performed. The inspected Host is the foreground PID `21446` in PTY `90869`.
- Stable CLI all-source command:

  ```text
  /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/bin/harness-comfyui logs --installation /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/installation.json --source all --lines 100
  ```

  Result: returned successfully. The recent all-source window contained deployment operation records and startup URL lines only; no provider, authentication, error, timeout, model-response completion, or Host-exit line was present.
- Separate public log source checks:

  ```text
  .../harness-comfyui logs --installation .../installation.json --source stdout --lines 100
  .../harness-comfyui logs --installation .../installation.json --source stderr --lines 100
  ```

  Result: stdout contained only two redacted-safe `dsh web: http://127.0.0.1:4173` startup lines; stderr was empty. No credential, request header, provider/auth error, timeout, or completion text was output.
- Public `POST /api/session.list` after the log read returned `result.ok=true`; exactly one project Session remains, ID `session-e8b95544-34c0-4e4f-b2a3-2be6796d400b`, with `running=true`, `blank=false`, unchanged production release cwd, and `agentPreset=harness-comfyui`. Public projection fields showed `turns=1`, `steps=1`, `llmMs=0`, and `asOfSeq=22`.
- Runtime conclusion at this sampling point: the Session turn is still active and has not ended; the public logs provide no evidence of a provider/auth/error/timeout result and no model-response completion. `running=true` plus `turns=1/steps=1/llmMs=0` is consistent with an in-flight model/provider step, but the available public log lines do not identify a narrower internal phase.

### PRD 16:69 preset/subagent public-API capability review

- Read-only public request:

  ```text
  POST /api/agentPreset.list
  {"type":"client-request","rpcId":"issue17-acceptance-agent-preset-list-readonly","method":"agentPreset.list","payload":{}}
  ```

  Result: `result.ok=true`; roster contains `standard`, `code`, `minimal`, `cordis` (`trust=system`) and `harness-comfyui` (`trust=user`, `isDefault=true`). `standard`, `minimal`, and `harness-comfyui` have no `broken` field. The deployment reports `authorable=true` and `hasDocument=true`.
- Public rc.8 API contract review (installed `@deepseek-ai/dsh-host-apiproxy` only; no package-internal call and no fixture):
  - `session.create` accepts optional `agentPreset?: string`; its contract states unknown IDs fail with `agent-preset-not-found` and an unmountable preset fails with `agent-preset-invalid`. The listed `standard`, `minimal`, and `harness-comfyui` entries are therefore valid create candidates. Omitting `sessionId` creates a new real Session; the contract has no singleton restriction. A second `harness-comfyui`, `standard`, or `minimal` Session could consequently be created by a caller, but no `session.create` request was made during this review and no Session count/state changed.
  - The public RPC registry exposes `session.create`, `session.fork`, and `subagent.list/history/prompt/interrupt`; it has no `subagent.create`, `subagent.spawn`, or equivalent public creation method.
  - Public `session.fork` creates a child with `parentSession` lineage and inherited composition; the installed rc.8 implementation does not set `origin: "subagent"` for ordinary forks. The public `subagent.*` methods require an already existing child address and only list/read/prompt/interrupt it.
- Capability conclusion: no direct public API exists that deterministically creates a Session whose public summary has `origin="subagent"` without invoking the package-internal Agent subagent provider/tool path. No fixture or mutation was used; the existing production Host and single project Session were left unchanged.

### PRD 16:69 real public Session construction

- Scope: authorized public RPC construction only. No source, configuration, package, fixture, prompt, test, refresh, or restart was used. The Host stayed in foreground PTY `90869`, PID `21446`, at `http://127.0.0.1:4173`.
- Public create request 1 (second `harness-comfyui`, same production cwd):

  ```text
  POST /api/session.create
  {"type":"client-request","rpcId":"issue17-acceptance-session-create-second-harness-comfyui","method":"session.create","payload":{"cwd":"/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package","agentPreset":"harness-comfyui"}}
  ```

  Result: `result.ok=true`, `sessionId=session-c85c6d85-9a78-459d-b20e-494719f11055`, `agentPreset=harness-comfyui`.
- Public create request 2 (`standard`, same production cwd):

  ```text
  POST /api/session.create
  {"type":"client-request","rpcId":"issue17-acceptance-session-create-standard","method":"session.create","payload":{"cwd":"/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package","agentPreset":"standard"}}
  ```

  Result: `result.ok=true`, `sessionId=session-d222d8d4-2e85-4f6d-93ed-63435de3b4ed`, `agentPreset=standard`.
- Public create request 3 (`minimal`, same production cwd):

  ```text
  POST /api/session.create
  {"type":"client-request","rpcId":"issue17-acceptance-session-create-minimal","method":"session.create","payload":{"cwd":"/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package","agentPreset":"minimal"}}
  ```

  Result: `result.ok=true`, `sessionId=session-19b310d9-247c-468d-a15c-70f30a94e3bb`, `agentPreset=minimal`.
- One complete public list request followed the three creates:

  ```text
  POST /api/session.list
  {"type":"client-request","rpcId":"issue17-acceptance-session-list-after-four","method":"session.list","payload":{}}
  ```

  Complete public response (all four items, including public projection fields):

  ```json
  {
    "type":"server-response",
    "rpcId":"issue17-acceptance-session-list-after-four",
    "result":{
      "ok":true,
      "value":{
        "items":[
          {"sessionId":"session-19b310d9-247c-468d-a15c-70f30a94e3bb","updatedAt":1787515134914,"running":false,"blank":true,"cwd":"/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package","agentPreset":"minimal","projections":{"asOfSeq":2,"values":{"sessionStats":{"turns":0,"steps":0,"llmMs":0,"toolMs":0,"ttftMs":0,"ttftSteps":0,"decodeMs":0,"decodeTokens":0},"title":null,"goal":null,"tokenUsage":{"uncachedInputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0},"contextPressure":{},"contextBreakdown":{"systemTokens":0,"toolsTokens":0,"messageTokens":0},"subagentTiming":{"settledMs":0},"subagent":null,"permissions":{"options":[{"value":"read-only","name":"read-only"},{"value":"workspace-write","name":"workspace-write"},{"value":"danger-full-access","name":"danger-full-access"}],"currentValue":"workspace-write"},"sessionListMetadata":{"blank":true,"lastPromptAt":null},"imageLimits":{"maxImageBytes":3670016,"maxImagesPerMessage":20,"maxMessageImageBytes":104857600,"maxImagePixels":40000000,"maxImageDimension":2000,"mediaTypes":["image/png","image/jpeg","image/webp","image/gif"]},"todos":null,"plan":{"active":false,"pending":false}}}},
          {"sessionId":"session-d222d8d4-2e85-4f6d-93ed-63435de3b4ed","updatedAt":1787515134761,"running":false,"blank":true,"cwd":"/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package","agentPreset":"standard","projections":{"asOfSeq":2,"values":{"sessionStats":{"turns":0,"steps":0,"llmMs":0,"toolMs":0,"ttftMs":0,"ttftSteps":0,"decodeMs":0,"decodeTokens":0},"title":null,"goal":null,"tokenUsage":{"uncachedInputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0},"contextPressure":{},"contextBreakdown":{"systemTokens":0,"toolsTokens":0,"messageTokens":0},"subagentTiming":{"settledMs":0},"subagent":null,"permissions":{"options":[{"value":"read-only","name":"read-only"},{"value":"workspace-write","name":"workspace-write"},{"value":"danger-full-access","name":"danger-full-access"}],"currentValue":"workspace-write"},"sessionListMetadata":{"blank":true,"lastPromptAt":null},"imageLimits":{"maxImageBytes":3670016,"maxImagesPerMessage":20,"maxMessageImageBytes":104857600,"maxImagePixels":40000000,"maxImageDimension":2000,"mediaTypes":["image/png","image/jpeg","image/webp","image/gif"]},"todos":null,"plan":{"active":false,"pending":false}}}},
          {"sessionId":"session-c85c6d85-9a78-459d-b20e-494719f11055","updatedAt":1787515134682,"running":false,"blank":true,"cwd":"/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package","agentPreset":"harness-comfyui","projections":{"asOfSeq":2,"values":{"sessionStats":{"turns":0,"steps":0,"llmMs":0,"toolMs":0,"ttftMs":0,"ttftSteps":0,"decodeMs":0,"decodeTokens":0},"title":null,"goal":null,"tokenUsage":{"uncachedInputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0},"contextPressure":{},"contextBreakdown":{"systemTokens":0,"toolsTokens":0,"messageTokens":0},"subagentTiming":{"settledMs":0},"subagent":null,"permissions":{"options":[{"value":"read-only","name":"read-only"},{"value":"workspace-write","name":"workspace-write"},{"value":"danger-full-access","name":"danger-full-access"}],"currentValue":"workspace-write"},"sessionListMetadata":{"blank":true,"lastPromptAt":null},"imageLimits":{"maxImageBytes":3670016,"maxImagesPerMessage":20,"maxMessageImageBytes":104857600,"maxImagePixels":40000000,"maxImageDimension":2000,"mediaTypes":["image/png","image/jpeg","image/webp","image/gif"]},"todos":null,"plan":{"active":false,"pending":false}}}},
          {"sessionId":"session-e8b95544-34c0-4e4f-b2a3-2be6796d400b","updatedAt":1787514616846,"running":false,"blank":false,"cwd":"/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package","agentPreset":"harness-comfyui","projections":{"asOfSeq":131,"values":{"sessionStats":{"turns":2,"steps":2,"llmMs":178780,"toolMs":0,"ttftMs":175146,"ttftSteps":1,"decodeMs":3634,"decodeTokens":309},"title":"请用三句话说明：Issue 17 浏览","goal":null,"tokenUsage":{"uncachedInputTokens":1082,"outputTokens":309,"cacheReadTokens":0,"cacheWriteTokens":0},"contextPressure":{"pressureTokens":1082,"projectedTokens":1262,"contextWindow":1000000},"contextBreakdown":{"systemTokens":522,"toolsTokens":99,"messageTokens":374},"subagentTiming":{"settledMs":0},"permissions":{"options":[{"value":"read-only","name":"read-only"},{"value":"workspace-write","name":"workspace-write"},{"value":"danger-full-access","name":"danger-full-access"}],"currentValue":"workspace-write"},"sessionListMetadata":{"blank":false,"lastPromptAt":1787514616846},"imageLimits":{"maxImageBytes":3670016,"maxImagesPerMessage":20,"maxMessageImageBytes":104857600,"maxImagePixels":40000000,"maxImageDimension":2000,"mediaTypes":["image/png","image/jpeg","image/webp","image/gif"]}}}}
        ]
      }
    }
  }
  ```

- List proof: total project Session list length is exactly `4`; filtering the public items by `agentPreset=harness-comfyui` returns exactly `2` IDs (`session-c85c6d85-9a78-459d-b20e-494719f11055` and `session-e8b95544-34c0-4e4f-b2a3-2be6796d400b`). `standard` and `minimal` each occur once. No `origin` field is present on these ordinary public Sessions. No refresh/reconnect or further create request was performed after this list, so this construction added no third project Session.
- The `origin="subagent"` branch remains a documented real-runtime limitation: rc.8 has no public creation API for it, so the focused tests already marked PASS remain the only evidence for that branch; no fixture was injected into production.

### PRD 16:71 read-only feasibility and reversible move plan

- Scope of this turn: read-only path/type/permission inventory and plan only. Host was not stopped, no runtime path was moved, no log or credential content was read, no source/package/config was changed, and no test was run.
- Current release-local Preset paths:

  ```text
  runtime/production/releases/0.1.3/dsh-home/.agent-presets                         Directory 0755 uid=501 gid=20
  runtime/production/releases/0.1.3/dsh-home/.agent-presets/harness-comfyui         Directory 0755 uid=501 gid=20
  runtime/production/releases/0.1.3/dsh-home/.agent-presets/harness-comfyui/preset.yml       Regular File 0644 uid=501 gid=20 bytes=142
  runtime/production/releases/0.1.3/dsh-home/.agent-presets/harness-comfyui/agent.cordis.yml Regular File 0644 uid=501 gid=20 bytes=650
  ```

- Current Session persistence and projection registry paths:

  ```text
  runtime/production/releases/0.1.3/dsh-home/sessions                                      Directory 0700 uid=501 gid=20
  runtime/production/releases/0.1.3/dsh-home/sessions/--Volumes-4Tdisk-work-AI2-harness-comfyui-issue-17-runtime-production-releases-0.1.3-package-- Directory 0700 uid=501 gid=20
  .../session-19b310d9-247c-468d-a15c-70f30a94e3bb/session.jsonl.zstd Regular File 0600 uid=501 gid=20 bytes=359
  .../session-c85c6d85-9a78-459d-b20e-494719f11055/session.jsonl.zstd Regular File 0600 uid=501 gid=20 bytes=360
  .../session-d222d8d4-2e85-4f6d-93ed-63435de3b4ed/session.jsonl.zstd Regular File 0600 uid=501 gid=20 bytes=357
  .../session-e8b95544-34c0-4e4f-b2a3-2be6796d400b/session.jsonl.zstd Regular File 0600 uid=501 gid=20 bytes=12134
  runtime/production/releases/0.1.3/dsh-home/storages                                     Directory 0700 uid=501 gid=20
  runtime/production/releases/0.1.3/dsh-home/storages/session_projcache.json              Regular File 0600 uid=501 gid=20 bytes=11407
  ```

  The `...` prefix above is the exact encoded cwd directory shown on the preceding line; the four explicit session IDs are the complete current Session persistence set. No contents were read.
- Current Workspace registry path:

  ```text
  runtime/production/releases/0.1.3/dsh-home/storages/workspace.json Regular File 0600 uid=501 gid=20 bytes=638
  ```

- Proposed backup root (read-only precondition check): `runtime/production/issue-17-prd16-71-backup` is currently absent. No directory was created.
- Exact future move allowlist, only after an explicitly authorized execution turn and after stable CLI stop confirms PID/port release:

  ```text
  runtime/production/releases/0.1.3/dsh-home/.agent-presets/harness-comfyui
    -> runtime/production/issue-17-prd16-71-backup/preset/harness-comfyui
  runtime/production/releases/0.1.3/dsh-home/sessions/--Volumes-4Tdisk-work-AI2-harness-comfyui-issue-17-runtime-production-releases-0.1.3-package--
    -> runtime/production/issue-17-prd16-71-backup/sessions/--Volumes-4Tdisk-work-AI2-harness-comfyui-issue-17-runtime-production-releases-0.1.3-package--
  runtime/production/releases/0.1.3/dsh-home/storages/workspace.json
    -> runtime/production/issue-17-prd16-71-backup/registry/workspace.json
  runtime/production/releases/0.1.3/dsh-home/storages/session_projcache.json
    -> runtime/production/issue-17-prd16-71-backup/registry/session_projcache.json
  ```

  `dsh-home/.credentials.yaml`, `dsh-home/settings.yaml`, `dsh-home/profiles/**`, release `node_modules`, shared logs, shared data, and installation state are explicitly outside this allowlist. The four Session directories move together through their single encoded cwd directory; no individual Session file is edited.
- Proposed reversible sequence: stop the foreground Host and verify PID/4173 release; create the absent backup root with explicit `preset`, `sessions`, `registry`, and `generated-empty` children; move only the four allowlisted entries with metadata-preserving `mv`; start the same stable CLI foreground; use the real browser to trigger one ordinary new-session create; expect the public Host refusal `agent-preset-not-found` for configured default `harness-comfyui`, surfaced by the Workbench as exact `WORKBENCH_SESSION_CREATE_FAILED`, with no fallback to `standard` or `minimal`; stop again; move any newly generated empty `sessions/<encoded-cwd>` and registry files into `generated-empty` without overwriting the backups; move the four originals back to their exact paths; verify metadata and public list/workspace/preset continuity; restart foreground Host. The backup root can then be removed only after the parent confirms the restored four Sessions and Workspace.
- Start feasibility: rc.8 `composeAgent(undefined)` resolves the configured default only when `session.create`/resume composes an Agent; the stable CLI `start` path itself boots the profile and does not resolve a Session preset. Therefore a missing user Preset is expected to allow Host/profile startup, while the default `harness-comfyui` resolution on the first browser Session create is expected to fail with `agent-preset-not-found` (the public mapper preserves that code and does not substitute another preset). This is a code-contract assessment, not an executed missing-Preset run.
- Feasibility/risk decision: the move plan is technically reversible with the exact allowlist and a second stop boundary, but it is not safe to execute while the current Host is running or without a parent-authorized cleanup turn. The current turn therefore stops at proposal; no runtime state changed.

### PRD 16:71 isolation execution — start preflight blocker and immediate restore

- Authorized scope: exact four-entry allowlist only; no source/package/config/test/fixture changes. Host was stopped before any move. No log or credential content was read or output.
- Stable stop command returned installation `harness-comfyui-production`, active version `0.1.3`, status `stopped`; read-only checks confirmed `PID 21446=absent` and `port 4173=free`.
- Created only `runtime/production/issue-17-prd16-71-backup/{preset,sessions,registry}`; all four directories were 0700, uid=501, gid=20. No `generated-empty` directory was created.
- Exact moves and checks:
  - `.agent-presets/harness-comfyui` moved to `backup/preset/harness-comfyui`; source disappeared; target retained `preset.yml` 0644/142 bytes and `agent.cordis.yml` 0644/650 bytes.
  - The encoded production-cwd Session directory moved to `backup/sessions/<same-encoded-cwd>`; source disappeared; target contained exactly 4 `session.jsonl.zstd` files and remained 0700.
  - `storages/workspace.json` moved to `backup/registry/workspace.json`; source disappeared; target remained 0600/638 bytes.
  - `storages/session_projcache.json` moved to `backup/registry/session_projcache.json`; source disappeared; target remained 0600/11407 bytes.
- Start attempt (same stable CLI/installation, foreground request):

  ```text
  PATH=/Volumes/4Tdisk/work/AI2/harness-comfyui/.planning/issue-17/pnpm-11.7.0-bin:/Users/fzfz/.nvm/versions/node/v24.14.0/bin:$PATH npm_config_manage_package_manager_versions=false /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/bin/harness-comfyui start --installation /Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/installation.json
  ```

  Result: immediate exit code `1`; no PTY session was created and no Host started. Exact redacted-safe error: `harness-comfyui: Preset release root does not exist: .../runtime/production/releases/0.1.3/dsh-home/.agent-presets/harness-comfyui: ENOENT ...`. This is a stable CLI preflight failure before rc.8 boot, not the expected public `WORKBENCH_SESSION_CREATE_FAILED` browser branch.
- Per the failure rule, no browser create and no public list calls were attempted. The four moves were immediately reversed in opposite order. Restore checks passed: Preset files restored with original modes/bytes, the production-cwd persistence directory restored with exactly 4 Session files and mode 0700, `workspace.json` restored 0600/638 bytes, and `session_projcache.json` restored 0600/11407 bytes. Sources are present at original paths and corresponding backup entries are absent.
- Final isolation state: `PID 21446=absent`, `port 4173=free`; the backup root remains undeleted at `runtime/production/issue-17-prd16-71-backup` with empty `preset`, `sessions`, and `registry` directories. No runtime state from the original four Sessions or Workspace was deleted. Host restart and backup cleanup require a new parent authorization.
- Assessment: the proposed no-Preset browser error cannot be reached through the stable product CLI because CLI start itself requires the release-local Preset directory. Any test of `WORKBENCH_SESSION_CREATE_FAILED` would require a different approved injection boundary or product behavior change; neither is authorized in this acceptance turn.

### PRD 16:71 public-remove isolation — awaiting browser create

- Authorized second isolation scope: no source/package/config/test/fixture changes. The Host was stopped before state movement; no browser connection was present before the public removal call. Backup root was not deleted.
- Preset copy: original `runtime/production/releases/0.1.3/dsh-home/.agent-presets/harness-comfyui` was copied (not moved) to `runtime/production/issue-17-prd16-71-backup/preset/harness-comfyui`. Both copy and source had `preset.yml` mode 0644/142 bytes and `agent.cordis.yml` mode 0644/650 bytes before public removal.
- Only the three persistence entries were moved to the existing backup targets: the encoded production-cwd Session directory (exactly 4 `session.jsonl.zstd` files, target directory mode 0700), `registry/workspace.json` (0600/638 bytes), and `registry/session_projcache.json` (0600/11407 bytes). The original Preset was not moved by shell.
- Same stable CLI foreground start succeeded with URL `http://127.0.0.1:4173` in PTY session `57335`. The Host was running before the public remove call.
- Public loopback removal request, made before any browser connection:

  ```text
  POST /api/agentPreset.remove
  {"type":"client-request","rpcId":"issue17-acceptance-agent-preset-remove-harness-comfyui","method":"agentPreset.remove","payload":{"agentPreset":"harness-comfyui"}}
  ```

  Result: `result.ok=true`, `value={}`. No credential or path content was returned.
- Public read-only checks after removal:

  ```text
  POST /api/agentPreset.list
  {"type":"client-request","rpcId":"issue17-acceptance-agent-preset-list-after-remove","method":"agentPreset.list","payload":{}}
  ```

  Result: `result.ok=true`; roster contains `standard`, `code`, `minimal`, and `cordis` only; `harness-comfyui` is absent; `authorable=true`, `hasDocument=true`.

  ```text
  POST /api/session.list
  {"type":"client-request","rpcId":"issue17-acceptance-session-list-after-remove","method":"session.list","payload":{}}
  ```

  Result: `result.ok=true`, `items=[]`.

  ```text
  POST /api/workspace.list
  {"type":"client-request","rpcId":"issue17-acceptance-workspace-list-after-remove","method":"workspace.list","payload":{}}
  ```

  Result: `result.ok=true`, `items=[]`, `archivedSessionIds=[]`.
- Stable `status --json` was additionally attempted only to obtain the new PID; it returned exit `1` at its expected release-Preset preflight with the same non-sensitive ENOENT for `.agent-presets/harness-comfyui`. It did not stop or mutate the running Host. Read-only `ps/lsof` then confirmed the tracked foreground CLI process PID `31707`, Harness child PID `31715`, and listener `127.0.0.1:4173`; PTY remains `57335`.
- Current state: Host remains foreground and ready for the parent’s real browser create attempt. No `session.create` was called by this executor. The original four Session/Workspace persistence entries remain in backup; the original user Preset has been removed through the authorized public API and its recoverable copy remains at `runtime/production/issue-17-prd16-71-backup/preset/harness-comfyui`. Parent must authorize stop and reverse restoration after browser acceptance.

### PRD 16:71 restoration after missing-Preset browser PASS

- Parent reported the browser missing-Preset branch PASS with exact middle-column error `Harness 未能创建 ComfyUI 工作台会话，请查看产品日志。`; browser was closed before restoration. No source/package/config/test change was authorized.
- Stable stop of PTY `57335`/Harness PID `31715` returned `status=stopped`; read-only checks confirmed `PID 31715=absent` and `port 4173=free`.
- Failure-state inventory after the browser attempt found no new Session persistence directory and no new projection cache. It found one newly generated `dsh-home/storages/workspace.json`; this was moved without reading contents to `runtime/production/issue-17-prd16-71-backup/failed-attempt/workspace.json`, regular file 0600/199 bytes, without overwriting the original registry backup.
- Restoration from the original backup (backup retained) passed:
  - release-local Preset restored from `backup/preset/harness-comfyui`; `preset.yml` 0644/142 bytes and `agent.cordis.yml` 0644/650 bytes match the backup copy.
  - the original production-cwd Session directory restored; source and backup each contain exactly 4 `session.jsonl.zstd` files; directories remain 0700.
  - `workspace.json` restored 0600/638 bytes; backup copy remains unchanged.
  - `session_projcache.json` restored 0600/11407 bytes; backup copy remains unchanged.
- Same installation foreground restart was attempted once after full restoration. It failed immediately with exit `1` and exact non-sensitive message: `harness-comfyui: Agent settings must equal the fixed opencode-go model overlay`. No PTY or Host was created; no retry was made. Read-only checks confirm `PID 31715=absent` and `port 4173=free`.
- Final recovery boundary: all four original state classes are present at their original paths and in backup; the additional failed-attempt workspace file is isolated; backup was not deleted. Because restored stable CLI start is blocked by the out-of-allowlist Agent settings preflight, `status/health` and post-restore public list verification could not run, and no Host is currently available for browser reconnection. Further config diagnosis or correction requires parent authorization; no config was changed in this turn.

### Restored-start settings diagnosis — read-only

- Scope: Host remained stopped; no start, test, settings mutation, credential read, source edit, package edit, or runtime configuration edit was performed. `settings.describe` could not be called because no Host was running.
- Read-only settings metadata: `runtime/production/releases/0.1.3/dsh-home/settings.yaml`, regular file, mode `0600`, uid `501`, gid `20`, `191` bytes, mtime `2026-08-24T04:08:34+0800`.
- The artifact's structured product source is `runtime/production/releases/0.1.3/package/config/product-agent.json`; its fixed `agentModel` is enforced and rendered by `runtime/production/releases/0.1.3/package/scripts/deploy/preflight.mjs` (`FIXED_AGENT_MODEL`/`renderAgentSettings`). Non-sensitive comparison:
  - `agent-default-model.provider`: expected `opencode-go`, actual `opencode-go`.
  - `agent-default-model.model`: expected `deepseek-v4-flash`, actual `deepseek-v4-flash`.
  - `agent-default-model.reasoningEffort`: expected `max`, actual `max`.
  - `llm-pi-ai.providers.opencode-go`: expected present, actual present; `apiKeyEnv` field is present on both sides (value intentionally not recorded).
  - Extra actual top-level field: `agent-presets: {}`. The fixed renderer does not emit this field; preflight compares the complete settings text, so this is the minimal diff causing `Agent settings must equal the fixed opencode-go model overlay`.
- Mtime trace: the acceptance command history contains no `settings.*` public write. The recorded public mutation was `agentPreset.remove`; settings was outside both PRD 16:71 move allowlists and was not edited during restoration. Therefore mtime `04:08:34+0800` cannot be causally attributed to a specific accepted operation from this record.
- Proposed but not executed recovery: with parent authorization, apply one-line deletion of `agent-presets: {}` from the release-local `settings.yaml`; do not alter any other line or credential field. Then run the fixed stable CLI `preflight --installation runtime/production/installation.json --artifact .release/quality/harness-comfyui-0.1.3.tgz`, start the same installation in the tracked foreground PTY, and use only public `settings.describe`, `status --json`, and `health --json` for verification.

### Restored-start settings correction and runtime verification

- Authorized change: one `apply_patch` deletion of only the final `agent-presets: {}` line from `runtime/production/releases/0.1.3/dsh-home/settings.yaml`. No other settings line, credential field, source file, package file, or test file changed.
- Stable preflight command (same wrapper-first pnpm 11.7.0 environment, same artifact) exited `0` with `status=passed`; fixed product agent remained `harness-comfyui` and fixed model identifiers remained non-sensitive `opencode-go/deepseek-v4-flash`, `reasoningEffort=max`.
- Stable foreground start exited into tracked PTY `46210` and printed `dsh web: http://127.0.0.1:4173`; Host remains running at URL `http://127.0.0.1:4173`.
- `status --json`: PASS, installation `harness-comfyui-production`, active version `0.1.3`, PID `32592`, host `127.0.0.1`, port `4173`, status `running`.
- `health --json`: PASS for process, active release, agent Preset installation/roster, Harness Web, Client bundle, plugin status, Run Repository, and Saved Media. Preset roster reports `harness-comfyui`, `trust=user`, `isDefault=true`.
- Public `POST /api/agentPreset.list`: `result.ok=true`; `harness-comfyui` is present alongside `standard`, `code`, `minimal`, and `cordis`.
- Public `POST /api/session.list`: `result.ok=true`; exactly the four restored IDs are present: `session-e8b95544-34c0-4e4f-b2a3-2be6796d400b`, `session-c85c6d85-9a78-459d-b20e-494719f11055`, `session-d222d8d4-2e85-4f6d-93ed-63435de3b4ed`, and `session-19b310d9-247c-468d-a15c-70f30a94e3bb`. The two `harness-comfyui` Sessions are e8 and c85; standard and minimal IDs are d222 and 19b. No extra Session was created.
- Public `POST /api/workspace.list`: `result.ok=true`; workspace `ddb6bc7c-ebda-4d3e-8878-f4f72b671cd9` remains associated with restored Session `session-e8b95544-34c0-4e4f-b2a3-2be6796d400b`; `archivedSessionIds=[]`.
- Public `POST /api/credentials.describe` with ref `OPENCODE_GO_API_KEY`: `result.ok=true`, `configured=true`, `source=file`, `writable=true`; no credential value was read or recorded.
- No tests were run. Backup root `runtime/production/issue-17-prd16-71-backup` remains undeleted. Host stays in foreground PTY `46210` for final browser reconnection.

### Read-only duplicate Session source diagnosis

- Public `POST /api/session.list` returned five total Sessions. Duplicate `session-5aca189e-b8e8-4a4d-a592-60bcdcd36823` has `agentPreset=harness-comfyui`, `cwd=/Volumes/4Tdisk/work/AI2/harness-comfyui-issue-17/runtime/production/releases/0.1.3/package`, `updatedAt=2026-08-23T20:18:37.886Z`, `running=false`, `blank=true`; public response exposes no `origin` or `createdAt` field. The other public fields show e8 nonblank harness, c85 blank harness, d222 blank standard, and 19b blank minimal.
- Public `POST /api/workspace.list` returned workspace `ddb6bc7c-ebda-4d3e-8878-f4f72b671cd9` with `sessionIds=["session-5aca189e-b8e8-4a4d-a592-60bcdcd36823","session-e8b95544-34c0-4e4f-b2a3-2be6796d400b"]`; c85 is not in this workspace list. Workspace `updatedAt=2026-08-23T20:18:37.913Z`, immediately after the duplicate Session update. `archivedSessionIds=[]`.
- Public `POST /api/host.describe` returned `attachedSessions=2`, cwd unchanged, provider/model `opencode-go/deepseek-v4-flash`, and `canOpenPath=true`.
- Stable `logs --source operations --lines 200` contains only product lifecycle commands (install/preflight/start/status/health/logs/stop); filtered stdout/all logs contain no non-sensitive `session.create`, `connectWorkspace`, `workspace`, duplicate ID, `origin`, or source record. Therefore the stable log does not identify the caller.
- Artifact client source `src/client/workbench/workbench-session-binding.ts` and shipped `package/lib/client.js` explicitly implement the Workbench binding with `connection.api.sessions.create({cwd: host.cwd, agentPreset: WORKBENCH_AGENT_PRESET})`; no `connectWorkspace` call is present in the shipped Workbench client. This makes Workbench binding the stronger source hypothesis for 5aca. However, the public fields and logs do not prove whether the WorkspaceRuntime subsequently associated that Session or whether a separate `connectWorkspace({workspaceId})` path created it; `origin`/`createdAt` are not exposed, so this distinction remains unproven without an API trace or runtime instrumentation.
- No state was changed, no Session was created, no tests were run, and the foreground Host remains running in PTY `46210`.

### Final technical acceptance shutdown and cleanup

- Stable CLI stop targeted installation `harness-comfyui-production` and returned `status=stopped`, `pid=null`, host `127.0.0.1`, port `4173`. PTY `46210` naturally returned the tracked start result with `status=stopped` and PID `32592`.
- Read-only post-stop checks: `ps -p 32592` returned no process, `lsof -nP -iTCP:4173 -sTCP:LISTEN` returned no listener, and stable `status --json` returned `status=stopped`, `pid=null`, `startedAt=null`.
- Before deletion, only `runtime/production/releases/0.1.3/dsh-home/.credentials.yaml` was targeted after exact metadata verification: regular file, mode `0600`, `415` bytes, uid `501`, gid `20`. The file was deleted with `apply_patch`; the release-local path is absent. Trusted source `/Users/fzfz/.dsh/.credentials.yaml` was not modified; read-only metadata remains regular file, `0600`, `415` bytes.
- Before deletion, `node_modules` was verified as a symlink with readlink target `/Volumes/4Tdisk/work/AI2/harness-comfyui/node_modules` and realpath equal to that main-repository dependency directory. Only the worktree symlink was removed with `unlink`; the main-repository `node_modules` directory remains present.
- Remaining runtime/production data and `runtime/production/issue-17-prd16-71-backup` were intentionally retained for the parent’s final record and later authorized worktree cleanup. No source/package/test/config changes were made in this cleanup.
- Final worktree checks: `git status --short --branch` returned only `## codex/issue-17-session-binding`; `git diff --check` returned no output. No untracked files remain in the Issue worktree. No tests were run during shutdown/cleanup.
