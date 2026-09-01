# ComfyUI 运行参数完整合法值诊断进度

## 2026-09-01

### 独立环境

- 状态：完成。
- 创建 worktree：`/Volumes/4Tdisk/work/AI2/harness-comfyui-diagnose-comfyui-seed-overflow`。
- 创建分支：`codex/diagnose-comfyui-seed-overflow`。
- 基线提交：`030543dc39981439bd2ff8ae53432cff207216aa`。
- 已确认 worktree 根 `.git` 是 linked-worktree 元数据文件，`config/desktop-worktree.json.mainCheckoutPath` 指向主开发 checkout。

### 诊断

- 状态：完成。
- 读取 `CONTEXT.md`、系统架构、配置、测试、Run Repository ADR 和独立 worktree 规范。
- 只读查询先前误认目录中的辅助 SQLite 与该 Run 的 `request.json`、`actual-workflow.json` 和 `api-workflow.json`。
- 构建 `.local/diagnostics/reproduce-seed-overflow.mjs`。
- 连续两次复现 `COMFYUI_PROMPT_REJECTED`；两次退出码均为 1。
- 验证五项可证伪假设后确认 Workflow compiler 缺少实时数值约束校验。

### 修复方案

- 状态：进行中。
- 已撤回只补充 `INT`/`FLOAT` 数值校验的初稿。
- 已审计辅助目标实例的 18,779 个输入描述、ComfyUI `0.34.2` 通用校验路径、动态选择子输入结构、列表值 `__value__` 外壳和自定义校验边界。
- 已形成覆盖严格标量类型、精确整数上下限、候选集合、多选数组、动态子合同和不可判定自定义 widget 拒绝策略的完整合法值矩阵。
- 独立 Reviewer 已指出自定义 Python 校验边界、列表值与连接二元组碰撞、数值元数据缓存生命周期、对象键顺序和十进制等价类缺口；计划编写者已据此修订方案。
- 同一 Reviewer 复核后确认没有阻塞项；计划编写者又修正了“自定义校验只会附加限制”的错误表述，并明确动态分支 optional 子输入可以缺省。
- 用户已经审阅方案并调用 `$implement` 批准在独立 worktree 中实施。

### 实施

- 状态：进行中。
- 已在独立 worktree 中实现结构化运行参数合同、精确数值令牌比较、JSON 深相等候选、动态合同原子校验、未知合同拒绝、别名规范化后冲突判定和 `__value__` overlay 优先级修复。
- 已更新错误目录、架构文档和测试文档，并把单文件 Workflow compiler 测试扩展到 194 项。
- 最小反馈环连续两次在提交前返回 `GENERATION_PARAMETER_INVALID`，两次退出码均为 0。
- 未修改、读取、启动或测试真实生产目录 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`。

## 2026-09-02

### 生产目录边界纠正

- 用户明确真实生产目录是 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`，main checkout 不是生产目录。
- 先前记录中的 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env` 不是真实生产目录；其中数据已经降级为辅助回归证据。
- 后续 Desktop 验收必须使用独立测试 workspace，禁止把真实生产目录作为启动 workspace。

### 当前验证

- `pnpm typecheck`：通过。
- `tests/unit/generation-workflow-compiler.test.ts`：194 项通过。
- 三个受影响测试文件：245 项通过。
- Node.js `24.14.0` 运行时能力测试：`JSON.parse` reviver 正确保留 `9223372036854775807` 和 `1.0` 原始令牌。
- 项目最低支持版本 Node.js `22.19.0` 在当前主机不可用；发布前仍需在 Node.js `22.19.0` 环境运行同一能力测试。
- Standards、Spec 和独立语义复核均已通过，全部审查 finding 已关闭。
- 完整 Desktop 使用 worktree 内 `.local/desktop-test-workspace` 启动；第二终端 `dev:status` 返回 `running`，本地界面确认隔离 workspace、`ComfyUI工作台预设`、当前模型和 generation 结果抽屉已加载，控制台 warning/error 为 0。
- `computer-use` 服务不可用；计划执行者改用同一 Desktop Harness 的本地 Web endpoint 完成界面读取，没有选择或打开界面中历史登记的真实生产 workspace。
- `pnpm dev:stop` 与最终 `pnpm dev:status` 均返回 `stopped`；临时启动配置已经恢复，`config/desktop-production.json` 与基线没有差异。
- 完整 `pnpm quality` 与最终提交仍待执行。

## 验证结果

| 验证项 | 预期 | 实际 | 结果 |
| --- | --- | --- | --- |
| 辅助 checkout 版本与源码基线 | 辅助运行 `v0.38.3`/`030543d` | 完全一致 | 通过 |
| 辅助 Run 请求值 | `seed` 与 `seed_6` 包含错误值 | 两者均为 `12130929238470859000` | 通过 |
| Actual/API Workflow 投影 | 节点 31 保存同一错误值 | 两个产物均保存同一错误值 | 通过 |
| 最小反馈环第一次运行 | 返回精确 ComfyUI 拒绝 | `COMFYUI_PROMPT_REJECTED`/`value_bigger_than_max`，退出码 1 | 红灯符合预期 |
| 最小反馈环第二次运行 | 结果与第一次一致 | 同一错误与退出码 1 | 确定性通过 |

## 错误记录

| 错误 | 次数 | 处理结果 |
| --- | --- | --- |
| 先前把辅助 Desktop checkout 误记为真实生产目录 | 1 | 按用户给出的真实生产目录纠正证据归属，并禁止后续验证访问真实生产目录。 |
| SQLite 查询引用不存在的 JSON 列 | 1 | 读取 schema 后使用 `request_json` 与产物路径。 |
| 反馈环返回退出码 1 | 2 | 这是当前缺陷的预期红灯，不是诊断阻塞。 |
