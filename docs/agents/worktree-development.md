# 独立 worktree 官方 Desktop 开发与验收

## 完整验收

开发者在独立 worktree 中使用 `pnpm test:desktop` 执行官方 Desktop 完整 E2E。该命令构建并打包当前候选插件，通过官方插件管理界面安装、启用插件，连接本轮 Renderer CDP，执行界面和业务断言，并保存运行记录、日志与证据。

自动化验收使用 `config/desktop-e2e.json` 的默认 `fresh` 模式。每轮运行都使用独立 Harness home、Electron user-data、Workspace、端口、插件安装位置和证据目录。测试完成后，验收记录必须显示本轮应用进程和端口已释放。

完整 E2E 的应用身份、Renderer 就绪条件、插件版本与安装位置、业务结果及清理断言由 `tests/desktop/` fixtures 和测试文件执行。`pnpm test:desktop` 通过表示本轮候选树满足这些自动化断言；交互调试 probe 单独使用时提供进程与 Renderer 状态，不单独证明插件安装和业务测试通过。

## 交互调试

开发者使用已安装官方应用进行交互调试时，直接运行以下 probe 命令：

```sh
node tests/desktop/fixtures/official-desktop-probe.mjs start --mode development
node tests/desktop/fixtures/official-desktop-probe.mjs status --run-id <run-id>
node tests/desktop/fixtures/official-desktop-probe.mjs stop --run-id <run-id>
```

`start` 返回的 `runId` 标识本轮进程、端口、记录和证据。开发者使用该 ID 执行 `status`，并在调试结束时执行 `stop`。probe 仅在操作系统核对 PID、进程组、应用启动命令和本轮监听端口均匹配后向该进程组发信号。停止结果必须报告本轮进程已退出且本轮端口已释放。

`development` 模式共享当前 worktree 下的持久 Harness home、Electron user-data 和 Workspace，位置由 `config/desktop-e2e.json` 定义，当前根目录为 `.local/desktop-development/official-environment/`。本轮唯一运行材料位于 `.local/desktop-e2e/<run-id>/`。development 环境使用 `active-probe.json` 租约保护共享设置与业务数据；同一 worktree 的持久环境已被租用时，probe 会拒绝另一轮并发启动。

开发者首次使用该持久目录时，通过官方应用完成首次 Profile 初始化和 Provider、模型设置。后续交互调试继续复用官方保存的 Profile、Provider、模型、插件设置、Workspace 和业务数据。probe 只在首次创建 Profile patch 时写入 `initialProfilePatches`；当前初始模型项是 OpenRouter `stealth/space-bunny-alpha`，凭据只以 `OPENROUTER_API_KEY` 环境变量名称引用。此初始值不会覆盖已保存配置、官方全局默认模型或其他 Preset 的模型。后续运行只更新本轮 Host 端口，保留其余用户设置。

开发环境凭据由 `config/desktop-e2e.json` 的 `environmentFilePath`、`credentialEnvironmentNames` 和 `requiredEnvironmentNames` 控制。probe 只从 main checkout `.env` 读取已声明的凭据名，并把相应变量传给本轮应用进程；当前必需凭据为 `OPENROUTER_API_KEY`，`OPENCODE_GO_API_KEY` 是可选项。main `.env` 的其他字段不构成本轮 probe 的输入，也不会被传给本轮应用。

启动失败、端口冲突、取消、超时和清理失败的记录保存在本轮 evidence 目录。准备阶段失败写入配置所指定的 `preparation-failure.json`。开发者检查证据时使用 `run.json`、stdout/stderr 文件和 JSON 证据文件；probe 没有单独的日志或帮助子命令。

## 检查入口

- 启动、Profile 保存和官方应用生命周期规则见 `docs/system/startup.md`。
- 插件配置来源、覆盖顺序和持久数据目录见 `docs/system/configuration.md`。
- 自动化命令、E2E 覆盖与本地门禁见 `docs/system/testing.md`。
