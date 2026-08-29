# 系统架构

## 启动与重启链路

```text
pnpm prod:start|restart
  → scripts/production/cli.mjs
  → 配置加载与运行合同校验
  → 当前 Client 源码转换为 .local/source-client/client.js
  → 源码 profile 和 DSH home 准备
  → ComfyUI 工作台 Agent Preset 与共享 Tool visibility component 校验和物化
  → DeepSeek Harness Host
      → src/host/plugin.ts
      → .local/source-client/client.js
  → .local/production/ 中的进程状态、日志和业务数据
```

独立 worktree 开发入口复用同一生命周期深模块：

```text
pnpm worktree:start|restart
  → scripts/worktree/cli.mjs
  → config/worktree-development.json 与 linked-worktree 门禁
  → scripts/production/cli.mjs 的共享生命周期
  → .local/worktree-development/dsh-home
      → 主开发 worktree .env 的符号链接
      → comfyui-workbench-development Profile
  → Host 注册 startup workspace 后暴露项目能力
```

`prod:stop`、`prod:status`、`prod:health` 和 `prod:logs` 使用受管运行快照定位当前进程，不生成 Client 模块。

`package.json.exports` 的 Host 入口直接指向 `src/index.ts`。Client 类型入口指向 `src/client/index.tsx`，浏览器运行入口指向 `prod:start` 或 `prod:restart` 根据当前 Client 源码生成的 `.local/source-client/client.js`。启动与重启链路不读取 `lib/` 或发布产物。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `scripts/production/` | Client 模块生成、配置解析、PID 与端口所有权、启停、状态、健康和日志 |
| `scripts/worktree/` | linked-worktree 门禁、开发定义解析和共享生命周期命令适配 |
| `scripts/profile/source.mjs` | 在运行目录中创建指向当前源码的 Harness profile |
| `scripts/profile/agent-preset.mjs` | 校验并物化 production/worktree 的 ComfyUI 工作台 Preset 和共享 Tool visibility component，并删除配置声明的已退役项目 Preset |
| `scripts/cli/` | Agent 在受管前台 shell Tool Call 中执行的项目 CLI executable |
| `src/cli/` | 项目 CLI 的环境变量名称、argv、request 和 Generation Request 合同 |
| `src/host/catalog/` | 通过本地 Catalog CLI 查询上下文目录，严格映射 Source v0.84.0 的封面与样例图片展示字段，提供 Agent 模板、LoRA、生成模型与 ComfyUI 实例 ID 查询 Tool，并向 Client 提供 Catalog Typert Remote |
| `src/host/cli/` | 从前台 shell ToolExecution 建立短期 capability，并通过 loopback route 把 CLI 请求交给 Catalog adapter 或 Generation Runtime |
| `src/host/generation/` | Run Repository、Source adapter、运行时 Workflow 参数化、官方前端 API Workflow 导出与缓存、Comfy transport、coordinator、Generation Tool、Generation Remote、媒体路由和 Session Media Viewer 页面生成器 |
| `src/host/tools/` | 项目 Tool 唯一注册入口 |
| `src/generation/` | Host 与 Client 共用的 Generation Remote 和媒体 URL 合同 |
| `src/client/` | 使用 Harness 原生扩展位的工作台、上下文选择器与 Generation Run/Media 投影 |
| `.agents/skills/comfyui-generate/` | 当前 Workspace 是本仓库时可被 Harness 发现的 Workspace Generation Tool Skill |
| `config/` | 生产配置、schema、环境变量映射和数据源合同 |
| `profiles/` | Harness bundle composition 模板 |

Client 在已保存 Session 中通过 Harness 原生 `details` 扩展位显示真实 Generation Run/Media 投影。Harness `0.1.1-rc.2` 不为尚未保存的空白 Session 分配 `details` 列宽；Client 仅在该状态通过公开 `shell.overlay` 扩展位显示空结果列。Session 保存后，`shell.overlay` 结果列退出，原生 `details` 结果列接管，页面只保留一个可见结果列。

“插入上下文”资源卡片把封面预览按钮与记录选择按钮作为同级交互。封面预览按钮在同一个 Catalog `Modal` 中切换到图片画廊；关闭画廊后恢复 Catalog 查询、分页和待确认选择。画廊 header 不参与 flex 收缩，画廊 body 只占用 Modal 中 header 之外的剩余高度；图片按固有尺寸显示，超出查看区域时由该区域提供水平和垂直滚动条。`CatalogItem.coverUrl` 与 `CatalogItem.sampleImageUrls` 只属于 Client 展示投影，不进入 `CatalogContext` 或 composer 草稿。

## 进程与状态

`prod:start`、`prod:restart`、`worktree:start` 和 `worktree:restart` 先更新浏览器 Client 模块，再校验并物化同一个 `ComfyUI工作台预设`，最后以前台子进程运行 DSH。production 与 worktree 写入各自隔离的 DSH home；启动器不会改变 Harness 默认 Preset。进程管理器记录 PID、进程启动时间和命令，并验证端口由该 PID 持有。stop 只停止匹配该入口 runtime ID 和进程身份的进程。health 检查源码版本、Harness Web、Client ModuleLoader 注册、Run Repository、Official API Workflow Cache 和 Saved Media。

`prod:test` 使用 Vitest 和临时运行目录自动调用同一套进程管理模块，覆盖六个生命周期操作、PID 身份和端口异常分支。

生产运行状态写入 `.local/production/`；独立 worktree 开发状态写入当前 worktree 的 `.local/worktree-development/`。源码仍保留在仓库根目录。配置变更在下一次对应入口的 start 或 restart 时生效。

## Generation 生命周期

`ComfyUI工作台预设` 使用 Harness 用户自行安装在 `$HOME/.agents/skills/comfyui-generate/` 的全局 Skill，并通过受管项目 CLI 使用 Generation Runtime。本项目不复制或发布该全局 Skill；该全局 Skill 与仓库 `.agents/skills/comfyui-generate/` 中的 Workspace Skill 是两个独立的安装来源。CLI 身份链路如下：

```text
前台 bash/pwsh ToolExecution
  → CliShellCapabilityStore 取得 Session、Turn、Call ID 与 cwd
  → shell environment 提供 CLI executable、loopback URL 与短期 capability
  → scripts/cli/harness-comfyui.mjs 提交业务参数
  → src/host/cli/route.ts 通过 cwd 解析 Workspace 并校验 Session 归属
  → GenerationRuntime.acceptGeneration(identity, request)
```

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
