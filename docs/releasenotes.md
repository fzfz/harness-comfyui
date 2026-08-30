# Harness ComfyUI v0.37.1

v0.37.1 修复 DSH Desktop `preview` 生产环境加载了错误 DSH home 的问题。

## 生产 Desktop 修复

- `prod:start` 现在把插件 generation、`ComfyUI工作台预设` 和 `.env` 链接准备到 `electron-vite preview` 实际使用的 `dsh-desktop-dev` user-data 目录；生产运行数据继续保存在 `.local/desktop-production/`。
- 生产与开发仍分别使用 `.local/desktop-production/` 和 `.local/desktop-development/`；两种环境不会共享 DSH home、PID、日志、Run Repository 或媒体文件。
- 真实 Desktop 验收现在执行生产 `preview`，并继续验证默认 Workspace、项目 Preset、Provider 与视觉模型保存、应用内媒体 Modal 和 managed shell capability。
- 真实验收通过 electron-vite 支持的双横线参数把远程调试端口传给 Electron；公开 `pnpm prod:start` 命令不启用远程调试。

## 测试与发布

- 完整测试通过：529 项 unit/integration、29 项 contract/security、96 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。
- 覆盖率为 statements 93.05%、branches 86.32%、functions 100%、lines 95.67%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0；本版本没有增加依赖。
- GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.0

v0.37.0 将 Harness ComfyUI 作为 generation 接入完整 DSH Desktop，并为开发、测试和生产环境提供独立的生命周期命令与运行目录。

## DSH Desktop 接入

- `prod:*` 在 Git tag checkout 中管理完整 DSH Desktop `preview` 进程；`dev:*` 在 linked worktree 中管理完整 DSH Desktop `dev` 进程；`web:*` 只管理独立 Web Host 调试进程。
- `dev:start` 和 `web:start` 为 linked worktree 创建指向主开发 checkout 的 `.env` 与 `node_modules` 符号链接。worktree 不复制 `.env`，也不安装第二份根依赖。
- 当前仓库启动器生成 Host 与 Client 模块并物化 `ComfyUI工作台预设`；DSH Desktop generation 安装器随后把当前插件包安装到隔离的 DSH home。开发、生产和 Web 调试分别使用 `.local/desktop-development/`、`.local/desktop-production/` 和 `.local/web-development/`。
- CI 与生产环境使用 `fzfz/dsh-desktop:codex/configurable-mobile-bridge-port`。该 DSH Desktop 分支读取 `DSH_DESKTOP_MOBILE_BRIDGE_PORT`；当前仓库从 `.env` 的 `COMFYUI_WORKBENCH_DESKTOP_MOBILE_BRIDGE_PORT` 读取端口并传给 Desktop。

## Desktop 产品行为

- Desktop 启动后直接打开 `config/desktop-production.json.startupWorkspacePath` 指定的 Workspace，并加载当前插件提供的默认 `ComfyUI工作台预设`、Provider 凭据、默认 Agent 模型和默认视觉模型。
- 图片读取设置从当前 Harness LLM Runtime 列出支持图片输入的系统 Provider 与模型；Provider 选择保存后重新打开设置仍保持原值。
- 项目 Skill 从当前 Harness WebServer 的实际动态地址取得 managed CLI endpoint 和短期 shell capability。`local-image-reader`、生成与历史查询 Skill 不再依赖固定 Web Host 端口。
- 用户点击结果图片或视频后，Client 在 DSH Desktop 原生 Modal 中打开同源媒体查看页；Client 不再创建浏览器新窗口。

## 测试与发布

- `pnpm quality` 包含真实 DSH Desktop 验收。真实验收覆盖 generation 安装、默认 Workspace、项目 Preset、Provider 保存后重开、应用内媒体 Modal、managed shell capability 和可配置移动桥接监听端口。
- 完整测试通过：529 项 unit/integration、29 项 contract/security、96 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。
- 覆盖率为 statements 93.05%、branches 86.32%、functions 100%、lines 95.67%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0；本版本没有增加依赖。
- GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。
