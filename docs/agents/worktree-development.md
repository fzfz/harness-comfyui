# 独立 worktree Desktop 开发与验收

## 启动前准备

开发者从 main 创建独立 linked worktree，并确认根目录 .git 是 worktree 元数据文件。config/desktop-worktree.json 指定主开发 checkout 和本实例运行目录；config/desktop-baseline.json 指定 Desktop 2.0.9、DSH 0.1.5-rc.1 的固定提交和实际安装路径。

主开发 checkout 必须已有 .env、项目构建工具和基线 Desktop 的完整安装。pnpm dev:start 启动器负责链接 .env 并准备独立 node_modules 依赖视图。业务依赖和构建工具复用主 checkout 的安装目录，宿主 peer 从基线 Desktop workspace 解析。启动器不得修改这些共享依赖目录。worktree 不执行 pnpm install，也不复制 .env。

启动器必须验证 config/product-agent.json 指定的 Repository Skills 目录属于当前 worktree，且该目录不是符号链接。

## 启动与实例身份核对

开发者先运行 pnpm dev:status。实例停止时，在前台终端运行 pnpm dev:start；随后在第二个终端运行 pnpm dev:status 和 pnpm dev:logs。

开发者操作实例或发送停止信号前，必须读取本 worktree 的 .local/desktop-development/desktop.pid，并用操作系统检查确认该 PID 是进程组首领，其启动命令指向当前 worktree 的 .local/desktop-development/desktop-out。开发者必须枚举该进程组实际监听的全部端口，只向确认归属的测试端口发送请求。

就绪要求包括当前进程拥有的 Host Web 监听端口、本次启动 run 的 startup.run.completed、rendererStatus 为 healthy，以及实际加载的当前 worktree 插件安装记录。旧启动事件和仅有进程或端口不能作为就绪证据。移动访问不参与 Desktop 启动判定。

## 插件功能验收

开发者必须确认以下结果：

1. 系统打开环境配置指定的 Workspace，默认采用 ComfyUI工作台预设，并提供 ComfyUI迭代预设。
2. 当前 Profile 加载当前 worktree 的 harness-comfyui 产物；Client 出现 ComfyUI 工作台。
3. 默认模型、视觉模型和 Provider 与当前插件配置一致。
4. remote.harnessComfyuiImageReader.models 返回配置中的模型分组；remote.harnessComfyuiCatalog.baseModels 返回数据源的基础模型记录。开发者必须对本次变更涉及的其他接口逐项执行 task_plan.md 中的功能验收条目，并记录请求与响应。
5. 项目 Preset 的 Skills 来自当前 worktree，其他 Preset 不读取项目专用 Skills。
6. 受管 CLI 在真实 Harness Bash 调用中获得 capability；Electron 宿主启动 .mjs 子进程时使用 Node 执行模式。

## 结束与其他环境

开发者完成验收后运行 pnpm dev:stop，再运行 pnpm dev:status 确认 stopped。用户明确要求保留实例供人工操作时，开发者报告该实例身份并保持前台启动终端运行。

pnpm web:* 仅用于 Web Host 单独调试，不能替代完整 Desktop 验收。pnpm prod:* 只用于生产启动或受控临时生产配置测试，不能用于验收未发布的 worktree。
