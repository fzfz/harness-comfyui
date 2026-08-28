# Harness ComfyUI 原型方案调研计划

## Goal
计划执行者使用 DeepSeek Harness `0.1.1-rc.2` 公开插件接口交付可运行的 Harness ComfyUI 插件；插件必须实现真实上下文选择、异步 Generation Run、分片媒体存储、逐媒体 Actual Workflow 下载和原生三列界面。

## Next Step
Phase 39 修改结构化版本、执行源码质量门禁，并把源码版本提交 fast-forward 合入本地 main 后推送。

## Current Phase
Phase 39 in progress

## Phases

## Phase 39：发布 v0.31.2 并部署生产 checkout

### 必须要实现的目标

- 发布负责人必须把根`package.json.version`和对应工程合同更新为`0.31.2`，执行`pnpm quality`，提交源码版本，并把已验收源码提交fast-forward合入本地`main`后推送`origin/main`。
- 发布负责人必须等待源码版本提交的GitHub CI成功，再更新`README.md`、`docs/releasenotes.md`、`docs/system/releasing.md`和受影响的系统测试文档，使发布说明准确描述Source模板运行元数据移除、Official API Workflow cache、结构化参数解析、33模板真实矩阵和浏览器端到端结果。
- 独立语义Reviewer必须验收发布文档；发布负责人必须在文档验收和最终`pnpm quality`通过后提交并推送文档，等待最终提交的GitHub CI成功。
- 发布负责人必须确认`v0.31.2`标签和GitHub Release不存在，在最终发布提交上创建并推送annotated tag，创建不含附件的GitHub Release，并核对远端标签、Release标题、说明、URL和附件列表。
- 生产部署负责人必须从最终发布提交更新`/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env`，保留生产专属配置和运行状态，重启生产Host，并验证`prod:status`、`prod:health`和实例122的真实生成路径。
- 发布负责人必须在合入前保存本地`main`现有的80项删除和一个未跟踪计划目录，发布后恢复这些用户改动，并核对恢复后的路径状态与发布前一致。

### 验收清单

- [ ] 根`package.json.version`和工程合同均为`0.31.2`；源码版本提交的`pnpm quality`与GitHub CI通过。
- [ ] 本地`main`包含修复提交和版本提交，`origin/main`指向已推送的源码版本提交；本地`main`原有用户改动已通过可恢复stash保存。
- [ ] `README.md`、`docs/releasenotes.md`、`docs/system/releasing.md`和`docs/system/testing.md`与`v0.31.2`事实一致；独立语义Reviewer返回PASS。
- [ ] 最终文档提交的`pnpm quality`与GitHub CI通过；`git diff --check`通过。
- [ ] 远端`v0.31.2`annotated tag与GitHub Release都指向最终发布提交；Release没有附件。
- [ ] 生产checkout从最终发布提交更新并通过`prod:status`、`prod:health`和真实实例验收。
- [ ] 本地`main`发布前的80项删除和一个未跟踪计划目录均已恢复；发布stash在恢复核对通过后删除。

### 非本次目标

- 本阶段不修改Source数据库、Source CLI、ComfyUI服务端、自定义节点、目标实例模型文件或生产专属配置。
- 本阶段不构建或上传产品包；GitHub Release只包含tag与Release记录。
- 本阶段不删除、移动或重写既有tag与GitHub Release。
- 本阶段不把本地`main`发布前的用户删除和未跟踪计划目录纳入`v0.31.2`提交。

### 已获得的授权

- 用户明确要求把已验收修复合入本地`main`、提交并push`main`、发布下一个版本。
- 仓库`AGENTS.md`授权发布负责人在用户要求发布时提交并推送已批准变更、等待GitHub CI、发布版本，并从最终发布提交部署生产checkout。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 本地`main`包含80项未提交删除和一个未跟踪计划目录，其中4个PRD文件与修复提交重叠 | 1 | 发布负责人在合入前使用包含未跟踪文件的命名stash保存用户现场，发布完成后应用stash并核对全部路径状态；这些用户改动不进入发布提交。 |

状态：进行中

## Phase 38：删除 Source 模板运行元数据依赖并以 Official API Workflow 为执行基准

### 必须要实现的目标

- Generation Source adapter 和 Catalog Source adapter 不得读取、校验、投影或暴露 Source 模板响应中的 `parameters_json` 与 `bindings_json`。
- Generation Tool 必须把显式运行参数原样交给 Workflow compiler；Workflow compiler 必须使用当前 UI Workflow和目标实例`/object_info`定位运行输入，再把已确认的运行值覆盖到Official Base API Workflow。
- Workflow compiler 必须使用节点输入名、节点标题、活动状态、绕过连线、上下游连线和参数键中的节点编号后缀消除目标歧义；目标不存在或仍不唯一时必须返回包含具体运行参数键的错误。
- Official API Workflow cache 必须继续按实例身份、实例 origin、实例缓存代次、模板 Workflow 内容和执行结构隔离；缓存命中时只覆盖已确认的运行值，缓存未命中时必须由目标实例 ComfyUI 页面导出 Official API Workflow。
- 计划执行者必须在独立 git worktree 中启动当前系统，并使用真实浏览器检查启动工作区、Agent 模型、上下文选择器和 Generation 工作台。

### 验收清单

- [x] Source adapter 测试证明 `parameters_json` 与 `bindings_json` 缺失、损坏或互相矛盾时不会改变 TemplateBundle。
- [x] Catalog resolver 测试证明模板参数元数据缺失、损坏或互相矛盾时仍只返回模板 ID、标题、底模 ID 和可选模型 ID。
- [x] Workflow compiler 测试覆盖正向 Prompt、负向 Prompt、宽度、高度、Seed、参考图、未知参数、重复目标、目标歧义、连接输入、多源输入、不可达分支、绕过分支、模型、标准 LoRA、LoraManager、Power LoRA、空 LoRA 和 Official API Workflow cache 命中。
- [x] 当前 Catalog 的 33 个真实模板全部完成实例 122 页面 Official API Workflow 导出和缓存 miss→hit 一致性验证。
- [x] 当前 Catalog 的 33 个真实模板完成 15 类单参数矩阵、`config/verification/comfyui-workflow-parameter-support.json`精确支持面比较和每个模板全部可解析参数的组合矩阵；精确支持面比较与组合矩阵没有参数支持面偏差、重复目标、目标歧义或编译异常。
- [x] `pnpm quality`、独立语义审核、独立代码审核和 `git diff --check` 全部通过。
- [x] `pnpm worktree:start` 保持前台运行期间，`pnpm worktree:status` 与 `pnpm worktree:health` 全部通过。
- [x] 真实浏览器打开 `http://127.0.0.1:4173/` 后显示启动工作区 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness` 和模型 `opencode-go/deepseek-v4-flash`，且页面不显示工作区选择或 API Key 配置门禁。
- [x] 真实浏览器调用`/comfyui-generate`并通过模板39提交10个显式运行参数；Run进入`succeeded`并保存一张512×512 PNG，Actual/API Workflow中的Prompt、seed、宽高与采样参数一致，空LoRA请求保留模板LoraManager内容。

### 非本次目标

- 本阶段不修改 Source 数据库、Source CLI、ComfyUI 服务端、自定义节点或实例模型文件。
- 本阶段不根据模板 ID 编写参数目标特例，也不为连接尺寸强制断开连线或自动修改独立下游放大尺寸。
- 本阶段不清空用户未选择的模板 LoRA，也不把普通运行参数重新解释为结构化 LoRA 选择。
- 本阶段不安装新依赖，不修改 Harness 核心包和 `node_modules/@deepseek-ai/*`。

### 已获得的授权

- 用户明确要求删除 Harness 对 `parameters_json` 与 `bindings_json` 的所有依赖和检查。
- 用户明确要求保留经过既有模板回归验证且不依赖节点特例的旧编译器逻辑。
- 用户明确要求新建独立 worktree、修复、在 worktree 内启动真实系统并使用真实浏览器测试。

状态：已完成

## Phase 37：发布 v0.30.2

### 必须要实现的目标

- 计划执行者必须把根 `package.json` 的 `version` 修改为 `0.30.2`，并保留当前工作区中已经存在的源码与测试变更。
- 计划执行者必须按照 `docs/system/releasing.md` 完成源码提交、GitHub CI 等待、发布文档更新、独立语义验收、最终提交、目标标签和 GitHub Release。
- 计划执行者必须让 `README.md`、`docs/releasenotes.md` 和根 `package.json` 一致指向 `0.30.2` 与 `v0.30.2`。
- 计划执行者必须让 `v0.30.2` 标签指向最终文档提交的完整 SHA，GitHub Release 使用该标签且不包含附件。

### 验收清单

- [x] 根 `package.json.version` 为 `0.30.2`。
- [x] 源码版本提交前的 `pnpm quality` 通过。
- [x] 源码版本提交已推送，且对应 GitHub CI 成功。
- [x] 独立 Reviewer 已验收 `README.md` 与 `docs/releasenotes.md` 的事实、版本和语义一致性；Reviewer 结论为 `PASS`，无问题。
- [x] 最终文档提交后的 `pnpm quality` 通过；提交 `d018c8d2b32187e6ce1e7acf90dc367682c7d689` 的 GitHub CI Run `32929188639` 成功。
- [x] `v0.30.2` 标签、GitHub Release、Release 标题、Release 说明和空附件列表已核对；标签 peeled SHA 为 `d2de5d245ac8dd5d0e43d202b2f7fcfa77faa3a5`，附件数量为 0。

### 非本次目标

- 本阶段不修改数据源仓库、ComfyUI 实例文件或未受本次源码变更影响的系统模块。
- 本阶段不构建或上传产品包；仓库发布规范只要求 Git tag 与 GitHub Release 记录。
- 本阶段不删除或移动已经发布的 `v0.30.1` 标签或 Release。

### 已获得的授权

- 用户明确要求提交当前变更并发布版本 `v0.30.2`。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| `tests/contract/engineering-baseline.test.ts` 仍断言根 `package.json.version` 为 `0.30.1`，导致源码版本更新后的合同测试失败 | 1 | 将合同断言更新为目标版本 `0.30.2`，再重新执行完整质量门禁。 |

状态：已完成

## Phase 36：右侧媒体预览完整适配容器

### 必须要实现的目标

- 右侧结果列的图片和视频必须完整显示媒体画面，不得按媒体卡宽高比裁剪原文件。
- 图片和视频必须以预览容器高度为主要缩放约束，并在媒体过宽时受容器宽度限制。
- 图片和视频必须保持原始宽高比；容器内未被媒体占用的区域可以留空。

### 验收清单

- [x] 回归测试必须拒绝右侧媒体预览继续使用 `object-fit: cover`。
- [x] 生产样式必须使用 `object-fit: contain`，并让媒体元素同时受预览容器宽度和高度约束。
- [x] 图片与视频必须共享同一套完整显示规则。
- [x] 完整质量门禁、生产重启、六项健康检查和 `git diff --check` 必须通过。

### 非本次目标

- 本阶段不修改媒体卡分页、筛选、下载、原文件新窗口打开或 Workflow 下载功能。
- 本阶段不修改上下文选择弹窗的封面图缩放规则。
- 本阶段不修改静态 prototype 的独立样式。

### 已获得的授权

- 用户明确要求右侧结果列媒体缩放到容器内、以高度优先并显示媒体全貌。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 首次状态记录补丁使用了与 `progress.md` 不一致的标题文本，补丁校验失败 | 1 | 重新读取 Phase 36 的准确标题和现有条目后，使用精确上下文写入；失败补丁没有修改文件。 |

状态：已完成

## Phase 35：实例化 API Workflow 中的随机种子标记

### 必须要实现的目标

- `ComfyWorkflowCompiler` 必须在提交前把活动 `Seed (rgthree)` 节点的 `seed=-1` 前端随机标记转换为非负整数。
- 每次 Generation Run 编译必须独立生成随机 seed；同一个 Run 的 Actual Workflow 与 API Workflow 必须保存该 Run 实际生成的相同 seed，以支持媒体复现。
- Generation Request 显式提供的非负种子必须保持不变。
- 修复不得改变其他 ComfyUI seed 节点；修复不得按模板 ID、ComfyUI 节点 ID 或节点标题写特例。

### 验收清单

- [x] 回归测试复现 `-1` 导致 Impact Wildcard Processor 保留模板旧 `populated_text` 的提交前条件。
- [x] 回归测试证明注入的确定性随机数测试替身产生的 seed 同时进入 Actual Workflow 和 API Workflow；生产默认随机数源不得固定 seed。
- [x] 回归测试覆盖 `Seed (rgthree)` 显式种子保持不变、其他 seed 节点的 `-1` 保持不变和无效随机数源拒绝。
- [x] 完整质量门禁、生产重启和六项健康检查通过。
- [x] 三个真实模板 40 Generation Run 分别产生非 `-1` 且两两不同的随机 seed；每个 Run 的新 `wildcard_text` 均被实例转换为新的 `populated_text`，最终媒体体现各自正面提示词。

### 非本次目标

- 本阶段不修改数据源仓库中的模板 40 Workflow。
- 本阶段不直接覆盖 Impact Wildcard Processor 的 `populated_text`。
- 本阶段不修改 rgthree、Impact Pack 或 ComfyUI 实例文件。

### 已获得的授权

- 用户明确要求修复已确认的 `Seed (rgthree)=-1` 与 Impact Prompt 预处理顺序问题。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 计划修正补丁把 `findings.md` 行误放入 `task_plan.md` 上下文，补丁校验失败 | 1 | 分别定位三个规划文件中的 Phase 35 行并使用精确上下文修正；失败补丁没有修改文件。 |
| 默认随机数测试直接读取 `JsonValue.inputs`，TypeScript 无法证明该值为对象 | 2 | `Array.isArray` 不能排除只读数组联合；测试在运行时对象检查后显式收窄为只读 JSON record。生产代码没有类型错误。 |
| in-app Browser 安全策略禁止刷新 `127.0.0.1:4173` | 1 | 不绕过浏览器策略；使用生产 Host 的真实 Source CLI、compiler、transport 和 runtime 在隔离临时 Repository 中执行三次完整模板 40 调用。 |

状态：已完成

## Phase 34：保留未覆盖模板参数的 Workflow 原始值

### 必须要实现的目标

- Generation Request 没有提供某个运行参数时，Host 必须保留 Workflow 对应输入的保存值。
- Generation Request 显式提供某个模板参数时，Host 必须继续校验参数 ID、值类型和数值范围，并把该值写入 Workflow。
- `required: true` 的模板参数在 Generation Request 缺少显式值时必须继续返回具体错误。
- 通用规则必须覆盖提示词、尺寸、种子和其他模板参数，不得按模板 ID、ComfyUI 节点 ID 或参数 kind 写特例。

### 验收清单

- [x] 回归测试复现元数据 `default_value` 与 Workflow 原始值不一致时，未提供参数导致 Workflow 被错误覆盖。
- [x] 回归测试证明未提供的非必填参数不会进入编译器运行时覆盖集合。
- [x] 回归测试证明显式参数覆盖和 `required: true` 缺值错误保持有效。
- [x] 使用真实模板 40 预编译验证负面提示词、1024×1536 和随机种子原值被保留。
- [x] 完整质量门禁、生产重启和六项健康检查通过。

### 非本次目标

- 本阶段不修改数据源仓库中的模板 40 记录。
- 本阶段不为模板 40、`negative_prompt` 或任何 ComfyUI 节点 ID 增加硬编码分支。
- 本阶段不重新生成此前已经错误完成的媒体。

### 已获得的授权

- 用户明确要求修复模板默认值处理的根本规则，并拒绝模板级或参数级硬编码。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|

状态：已完成

## Phase 33：删除 Generation Tool 的手动 Skill Invocation 门禁

### 必须要实现的目标

- `generate_with_comfyui` 必须允许 Agent 在当前 turn 内通过 Skill Tool 取得生成指令后直接创建 Run，不要求用户消息包含 `skill-invocation` source。
- Generation Tool 必须继续从当前 Tool Call、Session 和 Workspace Registry 建立 Run 所有权。
- 项目必须删除不再可达的 `GENERATION_SKILL_INVOCATION_REQUIRED` 错误码和前端文案。

### 验收清单

- [x] 单元测试证明没有 `skill-invocation user/message` 的合法 Generation Tool Call 可以创建 Run。
- [x] 单元测试证明 Agent-side Skill Tool Call 后的 Generation Tool Call 可以创建 Run。
- [x] 单元测试证明缺少匹配 Generation Tool Call 的执行上下文仍被拒绝。
- [x] 完整质量门禁、生产重启和六项健康检查通过。

### 非本次目标

- 本阶段不修改 ComfyUI Workflow 编译、Resolver Tool、Prompt 重写、媒体存储或右侧栏。
- 本阶段不修改 Harness 核心事件模型或 Skill Tool 实现。

### 已获得的授权

- 用户明确拒绝要求手动 `/comfyui-generate` 或 UI 点选技能才能调用 Generation Tool 的事件门禁。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|

状态：已完成

## Phase 32：真实双 LoRA Skill 生成验收

### 必须要实现的目标

- 计划执行者必须选择一个真实 Workflow 模板、一个与模板具有相同 `base_model_id` 的生成模型和两个与该底模兼容的 LoRA，并通过真实 Resolver Tool 取得每个 LoRA 的介绍、用途、触发词、默认权重和文件名。
- `comfyui-generate` Skill 必须以一条已存在的基础 Prompt 为输入，结合生成模型与两个 LoRA 的语义重写最终 Prompt；最终 Prompt 必须保留原画面主体、动作、构图和场景，并且每个实际采用的触发词只出现一次。
- 同一项 Generation Request 必须把两个 LoRA 作为两个结构化 `loras` 执行对象提交；两个执行对象必须使用不同的明确权重。
- Generation Request 必须把用户选择的生成模型作为结构化 `model` 执行对象提交；Workflow compiler 必须把模板中保存的默认生成模型替换为目标实例中的所选生成模型路径。
- 真实 ComfyUI 实例必须完成 `/prompt`、Jobs 状态观察、媒体下载、分片保存和逐 Run Actual Workflow 保存。

### 验收清单

- [x] Harness Session 事件证明 `/comfyui-generate` Skill Invocation 出现在所有 Resolver Tool Call 和 Generation Tool Call 之前。
- [x] Resolver Tool Result 证明模板、生成模型和两个 LoRA 的 `base_model_id` 相同，并保留两个 LoRA 的实际语义字段。`template.model_id` 与所选生成模型的 `model_id` 不要求相同。
- [x] Actual Workflow 与 API Workflow 使用目标实例中的所选生成模型路径，没有继续使用模板保存的默认生成模型。
- [x] Actual Workflow 包含两个实例实际 LoRA 路径、两个不同权重和 Skill 重写后的最终 Prompt；每个采用的触发词在最终 Prompt 中只出现一次。
- [x] Run 到达 `succeeded`，保存一项真实媒体；媒体记录指向该 Run 的 Actual Workflow。
- [x] 验收结束后运行相关自动化测试、生产健康检查和 `git diff --check`。
- [x] Generation Tool 合同测试覆盖可选结构化 `model` 对象；Run 恢复测试证明模型 ID 和文件名进入持久化请求。
- [x] Workflow compiler 测试覆盖模型路径成功替换、路径分隔符映射、目标实例缺少文件、同名文件路径不唯一、模型输入不存在和模型输入不唯一。
- [x] Workflow compiler 测试证明连接到上游字符串节点的 `CLIPTextEncode.text` 旧 binding 不会吞掉最终 Prompt；编译后的 API Workflow 在实际执行的上游输入中包含最终 Prompt。

### 非本次目标

- 本阶段不修改数据源仓库、ComfyUI 实例文件、Harness 核心源码或已发布的 `v0.3` 标签。
- 本阶段不把编译器单元测试、手工提供最终 Prompt 或 mock transport 作为真实 Skill Prompt 改写的替代证据。
- 本阶段不在没有真实双 LoRA 执行能力的 Workflow 中自动新增 LoRA 节点。

### 已获得的授权

- 用户已明确要求执行真实 LoRA 启用、多个 LoRA、不同权重、触发词设置和 Prompt 改写测试。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| Template 35 no longer exists in the production catalog | 1 | Selected current catalog template 40, which contains a real multi-LoRA node and remains compatible with model family 2. |
| The first live `/object_info` diagnostic printed complete LoRA resource arrays and exceeded the tool output budget | 1 | Preserve the extracted template/node/compatibility facts in `findings.md`; subsequent diagnostics must print only basename intersections and selected node serialization fields. |
| Template 40 uses `Power Lora Loader (rgthree)`, which the compiler does not recognize as an executable structured LoRA input | 1 | Inspect the real UI-to-API serialization contract and add the smallest deterministic compiler support with success and rejection tests before the real Run. |
| `find-docs` requires downloading and executing unpinned `ctx7@latest` | 1 | Do not execute it; use read-only official rgthree GitHub source pages as the external technical source. |
| Planning-file patch used an incomplete hunk while appending rgthree findings | 1 | Inspect the existing Phase 32 headings and apply a context-complete patch; no source file was modified by the rejected patch. |
| `pnpm exec tsx` is unavailable in the locked dependency set | 1 | Do not install a package; run the local TypeScript diagnostic with Node's built-in type stripping instead. |
| Direct `loadProfile('production')` omitted the managed production environment and found blank profile path placeholders | 1 | Load the already materialized values from `.local/source-production-managed.json`, which is the production lifecycle's authoritative runtime snapshot. |
| The initial Power Lora widget-preservation implementation used `findLastIndex`, which is outside the repository TypeScript library target | 1 | Replace it with one indexed pass; the focused 26-test suite and TypeScript check then pass. |
| Browser client module no longer exports `BrowserClient.create()` | 1 | Inspect the installed module export and initialize through its current `setupBrowserRuntime` entry point; do not use an alternate browser-control mechanism. |
| Reloading the claimed pre-restart Harness tab exceeded the browser control timeout and reset the browser session | 1 | Reinitialize the browser binding, read the packaged browser troubleshooting guidance, and use a fresh local tab instead of reloading the stale claimed tab. |
| A fresh in-app-browser tab also timed out while navigating to the healthy localhost Harness URL | 1 | The Harness HTTP health check already passes; switch the UI verification to the available external Chrome browser because the user did not constrain the browser family. |
| Router Standard created `comfyui-generation-run-40.md` before allowing Resolver Tools | 1 | Preserve it until the active Harness turn ends, then remove this test-only scope-creep artifact with `apply_patch`; it is not a product deliverable. |
| Real Resolver results show template 40 saves `model_id: 15`, while selected model 1 and LoRA 68/69 use `model_id: 1` | 1 | Correct the Skill contract: equal `base_model_id` permits replacing the template default model; carry selected model 1 through the Tool and replace the Workflow model resource before submission. |
| Live template 39 preparation reports `GENERATION_PARAMETER_TARGET_AMBIGUOUS` for `seed` | 1 | Inspect the template's advisory binding target and active seed topology, add a public compiler regression test for the stale/inactive hint path, and make the smallest deterministic correction before real submission. |
| Seed regression test patch used an obsolete test name | 1 | Locate the current test name and apply the regression at the existing public compiler seam; the rejected patch modified no file. |
| Planning-file correction patch used an obsolete Phase 32 heading | 1 | Inspect the current planning-file headings and patch the active Phase 32 sections; the rejected patch modified no file. |
| Semantic-correction patch assumed a stricter catalog Tool schema assertion than the current test contains | 1 | Inspect the current assertion and update it in place together with the semantic corrections; the rejected patch modified no file. |
| Upstream Prompt regression used `toMatchObject` on a six-item widget array while asserting only its first item | 1 | Assert `widgets_values[0]` directly; the API Workflow and named-widget assertions already proved the intended execution path. |
| Direct test indexing of the JSON-union `widgets_values` property failed TypeScript narrowing | 1 | Narrow the property with `Array.isArray` before reading its first item. |
| Template 40 live preparation no longer used its connected width binding and generic fallback matched three face-detailer `guide_size` widgets | 1 | Trace node 25 width/height links to their executable upstream source and add a regression before correcting deterministic dimension targeting. |
| Full quality gate reached 233 passing behavior tests but function coverage fell from 100% to 99.8% | 1 | Generate function-level coverage metadata, add a public branch fixture for the one uncovered callback, and rerun the complete gate. |
| First real template 40 Run was rejected by ComfyUI validation | 1 | Preserve the full instance response, add regressions for sole-choice widget normalization and mode-4 bypass link projection, then repeat a new real Harness Skill Run. |
| Template 40 bypassed `VAEEncode` output had no compatible executable input | 1 | Omit only unresolved optional bypass inputs, preserve the active target widget value when present, and keep unresolved required inputs as explicit compile failures. |
| Bypassed `VAELoader` was incorrectly reduced to its filename widget | 1 | Follow official ComfyUI `graphToPrompt()` behavior: do not inline widgets from ordinary bypassed backend nodes; preserve the target node widget value or omit the unresolved optional branch. |
| The optional-bypass test fixture narrowed its input object type before changing `latent` from optional to required | 1 | Use a separate required-input compiler fixture; the production implementation did not have a TypeScript error. |
| Chrome locator wrapper does not expose `focus()` | 1 | Send Enter directly to the media tab locator; the tab selected and exposed the real media card, original-file link, and per-media Workflow button. |

状态：已完成

## Phase 31：修复 Agent Preset 与 Workbench Profile 重复注入 Skill

### 必须要实现的目标

- `comfyui-workbench` Profile 必须停止注册由所选 Agent Preset 负责注册的 `skill-filesystem` 和 `tool-skill` Harness 插件。
- Standard Agent Preset 与 Router Agent Preset 必须继续发现工作区 `.agents/skills/comfyui-generate/SKILL.md`，并在用户调用 `/comfyui-generate` 时各自只保存一项 `skill-invocation` 事件。
- 修复不得修改 `comfyui-generate` Skill 内容、Router 阶段策略、Generation Tool 注册或 Harness 源码。

### 验收清单

- 自动化测试拒绝 `profiles/comfyui-workbench/cordis.patch.yml` 再次启用 `skill-filesystem` 或 `tool-skill`。
- Standard Session 调用 `/comfyui-generate` 后，Session 事件中 `name: "comfyui-generate"` 且 `form: "instructions"` 的 `skill-invocation` 数量精确等于 1。
- Router Session 调用 `/comfyui-generate` 后，Session 事件中 `name: "comfyui-generate"` 且 `form: "instructions"` 的 `skill-invocation` 数量精确等于 1。
- 两种 Agent Preset 仍能在允许 Generation Tool 的阶段调用 `query_semantic_comfyui_templates` 和 `generate_with_comfyui`。
- Phase 31 定向测试、20 项 contract/security 测试、14 项 production 测试、27 项 prototype 测试、Standard 与 Router 真实 Session 验收和 Harness 健康检查必须通过；完整 quality 的 unit/integration 测试必须全部通过，并且 coverage 报告必须确认剩余覆盖率缺口只来自当前 HEAD 中正在进行的 Phase 30 新增代码。

### 非本次目标

- 本阶段不修改 Router Agent Preset 的阶段数量、阶段 Tool 白名单或阶段切换条件。
- 本阶段不修改 Standard Agent Preset、Router Agent Preset、Harness 核心包或外部 `dsh-routing-suite` 仓库文件。
- 本阶段不修改 Generation Run、媒体存储、上下文弹窗或右侧栏实现。

### 已获得的授权

- 用户已明确要求先修复 Standard Session 与 Router Session 重复注入同一份 `comfyui-generate` Skill 的问题。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| Standard Session 与 Router Session 都保存了两项完全相同的 `comfyui-generate` instructions 类型 Skill Invocation | 1 | rc.2 `tool-skill` 源码证明每个插件实例都注册一项 slash `agent/pre-step` 监听器；移除 Workbench Profile 的宿主层实例后，两种 Agent Preset 都只保存一项 Skill Invocation。 |
| 完整 `pnpm quality` 在 coverage 阶段失败 | 1 | 25 个文件和 218 项 unit/integration 测试全部通过，但当前 HEAD 中正在进行的 Phase 30 新增代码使函数覆盖率为 99.2%，低于全局 100% 门禁；Phase 31 的 20 项 contract/security、14 项 production、27 项 prototype 和真实 Session 验收均通过。 |

状态：已完成；工作树全局函数覆盖率缺口由正在进行的 Phase 30 继续处理。

## Phase 30：修复 LoRA 与生成模型上下文的实例参数注入

### 必须要实现的目标

- `comfyui-generate` Skill 必须使用当前消息中 `data.kind: "lora"` 与 `data.kind: "model"` 对象的 `data.id` 调用数据源 Catalog CLI 对应的 resolve Agent Tool；Skill 不得要求用户取消已经选择的 LoRA 或生成模型。
- LoRA resolve Agent Tool 必须向 Agent 返回数据源 CLI 的 LoRA 标识、文件名、介绍、用途、触发词和默认权重；生成模型 resolve Agent Tool 必须返回数据源 CLI 中用于识别和选择生成模型的语义信息与文件名。
- Skill 必须使用 LoRA 的介绍、用途和触发词理解 LoRA 对当前画面要求的作用，并以此前 Prompt Builder Skill 已生成的 Prompt 为输入重写该 Generation Request 的最终正向提示词；Skill 必须把最终正向提示词写入模板的 `positive_prompt` 参数，并把默认权重映射到当前 Workflow 模板明确声明的 LoRA 权重参数。
- Generation Host 必须把数据源文件名与目标 ComfyUI 实例 `/object_info` 返回的资源选项进行精确文件名匹配，把实际 `底模名/文件名` 及目标实例使用的路径分隔符写入 API Workflow；Skill 不得拼接实例目录或路径分隔符。
- Generation Host 必须使用当前 Workflow widget 结构、活动连线和目标实例 `/object_info` 定位显式运行参数。参数目标不存在或不唯一时，Host 必须返回包含具体运行参数键的错误。
- Skill 必须把每项解析后的 LoRA ID、文件名、实际采用权重和实际采用触发词作为结构化 LoRA 选择传入 `generate_with_comfyui`。Generation Host 必须使用目标实例 `/object_info` 与当前 Workflow 的实际节点输入结构注入 LoRA。
- Skill 必须把解析后的生成模型 ID 与模板 resolver 返回的 `model_id` 比较；两者一致时继续生成，两者不一致时报告所选生成模型与模板绑定模型不兼容。当前模板没有声明生成模型覆盖能力时，Host 保留模板模型节点值。
- Skill 必须把已经包含实际采用触发词的最终 Prompt 写入 `positive_prompt` 参数，并把同一组实际采用触发词写入对应的 `lora_trigger_word` 参数用于请求追溯。Generation Host 不得通过 `compose_text` 再次重复写入触发词。
- 计划执行者必须使用真实 Harness、真实数据源 CLI、真实 Workflow 模板和真实 ComfyUI 实例验证 LoRA 与生成模型上下文能够完成解析、模板参数注入、异步生成、媒体保存和逐媒体 Actual Workflow 下载。

### 验收清单

- 当前消息包含 LoRA 或生成模型上下文时，Skill 在任何 `generate_with_comfyui` Tool 调用前完成对应 resolve Agent Tool 调用；Skill 不再输出取消选择或结束执行的要求。
- LoRA resolve 结果中的文件名、介绍、用途、触发词和默认权重均保留数据源 CLI 的实际字段语义；Agent Tool 不创建 `subtitle` 或其他替代字段。
- Actual Workflow 中的标准 LoRA 节点路径精确等于目标实例 `/object_info` 返回的可选值，并满足 `底模名/文件名` 目录结构；LoraManager 节点使用目标实例可识别的 `<lora:底模名/文件名:权重>` 文本。macOS 与 Windows 实例分别保留各自路径分隔符。
- Actual Workflow 中的 LoRA 权重等于 Agent 采用的 resolve 默认权重或用户明确覆盖值；正向提示词是 Skill 根据此前 Prompt Builder 结果、LoRA 介绍、用途和触发词重写后的最终 Prompt。
- 当前消息选择的生成模型 ID 与模板 resolver 的 `model_id` 一致时，Skill 能够继续生成；不一致时 Skill 在创建 Run 前报告两个具体 ID。模板明确声明生成模型运行参数时，Actual Workflow 中的生成模型节点值必须等于目标实例实际枚举的模型路径。
- Actual Workflow 的正向提示词节点必须包含 Skill 重写的 Prompt 与 Skill 根据每项 LoRA 语义选用的触发词；同一触发词不得因 `lora_trigger_word` 参数再次重复写入。
- 自动化测试覆盖 LoRA resolve、生成模型 resolve、缺失或歧义实例资源路径、正反路径分隔符、模板缺少对应参数、默认权重与用户覆盖权重。
- 自动化测试覆盖正向 Prompt、负向 Prompt、宽度、高度、Seed、参考图与当前数据源声明的其他 Workflow 参数；测试必须覆盖有效 binding 优先提示、缺少 binding、旧 binding 目标失效、目标不存在和目标歧义分支。
- 自动化测试覆盖标准 `lora_name` 输入、`LoraLoaderModelOnly`、LoraManager `text`/`lora_syntax` 输入以及用户提供的无 LoRA 节点 Workflow；产品代码不得依赖数据源 LoRA binding 或固定节点 ID 注入参数。
- 至少一次同时包含真实 LoRA 上下文与兼容生成模型上下文的运行完成异步终态、媒体保存、右栏展示与逐媒体 Workflow 内容核对；完整 `pnpm run quality`、生产重启和健康检查通过。

### 非本次目标

- 本阶段不修改数据源仓库、Harness 核心源码、ComfyUI 服务端源码或实例模型文件。
- 本阶段不在 Skill 中硬编码 ComfyUI 实例目录、底模名或路径分隔符。
- 本阶段不为没有可执行 LoRA 输入的 Workflow 自动新增 ComfyUI 节点。
- 本阶段不增加未经安全审计和固定版本的依赖。

### 已获得的授权

- 用户已明确要求 Skill 调用数据源 CLI 取得 LoRA 触发词、默认权重、用途和介绍，并设置 Workflow 模板对应节点的值。
- 用户已明确要求 `comfyui-generate` Skill 根据 LoRA 语义重写此前 Prompt Builder Skill 已生成的 Prompt，而不是只机械追加触发词。
- 用户已明确指出数据源文件名不是实例实际资源路径；实际 LoRA 路径必须使用 `底模名/文件名` 目录结构并适配不同实例的路径分隔符。
- 用户此前已授权修改、测试、重启当前 Harness 插件，并使用已登记的真实 ComfyUI 实例执行完整生成验证。
- 用户已明确要求 Generation Host 不得读取或检查 Source 模板参数与绑定元数据。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 当前 Skill 把 LoRA 与生成模型上下文视为不可执行选择，并要求用户取消选择后结束本次执行 | 1 | Phase 30 将改为通过数据源 resolve Agent Tool 取得语义与执行数据，再按模板参数和目标实例资源枚举完成注入。 |
| 生产数据源 Source CLI 文件没有可执行权限，直接调用返回 `permission denied` | 1 | 按 `GenerationSourceCli.runSourceCliProcess()` 的既有规则使用当前 Node.js 运行该本地 `.mjs` 文件。 |
| 当前 36 个 Workflow 模板均未公开生成模型运行参数 | 1 | Skill 解析生成模型后校验其 ID 与模板绑定的 `model_id`；当前模板没有声明生成模型参数时不改固定节点，模板明确声明参数后才执行参数覆盖。 |
| 初次定位 Source preparer 测试时使用了不存在的 `tests/unit/generation-source-preparer.test.ts` 文件名 | 1 | 使用 `rg` 定位到实际测试文件 `tests/unit/generation-preparer.test.ts`。 |
| 初始运行参数实现把 Source 模板绑定元数据当成参数目标 | 1 | Phase 38 删除该数据流，并使用 Workflow widget 结构、活动连线和目标实例 `/object_info` 定位运行输入。 |
| 使用包含反引号的未引用 `rg` 搜索表达式时，zsh 尝试执行 `bindings_json` | 1 | 后续 shell 搜索表达式使用单引号或不包含反引号的固定文本；该只读命令仍返回了文件内容，没有修改文件。 |
| 只读实例节点调研首次尝试 `pnpm exec tsx`，当前项目没有安装 `tsx` | 1 | 不安装依赖；改用 Node.js 内置 `child_process` 调用本地 Source CLI，并在内存中请求实例 `/object_info`。 |
| 第一轮目标测试 79 项全部通过，但 TypeScript 报告内部 `compile()` 返回值缺少外层才添加的 `actualWorkflow` | 1 | 把内部 `compile()` 返回类型收窄为 `Omit<WorkflowCompilerResult, 'actualWorkflow'>`；公开 compiler 仍返回完整结果。 |
| 参数编译职责移入 Workflow compiler 后，旧 preparer 测试仍断言 preparer 已直接修改 `widgets_values` | 1 | 更新测试职责边界：preparer 断言传递已解析参数与 binding 提示，Workflow compiler 测试断言 Actual Workflow 和 API Workflow 的最终参数值。 |
| 浏览器重启后复用的旧 Session 保留了一个不可提交的受控草稿；发送按钮保持禁用，两个“新建会话”按钮也没有离开该 Session | 1 | 不继续修改该旧 Session；切换到已有可发送的生成 Session，或通过 Harness 公开会话接口创建新 Session 后再执行真实 Tool 验证。 |
| 完整质量门禁首次报告函数覆盖率 99.2% | 1 | 为持久 LoRA 恢复、重复 binding 提示去重和参考图参数定位补充显式分支测试；最终函数覆盖率为 100%。 |
| JSON coverage 诊断首次复用了 zsh 只读变量 `status` | 1 | 重试时使用任务专用变量 `coverage_exit_code`，成功定位四个未覆盖回调。 |
| LoRA resolver 的 `weight` 描述仍指向模板 `lora_model_weight` 参数 | 1 | 把字段归属修正为当前 `generate_with_comfyui.loras` 项的默认模型权重；定向测试和独立语义复审均通过。 |

状态：已完成

## Phase 29：发布 v0.30.1

### 必须要实现的目标

- 发布负责人必须把根 `package.json.version` 更新为 `0.30.1`，执行完整质量门禁，并把当前已验证的 Harness ComfyUI 插件源码提交到 `main`。
- 发布负责人必须等待源码提交的 GitHub CI 成功，再更新 `README.md`、`docs/releasenotes.md` 和 `docs/system/releasing.md`。
- 独立语义审核者必须审核 v0.30.1 发布说明与版本入口；发布负责人修正审核问题后再次执行完整质量门禁，提交并推送文档变更，并等待最终提交的 GitHub CI 成功。
- 发布负责人必须在最终提交完整 SHA 上创建并推送 `v0.30.1` 注释标签，再创建无附件的 GitHub Release，并核对远端标签、Release 标签、标题、说明、URL 和附件列表。

### 验收清单

- 根 `package.json.version` 精确等于 `0.30.1`，目标 Git 标签精确等于 `v0.30.1`。
- 两次提交都推送到 `origin/main`，对应 GitHub CI 都成功。
- `README.md` 当前版本入口、`docs/releasenotes.md` 和 `docs/system/releasing.md` 的 v0.30.1 发布命令与发布内容一致。
- `v0.30.1` 远端标签和 GitHub Release 都指向最终文档提交完整 SHA；GitHub Release 不包含附件。
- 发布后 `git status --short` 只保留本次发布明确排除的用户未跟踪文件。

### 非本次目标

- 本阶段不构建或上传产品安装包、归档文件或其他 GitHub Release 附件。
- 本阶段不提交现有未跟踪的 `docs/research/` 文件。
- 本阶段不修改或重建已经发布的 `v0.2` 及更早标签。

### 已获得的授权

- 用户已明确要求提交当前变更并发布版本 `v0.30.1`。
- 用户已授权向当前仓库的 `origin/main` 推送提交、推送 `v0.30.1` 标签并创建对应 GitHub Release。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 第一次 `pnpm run quality` 的工程合同仍断言根版本为 `0.3.0` | 1 | 把 `tests/contract/engineering-baseline.test.ts` 的版本合同同步为 `0.30.1`，重新执行完整质量门禁。 |
| 第一轮发布文档审核发现发布说明错误宣称 transport 能发起 Jobs 取消，并把 Host 运行错误码错误归属为实例返回值 | 1 | 发布说明改为 transport 识别实例取消状态，并区分 Host 运行错误码与实例返回的 `error`、`node_errors`。 |

状态：已完成

## Phase 28：单轮多次异步生成与逐媒体 Workflow 验证

### 必须要实现的目标

- `comfyui-generate` Skill 必须把当前用户消息中明确分开的多个生成要求识别为多个 Generation Request；每个 Generation Request 必须拥有独立标题、正向提示词和运行参数。
- Skill 必须在第一次调用 `generate_with_comfyui` 前完成全部 Generation Request 的模板参数映射与校验，然后按用户声明顺序为每个 Generation Request 调用一次 `generate_with_comfyui`。
- 真实 Harness 验证必须在一个数字 turn 内保存一项 `comfyui-generate` Skill Invocation、两项 Generation Tool Call、两个不同 `run_id` 和两个独立异步生命周期。
- 两个真实 Run 必须使用不同正向提示词、宽度、高度和 Seed，并分别保存不同的媒体文件。
- 每张媒体的 Workflow 下载接口必须返回该媒体所属 Run 的 Actual Workflow；两个下载结果中的正向提示词、宽度、高度和 Seed 必须分别等于各自 Generation Request 的值。

### 验收清单

- Skill 单请求路径继续只调用一次 Generation Tool；多请求路径按请求数量调用 Generation Tool。
- 多请求中的任一参数映射或必填参数校验失败时，Skill 报告具体 Generation Request 和 `parameter_id`，不调用 `generate_with_comfyui`，不创建任何 Run。
- 真实 Session 同一数字 turn 包含两个不同 `call_id` 与两个不同 `run_id`；Run Repository 中两个 Run 的 `turn` 相同。
- 两个 Run 都进入终态并各自保存至少一个媒体；媒体二进制内容、尺寸或画面内容能够区分。
- 两个逐媒体 Workflow 下载响应来自不同 Run，并且正向提示词、宽度、高度和 Seed 与两个请求逐项一致。
- Skill 合同测试、完整 `pnpm run quality`、生产重启、健康检查和真实浏览器验收全部通过。

### 非本次目标

- 本阶段不把多个 Generation Request 合并成一个批量 Tool 参数或一个 Generation Run。
- 本阶段不把一个 Run 的媒体或 Actual Workflow 复用于另一个 Run。
- 本阶段不修改 Harness 核心源码、ComfyUI 服务端源码或数据源仓库源码。

### 已获得的授权

- 用户已要求验证一个用户轮次内由 Skill 创建两个不同宽高的异步任务。
- 用户已要求两个异步任务生成不同媒体，并要求逐媒体下载的 Workflow 内容确实不同。
- 用户此前已授权修改、测试、重启当前 Harness 插件，并使用已登记的真实 ComfyUI 实例执行生成任务。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 当前 `comfyui-generate` Skill 明确要求只调用一次 `generate_with_comfyui`，无法满足单轮多个 Generation Request | 1 | Phase 28 将 Skill 改为先校验全部请求，再按用户顺序为每个请求调用一次 Generation Tool。 |
| 浏览器把包含两项 Generation Request 的长消息逐字写入时超过单次执行时限，浏览器控制会话被重置 | 1 | 重新连接当前 Harness 标签页，先检查消息是否已经发送；未发送时分多次写入短消息片段。 |
| 第一次数据库证据查询把 Generation Run 终态列写成不存在的 `state` | 1 | 读取 `generation_runs` 表结构后改用实际 `status` 列，并重新查询两个 Run 与媒体归属。 |

状态：已完成

## Phase 27：多模板真实实例覆盖验证

### 必须要实现的目标

- 计划执行者必须通过数据源仓库已实现的 Catalog CLI 读取全部可用 Workflow 模板，并按参数类型、ComfyUI 节点类型、输出类型和目标实例兼容性建立覆盖矩阵。
- 计划执行者必须对全部可用 Workflow 模板执行真实 Source 解析和真实实例 `/object_info` 编译验证；验证不得使用 mock transport 或 mock fetch。
- 计划执行者必须选择结构互不重复的多个 Workflow 模板，通过真实 Harness 上下文选择、`comfyui-generate` Skill、Resolver Tool、Generation Tool 和真实 ComfyUI 实例执行端到端运行。
- 每个端到端运行必须记录模板 ID、实际实例、`run_id`、终态、具体实例错误或保存媒体；发现产品实现缺陷时必须增加回归测试、修复并重新执行受影响模板。

### 验收清单

- 覆盖矩阵包含 Catalog 返回的每个可用 Workflow 模板，并明确每个模板的参数类型与关键节点差异。
- 每个可用 Workflow 模板至少完成一次真实 `/object_info` 编译或记录目标实例返回的具体不兼容节点。
- 至少三个结构不同的 Workflow 模板完成真实 `/prompt` 提交；可生成模板必须完成 Jobs 状态观察、媒体下载、分片保存和右栏展示。
- Harness 消息中的模板上下文继续只包含模板 ID 和标题；每次 Resolver Tool 和 Generation Tool 调用都不传完整 Workflow JSON。
- 新发现的问题具有对应回归测试；最终 `pnpm run quality`、生产健康检查和浏览器右栏验收全部通过。

### 非本次目标

- 本阶段不修改 Harness 核心源码、ComfyUI 服务端源码或数据源仓库源码。
- 本阶段不为缺失的 ComfyUI 自定义节点或模型自动安装外部代码、节点包或模型文件。
- 本阶段不把多个模板的运行结果合并为一个 Run，也不复用其他 Run 的 Actual Workflow。

### 已获得的授权

- 用户已授权使用模板 37 以外的真实 Workflow 模板执行实例测试，以暴露更多模板适配问题。
- 用户此前已授权修改、测试、重启当前 Harness 插件，并使用已登记的真实 ComfyUI 实例执行生成任务。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 模板 37 默认 LoRA 路径在 `mac mini` 使用反斜杠，实例枚举使用正斜杠；相同模板值在 `win3080` 反而精确匹配 | 1 | 为 Workflow 编译器增加目标实例 COMBO 路径分隔符的唯一匹配转换；保留零匹配和多匹配时的实例错误。 |
| 浏览器第一次提交模板 37 时直接重写消息编辑器，导致 Harness 移除已经选择的 `comfyui-generate` Skill 调用来源 | 1 | 浏览器重新从原生 `/` 菜单选择 Skill，并在 `/comfyui-generate` 后追加模板 JSON；Host 门禁随后允许 Generation Tool 调用。 |
| 模板 34 可以根据 `mac mini` 的 `/object_info` 编译节点类型，但实例 `/prompt` 拒绝缺失的 `qwen_image_HDR_vae_fp32_comfy.safetensors`，并报告节点 20 的连线 `KeyError` | 1 | Host 保留 2298 字符的实例原始错误并由右栏 Modal 完整展示；本阶段不修改数据源模板、实例模型或 ComfyUI 节点。 |

状态：已完成

## Phase 26：修复模板最小上下文、Workflow 解析和运行错误详情

### 必须要实现的目标

- Client Module 必须只把 Workflow 模板的 `id` 和 `title` 写入消息中的 `comfyui-context` JSON；Client Module 不得把模板参数定义或完整 Workflow JSON写入消息草稿。
- `comfyui-generate` Skill 必须按模板 ID 查询模板参数定义，并使用 `template_id` 与运行参数调用 `generate_with_comfyui`；Skill 不得把完整 Workflow JSON 作为 Tool 参数发送。
- Generation Host 必须接受缺少 `widgets_values` 的合法 ComfyUI UI Workflow 节点，并在准备实际 Workflow 时只校验 Harness 必须修改的绑定目标。
- Generation Host 必须保留具体运行错误信息；Generation Remote 必须把 `errorCode` 和 `errorMessage` 投影给当前 Session；右侧运行卡片必须提供“错误详情”按钮并使用 Harness 原生 Modal 展示完整错误。
- 计划执行者必须在修复后使用已登记的真实 ComfyUI 实例完成模板解析、实例对象信息读取、任务提交、状态观察、媒体下载、持久化和右栏展示的端到端验证。

### 验收清单

- 选择模板后，输入框中的模板上下文只包含 `type`、`data.kind`、`data.id` 和 `data.title`。
- Skill 能够使用模板 ID 取得参数定义，并且 `generate_with_comfyui` Tool Call 不包含完整 Workflow JSON。
- 模板 37 中缺少 `widgets_values` 的 `VAEDecode` 节点不再触发 `SOURCE_PROTOCOL_ERROR`。
- 数据源响应结构错误继续使用 `SOURCE_PROTOCOL_ERROR` 错误码，但右侧错误详情同时显示数据库保存的具体 `errorMessage`，具体错误不再被通用文案或单行省略隐藏。
- 自动化测试覆盖模板最小上下文、Skill 模板参数解析入口、缺少 `widgets_values` 的合法节点、错误消息 Remote 投影、错误详情 Modal 和关闭交互。
- `pnpm quality`、`git diff --check`、生产重启、真实 ComfyUI 实例完整生成和浏览器右栏验收全部通过。

### 非本次目标

- 本阶段不修改 Harness 核心源码、`node_modules/@deepseek-ai/*` 或 ComfyUI 服务端源码。
- 本阶段不把完整 Workflow JSON 暴露给 Message Context、Agent Tool 参数或浏览器 Remote。
- 本阶段不改变 Generation Run、Media 和逐媒体 Actual Workflow 的持久化归属关系。
- 本阶段不新增未经安全审计和固定版本的依赖。

### 已获得的授权

- 用户已要求模板上下文只插入模板 ID 和标题。
- 用户已要求 Host 不因合法 Workflow 节点缺少可选 UI 字段而在请求实例前拒绝模板。
- 用户已要求右侧列显示具体运行错误，并提供查看完整错误的交互。
- 用户此前已授权修改、测试、重启当前 Harness 插件，并使用真实 ComfyUI 实例验证生成全流程。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 模板 37 的合法 `VAEDecode` 节点没有 `widgets_values`，Host 把节点数组下标 6 作为协议错误返回 | 1 | Phase 26 将把 `widgets_values` 改为可选字段，并用模板 37 的真实结构建立回归测试。 |
| 第一轮目标测试中 5 个旧 fixture 仍然期待模板上下文参数全集或右栏通用错误文案 | 1 | 计划执行者把旧 fixture 更新为最小模板上下文和“错误详情”交互，目标测试 62/62 通过。 |
| 第一轮类型检查发现 Tool 输出的只读参数数组与 `defineTool` 推导的可变 JSON 输出不一致，并发现 preparer fixture 直接索引可选 `widgets_values` | 1 | Tool 在输出边界复制参数数组；fixture 在索引前检查数组类型。 |
| 完整质量门禁的 189 项测试全部通过，但新增 Tool renderer 和错误弹窗底部关闭回调未被测试，函数覆盖率为 99.52% | 1 | 计划执行者增加 Tool renderer 输出断言，并通过弹窗底部“关闭”按钮执行关闭回调。 |
| 第二次完整质量门禁在类型检查阶段发现通用 `ToolDefinition.execute()` 的测试结果类型为 `unknown`，不能直接传入 renderer 的 `JsonValue` 参数 | 2 | 测试在已断言结构化结果后仅在 renderer 调用边界收窄该值，不修改产品类型或运行行为。 |
| 第三次完整质量门禁函数覆盖率为 99.76%；覆盖报告定位到错误 Modal 的原生 `onClose` 回调未执行 | 3 | 同一交互测试分别执行底部“关闭”按钮与原生 Modal 关闭入口。 |
| 真实实例首次接收模板 37 后返回 `COMFYUI_PROMPT_REJECTED`；实例错误指出模板默认 LoRA 使用反斜杠路径，而 `mac mini` 实例登记的是正斜杠路径 | 1 | 右侧 Modal 完整显示实例 `node_errors`；第二次运行显式传入该实例真实 LoRA 路径，任务完成并保存媒体。 |
| 浏览器在空白 Session 转为已保存 Session 时按 Harness 原生布局逻辑收起 `details` 列，压缩状态下的按钮无法正常交互 | 1 | 通过中列原生“生成结果”按钮重新调用 `layout.openDetails()`；展开后错误详情 Modal、标签切换和媒体卡片交互全部可用。 |
| 独立语义复审发现 `/prompt` 返回不同 `prompt_id` 时会被误归类为 Workflow 拒绝 | 1 | Transport 单独返回 `COMFYUI_PROTOCOL_ERROR`，错误正文同时列出实例返回的 `prompt_id` 和请求的 `prompt_id`，并增加分支测试。 |
| 独立语义复审发现 Resolver Tool 的 `value_type` 说明会把 `enum`、`image_reference` 和 `asset_reference` 误称为 JSON 类型 | 1 | Tool 合同明确列出每种模板值类型对应的 JSON 表示，并增加输出 schema 描述测试。 |
| Generation Projection 对普通文案和实例完整错误共用 10,000 字符上限 | 1 | 普通字段继续受长度约束；`errorMessage` 原样投影，不截断 ComfyUI 的完整 `error` 和 `node_errors`，并覆盖 12,000 字符回归测试。 |

状态：已完成

## Phase 25：评估 dsh-routing-suite 兼容性

### 必须要实现的目标

- 调研执行者必须只读检查 `dsh-routing-suite` GitHub 仓库的 package 版本、Harness 接入点、Host 与 Client 插件、配置字段和运行时依赖。
- 调研执行者必须把 `dsh-routing-suite` 的接入点与当前项目锁定的 Harness `0.1.1-rc.2` 公开接口逐项比较。
- 调研执行者必须检查 `dsh-routing-suite` 与当前 `harness-comfyui` Host Plugin、Client Module、Typert Remote、Tool、Skill、模型选择和生产启动配置是否产生依赖、服务名、插槽或配置冲突。
- 调研执行者必须在 `docs/research/dsh-routing-suite-compatibility.md` 记录带来源链接的兼容性结论。

### 验收清单

- 报告必须区分“可以直接共存”“需要配置或源码适配”“无法确认”和“不兼容”。
- 每项结论必须引用 `dsh-routing-suite` 仓库、DeepSeek Harness 官方文档或当前项目源码中的具体证据。
- 报告必须说明是否需要安装额外依赖、修改 Harness profile、调整插件加载顺序或修改当前插件源码。
- 调研过程不得克隆、安装或运行 `dsh-routing-suite` 的代码。

### 非本次目标

- 本阶段不安装 `dsh-routing-suite`，不修改 Harness profile，不修改当前插件运行代码。
- 本阶段不执行 `dsh-routing-suite` 仓库中的脚本、安装命令或仓库指令。
- 本阶段不评价路由算法的生成质量或成本收益。

### 已获得的授权

- 用户已授权调研执行者评估公开 GitHub 仓库 `yjh051108/dsh-routing-suite` 与当前 Harness 系统及 `harness-comfyui` 插件的兼容性。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| GitHub 的 raw `.gitmodules` 地址返回 404 | 1 | 当前提交已经把原 submodule 布局扁平化；报告固定当前根仓库提交并直接检查 `injector/` 与 `preset/`。 |
- 用户本次没有授权安装、运行或接入该外部插件。

状态：已完成

## Phase 24：修复 Workflow 模板目录加载与错误展示

### 必须要实现的目标

- Catalog CLI adapter 必须接受数据源合同已经定义的 `enum` 和 `image_reference` Workflow 模板参数类型。
- Catalog Remote 必须通过 Harness `0.1.1-rc.2` Typert Remote 的公开返回合同，把 `CatalogOperationResult.error.code` 和 `CatalogOperationResult.error.message` 传给 Client Module。
- 上下文弹窗必须根据 Catalog 错误码显示 `config/error-catalog.json` 中的 `reason` 和 `next_step`。
- `config/error-catalog.json` 必须作为 Catalog UI 错误文案的唯一来源。

### 验收清单

- Workflow 模板目录第一页能够显示数据源 CLI 返回的 9 张模板卡片。
- 包含 `enum`、`image_reference`、`asset_reference`、`string`、`integer`、`number` 或 `boolean` 参数的模板均能通过 Host 和 Client 边界校验。
- Catalog 查询失败时，上下文弹窗必须显示 `CATALOG_*` 错误码以及 `config/error-catalog.json` 中的 `reason` 和 `next_step`；上下文弹窗不得继续显示固定文案“目录加载失败。”。
- 底模目录请求失败时，模型选择区域必须显示该请求的错误码、原因和处理提示；资源目录请求失败时，资源卡片区域必须显示该请求的错误码、原因和处理提示。
- 测试必须覆盖 Catalog CLI 查询失败、输出超限和协议错误，Catalog Remote 成功结果与业务失败结果，Client adapter 的 Remote 失败与 Catalog 业务失败，以及上下文弹窗的底模目录错误与资源目录错误。
- `pnpm quality`、`git diff --check`、生产健康检查和 Harness 浏览器交互验证全部通过。

### 非本次目标

- 本阶段不修改数据源仓库、Harness 核心源码或 `node_modules/@deepseek-ai/*`。
- 本阶段不改变上下文弹窗的卡片布局、选择逻辑、分页方式或 Agent 上下文 JSON。
- 本阶段不增加 Workflow 模板编辑或运行参数表单。

### 已获得的授权

- 用户已授权计划执行者修复 Workflow 模板目录加载失败和弹窗缺少具体错误的问题。
- 用户已授权计划执行者重启 Harness 生产实例并通过浏览器验证修复结果。

状态：已完成

## Phase 22：实现真实 Generation Run、媒体存储与右列异步投影

### 必须要实现的目标

- 计划执行者必须先以提交 `e9f78b3` 保存当前 Harness ComfyUI 原型，后续实现提交必须能够与该基线比较和回滚。
- 计划执行者必须实现 `Session 1 → N Run`、`Run 1 → N Media`、`Run 1 → 1 Actual Workflow + 1 API Workflow` 的 SQLite 与文件系统持久化。
- 计划执行者必须为每个不同 Harness Tool `callId` 接纳一个独立 Run，并让相同 `callId` 的重复执行返回原 `run_id`。
- 计划执行者必须实现 Host 生命周期内的异步 coordinator、Source CLI TemplateBundle 读取、ComfyUI 提交/观察/输出下载 adapter 和非终态 Run 重启恢复。
- 计划执行者必须实现 Generation Run Typert Remote、按 `media_id` 返回媒体和所属 Actual Workflow 的同源 HTTP 路由。
- 计划执行者必须把右列静态任务和媒体替换为真实投影，并把 Workflow 下载图标从 Session 级 header 移到每张媒体卡片。
- 计划执行者必须使用 Harness `0.1.1-rc.2` 公开插件、Tool、Remote、WebServer 和原生 Client UI 接口；计划执行者不得修改 Harness 核心或数据源仓库。

### 已确认的 TDD Seam

- `GenerationRuntime.acceptGeneration(identity, request)` 是 Tool 接纳与幂等行为的公开 seam。
- `GenerationRuntime.advance()` 是持久 Run 状态推进与恢复行为的公开 seam。
- `GenerationRuns` 项目 Remote 是 Client 结构化查询的公开 seam。
- `/api/harness-comfyui/media/<media_id>/content` 与 `/api/harness-comfyui/media/<media_id>/workflow` 是浏览器文件响应的公开 seam。
- 右列 Harness Client slot 是任务卡、媒体卡和逐媒体 Workflow 下载交互的公开 seam。

### 验收清单

- 一个 Session 的同一数字 turn 内两个不同 `callId` 产生两个不同 Run 和两份不同 Actual Workflow。
- 一个 Run 的多个媒体都解析到该 Run 的 Actual Workflow；另一个 Run 的媒体不能下载前一 Run 的 Workflow。
- Tool 在 SQLite 持久接纳 `created` Run 后立即返回 `run_id`；Host coordinator 随后异步准备来源快照和两份 Workflow，ComfyUI 执行不阻塞 Tool Result。
- Host 重启后，已有 `prompt_id` 的非终态 Run 继续观察原 Job，`downloading` Run 继续保存未完成输出，`submitting` 且没有可靠 `prompt_id` 的 Run 进入 `submission_unknown`。
- 媒体原文件按随机 `media_id` 两级分片保存；SQLite 不保存媒体二进制；浏览器只能访问 SQLite 记录的相对路径。
- 右列任务按 Run 展示真实状态；右列媒体按 Media 展示真实文件；每张媒体卡片包含自己的 Workflow 下载图标；右列 header 不包含 Workflow 下载按钮。
- 目标单测、集成测试、类型检查、完整 `pnpm quality`、生产重启、生产健康检查和浏览器验收全部通过。
- `code-review` 的 Standards 与 Spec 两个独立审核结果没有未解决的阻断问题。
- 计划执行者提交最终实现到当前分支。

### 非本次目标

- 本阶段不实现跨进程分布式 worker、独立 HTTP 服务、对象存储、云端数据库或媒体 CDN。
- 本阶段不修改 ComfyUI、Harness 核心、`node_modules/@deepseek-ai/*` 或数据源仓库。
- 本阶段不新增未经安全审计和版本锁定的第三方依赖。
- 本阶段不把 Harness Jobs registry 作为 Generation Run 持久状态来源。

### 已获得的授权

- 用户已明确要求执行 Phase 21 已确认的完整方案。
- 用户已明确要求实现前提交当前工作树，提交 `e9f78b3` 已完成该回滚基线。
- 用户已指定 Harness `0.1.1-rc.2` 为实现权威，并授权修改、测试、提交和启动当前 Harness 插件。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 针对安装包的类型搜索只使用 `*.d.ts` 与 `*.ts`，没有命中 rc.2 发布包的实际构建扩展名 | 1 | 计划执行者改为先列出安装包真实文件，再按实际扩展名读取公开声明。 |
| 初次记录 Tool 身份时误把 Code Mode 外层 `rootCallId` 选为 Run 身份 | 1 | 用户不变量要求每次 Generation Tool 调用创建 Run；计划执行者立即改为使用当前 Tool `callId`。 |
| 第一条 GenerationRuntime green 测试通过后，TypeScript 没有从 `Array.isArray()` 正确缩窄只读 JSON 数组联合 | 1 | 计划执行者在对象分支显式收窄为只读 JSON record，不改变运行行为。 |
| SourceGenerationPreparer 首次 green 检查的 fixture 只提供一个 widget 值，但测试 binding 指向索引 1 | 1 | 计划执行者把 fixture 修正为与两个声明 binding 一致的两个 widget 值，并把 Workflow 类型收窄为必填 `widgets_values`。 |
| 生产源码加载首次失败于 Node strip-only 不支持 TypeScript constructor parameter property | 1 | 计划执行者把 Generation Host 类改为显式字段声明，并用 `prod:test` 锁定源码直接加载。 |
| 浏览器首次加载新增 Generation Remote 时，Typert 拒绝第二次注册同名 `harness-comfyui` package | 1 | 计划执行者新增单次 `$mount()` 回归测试，并把 Catalog 与 Generation descriptors 合并为一份 Remote contribution。 |

- **Status:** completed

## Phase 31：安装 Router Standard Agent Preset

### 必须要实现的目标

- 计划执行者必须把 `dsh-routing-suite` 固定提交 `21a7260d961571c77a11705d2b0e6cf7015cc48b` 中的 `preset/router-standard` 复制到生产 Harness 的 Agent Preset 目录。
- 计划执行者必须在复制前核对 Router Standard 文件清单与已审计 SHA-256；计划执行者不得执行外部仓库中的安装脚本、自测脚本或其他程序。
- 计划执行者必须重启 `http://127.0.0.1:4173/` 的 Harness 生产进程，并验证 Router Standard 预设入口与 ComfyUI 工作台能够同时加载。

### 验收清单

- 生产目录 `.local/production/dsh-home/.agent-presets/router-standard` 只包含已审计的 Router Standard 文件。
- 生产 Harness 的 Agent Preset 选择器显示 Router Standard；ComfyUI 工作台入口、中列会话界面与右侧结果列继续可用。
- `pnpm prod:status`、`pnpm prod:health` 与 `git diff --check` 全部通过。
- `dsh-super-injector` 没有被下载、复制、安装或运行。

### 非本次目标

- 本阶段不修改 Router Standard 源码、`comfyui-workbench` Profile、项目 Skill 或 Host Tool。
- 本阶段不运行 Router Standard 的模型会话，不触发 ComfyUI 生成任务，也不调用 `dev_reload_preset_live`。
- 本阶段不解决当前 Profile 与 Agent Preset 同时挂载项目 Skill 时产生的重复 Skill Invocation。

### 已获得的授权

- 用户已授权计划执行者按已验证方案安装 Router Standard，并明确要求不安装 `dsh-super-injector`。
- 用户已授权计划执行者先提交当前主工作树作为回滚点，再复制 Router Standard 并重启生产 Harness。

- **Status:** in_progress（安装、预设发现、生产重启与健康检查已完成；生产页面浏览器验收待完成）

## Phase 23：修复空白 Session 的右侧结果列

### 必须要实现的目标

- Client 插件必须在 Harness `0.1.1-rc.2` 的空白 Session 中显示可展开、可关闭的 ComfyUI 结果列。
- Client 插件必须在已保存 Session 中继续使用 Harness 原生 `details` 列。
- 空白 Session 与已保存 Session 只能各显示一个可见的 ComfyUI 结果列。

### 验收清单

- 空白 Session 点击“ComfyUI 工作台”后，右侧结果列的可见宽度大于 `0px`。
- 空白 Session 关闭右侧结果列后，右侧结果列不再显示。
- 已保存 Session 点击“ComfyUI 工作台”后，Harness 原生 `details` 列的可见宽度大于 `0px`，且 `shell.overlay` 结果列不显示。
- 新增测试覆盖空白 Session、已保存 Session、展开和关闭分支。
- `pnpm quality`、`git diff --check`、生产健康检查和浏览器验收全部通过。

### 非本次目标

- 本阶段不修改 Harness 核心源码或 `node_modules/@deepseek-ai/*`。
- 本阶段不修改 Generation Run、Media 或 Workflow 的 Host 数据合同。
- 本阶段不新增产品文案或第二套结果列交互。

### 已获得的授权

- 用户已要求修复当前无法打开的右侧列。
- 用户已授权继续修改、重启并验证当前 Harness 插件。

状态：已完成

### Phase 1: 检查两个仓库的现有接口
- [x] 计划编写者检查 DeepSeek Harness 的 Web 页面、插件、会话事件与 Skill 目录。
- [x] 计划编写者检查 NoobAI-XL-FZ-PROD-ENV 的查询 CLI、会话 Skill、管理 Skill、ComfyUI 实例与工作流模板数据。
- [x] 计划编写者把已确认的文件路径、结构化数据字段和缺口写入 findings.md。
- **Status:** completed

## Phase 21：设计真实媒体存储与异步 ComfyUI 运行链路

### 必须要实现的目标

- 计划编写者必须以 Harness `0.1.1-rc.2` 官方文档、已安装包和当前仓库 ADR/PRD 为证据，确定 Host WebServer、Typert Remote、Jobs、Tool 和 Skill 的责任。
- 计划编写者必须定义 `Session 1 → N Run`、`Run 1 → N Media`、`Run 1 → 1 Actual Workflow` 的持久化关联，禁止按 Session 共享 Workflow。
- 计划编写者必须给出 SQLite 表职责、媒体文件分目录结构、异步运行状态机、崩溃恢复策略、Client 投影与同源下载路由。
- 计划编写者必须给出可执行的实现顺序，优先交付一条单 Run 端到端纵向切片，然后扩展 Session 媒体库与任务列表。

### 验收清单

- 方案中的每个 Harness 能力都对应 `0.1.1-rc.2` 的公开导出或已安装包行为。
- 任意媒体只能通过自身 `run_id` 下载所属 Run 已持久化的 Actual Workflow。
- Skill 只指导 Agent 调用 Generation Tool；Tool 只在 Run Repository 接纳成功后返回 `run_id`；Host worker 负责后续观察、保存与恢复。
- 方案明确是否需要独立 HTTP 进程，并解释进程启停与非终态 Run 恢复。

### 非本次目标

- 本阶段不修改业务源码、数据库 Schema、生产配置或 Harness 进程。
- 本阶段不实际提交 ComfyUI 任务，不写入真实媒体。
- 本阶段不修改 Harness 核心、`node_modules/@deepseek-ai/*` 或数据源仓库。

### 已获得的授权

- 用户已授权计划编写者继续媒体存储、异步 ComfyUI 任务、Tool/Skill 与 Host 启动方案的调研与实现顺序设计。
- 用户已指定 Harness `0.1.1-rc.2` 为可实现性版本权威。
- 用户已明确同一 Session 可以有多次 Tool 调用和多份不同 Actual Workflow。

### Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| 首次记录 Phase 21 时使用了不存在的 `findings.md` 尾行作为补丁锚点 | 1 | 补丁未应用；计划编写者重新读取三个计划文件的真实尾部后使用精确锚点。 |

- **Status:** completed

## Phase 20：补充右侧结果抽屉的 Workflow 下载入口

### 必须要实现的目标

- 右侧“生成结果”抽屉必须提供原原型已有的 Workflow 下载入口。
- Workflow 下载入口必须使用 Harness `0.1.1-rc.2` 原生图标按钮，并在窄标题栏中保持可用。
- 下载动作必须生成浏览器可下载的 Workflow JSON 文件，不得修改输入框上下文 JSON 或结果抽屉状态。
- 新会话 root overlay 与已连接 Session 原生 details 必须共享同一个下载入口和下载实现。

### 验收清单

- 原原型中的 Workflow 下载位置和静态 Workflow 数据来源已经核对。
- 图标按钮具有“下载 Workflow”可访问名称和原生 tooltip。
- 点击图标按钮会产生一个 `.json` 下载，文件内容是结构化 Workflow JSON。
- 新会话与已连接 Session 的右侧结果抽屉均显示图标按钮。
- 目标测试、`pnpm run quality`、生产健康检查和浏览器实际下载验收全部通过。

### 非本次目标

- 本阶段不接入真实 ComfyUI Run、远端 Workflow 查询接口或按运行记录切换 Workflow。
- 本阶段不增加文字按钮、不修改右侧结果卡片布局、不改变中间输入框上下文 JSON。
- 本阶段不修改 Harness 核心源码或 rc.2 安装包。

### 已获得的授权

- 用户已要求补充原原型中的 Workflow 下载按钮，并允许使用图标以适配右侧容器宽度。
- 用户此前已授权修改、重启并验证当前 Harness 插件和生产实例。

- **Status:** completed

## Phase 19：让新会话页面实际显示右侧结果抽屉

### 当前进度

- 用户截图证明 Chrome 中当前选中的“新会话”页面只有左侧工作区列和中间新会话区域，右侧结果抽屉没有显示。
- 计划执行者正在建立新会话页面的确定性失败检查，并核对 Harness `0.1.1-rc.2` 对 unconnected 页面开放的原生布局插槽。

### 必须要实现的目标

- “新会话”页面点击中间“生成结果”按钮后必须显示右侧结果抽屉。
- 右侧结果抽屉必须继续使用 Harness `0.1.1-rc.2` 公开插件机制和原生 UI 组件。
- 已连接 Session 的三列布局、静态任务卡片、媒体筛选和分页必须保持可用。
- 计划执行者必须用用户截图对应的新会话状态和已连接 Session 状态分别完成浏览器验收。

### 验收清单

- 自动化失败检查能够在修复前识别“新会话点击生成结果后 details 宽度仍为 0”的具体症状。
- 新会话页面点击“生成结果”后能够看到右侧“生成结果”标题、关闭按钮、两个结果 tab 和静态内容。
- 点击“关闭生成结果”后右侧抽屉消失，再次点击中间“生成结果”后右侧抽屉重新出现。
- `pnpm run quality`、`git diff --check`、生产健康检查和 Chrome 实际页面验收全部通过。

### 非本次目标

- 本阶段不接入真实媒体结果、ComfyUI 异步任务 API、任务取消或媒体下载。
- 本阶段不修改 Harness 核心源码或 `node_modules/@deepseek-ai/*`。
- 本阶段不要求新会话页面在用户未点击“生成结果”时默认展开右侧抽屉。

### 已获得的授权

- 用户已要求修复当前截图中的新会话页面，使右侧列实际可见。
- 用户此前已授权修改并重启当前仓库的 Harness 插件和生产实例。

- **Status:** completed

### Phase 2: 定义原型页面与模块接口
- [x] 计划编写者定义三个结构明显不同的 UI 原型变体。
- [x] 计划编写者定义会话、上下文选择、Skill 调用、ComfyUI 任务和媒体产物的领域对象。
- [x] 计划编写者定义 DeepSeek Harness、数据查询 CLI、ComfyUI 任务模块和媒体目录模块之间的接口与事件顺序。
- [x] 计划编写者定义生产实现阶段的目录、测试范围和迁移顺序。
- **Status:** completed

### Phase 3: 语义独立审核
- [x] 独立审核队员检查方案中的每个名词是否已经定义。
- [x] 独立审核队员检查每个需求是否映射到具体页面区域、模块接口或阶段产物。
- [x] 独立审核队员检查方案是否混淆计划执行者、Skill 执行者、DeepSeek Harness Agent 和 ComfyUI 实例。
- **Status:** completed

### Phase 4: 交付讨论稿
- [x] 计划编写者根据独立审核清单修改讨论稿。
- [x] 计划编写者向用户提交推荐方案、备选方案、待确认决策和下一轮原型产物清单。
- **Status:** completed

### Phase 5: 锁定变体 A 与 Workflow JSON 持久化边界
- [x] 计划编写者只读调研数据源系统的请求数据到本轮实际 Workflow JSON、API Workflow JSON、运行前持久化和浏览器下载链路。
- [x] 计划编写者把变体 A 改为已确认方案，并删除 B、C 的实现路径。
- [x] 计划编写者把第二个下载产物定义为由请求数据和模板来源快照转换得到的本次实际 Workflow JSON；页面不下载原始请求快照。
- [x] 独立审核队员复审两个 Workflow JSON 的名称、来源、持久化时点、页面下载边界和验收测试。
- **Status:** completed

### Phase 6: 实现变体 A 静态原型
- [x] 计划执行者创建零依赖 HTML、CSS 和浏览器 JavaScript 页面，并使用静态 fixture 表示会话、上下文、Harness Tool 调用、运行状态和媒体。
- [x] 计划执行者实现上下文分层选择、消息发送、Agent 流式文本、会话切换、右列标签和原型状态切换；Skill 选择继续使用 DeepSeek Harness 原生交互，不在本项目实现。
- [x] 计划执行者实现同一 Session 的多聊天轮次选择，并分别演示零个、一个和多个 `run_id` 的轮次关联。
- [x] 计划执行者实现本次实际 Workflow JSON 的浏览器 Blob 下载入口，并保持 API Workflow JSON 只供 Host 私有提交、恢复和诊断逻辑使用。
- [x] 计划执行者把“本会话结果”实现为按聊天轮次、媒体种类和保存时间筛选的固定尺寸媒体网格，并增加独立分页。
- [x] 计划执行者在静态原型中实现左侧“所有媒体”入口和居中跨会话媒体库；正式 Harness 实现接口由 Phase 10 单独审计。
- [x] 计划执行者为会话媒体库和全局媒体库的共用媒体卡片实现原文件新窗口打开和所属运行 Workflow JSON 下载。
- [x] 计划执行者只读探测数据源登记的两个 ComfyUI 实例，确认当前实例通过 Jobs API 列出、查询和取消单个 Job。
- [x] 计划执行者实现左侧“所有 ComfyUI 异步任务”入口、按会话/聊天轮次/创建时间筛选、独立分页和排队/运行中 Job 取消交互。
- [x] 计划执行者在浏览器中验证三列布局、原型状态、弹窗顶层行为、键盘关闭、焦点返回和下载文件名。
- [x] 独立语义审核队员检查页面文案、具体名词和用户需求覆盖。
- **Status:** completed

### Phase 7: 确认正式实现边界
- [x] 用户确认 Workspace 范围、Chat Turn 定义、Generation Run 持久化、Tool 接纳返回、数据源不可用行为和 ComfyUI Job 取消边界。
- [x] 用户确认当前仓库拥有独立 Harness bundle，项目使用 Harness 原生 Session/数字 turn/callId，并且只有实际 Generation Tool Call 创建 `run_id`。
- [x] 用户确认单用户安装、Host 前台 worker、Harness 原生 Skill 调用策略和 `submission_unknown` 显式新消息重提边界。
- [x] 用户确认一个 OpenAPI schema 投影 Agent Catalog CLI 与 Host 专用只读 Source CLI；本版本不认证其他本机进程。
- [x] 用户确认 Tool 调用时读取当前模板 bundle；本版本不设计选择时 revision 锁定或 revision 冲突。
- [x] 用户确认 ComfyUI 实例采用显式安全 ID 或 Host 配置默认值，显式实例不可用时不切换。
- [x] 用户确认当前安装使用一个 SQLite 保存运行元数据，运行文件按 Workspace 与 Run 分区。
- [x] 用户确认两个 discovery 返回同一契约身份，Host adapter 遇到不兼容版本时阻止对应数据源能力。
- [x] 用户确认异步运行状态只保存在 Run Repository，并且不把每次状态变化复制为持久 Harness Session 事件。
- [x] 计划编写者在设计树没有未决叶节点后发布实现规格 Issue #1。
- **Status:** completed

### Phase 8: 逐项处理 high dependency advisory
- [x] 计划执行者从只读原 DeepSeek Harness manifest 与 lockfile 取得当前 high advisory 原始报告。
- [x] 计划执行者把报告映射为 advisory 编号、受影响包、依赖链、计划 production closure、修复版本和来源证据。
- [x] 计划执行者逐项处理每个唯一 advisory，并记录精确升级或当前项目闭包排除结论。
- [x] 计划执行者在当前仓库创建精确版本依赖计划、七个受影响版本 override 和 lockfile 审计门禁。
- [x] 计划执行者重新运行完整闭包与 production 闭包门禁；两个范围的 critical、high、moderate 和 low 都为 0。
- **Status:** completed

### Phase 9: 审核 dependency build script 并完成正式依赖安装
- [x] 计划执行者从官方 npm registry 下载五个精确版本 tarball，并在不执行 lifecycle script 的隔离目录中检查文件清单、registry integrity、安装命令及其本地调用链。
- [x] 计划执行者分别完成五个精确版本的 lifecycle script 安全审计，并在 `allowBuilds` 中明确允许五个精确版本。
- [x] 计划执行者保留五个依赖包的完整安装行为，不使用 `allowBuilds` 裁剪 package lifecycle script。
- [x] 计划执行者完成 `pnpm install --frozen-lockfile`，并验证 pnpm 没有自动忽略未分类 build script。
- [x] 计划执行者重新运行完整依赖 audit、production 依赖 audit、27 项原型测试和工作区差异格式检查。
- **Status:** completed

### Phase 10: 审核 Harness 核心零改动与公共插件接口闭包
- [x] 计划编写者从指定 Harness commit 的已提交源码和 package exports 核对 Host plugin、Client plugin、AppFrame slots、Modal、输入引用、Typert RPC、Tool、Jobs、Skill 与媒体访问接口。
- [x] 计划编写者为 Issues #2–#15 逐票列出允许使用的已导出接口，并对没有对应 public plugin seam 的产品功能和原型 UI 在规划阶段直接写入阻塞结论。
- [x] 计划编写者把禁止修改 Harness 仓库、修改 `node_modules/@deepseek-ai/*`、deep import、vendor、`patch-package`、DOM 劫持和重建 Harness 核心交互的硬门禁写入父 Issue、各子 Issue 与对应 PRD。
- [x] 计划编写者为当前仓库增加能够证明 tarball-only composition 不依赖 Harness 源码目录或核心补丁的验收要求。
- [x] 独立语义审核队员检查本地规格和 GitHub Issues #1–#15；审核队员确认每张票的接口、实现主体、验收对象和阻塞行为明确。
- **Status:** completed

### Phase 11: 纠正默认UI限制被误判为插件阻塞
- [x] 计划编写者把Harness核心、上游随附UI插件与项目UI插件的责任直接写入ADR、父Issue、PRD和Tickets。
- [x] 计划编写者把项目UI固定为保留AppFrame root与ConversationRoot，并通过`priority: -10`替换公开`sidebar`、`details`、`conversation.session.header`、`conversation.view`的`chat` occupant和`conversation.composer.bar`。
- [x] 计划编写者确认ConversationRoot继续渲染`conversation.input.overlay`；项目composer原样渲染该overlay，并通过公开InputTriggerController连接Harness原生`/` Skill菜单。
- [x] 计划编写者保留原型规定的composer可见界面与产品行为：当前Session草稿、Message Context、一次发送、失败保留、成功清理和附件生命周期。
- [x] 计划编写者把Issues #3、#4和#6恢复为已验证public plugin机制可实现，并同步GitHub正文、标签和native依赖图。
- [x] 独立审核队员确认本地与远端不再包含错误阻塞，且每张票仍满足核心零改动、原型1:1与产品验收要求。
- **Status:** completed

### Phase 12: 补全Prompt、LoRA调整与ComfyUI生成Skills的可执行迁移方案
- [x] 计划编写者逐文件核对固定revision中的Anima Prompt Skill与WAI Prompt Skill，列出保留、改写和删除责任。
- [x] 计划编写者逐文件核对来源系统`management-skills/lora-adjustment/`，冻结`lora-adjustment`在Harness中的安装目录、输入、输出、Catalog依赖、连续调整语义和黑盒验收。
- [x] 计划编写者核对Harness rc.7 Skill正文加载、reference读取、脚本执行与Tool调用能力，禁止假设来源宿主专用工具仍然存在。
- [x] 计划编写者冻结迁移后Prompt Skill读取普通用户正文与`generation-context.v1`快照的输入合同、Prompt输出格式、失败行为和逐文件迁移清单；两个Prompt Skill不创建Generation Run。
- [x] 计划编写者冻结独立`comfyui-generate`Skill读取模板、Execution Route和显式运行参数的合同，以及它调用Generation Tool的唯一顺序。
- [x] 计划编写者同步PRD 04、PRD 05、PRD 12、原型方案、受影响Ticket草稿与GitHub Issues，并保证执行者不承担研究或设计决定。
- [ ] 独立语义审核队员确认计划执行者不需要重新调研、解释旧宿主合同或设计迁移方案。
- **Status:** in_progress

### Phase 13: 删除移动端范围并核对桌面列宽
- [x] 计划编写者把父Issue、Tickets 02–14与对应PRD的移动端、窄屏single-panel和九viewport要求删除，验收尺寸只保留`1440×1000`。
- [x] 计划编写者把本地父Issue与Tickets 01–14完整同步到GitHub Issues #1–#15，并逐票验证远端正文与本地来源一致。
- [x] 计划编写者核对rc.7 AppFrame默认列宽、公开`ILayout`方法与slot declaration/render ownership。
- [ ] 用户决定是否接受AppFrame默认桌面列宽作为原型可见例外；如果不接受，当前rc.7公共插件机制与“不得实现第二套Skill菜单”约束共同构成Ticket 02阻塞。
- **Status:** in_progress

### Phase 14: 正式采用源数据仓库 v0.82.2 envelope
- [x] 在唯一结构化合同文件中冻结 v0.82.2 Catalog/Source discovery、成功响应、错误响应、CLI 退出码和字段映射。
- [x] 同步 CONTEXT、ADR、Configuration Profile、PRD 01/03/04/05、父 Issue 和 Tickets 03/04/05/12/13 的旧 wrapper、旧 Schema 校验和旧模板字段。
- [x] 将 `expected_output_node_ids_json: null` 定义为不限制输出节点；Workflow compiler 使用目标 ComfyUI 实例 `/object_info` 中 `output_node: true` 的活动节点，不按节点名称猜测。
- [x] 回读并核对 GitHub Issues #1–#14 的可执行正文；只发布 v0.82.2 envelope 的消费规范，不修改源数据仓库。
- **Status:** completed

### Phase 15: 将工作台原型直接实现为 Harness rc.2 插件并运行验证

#### 必须要实现的目标
- [x] 计划执行者必须读取用户指定的 DeepSeek Harness `develop/basic/` 官方文档、`dsh-v0.1.1-rc.2` 的 package exports 与已提交 Harness 源码，再为每个新增或保留的原型 UI 元素记录可实现的公开接口证据。
- [x] 计划执行者必须读取 GitHub Issues #3 和 #4 的正文、评论、标签与失败结论，并删除原型中依赖失败设计的界面和交互。
- [x] 计划执行者必须先调研并记录 `0.1.1-rc.2` 精确依赖版本的发布元数据、peerDependency、lifecycle script与安全 advisory，再把当前项目的 DeepSeek Harness 依赖闭包升级到精确 rc.2版本。
- [x] 计划执行者必须在真实 Client plugin中向 `sidebar.footer.action`增加“ComfyUI 工作台”原生入口；用户点击入口后，插件必须切换非持久工作台状态，并在当前原生Session的中列显示工作台上下文扩展。
- [x] 计划执行者必须保留原生 AppFrame、SidebarRoot、ConversationRoot、Chat view与 InputBar；项目不得注册 root、top-level sidebar、top-level conversation、`conversation.view#chat`或`conversation.composer.bar`替代项。
- [x] 计划执行者必须向 `conversation.input.dock`注册上下文扩展；中列输入区上方必须同时显示“插入上下文”按钮和从原生 InputState读取的已选上下文展示。
- [x] 计划执行者必须覆盖插件成功、拒绝、清理和错误分支测试；随后使用 `pnpm prod:start/status/health/logs`启动真实Harness，并在 `1440×1000`浏览器页面验证入口、Session打开、原生中列和上下文扩展。

#### 验收清单
- [x] 每个原型可见界面元素都能映射到官方文档、`dsh-v0.1.1-rc.2` 的 public export、公开 slot/service 或 Harness 源码中已经存在的原生组件。
- [x] 左列“ComfyUI 工作台”入口能够进入和退出非持久工作台状态；左列没有替换原生 Session浏览区或 Settings，也没有创建第二套Session导航。
- [x] 中列完全由原生会话 header、Chat view和 InputBar渲染；输入区上方同时显示“插入上下文”按钮与一个或多个已选上下文标签，原生 Skill、图片、Model、Permission与发送路径保持可用。
- [x] Issue #3 与 #4 中已证明无法实现的设计没有出现在修改后的原型中。
- [x] `pnpm test:unit`、`pnpm test:integration`、`pnpm test:contract`、`pnpm prod:test`、`pnpm quality`与 `git diff --check`通过；真实 `prod:health` 与浏览器验收通过后进程被停止。

#### 非本次目标
- 本次任务不修改 DeepSeek Harness 核心源码、`node_modules/@deepseek-ai/*` 或外部源码目录。
- 本次任务不实现后端 ComfyUI调用，不修改 GitHub Issue正文或标签，也不恢复静态原型的三列 1:1复刻要求。
- 本次任务不重做 Harness 原生 Session、Skill 菜单、Agent 消息或 Tool trace 机制。

#### 已获得的授权
- 用户已经授权计划执行者修改当前仓库中的现有 ComfyUI 工作台原型及其必要测试和本地说明。
- 用户已经授权计划执行者只读访问官方开发文档、GitHub Issues #3/#4、当前项目依赖与本机 Harness 源码，用于证明原型可实现性。
- 用户已经明确指定 DeepSeek Harness `0.1.1-rc.2` 作为本次原型可实现性基线。
- 用户已经授权计划执行者把原型直接实现为当前仓库 Harness plugin，并启动真实 Harness完成可行性验证；该授权包含完成上述目标所必需的精确 rc.2依赖升级。

- **Status:** completed

### Phase 16: 接入数据源CLI并完成原生上下文选择器

#### 必须要实现的目标
- [x] 计划执行者必须读取当前配置指向的数据源CLI文件、数据源仓库发布合同与当前Host插件边界，确定搜索请求、资源类型、分页参数、成功响应和错误响应的唯一结构化合同。
- [x] Host插件必须通过已配置的`imagegen-semantic-query` CLI读取真实候选数据；Client不得直接运行CLI，也不得读取数据源仓库文件或数据库。
- [x] 当前项目必须直接声明 Harness `@deepseek-ai/dsh-typert-protocol@0.1.1-rc.2`，并通过其公开 Remote Service、Remote descriptor和`ctx.remote.$mount()`完成Host到Client调用；依赖更新不得执行生命周期脚本。
- [x] Client插件必须在原生Modal中实现资源类型左列、搜索输入、候选列表、选择状态和插入操作，并通过原生`SessionInput.setDraft()`把选中记录的结构化JSON写入当前InputBar。
- [x] 产品界面必须只显示产品名称、数据和必要操作；界面不得显示实现机制、开发说明或交互解释。
- [x] 测试必须覆盖CLI成功、空结果、非零退出、无效响应、搜索更新、资源类型切换、选择、插入、关闭和插件清理分支。
- [x] 计划执行者必须重启真实Harness，并在`1440×1000`页面用数据源CLI返回的真实记录验收搜索、左列切换、选择、插入与原生InputBar共存。

#### 验收清单
- [x] 弹窗左列显示数据源CLI支持的资源类型；搜索只查询当前资源类型；候选列表来自真实CLI响应。
- [x] 用户选择候选记录后，“插入”把该记录的结构化JSON写入Harness原生草稿；Dock显示可移除标签，用户移除标签时同步删除对应JSON且保留普通正文。
- [x] CLI错误使用唯一错误码映射为简短产品错误文案；CLI错误不会写入输入框，也不会保留错误选择状态。
- [x] 插件不注册`root`、top-level `sidebar`、top-level `conversation`、`conversation.view#chat`或`conversation.composer.bar`。
- [x] `pnpm quality`、`git diff --check`、真实`prod:status`、真实`prod:health`与浏览器验收全部通过。

#### 非本次目标
- 本次任务不实现ComfyUI生成、任务管理、媒体库、数据源编辑或数据库写入。
- [x] 计划执行者必须按已确认原型恢复上下文弹窗的信息架构：顶部底模下拉框、左侧资源类型列表、右侧带封面与标题的候选卡片、搜索、分页和多项选择。
- [x] 计划执行者必须通过真实CLI读取底模和候选资源；底模只作为支持该筛选参数的资源查询条件，不插入消息上下文。
- [x] 计划执行者必须在真实Harness中验证底模切换、资源类型切换、搜索、分页、多项选择、取消和批量插入。
- 本次任务不修改数据源仓库、Harness核心源码或`node_modules`。
- 本次任务不新增Harness之外的第三方依赖，不恢复失败Issue #3/#4的整页替换设计。

#### 已获得的授权
- 用户已经授权计划执行者修改当前仓库的Host插件、Client插件、测试与必要结构化合同。
- 用户已经授权当前仓库运行配置中声明的数据源CLI作为只读数据源。
- 用户已经授权计划执行者重启并保持真实Harness进程，用于完成页面验收。
- 用户已经授权计划执行者按锁定的 Harness `0.1.1-rc.2` 机制实现插件；计划执行者据此直接声明同版本 `@deepseek-ai/dsh-typert-protocol`，该包来自已安装的官方 Harness 发布、使用 MIT 许可证、没有安装脚本，且当前 lockfile 已包含该精确版本。

- **Status:** completed

## Key Questions
1. DeepSeek Harness 当前通过哪个 Web 插件接口向会话页面增加三列式工作台？
2. DeepSeek Harness 当前如何向浏览器发送用户消息、Agent 增量文本、Tool 调用和 Tool 结果？
3. NoobAI-XL-FZ-PROD-ENV 当前有哪些 CLI 命令能够查询底模、模板、LoRA、角色、画师、画师串、ComfyUI 实例和工作流模板？
4. 哪些会话 Skill 和管理 Skill 可以迁移，哪些实现依赖 NoobAI 系统仓库运行时？
5. ComfyUI 任务模块如何从内部请求快照和模板来源快照确定性生成本次实际 Workflow JSON，并从该文件编译实际 API Workflow JSON？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本轮只产出设计讨论稿 | 用户明确要求先设计和讨论方案。 |
| 原型采用 `$prototype` 的 UI 分支与新页面子形态 | 当前目标目录为空，目标问题是页面布局和交互，而不是后端状态机正确性。 |
| 讨论稿提供三个结构明显不同的变体，静态实现只保留变体 A | 用户已经选择变体 A；B、C 只保留为设计记录。 |
| 原型使用静态夹具并在页面显示完整状态 | 原型需要验证交互含义，不需要在讨论前连接真实数据库或 ComfyUI 实例。 |
| 数据源仓库只提供实例、模板和目录数据的只读 CLI | 用户明确要求异步运行、状态观察和媒体持久化不能写入数据源仓库。 |
| 当前仓库保存 `run_id`、内部来源快照、内部请求快照、本次实际 Workflow JSON、API Workflow JSON、状态和媒体 | 当前仓库必须成为 ComfyUI 运行和结果的唯一持久事实来源；数据源仓库不保存本项目运行产物。 |
| 页面只下载本次实际 Workflow JSON | 该文件由内部请求数据和模板来源快照转换并保留 ComfyUI 前端图信息。API Workflow JSON 仍由当前仓库持久化并实际提交 `/prompt`，但不注册浏览器下载。原始请求快照不作为下载产物。 |
| DeepSeek Harness 决定迁移后 Skill 的文件与工具可见性 | 迁移后的 `SKILL.md` 不沿用原仓库的宿主沙箱假设。 |
| 完善原数据源 CLI 并由 Harness Tool 提供给 Skill | 用户要求保留原 CLI 的数据提供责任，并通过 DeepSeek Harness 的工具机制调用。 |
| 一个权威 `schema/api/openapi.yaml` 投影两个只读 discovery/CLI 表面 | `imagegen-semantic-query` 只发现 Agent 安全 Catalog Operation；Host 私有 CLI 只发现 Source Operation。两个表面复用稳定 ID、revision、共用 schema 和错误结构，不创建第二个 schema manifest。 |
| Source Operation 本版本不做本机进程认证 | Source Operation 只通过 Host 专用的本机只读表面提供，Harness 不把它注册为 Agent Tool、Skill Tool 或浏览器 RPC；其他本机进程不属于本版本威胁模型。 |
| Tool 调用时读取当前模板 bundle | 用户选择模板后到 Tool 调用前的 revision 变化不属于本版本并发模型；Host 在 Tool 调用中读取一次当前 bundle，并把该结果保存为运行来源快照。 |
| ComfyUI 实例采用显式选择或配置默认值 | 用户可以选择安全实例 ID；未选择时 Host 使用配置默认实例。明确选择不可用时失败，不自动切换。 |
| 一个 SQLite 保存当前安装的运行元数据 | 每条记录包含 `workspace_id`、`session_id`、Harness 数字 `turn`、Harness `call_id` 和 `run_id`；文件按 Workspace 和 Run 分区。 |
| 两个 discovery 返回同一契约身份 | Host adapter 只接受配置中声明支持的 `contract_id` 与 `contract_version`，不猜测或回退。 |
| Run Repository 是异步运行状态的权威来源 | Harness Session日志保存同一数字`turn`中的`comfyui-generate` Skill Invocation、原生Generation Tool Call与含结构化`run_id` meta的Tool Result；Client只通过项目unary Typert Remote读取。页面可见且中列Tool行或右列卡片观察非终态Run时，唯一`GenerationRunProjectionStore`继续轮询；两处同时可见时每周期只查询一次。 |
| `submitting` 崩溃恢复为 `submission_unknown` | 当前没有经过验证的远端业务幂等键，恢复流程不能安全自动重提。 |
| 依赖 advisory、build-script 与 frozen install 门禁均已通过 | 当前项目完整与 production audit 均为 0；`allowBuilds` 明确允许五个已经完成安全审计的精确版本，不裁剪依赖包的安装行为。 |
| 原 DeepSeek Harness 目录保持只读 | 用户指定该目录只供调研；正式宿主、Host 插件和 Skill 必须安装到当前仓库。 |
| Skill选择、发现与调用校验使用DeepSeek Harness现有交互 | 项目中列保留Harness原生composer、`ui-input-trigger`与`ui-skill`：用户输入`/`后由Harness显示Skill，选择后由Harness插入`/skill-name `。项目不调用SkillsApi重做菜单、不保存Skill选择状态，也不注册第二个Skill provider或invocation policy。 |
| Tool 调用详情归 DeepSeek Harness 轨迹功能所有 | 本项目右列只显示 ComfyUI 运行与媒体，不复制单一 Tool 的参数或结构化结果面板。 |
| 当前系统不迁移旧专用 LoRA Session，但必须迁移 `lora-adjustment` Skill | 用户在普通Harness Session中显式调用`lora-adjustment`取得Prompt、LoRA权重和触发词；该Skill不创建Run。用户随后显式调用`comfyui-generate`才创建ComfyUI运行。 |
| 底模是资源查询筛选条件 | 上下文选择器用底模 ID 筛选具有 `base_model_id` 关系的候选项；底模筛选值不写入消息上下文。 |
| 底模筛选器提供“全部” | 选择“全部”时，上下文目录查询不附加具体底模限制；底模仍不写入消息上下文。 |
| 全局媒体库使用项目Workbench左侧入口和居中弹层 | Issue #3注册到公开`sidebar`的项目occupant在搜索框之后、Session列表之前直接渲染“所有媒体”入口；媒体票使用Harness `Modal`呈现跨会话媒体库。 |
| 全局异步任务列表使用 ComfyUI Jobs API | 当前仓库保存 Harness Session ID、数字 `turn`、`run_id`、实例 ID 与 `prompt_id` 关联；服务使用 `GET /api/jobs/{prompt_id}` 观察任务，并使用 `POST /api/jobs/{prompt_id}/cancel` 取消指定的排队或运行中 Job。 |
| 原型不保留没有已实现行为的可见控件 | 每个可见按钮必须触发原型中能够核对的状态变化、导航、筛选、复制、下载或对话框操作。 |
| 项目Workbench保留AppFrame与ConversationRoot | 项目通过公开`sidebar`、`details`和conversation slots替换可见产品区域，保留ConversationRoot声明的`conversation.input.overlay`，因此不需要第二个root或第二套Skill菜单。 |
| 本版本只交付桌面布局 | 产品验收固定为`1440×1000`桌面三列及原型列宽关系；移动端布局、移动端导航、窄屏单panel和原型CSS断点不属于本版本。 |
| Composer状态所有权不是产品需求 | 原型只规定composer的可见结构、Message Context、发送与失败/成功行为；计划不得要求用户选择状态由项目store或Harness InputHub持有，也不得把默认InputBar路径写成唯一产品验收路径。 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 当前目标目录不是 Git 仓库 | 1 | 本轮只创建调研文件；用户确认方案后再确定仓库初始化与原型分支策略。 |
| 官方文档页面通过 Web 检索没有返回可读正文 | 1 | 不重复相同调用；后续用只读 HTTP 获取官方页面，并与当前项目锁定源码交叉核对。 |
| rc.2源码搜索中的未引用 `packages/client/ui-*` 被 zsh 解释为当前仓库glob | 1 | 后续只使用明确目录或引用后的 Git pathspec；该失败没有修改文件，其他同批只读命令正常完成。 |
| lockfile-only生成后 pnpm把未授权的占位键写入 `allowBuilds` | 1 | 计划执行者删除 `@deepseek-ai/dsh-subprocess-local: set this to true or false`占位键，保留已审计的精确 `@0.1.1-rc.2`许可，再重新运行三道preinstall门禁。 |
| 首次Client类型检查把Cordis Host的`SessionStore`声明解析到`ctx.sessions` | 1 | Client插件在边界处把`ctx.sessions`显式收窄为公开`ISessions`，运行时对象不变，之后`pnpm typecheck`通过。 |
| 首次测试补丁同时删除并新增`client-plugin.test.ts`，补丁工具拒绝同路径重复操作 | 1 | 改为原位更新测试文件；拒绝发生在应用前，没有部分写入。 |
| 首次定向测试直接加载原生primitives的CSS，且测试替身把Button图标与文字组成数组 | 1 | Client注册测试用无渲染primitives替身隔离CSS；surface测试的Button替身只投影文字，11项定向测试随后通过。 |
## Phase 17：精简 Agent 上下文 JSON

### 必须要实现的目标

- 插件必须从数据源仓库 CLI 的真实响应中提取 Agent 需要的名称字段、`prompt_text`、`id`、`tag`，并通过上下文类型说明每条 JSON 的语义。
- 卡片展示数据继续服务原生选择弹窗；写入 Harness 输入框的 JSON 只能包含上下文类型和 Agent 需要的数据。
- 已选上下文取消操作必须同步删除输入框中的对应 JSON。

### 验收清单

- 每条输入框 JSON 必须包含可识别上下文用途的类型字段。
- 生成模型和 LoRA 必须保留 `file_name`；作品、角色和画风必须保留 `name`；ComfyUI 模板必须保留 `title`。
- 角色上下文必须使用 `work_name` 和 `character_name` 分别表达作品名和角色名，并包含 `id` 与 `prompt_text`。
- 数据源存在的 `prompt_text` 和 `tag` 必须原值写入输入框 JSON。
- 输入框 JSON 不包含封面地址、卡片副标题或其他 Agent 不需要的展示字段。
- 角色卡片的 `label`、`subtitle`、`coverUrl` 只能用于 UI 展示，不能进入输入框 JSON。
- 类型检查、单元测试、生产检查和 Harness 浏览器交互验证全部通过。

### 非本次目标

- 本阶段不修改上下文弹窗的卡片布局、分页方式和原生组件选择。
- 本阶段不把完整数据源记录或 ComfyUI 工作流 JSON 写入 Harness 输入框。

### 已获得的授权

- 用户已授权直接修改并运行 Harness 插件。
- 用户已明确要求 Agent 上下文 JSON 只保留可理解的名称、`prompt_text`、`id`、`tag`，并要求每条 JSON 能表达插入用途和数据语义。

状态：已完成
## Phase 18：加载项目 Skill 并实现静态右侧抽屉

### 当前进度

- Harness 原生 `/` 菜单已经加载当前仓库 `.agents/skills` 中的三个 Skill。
- 右侧静态结果抽屉已经使用 Harness `details` 插槽和 `layout.openDetails()/closeDetails()` 实现并通过浏览器验收。

### 必须要实现的目标

- 计划执行者必须核对 Harness `0.1.1-rc.2` 文档、已安装包和本机源码，确定项目级 Skill 的发现目录、配置字段和 `/` 选择器加载条件。
- Harness 生产实例必须加载当前仓库 `.agents/skills` 中符合 Harness Skill 合同的 Skill，并在原生输入框输入 `/` 后显示可用 Skill。
- Client 插件必须通过 Harness `0.1.1-rc.2` 的公开原生 UI 组件和公开布局插槽实现右侧抽屉。
- 右侧抽屉展开后必须按旧原型的信息架构展示媒体结果、异步任务和相关静态详情；抽屉必须支持展开和收起。
- 右侧抽屉本阶段只能读取仓库内静态结构化夹具，不能查询真实媒体结果或异步任务。

### 验收清单

- 原生输入框输入 `/` 后能够看到 `.agents/skills` 中已安装且符合合同的 Skill。
- 右侧抽屉的展开、收起、媒体结果筛选、任务筛选和静态详情切换均有可见状态变化。
- 右侧抽屉使用 Harness 原生按钮、标签、菜单或其他公开组件；产品界面不显示实现说明和设计逻辑。
- 中列原生会话、上下文选择器、输入框、模型选择和发送路径保持可用。
- 新增代码包含各状态分支测试；`pnpm quality`、`git diff --check`、生产健康检查和浏览器验收全部通过。

### 非本次目标

- 本阶段不接入真实媒体结果、ComfyUI 异步任务 API、任务取消、媒体下载或跨 Session 媒体查询。
- 本阶段不修改 Harness 核心源码、`node_modules/@deepseek-ai/*` 或数据源仓库。
- 本阶段不创建第二套 Skill 菜单，也不替换 Harness 原生输入框。
- 本阶段不提供多个右侧抽屉变体；用户已经要求按旧原型布局与交互实现一个可验收版本。

### 已获得的授权

- 用户已授权计划执行者修改当前仓库的 Harness 配置、插件源码、静态夹具和测试。
- 用户已授权计划执行者重启并保持 Harness 生产实例运行，用于验证 Skill 菜单和右侧抽屉。
- 用户已授权右侧抽屉本阶段只展示静态媒体结果和异步任务数据，待样式确认后再接入实际功能。

- **Status:** completed
