# ComfyUI 官方前端编译与本地 API Workflow 缓存实施发现

## 已确认的设计依据

- 模板 39 的 `Lora Loader (LoraManager)` 后端忽略 `inputs.text`，并通过动态结构化 `inputs.loras` 加载 LoRA。
- Harness 现有 `workflow-compiler.ts` 根据 `/object_info` 手写 UI-to-API 映射；`/object_info` 没有公开 LoraManager 动态 `loras` descriptor，因此现有编译结果遗漏该输入。
- ComfyUI 官方前端在实时 widget 上执行序列化规则，并把数组 widget 包装为 `{ "__value__": [...] }`。
- 可丢弃 POC 已证明普通 Node 进程能够通过本机 Chrome 和 Chrome DevTools Protocol 调用 `192.168.110.122` 的官方前端。缓存未命中时浏览器编译耗时 16,817 ms；缓存命中时在不存在 Chrome 可执行文件的条件下耗时 14 ms 并返回 `browserInvoked=false`。
- POC 的官方导出结果包含 54 个 API 节点；模板 39 节点 5 包含 `inputs.loras.__value__`。

## 待确认的实施事实

- 已确认：`SourceGenerationPreparer.prepare()` 先读取模板与实例，再把原始 UI Workflow、运行时参数、binding、模型和 LoRA 一次性交给 `WorkflowCompiler.compile()`；旧编译器同时负责修改 Actual Workflow 与生成 API Workflow。
- 已确认：当前 Configuration Profile 没有 Chrome 路径、官方前端编译超时或缓存目录。`paths.dataDir` 是本地持久数据根目录，新增缓存目录应当作为 `paths` 的明确字段由启动器映射，不能在源码中推导隐藏路径。
- 已确认：Run Repository schema 与迁移直接位于 `src/host/generation/generation-runtime.ts`；仓库没有独立 `run-repository.ts`。
- 已确认：`config/error-catalog.json` 是后端错误码对应用户文案的唯一结构化来源。当前 `WORKFLOW_COMPILE_FAILED` 只描述泛化编译失败；官方前端的 Chrome 启动、页面就绪和导出失败需要明确错误码。
- 已确认：架构文档仍声明生产 `Workflow compiler` 根据 `/object_info` 和 UI Workflow 连接生成 API Workflow；实施完成后必须更新该段落为官方前端编译缓存数据流。
- 已确认：配置变更需要同步 `config/schema.ts`、`config/base.json`、`config/profiles/production.json`、生产启动映射、配置测试和系统配置文档。
- 已确认：发布规范要求源码提交与文档提交分别通过 `pnpm quality` 和 GitHub CI，最终发布提交创建新 SemVer tag 与 GitHub Release，再更新生产 checkout。
- 待确认：现有测试是否提供浏览器适配器、时间和文件系统注入 seam。
- 已确认：本次变更新增 Host 编译与缓存能力，目标版本按 SemVer minor 更新为 `0.31.0`。
- 已确认：当前仓库 remote `origin` 指向 `https://github.com/fzfz/harness-comfyui.git`，`origin/main` 与 worktree 起点均为 `02123773a2b01bedcb82594d517a3ea3e19df9c1`；`docs/agents/issue-tracker.md` 中“没有 Git remote”的陈述已经过时。
- 已确认：本机 GitHub CLI 已登录且具备 `repo` 与 `workflow` scope；`v0.31.0` tag 和 GitHub Release 当前均不存在。
- 已确认：生产 checkout 位于提交 `02123773a2b01bedcb82594d517a3ea3e19df9c1` 的 detached HEAD，只有生产专属 `config/base.json` 修改；部署必须保留该修改并从最终发布 SHA 更新源码。

## 当前编译器拆分边界

- `ComfyWorkflowCompiler.compile()` 当前按以下顺序处理请求：读取 `/object_info`、复制 UI Workflow、应用 runtime parameters、生成 rgthree 随机种子、应用模型、应用 LoRA、手写生成 API Workflow、筛选输出节点。
- 参数目标解析、模型/LoRA 实例路径验证和 Actual Workflow 控件修改仍然需要 `/object_info`；本次修复只替换 API Workflow 序列化来源，不能删除这些参数语义能力。
- 旧 `compile()` 函数通过 `mapWidgets()`、`resolveWorkflowLink()` 和 Power Lora 特例手写完整 API Workflow。生产切换完成后，`SourceGenerationPreparer` 不得把该手写结果提交给 transport。
- `src/host/plugin.ts` 是生产对象装配入口。当前入口只创建 `ComfyWorkflowCompiler`；新实现需要在该入口显式装配参数化器、官方前端编译缓存、运行时 API 参数写入器和配置值。
- 生产进程管理器当前生成五个持久路径环境变量。官方 API Workflow 缓存目录应当成为第六个由 `scripts/production/runtime.mjs` 生成并由 `scripts/production/process.mjs` 透传的受管路径。
- 当前 `config/environment-overrides.json` 没有浏览器可执行文件、前端编译超时、缓存代次或缓存目录映射。

## 旧编译器回归能力核对

- `origin/main` 的 `workflow-compiler.ts` 原有编译器回归用例全部保留。当前实现继续通过透传 `officialApiWorkflowCompiler.compile()` 测试替身验证旧参数化和运行时投影结果，并增加真实 `ComfyWorkflowCompiler` 到 `OfficialApiWorkflowCompiler` 的 cache hit 与新鲜导出等价用例。静态 `it(...)` 数量不能代表 `it.each(...)` 展开的运行用例数量，因此发布文档不再使用该数量描述覆盖范围。
- 当前源码没有删除旧编译器中的通用函数。参数 binding、连接上游 Prompt 解析、尺寸倍率保持、rgthree seed、实例模型路径、标准 LoRA、Power LoRA、LoRA Text Loader、bypass 解析和活动输出节点筛选仍在调用 `OfficialApiWorkflowCompiler.compile()` 之前执行。
- 旧 `compile()` 仍然生成运行时 API Workflow 投影。`OfficialApiWorkflowCompiler` 使用该投影计算执行结构指纹，并且只把非连接运行时值写入官方基础 API Workflow 的副本。
- `OfficialApiWorkflowCompiler` 保留官方连接 tuple、官方虚拟节点和官方自定义 widget 序列化。旧编译器不再拥有最终 `/prompt` 请求拓扑的决定权。

## 官方输出与旧编译结果对比

- 模板 39 的 POC 官方 API Workflow 与受控旧编译结果均包含 54 个相同节点；官方输出额外保留 LoraManager autocomplete、TriggerWord Toggle、easy showAnything 和 Image Comparer 的前端序列化输入。
- 该对比证明生产实现可以把官方 API Workflow 作为节点和输入结构的唯一基础，再只覆盖本次请求明确修改的运行时输入。生产实现不得用旧编译结果替换官方基础对象。
- 运行时输入覆盖必须保留官方数组包装：官方基础值为 `{ "__value__": [...] }` 且运行时值为数组时，覆盖器只替换 `__value__`。运行时覆盖不得替换官方连接 tuple。
- UI Workflow 中的 mode、link 或动态输入键集合变化会改变 API Workflow 结构。缓存键除模板 Workflow 哈希外还必须包含参数化后执行结构指纹，避免把 bypass 激活、连接断开或 Power Lora 输入数量不同的结构错误复用。
- 旧编译器可以在迁移期间提供非连接运行时输入投影和执行结构指纹，但 `SourceGenerationPreparer` 最终提交的 API Workflow 必须由“官方基础对象 + 非连接运行时输入覆盖”产生。旧投影连接只能参与结构指纹与一致性检查，不能覆盖官方连接。
- 官方额外输入可能依赖运行时 widget。缓存实现必须用代表 Workflow 证明所有当前支持的运行时修改在 cache hit 后与新鲜官方导出等价；未知等价关系不能按首次请求值直接复用。
- `templateWorkflowHash` 明确读取运行时修改前的 `WorkflowCompilerInput.workflow`，`instanceId` 明确读取 `ComfyInstanceSource.id`。

## 依赖安全审计

- 当前方案优先使用 Node 标准库、Node 内置 WebSocket 和本机已安装 Chrome/Chromium，不修改 `package.json`。
- 如果实施发现 Node 22 的内置能力不能满足生产 seam，计划执行者必须在安装任何依赖前记录依赖名称、精确版本、维护状态、已知安全公告、安装脚本和替代方案，并等待计划更新完成。
- 本机 Context7 `0.3.5` 没有返回 Node.js 官方文档库；计划执行者没有安装或升级 Context7，也没有采用结果中的第三方浏览器项目。
- Node.js 官方 v22 文档说明 `WebSocket` 在 v22.0.0 不再需要实验 flag，并在 v22.4.0 脱离 experimental；仓库固定 Node `22.19.0` 可以直接使用该全局 API。
- Node.js 官方 v22 `child_process.spawn()` 文档定义 `signal: AbortSignal` 与 `killSignal`，生产实现可以使用 AbortSignal 管理自有 Chrome 子进程，不需要进程管理依赖。
- 依赖审计结论：本次实施不新增 npm 依赖、不修改 `pnpm-lock.yaml`、不执行 package 安装脚本。Chrome 只加载用户已登记的 ComfyUI 实例页面；实现不使用 `--no-sandbox`，不运行下载后的本机脚本。
# 2026-08-27 实施验证补充

- 最终生产源码通过普通 Node Host 路径启动本机 Chrome，并在 16.02 秒内调用 122 官方 `loadGraphData()` 与 `graphToPrompt()`；同一模板的第二个不同 LoRA 权重请求没有再次调用浏览器。
- 模板 39 的 cache miss 官方基础对象包含节点 5 `inputs.loras.__value__`；cache hit 覆盖把请求权重从 4 改为 3，同时缓存文件中的基础对象仍保持权重 4。
- 最终 `ComfyHttpTransport` 提交受控请求 `29f91894-e160-4b3f-abb6-565f8f7e9617`。122 history 返回 `success` 和 `completed=true`，节点 5 精确记录结构化 LoRA 路径、模型权重、CLIP 权重与 active 状态。
- 受控请求节点 13 输出文件为 `2026-08-27-221214_anima-aesthetic-v1.1_777001.png`；请求结束后 122 队列 running 与 pending 都为 0。
