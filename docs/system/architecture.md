# 系统架构

## 启动与重启链路

```text
pnpm prod:start|restart
  → scripts/desktop/production-cli.mjs
  → config/desktop-production.json
  → 当前插件 Client/Host/Preset 物化与 generation 打包
  → 当前 checkout 的 .local/upstreams/dsh-desktop
  → DSH Desktop pnpm preview
  → .local/desktop-production/ 中的 PID、日志、DSH home 和业务数据
```

独立 worktree 的完整 Desktop 开发入口复用同一产品配置和 Desktop 生命周期：

```text
pnpm dev:start|restart
  → scripts/desktop/cli.mjs
  → config/desktop-worktree.json 与 linked-worktree 门禁
  → <worktree>/.env 和 <worktree>/node_modules 链接到 main
  → config/desktop-production.json
  → main 的 .local/upstreams/dsh-desktop
  → 当前 worktree 插件 generation
  → DSH Desktop pnpm dev
  → .local/desktop-development/
```

旧 Web Host 是独立调试入口：

```text
pnpm web:start|restart
  → scripts/worktree/cli.mjs
  → config/web-development.json
  → scripts/production/ 中的共享 Web Host 生命周期
  → .local/web-development/
```

`package.json.exports` 的 Host 入口直接指向 `src/index.ts`。Client 类型入口指向 `src/client/index.tsx`，浏览器运行入口是根据当前 Client 源码生成的 `.local/source-client/client.js`。Desktop generation 打包和 Web Host start/restart 都更新该浏览器模块；两条链路不读取 `lib/`。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `scripts/desktop/` | Desktop 产品配置解析、worktree 链接准备、generation 打包安装、Electron dev/preview 启停、状态和日志 |
| `scripts/production/` | Web Host Client 模块生成、配置解析、PID 与端口所有权、启停、状态、健康和日志的共享实现 |
| `scripts/worktree/` | `web:*` 的 linked-worktree 门禁、Web 调试配置和共享 Web Host 生命周期适配 |
| `scripts/profile/source.mjs` | 在运行目录中创建指向当前源码的 Harness profile |
| `scripts/profile/agent-preset.mjs` | 校验并物化 production/worktree 的 ComfyUI 工作台 Preset 和共享 Tool visibility component，并删除配置声明的已退役项目 Preset |
| `scripts/cli/` | Agent 在受管前台 shell Tool Call 中通过 Node 解释器执行的项目 CLI 脚本 |
| `src/cli/` | 项目 CLI 的环境变量名称、argv、request、Generation Request 和历史 Run 输入查询合同 |
| `src/host/catalog/` | 通过本地 Catalog CLI 查询上下文目录，严格映射 Source v0.84.0 的封面与样例图片展示字段，提供 Agent 模板、LoRA、生成模型与 ComfyUI 实例 ID 查询 Tool，并向 Client 提供 Catalog Typert Remote |
| `src/host/cli/` | 从前台 shell ToolExecution 建立短期 capability，并通过 loopback route 把 CLI 请求交给 Catalog adapter 或 Generation Runtime |
| `src/host/generation/` | Run Repository、Source adapter、运行时 Workflow 参数化、官方前端 API Workflow 导出与缓存、Comfy transport、coordinator、Generation 创建 Tool、历史 Run 输入查询 Tool、Generation Remote、媒体路由和 Session Media Viewer 页面生成器 |
| `src/host/image-reader/` | 图片读取设置迁移与保存、运行时视觉模型目录、系统 Provider/OpenAI 兼容适配和单图视觉模型调用 Tool |
| `src/host/tools/` | 项目 Tool 唯一注册入口 |
| `src/generation/` | Host、Tool 与 CLI 共用的 Generation Remote、媒体 URL 和历史 Run 输入查询合同 |
| `src/image-reader/` | Host 与 Client 共用的命名图片读取配置、凭据更新、视觉模型目录和 Remote 合同 |
| `src/client/` | 使用 Harness 原生扩展位的工作台、上下文选择器、Generation Run/Media 投影与图片读取设置页 |
| `.agents/skills/` | 六个项目 Skill 的 canonical source；每个 Skill 都包含自身执行所需的 CLI 参考文档 |
| `config/` | 生产配置、schema、环境变量映射和数据源合同 |
| `profiles/` | Harness bundle composition 模板 |

DSH Desktop、DeepSeek Harness 与当前仓库保持三个源码边界。DeepSeek Harness 核心源码保持未修改。DSH Desktop 的移动桥接端口入口由 `fzfz/dsh-desktop:codex/configurable-mobile-bridge-port` 维护；该仓库只在启动进程时传入 `DSH_DESKTOP_MOBILE_BRIDGE_PORT`，不复制 DSH Desktop 源码，也不把 Desktop 写入当前仓库 manifest 或 lockfile。开发启动从已安装 Desktop 提供 Harness 模块，只把当前仓库打包为 `harness-comfyui` generation。Desktop generation registry 的 `desired.json` 和 profile 中的 generation `link:` 负责启用插件，插件源码不进入 Desktop 仓库。

Client 在已保存 Session 中通过 Harness 原生 `details` 扩展位显示真实 Generation Run/Media 投影。Harness `0.1.2-alpha.1` 不为尚未保存的空白 Session 分配 `details` 列宽；Client 仅在该状态通过公开 `shell.overlay` 扩展位显示空结果列。Session 保存后，`shell.overlay` 结果列退出，原生 `details` 结果列接管，页面只保留一个可见结果列。

“插入上下文”资源卡片把封面预览按钮与记录选择按钮作为同级交互。封面预览按钮在同一个 Catalog `Modal` 中切换到图片画廊；关闭画廊后恢复 Catalog 查询、分页和待确认选择。画廊 header 不参与 flex 收缩，画廊 body 只占用 Modal 中 header 之外的剩余高度；图片按固有尺寸显示，超出查看区域时由该区域提供水平和垂直滚动条。`CatalogItem.coverUrl` 与 `CatalogItem.sampleImageUrls` 只属于 Client 展示投影，不进入 `CatalogContext` 或 composer 草稿。

## 进程与状态

`prod:start` 与 `dev:start` 都更新浏览器 Client/Host 模块、物化 `ComfyUI工作台预设`、把当前插件安装为 Desktop generation，再分别执行 DSH Desktop 自己声明的 `pnpm preview` 与 `pnpm dev`。两个环境读取同一个 `cordis.patch.yml` 和 `config/desktop-production.json` 产品配置，写入各自隔离的 Desktop HOME、DSH home、PID 和日志目录。

`web:start` 与 `web:restart` 更新浏览器 Client 模块、物化相同 Preset，再以前台子进程运行独立 Harness Web Host。Web 进程管理器记录 PID、进程启动时间和命令，并验证端口由该 PID 持有；`web:health` 只检查源码版本、Harness Web、Client ModuleLoader、Run Repository、Official API Workflow Cache 和 Saved Media。

`prod:test` 使用 Vitest 和临时运行目录自动调用同一套进程管理模块，覆盖六个生命周期操作、PID 身份和端口异常分支。

生产 Desktop 状态写入 `.local/desktop-production/`；开发 Desktop 状态写入当前 worktree 的 `.local/desktop-development/`；Web Host 调试状态写入 `.local/web-development/`。源码仍保留在仓库根目录。配置变更在下一次对应入口的 start 或 restart 时生效。

## Generation 生命周期

六个项目 Skill 以主开发 checkout `/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/<skill-name>` 为 canonical source。生产环境的 `$HOME/.agents/skills/<skill-name>` 使用绝对符号链接指向主开发 checkout 中相同名称的目录，不得指向独立 linked worktree。`ComfyUI工作台预设` 使用全局项目 Skill；Prompt 与生成 Skill 和 `comfyui-image-review` 通过各自文档定义的受管项目 CLI 查询所需的历史 Generation Run 数据，`local-image-reader` 只通过自己的 CLI 参考读取用户提供的本地图片绝对路径。CLI 身份链路如下：

```text
前台 bash/pwsh ToolExecution
  → CliShellCapabilityStore 取得 Session、Turn、Call ID 与 cwd
  → shell environment 提供 CLI 脚本路径、loopback URL 与短期 capability
  → scripts/cli/harness-comfyui.mjs 提交业务参数
  → src/host/cli/route.ts 通过 cwd 解析 Workspace 并校验 Session 归属
  → generation submit：GenerationRuntime.acceptGeneration(identity, request)
  → generation run-inputs：GenerationRuntime.readGenerationRunInputs({ workspaceId, runIds })
  → generation resolve-media：GenerationRuntime.readGenerationRunMedia({ workspaceId, runIds })
  → image inspect：ImageReaderService.inspect(filePath)
```

`read_comfyui_run_inputs` Tool 从 Tool Call、Session cwd 和 workspace registry 派生当前 Workspace；CLI 查询从短期 shell capability 派生当前 Workspace。两条入口都只把 `workspaceId` 和用户提供的 `run_id` 交给 `GenerationRuntime.readGenerationRunInputs()`，不接受调用者提供的 Workspace ID、Session ID、Turn 或 Tool Call ID。

`GenerationRuntime.readGenerationRunInputs()` 要求一次查询包含 1 至 20 个字符串，并按照输入顺序逐项读取 Run Repository 的 `request_json` 和 Run 目录中的 Actual Workflow。Runtime 先检查当前 Workspace 中的完整 Run ID 精确匹配；没有精确匹配且输入是最少八个 UUID 字符的 canonical 起始片段时，Runtime 只在当前 Workspace 中读取最多两个前缀匹配。零个匹配返回 `GENERATION_RUN_NOT_FOUND`，唯一匹配返回完整 canonical `run_id`，多个匹配返回 `GENERATION_RUN_ID_AMBIGUOUS` 并要求调用者增加前缀长度。当前 Workspace 之外的 Run 不参与前缀唯一性判定。合法批量请求中的无效 ID、缺失 Run、歧义前缀、损坏请求或未分类读取故障只产生对应结果项；后续 Run 继续查询。取消信号终止整个查询。

可用结果项投影创建 Run 时传入 `generate_with_comfyui` 的 `title`、可选 `instance_id`、`template_id`、可选 `model`、完整 `parameters` 和 `loras`。历史请求缺少 `loras` 属性时投影空数组；该空数组只表示调用参数没有保存显式结构化 LoRA 选择，不能证明 Actual Workflow 没有预置或活动 LoRA。历史请求缺少 `model` 属性时不投影 `model`；该省略表示调用参数没有保存显式模型覆盖，Run 使用 Actual Workflow 当时保存的模型。Actual Workflow 可用时返回完整 JSON；准备失败、文件缺失或文件无效时仍返回生成参数，并通过 `workflow_status: "unavailable"` 和 `workflow_error` 说明 Workflow 错误。

同一个 shell Tool Call 的相同 Generation Request 重放同一个 Run；同一个 shell Tool Call 的不同 Generation Request 返回 `RUN_REQUEST_CONFLICT`。创建多个独立 Run 时，每次 submit 使用不同的前台 shell Tool Call，因此 Host 为每次调用保存不同的 `call_id`。

`query_semantic_comfyui_instances` 使用固定 search 请求读取 Catalog CLI 当前返回的 ComfyUI 实例目录，并且每个实例结果项只向 Agent 投影 `id`。`comfyui-generate` 把当前查询的首个有效 ID 传给 `generate_with_comfyui`；Host 不根据 Workflow、生成模型、LoRA、运行参数或已有 Run 记录选择实例。

`generate_with_comfyui` 在 Run Repository 持久化当前 Tool `callId` 后完成 Source、实例和模板读取、`/object_info` 读取、运行参数解析、模型和 LoRA 映射以及 Official API Workflow 准备。上述阶段失败时，Tool Call 收到原始错误码和错误信息，失败 Run 同时保存该错误。准备成功时，Tool 返回 `run_id`；Host 内的 Generation Coordinator 继续异步执行 ComfyUI `/prompt` 提交、Jobs API 观察、远端结果处理和媒体保存。Host 停止时 coordinator 中止本地观察但不取消远端 ComfyUI 任务；Host 重启后从非终态 Run 继续观察。

Generation 编译链路分为参数语义和最终导出两个阶段：

```text
原始 UI Workflow + 请求参数
  → ComfyWorkflowCompiler 读取或复用 10 分钟进程内 /object_info 缓存
  → 修改 Actual Workflow，并生成运行时 API Workflow 投影
  → OfficialApiWorkflowCompiler 查找本地缓存
      → cache miss：ChromeComfyFrontend 调用目标实例官方 loadGraphData() 与 graphToPrompt()
      → cache hit：直接读取 Official Base API Workflow
  → Runtime Input Overlay 把非连接请求值写入官方基础对象的深拷贝
  → Comfy transport 把最终 API Workflow 提交给 /prompt
```

`ComfyWorkflowCompiler` 不读取 Source 模板参数定义或参数绑定。Generation Tool 把用户显式提供的运行参数键和值交给 compiler；compiler 使用当前 UI Workflow、目标实例 `/object_info`、节点输入名、节点标题、活动状态和上下游连线定位可写 widget。参数键中的节点 ID 后缀可以选择同类控件；两个参数用不同值占用同一 widget 时终止编译。

compiler 把 `/object_info` 中字符串数组形式的输入定义作为对应运行参数目标的允许值集合。精确值保持不变；唯一大小写无关匹配写入实例返回的精确值；无匹配或非唯一匹配返回 `GENERATION_PARAMETER_INVALID`。错误信息包含 generation parameter ID、目标 ComfyUI 节点输入、收到值、实例允许值和重新调用 `generate_with_comfyui` 的动作，因此 Tool 调用方可以修正参数后重试。

`ComfyWorkflowCompiler` 按实例 ID 和实例 URL 在 Host 进程内缓存成功解析的 `/object_info` 10 分钟。相同缓存键的并发 compile 共享一个在途请求；不同实例 ID 或 URL 使用独立缓存项；请求失败或响应无效时不写入缓存。该缓存不持久化认证值或节点定义。

正向 Prompt 与负向 Prompt 使用采样路径的 `positive`、`negative` 输入和明确节点标题区分。compiler 优先匹配公开参数键和 Prompt 输入别名；没有名称候选时，compiler 从实时 `/object_info` 中选择类型为 `STRING` 且 `multiline=true`、没有输入连线并且下游执行路径符合目标 Prompt 极性的 widget。一个 Prompt 控件同时连接正向分支和零化负向分支时只暴露为正向 Prompt；断开执行路径的 Prompt 节点不覆盖具有下游执行连线的 Prompt 节点。精确 `width`、`height` 只修改唯一的 latent 构造 widget或其唯一上游标量控件；使用 `aspect_ratio` 与 `megapixels` 生成尺寸的 selector 不会被强制断开。目标不存在或仍不唯一时，compiler 返回包含具体参数键的错误；目标不唯一时，错误还列出候选 ComfyUI 节点输入。

实时输入定义为 `BOOLEAN` 且 UI Workflow 序列化值不是布尔值时，compiler 使用该输入定义中的布尔默认值；实时定义没有布尔默认值时终止编译。Seed、模型实例路径、标准 LoRA、Power LoRA、LoraManager、bypass 解析和活动输出节点筛选继续由该阶段负责。空 LoRA 选择保留 UI Workflow 保存的 LoRA 状态；非空结构化 LoRA 选择只修改活动 Loader，不激活 bypass Loader。compiler 不根据源尺寸自动改写独立下游放大尺寸。

`ComfyWorkflowCompiler` 产生的手写 API Workflow 现在只作为运行时 API Workflow 投影。Official Base API Workflow 才是最终执行节点集合、连接 tuple、虚拟节点和自定义 widget 序列化的权威来源。官方前端把某些字面量序列化为没有`class_type`、只有`inputs.UNKNOWN`和可选`_meta`的载体对象时，`OfficialApiWorkflowCompiler`只在一个合法执行节点输入以`[载体节点ID, 0]`引用该对象时，把载体值折叠进消费者输入并在严格结构校验前删除已消费载体。非零输出索引、未被合法执行节点引用的同形对象和其他无`class_type`对象均导致导出失败。Runtime Input Overlay 只替换官方对象中已经存在的同名非连接输入；当官方输入使用 `{ "__value__": ... }` 包装时只替换 `__value__`。Runtime Input Overlay 不替换官方连接，也不删除官方执行节点、额外节点或额外输入。官方前端导出、缓存读取或 Runtime Input Overlay 失败时，本次 Generation Run 明确失败，生产路径不会直接提交手写投影。

Official API Workflow Cache 的 identity 包含目标实例 ID、实例 origin、Host 级缓存代次、编译器 schema 版本、原始 UI Workflow 哈希和参数化后执行结构哈希。执行结构哈希包含节点 ID、`class_type`、输入名称、连接 tuple 和非连接值类型，因此 bypass、连接断开和 Power LoRA 动态输入数量变化会产生新的缓存项；Prompt、seed、尺寸和权重变化复用同一基础对象。Host 级缓存代次变化时，全部已登记实例的旧缓存均不再命中。损坏或 identity 不匹配的缓存文件返回明确错误，不触发静默重编译。同一 Host 进程中的并发 cache miss 合并为一次官方前端导出。

非空结构化 LoRA 选择命中精确类型为 `Lora Loader (LoraManager)` 的活动节点时，compiler 同时更新 `text` 与结构化 `loras` widget。空 LoRA 选择不修改模板保存的 `text` 与 `loras`。最终官方输出中的数组包装由目标实例前端生成，因此非空选择对应节点的 `inputs.loras.__value__` 与本次 LoRA 名称、模型权重、CLIP 权重和 active 状态一致。

Comfy transport 向 `/prompt` 发送 API Workflow，并把同一 Run 的 Actual Workflow 放入 `extra_data.extra_pnginfo.workflow`，供读取 `EXTRA_PNGINFO` 的节点使用。Jobs API 完成响应中的 `type=temp` 预览不进入 Saved Media；`type=output` 图片或视频继续执行 descriptor 路径、响应媒体类型、大小和文件签名校验。

Run Repository 保存状态和索引；Run 目录保存每次运行独立的请求、来源快照、Actual Workflow 和 API Workflow；Saved Media 使用随机 `media_id` 的两级前缀分片。媒体内容与媒体所属 Actual Workflow 通过同一个 Harness HTTP 服务的 `/api/harness-comfyui/media/<media_id>/content|workflow` 提供。

Client 结果列把每项 Generation Media 链接到 `/api/harness-comfyui/media/<media_id>/view?session_id=<session_id>`，缩略图仍从该媒体的 `/content` 路由读取。Host 在返回查看页前验证 HTTP 方法、Session、workspace 和媒体归属。查看页的启动数据只包含当前 Session 中每项媒体的媒体 ID、所属 Generation Run 的 `runId`、媒体类型、文件名、生成时间、同源内容 URL、查看页 URL 和所属 Run 保存的原始 `parameters.positive_prompt`；启动数据不包含完整生成请求、Actual Workflow、API Workflow 或远端实例认证信息。

Session Media Viewer 使用 `GenerationRuntime.queryMedia()` 返回的 `created_at DESC, output_index DESC, media_id DESC` 顺序。Host 只把每项媒体的 `runId`、媒体显示属性、同源内容 URL、同源查看 URL 和正面提示词投影到查看页；Host 不把完整 Generation Request 或 Workflow 投影到查看页。左侧按钮和裸 `ArrowLeft` 切换到较新媒体，右侧按钮和裸 `ArrowRight` 切换到较早媒体；首项与末项禁用对应方向并且不循环。页面切换媒体后使用 `history.replaceState()` 更新当前媒体 URL，刷新该 URL 后 Host 仍以同一媒体作为当前项。

查看页顶部显示当前媒体所属 Generation Run 的完整 `run_id`。用户点击该值后，页面使用浏览器 Clipboard API 写入完整 `run_id`；成功时显示“已复制”。Clipboard API 缺失或拒绝写入时，按钮显示“复制失败”，`aria-live` 分别说明当前环境不支持剪贴板写入或当前页面没有剪贴板写入权限，并提供对应的用户动作。页面用浏览器原生视频控件播放视频；图片和视频保持原始宽高比完整显示，不裁切内容。图片加载后，页面读取 `naturalWidth` 和 `naturalHeight`；视频元数据加载后，页面读取 `videoWidth` 和 `videoHeight`。上述值定义为媒体文件的固有像素尺寸，不使用 Generation Request 中的 `width` 或 `height` 推测。切换媒体时尺寸先显示“读取中”，零尺寸或媒体加载失败时显示“尺寸不可用”；已经被替换的媒体产生迟到事件时不得覆盖当前媒体的尺寸。页面在媒体下方逐字符显示保存的正面提示词或明确缺失状态。

## 图片读取与 Prompt 对比

`GenerationRuntime.readGenerationRunMedia()` 接受一至二十个完整 `run_id` 或唯一规范前缀，按输入顺序查询当前 Workspace，并为每个输入返回独立的成功元素或错误元素。成功元素包含原始 Generation Request 参数和 Saved Media 的本地图片路径。DSH Tool `get_generation_run_media` 与受管 CLI 命令 `generation resolve-media --stdin` 复用该运行时方法，且两种入口都不调用视觉模型。

`ImageReaderService.inspect()` 一次只接受一个本地图片路径，并从 `configuration.activeProfileId` 解析当前命名配置。每次调用都使用该配置保存的读图 Prompt，Tool、CLI 和 Skill 都不能提供调用时覆盖值。`runtime` 配置把图片保存为 Harness Attachment，再使用配置中的系统 Provider、模型、`temperature` 和最大输出 Token 准备独立 LLM 调用。`openai-compatible` 配置不经过 Harness LLM Runtime 或 Attachment Store；Host 把同一张图片编码为 Data URL，向配置的完整 Chat Completions 地址发送模型 ID、提示词、`temperature` 和 `max_tokens`。OpenAI 兼容响应体的声明长度与实际流式累计长度都不能超过 1 MiB，读取响应体和解析 JSON 时继续传播调用者取消。

API Key 作为 `credentials.<profileId>` Settings secret 保存。Client 收到的凭据状态只包含每份配置的 `hasApiKey`，并通过 Remote 提交首次设置、替换或清除凭据的 write-only 操作；Client 选择保留时不会提交新的密钥值。Host 使用一次 `settings.replace()` 原子提交公开配置与凭据。Host 在新 namespace 尚无用户值时，把旧单配置 namespace 的用户 Provider、模型、提示词、`temperature` 和最大输出 Token 迁移为一份 `runtime` 配置。

DSH Tool `inspect_image` 与受管 CLI 命令 `image inspect --stdin` 复用该服务。该服务与两种入口都不读取 Generation Request 参数，也不比较或改写 Prompt。

`local-image-reader` Skill 按自己的 `references/image-inspection-cli.md` 为用户提供的每个本地图片绝对路径分别调用一次 `image inspect --stdin`。该 Skill 只返回视觉模型观察或单图读取错误，不查询 Generation Run，也不生成改进 Prompt。

`comfyui-image-review` Skill 按自己的 `references/cli.md` 先批量调用 `generation resolve-media --stdin`，再为每张图片分别调用 `image inspect --stdin`。执行该 Skill 的 Agent 使用原始参数与图片观察结果完成比较和 Prompt 改进，因此 Run 解析、图片读取和 Prompt 对比保持三个独立职责。
