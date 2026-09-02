# Prompt Builder 与 ComfyUI 生图参数合同实施方案

## 1. 术语与实施对象

- **Prompt Builder**：`anima-prompt-builder`、`wai-sdxl-prompt-builder`、`krea2-anime-prompt-builder` 三个项目 Skill。
- **生成 Skill**：`.agents/skills/comfyui-generate/`。
- **测试档**：用户要求测试 Prompt 方向、比较 Prompt 方案、根据生成结果继续改写或迭代 Prompt 方案、快速预览或批量筛选时使用的小图尺寸。同一条 Prompt 迭代链在用户明确结束测试前持续使用测试档。
- **正式档**：用户明确要求结束 Prompt 测试并进入正式成图、交付图、海报或高质量结果时使用的大图尺寸。当前请求没有测试、比较或迭代意图，并且没有连接尚未结束的 Prompt 测试链时，Prompt Builder 默认选择正式档。
- **原生负向模式**：目标模型和 Workflow 都提供独立 negative conditioning；生成 Skill 把文本写入 `parameters.negative_prompt`。
- **正向规避模式**：目标模型没有独立 negative conditioning；Prompt Builder 把待规避缺陷改写为正向可见约束，生成 Skill不创建 `parameters.negative_prompt`。
- **精确尺寸模板**：Workflow 使用 `width` 与 `height` 接收像素尺寸。
- **Selector 模板**：Workflow 使用 `aspect_ratio` 与 `megapixels` 计算像素尺寸。
- **目标尺寸**：Prompt Builder 只根据画面构图和生成目的设计的 `aspect_ratio`、`width`、`height` 与 `megapixels`；目标尺寸不表示任何已选 Workflow 模板一定能够原值接收。
- **实际尺寸参数**：生成 Skill检查已选 Workflow 和目标 ComfyUI 实例以后，写入 Generation Request 的一种尺寸表示。
- **计划执行者**：用户批准本方案后，在独立 worktree 修改第 4 章授权文件并完成第 6 至 8 章验证的 Agent。
- **Skill 执行者**：用户在 Harness Session 中调用对应 Prompt Builder 或生成 Skill 时，按照 `SKILL.md` 完成任务的 Agent。
- **managed CLI**：Harness 前台 shell Tool Call 通过环境变量 `DSH_HARNESS_COMFYUI_CLI` 提供的项目命令入口。
- **Generation Request**：`generation submit --stdin` 接收的一个 JSON 请求对象。
- **Generation Run**：Host 接受一个 Generation Request 后创建并保存的异步运行记录。
- **Host**：接收 managed CLI 请求、读取 Catalog、编译 Workflow 并持久化 Generation Run 的本项目运行时。
- **Source**：向 Catalog 查询提供模板、生成模型和 LoRA 记录，并向 Host 生成链路提供当前 Workflow TemplateBundle 的数据源服务。
- **独立语义 Reviewer**：不修改文件，阅读 Skill、CLI 参考和方案 Markdown 后判断文字语义与需求覆盖的 Reviewer。
- **独立视觉 Reviewer**：不修改图片或 Prompt，读取真实生成图片后判断主体结构、手脚完整性、多人分离、清晰度和 Prompt 遵循情况的 Reviewer。

本方案中的三个 Prompt Builder 不包含 `character-portrait-prompt-designer`。该 Skill 不绑定第三种生成模型，不属于用户本次要求的 ANIMA、WAI、Krea2 三模型范围。

## 2. 必须实现的目标

### 2.1 Prompt Builder 的共同结果

每个 Prompt Builder 必须在完成正向 Prompt 后，同时给出以下本轮生成决定：

1. `model_route`：当前 Builder 对应的具体模型路线。
2. `positive_prompt`：可以直接交给目标模型的最终正向 Prompt。
3. `negative_mode`：`native_negative` 或 `positive_rewrite`。
4. `negative_prompt`：原生负向模式下的短负向 Prompt；正向规避模式使用 `null`。
5. `positive_avoidance`：正向规避模式下已经并入 `positive_prompt` 的可见质量约束；原生负向模式使用 `null`。
6. `generation_purpose`：`test` 或 `final`。
7. `aspect_ratio`：始终必填的规范化非空字符串，格式为 `<约分后的正整数宽>:<约分后的正整数高>`。
8. `width` 与 `height`：始终必填的正整数，表示画面目标像素尺寸，不表示 Builder 已经选择精确尺寸模板。
9. `megapixels`：始终必填的正有限数值，表示同一画面的名义目标百万像素值，不表示 Builder 已经选择 Selector 模板。

三个 Prompt Builder 必须按以下规则设置 `generation_purpose`：

1. 用户要求首次测试 Prompt 方向、构造用于比较的某一个 Prompt 方案、根据上一轮图片或反馈继续调整 Prompt、继续测试修改后的 Prompt、快速预览或批量筛选时，Builder 使用 `test`。
2. 当前请求明确引用上一轮 Prompt、生成图片、Generation Run、用户反馈或修改版，或者明确要求继续调整同一画面与同一主体时，当前请求连接到同一 Prompt 测试链。连接后的后续 Builder 结果保持 `test`，不得因为这是后续轮次而自动切换为 `final`。
3. 用户明确表示 Prompt 方案已经确定，并要求正式生成、最终成图、交付图、海报或高质量结果时，Builder 使用 `final`。
4. 当前请求是没有引用旧 Prompt、旧图片、旧 Run、旧反馈或旧修改版的新画面任务时，该任务不连接可见上下文中的旧测试链；即使旧测试链仍然可见，Builder 也按新任务处理。新任务没有测试、比较或迭代表述时使用 `final`。
5. 当前请求是否连接旧测试链无法从具体引用、画面主体和修改对象确定时，Skill 执行者必须请用户确认当前请求是继续测试还是新的正式任务。
6. 用户在同一请求中同时要求继续测试和正式交付时，每个测试结果与正式结果必须成为独立 Builder 执行。用户没有划分各结果的画面要求和生成目的时，Skill 执行者必须要求用户划分任务，不得为同一个结果同时选择两种清晰度。

一次 Prompt Builder 执行只构造一个结构化结果、一个 `positive_prompt` 和一个 `generation_purpose`，不得返回候选数组。用户要求比较多个 Prompt 方案时，每个已明确划分的方案分别执行一次 Builder，并分别输出一个 `generation_purpose: "test"` 的结构化结果；用户没有划分方案边界时，Skill 执行者必须要求用户先划分各方案。调用方必须分别把这些结果交给 `comfyui-generate`，不能把多个方案合并进一个 Prompt Builder 结果。

Prompt Builder 的结果不得包含 `seed_mode`、`seed` 或其他 Seed 决定。Prompt Builder 即使为了复用历史 Prompt 而查询 `run_id`，也不读取历史 Seed 作为 Builder 结果，不调用随机 Seed 命令，不校验固定 Seed 请求。Seed 是第 2.2 节定义的生成 Skill 独占职责。

三个 Prompt Builder 各自在自己的 `references/generation-profiles.json` 保存本模型的画幅、测试档、正式档和负向 Prompt 基础项。每个 JSON 文件只保存该模型的常量；`generation-output-contract.md` 定义选择这些常量的语义流程；`SKILL.md` 只定义读取参考文件的时机和调用阶段，不复制选择规则或 JSON 数值表。

每个 Prompt Builder 结果必须同时包含非空 `aspect_ratio`、`width`、`height` 和 `megapixels`。这四个字段描述同一画幅和同一清晰度档位的模板无关目标；Builder 不读取 Workflow 模板、不调用模板参数检查命令，也不根据模板能力选择或调整结果。`megapixels` 是名义目标值，不要求等于 `width × height ÷ 1,000,000` 的精确结果。每个模型的 `generation-profiles.json` 必须在同一条 profile 记录中保存四个字段，避免跨记录组合。

Prompt Builder 按以下规则处理用户尺寸覆盖：

1. 用户没有覆盖四个尺寸字段时，Prompt Builder 根据画面和 `generation_purpose` 选择一条完整 profile。
2. 用户只覆盖 `aspect_ratio` 时，Prompt Builder 先规范化该比例，再查找相同比例的 profile，并按 `generation_purpose` 回填该 profile 的 `width`、`height` 和 `megapixels`；没有相同比例的 profile 时，Skill 执行者要求用户提供完整 `width` 与 `height`。
3. 用户只提供 `width` 或只提供 `height` 时，Skill 执行者要求用户补齐另一个精确尺寸字段。用户同时提供 `width` 与 `height`，且没有覆盖 Selector 两字段时，Prompt Builder 使用两个正整数约分得到 `aspect_ratio`，并把 `width × height ÷ 1,000,000` 的结果写入 `megapixels`。
4. 用户只提供 `megapixels` 时，Skill 执行者要求用户补充 `aspect_ratio`。用户同时提供 `aspect_ratio` 与 `megapixels`，且没有覆盖精确尺寸两字段时，Prompt Builder 按这两个值精确匹配同一模型的一条 profile 和清晰度档位，并回填该档位的 `width` 与 `height`；没有匹配记录时，Skill 执行者要求用户提供完整 `width` 与 `height`。
5. 用户同时提供两组完整表示时，Prompt Builder 检查约分后的 `width:height` 等于规范化的 `aspect_ratio`，并检查 `abs(width × height ÷ 1,000,000 - megapixels) ÷ megapixels <= 0.05`。任一检查失败时，Skill 执行者要求用户选择一组完整表示。
6. 允许的覆盖字段集合只有单独 `aspect_ratio`、完整 `width + height`、完整 `aspect_ratio + megapixels` 和全部四个字段。其他部分组合由 Skill 执行者指出缺少的具体字段，并在用户补齐或选择一组允许组合前停止构造结果。

字段进入结果后必须符合本节定义的类型；Skill 执行者不得把字符串尺寸原样写入整数属性。

Prompt Builder 必须根据主体、动作和镜头选择画幅：全身立绘优先竖幅，双人横向互动优先横幅，角色设定或中心构图可以使用方形。用户显式指定宽高比、尺寸或生成目的时，Prompt Builder 按上一段的转换与冲突规则处理用户值。

### 2.2 Seed 合同

`comfyui-generate` 独占 Seed 的解析、查询、随机化、校验、提交和失败重试责任。三个 Prompt Builder 不参与本节流程。

`comfyui-generate` 先展开每张图片，再分别确定显式整数、历史复用或默认随机 Seed。用户为某张图片显式提供整数 Seed 时，只有该图片使用该整数；用户没有限定图片或逻辑结果时，本次所有图片使用该整数。用户只说“固定 Seed”但没有提供整数或 `run_id` 时，`comfyui-generate` 的 Skill 执行者必须要求用户为该请求作用域内的图片提供具体整数或 `run_id`，不得先随机再固定。

用户在生成请求中显式要求复用历史 Run 的 Seed 时，`comfyui-generate` 必须在建立 Generation Request 前调用：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin
```

标准输入使用 `{"run_ids":["<用户提供的 run_id>"]}`。`comfyui-generate` 只使用可用结果项的 `arguments.parameters.seed` 整数。即使 Prompt Builder 此前为了复用 Prompt 查询过同一个 `run_id`，生成 Skill仍必须按自己的 CLI 合同取得 Seed，不从 Prompt Builder 结果接收 Seed。历史 Run 没有保存整数 Seed 时，`comfyui-generate` 必须报告“该 Run 没有可直接复用的已保存 Seed”，不得从文件名、Run ID 或 Actual Workflow 的其他节点猜测 Seed。

managed CLI 新增只读命令 `generation random-seeds --stdin`。输入对象只包含 `count`，允许值为 1 至 20 的整数；输出对象只包含 `seeds`，数组长度等于 `count`，同一次输出中的每个 Seed 都是互不相同的 0 至 2,147,483,647 整数。该命令使用普通伪随机数，不新增依赖，不创建 Generation Run。

一次 `comfyui-generate` 调用允许生成 1 至 20 张图片；本节中的 N 始终满足 `1 <= N <= 20`。用户一次要求超过 20 张时，生成 Skill必须在创建任何 Run 前报告单次上限并要求用户拆分任务，不得自行建立多个无法保证跨调用 Seed 唯一性的批次。

`comfyui-generate` 为 M 张没有显式整数或历史复用要求的图片先取得 M 个具体随机 Seed，再为全部 N 张图片建立 N 个 `batch_size: 1` 的 Generation Request。每项请求只提交一次，每项请求把自己的具体 Seed 写入 `parameters.seed`。某一项提交失败后，生成 Skill的 Skill 执行者重试同一项请求时必须复用该项已经取得的 Seed；用户要求新的随机尝试时才取得新 Seed。

### 2.3 模板实际参数检查与尺寸适配合同

Prompt Builder 不参与本节流程。`comfyui-generate` 在构造 Generation Request 前调用新的只读 managed CLI 命令：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation inspect-template-parameters --stdin
```

标准输入只包含当前消息选择的非空 `template_id` 与非空 `instance_id`，两个字段都是必填字符串；该命令不使用默认实例。Host 使用当前 Source `0.86.1` TemplateBundle 的 `workflow_json` 和该实例实时 `/object_info`，复用 Workflow compiler 的参数目标解析与数值/枚举合同解析逻辑，返回当前模板在当前实例上实际可接收的标准运行参数。非尺寸参数项包含 `parameter_id`、标准化 `kind`、`value_type`、当前值，以及实际存在的 `minimum`、`maximum` 或 `allowed_values`。

命令输出必须另含结构化 `size_candidates` 数组。每项候选包含唯一 `candidate_id` 和以下一种明确结构，生成 Skill不得自行按参数名、节点后缀或自由文本配对尺寸参数：

- `representation: "width_height"`：包含已配对的 `width` 与 `height` 参数对象；每个对象包含自己的 `parameter_id`、整数合同和当前值。
- `representation: "aspect_ratio_megapixels"`：包含已配对的 `aspect_ratio` 与 `megapixels` 参数对象；每个对象包含自己的 `parameter_id`、枚举或数值合同和当前值。
- `representation: "resolution_preset"`：包含 preset 的 `parameter_id`、当前值、`mapped_options` 与 `unmapped_values`。每个 `mapped_options` 项包含原始 `value` 及由 compiler 确定性解析得到的正整数 `width` 与 `height`；`unmapped_values` 只供报告，不能自动选择。

Workflow 中存在多组带节点后缀的尺寸参数时，compiler 必须依据实际可执行管线生成独立候选并返回每组的精确 `parameter_id`。compiler 无法唯一确定配对或参数目标时，命令返回与提交路径一致的 `GENERATION_PARAMETER_TARGET_AMBIGUOUS` 或具体合同错误，不返回供 Skill猜测的半成品候选。该命令不创建 Generation Run，不读取 `config/verification/comfyui-workflow-parameter-support.json`，不读取旧 Source `parameters_json`，也不要求模板 ID 预先登记在任何参数能力白名单中。

`ComfyWorkflowCompiler` 是模板运行参数解析的深模块。现有 `WorkflowCompiler` interface 继续位于 `source-preparer.ts` 的 compiler seam，并只增加一个 `inspectRuntimeParameters(input)` 方法；原有 `compile(input)` 方法保持。`inspectRuntimeParameters` 的输入只包含 `instanceId`、`workflow`、`connection` 和可选 `signal`，输出一个 `WorkflowRuntimeParameterInspection`；`compile` 继续接收包含运行参数、模型和 LoRA 的 `WorkflowCompilerInput`。

`ComfyWorkflowCompiler` 的 implementation 必须让两个 interface 方法共享同一个私有 runtime-parameter plan。该私有 plan 负责参数 target 发现、连接关系、别名、节点后缀、动态枚举、数值合同、尺寸参数配对、preset 映射和错误生成，并使用同一个实例 `/object_info` 缓存。`inspectRuntimeParameters` 把私有 plan 投影为本节定义的非尺寸参数与 `size_candidates`；`compile` 用同一个私有 plan 校验并应用 `runtimeParameters`，再继续执行随机 Seed 物化、模型替换、LoRA 应用和 Official API Workflow 编译。私有 plan、`ParameterTarget`、`RuntimeParameterContract`、`NodeDefinitionsSnapshot` 和配对算法不得导出。

`GenerationPreparationAdapter` 增加 `inspectRuntimeParameters({ templateId, instanceId }, signal?)`，其中 `templateId` 与 `instanceId` 都是必填非空字符串。`SourceGenerationPreparer` 实现该方法：它只从 `GenerationSource` 读取当前模板与显式实例、构造 `ComfyConnection`，然后调用 `WorkflowCompiler.inspectRuntimeParameters`。`GenerationRuntime` 增加公共方法 `inspectTemplateRuntimeParameters(input, signal?)`；该方法的 `input` 只包含必填 `templateId` 与 `instanceId`，返回 `Promise<WorkflowRuntimeParameterInspection>`，并只委托 `GenerationPreparationAdapter.inspectRuntimeParameters`。`RegisterHarnessComfyuiCliRouteOptions.runtime` 的 `Pick<GenerationRuntime, ...>` 增加 `inspectTemplateRuntimeParameters`，CLI route 与 shell CLI 使用同一方法名转交输入和结构化结果。`SourceGenerationPreparer`、Generation runtime、CLI route 和 shell CLI 不解析 Workflow 节点、不读取 `/object_info` 描述、不配对参数，也不重新实现尺寸候选。

当前 Source 能返回模板且当前实例能够解析该 Workflow 时，新增加的模板可以直接接受检查。某个标准参数未出现在 Workflow 中时，`inspectRuntimeParameters` 不返回该参数或依赖该参数的候选；该事实本身不是 compiler 错误，生成 Skill按本节的提交条件判断是否停止。对于私有 plan 已发现的参数目标，目标歧义或非法 `/object_info` 合同必须使 `inspectRuntimeParameters` 与 `compile` 返回相同错误码和相同参数目标语义。调用方把 `inspectRuntimeParameters` 返回的具体 `parameter_id` 与合法值交给 `compile` 时，`compile` 必须命中同一参数 target；只有 `compile` 接收到检查结果未提供的 `parameter_id` 时，`compile` 才返回 `GENERATION_PARAMETER_TARGET_NOT_FOUND`。实例不可用时，两条路径返回相同连接错误。上述检查失败时，生成 Skill不创建 Run。

`comfyui-generate` 按以下规则把 Builder 的模板无关目标尺寸转换为一种实际尺寸参数：

1. 生成 Skill分别为检查结果中存在的完整 `width + height`、完整 `aspect_ratio + megapixels` 和可确定像素尺寸的 `resolution_preset` 建立候选。缺少配对参数的表示不能成为候选。
2. 如果某个候选的实际参数值与 Builder 中对应表示的目标值完全相同，生成 Skill使用该原值候选；多个候选都能原值表达时优先使用 `width + height`，其次使用 `aspect_ratio + megapixels`，最后使用 `resolution_preset`。
3. 对 `width + height` 候选，生成 Skill只允许把 Builder 的 `width` 与 `height` 按同一缩放比例调整到 CLI 返回的整数最小值和最大值范围内。调整后相对宽高比偏差不得超过 5%，相对像素面积偏差不得超过 10%。
4. 对 `aspect_ratio + megapixels` 候选，生成 Skill先使用规范化后完全相同的允许比例；没有完全相同比例时，才选择相对比例偏差最小且不超过 5% 的允许比例。`megapixels` 使用范围内原值，或者选择相对差值最小且不超过 10% 的允许值。
5. 对 `resolution_preset` 候选，只有 CLI 能从实际 preset 合同确定该值对应的正整数 `width` 与 `height` 时，生成 Skill才按同样的 5% 比例偏差和 10% 面积偏差比较；无法确定像素尺寸的 preset 不能由生成 Skill自动猜测。
6. 没有原值候选时，生成 Skill从同时满足 5% 比例偏差和 10% 面积偏差的候选中，先选择比例偏差最小者，再选择面积偏差最小者。生成 Skill必须在提交前向用户说明 Builder 目标尺寸、实际尺寸参数、比例偏差和面积偏差。用户明确要求尺寸不得调整时，生成 Skill只接受原值候选。
7. 没有满足阈值的候选时，生成 Skill报告模板 ID、实例 ID、Builder 目标尺寸和 CLI 返回的实际允许值，并要求用户选择其他模板、接受一个明确列出的实际尺寸或返回 Prompt Builder 重新设计；生成 Skill不得自行进行超过阈值的调整。

本节的目标比例为 `width ÷ height`，目标面积为 `width × height`。精确尺寸与 preset 的实际比例和实际面积分别由实际 `width`、`height` 计算；Selector 的实际比例由规范化 `aspect_ratio` 计算，实际面积为 `megapixels × 1,000,000`。比例偏差公式为 `abs(实际比例 - 目标比例) ÷ 目标比例`，面积偏差公式为 `abs(实际面积 - 目标面积) ÷ 目标面积`。

检查结果必须同时覆盖 `positive_prompt`、`negative_prompt` 和 `seed`。模板缺少 `positive_prompt` 或 `seed` 时，生成 Skill不提交 Run。ANIMA 或 WAI 使用原生负向模式而模板缺少 `negative_prompt` 时，生成 Skill不提交 Run并要求用户选择兼容模板。Krea2 使用正向规避模式时，生成 Skill不得创建 `parameters.negative_prompt`。

### 2.4 三模型负向 Prompt 策略

#### ANIMA

- 当前 `anima-aesthetic-v1.1` 路线使用原生负向模式。
- Aesthetic 路线的基础负向项使用 `worst quality, low quality, artist name, blurry, jpeg artifacts, chromatic aberration`。
- Aesthetic 路线不在正向和负向两侧同时加入 `score_*`。
- Base 或 Turbo 路线只有在生成模型记录明确指向对应版本时，才允许使用官方 Base 的 `score_1, score_2, score_3` 负向项。
- Prompt Builder 只在画面确实包含相应风险时追加人体、手部、足部、多人粘连或文字伪影项。Skill 不保存一条覆盖全部场景的超长人体缺陷列表。

#### WAI-Illustrious-SDXL

- WAI 使用原生负向模式。
- 基础负向项使用 `bad quality, worst quality, worst detail, sketch, censor`。
- Prompt Builder 只针对本轮可见主体追加少量缺陷项，例如手部清晰入镜时追加手指/手部缺陷项，多人接触时追加肢体粘连项。
- Prompt Builder 不自动把 `sensitive`、`nsfw` 或 `explicit` 写入负向 Prompt；只有用户明确要求排除对应画面类型时才加入。
- Prompt Builder 必须控制负向 Prompt 长度，避免质量词和缺陷词重复堆叠。

#### Krea2 Turbo

- Krea2 使用正向规避模式，`negative_prompt` 必须是 `null`。
- Prompt Builder 把“畸形手”“多余肢体”“脚部裁切”“多人粘连”等待规避概念改写为正向可见描述，例如“两只手各有五根清晰分开的手指”“从头顶到鞋底完整入镜”“人物拥有连贯自然的关节连接”“两名人物保持明确间距和独立轮廓”。
- `comfyui-generate` 必须确认这些正向规避描述已经进入最终 `positive_prompt`，并且不得向 Krea2 模板提交不存在的 `negative_prompt`。
- 本方案不安装或引入第三方 Krea2 NegPiP 节点。

### 2.5 Skill 与参考文档的内容边界

三个 Prompt Builder 各自新建 `references/generation-output-contract.md`、`references/generation-output-schema.json` 和 `references/generation-profiles.json`。第 2.1 节结果属性的必填、类型、枚举和允许 `null` 组合必须写入 `generation-output-schema.json`；测试/迭代/正式生成目的、属性语义、尺寸覆盖、冲突处理、第 2.4 节对应模型的负向策略，以及该 Builder deterministic validator 的脚本路径、固定命令、stdin、stdout、退出码、错误修正和重试合同必须写入 `generation-output-contract.md`；画幅、测试档、正式档和负向基础项常量必须写入 `generation-profiles.json`。每个 Builder 的 `generation-output-schema.json` 是该 Skill 运行环境内结果 schema 的唯一结构化来源，`generation-output-contract.md` 是该 Skill 内生成决定语义规则与 validator 调用接口的唯一文字来源，`generation-profiles.json` 是该 Skill 内模型常量的唯一结构化来源。脚本不得把 Markdown 当成结构化 schema 读取。

三个 `generation-output-schema.json` 的共同结果属性、必填数组、类型、枚举和 `null` 组合必须逐字段深度相同。模型专用负向策略不扩展共同 schema；模型差异只由各自 `generation-output-contract.md`、`generation-profiles.json` 和 validator 的跨文件组合检查表达。三个 schema 是三个独立 Skill 运行环境所需的本地副本，运行时不得跨 Skill 引用；仓库合同测试必须解析 JSON 并对共同 schema 做深度相等比较。

三个 Prompt Builder 的 `SKILL.md` 最终只保留以下路由信息。计划执行者必须删除现有 `SKILL.md` 中与下列参考文件重复或冲突的结果字段、生成目的、尺寸、负向策略、validator 命令和模型常量说明，或者把对应段落改写为明确的参考文件读取时机与调用阶段：

1. Skill 执行者完成当前输入、可选历史 Prompt 和模型专用 Prompt 规则读取后，在决定 `generation_purpose`、负向策略和尺寸以前，必须完整读取 `references/generation-output-contract.md`、`references/generation-output-schema.json` 与 `references/generation-profiles.json`。
2. 当前上下文经过压缩而不再完整保留任一文件时，Skill 执行者必须在构造最终结构化结果前重新完整读取缺失文件。
3. Skill 执行者按参考文档构造一个结构化结果后，再按同一 `generation-output-contract.md` 的 validator 调用接口执行该 Skill 的 deterministic validator。`SKILL.md` 不保存脚本路径、命令、stdin、stdout、退出码或重试细节。

Prompt Builder 的 `SKILL.md` 不复制结果字段表、测试链连接规则、尺寸换算公式、画幅矩阵、负向基础项或模型差异说明。deterministic validator 必须读取同一 Skill 的 `generation-output-schema.json` 和 `generation-profiles.json`，不得在脚本中重新硬编码 schema 或模型常量。现有 Prompt 内部格式参考继续只负责 ANIMA 十二槽、WAI 十五位置或 Krea2 单条自然语言 Prompt；这些文件不得成为生成目的、尺寸和负向策略的第二来源。

`comfyui-generate` 新建 `references/prompt-result-contract.md` 与 `references/prompt-result-schema.json`。`prompt-result-schema.json` 是生成 Skill运行环境内 Builder 结果 schema 的唯一结构化来源，并且必须与三个 Builder 的 `generation-output-schema.json` 深度相同。`prompt-result-contract.md` 是生成 Skill如何读取 `positive_prompt`、`negative_mode`、`negative_prompt`、`positive_avoidance`、`generation_purpose`、`aspect_ratio`、`width`、`height` 和 `megapixels`，如何把原生负向或正向规避分支映射为最终 `parameters`，以及如何拒绝缺失或冲突结果的唯一文字来源。生成 Skill不得跨 Skill 读取三个 Builder 的参考文件。

`comfyui-generate` 新建 `references/template-parameter-inspection-cli.md`，作为 `generation inspect-template-parameters --stdin` 的完整 Skill-owned CLI 使用参考文档，也是第 2.3 节当前模板参数结果、结构化尺寸候选、自动调整阈值和检查错误分支的唯一文字来源。该文件必须完整包含 `CLI 的用途与适用任务`、`调用环境与可执行入口`、`命令与调用时机`、`参数与标准输入`、`ID 与运行值的来源`、`输出与完成语义`、`错误、修正与重试`、`副作用与重复调用`、`完整调用示例` 九个章节。该文件必须使用真实命令、真实 `template_id` 与 `instance_id` 输入、真实检查结果属性和真实错误码，并明确该命令只读、不创建 Generation Run、不修改 Workflow、不触发 Official API Workflow 编译。该文件不得要求 Skill 执行者读取仓库 `docs/`、Host 源码或其他 Skill 目录。

`template-parameter-inspection-cli.md` 必须规定默认调用单位：生成 Skill在模板 resolve 与实例目录查询完成后，对本次执行中每一组唯一的非空 `(template_id, instance_id)` 调用一次检查命令；多项 Generation Request 使用同一组 ID 时可以复用本次执行仍完整保留的同一检查结果，任一 ID 改变时必须重新检查。CLI 返回错误后，Skill 执行者只有在按该文件的“错误、修正与重试”章节修正输入或确认实例恢复后才能重试。详细 Seed、历史 Seed、随机 Seed、提交和重试规则只写入 `references/generation-cli.md`。现有 `references/catalog-cli.md` 继续只负责模板、模型、LoRA 和实例目录解析，不承载模板参数能力。

生成 Skill的 `SKILL.md` 只规定以下读取时机：解析 Prompt Builder 结构化结果前完整读取 `references/prompt-result-contract.md` 与 `references/prompt-result-schema.json`；解析当前消息选择的模板、模型、LoRA 或实例目录前完整读取现有 `references/catalog-cli.md`；从模板 resolve 结果取得非空 `template_id` 且从实例目录结果取得非空 `instance_id` 后，在组织第一条模板检查命令或把 Builder 目标尺寸转换为实际参数以前完整读取 `references/template-parameter-inspection-cli.md`；CLI 返回检查错误后，在修正输入或重试以前重新读取该文件的“错误、修正与重试”章节；解析或校验任一 Seed、查询历史 Seed、取得随机 Seed、构造任一 Generation Request 或首次提交前完整读取 `references/generation-cli.md`；任一历史查询、随机 Seed 或提交命令返回错误后，在修改输入或再次调用以前重新读取 `generation-cli.md` 的“错误、修正与重试”章节。上下文压缩后不再完整保留对应参考内容时，Skill 执行者必须在下一次结果解析、目录解析、模板检查命令、检查结果消费、尺寸适配、Seed 处理、请求构造或 CLI 调用前重新完整读取相应文件。计划执行者必须删除生成 Skill现有 `SKILL.md` 中与这些参考文件重复或冲突的 Builder 结果字段、参数映射、Seed、模板检查、尺寸适配、提交和错误分支说明，或者把对应段落改写为准确的读取时机与执行阶段。生成 Skill的 `SKILL.md` 不复制第 2.1 至 2.3 节的详细字段、命令、映射、参数、阈值、错误分支或数值限制。

## 3. 画幅与清晰度候选矩阵

### 3.1 ANIMA 候选

ANIMA 的常规测试档约为 0.25 MP，常规正式档约为 1 MP。1:1、7:9 和 9:7 来自官方示例。9:16 与 16:9 是项目候选；为了让较短边不低于 ANIMA 官方约 512 像素的支持范围，这两个长画幅使用约 0.59 MP 测试档和约 1.33 MP 正式档，必须逐项通过真实模型验收后才能保留。

| 宽高比 | 适用构图 | 测试档 `width×height` | 正式档 `width×height` | `megapixels` 测试/正式 |
| --- | --- | --- | --- | --- |
| 1:1 | 中心角色、头像设定、对称构图 | 512×512 | 1024×1024 | 0.25 / 1.0 |
| 7:9 | 单人立绘、膝上或全身角色 | 448×576 | 896×1152 | 0.25 / 1.0 |
| 9:7 | 双人互动、横向环境 | 576×448 | 1152×896 | 0.25 / 1.0 |
| 9:16 | 竖屏角色、全身海报、手机内容 | 576×1024 | 864×1536 | 0.59 / 1.33 |
| 16:9 | 横屏叙事、多人互动、宽幅环境 | 1024×576 | 1536×864 | 0.59 / 1.33 |

### 3.2 WAI-Illustrious-SDXL 候选

WAI 的常规测试档约为 1 MP，常规正式档使用维护者 Space 的约 2.2–2.4 MP 预设。9:16 与 16:9 是精确标准长画幅项目候选，使用约 1.33 MP 测试档和约 2.36 MP 正式档，必须逐项通过真实模型验收后才能保留。

| 宽高比 | 适用构图 | 测试档 `width×height` | 正式档 `width×height` | `megapixels` 测试/正式 |
| --- | --- | --- | --- | --- |
| 1:1 | 中心角色、角色设定 | 1024×1024 | 1536×1536 | 1.0 / 2.25 |
| 7:9 | 角色立绘、常规竖图 | 896×1152 | 1344×1728 | 1.0 / 2.25 |
| 9:7 | 双人互动、常规横图 | 1152×896 | 1728×1344 | 1.0 / 2.25 |
| 13:19 | 修长全身、默认竖版 | 832×1216 | 1248×1824 | 1.0 / 2.25 |
| 19:13 | 环境叙事、宽幅人物 | 1216×832 | 1824×1248 | 1.0 / 2.25 |
| 4:7 | 长竖海报、全身角色 | 768×1344 | 1152×2016 | 1.0 / 2.25 |
| 7:4 | 横版海报、多人场景 | 1344×768 | 2016×1152 | 1.0 / 2.25 |
| 9:16 | 标准竖屏海报、手机内容 | 864×1536 | 1152×2048 | 1.33 / 2.36 |
| 16:9 | 标准横屏画面、视频封面 | 1536×864 | 2048×1152 | 1.33 / 2.36 |

### 3.3 Krea2 Turbo 候选

Krea2 的常规测试档约为 1 MP，常规正式档约为 2 MP。704×1408 是项目已记录的小图配方；9:16 与 16:9 使用约 1.33 MP 测试档和约 2.36 MP 正式档。其余候选是根据 Krea2 官方 1K–2K 范围和 16 像素对齐要求形成的项目候选，必须逐项通过 Krea2 真实 Workflow 验收后才能保留。

| 宽高比 | 适用构图 | 测试档 `width×height` | 正式档 `width×height` | `megapixels` 测试/正式 |
| --- | --- | --- | --- | --- |
| 1:1 | 中心角色、设定图 | 1024×1024 | 1440×1440 | 1.0 / 2.0 |
| 1:2 | 舞蹈迁移源图、鞋履完整全身 | 704×1408 | 1024×2048 | 1.0 / 2.0 |
| 2:3 | 常规全身立绘 | 832×1248 | 1152×1728 | 1.0 / 2.0 |
| 3:2 | 横向人物与场景 | 1248×832 | 1728×1152 | 1.0 / 2.0 |
| 9:16 | 标准竖屏角色、手机内容 | 864×1536 | 1152×2048 | 1.33 / 2.36 |
| 16:9 | 标准横屏叙事、宽幅场景 | 1536×864 | 2048×1152 | 1.33 / 2.36 |

上述表格只定义 Prompt Builder 根据画面和生成目的选择的模板无关目标值。`comfyui-generate` 必须按第 2.3 节检查已选 Workflow 和目标实例的实时参数合同；目标模板不能原值接收时，生成 Skill只在 5% 比例偏差和 10% 面积偏差内选择实际尺寸，并向用户明确报告调整。

## 4. 文件修改计划

### 4.1 ANIMA Prompt Builder

计划执行者修改以下文件：

- `.agents/skills/anima-prompt-builder/SKILL.md`
- `.agents/skills/anima-prompt-builder/references/01-quick-start.md`
- `.agents/skills/anima-prompt-builder/references/02-role.md`
- `.agents/skills/anima-prompt-builder/references/03-output-protocol.md`
- `.agents/skills/anima-prompt-builder/references/04-final-self-check.md`
- `.agents/skills/anima-prompt-builder/scripts/validate-output.mjs`
- 新建 `.agents/skills/anima-prompt-builder/references/generation-output-contract.md`
- 新建 `.agents/skills/anima-prompt-builder/references/generation-output-schema.json`
- 新建 `.agents/skills/anima-prompt-builder/references/generation-profiles.json`

ANIMA 的 deterministic validator 只校验结果对象的字段、类型、比例字符串和尺寸关系，并拒绝 `seed_mode`、`seed` 等不属于 Prompt Builder 的属性。独立语义 Reviewer 和真实模型验收负责判断 Prompt、画幅和负向内容是否适合画面。

### 4.2 WAI Prompt Builder

计划执行者修改以下文件：

- `.agents/skills/wai-sdxl-prompt-builder/SKILL.md`
- `.agents/skills/wai-sdxl-prompt-builder/references/input-contract.md`
- `.agents/skills/wai-sdxl-prompt-builder/references/prompt-format-validator.md`
- `.agents/skills/wai-sdxl-prompt-builder/references/prompt-self-check.md`
- `.agents/skills/wai-sdxl-prompt-builder/scripts/validate-output.mjs`
- 新建 `.agents/skills/wai-sdxl-prompt-builder/references/generation-output-contract.md`
- 新建 `.agents/skills/wai-sdxl-prompt-builder/references/generation-output-schema.json`
- 新建 `.agents/skills/wai-sdxl-prompt-builder/references/generation-profiles.json`

WAI validator 使用与 ANIMA 相同的结果字段语义，但保留 WAI 自己的十五位置 Prompt 组装规则和权重规则。

### 4.3 Krea2 Prompt Builder

`.agents/skills/krea2-anime-prompt-builder/` 已由当前方案分支基线 `5142a99` 跟踪。计划执行者只修改或新增以下文件：

- `.agents/skills/krea2-anime-prompt-builder/SKILL.md`
- `.agents/skills/krea2-anime-prompt-builder/README.md`
- `.agents/skills/krea2-anime-prompt-builder/references/krea2-prompt-rules.md`
- `.agents/skills/krea2-anime-prompt-builder/references/motion-migration-constraints.md`
- 新建 `.agents/skills/krea2-anime-prompt-builder/references/generation-output-contract.md`
- 新建 `.agents/skills/krea2-anime-prompt-builder/references/generation-output-schema.json`
- 新建 `.agents/skills/krea2-anime-prompt-builder/references/generation-profiles.json`
- 新建 `.agents/skills/krea2-anime-prompt-builder/scripts/validate-output.mjs`

Krea2 的 deterministic validator 必须校验共同结果字段、尺寸字段一致性，以及 `positive_rewrite` 模式下 `negative_prompt: null`、`positive_avoidance` 非空的结构关系，并拒绝 `seed_mode`、`seed` 等不属于 Prompt Builder 的属性。该 validator 不判断 Prompt 语义质量。

计划执行者不得修改本节未列出的 Krea2 现有文件。Krea2 交付结果从当前“只有一条 Prompt 正文”调整为结构化结果；`positive_prompt` 属性仍只包含一条纯净 Prompt 正文，生成参数和规避说明分别进入其他属性。

### 4.4 ComfyUI Generate

计划执行者修改以下文件：

- `.agents/skills/comfyui-generate/SKILL.md`
- 新建 `.agents/skills/comfyui-generate/references/prompt-result-contract.md`
- 新建 `.agents/skills/comfyui-generate/references/prompt-result-schema.json`
- 新建 `.agents/skills/comfyui-generate/references/template-parameter-inspection-cli.md`
- `.agents/skills/comfyui-generate/references/generation-cli.md`

生成 Skill必须按 Prompt Builder 的本轮生成决定、用户显式覆盖和只读 CLI 返回的当前模板实际参数建立最终 `parameters`。`comfyui-generate` 必须独立完成模板检查、尺寸适配、Seed 解析、历史查询、随机化、校验和重试决定，并在完成 Prompt、负向策略和实际尺寸参数检查后才提交任何 Run。

### 4.5 managed CLI 随机 Seed 与模板实际参数检查

计划执行者修改或新增以下系统文件：

- `src/cli/contract.ts`
- `scripts/cli/harness-comfyui.mjs`
- `src/host/cli/route.ts`
- `src/host/generation/generation-runtime.ts`
- `src/host/generation/source-preparer.ts`
- `src/host/generation/workflow-compiler.ts`

计划执行者必须扩展现有 `WorkflowCompiler` interface 和 `ComfyWorkflowCompiler` implementation，不新增第二套参数检查模块。计划执行者必须为现有 `GenerationPreparationAdapter` 增加 `inspectRuntimeParameters({ templateId, instanceId }, signal?)`，由 `SourceGenerationPreparer` 读取 Source Workflow 与显式实例连接并直接委托 `WorkflowCompiler.inspectRuntimeParameters`；该方法不接受缺省实例。`GenerationRuntime.inspectTemplateRuntimeParameters(input, signal?)`、CLI route 和 shell CLI 只传递该结构化结果，`RegisterHarnessComfyuiCliRouteOptions.runtime` 的类型必须显式包含该 runtime 方法。`WorkflowCompiler.compile` 与 `inspectRuntimeParameters` 必须调用同一个私有 runtime-parameter plan，adapter 不得读取 plan 的内部类型。检查方法不得修改输入 Workflow，不得调用 Official API Workflow compiler，不得物化随机 Seed、替换模型或应用 LoRA。该命令不得读取 `config/verification/comfyui-workflow-parameter-support.json`，也不得修改 Catalog resolve 合同。随机 Seed 命令使用普通伪随机函数；自动化测试通过注入固定序列验证范围、数量、单次去重和碰撞重试，不增加随机源抽象层或加密实现。

### 4.6 文档与测试

计划执行者根据最终变更修改以下测试与系统文档：

- `tests/unit/prompt-builder-weight-validation.test.mjs`
- 新建 `tests/unit/krea2-prompt-output-validation.test.mjs`
- 新建 `tests/contract/prompt-builder-generation-output-references.test.mjs`
- `tests/contract/krea2-anime-prompt-builder.test.mjs`
- `tests/unit/cli-contract.test.ts`
- `tests/unit/generation-runtime.test.ts`
- `tests/unit/generation-worker.test.ts`
- `tests/unit/generation-preparer.test.ts`
- `tests/unit/generation-workflow-compiler.test.ts`
- `tests/integration/cli-command.test.ts`
- `tests/integration/cli-route.test.ts`
- `docs/system/architecture.md`
- `docs/system/directory-structure.md`
- `docs/system/testing.md`
- `config/desktop-worktree.json`
- `scripts/desktop/worktree.mjs`
- `tests/production/desktop-worktree.test.mjs`
- `tests/production/desktop-production.test.mjs`
- `docs/agents/worktree-development.md`
- `docs/agents/comfyui-workbench-preset-and-skill-development.md`
- `docs/system/configuration.md`
- `docs/system/startup.md`
- 新建 `.planning/prompt-generation-contract/model-acceptance.md`

本节是本次实施允许修改的完整测试和系统文档清单。真实 Desktop 第一轮验收证明开发 Desktop 原先读取主开发 checkout 的旧版全局 Skill，用户随后追加授权计划执行者修改 Desktop worktree 配置、准备逻辑、生产/开发边界测试和对应规范，使隔离开发 HOME 读取当前 worktree 的候选 Skill，同时保持生产环境与真实全局 Skill 链接不变。计划执行者发现必须修改本节以外的文件时，必须停止对应修改、说明具体文件与合同原因并取得用户追加授权。

`tests/contract/prompt-builder-generation-output-references.test.mjs` 只确定性检查三个 Builder 的 `SKILL.md` 都链接对应的 `references/generation-output-contract.md`、`references/generation-output-schema.json` 与 `references/generation-profiles.json`，检查 `comfyui-generate/SKILL.md` 链接自己的 `references/prompt-result-contract.md`、`references/prompt-result-schema.json`、现有 `references/catalog-cli.md`、`references/template-parameter-inspection-cli.md` 与 `references/generation-cli.md`，并检查全部引用文件存在。该测试必须解析三个 Builder 的 `generation-output-schema.json` 和生成 Skill的 `prompt-result-schema.json`，对四份 JSON 执行深度相等比较。该测试还必须确认 Builder 结果 validator 从本 Skill 的结构化 schema 拒绝越界属性。该测试不得通过关键词扫描判断 `SKILL.md` 是否“写得太多”，也不得通过扫描九个章节标题代替 CLI 参考文档的语义验收；详细规则和章节合同由独立语义 Reviewer 审核。

`model-acceptance.md` 是第 7 章每个真实配置的验收记录。计划执行者必须为每个配置分别记录：模型路线、profile 和生成目的；Agent Preset（`ComfyUI工作台预设`）；执行 Skill 的 Provider 与 Agent 模型；Workflow 模板 ID；ComfyUI 实例 ID；ComfyUI 生成模型；用户画面请求；Skill 实际读取的参考文件；实际 shell CLI 命令及其返回；正向 Prompt、负向模式和负向 Prompt 或正向规避；Seed；Builder 目标尺寸；CLI 返回的模板实际参数；提交的实际尺寸参数；比例偏差与面积偏差；Run ID；实际输出像素尺寸和图片路径；独立语义 Reviewer 与独立视觉 Reviewer 的具体判定；保留或删除该 profile 的决定和理由。该 Markdown 属于语义内容，必须由独立语义 Reviewer 审核，程序测试不得解析它作为结构化数据来源。

## 5. 实施顺序

1. 计划执行者先在 `generation-workflow-compiler.test.ts` 通过 `WorkflowCompiler` interface 编写 `inspectRuntimeParameters` 与 `compile` 共享行为的失败测试，再扩展 `ComfyWorkflowCompiler` 深模块；随后编写 managed CLI 随机 Seed、Source preparer delegation、Generation runtime 与 `generation inspect-template-parameters --stdin` adapter 的失败测试并实现对应合同。
2. 计划执行者为三个模型分别创建 `generation-output-contract.md`、`generation-output-schema.json` 与 `generation-profiles.json`，再修改三个 Prompt Builder 的现有内部 Prompt 格式参考以消除冲突。计划执行者随后删除或改写三个 `SKILL.md` 中与新参考文件重复或冲突的详细合同，使三个 `SKILL.md` 最终只保留第 2.5 节定义的读取时机和 validator 调用阶段；三个 Builder 不增加 Seed 行为。
3. 计划执行者为 `comfyui-generate` 创建 `prompt-result-contract.md`、`prompt-result-schema.json` 与完整 CLI 使用参考文档 `template-parameter-inspection-cli.md`，并把详细 Seed规则写入 `generation-cli.md`。计划执行者随后删除或改写生成 Skill的 `SKILL.md` 中与四份参考文件重复或冲突的详细合同，使该 `SKILL.md` 最终只保留第 2.5 节定义的读取时机和执行阶段路由；生成 Skill依据自己的参考文件消费本轮生成决定、检查模板实际参数、在允许阈值内适配尺寸、独立取得或复用具体 Seed，并处理原生负向/正向规避分支。
4. 独立语义 Reviewer 核对四个 Skill、三个模型配置说明和 CLI 参考文档。
5. 计划执行者在独立 worktree 使用 `pnpm dev:start` 启动完整 Desktop，在第二个终端运行 `pnpm dev:status` 与 `pnpm dev:logs`，完成真实模型与真实 Workflow 验收后运行 `pnpm dev:stop`。
6. 计划执行者修正验收发现后重新执行受影响的独立语义 Review 和真实 Desktop 用例。
7. 计划执行者对最终候选树运行 `pnpm quality` 与 `git diff --check`，完成后不再修改文件。

## 6. 自动化测试清单

### 6.1 Seed 分支

- `count` 为 1 和 20 时，随机 Seed 命令返回对应数量的互不相同整数。
- `count` 为 0、21、非整数、缺失或包含额外属性时，CLI 返回明确输入错误且不创建 Run。
- 三个 Builder validator 都拒绝包含 `seed_mode`、`seed` 或其他 Seed 决定的结果对象。
- managed CLI 的历史 Run 查询结果保持保存参数中的整数 Seed；历史请求没有 Seed 时，输出不伪造 Seed 属性。

### 6.2 尺寸分支

- Prompt Builder 测试在没有 Workflow 模板输入时仍能只根据画面与 `generation_purpose` 输出完整目标 `aspect_ratio`、`width`、`height` 和 `megapixels`。
- `generation inspect-template-parameters --stdin` 使用当前 Source Workflow 与注入的实例 `/object_info` 返回实际参数和数值/枚举合同，不读取 `config/verification/comfyui-workflow-parameter-support.json`，也不创建 Run。
- `WorkflowCompiler.inspectRuntimeParameters` 返回的每个具体 `parameter_id` 与合法值交给同一个实例的 `WorkflowCompiler.compile` 时必须成功应用到相同参数 target；检查与提交对已发现目标的歧义和非法 `/object_info` 合同返回相同错误码与参数目标语义。
- Workflow 缺少某个标准参数时，`WorkflowCompiler.inspectRuntimeParameters` 不返回该参数或依赖该参数的候选，且不因此报错；`WorkflowCompiler.compile` 收到一个检查结果未提供的 `parameter_id` 时返回 `GENERATION_PARAMETER_TARGET_NOT_FOUND`。
- `WorkflowCompiler.inspectRuntimeParameters` 不修改输入 Workflow，不调用 Official API Workflow compiler，不物化随机 Seed、不替换模型且不应用 LoRA；`WorkflowCompiler.compile` 在使用同一私有 runtime-parameter plan 后继续完成这些提交阶段工作。
- `generation-workflow-compiler.test.ts` 只通过 `WorkflowCompiler` interface 测试检查与提交行为，不导入私有 runtime-parameter plan、`ParameterTarget`、`RuntimeParameterContract` 或 `NodeDefinitionsSnapshot`。Source preparer、Generation runtime、CLI route 与 shell CLI 测试只验证输入转交、输出转交和无 Run 副作用，不重复建立 Workflow 参数解析测试矩阵。
- `GenerationPreparationAdapter.inspectRuntimeParameters` 的 adapter 测试确认非空 `templateId`、非空显式 `instanceId`、Source Workflow、实例连接和取消信号被完整转交，并确认缺失、空白或 `null` 的 `instance_id` 在读取 Source 前被 CLI 合同拒绝。
- `GenerationRuntime.inspectTemplateRuntimeParameters` 的测试确认该方法只委托 `GenerationPreparationAdapter.inspectRuntimeParameters`，并确认它在成功与失败分支都不创建 Generation Run；CLI route 的 runtime `Pick` 和 route 测试使用该确定方法名。
- 测试使用一个不存在于静态 Workflow 验证基线的新模板 ID；只要 Source 返回有效 Workflow 且实例参数可解析，检查命令就必须成功。
- 多组带节点后缀的尺寸参数必须形成各自独立且已配对的 `size_candidates`；无法唯一配对的 Workflow 返回歧义错误，Skill 不收到可猜测的半成品参数列表。
- 可确定像素尺寸的 preset 进入 `mapped_options`；不能确定像素尺寸的 preset 进入 `unmapped_values` 且不能成为自动候选。
- 精确尺寸模板只收到 `width` 与 `height`。
- Selector 模板只收到 `aspect_ratio` 与 `megapixels`。
- 只支持 `resolution_preset` 的模板只有在 CLI 能确定 preset 的实际宽高时才自动选择；不能确定时不提交 Run。
- 模板缺少完整尺寸组合时，生成 Skill不提交 Run。
- 目标尺寸能够原值通过实际参数合同时，生成 Skill不调整尺寸。
- 精确尺寸、Selector 和 preset 候选的比例偏差不超过 5% 且面积偏差不超过 10% 时，生成 Skill选择最小偏差候选并报告目标值、实际值和两项偏差。
- 比例偏差超过 5%、面积偏差超过 10%，或用户明确禁止调整时，生成 Skill不提交调整后的 Run。
- 比例偏差恰好为 5% 或面积偏差恰好为 10% 时接受；任一偏差刚超过对应阈值时拒绝。测试必须确认两个公式的分母分别是 Builder 目标比例和 Builder `width × height` 目标面积，并确认候选排序先比较比例偏差、再比较面积偏差。
- 三个 Builder validator 都接受同一 profile 的四个尺寸字段，并拒绝非整数 `width`/`height`、非正有限 `megapixels`、比例冲突和超过 5% 的面积偏差。
- 每个模型的测试档与正式档 profile 都通过结构 validator。

### 6.3 负向 Prompt 分支

- ANIMA `generation-profiles.json` 的 Aesthetic 结构化常量数组不包含 `score_1`、`score_2`、`score_3`；Base/Turbo 路线记录在明确的 `model_route` 下保存各自结构化常量。
- ANIMA validator 根据 `model_route` 与对应结构化常量检查负向模式组合，不对自由文本 Prompt 做关键词推断。
- WAI 结构化结果在原生负向模式中包含非空 `negative_prompt` 和 `positive_avoidance: null`。
- Krea2 结构化结果在正向规避模式中包含 `negative_prompt: null` 和非空 `positive_avoidance`。
- ANIMA/WAI 的实际模板检查结果不包含 `negative_prompt` 时，生成 Skill不提交 Run。
- Krea2 的实际模板检查结果不包含 `negative_prompt` 时，生成 Skill正常提交且请求不包含该参数。

### 6.4 语义验收边界

程序测试只检查 JSON 结构、结构化常量数组的精确值、数值范围、字段组合、CLI 副作用和 Workflow 参数选择。程序测试可以校验 `generation-profiles.json` 中明确定义的常量数组，但不得对自由文本 Prompt 使用关键词数量、正则命中或字符串相似度判断语义质量。独立语义 Reviewer 和真实生成结果负责判断构图、负向策略、正向规避和清晰度选择是否适合当前画面。

### 6.5 参考文档路由

- 合同测试确认三个 Builder 的 `SKILL.md` 分别链接自己 Skill 内的 `references/generation-output-contract.md`、`references/generation-output-schema.json` 和 `references/generation-profiles.json`，确认 `comfyui-generate/SKILL.md` 链接自己的 `references/prompt-result-contract.md`、`references/prompt-result-schema.json`、现有 `references/catalog-cli.md`、`references/template-parameter-inspection-cli.md` 与 `references/generation-cli.md`，并确认全部引用文件存在。
- 合同测试解析三个 Builder 的 `generation-output-schema.json` 和生成 Skill的 `prompt-result-schema.json`，并确认四份 schema 对象深度相等；运行时的任一 Skill 不跨 Skill 读取其他副本。
- 三个 validator 测试确认脚本读取自己的 `generation-output-schema.json` 与 `generation-profiles.json`，并由这两个 JSON 决定字段组合和模型常量；测试不从 Markdown 读取结构化数据。
- 程序测试不把 Markdown 当成结构化输入，不通过扫描自然语言判断读取时机是否正确，也不判断详细规则是否被复制；独立语义 Reviewer 负责审核 `SKILL.md` 的读取主体、首次读取、错误后重读、压缩后重读、validator 调用阶段和参考文档单一来源边界。独立语义 Reviewer还必须确认三个 `generation-output-contract.md` 各自完整定义 validator 调用接口、`prompt-result-contract.md` 完整定义生成 Skill消费 Builder 结果的语义合同，并逐项确认 `template-parameter-inspection-cli.md` 包含第 2.5 节规定的九个 CLI 使用章节、真实命令和输入输出、ID 来源、默认调用单位、只读副作用、错误修正、重试条件与完整示例。

## 7. 真实 Desktop 与模型验收清单

计划执行者必须在独立 worktree 的完整 Desktop 中完成以下用例：

1. ANIMA 的 `1:1`、`7:9`、`9:7`、`9:16`、`16:9` 各自执行测试档和正式档，共 10 个配置；模板 39 的只读检查必须确认实际支持 `positive_prompt`、`negative_prompt`、`seed`、`width` 与 `height`，保存请求必须只使用检查结果允许的实际参数。
2. WAI 的 `1:1`、`7:9`、`9:7`、`13:19`、`19:13`、`4:7`、`7:4`、`9:16`、`16:9` 各自执行测试档和正式档，共 18 个配置；模板 28 的只读检查必须确认实际支持 `positive_prompt`、`negative_prompt`、`seed`、`width` 与 `height`，保存请求必须只使用检查结果允许的实际参数。
3. Krea2 的 `1:1`、`1:2`、`2:3`、`3:2`、`9:16`、`16:9` 各自执行测试档和正式档，共 12 个配置；模板 36 或 21 的只读检查必须确认实际支持 `positive_prompt`、`seed`、`aspect_ratio` 与 `megapixels`，保存请求必须只使用检查结果允许的实际参数，并且不得包含 `negative_prompt`。
4. 计划执行者必须把 40 个配置分别写入 `.planning/prompt-generation-contract/model-acceptance.md`，并填写第 4.6 节规定的全部证据。每个配置必须通过当前实例的实际参数检查、真实生成、独立语义 Reviewer 和独立视觉 Reviewer 判定。独立语义 Reviewer 依据画面请求、Prompt 和 Skill 规则判断构图与目标尺寸在语义上是否适合该 profile；独立视觉 Reviewer 依据对应图片判断主体结构、手脚完整性、多人分离与清晰度是否适合该 profile。某个 profile 自身未通过模型或视觉验收时，计划执行者必须记录具体失败事实、从对应 `generation-profiles.json` 删除该整条 profile，并重新执行受影响模型的自动化测试和语义审核。某个模板不能在第 2.3 节阈值内表达目标尺寸时，计划执行者必须把它记录为模板兼容性结果，不得因此删除模板无关的 Builder profile，也不得替换为未经用户确认且超过阈值的新尺寸。
5. 同一 Prompt 默认生成两张图片时，两个 Run 必须保存不同 Seed 和 `batch_size: 1`；没有限定图片的显式固定整数 Seed 生成两张图片时，两个 Run 必须保存同一个 Seed；同一次执行中明确指定图片 A 使用固定整数 Seed 或历史 Seed、图片 B 使用默认随机时，图片 B 必须取得普通随机 Seed且不能继承图片 A 的 Seed。另以 20 张确认单次上限可执行，以 21 张确认生成 Skill 在创建任何 Run 前拒绝。
6. `comfyui-generate` 使用历史 Run Seed 再生成时，新 Run 必须保存相同 Seed；历史 Run 没有整数 Seed 时，生成 Skill的 Skill 执行者必须报告缺失且不提交 Run；用户只要求“固定”但没有整数或 `run_id` 时，生成 Skill的 Skill 执行者必须请求具体值且不提交 Run。
7. 计划执行者模拟 `comfyui-generate` 的同一项 Generation Request 首次提交失败后的修正重试；重试请求必须使用生成 Skill第一次取得的 Seed。用户明确要求新的随机尝试时，生成 Skill必须取得新 Seed。
8. 每个模型至少选择一个容易出现手脚或多人粘连风险的场景，使用相同 Seed 对比基础策略和目标策略；独立视觉 Reviewer 逐图报告主体结构、手脚完整性、多人分离、画面清晰度和 Prompt 遵循情况。
9. 独立语义 Reviewer 必须确认 WAI 每条追加缺陷描述都指向本轮可见风险，并确认 Krea2 的每条 `positive_avoidance` 已被自然改写并进入同一结果的 `positive_prompt`，不能依靠程序关键词匹配完成该判断。
10. Krea2 的 704×1408 与 1024×2048 使用相同 Prompt 和 Seed 对比；验收记录明确区分项目小图经验和正式 2K 路线。
11. 计划执行者分别验证原值接受、阈值内自动调整、用户禁止调整和超过阈值四条路径；阈值内路径必须在提交前报告 Builder 目标尺寸、实际尺寸、比例偏差和面积偏差，其他两条拒绝路径不得创建 Run。
12. 计划执行者必须在真实 Desktop 分别对三个 Prompt Builder 执行尺寸输入分支验收：没有覆盖时选择完整 profile；只给 `aspect_ratio` 时按生成目的回填；只给 `width` 或只给 `height` 时停止并要求缺失字段；完整 `width + height` 时完成换算；只给 `megapixels` 时停止并要求 `aspect_ratio`；完整 `aspect_ratio + megapixels` 时精确匹配并回填；四字段一致时接受；四字段比例冲突或面积偏差超过 5% 时停止；其他部分组合停止并指出具体缺失字段。全部分支不提供 Workflow 模板，证明 Builder 的目标尺寸设计与模板无关。计划执行者把实际输入和结果写入 `model-acceptance.md` 的“尺寸输入分支”章节；独立语义 Reviewer 只读审核这些输入、结果与 Skill 规则并出具通过或失败判定；计划执行者再把 Reviewer 判定写入同一章节。程序测试不得解析 Prompt 或 Markdown 完成该判断。
13. 计划执行者必须在真实 Desktop 分别对三个 Prompt Builder 执行生成目的分支验收：首次测试 Prompt 方向、用于比较的单个 Prompt 方案、根据上一轮结果继续迭代、要求继续测试修改后的 Prompt、快速预览和批量筛选均输出 `generation_purpose: "test"`；用户明确结束测试并要求正式成图时输出 `generation_purpose: "final"`；旧测试链后开启没有引用关系的新画面任务时输出 `final`；链归属无法判断时停止并要求用户确认。多个比较方案必须拆成多次 Builder 执行且每次只返回一个结构化结果；已明确划分的测试与正式任务必须分别执行；未划分的多方案或混合任务必须停止并要求用户划分。计划执行者把实际输入、可见上下文和结果写入 `model-acceptance.md` 的“生成目的分支”章节；独立语义 Reviewer 只读审核每个分支并出具判定；计划执行者再把 Reviewer 判定写入同一章节。
14. 计划执行者必须在真实 Desktop 分别触发三个 Builder 的首次结果构造、validator 调用和一次上下文压缩后的结果构造，并触发 `comfyui-generate` 的 Builder 结果解析、模板/模型/LoRA/实例目录解析、模板实际参数检查、阈值内尺寸适配、原生负向参数映射、正向规避参数映射、固定整数 Seed 解析与请求构造、随机 Seed、历史 Seed 与提交路径。同一模板、实例与实际参数必须先由 `inspectRuntimeParameters` 返回，再由 `compile` 成功应用到对应 Actual Workflow，验收记录不得出现 adapter 自行解释 Workflow 或修正检查结果。计划执行者必须确认生成 Skill先从 `catalog-cli.md` 定义的模板 resolve 结果取得模板 ID、从实例目录结果取得实例 ID，再完整读取 `template-parameter-inspection-cli.md`，然后发起只读检查命令；相同 ID 组的多项请求复用一次检查结果，模板 ID 或实例 ID 改变时按当前上下文仍完整保留的参考内容重新检查，参考内容已经因上下文压缩缺失时先按第 2.5 节重新完整读取。计划执行者把各 Skill 实际读取的参考文件、结构化 schema 和 validator 接口来源记录到 `model-acceptance.md` 的“参考文档路由”章节；独立语义 Reviewer只读确认 Builder 详细合同和 validator 接口分别来自各 Builder 的三份参考文件，生成 Skill消费 Builder 结果的合同来自自己的 `prompt-result-contract.md` 与 `prompt-result-schema.json`，目录解析合同来自现有 `catalog-cli.md`，模板检查 CLI 与尺寸适配合同来自 `template-parameter-inspection-cli.md`，Seed 和提交合同来自 `generation-cli.md`。独立语义 Reviewer还必须确认四个 `SKILL.md` 只包含准确读取时机与调用阶段，现有冲突说明已经删除或改写，错误修正和压缩后的下一次对应阶段会重新读取所需文件。
15. Desktop 验收结束后，`pnpm dev:stop` 与 `pnpm dev:status` 必须确认开发 Desktop 已停止。

## 8. 验收清单

- [ ] 三个 Prompt Builder 都明确输出正向 Prompt、模型对应的负向策略、生成目的、画幅和两类尺寸表示，并且不输出 Seed 决定、不为 Seed 发起查询、不读取历史 Seed 作为 Builder 结果，也不校验固定 Seed 请求。
- [ ] 三个 Prompt Builder 在没有 Workflow 模板输入时只根据画面和生成目的设计目标尺寸，不读取模板、不检查模板参数、不根据模板调整 profile。
- [ ] 三个 Prompt Builder 在首次测试、方案比较和已连接的后续 Prompt 迭代中使用测试档，只有用户明确结束测试并进入正式成图时才切换为正式档；没有连接旧测试链的新任务默认使用正式档；多个方案分别执行 Builder 且每次只返回一个结构化结果。
- [ ] 三个 Builder 的结果 schema、生成决定语义和模型常量分别只存在于各自的 `generation-output-schema.json`、`generation-output-contract.md` 与 `generation-profiles.json`；三个 `SKILL.md` 只保存准确的读取时机、压缩后重读时机和 validator 调用阶段，validator 不硬编码 schema 或模型常量。
- [ ] 三个 Builder 的 `generation-output-schema.json` 与 `comfyui-generate` 的 `prompt-result-schema.json` 深度相等；四个 Skill运行时只读取自己 Skill 内的 schema 副本。
- [ ] `comfyui-generate` 消费 Builder 结构化结果的详细语义只存在于自己的 `prompt-result-contract.md` 与 `prompt-result-schema.json`，模板/模型/LoRA/实例目录解析规则继续只存在于现有 `catalog-cli.md`，模板实际参数检查 CLI 与尺寸适配规则只存在于完整 CLI 使用参考文档 `template-parameter-inspection-cli.md`，详细 Seed 与提交规则只存在于 `generation-cli.md`；生成 Skill的 `SKILL.md` 只保存对应阶段的完整读取、错误后重读和压缩后重读时机。
- [ ] `template-parameter-inspection-cli.md` 包含第 2.5 节规定的九个必备章节，完整定义真实命令、必填输入、ID 来源、结构化输出、错误修正、重试条件、只读副作用、每组唯一模板/实例 ID 的默认调用单位和完整示例；该文件不引用 Skill 执行环境不可见的仓库文档或 Host 源码。
- [ ] 四个 `SKILL.md` 中原有的重复或冲突详细合同已经删除或改写为参考文件读取时机与执行阶段路由；四个 `SKILL.md` 没有复制结果字段表、尺寸矩阵、负向词表、Seed 数值合同或 CLI 接口细节。
- [ ] `comfyui-generate` 默认生成 1 至 20 张图片时创建 N 个 `batch_size: 1` 请求并保存 N 个互不相同的具体 Seed；一次请求 21 张时不创建 Run。
- [ ] 用户显式固定或复用 Seed 时，只有 `comfyui-generate` 查询、校验并保存用户指定或历史 Run 返回的整数 Seed。
- [ ] `generation inspect-template-parameters --stdin` 从当前 Source Workflow 与目标实例实时 `/object_info` 返回实际参数合同，不读取静态 Workflow 验证基线，不创建 Run，并允许尚未登记在验证基线中的新增模板接受检查。
- [ ] `ComfyWorkflowCompiler` 作为深模块只通过 `WorkflowCompiler.inspectRuntimeParameters` 与 `WorkflowCompiler.compile` 提供模板参数检查和提交编译；两个方法共享私有 runtime-parameter plan，所有 adapter 只转交输入与结构化结果。
- [ ] `GenerationPreparationAdapter.inspectRuntimeParameters` 由 `SourceGenerationPreparer` 实现，且 `GenerationRuntime.inspectTemplateRuntimeParameters` 为 managed CLI 提供无 Run 的只读入口；两个入口要求显式非空实例 ID，不修改 Workflow、不调用 Official API Workflow compiler、不处理 Seed、模型或 LoRA。
- [ ] 深模块 interface 测试证明检查返回的具体参数能由提交编译应用到同一 target，并证明两条路径对已发现目标的歧义和非法合同返回一致错误；缺少标准参数只导致检查结果不包含该参数，测试不越过 interface 读取私有 plan。
- [ ] `comfyui-generate` 根据检查结果只提交一种实际尺寸表示；原值不能接受时只在 5% 比例偏差和 10% 面积偏差内自动调整并报告目标值、实际值和偏差。
- [ ] ANIMA 与 WAI 只向支持 `negative_prompt` 的 Workflow 提交原生负向 Prompt。
- [ ] Krea2 不提交原生负向 Prompt，并把待规避缺陷改写进正向 Prompt。
- [ ] ANIMA 的 10 个、WAI 的 18 个、Krea2 的 12 个尺寸配置均完成逐项真实生成验收，未通过的项目候选 profile 已被删除。
- [ ] `model-acceptance.md` 为 40 个配置逐项记录第 4.6 节规定的实际输入、CLI、Run、图片、Reviewer 判定和保留或删除决定。
- [ ] 计划执行者只修改第 4 章明确列出的 Krea2 文件；其他已跟踪的 Krea2 文件保持不变。
- [ ] 独立语义 Reviewer 对每条 Skill 规则给出主体、动作、具体对象和可执行性验收结果。
- [ ] `pnpm quality`、`git diff --check`、完整 Desktop 验收和依赖审计全部通过。
- [ ] `package.json` 与 `pnpm-lock.yaml` 没有新增依赖；依赖审计结果保持 critical 0、high 0、moderate 0、low 0。

## 9. 非本次目标

- 本次实施不修改 `character-portrait-prompt-designer`。
- 本次实施不安装第三方 Krea2 negative Prompt 节点，不修改 ComfyUI 实例节点，不修改 Source Workflow 模板。
- 本次实施不把 `config/verification/comfyui-workflow-parameter-support.json` 变成运行时白名单，不从该文件向 Catalog resolve 投影参数能力，也不修改 Catalog resolve 输出合同。
- 本次实施不新增第二个 Workflow 参数解析模块，不导出 compiler 私有参数 target、合同、节点定义快照或配对算法，也不让 Generation runtime、Source preparer、CLI route 或 shell CLI 解释 Workflow 参数。
- 本次实施不改变采样器、Scheduler、CFG、Steps、LoRA 权重或模型文件的默认合同，除非用户另行批准。
- 本次实施不把生成目的、尺寸、负向策略、Seed 或模板参数的详细合同复制进任一 `SKILL.md`；`SKILL.md` 只承担参考文档路由和读取时机。
- 本次实施不重新整理 Krea2 的词库、爬取资料、现有批量生成脚本或版本历史；计划执行者只同步 README 中与“仅返回 Prompt 正文”冲突的输出合同，不改写 README 的其他内容。第 4.3 节明确授权的新 validator 不属于现有批量生成脚本。
- 本次实施不修改用户未授权的 Source Workflow 模板、ComfyUI 实例节点或 Catalog 数据。计划执行者在功能与真实 Desktop 验收通过后，按仓库发布规范创建 Pull Request、合入 `origin/main`、发布新版本并从该发布提交部署生产 checkout。
- 本次实施不修改主 checkout 中用户已有的 `AGENTS.md` 或其他未提交内容。

## 10. 已获得的授权

- 用户已授权计划编写者创建独立 worktree。
- 用户已授权计划编写者读取仓库代码、当前本机 Skill、Workflow 参数支持基线和公开模型资料。
- 用户已授权计划编写者在独立 worktree 的 `.planning/prompt-generation-contract/` 中写入本方案与调研记录。
- 用户通过 `$implement` 授权计划执行者修改第 4 章列出的 Skill、managed CLI、测试与系统文档，并执行第 6 至 8 章的独立 worktree 验收和 `pnpm quality`。
- 用户要求计划执行者完成 TDD、独立审查并提交当前实施分支。
- 用户于 2026-09-03 授权计划执行者把实施分支更新到最新 `origin/main`，修复真实 Desktop 候选 Skill 加载门禁并继续验收；验收通过后，用户授权计划执行者推送分支、创建与合并 Pull Request、发布版本、从发布提交部署生产 checkout并完成生产验收。

## 11. 审批项

用户批准本方案时同时确认以下四项：

1. Krea2 采用“负向意图正向改写”，不安装第三方 negative Prompt 节点。
2. 实施范围包含扩展 `ComfyWorkflowCompiler` 深模块的 `WorkflowCompiler` interface、供 `comfyui-generate` 独占调用的 managed CLI 随机 Seed 命令和只读 `generation inspect-template-parameters --stdin` 命令；`inspectRuntimeParameters` 与 `compile` 共享私有 runtime-parameter plan，模板检查不依赖静态模板白名单。三个 Prompt Builder 不调用这两个命令。
3. 实施以当前独立 worktree 基线 `edfa69a1d1c2ebc65beab66df1bfa7765ffb1ce6` 中已跟踪的 `krea2-anime-prompt-builder` 为第三个 Builder，并把它当前“只返回 Prompt 正文”的合同改成第 2.1 节定义的结构化结果。
4. 第 2.1 至 2.4 节的 schema、语义规则和模型常量分别写入三个 Builder 的本地 schema、合同文档和配置 JSON，以及生成 Skill自有的 Builder 结果合同、schema、模板参数检查文档与 Generation CLI 文档；四个目标 Skill 的 `SKILL.md` 删除或改写现有冲突内容后，只保留读取时机、压缩后重读时机和执行阶段路由，不复制详细合同。
