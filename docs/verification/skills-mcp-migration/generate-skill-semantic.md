---
文档用途: 记录 comfyui-generate/SKILL.md 的逐行独立语义审计结论与可直接采用的替换文本。
读取时机: 修订 comfyui-generate/SKILL.md 的文字与章节结构时。
---
# comfyui-generate 语义审计

## 1. 审计范围

1. 审计对象为 `.agents/skills/comfyui-generate/SKILL.md`，共 68 行。审计依据为任务提供的文字规范；审计仅阅读该文件。
2. 当前文档将历史查询、资源搜索、兼容性核对和图片创建组织在同一个 Skill 中。执行者先取得历史记录或资源选择，再校验 Prompt Builder 结果、确定 Workflow 参数并提交图片请求。
3. 以下行号均对应审计时的目标文件。空行仅用于分段，不作为独立语句评价。

## 2. 通过项

1. **通过，行 1—4。** YAML 名称与描述说明了 Skill 身份和读取时机；描述中的任务均属于图片生成及其准备工作。
2. **通过，行 6、14、18、36、38、48、56、62。** 标题区分历史查询、资源搜索、选择核对和创建步骤；创建步骤的顺序可供执行者顺序遵循。
3. **通过，行 16。** 文字明确了搜索触发条件、调用对象、候选展示内容、选择主体和空结果处理。该段使用有序列表。
4. **通过，行 22、26、28、30、32、34 的业务含义。** 执行者能识别候选 ID 的来源，确定唯一模板与生成模型，核对资源标识及底模，并在兼容性查询完成后结束任务。相关段落的结构修订见第 3.2 节。
5. **通过，行 40、42、44 的业务含义。** 执行者先读取结果约定，再处理输入缺失、边界不清和校验失败，失败信息与用户需要补充的内容相对应。相关段落的结构修订见第 3.3 节。
6. **通过，行 50、52、54 的业务含义。** 文字明确了正负向 Prompt 的来源、触发词处理顺序，以及每张图片采用的模型与 LoRA。相关段落的结构修订见第 3.4 节。
7. **通过，行 60、64、66、68 的业务含义。** 文字指向参数查询与请求提交说明，规定了全部请求通过检查后再提交、提交顺序及结果关联方式。相关段落的结构修订见第 3.5 节与第 3.6 节。
8. **通过，全文的 Skill 内文件路径。** 目标文件中的文件引用均以 `references/` 开头，执行者能够以 Skill 目录为基准定位文件。

## 3. 需修改项与完整替换文本

### 3.1 历史查询步骤需要按执行阶段分段

1. **需修改，行 8—12。** 当前三个段落没有使用有序列表；行 12 将查询结束、历史记录可用性、图片对应关系和 Seed 读取合并在一个长段落中。独立理解是：历史查询先完成，图片对应关系随后在创建流程中确定，Seed 最后在提交准备时读取。按阶段分段有助于执行者在正确时机返回对应步骤。
2. 将行 8—12 完整替换为：

```markdown
1. 用户要求查询或核对一个或多个 `run_id` 保存的生成参数或 Actual Workflow，或者要求在创建图片时复用历史 Seed 时，Skill 执行者执行本节步骤。
2. Skill 执行者完整读取 `references/generation-cli.md`，并按照该文件取得每个 `run_id` 的查询结果。
3. 用户只要求查询或核对历史 Generation Run 时，Skill 执行者返回 `runs[]` 中每一项的查询结果，然后结束本次任务。
4. 用户要求复用历史 Seed 创建图片时，Skill 执行者检查用户指定的每个 `runs[]` 项。任一指定项的 `lookup_status` 不是 `available` 时，Skill 执行者列出该项的 `run_id` 和 `lookup_status`，并等待用户删除或更换该 `run_id`。全部指定项的 `lookup_status` 均为 `available` 后，Skill 执行者记录这些 `runs[]` 项。
5. Skill 执行者完成“校验 Prompt Builder 结果并确定待创建图片”步骤后，核对每张待创建图片与已记录 `runs[]` 项的对应关系。用户没有明确对应关系时，Skill 执行者列出每张待创建图片和每个已记录的 `runs[]` 项，并等待用户指定对应关系。
6. Skill 执行者在“取得 Seed、构造 Generation Request 并提交”步骤按照 `references/generation-cli.md` 读取并检查对应 `runs[]` 项保存的 Seed。
```

### 3.2 当前选择的核对步骤需要有序列表和显式动作主体

1. **需修改，行 22—34。** 当前段落没有使用有序列表。行 24 的“直接输入和 `comfyui-context` JSON 不具有来源优先级”重复解释了前一句的合并规则，删除该句不会影响执行者理解首次出现顺序。行 30 的核对动作和行 32 的等待动作适合统一由 Skill 执行者承担，以保持主体明确。
2. 将行 22—34 完整替换为：

```markdown
1. 用户在当前消息中提供一个或多个 `type: "comfyui-context"` JSON 时，Skill 执行者读取每个 JSON 的 `data.kind` 和 `data.id`：将 `data.kind: "comfyui-template"` 的 `data.id` 作为候选 `template_id`，将 `data.kind: "model"` 的 `data.id` 作为候选 `model_id`，将 `data.kind: "lora"` 的 `data.id` 作为 LoRA ID。
2. 用户在当前消息中直接提供 `template_id`、`model_id` 或 LoRA ID 时，Skill 执行者分别将该 ID 作为候选 `template_id`、候选 `model_id` 或 LoRA ID。Skill 执行者按照各 ID 在当前消息中的首次出现顺序，合并直接输入和所有 `comfyui-context` JSON 提供的 ID。同一类型的同一 ID 重复出现时，Skill 执行者只保留第一次出现，并按照去重后的 LoRA ID 首次出现顺序建立 LoRA ID 有序列表。
3. 创建图片或核对兼容性时，Skill 执行者必须确定一个 `template_id`，接受用户指定零个或一个 `model_id`，并可以确定零个至 100 个 LoRA ID。缺少 `template_id` 时，Skill 执行者报告当前请求缺少 Workflow 模板选择，并等待用户指定一个 `template_id`。存在多个候选 `template_id` 或多个候选 `model_id`，且用户没有指定唯一选择时，Skill 执行者列出对应的候选 ID，并等待用户指定最终选择。LoRA ID 超过 100 个时，Skill 执行者报告当前数量，并等待用户将 LoRA ID 减少到 100 个以内。
4. Skill 执行者通过 NoobAI MCP 获取已选模板、模型和 LoRA。用户指定模型时，Skill 执行者采用该模型；用户未指定模型时，Skill 执行者采用模板关联的默认模型；模板也没有默认模型时，Skill 执行者请求用户指定模型后继续。Skill 执行者取得所采用的生成模型查询结果后，继续核对资源标识。
5. Skill 执行者核对用户所选资源的返回标识与用户提供的标识是否一致，并核对模板默认模型的返回标识与模板关联的默认模型标识是否一致。存在不一致时，Skill 执行者列出预期标识和返回标识，并等待用户重新指定该资源。
6. Skill 执行者核对 Workflow 模板、采用的生成模型和每项 LoRA 是否关联同一底模。存在不同底模时，Skill 执行者分别列出这些资源的标识及关联底模，并等待用户指定要更换的 Workflow 模板、生成模型或 LoRA。
7. 用户只要求核对兼容性时，Skill 执行者返回所选 Workflow 模板、生成模型和每项 LoRA 的查询结果及关联底模的比较结论，然后结束本次任务。
```

### 3.3 Prompt Builder 校验步骤需要完整表达数量边界

1. **需修改，行 40—46。** 当前段落没有使用有序列表。行 46 将允许范围规定为 1 至 20，却仅描述总数超过 20 时的处理；执行者面对总数小于 1 的输入时缺少对应动作。应使用同一个范围描述处理两个边界。
2. 将行 40—46 完整替换为：

```markdown
1. Skill 执行者完整读取 `references/prompt-result-contract.md`、`references/prompt-result-schema.json` 和 `references/prompt-builder-model-routes.json`。当前消息未包含用于创建图片的 Prompt Builder 结果 JSON 时，Skill 执行者报告当前请求缺少 Prompt Builder 结果 JSON，并等待用户提供。当前消息包含一个或多个用于创建图片的 Prompt Builder 结果 JSON 时，Skill 执行者按照 `references/prompt-result-contract.md` 逐个校验这些结果 JSON。
2. 多个结果 JSON 之间的边界不明确时，Skill 执行者列出无法划分的内容，并等待用户明确每个结果 JSON 的边界。
3. 任一结果 JSON 无效时，Skill 执行者返回该结果的校验错误，并等待用户提供修正后的完整结果 JSON。
4. 每个有效结果 JSON 默认创建一张图片。用户为某个结果 JSON 指定多张图片时，Skill 执行者按照结果 JSON 在当前消息中的出现顺序，并在每个结果 JSON 内按照图片序号顺序展开待创建图片。待创建图片总数必须为 1 至 20；总数超出此范围时，Skill 执行者报告当前总数和允许范围，并等待用户调整图片数量。
```

### 3.4 Prompt 构造步骤需要有序列表

1. **需修改，行 50—54。** 三个段落分别承担 Prompt 取值、触发词处理和资源复用，语义清楚，但没有使用有序列表。
2. 将行 50—54 完整替换为：

```markdown
1. 对于每个有效结果 JSON，Skill 执行者将 `positive_prompt` 用作正向 Prompt。`negative_mode` 为 `native_negative` 时，Skill 执行者将 `negative_prompt` 用作负向 Prompt；`negative_mode` 为 `positive_rewrite` 时，Skill 执行者省略负向 Prompt。
2. Skill 执行者按照 LoRA ID 有序列表和从各项 LoRA 资源取得的触发词顺序，建立触发词字符串有序列表；相同字符串出现多次时，Skill 执行者只保留第一次出现的字符串。Skill 执行者依次检查触发词字符串；正向 Prompt 尚未包含当前完整字符串时，Skill 执行者在非空正向 Prompt 末尾追加英文逗号、一个空格和当前字符串，正向 Prompt 为空时直接写入当前字符串。
3. 每个结果 JSON 对应的图片都使用“核对当前选择”一节采用的生成模型查询结果和同一份 LoRA ID 有序列表。
```

### 3.5 Workflow 参数查询步骤需要明确报告内容与读取主体

1. **需修改，行 58—60。** 当前段落没有使用有序列表。行 58 的“没有实例时报告并停止”没有写明报告内容；“确定实例 ID 后，完整读取”省略了读取主体。独立理解是执行者应报告无法选择实例这一阻塞条件，并在取得实例 ID 后读取参数查询说明。
2. 将行 58—60 完整替换为：

```markdown
1. Skill 执行者通过 NoobAI MCP 获取实例列表，采用返回的第一个实例作为本次目标。实例列表为空时，Skill 执行者报告当前没有可用的 ComfyUI 实例、无法继续创建图片，并结束本次任务。确定实例 ID 后，Skill 执行者完整读取 `references/template-parameter-inspection-cli.md`。
2. Skill 执行者按照该文件查询 Workflow 参数，并根据查询结果确定正向 Prompt 对应的 `parameter_id`、`negative_mode` 为 `native_negative` 时负向 Prompt 对应的 `parameter_id`、Seed 对应的 `parameter_id`、`batch_size` 对应的 `parameter_id` 和参数值，以及图片尺寸对应的一个或多个 `parameter_id`。Skill 执行者按照该文件确定每张图片使用的各项尺寸参数和值。
```

### 3.6 请求构造与提交步骤需要有序列表

1. **需修改，行 64—68。** 三个段落按准备、整体检查、提交结果组织，但没有使用有序列表。禁止检查失败后提交请求的约束具有执行作用，应予保留。
2. 将行 64—68 完整替换为：

```markdown
1. 本次任务尚未完整读取 `references/generation-cli.md` 时，Skill 执行者完整读取该文件。Skill 执行者按照该文件确定每张图片的 Seed，并为每张图片构造一个 Generation Request。
2. Skill 执行者按照 `references/generation-cli.md` 检查全部 Generation Request。任一 Generation Request 未通过检查时，Skill 执行者返回该请求对应的图片序号和完整检查错误，不提交任何 Generation Request，并结束本次任务。全部 Generation Request 通过检查后，Skill 执行者按照“校验 Prompt Builder 结果并确定待创建图片”步骤确定的待创建图片顺序，逐项提交 Generation Request。
3. Skill 执行者把每次提交结果关联到对应的图片序号，并按照 `references/generation-cli.md` 处理成功、失败、重试或跳过结果。Skill 执行者按照图片顺序返回每次成功提交得到的 `run_id`。
```
