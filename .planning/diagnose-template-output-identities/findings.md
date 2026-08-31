# 模板 39 输出节点身份校验失败调查记录

## 用户提供的已知事实

- 模板记录为 `id=39`、`AnimaStandardV8_成熟女性_lora_nsfw_face细化`、`base_model_id=1`、`model_id=3`。
- LoRA 记录为 `id=64`、`Niji_semi_realism_v5.safetensors`、`base_model_id=1`、`weight=1`。
- 实例记录为 `id=2`。
- D01 至 D12 共 36 个 Generation Request 已准备完成。
- 第一轮 12 次提交和 1 次重试均在产生 run_id 前返回 `SOURCE_PROTOCOL_ERROR: ComfyUI template output node identities are invalid.`。
- 用户报告模板 39 曾在 `run_bf514483` 创建时可用。
- 用户确认 `expected_output_node_ids_json`、`revision_number`、`workflow_sha256`、`config_revision` 和 `dimension_strategy` 已经不再需要；Source 删除这些字段是目标合同变化，不是模板数据损坏。

## 批准前调查约束（历史记录）

- 用户批准修复方案前，调查者只读诊断产品代码、模板数据和运行状态。
- 用户批准修复方案前，调查者只可修改 `task_plan.md`、`findings.md` 和 `progress.md` 调查文档。
- 调查者没有运行外部下载项目、外部脚本或依赖安装命令。

## 批准前待验证问题（已完成）

1. 哪个模块产生 `SOURCE_PROTOCOL_ERROR` 和完整错误消息？
2. “output node identities” 对应哪些结构化字段及约束？
3. 模板 39 的当前持久化值与 `run_bf514483` 使用的模板快照有什么差异？
4. 数据恢复、目录服务升级或协议升级中的哪个具体代码路径引入差异？
5. 现有测试为何没有阻止无效模板记录进入可选目录？

## 已发现证据

- 主检出目录在创建 worktree 前为 `main` 分支且没有未提交文件。
- 独立 worktree 路径为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-diagnose-template-output-identities`。
- 独立 worktree 分支为 `codex/diagnose-template-output-identities`，起点提交为 `ef6a5f0908c20727ebc3ca159e7dfeaa008aa700`。
- `src/host/generation/source-cli.ts:195` 是完整错误消息的产品代码来源。
- Host 在解析 Source 模板响应时校验 `expected_output_node_ids_json`，该校验发生在创建 Generation Run 和向 ComfyUI 提交任务之前。
- `docs/v0.1/source-contract-v0.82.2.md` 说明 `expected_output_node_ids_json` 只允许 `null` 或非空数组；空数组、非法 JSON 或字段缺失时，adapter 返回 `SOURCE_PROTOCOL_ERROR`。
- `docs/adr/0009-source-contract-version-gate.md` 说明 `expected_output_node_ids_json=null` 是合法值；Workflow compiler 会根据目标实例 `/object_info` 中 `output_node: true` 的活动节点生成输出节点集合。
- `config/error-catalog.json` 把 `SOURCE_PROTOCOL_ERROR` 定义为数据源响应结构无法识别，并要求检查数据源服务版本和记录。
- 独立 worktree 如需启动完整 Desktop，必须使用前台 `pnpm dev:start`，并从第二终端运行 `pnpm dev:status` 与 `pnpm dev:logs`；结束时必须运行 `pnpm dev:stop` 并确认状态为 `stopped`。
- 仓库当前 Source 合同是 `config/source-contract-v0.84.0.json`，并要求 TemplateBundle 包含 `id`、`title`、`revision_number`、`workflow_sha256`、`workflow_json`、`config_revision`、`dimension_strategy`、`expected_output_node_ids_json`。
- 仓库配置的本机 Source CLI 是 `../NoobAI-XL-FZ-PROD-ENV/scripts/imagegen-comfyui-source-read.mjs`，目标端口是 `18093`。
- 2026-08-31 连续两次读取模板 39 均返回成功 envelope，结果记录的 Workflow 包含 76 个节点。
- 模板 39 当前结果记录的键名只有 `id`、`title` 和 `workflow_json`。
- 模板 39 当前结果记录缺少 `revision_number`、`workflow_sha256`、`config_revision`、`dimension_strategy` 和 `expected_output_node_ids_json`。
- Host 在检查其余缺失字段之前先检查 `expected_output_node_ids_json`，因此该旧形状响应稳定产生用户报告的完整错误消息。
- 本机 Source 生产 checkout 当前位于 `v0.86.1` 标签提交 `ba39cd11`；该 checkout 没有分支检出，并包含未跟踪的 `runtime/` 运行目录。
- Source `v0.86.1` 历史中的 `6a3efc5b` 提交标题为 `Remove ComfyUI template runtime management`，`c962c5c5` 提交标题为 `Remove template revision metadata`。
- Harness 当前固定消费 Source `v0.84.0`，Source 生产 checkout 与 Harness Source 合同存在两个次版本的版本差异。
- 端口 `127.0.0.1:18093` 当前由 Node 进程监听。
- `pnpm dev:start` 在 worktree 中因移动桥接端口 `43128` 已被占用而在启动前退出，没有创建新的 Desktop 进程。
- 失败的启动命令已按项目启动器规则建立 `.env` 与 `node_modules` 指向主开发 checkout 的符号链接。
- 当前 worktree 的 `GenerationSourceCli.readTemplate("39")` 已直接复现 `SOURCE_PROTOCOL_ERROR: ComfyUI template output node identities are invalid.`。
- 同一 Host adapter 红灯命令连续两次返回退出码 1、同一错误码和同一错误消息。
- 内存 Source process 返回最小 v0.86 TemplateBundle `{id,title,workflow_json}` 时，Host adapter 在 0.2 秒内返回同一错误；模型、LoRA、Prompt、seed、实例和完整 76 节点 Workflow 都不是触发条件。
- 对 `http://127.0.0.1:18093/internal/comfyui-source/templates/39/bundle` 的直接只读 HTTP 查询与 Source CLI 都只返回 `id`、`title`、`workflow_json`，排除 Source CLI 丢字段。
- Live Source discovery 发布 `getComfyuiTemplateBundleForHost` operation；直接 HTTP 响应与 Source v0.86.1 当前 `projectTemplateBundle()` 实现一致，没有发现混用旧路由实现的证据。

## 批准前结论边界（历史记录）

- 当前证据只证明 Host 拒绝模板响应中的 `expected_output_node_ids_json`。
- 当前模板 39 的 Workflow 节点对象包含数值 `id`；当前证据否定“Save Image 节点对象缺少节点身份字段”是这条 Host 错误的直接原因。
- 完整错误消息只由三类运行时值触发：字段缺失、字段既不是数组也不是 `null`、字段是空数组。
- 数组元素不是合法 Source ID 时，Host 返回 `ComfyUI template output node id <索引> is invalid.`，不会返回用户报告的完整错误消息。
- 当前 Source CLI 响应明确缺少 `expected_output_node_ids_json`，不是显式 `null`、空数组或非数组值。
- 用户确认五个缺失字段已经不再需要，因此模板 39 的单条数据修复不属于正确修复方向。
- `tests/unit/generation-source-cli.test.ts` 覆盖合法 `null` 和合法 `[1]`，但没有覆盖产生用户报告完整错误消息的三个分支。

## 已确定的根因方向

- Source v0.86.1 按新合同返回 `id`、`title` 和 `workflow_json`。
- Harness 仍固定 `sourceReleaseVersion=0.84.0`，其 `GenerationSourceCli.parseTemplate()` 仍要求五个已经退役的字段。
- Host 对 `expected_output_node_ids_json` 的旧合同校验先于其余旧字段校验，因此合法的新合同响应被误报为 `ComfyUI template output node identities are invalid.`。
- 正确修复对象是 Harness 的 Source 合同、TemplateBundle 类型、解析逻辑及旧字段消费者，不是模板 39 的数据库记录或 Workflow 节点身份。
- Source `v0.84.0` 的 `projectTemplateBundle()` 从 revision 和 runtime config 投影旧字段；Source `v0.86.1` 的同一函数直接从模板记录投影 `id`、`title` 和 `workflow_json`。
- Source 提交 `6a3efc5b` 删除 runtime config 字段和对应工作流管理入口；提交 `c962c5c5` 继续删除 `revision_number` 与 `workflow_sha256`。
- Harness 中 `revisionNumber`、`workflowSha256`、`configRevision` 和 `dimensionStrategy` 只进入 `safeSourceSnapshot()`，仓库产品代码没有读取这些 snapshot 字段的后续消费者。
- Harness 中 `expectedOutputNodeIds` 从 TemplateBundle 进入 `WorkflowCompilerInput`；compiler 在该值为 `null` 时已经根据实时 `/object_info` 中 `output_node: true` 和必需输入连线自动发现活动输出节点。
- compiler 返回的 `activeOutputNodeIds` 仍是 Generation transport 观察 ComfyUI 输出所需的运行时结果；Source 删除输入过滤器不等于删除 compiler 产生的活动输出节点集合。
- Run Repository 持久化的是 compiler 返回的活动输出节点集合，不依赖 Source 退役字段继续存在。

## 修复边界候选

| 候选 | 影响 | 当前判断 |
|---|---|---|
| 在 Source adapter 内为缺失字段填默认值 | 保留旧类型和旧分支，但形成未获授权的兼容层并继续保存无来源的 snapshot 元数据。 | 不采用。 |
| 从 TemplateBundle 和 source snapshot 删除五个退役字段，但暂时让 compiler 接收固定 `null` | 修改较少，但保留只有一个固定值的旧接口。 | 可行但存在死接口。 |
| 从 TemplateBundle、source snapshot 和 WorkflowCompilerInput 删除五个退役字段，compiler 始终自动发现活动输出节点 | 接口与 Source v0.86.1 一致，删除无来源字段和无实际选择分支；compiler 仍输出活动节点集合供 transport 使用。 | 当前首选，需核对现有显式过滤器测试的产品含义。 |

## 修复设计决定

- 采用第三个候选：删除 Source 五个退役字段及 compiler 的显式输出节点过滤器输入。
- `GenerationSource` 是远端但由同一产品体系拥有的 Source seam；`GenerationSourceCli` 是生产 adapter，单元测试中的 fake Source 是测试 adapter。
- `WorkflowCompiler` 模块必须隐藏输出节点发现实现；调用方只提供 Workflow、实例连接和 Generation Request 参数，不再了解 Source 旧模板管理字段。
- `WorkflowCompilerResult.activeOutputNodeIds` 是 compiler 的运行时输出，继续供 `PreparedGeneration.expectedOutputNodeIds`、Run Repository 和 Comfy transport 使用。
- `generation_runs.expected_output_node_ids_json` 保存的是 compiler 产生的运行时结果，不是 Source `expected_output_node_ids_json` 的副本；本次修复不得删除该数据库列或创建数据库迁移。
- Source v0.86.1 live Catalog 仍发布 Harness 合同中的 10 个 Catalog operation，Host Source 仍发布 2 个 operation；本次合同升级只改变 TemplateBundle 的结果字段清单。
- Source v0.86.1 正式变动范围明确要求 TemplateBundle 只输出模板 ID、标题和 Workflow JSON，并明确禁止输出修订号、Workflow 散列、运行参数定义、参数绑定或预期输出节点。
- 当前开发端口 43128 由主 checkout 的 DSH Desktop Electron 进程占用；本轮没有停止该进程。
- 根 `pnpm-lock.yaml` 不包含 Harness 产品版本字段；`package.json.version` 是产品版本的唯一结构化来源，本次补丁版本不需要修改 lockfile。
- 独立语义 Reviewer 对 `fix-plan.md` 返回 PASS，没有阻断项；Reviewer 确认授权边界、三类输出节点数据、文件清单、测试分支、版本发布步骤和非目标均清楚且有证据支持。

## 根因假设

| 排名 | 假设 | 可反驳预测 |
|---:|---|---|
| 1 | Source v0.86.1 删除模板运行时元数据，但 Harness 仍按 v0.84.0 解析 TemplateBundle。 | 其他模板也缺少同一组字段；Source v0.84.0 到 v0.86.1 的代码差异明确删除这些响应字段。 |
| 2 | 只有模板 39 的数据库记录在恢复后损坏。 | 其他模板返回完整八个合同字段；Source v0.86.1 路由仍包含构造这些字段的代码。 |
| 3 | 端口 18093 的进程混用了 v0.86.1 CLI 与旧服务代码。 | 端口 18093 的 OpenAPI 与 v0.86.1 checkout 不一致，或使用同一 checkout 重启后响应形状改变。 |
| 4 | Source CLI 在 raw-passthrough 阶段丢失字段。 | 直接 HTTP 响应包含字段，但 CLI stdout 缺少字段。 |

用户确认五个字段已经不再需要后，假设 1 成为已确定的根因方向；假设 2 的模板单条记录修复方向被否定。剩余检查用于确定 Harness 修复边界，不再用于判断字段删除是否合理。

## 根因结论

Harness v0.37.2 固定消费 Source v0.84.0，并在 `GenerationSourceCli.parseTemplate()` 中强制读取已经由 Source v0.86.1 删除的五个 TemplateBundle 字段。Source v0.86.1 的合法三字段响应进入 Host 后，`expected_output_node_ids_json` 旧校验最先读取缺失值 `undefined`，Host 因此在 Generation Run 创建前错误返回 `SOURCE_PROTOCOL_ERROR`。错误消息把旧合同字段命名为“output node identities”，造成模板 Workflow 节点损坏的误导性诊断。

## 资源

- `docs/agents/worktree-development.md`
- `docs/system/architecture.md`
- `docs/system/directory-structure.md`
- `docs/system/configuration.md`
- `docs/system/testing.md`
- `docs/system/startup.md`

## 已遇到的问题

| 问题 | 处理结果 |
|---|---|
| Stop That Shit Skill 的目录别名需要展开两层插件目录 | 已通过本机文件清单解析实际路径，未修改 Skill 文件。 |
| 首次投影 Source discovery 的响应 schema 时，`jq` 对不存在的 `content` 调用 `keys` 并退出 | 后续查询改为先检查对象键和可选路径，不重复同一投影。 |
| 对 Source v0.84.0 到 v0.86.1 运行宽范围 `git diff` 产生 72 万余行候选输出并被截断 | 后续只读取 `app/generation-resources/comfyui-source-service.mjs`、相关 OpenAPI 片段和对应测试文件。 |
| worktree Desktop 开发端口 43128 已被占用 | 未停止现有进程；启动器没有创建本 worktree Desktop，调查改用 Host adapter 函数级复现。 |
| 在 Source checkout 工作目录读取 Harness `config/source-contract-v0.84.0.json` 时路径不存在 | 已切回 Harness worktree 并成功读取结构化合同 operation 清单。 |
| 根目录 `task_plan.md`、`findings.md`、`progress.md` 是已跟踪的历史规划文件 | 本次调查文件已迁入 `.planning/diagnose-template-output-identities/`；根目录三个文件已经恢复并通过 `git diff --exit-code`。 |
