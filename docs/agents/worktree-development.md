---
文档用途: 规定独立 worktree 的官方 Desktop 开发与验收流程。
读取时机: 启动、测试、检查或停止独立官方 Desktop 实例前。
---
# 独立 worktree 官方 Desktop 开发与验收

## 完整验收

1. 开发者在独立 worktree 中运行 `pnpm test:desktop`，构建、安装并验收当前候选插件。隔离规则与通过条件见[测试规范](../system/testing.md#官方-desktop-e2e-通过条件)。
2. 开发者按 `config/desktop-e2e.json` 的目录配置定位本轮运行记录、日志与证据。目录用途见[开发验收目录](../system/directory-structure.md#开发验收目录)。

## 交互调试

1. 开发者使用已安装官方应用交互调试时，直接运行以下 probe 命令：

   ```sh
   node tests/desktop/fixtures/official-desktop-probe.mjs start --mode development
   node tests/desktop/fixtures/official-desktop-probe.mjs status --run-id <run-id>
   node tests/desktop/fixtures/official-desktop-probe.mjs stop --run-id <run-id>
   ```

2. `start` 返回的 `runId` 标识本轮运行。开发者使用该 ID 查询状态，并在调试结束时执行 `stop`，确认本轮进程已退出、端口已释放。

3. `development` 模式共享当前 worktree 下的持久 Harness home、Electron user-data 和 Workspace，位置由 `config/desktop-e2e.json` 定义。本轮记录和证据分别保存，目录用途见“完整验收”的目录入口。同一 worktree 的持久环境已被使用时，probe 会拒绝另一轮并发启动。

4. 首次启动持久开发环境时，probe 按 `config/desktop-e2e.json` 的 `initialProfilePatches` 初始化模型配置。后续启动保留已保存的模型设置、Workspace 和业务数据，并更新本轮 Host 端口。

5. 开发环境凭据由 `config/desktop-e2e.json` 的 `environmentFilePath`、`credentialEnvironmentNames` 和 `requiredEnvironmentNames` 控制。开发者在 main checkout `.env` 中维护已声明的凭据；各 worktree 的 probe 从该文件读取，并传给本轮应用进程。开发者不得在 worktree 的宿主凭据库重复保存共享凭据；宿主优先读取凭据库，同名记录会覆盖启动环境变量。

6. NoobAI MCP 凭据用于工作台的目录查询。

7. 启动失败、端口冲突、取消、超时和清理失败的记录保存在本轮 evidence 目录。准备阶段失败写入配置所指定的 `preparation-failure.json`。开发者检查证据时使用 `run.json`、stdout/stderr 文件和 JSON 证据文件。

## 目录边界夹具

1. 开发者验证 MCP 与 Host 内部 HTTP 对同一目录场景的响应时，调用 [startBoundaryFixture()](../../tests/desktop/fixtures/official-catalog-boundary.mjs)。调用者显式传入场景 JSON 路径、MCP 与内部 HTTP 上游地址、MCP 凭据和证据目录；默认请求期限由 [MCP 测试配置](../../tests/desktop/fixtures/official-mcp-fixture.json) 的 `boundary` 定义。
2. 调用者将返回的 `mcpUrl` 和 `sourceAddress` 配置到同一隔离 Profile。场景结构及测试样本见 [目录边界测试](../../tests/production/official-catalog-boundary.test.mjs)；实际任务使用的目录 ID 在执行前核对，并写入本轮场景 JSON。
3. 任务结束后，调用者执行返回对象的 `close()`，核对 `portReleased`。`stateFile` 和证据目录保存夹具状态、上游响应及场景覆盖字段。

## Agent 调用轨迹

### 执行结束后导出

1. 开发者按“交互调试”执行任务，保存主会话 ID，并等待主任务及子任务结束。需要取消时，先通过官方应用取消任务，再确认会话结束状态。
2. 目标任务结束后，开发者保持应用运行并执行以下命令，导出该任务的官方会话记录。

   ```sh
   node scripts/verification/collect-session-trace.mjs collect --run-id <run-id> --session-id <主会话ID> --config <配置JSON> --repository-root <worktree绝对路径> --output <导出目录>
   ```

3. `<配置JSON>` 使用启动该 probe 时传入的配置文件；默认入口为 `config/desktop-e2e.json`。其中的 `sessionTrace` 定义官方导出接口路径和导出文件名。导出实现位于 [collect-session-trace.mjs](../../scripts/verification/collect-session-trace.mjs)，脱敏写入由 [official-trace-evidence.mjs](../../tests/desktop/fixtures/official-trace-evidence.mjs) 负责。
4. 标准输出返回索引文件路径。开发者先读取索引，再按其中的路径读取主子会话记录。

5. 开发者在同一应用实例中继续后续任务，每项任务结束后分别导出。全部任务完成后，按“交互调试”停止应用并核对清理结果。
6. 开发者不得为轨迹导出向 Profile 注册采集插件，或拦截模型流、会话事件和工具执行。

### 调查执行偏差

1. 调查者从首次偏离事件回溯：任务输入、上下文消息、工具声明、Skill 与参考文件读取、工具调用及返回、父子消息、产物和结束状态。逐项区分用户要求、Skill 要求、宿主行为与 Agent 自行选择。受控测试服务已有的请求与响应记录可作为附加证据。
2. 官方记录包含模型分析内容时，调查者结合调用和返回核对其判断；缺失内容按索引标记。调查者不得把保存的会话消息当作完整的 Provider 请求，也不得把应用停止当作 Agent 自然结束。
3. 正常完成和用户取消均以持久会话中的结束事件为依据。应用异常退出时，导出保留已有记录并报告缺失的结束状态。
4. 调查者复现疑似原因，并用单变量对照验证。证据不足时记录待验证原因，不得仅凭最终失败修改 Skill 文字。
