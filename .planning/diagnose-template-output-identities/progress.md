# 模板 39 输出节点身份校验失败调查进度

## 2026-08-31 实施进度

- 用户已批准修复方案并授权实施、门禁、提交、推送、补丁版本发布、生产部署和一项生产验证请求。远端并发发布已经占用 `v0.37.3`，本修复使用 `v0.37.4`。
- Source v0.86.1 三字段 TemplateBundle 回归测试先稳定复现 `SOURCE_PROTOCOL_ERROR: ComfyUI template output node identities are invalid.`，修改 adapter 后通过。
- `GenerationSourceCli.readTemplate("39")` 已使用当前 Source v0.86.1 返回 `PASS`、模板 ID 39 和 76 个 Workflow 节点。
- Source adapter、Source preparer、Workflow compiler、Generation Runtime 保存与恢复链路、合同、配置和版本聚焦测试共 189 项通过；类型检查通过。
- `pnpm verify:comfyui-workflows -- --instance-id 2` 在编译前发现实时 Catalog 新增模板 43，而结构化参数支持基线只包含模板 8 至 42；该外部目录变化不属于本修复，仓库没有写入未经批准的模板 43 参数基线。
- 远端 `main` 在本轮实施期间发布并部署了另一项 `v0.37.3`；当前分支已经基于该发布提交，按不可移动 tag 规则把本修复版本更新为 `v0.37.4`。
- 完整 `pnpm quality` 通过：530 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.15%、branches 86.41%、functions 100%、lines 95.74%；依赖审计全部为 0。
- 质量门禁期间短暂停止的生产 v0.37.3 Desktop 已恢复为 running。

## 2026-08-31

### 阶段 1：建立稳定复现命令

- **状态：** 进行中
- 已确认主检出目录没有未提交文件。
- 已创建分支 `codex/diagnose-template-output-identities`。
- 已创建独立 worktree `/Volumes/4Tdisk/work/AI2/harness-comfyui-diagnose-template-output-identities`。
- 已读取 `diagnosing-bugs`、`planning-with-files` 和 `stop-that-shit` Skill 的完整规则。
- 已将本轮工作限定为只读诊断与修复方案设计。
- 已读取独立 worktree、系统架构、目录结构、配置、测试、启动和领域上下文文档。
- 已定位完整错误消息的产品代码来源为 `src/host/generation/source-cli.ts:195`。
- 已确认 Host 校验对象是 Source 模板响应中的 `expected_output_node_ids_json`。
- 已检查 `GenerationSourceCli.parseTemplate()` 与现有单元测试，确定该错误消息只对应字段缺失、非数组非 `null` 或空数组。
- 已使用仓库配置的本机 Source CLI 连续两次读取模板 39，响应形状保持一致。
- 已确认模板 39 当前 bundle 只包含 `id`、`title` 和 `workflow_json`，缺少 v0.84.0 合同要求的五个字段。
- 已确认 Source 生产 checkout 当前为 `v0.86.1`，而 Harness 当前合同固定 Source `v0.84.0`。
- 已建立四个可反驳根因假设，并把 Source/Harness 版本差异列为首要假设。
- 用户确认五个缺失字段已经退役；调查方向从模板数据损坏转为 Harness 旧合同依赖清理。
- 已对照 Source v0.84.0 与 v0.86.1 的 `projectTemplateBundle()`，确认五个字段由两个明确提交删除。
- 已追踪 Harness 消费者：四个修订/策略字段只进入 source snapshot；输出节点过滤器进入 compiler，但 compiler 已支持实时自动发现并继续输出 transport 所需节点集合。
- `pnpm dev:start` 因端口 43128 被占用而在启动前退出；没有启动或停止任何现有 Desktop 进程。
- 已使用当前 worktree 源码直接调用 `GenerationSourceCli.readTemplate("39")`，复现了用户报告的精确错误码和错误消息。
- 已连续两次运行红灯命令，两次都以退出码 1 返回相同错误。
- 已把复现缩小为三字段 TemplateBundle 的内存 envelope，排除 Generation Request 的全部业务参数。
- 已比较 CLI 与直接 HTTP 响应，排除 CLI 丢字段。
- 已确定根因并进入修复方案设计阶段。
- 已按 `codebase-design` 的模块深度原则决定删除 compiler 的显式输出节点过滤器输入，让 compiler 始终拥有输出节点发现规则。
- 已确认 Source v0.86.1 的 10 个 Catalog operation 和 2 个 Host Source operation 与 Harness 清单一致。
- 已把本次调查文件迁入 `.planning/diagnose-template-output-identities/`，并恢复根目录三个已跟踪历史规划文件。
- 已核对 lockfile 结构并从修复方案删除无效的 lockfile 版本更新步骤。
- 独立语义 Reviewer 返回 PASS；三个非阻断措辞改进已经写入最终修复方案。

### 阶段 5：提交方案并等待批准

- **状态：** 进行中
- 最终修复方案位于 `.planning/diagnose-template-output-identities/fix-plan.md`。
- worktree 中没有产品源码、测试、配置、版本或生产状态修改。

## 文件变更

- `task_plan.md`：新增调查目标、验收清单、非目标、授权边界和调查阶段。
- `findings.md`：新增用户提供的事实、待验证问题和 worktree 信息。
- `progress.md`：新增本次调查进度。

## 命令结果

| 命令 | 预期结果 | 实际结果 | 状态 |
|---|---|---|---|
| `git status --short --branch` | 主检出目录没有未提交文件 | 输出 `## main...origin/main` | 通过 |
| `git worktree add -b codex/diagnose-template-output-identities ... main` | 创建独立 worktree | worktree 创建于提交 `ef6a5f0` | 通过 |
| `node ../NoobAI-XL-FZ-PROD-ENV/scripts/imagegen-comfyui-source-read.mjs ... template-bundle --id 39`（连续两次） | 返回稳定模板响应 | 两次都只返回 `id`、`title`、`workflow_json` | 通过 |
| `GenerationSourceCli.readTemplate("39")` | 当前 Host adapter 复现用户报告错误 | 返回 `SOURCE_PROTOCOL_ERROR` 和精确消息 | 通过 |
| Host adapter 红灯命令（连续两次） | 缺陷存在时退出码为 1 | 两次均退出 1，输出精确错误 | 通过 |
| 最小三字段 TemplateBundle 内存 envelope | 不依赖 Generation Request 仍触发同一缺陷 | 0.2 秒内返回同一错误 | 通过 |
| 直接 HTTP 查询模板 39 bundle | 与 CLI 结果键一致 | 两者均为 `id`、`title`、`workflow_json` | 通过 |

## 错误记录

| 错误 | 次数 | 处理结果 |
|---|---:|---|
| `sed` 首次读取 Stop That Shit Skill 时使用了缺少一层插件目录的路径 | 1 | 使用 `rg --files` 定位实际路径后读取成功。 |
| Source discovery 首次 `jq` 投影假定 200 response 存在 `content` | 1 | 改为先检查实际对象键，避免重复错误。 |
| Source v0.84.0 到 v0.86.1 的宽范围 `git diff` 输出被截断 | 1 | 改为读取已定位的精确文件和提交差异。 |
| `pnpm dev:start` 报告移动桥接端口 43128 已被占用 | 1 | 不重复启动；使用已建立的依赖链接运行函数级复现。 |
| 在 Source checkout 中读取 Harness 相对合同路径失败 | 1 | 切回 Harness worktree 后读取成功。 |
| 误覆盖根目录三个已跟踪规划文件 | 1 | 使用 `apply_patch` 迁移本次文件并恢复 HEAD 内容；根目录三个文件当前没有差异。 |

## 恢复检查

| 问题 | 答案 |
|---|---|
| 当前处于哪个阶段？ | 阶段 1：建立稳定复现命令。 |
| 后续阶段是什么？ | 缩小复现场景、检验根因假设、设计修复方案、提交方案并等待批准。 |
| 本次目标是什么？ | 复现模板 39 输出节点身份错误、确定根因并设计修复方案。 |
| 已发现什么？ | 参见 `findings.md`。 |
| 已完成什么？ | 已创建隔离 worktree 和调查文档。 |
