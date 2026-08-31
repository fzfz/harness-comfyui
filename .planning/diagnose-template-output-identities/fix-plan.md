# Harness 适配 Source v0.86.1 三字段 TemplateBundle 修复方案

## 必须要实现的目标

- 计划执行者必须让 Harness 按 Source v0.86.1 合同读取只包含 `id`、`title`、`workflow_json` 的 TemplateBundle。
- 计划执行者必须删除 Harness 对 `revision_number`、`workflow_sha256`、`config_revision`、`dimension_strategy` 和 `expected_output_node_ids_json` 的 Source 输入依赖。
- `ComfyWorkflowCompiler` 必须根据目标 ComfyUI 实例实时 `/object_info` 和 Actual Workflow 连线确定活动输出节点。
- Generation Runtime 必须继续保存 compiler 返回的活动输出节点 ID，并继续使用该集合观察 ComfyUI Jobs API 输出。
- 计划执行者必须把当前 Source release pin 从 `0.84.0` 更新为 `0.86.1`，并发布 Harness ComfyUI 补丁版本。原目标 `0.37.3` 已被并发发布占用，本修复使用 `0.37.4`。
- 计划执行者必须在修改生产源码前新增三字段 TemplateBundle 回归测试，并观察该测试在当前代码上失败。

## 根因和术语

### 根因

Harness ComfyUI v0.37.2 的 `GenerationSourceCli.parseTemplate()` 固定解析 Source v0.84.0 TemplateBundle。Source v0.86.1 已经删除五个模板管理字段，并合法返回 `id`、`title`、`workflow_json`。Host 读取缺失的 `expected_output_node_ids_json` 时首先抛出 `SOURCE_PROTOCOL_ERROR`，因此模板 39 在 Generation Run 创建前被拒绝。

### 两类输出节点数据

- **Source 输出节点过滤器**：Source v0.84.0 的 `expected_output_node_ids_json`。Source v0.86.1 已删除该输入，本次修复必须删除 Harness 对应接口和分支。
- **编译后活动输出节点集合**：`ComfyWorkflowCompiler` 根据实时 `/object_info` 和 Workflow 连线生成的 `activeOutputNodeIds`。Generation Runtime 把该结果保存到 `generation_runs.expected_output_node_ids_json`，Comfy transport 使用该结果筛选 Jobs API 输出。本次修复必须保留该结果、数据库列和 transport 行为。

## 修复设计

### Source 合同和配置

| 文件 | 计划执行者必须完成的修改 |
|---|---|
| `config/source-contract-v0.86.1.json` | 新增当前结构化合同。Catalog 保留现有 10 个 operation 和 `sample_image_urls` 映射；Host Source 保留 2 个 operation；TemplateBundle 的 `requiredResultFields` 只包含 `id`、`title`、`workflow_json`；mapping 只保留模板 ID 和 Workflow JSON 的映射。 |
| `config/source-contract-v0.84.0.json` | 保留历史合同，不修改历史字段定义。 |
| `config/base.json` | 把 `source.sourceReleaseVersion` 更新为 `0.86.1`。 |
| `config/schema.ts` | 把 Configuration Profile 的 Source release 常量更新为 `0.86.1`。 |
| `scripts/production/contract.mjs` | 把 `SOURCE_RELEASE_VERSION` 更新为 `0.86.1`，使 Desktop、Web Host 和测试运行配置使用同一个结构化版本来源。 |

Harness 不新增 v0.84/v0.86 双版本解析，不为缺失字段填默认值，不从 live response 推断 Source release 版本。

### Source adapter 和 source snapshot

| 文件 | 计划执行者必须完成的修改 |
|---|---|
| `src/host/generation/source-cli.ts` | `parseTemplate()` 只校验并投影 `id`、`title`、`workflow_json`；删除五个退役字段读取；删除失去调用方的整数校验 helper。 |
| `src/host/generation/source-preparer.ts` | `ComfyTemplateBundle` 只保留 `id`、`title`、`workflow`；`safeSourceSnapshot()` 的 template 对象只保存 `id` 和 `title`；`WorkflowCompilerInput` 删除 `expectedOutputNodeIds`；`prepare()` 不再向 compiler 传入 Source 输出节点过滤器。 |

计划执行者不得重写或迁移历史 Generation Run 的 source snapshot 文件；新代码必须保留历史文件中的旧键，并且不得要求历史文件符合三字段 TemplateBundle 结构。

### Workflow compiler 模块

| 文件 | 计划执行者必须完成的修改 |
|---|---|
| `src/host/generation/workflow-compiler.ts` | 私有 `compile()` 删除 `expectedOutputNodeIds` 参数；该实现始终从 API Workflow 中选择 `/object_info.output_node=true` 且具备必需输入的活动节点；该实现删除未满足必需输入的输出节点；没有活动输出节点时继续返回 `WORKFLOW_COMPILE_FAILED`。 |
| `scripts/verification/comfyui-workflow-matrix.mjs` | 调用 compiler 时删除 `bundle.expectedOutputNodeIds`；验证报告继续记录 compiler 返回的 `activeOutputNodeIds`。 |

`ComfyWorkflowCompiler` 模块拥有输出节点发现规则。`GenerationSource` adapter 和 `SourceGenerationPreparer` 调用方不再了解 Source v0.84 的模板管理字段。

### 必须保留的 Runtime 行为

以下文件中的 `expectedOutputNodeIds` 表示 compiler 输出，不表示 Source 输入，本次修复不得删除：

- `src/host/generation/generation-runtime.ts` 的 `PreparedGeneration.expectedOutputNodeIds`。
- `generation_runs.expected_output_node_ids_json` SQLite 列及其恢复校验。
- `src/host/generation/comfy-http-transport.ts` 的输出筛选输入。
- `tests/unit/generation-runtime.test.ts`、`tests/unit/generation-worker.test.ts`、`tests/integration/cli-route.test.ts` 和 `tests/desktop/desktop-live.test.mjs` 中的 PreparedGeneration/transport fixtures。

### 回归测试和分支测试

| 测试文件 | 计划执行者必须完成的测试修改 |
|---|---|
| `tests/unit/generation-source-cli.test.ts` | 先新增 Source v0.86.1 三字段 TemplateBundle 成功解析测试并观察当前代码失败；修改实现后断言 bundle 只包含 `id`、`title`、`workflow`。删除旧 revision、config 和 Source 输出节点过滤器成功用例。保留无效 envelope、无效 Workflow 和进程错误分支。 |
| `tests/unit/generation-preparer.test.ts` | fixture 改为三字段 bundle；source snapshot 只断言实例安全信息和模板 ID/标题；compiler 调用断言不得出现 `expectedOutputNodeIds`；PreparedGeneration 仍断言 compiler 返回的活动输出节点集合。 |
| `tests/unit/generation-workflow-compiler.test.ts` | 从 87 个 compiler 输入 fixture 删除 `expectedOutputNodeIds`；保留并改名自动发现活动输出节点、删除断开输出节点、没有活动输出节点失败的测试；删除“声明的输出节点不是活动节点”旧输入分支测试；把“缺少实例必需输入时交给 ComfyUI `/prompt` 拒绝”的旧显式过滤器用例改为断言 compiler 返回 `WORKFLOW_COMPILE_FAILED`。 |
| `tests/contract/source-contract.test.ts` | 读取 `config/source-contract-v0.86.1.json`；固定版本、12 个 operation、Catalog 图片字段和三字段 TemplateBundle；断言五个退役字段不在 required fields 和 mapping 中。 |
| `tests/unit/config-loader.test.ts` | 把 Source release 配置断言更新为 `0.86.1`，保留错误版本拒绝分支。 |
| `tests/production/source-production.test.mjs` | 把生产 Configuration Profile 的 Source release 断言更新为 `0.86.1`。 |

计划执行者必须使用测试验证以下分支：

1. 三字段 TemplateBundle 解析成功。
2. `workflow_json` 缺失、不是对象、`nodes` 缺失和 Workflow 节点不是对象时返回精确 `SOURCE_PROTOCOL_ERROR`。
3. Workflow 只有一个满足必需输入的输出节点时返回该节点。
4. Workflow 同时包含满足和不满足必需输入的输出节点时只返回满足条件的节点，并从运行时 API Workflow 删除不满足条件的节点。
5. Workflow 没有活动输出节点时返回 `WORKFLOW_COMPILE_FAILED`。
6. compiler 返回的活动输出节点集合继续写入 Run Repository，并在 Run 恢复后继续传给 Comfy transport。

### 当前文档和版本文件

| 文件 | 计划执行者必须完成的修改 |
|---|---|
| `docs/v0.1/source-contract-v0.86.1.md` | 新增当前 Source v0.86.1 消费合同说明，明确三字段 TemplateBundle 和 compiler 输出节点发现责任。 |
| `docs/adr/0014-source-contract-v0.86.1.md` | 记录 Source pin 升级、三字段 TemplateBundle、compiler seam 和历史合同保留决定。 |
| `CONTEXT.md` | 把 Source Contract Identity 更新为 `0.86.1`，区分 Source bundle 与编译后活动输出节点集合。 |
| `docs/system/configuration.md` | 把 `source.sourceReleaseVersion` 更新为 `0.86.1`。 |
| `docs/system/architecture.md` | 把 Catalog Source 版本更新为 `0.86.1`，说明 compiler 始终读取实时 `/object_info` 发现活动输出节点。 |
| `docs/system/testing.md` | 把 Source 合同测试说明更新为 v0.86.1，并在最终门禁完成后写入实际测试数量和覆盖率。 |
| `docs/v0.1/source-data-catalog-implementation.md` | 保留 v0.84.0 Catalog 图片实施历史，更新当前消费合同链接为 v0.86.1。 |
| `package.json`、`tests/contract/engineering-baseline.test.ts` | 把 Harness 产品版本唯一结构化来源和工程合同更新为 `0.37.4`。 |
| `README.md`、`docs/releasenotes.md`、`docs/system/startup.md`、`docs/system/releasing.md` | 把当前产品版本和发布说明更新为 `0.37.4`，发布说明只描述 Source v0.86.1 TemplateBundle 适配和输出节点自动发现。 |

`docs/v0.1/source-contract-v0.82.2.md`、`docs/v0.1/source-contract-v0.84.0.md`、`docs/adr/0009-source-contract-version-gate.md` 和 `docs/adr/0013-source-contract-v0.84.0.md` 保留历史内容，不改写为当前合同。

## 实施顺序

1. 计划执行者在 `tests/unit/generation-source-cli.test.ts` 写入三字段 TemplateBundle 回归测试，并运行该测试确认当前代码因用户报告的错误而失败。
2. 计划执行者修改 Source adapter 和 `ComfyTemplateBundle`，使三字段回归测试通过。
3. 计划执行者删除 `WorkflowCompilerInput.expectedOutputNodeIds` 和显式过滤分支，更新 compiler、preparer 和 workflow matrix 测试。
4. 计划执行者新增 v0.86.1 结构化合同，更新 Source release 配置和合同测试。
5. 计划执行者运行聚焦测试、类型检查和实际模板 39 Host adapter 复现命令；原红灯命令必须返回 `PASS`、模板 ID 39 和非零 Workflow 节点数量。
6. 计划执行者运行 `pnpm verify:comfyui-workflows`，确认模板 39 不再产生 Source 协议错误；验证报告中的每个模板结果只能来自目标实例 `/object_info` 的节点定义、Workflow 必需输入连线检查或 compiler 返回的明确错误码。
7. 计划执行者更新当前系统文档、ADR、Source 合同文档和 `0.37.4` 版本文件。
8. 独立语义 Reviewer 必须核对合同术语、Source 输入与 Runtime 输出区分、发布说明、非目标和验收清单。
9. 计划执行者运行完整质量门禁、提交分支、推送远端并等待 GitHub CI 的 Ubuntu Source quality gates 与 macOS DSH Desktop acceptance 成功。
10. 计划执行者发布 `v0.37.4` Git tag 和 GitHub Release，然后把生产 checkout 更新到该 tag，并按生产规范完成 Desktop 状态、Source 模板 39 读取和运行验证。

## 验证命令

实施阶段至少运行以下命令：

```sh
pnpm exec vitest run tests/unit/generation-source-cli.test.ts tests/unit/generation-preparer.test.ts tests/unit/generation-workflow-compiler.test.ts
pnpm exec vitest run tests/contract/source-contract.test.ts tests/unit/config-loader.test.ts tests/production/source-production.test.mjs
pnpm typecheck
pnpm verify:comfyui-workflows
pnpm quality
git diff --check
```

完整 Desktop 验证前，计划执行者必须先在主 checkout 运行 `pnpm dev:status`。当前主 checkout 的 Electron 占用端口 43128；批准本方案后，计划执行者可以使用主 checkout 的 `pnpm dev:stop` 停止该受管开发 Desktop，完成 worktree `pnpm dev:start`、`pnpm dev:status`、`pnpm dev:logs` 验证后运行 `pnpm dev:stop`，再按停止前状态恢复主 checkout 开发 Desktop。

## 验收清单

- [ ] `GenerationSourceCli.readTemplate("39")` 返回模板 ID、标题和 76 节点 Workflow，不返回 `SOURCE_PROTOCOL_ERROR`。
- [ ] Source v0.86.1 三字段 TemplateBundle 单元测试在修复前失败、修复后通过。
- [ ] `ComfyTemplateBundle`、source snapshot 和 `WorkflowCompilerInput` 不包含五个退役字段。
- [ ] compiler 只根据实时 `/object_info` 和 Workflow 必需输入连线生成活动输出节点集合。
- [ ] Generation Runtime 继续把非空活动输出节点集合保存到 `generation_runs.expected_output_node_ids_json`。
- [ ] 历史 Generation Run 不需要数据库迁移或 source snapshot 重写。
- [ ] `config/source-contract-v0.86.1.json`、Configuration Profile 和系统文档统一固定 Source `0.86.1`。
- [ ] `pnpm verify:comfyui-workflows` 不再把模板 39 归类为 Source 协议错误。
- [ ] `pnpm quality`、`git diff --check`、GitHub CI 两个 job 和独立语义审查全部通过。
- [ ] Harness ComfyUI `v0.37.4` 发布并部署到生产 checkout 后，模板 39 可以创建 Generation Run。
- [ ] 生产验证不提交 D01–D12 × 3 的 36 个批量请求；只使用一项明确的验证请求确认 run_id 创建和异步状态流转。

## 风险和回滚边界

- 多个满足必需输入的输出节点会全部进入 compiler 的活动输出节点集合；实施测试和 workflow matrix 必须验证模板 39 的实际输出节点集合，不能按节点名称猜测或只保留首个节点。
- 断开必需输入的输出节点会从运行时 API Workflow 删除；该行为等于现有 `expectedOutputNodeIds=null` 分支，不是新增降级。
- 本次修复不改变 Official API Workflow Cache identity。原始 Workflow 哈希和执行结构哈希继续使 Workflow 变化产生新缓存项。
- Harness v0.37.2 不能正确消费 Source v0.86.1。生产 checkout 如果回滚到 v0.37.2，模板读取错误会恢复；功能回滚必须同时恢复 Source v0.84.0，不能把 v0.37.2 单独当作可用回滚状态。

## 非本次目标

- 本次修复不修改 NoobAI Source 仓库、Source 数据库或 Source v0.86.1 TemplateBundle。
- 本次修复不修复模板 39 的 Workflow 节点，不写入 `expected_output_node_ids_json`，不恢复退役模板管理表。
- 本次修复不新增 v0.84/v0.86 双版本兼容层，不为缺失字段添加默认 revision、散列、策略或输出节点 ID。
- 本次修复不删除 Generation Runtime 的编译后输出节点集合、SQLite 列或 transport 筛选行为。
- 本次修复不安装或升级依赖包，不修改依赖版本，不修改 `pnpm-lock.yaml` 的依赖解析图。
- 本次修复不修改 `pnpm-lock.yaml`；该文件不保存 Harness 产品版本，无依赖变更时必须保持逐字不变。
- 本次修复不提交用户准备的 36 个 Generation Request，不重试已经确认失败的 12 次批量请求。
- 本次修复不改写历史 Source 合同文档、历史 ADR 或历史 Generation Run source snapshot。

## 已获得的授权

- 用户已授权创建独立 worktree。
- 用户已授权读取仓库源码、测试、文档、本机 Source CLI、Source HTTP 响应和本机 Git 历史以确定根因。
- 用户已授权设计并提交本修复方案供审批。
- 用户已批准本方案，并授权计划执行者按照“实施顺序”和“验证命令”修改列出的文件、运行测试、停止与恢复主 checkout 开发 Desktop、提交、推送、发布补丁版本、部署生产 checkout，并提交一项生产验证请求。远端并发发布已经占用 `v0.37.3`，仓库发布规则要求本修复使用 `v0.37.4`。
