# Harness ComfyUI 原型方案进度

## 2026-08-30 Phase 41 — DSH Desktop 生产生命周期命令

- 状态：进行中。
- 用户把目标纠正为产品发布到 GitHub 后由生产 checkout 直接执行的完整命令集；仓库不规定命令执行者。
- 测试 seam 固定为 `package.json` 的 DSH Desktop 生产命令和它们管理的隔离进程。
- 用户纠正开发环境结构：`main` checkout 持有 `.env`、`node_modules` 和 DSH Desktop 底座；worktree 必须通过符号链接复用，不得复制或重新安装。
- 已停止旧配置启动的开发 Desktop PID `97706`，准备按统一生产配置与 worktree 差异覆盖重写配置入口。
- 用户固定公开 seam：`prod:*` 管理完整 Desktop 生产环境，`dev:*` 管理完整 Desktop 开发环境，`web:*` 仅管理旧 Web Host 调试环境；旧 `worktree:*` 与两组 `desktop:*` 生命周期入口必须删除。
- `$implement` 要求本阶段按公开 package scripts 逐项执行 red-green、定期执行类型检查、最终执行完整质量门禁、代码审查并提交当前分支。
- 三组公开命令测试首次执行产生预期失败：根 manifest 仍把 `prod:*` 指向旧 Web Host，且没有 `dev:*` 与 `web:*`。根 manifest 已按固定命令表完成最小映射修改。
- `dev:start` 公开 seam 测试第二次执行产生预期失败：开发 CLI 尚未导出完整开发命令，且没有 worktree 链接准备步骤。最小实现现在先验证 linked worktree 与 `main` 的 `.env`、`node_modules`，创建两个符号链接，再调用共享 Desktop 生命周期。
- Desktop 生产与开发聚焦测试 19 项通过，随后 `pnpm run typecheck` 通过。
- Web Host 命令测试产生预期 red：公共帮助仍显示 `worktree:*`，公共函数仍使用 Source worktree 名称；实现已统一为 `web:*` 和 `runWebHostCommand`。
- Desktop 生产路径测试产生预期 red：生产 context 仍固定使用本机 `main` 中的 Desktop。配置已改为相对路径，使生产使用当前 tag checkout 的 Desktop 底座，开发使用 `main` checkout 的同一相对路径。
- 三类环境运行目录已固定为 `.local/desktop-production`、`.local/desktop-development` 与 `.local/web-development`；Web Host 配置入口已改为 `config/web-development.json`。
- 工程合同按预期因旧四组入口失败，随后改为精确断言三组公开生命周期命令。
- `docs/system/startup.md`、`docs/agents/worktree-development.md` 与根 `AGENTS.md` 已改为完整 Desktop `dev:*` 验收、Git tag Desktop `prod:*` 管理和可选 Web Host `web:*` 调试；开发规范明确禁止在 worktree 安装依赖或复制 `.env`。
- `docs/system/configuration.md` 已定义生产 Desktop、开发 Desktop 与 Web Host 三份配置的字段职责，并明确 `cordis.patch.yml` 是生产与开发共同的 Workspace/Preset/Provider/模型接入路径。
- `docs/system/architecture.md` 已把产品启动链路改为 Desktop generation + Electron dev/preview，并把旧 Source 进程管理器限定为 Web Host 内部实现。
- `docs/system/directory-structure.md`、`docs/system/testing.md`、`docs/system/releasing.md`、`README.md` 与 `CONTEXT.md` 已同步三种环境的目录、CI、Git tag 部署命令和领域术语。
- 已把当前已安装 DSH Desktop 从开发 worktree 移到主开发 checkout 的 `.local/upstreams/dsh-desktop`，并把 24 个 Harness 开发依赖与 `dsh` 可执行入口链接到主开发 checkout 的根 `node_modules`。
- 第一次真实 `pnpm dev:start` 在建立根 `node_modules` 链接前静态加载 `tsdown` 并失败；实现已改为链接成功后再动态加载三个物化器。
- 第二次真实 `pnpm dev:start` 已完成 worktree 链接、插件构建、Desktop 打包和 profile 初始化，随后在 generation 安装阶段报告 pnpm major 不一致；该运行发生在尚未合入 `main` 的功能分支上，不作为最终测试结论。
- 用户要求先把功能分支提交并合入本地 `main`；后续完整质量门禁与真实 Desktop 启动验证必须从已提交的本地 `main` 或由该 `main` 创建的新 worktree 执行。
- 功能分支已提交为 `91ab4bb`；合入前 Standards 与 Spec 审查共同定位到 capability 动态端口、上游 pnpm 启动 seam、Web worktree 链接准备、无效移动桥接端口配置和根 `node_modules` 链接忽略五项现有合同错误。
- capability URL 已改为当前 `ctx.webServer.host/port`；Desktop capability 测试已改为端口 `0` 的真实 WebServer，并让真实 DSH bash 在同一 Tool Call 内执行项目 CLI 请求。
- Desktop 生命周期已改为执行 DSH Desktop 自带 pnpm 的 `dev`/`preview` package script；Web start/restart 已在动态加载依赖模块前复用 worktree 链接准备。
- 无法传给 DSH Desktop 的 `mobileBridgePort` 配置字段已删除；启动器只按上游固定的 `preview=43127`、`dev=43128` 合同预检端口，文档不再声称该值可配置。
- `.gitignore` 已覆盖根 `node_modules` 符号链接，Git 隔离合同已加入该路径。
- 本地 `main` 已通过 merge commit `9560d3b` 合入功能分支并保留 `0.36.2`、`local-image-reader` 与六个项目 Skill 文档；所有测试从该提交之后开始执行。
- 合入后的首轮类型检查发现 `ctx.webServer` 缺少显式类型收窄；Web Host 聚焦测试发现启动 CLI 导入的 worktree 准备函数名称错误。两处实现已按实际公开服务与真实导出名称修正。
- 修正后 TypeScript 检查通过；Desktop 生产、Desktop 开发、Web worktree、Git 隔离、Host 插件和受管 shell capability 共 61 项聚焦测试通过。
- 第一次完整 `pnpm quality` 的依赖门禁、类型检查、529 项单元/集成、28 项合同/安全、88 项生产和 32 项原型测试通过；真实 Desktop 验收因 `pnpm dev` 透传参数多出一个 `--`，导致 Electron 未开放测试指定的调试端口而失败。
- Desktop 启动器已把调试参数改为上游实际接受的 `pnpm dev --remoteDebuggingPort <port>` 参数形态；生产测试直接断言该 package script 参数。
- 修正后的 Desktop 生命周期与真实 Desktop 聚焦测试共 20 项通过；真实上游日志显示 `electron-vite dev --remoteDebuggingPort <port>`，DevTools 在该动态端口监听。
- 最终 `pnpm quality` 全部通过：529 项单元/集成、28 项合同/安全、88 项生产、32 项原型和 2 项真实 Desktop 测试通过；函数覆盖率为 100%。
- 真实 Desktop 验收已从上游 `pnpm dev` 入口验证默认 Workspace、项目 Preset、Provider 选择保存与重开、应用内媒体 Modal，以及受管 DSH bash 通过当前动态 WebServer 端口调用项目 CLI route。
- 从 `main@639186e` 创建的新 worktree 稳定复现 generation 安装失败；0.8 秒最小复现确认 DSH `installGeneration()` 返回 `ERR_PNPM_UNEXPECTED_STORE`，完整输出证明错误不是 pnpm major 本身。
- 根因是 worktree 根 `node_modules` 链接使用主开发 checkout 的 pnpm store 与 virtual store，而隔离 Desktop HOME 改变了 installer 推导的 store；pnpm 因同一 workspace 出现两套路径而拒绝 staging。
- 回归测试在 linked `node_modules` 结构下先因缺少 `PNPM_CONFIG_STORE_DIR` 与 `PNPM_CONFIG_VIRTUAL_STORE_DIR` 失败；实现读取根 pnpm metadata 和 `node_modules` 真实路径后，22 项 Desktop 生命周期测试与 TypeScript 检查通过。

## 2026-08-30 Phase 40 — 补齐 DSH Desktop 合入门禁

- 状态：已完成，等待用户验收后决定是否合入主线。
- 用户已经确认执行可复现依赖、必跑 Desktop 门禁、生命周期错误分支、Provider 保存、真实媒体 Modal 与真实 shell capability。
- 已确认测试 seam 为根依赖安装、Desktop 生命周期、Desktop 设置 Remote、Desktop 媒体 Modal 和 Harness shell capability。
- 已确认真实 Desktop Provider 基础成功链路通过，但尚未进入必跑门禁。
- 第一次规划文件补丁因旧 `findings.md` 结构与技能模板不同而未应用；第二次补丁按旧文件真实标题追加，不重写历史记录。
- 依赖与质量门禁的首个 red 测试产生 4 个预期失败：旧 `node_modules` 链接仍被接受、Desktop tarball 被拒绝、manifest 仍使用旧链接、`quality` 未调用 Desktop 测试。
- 最小合同修改后定向测试 14/14 通过。
- 第一次 lockfile 重建失败：`@deepseek-ai/dsh-base` 的 `@deepseek-ai/dsh-bash-sandbox@^0.1.2-alpha.1` 没有发布到 npm；直接 tarball 集的传递 peer 闭包额外包含 57 个 DSH package。
- 根 manifest 与 lockfile 已删除所有 `.local/upstreams/dsh-desktop/node_modules` 依赖；`desktop:dependencies:link` 从已安装 Desktop 提供 24 个开发包和 `dsh` 可执行入口。
- Desktop 生命周期测试 15 项通过，覆盖端口冲突、准备失败、Electron error、异常退出、PID 清理、重复启动、重复停止、停止超时、restart 和 generation 安装投影。
- 真实 Desktop 测试通过 Provider 切换、Remote 保存、页面重载与重新打开设置的持久化验证。
- 真实 Desktop 测试通过保存 Session 的媒体抽屉、媒体卡、DSH Modal、同源 iframe 和不创建新页面验证。
- 真实 Harness shell capability 测试通过 DSH ToolRuntime、Bash Tool 与 LocalSubprocess 执行路径取得项目 CLI 环境。
- GitHub CI 已增加 macOS Desktop 必跑任务；Source quality job 也先准备 DSH Desktop 依赖再执行门禁。
- 旧 `dsh plugin add` 路径被真实启动日志证明会触发 generation 迁移回滚；worktree 启动已改用 DSH Desktop 公开 generation installer、registry 与 projection 接口。
- 完整 `pnpm quality` 通过：529 项 unit/integration、28 项 contract/security、80 项 production、32 项 prototype 和 2 项 Desktop 测试通过；函数覆盖率为 100%。
- 正常 Desktop 实例已恢复运行，PID 为 `97706`；`web` profile、generation registry 与插件符号链接均指向当前 worktree 打包的同一个 generation，本次启动没有发生迁移回滚。

## 2026-08-26 Phase 37 — 发布 v0.30.2

- 已读取 `docs/system/releasing.md`，确认发布顺序为根 `package.json.version`、源码质量门禁、源码提交与 CI、发布文档及独立语义验收、最终提交与 CI、标签和 GitHub Release。
- 已确认当前分支为 `main`，HEAD 为 `9765706`、已发布标签为 `v0.30.1`；`v0.30.2` 本地标签和 GitHub Release 均不存在。
- 已把根 `package.json.version` 修改为 `0.30.2`，保留当前工作区的源码、测试和规划记录变更。
- 首次 `pnpm quality` 在 `tests/contract/engineering-baseline.test.ts` 失败，因为合同断言仍固定为 `0.30.1`；类型检查、244 项 unit/integration、依赖安全检查和构建脚本检查已通过。
- 已将该合同断言更新为 `0.30.2`，当前阶段重新执行源码版本提交前的 `pnpm quality`。
- 第二次 `pnpm quality` 通过：244 项 unit/integration、20 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过；覆盖率为 statements 91.98%、branches 83.41%、functions 100%、lines 94.56%。
- 源码版本提交前的 `git diff --check` 通过，准备提交并推送版本与源码变更。
- 已提交 `265a2494ba904d3b4a905f6c5968906018dae266`（`release: prepare v0.30.2 source`）并推送到 `main`。
- GitHub CI Run `32928772960` 已成功；CI 仅显示 GitHub Actions 使用 Node.js 20 的弃用提示，不影响本次成功结论。
- 已更新 `README.md` 与 `docs/releasenotes.md`，当前等待独立 Reviewer 验收发布文档。
- 第二次独立 Reviewer 已返回 `PASS`，确认 README 与 Release Notes 的版本、四项行为变更、错误码、边界和验证数字均有源码与测试依据，无需修正。
- 最终文档提交前的 `git diff --check` 与 `pnpm quality` 通过：244 项 unit/integration、20 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过；覆盖率保持 statements 91.98%、branches 83.41%、functions 100%、lines 94.56%。
- 最终文档提交准备推送，随后等待该提交的 GitHub CI。
- 最终文档提交 `d018c8d2b32187e6ce1e7acf90dc367682c7d689` 已推送；GitHub CI Run `32929188639` 已成功。
- 目标 `v0.30.2` 标签与 GitHub Release 尚未创建；最终状态记录后的本地质量门禁已通过，准备提交最终清单并等待该提交的 GitHub CI。
- 已在最终提交 `d2de5d245ac8dd5d0e43d202b2f7fcfa77faa3a5` 上创建并推送注释标签 `v0.30.2`；远端 peeled tag SHA 核对一致。
- GitHub Release `https://github.com/fzfz/harness-comfyui/releases/tag/v0.30.2` 已创建，标题为 `Harness ComfyUI v0.30.2`，说明来自 `docs/releasenotes.md`，`draft=false`、`prerelease=false`、附件数量为 0。
- Phase 37 已完成。

## Phase 31：修复 Agent Preset 与 Workbench Profile 重复注入 Skill

- [x] 复核 Standard 与 Router Session 的持久事件，两种 Session 均包含两项完全相同的 `comfyui-generate` instructions 类型 Skill Invocation。
- [x] 定位 Workbench Profile 与两个 Agent Preset 都注册 `skill-filesystem` 和 `tool-skill` 的组合边界。
- [x] 添加 Profile Skill 所有权回归测试；修改前测试收到两个启用行并按预期失败，修改后定向测试 7 项全部通过。
- [x] 把 Workbench Profile patch 改为空数组，保留 Agent Preset 的唯一 Skill 注册；生产物化与 Harness 边界合同已同步。
- [x] Standard Session `session-2a67c7c8-6263-41f9-b324-57b1a146523a` 只保存一项 `comfyui-generate` Skill Invocation。
- [x] Router Session `session-932a0548-b797-4784-8db0-b00adc1515f1` 只保存一项 `comfyui-generate` Skill Invocation；本地确定性模型探针继续在同一轮调用 `phase_begin`、三次 `phase_advance`、模板查询 Tool 和 Generation Tool。
- [x] 20 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过；主 Harness 健康检查通过。
- [ ] 完整 quality 的 218 项 unit/integration 测试全部通过，但当前 HEAD 中正在进行的 Phase 30 新增代码使函数覆盖率为 99.2%，低于全局 100% 门禁；该覆盖率缺口由 Phase 30 继续处理。

## Phase 29：发布 v0.30.1

- [x] 读取仓库发布规范，确认 `0.30.1` 对应标签 `v0.30.1`，GitHub Release 只包含标签和 Release 记录。
- [x] 明确本次提交包含当前已验证的插件源码、测试、PRD 与计划记录，并排除现有未跟踪的 `docs/research/`。
- [x] 第一次质量门禁定位到工程合同仍固定断言 `0.3.0`；已把该合同同步为 `0.30.1`。
- [ ] 更新根版本为 `0.30.1`，执行完整质量门禁，提交源码变更并推送到 `origin/main`。
- [ ] 源码提交的 GitHub CI 成功。
- [ ] 更新 README、v0.30.1 发布说明和发布系统文档；独立语义审核最终为 PASS，第二次完整质量门禁通过。
- [ ] 提交并推送文档变更，等待最终 GitHub CI 成功。
- [ ] 创建并推送 `v0.30.1` 注释标签，创建 GitHub Release，并完成远端核验。

## Phase 28：单轮多次异步生成与逐媒体 Workflow 验证

- [x] 确认 Generation Tool Host 已支持同一数字 turn 中由一项 Skill Invocation 授权多个不同 `call_id`；新增测试证明两个 Tool Call 创建两个独立 Run 请求。
- [x] 修改 `comfyui-generate` Skill：先识别并校验全部 Generation Request，再按用户声明顺序为每项请求调用一次 `generate_with_comfyui`。
- [x] 修改 PRD 04 和 PRD 12，使单请求一次 Tool Call、多请求多次 Tool Call、任一 Generation Request 校验失败时不创建任何 Run 成为当前产品合同。
- [x] 在真实 Harness 的一个用户轮次中提交 384×512 与 512×384 两项独立生成请求；Harness 轨迹显示一项 `comfyui-generate` Skill Invocation 和两项 `generate_with_comfyui` Tool Call。
- [x] 验证两个不同 `run_id` 的异步终态、媒体内容和分片存储记录；两个 Run 同属 Session `session-e5821714-a06f-4e61-9b3c-b1f444e78e38` 的第 1 轮，并分别保存 384×512 雪景白发少女和 512×384 花田红发少女图片。
- [x] 通过每张媒体的 Workflow 下载接口取得两个 Actual Workflow；两个响应的正向提示词、宽度、高度和 Seed 分别等于请求值，规范化 JSON 的 SHA-256 也不同。
- [x] 独立语义审核最终为 PASS；`pnpm run quality` 通过 195 项单元/集成测试、18 项合同/安全测试、14 项生产测试和 27 项原型测试，函数覆盖率为 100%；生产进程 PID 63965 的六项健康检查通过；真实 Harness 浏览器右栏显示 2 个运行、2 个媒体和两个逐媒体 Workflow 下载按钮。

## Phase 27：多模板真实实例覆盖验证

- [x] Catalog CLI 返回的 36 个 Workflow 模板全部完成清点；模板覆盖六类流程和五类运行参数。
- [x] 两个真实实例的 72 个 `/object_info` 编译组合全部完成：`mac mini` 27 个成功、9 个缺节点，`win3080` 29 个成功、7 个缺节点；每个模板至少兼容一个实例。
- [x] Workflow 编译器根据目标实例 COMBO 枚举唯一匹配路径分隔符；正斜杠、反斜杠双向回归测试和歧义分支测试通过。
- [x] 模板 37 在 `mac mini` 使用正斜杠 LoRA 路径完成真实生成；`run_3f64c8e1-569b-41c8-87db-f80087c33e6e` 保存媒体 `media_9bf0ca3c-6beb-49a0-a395-0703ce50621d`。
- [x] 模板 38 在 `mac mini` 完成真实生成；`run_a7a56265-d079-4264-8113-74aa21c2d5ff` 保存媒体 `media_04cb4d51-aa35-44a2-806d-703be2c2cdae`。
- [x] 模板 28 通过原生提问交互分别确认两个 Seed 参数，在 `mac mini` 完成二阶段真实生成；`run_fb85ca3c-a040-4c05-ad1c-9ed48f7f2c5f` 保存媒体 `media_f99bc597-fb8d-4e0c-b2e2-5cb5e4bed616`。
- [x] 模板 34 到达真实 `/prompt`；`run_c8e182e5-60d2-4e2d-9c94-74d56ced0c19` 保存实例返回的 2298 字符 VAE 与节点连线错误，右栏错误详情 Modal 完整展示错误正文。
- [x] 模板 37 显式路由到 `win3080`，使用该实例的反斜杠 LoRA 路径完成真实生成；`run_a66891dc-a470-4c8f-8dee-932668c92a95` 保存媒体 `media_97583c51-d700-4ca4-b659-e1afcf1f2714`。
- [x] 真实 Harness 右栏显示 5 个独立 Run、4 个分片保存媒体、4 个逐媒体 Actual Workflow 下载图标和 1 个完整实例错误详情。
- [x] 最终 `pnpm run quality` 通过：194 项单元/集成测试、18 项合同/安全测试、14 项生产测试和 27 项原型测试全部通过，函数覆盖率为 100%。
- [x] 生产进程 PID 16715 保持运行；process、sourceRuntime、harnessWeb、clientBundle、runRepository 和 savedMedia 六项健康检查全部通过。
- [x] 独立语义审核确认 Phase 27 的路径分隔符根因、5 个 Run、4 个媒体、模板 34 实例错误、授权边界和非本次目标表述准确，审核结果为 PASS。

## Phase 25：评估 dsh-routing-suite 兼容性

- [x] 确认当前工作树在调研开始前没有未提交修改。
- [x] 检查 `dsh-routing-suite@21a7260d961571c77a11705d2b0e6cf7015cc48b` 的公开仓库结构、声明和接入代码。
- [x] 对照 Harness `0.1.1-rc.2` 官方接口与当前项目插件边界。
- [x] 完成 `docs/research/dsh-routing-suite-compatibility.md` 与独立语义复核。

## Phase 24：修复 Workflow 模板目录加载与错误展示

- [x] 使用真实数据源 CLI 复现 Workflow 模板第一页失败。
- [x] 定位 `enum` 和 `image_reference` 未进入 Catalog 参数类型白名单。
- [x] 核对 Harness `0.1.1-rc.2` Typert Gateway 的 Remote 错误返回行为。
- [x] 编写 Catalog 参数类型与错误传播失败测试。
- [x] 修改 Catalog 合同、Host adapter、Remote 返回合同和弹窗错误展示。
- [x] 独立语义审核确认四条 Catalog 错误文案与实际触发分支一致。
- [x] `pnpm quality` 通过：184 项 Unit/Integration 测试、18 项 Contract/Security 测试、14 项 Production 测试和 27 项 Prototype 测试全部通过。
- [x] 生产健康检查通过；Harness 上下文弹窗显示 Workflow 模板第一页 9 张真实卡片，其中包含 `image_reference` 模板，弹窗不显示目录错误。

- 2026-08-24：开始修正上下文弹窗的资源类型选中态、每页9项九宫格和封面完整缩放行为；定向40项测试与TypeScript检查通过。
- 2026-08-24：用户确认采用原生输入框JSON方案；已删除Harness引用codec与`insertReference()`路径，改用公开`SessionInput.setDraft()`同步结构化上下文JSON和可移除chip。
- 2026-08-24：真实Harness浏览器终验通过：左侧资源选中态、9项3×3九宫格、LoRA封面完整缩放、2项JSON写入和chip取消同步删除均符合当前要求。

## Session: 2026-08-20

### Phase 1: 检查两个仓库的现有接口
- **Status:** completed
- **Started:** 2026-08-20
- Actions taken:
  - 计划编写者读取 `$prototype`、`planning-with-files` 和 `codebase-design` 的完整入口说明与本任务所需参考文件。
  - 计划编写者确认目标目录为空且不是 Git 仓库。
  - 计划编写者确认两个数据来源仓库都存在用户未提交修改，本轮只执行只读检查。
  - 计划编写者搜索相关历史调研记录并把静态结论标记为待当前仓库验证。
  - 计划编写者读取 DeepSeek Harness 根目录、packages 目录和 Web 包的开发约束。
  - 计划编写者列出数据源仓库现有 ComfyUI、会话和 Pi Skill 相关模块。
  - 计划编写者确认 DeepSeek Harness 提供会话节点、附件、Skill、任务、交付物和工作流运行的浏览器扩展包。
  - 计划编写者确认 DeepSeek Harness 的业务会话节点可以使用稳定业务 ID 关联持久事件并支持顺序重放；后续设计决定不把该能力用于复制 Generation Run 状态。
  - 计划编写者确认 DeepSeek Harness 已实现三列布局、Skill 斜杠触发器和输入引用 chip。
  - 计划编写者识别 `details` 单占用 slot 与现有工具详情面板之间的布局冲突。
  - 计划编写者确认输入引用 chip 能够在发送时通过异步 codec 生成模型文本，并在序列化失败时阻止发送。
  - 计划编写者排除“先调用注入 RPC、再调用普通 prompt RPC”的双请求方案，因为第二个请求失败时会遗留未配对上下文。
  - 计划编写者读取当前运行中的语义 OpenAPI，并确认现有 CLI 只提供四类语义查询。
  - 计划编写者读取数据源 SQLite 表结构和 ComfyUI 工作流运行参数契约，并识别视频与音频能力缺口。
  - 计划编写者统计当前生产目录数据规模，并确认画师串空集合是实际数据状态。
  - 计划编写者确认指定生产 checkout 不含已在后续主仓库合并的管理 Skill 文件。
  - 计划编写者确认 Harness 通用后台任务注册表只能承担进程内观察，不能替代当前仓库需要实现的持久 ComfyUI 运行数据库。
- Files created/modified:
  - `task_plan.md`（新建）
  - `findings.md`（新建）
  - `progress.md`（新建）

### Phase 2: 定义原型页面与模块接口
- **Status:** completed
- Actions taken:
  - 三名独立接口设计队员分别提交极简接口、常用场景接口和可扩展接口方案。
  - 计划编写者比较三套方案后定义 `GenerationCatalog`、`ComfyuiSourceCatalog`、`GenerationRuns` 和 `generate_with_comfyui`。
  - 计划编写者定义稳定工作台、命令面板和运行检查器三个 UI 原型变体。
  - 计划编写者根据用户补充要求，把数据源仓库改为只读来源，并把异步运行、状态恢复、API Workflow JSON 和媒体持久化全部移入当前仓库。
  - 计划编写者根据用户补充要求，删除“Skill 只能看到自身目录”的迁移假设，并把 Skill 文件与工具可见性归还给 DeepSeek Harness 的原生宿主配置。
  - 计划编写者根据用户补充要求，明确迁移后的 Skill 通过 DeepSeek Harness Tool 调用完善后的原数据源 CLI，不创建第二套 Skill 数据服务。
  - 计划编写者定义当前仓库的 `runs.sqlite`、运行 JSON 目录、媒体目录和恢复 worker。
- Files created/modified:
  - `prototype-scheme.md`（新建）
  - `findings.md`（更新）
  - `task_plan.md`（更新）
  - `progress.md`（更新）

### Phase 3: 语义独立审核
- **Status:** completed
- Actions taken:
  - 独立审核队员第一次审核判定 FAIL，并报告远端提交崩溃窗口、transport 契约缺失、跨模块类型缺失、Skill 工具与权限表述冲突以及依赖计划缺失。
  - 计划编写者定义 Harness `(workspace_id, session_id, call_id)` 唯一身份、提交状态、`submission_unknown` 终态和四个崩溃注入测试位置。
  - 计划编写者定义 ComfyUI transport、状态映射、媒体 descriptor、媒体流读取和 Session 访问控制。
  - 计划编写者定义目录、来源、运行、Workflow 和媒体的跨模块数据结构。
  - 计划编写者把原 CLI 方案校正为现有 OpenAPI 3.1 live discovery，并把每个 operation 注册为资源专用 `query_semantic_*` Harness Tool。
  - 计划编写者对来源 DeepSeek Harness monorepo 执行生产依赖审计；该历史基线返回 12 个 high advisory，当时正式 bundle 安装和生产连接保持 NO-GO。Phase 8 已经完成当前项目依赖处理，当前项目完整闭包与 production 闭包均为 0 advisory。
  - 独立审核队员第二轮复审发现实例 URL 公开投影矛盾；计划编写者拆分 Host 私有来源快照与模型、Session、浏览器公开投影。
  - 独立审核队员第三轮复审发现本地媒体分页接口缺失；计划编写者增加 `GenerationRuns.listMedia()` 和媒体分页契约。
  - 独立审核队员最终复审未发现剩余 P0、P1 或 P2，并判定 PASS。
- Files created/modified:
  - 无。

### Phase 4: 交付讨论稿
- **Status:** completed
- Actions taken:
  - 计划编写者完成 `prototype-scheme.md` 并准备向用户提交推荐方案、备选 UI、关键仓库边界、NO-GO 门禁和待确认决策。
- Files created/modified:
  - 无。

### Phase 5: 锁定变体 A 与 Workflow JSON 持久化边界
- **Status:** completed
- Actions taken:
  - 用户已经选择变体 A；计划编写者把静态原型范围收敛为单一路由，不实现 B、C 页面。
  - 计划编写者只读检查 `NoobAI-XL-FZ-PROD-ENV` v0.71.8 的领域定义、ADR 和静态下载原型。
  - 计划编写者只读检查相邻 `NoobAI-XL-FZ` 开发 checkout 中的 `prepareIterativeWorkflow()`、双 JSON 运行前持久化、运行详情投影、Blob 下载和 E2E 下载断言。
  - 计划编写者把用户所说的“请求快照转换为 workflow json”定义为本次实际 Workflow JSON；原始内部 `request.json` 不进入下载入口。
  - 计划编写者确认两个 Workflow JSON 的运行前持久化边界；当前页面只提供“下载本次 Workflow JSON（可导入 ComfyUI）”，API Workflow JSON 只供 Host 私有提交、恢复和诊断逻辑使用。
  - 计划编写者把当前仓库持久目录改为同时保存 `request.json`、`actual-workflow.json` 和 `api-workflow.json`，并保持数据源仓库只读。
  - 独立语义复审发现持久来源快照缺少模板内容、bindings 和 LoRA 来源投影；计划编写者新增 `PersistedRunSourceSnapshot` 与 `RunRequestSnapshot`，并增加数据源变更后的离线重建测试。
  - 计划编写者区分同一 ToolExecution 的恢复重试与用户通过新聊天消息明确请求的新运行；前者复用原运行，后者由 Harness 创建新的 `tool_call_id` 和 `run_id`。
  - 独立语义复审确认 `PersistedRunSourceSnapshot`、`RunRequestSnapshot`、`submission_unknown` 和两类重试边界已经修复，最终判定 PASS。
- Files created/modified:
  - `prototype-scheme.md`（更新）
  - `findings.md`（更新）
  - `task_plan.md`（更新）
  - `progress.md`（更新）
  - `workflow-json-conversion-research.md`（调研队员撰写中）

### Phase 6: 实现变体 A 静态原型
- **Status:** completed
- Actions taken:
  - 用户确认进入静态原型实现。
  - 计划执行者读取 `$prototype` 的 UI 原型约束和 `frontend-design` 的两阶段设计要求。
  - 用户已经选择变体 A；计划执行者不创建 B、C 页面和变体切换器，只实现 `/prototype/generation-workbench`。
  - 页面采用日光工作台视觉：蓝灰背景、白色工作面、钴蓝操作色、琥珀运行态和赤红错误态；正文、标题与运行标识分别使用无衬线、圆角标题和等宽字体角色。
  - 页面沿用三列信息层级，并把右列运行卡片的纵向 Workflow 信号轨作为识别性视觉元素。
  - 用户明确 `/Volumes/4Tdisk/work/AI2/deepseek-harness` 只供调研；计划执行者把正式宿主、Host 插件和项目级 Skill 的安装位置锁定为当前仓库。
  - 用户明确一个 Session 包含多个聊天轮次，而且每轮可以由普通授权 Skill 调用或不调用 `generate_with_comfyui`；计划执行者使“当前轮次结果”按稳定 `turn_id` 显示零个、一个或多个关联运行。
  - 计划执行者把 Session、Turn 和运行关系统一为页面生命周期内的内存状态；“本会话结果”和会话运行数量都从所属聊天轮次的 `run_id` 去重并集生成。
  - 计划执行者使每次新发送创建独立的 `turn_id`、独立的 `run_id` 和限定在该聊天轮次内的 Agent 流式节点。
  - 计划执行者修复多运行轮次的“定位结果”交互；定位操作重新投影该聊天轮次的全部运行后再滚动并高亮目标卡片。
  - 计划执行者完成 26 项结构测试；测试覆盖本地资源、全部状态、单一 Workflow 浏览器下载、内部 API Workflow 图完整性、媒体输出、零个/一个/多个运行、Session 与 Turn 集合一致性、LoRA 不创建专用 Session、控件行为与轮次文案、底模“全部”选项、Harness 轨迹所有权、会话媒体库、全局媒体库、全局异步任务列表、动态聊天任务投影、提交超时与 Jobs API 404 状态边界、单 Job 取消、独立分页、默认中间态、连续发送身份、项目层不实现 Skill 选择器和原生上下文模态弹窗。
  - 计划执行者在浏览器中验证底模“全部”、左侧“所有媒体”入口、居中媒体库、会话/轮次/类型联动筛选、会话媒体两列两行分页、原文件新窗口打开，以及运行卡片和媒体卡片的本次实际 Workflow JSON 下载入口。
  - 用户明确 Skill 选择属于 DeepSeek Harness 原生交互；计划执行者删除静态原型中的项目级 Skill 按钮、菜单、选择状态和消息内预选标记，并把方案中的交互所有者统一为 DeepSeek Harness。
  - 用户明确数据源系统的 LoRA 会话流程不得迁入当前系统；计划执行者把“LoRA 对比”改为普通“画风参数对比”Session，并明确任意获得 `generate_with_comfyui` Tool 权限的普通 Skill 都能直接创建运行。
  - 用户指出原型的正常会话只显示完成结果；计划执行者把队列等待、ComfyUI 执行、媒体保存和提交结果未知四个运行绑定到默认 `turn_portrait_03`，失败运行绑定到普通画风参数对比 Session。
  - 用户指出页面存在没有交互的控件和含义不清的轮次标签；计划执行者删除“新建会话”与“会话选项”死控件，并把轮次按钮和右列来源改为完整任务摘要与明确查看动作。
  - 独立语义审核队员发现失败/未知卡片的伪创建按钮、无媒体源的原生播放控件、固定 Tool 详情和错误筛选空态；计划执行者删除直接提交按钮和无效播放控件，并增加独立筛选空态。
  - 用户明确底模只作为筛选条件；计划执行者把底模移出上下文资源、草稿标签和历史快照，并在上下文选择器顶部增加独立筛选器。
  - 用户明确 Tool 调用详情由 DeepSeek Harness 轨迹功能负责；计划执行者删除右列 Tool 详情标签、固定 Tool 名称和结构化结果复制交互。
  - 用户要求媒体结果改为会话级媒体库；计划执行者把“本会话结果”改为固定尺寸媒体网格，并增加聊天轮次、媒体种类、保存时间筛选和独立分页。
  - 用户要求跨会话浏览媒体；计划执行者在静态原型左侧增加“所有媒体”入口及按会话、轮次、类型、时间筛选的全局媒体库；当前正式接口固定为项目`sidebar` occupant直接渲染入口并使用Harness `Modal`。
  - 用户要求每个媒体能够打开原文件并下载所属 Workflow；计划执行者为共用媒体卡片增加原文件新窗口链接和“下载本次 Workflow JSON（可导入 ComfyUI）”按钮，同时保持 API Workflow JSON 不在页面下载。
  - 用户要求左侧新增所有 ComfyUI 异步任务入口；计划执行者只读取得数据源登记实例并实际确认两个实例均支持 `GET /api/jobs`，`win3080` 支持单 Job 查询和幂等 `POST /api/jobs/{prompt_id}/cancel`。
  - 计划执行者把原型任务观察契约从旧 `/queue` 与 `/history` 组合修正为 `GET /api/jobs/{prompt_id}`，并实现按会话、聊天轮次、创建时间筛选、每页五项、排队与运行中任务取消、取消确认、“正在取消”与“已取消”状态同步。
  - 独立语义审核队员发现方案的`CatalogRef`仍允许底模进入`ContextSnapshot`；计划执行者增加排除`base-model`的`ContextKind`与`ContextRef`，并把`GenerationCatalog.resolve()`和项目Context resolver收窄到该类型。
  - 独立语义审核队员发现 `submission_unknown` fixture、Jobs API 404 状态映射和方案状态机不一致；计划执行者把 `/prompt` 未确认、首次 Job 404 和持续 Job 404 分别收敛为 `submission_unknown`、保持远端状态和 `failed / COMFYUI_JOB_MISSING`，并把 `ComfyuiTransport` 接口统一为 `getJob()` 与 `cancelJob()`。
  - 独立语义审核队员完成页面文案、领域主体和多轮运行关系验收；审核发现的问题已经全部修改。
- Files created/modified:
  - `task_plan.md`（更新）
  - `progress.md`（更新）
  - `findings.md`（更新）
  - `prototype-scheme.md`（更新）
  - `prototype/generation-workbench/index.html`（新建）
  - `prototype/generation-workbench/styles.css`（新建）
  - `prototype/generation-workbench/app.js`（新建）
  - `prototype/generation-workbench/fixtures/workflow-fixtures.mjs`（新建）
  - `prototype/generation-workbench/fixtures/generated-portrait.svg`（新建）
  - `prototype/generation-workbench/fixtures/video-poster.svg`（新建）
  - `prototype/generation-workbench/tests/prototype-contract.test.mjs`（新建）
  - `prototype/generation-workbench/README.md`（新建）

### Phase 7: 确认正式实现边界
- **Status:** in_progress
- Actions taken:
  - 用户确认一个权威 OpenAPI schema 投影 Catalog discovery/CLI 与 Source discovery/CLI；两个表面复用稳定 ID、revision、共用 schema 和错误结构。
  - 用户确认本版本不认证调用 Source Operation 的其他本机进程。Harness 只通过注册边界确保 Source Operation 不进入 Agent Tool、Skill Tool 或浏览器 RPC；数据源 operation 保持只读。
  - 用户确认本版本不处理用户选择模板后到 Generation Tool Call 前发生模板 revision 更新的并发情形。Host 在 Tool 调用中读取当前模板 bundle，并把该次返回结果保存为运行来源快照。
  - 用户确认生成选项允许显式选择安全 ComfyUI 实例 ID；未选择时 Host 使用配置默认实例，明确选择的实例不可用时不切换。
  - 用户确认当前 Harness 安装使用一个 SQLite 保存包含 `workspace_id`、`session_id`、Harness 数字 `turn`、Harness `call_id` 和 `run_id` 的运行元数据，并按 Workspace 与 Run 分区保存文件。
  - 用户确认 Catalog discovery 与 Source discovery 返回相同的 `contract_id` 和 `contract_version`；Host adapter 只接受配置声明支持的组合。
  - 用户确认异步运行状态不复制进 Harness Session 日志。Session 只保存原生 Generation Tool Call 与包含 `run_id` 的 Tool Result；Run Repository 保存权威状态。后续 rc.7 公共接口审核确认自定义 forwarded event 不可用，因此浏览器改用项目 unary Typert Remote条件轮询。
- Files created/modified:
  - `CONTEXT.md`（更新）
  - `docs/adr/0003-message-context-excludes-execution-routing.md`（更新）
  - `docs/adr/0007-one-source-contract-with-two-read-surfaces.md`（更新）
  - `docs/adr/0008-one-sqlite-and-workspace-run-directories.md`（新建）
  - `docs/adr/0009-source-contract-version-gate.md`（新建）
  - `docs/adr/0010-run-repository-is-the-status-authority.md`（新建）
  - `prototype-scheme.md`（更新）
  - `findings.md`（更新）
  - `task_plan.md`（更新）
  - `progress.md`（更新）

## Test Results
| Phase 27 Catalog 模板清点 | 数据源 Catalog CLI 全量查询 | 取得全部可用模板、参数类型和节点结构 | 36 个模板、6 类流程、5 类运行参数、2 个已登记实例 | PASS |
| Phase 27 全模板真实编译矩阵 | 36 个模板 × 2 个实例的真实 Source 与 `/object_info` | 每个模板至少在一个实例编译或返回具体缺失节点 | mac mini 27/36、win3080 29/36；全部 36 个模板至少有一个可编译实例 | PASS |
| Phase 27 跨实例路径回归测试 | 模板与实例 COMBO 使用相反路径分隔符 | API Workflow 使用目标实例精确枚举；非唯一匹配保持原值 | 9 项 Workflow compiler 测试和 TypeScript 检查通过 | PASS |
| Phase 27 模板 37 真实路径复验 | 同一模板分别编译到 mac mini 和 win3080 | macOS 使用 `/`，Windows 使用 `\` | 两个 API Workflow 的 `lora_name` 均与对应实例枚举精确相等 | PASS |
| Phase 26 初始复现 | 模板 ID 37 的真实 Source CLI TemplateBundle | 缺少 `widgets_values` 的连接型节点能够进入实例编译阶段 | Host 返回 `SOURCE_PROTOCOL_ERROR / Template Workflow node 6 is invalid.`，且没有 `prompt_id` | FAIL |
| Phase 26 错误投影检查 | 生产 Run Repository 与 `GenerationRemoteService.list()` | 右侧能够取得具体 `errorMessage` | SQLite 保存具体错误，Remote 投影明确删除 `errorMessage` | FAIL |
| Phase 26 真实实例端到端基线 | 当前测试套件 | 至少一次真实模板、真实实例、真实媒体完整运行 | 现有成功生命周期只使用 mock transport 或 mock fetch | FAIL |
| Phase 26 五项回归测试 | `pnpm exec vitest run` 执行 5 个目标测试文件 | 5 个用户症状在修复前稳定失败 | 43 项通过、5 项分别按预期失败 | RED |
| Phase 26 目标绿测 | 8 个相关单元测试文件 | 最小模板上下文、模板 ID Tool、合法节点、完整实例错误和错误详情全部通过 | 62/62 通过 | PASS |
| Phase 26 完整质量门禁 | `pnpm run quality` | 依赖审计、边界、类型、覆盖率、合同、安全、生产和原型全部通过 | unit/integration 190、contract/security 18、production 14、prototype 27；functions 100% | PASS |
| Phase 26 生产重启 | `pnpm run prod:restart/status/health` | 最新 Host、Client 与 Skill 在 4173 运行 | PID 47650；process、sourceRuntime、harnessWeb、clientBundle、runRepository、savedMedia 全部通过 | PASS |
| Phase 26 最小模板上下文 | Harness 原生上下文选择器选择模板 37 | 输入框只包含模板 ID 和标题 | 精确得到 `comfyui-template/id/title` JSON；原生 `/` 菜单显示 `comfyui-generate` | PASS |
| Phase 26 真实实例错误详情 | 模板 37 默认值提交到 `mac mini` | Host 到达实例并显示实例具体错误 | `run_782452dd-bc13-463f-bc1d-88525229b4f3` 返回 `COMFYUI_PROMPT_REJECTED`；Modal 完整显示 LoRA `value_not_in_list` 的 `node_errors` | PASS |
| Phase 26 真实实例完整生成 | 模板 37、真实提示词、实例实际 LoRA 路径 | 完成解析、编译、提交、观察、下载、分片保存和右栏展示 | `run_df5e56e4-57b1-4011-b03f-c366ae957727` 成功；保存 1 张 1024×1344 PNG；右栏显示图片和逐媒体 Workflow 下载图标 | PASS |
| Phase 26 独立语义复审修复 | prompt ID 不一致、Resolver Tool 输出合同、错误详情标签、12,000 字符错误 | 每个值的用途清晰且实例错误保持完整 | 4 个回归分支全部通过；复审没有剩余问题 | PASS |
| Phase 26 最终完整质量门禁 | `pnpm run quality` | 全部代码、合同、安全、生产和原型门禁通过 | unit/integration 191、contract/security 18、production 14、prototype 27；functions 100% | PASS |
| Phase 26 最终生产与浏览器复验 | `prod:restart/status/health` 与真实失败 Run Modal | 最新 Client 显示错误标签和完整实例正文 | PID 93087；六项健康检查通过；真实 `COMFYUI_PROMPT_REJECTED` Modal 完整显示运行 ID、错误码和 `node_errors` | PASS |
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| 目标目录检查 | `ls -la` 与 `git status` | 确认目录状态且不修改文件 | 目录为空且不是 Git 仓库 | PASS |
| 来源仓库工作树检查 | 两个来源仓库的 `git status --short --branch` | 识别用户文件并保持只读 | 两个来源仓库都有用户未提交修改 | PASS |
| 静态原型结构测试 | `node --test prototype/generation-workbench/tests/*.test.mjs` | 全部分支与结构契约通过 | 27/27 通过 | PASS |
| 现有 ComfyUI Jobs API | 只读请求两个登记实例的 `/system_stats` 与 `/api/jobs` | 取得现有版本和分页 Job 响应 | `mac mini` 0.28.3、`win3080` 0.33.1；两个实例均返回 `jobs + pagination` | PASS |
| 单 Job 查询与取消路由 | 查询 `win3080` 的已完成 Job，调用单 Job cancel 后回读 | 取消路由存在；终态请求为幂等 no-op | cancel 返回 HTTP 200、`cancelled=false`；回读仍为 `completed` | PASS |
| 控件与轮次语义 | 页面加载、选择三个静态聊天轮次 | 没有死控件；轮次按钮说明任务、动作和运行数量 | 删除 `+` 与 `…`；显示本轮任务摘要和“查看 N 项 ComfyUI 运行” | PASS |
| 底模筛选边界 | 打开上下文选择器并切换底模 | 底模筛选候选项但不进入草稿或历史上下文 | 底模只显示在独立筛选栏；上下文资源和快照不包含底模 | PASS |
| Harness 轨迹所有权 | 检查右列标签和聊天 Tool 调用 | 右列不复制 Tool 详情；聊天 Tool 调用仍可定位结果 | 右列只保留当前轮次与本会话结果 | PASS |
| 静态媒体预览 | 打开视频 Session | 没有不可用的原生播放按钮；视频和音频类型仍可辨认 | 显示视频封面与音频波形静态预览 | PASS |
| 会话媒体库 | 打开视频 Session 的“本会话结果” | 固定两列多行卡片、每页四个、可按轮次/类型/时间筛选 | 第一页 2 列 × 2 行，第二页显示视频和音频 | PASS |
| 全局媒体库 | 点击左侧“所有媒体”并选择视频 Session 和视频类型 | 居中弹层按会话联动轮次，并筛选跨会话媒体 | 轮次选项收敛为视频 Session 的一轮，媒体数量由 8 变为 6，再变为 1 | PASS |
| 全局异步任务列表 | 点击左侧“所有 ComfyUI 异步任务”并选择视频 Session | 居中弹层按会话联动聊天轮次并筛选任务 | 全部会话显示 8 项和 2 页；视频 Session 收敛为 1 个聊天轮次和 1 项任务 | PASS |
| 动态聊天任务投影 | 发送一条新消息并在 Agent 静态流式输出完成后打开全局任务列表 | 新聊天轮次创建的任务进入全局列表；列表计数增加；任务按真实时间戳倒序显示 | 任务数量由 8 增至 9；新任务显示在第一页首行；本仓库状态和 ComfyUI Job 原始状态均为已完成 | PASS |
| 提交超时与 Job 缺失边界 | 检查 `/prompt` 未确认、首次 Job 404、持续 Job 404 三个结构化 fixture | 三条路径分别具有唯一的本仓库状态、错误码、取消能力和自动重提规则 | 分别映射为 `submission_unknown`、保持远端状态、`failed / COMFYUI_JOB_MISSING`；三条路径都不自动重提 | PASS |
| 静态原型窄窗口演示（不进入产品范围） | 在 635px 宽窗口查看第一页并切换下一页 | 仅记录原型已有演示；产品Issues不实现或验收该布局 | 该原型行为不构成产品验收要求 | EXCLUDED |
| 运行中任务取消 | 点击“取消运行中任务”并确认 | 显示目标 `run_id`、`prompt_id`、实例和 Jobs API；状态从正在取消收敛为已取消 | 700ms 静态状态转换完成，Job 状态为 `cancelled`，取消按钮消失，右列同一运行同步更新 | PASS |
| 任务弹层模态行为 | 打开任务列表并按 Esc | 使用顶层模态并在关闭后把焦点返回入口 | `#task-library-dialog:modal` 数量为 1；Esc 后入口恢复 active | PASS |
| 媒体原文件与 Workflow | 点击视频媒体主体并检查媒体卡片按钮 | 原文件在新窗口打开；按钮下载所属运行的本次实际 Workflow JSON | 新标签页打开 `demo-video.mp4`；每张媒体卡片显示“下载本次 Workflow JSON（可导入 ComfyUI）” | PASS |
| 默认中间态 | 直接打开 `?state=success` | 不操作底部切换器即可看到排队、执行中、保存媒体和提交未知 | `turn_portrait_03` 同时显示四个状态卡片 | PASS |
| 普通 Skill/Session 边界 | 打开画风参数对比 Session | 不存在专用 LoRA Session；普通轮次显示成功和失败运行 | `session=comparison` 的 `turn_comparison_01` 显示两个运行 | PASS |
| Skill 交互所有权 | 页面加载并发送一条新消息 | 页面不包含项目级 Skill 选择交互；消息和运行仍正常创建 | 没有 Skill 按钮、菜单、选择状态或预选文案；消息创建独立 `turn_id/run_id` | PASS |
| 多运行定位 | 普通画风参数对比轮次点击失败运行的“定位结果” | 当前聊天轮次的两个运行仍显示 | 成功运行与失败运行同时保留，失败卡片获得定位高亮 | PASS |
| 连续发送 | 在角色 Session 连续发送两条消息 | 两个聊天轮次分别拥有独立 Agent 输出和 `run_id` | 创建 `turn_portrait_live_1/2` 与 `run_DEMO_PORTRAIT_001/002` | PASS |
| Session 往返恢复 | 角色 Session 新增两轮后切换视频 Session 再返回 | 新轮次、运行、计数和会话汇总保持 | 角色 Session 保留四个轮次与三个运行 | PASS |
| 来源 Harness production audit | `pnpm audit --prod --registry=https://registry.npmjs.org --json` | 复现规格中的 high advisory 基线 | 0 critical、12 high、12 moderate、1 low | PASS |
| 当前项目完整依赖审计 | `pnpm audit --json` | critical/high 至少为 0；记录全部严重级别 | 591 个依赖，critical/high/moderate/low 全部为 0 | PASS |
| 当前项目 production 依赖审计 | `pnpm audit --prod --json` | critical/high 至少为 0；记录全部严重级别 | 475 个依赖，critical/high/moderate/low 全部为 0 | PASS |
| Frozen lockfile-only | `pnpm install --lockfile-only --ignore-scripts --frozen-lockfile` | lockfile 与 manifest/override 一致且不创建 `node_modules` | 通过 supply-chain policy；没有 `node_modules` | PASS |
| Advisory 修复后原型回归 | `node --test prototype/generation-workbench/tests/*.test.mjs` | 原有静态原型测试不受依赖配置影响 | 27/27 通过 | PASS |
| 工作区差异格式 | `git diff --check` | 没有空白错误 | 无输出 | PASS |

## Error Log
| 2026-08-25 | Catalog CLI 已支持 `resolve --id`，但当前 Host 没有对应 Agent Tool；消息上下文因 Skill 缺少查询入口而携带模板参数全集 | 1 | Phase 26 将新增只返回安全参数摘要的模板解析 Tool，并删除模板上下文中的参数数组。 |
| 2026-08-25 | Generation Service 回归 fixture 改成终态 `failed` 后仍沿用旧的 `hasActiveRuns: true` 断言 | 1 | 把该断言修正为终态运行应返回 `hasActiveRuns: false`，不改变产品实现。 |
| 2026-08-25 | `pnpm run typecheck` 首次发现 Catalog Tool readonly 输出与 Schema 推导不一致，并发现测试直接索引可选 `widgets_values` | 1 | Tool 输出边界复制数组；测试先检查 `widgets_values` 是否为数组。 |
| 2026-08-25 | `pnpm run quality` 首次执行的 189 项测试通过，但函数覆盖率 99.52% 未达到 100% 门槛 | 1 | 增加 Catalog Tool renderer 和错误弹窗底部关闭回调的交互断言。 |
| 2026-08-25 | 第二次 `pnpm run quality` 在类型检查发现测试中的通用 Tool 结果仍为 `unknown` | 2 | renderer 断言在调用边界把已经验证的结果收窄为其 JSON 输出类型。 |
| 2026-08-25 | 第三次 `pnpm run quality` 的函数覆盖率为 99.76%，未覆盖错误 Modal 的原生 `onClose` 回调 | 3 | 错误详情交互测试同时执行 footer 关闭和原生 Modal 关闭。 |
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-08-20 | 当前目标目录不是 Git 仓库 | 1 | 本轮不创建提交或分支；用户确认方案后确定初始化方式。 |
| 2026-08-20 | 默认 pnpm registry 的 audit endpoint 不存在 | 1 | `registry.npmmirror.com` 返回 `ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`；后续审计命令只对当前调用显式使用 `https://registry.npmjs.org`，不修改全局或仓库配置。 |
| 2026-08-20 | `pnpm why` 不支持 `--lockfile-only` | 1 | 停止重复调用；使用 `pnpm list <package> --lockfile-only --depth Infinity --parseable` 和 lockfile 查询验证依赖路径。 |
| 2026-08-20 | `pnpm run` 在缺少 `node_modules` 时触发依赖准备 | 1 | `strict-dep-builds` 在执行任何 build script 前失败；把 464 MB 生成目录移入系统废纸篓，后续 pre-install 门禁直接调用 `pnpm audit`，测试直接调用 `node --test`。 |
| 2026-08-21 | zsh 把 `packages/*/*/src/index.ts` 当作当前仓库 glob 并在 `git grep` 前报错 | 1 | 后续只向 `git grep` 传递明确目录或引用后的 pathspec；本次第二个只读查询仍正常返回 Tool presentation 证据。 |

### Phase 8: 逐项处理 high dependency advisory
- **Status:** completed
- Actions taken:
  - 读取当前计划、已发布规格和依赖安全门禁；在生成当前项目 lockfile 前没有安装依赖。
  - 保持原 DeepSeek Harness 仓库只读，并记录其提交、lockfile 摘要和用户未提交文件。
  - 使用官方 npm registry 对来源 DeepSeek Harness monorepo 重新执行完整与 `--prod` audit；来源完整闭包为 15 high，来源 production 闭包为 12 high。
  - 把 12 条 production audit 条目归并为 7 个受影响包版本和对应修复版本，并逐条记录当前项目处理结论。
  - 创建精确直接依赖 manifest、官方 registry 配置、七个受影响版本 override 和 lockfile；lockfile-only 解析没有执行依赖脚本。
  - 当前项目完整闭包与 production 闭包的 audit 均为 critical/high/moderate/low 全部 0。
  - `pnpm run` 的意外依赖准备发现五个未审计 build-script 包；所有脚本在 Phase 9 审核完成前保持拒绝状态。

### Phase 9: 审核 dependency build script 并完成正式依赖安装
- **Status:** completed
- Actions taken:
  - 从官方 npm registry 下载五个精确版本 tarball，并在隔离临时目录中验证路径、registry integrity、文件清单、安装命令和本地调用链；下载与检查阶段没有执行 lifecycle script。
  - 第一版 `allowBuilds` 决定错误地把四个依赖包标记为拒绝；用户指出 build-script 安全审核不得变成安装行为裁剪。
  - 计划执行者撤销四个拒绝决定，并在 `allowBuilds` 中明确允许五个已经完成安全审计的精确版本。
  - 计划执行者运行此前未执行的四个 lifecycle script，并再次执行 frozen install，验证五个依赖包保留完整安装行为。
  - 完整依赖与 production 依赖 audit 均为 0 critical、0 high、0 moderate、0 low；原型测试 27/27 通过。

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 9 已完成：dependency advisory、build-script 和 frozen install 门禁全部通过。 |
| Where am I going? | 按 Issue #1 实现正式 Harness bundle、Host plugin、Client plugin、Run Repository 和完整交付流程。 |
| What's the goal? | 在精确项目依赖闭包和失败关闭的 build-script 策略上实现 DeepSeek Harness ComfyUI 工作台。 |
| What have I learned? | 来源 monorepo 的 production audit 数量不能代表当前项目 closure；当前项目只实际包含修复后的 `js-yaml`、`nanoid` 和 `postcss`，其他受影响包不在 closure 中。 |
| What have I done? | 已创建精确 manifest、七个安全 override、五个精确 build-script 允许决定和两份标准化安全报告；完成完整 lifecycle、frozen install、full/prod audit 和 26 项原型回归验证。 |

### Phase 10: 审核 Harness 核心零改动与公共插件接口闭包
- **Status:** completed
- Actions taken:
  - 用户要求在执行 Issues 前确认全部 UI 与功能只能通过 DeepSeek Harness 公共插件机制实现。
  - 计划编写者确认现有父 Issue、Ticket 01 调研表和 PRD 02 只有部分边界，尚未把核心零改动和逐票公开接口写入每张 GitHub Issue。
  - 计划编写者开始从指定 Harness commit 的已提交文件核对全部公开插件接口；本轮不读取来源仓库未提交修改作为证据。
  - 重新审计后，Message Context chip由项目Workbench的临时`ContextRef[]`呈现；用户确认Modal后一次性加入所选引用，发送时由项目Context resolver解析，并通过一次公开`SessionFace.prompt()`提交。
  - 计划编写者读取 GitHub Issues #1–#15 的当前清单和本地父 Issue；现有正文尚未把每张产品 Issue 的精确 Harness public seam 与 seam 缺失时的停止条件写成硬门禁。
  - 计划编写者确认项目生成的 Typert Remote 必须由项目 Client plugin 调用公开 `ctx.remote.$mount()`；rc.7 的固定 `dsh-api-remotes` Client assembly 不会自动加入项目 namespace，也不需要修改。
  - 计划编写者确认 `dsh-client-modules`、Tools、Jobs、Skill、Host web route、Workspace registry 和 Typert loader 均有可用的 rc.7 package public export，并把每张票使用的接口直接写入ADR、PRD、父Issue与子Issue。
  - 计划编写者确认Prompt Skills可由产品安装程序复制到release-local`DSH_HOME/skills`，由rc.7现有filesystem provider发现；项目Workbench通过公开SkillsApi显示候选，Host继续负责调用校验。
  - 计划编写者新增ADR 0012，并在Issues #2–#15正文中分别写明所属产品功能允许使用的public interface。
  - 计划编写者更新领域词汇、ADR 0010、原型方案和计划记录，把不可实现的自定义 Run 事件统一替换为项目 Typert Remote条件轮询。
  - 计划编写者为 PRD 01–14 逐份增加所属 Ticket 的精确 Harness public interfaces、实现主体、核心零改动约束和验收对象；PRD 03 明确多 chip的逐 render public CAS，PRD 12 明确 release-local `DSH_HOME/skills`，PRD 13 明确 artifact NO-GO 门禁。
  - 计划编写者在 Ticket draft 中增加全局核心零改动门禁、Ticket 01 完整 public seam调研表和 Tickets 01–14 各自的接口段落；旧 Run Change Notification 实现跨度已替换为项目 Remote条件轮询。
  - 后续复审推翻了项目root方案：`ui-input-trigger`的原生MenuView只注册到ConversationRoot声明的`conversation.input.overlay`，项目必须保留AppFrame root与ConversationRoot，并替换公开列occupant和conversation occupant。
  - 计划编写者把`skills/comfyui-generate/`的artifact、release-local`DSH_HOME/skills`安装、filesystem provider发现、SkillsApi候选与Host校验责任写入Ticket 04、PRD 04、Ticket 01 package allowlist和Release Artifact验收。
  - 最终composition保留AppFrame与ConversationRoot；项目通过公开`sidebar`、`details`、`conversation.session.header`、`conversation.view`的`chat` occupant和`conversation.composer.bar`呈现桌面产品内容，并从公开ConversationSnapshot读取Session消息、Agent partial与Tool projection。
  - 计划编写者确认临时ContextRef列表不会单独持久化，并把持久化格式冻结为同一条Harness`user/message` text content末尾的`generation-context.v1` blocks。
  - 独立审核队员最初只证明默认InputBar的私有附件ID不能由priority-shadow composer复用；重新审计确认项目Workbench可以把浏览器File直接编码为公开image`PromptContentPart`，再通过一次`SessionFace.prompt()`交给Host attachment store。
  - 计划编写者撤销Issues #3、#4和#6的错误阻塞结论；三个Issue正文均明确现有public plugin mechanisms可以实现对应产品功能。
  - 计划编写者同步远端 Issues #1–#15；逐票文本比较确认远端正文与本地冻结稿完全一致，父子关系和 `blocked by` 集合未变。
  - 27项原型合同测试和`git diff --check`通过；指定Harness checkout仍在commit`99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，本轮没有写入该checkout。
  - Phase 10独立复核只验证了默认InputBar附件对象生命周期，仍错误接受了Issues #3、#4和#6的阻塞结论；Phase 11以公开root与`SessionFace.prompt()`完整插件组合证据取代该结论。

### Phase 11: 纠正默认UI限制被误判为插件阻塞
- **Status:** in_progress
- Actions taken:
  - 用户明确Harness源码必须持续与上游同步且不得分叉；项目可以使用上游公开插件机制替换上游随附UI插件。
  - 重新审计确认此前只检查了默认AppFrame和默认ConversationController附件registry，错误地把默认UI实现不能扩展或复用写成公共插件机制不能实现。
  - 用户确认项目UI可以通过公开核心契约读取Session、Agent、Skill和Tool权威数据并渲染自己的1:1界面。
  - 用户确认项目采用公开`root` single slot的优先级occupant；默认AppFrame保留为非winner和自动fallback，不使用全屏overlay或Harness DOM改写。
  - 原型与产品需求只规定composer可见结构和发送行为，没有规定项目必须拥有或修改Harness composer状态；计划编写者开始删除自行增加的状态所有权与默认InputBar唯一路径约束。
  - 计划编写者已经修正PRD 02、PRD 03、PRD 05和PRD 13：项目通过公开`root` single slot渲染Workbench，保留`ui-conversation`的标准projection，临时正文、ContextRef和浏览器File通过一次原生`SessionFace.prompt()`提交；Issues #3、#4和#6不再存在已确认public seam阻塞。
  - 计划编写者已经同步修正父Issue、本地Tickets 01–13及PRD 04、06、09、10、12：所有后续UI区域改为项目Workbench子slot，Tool行读取公开ConversationSnapshot，Skill候选读取公开SkillsApi，Ticket 13在任一产品Issue仍有未解决public plugin seam阻塞时判定NO-GO。
  - 计划编写者删除draft总则与过程记录中残留的Issues #3/#4/#6阻塞结论和`details` priority-shadow方案；项目只使用公开root Workbench及其五个项目child slots。
  - 计划编写者把Issue #9的抽象“原生消息输入”接口收窄为公开`SessionFace.prompt(parts, 'queue')`与Harness AgentLoop产生的新Tool Call，并同步远端父Issue #1。
  - 远端Issues #1–#15均无默认InputBar、composer-state、DraftAttachmentId或私有attachment facade要求；#3/#4/#6均为`ready-for-agent`，native parent/blockedBy图保持不变。
  - 用户明确移动端不属于产品需求；桌面验收只使用`1440×1000`并核对原型三列顺序与列宽关系，不再要求九个viewport、移动端导航、窄屏single-panel或原型CSS断点。
  - Harness接口责任保留在各Issue正文与对应PRD；`check:harness-boundary`直接检查manifest、lockfile、Cordis YAML和源码import。

### Phase 12: 补全Prompt、LoRA调整与ComfyUI生成Skills的可执行迁移方案
- **Status:** in_progress
- Actions taken:
  - 用户指出Ticket 12只有迁移目标、打包位置和最终验收，没有计划执行者能够直接落地的Skill内部改动。
  - 计划编写者只读核对固定revision中的两个Skill目录，确认Anima依赖来源Prompt包装对象，WAI输入合同包含旧调用标识字段，两个Skill依赖`run_skill_script`与`finalize_skill_error`且都没有调用`generate_with_comfyui`。
  - 用户指出父Issue遗漏来源系统`management-skills/lora-adjustment/`迁移。计划编写者已确认该Skill负责根据原始生图需求、当前提示词、有序LoRA快照、权重范围和LoRA节点类型返回调整后的提示词、MODEL/CLIP权重与实际触发词；迁移必须保留该产品能力，但不迁入旧`run_skill_script`错误/校验流程。
  - 计划编写者在当前浏览器重新打开静态原型并确认三列事实：左列是Session，中列显示Agent消息与`generate_with_comfyui` Tool Call，右侧第三列显示该Tool Result的`run_id`运行卡片；Prompt与LoRA调整结果属于中列，只有独立`comfyui-generate`调用Generation Tool后右列才新增结果。
  - 计划编写者把PRD 12改为三个真实迁移Skill：`anima-prompt-builder`、`wai-sdxl-prompt-builder`、`lora-adjustment`；固定来源为`NoobAI-XL-FZ-PROD-ENV@799b7759029d70076791321e2b02bf53c651c98f`，并明确移除旧Pi、旧调用标识字段、`run_skill_script`和finalizer协议。
  - 计划编写者补全PRD 04中的独立`comfyui-generate`合同：它只在用户显式选择后把当前消息、模板参数定义、可选LoRA调整结果和Execution Route转换为一次`generate_with_comfyui`调用；Prompt与LoRA调整Skill不再调用Generation Tool。Tool输入增加与当前消息LoRA快照逐项匹配的`lora_applications[]`。
  - 计划编写者只读复核固定来源Skill、本地PRD/Ticket草稿和GitHub Issues #1、#2、#4、#5、#6、#13。当前文档已确定CLI位于Harness Tool之后，但Catalog Tool的统一注册合同仍缺少逐Tool schema、description、CLI映射、错误映射、生命周期和授权验收；本轮没有修改PRD或GitHub Issue。
  - 计划编写者确认Message Context正式包含九类可插入资源；Ticket 03负责Workflow模板与角色，Ticket 05负责生成模型、LoRA、作品、画师或画风、提示词条目、画师串和Saved Media。底模只用于筛选，ComfyUI实例只用于Execution Route。

### Phase 13: 删除移动端范围并核对桌面列宽
- **Status:** in_progress
- Actions taken:
  - 用户明确本版本没有移动端布局需求。计划编写者把本地父Issue、Tickets 02–14与对应PRD统一为单一`1440×1000`桌面验收，并同步GitHub Issues #1–#15。
  - 远端Issues #1–#15正文与本地父Issue/Ticket来源逐项相等；原型合同测试27项通过，`git diff --check`通过。
  - 进一步核对确认原型在`1440px`下的三列约为`294 / 714 / 432`，而rc.7 AppFrame默认是`280 / 800 / 360`；公开`ctx.layout`没有设置像素宽度的方法。
  - 替换AppFrame root会失去ConversationRoot对`conversation.input.overlay`的render授权，因而无法呈现现有`ui-input-trigger` MenuView。桌面精确初始列宽与“不实现第二套Skill菜单”当前不能同时满足，等待用户决定是否接受AppFrame默认宽度这一可见例外。
  - 计划编写者补全`generation-route.v1`消息控制block以及LoRA/Workflow模板安全快照字段；显式实例与Message Context通过同一次`SessionFace.prompt(parts,'queue')`写入原生用户消息，但实例不计入Context/chip。
  - 计划编写者重写方案第9节：四个Skill处于同一Harness Skill层；两个Prompt Skill和`lora-adjustment`的结果只显示在中列，`comfyui-generate`的Tool Call显示在中列，其`run_id`运行卡片只显示在右侧第三列。
  - 计划编写者同步PRD 01、PRD 13、PRD索引、CONTEXT、父Issue草稿和Ticket 04/05/12/13草稿；Release Artifact的Skill allowlist现在固定为四个目录，原型空态文案也明确Prompt/LoRA结果在中列、生成结果在右列。
- 计划编写者将Ticket 12视为当前不可直接执行，开始核对Harness rc.7实际Skill加载与Tool能力；本阶段不新增规划文件。

### Phase 14: 正式采用源数据仓库 v0.82.2 envelope
- **Status:** completed
- Actions taken:
  - 用户选择正式采用源数据仓库 v0.82.2 的 raw-passthrough envelope，不再要求源 CLI 输出旧的顶层 `contract_id`、`contract_version`、`source_release_version` wrapper。
  - 已冻结实施边界：Harness Installation 通过 `source.sourceReleaseVersion: "0.82.2"` 固定版本，live discovery/响应字段由 Harness-owned 结构化合同和 adapter 校验。
  - 已开始同步 CONTEXT、ADR、配置、PRD、父 Issue、Tickets 和 GitHub 正文；源数据仓库保持只读。
  - 已将 `scripts/deploy/preflight.mjs` 与 `scripts/deploy/health.mjs` 的 discovery gate 改为 v0.82.2 Catalog 裸 OpenAPI / Source 成功 envelope，并将 Installation pin 改为 `sourceReleaseVersion: "0.82.2"`。
  - 已更新部署与 composition 测试夹具为两种真实 discovery shape；配置、工程基线和 frozen artifact allowlist 已包含 `config/source-contract-v0.82.2.json`。
  - 验证通过：`CI=1 pnpm exec vitest run tests/unit/config-loader.test.ts tests/contract/engineering-baseline.test.ts tests/deploy/preflight-cli.test.ts tests/deploy/health-cli.test.ts --maxWorkers=1 --no-file-parallelism`（4 files / 77 tests）。完整 `tests/deploy` 另有 5 个既有 artifact 生命周期测试因 rc.7/rc.8 fixture peer 依赖冲突失败，未归因于 v0.82.2 gate。
  - 追加验证通过：`CI=1 pnpm run test:contract`（9 files / 103 tests）。
# 2026-08-21 Skill 调用到三列异步状态链路

- 已确认 Harness 用户显式 Skill 调用会持久写入 `source.kind: "skill-invocation"` 与 Skill 名称；AgentLoop 产生的 `tool/call` 和 `tool/result` 使用同一 `callId`。
- 已确认 `defineTool().output.presentationMeta()` 可把结构化 `run_id` 链接持久到公开 `ToolResultNode.meta`，项目无需解析 Agent 文案。
- 原型中列已显示队列等待、远程运行、保存媒体、提交结果未知和终态；规划将补全一个项目 Client Run 投影 Store，让中列 Tool 行和右列运行卡读取同一 `GenerationRunSnapshot`。
## 2026-08-21 Skill→Tool→中列/右列异步投影合同补全

- `generate_with_comfyui` Host adapter现在被规格要求在创建Run前核对同一数字`turn`中的`comfyui-generate`原生Skill Invocation；缺失时返回`GENERATION_SKILL_INVOCATION_REQUIRED`，不创建Run、不持久映射、不调用`/prompt`。
- Tool Result通过`defineTool().output.presentationMeta()`持久`harness-comfyui-generation-run` v1与`run_id`；右列只从公开`ToolResultNode.meta`建立Run链接，不解析Skill文本、Agent文本、Tool标题或Tool Result文字。
- 中列Generation Tool行与右列运行卡统一读取`GenerationRunProjectionStore`的同一快照；页面可见且任一处观察非终态Run时继续刷新，两处同时可见时共享一个计时器和每周期一次Remote查询。
- 已同步本地PRD 04、PRD 12、PRD 13、原型方案、父Issue草稿与Tickets 04、06、07、12、13草稿；下一步同步已创建的GitHub Issues并完成独立语义复审。

## 2026-08-21 Catalog Tool与迁移Skill合同补全

- 一次试图同时修改五份PRD的大补丁因`01-engineering-baseline.md`上下文不匹配而整体未应用；后续改为逐文件小补丁，避免误判部分内容已经写入。
- 计划编写者创建`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`，把10个Catalog operation、2个Host-only Source operation、两个CLI、源仓库测试和版本发布交给数据源仓库自己的Issue实施；当前仓库没有修改或运行数据源仓库。
- 计划编写者在PRD 01/03/04/05/12、PRD索引、CONTEXT、原型方案、父Issue和Tickets 01/03/04/05/12中补全唯一Tool registry、逐Tool合同、CLI映射、Skill逐文件迁移、真实Tool黑盒测试和上下文左侧九行责任。
- 计划编写者同步GitHub Issues #1、#2、#4、#5、#6和#13；#4移除`ready-for-agent`并增加`needs-info`，等待数据源仓库发布commit/tag、contract version、两个CLI与release acceptance。

## 2026-08-22 Source Data Catalog设计访谈

- 用户确认Q1、Q2、Q3和Q7采用建议：计划状态保持`design-review`；实施基线固定为已提交revision `c7c92fc677bf45a16c2bbee518935ba19bb6166f`；新Catalog使用`GET /internal/catalog`和十个`/internal/catalog/*` operation并保留旧semantic协议；发布版本字段命名为`source_release_version`。
- 用户确认源仓库只负责OpenAPI、handler和CLI合同；目标Harness如何注册Tool、授权Skill和选择Execution Route不属于源仓库实施计划。
- 用户确认不增加Catalog数据库谱系ID，也不固定上游ComfyUI commit。计划继续使用数据库正整数主键的十进制字符串作为Catalog ID，并继续支持`SaveAudioAdvanced`。
- 实施文档已经从Harness仓库移动到`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`；Harness仓库中的依赖文档引用该新位置。
- 独立语义复审确认Q1、Q2、Q3和Q7的核心决定已写入。复审指出的五处投影遗漏已经修正：十个Catalog operation表、`ComfyuiTemplateBundle`契约身份、Catalog item发布版本、`ContextSnapshot`发布版本和旧六operation实施事实。
- 源仓库和Harness仓库本轮允许文件的`git diff --check`均通过。
- 用户把实施基线更新为`2a8e0db`并说明`v0.81.0`已经push和发布。只读核对确认`main`与`origin/main`均位于完整revision `2a8e0dbc6b21bf28550f29dbfc68f2692fcabd2a`，远端带注释标签`v0.81.0`解引用到同一commit，`package.json`版本为`0.81.0`。
- `v0.81.0`正式范围是六类向量对象、迁移036、管理增量向量维护和两个旧`/internal/semantic/*` CLI-only查询；该版本没有实现本计划的新`/internal/catalog`、Host-only Source discovery或`imagegen-comfyui-source-read`。
- 计划和Harness依赖文档已经把源代码实施基线改为`2a8e0dbc6b21bf28550f29dbfc68f2692fcabd2a`，并把两个CLI-only operation名称修正为`querySemanticGenerationLorasForCli`与`querySemanticArtistPromptStringsForCli`。
- 用户确认Q9至Q11采用建议：本计划发布版本固定为`v0.82.0`；格式合法但不存在的`base_model_id`或`work_id`返回`422 CATALOG_REQUEST_INVALID`；search的`total_count`按查询和筛选后、分页前的完整记录数计算，超出末页时返回空`items`和不变的真实总数。
- 用户纠正Q12至Q14越过CLI交付范围。计划编写者撤销三个问题及其建议：源仓库不修改runtime input candidate、runtime config保存流程或数据库迁移；不因旧参数缺少额外约束而要求管理员重新保存模板；Catalog与Source CLI只投影实例的`enabled`和`validated`，不替目标仓库筛选实例或决定Execution Route。
- 范围复查继续删除源实施文档中的目标仓库消费步骤、模板binding执行语义和`template-run-admission.mjs`修改要求。Source CLI只从当前Workflow revision与runtime config逐字段构造并验证`TemplateBundle`；缺少必要当前记录时只返回CLI合同中的`SOURCE_TEMPLATE_UNAVAILABLE`。
- 用户推翻此前Q3的独立Catalog namespace决定。`v0.82.0`直接用十个新Catalog operation替换`GET /internal/semantic`及六个旧operation；计划不创建`/internal/catalog`，也不保留旧semantic request、response或Pi Tool扩展。源计划、ADR、Harness原型和PRD路径已经同步为`/internal/semantic/*`。
- 用户确认原方案要求的两个CLI继续保留：`imagegen-semantic-query`只提供十类安全Catalog投影，`imagegen-comfyui-source-read`只提供Host-only实例源数据和完整模板bundle；不合并为一个命令。

## 2026-08-24 Harness 原生 UI 原型重做

- 已确认任务模式为 change，修改边界限定为现有静态原型、必要测试与任务记录。
- 已读取 `prototype`、`find-docs`、`planning-with-files` 和 `stop-that-shit` 的完整指令，并创建 Phase 15 的实施与验收边界。
- 下一步只读核对官方页面、锁定 Harness 源码与 GitHub Issues #3/#4，再修改原型。
- 已只读取得 GitHub Issues #3/#4 的完整正文、评论、标签与关闭状态；两张票最后的用户结论都明确要求废弃原型能力假设并重新设计。
- 已取得官方页面 HTML 与本机 Harness 源码搜索结果；已排除替换整个 `sidebar` 的旧设计，并定位 `sidebar.footer.action` 作为左列原生入口候选。
- 已用 `dsh-v0.1.0-rc.8` 标签源码确认三项可实现的原生机制：`sidebar.footer.action`、`conversation.input.dock` 和 `conversation.view`；同时确认原生 InputBar 必须保留。
- 用户把原型能力基线改为 DeepSeek Harness `0.1.1-rc.2`；后续调研与修改改用 rc.2 已提交源码，当前项目依赖保持不变。
- 已确认 rc.2 保留原生左栏、会话视图和输入扩展点，但没有公开跨插件 conversation-view 导航方法；左栏点击进入工作台必须选择另一条可证明的公开组合路径。
- 已排除用 priority覆盖原生 `conversation.view#chat`的方案；当前可实现方向收敛为左栏入口打开普通 Product Agent Session，中列完全复用原生聊天与输入界面。
- 用户授权直接实现并运行 Harness plugin；计划已增加 rc.2依赖审计、真实插件实现、完整测试、生产启动和浏览器验证阶段。
- 已检查当前工作树并确认旧工作台删除属于既有未提交改动；实施将基于空 Client plugin新增最小rc.2原生slot原型，不恢复或改写这些删除。
- 已确认rc.2原生reference插入与公开UI primitives足以实现上下文原型；20个精确rc.2直接包的发布、integrity、peerDependency和直接lifecycle script初审通过，等待lockfile闭包审计。
- 已生成rc.2 lockfile并通过manifest、full/prod advisory和build-script门禁；完整与production闭包全部严重级别为0，可以执行frozen install。
- 已执行`pnpm install --frozen-lockfile`；只运行了已审计的`dsh-subprocess-local@0.1.1-rc.2` postinstall，当前直接Harness依赖全部为精确`0.1.1-rc.2`。
- 已实现真实Client插件：左栏入口使用`sidebar.footer.action`与原生Button；中列扩展使用`conversation.input.dock`、原生Button/Pill/Modal与原生SessionInput reference insertion，不替换Harness布局、Session浏览、Chat或InputBar。
- 已新增插件注册、工作台状态、reference codec、原生surface和插入事务测试；`pnpm typecheck`与3个定向测试文件共11项测试通过。
- 已删除产品界面中的实现说明文案；入口只显示“ComfyUI 工作台”，对话框操作只显示“取消/插入”，错误只显示当前结果。
- 已修正生产health对rc.2 `globalThis["__DSH_BOOT__"]`启动图语法的读取，真实生产进程六项health通过。
- 已在1440×1000真实Harness页面完成入口、工作区Session、上下文对话框、原生reference插入与已选上下文展示验收；浏览器没有error或warn日志。
- 最终`pnpm quality`通过：coverage 7 files/60 tests、contract/security 7 files/17 tests、production 15 tests、prototype 27 tests全部通过；`git diff --check`通过。验证进程已停止，`prod:status`为stopped。
## Phase 16：真实上下文目录弹窗

- 已确认生产配置中的真实目录 CLI 路径、数据源契约 ID 和数据源发布版本。
- 已确认当前插件缺少 Host 目录查询接口，Client 仍需移除静态目录选项。
- 下一步：核对数据源 CLI 的实际参数与 JSON 响应，再按 Harness `0.1.1-rc.2` 公共 Remote API 实现 Host 查询和 Client 原生弹窗。
- 已核对真实 CLI 版本、十个 operation、参数和退出码；弹窗本次接入八个可插入的 CLI 目录类型。
- 已确认数据源工作树为 `v0.82.4`，当前仓库结构化契约仍固定 `v0.82.2`；实现将按 live discovery 和当前仓库契约共同校验可用操作。
- 已定位本机 Harness 源码工作树和当前项目安装的 `0.1.1-rc.2` 包，下一步直接核对已安装包与同版本标签。
- 已确认 `0.1.1-rc.2` 公共 Remote 实现路径：Host Remote 服务、生成 `/remote` 产物、Client `$mount()` 和卸载 disposer；无需新增网络层或第三方依赖。
- 已确认当前项目构建尚未生成业务 `/remote`；正在核对生成产物结构和最小 Host-first 构建接入点。
- 已检查 rc.2 生成的 Remote contribution 与 Host contribution；下一步核对协议公开的源码 JSON fallback，选择不引入新依赖的最小实现。
- 已确认可使用公开 Host SRC descriptor与严格 Client contribution组合；已把同版本 Harness Typert protocol直接依赖和安全审计纳入Phase 16计划。
- 已确认真实目录服务监听端口和CLI强制端口要求；将把端口加入当前仓库唯一生产配置链路，而不是让Host读取外部仓库配置。
- 已通过真实CLI读取八类路径级合同和真实响应；已确定每类标签字段、稳定ID归一化与安全投影，且确认画师串当前为空集合。
- 已核对现有 Client、测试和原生 Input API；准备先实现结构化目录合同、Host CLI adapter与Remote service，再替换弹窗。
- 已完成结构化目录合同、严格Client Remote contribution、Host Remote Service、CLI安全执行器与生产Catalog端口配置链路。
- 已直接声明官方Harness Typert protocol `0.1.1-rc.2`，并在离线且禁用脚本模式下更新lockfile。
- 已替换Client静态选项弹窗，完成Remote挂载、原生搜索、资源左列、真实候选单选和插入交互。
- 首次typecheck已执行；生产代码只剩原生Input不支持ref的类型错误，旧测试夹具需要迁移到真实Catalog item与查询器。
- 已移除原生Input不支持的ref并迁移现有Client、Host和配置测试；当前`pnpm typecheck`通过。
- 定向测试首次运行27/28通过；正在修正一条旧label断言，并补齐生产fixture和受管快照的Catalog端口。
- 已补齐生产受管快照Catalog端口和三组Catalog测试；当前定向结果48/49通过，仅剩一条旧显示label断言。
- 全量unit发现1条预期迁移断言；prod:test发现Node strip-only不支持constructor parameter property。正在改写为源码可直接加载的普通字段和公开Remote函数登记。
- 已完成strip-only兼容改写并更新Client bundle合同测试；TypeScript、79项unit和15项production测试全部通过。
- 首次完整质量门禁在函数覆盖率100%要求处停止；83项测试均通过，正在补齐新函数分支测试，不修改覆盖率阈值。
- 已把coverage测试增至90项；函数覆盖率恢复100%，coverage门禁通过。
- 完整`pnpm quality`已经通过；下一步重启真实4173 Harness并用真实CLI记录完成浏览器验收。
- 已按项目生产命令重启Harness；当前进程PID为85876，`prod:status`为running，六项`prod:health`全部通过。
- 已选用Codex内置浏览器验收本机页面；根据本地Web验收规则，生产构建变更后必须重新导航或刷新并获取新的DOM快照。
- 已创建独立浏览器标签页并导航到4173；浏览器操作通过标签页的`playwright`表面读取DOM和执行语义定位。
- 已在真实Harness点击左栏“ComfyUI 工作台”；原生会话视图未被替换，中列输入区显示“插入上下文”。
- 首次打开真实目录弹窗显示“目录加载失败。”；CLI文件具有执行权限，使用与Host相同参数直接运行可返回15个生成模型，浏览器控制台无error或warn，问题已收敛到Harness Remote调用链。
- 用户指出当前弹窗偏离已确认原型；实施范围已恢复为顶部底模下拉框、左侧资源类型和右侧封面标题卡片，并恢复原原型的分页与多项选择交互。
- 已核对原原型实现：候选区每页6项，候选卡片固定包含封面或占位、标题、副标题和选中状态；底模下拉框位于弹窗内容顶部。
- 已确认Harness `0.1.1-rc.2`公开`Menu` primitive可实现顶部底模下拉框；该实现方式与Harness语言选择等原生下拉交互一致。
- 已通过live discovery和真实CLI确认底模操作`/internal/semantic/base-models`已实现；当前真实底模为krea2、wai、anima，支持筛选生成模型、LoRA、画师或画风、画师串和Workflow模板。
- 已核对当前Remote注册与Harness Typert源码：`TypertRemoteService`构造函数公开注册Cordis service，手动执行`Remote()` initializer会把search方法登记到同一公开source-mode discovery。
- 已核对Gateway实际分派流程：source-mode从活动Cordis service收集Remote标记，按`request`和末位`signal`构造弱Host描述，再由Client严格描述校验输入与结果。
- 已确认Harness原生Modal通过`className`开放对话框卡片尺寸覆盖，能够在不替换Modal遮罩、标题、关闭、Escape和footer交互的前提下承载原原型三列候选卡片。
- 已读取八类真实首项字段；卡片标题、封面和副标题将分别由CLI字段直接投影，不向Client透传描述、Prompt、Workflow JSON或其他Host字段。
- 已完成第一版合同与UI改写：真实底模Remote、6项分页、可选底模过滤、封面/标题/副标题卡片、多选状态和批量插入均已进入源码；当前TypeScript失败仅来自旧测试夹具尚未迁移。
- 已迁移合同、CLI、Remote、Client注册、Controller和原生surface测试；TypeScript通过，7个定向测试文件共51项全部通过。
- 已核对卡片CSS使用的Harness主题变量并替换不存在的变量名；选中边框、选中标记底色和前景色全部使用rc.2已定义的原生主题token。
- 完整质量门禁中100项测试全部通过；门禁仅因新增原生surface的3个回调函数尚未被测试执行而停止，未降低100%函数覆盖率阈值。
- 已补测Menu关闭和上一页两个外层/内层回调；完整`pnpm quality`通过，100项coverage测试函数覆盖率100%，17项contract/security、15项production和27项prototype全部通过。
- 已用正式`prod:restart`重启新实现；当前Harness PID为12302，4173状态为running，六项生产health全部通过。
- 浏览器确认新卡片弹窗布局已加载，但底模与Workflow模板两条Remote同时失败；正在读取Gateway返回的结构化错误码。
- 已读取真实运行异常：`cannot get property "remote.harnessComfyuiCatalog" without inject`。Client必须在`$mount()`之后通过Cordis动态inject获取新Remote namespace。
- 已把Client注册移动到`$mount()`后的动态Remote scope；生产源码TypeScript通过，现只需把Client插件测试替身补成Cordis动态inject生命周期。
- 已补齐动态inject测试替身和卸载顺序；最终完整`pnpm quality`再次通过，100项coverage测试函数覆盖率100%。
- 已重启并在真实Harness验证Remote修复：Workflow模板第1页从真实CLI加载6张卡片，总计6页，卡片标题、副标题、选择状态和分页均正常。
- 已验证顶部底模Menu实际返回krea2、wai、anima；选择wai并切换LoRA后，真实CLI返回8项、2页，首屏6张卡片均成功加载封面与作者副标题。
- 已在真实Harness选择两个LoRA卡片；两张卡片同时显示“已选择”和pressed状态，底部计数为2。搜索Age后结果缩为唯一真实LoRA，跨搜索保留2项选择。
- 2026-08-24：在真实Harness中完成上下文目录终验：wai底模筛选、LoRA资源切换、`Age`搜索、跨搜索多选、2项批量插入、Workflow模板下一页、画师串空结果和取消交互全部通过。
- 2026-08-24：`pnpm quality`通过；最终`pnpm prod:status`返回running，`pnpm prod:health`六项通过，`git diff --check`通过。Harness继续运行在`http://127.0.0.1:4173`。
## 2026-08-24：Phase 17

- 已确认用户要求的 Agent 上下文 JSON 字段范围：可理解的来源名称字段、`prompt_text`、`id`、`tag`，并且每条 JSON 必须自描述上下文用途和数据类型。
- 已完成 Harness 严格 JSON Schema 能力复核。
- 正在核对数据源 CLI 的真实路径参数和各数据类型字段映射。
- 已从本地 CLI 注册表确认八个目录的精确 `--path` 参数，正在读取每类首条真实记录。
- 已读取八类目录的真实 CLI 首页响应，并确认名称字段按领域原名保留：`file_name`、`name`、`title`；角色和画风的 `prompt_text` 原值保留，提示词条目的 `canonical_tag` 以语义明确的 `tag` 写入 Agent JSON。
- 正在核对空数据目录 `artist-prompt-strings` 的本地服务契约。
- 已定位当前问题根因：`serializeWorkbenchContext` 直接序列化 UI `CatalogItem`，导致展示字段进入 Agent JSON，同时丢失源响应的 `prompt_text` 和 `tag`。
- 下一步将新增按 `kind` 区分的严格 Agent 上下文联合类型，并让卡片仅携带该严格上下文供确认写入。
- 已确认空画师串目录的响应构建字段；准备开始修改契约、CLI 投影、输入框序列化和测试。
- 已确定实现结构：`CatalogContext` 使用八个严格分支，`CatalogItem.context` 是卡片与输入框之间的唯一身份来源，序列化只写入 `CatalogContext`。
- 已根据用户的角色实例补充角色上下文契约：`work_name`、`character_name`、`id`、`prompt_text`。
- 已完成第一轮代码修改：新增八分支 `CatalogContext`，把角色的 `works.name` 和 `name` 分别投影为 `work_name` 与 `character_name`，输入框序列化不再使用 UI `CatalogItem`。
- 已更新契约、CLI、控制器和原生弹窗的单元测试夹具，并增加角色 JSON 不含 `label`、`subtitle`、`coverUrl` 的回归断言。
- 相关 57 个单元测试已通过，覆盖八类 CLI 投影、严格上下文分支、输入框序列化、取消选择和原生弹窗交互。
- 首轮完整 `pnpm quality` 已执行；安全审计、Harness 边界和 TypeScript 检查通过，覆盖率阶段因一个旧 Remote 测试夹具失败而停止。
- `git diff --check` 已通过。
- 已更新 Remote 严格结果解析测试的旧 UI 项目夹具，准备重新执行完整质量门禁。
- 完整 `pnpm quality` 已通过：单元/集成 113、契约/安全 17、生产 15、原型 27；类型检查、安全审计、Harness 边界检查全部通过。
- 准备重启 Harness 生产实例并验证真实角色和提示词条目 JSON。
- Harness 生产实例已在 `http://127.0.0.1:4173` 重启，正在连接现有应用内浏览器标签执行真实交互验收。
- 已复用现有 Harness 应用内浏览器标签和原生输入框定位器，准备刷新生产页面并执行角色上下文选择。
- 已把验收视口设置为 1440×1000，并确认 Harness 页面可访问；正在刷新页面和清理重启前保留的旧草稿 JSON。
- 页面脚本上下文不允许调用 `location.reload()`；已切换为浏览器可见键盘刷新操作，不修改应用状态以外的数据。
- Harness 页面已通过浏览器快捷键刷新；旧草稿由 Harness 会话持久化恢复，正在通过原生输入框清空该旧值后开始新输出验收。
- 已清空旧草稿并打开 ComfyUI 工作台，准备进入原生上下文弹窗选择真实角色。
- 已确认工作台处于选中状态；正在用原生键盘操作删除 Harness 自动恢复的旧草稿。
- 旧草稿已通过原生全选删除操作清空，输入框当前为空；准备打开上下文弹窗选择角色。
- 原生上下文弹窗已打开；九宫格首屏显示 9 个真实 Workflow 模板，准备切换到角色目录并搜索 `2b`。
- 已切换到角色目录；页面同时存在会话搜索框和弹窗搜索框，已将弹窗定位器收紧为精确 `aria-label="搜索"`。
- 已向真实角色 CLI 数据源提交 `2b` 搜索，正在检查返回卡片与作品名。
- 已核对角色 ID 39933 的真实 CLI 记录，并确定弹窗检索词 `2B 尼尔机械纪元` 可把该角色返回到首屏。
- 已在原生弹窗提交 `2B 尼尔机械纪元`，准备选择作品副标题为 `尼尔机械纪元` 的 `2b` 卡片。
- 弹窗首屏已显示 9 张真实角色卡片；已选择带真实封面的 `2b`，卡片展示作品名 `尼尔机械纪元`。
- 已在真实 Harness 输入框验证角色 JSON：作品名、角色名、ID、`prompt_text` 均与 CLI 记录一致，UI 展示字段均未写入。
- 正在验证提示词条目的 `tag` 分支。
- 已再次打开原生上下文弹窗并切换到提示词条目目录，准备检索真实 `canonical_tag`。
- 已提交 `ryuujin_no_senpai` 提示词条目搜索，正在检查返回卡片和 `tag` 写入结果。
- 弹窗返回 5 个真实提示词条目；已选择 `ryuujin_no_senpai`，准备确认写入。
- 已在真实 Harness 输入框验证提示词条目 JSON 包含 `kind`、`id`、`tag`，并与角色 JSON 并列写入；输入框没有 UI 展示字段。
- 已读取原生输入框实际 `value` 完成字段级验收：`prompt_text=true`、`tag=true`、`label=false`、`subtitle=false`、`coverUrl=false`。
- 正在执行最终生产状态、健康检查和工作树差异检查。
- 最终生产状态和六项健康检查已通过，`git diff --check` 已通过。
- Phase 17 已完成；Harness 保持运行并停留在角色与提示词条目均已选中的产品状态。
## 2026-08-24：Phase 18

- 已读取 `find-docs`、`prototype`、`frontend-design` 和 `planning-with-files` 指令。
- 已完成会话恢复检查；没有需要补同步的上轮上下文。
- 已建立 Skill 加载和静态右侧抽屉实施计划，正在调研 Harness `0.1.1-rc.2` Skill 发现合同与旧原型右侧列。
- 已确认仓库内三个 Skill 目录，并定位旧原型右列的结果、媒体筛选、运行状态和分页交互。
- 已确认右侧抽屉必须建立在 Harness 公开 `details` 扩展位上；正在核对 `0.1.1-rc.2` 的精确 API 和 Skill 根目录配置。
- 已确认斜杠 Skill 查询携带活动 `sessionId`，正在继续核对 Session header 的工作目录传递和文件系统 Skill provider 的运行配置。
- 已确认右侧抽屉通过 Harness `layout.openDetails()/closeDetails()` 控制原生 `details` 列。
- 已确认 base bundle 包含文件系统 Skill provider，无需新增依赖。
- 正在核对当前 Session header 是否携带仓库工作目录；该值决定 `.agents/skills` 默认根目录是否参与发现。
- 已从 base Cordis patch 确认 Host Skill 服务与文件系统 provider 均已启用。
- 已确认生产 Session header 正确携带当前仓库绝对工作目录；正在直接核对 filesystem provider 的扫描结果和 Skill 文件校验结果。
- 已确认三个项目 Skill 的名称、描述与目录结构符合 `0.1.1-rc.2` 文件系统 provider 的发现合同。
- 已确认 Web 端斜杠 Skill 插件已启用；正在核对当前 Session 所用 Agent preset 是否包含 `skill-filesystem` 行及 Skill API 是否选择该 preset scope。
- 已确认用户 Agent preset 目录为空；下一步核对 Web bundle 的随附 preset 配置。
- 已确认默认 `standard` preset 已加载 `skill-filesystem`；下一步通过运行中的浏览器 RPC 直接检查斜杠菜单与 Skill API 返回值。
- 已恢复与运行中 Harness 标签页的浏览器连接。
- 已定位 Skill 缺失根因：当前 Session 使用 Harness 随附“极简模式”，该 preset 没有装载 Skill provider 或 Skill tool。
- 已确认现有中间工作台仍处于可用状态；斜杠菜单诊断没有提交消息。
- 已在运行页面复现 `/wai` 不显示 Skill；诊断完成后已恢复原上下文 JSON 草稿。
- 已检查当前 Client 插件和旧右侧列实现；决定复用旧信息架构，但使用 Harness 原生 `details` 抽屉，不恢复旧自建三列 shell。
- 已确认本次无需安装依赖；正在设计项目 Agent preset 的 source-production materialization 和右侧抽屉组件测试。
- 已选择更小且符合 Harness 架构的 Skill 修复：在项目 profile patch 中重新启用 rc.2 已有的全局 `skill-filesystem` 与 `tool-skill`，不创建第二套菜单或自定义 Agent preset。
- 已从旧原型确认右列需实现双标签、当前轮次运行卡片、三项媒体筛选、两列媒体卡片和独立分页；本阶段全部由静态结构化夹具驱动。
- 已确认原生 details 列自带初始关闭、Session 切换关闭、拖动宽度和窄屏自动收缩行为；项目只负责 occupant 与打开/关闭动作。
- 已确认 details 是 Session 作用域单槽位；正在实现项目唯一 occupant、关闭按钮和静态筛选状态。
- 已确认项目 occupant 使用 priority -10 覆盖上游通用详情面板，插件卸载时上游面板可自动恢复。
- 已确认 Skill 修复只需修改 source profile patch 和相应安全边界/production 断言，不需要新增运行时复制逻辑。
- 已完成 Skill profile patch、原生 details occupant、静态运行/媒体夹具、筛选与分页实现。
- TypeScript 检查通过；5 个定向测试文件共 23 项测试通过。
- 正在收敛右列 CSS token 到当前项目已经验证使用的 Harness 主题变量。
- 完整门禁运行到覆盖率阶段；117 项测试通过，当前唯一失败是函数覆盖率未达到仓库 100% 阈值，正在补齐新增交互分支测试。
- 已补齐全部新增交互回调测试，函数覆盖率恢复为 100%。
- 完整质量门禁通过；下一步重启生产 Harness 并执行真实浏览器验收。
- 生产 Harness 已在 127.0.0.1:4173 健康运行，真实页面已经渲染新的右侧结果 occupant。
- 正在浏览器验证抽屉关闭/入口重开、Session 媒体标签、筛选分页和项目 Skill 斜杠菜单。
- 已通过真实浏览器验证左侧入口可以同时打开中间工作台和右侧原生 details 抽屉。
- 已切换到已有 Session 继续验证；未连接 Hero 不显示 details 是 Harness 原生布局规则，不是插件失败。
- 真实三列截图发现运行卡片受原生 Button 固定高度影响而重叠；正在修复该视觉缺陷后重新验收。
- 已应用运行卡片自适应高度修复，正在重新设置视口并复查完整截图。
- 已提高卡片高度规则的作用域优先级，等待 HMR 页面稳定后重新获取完整截图。
- 完整截图仍未通过；正在读取原生 Button 的实际计算样式与发布 CSS。
- 已定位 primitives 原始规则为 `.md { height: 36px; }`；正在检查生产页面的计算样式和最新样式表加载状态。
- 已确认可通过应用内浏览器只读读取 computed style；下一步核对生产页面卡片实际高度来源。
- 已确认页面仍在使用上一次生产构建的旧 CSS。现在重新构建并重启受管 Harness，再复查任务卡片和完整抽屉。
- 生产 Harness 已重启并通过健康检查；正在刷新原浏览器页面以载入新 bundle。
- 任务卡片固定高度问题已修复；正在处理 1440px 视口中右侧抽屉被推到可视区外的问题。
- 已排除横向溢出：页面刷新后 details 按 Harness 原生状态关闭。现已通过左侧入口和中间按钮重新打开，继续做展开态截图验收。
- 当前轮次卡片和本会话媒体两种抽屉布局均已通过 1440×1000 实际截图验收；继续验证分页、筛选、收起/展开与 Skill 菜单。
- 抽屉第二页与媒体种类原生菜单已通过真实交互验收；继续验证筛选结果、收起/重开和 `/` Skill 菜单。
- 视频筛选、抽屉收起和中间按钮重新展开已通过真实交互验收；现在验证 `.agents/skills` 的原生 `/` 菜单。
- 旧会话输入 `/` 未显示 Skill menu，草稿已清空。正在核对物化后的 provider 配置、运行日志和新会话行为，定位是会话固定状态还是配置缺口。
- 源 patch 与运行时物化 patch 已确认一致；继续检查完整 composition 与会话作用域。
- 已确认原生 Skill 的 server/tool/client 组件均已锁定在 rc.2 且 profile 合成顺序正确；下一步验证新会话与 provider 发现路径。
- 已再次用 rc.2 bundle 源码确认 host provider 方案受支持；现在创建重启后的本地验证会话，检查原生 `/` 菜单是否读取新 catalog。
- 新会话草稿保持原样，原生命令按钮只显示命令项；正在读取 rc.2 `ui-skill` 与 filesystem provider 实现，确定 Skill 候选所需的准确会话/工作区条件。
- rc.2 Skill 相关发布包已定位，继续读取 UI 触发和 provider 根目录逻辑。
- 已确认 `.agents/skills` 是 rc.2 的原生默认项目根目录；继续检查 `skills.list` Remote 如何从 sessionId 解析 cwd/scope。
- 已确认 `/` 的前端触发与预期一致；正在定位 `skills.list` 返回空的服务端原因。
- `skill.list` Remote 的具体发布包已定位，正在检查 handler 如何取得会话 cwd 和 agent scope。
- 已定位 `dsh-host-apiproxy` 的 skills handler；继续读取 live session/preset 覆盖分支。
- 已确定历史会话可能被 preset-scoped 空 Skills registry 覆盖；正在检查实际持久化 preset 配置。
- 已确认工作区 cwd 正确且无用户级 preset 文件；继续定位系统 preset composition，并直接请求现有会话的 `skill.list` 结果。
- 已取得现有会话 ID 和 Skills API wire format；现在直接读取各会话 catalog。
- 当前 attached 会话的 Skills API 已确认返回项目三个 Skill。正在用浏览器实际打开 `/` 候选，并保证原 JSON 草稿逐字恢复。
- `.agents/skills` 的服务端 catalog 和原生 `/` 菜单均已通过实际 Harness 验证，原 JSON 草稿已逐字恢复。下一步完成最终测试、状态检查和浏览器交付标记。
- 最终完整质量门禁已通过。正在执行生产 status/health、最终三列截图和浏览器交付标记。
- 新会话下 details 初始为关闭状态；正在通过中间原生按钮重新展开，再生成最终三列截图。
- 已确认中间按钮本来就是幂等 open 动作；空白新会话 hero 是 Harness 原生不展示 details。正在切回已有对话轮次的 Session 生成最终三列截图。
- connected Session 的最终三列截图已通过；正在确认输入编辑器清空后的内部 DOM 不保留可提交 slash 草稿。
- `/` 验证草稿已从 connected Session 完全清除；最终 textarea 的 value/defaultValue 均为空。继续执行生产健康检查和最终交付标记。
- Phase 18 已完成：项目 Skill 的原生 `/` 菜单、右侧静态抽屉、完整质量门禁、生产健康检查和 1440×1000 浏览器验收全部通过。Harness 保持运行在 `http://127.0.0.1:4173/`。
- 根据用户现场反馈再次核对默认 1280×720 页面，三列布局和右侧抽屉均处于展开态；Harness 无需再次重启，运行页已重新聚焦。
- 用户截图确认新会话页面仍缺少右侧列。Phase 19 已开始：计划执行者将分别验证新会话和已连接 Session，不再用已连接 Session 代替用户当前页面验收。
- Phase 19 已加载调试、Harness 文档检索、原型、文件计划和浏览器验收规范；session catchup 未报告遗漏状态。下一步先建立新会话页面的红色浏览器检查。
- 第一次自动化检查命中了错误状态（已连接 Session），没有复现用户截图；已停止使用该结果。下一步从“新建会话”按钮进入 hero 并重新建立红色检查。
- 已稳定进入“探索未至之境”新会话 hero，并复现右侧列宽度为 0。现在将该路径固化为红色检查，再进入原因假设与 Harness rc.2 插槽调研。
- 已从官方文档确认 `dsh-skill-filesystem.customSkillDirs` 和原生 `details` slot；正在检查当前 source profile 是否安装 Skill provider、是否包含默认项目根，以及 Client 可用的 `ctx.layout` 方法。
- 已定位 Skill 未加载的首要配置缺口：source profile 没有把源码仓库 `.agents/skills` 加入运行中的 Skill provider 根目录。
- 已冻结静态右抽屉第一版信息架构：当前轮次结果、本会话结果、媒体筛选、运行状态卡片、媒体卡片和分页；不显示未接后端的任务取消与下载操作。
- 已确认原生 Skill 与右栏依赖均已安装；下一步从生成配置、运行日志和 Skill frontmatter 确认未发现原因。
- 已确认三份 Skill 的必填 frontmatter 合法，且没有关闭用户调用；正在检查生成 Cordis 树和生产进程 cwd。
- 已确认生产 cwd 是仓库根，默认 Skill 根理论上正确；正在沿原生 `/` UI → Skills API → provider `list(cwd)` 链路定位缺失。
- 已确认右侧列可直接复用 Harness 原生 details 几何、拖动和自动关闭行为，无需自建窗口级抽屉系统。
## 2026-08-24 Phase 19

- 已纠正验证对象：用户当前位于“新会话”首页，之前看到三列的是已有会话 `Modify code`，不能作为当前页面的验收证据。
- 已建立可重复的浏览器失败检查 `checkNewSessionDrawer`。连续两次点击“生成结果”后均得到 `drawerWidth: 0` 和 `grid: 280px 1000px 0px`。
- 下一步：核对 Harness `0.1.1-rc.2` 的 AppFrame 和公开插件挂载点，为未建立会话的首页选择可实现的右侧抽屉机制。
- 已读取仓库领域上下文和“ Harness core is immutable” ADR；确认本次只允许修改项目 Client 插件。
- 已确认本机 Context7 CLI 可用，将先用它查询公开文档，再用本机 `0.1.1-rc.2` 安装包源码核对精确行为。
- 已通过 Context7 定位 DeepSeek Harness 官方文档库 `/deepseek-ai/deepseek-harness`。
- 官方文档已证伪“调用被生命周期重置”的主要方向并确认最可能根因：`details` 是 Session scope，新会话无 Session 时原生轨道宽度为零。
- 已定位公开的 root scope `shell.overlay` 候选，下一步核对本机 rc.2 安装包并为该挂载点先写失败测试。
- 已核对根依赖与 lockfile，确认当前运行和类型检查使用 rc.2 Client 包，不会引用本机 Harness 源码工作树。
- 已用 rc.2 发布包 README 确认 `details=0` 是 Harness 对未选择 Session 状态的设计行为，不是插件按钮故障。
- 已发现官方 master 文档与 rc.2 发布包存在 slot 差异；下一步只以 rc.2 类型声明和构建产物为实现权威。
- 已在 rc.2 类型声明与 `lib/client.js` 中确认 `shell.overlay` 是可用的公开 root-scope list slot。
- 已确定修复路径：新会话使用 `shell.overlay` 右侧抽屉；已有 Session 继续使用原生 `details`，两者共享同一个结果内容组件和开关状态。
- 已检查现有控制器、Client 注册、结果组件和测试；准备先增加控制器结果状态与 Hero overlay 的失败测试，再实现最小改动。
- 已完成 red 阶段：`workbench-controller`、`results-drawer`、`client-plugin` 的新增检查均在对应缺口处失败，既有 11 项检查继续通过。
- 下一步：实现控制器结果状态、rc.2 `shell.overlay` 注册和 Hero 右侧抽屉样式，然后重跑同一组测试。
- 已完成 green 阶段实现；相同三份目标测试现为 16/16 通过。
- 下一步：执行类型检查和相关边界测试，重启生产 Harness，然后在用户截图对应的新会话首页运行浏览器检查。
- `pnpm run typecheck` 已通过。
- `pnpm check:harness-boundary` 首次运行准确拦截了新增的非许可 Harness specifier；正在改为 `@deepseek-ai/dsh-client-runtime/client` 的公开类型导出后重跑门禁。
- 已移除非许可 specifier。`pnpm run typecheck`、`pnpm check:harness-boundary` 和三份目标测试全部通过。
- 下一步：重启生产 Harness，并运行新会话首页的确定性浏览器检查。
- 已执行 `pnpm prod:restart`；Harness 已重新提供 `http://127.0.0.1:4173/`，生产进程保持运行。
- 已重新连接现有 in-app browser 标签并确认目标 URL 未变，准备刷新加载新 Client bundle。
- 已刷新浏览器标签；首次读取页面时误把标签对象当作 locator 主体，刷新本身已完成。已确认该标签的页面查询入口是持久化的 `harnessTab.playwright`。
- 修复后的首次检查未找到“生成结果”，原因是刷新后工作台入口恢复为未激活，并非 overlay 失败。下一轮检查会先激活左侧“ComfyUI 工作台”。
- 已确认刷新后的真实初始几何：Hero 可见、工作台未激活、overlay 不存在、details 轨道为零。下一步点击工作台入口并测量 overlay 实际宽度。
- 新会话页面第一项浏览器验收已通过：点击“ComfyUI 工作台”后右侧抽屉宽度为 361px，标题、关闭按钮、两个 tab 和静态运行卡片均可见。
- 已截取修复后的新会话三列页面。下一步验证关闭和中间“生成结果”重新打开，再验证已连接 Session 仍使用原生 details。
- 新会话的关闭和重新打开交互已通过浏览器验收；输入框 JSON 未被结果抽屉交互修改。
- 下一步：进入已有 `Modify code` Session，确认 overlay 不重复呈现且原生 details 列仍为 360px。
- 已有 Session 浏览器验收通过：只显示原生 360px details 列，未重复显示 root overlay。
- 下一步：运行全量质量门禁、生产状态与健康检查，并执行最终 git diff 检查。
- 全量质量门禁已通过：unit/integration 120、contract/security 17、production 15、prototype 27。
- 生产 Harness 运行于 `http://127.0.0.1:4173/`，PID 77911；所有健康检查阶段通过。
- `git diff --check` 已通过。Phase 19 完成。
- 验证标签已停留在“新会话”三列状态：Workbench dock 可见、工作台激活、右侧“生成结果”抽屉宽度 361px。
## 2026-08-24 Phase 20

- 已建立 Phase 20 计划，范围限定为右侧抽屉的 Workflow JSON 图标下载入口。
- 已定位原原型下载入口、Actual Workflow 约束、文件名合同和 rc.2 原生下载图标。
- 下一步：查询官方 Button/icon 用法并核对原原型 fixture 与下载处理器，然后先写失败测试。
- 已确认下载入口位置为右侧抽屉 header；新会话 overlay 与 Session details 共用该 header，因此一次实现覆盖两种布局。
- 下一步：核对 rc.2 Button/Tooltip 精确属性与原原型浏览器下载实现，随后编写失败测试。
- 已确认 rc.2 原生实现方案：`Tooltip` 包裹 `Button size="sm" variant="toolbar" icon={<IconDownloadOutline16 />}`，按钮只保留图标并使用“下载 Workflow”作为可访问名称。
- 已确认浏览器下载实现沿用原原型的 Blob/object URL/临时 anchor 流程，文件名遵守既有 `comfyui-run-<run_id>-workflow.json` 合同。
- 下一步：选择静态成功运行的 UI Workflow fixture，并先写下载内容与图标交互失败测试。
- 已重新读取 Phase 20 计划并确认改动范围；现有用户工作树改动保持不动。
- 已确定测试范围：Workflow JSON 结构与文件名、Blob 下载生命周期、原生图标/tooltip、overlay 与 details 共用按钮。
- 已添加 `workflow-download.test.ts` 与结果 header 图标测试；修复前目标检查按预期失败。
- 下一步：新增静态 UI Workflow 唯一数据源和浏览器下载函数，再接入原生 Tooltip/Button/Icon。
- 已新增静态 Actual Workflow、确定性 JSON 序列化、Blob 下载函数和 header 原生图标按钮。
- Workflow 下载测试 2/2 已通过；正在修正 icon-only Button 的测试断言后重跑结果抽屉测试。
- Harness 边界门禁通过。目标运行中的剩余失败来自测试断言和 mock 类型，正在修正后重跑类型检查。
- 目标测试现为 8/8 通过；`pnpm run typecheck` 与 `pnpm check:harness-boundary` 均通过。
- 下一步：重启生产 Harness，在新会话右侧抽屉中检查图标/tooltip并捕获实际 `.json` 下载。
- 已执行生产重启，新 Client bundle 已发布到 `http://127.0.0.1:4173/`，进程保持运行。
- 已按 Browser skill 连接现有验证标签，准备刷新并执行实际下载验收。
- 浏览器页面已刷新并重新激活工作台。tooltip 自动化的 hover 与 MouseEvent 两种尝试不受当前浏览器控制接口支持，下一步改用原生 focus 触发后读取 tooltip。
- 页面级 focus 同样不受支持；已停止重复该路径并定位到受控 locator 的 element-scoped evaluate。下一步用该公开方法触发 focus。
- 已完成图标按钮几何与可访问名称验收，但 rc.2 Tooltip 未在键盘 press 后呈现。下一步检查 rc.2 Tooltip/Button 实际实现，决定是否改用原生 title tooltip。
- 已确认 rc.2 Tooltip 不能包裹 rc.2 Button 的版本限制；正在改为 Harness Button 的原生 title tooltip，并同步测试。
- 原生 title tooltip 方案已经实现并通过目标测试、类型检查与 Harness 边界门禁。
- 下一步：再次重启生产 bundle，验证 DOM title 和实际下载事件。
- 生产 bundle 已再次重启；图标、尺寸、aria-label、title 和右栏布局均通过浏览器 DOM 验收。
- Browser download event 没有捕获 Blob anchor 下载并超时。下一步改用精确下载文件检查与页面内 anchor/Blob 记录，不再重复该事件等待。
- 已确认页面点击实际产生目标 `.json` 文件，并解析验证其 UI Workflow 结构与 run identity。
- 下一步：验证已连接 Session 的原生 details header 同样显示图标按钮，然后运行全量质量门禁。
- 已连接 Session 的原生 details 下载图标与 360px 布局通过浏览器验收，并已截取页面。
- 下一步：运行全量 `pnpm run quality`、生产状态、生产健康检查和 `git diff --check`。
- 全量质量门禁通过：unit/integration 123、contract/security 17、production 15、prototype 27。
- 生产 Harness 运行于 `http://127.0.0.1:4173/`，PID 2812；全部健康阶段通过。
- `git diff --check` 通过。Phase 20 完成。

## 2026-08-25 Phase 21

- 已恢复“真实媒体、异步 ComfyUI 运行、Tool/Skill 与 Host 启动”讨论。
- 已把用户确认的 `Session 1 → N Run → N Media` 不变量写入调研记录。每个 Run 独立保存当次 Actual Workflow；媒体下载通过所属 `run_id` 解析。
- 首次追加记录的补丁使用了不存在的文件尾行，补丁未产生部分写入；重新读取真实尾部后改用精确锚点。
- 已重读仓库启动、配置、架构、目录、测试规范与 Generation Run/Media 相关 ADR/PRD。当前已接受规格支持单 Host 进程、持久 worker、一个 SQLite、Workspace/Run 文件目录、Typert Remote 查询与同源文件路由。
- 已检查当前 Host/Remote/Configuration 实现：运行路径和健康检查已就绪，真实 Run Repository、MediaStore、worker、Generation Tool 和 Run Remote 仍为未实现范围。
- 已通过 Context7 确认官方 Harness 文档库、`defineTool()` 和 `ctx.webServer.register()` 的公开用法。下一步集中查询 rc.2 Jobs 与 Tool Result meta 精确行为，再用已安装包核对。
- 已完成 Context7 本问题的三次查询上限，并用已安装 `rc.2` 包核对 Jobs 和 Tools 类型。结论：Tool Result meta 可承载 `run_id`；`ctx.jobs` 不是持久运行或重启恢复机制。
- 已浏览用户指定的 Harness 开发文档、`rc.2` WebServer 标签源码、Harness Tools/Jobs 官方文档与 ComfyUI 官方 server routes。下一步核对本机数据源 Source CLI 与 runtime gateway 的精确操作合同。
- 已核对生产路径中的真实 Source CLI。它只读取 instance 和 TemplateBundle，不承担异步运行；任务提交、观察、取消与媒体持久化必须由当前仓库实现。
- 已完成 Session、Run、Media 与 Workflow 的归属模型：每个不同 Harness Tool `callId` 创建一个 Run，每个 Media 通过自己的 `run_id` 解析 Actual Workflow。
- 已完成 SQLite 表职责、Run Artifact 目录、Saved Media 两级分片、临时文件原子提交和崩溃恢复边界设计。
- 已完成 Host 内置同源接口与持久 coordinator 方案；不增加第二个 HTTP 服务，不把 Harness Jobs 当作持久任务系统。
- 已完成异步状态机、Tool 接纳边界、Client 单一投影轮询与实现顺序设计。Phase 21 完成。

## 2026-08-25 Phase 22

- 已读取 `implement`、`planning-with-files`、`tdd`、`code-review`、`codebase-design` 与 `find-docs` Skill 的完整规则。
- 已运行 planning session catchup；没有未同步上下文。
- 已检查当前工作树并按用户要求整体提交为 `e9f78b3 chore: checkpoint harness comfyui prototype`。
- 已冻结五个 TDD 公开 seam，并建立 Phase 22 目标、验收、非目标、授权和错误记录。
- 下一步：检查当前 Host、Remote、Client、配置和测试结构，设计第一个 Run Repository 红色测试。
- 已检查 Host、Catalog Remote、Client slot、右列静态数据、Tool registry、Configuration Profile 与当前测试结构。
- 已确认第一个纵向切片不需要新增配置字段或第三方依赖；下一步读取 Harness Tool 身份类型、Source CLI TemplateBundle Schema 和已接受 PRD 后编写 Run Repository 红色测试。
- 第一次针对安装包的类型搜索没有命中实际发布扩展名；已记录该错误，下一步先列出包文件并按真实声明扩展名读取。
- 已确认各 rc.2 包确实包含 `lib/types/**/*.d.ts`，文件只是被 `rg` 默认 ignore 规则过滤；下一步使用 `--no-ignore` 读取精确 Tool/Agent/Remote 声明。
- 已核对 `ToolRunContext`、Workspace 和 Typert Service 声明；Tool 的持久调用身份采用当前 Generation Tool `callId`，Workspace 采用 Agent Session `cwd` 的公开 registry 解析。
- 已读取 Agent/Session 身份声明与 Generation Run 相关 PRD。下一步先实现 Run Repository 的第一条红—绿循环，再逐步增加 Artifact、Source、transport 和 Client 投影。
- 已只读连接真实 Catalog/Source discovery，确认本机 Host Source operations 和模板数据可用；当前模板的 `expected_output_node_ids_json` 均为 `null`。
- 用户纠正了输出节点语义：`null` 不是模板不可用，而是不限制输出节点；实现使用目标 ComfyUI 实例 `/object_info` 的 `output_node: true` 活动节点。
- 第一条 GenerationRuntime 红色测试按预期失败于模块缺失；最小实现后 2 项测试通过，覆盖不同 `callId` 独立 Run、相同 `callId` 幂等重放和不同请求冲突。
- 同轮 TypeScript 首次检查发现只读 JSON 联合缩窄问题；已用明确 record 类型修正，准备重跑同一测试与类型检查。
- 已完成第一条 Run Repository TDD seam：不同 Tool `callId` 创建不同 Run 和 Actual Workflow；同一 `callId` 重放返回原 `run_id`；同一 `callId` 的不同请求返回 `RUN_REQUEST_CONFLICT`。
- 已完成 SourceGenerationPreparer TDD seam：运行参数只通过 TemplateBundle 声明的 `replace_input` binding 改写 UI Workflow；连接 URL 与 Authorization 不进入来源快照。
- 已撤销错误的 `SOURCE_TEMPLATE_UNAVAILABLE` 门禁；TemplateBundle 输出节点为 `null` 时，preparer 调用 Workflow compiler 并采用其活动输出节点集合。
- Generation Runtime 与 Source preparer 共 5 项目标测试通过，`pnpm run typecheck` 通过。
- 下一步：实现 Source CLI 严格解析、UI Workflow→API Workflow 编译器与 Comfy transport，再进入 worker 状态机和媒体分片存储。
- 已完成真实 ComfyUI HTTP transport、持久 coordinator、Generation Tool、Generation Runs Typert Remote、逐媒体同源内容与 Workflow 路由，以及右列真实 Run/Media 投影的第一条纵向实现。
- Generation Tool 使用当前原生 `tool/call` 的 `callId` 创建 Run，并验证同一 turn 内存在 `comfyui-generate` Skill Invocation；模型参数不能提供 Workspace、Session、turn 或 callId。
- 右列已经删除 Session 级 Workflow 下载入口；每张媒体卡片只通过自身 `media_id` 下载所属 Run 的 `actual-workflow.json`。
- 目标测试已经覆盖 Run 幂等与冲突、Source CLI 严格解析、Workflow 编译、Comfy transport、worker 状态转换、媒体分片、逐媒体 Workflow、Tool 身份、Remote 投影、Client store 和 coordinator 生命周期。
- Client 目标测试 11 项与 TypeScript 检查通过。Host plugin 集成测试暴露测试夹具仍假设插件无注入服务；实现已正确声明 `tools`、`webServer` 和 `workspaceRegistry`，下一步修正测试夹具后运行全量质量门禁。
- 用户再次确认 `expected_output_node_ids_json: null` 不是错误。实现与合同现已统一为：`null` 不提供输出过滤器，编译器使用 live `/object_info` 中 `output_node: true` 的活动输出节点；显式非空数组才校验并过滤。
- 已修正 Host plugin 集成测试夹具：测试提供真实 Cordis `tools`、`webServer` 和 `workspaceRegistry` 服务，验证 `generate_with_comfyui` 与媒体 prefix 路由完成注册；相关 8 项测试和 TypeScript 检查通过。
- 已按 `skill-creator` 与 `writing-for-agents` 规范新增 `.agents/skills/comfyui-generate/SKILL.md`。该 Skill 从当前消息的可理解上下文字段构造正向提示词，只调用一次异步 Generation Tool；quick validator 与 `git diff --check` 通过。
- 第一次真实 Source→Compiler 只读验证失败于生产 Source `.mjs` 没有可执行位；已让 Source adapter 明确使用当前 Node 运行 `.mjs`，新增非可执行脚本分支测试，并保持外部数据源文件不变。
- 第二次真实验证使用实例 2 时发现模板 34 的活动节点 `XB_UNetNameBroadcaster` 不在该实例 `/object_info`；实例 1 包含模板全部所需节点。生产默认实例已固定为 `1`，模板 34 的真实 Source bundle 与实例 1 `/object_info` 编译通过，识别到活动输出节点且未调用 `/prompt`。
- 已把当前系统文档、Harness 不可变 ADR、Run Repository ADR 和相关 PRD 的权威 Harness 版本统一到 `0.1.1-rc.2`，并记录已实现的 Generation Host/Client/Skill 模块与持久目录。
- 第一次全量质量门禁通过依赖、advisory和build-script审计后，在 Harness边界检查发现新使用的公开`@deepseek-ai/dsh-workspace`根export没有进入项目安全allowlist；已按type-only公开边界加入并新增允许/拒绝测试。
- 第二次质量检查的145项unit/integration全部通过，但新增Generation纵向切片把全局覆盖率降到lines 85.31%、functions 87.5%、statements 80.72%、branches 69.52%，低于现有91/100/88/79门禁。
- 已删除真实投影替换后遗留的静态Run、静态Media和Session级静态Workflow实现，并新增Generation投影合同、Store错误/清理、Client Generation Remote和逐媒体下载UI分支测试；当前目标15项测试与TypeScript检查通过。
- 已补齐所有 Generation Host 类的 Node strip-only 源码加载兼容；`prod:test` 的 15 项生产测试通过。
- 完整 `pnpm quality` 通过：162 项 unit/integration、18 项 contract/security、15 项 production 和 27 项 prototype 全部通过；覆盖率为 statements 91.49%、branches 81.58%、functions 100%、lines 94.91%。
- 浏览器首次验收捕获 Typert 同名 Remote package 重复注册；新增回归测试后把 Catalog 与 Generation 三条 descriptor 合并为一次 `$mount()`，目标测试与 TypeScript 检查通过。
- 修复后真实 Harness 页面不再显示插件加载错误；点击左侧“ComfyUI 工作台”后右列从 0px 展开到 359px，三列布局和真实空投影均可见。
- 新 Harness 会话的原生 `/` 候选列表已经显示 `.agents/skills/comfyui-generate`；验证时临时替换的 231 字符原草稿已经原值恢复，未发送消息。
- 真实生产进程正在 `http://127.0.0.1:4173/` 运行，六项 `prod:health` 检查全部通过。下一步执行最终全量回归、双轴代码审查、语义审查和提交。

## 2026-08-25 Phase 22 — 最终状态与界面收口

- `expected_output_node_ids_json: null` 已通过 Source parser、preparer 和 Workflow compiler 回归测试；compiler 从目标实例 `/object_info` 中选择 `output_node: true` 的活动节点。
- Tool 只持久接纳 `created` Run 后立即返回 `run_id`；Host coordinator 异步准备、提交、观察和保存媒体。
- API Workflow 文件读取和 JSON 解析发生在 `submitting` 前；实例 origin 或 Source 前置校验失败标记为明确 `failed`，只有已经开始 `/prompt` 且响应无法确认的运行进入 `submission_unknown`。
- Host 生命周期取消保留可恢复状态；响应超时覆盖连接、响应头和完整正文读取。
- 右列只注册 Harness 原生 `details`，已删除空白会话中重复的 `shell.overlay`；每张媒体卡片保留所属 Run 的 Actual Workflow 下载图标。
- 右列在存在非终态 Run 时轮询；全部 Run 终态后停止轮询，Session 的运行状态或 Tool 调用变化会显式唤醒查询。
- `config/error-catalog.json` 现在是错误码、标题、原因、下一步、可取消状态和重复执行风险的唯一产品文案来源。
- `comfyui-generate` Skill、PRD 和 Tool 已统一使用真实 `comfyui-context.data` 合同，并按 `data.parameters` 检查全部必填参数和 `value_type`。
- 媒体记录、媒体文件、Workflow未准备和Workflow文件缺失现在通过同源路由返回结构化错误码；右列卡片保留并显示`config/error-catalog.json`中的对应文案。
- 最终`pnpm quality`通过：177项unit/integration、18项contract/security、14项production和27项prototype测试全部通过；覆盖率为statements 90.44%、branches 80.74%、functions 100%、lines 93.62%。
- Standards、Spec和语义审查均无未解决问题。最终生产进程PID为96322，`http://127.0.0.1:4173/`的process、sourceRuntime、harnessWeb、clientBundle、runRepository和savedMedia健康检查全部通过。
- 最终浏览器验收在2048×1013视口选择`Modify code` Session并打开“ComfyUI 工作台”；左侧入口、中列原生工作台和宽359px的唯一Harness `details`右列同时可见，DOM中只有一个`harness-comfyui-details`。

## 2026-08-25 Phase 23

- 已在空白新 Session 中稳定复现用户报告：点击“ComfyUI 工作台”后控制器状态为打开，结果组件已挂载，但 Harness 把原生 `details` 列宽计算为 `0px`。
- 已核对 Harness `0.1.1-rc.2` 安装包并确认根因是 `detailsSession` 对空白 Session 的公开布局限制，不是项目组件或 CSS 回归。
- 已检查基线 `e9f78b3` 的条件式 `shell.overlay` 实现，确认它可以作为空白 Session fallback，并与已保存 Session 的原生 `details` 条件互斥。
- 下一步先增加空白 Session 与已保存 Session 的回归测试，再恢复条件式 overlay 并执行生产浏览器验收。
- 红色测试按预期失败：当前插件未注册 `shell.overlay`，且 `WorkbenchResultsOverlay` 未导出；原有结果抽屉测试继续通过。
- 首次绿色测试只剩一项测试断言失败：React renderer 把结果统计拆成四个 children，字符串序列化断言没有对应连续文本；`WorkbenchResultsOverlay` 已经渲染正确的 `0 个运行 · 0 个媒体` 结构，测试改为直接验证 children 数组。
- 首次生产浏览器验收确认 fallback 已显示且只有一个可见结果列，但通用 `.harness-comfyui-results-drawer` 的 `width: 100%` 覆盖了前置 overlay 规则，导致 overlay 宽度为 `1281px`。下一步使用组合选择器固定 overlay 宽度，并增加样式合同测试。
- 组合选择器修复及样式合同测试完成。定向结果抽屉、插件注册、TypeScript 和 `git diff --check` 均通过。
- 生产浏览器验收通过：空白 Session 显示一个宽 `361px` 的 `shell.overlay` 结果列，原生 `details` 保持 `0px`；已保存 Session 不显示 overlay，并显示一个宽 `359px` 的原生 `details` 结果列；关闭按钮把可见结果列数量降为零。
- 最终 `pnpm quality` 通过：180 项 unit/integration、18 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过；覆盖率为 statements 90.57%、branches 81%、functions 100%、lines 93.66%。
- 生产 Harness 运行于 `http://127.0.0.1:4173/`，PID `26463`；process、sourceRuntime、Harness Web、Client bundle、Run Repository 和 Saved Media 健康检查全部通过。
### Phase 30: 修复 LoRA 与生成模型上下文的实例参数注入
- **Status:** in_progress
- Actions taken:
  - 用户确认当前 Skill 的取消规则错误；正确流程是按上下文 ID 调用数据源 CLI resolve，再把解析结果写入当前 Workflow 模板声明的参数。
  - 用户确认 LoRA resolve 必须同时提供文件名、触发词、默认权重、用途和介绍；Agent 使用用途、介绍和触发词进行语义理解。
  - 用户确认数据源文件名不是实例实际资源路径；Host 必须根据目标实例资源枚举解析 `底模名/文件名` 并保留实例路径分隔符。
  - 用户确认 `comfyui-generate` Skill 必须使用 LoRA 介绍、用途和触发词重写此前 Prompt Builder Skill 已生成的 Prompt，再把最终 Prompt 写入 Workflow 模板。
  - 计划执行者已定位当前 Skill 阻断规则、数据源合同中既有的 LoRA/生成模型 operation、当前仅有模板 Resolver Tool 的 Host 缺口，以及 Workflow 编译器现有的路径分隔符匹配边界。
  - 计划执行者已调用生产数据源 CLI 的 LoRA resolve 和生成模型 search，确认 LoRA 真实字段包含 `description`、`usage`、`trigger_words_json` 和 `weight`，生成模型真实字段包含 `description`、`usage` 与 `skill_name`。
  - 计划执行者已核对模板 37 的真实参数：`lora_model`、`lora_model_weight`、`lora_trigger_word` 与 `positive_prompt`；当前 Workflow compiler 尚不能把纯文件名映射为实例的 `底模名/文件名`。
  - 计划执行者已清点 36 个生产模板的可见参数；当前没有模板声明生成模型覆盖参数，因此生成模型选择必须解析后与模板 `model_id` 校验，不得隐式改固定 Checkpoint 节点。
  - 计划执行者已确认模板 37 的 `lora_trigger_word` 通过 `compose_text` 指向 `positive_prompt`；数据源 ADR 与用户要求都规定最终 Prompt 已包含实际触发词，因此 Host 保持不重复执行该文本组合。
  - 计划执行者已核对数据源 Catalog serializer 与 OpenAPI，固定了 LoRA Resolver、生成模型 Resolver 和模板兼容性字段的真实来源与用途。
  - 计划执行者已检查用户提供的 Actual Workflow，确认该文件没有 LoRA 节点；Phase 30 将按模板 binding 支持不同 LoRA 节点，并对无 LoRA binding 的模板在创建 Run 前返回具体不兼容信息。
  - 计划执行者已开始实现 LoRA/生成模型 Resolver Tool、模板兼容字段与实例 basename 路径映射，并同步补充合同和单元测试。
  - 计划执行者已检查 `Standard_V37.json` 的 LoraManager 自定义节点结构，并确认该文件尚未登记为生产数据源 Workflow 模板；下一步将只读核对已登记实例的 LoraManager `/object_info` 定义。
  - 计划执行者已取得两个真实实例的 LoraManager `/object_info`：仅 `win3080` 支持该节点，且可执行 LoRA 入口是 `<lora:lora_name:strength>` 格式的 `text` 或 `lora_syntax` 字符串。
  - 用户明确否定数据源旧 binding 作为 LoRA 注入依据；计划已改为结构化 Generation Tool LoRA 选择与实例节点输入适配。
  - Generation Tool、持久化 Generation Request、Source preparer 与 Workflow compiler 的结构化 LoRA 数据流已经开始实现；compiler 将同时返回注入后的 Actual Workflow 和 API Workflow。
  - Workflow compiler 已实现标准 LoRA 槽位、LoraManager 文本入口、实例 basename 唯一路径解析、无输入/多输入/容量错误分支；目标测试 fixture 正在同步新合同。
  - 用户进一步明确 binding 只作为参考值和旧模板默认映射；Source bundle 保留 binding 提示，Compiler 不再把 binding 当成参数可用性限制。
  - 第一轮 7 个目标测试文件 79 项全部通过；TypeScript 的内部返回类型错误已经定位并修正。
- Files created/modified:
  - `task_plan.md`（更新）
  - `findings.md`（更新）
  - `progress.md`（更新）
## 2026-08-25 — Phase 30 non-restrictive binding hints

- Inspected the current source parser, source preparer, and Workflow compiler.
- Confirmed the current implementation treats binding as the only runtime mutation path.
- Next: change the compiler contract so valid bindings are preferred hints and deterministic parameter target selection handles every declared parameter without a usable hint.
- Located every TypeScript binding reference. The source parser will preserve valid hints; the preparer and compiler must stop treating those hints as an allowlist.
- Reviewed all current Workflow compiler test fixtures to preserve node serialization, output discovery, path separator handling, and structured LoRA behavior while adding parameter assignment.
- Queried the live source for template 37 and every available template ID from 1 through 60.
- Reduced the generic parameter implementation scope to the ten parameter kinds that the data source actually returns; no speculative parameter vocabulary is required.
- Inspected representative multi-pass, resolution-preset, image-edit, and complex Workflow templates plus the live target instance definitions for their relevant node types.
- Defined the deterministic target rules: exact parameter/input names, known kind aliases, prompt polarity markers, latent-dimension preference, serialized default equality, node-ID suffix reservation, and explicit missing/ambiguous errors.
- Corrected the implementation scope after the user clarified that bindings remain useful as advisory defaults; no binding data will be deleted.
- Implemented the new preparer/compiler contract: the preparer passes resolved runtime parameters and advisory bindings; the compiler applies valid hints first and falls back to live widget resolution.
- Added legacy LoRA parameter projection when structured `loras[]` is absent; structured selections remain authoritative.
- The first three-suite run passed source parsing and Workflow compiler tests. The only failure is the obsolete preparer assertion that still expects preparer-side widget mutation.
- Updated the preparer test to assert the corrected responsibility boundary.
- Added source and compiler branch tests; all 29 focused tests and TypeScript checks now pass.
- Next: complete error catalog coverage, LoRA ambiguity/capacity branches, live template compilation, and real generation runs.
- Added all Phase 30 parameter and LoRA error codes to the shared error catalog.
- Expanded the focused suites to 36 passing tests; TypeScript and error-catalog JSON parsing also pass.
- Next: run the production template bundles through the live target instance compiler before starting real asynchronous generation.
- Verified the asynchronous preparation failure path persists the specific Phase 30 error code and full compiler message.
- Re-read the production startup/configuration contract; no dependency, external service, or data-source change is required for live verification.
- Completed read-only live compiler validation for templates 29, 33, and 37 across both registered instances.
- Completed read-only live compilation of template 37 with structured LoRA ID 68 and the user-provided LoraManager Workflow; both preserved the Windows instance path separator and exact instance directory.
- Next: execute real asynchronous Runs through the Harness Tool path, verify persisted media and per-media Actual Workflow, and repeat with another template where practical.
- Restarted the production Harness with current code and confirmed all six health stages.
- Connected to the existing local Harness browser page using the browser-control Skill.
- The selected old Session cannot submit the prepared draft; next action is to open a fresh Workspace Session and submit the same explicit template/model/LoRA request there.
- The browser-control troubleshooting path did not unlock that stale controlled composer. Next: navigate to a different existing Workspace Session with a normal composer, preserving the production process and the prepared request text outside the page.
- Switched to a standard-mode Session and confirmed its composer is clean. Harness model discovery is currently pending there, so the next browser attempt will use an existing generation Session that already has a selected model.
- Existing generation Sessions also require a newly selected model after restart, and model discovery remains pending. No test Run was created.
- Switching the real-instance E2E to the Generation Tool black-box boundary: use the real Tool contract and same-turn Skill invocation events with production Host classes in an isolated run repository, then inspect terminal status, media, and Actual Workflow.
- Confirmed the final binding contract with the user: a valid binding is the preferred target/default hint, while every declared runtime parameter remains eligible for deterministic compiler resolution when that hint is absent or stale.
- Located the public Runtime and Coordinator lifecycle needed for the isolated real Tool E2E: `acceptGeneration`, `queryRuns`, `queryMedia`, `readActualWorkflow`, `start`, `stop`, and `close`.
- Confirmed the isolated verifier can instantiate the exact production composition from `src/host/plugin.ts`; it needs no additional HTTP service or dependency installation.
- Confirmed `createGenerationTool()` accepts multiple same-turn Tool calls with independent call IDs, so the verifier can exercise the required single-turn portrait/landscape pair through the real Tool boundary.
- Read the live source bundles for templates 37 and 29. Both expose explicit prompt, width, height, and seed parameters; template 37 additionally exposes legacy LoRA defaults while the real request will use authoritative structured `loras[]`.
- Completed a real single-turn, two-Tool-call template 37 run against instance 2. Both asynchronous Runs succeeded, downloaded one PNG each, and persisted distinct Actual Workflows and media.
- Verified the two Runs used dimensions 640×896 and 896×640, seeds 830001 and 830002, distinct final prompts, and distinct output bytes. Both resolved LoRA ID 68 to the instance-native `wai\\USNR_STYLE_ILL_V1_lokr3-000024.safetensors` path with weight 1.
- Completed a second real Tool E2E with template 29 on instance 1. The Run succeeded, saved an 799,857-byte PNG in a sharded media directory, and persisted the supplied 640×768 dimensions, seed 830029, positive prompt, and negative prompt.
- Re-ran the focused Phase 30 catalog, Source, compiler, Tool, worker, and Skill ownership suites after both real runs: 9 files and 108 tests passed.
- `pnpm quality` reached 218 passing unit/integration tests but stopped at the 100% function-coverage gate: `generation-runtime.ts` has two uncovered functions and `workflow-compiler.ts` has two.
- The first JSON coverage diagnostic reused zsh's read-only `status` variable and stopped before printing the function map. The retry will use a task-specific variable name.
- Located the four uncovered callbacks: persisted LoRA array parsing, persisted trigger-word validation, `reference_image` LoadImage preference, and duplicate binding-hint target de-duplication.
- Added explicit tests for persisted structured LoRA restoration, duplicate advisory binding de-duplication, and binding-free `reference_image` resolution to `LoadImage.image`.
- The two edited suites now pass 31 tests, and TypeScript checking passes.
- Full `pnpm quality` now passes: 220 unit/integration tests, 20 contract/security tests, 14 production tests, 27 prototype tests, TypeScript, dependency/security checks, and all coverage thresholds including 100% functions.
- Real resolver Tool calls returned template 37 model ID 1, LoRA 68 model ID 1, and generation model 1; the template, LoRA, and selected model are compatible. The LoRA Tool returned the actual introduction, usage, trigger word `usnr`, weight 1, and catalog basename used by the successful real Runs.
- Independent semantic review found and then cleared one Tool-schema wording issue: LoRA `weight` now explicitly belongs to the current `generate_with_comfyui.loras` item instead of a template `lora_model_weight` parameter.
- Production status and all six production health stages pass on version 0.3.0.
- Re-ran the complete quality gate after the semantic correction; all tests, coverage thresholds, TypeScript, security checks, production tests, prototype tests, and `git diff --check` pass.
- Restarted production Harness from the final working tree. PID 78385 is running at `http://127.0.0.1:4173/`; all six health stages pass and current logs contain no Generation failure.

## 2026-08-25 — Phase 32 real dual-LoRA Skill E2E

- Started the user-requested real validation for two LoRAs with distinct weights, semantic Prompt rewriting, one real asynchronous Run, persisted media, and per-Run Actual Workflow inspection.
- Read the current `comfyui-generate`, planning, and browser-control Skill contracts before executing the validation.
- Queried the real catalog. Historical template 35 is unavailable; current compatible template candidates are 28, 29, 37, and 40, and eight base-model-2 LoRA candidates are available for instance-path intersection.
- Resolved all eight real LoRA records and inspected template 40 plus both target instances. Selected IDs 68 and 69 because both match template model 1, have distinct semantic effects and trigger words, and exist in the instance resource list.
- Found the first real multi-LoRA blocker: template 40 uses `Power Lora Loader (rgthree)`, which the current structured LoRA compiler does not recognize.
- Confirmed from the official rgthree repository that Power Lora Loader supports a dynamic number of LoRAs and that template 40's single-strength mode should apply each selected weight to both model and CLIP.
- Read the official Power Lora Loader backend contract. It consumes dynamic `lora_*` API inputs containing `on`, `lora`, `strength`, and optional `strengthTwo`; this provides a deterministic serialization target for the Host compiler.
- Read the official Power Lora Loader frontend restore code. It establishes exact input names `lora_1`, `lora_2`, keeps LoRA objects in UI `widgets_values`, and reconstructs them in the same order when loading a Workflow.
- Applied the repository TDD contract at the already authorized public seams: `ComfyWorkflowCompiler.compile()` for deterministic Workflow projection, followed by a real Harness Skill/Tool/Run lifecycle for end-to-end evidence.
- Added the first red test at `ComfyWorkflowCompiler.compile()`: template 40's Power Lora Loader initially failed with `COMFYUI_LORA_INPUT_UNAVAILABLE`.
- Implemented the official dynamic projection and completed the green step. The focused compiler suite now passes 26 tests and TypeScript checking passes.
- Located the production composition used by the Host. The live compiler check will reuse `loadProfile('production')`, `GenerationSourceCli`, `SourceGenerationPreparer`, and `ComfyWorkflowCompiler`; it will not bypass the data source or use a mock transport.
- The first live diagnostic command selected `tsx`, which is not installed. The dependency set remains unchanged; subsequent diagnostics use Node's built-in TypeScript type stripping.
- The first built-in Node diagnostic omitted managed environment overrides and correctly failed profile validation. The live check now reads the same materialized production paths and source settings used by `prod:status` and `prod:health`.
- Read the real template 40 node 27. Its current ComfyUI serialization includes divider/header/button values plus `widgets_values_named`; the compiler now preserves non-LoRA UI values and updates both positional and named LoRA projections.
- Completed the second red/green slice. The test proves both Actual Workflow representations use the two selected instance paths and weights while API Workflow contains exact `lora_1` and `lora_2` inputs; 26 tests and TypeScript pass.
- Restarted the production Harness on current source as PID 80064. Process, source runtime, Harness Web, client bundle, Run Repository, and saved-media health stages pass.
- The installed browser client exposes `setupBrowserRuntime` instead of the older `BrowserClient.create()` constructor. Browser control remains on the required node-repl path while initialization is adjusted to the installed API.
- Browser discovery found one previously usable Harness tab, but reloading that pre-restart tab timed out and reset the browser-control session. The recovery path will use a fresh local tab after reading the packaged troubleshooting guidance.
- A fresh in-app-browser tab also timed out on localhost despite the production HTTP health check passing. Browser-family selection was not user-constrained, so the next UI attempt uses the connected external Chrome surface.
- Connected through Chrome, opened a fresh Harness tab, and confirmed a writable new Session with DeepSeek V4 Flash selected. The native composer, `/` command button, ComfyUI Workbench entry, and empty right results column are all present.
- Live production preparation for template 40 succeeded before submission. Node 27 contains both instance-native Windows paths at weights 0.85 and 0.65; API Workflow exposes the same values as `lora_1` and `lora_2`, and output discovery returns nodes 50, 53, 57, and 59.
- The actual Harness Skill invocation and all four Resolver Tool calls occurred in order. Resolver output exposed a real compatibility blocker hidden by compiler-only testing: template 40 fixes generation model 15, while model 1 and LoRAs 68/69 fix generation model 1.
- The real Skill correctly stopped before `generate_with_comfyui`; the right column remained at zero Runs and zero media. Removed the Router-created test-only Markdown file after the turn ended.
- Exhaustively checked all four base-model-2 templates and all eight base-model-2 LoRAs. Template 40 is the only native multi-LoRA Workflow but fixes model 15; the catalog has zero model-15 LoRAs. Template 37 fixes model 1 but contains one standard LoRA slot.
- Expanded the matrix across all three base-model families. Template 39 is a genuine compatible candidate: it fixes Anima model 3, uses an active dynamic LoraManager input, and the catalog contains six model-3 LoRAs.
- The first live template 39 preparation exposed another real compiler branch: the advisory `seed` binding targets node 25, but that target did not enter the active widget candidate set; unsuffixed `seed` then matched eight other widgets and failed as ambiguous. No ComfyUI task was submitted.
- User corrected the compatibility contract: template 40's `model_id: 15` is its serialized default, while selected model 1 and LoRA 68/69 are valid replacements because all belong to the same `base_model_id`.
- The active implementation scope now carries the selected model through the Skill, Generation Tool, persisted request, source preparer, and Workflow compiler; the real acceptance run returns to template 40 with model 1 and LoRA 68/69.
- Read the skill-writing mechanics required by `writing-for-agents`; `comfyui-generate` remains model-invoked and its existing discovery contract does not need a frontmatter change.
- Located the missing execution seam: `GenerationRequest` persists only `loras`, and `SourceGenerationPreparer` forwards no selected model to `ComfyWorkflowCompiler`. Tests will first make this new structured model route fail before implementation.
- Reviewed Tool, runtime, preparer, compiler, error catalog, and Skill contracts. Model replacement will reuse the live `/object_info` combo choices, update both `widgets_values` and `widgets_values_named`, and preserve the target instance's native path separator.
- The red-test surface covers Tool projection, persisted request restoration, preparer forwarding, successful checkpoint replacement, optional no-model behavior, and specific missing/ambiguous model errors.
- Confirmed the red state: eight assertions failed because the Tool, Run parser, preparer, and compiler ignored the selected model. Implemented the structured model route and reached green with 45 focused tests plus TypeScript.
- Existing saved production artifacts prove current catalog templates use both `CheckpointLoaderSimple.ckpt_name` and `UNETLoader.unet_name`; the compiler recognizes these two concrete generation-model resource inputs without treating CLIP, VAE, or LoRA resources as model targets.
- Added optional-model, invalid-persisted-model, missing/ambiguous asset, missing/ambiguous model input, checkpoint replacement, UNET replacement, and native-separator coverage. The five focused suites now pass 61 tests; TypeScript and the shared error-catalog JSON parse pass.
- Reconfirmed the production composition and managed runtime snapshot. Live preparation will instantiate the same `GenerationSourceCli`, `SourceGenerationPreparer`, and `ComfyWorkflowCompiler` classes with source CLI port 18093 and explicit instance 2; no mock or alternate backend will be used.
- Read template 40 through the real source CLI. It has one active `CheckpointLoaderSimple.ckpt_name` at node 45, a native Power LoRA Loader, five runtime parameters, and target instance 2 is the registered `win3080` ComfyUI service.
- The current template Workflow already serializes `waiIllustriousSDXL_v170.safetensors` despite catalog metadata `model_id: 15`; this independently confirms `template.model_id` is not a reliable hard execution gate and the Actual Workflow is the execution authority.
- Located the production resolver methods used by the real Harness Tools. The next diagnostic resolves model 1 and LoRA 68/69 through `CatalogCli`, then passes those exact basenames into the same source preparer used by the Host.
- Real source-to-compiler preparation for template 40 on instance 2 succeeds with model 1, LoRA 68 at 0.85, and LoRA 69 at 0.65. Actual/API Workflow use the instance-native `wai\\...` LoRA paths, model node 45 contains `waiIllustriousSDXL_v170.safetensors`, and output IDs are 50/53/57/59.
- The live diagnostic exposed a second execution issue before submission: template bindings target connected `CLIPTextEncode.text` widgets, while API Workflow executes the upstream links from nodes 39 and 4. The compiler must reject connected widgets as runtime-parameter targets and rewrite the executable upstream string input.
- Independent semantic review found four contract defects: selected-model `id` was misnamed, template Resolver still said `fixed`, one recovery action told the user to cancel the model, and the no-selected-model Prompt path referenced unavailable model semantics. These findings will be corrected before rerunning review.
- Corrected all four semantic findings and added a catalog Tool schema assertion for the default-model meaning.
- The connected-Prompt red test failed on the stale CLIP binding and then passed after serialized named-widget mappings became authoritative and connected widgets were excluded from runtime-parameter targets.
- The next real template 40 preparation reached dimension mapping and exposed a separate connected-width branch: fallback currently sees three face-detailer `guide_size` defaults. No task was submitted; node 25's upstream dimension source must be mapped before real generation.
- Traced template 40's executable scalar sources: node 1 `easy int` titled `Width`, node 11 `easy int` titled `Height`, and node 40 `Seed (rgthree)`. This provides deterministic marker/input evidence for the next regression tests.
- Added and passed a connected-dimension regression. Scalar sources named `value` are selected by their concrete `Width`, `Height`, or `Seed` marker only when direct input-name candidates do not exist.
- Real template 40 preparation now compiles the complete request: API nodes 1/11 contain 512×512, node 40 contains seed 832041, nodes 3/4 contain the final positive/negative Prompt inputs, node 45 contains model 1, and node 27 contains both LoRAs at 0.85/0.65.
- Independent semantic re-review passes after all four corrections.
- Full quality reached 233 passing unit/integration tests and all security checks, then stopped only because one new compiler callback reduced function coverage to 99.8%. Function-level coverage metadata is being generated to add the missing public branch fixture.
- Function-level metadata identified the sole uncovered callback: locating the Power LoRA header when the saved Workflow contains no existing LoRA value objects. The next fixture selects one LoRA into that empty native loader state.
- Added the empty Power LoRA Loader fixture. Full `pnpm quality` now passes: 234 unit/integration tests, 20 contract/security tests, 14 production tests, 27 prototype tests, TypeScript, dependency audits, and 100% function coverage.
- Restarted production Harness on PID 7825. `prod:status` reports running and all six `prod:health` stages pass. The restart parent remains attached to the long-lived Harness process, which is expected for this launched production session.
- Reconnected to the existing Chrome Harness tab at `http://127.0.0.1:4173/`; the next action refreshes the page state and creates a fresh Session for the real Skill turn.
- Opened a fresh writable Harness Session after restart. The native composer has DeepSeek V4 Flash selected, the right results column shows zero Runs/media, and the Session uses standard mode, avoiding the previous Router Standard phase artifact path.
- Opened the native `/` menu and selected `comfyui-generate`; the composer contains the native Skill mark, so the same-turn Tool ownership guard can observe a real Skill Invocation event.
- Submitted the real standard-mode Skill turn. Resolver Tools accepted template 40, model 1, LoRA 68, and LoRA 69 solely by shared `base_model_id`; the Agent rewrote the Prompt with `usnr` and `gthan` once each and created Run `run_2e0a24c0-5eb1-49ed-a1d1-aff53173f0dd` with the new structured model object.
- The Run reached `failed` with `COMFYUI_PROMPT_REJECTED` before media creation. The right column exposes the Run and error-details button; the persisted full ComfyUI response is being inspected to identify the exact rejected input.
- Persisted error details identify the exact validation failures: sole-choice wildcard combo labels were not normalized, and links to bypassed nodes 29/69/70/71/73 remained in API Workflow after those nodes were omitted. The next TDD slice corrects these UI-to-API semantics before a second real Run.

## Phase 31：安装 Router Standard Agent Preset

- [x] 创建安装前回滚提交 `5546251`。
- [x] 只检出并复核 `dsh-routing-suite@21a7260d961571c77a11705d2b0e6cf7015cc48b` 的 `preset/router-standard` 文件清单与 SHA-256。
- [x] 把 Router Standard 复制到 `.local/production/dsh-home/.agent-presets/router-standard`；没有安装或运行 `dsh-super-injector`。
- [x] 重启生产 Harness；PID `17180` 监听 `127.0.0.1:4173`，六项健康检查全部通过。
- [x] 使用 Harness `0.1.1-rc.2` 的预设发现器确认 `router-standard` 没有 `broken` 原因；启动页继续注册 Agent Preset UI 和 ComfyUI Client。
- [ ] 用户刷新生产页面后，浏览器验收必须确认 Agent Preset 选择器显示 Router Standard，并确认 ComfyUI 工作台入口、中列会话界面与右侧结果列可用。
## 2026-08-25 Phase 32 — ComfyUI 拒绝后的编译器修复验证

- `generation-workflow-compiler.test.ts` 的 38 个测试通过。
- `pnpm typecheck` 通过。
- 编译器已覆盖 ComfyUI 实例单一 COMBO 选项替换，以及 mode=4 跳过节点的输入透传和标量内联。
- 已确认生产启动由 `scripts/production/cli.mjs` 注入 Source CLI 路径与运行目录；真实预编译将复用 `.local/source-production-managed.json` 的当前受管配置。
- 已读取当前受管生产快照：Source CLI 使用端口 18093，默认实例为 1；本次模板 40 验证将显式选择实例 2，并使用生产数据源的真实模板与实例定义。
- 第一次修复后真实预编译继续失败：模板 40 还包含 mode=4 节点 66，其输出 0 不能按当前“同索引/同名/唯一同类型”规则解析。没有向 ComfyUI 提交任务；下一步检查节点 66 的实际输入输出和下游连线。
- 节点 66 是被跳过的 `VAEEncode`，其 LATENT 输出没有同类型输入，且只连接到活动 `ImpactSwitch` 的 `input2`；该开关同时从活动节点 25 接收 `input1`。下一步使用实例 `/object_info` 判断 `input2` 是否为可省略输入，并在编译器中只省略实例声明为可选且无法解析的 bypass 分支。
- 现有 bypass 测试已覆盖同类型链路和无输入标量节点；将新增一个活动节点同时包含 required 链接与无法解析 optional bypass 链接的回归，确保只删除 optional 分支，required 分支继续失败。
- 新增 optional bypass 分支测试并确认红灯：当前编译器仍对可选 `latent` 输入抛出 `WORKFLOW_COMPILE_FAILED`，证明测试命中了真实缺口。
- optional bypass 行为测试已转绿，但首次 TypeScript 检查因测试夹具的窄字面量类型不允许把 `latent` 从 optional 改为 required 而失败；生产代码没有类型错误，测试夹具改为独立 required 定义后重跑。
- 第二次真实预编译已做到零悬空节点引用，模型、双 LoRA、权重、Prompt、尺寸和 seed 均正确；但进一步检查发现 `ImpactSwitch` 选择值为 2，而其 bypassed VAE 分支被省略，同时 bypassed `VAELoader` 被错误内联为字符串。当前 Workflow 仍不能提交。
- 已对照 ComfyUI 官方 `executionUtil.ts` 的 `graphToPrompt()`：官方转换会忽略 `resolveInput()` 无结果的输入并清理指向未输出节点的连接，不会内联普通 bypass 节点。下一轮 TDD 将撤销通用标量内联，并测试目标 widget 值优先保留。
- 新回归已确认红灯：bypassed `PrimitiveInt` 的值 2 覆盖了活动目标节点保存的 widget 值 1。该行为与官方 `graphToPrompt()` 不一致。
- 第三次真实预编译通过：API Workflow 没有悬空节点引用；两个 `ImpactSwitch` 均保留 `select: 1` 并只引用活动 `input1`；模型 1、LoRA 68/69、权重 0.85/0.65、Prompt、512×512 和 seed 832041 均投影正确。
- 最新完整 `pnpm quality` 通过：237 个 unit/integration、20 个 contract/security、14 个 production、27 个 prototype 测试通过；TypeScript、依赖审计、Harness 边界和 100% function coverage 均通过。
- 生产 Harness 已重启为 PID 29293，六项健康检查通过。Chrome 中已刷新当前源码并创建新的标准模式 Session；右栏初始状态为 0 个运行、0 个媒体，输入框可写且模型为 DeepSeek V4 Flash Max。
- 原生 `/` 菜单已显示并可选择 `comfyui-generate`。已复核当前 Skill 合同：模板 `model_id` 仅为 Workflow 默认模型，同 `base_model_id` 的所选模型和 LoRA 可替换；Tool 前必须完成 resolve、Prompt 重写和全部参数校验。
- 已在新 Session 原生选择 `/comfyui-generate` 并提交真实请求：模板 40、实例 2、模型 1、LoRA 68/69（0.85/0.65）、512×512、seed 832041。25 秒时 Agent 仍在 resolve/思考阶段，尚未创建 Run。
- Resolver 结果确认模板、所选模型和两个 LoRA 的 `base_model_id` 都为 2；Agent 正按所选模型关联的 `wai-sdxl-prompt-builder` 输入合同生成 WAI 标签式最终 Prompt。此时仍为 0 Run，未提前调用 Tool。
- WAI Prompt Skill 的完整输入合同与本轮 `comfyui-context` 不同；Agent 没有停止任务，而是以 `comfyui-generate` 为主流程并读取 WAI 构图、质量、机位和光照参考来重写 Prompt。3 分钟时仍未创建 Run。
- Skill 已创建 Run `run_c9d44326-0fd8-4d50-ac18-3d010c0df851`。最终 Prompt 中 `gthan` 和 `usnr` 各出现一次；Tool 显示模型 1、LoRA 68=0.85、LoRA 69=0.65、512×512、seed 832041。右栏状态已从“已准备”进入“生成中”。
- Run `run_c9d44326-0fd8-4d50-ac18-3d010c0df851` 已完成，右栏显示 1 个运行、1 个媒体。首次切换媒体 tab 被状态刷新切回运行状态；Run 完成后将重新切换并核对媒体卡。
- SQLite 与落盘文件核对通过：Run 状态 `succeeded`，prompt_id `02cf8506-68d0-4bac-a2fe-af889fa1c853`，无错误；Actual/API Workflow 均使用模型 1 和实例原生 `wai\\...` 双 LoRA 路径，权重 0.85/0.65；两个触发词各一次，零悬空引用。
- 媒体 `media_d06d8e81-0358-4ea7-b812-0de8be9ccaad` 已分片保存到 `d0/6d/`，数据库字节数与文件字节数均为 326740；文件是有效 512×512 RGB PNG。
- 已视觉检查落盘 PNG：画面是低机位、黑色哥特长裙女性、月光教堂窗景，符合本轮核心构图与光照要求，文件可正常解码。
- Chrome 自动化对唯一“本会话媒体”tab 执行普通点击和强制点击后，`aria-selected` 仍为 false；媒体数据和文件均已存在。该现象记录为独立 UI 交互异常，不影响本轮真实生成和持久化结论。
- 已确认产品实现为每个媒体提供两个独立能力：原文件链接使用 `target="_blank"`；Workflow 下载 URL 由该媒体 ID 解析到该媒体所属 Run 的 `actual-workflow.json`。下一步直接请求本次真实媒体的两条 Host 路由并与落盘文件比对。
- 媒体内容和 Workflow 路由均返回 HTTP 200；内容类型、Content-Disposition 和长度正确。HTTP 响应与本地 PNG、Actual Workflow 的 SHA-256 分别完全一致。
- 浏览器封装器不支持 locator `focus()`，该次自动化尝试失败；直接向“本会话媒体”tab 发送 Enter 后成功切换。媒体卡显示原文件新窗口链接和该媒体所属 Workflow 下载按钮。
- 真实媒体卡属性核对通过：原文件 URL 指向本次 `media_id`，`target=_blank`、`rel=noopener noreferrer`；该媒体卡精确显示一个“下载 ComfyUI_00099_.png 所属 Workflow”按钮。
- 最终 `git diff --check` 通过；生产 Harness PID 29293 继续运行，process、source runtime、Harness Web、client bundle、Run Repository、saved media 六项健康检查全部通过。Phase 32 已完成。
## 2026-08-25 Phase 33 — 删除 Generation Tool 手动 Skill 门禁

- TDD 红灯确认：没有 `skill-invocation user/message` 时，五条合法 Tool 路径均被 `GENERATION_SKILL_INVOCATION_REQUIRED` 阻断。
- 已删除用户消息 source 检查和 turn/start 前置检查；Generation Tool 现在只校验匹配的 Tool Call、Session、Workspace 和 Run 所有权。
- Agent-side Skill Tool Call 后的 Generation Tool Call、无手动 Skill Invocation 的直接合法 Tool Call、默认模型和同 turn 多次调用测试均通过。
- 旧错误码 `GENERATION_SKILL_INVOCATION_REQUIRED` 已删除；缺少匹配 Tool Call 时使用具体错误码 `GENERATION_TOOL_CONTEXT_INVALID`。
- `generation-tool.test.ts` 6 项测试和 TypeScript 检查通过。
- 完整 `pnpm quality` 通过：单元与集成测试 238 项、契约与安全测试 20 项、生产测试 14 项、原型测试 27 项全部通过。
- 生产 Harness 已使用 PID 87617 在 `127.0.0.1:4173` 重启；HTTP 返回 200，process、source runtime、Harness Web、client bundle、Run Repository、saved media 六项健康检查全部通过。
- `git diff --check` 通过，仓库中不存在 `GENERATION_SKILL_INVOCATION_REQUIRED`、`exactSkillInvocation` 或手动 Skill Invocation 门禁残留。
- Phase 33 已完成。

## 2026-08-25 Phase 34 — 保留 Workflow 原始参数值

- 数据源 CLI、Run Repository、Actual Workflow、API Workflow 和真实 PNG 已交叉核对；模板 40 最近 12 次成功运行稳定复现负面提示词为空、尺寸变为 512×512、随机种子变为固定值的问题。
- 已确定修复边界：调整所有模板共用的参数解析规则，不修改模板 40 数据，不按模板 ID、节点 ID或参数 kind 写特例。
- 回归测试红灯通过：当前实现把省略的 `negative_prompt`、`width`、`height` 和 `seed` 元数据默认值全部加入运行时覆盖集合，并允许元数据默认值绕过 `required: true`。
- 公共参数解析函数已改为使用参数 ID 的显式存在性：请求未提供的非必填参数不进入编译器覆盖集合；请求未提供的必填参数直接返回 `GENERATION_PARAMETER_INVALID`。
- `generation-preparer` 与 `generation-workflow-compiler` 共 44 项聚焦测试和 TypeScript 检查通过。
- 真实模板 40 在实例 2 上完成只读预编译：正面提示词使用请求值；负面提示词保留 Workflow 原文；宽度 1024、高度 1536、种子 -1 均保留 Workflow 原始值。
- 完整 `pnpm quality` 通过：单元与集成测试 240 项、契约与安全测试 20 项、生产测试 14 项、原型测试 27 项全部通过。
- 生产 Harness 已重启为 PID 12484；`127.0.0.1:4173` 返回 HTTP 200，process、source runtime、Harness Web、client bundle、Run Repository、saved media 六项健康检查全部通过。
- `git diff --check` 通过；`source-preparer.ts` 不再存在把 `definition.defaultValue` 自动转换为运行时覆盖值的逻辑。Phase 34 已完成。
## 2026-08-25 Phase 35 — 实例化 API Workflow 随机种子

- 使用真实模板 40 API Workflow 建立了可重复的实例反馈回路：同一 Workflow 只改变 seed，`-1` 稳定保留模板旧 `populated_text`，固定整数稳定把新 `wildcard_text` 转换为新的 `populated_text`。
- 独立队员已完成最近 12 张媒体的盲测；结果与内嵌 Workflow 证据一致，12 张都没有体现各自的新单人场景 Prompt。
- 官方 rgthree 源码确认 `Seed (rgthree)` 的 `-1` 是前端排队钩子负责替换的特殊值；后端只提供不推荐的 API 补救。实现范围已收窄为活动 `Seed (rgthree).seed=-1`，其他 seed 节点不受影响。
- 已确定实现规则：编译时为每个活动 `Seed (rgthree).seed=-1` 生成一个具体非负整数；不直接修改 `populated_text`，不按模板 ID、节点 ID 或标题写特例。
- 下一步先在 `generation-workflow-compiler.test.ts` 增加红灯回归，再实现随机种子实例化并运行聚焦测试。
- 已增加编译器公共入口回归，夹具同时包含 `Seed (rgthree).seed=-1`、固定 rgthree seed 和普通 `KSampler.seed=-1`。红灯稳定收到随机数函数调用 0 次，证明当前编译器保留了导致实机错误的 `-1`。
- 编译器现在只把活动 `Seed (rgthree).seed=-1` 转换为 `[0, 2^50)` 的具体整数，并同步修改 Actual Workflow 的位置值、命名值和 API Workflow 投影；固定 rgthree seed、普通 KSampler 和 bypassed rgthree 节点保持原值。
- 42 项编译器测试通过；首次 TypeScript 检查只发现新增测试未收窄 JSON 联合类型，测试已改为逐层对象收窄后重跑。
- JSON 联合类型收窄修正后，42 项编译器测试、`pnpm typecheck` 和 `git diff --check` 全部通过。
- 完整 `pnpm quality` 通过：243 项 unit/integration、20 项 contract/security、14 项 production 和 27 项 prototype 测试通过；函数覆盖率保持 100%。
- 生产默认随机数源在每次 `compile()` 命中 `Seed (rgthree).seed=-1` 时重新取样；测试注入固定值只用于确定性断言。真实验收将要求三个 Run 的 seed 非 `-1` 且两两不同。
- 生产 Harness 已重启为 PID 39636；`prod:status` 为 running，`prod:health` 的 process、source runtime、Harness Web、client bundle、Run Repository 和 saved media 六项检查全部通过。
- in-app Browser 安全策略禁止刷新 localhost；未绕过该策略。改用同一生产 Host 模块和真实数据源/实例，在隔离临时 Repository 中接纳三个模板 40 Run。
- 三个真实 Run 全部到达 `succeeded` 并分别保存一张 PNG；三次随机 seed 为 `381922942878829`、`755850269072327`、`584854350565245`，Actual/API/ComfyUI history 三处一致且两两不同。
- 三个 ComfyUI history 的正面节点均为 `mode=reproduce`，`populated_text` 等于请求的新 Prompt。视觉检查确认三张媒体分别准确呈现厨房、海滩和雪夜街道场景。
- 三个原始 PNG 的内嵌 Prompt 与 ComfyUI history 一致，三个文件的 SHA-256 各不相同。最终 `git diff --check` 和生产六项健康检查通过。Phase 35 已完成。
## 2026-08-25 Phase 36 — 右侧媒体预览完整适配容器

- Phase 36 的生产样式检查定位到 `src/client/styles.css`：右栏图片和视频共用 `object-fit: cover`，这与用户观察到的裁剪完全一致。
- `tests/unit/results-drawer.test.tsx` 新增了生产 CSS 合同断言；修改前测试因 `object-fit: cover` 失败，稳定复现了裁剪问题。
- 右栏图片和视频现使用 `object-fit: contain`，在固定预览容器内保持原始宽高比并显示媒体全貌；竖图以容器高度为上限，横图在宽度达到容器边界时自动受宽度约束。
- 右栏 9 项聚焦测试、TypeScript 检查和 `git diff --check` 已通过。
- 完整 `pnpm quality` 通过：244 项 unit/integration、20 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过；函数覆盖率保持 100%。
- 生产 Harness 已重启为 PID 64602；`prod:status` 为 running，`prod:health` 的 process、source runtime、Harness Web、client bundle、Run Repository 和 saved media 六项检查全部通过。
- 生产生成的 `.local/source-client/client.js` 已包含右栏图片和视频的 `object-fit: contain` 规则。Phase 36 已完成。

## 2026-08-28 Phase 38 — 删除 Source 模板运行元数据依赖

- 已创建独立 worktree `/Volumes/4Tdisk/work/AI2/harness-comfyui-wt-official-api-no-source-metadata` 和分支 `codex/remove-source-runtime-metadata`；主工作区的用户变更未被修改。
- 依赖安全门禁通过；`pnpm install --frozen-lockfile` 复用锁定依赖，没有下载或安装新版本。
- 已删除 Generation Source、Catalog Source、TemplateBundle、Catalog Tool 和 Workflow compiler 对 Source 模板参数元数据的读取、检查、投影和运行依赖。
- Workflow compiler 现在从当前 UI Workflow、目标实例 `/object_info`、活动状态、上下游连线和参数键定位运行值；Official API Workflow compiler随后把已确认值覆盖到Official Base API Workflow。
- 已增加上游标量控件、正负 Prompt 极性、共享 Prompt、不可达 Prompt、重复目标、多源目标、绕过分支、空 LoRA 和 Official API Workflow 字面量载体回归测试。
- 已使用主仓库 `.env` 和独立 worktree 的 DSH home 读取真实 Source 数据；测试脚本没有输出 `.env` 内容。
- 33 个真实模板的 ComfyUI 页面 Official API Workflow 导出与缓存 miss→hit 验证全部通过。
- 33×15 单参数矩阵没有目标歧义或其他编译错误；不支持的参数明确返回 `GENERATION_PARAMETER_TARGET_NOT_FOUND`。
- 第一次全参数组合矩阵发现 23 个模板的正负 Prompt 重复占用问题；增加共享 Prompt 与不可达 Prompt 测试并修复结构解析后，33 个模板的全参数组合矩阵全部通过。
- `generation-workflow-compiler.test.ts` 当前 76 项测试和 TypeScript 检查通过。
- 完整 `pnpm quality` 通过：390 项 unit/integration、24 项 contract/security、40 项 production 和 27 项 prototype 测试全部通过；函数覆盖率为 100%。
- 当前修复源码已使用 `pnpm worktree:start` 在前台启动；PID 87624 监听 `127.0.0.1:4173`，`pnpm worktree:status` 和 `pnpm worktree:health` 全部通过。
- 真实 in-app Browser 刷新当前页面后显示工作区 `run-comfyui-workflows-harness`、模型 `DeepSeek V4 Flash · Default`、可写输入框、ComfyUI 工作台和空生成结果栏；页面没有 API Key 文案和对话框。
- 仓库新增`pnpm verify:comfyui-workflows -- --instance-id 2 --output <path>`。该命令从当前Source枚举全部33个模板，读取实例122的实时`/object_info`，执行15类单参数编译、逐项比较`config/verification/comfyui-workflow-parameter-support.json`精确支持面、执行每个模板全部支持参数的组合编译、真实页面Official API Workflow导出和每模板独立缓存miss→hit对比；最终报告`failed: false`。
- Source Catalog新增模板41时，精确支持面门禁先拒绝32模板基线。计划执行者依据模板41的活动Prompt、尺寸、Seed和采样执行链把11个应支持参数加入结构化基线；重新运行后33个模板的495项结果全部与基线一致，参数错误、支持面偏差、组合错误和Official cache错误均为0。
- 节点ID后缀现在覆盖Generation Tool公布的15个标准参数键。不存在的后缀（例如`seed_999`）返回`GENERATION_PARAMETER_TARGET_NOT_FOUND`，不会回退到唯一同类widget；规范参数与后缀参数以不同值占用同一widget时返回`GENERATION_PARAMETER_TARGET_AMBIGUOUS`。
- Official API Workflow载体测试现在直接核对缓存中的模板字面量，并覆盖非零载体输出、未引用同形对象和失败不写缓存分支。
- 真实浏览器通过`/comfyui-generate`提交模板39、实例2和10个显式参数，创建Run`run_a58f1a47-fe85-4e9f-87b4-255e9e76944b`。该Run以远端prompt ID`7b83ebfd-bca3-4e97-ab60-a8bc4cc45a18`进入`succeeded`，保存一张445425字节的512×512 PNG。
- 真实Run的Request、Actual Workflow和API Workflow核对通过：Prompt为`1girl, solo, simple background`，seed为880028，宽高为512×512，steps/cfg/denoise/batch均为1，sampler为`euler`，scheduler为`normal`；空LoRA数组没有修改模板39的LoraManager`text`与`loras.__value__`。
- Spec Reviewer发现`config/error-catalog.json`仍要求用户修改已删除的模板binding。当前两条参数目标错误文案只引用显式运行参数键、候选ComfyUI节点输入、UI Workflow、目标实例节点定义和节点编号后缀；文案合同测试明确拒绝旧术语。
- 最终`pnpm quality`通过：404项unit/integration、24项contract/security、40项production和27项prototype测试全部通过；函数覆盖率为100%。
- 独立Standards Reviewer、Spec Reviewer和语义Reviewer最终均返回PASS；`git diff --check`通过。

## 2026-08-28 Phase 39 — 发布 v0.31.2

- 用户授权把Phase 38已验收提交合入本地main、push并发布下一个版本；目标版本按SemVer补丁递增确定为`0.31.2`。
- 本地main在发布前包含80项用户删除和一个未跟踪计划目录；其中4个PRD文件与Phase 38修复重叠。发布流程必须先保存可恢复stash，不能把用户改动纳入发布提交。
- `origin/main`仍指向`011b64b2acb94d78de349da0a999029812fc4261`；本地和远端均不存在`v0.31.2`标签，GitHub不存在`v0.31.2` Release。
- 根`package.json.version`和工程合同已更新为`0.31.2`。源码版本提交前的`pnpm quality`通过：404项unit/integration、24项contract/security、40项production和27项prototype测试全部通过，函数覆盖率为100%。
- 本地main已fast-forward到源码版本提交`c00eb672a5576534c38dff70e1f7b7cbcadbc34d`并推送`origin/main`；发布前用户现场保存在stash`codex-preserve-main-before-v0.31.2-release-20260828`中。
- 源码版本提交的GitHub CI Run `33143548613`成功，Source quality gates全部通过。
- 首次发布文档语义验收指出两处事实边界问题：普通断开Prompt候选不是无条件排除，参数目标错误文案还引用目标实例节点定义。发布说明已按实现边界修正并等待复审。
- 独立语义Reviewer复审修正文档后返回PASS；版本、矩阵、组合编译、Official cache、真实浏览器、空LoRA、测试数量、依赖、lockfile和发布命令均与证据一致。
- 发布文档提交前的最终`pnpm quality`通过：404项unit/integration、24项contract/security、40项production和27项prototype测试全部通过，函数覆盖率为100%。
