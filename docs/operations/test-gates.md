# 分层测试门禁与 Release Artifact 复用

## 术语定义

| 对象 | 执行主体和对象定义 |
| --- | --- |
| Fast Quality Gate | `.github/workflows/ci.yml` 的 `quality` job 执行 `quality:preinstall`、frozen install 和 `quality:fast`，为 Pull Request 与 `main` push 提供快速门禁。 |
| Release Artifact | `.github/workflows/deploy.yml` 的 `candidate` job 针对一个精确 commit 生成的 `.tgz` 文件及 `.release/quality/artifact.json` manifest。manifest 记录 version、commit、filename、byteLength、SHA-256 和当前 runner 上的 tarballPath。 |
| Artifact Qualification | `.github/workflows/deploy.yml` 针对一个 Release Artifact 运行四个独立慢门禁，并在四个门禁全部通过后生成 qualified artifact。 |
| Qualification Record | `qualification` job 写入的 `.release/quality/qualification.json`。该 JSON 把 workflow run ID、commit、Release Artifact 身份和四个门禁的通过状态绑定在一起。 |
| Release Preview | `.github/workflows/release.yml` 的 `workflow_dispatch` job。该 job 下载指定 qualification run 产生的 qualified artifact，验证其身份后调用 preview，不重新构建或重新运行 Artifact Qualification。 |

## Fast Quality Gate

### Pull Request

Pull Request 触发 `.github/workflows/ci.yml` 的 `quality` job。该 job 在准备 Node.js 和 pnpm 后依次执行以下三个门禁步骤：

1. `pnpm run quality:preinstall` 执行 `check:manifest-lock`、`security:advisories` 和 `security:build-scripts`。
2. `pnpm install --frozen-lockfile` 按 lockfile 安装依赖。
3. `pnpm run quality:fast` 依次执行以下六项 fast quality 检查：
   - `pnpm run check:harness-boundary` 检查 Harness boundary。
   - `pnpm run typecheck` 执行 TypeScript 类型检查。
   - `pnpm run test:coverage` 运行 `tests/unit` 与 `tests/integration`，并执行数值 coverage 检查。
   - `pnpm run test:contract` 运行 contract 测试及其列出的部署、release-package 和 security contract 测试。
   - `pnpm run test:prototype` 运行 generation-workbench prototype 测试。
   - `pnpm run build` 构建 Harness bundle。

Pull Request 的 `quality` job 不调用 `package:pack`、`package:validate`、`test:deploy`、`test:composition`、`test:e2e` 或 `release:smoke`。Pull Request 不进入 Artifact Qualification。

### Coverage 数值门禁

`config/quality-gates.json` 为 `test:coverage` 指定 V8 provider，并把 product source 的 coverage 范围定义为：

- include：`src/**/*.{ts,tsx}`；
- exclude：`src/**/*.d.ts` 和 `src/testing/**`。

该配置要求以下最低数值：statements 为 `88`，branches 为 `79`，functions 为 `100`，lines 为 `91`。

## `main` push 的变更分类

每次 `main` push 都必须先通过 `quality` job。`impact` job 在 `quality` job 通过后读取 GitHub event 的 `before` 与当前 `github.sha`，并调用 `scripts/ci/classify-changes.mjs` 对 `git diff --name-only --no-renames before after` 返回的 changed paths 分类。

classifier 只有在每一个 changed path 都属于下面三个 fast-only 类别时才返回 `qualify=false`：

- 精确路径 `README.md`；
- 以 `docs/` 开头的路径；
- 以 `prototype/` 或 `.planning/` 开头的路径。

所有其他分类结果都返回 `qualify=true`。classifier 对以下情况 fail closed，并要求 Artifact Qualification：

- changed paths 为空；
- `before` 或 `after` 缺失、格式无效、为全零 commit，或 Git diff 失败；
- changed path 不属于 fast-only 类别的未知路径；
- 已删除的产品文件路径，因为该路径不属于 fast-only 类别；
- `workflow_dispatch`，因为该事件没有上游 `quality` job。

当 classifier 返回 `qualify=true` 时，`ci.yml` 以当前 `github.sha` 调用 `.github/workflows/deploy.yml` 的 reusable workflow。当 classifier 返回 `qualify=false` 时，`ci.yml` 跳过 Artifact Qualification。

## Artifact Qualification

### Candidate job 的单次构建和打包

`deploy.yml` 要求调用方提供精确 commit。`candidate` job checkout 该 commit，并验证 checkout 的 HEAD 与输入 commit 相同。

在 reusable CI 路径中，上游 `quality` job 已经通过 fast quality；`candidate` job 仍执行一次 `pnpm run build`，为打包重新生成 `lib`，然后执行一次 `pnpm run package:pack` 和一次 `pnpm run package:validate`。在 `workflow_dispatch` 路径中没有上游 fast gate，`candidate` job 先执行一次 `pnpm run quality:fast`，再执行一次 `pnpm run package:pack` 和一次 `pnpm run package:validate`。因此，每个 candidate job 只构建一次并只打包一次。

`candidate` job 上传名为 `quality-candidate` 的 candidate。该 candidate 包含 `.release/quality/artifact.json`、一个 `.release/quality/*.tgz` 和 `lib/**`。四个慢门禁 job 都从这个 candidate 下载 tarball，不从源码重新构建或重新打包。

### 四个并行慢门禁

四个慢门禁 job 都声明 `needs: candidate`，因此四个 job 在 candidate 成功后独立并行运行：

| Job | 执行命令 | 该 job 的门禁对象 |
| --- | --- | --- |
| `deploy-lifecycle` | `pnpm test:deploy` | Deploy lifecycle |
| `composition` | `pnpm test:composition` | Composition |
| `browser-e2e` | `pnpm test:e2e` | Browser E2E |
| `release-smoke` | `pnpm run release:smoke` | Release smoke |

每个慢门禁 job 都下载 `quality-candidate`，然后执行 `node scripts/ci/artifact-qualification.mjs relocate --root "$PWD"`。该脚本读取 tarball bytes，计算 tarball 的 byteLength 和 SHA-256，并把计算值与 `artifact.json` 的 byteLength、sha256 和 filename 比较；比较通过后，脚本把 manifest 的 tarballPath relocation 到当前 runner 的 `.release/quality/<filename>`，再验证 relocation 后的 manifest 与 tarball。每个慢门禁 job 随后只执行自己的门禁命令。

### Qualification Record 和 qualified artifact

`qualification` job 只在 `deploy-lifecycle`、`composition`、`browser-e2e` 和 `release-smoke` 四个 job 全部通过后运行。该 job 下载并 relocation 同一个 `quality-candidate`，然后使用 `scripts/ci/artifact-qualification.mjs write` 写入 `qualification.json`。

该 record 绑定以下对象：

- `runId` 是当前 Artifact Qualification workflow 的 `github.run_id`；
- `commit` 是 workflow 输入的精确 commit；
- `artifact.version`、`artifact.filename`、`artifact.byteLength` 和 `artifact.sha256` 来自 `artifact.json`；
- `gates` 包含 `test:deploy`、`test:composition`、`test:e2e` 和 `release:smoke`，并且每个 gate 的 `status` 都是 `passed`。

`qualification` job 随后使用同一组 version、commit、run ID 和 SHA-256 验证 record 与 tarball，再上传名为 `quality-qualified` 的 qualified artifact。该 qualified artifact 包含 `artifact.json`、同一个 `.tgz`、`qualification.json` 和 `lib/**`。

## Release Preview 对 qualified artifact 的复用

Release Preview 只接受 `.github/workflows/release.yml` 中四个必填 input：`version`、`commit`、`qualification_run_id` 和 `artifact_sha256`。`release-preview` job checkout 指定 commit，确认该 commit 位于 origin main 历史中，然后从 `qualification_run_id` 指定的 workflow run 下载名为 `quality-qualified` 的 artifact。

Release Preview 下载后执行 relocation，并使用 `scripts/ci/artifact-qualification.mjs validate` 同时验证以下对象：

- manifest 的 version、commit 与 input 相同，tarball bytes 的 SHA-256 与 `artifact_sha256` input 相同；
- `qualification.json` 的 run ID、commit 和 artifact 字段与 manifest 和 input 相同；
- `qualification.json` 的四个 gate 都是 `passed`。

验证通过后，job 调用 `scripts/release/preview.mjs`。Release Preview 不安装依赖、不执行 build、不执行 package pack、不执行完整 lifecycle 测试、不执行 Artifact Qualification，也不发布、创建 tag 或 push。该 workflow 只上传 `release-preview` 结果 artifact。

## 触发场景与产物

| 触发场景 | 执行门禁 | 产物 | 是否运行慢测试 |
| --- | --- | --- | --- |
| Pull Request | `quality:preinstall`、frozen install、`quality:fast` | Fast Quality Gate 结果；不生成 qualification artifact | 否 |
| `main` push，所有 changed paths 都是 fast-only | `quality:preinstall`、frozen install、`quality:fast`，随后 classifier 返回 `qualify=false` | Fast Quality Gate 结果；不生成 candidate 或 qualified artifact | 否 |
| `main` push，classifier 出现空 changed paths、无效 commit 输入、未知 path、已删除产品文件路径或其他非 fast-only path | Fast Quality Gate 通过后执行 Artifact Qualification | `quality-candidate`、`quality-qualified`、`artifact.json`、`qualification.json` | 是；每个 qualified artifact 一次 |
| Artifact Qualification `workflow_dispatch` | candidate 先执行 `quality:preinstall`、frozen install 和 `quality:fast`，再执行打包、验证和四个慢门禁 | `quality-candidate`、`quality-qualified`、`qualification.json` | 是；每个 qualified artifact 一次 |
| Release Preview `workflow_dispatch` | 下载、relocation、record/tarball identity validation、preview | `release-preview` | 否 |

## 门禁运行原则

每个 qualifying artifact 只运行一次四个慢门禁；四个消费者 job 并行使用同一个 candidate tarball。Pull Request 只运行 Fast Quality Gate，Release Preview 只下载并验证已经 qualified 的 artifact，因此 Pull Request 与 Release Preview 都不会重复运行慢测试。`.github/workflows/ci.yml` 使用 `ci-${{ github.workflow }}-${{ github.ref }}` concurrency group 和 `cancel-in-progress: true`，所以新的 `main` push 会取消同一 ref 上仍在运行的旧 CI。

开发者可以显式运行 `pnpm run quality:artifact` 作为本地完整命令。该命令依次组合 `quality`、`package:pack`、`package:validate`、`test:deploy`、`test:composition`、`test:e2e` 和 `release:smoke`。常规 CI workflow 不调用 `quality:artifact`；CI 使用 candidate job 和四个并行 Artifact Qualification job 实现同一门禁边界。

当前实现没有 nightly 触发器、OS matrix、cache 配置或 production release workflow。当前 `release.yml` 只实现 Release Preview，不执行 production 发布、tag 或 push。
