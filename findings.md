# Harness ComfyUI 原型方案调研结果

## Phase 28：单轮多次异步生成与逐媒体 Workflow 验证

- 修改前的 `comfyui-generate` Skill 把当前消息限定为一个 Generation Request，并要求只调用一次 `generate_with_comfyui`；该合同无法表达用户在同一轮中明确要求的多个独立图片结果。
- 修改后的 Skill 先识别并校验当前消息中的全部 Generation Request，再按用户声明顺序为每项请求调用一次 `generate_with_comfyui`；任一请求校验失败时，第一次 Tool Call 之前停止。
- 真实 Harness Session `session-e5821714-a06f-4e61-9b3c-b1f444e78e38` 的第 1 轮只包含一项 `comfyui-generate` Skill Invocation，并产生两项独立 Generation Tool Call。
- 竖幅请求对应 `call_id=chatcmpl-tool-b851b018c3c3072d` 和 `run_id=run_f079b3d2-c5c7-4218-9c6d-b2debc0373b6`；横幅请求对应 `call_id=chatcmpl-tool-8b14e8fcbfd0de6f` 和 `run_id=run_ee43d68a-1727-45cb-983c-3012d3ef5b64`。两个 Run 的数据库 `turn` 都是 1，终态都是 `succeeded`。
- 竖幅 Run 的请求参数为正向提示词 `1girl, solo, white hair, blue eyes, winter coat, falling snow, close portrait`、宽 384、高 512、Seed 28201；横幅 Run 的请求参数为正向提示词 `1girl, solo, red hair, green dress, flower meadow, full body, wide landscape`、宽 512、高 384、Seed 28202。
- 竖幅 Run 保存媒体 `media_7e62ae91-56d9-4634-831b-313d8cfde7f2`，分片路径为 `7e/62/media_7e62ae91-56d9-4634-831b-313d8cfde7f2.png`，实际尺寸为 384×512，文件大小为 276,762 字节。
- 横幅 Run 保存媒体 `media_220aca41-1c8f-4d88-922c-4d95e072818d`，分片路径为 `22/0a/media_220aca41-1c8f-4d88-922c-4d95e072818d.png`，实际尺寸为 512×384，文件大小为 351,950 字节。
- 两张图片的 SHA-256 分别为 `0edb9ccc1eec69e9b0a12aa07437e12e5088a2f2a5271d05fcdc27305ffde6a3` 和 `312922f0f704379efe7fad3fe4caef1e63462d58a411d3607f0886cf4ba4710b`；人工视觉检查确认一张为雪景白发近景，一张为花田红发全身图，画面内容不同。
- 逐媒体 Workflow 下载接口返回各自 Run 的 Actual Workflow。竖幅媒体响应包含提示词、384×512 和 Seed 28201；横幅媒体响应包含提示词、512×384 和 Seed 28202；两个规范化 JSON 的 SHA-256 分别为 `6b5aa4ed840f1bab72dde0bbb32b7a9857fcce0579008e9cbf6ccd702c160c99` 和 `67c998dece5537c44032c19ba39a634da87992a608f948c00e172d46ee729528`。
- 右栏“本会话媒体”显示两张独立媒体卡片；每张卡片分别显示所属 `run_id`、原文件新窗口入口和“下载该媒体所属 Workflow”按钮。

## Phase 27：多模板真实实例覆盖验证

- Catalog CLI 当前返回 36 个可用 Workflow 模板，ID 为 1–4、6–30、32–38；已登记实例为 ID 1 `mac mini` 和 ID 2 `win3080`。
- 模板集合包含 `text_to_image`、`text_to_image_lora`、`text_to_image_second_pass`、`text_to_image_hires_fix`、`controlnet` 和 `image_to_image` 六类流程。
- 运行参数覆盖 `string`、`integer`、`number`、`asset_reference` 和 `image_reference`。模板 2、21、20、19、30、36 的 `reference_image` 为必填 `image_reference`。
- 节点结构至少覆盖基础 KSampler、LoRA、LatentUpscale、ESRGAN、ControlNet、Krea2 Identity Edit、GGUF Loader、UltimateSDUpscale、Impact Detailer、rgthree 节点和 Anima 自定义采样节点；只重复跑基础文生图无法覆盖这些编译路径。
- 36 个 Catalog 记录都把 `expected_output_node_ids_json` 设为 `null`；Host 必须通过每个目标实例的真实 `/object_info` 发现活动输出节点。
- 多模板验证分为两层：全部 36 个模板分别针对两个已登记实例执行真实 `/object_info` 编译；随后选择结构互不重复的模板执行真实 Harness Skill/Tool `/prompt` 端到端运行。
- 72 个真实编译组合中，`mac mini` 编译 27 个、缺节点 9 个；`win3080` 编译 29 个、缺节点 7 个。每个失败都返回具体缺失节点名称，不是通用 Source 错误。
- `mac mini` 缺少模板 35 的 `WildcardPromptFromString`，并缺少模板 6–11、15–16 使用的 `SimpleMathDual+`。`win3080` 缺少模板 19–21、36 使用的 `TextInput_`，模板 35 的 `ResolutionMaster`，模板 34 的 `XB_UNetNameBroadcaster`，模板 33 的 `ClownsharKSampler_Beta`。
- 36 个模板都至少能在一个已登记实例上完成真实 `/object_info` 编译；不存在两个实例都无法编译的模板。
- 代表性端到端候选应优先覆盖模板 38（Anima 基础文生图）、28（WAI 二阶段 LatentUpscale）、34（Anima 自定义节点）、27（Krea2 UNET）和 3（Anima ESRGAN）。这些路径与已经成功的模板 37 LoRA 基础路线结构不同。
- 模板 37 失败 Run 的 `request.json` 没有 `lora_model` 参数，证明 Generation Tool 没有生成或多次转义该路径；Host 使用了模板默认值。
- 失败 Run 的 Actual Workflow 中 LoRA 路径只有一个 Unicode `U+005C` 反斜杠。错误详情 JSON 中显示的 `\\` 是一个反斜杠的 JSON 转义表示。
- 当前 `mac mini` 的 `/object_info/LoraLoader` 只接受 `wai/USNR_STYLE_ILL_V1_lokr3-000024.safetensors`，当前 `win3080` 只接受 `wai\USNR_STYLE_ILL_V1_lokr3-000024.safetensors`。同一模板默认值无法同时精确匹配两个实例。
- 修复层应位于 Generation Tool 的 Workflow 编译边界：当实例 COMBO 枚举与 Workflow 字符串只有路径分隔符不同且存在唯一匹配时，API Workflow 使用实例返回的精确枚举值；零个或多个匹配时保留原值并让实例 `/prompt` 返回具体错误。
- Workflow 编译器现在使用目标实例 COMBO 枚举完成路径分隔符的唯一匹配转换；该转换同时支持模板反斜杠到实例正斜杠、模板正斜杠到实例反斜杠。
- 修复后的真实模板 37 在 `mac mini` 编译为 `wai/USNR_STYLE_ILL_V1_lokr3-000024.safetensors`，在 `win3080` 编译为 `wai\USNR_STYLE_ILL_V1_lokr3-000024.safetensors`；结果与两台实例当前 `/object_info/LoraLoader` 精确一致。
- Harness 真实会话中的模板 37 默认参数运行 `run_3f64c8e1-569b-41c8-87db-f80087c33e6e` 在 `mac mini` 成功；Actual API Workflow 使用正斜杠 LoRA 路径，媒体保存为 `media_9bf0ca3c-6beb-49a0-a395-0703ce50621d`。
- Harness 真实会话中的模板 37 运行 `run_a66891dc-a470-4c8f-8dee-932668c92a95` 显式路由到 `win3080` 并成功；Actual API Workflow 使用反斜杠 LoRA 路径，媒体保存为 `media_97583c51-d700-4ca4-b659-e1afcf1f2714`。
- 模板 38 `anima-aesthetic-v1-1-txt2img` 的真实运行 `run_a7a56265-d079-4264-8113-74aa21c2d5ff` 成功，媒体保存为 `media_04cb4d51-aa35-44a2-806d-703be2c2cdae`。
- 模板 28 `wai_2pass_upscale` 暴露两个 `seed` 参数；Harness 原生提问交互把 2728 分别写入 `seed` 与 `seed_7`。真实运行 `run_fb85ca3c-a040-4c05-ad1c-9ed48f7f2c5f` 完成二阶段 LatentUpscale，媒体保存为 `media_f99bc597-fb8d-4e0c-b2e2-5cb5e4bed616`，文件大小为 2,358,238 字节。
- 上述四个成功媒体分别写入 `9b/f0`、`04/cb`、`f9/9b` 和 `97/58` 分片目录；右栏按 Session 展示四张图片，并为每张图片显示独立的 Actual Workflow 下载图标。
- 模板 34 `Anima Aesthetic 1.1｜文生图` 的真实运行 `run_c8e182e5-60d2-4e2d-9c94-74d56ced0c19` 到达 `mac mini` 的 `/prompt` 后失败。实例明确返回 `qwen_image_HDR_vae_fp32_comfy.safetensors` 不在该实例 VAE 枚举中，并返回节点 20 的连线 `KeyError`；Run Repository 保存的 `errorMessage` 长度为 2298，右栏原生错误详情 Modal 显示完整正文。
- 同一 Harness Session 最终包含 5 个独立 Run：4 个成功 Run 各自拥有媒体和 Actual Workflow，1 个失败 Run 保留自己的实例错误；实现没有把同一会话的多次 Tool 调用合并为一个异步任务。

## Phase 26：模板最小上下文、Workflow 解析和运行错误详情

- 当前 `comfyui-generate` Skill 依赖模板上下文中的 `data.parameters` 构造 Generation Tool 参数；该依赖导致消息草稿保存完整参数定义，而不是只保存模板 ID 和标题。
- `SourceGenerationPreparer.prepare()` 已经使用 `request.templateId` 通过 Host Source CLI 获取完整 TemplateBundle；Generation Tool 不需要且不接受完整 Workflow JSON。
- 模板 37 的 UI Workflow 节点数组下标 6 对应节点 ID 7、类型 `VAEDecode`。该节点全部输入来自连线，因此没有 `widgets_values` 是合法结构。
- `GenerationSourceCli.parseWorkflow()` 当前要求每个节点都存在数组类型的 `widgets_values`；该前置条件产生 `SOURCE_PROTOCOL_ERROR / Template Workflow node 6 is invalid.`，并在调用目标实例 `/object_info` 和 `/prompt` 前终止运行。
- `GenerationRemoteService.list()` 当前只返回 `errorCode`，没有返回 Run Repository 已保存的 `errorMessage`；右侧卡片只能显示错误目录中的通用文案。
- 当前运行卡片本身使用 Harness 原生 `Button`；增加“错误详情”按钮前必须把卡片外层改为非按钮容器，避免嵌套交互控件。
- 现有成功生命周期测试使用 mock transport 或 mock fetch；当前仓库还没有真实 ComfyUI 实例端到端生成测试结果。
- Catalog CLI adapter 当前只有 `search()` 和 `baseModels()`；Host 只注册了 `generate_with_comfyui`，因此 Skill 目前没有按模板 ID 查询参数定义的 Agent Tool。
- 当前 Catalog CLI 的 `resolve --id 37` 响应包含完整 `workflow_json`，但 Harness 可以在 Host adapter 中只投影模板 ID、标题和参数定义，避免把完整 Workflow 进入 Agent Tool 输出。
- `ComfyWorkflowCompiler.compile()` 会先请求真实实例的 `/object_info`，再根据实例节点定义把 UI Workflow 编译为 API Workflow；Host 必须保留这项转换，但不应把每个 UI 节点都具有 `widgets_values` 当成模板合法性的前置条件。
- `ComfyHttpTransport.requestPrompt()` 当前收到 ComfyUI 4xx 的 `error` 和 `node_errors` 后只保存固定文本 `ComfyUI rejected the API Workflow.`；`observe()` 当前收到 Jobs API 的 `execution_error` 后只保存固定文本 `ComfyUI remote execution failed.`。这两处会在进入 Run Repository 前丢失实例返回的具体错误，必须改为保存实例错误 JSON。
- 修复后的 Workflow 模板上下文经真实 Harness 输入框验证为 `{"type":"comfyui-context","data":{"kind":"comfyui-template","id":"37","title":"wai_txt2img_lora"}}`；消息不再包含参数定义或 Workflow JSON。
- `query_semantic_comfyui_templates` 在真实 Harness 轨迹中按 ID 37 返回模板标题和八个参数定义；Tool 输出没有 Workflow JSON。Generation Host 随后仍按 `template_id` 从 Host Source CLI 获取完整模板。
- `ComfyWorkflowCompiler` 现在只负责根据真实 `/object_info` 把 UI Workflow 转换为 API Workflow，不再根据 `/object_info` 的 required 列表提前拒绝缺少实例必填输入的 API Workflow；具体校验结果由实例 `/prompt` 返回。
- 真实实例首次运行 `run_782452dd-bc13-463f-bc1d-88525229b4f3` 到达 `mac mini` 的 `/prompt`，实例返回 LoRA 路径不在该实例列表中的 `node_errors`。右栏显示 `COMFYUI_PROMPT_REJECTED`，原生错误详情 Modal 显示完整 `error` 和 `node_errors` JSON。
- 第二次真实运行 `run_df5e56e4-57b1-4011-b03f-c366ae957727` 显式传入该实例实际存在的 `wai/USNR_STYLE_ILL_V1_lokr3-000024.safetensors`，状态从已创建、生成中、保存中收敛为成功。
- 成功运行保存一张 1024×1344 PNG；SQLite 媒体记录为 `media_56f1e563-c79b-415b-9ce1-d32fe5feb9f7`，相对路径为 `56/f1/media_56f1e563-c79b-415b-9ce1-d32fe5feb9f7.png`，文件大小为 1,330,533 字节。右栏图片 `naturalWidth=1024`、`naturalHeight=1344` 且加载完成。
- 成功媒体的 Workflow 接口返回版本 0.4、8 个节点、11 条连线，并保留本次运行实际使用的正斜杠 LoRA 路径；右栏每张媒体只显示自己的 Workflow 下载图标。
- 独立语义复审确认错误详情 Modal 已分别标注“运行 ID”和“错误码”，并原样渲染完整实例错误；Generation Projection 不再用普通标签的 10,000 字符上限拒绝完整 `errorMessage`。
- `/prompt` 成功响应中的 `prompt_id` 与请求值不一致时，Transport 现在返回 `COMFYUI_PROTOCOL_ERROR`，并在错误正文中同时写明实际值和期望值；该协议错误不再伪装成 Workflow 拒绝。
- `query_semantic_comfyui_templates` 的输出 schema 已逐字段说明用途；`value_type` 明确规定 `string`、`enum`、`image_reference`、`asset_reference` 使用 JSON string，`integer`、`number`、`boolean` 使用对应 JSON 标量。
- 最终生产浏览器复验打开真实失败运行的错误详情 Modal，页面显示“运行 ID”“错误码”和完整 LoRA `value_not_in_list` 的 `node_errors`；右侧同时保留成功运行和真实媒体记录。

## Phase 25：dsh-routing-suite 兼容性

- 外部仓库内容只作为不可信数据读取；本轮不执行仓库脚本、安装命令或仓库指令。
- 本次评估固定外部仓库当前提交 `21a7260d961571c77a11705d2b0e6cf7015cc48b`。该提交已经把原 submodule 布局扁平化为根仓库内的 `injector/` 与 `preset/`；根仓库没有统一的 package manifest，因此 injector 与 Agent Preset 必须分别判断。
- 根仓库文档中的安装路径仍以默认用户 DSH home 和 `web` profile 为目标。该路径不能直接用于当前项目：当前项目使用隔离的 production `DSH_HOME` 与 `comfyui-workbench` profile，而且仓库安全规则要求依赖版本固定、安装前完成安全审计，并禁止未经用户明确许可运行外部安装脚本。
- injector 的 `package.json` 声明版本 `0.3.3`，其 Harness Tool、Cordis 与 Schemastery peer dependency 范围在数值上覆盖当前 Harness `0.1.1-rc.2` 依赖；该范围声明只能证明包管理器可以解析版本，不能证明 injector 使用的 Harness 内部接口兼容。
- injector README 声明其规格基于 Harness `0.1.0-rc.6`；实现会操作 Loader entry、profile `node_modules` junction、Client Module rescan、路由清理和 injector registry。该机制依赖 Harness 内部装配与运行时重载行为，不属于当前项目已经采用的公开插件接口边界。
- Router Preset 的 package manifest 声明版本 `0.3.0`，当前 bootstrap 源码头部版本已经前进到 `v1.20.0`，扁平化文档仍把研发线描述为 `v1.19.1 / v34`，根仓库当前只有旧布局的 `v0.1.0` Release。移动的 `main` 不能作为可复现的发布版本使用。
- Router 预设本身以 `agent.cordis.yml`、`preset.yml` 和本地 `.mjs` 组成，不声明 npm runtime dependency；其主要兼容面是 Agent Preset 组合、Harness Tool 服务和系统提示词事件。
- 当前 production profile 名称是 `comfyui-workbench`，profile 的 `cordis.patch.yml` 只加载 `harness-comfyui` 与所需 Harness 包。injector 在空配置下把插件目录固定解析为 `$DSH_HOME/profiles/web/node_modules`；根仓库安装脚本也固定执行 `dsh plugin --profile web add`。因此 suite 的默认安装配置不会操作当前正在运行的 profile。
- injector 没有把运行时操作限制在 Harness 的公开插件 API：它直接读取 `ctx.loader.internal.loadCache`，调用 `ctx.loader.create()` 与 `ctx.loader.import()`，删除 `ctx.webServer.exact`、`prefixes`、`upgrades` 内部路由表项，并可重写目标 profile 的 `cordis.patch.yml`。这些行为会让 Harness 升级兼容、路由所有权和插件卸载顺序无法由公开合同保证。
- Harness `0.1.1-rc.2` 已安装包确实提供 Router 使用的 `tools.presentAs()`、`tools.restrict()`、`tools.view()`、`agent/inbox/claimed`、`agent/pre-step` 与 `system-prompt/assemble`。这些 API 只能证明 Router 脚本可以通过类型与运行时成员检查，不能证明 Router 的 Tool 策略满足当前产品流程。
- `router-standard` 的前三个阶段通过 `tools.restrict()` 只开放阶段白名单和元工具；这些白名单与全局安全列表都不含当前项目的 `generate_with_comfyui`。Router 在阶段 3 释放 restriction 后会开放完整 Tool 目录，因此“前三阶段不可见”本身不构成兼容性故障：按用户确认的产品流程，Agent 可以在前几阶段完成理解、提示词设计和参数准备，再在最终阶段调用 Generation Tool。
- Router Standard 对 Generation Tool 仍有一项需要实测的时序约束：用户在阶段 0 至阶段 2 直接调用 `/comfyui-generate` 时，Skill 合同要求当前轮调用一次 `generate_with_comfyui`，但该 Tool 当时不可见。阶段 2 的自动晋级只识别 `delivery_check`，Agent 也可以显式调用 `phase_advance` 进入阶段 3；兼容性验收应验证 Agent 会在需要出图前可靠进入阶段 3。
- injector Client 只注册 `settings.section` 的 `super-injector-plugins`，当前 Client 注册 `sidebar.footer.action`、`conversation.input.dock`、`details` 与 `shell.overlay`；双方没有直接 slot ID 冲突。当前 Host 的 Typert Remote 名称、`generate_with_comfyui` Tool 名称和 `/api/harness-comfyui/media` 路由也没有在 suite 精确 revision 中发现同名定义。
- 综合结论为整套 suite 当前不能直接接入 production；该结论只来自 injector 默认使用错误的 `profiles/web`、injector 依赖 Harness 内部 API，以及 injector 直接改写本项目启动器拥有的 Profile。安装脚本的平台差异、Router 版本状态和 Generation Tool 在阶段 0 至阶段 2 不可见都不是该 NO-GO 判定的依据。若继续试验，可以先只复制 Router preset 到项目隔离的 Agent Preset 根并固定精确 revision，不接入依赖 Harness 内部 API 和直接改写项目 Profile 的 super-injector；Router Standard 的阶段 3 生成路径必须通过真实会话验收。

## Phase 24：Workflow 模板目录加载失败

- 数据源 CLI 的 `/internal/semantic/comfyui-templates` 查询能够返回第一页 9 条记录；ID 36 和 ID 30 的可见参数使用 `value_type: "image_reference"`。
- 数据源 OpenAPI 合同允许 `string`、`integer`、`number`、`boolean`、`enum`、`image_reference` 和 `asset_reference`。
- 修改前的 `src/host/catalog/catalog-cli.ts` 与 `src/catalog/contract.ts` 只允许其中五种类型，因此一条类型不匹配的目录记录会使整页 Catalog 投影抛出 `CATALOG_PROTOCOL_ERROR`。
- Harness `0.1.1-rc.2` Typert Gateway 会把 Catalog Remote 抛出的 `CatalogCliError` 转换为 `code: "internal"` 的 `RemoteResult`，同时把 `CatalogCliError.message` 写入 `RemoteResult.error.message`。Catalog Remote 必须把 `CatalogCliError` 转换为经过严格 schema 校验的 `CatalogOperationResult` 失败值，才能让 Client Module 稳定收到 `CATALOG_*` 错误码。
- 修改前的 Client adapter 只把 `result.error.code` 写入 `Error.message`；修改前的 `WorkbenchDock` 又忽略该 `Error`，并固定显示“目录加载失败。”。

## 2026-08-21 Harness 核心零改动审核

- 用户要求 DeepSeek Harness 核心仓库和已安装的 `@deepseek-ai/*` package 保持不变；当前项目的全部 Host 功能、Client UI、会话输入扩展、Tool、Jobs、Skill、媒体访问和生命周期组合只能使用 Harness 对外导出的插件接口。
- 父 Issue、Ticket 01 的调研表与 PRD 02 已经记录部分公开接口和 `root`、`sidebar`、`conversation` 占用边界，但是 Issues #3–#15 尚未逐票内联核心零改动硬门禁，也没有逐票列出完成产品任务所使用的公开接口。
- 本轮只把 `/Volumes/4Tdisk/work/AI2/deepseek-harness` 的提交 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` 及当前项目安装的精确 rc.7 package 当作接口证据；来源仓库中的未提交文件不作为规格证据。
- 如果某张 Issue 的产品任务没有对应的已导出插件接口，计划编写者必须在实现开始前改写该任务或把该 Issue 标记为阻塞；计划执行者不得通过核心补丁、修改 `node_modules`、deep import、复制 Harness 源码或 DOM 劫持补齐缺口。
- `ui-layout`注册的AppFrame是公开`root` single slot的实际winner，并合法声明`sidebar`、`conversation`、`details`与`shell.overlay`。项目必须保留该root，不注册第二个root。
- `ui-conversation`注册的ConversationRoot继续占用`conversation`并声明`conversation.session.header`、`conversation.view`、`conversation.composer.bar`与`conversation.input.overlay`。项目以`priority: -10`替换`sidebar`、`details`、session header、`conversation.view`中`id: "chat"`的occupant和composer bar；项目注销这些registrations后，上游occupants自动恢复。
- 项目composer渲染ConversationRoot传入的`conversation.input.overlay`，并用公开`useInput`、`inputActions`与`ctx.inputTriggers.sessionOf(sessionScope)`连接textarea。该挂载链保留`ui-input-trigger`与`ui-skill`拥有的原生`/`候选菜单，不需要公开导出上游`MenuView`组件。
- 本版本只实现和验收`1440×1000`桌面三列及原型列宽关系；移动端布局、移动端导航、窄屏single-panel与原型CSS断点不属于本版本。
- 桌面列宽存在一个需要用户决定的可见差异：原型`grid-template-columns: minmax(236px, 0.68fr) minmax(500px, 1.65fr) minmax(340px, 1fr)`在`1440px`下约为`294 / 714 / 432`；rc.7 AppFrame首次打开右列后的默认宽度是`280 / 800 / 360`。
- rc.7公开`ILayout`只提供`toggleSidebar()`、`openDetails()`和`closeDetails()`，没有设置sidebar/details像素宽度的方法。AppFrame的内部`setSidebar`与`setDetails` actions没有通过public plugin face暴露；项目不能在不操作Harness DOM的情况下把初始列宽改成原型数值。
- 用项目root替换AppFrame可以实现原型列宽，但现有ConversationRoot是`conversation.input.overlay`的唯一declarer；非winner entry的声明仍然存在，项目root既不能重新声明该slot，也没有render授权。项目root因此不能呈现`ui-input-trigger`已经注册的原生MenuView。当前约束下不能同时满足“原型精确初始列宽”和“项目不实现第二套Skill菜单”。
- 原型只规定composer可见结构与发送行为，没有规定项目必须拥有或修改Harness InputHub状态。实施规格选择项目按Session保存发送前的正文、ContextRef、File和preview URL；这些是临时UI状态，Harness接受消息后原生Session日志成为唯一持久权威。
- 项目发送协调器解析每个ContextRef并构造固定`generation-context.v1` block，把图片编码为公开`PromptContentPart`，然后只调用一次公开`SessionFace.prompt()`。失败保留本次草稿与对象，成功只清理本次发送快照并revoke对应object URL；该路径不修改AgentLoop，也不创建第二个消息后端。
- `@deepseek-ai/dsh-client-ui-primitives` 根 package export 公开 `Modal`；该组件使用 portal、`role=dialog`、`aria-modal=true`、Escape 和遮罩关闭。项目的上下文选择器、全局媒体库、异步任务列表和取消确认可以直接组合该公开 React primitive。
- Harness Typert 为 Loader plugin 提供公开生成与发现链路：插件 package 可以导出 `./typert`，`@deepseek-ai/dsh-typert-loader` 会读取并注册 `TYPERT` contribution；Typert registry 也公开 `ctx.typert.register()`。Host 业务 Service 使用 Typert Remote 描述，Client 通过 generated `/remote` contribution 与 `ctx.remote.$mount()` 调用。
- 当前项目的 Catalog 查询、Run Repository 查询、任务取消、媒体列表和 Workflow 下载元数据可以定义在项目自己的 Host Service 中，并由项目自己的 Typert 生成产物向 Client 暴露；该链路不要求向 Harness `api/remotes` package 写入项目代码。
- 项目 Client plugin 可以从自身 package 的 generated `/remote` export 导入 `TypertRemoteContribution`，再调用公开的 `ctx.remote.$mount()`；因此项目不需要修改 Harness `@deepseek-ai/dsh-api-remotes` 的固定 namespace 列表。
- rc.7 的 Host→Client forwarded event 只允许 `@deepseek-ai/dsh-api-remotes/src/remote-events.ts` 中固定的 11 个 Harness 事件。`generation.run.changed` 不在该 allowlist；增加该事件必须修改 Harness application assembly，因此现有“Host 发送非持久 Run Change Notification”设计违反核心零改动要求。
- Run状态刷新必须由项目Client plugin通过项目Typert Remote查询Run Repository。页面可见且中列Generation Tool行或右列运行卡存在可见非终态Run时，唯一`GenerationRunProjectionStore`按`refreshAfterMs`继续查询；中列和右列同时可见时每周期只查询一次；关闭右列但中列Tool行仍可见时继续查询；页面隐藏、两处都没有可见消费者或全部终态时停止。该轮询使用公开unary Remote，不修改Harness forwarded event allowlist。
- `@deepseek-ai/dsh-tools` 根 export 公开 `defineTool()`、`ToolRuntime`、`ctx.tools.register()`、输出 schema、`presentCall()` 与 `presentResult()`。项目可以把 `generate_with_comfyui` 注册为原生 Harness Tool，并让 Tool Result 持久记录 `run_id`；该实现不需要修改 AgentLoop、Session 日志格式或原生 Tool UI。
- Tool 的`output.presentationMeta()`、`presentCall()`和`presentResult()`是回放安全的公开呈现接口。`ui-conversation`把Tool事件投影到公开`ConversationSnapshot`；项目Workbench依据该projection呈现Generation Tool行，项目右列只从Run Repository投影生成运行与媒体，不复制Tool execution identity。
- `@deepseek-ai/dsh-jobs` 根 export 公开 `ctx.jobs.start/list/get/read/kill/wait`、`onJobDone()`、`onJobsChanged()` 和 `attachController()`；plugin 可以通过 declaration merge 增加自己的 `JobKindMap` 条目。该服务只保存当前进程状态，不能承担 Generation Run 的跨重启权威状态。
- 项目可以把当前 Agent 等待某个持久 `run_id` 的过程登记为 Harness Job，并把取消等待映射到 `ctx.jobs.kill()`；ComfyUI Job 取消仍必须调用项目 Run Repository/Transport 的公开业务接口，不能把进程内 Job ID 当作持久 `run_id`。
- `@deepseek-ai/dsh-skill`根export公开`ctx.skills.register()`与`registerProvider()`；`@deepseek-ai/dsh-skill-filesystem`已公开并实现`<projectRoot>/.dsh/skills`、`<projectRoot>/.agents/skills`、`customSkillDirs`和bundled skill root扫描。Prompt Skill可以作为Release Artifact内项目Skill交付并由现有provider加载；Harness随附`ui-input-trigger`与`ui-skill`负责输入`/`后的候选和文本插入，Host继续负责调用校验。
- `@deepseek-ai/dsh-host-webserver` 根 export 公开 `ctx.webServer.register({ kind: 'exact' | 'prefix', path, handler })`，并保证 named route 在 SPA fallback 之前匹配。项目 Host plugin 可以注册自己的同源媒体与 Workflow 下载前缀，不需要修改 `frontend-static` 或 `/api` route。
- 项目媒体路由必须只接受项目生成的 `media_id`/`run_id`，通过 Run Repository 解析服务器内路径，拒绝 URL 路径穿越并返回持久文件的真实 `Content-Type`；浏览器响应不得包含本机路径、ComfyUI URL 或 Authorization。项目 Workflow 路由必须只返回该运行保存的 Actual Workflow JSON，不返回 API Workflow JSON。
- `@deepseek-ai/dsh-client-modules` 会扫描 Loader entries 的 `package.json` `dsh.client` 声明，并从 `exports["./client"]` 加载构建后的 Client plugin bundle。项目 package 只要作为 profile dependency 与 Loader entry 安装，并提供公开 `./client` export，就能进入真实 Harness Web composition；不需要改 Harness Web shell。
- `@deepseek-ai/dsh-client-ui-slots`根export明确规定single slot或相同list id的不同`priority`可以shadow，最低值渲染。项目分别替换产品需要的公开occupant，不替换AppFrame root或ConversationRoot。
- `ui-conversation`继续注册标准event definitions与snapshot builder；项目`conversation.view`的`chat` occupant从公开`ConversationSnapshot`呈现消息、Agent partial和Tool call/result，项目`details` occupant从Run Repository呈现运行与媒体。
- `ToolRunContext` 公开 `callId`、`name`、`arguments`、`signal` 和当前 `agent`；`agent.id` 与 `agent.session.id` 是同一个 Session ID。AgentLoop 会在调用 Tool body 前把 `tool/call` 写入 `agent.session.events`，该公开事件包含 `turn`、`step`、`callId`、Tool 名和 arguments。
- `generate_with_comfyui` Tool body 可以用 `exec.callId` 在 `exec.agent.session.events` 中读取唯一的原生 `tool/call`，取得 Harness 数字 `turn`；实现不需要修改 Tool pipeline，也不能要求模型传入 `session_id`、`turn` 或 `call_id`。
- rc.7的`user/message`事件本身没有数字`turn`。Generation Tool Host adapter必须以`exec.callId`对应`tool/call`的数字turn与`seq`为终点，以同turn最近唯一`turn/start.seq`为起点，只在该事件区间内核对`comfyui-generate`的`skill-invocation` source；扫描整个Session会错误继承上一turn授权。
- rc.7公开`ToolResultNode.call`在配对Tool Call尚未进入当前history window时可以是`null`。实时/完整窗口用`call.name`与Tool Result meta校验；截断窗口使用公开`callId`、当前Session和meta `run_id`调用项目`GenerationRuns.resolveToolResultLink()`，由Run Repository持久`(workspace_id, session_id, call_id) -> run_id`映射完成重放校验。

## Requirements
- DeepSeek Harness 必须作为 Agent 宿主。
- HTML 前端必须包含会话列表、单会话流式聊天区和生成结果卡片区。
- 用户每次发送消息前必须能够插入结构化上下文；上下文类型来自数据源仓库并能够持续扩展。
- 用户必须能够在项目中列挂载的Harness原生composer输入`/`并使用Harness原生Skill菜单；Host必须在执行前重新发现并校验Skill。本项目不得实现第二套Skill菜单、选择状态、provider或invocation policy。
- 当前系统的会话 Skill、管理 Skill和后续 Skill 必须迁移到当前项目，并通过数据查询 CLI 读取数据源。
- 底层模块必须读取已有 ComfyUI 实例和工作流模板、创建本次实际 Workflow JSON 与可执行 API Workflow JSON、异步提交任务、查询任务状态、保存图片/视频/音频，并查询本地媒体和两个 Workflow JSON。
- ComfyUI Skill 必须能够修改工作流模板的宽度、高度、提示词、像素、CFG 等运行时参数并提交任务。
- 生成结果卡片必须展示 ComfyUI Skill 的媒体结果、标题和可下载的生成 JSON。

## Research Findings
- `/Volumes/4Tdisk/work/AI2/harness-comfyui` 当前为空目录且不是 Git 仓库。
- `/Volumes/4Tdisk/work/AI2/deepseek-harness` 当前存在用户未提交修改；本轮只读检查必须保留这些修改。
- `/Volumes/4Tdisk/work/AI2/deepseek-harness` 永久作为只读调研来源。正式实现使用的 DeepSeek Harness 宿主、Host 插件和项目级 Skill 必须安装在当前仓库 `/Volumes/4Tdisk/work/AI2/harness-comfyui`。
- `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV` 当前是 detached HEAD，且存在用户未提交文件；本轮只读检查必须保留这些文件。
- 既有记忆记录了 DeepSeek Harness 的 AgentLoop、Agent Preset、`conversation.view` 和 Skill 宿主能力，但该记录属于静态调研，不能替代当前仓库检查和运行时验证。
- 既有记忆记录了 NoobAI 的 ComfyUI 运行时参数契约、管理 Skill 会话契约和异步任务接口；当前方案必须重新检查现有文件与数据结构。
- DeepSeek Harness 根目录 `AGENTS.md` 规定所有产品行为通过插件接入，并规定所有进入模型请求的内容必须能够从会话日志重建。
- DeepSeek Harness 根目录 `AGENTS.md` 规定产品可见插件需要真实组合测试；工具的 UI 展示意图必须在工具设计时定义。
- 数据源仓库已经存在 `comfyui-run-runtime.mjs`、`comfyui-runtime-gateway.mjs`、`comfyui-runtime-media.mjs`、模板工作流模块、运行时参数模块、会话模块和 Pi Skill 宿主模块。
- 数据源仓库 `package.json` 已使用精确依赖版本；本轮不新增或安装依赖。
- DeepSeek Harness 提供 `ConversationNodeDefinition` 和 keyed renderer；客户端插件能够把一组具有稳定业务 ID 的持久会话事件聚合为单个聊天节点，并按事件序号重放状态。
- 本项目不使用 `ConversationNodeDefinition` 复制 Generation Run 状态。Harness Session 日志只保存原生 Tool Call/Tool Result 与 `run_id` 关联；Run Repository 保存权威运行状态，Client 通过项目 unary Typert Remote条件轮询。
- DeepSeek Harness 已有浏览器端附件、Skill、任务、交付物、会话、侧栏、布局、工具结果与工作流运行 UI 包；方案应组合这些扩展点，不应另建一套独立聊天协议。
- DeepSeek Harness 的 Agent 输入通过统一 inbox 接收；`agent.inject()` 添加的上下文会等待下一条能够唤醒 Agent 的消息，适合“选择上下文后随本次用户消息发送”的交互。
- 数据源仓库当前可见的仓库级 Skill 只有 `anima-prompt-builder` 和 `wai-sdxl-prompt-builder`；管理 Skill 与会话 Skill 的宿主逻辑主要位于 `app/pi` 和 `app/session`，需要继续定位它们的实际运行目录与契约。
- DeepSeek Harness默认`AppFrame`实现`sidebar`、`conversation`和`details`三列。项目保留该frame，通过公开occupants实现原型桌面内容；本版本不实现或验收移动端与窄屏行为。
- DeepSeek Harness的`details`是AppFrame内部single slot。项目以`priority: -10`注册结果列occupant，并在选中真实Session后调用公开`ctx.layout.openDetails()`使右列可见。
- DeepSeek Harness默认输入状态机支持引用chip，但项目Workbench没有复用其私有附件registry。项目以自己的临时`ContextRef`与File呈现原型输入区，并通过公开`SessionFace.prompt()`一次提交。
- DeepSeek Harness 的 Skill 文件提供器能够读取项目 `.dsh/skills`、项目 `.agents/skills` 和显式 `customSkillDirs`；Skill UI 使用 `/skill-name` 触发器并从当前会话的 Skill 列表 RPC 读取候选。
- 项目Context resolver异步解析`ContextRef`并生成`generation-context.v1`模型文本；任一解析失败会在调用`SessionFace.prompt()`前停止，并保留临时正文、chip与附件。
- 一次`SessionFace.prompt()`能够把正文、上下文block和图片作为同一用户动作提交，不需要修改AgentLoop；项目Workbench的user-message renderer负责把完整block折叠呈现。
- DeepSeek Harness 的 `agent.inject()` 能够保存带插件来源的非唤醒上下文，但单独执行“注入 RPC”后再执行普通 prompt RPC 会留下失败窗口；当前方案不采用两个独立浏览器请求拼接一个用户动作。
- 数据源仓库现有会话服务把 `selection` 转换为 `ui_explicit` 快照后构建 Pi prompt；这套选择快照语义可以迁移为新上下文查询模块的输入，但旧 Pi 会话持久化与三轮限制不应迁入 DeepSeek Harness 会话。
- 源数据代码实施基线 `2a8e0dbc6b21bf28550f29dbfc68f2692fcabd2a` 已发布为 `v0.81.0`。该revision的 `/internal/semantic` discovery 暴露六个只读操作：`querySemanticWorksForSkill`、`querySemanticCharactersForSkill`、`querySemanticStylesForSkill`、`querySemanticPromptTermsForSkill`、`querySemanticGenerationLorasForCli` 和 `querySemanticArtistPromptStringsForCli`。
- 同一实施基线的 `imagegen-semantic-query` CLI 根据 `/internal/semantic` OpenAPI 3.1 文档动态生成参数和调用方式；它没有底模、生成模型、ComfyUI 实例、模板或媒体操作，也不支持新的 Catalog `search`/`resolve` 结构化协议。
- 用户明确要求继续使用并完善数据源仓库的原 CLI。DeepSeek Harness Host 把完善后的 CLI 包装为结构化 Harness Tool，迁移后的 Skill 通过 Harness Tool 查询原仓库数据。
- `schema/api/openapi.yaml` 是 Catalog Operation 与 Source Operation 的 operation、输入 schema、响应 schema、稳定 ID、revision 和错误结构的唯一来源；数据源服务从该文档投影 Agent 安全 discovery 与 Host 私有 source discovery，方案不增加第二个 schema manifest。
- 数据源 SQLite 已包含 `generation_base_models`、`generation_models`、`generation_loras`、`artist_prompt_strings`、`comfyui_instances`、`comfyui_templates`、`comfyui_template_revisions`、`comfyui_template_runtime_configs`、`comfyui_runs` 和 `comfyui_run_outputs`。
- 当前生产版本的 `comfyui_run_outputs.media_type` 只允许 `image/jpeg`、`image/png` 和 `image/webp`。用户要求的视频和音频需要新增结构化媒体种类、MIME 配置、文件校验和页面呈现。
- 当前 ComfyUI 工作流运行参数契约已经定义 `positive_prompt`、`negative_prompt`、`width`、`height`、`resolution_preset`、`aspect_ratio`、`megapixels`、`seed`、LoRA 参数、参考图片和通用工作流输入等绑定种类。
- 当前生产数据包含 3 个底模、13 个文生图模型、86 个 LoRA、3760 个作品、39936 个角色、12413 个画风、2 个 ComfyUI 实例和 35 个 ComfyUI 模板；`artist_prompt_strings` 当前为 0 行，但接口仍需把空集合当作正常结果。
- 当前生产 checkout 没有 `management-skills/`、`config/management-pi/` 或 `schema/management-pi/` 文件。历史记录显示管理 Skill 契约已经在 NoobAI 主仓库后续版本合并，但该事实不等于当前指定数据源目录已经包含可迁移文件。
- DeepSeek Harness 的通用 `ctx.jobs` 已提供 owner 隔离、`job_output`、`job_list`、`job_kill` 和完成通知；`jobs-local` 状态只存在于 Harness 进程内，不足以承担 ComfyUI 运行的跨重启持久化。
- 用户明确要求数据源仓库只提供已有 ComfyUI 实例、Workflow 模板、模板 revision、运行时配置和其他目录数据。当前仓库必须拥有异步运行、队列观察、API Workflow JSON、媒体保存和重启恢复；任务运行过程不得向数据源仓库写入持久数据。
- Harness `ctx.jobs` 只承担当前 Agent 存活期间的等待、通知和取消入口；当前仓库的运行数据库和媒体目录承担稳定 `run_id` 的持久事实来源。
- ComfyUI `/prompt` 没有本轮已验证的业务幂等键。当前仓库必须在远端提交前持久创建 `run_id` 和 API Workflow JSON；恢复流程遇到 `submitting` 时必须返回 `submission_unknown`，不能自动重提。
- 2026-08-20 从数据源 `data/app.sqlite` 只读取得两个已启用且已验证实例：`mac mini` 为 `http://192.168.110.16:8188/`，`win3080` 为 `http://192.168.110.122:8188/`。`GET /system_stats` 实测版本分别为 ComfyUI `0.28.3` 和 `0.33.1`。
- 两个现有实例的 `GET /api/jobs?limit=1&offset=0` 都实测返回 `jobs` 与 `pagination`。`win3080` 的 `GET /api/jobs/{prompt_id}` 实测返回 `id`、`status`、创建与执行时间、`outputs`、`execution_status` 和 `workflow`。数据源开发仓库的当前 `comfyui-runtime-gateway.mjs` 也已经使用持久 `prompt_id` 调用该单 Job 查询接口，不再使用旧 `/queue` 与 `/history` 组合观察任务。
- `win3080` 的 `POST /api/jobs/{prompt_id}/cancel` 实测存在。对查询确认为 `completed` 的 Job 调用后返回 HTTP 200 与 `{ "cancelled": false }`，回读仍为 `completed`，证明终态取消是幂等 no-op。ComfyUI 官方 `server.py` 对 `pending` Job 按 ID 出队，对 `in_progress` Job调用 `PromptQueue.interrupt_if_running(prompt_id)` 原子中断；该实现不会把取消请求落到随后开始运行的其他 Job。
- `/prompt` 请求结果无法确认且本仓库尚未保存 `prompt_id` 时，本仓库状态为 `submission_unknown`；页面不能查询或取消 Job。已经保存 `prompt_id` 后，Jobs API 首次返回 404 且尚未超过观察期限时，本仓库保持原远端状态；持续 404 超过观察期限后，本仓库状态为 `failed`，错误码为 `COMFYUI_JOB_MISSING`。
- 当前数据源开发仓库的运行网关只封装 `submit()`、`observe()` 和输出下载，尚未封装 `POST /api/jobs/{prompt_id}/cancel`。本项目正式实现必须在当前仓库的 `ComfyuiTransport` 和 `GenerationRuns.cancel()` 中实现取消；数据源仓库仍不保存本项目的任务状态或取消结果。
- 2026-08-20 的来源 DeepSeek Harness monorepo 锁文件基线是 0 critical、12 high、12 moderate、1 low；该历史基线不代表当前项目 lockfile。当前项目完整闭包与 production 闭包均为 0 critical、0 high、0 moderate、0 low，dependency advisory 门禁已经通过。五个 build-script 包也已经完成独立审核，frozen install 已经成功。
- 用户已经选择 UI 变体 A。静态实现不再创建 B、C 页面，B、C 只作为讨论记录保留。
- `NoobAI-XL-FZ-PROD-ENV` v0.71.8 的 `docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md` 明确定义“本轮实际 Workflow JSON”与“实际 Workflow API 请求 JSON”；该 checkout 的下载行为目前位于静态 `iterative-image-tasks-prototype.html`，不是正式后端接口。
- 相邻开发仓库 `NoobAI-XL-FZ` 的已提交 `HEAD` 已经实现这条链路；当前工作树存在用户修改和删除，本轮证据通过 `git show HEAD:<path>` 读取。`prepareIterativeWorkflow()` 深拷贝 UI Workflow 0.4，按 `replace_input` bindings 写入最终提示词和固定参数，处理 LoRA 节点链并在转换前后执行静态校验。
- `createComfyuiIterativeRunService()` 先从本次实际 Workflow JSON 编译 `api_workflow_json`，再通过 `beforeSubmit` 把 `workflow_json` 与 `api_workflow_json` 一起交给运行时；`comfyui-run-runtime.mjs` 在远端提交开始前持久化两者。
- 数据源开发仓库的正式工作台从成功运行投影读取已经保存的 `workflow_json` 与 `api_workflow_json`，使用 `application/json` Blob 下载。下载逻辑不读取当前模板，也不重新运行转换器或 compiler。
- 用户所说的“请求快照转换为 workflow json”对应本方案的本次实际 Workflow JSON：它由模板来源快照与内部请求数据确定性转换而来，保留 ComfyUI 前端节点、widget、连接和画布信息。原始 `request.json` 只作为本仓库内部幂等与恢复事实，不是页面下载产物。页面只提供“下载本次 Workflow JSON（可导入 ComfyUI）”；API Workflow JSON 只供 Host 私有提交、恢复和诊断逻辑使用。
- 独立语义复审发现原 `PrivateRunSourceSnapshot` 只保存模板身份，不能离线重建实际 Workflow。方案已改为 `PersistedRunSourceSnapshot`：该类型保存完整 `ComfyuiTemplateBundle`、非敏感实例投影和本次 LoRA 来源投影；`RunRequestSnapshot` 单独保存运行关联、参数、LoRA 权重和上下文。两个快照都只写入当前仓库。
- 同一 ToolExecution 的传输或恢复重试复用原 `(workspace_id, session_id, call_id)` 与原 `run_id`。用户通过新的聊天消息明确要求 Agent 再次生成，且在 `submission_unknown` 情况下确认重复任务风险后，Harness 才创建新的 `call_id` 和 `run_id`；`submission_unknown` 不会自动重提。
- 一个 DeepSeek Harness Session 包含多个聊天轮次；每个聊天轮次可以包含零个或多个由 DeepSeek Harness 记录的 Skill 调用事件，并且可以关联零个、一个或多个 ComfyUI `run_id`。本项目只消费这些宿主事件，不保存自有 Skill 选择状态。右列“当前轮次结果”必须使用 Harness 原生 Session ID 与数字 `turn` 投影关联运行，不能显示 Session 最新运行作为替代。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Harness Tool 向迁移后的 Skill 返回结构化结果 | DeepSeek Harness 决定 Skill 的实际文件和工具可见性；本项目通过 Host 工具隔离数据源实现，不由 `SKILL.md` 声明宿主沙箱。 |
| DeepSeek Harness拥有Skill选择、发现与调用权威 | 项目保留ConversationRoot并在项目composer中渲染原生`conversation.input.overlay`；用户输入`/`后由Harness显示候选并插入普通`/skill-name `文本，Host在Agent执行前重新按Session cwd和preset scope验证并加载Skill。 |
| 只有显式`comfyui-generate`调用链可以创建ComfyUI运行 | `generate_with_comfyui`是目标Harness profile授权的普通Tool，但Host adapter必须在创建Run前通过公开Session event核对同一数字`turn`存在`comfyui-generate`的原生`skill-invocation`Context。缺失时返回`GENERATION_SKILL_INVOCATION_REQUIRED`并且不创建Run。 |
| ComfyUI 任务模块拥有工作流绑定、提交、轮询、媒体保存和请求快照 | 多个 Skill 与页面调用者只需要学习一个较小接口，复杂实现集中在一个模块中。 |
| 原型不执行真实写操作 | 原型问题是页面信息层级和交互是否正确，真实写操作不增加当前问题的判断价值。 |
| 用户插入的上下文必须形成会话日志事件 | DeepSeek Harness 要求每个模型可见输入都能够从会话日志重建。 |
| 项目Workbench保留AppFrame与ConversationRoot并替换可见occupants | 项目通过公开`sidebar`、`details`和conversation slots工作；ConversationRoot继续渲染原生input overlay，因此Harness Session、ConversationSnapshot、Tool projection和`/` Skill菜单保持权威。rc.7不存在已确认的桌面产品阻塞。 |
| 全局媒体库使用左侧栏入口和居中弹层 | Issue #3的项目`sidebar` occupant在原型位置直接渲染“所有媒体”入口，`ui-primitives`的`Modal`承载居中媒体库。 |
| 生成结果面板不复制 Tool 详情 | DeepSeek Harness 轨迹功能已经显示多个 Tool 的参数、结果和事件顺序；本项目右列只投影 ComfyUI 运行与媒体。 |
| 底模只作为上下文资源查询条件 | 用户选择的底模 ID 用于筛选生成模型、LoRA、画师或画风、画师串和 Workflow 模板；底模筛选值不生成消息上下文引用。 |
| `CatalogKind`与`ContextKind`使用不同边界 | `CatalogKind`保留`base-model`查询能力；`ContextKind`、`ContextRef`、`ContextSnapshot`和项目Context resolver在类型与运行时schema中排除`base-model`。 |
| 数据源仓库提供两个只读 CLI 表面，当前项目只实现对应 adapter | 现有语义 CLI 扩展 Agent 安全 Catalog Operation；Host 私有 CLI 从同一个 OpenAPI schema 读取 Source Operation。新项目和迁移后的 Skill 不能静态导入数据源仓库内部模块。 |
| 数据源仓库只提供实例、模板和目录数据的只读 CLI | 用户明确要求任务运行与媒体保存不能在数据源仓库中持久化。 |
| 当前仓库拥有 `run_id`、内部来源快照、内部请求快照、本次实际 Workflow JSON、API Workflow JSON 和媒体文件 | 当前仓库必须成为任务运行和结果的唯一持久事实来源。 |
| 两个 Workflow JSON 在远端提交前同时持久化 | 本次实际 Workflow JSON 是可导入 ComfyUI 前端的完整图；API Workflow JSON 是实际提交 `/prompt` 的执行图。浏览器只下载前者；Host 私有逻辑读取后者。 |
| Harness `ctx.jobs` 只代理一个持久 `run_id` 的当前观察过程 | 该注册表能够向 Agent 和现有 Web UI 提供实时任务状态，但其进程内记录不能替代当前仓库的运行数据库。 |
| DeepSeek Harness 决定迁移后 Skill 的执行环境 | 原仓库的 Skill 可见性要求不能替代 DeepSeek Harness 的 Skill provider、profile 和工具注册行为。 |
| 完善原数据源 CLI 并通过 Harness Tool 提供给 Skill | 用户要求沿用“CLI 提供结构化数据、Harness 负责 Tool 注册和调用”的机制，不创建第二套 Skill 数据服务。 |
| 一个权威 OpenAPI schema 投影两个只读数据表面 | `GET /internal/semantic`及其operation直接替换为新Catalog合同；不创建`/internal/catalog`且不保留旧semantic协议。Host专用的本机只读discovery只投影Source Operation。 |
| 两个 discovery 使用同一契约身份 | Catalog discovery 与 Source discovery 返回相同的 `contract_id` 和 `contract_version`；Host adapter 只接受配置明确列出的版本，不猜测、不回退。 |
| ComfyUI 实例属于 Execution Route | 浏览器用户可以明确选择安全实例 ID；未选择时 Host 使用配置的默认实例。明确选择的实例不可用时失败，不静默切换。 |
| 当前仓库使用一个运行 SQLite | 每条运行记录保存 `workspace_id`、`session_id`、Harness 数字 `turn`、Harness `call_id` 和 `run_id`；运行文件按 `workspace_id/run_id` 分区，数据源仓库不保存运行产物。 |
| Run Repository 是运行状态权威来源 | Harness Session 日志只保存原生 Generation Tool Call 与包含 `run_id` 的 Tool Result；Host 不写入持久 `generation.run.*` 状态事件，Client 通过项目 unary Typert Remote条件轮询。 |
| `submitting` 恢复为 `submission_unknown` 且不自动重提 | 远端可能已经接收，但本仓库未确认并保存 `prompt_id`，因此无法证明再次提交安全。 |
| 依赖 advisory、build-script 与 frozen install 门禁均已通过 | 来源 Harness 的 12 个 high advisory 已逐项处理，当前项目完整与 production audit 均为 0；`allowBuilds` 明确允许五个已经完成安全审计的精确版本。 |
| 正式 DeepSeek Harness 宿主只安装到当前仓库 | 用户指定原 Harness 目录只供调研；当前项目必须拥有并隔离自己的宿主安装和持久数据。 |
| “当前轮次结果”按 Session ID 与数字 `turn` 投影运行 | 一个 Session 有多个聊天轮次，并且每轮可能关联零个或多个 `run_id`；Session 最新运行不能替代轮次关联。 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 当前目标目录没有现有页面路由可挂载原型 | 方案采用明确命名的临时 prototype 页面；正式实现阶段重写获选交互。 |

## Resources
- `/Volumes/4Tdisk/work/AI2/deepseek-harness`
- `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV`
- `/Users/fzfz/.codex/skills/prototype/UI.md`

## Visual/Browser Findings
- 桌面宽度下，页面稳定显示会话列表、聊天区和生成结果三个并列区域；右列 Workflow 状态轨、运行元数据和媒体卡片保持清晰层级。
- 390 × 844 视口下，页面一次只显示会话、聊天或结果中的一个区域；底部移动导航能够切换三个区域，上下文选择器使用全屏布局。
- 上下文选择器使用原生模态对话框；浏览器验证确认 `:modal`、背景滚动锁定、Escape 关闭和焦点返回到“添加上下文”按钮。
- 角色 Session 的第一轮关联一个运行，第二轮不关联运行；普通“画风参数对比”Session 的第一轮关联两个运行。没有运行的聊天轮次不会显示该 Session 其他聊天轮次的结果。当前系统不存在专用 LoRA Session，LoRA 只是一种可选运行参数。
- 普通画风参数对比轮次点击失败运行的“定位结果”后，右列仍显示该聊天轮次的成功运行和失败运行，并只高亮目标卡片。
- 连续发送两条消息会创建两个独立聊天轮次和两个不同的 `run_id`；每段 Agent 输出和 Tool 按钮保留在所属聊天轮次。
- 用户在角色 Session 新增两轮后切换到视频 Session，再返回角色 Session 时，新增聊天轮次、三个运行、会话运行数量和“本会话结果”均保留。
- 运行卡片、会话媒体卡片和全局媒体卡片都按所属 `run_id` 下载本次实际 Workflow JSON，文件名以 `-workflow.json` 结尾；页面不存在 API Workflow JSON 下载按钮。
- 左侧“所有媒体”入口打开居中媒体库。全局媒体库按会话、聊天轮次、媒体种类和保存时间筛选；右列会话媒体库固定当前 Session，并按聊天轮次、媒体种类和保存时间筛选。两个媒体库复用固定尺寸卡片与分页行为。
- 左侧“所有 ComfyUI 异步任务”入口打开居中任务列表。任务列表按会话、聊天轮次和创建时间筛选并独立分页；每行显示本仓库状态、ComfyUI Job 原始状态或尚未取得 Job 的具体原因、`run_id`、可用的 `prompt_id` 和实例名称。排队与运行中任务通过确认弹窗演示单 Job 取消，其他状态显示不能取消的具体原因。
- 静态原型 fixture 仍使用页面内部字符串键关联演示轮次与 `run_id`；该键不是正式契约。正式组合使用 DeepSeek Harness 原生 Session ID 与数字 `turn`，Skill 交互由 DeepSeek Harness 原生会话输入区负责。
- 默认角色 Session 的 `turn_portrait_03` 同时显示队列等待、ComfyUI 执行中、保存媒体和提交结果未知四个真实关联运行；普通画风参数对比 Session 同时显示成功和失败运行。用户不需要操作底部原型状态选择器才能看到这些状态。
- 页面删除没有实现行为的“新建会话”和“会话选项”按钮。聊天轮次按钮改为“第 N 轮 · 本轮任务摘要 / 查看 N 项 ComfyUI 运行”，右列同时显示任务摘要和轮次序号，使按钮动作与结果来源可见。
- 页面为会话搜索、上下文搜索和聊天输入补充明确名称；页面提供“跳到生成工作区”的键盘入口；媒体元素预留固定宽高；上下文对话框限制自身滚动范围。
- 失败和提交结果未知卡片不提供绕过 Harness 的直接提交按钮；卡片要求用户通过新的聊天消息请求新运行。当前轮次卡片使用没有播放按钮的静态视频封面和音频波形；媒体库卡片打开本地 MP4 或 WAV 原文件。媒体筛选无匹配时显示筛选空态，不声称 Session 没有媒体。
- 上下文选择器把底模放在独立筛选栏中；底模不出现在资源种类、草稿标签或已发送消息的上下文快照。右列删除 Tool 详情标签；聊天 Tool 调用仍可定位 `run_id`，完整调用详情由 DeepSeek Harness 轨迹功能展示。

## 2026-08-20 Dependency Advisory Audit

- 只读来源仓库 `/Volumes/4Tdisk/work/AI2/deepseek-harness` 当前提交是 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`；`pnpm-lock.yaml` SHA-256 是 `f517dc3978d57531cda747df62a2abdde1df5b9f25415fcf1fc5d51f8b7547ea`。来源仓库包含用户未提交文件，本任务不修改该仓库。
- 对来源 DeepSeek Harness monorepo 执行 `pnpm audit --prod --registry=https://registry.npmjs.org --json` 复现 0 critical、12 high、12 moderate、1 low；来源 monorepo 的完整开发闭包是 0 critical、15 high、20 moderate、3 low。
- 12 个 production audit 条目不是 12 个独立升级动作：三个 `brace-expansion@5.0.6` high 可由 `5.0.9` 同时处理；两个 `js-yaml@4.2.0` high 可由 `4.3.1` 同时处理；两个 `fast-uri@3.1.3` high 可由 `3.1.5` 同时处理；两个 `nanoid@3.3.12` high 可由 `3.3.18` 同时处理；`undici@7.28.0`、`ip-address@10.2.0`、`postcss@8.5.15` 各需要一个版本处理结论。
- 原 DeepSeek Harness monorepo 的 production audit 包含 E2B、MCP、subagent 与 test-support workspace 路径。在当前项目建立 `package.json` 和 lockfile 之前，计划编写者没有把来源 monorepo 的 12 条路径声明为当前项目 production closure；随后生成的当前项目 lockfile 已经通过完整闭包与 production 闭包审计。
- 本机 `ctx7@0.3.5` 低于 registry 当前 `0.5.8`。依赖规则禁止为了文档查询临时安装或运行未审计的新版本，因此本任务不升级 ctx7，公告证据改用官方 pnpm、npm 与 GitHub Advisory 来源。
- 当前项目 lockfile SHA-256 是 `31575c342f4838904459d5b3daccad309ef3a1f227ef0fb9b0f982168e46e3c3`。完整闭包包含 591 个依赖，production 闭包含 475 个依赖；两个范围的 critical、high、moderate 和 low advisory 均为 0。
- 当前项目实际包含 `js-yaml@4.3.1`、`nanoid@3.3.18` 和 `postcss@8.5.26`。当前项目不包含 `brace-expansion`、`fast-uri`、`undici` 或 `ip-address`；相应 override 防止后续受影响版本进入 lockfile。
- `strict-dep-builds` 发现的五个精确版本已经完成安装脚本审计。`allowBuilds` 明确允许 `@deepseek-ai/dsh-subprocess-local@0.1.0-rc.7`、`@google/genai@1.52.0`、`koffi@3.1.5`、`node-pty@1.2.0-beta.15` 和 `protobufjs@7.6.5`，不裁剪五个依赖包的 lifecycle script。

## 2026-08-21 Harness 核心零改动审核补充

- `@deepseek-ai/dsh-client-ui-input-trigger/client`公开InputTrigger服务。项目composer通过公开`useInput`、`inputActions`与InputTriggerController连接textarea，并渲染ConversationRoot传入的原生overlay；Message Context仍由项目临时`ContextRef[]`和一次`SessionFace.prompt()`负责。
- Host的Skill列表按当前Session cwd与preset scope筛选user-invocable Skill；Harness默认`ui-skill`选择器在用户输入`/`后显示该列表并插入普通`/skill-name `文本。`dsh-tool-skill`在Agent pre-step重新发现并验证Skill；本项目保留该原生交互，不替换选择呈现。
- Message Context Client在项目Workbench composer中渲染“添加本次消息上下文”按钮、chip和Modal。确认选择只更新项目当前Session的临时ContextRef列表；发送时必须重新通过真实Catalog resolve稳定ID，任何失败都阻止整条原生Session消息。
- 原型多个chip的顺序由项目临时ContextRef列表保存；不经过默认InputBar的引用插入状态机。已发送持久事实仍是同一条原生user/message text中的`generation-context.v1` blocks，不另建Session事件或数据库消息副本。
- 当前 GitHub Issues #1–#15 都已创建。父 Issue #1 当前只声明 Harness 所有权，没有逐项列出允许的公开 package/export/slot/service，也没有定义公共 seam 不足时的失败关闭门禁；每张子 Issue 必须内联补齐对应的 UI 与功能 seam，不能只依赖父 Issue 的抽象所有权句子。
- `@deepseek-ai/dsh-api-remotes/client` 只挂载 Harness 预选的五组 Remote contribution；项目生成的 `harness-comfyui/remote` 不会自动进入该固定数组。项目 Client plugin 可以在 `@deepseek-ai/dsh-api-remotes` 已提供 `ctx.remote` 后，调用公开 `ctx.remote.$mount(harnessComfyuiRemote)` 挂载自己的严格 Typert Remote contribution；该路径不需要修改 `packages/api/remotes/src/client/index.ts`。
- 项目 Client bundle 不需要把 `@deepseek-ai/dsh-api-gateway/client` 作为运行时 value import；`@deepseek-ai/dsh-api-remotes/client` 提供 Cordis 类型合并和 runtime 依赖，项目只 value-import 自己生成的 `harness-comfyui/remote` 并调用既有 `ctx.remote`。
- 后续 Host 实现会直接导入的公开 Harness packages 至少包含 `@deepseek-ai/dsh-host-webserver` 和 `@deepseek-ai/dsh-workspace`；这两个 package 当前没有出现在项目根 manifest 的 direct peer/dev dependency 列表中。Ticket 01 必须在任何安装前把实际 direct imports 的精确 rc.7 包补入 manifest、runtime manifest 同步规则、lockfile 和既有 dependency security gate，不能依赖 `dsh-base` 的传递依赖。
- `@deepseek-ai/dsh-client-modules` 的 package metadata 明确把 `dsh.client` scan、Client bundle route 与 browser lazy-CJS module table作为插件发现机制；项目只需提供公开 `./client` export 和 `dsh.client` metadata，不需要修改 Web App assembly。
- `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-jobs`、`@deepseek-ai/dsh-skill`、`@deepseek-ai/dsh-skill-filesystem`、`@deepseek-ai/dsh-host-webserver` 和 `@deepseek-ai/dsh-workspace` 都在 rc.7 package 根 export 提供公开 service 类型或注册接口。项目规格必须只允许 package 根、`./client`、`./types`、`./remote`、`./typert`、`./presentation`、`./invariant` 和 `./package.json` 等已构建 export；即使 package metadata 暴露 `./src/*`，本项目也不得以 source export 代替稳定插件接口。
- Run Repository 的浏览器刷新间隔与 ComfyUI Jobs API 观察间隔属于不同配置对象。Ticket 01 必须为浏览器状态查询增加 `client.runRefreshIntervalMs`；Run projection Remote response 返回 `refreshAfterMs` 与是否存在非终态运行，Client 只在右列可见且存在非终态运行时按该值继续查询。
- `@deepseek-ai/dsh-skill-filesystem`的公开默认root包含当前`DSH_HOME/skills`。两个Prompt Skill、`lora-adjustment`与当前项目新增的`comfyui-generate`作为Release Artifact文件由产品安装程序复制到每个release自己的`<release>/dsh-home/skills/`；Host provider发现它们，Harness原生`/` Skill菜单显示可调用Skill，项目不增加第二套菜单、选择状态、provider或invocation policy。
- Issues #2–#15的正文和对应PRD已经分别直接列出所属功能使用的public plugin seams；执行者只按所属Issue正文落地，不负责重新调研或改变设计。当前规划审计没有发现public plugin seam阻塞。
- `docs/adr/0012-harness-core-is-immutable.md` 已接受 Harness 核心零改动决定，并明确 `cordis.patch.yml` 只允许通过 `dsh.bundle.patch` 增加项目 Loader row，不等于允许 patch Harness 源文件。

## 2026-08-21 Skill迁移方案结论

- 唯一迁移来源固定为`NoobAI-XL-FZ-PROD-ENV@799b7759029d70076791321e2b02bf53c651c98f`。该committed tree同时包含`skills/anima-prompt-builder/`、`skills/wai-sdxl-prompt-builder/`和`management-skills/lora-adjustment/`。
- 与先前检查的`6bc3fc6a027eecf45ccf86dd681e30621c4bc591`相比，两个Prompt Skill目录没有变化；`lora-adjustment`目录是后续新增的完整来源包。因此统一改用`799b7759029d70076791321e2b02bf53c651c98f`不会改变已核对的Prompt知识，并补齐了遗漏的LoRA管理Skill。
- 来源Anima Skill直接读取`noobai_user_prompt.user_text`与`noobai_user_prompt.ui_explicit.selections[]`；来源WAI Skill的`references/input-contract.md`还要求种类、版本、旧调用标识、底模名称和UI选择。当前Harness产品发送普通用户正文与`generation-context.v1`文本block，不提供该旧输入对象。
- 两个来源Skill都通过`run_skill_script`调用`scripts/validate-output.mjs`，失败时调用`finalize_skill_error`，校验成功后立即结束；两个来源Skill都没有调用`generate_with_comfyui`。
- 两个来源校验器只说明旧Skill曾要求的Prompt结构：Anima使用12槽，WAI使用15位置；两者最后都形成`prompt_text`与`display_text`。用户已经明确决定新环境不迁移`run_skill_script`、`finalize_skill_error`、三次校验、五键中间输出或固定结束文本，也不通过Harness`bash`复刻这套旧执行协议。迁移后的Prompt Skill直接按Skill指令在中列返回最终单行`prompt_text`，不调用Generation Tool。
- `generate_with_comfyui`输入已经冻结为`title`、可选`instance_id`、`template_id`、模板声明的`parameters`和有序`lora_applications[]`；Host私有地补充Workspace、Session、turn和call identity。独立`comfyui-generate`只按模板安全摘要的`parameter_id`与`kind`映射Prompt和显式运行值。
- 来源Skill中只有四个语义查询工具真正参与Prompt构建：`query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`和`query_semantic_prompt_terms`。当前PRD 12要求两个Skill可调用十个Catalog Tool是过宽授权，不是逐Skill最小Tool合同。
- 模板安全摘要与Host-only bundle现在共享闭合`RuntimeParameterDefinition.kind`；可供`comfyui-generate`使用的模板必须恰好声明一个`kind: positive_prompt`，Skill通过该项的稳定`parameter_id`写入Prompt，不根据label或ComfyUI节点类型猜测。
- 当前消息上下文已把每个已选资源保存为`generation-context.v1`block，字段固定为`contract_id`、`contract_version`、`kind`、`id`、`label`、`source_release_version`和`snapshot`；迁移后的Skill应直接读取同一条用户消息中的普通正文和这些block，不再构造`noobai_user_prompt`包装对象，也不保留来源系统的旧调用标识字段。
- 来源文件审计显示必须改写的不是只有两个`SKILL.md`：Anima的`references/01-quick-start.md`、`02-role.md`、`03-output-protocol.md`、`semantic-query-interfaces.md`引用旧输入或旧工具；WAI的`input-contract.md`、`prompt-format-validator.md`、`semantic-tool-orchestration.md`及多个“UI已选内容”引用必须改为`generation-context.v1`语义。`agents/openai.yaml`不是Harness filesystem Skill的执行输入；两个`validate-output.mjs`和两份旧运行时校验协议不进入迁移后的发布目录。
- 当前Execution Route设计还有一处跨Ticket架构缺口：Workbench只把`instance_id`保存在浏览器草稿，但唯一发送接口`SessionFace.prompt(parts,'queue')`没有单独的项目metadata参数；如果消息中没有确定的route指令，Agent不能把用户选择传给`generate_with_comfyui`。应在同一用户text part中增加独立于Message Context的`generation-route.v1`控制block；默认实例时不写block，明确选择时只写安全`instance_id`。它不是`ContextRef`、chip或`generation-context.v1`，但由Harness原生user/message持久化并由Skill读取。
- 迁移后的两个Prompt Skill只需要四个Prompt构建Catalog Tool：`query_semantic_works`、`query_semantic_characters`、`query_semantic_styles`和`query_semantic_prompt_terms`。其他Catalog Tool与Generation Tool仍可供独立`comfyui-generate`Skill或Workbench目录使用，但不属于两个Prompt Skill的运行路径。
- 用户已经纠正上一条中的生成调用：`anima-prompt-builder`与`wai-sdxl-prompt-builder`只负责生成最终Prompt；`comfyui-generate`是需求7要求新增的独立Skill，它才调用底层运行服务/Generation Tool。两个Prompt Skill不得直接调用`generate_with_comfyui`，也不得把生成运行作为自身成功条件。
- 最初需求明确分成两项并列Skill责任：需求5迁移现有会话/管理/后续Skill并把数据读取改为可扩展Catalog Tool；需求7单独新增`comfyui-generate`，调用需求6的ComfyUI异步底层服务并修改模板字段；需求8右侧第三列显示需求7产生的`run_id`结果。
- 预期用户链路应保持显式Skill选择：用户先调用Anima或WAI Prompt Skill取得最终Prompt文本；需要实际生成时，用户再在普通Harness Session中调用独立`comfyui-generate`Skill，并把该Prompt作为当前消息或明确引用上一轮Prompt交给它。Harness Session保留两次用户消息、两个Skill调用和第二步产生的Generation Tool Call；Prompt Skill调用本身不创建`run_id`。
- 最初需求中的“管理Skill”包括来源系统`management-skills/lora-adjustment/`。PRD12、Ticket12与父Issue已把该Skill补为第三个迁移Skill；`lora-adjustment`与两个Prompt Skill、`comfyui-generate`同属Harness可调用Skill，但职责不同。
- 来源系统当前`lora-adjustment`读取`original_generation_request`、`prompt_text`、有序`loras[]`快照、MODEL/CLIP权重范围和`base_lora_node_type`，输出调整后的完整单行`prompt_text`及按原顺序返回的每个`source_lora_id`、MODEL/CLIP权重和实际触发词。迁移必须保留这项产品能力，但必须移除旧环境的`run_skill_script`、`scripts/validate-output.mjs`、`scripts/report-error.mjs`调用协议，并重新定义适配Harness的输入输出合同。

## 2026-08-21 Skill Tool 注册与 Message Context 数据责任审计

- 当前方案已经选择`Skill → Harness Tool → StructuredCliGenerationCatalog → imagegen-semantic-query CLI → 数据源`，并明确只有Host adapter启动CLI；Skill不直接执行CLI，Source Operation不注册为Agent Tool、Skill Tool或浏览器Remote。
- GitHub Issue #13已经要求重写三个迁移`SKILL.md`的输入、Tool与直接assistant输出协议，并删除`run_skill_script`、finalizer、旧Pi调用标识和来源运行时说明；GitHub Issue #5已经完整定义`generate_with_comfyui`的`defineTool()`、`ctx.tools.register()`和结构化结果。
- GitHub Issues #4、#6与#13尚未共同冻结Catalog Tool的唯一注册模块、十个Tool逐项名称、Tool description、`defineTool()`输入/输出schema、OpenAPI operation到CLI参数的确定映射、CLI退出/协议错误到Harness Tool错误的映射、Cordis卸载注销责任、profile授权和冲突失败行为。Issue #13也没有逐文件列出旧`queries[]/groups[]`工具说明如何改写为新的`mode: search | resolve`、分页与稳定ID合同。当前三票不能据此直接实现完整Skill Tool迁移。
- “添加本次消息上下文”正式支持九类可插入资源：`model`、`lora`、`work`、`character`、`style`、`prompt-term`、`artist-string`、`comfyui-template`与`media`。Ticket 03首次实现`character`与`comfyui-template`，Ticket 05实现其余七类并复用前两类。`base-model`只用于筛选五类Catalog请求；`comfyui-instance`只属于Execution Route，两者都不能转换为`ContextRef`。

## 2026-08-21 Catalog Tool与数据源仓库交接结论

- 数据源仓库的OpenAPI、10个Catalog handler、2个Host-only Source handler、Catalog/Source discovery、`imagegen-semantic-query`、`imagegen-comfyui-source-read`、测试和版本发布必须由数据源仓库自己的Issue与发布流程实施；当前仓库Issue不得跨仓库修改这些对象。
- 当前仓库新增`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/plans/source-data-catalog-implementation.md`作为数据源仓库实施输入。数据源版本未发布前，当前仓库Issue #4保持`needs-info`，Issues #5、#6与#13通过既有依赖链等待；当前仓库只消费发布commit/tag、contract version、CLI和release acceptance。
- Ticket 01交付唯一`registerProjectTools()`；只有`register-project-tools.ts`直接调用`ctx.tools.register()`。Ticket 03、04、05分别通过同一入口注册首批Catalog Tool、Generation Tool和完整十个Catalog Tool。
- 十个Catalog Tool已经冻结名称、description、operationId、HTTP path、允许筛选、闭合search/resolve输入、CLI参数映射、失败清理和Host卸载注销。旧批量查询合同和来源旧LoRA Tool不属于新Skill可见接口。
- 三个迁移Skill已经冻结逐文件结果与真实Harness黑盒测试：Anima和WAI按一个目标一次search调用四个Prompt Catalog Tool；LoRA按快照顺序一个稳定ID一次resolve调用`query_semantic_loras`；三者不运行来源脚本、不调用finalizer、不直连CLI或数据源HTTP。
- Message Context Modal左侧固定九行：生成模型、LoRA、作品、角色、画师或画风、提示词条目、画师串、Workflow模板、已保存媒体。Ticket 03首次实现角色与Workflow模板，Ticket 05在同一Registry补齐其余七行；底模只在顶部筛选五类请求，ComfyUI实例只在输入区Execution Route中出现。

## 2026-08-23 v0.82.2 Harness envelope 消费决定

- 源数据仓库当前 detached tag 为 `v0.82.2`，commit 为 `621c35b071a4f23c1cd27485e1cca23faf88f7c9`，服务运行在 `127.0.0.1:18093`；本次只读核对未修改源仓库。
- 十个 Catalog operation 的 live CLI search、两个实例 Source 读取和真实 TemplateBundle `1/2/37` 均退出码 0；上一轮 v0.82.1 的模板失败结论不再成立。
- v0.82.2 的 Catalog discovery 是裸 OpenAPI 3.1 对象；Source discovery 是 `status/message/results/page/page_size/total_count` envelope，OpenAPI 位于 `results[0]`；两者都没有顶层 `contract_id`、`contract_version` 或 `source_release_version`。
- v0.82.2 CLI 只验证非空、严格 UTF-8、单个 JSON 值并原始透传；业务响应 Schema 由 Harness adapter 验证。Catalog 与 Source 成功响应统一采用 `status: "ok"`、`message: null`、`results`、`page`、`page_size`、`total_count`。
- 已选择正式采用 v0.82.2 envelope：Harness Installation 固定 `source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.82.2"`，这两个字段是 Harness-owned pin，不是从 live body 读取；adapter 依据唯一结构化合同文件校验 discovery、分页 envelope、operation metadata 和业务字段。
- Source TemplateBundle 的 `expected_output_node_ids_json: null` 表示不提供输出节点过滤器；Workflow compiler 使用目标 ComfyUI 实例 `/object_info` 中 `output_node: true` 的活动节点，不按 Workflow 节点名称猜测。
- 已将 v0.82.2 合同同步到实际部署 gate：`config/base.json`、`config/schema.ts`、`scripts/deploy/contracts.mjs`、`scripts/deploy/preflight.mjs`、`scripts/deploy/health.mjs` 和所有部署测试夹具均使用 `sourceReleaseVersion: "0.82.2"`；Catalog discovery 与 Source discovery 分别按两种 live shape 校验。
- 已将 `config/source-contract-v0.82.2.json` 纳入 Release Artifact 文件清单，并把同一消费合同同步到 GitHub Issues #1–#15；源数据仓库未被修改。

## 2026-08-24 Harness 原生 UI 原型重做任务

- 用户要求以官方 `develop/basic/` 文档、Harness 源码和失败 Issues #3/#4 为准重做现有静态原型；原型不得出现 Harness 公共插件机制无法实现的界面、交互或功能。
- 当前仓库已经包含正式 Client 工作台组件和 `prototype/generation-workbench/` 静态原型；原型合同测试位于 `prototype/generation-workbench/tests/prototype-contract.test.mjs`。
- 本仓库安全规则禁止未经授权下载或执行外部包。`find-docs` 默认使用的 Context7 新版本不能在本任务中下载执行；调研改用用户指定的官方页面、GitHub Issue 与当前项目锁定依赖源码。
- 本次任务采用 `$stop-that-shit change` 边界：只修改原型、必要测试和任务记录，不修改 Harness 核心、外部源码、依赖或 GitHub Issue。
- Web 页面读取与站内检索连续两次没有返回可读正文；该结果不能作为接口证据。计划执行者改用只读 HTTP 获取同一官方页面，并把页面陈述与锁定源码逐项交叉核对。
- GitHub Issue #3 已关闭；最后一条用户评论明确判定“Harness 无法实现原型功能，重新设计新需求”。该票曾要求停用上游 `ui-layout`、注册项目唯一 root、重做三列 Shell，并用项目 occupant 替换 sidebar、details、header、conversation view 与 composer；这些整页替换要求不能继续作为新原型依据。
- GitHub Issue #4 已关闭；最后一条用户评论同样判定原型无法实现。该票旧正文曾要求项目自建 composer、ContextRef 列表与直接 `SessionFace.prompt()`；最新修订又要求保留原生 InputBar并向 `conversation.input.dock` 注册上下文条。新原型只能保留用户本轮明确要求的“插入上下文”按钮和已选上下文标签，不得沿用该票未被源码重新证明的 Modal、codec、草稿回滚或 composer 替换设计。
- 两张失败票共同证明“静态原型 1:1 整页复刻”不是有效的 Harness 能力假设；本轮原型必须从 Harness 原生页面结构和现有公开扩展点正向推导，不再从旧原型反推实现机制。
- 用户指定的官方页面标题是“第一个插件”，页面说明属于 DeepSeek Harness 技术预览开发文档；页面正文需要从服务端渲染 HTML 的主文档区进一步提取，不能把导航或 VitePress 资源清单当作接口证据。
- Harness 源码生成的 slot catalog 明确说明：`sidebar` 是整个左列，已经由 `ui-sidebar` 的 `SidebarRoot` 占用；插件注册该 slot 会替换整个导航列并使其内部 seat 消失。新增左列入口必须注册到 SidebarRoot 已声明的内部 seat，而不是替换 `sidebar`。
- 同一 slot catalog 公开了可重复贡献的 `sidebar.footer.action`，owner props 只有 `wide: boolean`，用途是“在 Settings 旁渲染 action”；该 seat 是“ComfyUI 工作台”原生左列入口的首个可实现候选，仍需核对真实声明文件、渲染顺序与导航动作接口。
- 当前项目依赖和 peerDependency 都精确锁定 DeepSeek Harness `0.1.0-rc.8`。本机 Harness 源码工作树位于 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`（`dsh-v0.1.1-rc.2-dirty`）并含用户未提交修改；本轮不得把 rc.2 才存在的能力当作 rc.8 证据。
- 官方 `develop/basic/` 正文定义的公共扩展模型是 Cordis 插件：模块导出 `apply(ctx)`，通过 `ctx` 注册能力；依赖必须通过 `inject` 声明，并由框架在依赖服务就绪后加载。该页面没有授权插件重写 Harness DOM 或调用未公开内部模块。
- `dsh-v0.1.0-rc.8` 标签源码确认 `sidebar.footer.action` 已存在于目标版本，是 `kind: 'list'`、`scope: 'root'` 的正式 slot。`SidebarRoot` 把该 slot 渲染在 Settings 上方；宽列与 56px rail 两种状态都只向贡献者提供 `wide`。
- rc.8 的 `conversation.input.dock` 是原生 ConversationRoot 在 InputBar 上方渲染的 `kind: 'list'`、`scope: 'session'` slot；Todo 与 Queue 已使用该机制。项目可以把“插入上下文”按钮及数量摘要放入 dock，而无需替换原生 InputBar。
- rc.8 的 `conversation.view` 是原生 Session 中列视图环：插件可以通过 `ctx.slots.register` 增加带 `id/order/label` 的会话级标签，ConversationSession 使用原生标签与 `only: active.id` 渲染选中视图。该机制能够承载 ComfyUI 工作台内容，但左列入口如何合法切换该原生视图仍需单独证明。
- rc.8 原生 InputBar 已拥有 textarea、加号命令入口、Permission、Model、上下文计量和发送/停止按钮，并通过装饰层显示结构化 reference chip。新原型不得再次绘制项目 textarea、发送按钮、Skill 菜单或附件输入。
- 用户随后把本次原型能力基线从当前项目依赖的 rc.8 改为 DeepSeek Harness `0.1.1-rc.2`。rc.8 结论只保留为失败票历史，不再决定新原型；最终原型必须由 `dsh-v0.1.1-rc.2` 标签源码重新证明。
- 用户随后授权把原型实现为真实Harness插件，并把当前项目依赖升级到精确rc.2；依赖变更已经完成发布元数据、advisory与lifecycle script审计。
- `dsh-v0.1.1-rc.2` 标签存在，根版本精确为 `0.1.1-rc.2`。官方 `develop/basic/` 文档工作树与该版本一致，本轮后续源码判断只读取该标签。
- rc.2 继续公开 `sidebar.footer.action`、`conversation.input.dock`、`conversation.view` 和原生 InputBar；`ui-layout` 继续明确禁止用 top-level `sidebar` 或 `conversation` 做“新增内容”，因为注册这些 single slot 会替换原生整列并删除内部 seat。
- rc.2 的 `ctx.layout` 仍只公开 `toggleSidebar()`、`openDetails()`、`closeDetails()`；它不公开切换 conversation view 或进入项目 Surface 的导航方法。
- rc.2 的 `ChatStoreState.view` 与 `setView()` 仍属于 `ui-conversation` 每个 Session 的内部 store；左列 root-scope action不能凭 `ctx.layout`直接修改当前 Session 的 active view。原型不能假设左列入口能够调用一个不存在的 `ctx.layout.openWorkbench()`或`selectConversationView()`。
- rc.2 的原生会话 header仍从 `slots.entries('conversation.view')`读取全部 ledger entry，而不是从 `entriesOfSlot()`读取每个 id的生效 winner。使用同一个 `id: "chat"`优先级覆盖原生 Chat仍会产生重复“聊天”标签；Issue #18在 rc.8暴露的重复标签问题没有被 rc.2修复。新原型不得使用动态覆盖 `conversation.view#chat`进入工作台。
- rc.2 的 `conversation.view`只能安全增加一个新 id并由用户点击原生 tab切换；左列 `sidebar.footer.action`没有公开API替用户切换该 tab。因此“点击左列入口立即进入工作台”不能建立在新增 conversation view tab上。
- 可实现的最小组合是：左列 `sidebar.footer.action`切换插件非持久工作台状态；当前原生Session的`conversation.input.dock`根据同一状态显示上下文扩展。该组合不覆盖root、sidebar、conversation、header、chat view或composer，也不跨slot修改内部ChatStore。
- 用户将交付物从静态原型改为当前仓库中的真实 Harness plugin，并要求启动 Harness验证。后续不再修改 `prototype/generation-workbench/`作为主要产物；正式 Client plugin、必要依赖、测试和生产启动链进入授权范围。
- 工作树在本轮期间新增了大量用户现有改动：旧 Product Agent、旧 Workbench组件、旧三列测试与验收截图被删除，`src/client/index.tsx`变为不占用slot的空插件；`package.json`、生产脚本与文档也有相关未提交修改。计划执行者必须保留这些改动，不恢复旧文件、不覆盖对应文档，只在当前空插件基线上新增最小原生slot原型。
- 因为用户现有改动删除了 `harness-comfyui` Product Agent Preset，本轮不得自行恢复该Preset。左列入口将切换一个非持久的插件工作台状态；当前Session存在时，原生 `conversation.input.dock`显示工作台上下文扩展，原生ConversationRoot、Chat与InputBar保持不变。
- rc.2公开 `ctx.inputTriggers.registerSource()`、`ctx.conversation.input.for(sessionScope)`和 `SessionInput.insertReference()`。插件可以注册一个带codec的 `generation-context` reference source，再把选择结果按当前 `InputState.draftRev`插入原生InputBar；原生InputBar负责occurrence、内联chip、复制、序列化、发送锁定和失败保留。
- rc.2公开 `Button`、`Pill`、`Modal`及图标等 Cordis-free原生UI primitives。工作台入口、插入按钮、已选上下文展示和选择对话框可以复用这些公开原生组件；项目CSS只负责slot内排列，不重画控件。
- npm registry确认本次涉及的19个既有DeepSeek直接包与新增 `@deepseek-ai/dsh-client-ui-sidebar` 都发布了精确版本 `0.1.1-rc.2`，registry integrity可用，peerDependency统一要求 `^0.1.1-rc.2`和 Cordis `^4.0.1`。
- 20个rc.2直接包的npm发布元数据没有 `preinstall`、`install`或`postinstall`；部分包仅声明仓库开发用的 `bundle`/`watch`脚本。该结论只覆盖直接包，lockfile生成后仍必须审计完整闭包的advisory与lifecycle script。
- rc.2完整lockfile仍包含少量版本为 `0.1.0-rc.7`的DeepSeek内部基础包；这些版本来自 `dsh-v0.1.1-rc.2`官方发布闭包，不是当前项目保留的rc.8残留。所有当前项目直接Harness包已经精确指向 `0.1.1-rc.2`。
- 更新后的lockfile通过三项安装前门禁：manifest/lock/workspace投影一致；完整闭包与production闭包的critical/high/moderate/low均为0；唯一build-script集合仍是 `dsh-subprocess-local@0.1.1-rc.2`、`@google/genai@1.52.0`、`koffi@3.1.5`、`node-pty@1.2.0-beta.15`与`protobufjs@7.6.5`。
- `dsh-subprocess-local@0.1.1-rc.2`的postinstall仍是 `node scripts/ensure-spawn-helper.mjs`；rc.8到rc.2在该包的package script与源码没有变化，只有版本与中文文档链接变化。现有安全审计结论可以按精确新版本迁移。
- 真实Client插件当前只注册`sidebar.footer.action#harness-comfyui-workbench`与`conversation.input.dock#harness-comfyui-context-dock`两个additive list entry，并注册`harness-comfyui-context`引用codec；插件没有注册`root`、`sidebar`、`conversation`、`conversation.view`或`conversation.composer.bar`。
- 工作台Dock从Harness传入的`InputZone.input.occurrences`筛选已选上下文；确认插入时调用当前Session的公开`SessionInput.insertReference()`，CAS span使用当前`draft.length`与`draftRev`。Harness拒绝和异常分别通过公开`SessionInput.notify()`显示不同错误。
- rc.2 Web启动页把启动图写入`globalThis["__DSH_BOOT__"]`；生产health读取器已改为该精确rc.2语法。真实`prod:health`的process、sourceRuntime、harnessWeb、clientBundle、runRepository与savedMedia六项全部通过。
- 1440×1000真实浏览器验收确认：左列原生Session树、工作区和Settings保持存在；点击“ComfyUI 工作台”后`aria-pressed`变为true并显示Dock；选择模型上下文后Dock与原生InputBar同时显示`模型 · flux1-dev-fp8`，InputBar值为`@模型 · flux1-dev-fp8 `，原生命令、权限、模型和发送控件保持存在，浏览器无error或warn日志。
## Phase 16：真实上下文目录弹窗

- 生产配置 `config/source-production.json` 已将目录 CLI 固定为 `../NoobAI-XL-FZ-PROD-ENV/scripts/imagegen-semantic-query.mjs`，源数据 CLI 固定为 `../NoobAI-XL-FZ-PROD-ENV/scripts/imagegen-comfyui-source-read.mjs`。
- `config/base.json` 已固定数据源契约 `imagegen-source-contract` 与发布版本 `0.82.2`。
- 当前 Host 插件只加载配置，没有注册 Host 到 Client 的目录查询接口；当前 Client 弹窗仍使用三个静态选项。
- 项目 PRD 已把目录访问边界定义为：Host 调用 `imagegen-semantic-query`，Client 通过 Harness 公共 Remote API 请求 Host；Client 不直接执行 CLI，也不读取数据仓库或数据库。
- 当前生产启动流程已把 `HARNESS_COMFYUI_CATALOG_CLI_PATH` 和 `HARNESS_COMFYUI_SOURCE_CLI_PATH` 注入 Host 进程。
- `0.1.1-rc.2` Harness 已在 `http://127.0.0.1:4173` 运行，现有六项生产健康检查全部通过。
- 配置指向的数据源工作树当前是 detached `v0.82.4`，该工作树只有未跟踪的 `.planning/` 与 `runtime/`；当前仓库的结构化契约仍固定为 `v0.82.2`。
- 实际 `imagegen-semantic-query` CLI 版本为 `2.0.0`。CLI 只连接 `127.0.0.1`，查询前执行 live discovery；业务查询参数为 `--port`、`--path`、`--mode`、`--query`、`--page`、`--page_size`、可选筛选参数和 `--id`。
- 实际 CLI 固定暴露十个 Catalog operation；成功时 stdout 是数据源原始 JSON envelope，非零退出时 stderr 是数据源或 CLI 的 JSON 错误。
- Context 弹窗允许插入的真实目录类型为生成模型、LoRA、作品、角色、画师或画风、提示词条目、画师串、Workflow 模板；底模只用于筛选，ComfyUI 实例只用于执行路线，二者不能形成 ContextRef。已保存媒体来自当前仓库，不属于数据源 CLI，本次不实现。
- 目录成功 envelope 固定为 `status`、`message`、`results`、`page`、`page_size`、`total_count`。Client 只接收 Host 归一化后的安全条目，不能直接消费数据源记录。
- 当前仓库已安装全部 Harness `0.1.1-rc.2` 包；本机 Harness 源码工作树位于相邻目录 `../deepseek-harness`，可按该 Git 标签核对公共 Remote API。
- Harness `0.1.1-rc.2` 的正式 Host→Client 扩展方式是：Host 服务继承 `TypertRemoteService`，公开方法使用 `@Remote`；构建生成业务包 `/remote` 产物；Client 插件将该产物传给公开 `ctx.remote.$mount()`；卸载时调用 mount 返回的 disposer。
- Remote 方法把末位 `AbortSignal` 作为协作式取消参数；该参数不会进入 JSON 请求或 lookup 字段，适合把浏览器取消传递给 CLI 子进程。
- `@deepseek-ai/dsh-api-remotes/client` 只挂载 Harness 自带 Remote 贡献，不会自动发现第三方插件 Remote；本插件必须显式挂载自己的生成产物。
- 当前项目直接从 TypeScript 源码加载 Host 插件，并由自有 `tsdown` 脚本生成 browser Client bundle；项目还没有 Harness Typert generator 的 Host-first 构建步骤，也没有 `./remote` export。
- Client bundler 已允许打包 `@deepseek-ai/dsh-*/remote`，但尚未允许或生成 `harness-comfyui/remote`；现有 Client bundle 测试仍明确拒绝项目 Remote，这部分必须随真实 Host 查询一起更新。
- Harness 生成的 `/remote` 是纯浏览器安全 descriptor/codec contribution；Host 侧同时生成 `typert.host` contribution。严格产物为每个 JSON 参数和结果携带运行时 schema，并由 Gateway 在边界验证。
- Harness 官方包的 Typert 产物由仓库级 Host-first 编译流水线生成，不是 `tsdown` 自己推断；当前独立插件需要增加等价的生成步骤或使用协议支持的源码 JSON fallback，不能伪造私有 HTTP 路由。
- Gateway Host 在没有严格 Host Typert descriptor时会从公开 `TypertRemoteService` 与 `@Remote` 标记生成 `src-json` descriptor；Client仍要求挂载携带严格运行时 schema 的 Remote contribution。该组合允许独立源码插件在Client边界验证请求与结果，并由Host业务服务再次验证请求和CLI响应。
- 实现需要把 `@deepseek-ai/dsh-typert-protocol@0.1.1-rc.2` 增加为直接开发/peer依赖。该官方 Harness 包当前已安装且已进入lockfile，MIT许可证、无安装脚本；不需要联网下载或执行外部生命周期脚本。
- 数据源 CLI 强制要求显式 `--port`；配置指向的数据源生产服务当前监听 `127.0.0.1:18093`。现有 `source-production.json` 只保存CLI路径，没有保存目录端口，因此Host目前无法从自己的配置确定合法查询目标。
- 目录端口必须进入 `source-production.json`、受管运行快照和 Host Configuration Profile，再由生产启动器注入；Host不能读取数据源仓库 `.env`，也不能按进程或端口列表猜测。
- Live CLI已验证八类search统一接受`--mode search --query <0..200字符> --page <正整数> --page_size <1..100>`；其中生成模型、LoRA、画师或画风、画师串和Workflow模板还允许可选`base_model_id`，角色允许可选`work_id`。本次弹窗不提供额外筛选，因此只发送统一参数。
- 八类真实标签字段分别为：生成模型`file_name`、LoRA`file_name`、作品`name`、角色`name`、画师或画风`name`、提示词条目`canonical_tag`、画师串`title`、Workflow模板`title`；稳定ID在live JSON中是正整数，Host必须归一化为十进制字符串。
- Live数据当前包含15个生成模型、89个LoRA、3760个作品、39936个角色、12413个画师或画风、49856个提示词条目、0个画师串和35个Workflow模板。
- Live Workflow模板search响应目前仍包含完整`workflow_json`等Host-only字段；Host adapter必须只投影`kind`、字符串`id`和`label`，不能把原始记录透传给Client。
- 当前 Client 弹窗仅使用静态 `WORKBENCH_CONTEXT_OPTIONS`；需要把目录查询函数作为 `WorkbenchDock` 注入属性，使组件测试可传入受控查询器，生产注入则调用挂载后的 Remote namespace。
- Harness `0.1.1-rc.2` 原生 primitives 已公开 `Input`，其余现有 `Button`、`Pill`、`Modal`足以实现搜索、左列、候选选择与操作按钮，不需要自制表单控件。
- 已实现Host目录边界：CLI子进程使用固定argv且禁用shell，单次总超时15秒，stdout/stderr合计上限32MiB，AbortSignal触发SIGTERM；非零退出、空stdout、stderr、无效JSON、错误envelope和错误条目分别进入结构化错误分支。
- 已实现安全目录投影：Remote只允许八个Catalog kind、0至200字符单行查询、最多20条`{kind,id,label}`和总数；Client与Host复用同一份运行时边界解析器。
- 已把Catalog端口加入source production definition、Configuration Profile、受管runtime和Host环境映射。
- 已用offline、ignore-scripts模式更新lockfile；没有下载包，没有执行依赖生命周期脚本。
- Client已挂载项目严格Remote contribution，并把真实查询器注入原生Dock；弹窗已加入八类左列、原生Input搜索、加载/空/错误状态、候选单选和插入按钮。
- Harness原生`Input`虽然接受标准input属性，但`0.1.1-rc.2`公开类型不转发React `ref`；弹窗不需要强制聚焦，必须移除该ref而不绕过类型。
- Client组件测试已迁移到真实Catalog item形状和异步查询器，覆盖初始加载、类型切换、搜索、空集合、错误、选择、插入拒绝、关闭和在途请求AbortSignal清理。
- Client插件注册测试已加入Remote mount、目录查询注入和Remote disposer；Host插件与配置测试已加入Catalog端口环境值。
- 首轮定向测试共28项，27项通过；唯一失败是旧测试仍把目录原始label当作ContextRef label，生产逻辑实际按产品需要保存“类型 · 名称”。
- 生产受管快照恢复路径当前重建`runtime.source`时还未复制`catalogPort`；必须补齐，否则重启后status/stop读取旧形状会被runtime合同拒绝。
- 已新增Catalog合同、CLI adapter和Remote contribution测试；覆盖八类顺序、严格边界、CLI argv、安全投影、空集合、非零退出、空stdout、非法JSON、错误envelope、错误item、取消和输出上限错误。
- 第二轮定向检查中TypeScript通过，49项测试中48项通过；剩余断言仍需把Harness reference的显示label改为“类型 · 名称”。
- 全量unit当前78/79通过；失败的是旧Client bundle测试仍禁止`ctx.remote.$mount()`，该断言与本次真实Host数据源要求冲突，必须改为验证本地严格Remote contribution被显式挂载。
- 真实Harness源码加载使用Node TypeScript strip-only模式；该模式拒绝TypeScript constructor parameter property。新Catalog CLI与Remote Service必须改用普通class字段。
- 为兼容源码加载，Host Service也不能依赖需要转译的decorator语法；可以在模块初始化时用公开`Remote()` decorator函数登记同一方法initializer，仍由Harness公开SRC Remote发现机制读取。
- 新Host代码已改为普通class字段，并在模块加载时调用公开`Remote()`函数登记method initializer；真实Harness生产测试已证明Node strip-only可以直接加载该插件并提供Client bundle。
- 当前`pnpm typecheck`、79项unit和15项production全部通过。
- 首次完整`pnpm quality`执行到coverage门禁：83项coverage测试全部通过，语句88.5%、分支82.55%、行92.47%，但函数90.9%低于仓库固定100%门禁；需要补测新代码尚未执行的函数，不能降低阈值。
- 当前Vitest只保留`coverage/coverage-summary.json`，需要结合报告中的未覆盖行和源码分支补齐Client错误/回滚、Host process runner事件和Remote Service调用测试。
- 已补测Client目录查询成功/Remote失败/预取消/注册回滚、Host CLI预取消/双流收集/spawn失败/32MiB上限和Host Remote Service公开标记与委托。
- 当前coverage共90项全部通过：函数100%、语句94.62%、分支86.38%、行96.93%，所有固定阈值通过。
- 完整`pnpm quality`已通过：依赖清单一致、审计critical/high/moderate/low均为0、构建脚本白名单、Harness公共边界、TypeScript、90项coverage、17项contract/security、15项production和27项prototype全部通过。
- Harness已在`http://127.0.0.1:4173`启动；当前浏览器验收固定使用`1440×1000`桌面视口，并在最终交付前恢复浏览器默认视口。
- 浏览器标签页已成功导航到本机Harness；IAB把`waitForLoadState`和`domSnapshot`提供在`tab.playwright`对象上。
- 左栏工作台入口在真实Harness中可点击并进入pressed状态；工作台只在原生InputBar上方增加region和插入按钮。
- 真实弹窗的八类左侧列表、搜索框和操作按钮已渲染；首次Host查询失败，但数据源CLI同一可执行文件和参数在终端成功返回`status: ok`与15条模型记录，因此数据源服务和CLI本身可用。
- 原原型的上下文选择器明确采用顶部底模筛选、左侧资源类型、右侧三列固定尺寸候选卡片、封面或无封面占位、标题与副标题、每页6项和多项选择；当前真实插件必须保留该信息架构，同时把控件替换为Harness原生primitives并接入真实CLI。
- 当前真实插件合同只返回`kind/id/label`并固定请求第1页20项，无法渲染原原型卡片、分页或底模筛选；合同必须增加封面URL、副标题、页码和可选底模ID，并单独增加真实底模查询。
- `@deepseek-ai/dsh-client-ui-primitives@0.1.1-rc.2`未公开`Select`，但公开带portal、受控open、selectedId和键盘/遮罩关闭语义的`Menu`；Harness自身语言选择使用`Menu`加锚点按钮，因此底模选择应复用该原生组合。
- 数据源CLI的live discovery包含`/internal/semantic/base-models`，真实结果为`3/krea2`、`2/wai`、`1/anima`。`generation-models`、`loras`、`styles`、`artist-prompt-strings`和`comfyui-templates`的search请求接受`base_model_id`。
- LoRA真实结果包含`file_name`、`author`、`version`、`description`、`usage`、`weight`和`cover_url`；Workflow模板包含`title`、`template_type`、`revision_number`和`cover_url`。Host必须继续丢弃完整`workflow_json`等私有大字段。
- Harness Typert source-mode要求Host方法的运行时参数名与Client descriptor的wire参数一致，并把末位`signal`作为取消参数；当前Host方法`search(request, signal)`符合该结构，仍需从Gateway实际失败结果定位运行问题。
- Gateway会先寻找严格Host定义；没有时才从活动Cordis service生成SRC描述。SRC仍要求返回值是JSON值，Client严格结果parser会再次验证结果。当前运行失败必须通过实际Remote错误码定位，不能归因给CLI。
- Harness原生Modal默认宽度为380px，但`className`直接挂在原生dialog卡片上；插件可以只设置桌面宽度和最大高度，继续复用原生遮罩、圆角、关闭按钮、Escape和footer。
- 真实卡片副标题可由以下CLI字段直接得到：生成模型`file_format`，LoRA`author`，作品`category_name`，角色`works.name`，画师或画风`prompt_text`，提示词条目`post_count`，Workflow模板`template_type`；卡片封面统一读取可选`cover_url`。
- 新Client卡片使用Harness原生Button作为整张可选择卡片，并在封面右上角显示“选择/已选择”标记；选择状态使用`aria-pressed`，支持跨资源类型保留多个待插入项。
- 批量插入逐项调用Harness公开`SessionInput.insertReference()`；成功项立即从待插入集合移除，任何失败项保留在弹窗中，避免用户重试时重复插入已成功项。
- Harness rc.2的选中强调色使用`--dsw-alias-brand-primary`与`--dsw-alias-button-primary-fill`，primary前景色使用`--dsw-alias-label-primary-foreground`；项目卡片不定义第二套颜色常量。
- 覆盖率报告把3个未执行函数全部定位到`native-surfaces.tsx`；明确缺少底模Menu关闭回调和上一页回调，剩余匿名回调需要JSON coverage函数表定位。
- JSON coverage函数表确认第三个未执行函数是上一页状态更新器；补测后全仓固定函数覆盖率恢复为100%。
- 新实现已由生产构建加载到`http://127.0.0.1:4173`，Client bundle健康检查通过。
- 真实页面已显示顶部底模下拉、左侧八类资源、三列卡片区、分页、多选计数和插入按钮；底模与候选查询同时失败，进一步说明故障位于共享Remote注册或Gateway分派层。
- `$mount()`已成功提供`remote.harnessComfyuiCatalog`，但原Client插件只静态注入`remote`便直接访问子服务，Cordis权限门禁拒绝该属性。Harness Gateway测试给出的公开模式是`ctx.inject(['remote.<namespace>'], callback)`；本插件需要在mount之后创建该动态scope，并在卸载时先释放scope再卸载contribution。
- Cordis动态inject返回可等待、可dispose的Fiber；动态scope回调返回的注册disposer由Fiber按逆序清理，因此插件外层只需保存Fiber disposer和Remote mount disposer。
- Client最终卸载顺序为：conversation dock、sidebar entry、reference source、动态Remote scope、Remote contribution；不会在仍有UI调用者时先撤销Remote namespace。
- 真实Harness当前弹窗默认打开Workflow模板；live CLI返回35项，Client按每页6项显示为6页。首6个模板的`cover_url`均为null，因此页面正确显示“暂无封面”，不是封面加载失败。
- 真实Harness的wai底模筛选把LoRA总数从89筛为8；首屏实际显示StS Age Slider、Momlaliberte、GBF、Dramatic Lighting、BreastsILL和RealisticSkin六张带封面卡片，证明`base_model_id`与`cover_url`链路生效。
- 真实CLI搜索`Age`在wai底模下返回唯一StS Age Slider卡片；先前选中的GBF卡片虽然被搜索结果隐藏，仍保留在待插入集合中，符合原原型跨搜索多选逻辑。
- 真实Harness浏览器验收确认两个LoRA可同时进入“已选择”状态，弹窗计数显示“已选 2”；点击“插入”后，Dock与原生InputBar同时出现`LoRA · StS_Age_Slider_Illustrious_v1.safetensors`和`LoRA · GBF_Illustrious.safetensors`。
- 真实Workflow模板目录的下一页操作把页码从`1 / 6`切换为`2 / 6`并显示另一组6项真实模板；真实画师串目录返回0项时显示“无结果”且分页保持`1 / 1`禁用状态。
- 用户把候选区最终规格修正为每页9项的3×3九宫格；左侧当前资源类型必须具有可见选中态，封面图片必须在固定封面区域内居中完整缩放。
- Harness `0.1.1-rc.2`的公开`insertReference()`要求每个引用占据草稿中的完整可见显示文本，因此无法实现“保留原生发送路径但隐藏引用文本”。用户确认可直接把选中数据JSON写入输入框；插件改用公开`SessionInput.setDraft()`写入严格`comfyui-context` JSON行，并从同一草稿投影可移除chip。
- 真实Harness终验确认：Workflow模板首屏返回9张卡片；Workflow模板左侧按钮显示原生primary选中态与勾选；wai底模下的8张LoRA真实封面全部使用容器内完整缩放；选择2项后输入框出现2行`comfyui-context` JSON，点击一个chip的×后对应JSON同步删除且另一项保留。
## 2026-08-24：Agent 上下文 JSON 字段范围

- 用户明确要求简化 Agent 上下文 JSON，只保留可理解的名称、`prompt_text`、`id`、`tag`。
- 卡片封面、卡片副标题等展示字段不能进入 Harness 输入框 JSON。
- DeepSeek Harness 文档确认插件可以定义严格 JSON Schema；本次继续使用严格字段白名单，不传递完整数据源记录。
- 首次批量 CLI 调研使用了错误的 `--path` 参数值，CLI 返回 `INVALID_ARGUMENT`；后续必须以本地 CLI 源码定义的实际路径重新查询。
- 本地 CLI 注册表定义的实际目录包括 `/internal/semantic/generation-models`、`/internal/semantic/loras`、`/internal/semantic/works`、`/internal/semantic/characters`、`/internal/semantic/styles`、`/internal/semantic/prompt-terms`、`/internal/semantic/artist-prompt-strings`、`/internal/semantic/comfyui-templates`。
- 现有插件已经把样式标题映射自 `name`、提示词条目标题映射自 `canonical_tag`；真实响应仍需确认 `prompt_text` 和 `tag` 的来源位置。
- 真实 CLI 响应确认：角色记录包含 `name`、`prompt_text`、`id`；画风记录包含 `name`、`prompt_text`、`id`；提示词条目包含 `canonical_tag`、`id`，应把 `canonical_tag` 统一映射为 Agent 字段 `tag`。
- 真实 CLI 响应确认：生成模型和 LoRA 使用 `file_name`；作品使用 `name`；ComfyUI 模板使用 `title`。用户随后明确拒绝机械统一名称字段，输入框 JSON 必须保留这些可理解的领域字段名。
- 每条输入框 JSON 必须用外层上下文用途和内层 `kind` 说明插入意义；UI 展示数据与 Agent 上下文数据必须分离。
- ComfyUI 模板响应包含完整 `workflow_json`、校验值和参数定义；这些字段不属于用户指定的 Agent 上下文 JSON，不能写入 Harness 输入框。
- 当前 `artist-prompt-strings` 数据集为空；必须从本地服务契约确认它的字段，不得根据空响应猜测。
- 数据源 OpenAPI 把画师串语义检索描述为“标题、说明和 artist string”；画师串精确响应字段仍需从本地响应构建代码确认。
- 本地画师串查询实现确认响应字段为 `id`、`title`、`description`、`artist_string`、`base_model_id` 和封面；Agent 需要实际画师串内容，因此插入 JSON 应在 `kind: "artist-string"` 语境下把 `artist_string` 映射为用户指定的 `prompt_text`，不写入说明和封面。
- 严格 Agent 数据联合类型应分别采用：模型/LoRA 的 `file_name`，作品/角色/画风的 `name`，模板/画师串的 `title`，角色/画风/画师串的 `prompt_text`，提示词条目的 `tag`，以及所有类型的 `id`。
- 数据源画师串的 `artist_string` 是实际提示词内容；为满足用户指定的 Agent 字段集合，插件将在 `kind: "artist-string"` 的明确语境中把该值写入 `prompt_text`。
- 为满足单一来源约束，UI `CatalogItem` 不应重复保存 `kind` 和 `id`；`CatalogItem.context` 作为唯一身份数据，另行保存 `label`、`subtitle`、`coverUrl` 供卡片展示。
- 用户给出的角色实例确认：原 JSON 中的 `label`、`subtitle`、`coverUrl` 都是插件 UI 投影，不是 Agent 上下文字段。角色 Agent 上下文必须明确包含 `work_name`、`character_name`、`id`、`prompt_text`。
- 角色 CLI 响应中的 `works.name` 必须映射为 `work_name`，`name` 必须映射为 `character_name`；不能用宽泛的 `subtitle` 表达作品名。
- 相关源代码检索确认没有遗留把 UI `CatalogItem.kind` 或 `CatalogItem.id` 当作输入上下文身份的引用；卡片身份现在统一来自 `CatalogItem.context`。
- 完整质量门禁在 `tests/unit/catalog-remote.test.ts` 发现一个旧 Remote 结果夹具仍使用 UI 项目的旧 `kind`/`id` 结构；生产代码类型检查已经通过，失败属于待更新测试夹具。
- 更新 Remote 夹具后，完整 `pnpm quality` 通过：113 个单元/集成测试、17 个契约/安全测试、15 个生产测试、27 个原型测试全部成功；函数覆盖率为 100%。
- Harness 重启后的浏览器标签仍保留旧草稿 JSON；该旧草稿含 `label`、`subtitle`、`coverUrl`，必须刷新页面并清空后再验证新插件输出，不能把旧草稿误认为新序列化结果。
- Harness 原生输入框的自动恢复会覆盖程序化 `fill('')`；真实清理必须使用用户可见的全选与删除键盘交互。
- 真实 CLI `resolve --id 39933` 返回：作品名 `尼尔机械纪元`、角色名 `2b`、`prompt_text` 为 `nier2b,`。仅搜索 `2b` 的语义结果不包含该记录，搜索 `2B 尼尔机械纪元` 时该记录出现在首屏。
- 真实 Harness 输入框已生成角色记录：`{"type":"comfyui-context","data":{"kind":"character","id":"39933","work_name":"尼尔机械纪元","character_name":"2b","prompt_text":"nier2b,"}}`；该记录不含 `label`、`subtitle`、`coverUrl`。
- 真实 Harness 输入框已生成提示词条目记录：`{"type":"comfyui-context","data":{"kind":"prompt-term","id":"49856","tag":"ryuujin_no_senpai"}}`。已选中上下文区域同时显示可取消的角色和提示词条目原生 Pill。
- 原生输入框 `value` 精确核对结果：包含 `prompt_text` 和 `tag`，不包含 `label`、`subtitle`、`coverUrl`；两条 JSON 以换行分隔。
- 最终生产状态：PID 10366，`http://127.0.0.1:4173` 正在运行；生产健康检查的进程、源码运行时、Harness Web、客户端包、运行仓库和保存媒体六项全部通过。
- `git diff --check` 最终通过；工作树仍包含用户原有的大量未提交修改和删除，均未还原或覆盖。
- 插件当前把同一个 `CatalogItem` 同时用于弹窗卡片和输入框 JSON，因此 `label`、`subtitle`、`coverUrl` 被写入输入框。实现需要把 UI 卡片数据与严格的 Agent 上下文数据拆成两个契约。
- 现有输入框外层记录已经使用 `type: "comfyui-context"`；后续内层严格数据必须继续包含 `kind`，共同说明每条 JSON 的用途和来源类型。
- 用户要求 Harness 原生 `/` Skill 菜单能够发现当前仓库 `.agents/skills` 下的 Skill；实现必须复用 Harness 原生 Skill 发现和选择机制。
- 用户要求右侧列改为可展开/收起的抽屉；展开后的信息架构、布局和交互必须来自旧原型，视觉细节可以适配 Harness 原生组件。
- 右侧抽屉本阶段只展示静态数据；真实媒体结果、异步任务查询和任务操作不属于本阶段。
- `prototype` 的既有页面子形态适用于本任务；用户已经指定唯一布局，因此本阶段不生成三套变体，只在真实 Harness 页面实现一个静态可验收抽屉。
- `frontend-design` 对本任务的约束是保持 Harness 原生视觉系统，并把抽屉展开/收起作为唯一显著交互；产品文案只命名用户可操作对象。
- Context7 已把权威文档解析为 `/deepseek-ai/deepseek-harness`；下一次文档查询将限定项目 Skill 发现和原生 `details` 布局扩展。
- 当前仓库 `.agents/skills` 包含 `anima-prompt-builder`、`character-portrait-prompt-designer`、`wai-sdxl-prompt-builder` 三个 `SKILL.md`。
- 旧原型右侧列明确包含“当前轮次结果”和“本会话结果”两个视图、媒体种类筛选、固定媒体卡片、独立分页、运行状态卡片和运行详情联动。
- 旧原型同时包含全局媒体库和全局异步任务弹窗；用户本次只要求右侧列，因此全局弹窗不进入本阶段抽屉。
- 当前生产架构只注册 `sidebar.footer.action` 和 `conversation.input.dock`；右侧抽屉需要调研 Harness 公开 `details` 扩展位，不能自行覆盖 AppFrame 根布局。
- 生产配置修改后必须执行 `pnpm prod:restart`；Skill 发现相关运行文件位于 `.local/production/dsh-home` 和源码 profile，由 `scripts/profile/source.mjs` 生成。
- Harness 官方配置目录确认 `@deepseek-ai/dsh-skill-filesystem` 默认可包含项目根和用户根；`customSkillDirs` 可在项目根之后、用户根之前增加目录，`includeDefaultRoots` 控制是否保留默认根。
- 官方 Skill 合同确认 Skill 名称必须是 kebab-case，本地文件系统 provider 支持含 `SKILL.md` 的目录 bundle 和单个 Markdown 文件，但不递归发现嵌套 Skill。
- Harness 官方 `ui-layout` 源码确认 AppFrame 原生声明 `details` 单槽位，作用域为当前 Session；右侧抽屉可以注册 `details` occupant，并通过公开 `ctx.layout` 面板动作服务控制显示，不需要替换 root。
- `@deepseek-ai/dsh-client-ui-skill` 调用 `connection.api.skills.list({ sessionId })`；Host 在调用文件系统 Skill provider 前通过 Session header 解析项目工作目录。
- Harness `0.1.1-rc.2` 的公开布局服务提供 `ctx.layout.openDetails()` 和 `ctx.layout.closeDetails()`；插件可以直接控制原生右侧抽屉。
- `@deepseek-ai/dsh-base@0.1.1-rc.2` 已依赖并装载 `@deepseek-ai/dsh-skill` 与 `@deepseek-ai/dsh-skill-filesystem`；项目 Skill 缺失不是因为生产 profile 未安装文件系统 Skill provider。
- `SessionHeader.cwd` 是 Harness Session 的可选元数据；Skill 服务的工作区发现依赖该值，后续检查当前 Session 是否缺少 `cwd`。
- Base bundle 的 `cordis.patch.yml` 明确插入 `skill`、`skill-filesystem`、`skill-badge` 和 `tool-skill`；生产运行配置已经启用完整的 Host Skill 链路。
- `dsh-api-remotes`、`dsh-host-apiproxy` 和 `dsh-api-gateway` 的发布文件中没有可直接全文命中的 Skill API 实现名，需要从运行 API 或 sourcemap/类型声明继续定位。
- 生产 Session 持久化目录按仓库工作目录分组，`storages/session_projcache.json` 中三个 Session header 均记录 `cwd: /Volumes/4Tdisk/work/AI2/harness-comfyui`；项目 Skill 缺失不是 Session 工作目录为空造成的。
- `.local/production/dsh-home/sessions` 中的 Session 文件位于工作目录编码后的三级路径，之前的两级文件查询没有命中实际文件。
- `dsh-skill-filesystem` 的已安装 `0.1.1-rc.2` 实现确认默认项目根顺序为 `<project>/.dsh/skills` 与 `<project>/.agents/skills`，且 `FileSystemSkillProvider` 可从公开包导出用于只读诊断。
- 仓库三个 `SKILL.md` 的 frontmatter 均含与目录一致的 kebab-case `name` 和非空 `description`；没有显式关闭用户调用，因此文件表面结构符合 slash 菜单要求。
- Web bundle 已装载 `ui-input-trigger`、`ui-commands` 与 `ui-skill`，所以斜杠菜单缺失不是浏览器 Skill 插件未启用。
- Web bundle 明确禁用 Host 全局 `skill-filesystem`，并把本地 Skill discovery 交给每个 Agent preset 的 `skill-filesystem` 行；Skill API 必须在活动 Session 的 preset scope 中读取目录。
- 生产 `$DSH_HOME/.agent-presets` 当前为空；活动 Session 的投影缓存只显示权限 preset，不显示 Agent preset 字段，因此需要从 Web bundle 的随附 `config/agent-presets` 和 Session 原始日志继续确认实际组装。
- Web bundle 的随附 Agent preset 位于 `@deepseek-ai/dsh/config/agent-presets`，默认 `standard` preset 明确包含 `skill-filesystem` 与 `tool-skill`；`code` 也包含这两行，只有 `minimal` 不包含 Skill 支持。
- 生产 Session 日志使用 `session.jsonl.zstd` 压缩存储；不能用文本检索直接读取 Agent preset 字段。
- 已连接的应用内浏览器仍绑定运行中的 `http://127.0.0.1:4173/` Harness 页面，可以直接执行可见交互验收和页面内只读诊断。
- 当前活动 Session 顶部明确显示“极简模式”，而随附 `minimal` Agent preset 不含 `skill-filesystem` 和 `tool-skill`；这是当前斜杠菜单没有项目 Skill 的直接配置原因。
- 当前页面中间工作台与上下文 JSON 草稿仍存在；斜杠菜单验证必须在不发送消息的前提下恢复该草稿。
- 现有浏览器 locator 不提供 `inputValue()` 方法；后续验证使用已知草稿文本恢复输入框。
- 在当前“极简模式”Session 中输入 `/wai` 后，DOM 中没有出现任何 Skill 菜单项；页面只保留 `/wai` 草稿和原生“命令”按钮，实测与 preset 配置结论一致。
- 浏览器诊断已在读取 DOM 后恢复原上下文 JSON 草稿，没有提交消息。
- 当前 Client 插件只注册 `sidebar.footer.action` 与 `conversation.input.dock`，且 `WorkbenchController` 当前仅控制中间工作台显隐；右侧抽屉需要在同一插件新增 `details` occupant 和 Harness `layout` 注入。
- Git `HEAD` 中已删除的旧 `results-panel.tsx` 定义了右侧列核心信息架构：标题“生成结果”、会话运行总数、两个标签“当前轮次结果/本会话结果”和各自独立面板。
- Git `HEAD` 中已删除的旧根布局是自建三列 shell，不能恢复；本次只能复用其信息架构，并把视图挂入 Harness 原生 `details` 插槽。
- Source production profile materializer 当前只复制 `package.json`、`cordis.patch.yml`、`pnpm-workspace.yaml` 并链接当前仓库包；如新增项目 Agent preset，必须由该 materializer 明确复制项目 preset 目录并覆盖动态根路径，不能依赖已安装 Harness 包内文件修改。
- 当前项目未引入新增依赖的必要条件：Harness `0.1.1-rc.2` 已提供 Agent preset、Skill provider、Skill tool、布局和原生 UI 依赖；本次无需安装依赖，现有锁文件无需因本需求变化。
- 当前 `WorkbenchController` 仅有 boolean 状态；可扩展为调用注入的 Harness layout 动作，使左侧入口同时切换中间 dock 与右侧 `details` 抽屉。
- `dsh` 启动器会在所有 profile patch 之后强制把 Agent preset roster 的 `roots` 设置为 Harness 随附根，因此项目 profile 不能通过静态 `roots` 配置加入额外随附根。项目不需要新增 preset：把 base bundle 已有的 `skill-filesystem` 与 `tool-skill` 两行在最终 profile patch 中重新启用，可把项目 Skill provider/tool作为部署级全局能力提供给“极简模式”。
- Harness 源码注释明确 Skill registry 合并 global 与 preset scope，并允许 deployment-level provider 注册到 global layer；项目 profile 重新启用这两行属于 `0.1.1-rc.2` 支持的 Cordis patch 机制。
- 旧原型右列的实际布局为：标题与本会话运行总数；“当前轮次结果/本会话结果”双标签；当前轮次绑定信息与运行卡片列表；本会话媒体数量、聊天轮次/媒体种类/保存时间三个筛选器、两列媒体卡片和独立分页。
- 旧原型右列的当前轮次运行卡片承载排队、远端运行、保存媒体、成功、失败、提交结果未知、正在取消与已取消状态。当前阶段只展示静态状态，不提供真实取消、下载或打开原文件动作。
- Harness 原生 AppFrame 始终挂载 conversation/details 列，details 初始关闭；显式详情动作打开默认宽度，切换 Session 会关闭详情，宽度不足时由 Harness concession chain 自动收缩或关闭。
- `@deepseek-ai/dsh-client-ui-layout` 的发布声明分布在 `lib/types/client/`，后续实现直接引用其 Client export，不读取或修改内部 DOM。
- Harness `details` 是 `kind: single`、`scope: session` 的原生槽位；占用它会替换上游通用工具详情面板，因此项目右列必须在工作台激活时作为该槽位唯一 occupant 展示，并保留自己的原生关闭按钮。
- `details` occupant 自动收到 `sessionId`；抽屉显隐仍由 `ctx.layout` 控制，不需要项目读取或复制 AppFrame 的宽度状态。
- Harness 单槽位使用 ascending priority shadowing；上游通用 DetailsPanel 使用默认 priority 0，项目 `details` occupant 可以使用 priority -10 成为活动右列，同时保留上游 occupant 供插件卸载后恢复。
- Harness 原生 primitives 提供 `Button`、`Menu`、`Pill`、关闭图标与左右翻页图标；右列筛选、标签、关闭和分页不需要自建控件机制。
- 仓库边界检查当前把 source profile patch 固定为 `[]`; Skill 修复必须同步把唯一允许的 profile patch 结构更新为重新启用 `skill-filesystem` 与 `tool-skill`，并保留“任何其他 drift 失败”的边界测试。
- Source production 集成测试已经验证 materialized profile manifest 与仓库包软链接；可追加断言确认运行 profile 收到精确的 Skill patch，无需修改 profile materializer。
- 首版实现通过 TypeScript 检查；定向测试覆盖 Workbench/原生 layout 联动、details 注册 priority、静态运行选择、双标签、三维媒体筛选、分页、空结果和 profile patch 边界。
- React renderer 会同时匹配组件实例与其渲染的宿主 button；定向测试已改为只筛选宿主 button，避免重复计数，不改变产品实现。
- 新增 CSS 中的 `bg-layer-3`、`status-success/error` 与 `font-l/s` token 没有在已安装发布产物中获得直接文本证据；为避免依赖未确认 token，样式应收敛到项目已实际使用的 `bg-layer-1/2`、label、brand 与 `font-xs-13`。
- 完整质量门禁中的 117 项单元/集成测试全部通过，但新增交互回调使全局函数覆盖率从 100% 降至 95.53%，触发仓库覆盖率门禁。需要补测筛选菜单关闭、三种筛选选择、上一页、当前标签、音频预览和中间“生成结果”按钮，不改产品逻辑。
- 补充交互测试后，全局函数覆盖率恢复为 100%；右列实现自身语句/函数/行覆盖率均为 100%。
- 完整 `pnpm run quality` 已通过：依赖锁与 advisories/build-script 审计、Harness 边界、TypeScript、117 项单元/集成测试、17 项 contract/security 测试、15 项 production 测试、27 项旧原型合同测试全部通过。
- 生产 Harness 已重启为 PID 50308；`prod:status` 为 running，`prod:health` 的 process/sourceRuntime/harnessWeb/clientBundle/runRepository/savedMedia 全部 passed，启动日志没有 Skill 或 details 错误。
- 重启后的真实 DOM 已加载项目 `details` occupant：标题、会话运行总数、双标签、当前轮次绑定和 4 个静态运行卡片均存在。当前浏览器因热重载保留了此前打开的 details 宽度，需先验证关闭再从 Workbench 入口重新打开。
- 1440×1000 真实截图确认 details 初始呈现为关闭宽度；DOM 中的 occupant 虽保持挂载但不占可见宽度，符合 Harness AppFrame 合同。
- 点击左侧原生“ComfyUI 工作台”后，入口出现 pressed 状态，中间显示“生成结果/插入上下文”，右侧抽屉同步打开并显示 4 个运行卡片。
- Harness 的未连接“新会话”Hero 按合同把 details 渲染宽度强制为 0；此时 DOM occupant 和中间工作台存在，但右列不可见。切换到已有 Session 后，details 才允许显示。
- 浏览器已切换到已有“Modify code” Session；“生成结果”和“关闭生成结果”的可访问名称存在包含关系，自动验收必须用 exact 匹配点击中间按钮。
- 已有 Session 中右侧抽屉实际展开为 Harness 原生宽度，双标签、关闭按钮和滚动条可见；但运行卡片使用原生 Button 后继承了固定按钮高度，卡片正文溢出并相互重叠，当前视觉不合格。
- 修复应保留原生 Button，只在抽屉作用域内把运行卡片高度改为内容自适应并限制 overflow/white-space；不改变信息架构或交互。
- 已把原生运行卡片高度改为内容自适应并限制溢出；HMR 后 DOM 结构稳定。第一次截图只返回 64×64 片段，需重新设置浏览器验收视口后取得完整截图，不能据此判断视觉结果。
- 单类选择器仍未覆盖 primitives 后加载的固定高度规则；已增加 details 抽屉作用域双类选择器，并同时解除 max-height、固定主轴对齐和子项伸缩。HMR 瞬间的第二次截图再次只返回 64×64 片段，需等待页面稳定后复查。
- 页面稳定后的完整截图显示卡片仍保持原生固定高度，说明冲突属性可能不是普通 height/max-height，或者 Button 内部样式具备更高优先级。下一步只读检查该按钮的 computed style 与 primitives CSS，精确修复，避免继续试错。
- `@deepseek-ai/dsh-client-ui-primitives` 的 `Button.module.css` 已确认 `.md { height: 36px; }` 是卡片高度来源；项目卡片选择器理论上具备更高 specificity，下一步通过浏览器计算样式核对生产页面是否已加载最新 CSS，再决定是否需要显式覆盖 `.md`。
- 应用内浏览器的 Harness 页面控制对象提供只读 `evaluate`，可直接读取任务卡片的计算样式和命中的样式表，不需要修改 DOM。
- 生产页面 computed style 显示任务卡片仍为 `height: 36px`、`justify-content: center`、`overflow: visible`；页面样式表中的 `.harness-comfyui-run-card` 只包含旧声明，没有当前源码中的高度覆盖规则。这不是 specificity 失败，而是生产 bundle 尚未包含后续 CSS 修改。
- 受管 Harness 已重新构建为新进程 PID 51638，健康检查全部通过；原浏览器文档没有因服务重启自动刷新，因此 computed style 仍来自旧文档，必须执行页面 reload 后验收新 bundle。
- 页面 reload 后任务卡片高度已从 36px 变为 245px，卡片内容不再重叠，证明 CSS 修复生效。当前 1440px 截图中 details 面板位于可视区右侧，仅露出约 26px；需要检查 AppFrame/details 祖先布局尺寸，修复抽屉横向溢出。
- AppFrame 计算布局为 `280px 1160px 0px`，details 列实际处于原生关闭状态，并非横向溢出。页面刷新会按 Harness 状态关闭工作台和 details；重新点击左侧“ComfyUI 工作台”与中间“生成结果”后，原生状态显示入口 `pressed` 且 details 已重新打开。
- 右侧展开态实测网格为 `280px 800px 360px`，抽屉宽 359px；当前轮次四张运行卡片高度完整。本会话结果实测显示三个原生筛选菜单、两列固定媒体卡片、图片采用容器裁切缩放、第一页四项和独立 `第 1 / 2 页` 分页。
- 本会话分页实测第二页只显示“室内逆光肖像”和“角色转身镜头”，页码为 `第 2 / 2 页`；媒体种类按钮展开原生 menu，包含“全部媒体 / 图片 / 视频 / 音频”。
- 选择“视频”后只显示“雨夜街巷镜头”和“角色转身镜头”，页码自动变为 `第 1 / 1 页`。点击“关闭生成结果”后 AppFrame 变为 `280px 1160px 0px`，工作台仍保持选中；点击中间“生成结果”后恢复 `280px 800px 360px` 和 359px 抽屉宽度。
- 在重启前已经存在的 `Modify code` 会话中输入 `/` 后没有出现 Skill menu；验证草稿已立即清空且未发送。该会话顶部明确显示 Agent 预设“开始时即固定”，因此需区分旧会话的会话级 provider 快照与新全局配置是否生效。
- 源 profile patch 与生产目录物化 patch 完全一致，均启用 `skill-filesystem` 和 `tool-skill`；生产目录没有额外 Skill 错误日志命中。下一步检查完整 Cordis composition 和 settings 中的 profile/cwd，再用重启后创建的新会话验证会话固定边界。
- 生产 profile 的 bundle 顺序为 `dsh-base -> dsh-web-app -> harness-comfyui`，项目 patch 位于最后；依赖锁中 rc.2 的 `dsh-skill-filesystem`、`dsh-tool-skill`、`dsh-client-ui-skill` 和 `dsh-client-ui-input-trigger` 均已存在，不需要安装新依赖。完整 profile 根文件为空是项目既定的 bundle+patch 组合方式。
- rc.2 源码注释确认：host `skill-filesystem` 注册全局 provider，agent 通过作用域链读取合并后的 catalog；Web 默认关闭 host `skill-filesystem/tool-skill` 并交由 preset。项目末尾 patch 的启用方式符合 rc.2 明确支持的 deployment-level provider 机制。
- 重启后的“新会话”页面保留用户此前的两段 ComfyUI JSON 草稿，未修改该草稿。点击原生“命令”按钮只列出 compact/export/model 三条命令，没有 Skill；需检查 `ui-skill` 的触发过滤和 filesystem provider 的工作区根目录解析，不能仅凭命令按钮结果判断 catalog。
- 已定位 rc.2 的三个实际发布包：`dsh-client-ui-skill`、`dsh-skill-filesystem`、`dsh-tool-skill`；项目依赖树同时保留 rc.8 包目录，但生产 Web bundle/profile 引用的是 rc.2 路径，下一步直接读取 rc.2 发布实现。
- rc.2 `FileSystemSkillProvider.roots(cwd)` 会从 cwd 向上确定 project root，并依次扫描 `<project>/.dsh/skills` 与 `<project>/.agents/skills`；`tool-skill` 用 `agent.session.header.cwd` 查询同一 registry。`ui-skill` 则通过 `api.skills.list({sessionId})` 获取 catalog，说明 UI 是否显示取决于会话 ID 对应的 cwd/scope，而不是前端直接扫描文件。
- rc.2 `ui-skill` 明确注册 `/` trigger、order 2；输入候选通过 `skills.list({sessionId})` 拉取，并按 `skill.name.startsWith(query)` 过滤。因此输入 `/` 应显示全部 catalog，输入 `/wai` 应显示 WAI Skill；当前空结果说明 `skills.list` 返回空或失败，不是触发格式错误。
- 已定位 rc.2 `skill.list` 的 API 传输链位于 `dsh-api-remotes` / `dsh-api-gateway` / client connection；继续读取 Remote handler 的会话解析和权限条件。
- `dsh-host-apiproxy` 的 rc.2 发布实现包含 Skills API 逻辑，并在查询时优先读取 `presets.serviceFor(live, "skills")`，否则使用 host `ctx.get("skills")`。这说明已有 live session 的 preset-scoped skills 服务可能覆盖 host registry，需要检查该分支如何设置 cwd 与 modelInvocable。
- Skills handler 已确认：attached session 必须有 cwd；live agent 若有 preset-scoped `skills` service，则该 service 完全优先于 host registry。`Modify code` 使用历史自定义 preset `harness-comfyui`，其空 scoped registry 很可能遮蔽了 host provider；需要检查该 preset 的持久化 composition，并用 Harness 原生 preset row补齐 Skill provider/tool。
- 生产 `$DSH_HOME` 中不存在用户级 `.agent-presets` 文件，session projection 明确记录 cwd 为当前仓库。顶部显示的 `harness-comfyui` 是旧会话 header 中固化的 preset 标识，不是当前生产目录仍存在的可编辑 preset 文档。
- Skills API 使用 same-origin `POST /api/skill.list` 的 `client-request` envelope。Session projection 给出 `Modify code` 的 ID 为 `session-cce3ee32-5e4f-40fa-a50e-5fc034001a6c`，并确认 cwd 为当前仓库；可直接只读请求该会话和两个空白会话的实际 catalog。
- 直接请求结果：未 attached 的两个旧 session 返回 `session-not-found`；当前 attached 的空白 session `session-b1778df5-2623-46a5-a0f7-a24f9af30714` 返回 6 个 Skill，其中项目三个 Skill 均存在且 `modelInvocable: true`。其余三个为用户级 Skill，符合 rc.2 默认根目录合并行为。
- 第一次可逆 UI 验证在读取草稿阶段即停止，因为 Browser locator 不提供 `inputValue()`；此时没有执行 fill，用户 JSON 草稿未发生任何修改。下一步用元素属性/DOM 只读接口取得精确值后再验证。
- 原生 `/` 菜单已在重启后的 attached 会话中实际打开，出现“技能”分组和项目三个 Skill：`anima-prompt-builder`、`character-portrait-prompt-designer`、`wai-sdxl-prompt-builder`。同时显示用户级 Skill，符合原生合并目录语义。验证用 `try/finally` 恢复草稿，`restoredExactly: true`，没有发送消息。
- 最终 `pnpm run quality` 全部通过：117 个 unit/integration tests、17 个 contract/security tests、15 个 production tests、27 个 prototype tests；函数覆盖率 100%，完整和 production 依赖审计的 critical/high/moderate/low 均为 0。
- 切换到新会话后，Harness 原生 details 列按会话状态关闭为 0px；直接点击其隐藏 tab 失败属于正确的不可交互状态。必须从中间“生成结果”按钮重新打开后再制作最终截图。
- 新会话 hero 即使已有空白 sessionId，AppFrame 仍按 rc.2 的 unconnected 会话布局强制 details 为 0px；中间按钮已经幂等调用公开 `layout.openDetails()`，但原生 hero 不展示 details。该行为与 rc.2 AppFrame 约束一致，最终三列截图必须使用已有对话轮次的 connected Session。
- 切回 connected `Modify code` 后，最终三列布局为 `280px 800px 360px`；右侧第一页显示 4 张媒体卡、三项默认筛选和 `第 1 / 2 页`。输入框视觉上已清空且没有候选 listbox；locator wrapper 的 textContent 仍返回 `/`，需只读检查其 DOM 结构，确认该字符是否仅为编辑器隐藏状态节点。
- 输入框实际 textarea 的 value/defaultValue 确实仍为 `/`；`fill('')` 没有被 Harness 控制状态接受。已用原生键盘 `Meta+A` + `Backspace` 恢复，最终 value、defaultValue、textContent 和 outerHTML 均为空。
- 最终 1440×1000 验收状态：AppFrame `280px 800px 360px`、抽屉 359px、第一页 4 张媒体卡、`第 1 / 2 页`、消息输入框 value 为空。生产 PID 51638 保持运行，最终 status、health 和 `git diff --check` 全部通过，浏览器页面已标记为 deliverable。
- 用户反馈未看到三列后，已按浏览器恢复后的真实 1280×720 视口再次复查：AppFrame 为 `280px 640px 360px`，右侧抽屉 359px 且媒体网格可见。生产 PID 51638 和 health 仍通过；运行页已重新请求在 Codex 右侧聚焦。
- 用户提供的 Chrome 截图推翻了上一条交付判断：截图选中的是“新会话”，页面只有左侧工作区列和中间新会话区域；右侧列确实不存在。此前 1280×720 证据来自 `Modify code` 已连接 Session，不能证明新会话状态满足要求。
- 第一版浏览器检查没有进入用户截图中的“探索未至之境” hero，返回 `newSessionHero: false` 和 359px 抽屉，因此不是有效红色检查。当前应用内浏览器状态与用户 Chrome 截图状态不同，必须先精确进入空白新会话 hero 再建立失败信号。
- 点击侧栏第一个原生“新建会话”按钮可稳定进入用户截图对应的 hero。该状态计算布局为 `280px 1000px 0px`，`.harness-comfyui-results-drawer` 宽度为 0，DOM 虽挂载 complementary 内容但不可见；用户的上下文 JSON 草稿仍保持原样。
- 当前 `node_modules/@deepseek-ai` 是 pnpm 符号链接，普通 `rg` 没有跟随链接返回技能源码；下一步将读取链接目标或使用已安装包导出，不重复相同搜索。
- 当前 source profile 模板的 `profiles/comfyui-workbench/cordis.patch.yml` 是空数组；根级 `cordis.patch.yml` 只插入 `harness-comfyui` 插件，没有为 Skill filesystem provider 指定当前源码仓库的 `.agents/skills`。
- `scripts/profile/source.mjs` 只复制 profile 三个文件并把 `harness-comfyui` 链接到源码仓库；它没有把仓库 `.agents/skills` 复制或链接到运行目录。
- lockfile 已包含 Harness `0.1.1-rc.2` 的 `dsh-skill-filesystem` 和 `dsh-client-ui-skill`，说明原生 Skill provider 与 `/` 菜单组件已经在 Harness 依赖闭包中；当前问题优先检查运行 profile 的 provider 配置和项目根解析，不新增依赖。
- 旧原型右列 CSS 和脚本确认：顶部显示本会话运行总数；两个原生语义视图为“当前轮次结果”和“本会话结果”；当前轮次视图显示 queued/running/downloading/succeeded/failed/submission_unknown/cancelling/cancelled 状态卡片；本会话视图显示媒体种类筛选、媒体卡片和独立分页。
- 右侧静态抽屉应保留上述两视图与可见筛选/分页状态，但本阶段不能提供取消任务、下载 Workflow、打开原文件等会让用户误认为已经接入真实后端的操作。
- Source profile 组合 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 和当前插件；运行目录已经安装 `dsh-skill-filesystem`、`dsh-client-ui-skill` 与 `dsh-client-ui-input-trigger`，因此 Skill 菜单缺失不是依赖缺失。
- `dsh-skill-filesystem` README 明确项目根是最近包含 `.git` 的祖先；当前运行目录位于仓库 `.local` 下，理论项目根仍应解析到当前仓库。需要继续检查生成的 `cordis.yml` 配置与三份 `SKILL.md` 是否被 provider 拒绝。
- Harness 原生 AppFrame 已实现右侧列拖拽、让步链和自动关闭；details 关闭时宽度为零，显式打开使用合同默认宽度，切换 Session 时会关闭。插件只需注册 occupant 并调用公开 layout action。
- 读取 `dsh-client-ui-layout/src/client/*` 失败，因为发布包没有保留该源码路径；后续改读 package exports、类型声明与 README，不重复相同路径。
- Skill filesystem 发布包明确默认扫描 `<projectRoot>/.agents/skills`，每份现有 `SKILL.md` 的已读 frontmatter至少包含合法 kebab-case `name` 与非空 `description`；未发现 `user-invocable: false`。
- `pnpm prod:logs` 没有输出 Skill 解析警告，当前日志只保留生产生命周期与 Web 地址；不能用缺少警告证明 Skill provider 已加载。
- 生成 profile 目录安装了 Skill provider 和原生 Skill UI 包，但上一轮对 `cordis.yml` 的精确包名搜索没有得到可见匹配；需要直接读取生成 Cordis 树确认 provider 是否实际注册。
- 生成 `cordis.yml` 只有说明和空数组是预期行为：profile bundles 与 patch 在运行时组合，不能据此判断 Skill provider 未注册。
- 生产进程 cwd 已确认为当前 Git 仓库根目录 `/Volumes/4Tdisk/work/AI2/harness-comfyui`；默认项目根解析应能够到达 `.agents/skills`，因此不能直接把问题归因于 cwd。
- Skill provider 发布实现确认 `list(options)` 只有在上层传入 `options.cwd` 时才加入项目 `.agents/skills` 根；需要检查原生 Skill API/UI 是否使用当前 Session workspace cwd 请求目录。
## 2026-08-24 Phase 19 — 新会话页右侧结果抽屉

- 已在 `http://127.0.0.1:4173/` 的“新会话”首页复现用户截图中的问题。
- 点击中间列“生成结果”后，Harness AppFrame 的网格列仍为 `280px 1000px 0px`，`.harness-comfyui-results-drawer` 的实际宽度仍为 `0px`。
- 相同检查连续执行两次均失败：`hero=true`、`drawerWidth=0`、`passed=false`。
- 插件的 `details` 内容已经挂载到 DOM；当前问题是 Harness 在未建立会话的首页把 `details` 布局轨道压缩为零，而不是结果组件缺失。
- 测试期间输入框中的上下文 JSON 未发生变化。
- 本机已经安装 Context7 CLI：`/Users/fzfz/.nvm/versions/node/v24.14.0/bin/ctx7`，后续可直接查询技术文档，不需要安装依赖。
- `CONTEXT.md` 与 ADR 0012 仍把 Harness 权威版本写为 `0.1.0-rc.8`，并记录旧的扩展位边界；当前实现和用户已明确将 `0.1.1-rc.2` 作为权威。Phase 19 不能依据这两处过期描述否定 rc.2 已公开的接口，必须以 rc.2 安装包和官方开发文档为准。
- ADR 0012 明确禁止修改 Harness 核心源码、导入 `@deepseek-ai/*/src/*` 或替换上游 `ui-layout`。本次修复必须保留该边界。
- Context7 已将官方仓库解析为高信誉文档库 `/deepseek-ai/deepseek-harness`；查询目标限定为 Client plugin slots、layout details、`openDetails` 和未建立会话页面。
- 官方 `ui-layout` 注册信息给出根因：`details` 的 scope 是 `session`，而新会话中列 `conversation` 的 scope 是 `session-maybe`。未建立 Session 时，`details` 挂载内容可以存在，但 AppFrame 不会为它分配可见轨道。
- 官方 `ui-layout` 同时公开根级列表插槽 `shell.overlay`。该插槽不依赖 Session，是当前最符合插件边界的新会话右侧抽屉候选。
- 在按 pnpm glob 搜索安装包时未直接找到可读源码文本；需要先定位 rc.2 包的实际文件布局，再核对 `shell.overlay` 的导出合同与原生组件用法。
- 根 `package.json` 与 pnpm lock 均确认 `@deepseek-ai/dsh-client-ui-layout`、`ui-slots`、`ui-primitives` 等直接依赖锁定为 `0.1.1-rc.2`；实际包目录采用 pnpm peer hash 名称。
- 本机 rc.2 `ui-layout` README 明确说明：Hero 和其他未选择 Session 的状态始终派生出 `0` 的 details 渲染宽度，即使保留了 details 的首选宽度。这与浏览器失败检查完全一致，根因已确认。
- rc.2 README 声明的 child slots 是 `sidebar`、`conversation`、`details` 和 `conversation.empty`，没有提到 Context7 当前 master 文档中的 `shell.overlay`。因此不能直接按 master 接口实现，必须继续检查 rc.2 发布包导出；若 rc.2 没有 `shell.overlay`，改用 rc.2 实际公开的 `conversation.empty`。
- rc.2 类型声明和构建产物最终确认 `shell.overlay` 已存在；README 中的 `conversation.empty` 是过期文字。`shell.overlay` 的正式合同是 `kind: list`、`scope: root`，用于浮在整个 AppFrame 上方的插件自有界面，并且明确允许 additive registration。
- AppFrame 的 overlay 容器是 `position:absolute; inset:0; z-index:20; pointer-events:none`，其直接子项恢复 `pointer-events:auto`。插件可以在该原生根级层内把结果抽屉定位到右侧，不需要改 Harness core，也不遮断抽屉之外的页面交互。
- AppFrame 源码精确确认 `detailsSession === undefined ? 0 : panels.details`；新会话 Hero 点击任何 `openDetails()` 都不可能显示第三列。这是 Harness rc.2 的明确产品约束。
- `shell.overlay` 的 root-scope 组件会自动获得全局标准属性 `useSessions`，可以读取 `SessionListState.current` 与 `byId[current].blank`，从而只在当前 Session 尚为空白时呈现 overlay 抽屉，避免已连接 Session 与原生 `details` 重复显示。
- 当前 `WorkbenchController.openResults()` 只调用 layout，未发布“结果抽屉已打开”状态；overlay 没有可订阅的显示信号。修复需要给控制器增加独立的结果开关快照，并让 `toggle/openResults/closeResults` 同时维护该状态。
- 当前 Workbench 的静态结果 UI 已集中在 `WorkbenchDetails`，可以抽出共享内容壳；Session details 和 Hero overlay 复用同一个内容组件，不复制交互或静态数据。
- 已增加修复前回归测试，三类失败与预期一致：控制器缺少结果状态订阅、Client plugin 未注册 `shell.overlay`、结果模块未导出 Hero overlay 组件。目标测试共 16 项，其中 5 项失败、11 项保持通过。
- 已实现 root overlay：控制器现在发布独立的结果开关状态；`toggle/openResults/closeResults` 同步该状态与 rc.2 layout service；Client plugin 以 additive registration 注册 `shell.overlay`；overlay 通过 `useSessions` 只在当前 Session 为空白或未选择时呈现。
- 已连接的非空 Session 不呈现 overlay，继续由原生 `details` 列显示同一个共享结果内容组件，因此不会出现重复右栏。
- 新增 CSS 仅定位 root overlay 中的抽屉到右侧，宽度为最多 `360px`，其余点击穿透行为继续由 Harness AppFrame 的 `shell.overlay` 容器负责。
- TypeScript 检查通过。Harness 边界门禁随后发现结果组件直接导入了 `@deepseek-ai/dsh-client-ui-slots`；该包虽然是 Harness 包，但项目边界只允许现有 public Client specifier。rc.2 runtime 的公开 `/client` 导出包含 `SessionListState`，可以用它声明组件所需的最小 `useSessions` 只读属性并移除违规导入。
- 结果 overlay 现仅从 `@deepseek-ai/dsh-client-runtime/client` 读取公开的 `SessionListState` 类型；类型检查、Harness 边界门禁和 16 项目标测试全部通过。
- 浏览器刷新会重新创建 `WorkbenchController`，因此左侧“ComfyUI 工作台”初始为未激活状态，中间“生成结果”按钮尚不存在。浏览器验收必须先点击左侧工作台入口，再点击中间按钮；这与真实用户进入工作台的交互一致。
- rc.2 的 session-scoped `details` 内容即使在 Hero 宽度为零时仍保留在可访问性树，因此 DOM snapshot 中会看到一个 `complementary`。几何检查确认修复前初始状态仍是 `overlay=null`、`entryPressed=false`、`dock=false`、`grid=280px 1000px 0px`；验收必须按 class 和实际矩形区分隐藏 details 与可见 overlay。
- 在新会话 Hero 点击左侧“ComfyUI 工作台”后，root overlay 抽屉实际矩形为 `361×720px`，位于 viewport 右边缘 `left=919`、`right=1280`；抽屉标题和“关闭生成结果”按钮均可见，中间 Workbench dock 同时可见。
- 新会话 Hero 的底层 AppFrame 仍保持 `details=0`，右侧界面来自 rc.2 公开的 `shell.overlay`，符合 Harness 对 blank Session 的限制；浏览器截图已经显示左侧导航、中间工作台和右侧生成结果抽屉三个可见区域。
- 新会话页面同时保留一个宽度为零的原生 details occupant 和一个可见 overlay，因此全局按 aria-label 查询“关闭生成结果”会命中两个 DOM 按钮；实际交互和自动化必须在 `.harness-comfyui-results-overlay` 内定位可见抽屉按钮。
- 新会话关闭/重开验收通过：关闭后 overlay 消失、Workbench dock 和“生成结果”按钮保留；点击中间“生成结果”后 overlay 恢复为 361px。
- 关闭和重开过程中输入框 JSON 完全未改变，`prompt_text` 与 `tag` 仍保留。
- 已连接 `Modify code` Session 验收通过：Hero 消失、root overlay 数量为 0、AppFrame 网格为 `280px 640px 360px`、原生 details 列为 360px、结果 drawer 内容宽度为 359px。
- 已连接 Session 的 Workbench dock 和左侧激活状态均保留，说明 root overlay 条件分支没有破坏原生 Session details 行为。
- 全量 `pnpm run quality` 通过：120 项 unit/integration、17 项 contract/security、15 项 production、27 项 prototype 全部通过；函数覆盖率为 100%。
- 最终生产状态为 `running`，PID `77911`，`http://127.0.0.1:4173/`；process、source runtime、Harness Web、Client bundle、Run Repository 和 Saved Media 健康检查全部通过。
- `git diff --check` 无输出并通过。

## 2026-08-25 Phase 22 — 最终边界结论

- Harness rc.2 的空白 Session 同样能够渲染公开 `details` slot。同时注册 `details` 和 `shell.overlay` 会生成两个结果抽屉；插件只注册 `details` 后，空白 Session 与已有 Session 都使用同一原生右列。
- ComfyUI 提交的不确定边界位于 `/prompt` 请求开始之后。API Workflow 缺失或损坏、Source 读取失败和实例 origin 变化均确定没有发送请求，必须保留具体失败码；连接中断或请求超时才进入 `submission_unknown`。
- Client Remote 没有公开调用者身份或 Workspace 授权主体；当前 Harness 是绑定 `127.0.0.1` 的单用户本机应用。Session→Workspace 解析用于数据归属校验，不能声称它提供多租户调用者授权。

## 2026-08-25 Phase 22 — 生产界面验收

- Typert `RemoteStore` 以 `contribution.package` 为唯一所有者键，同一个 Client plugin 不能把 Catalog 与 Generation 两份 descriptor contribution 分别以 `package: "harness-comfyui"` 挂载。当前 Client 把三条 descriptor 合并为一份 contribution，并且只调用一次 `ctx.remote.$mount()`。
- Harness rc.2 的 `details` 列在页面刷新后按原生瞬态布局规则恢复为 0px；左侧“ComfyUI 工作台”入口调用公开 `layout.openDetails()` 后，1280px 验收视口中的右列宽度为 359px。
- `.agents/skills` 候选属于 Session Agent scope。新增技能目录后，新会话的原生 `/` 列表包含 `comfyui-generate`；技能目录生效前创建的既有 Agent 不会热换已加入的 scope。
- Generation Runtime 已用内置 `node:sqlite` 持久保存 Run、远端输出和 Media 索引；Node 24.14.0 运行测试时会输出该内置模块的 ExperimentalWarning，但当前实现没有新增第三方依赖。
- Comfy HTTP transport 使用 stable `prompt_id` 提交 `/prompt`，通过 `/api/jobs/<prompt_id>` 观察状态，并从 `/view` 下载已验证的输出描述符；InstanceSource 的 URL 与 Authorization 只存在于单次 Host 内存调用。
- `expected_output_node_ids_json: null` 的最终实现语义已经统一到 Source parser、preparer、compiler、PRD 与 ADR：它不限制输出节点，不触发 `SOURCE_TEMPLATE_UNAVAILABLE`；只有缺失、非法 JSON、空数组或显式数组引用非活动输出节点才失败。
- rc.2 `dsh-skill-filesystem` 默认 `includeDefaultRoots: true`，并按 rank 200 扫描当前 Session `cwd` 所属 Git 项目的 `.agents/skills`；当前 profile 已启用 `skill-filesystem` 与 `tool-skill`，新增 Skill 不需要项目自建列表 RPC 或第二套 `/` 菜单。
- rc.2 Skill frontmatter 省略 `disable-model-invocation` 与 `user-invocable` 时同时允许模型目录和原生用户 `/` 菜单；`comfyui-generate` 使用合法 kebab-case 名称与单层 `<name>/SKILL.md` 结构。
- 生产 Source CLI `imagegen-comfyui-source-read.mjs` 当前权限为 `0600` 风格的非可执行脚本；Source adapter 必须用 `process.execPath` 执行 `.mjs`，不能要求或修改外部数据源文件的可执行位。
- 真实模板 34 需要 `XB_UNetNameBroadcaster`、`ClownsharKSampler_Beta` 与 `FluxResolutionNode`。实例 2 缺少至少第一个节点，实例 1 的 `/object_info` 包含全部三个节点；实例 1 可以把模板 34 编译为 API Workflow。
- 模板 34 的 `expected_output_node_ids_json` 为 `null` 时，真实编译能够从实例 1 `/object_info` 发现非空活动输出节点集合。这项验证证明 `null` 语义可执行，不需要 Source 记录补写输出 ID。
- `@deepseek-ai/dsh-workspace@0.1.1-rc.2` 根package export公开`WorkspaceRegistry`与`resolveByPath()`类型；项目安全边界允许该specifier的type-only导入，不允许运行时导入或内部subpath。
- 静态结果模块仍保存旧Session级Run/Media/Workflow fixture会与真实`media_id → run_id → actual-workflow.json`语义冲突；真实投影上线后应删除这些运行时代码，而不是为它们补覆盖率。

## 2026-08-25 Phase 21 — 真实媒体、异步运行与 Host 架构

- 用户确认持久化关联不变量为 `Session 1 → N Run`、`Run 1 → N Media`。同一 Session 中的多次 Skill/Tool 调用会创建不同 `run_id`；每次调用可以改变模板参数，因此每个 Run 必须保存自己的 Actual Workflow。
- 媒体卡片通过 `media.run_id` 读取所属 Run 的 `actual-workflow.json`。系统不得按 Session 保存或复用一份 Workflow。
- 仓库已接受的 ADR/PRD 已定义单 Harness Host 进程方案：持久 worker 跟随 Host plugin 前台启停，结构化查询使用项目 Typert Remote，媒体和 Actual Workflow 二进制响应使用 `ctx.webServer.register()` 同源 prefix route；不需要第二个 HTTP 进程。
- `ctx.jobs` 只表示当前 Agent 进程内的等待/观察，不是持久状态来源。Run Repository 是状态、错误、Workflow 和 Saved Media 的唯一权威来源。
- 已接受的恢复规则为：`created` 可重新准备，`prepared` 可用已保存文件提交，`submitting` 在重启后只能进入 `submission_unknown`，已有 `prompt_id` 的运行只观察原 Job，不得自动重提。
- 已接受的文件根路径是 `workspaces/<workspace_id>/runs/<run_id>/`。媒体必须在当前仓库的 MediaStore 中按项目生成的 `media_id` 保存，SQLite 只保存元数据与相对路径，不保存大型二进制。
- 旧 Phase 20 记录中“下载图标放在结果 header”的结论已被用户纠正并被当前实现取代：每张媒体卡片通过自身 `run_id` 提供 Workflow 下载，结果 header 不提供 Session 级下载。
- 当前生产启动器已为 `runs.sqlite`、`shared/runs`、`shared/saved-media` 建立经过配置校验的绝对路径和健康检查，但 `src/host/plugin.ts` 目前只创建 Catalog Remote 并以空数组调用 `registerProjectTools()`；Run Repository、MediaStore、worker 与 Generation Tool 尚未实现。
- 当前 `src/remote.ts` 只包含 Catalog 的 `search/baseModels` unary Remote。Generation Run 的 `get/list/listMedia/resolveToolResultLink` 需要在同一项目 Remote contribution 中增加，Client 不需要创建第二条 RPC 机制。
- `docs/system/technology-stack.md` 仍标记 Harness `0.1.0-rc.8`，与 `package.json` 已锁定的 `0.1.1-rc.2` 不一致。Phase 21 实现前需同步该系统文档，但本次只记录差异。
- Context7 把官方 DeepSeek Harness 文档解析为 `/deepseek-ai/deepseek-harness`。官方 `ctx.webServer.register()` 支持 `exact`/`prefix` route、重复路由拒绝与 disposer 清理；项目可以在 Harness 现有 WebServer 内注册媒体/Workflow 路由。
- 官方 `defineTool()` 把参数、结构化输出、渲染和可取消 `execute(args, exec)` 收敛在同一 Tool 定义中。Generation Tool 可以在 `execute` 内持久接纳 Run 后立即返回 `{ run_id }`，不需要让 Tool promise 等到 ComfyUI 完成。
- `@deepseek-ai/dsh-tools@0.1.1-rc.2` 的 `ToolRunContext` 公开 `callId`、`agent`、`signal`、`deferContext()` 和 `concludeTurn()`。`ToolOutputDefinition.presentationMeta()` 可把 `{ run_id }` 投影到持久 Tool Result meta，不需要 Client 从文本解析。
- `@deepseek-ai/dsh-jobs@0.1.1-rc.2` 明确是进程内 registry，owner 或 service 销毁时会取消 live work，且官方 Known Limitations 明确持久/跨进程 backend 需要重新设计身份与恢复语义。因此 `ctx.jobs` 不得作为 ComfyUI Run 的持久权威；它最多代理当前 Agent 的可取消进程内等待，真实远程 Job 生命周期由项目 worker + Run Repository 维护。
- `ctx.jobs.kill()` 的公开语义是先调用 producer cancellation 再进入 `stopping`。Host 关闭不得通过该路径取消远端 ComfyUI Job；worker 销毁时只停止本地观察，重启后通过持久 `prompt_id` 恢复。
- 用户指定的 Harness 开发文档确认：插件通过 `apply(ctx)` 注册能力，依赖使用 `inject` 声明，手动资源通过 `ctx.effect()` 在插件卸载时清理。Run worker、Remote、Web route 和 Tool 可以共享同一 Host plugin 生命周期。
- Harness `dsh-v0.1.1-rc.2` 标签的 WebServer 源码确认 `register()` 返回路由 disposer，并允许 handler 持有响应（包括 SSE）。本方案不需要 SSE；Client 依照现有 ADR 使用可见消费者驱动的 unary Remote 轮询，媒体和 Workflow 使用同源 HTTP 流。
- ComfyUI 官方 self-hosted 协议使用 `POST /prompt` 提交并返回 `prompt_id`，使用 `/ws` 接收实时进度，使用 `/history/{prompt_id}` 读取完成记录与输出。当前项目已验证的数据源 runtime gateway 暴露 `/api/jobs/{prompt_id}`；项目 Comfy transport 必须封装这一变体，不得让 Run worker 和 UI 直接依赖某一条远端路径。
- 生产配置的 Host Source CLI 为 `imagegen-comfyui-source-read.mjs` `1.0.0`，它只实现两个只读操作：按稳定 ID 读取 ComfyUI instance source，以及按稳定 ID 读取完整 TemplateBundle。它不实现提交、观察、取消或媒体下载。
- 因此新增异步运行不得“用 Source CLI 当任务队列”。Source CLI 只在准备/恢复连接时提供实例与模板来源；当前仓库的 Comfy transport adapter 直接使用已解析且仅存于 Host 内存的实例连接执行远程请求。
- 不同 Harness Tool `callId` 即使属于同一数字 turn，也必须创建不同 Run；相同 `callId` 的重放只能解析到原 Run。每个 Run 独立保存一次请求、来源快照、Actual Workflow 和 API Workflow。
- 右列媒体卡片必须通过 `media_id → run_id` 下载所属 Run 的 Actual Workflow。Session 与数字 turn 只能作为筛选和分组条件，不能提供共享 Workflow。
- 持久层采用 SQLite 元数据与文件系统产物组合：SQLite 保存 Run、远端输出和 Media 索引；Run 目录保存请求、来源快照与两份 Workflow；Saved Media 目录按随机 `media_id` 两级前缀分片，并且只在文件原子提交后把媒体标记为 ready。
- 异步 coordinator 随 Harness Host plugin 启停。Tool 在 SQLite 持久接纳 Run 后返回 `run_id`；coordinator 处理准备、提交、观察、下载和终态转换；Host 退出只停止本地观察，不取消远端 ComfyUI Job；重启扫描非终态 Run。
- 本机支持的 Node 运行时已经暴露 `node:sqlite`，但当前 Node 24.14.0 仍输出 ExperimentalWarning。实现阶段必须先决定是否接受该运行时状态；本阶段不新增 SQLite 依赖。
- 推荐实现顺序是：先修正每张媒体绑定独立 Run/Workflow 的静态语义；再实现 Run Repository、ArtifactStore 与 MediaStore；然后用 fake Comfy transport 打通一条 Tool→worker→media→右列纵向切片；最后接入真实 Source CLI 与 ComfyUI HTTP adapter，并补齐多次 Tool 调用、重启、失败和多输出分支。

## 2026-08-25 Phase 22 — 实现真实 Run 与媒体投影

- 用户调用 `implement` Skill 并授权实施完整方案；`implement` 要求使用 TDD、完成后执行两轴 code review，并提交当前分支。
- 当前修改在实施前已经整体提交为 `e9f78b3`，该提交是本阶段 code review 和回滚的固定点。
- 已确认的公开测试 seam 是 `GenerationRuntime.acceptGeneration()`、`GenerationRuntime.advance()`、Generation Runs Typert Remote、逐媒体同源 HTTP 路由和右列 Client slot。
- Context7 高信誉官方资料再次确认 Harness Tool registration、`ctx.effect()` 生命周期和 `ctx.webServer.register()` exact/prefix disposer；本阶段不需要第二个 HTTP 进程。
- `CONTEXT.md` 与 `docs/system/technology-stack.md` 仍把 Harness 权威版本写为 `0.1.0-rc.8`，与当前精确依赖 `0.1.1-rc.2` 不一致；本阶段必须同步这两处系统文档。
- 当前 Host plugin 只加载 Configuration Profile、创建 Catalog Remote，并以空数组注册项目 Tool；真实运行模块可以在该入口一次性拥有 Tool、Run Remote、同源路由和 coordinator 生命周期。
- 当前 Client 已把 Catalog Remote mount 与 `sidebar.footer.action`、`conversation.input.dock`、`details`、`shell.overlay` 注册集中在一个 `apply()` 中；Generation Runs Remote 应与 Catalog Remote 一起 mount，并由右列使用单一外部 store 消费。
- 当前右列已经移除 header Workflow 下载按钮，每张静态媒体卡片已经有独立图标；本阶段只需要把静态 `runId` 和 Blob fixture 下载替换为 Remote Media 投影与逐媒体 HTTP URL。
- 当前配置已包含 `runRepositoryFile`、`runDirectory`、`savedMediaDirectory`、`jobs.pollIntervalMs`、`jobs.missingObservationMs` 和 `client.runRefreshIntervalMs`，不需要为第一条纵向切片增加新的运行参数。
- `package.json` 没有 SQLite 第三方依赖。当前 Node target 和 `@types/node` 已包含 `node:sqlite`，实现阶段先通过 TypeScript 与运行测试验证内置模块，避免未经计划安装依赖。
- rc.2 Tools README 明确 Tool output `presentationMeta(args, value)` 只为顶层直接调用持久化 JSON meta；Generation Tool 可以把 `run_id` 写入原生 Tool Result meta，Client 不需要解析文本。
- rc.2 Tool execution 只直接给出 `callId` 与可选 `agent`；`workspace_id`、`session_id` 和数字 turn 必须从 Harness Agent/Session 的公开身份接口解析，不能让模型作为 Tool 参数提供。
- rc.2 发布包的类型声明位于被根仓库 ignore 规则遮蔽的 `lib/types/`；后续安装包核对必须使用 `rg --no-ignore`，不能误判声明缺失。
- rc.2 `ToolRunContext` 继承完整 `ToolExecution`，包含 `callId`、`rootCallId`、`arguments`、可选 `agent` 和 `signal`。Generation Run 必须使用当前 Generation Tool 的 `callId`，不能使用外层 `rootCallId`；同一个 `run_code` 中两次 Generation Tool 子调用必须创建两个 Run。
- rc.2 Workspace 的公开实体包含稳定 `WorkspaceId`、规范路径和 `sessionIds`；Tool 可用 Agent Session 的 `cwd` 经 `workspaceRegistry.resolveByPath()` 获得 `workspace_id`，无需接受模型传入身份。
- rc.2 Typert Remote Service 是公开 Cordis Service，Catalog 的现有实现模式可以原样用于 Generation Runs 查询，不需要新增 RPC 框架。
- Agent 的公开身份为 `agent.id === agent.session.id`；Session header 提供创建 `cwd`，Session events 是数字 turn 与原生 `tool/call`、`skill-invocation` 的权威来源。
- PRD 04 要求 Tool 在创建 Run 前唯一定位当前 `tool/call`，并验证同一 turn 的 `turn/start` 与 Tool Call 之间存在 `comfyui-generate` Skill Invocation；模型参数不得携带 Workspace、Session、turn 或 callId。
- PRD 04 已冻结 Generation Tool 的名称、描述、参数域、`{run_id}` 输出和 presentation meta 合同；本阶段必须沿用该结构，不重新设计 Tool 文案或输出。
- v0.82.2 TemplateBundle 的结构化字段包含 `workflow_json`、`parameters_json`、`bindings_json` 与 `expected_output_node_ids_json`；Actual Workflow 必须只按声明 binding 修改，不能猜节点或 widget。
- Source CLI 只做 Host-only source read；真实 Comfy transport 必须从 InstanceSource 内存连接直接提交、观察和下载，Authorization 不能进入 SQLite、日志、Remote 或快照。
- 本机 Source discovery 实际公开 `getComfyuiInstanceSourceForHost` 与 `getComfyuiTemplateBundleForHost`，符合 v0.82.2 PRD；Source CLI 与 Catalog CLI 均可连接 `127.0.0.1:18093`。
- Catalog 当前有 35 个 ComfyUI 模板，它们的 `expected_output_node_ids_json` 为 `null`；这些记录可以进入 Generation Tool，Workflow compiler 使用 live `/object_info` 的 `output_node` 标志识别活动输出节点。
- 数据源仓库已有 `runtime-compiler.mjs` 证明 UI Workflow→API Workflow 需要 ComfyUI node definitions；当前仓库不能静态导入数据源模块，因此真实 transport 必须从目标实例读取 `/object_info` 并在项目内实现合同等价的编译 adapter。
- 对当前 35 个模板的只读汇总确认所有 `expected_output_node_ids_json` 都为 `null`。Source CLI 返回成功 envelope；Harness Source adapter 保留 `null`，Workflow compiler 从目标实例节点定义取得活动输出节点。
- 模板 34 的真实 bundle 已确认包含完整 UI Workflow、parameters 与 bindings，可以进入 Actual Workflow Builder 和 live Workflow compiler。
- SourceGenerationPreparer 已固定敏感数据边界：`ComfyConnection.url/authorization` 只存在于 Host 内存对象；`source-snapshot.json` 只保存实例 `id/title` 与模板身份、修订、哈希、尺寸策略和输出节点 ID。
- TemplateBundle 的 `replace_input` 绑定以 `node_id + widget_index` 修改本轮 UI Workflow 副本；请求中没有声明的 parameter 直接返回 `GENERATION_PARAMETER_INVALID`，不得搜索或猜测 Workflow widget。
- 模板 parameter 的 `default_value` 是 Source 明确声明的值，不是 Host 猜测；请求缺少非必填 parameter 时可以使用该声明默认值。请求缺少必填且无默认值的 parameter 必须失败。
- 当前迭代链路对非空 `lora_applications` 先返回 `GENERATION_LORA_APPLICATION_INVALID`，直到多 LoRA 确定性转换及分支测试完成；系统不会忽略 LoRA 请求或假装成功。
- Configuration Profile把`server.host`固定为`127.0.0.1`；`HARNESS_COMFYUI_SERVER_HOST`只把该验证值透传给Harness子进程，调用者不能把当前插件绑定到非回环地址。
- Saved Media记录存在但媒体文件缺失时，媒体路由返回404和`GENERATION_MEDIA_NOT_FOUND`；Actual Workflow尚未准备时返回409和`GENERATION_ARTIFACT_NOT_READY`；文件缺失时返回404和`GENERATION_ARTIFACT_NOT_FOUND`。右列从同一错误目录读取产品文案。

## 2026-08-25 Phase 23 — 空白 Session 右侧列根因

- Harness `0.1.1-rc.2` 的 `@deepseek-ai/dsh-client-ui-layout` 只在当前 Session 的 `blank === false` 时把 `detailsSession` 传给列布局；空白 Session 的 `details` 列宽被固定计算为 `0px`，即使插件已经调用 `layout.openDetails()`。
- 浏览器复现确认空白 Session 中 `harness-comfyui-details` 已挂载，但宽度为 `0px`；这排除了结果组件未注册和项目 CSS 隐藏两种假设。
- 历史回滚基线提交 `e9f78b3` 曾使用公开 `shell.overlay` 提供空白 Session fallback，并以 `blank !== false` 与原生 `details` 的 `blank === false` 条件互斥。该方案符合 rc.2 的公开插槽机制。
- 修复应只让空白 Session 使用 `shell.overlay`；已保存 Session 继续使用原生 `details`，避免同一状态出现两个可见结果列。
- 通用 `.harness-comfyui-results-drawer` 规则包含 `width: 100%`。空白 Session overlay 必须使用组合选择器 `.harness-comfyui-results-drawer.harness-comfyui-results-overlay`，才能稳定覆盖通用宽度并保持约 `360px`。
## 2026-08-24 Phase 20 — Workflow 下载图标按钮

- 原原型在运行卡片和 Session 媒体卡片中使用 `data-download-workflow` 提供“下载本次 Workflow JSON（可导入 ComfyUI）”。原型合同明确只下载 Actual Workflow，不提供 API Workflow。
- PRD 04 与 PRD 10 规定下载文件名为 `comfyui-run-<run_id>-workflow.json`；真实功能阶段必须读取该运行已保存的 `actual-workflow.json`，不能重新构建。
- 当前阶段仍是静态右列数据展示，因此按钮可以下载与静态运行卡片绑定的静态 Actual Workflow fixture；不得伪装为真实 Run Repository 数据。
- Harness rc.2 primitives 已公开 `IconDownloadOutline16`，可以与原生 `Button` 的 `icon` 属性组合为窄标题栏图标按钮。
- Context7 已将查询解析到高信誉官方文档库 `/deepseek-ai/deepseek-harness`。
- Context7 官方资料确认 Client plugin 是浏览器端插件，可在用户点击处理器内执行浏览器动作；本次不需要 Host API 或新增插件机制。
- 原原型把下载按钮放在成功运行卡片和媒体卡片内；当前用户明确要求右侧列补一个适配窄容器的图标入口，因此实现位置选在右侧抽屉 header 的现有关闭按钮旁。
- 当前静态结果数据只有运行摘要和媒体摘要，没有 Actual Workflow fixture。Phase 20 需要新增一份结构化静态 Workflow JSON 单一来源，并让 header 图标下载该 fixture。
- rc.2 `Button` 透传原生 button 属性，支持 `icon`、`size="sm"`、`aria-label` 和 `title`；rc.2 还公开原生 `Tooltip`，其 hover/focus label 与按钮自己的处理器会组合执行。
- 原原型下载处理器使用确定性的浏览器流程：从静态 run artifact 读取 `uiWorkflow`，以两空格缩进加末尾换行序列化，创建 `application/json` Blob，生成 object URL，点击带 `download` 文件名的临时 `<a>`，随后移除 anchor 并回收 URL。
- 原原型的静态 Workflow 数据位于 `prototype/generation-workbench/fixtures/workflow-fixtures.mjs`；当前插件不得在运行时导入原型目录，应该把本阶段所需的最小静态 UI Workflow 放入 `src/client/workbench/static-results.ts` 的唯一结构化数据来源。
- Phase 20 将复用原原型的 UI Workflow fixture 内容，但把该 fixture 作为 Client plugin 自身的静态结构化数据保存；插件不会导入 prototype 目录，也不会包含 API Workflow。
- 图标按钮放在结果 header 的关闭按钮左侧。它下载当前静态展示绑定的 Actual Workflow fixture；真实 Run 选择与 Run Repository 下载仍属于用户尚未授权的后续功能。
- 已完成 red 阶段：下载测试因 `static-workflow.ts` 尚不存在而失败，结果 header 测试因“下载 Workflow”文案与图标按钮尚不存在而失败；其余 5 项结果抽屉测试继续通过。
- 测试 mock 把 icon 与 children 直接组成数组时产生 React key warning；实现阶段会把 mock 改为 Fragment，避免把测试警告带入 green 结果。
- 首次 green 检查中下载序列化与 Blob 生命周期测试通过；UI 测试仍有一项断言错误：React renderer 的 `findByProps` 命中了 icon-only Button 组件本身，其 `children` 按设计为 `undefined`，图标由 `icon` 属性提供。断言应验证没有文字 children 且存在下载 icon，而不是要求 children 存在。
- 第二次目标检查暴露两处测试代码问题：对 `undefined` children 重复调用 `toContain`，以及 `vi.fn` 没有显式 Blob 参数导致 TypeScript 将 mock 调用元组推断为空。这两处只影响测试声明，不影响实现；分别删除重复断言并为 mock 增加 Blob 参数类型。
- 修正测试声明后，8 项目标测试、TypeScript 检查和 Harness 边界门禁全部通过。
- 浏览器验证中，受控 locator 不提供 `hover()`，页面 evaluate 环境也不允许构造 `MouseEvent`。这两个失败只影响 tooltip 自动触发方式；rc.2 Tooltip 对键盘 focus 立即显示，因此下一次使用 DOM `button.focus()` 验收，不再尝试 hover 或合成鼠标事件。
- 直接在页面级 evaluate 中调用 `querySelector(...).focus()` 也不受当前隔离环境支持。检查 locator 公共方法后确认它提供 element-scoped `evaluate` 与键盘 `press`；第三次调整改用 `workflowButtonLocator.evaluate(element => element.focus())`，由 locator 解析真实按钮节点。
- element-scoped evaluate 返回的对象同样不是带 `focus()` 的浏览器 HTMLElement；改用 locator `press('ArrowRight')` 后可以确认按钮存在、`aria-label="下载 Workflow"`、无文字 children、右栏宽 361px，但 Tooltip 没有出现。
- Tooltip 未出现可能是 rc.2 `Tooltip` 对原生 `Button` 的 ref/事件组合不兼容，或浏览器控制的 focus 事件未到达 Tooltip。下一步核对 rc.2 构建产物和官方内部用法；如果原生组件组合不支持，使用 Button 的原生 `title="下载 Workflow"` 作为浏览器 tooltip，并保留 `aria-label`。
- rc.2 构建产物确认不兼容根因：`Tooltip` 通过 `cloneElement` 给 child 注入 ref 并依赖该 ref 计算位置；rc.2 `Button` 是普通函数组件，没有 `forwardRef`。官方 sidebar 的 Tooltip 用法也包裹直接的原生 `<button>`，没有包裹 primitives `Button`。
- Phase 20 必须同时遵守“使用 Harness 原生 Button”和可用提示，因此移除不工作的 Tooltip 组合，改用 `Button` 透传的原生 `title="下载 Workflow"`。该属性会落到真实 `<button>`，提供浏览器系统 tooltip；`aria-label` 继续提供可访问名称。
- 改用原生 title 后，8 项目标测试、TypeScript 检查和 Harness 边界门禁再次全部通过。
- 生产浏览器 DOM 验收通过：新会话 Hero 的右栏仍为 361px；下载按钮实际尺寸为 36×28px，包含下载 SVG，文字内容为空，`aria-label` 与 `title` 都是“下载 Workflow”。
- 浏览器控制层的 `waitForEvent('download')` 在 3 秒内没有捕获程序化 Blob anchor 下载。该接口失败不证明页面下载失败；下一步只读检查精确目标文件路径，并用页面内确定性记录核对 anchor 的 download 属性与 Blob JSON。
- 实际下载已成功写入 `/Users/fzfz/Downloads/comfyui-run-run_01J8QUEUE42-workflow.json`，文件大小 5803 bytes。
- 解析下载文件得到 `last_node_id=7`、`last_link_id=9`、7 个 nodes、9 个 links、`run_id=run_01J8QUEUE42`，并确认内容不包含 API Workflow 的 `class_type`。
- 已连接 `Modify code` Session 验收通过：root overlay 不显示，原生 details 列宽 360px，header 中下载按钮保持图标-only、`aria-label/title="下载 Workflow"`，下载 SVG 可见。
- 浏览器截图确认下载图标与关闭图标并排位于右侧 header，标题与统计文案没有被挤压或换行。
- 全量 `pnpm run quality` 通过：123 项 unit/integration、17 项 contract/security、15 项 production、27 项 prototype 全部通过；函数覆盖率 100%。
- 最终生产状态为 `running`，PID 2812，`http://127.0.0.1:4173/`；process、source runtime、Harness Web、Client bundle、Run Repository 和 Saved Media 健康检查全部通过。
- `git diff --check` 无输出并通过。
