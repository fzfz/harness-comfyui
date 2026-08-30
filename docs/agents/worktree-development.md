# 独立 worktree 开发验证流程

## 适用范围

Agent 在从 `main` 创建的独立 linked worktree 中开发或验证完整 DSH Desktop 时，必须使用 `pnpm dev:*`。`pnpm web:*` 只用于单独调试 Web Host；`pnpm prod:*` 只用于已发布 Git tag 的生产 Desktop。

## 启动前检查

1. Agent 必须确认当前目录根 `.git` 是 linked-worktree 元数据文件。
2. Agent 必须确认 `config/desktop-worktree.json.mainCheckoutPath` 指向主开发 checkout。
3. 主开发 checkout 必须已经存在 `.env`、根 `node_modules` 和 `config/desktop-production.json.desktopSourceRelativePath` 指定的 DSH Desktop 底座。
4. Agent 不得在 worktree 执行 `pnpm install`，不得复制 `.env`，不得为 worktree clone 第二份 DSH Desktop。
5. worktree 根 `.env` 与 `node_modules` 不存在时，`dev:start` 负责创建指向主开发 checkout 的符号链接；既有冲突路径必须由 Agent 明确处理后重新启动。

## 启动与验收

Agent 必须在当前 worktree 根目录以前台方式启动完整 Desktop：

```sh
pnpm dev:start
```

Agent 必须在第二个终端执行：

```sh
pnpm dev:status
pnpm dev:logs
```

`dev:status` 必须返回 `running`。Agent 随后必须在 DSH Desktop 中确认：

1. 系统直接打开 `config/desktop-production.json.startupWorkspacePath` 指定的 Workspace，不显示 Workspace 选择弹窗。
2. 系统直接加载 `ComfyUI工作台预设`，不显示框架默认 Preset。
3. 默认 Agent 模型、视觉模型和 Provider 来自当前插件 `cordis.patch.yml`。
4. 当前 worktree 的插件 generation 已启用。
5. 当前任务涉及的界面或运行行为通过真实 Desktop 操作验证。

启动失败时，Agent 必须执行 `pnpm dev:logs`，修正具体配置、依赖、端口或插件错误。Agent 不得改用 `pnpm prod:start` 验证未发布源码。

## Web Host 单独调试

当前任务只涉及 Web Host、Client ModuleLoader 或 HTTP 路由时，Agent 可以执行：

```sh
pnpm web:start
pnpm web:status
pnpm web:health
pnpm web:logs
```

`web:*` 不启动 DSH Desktop，不能替代完整 Desktop 验收。

## 结束条件

完整 Desktop 验收结束后执行：

```sh
pnpm dev:stop
pnpm dev:status
```

如果启动了 Web Host，再执行：

```sh
pnpm web:stop
pnpm web:status
```

对应 `status` 必须返回 `stopped`。开发 Desktop 状态只能位于当前 worktree 的 `.local/desktop-development/`；Web Host 状态只能位于 `.local/web-development/`。
