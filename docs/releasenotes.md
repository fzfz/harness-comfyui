# 未发布变更

## ComfyUI 运行参数合同

- Workflow compiler 在写入 Actual Workflow 和提交 Prompt 前，依据目标实例实时 `/object_info` 校验每一个运行参数的 JSON 类型、整数性、精确数值范围、候选集合、`COMBO.multiselect` 数组成员和动态分支子输入合同。
- 数值合同保留 `/object_info` 原始 JSON 十进制令牌，因此能够在 JavaScript 非安全整数范围内拒绝超过目标 `INT.max` 的实际发送值；生产故障中的 Seed `12130929238470859000` 会在 Harness 内返回 `GENERATION_PARAMETER_INVALID`，不会提交给 ComfyUI。
- 未公开机器可判定合同的自定义 widget 只允许保持当前值；修改该值会返回 `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED`。目标节点的自定义 Python 校验仍由 ComfyUI 执行。
- 完整 `pnpm quality` 门禁通过：742 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.39%、branches 87.2%、functions 100%、lines 95.9%，完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。独立 Desktop 验收使用 worktree 内隔离测试 workspace，没有读取或启动真实生产目录。
- 本变更没有增加或升级依赖，`pnpm-lock.yaml` 保持不变。

# Harness ComfyUI v0.38.3

v0.38.3 修复 ANIMA 与 WAI Prompt Builder 对普通 tag 和画师 tag 权重形式的错误拒绝，并为两个 Skill 增加按槽位或位置设计权重的理论、步骤与规范。

## Prompt Builder 权重合同

- ANIMA 前十一个 tag 槽位与 WAI 前十四个 tag 位置现在统一接受未加权 `payload`、默认权重 `(payload)` 和显式权重 `(payload:weight)`；ANIMA `natural_language` 与 WAI `relation_narrative` 继续保存关系文本，不应用 tag 权重外层。
- 两个校验器使用各自 Skill 内的 `prompt-weight-policy.json` 作为结构化单一来源，按同一 ASCII 十进制文法检查显式权重，要求数值有限且大于 0，并逐字符保留合法 weight 原文。
- 两个校验器按从左到右的转义对识别 payload 内的反斜杠、圆括号和方括号，拒绝未知转义、尾随反斜杠、未闭合外层、嵌套权重和外层内未转义的定界符。
- ANIMA `artist_style` 在解析权重外层后检查 payload 恰好以一个 `@` 开头。WAI `artist` 与普通 tag 使用同一个权重解析器；画师身份、来源、去重和一名画师对应一个数组元素继续由 Skill 执行者与语义自检负责。
- ANIMA 固定质量前缀和 WAI 默认质量段保持未加权；用户新增的其他质量 payload 可以使用合法权重外层。

## 槽位权重方法

- 两个 Skill 新增 `references/prompt-weighting.md`，为 ANIMA 十二槽和 WAI 十五位置逐项定义权重适用条件、来源优先级、冲突与重复删除顺序、强调预算和最终自检。
- Skill 执行者先确定完整 payload，再删除互斥、重复和同义视觉决定，最后按照“用户合法显式数值、合法 Character 或 Style 来源、主要或辅助作用、主视觉锚点、未加权”的顺序生成一次最终外层。
- 除用户明确提供权重以外，合法来源与自主设计产生的高于中性强度决定共同计入每个 Prompt 的默认强调预算；无竞争内容保持未加权，Skill 不为每个槽位机械增加权重。
- ANIMA 与 WAI 分别从各自 JSON 策略读取模型专用推荐档位。两个 Skill 不共享模型专用数值，Markdown 只引用 JSON 属性路径，不复制推荐数值。

## 验收与发布

- 新增 82 项 Prompt Builder 权重单元测试，覆盖两个公开校验函数与 CLI 的成功、拒绝、转义、画师、固定质量、组合顺序、退出码和错误合同。
- `ComfyUI工作台预设` 使用 `opencode-go/deepseek-v4-flash` 与 `Default` 推理等级完成六个真实模型用例：ANIMA 普通 tag 与两种画师形式、ANIMA Style 来源权重、WAI 普通 tag 与画师显式权重、WAI 主要/中性/辅助画师与去重，以及两个 Skill 的稀疏未加权 Prompt。完整请求、实际文件读取、校验器标准输入、退出码、标准输出和停止状态记录在 [`.planning/prompt-builder-weighting/model-acceptance.md`](../.planning/prompt-builder-weighting/model-acceptance.md)。
- 完整 `pnpm quality` 门禁通过：626 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%，完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖，`pnpm-lock.yaml` 保持不变。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.38.2

v0.38.2 修正 DSH Desktop 提供给 DeepSeek Harness 的 OpenCode Go 静态模型目录，使模型选择器不再列出已经退役的 `ox-alpha-free`。

## OpenCode Go 模型目录

- DSH Desktop 提交 `9a0a39416af44af636e426f8d627cdb80d0baa77` 继续使用 `@earendil-works/pi-ai@0.84.3`，并通过可重放的 patch-package 补丁只修改该依赖的 `dist/providers/data/opencode-go.json`。
- OpenCode Go 目录删除 `ox-alpha-free`，新增 `qwen3.8-flash`、`glm-5.3-flash`、`hy4-preview` 和 `grok-4.6`。
- OpenCode Go 当前 `/models` 仍返回的 `grok-4.5` 保持可选；`qwen3.8-max` 和其余既有模型继续使用 pi-ai 0.84.3 的原始元数据。
- DeepSeek Harness、`dsh-llm-pi-ai`、动态模型发现和客户端错误分类均未修改。OpenCode Go 模型选择器继续读取 DSH Desktop 提供的静态目录。

## 故障原因

- DSH Desktop 固定的 pi-ai 0.84.3 静态目录仍包含 OpenCode Go 于 2026-08-26 退役的 `ox-alpha-free`，因此模型选择器继续显示该退役模型。
- OpenCode Go 对 `ox-alpha-free` 请求返回 HTTP 401 和“模型不受支持”；当前 Harness UI 把该 HTTP 401 显示为 `AUTH` 与“API 密钥无效”。本版本仅从 DSH Desktop 的 OpenCode Go 静态目录删除 `ox-alpha-free`，不修改 Harness 的 HTTP 401 错误分类。

## 测试与发布

- DSH Desktop 的回归测试通过公共 `getBuiltinModels('opencode-go')` 入口核对完整目录、精确新增与删除集合、所有既有模型的完整元数据、pi-ai 0.84.3 版本和唯一补丁目标。fresh `npm ci` 成功重放补丁，566 项测试、类型检查和构建全部通过。
- Harness ComfyUI 的真实 Desktop 测试通过会话主模型选择器逐项搜索四个新增模型和保留的 `grok-4.5`，并确认 `ox-alpha-free` 不再出现；图片读取设置继续只列出支持图片输入的模型。
- 实际安装的 pi-ai 0.84.3 公共运行接口分别使用 `glm-5.3-flash` 和 `deepseek-v4-flash` 完成 OpenCode Go 真实网络最小对话。`glm-5.3-flash` 探针曾从 OpenCode Go 上游端点收到两次瞬时 HTTP 503，后续请求成功；HTTP 503 不属于 API 密钥错误，也不构成静态目录修复失败。
- 完整质量门禁通过：544 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%，完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级 Harness ComfyUI 依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.38.1

v0.38.1 使 `ComfyUI工作台预设` 的系统提示词只保留 ComfyUI 业务任务需要的项目自定义 persona、Skill、Tool 和运行时上下文。

## ComfyUI 工作台系统提示词边界

- `ComfyUI工作台预设` 新增 Preset-scoped DSH/Cordis component。该 component 从 `PromptAssembly.sections` 删除 `harness:identity`、`harness:source` 和 `app:web-surface` 三个 Harness 自维护段落。
- 该 component 保留自定义 persona、AGENTS instructions、Tool 使用说明以及 `PromptAssembly.contexts`、`PromptAssembly.tools` 和 `PromptAssembly.variables`。
- Harness `standard`、`minimal`、`cordis` 和其他 Agent Preset 不加载该 component；这些 Preset 的系统提示词 assembly 保持原行为。
- 生产 Desktop、开发 Desktop 和 Web Host 的启动流程继续从同一份 canonical Agent Preset source 物化该 component 与 `ComfyUI工作台预设` composition。

## 测试与发布

- 真实 Cordis scoped waterfall 测试覆盖精确段落过滤、非匹配 Preset scope 隔离、下游异常原样传播、Preset scope 销毁后监听器清理和十类无效配置拒绝。
- 完整质量门禁通过：544 项 unit/integration、27 项 contract/security、115 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%，完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.38.0

v0.38.0 为 DSH Desktop 的 Session Media Viewer 增加当前图片或视频的原文件下载功能。

## Session Media Viewer 原文件下载

- Modal footer 新增“下载原文件”按钮。按钮始终对应 iframe 当前显示的 Generation Media；用户切换媒体后，Modal 标题、完整 Run ID 和下载目标同步更新。
- Client 使用一次性临时锚点触发 Chromium 原生下载，不读取媒体 Blob、不创建 Object URL、不打开新窗口。保存目录和同名文件处理继续由 DSH Desktop 中 Chromium 的下载策略决定。
- Host 新增同源 `/api/harness-comfyui/media/<media_id>/download?session_id=<session_id>` 路由。该路由执行与查看页和媒体内容相同的 Session、workspace 与媒体归属校验，并流式读取 `/content` 使用的同一个 Saved Media 文件。
- 下载响应保留 Generation Media 记录中的 MIME 和 ComfyUI 原文件名。Host 使用 UTF-8 RFC 5987/8187 `filename*` 编码附件文件名，避免引号、控制字符或特殊字符形成额外响应头参数。
- Saved Media 缺失时 Host 返回 `GENERATION_MEDIA_NOT_FOUND`；响应开始后文件读取失败时 Host 销毁下载连接。Client 不显示无法从原生下载接口可靠确认的成功状态。

## 测试与发布

- 自动化测试覆盖下载 URL、原始字节、MIME、字节长度、安全 attachment、六类 Session/workspace 拒绝、文件缺失、非 GET、500、流中断、图片、视频、媒体切换、重复点击和临时锚点清理。
- 真实 Desktop 测试通过 Browser 级 CDP 下载事件和真实鼠标点击验证两项媒体的事件 URL、建议文件名、完成状态、接收字节数和落盘原始字节；测试同时验证 Modal 保持打开、Chromium page target 数量不增加，以及桌面宽度与 600 × 800 viewport 的 footer 布局。
- 完整质量门禁通过：544 项 unit/integration、27 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.32%、branches 86.63%、functions 100%、lines 95.91%，完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.7

v0.37.7 使 ANIMA 与 WAI Prompt Builder 按当前 Desktop 实际提供的消息内容读取普通文字和 ComfyUI 上下文。

## Prompt Builder 当前消息输入合同

- ANIMA Prompt Builder 删除 `noobai_user_prompt`、`ui_explicit` 和 `selection_order` 的过期定义，直接读取当前消息中的普通文字和 `type=comfyui-context` JSON 行。
- WAI Prompt Builder 删除 `noobai_user_prompt`、`selection_snapshot_version`、`selection_order` 和旧快照属性定义，Character 记录读取 `data.id`、`data.work_name`、`data.character_name` 和 `data.prompt_text`，Style 记录读取 `data.id`、`data.name` 和 `data.prompt_text`。
- 两个 Prompt Builder 均按 Character 和 Style JSON 行在当前消息中的出现顺序处理 UI 记录；历史 Generation Run 查询继续作为独立分支运行。

## 验收与发布

- 独立语义 Reviewer 完成四轮 Skill 文案审查，最终审查没有阻塞性或非阻塞性问题。
- 真实 Desktop 使用 `ComfyUI工作台预设`、`DeepSeek V4 Flash` 和 `Default` 推理等级，分别验证 ANIMA 与 WAI 的普通文字、Character/Style 上下文和纯历史 Run 查询。六项模型用例全部通过，两个 Prompt Builder 均未要求旧输入对象或旧输入属性。
- 发布门禁改为在独立 linked worktree 对最终候选树执行完整 `pnpm quality`、`git diff --check` 和必需的独立审查；仓库不再配置 GitHub Actions workflow。
- 完整测试通过：539 项 unit/integration、27 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.23%、branches 86.5%、functions 100%、lines 95.81%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.6

v0.37.6 修复 DSH Desktop 的 Session Media Viewer 无法复制完整 Run ID 的问题。

## Session Media Viewer Run ID 复制

- 原实现从媒体查看页 iframe 调用 Clipboard API；DSH Desktop 的权限合同只允许可信 loopback 主框架写入剪贴板，因此 iframe 请求被拒绝并显示“复制失败”。
- 媒体查看页 iframe 现在只发送包含 `type`、`mediaId` 和 `runId` 的当前媒体消息。Modal 主框架验证消息 origin、来源 iframe、消息结构和当前 Session 媒体映射后，在 iframe 上方显示当前完整 Run ID。
- 用户点击独立复制按钮后，Modal 主框架执行 Clipboard API 写入。复制成功时按钮显示“已复制”；Clipboard API 不可用或写入被拒绝时，Modal 提供重试或手动选择已显示 Run ID 的明确动作。
- 用户在复制 Promise 完成前切换媒体、关闭 Modal 或重新打开 Modal 时，旧请求不会覆盖当前媒体的复制状态。iframe 不再请求 `clipboard-write` 权限，DSH Desktop 的 iframe 权限策略保持不变。
- 主框架 Run ID 行支持完整文本选择、长值换行、键盘焦点、桌面宽度和 680px 以下窄屏布局。

## 测试与发布

- 完整测试通过：539 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.23%、branches 86.5%、functions 100%、lines 95.81%。
- 真实 Desktop 测试使用两项不同 Run 的媒体和 CDP 真实鼠标事件，分别验证媒体切换前后的完整 Run ID 复制状态与播报，并验证真实桌面宽度和 600 × 800 viewport 的主框架 Run ID 行布局。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.5

v0.37.5 把当前 Catalog 的全部 19 个 ComfyUI Workflow 模板纳入参数支持基线和实时编译矩阵。

## 全量 Workflow 模板验证

- 参数支持基线新增模板 43 `AnimaStandardV8_完整25步吃负面词`，记录实时编译确认的 11 个标准运行参数。
- 精确模板 ID 集合门禁继续要求 Catalog 中的每个模板都经过显式验收；矩阵不会跳过未登记的新模板。
- 实例 2 的实时 `/object_info` 验证确认 19/19 模板的参数支持基线、组合编译和 Official API Workflow 缓存 miss/hit 路径全部通过。
- 模板 39 与其他 18 个模板使用同一套矩阵和 compiler 行为；本版本没有增加单模板特判。

## 测试与发布

- 完整测试通过：530 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.15%、branches 86.41%、functions 100%、lines 95.74%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.4

v0.37.4 使 Host 按 Source v0.86.1 合同读取三字段 ComfyUI TemplateBundle，并由 Workflow compiler 根据目标实例实时节点定义发现活动输出节点。

## Source v0.86.1 适配

- `GenerationSourceCli` 读取 TemplateBundle 的 `id`、`title` 和 `workflow_json`，不再要求 Source 已删除的模板 revision、Workflow SHA-256、config revision、dimension strategy 和输出节点过滤器。
- `ComfyWorkflowCompiler` 根据目标实例实时 `/object_info` 的 `output_node: true` 标记与 Workflow 必需输入连线生成活动输出节点集合，并删除未满足必需输入的输出节点。
- Generation Runtime 继续把 compiler 返回的活动输出节点集合保存到 Run Repository，并把该集合交给 Comfy transport 筛选 Jobs API 输出。
- Source Configuration Profile 与结构化消费合同固定为 `0.86.1`；Source v0.84.0 合同和 ADR 保留为历史记录。

## 测试与发布

- Source adapter 回归测试验证三字段 TemplateBundle 成功解析和无效 Workflow 分支。
- Workflow compiler 回归测试验证活动输出节点发现、断开输出节点删除和没有活动输出节点时的明确失败。
- 完整测试通过：530 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.15%、branches 86.41%、functions 100%、lines 95.74%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.3

v0.37.3 修复 DSH Desktop production generation 中的 managed CLI 在 Node.js 24 下无法启动的问题。

## managed CLI 运行入口

- Desktop 与 Web Host 启动器现在使用仓库已有的 tsdown 0.22.2，把 `scripts/cli/harness-comfyui.mjs` 及其 TypeScript 依赖生成到 `.local/source-cli/harness-comfyui.mjs`。
- Host 注入 `DSH_HARNESS_COMFYUI_CLI` 时只提供构建后的 JavaScript 入口。在 managed CLI 相关文件中，DSH Desktop generation 复制 `.local/source-cli/` 构建目录，不复制 `scripts/cli/` 源入口。
- Desktop 与 Web Host 准备链都在发布 Profile 或 runtime state 前完成 CLI 物化；CLI 构建失败会中止准备，不会发布缺少可执行 CLI 的新运行状态。

## 故障原因

- v0.37.2 的 generation 把 `scripts/cli/harness-comfyui.mjs` 安装到 `node_modules/harness-comfyui`，该入口继续导入 `src/cli/contract.ts`。
- Node.js 24 拒绝对 `node_modules` 内的 TypeScript 文件执行类型剥离，因此目录查询、模板解析和 LoRA 解析在到达 Host route 前统一失败并返回 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`。

## 测试与发布

- CLI 集成测试从临时 `node_modules/harness-comfyui/.local/source-cli/harness-comfyui.mjs` 执行全部命令合同。
- Host、Desktop、Web Host 与真实 DSH bash 测试覆盖构建后路径、generation 打包清单、准备失败原子性和 managed shell capability。
- 构建后的 CLI 已在 Node.js 24.9.0、24.14.0 与 25.8.2 下进入预期的受管环境校验，产物没有运行时 TypeScript import。
- 完整测试通过：530 项 unit/integration、29 项 contract/security、102 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功；覆盖率为 statements 93.05%、branches 86.32%、functions 100%、lines 95.67%。
- 完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加或升级依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

# Harness ComfyUI v0.37.2

v0.37.2 恢复从旧 Web 生产运行目录升级到 DSH Desktop 生产运行目录时没有迁移的 Session 数据。

## 生产 Session 迁移

- `prod:start` 和 `prod:restart` 在启动 DSH Desktop 前，把旧 `.local/production/dsh-home` 中的 Session 与 Attachment 合并到当前生产 DSH home。
- 启动器把旧 version 3 聚合 Session 投影索引转换为当前 version 4 逐 Session 索引，并按 Workspace 路径把旧 Session ID 合并到当前 Workspace 记录。
- 迁移保留当前生产 DSH home 中已经创建的 Session 和索引；重复启动不会覆盖当前文件，也不会删除旧运行目录中的原始数据。

## 测试与发布

- 生产生命周期测试验证 `prod:start` 在启动 DSH Desktop `preview` 前接入迁移，并同时保留旧 Session、新 Session、Session 投影索引、Attachment 和同路径 Workspace Session 关系。
- Session 迁移测试分别验证旧目录不存在、当前 DSH home 为空、旧源文件保留和重复调用不覆盖当前 Session 文件或投影索引。
- 真实 DSH Desktop `preview` 验收从旧生产 DSH home 种入保存 Session，并通过实际侧栏列出、选择和媒体结果读取证明迁移链路。
- 完整测试通过：529 项 unit/integration、29 项 contract/security、99 项 production、32 项 prototype 和 2 项真实 Desktop 测试成功。
- 覆盖率为 statements 93.05%、branches 86.32%、functions 100%、lines 95.67%；完整依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有增加依赖。GitHub Release 只包含 Git tag 与 Release 记录，不附加产品包。

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
