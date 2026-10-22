---
文档用途: 为通用 ComfyUI 工作流创建、改进和运行调优提供官方接口、节点语义与序列化证据。
读取时机: 设计工作流 Skill、选择节点组合、开发工作流工具或制定真实运行验收要求前。
---

# ComfyUI 工作流能力与接口证据

## 1. 适用范围与证据版本

1. 本文适用于按任务发现节点、组合工作流和运行调优。MOSS 多 LoRA 用于说明模型适配与动态控件机制。
2. 本文于 2026-10-20 核对以下一手源码。链接固定到提交，便于复核。
   1. [Comfy-Org/ComfyUI：`b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c`][backend-tree]。
   2. [Comfy-Org/ComfyUI_frontend：`9725d281725f7040924419ac1e700bd3d0e2696c`][frontend-tree]。
   3. rgthree 作者仓库的 [main 提交为 `d7297b42f0fa78bec1c0411478f887423c249502`][rgthree-tree]。第 8.2 节依据提交 [`6b76ee6f2c5a007710b5a16f97c94330d6ecc871`][rgthree-target]分析节点行为。
   4. [OpenMOSS/MOSS-Image：`6f9aabb9db61576838287a18b046383b5402fe26`][moss-tree]。
3. 下文“已核对事实”来自文档与源码。“设计判断”说明证据对通用 Skill 的含义。“运行验证要求”列出验证这些接口与机制所需的实例证据。实际试验结果见[实施计划第 3 节](../plans/comfyui-workflow-skills-20261020.md#3-现状调研)。

## 2. 名词定义

1. **UI Workflow** 是前端保存的可编辑图。内容包括节点、连接、控件值、位置、分组和子图定义。具体字段以对应前端版本的 [Workflow Schema][workflow-schema] 为准。
2. **API Prompt** 是提交后端执行的图。节点 ID 对应 `class_type`、`inputs` 和可选 `_meta`。连接用上游节点 ID 与输出序号表示。结构见 [Comfy Objects][comfy-objects] 和 [`zComfyApiWorkflow`][api-schema]。
3. **节点定义** 是后端通过 `/object_info` 返回的节点接口描述。本文以 `class_type` 标识可执行节点，以节点包标识节点来源。字段生成入口见 [`server.py::node_info`][server-info]。
4. **前端子图** 是可嵌套、可复用的编辑组件。每个子图有独立图 ID。子图内部节点有局部节点 ID。执行时使用执行 ID，例如 `1:2:3`。三类标识的区别见[子图开发文档][subgraph-dev]。
5. **运行时图展开** 是后端节点执行时返回 `result` 与 `expand`，由执行器继续执行生成的图。接口见[Node Expansion][expansion]。
6. **Batch** 是张量中的批次维度。**数据列表** 是执行器传递多个数据项的 Python 列表。单个 Batch 可以作为数据列表中的 1 个数据项。行为见[数据列表文档][data-lists]。

## 3. 节点用途与组合方式的证据获取

### 3.1 已核对事实

1. `/object_info/{node_class}` 适合读取单个节点定义。后端返回输入、输出、顺序、列表标记、描述、分类、模块名和输出节点标记。V1 节点读取类属性；V3 节点调用 `GET_NODE_INFO_V1()`。入口见 [`node_info`][server-info]。
2. 官方节点源码分布在 [`nodes.py`][backend-nodes]、[`comfy_extras`][backend-extras] 等模块。V1 节点通过 `NODE_CLASS_MAPPINGS` 注册。V3 节点通过 `define_schema()` 和 `get_node_list()` 声明。官方说明见[节点属性文档][node-properties]；V3 实例见 [`RebatchExtension`][rebatch-source]。
3. 第三方节点可以附带使用文档。约定位置是 `WEB_DIRECTORY/docs/NodeName.md` 或按语言划分的同名目录。节点名称使用注册键。前端展示规则见[节点文档约定][node-help]。
4. 节点包可以在 `example_workflows` 中提供示例。`/workflow_templates` 返回节点包与模板名称。模板发现规则见[工作流模板文档][workflow-templates]。
5. `/extensions` 列出前端 JavaScript 文件。`beforeRegisterNodeDef()` 等钩子允许扩展修改节点行为。服务端入口见 [`get_extensions`][server-discovery]，钩子见[JavaScript Hooks][js-hooks]。
6. Workflow 节点属性可以包含 `cnr_id`、`aux_id` 和 `ver`。第 1 节所列前端版本也将这些字段写入 API Prompt 的 `_meta`。字段校验见 [`zProperties`][workflow-schema]；写入见 [`graphToPrompt`][graph-to-prompt]。Registry 提供节点包发现与版本信息，见[Registry 文档][registry]。

### 3.2 设计判断

1. 通用 Skill 应先读取目标实例的节点定义，再按节点包与版本查找源码、作者文档和示例。在线仓库的当前版本需要与实例安装版本分别记录。
2. 节点用途应从实际执行函数与数据消费者确认。节点名称、分类和描述用于查找候选节点。
3. 每组候选节点需要记录以下证据。
   1. 上游节点产生什么数据，下游节点如何读取数据。
   2. 数据需要满足哪些尺寸、通道、模型家族和批次条件。
   3. 参数如何改变执行分支、模型补丁或输出结果。
   4. 节点是否读写文件、访问外部服务或生成额外任务。
   5. 作者示例覆盖什么输入，实际运行产生什么输出。
4. 工具适合保存节点定义、源码位置、图连接和运行记录。Agent 负责结合任务判断节点用途、组合方案与图像结果。

## 4. UI Workflow、API Prompt 与前端行为

### 4.1 已核对事实

1. 官方前端通过 `graphToPrompt()` 返回 `{workflow, output}`。`workflow` 来自图序列化；`output` 来自控件序列化与连接解析。函数会展开前端子图，处理虚拟节点和节点模式。源码见 [`executionUtil.ts::graphToPrompt`][graph-to-prompt]。
2. 前端提交时把 `output` 放入请求的 `prompt`，把 `workflow` 放入 `extra_data.extra_pnginfo.workflow`。对应入口是 [`ComfyApi.queuePrompt`][queue-client]。后端执行使用 API Prompt；保存图片时可附带 Workflow 元数据，见 [`SaveImage.save_images`][save-image]。
3. 前端导出函数接受 `workflow` 或 `output`，分别导出对应 JSON。源码见 [`workflowService.exportWorkflow`][workflow-export]。官方教程支持拖入包含 Workflow 元数据的图片，也支持通过“Workflows → Open”加载，见[多 LoRA 教程][multiple-loras]。
4. API Prompt 可以重新导入前端。`loadApiJsonNow()` 按 `class_type` 创建节点、恢复输入并自动布局。函数会将子图展开后的执行 ID 改为根图节点 ID。源码见 [`app.ts::loadApiJsonNow`][api-import]。API Prompt 只包含执行图，因此原图的位置、分组和子图封装需要从 UI Workflow 恢复。
5. 前端子图支持创建、嵌套、展开和发布到节点库。控件可以提升到子图外部。用户功能见[子图文档][subgraph-user]；标识和控件行为见[子图开发文档][subgraph-dev]。
6. 官方 Reroute 节点设置 `isVirtualNode = true`。API Prompt 序列化会解析连接来源并跳过虚拟节点。源码见 [`RerouteNode`][reroute-source] 与 [`ExecutableNodeDTO.resolveOutput`][resolve-output]。Workflow Schema 还描述独立的 `reroutes` 记录，见[字段定义][workflow-schema]。
7. `NEVER` 节点不会提供输出。`BYPASS` 节点按匹配的输入类型寻找上游来源。对应节点不进入 API Prompt。源码见 [`resolveOutput`][resolve-output] 和 [`graphToPrompt`][graph-to-prompt]。
8. V3 动态输入可以声明 MatchType 与 Autogrow 模板。官方前端通过 `applyDynamicInputs()` 处理模板。源码见 [`dynamicWidgets.ts`][dynamic-inputs]。
9. `/object_info` 从 Python 节点定义生成 JSON。前端扩展还可以添加控件、回调和自定义序列化。后端节点定义与这些前端行为的范围分别见 [`node_info`][server-info]、[JavaScript Hooks][js-hooks] 和 [`graphToPrompt`][graph-to-prompt]。

### 4.2 设计判断

1. 可编辑图的交付应保存 UI Workflow。运行证据应另存前端实际导出的 API Prompt。两份文件应对应同一次候选图。
2. 子图、Reroute、Bypass 和动态控件应交给目标前端处理。通用工具应复用目标前端的图操作和序列化入口。
3. 动态控件需要核对创建、恢复和导出 3 个环节。`object_info` 中缺少字段时，应继续读取前端扩展与作者源码。

### 4.3 运行验证要求

1. 第 1 节所列前端版本的[动态输入限制说明][subgraph-limitations]记录了 MatchType 和 Autogrow 跨子图边界的限制。实例验收应覆盖实际前端版本、控件提升和边界类型传播。
2. 目标前端需要完成 UI Workflow 导入、导出、重新导入和 API Prompt 导出的往返验证。每轮应核对节点参数、连接、子图和启用状态。

## 5. 端口类型之外的数据与执行语义

### 5.1 已核对事实与官方节点例证

1. `IMAGE` 通常使用 `[B,H,W,C]`，`MASK` 通常使用 `[B,H,W]`。`LoadImage` 从 alpha 通道生成反向遮罩；没有 alpha 时会生成 `64×64` 的零遮罩。依据是[图像与遮罩文档][images-masks]及 [`LoadImage.load_image`][load-image]。
2. `VAEEncodeForInpaint.encode()` 根据 VAE 的空间压缩比处理尺寸。函数将遮罩缩放到图像尺寸，再裁切并生成 `noise_mask`。源码见 [`VAEEncodeForInpaint`][vae-inpaint]。
3. `LATENT` 的 `samples` 保存张量。通道数、空间压缩比和缩放参数取决于模型家族。第 1 节所列 ComfyUI 源码中，SD15 默认使用 4 个通道，Flux 使用 16 个通道，Flux2 使用 128 个通道和 16 倍空间压缩比。定义见 [`latent_formats.py`][latent-formats]。`EmptyLatentImage` 则明确创建 4 通道、8 倍压缩的张量，见[源码][empty-latent]。
4. `CLIPTextEncode.encode()` 调用输入编码器的 `tokenize()` 与 `encode_from_tokens_scheduled()`。模型配置指定文本编码器与潜空间格式。依据是 [`CLIPTextEncode`][clip-encode]、[`MOSSImage` 模型配置][moss-config]和[潜空间格式定义][latent-formats]。
5. 数据列表会影响节点调用次数。默认处理会按列表项调用节点，并用较短列表的最后一项补齐。`INPUT_IS_LIST` 与 `OUTPUT_IS_LIST` 可以改变此行为。官方 `RebatchImages` 使用 V3 的列表标记，将图像 Batch 重组后返回数据列表。依据是[数据列表文档][data-lists]与 [`ImageRebatch`][rebatch-source]。
6. Lazy 输入由节点决定何时求值。官方 `ComfySwitchNode` 将两个分支声明为 Lazy，通过 `check_lazy_status()` 只请求选中的分支。第 1 节所列 ComfyUI 版本将该节点标为实验功能。依据是[Lazy Evaluation][lazy-evaluation]和 [`SwitchNode`][switch-source]。
7. 运行时图展开可以在执行时增加节点。`GraphBuilder` 负责生成图与节点 ID。展开节点的 ID 需要跨执行保持确定，并在整张图内唯一。展开图中的节点可以分别缓存。协议见[Node Expansion][expansion]，构图工具见 [`GraphBuilder`][graph-builder]。
8. `SaveImage` 是输出节点，也会返回 `IMAGE`。函数写入文件，并通过 `ui.images` 返回文件引用。`PreviewImage` 继承保存逻辑，使用临时目录和 `temp` 类型。源码见 [`SaveImage` 与 `PreviewImage`][save-image]。
9. `validate_prompt()` 从输出节点回溯依赖。没有输出节点时返回 `prompt_no_outputs`。多个输出中，只要有通过校验的输出，后端就可能接收任务，并在 `node_errors` 中保留其他输出的问题。源码见 [`validate_prompt`][validate-prompt]。
10. 执行器支持缓存与 `IS_CHANGED`。运行中可以出现 `execution_cached`。同一参数再次提交时，执行耗时需要结合缓存事件解释。依据是[节点属性文档][node-properties]与[执行器源码][executor-source]。

### 5.2 设计判断

1. Agent 验收节点组合时，应核对数据形状与像素含义，以及模型家族和组件配置。执行验收还需核对列表传播、执行分支和输出副作用。
2. 遇到其他节点时，Agent 应沿第 3.2 节的证据项分析节点源码与消费者。
3. 通用工具可以校验图结构、引用、必填项和声明的类型。图像是否符合任务、遮罩是否表达所需区域、LoRA 是否产生预期效果，需要 Agent 根据实际输出判断。

## 6. 提交、任务查询与取消

### 6.1 提交语义

1. `POST /prompt` 校验 API Prompt，然后把通过校验的输出依赖放入队列。成功响应包含 `prompt_id`、`number` 和 `node_errors`。具体行为见 [`post_prompt`][prompt-route] 与 [`validate_prompt`][validate-prompt]。
2. `number` 参与队列优先级排序，`front` 可以影响优先级。依据是 [`post_prompt`][prompt-route] 和 [`PromptQueue.put/get`][prompt-queue]。
3. 第 1 节所列 ComfyUI 版本允许客户端提供规范 UUID 格式的 `prompt_id`。`post_prompt()` 通过校验后直接入队，路径中没有按该 ID 去重的分支。因此重试提交仍需由调用方确认上次结果。依据是 [`post_prompt`][prompt-route]。
4. HTTP 200 表示后端已接收任务。部分输出通过校验时的处理见第 5.1 节第 9 项；任务完成验收见第 6.4 节第 3 项。

### 6.2 状态与输出查询

1. `GET /prompt` 返回 `exec_info.queue_remaining`。该值包含待执行与正在执行任务，见 [`get_queue_info`][queue-info]。
2. `GET /queue` 返回 `queue_running` 和 `queue_pending`。接口按队列条目返回任务，见[路由源码][state-routes]。
3. `GET /history/{prompt_id}` 返回已写入历史的任务。历史包含 Prompt、输出和执行状态。没有对应记录时返回空对象。历史保存在 `PromptQueue` 内存中，并按容量淘汰。源码见 [`task_done/get_history`][prompt-queue]。
4. `GET /api/jobs` 将 queue 与 history 转换为统一任务视图。接口支持状态、Workflow ID、排序和分页。`GET /api/jobs/{job_id}` 返回单项详情，未知任务返回 404。依据是[路由源码][jobs-routes]与 [`get_all_jobs/get_job`][jobs-source]。
5. 第 1 节所列 ComfyUI 版本的任务状态包括 `pending`、`in_progress`、`completed`、`failed` 和 `cancelled`。历史中的中断事件参与 `cancelled` 判定。完成任务详情可包含输出、执行状态和 Workflow 请求数据。源码见 [`JobStatus/normalize_history_item`][jobs-source]。
6. WebSocket 提供执行开始、节点进度、缓存、错误和中断事件。主执行循环写入历史后，还会发送 `executing` 且 `node = null`。事件说明见[官方消息文档][ws-messages]，写入顺序见 [`main.py`][worker-source]。

### 6.3 取消语义

1. `POST /queue` 的 `delete` 按 ID 删除待执行任务；`clear` 清空待执行队列。删除逻辑不会写入历史。因此删除成功后，对应任务可能同时从 queue、history 和 jobs 中消失。依据是 [`post_queue`][cancel-routes]与 [`delete_queue_item`][prompt-queue]。
2. `POST /interrupt` 接受可选 `prompt_id`。提供 ID 时，路由先读取正在执行任务，再决定是否调用中断；省略 ID 时调用全局中断。第 1 节所列 ComfyUI 源码见 [`post_interrupt`][cancel-routes]。
3. `POST /api/jobs/{job_id}/cancel` 按任务状态取消。待执行任务从队列删除；正在执行任务经 `interrupt_if_running(prompt_id)` 发出中断。已结束或未知任务返回 `cancelled: false`。源码见[取消路由][jobs-cancel]与 [`cancel_job`][jobs-source]。
4. `POST /api/jobs/cancel` 接受 `job_ids` 数组。接口先校验数组中的 UUID，再逐项尝试取消。只要有 1 项触发取消，响应就返回 `cancelled: true`。源码见[批量取消路由][jobs-cancel]。
5. `cancelled: true` 表示本次取消动作已触发。执行中的任务通过中断标记结束，后续状态需继续查询。中断源码见 [`interrupt_if_running`][prompt-queue]与 [`throw_exception_if_processing_interrupted`][interrupt-source]。
6. `POST /history` 可以删除历史记录。该动作与取消执行分别由不同函数处理，见[路由源码][cancel-routes]。

### 6.4 设计判断与运行验证要求

1. 工具应按目标实例版本选择任务接口。第 1 节所列 ComfyUI 版本包含 jobs 与按 ID 取消接口；实例验收应核对版本与实际路由。
2. 调用方应保存每次提交的 `prompt_id`、实际 Prompt、提交时间，以及取消请求和响应。待执行任务从查询接口消失后，调用方通过这些记录追溯取消过程。
3. 任务完成验收应读取目标输出和错误。图像任务还需读取实际文件并判断画面结果。
4. 持续调优需要区分首次加载、缓存命中、采样和输出保存。工具记录参数与时间；Agent 根据输出决定下一轮修改。

## 7. 模型与 LoRA 兼容性证据

### 7.1 已核对事实

1. `/models/{folder}` 和加载器的候选值来自模型目录文件列表，见[模型发现源码][server-discovery]。`/view_metadata/{folder_name}` 可以读取 safetensors 的 `__metadata__`，见 [`server.py`][model-routes]。
2. 原生 `LoraLoader.load_lora()` 读取 LoRA，再调用 `load_lora_for_models()`。该函数根据目标模型生成键映射，并将补丁加到克隆模型。未应用的键会产生日志。源码见 [`LoraLoader`][native-lora]、[`load_lora_for_models`][lora-apply]和 [`load_lora`][lora-keys]。
3. MOSS 原生适配包含模型识别、采样设置和 LoRA 键映射。第 1 节所列 ComfyUI 版本的映射为融合 QKV 权重建立独立 q、k、v 投影的别名。源码见 [`MOSSImage`][moss-config]与 [`model_lora_keys_unet`][moss-lora]。
4. OpenMOSS 作者文档已区分原生 ComfyUI 与 HF 目录插件。文档说明两条路径使用不同加载节点和时间步设置。原生路径默认 shift 为 5，调整 shift 使用 `ModelSamplingAuraFlow`。依据是[作者 ComfyUI 文档][moss-readme]及[原生模型配置][moss-config]。
5. 作者文档仅对模型键匹配的 LoRA 声明内置加载器可用。模型组件与官方工作流见 [Comfy-Org/MOSS-Image][moss-model-card]。

### 7.2 设计判断与运行验证要求

1. 兼容性证据应从模型作者的模型卡、训练基座、组件要求和示例开始。随后核对目标 ComfyUI 版本的加载源码、键映射和张量形状。
2. Agent 应结合加载日志与实际输出，验证模型和 LoRA 的兼容性。
3. 每个实际 LoRA 的训练基座、键格式、精度和推荐参数需要单独取证。实例取证与组合结果见实施计划第 3 节。
4. 多 LoRA 调优应先得到基线，再分别启用每个 LoRA，最后组合。固定 Seed 与其他参数有助于比较变化。每轮应保存实际 Prompt 与输出图像。

## 8. 多 LoRA 的两种组合方式

### 8.1 原生 Model-only 串联

1. `LoraLoaderModelOnly` 接收 `model`、`lora_name` 和 `strength_model`，只返回 `MODEL`。源码见 [`LoraLoaderModelOnly`][native-lora]。
2. 多个加载器可以通过 `MODEL` 输出依次连接。最终输出送入采样链，文本编码器沿原有分支使用。官方串联方式见[多 LoRA 教程][multiple-loras]；Model-only 的接口由[源码][native-lora]确认。
3. 设计判断：需要仅修改扩散模型时，Model-only 串联能直接表达每个 LoRA 的顺序和权重。具体模型仍按第 7 节取证。

### 8.2 rgthree Power Lora Loader

1. `RgthreePowerLoraLoader.INPUT_TYPES()` 公开可选 `model` 与 `clip`。`FlexibleOptionalInputType` 接受额外输入名。额外输入使用 `lora_*` 对象表示 LoRA 项，后端按输入顺序加载。依据是[后端节点源码][power-lora-python]与[动态输入类型源码][rgthree-flexible]。
2. 启用项需要 `on`、`lora` 和 `strength`。`strength` 控制模型权重；有 `strengthTwo` 时，`strengthTwo` 控制 CLIP 权重。没有 CLIP 输入时，后端将 CLIP 权重设为 0。源码见 [`load_loras()`][power-lora-python]。
3. 前端使用 `lora_N` 动态控件，并从 UI Workflow 的 `widgets_values` 恢复 LoRA 行及其顺序。创建与恢复入口见 [`addNewLoraWidget()` 和 `configure()`][power-lora-ui]。
4. 前端还创建分隔项、标题控件和添加按钮。标题值是 `{type: "PowerLoraLoaderHeaderWidget"}`。这些控件与 LoRA 行共同参与 UI Workflow 的控件保存。来源见 [`addNonLoraWidgets()` 与标题控件][power-lora-ui]。
5. 实例验收应核对完整导出数组中辅助控件的值与位置，控件定义见第 8.2 节第 4 项。

6. API 导出调用行控件的 `serializeValue()`。单强度显示模式会删除 `strengthTwo`；双强度模式会写入数值。该行为见[作者序列化源码][power-lora-serialize]。因此，单强度模式的 API 输入通常是 `lora_N: {on, lora, strength}`。
7. 第 1 节所列前端版本的 UI 保存读取 `widget.value`，并生成 `widgets_values` 与 `widgets_values_named`。UI 保存通过 `widget.serialize` 决定是否纳入控件。API 导出通过 `widget.options.serialize` 决定是否纳入输入，并调用 `serializeValue()`。区别见 [`LGraphNode.serialiseWidgetValues`][widget-save]与 [`graphToPrompt`][graph-to-prompt]。
8. 作者扩展支持从 API JSON 恢复 LoRA 行，入口见 [`configureFromApiJson()`][power-lora-ui]。
9. 设计判断：rgthree 的动态 LoRA 行需要同时读取 Python 和前端源码。通用 Skill 应复用这套取证方法，判断其他节点包的动态输入和控件。

## 9. 运行证据清单

1. 目标实例的 ComfyUI、前端和节点包版本，以及实际可用的路由。
2. 第 4.3 节规定的 UI Workflow 与 API Prompt 往返验证记录。
3. 目标模型、文本编码器、VAE 和 LoRA 的作者来源、加载日志与基线输出。
4. 至少 1 组跨尺寸处理、1 组列表或 Lazy 分支、1 组动态控件或子图的实际组合结果。案例应按所选任务选取节点。
5. 待执行取消、执行中取消、完成后重复取消与未知任务查询的实际结果。
6. 调优前后实际参数、缓存事件、耗时、输出文件和图像观察结果。

[backend-tree]: https://github.com/Comfy-Org/ComfyUI/tree/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c
[frontend-tree]: https://github.com/Comfy-Org/ComfyUI_frontend/tree/9725d281725f7040924419ac1e700bd3d0e2696c
[rgthree-tree]: https://github.com/rgthree/rgthree-comfy/tree/d7297b42f0fa78bec1c0411478f887423c249502
[rgthree-target]: https://github.com/rgthree/rgthree-comfy/tree/6b76ee6f2c5a007710b5a16f97c94330d6ecc871
[moss-tree]: https://github.com/OpenMOSS/MOSS-Image/tree/6f9aabb9db61576838287a18b046383b5402fe26
[server-info]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L840-L908
[backend-nodes]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/nodes.py
[backend-extras]: https://github.com/Comfy-Org/ComfyUI/tree/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/comfy_extras
[node-properties]: https://docs.comfy.org/custom-nodes/backend/server_overview
[node-help]: https://docs.comfy.org/custom-nodes/help_page
[workflow-templates]: https://docs.comfy.org/custom-nodes/workflow_templates
[registry]: https://docs.comfy.org/registry/overview
[server-discovery]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L406-L432
[js-hooks]: https://docs.comfy.org/custom-nodes/js/javascript_hooks
[workflow-schema]: https://github.com/Comfy-Org/ComfyUI_frontend/blob/9725d281725f7040924419ac1e700bd3d0e2696c/src/platform/workflow/validation/schemas/workflowSchema.ts
[api-schema]: https://github.com/Comfy-Org/ComfyUI_frontend/blob/9725d281725f7040924419ac1e700bd3d0e2696c/src/platform/workflow/validation/schemas/workflowSchema.ts#L750-L771
[comfy-objects]: https://docs.comfy.org/custom-nodes/js/javascript_objects_and_hijacking
[graph-to-prompt]: https://github.com/Comfy-Org/ComfyUI_frontend/blob/9725d281725f7040924419ac1e700bd3d0e2696c/src/utils/executionUtil.ts#L59-L207
[queue-client]: https://github.com/Comfy-Org/ComfyUI_frontend/blob/9725d281725f7040924419ac1e700bd3d0e2696c/src/scripts/api.ts#L1276-L1313
[workflow-export]: https://github.com/Comfy-Org/ComfyUI_frontend/blob/9725d281725f7040924419ac1e700bd3d0e2696c/src/platform/workflow/core/services/workflowService.ts#L247-L263
[api-import]: https://github.com/Comfy-Org/ComfyUI_frontend/blob/9725d281725f7040924419ac1e700bd3d0e2696c/src/scripts/app.ts#L2403-L2616
[subgraph-dev]: https://docs.comfy.org/custom-nodes/js/subgraphs
[subgraph-user]: https://docs.comfy.org/interface/features/subgraph
[reroute-source]: https://github.com/Comfy-Org/ComfyUI_frontend/blob/9725d281725f7040924419ac1e700bd3d0e2696c/src/extensions/core/rerouteNode.ts#L23-L39
[resolve-output]: https://github.com/Comfy-Org/ComfyUI_frontend/blob/9725d281725f7040924419ac1e700bd3d0e2696c/src/lib/litegraph/src/subgraph/ExecutableNodeDTO.ts#L264-L343
[dynamic-inputs]: https://github.com/Comfy-Org/ComfyUI_frontend/blob/9725d281725f7040924419ac1e700bd3d0e2696c/src/core/graph/widgets/dynamicWidgets.ts
[subgraph-limitations]: https://github.com/Comfy-Org/ComfyUI_frontend/blob/9725d281725f7040924419ac1e700bd3d0e2696c/src/core/graph/subgraph-dynamic-input-limitations.md
[images-masks]: https://docs.comfy.org/custom-nodes/backend/images_and_masks
[load-image]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/nodes.py#L1747-L1821
[vae-inpaint]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/nodes.py#L417-L455
[latent-formats]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/comfy/latent_formats.py
[empty-latent]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/nodes.py#L1255-L1275
[clip-encode]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/nodes.py#L58-L79
[data-lists]: https://docs.comfy.org/custom-nodes/backend/lists
[rebatch-source]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/comfy_extras/nodes_rebatch.py#L110-L149
[lazy-evaluation]: https://docs.comfy.org/custom-nodes/backend/lazy_evaluation
[switch-source]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/comfy_extras/nodes_logic.py#L86-L116
[expansion]: https://docs.comfy.org/custom-nodes/backend/expansion
[graph-builder]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/comfy_execution/graph_utils.py
[save-image]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/nodes.py#L1669-L1745
[validate-prompt]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/execution.py#L1147-L1301
[executor-source]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/execution.py#L684-L835
[prompt-route]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L1161-L1240
[prompt-queue]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/execution.py#L1303-L1451
[queue-info]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L1379-L1384
[state-routes]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L1134-L1159
[jobs-routes]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L910-L1031
[jobs-source]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/comfy_execution/jobs.py
[ws-messages]: https://docs.comfy.org/development/comfyui-server/comms_messages
[worker-source]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/main.py#L370-L393
[cancel-routes]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L1242-L1310
[jobs-cancel]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L1033-L1132
[interrupt-source]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/comfy/model_management.py#L2198-L2220
[model-routes]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/server.py#L748-L769
[native-lora]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/nodes.py#L714-L774
[lora-apply]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/comfy/sd.py#L108-L140
[lora-keys]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/comfy/lora.py#L20-L100
[moss-config]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/comfy/supported_models.py#L2037-L2068
[moss-lora]: https://github.com/Comfy-Org/ComfyUI/blob/b1a247c9cf9dbfda4b2c0a0c1d50950667eeaa0c/comfy/lora.py#L355-L362
[moss-readme]: https://github.com/OpenMOSS/MOSS-Image/blob/6f9aabb9db61576838287a18b046383b5402fe26/comfyui/README.md
[moss-model-card]: https://huggingface.co/Comfy-Org/MOSS-Image/blob/main/README.md
[multiple-loras]: https://docs.comfy.org/tutorials/basic/multiple-loras
[power-lora-python]: https://github.com/rgthree/rgthree-comfy/blob/6b76ee6f2c5a007710b5a16f97c94330d6ecc871/py/power_lora_loader.py#L15-L58
[rgthree-flexible]: https://github.com/rgthree/rgthree-comfy/blob/6b76ee6f2c5a007710b5a16f97c94330d6ecc871/py/utils.py#L8-L59
[power-lora-ui]: https://github.com/rgthree/rgthree-comfy/blob/6b76ee6f2c5a007710b5a16f97c94330d6ecc871/src_web/comfyui/power_lora_loader.ts
[power-lora-serialize]: https://github.com/rgthree/rgthree-comfy/blob/6b76ee6f2c5a007710b5a16f97c94330d6ecc871/src_web/comfyui/power_lora_loader.ts#L762-L775
[widget-save]: https://github.com/Comfy-Org/ComfyUI_frontend/blob/9725d281725f7040924419ac1e700bd3d0e2696c/src/lib/litegraph/src/LGraphNode.ts#L213-L238
