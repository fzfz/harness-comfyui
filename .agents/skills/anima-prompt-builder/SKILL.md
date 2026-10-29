---
name: anima-prompt-builder
description: 用户要求构建、改写或校验 ANIMA3 十二槽 Prompt 时使用。
---

# ANIMA3 提示词构建器

## 查询历史 Generation Run

1. 当前 ANIMA3 Prompt 任务需要读取、核对或复用历史生成参数或 Actual Workflow 时，Skill 执行者使用用户提供的 `run_id` 查询。
2. 本分支首次使用受管 CLI 时，Skill 执行者通过受管前台 shell Tool Call 读取根帮助：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --help
   ```

3. 查询前，Skill 执行者读取命令帮助，再按帮助执行查询：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --help
   ```

4. 同一会话中，Skill 执行者可复用仍在上下文中的帮助。压缩后缺少操作依据时，重新读取本节或对应帮助。
5. Skill 执行者按 `runs[]` 顺序报告每个 `run_id` 的查询结果。单项查询失败时，继续处理其余结果。

### 选择历史 Prompt 文本

1. 用户要求复用历史 Prompt 文本时，每项来源必须包含以下选择：

   1. `run_id`。
   2. `arguments.parameters` 中保存该文本的属性路径。
   3. 从该属性值中采用的完整字符串、完整字符串数组元素，或用户明确指定的原文片段。
   4. 接收该文本的一个十二槽名称。
   5. 目标槽位为 `artist_style` 时，该文本对应的画师名称。

2. 用户可指定采用整个字符串。用户只采用字符串的一部分时，必须给出需要采用的完整原文。
3. Skill 执行者核对用户选择与成功查询结果。完整字符串或数组元素必须与对应值相同；原文片段必须完整出现在对应字符串中。Skill 执行者不得自行拆分用户未选择的正向 Prompt。
4. 任一选择缺失、属性路径不存在或指定文本不一致时，报告具体问题并请求用户重新指定。收到选择前，停止 Prompt 构造。
5. 历史文本冲突按以下顺序处理：

   1. 先保留当前消息中的明确要求，删除或改写与这些要求冲突的历史内容。
   2. 处理后，同一槽位的历史来源仍有无法裁决的互斥内容时，报告对应 Run ID、槽位与冲突文本，请用户选择。收到选择前，停止构造。

## 读取当前消息

1. Skill 执行者把当前用户消息中除 `type=comfyui-context` JSON 行以外的普通文字作为自然语言意图。Skill 执行者按照 JSON 行在当前消息中的出现顺序读取 `type=comfyui-context` 且 `data.kind=character` 或 `data.kind=style` 的记录。

   | 输入来源 | 运行用途 |
   | --- | --- |
   | 当前用户消息中的普通文字 | Skill 执行者从普通文字提取当前画面主题、质量要求、内容要求，以及作品、角色、画师或通用视觉概念的语义查询文本。 |
   | 人物设计产物 | Skill 执行者从外观基准与当前场景说明中提取可见内容，并保留剧情阶段和设计依据。 |
   | Character 上下文记录 | Skill 执行者使用 `data.character_name` 和 `data.work_name` 识别并消歧角色，使用 `data.prompt_text` 作为角色提示词来源。 |
   | Style 上下文记录 | Skill 执行者使用 `data.name` 识别并消歧画师，使用 `data.prompt_text` 作为画师提示词来源。 |

2. `data.kind=style` 时，Skill 执行者先读取 `references/prompt-weight-policy.json`，再按以下步骤规范化该记录的 `data.prompt_text`。同一会话中，已有该文件内容时可复用。

   1. 按逗号拆分文本，删除每段首尾空白，并舍弃空分段。
   2. 按 `references/prompt-weight-policy.json` 解析每段的未加权、默认权重或显式权重形式。保留权重外层内部 payload 和 weight 两侧的原有字符。
   3. 把合法解析后的 payload 转为小写，并移除其开头的全部 `@`。
   4. payload 为空时，舍弃该段；否则在 payload 开头添加一个 `@`。
   5. 按原权重形式重建元素。显式权重逐字符保留合法 weight；默认权重使用 `(@payload)`；未加权形式使用 `@payload`。

3. 用户指定小说原文、人物资料或证据包时，先执行 `character-portrait-prompt-designer`。已有本次人物设计产物时，直接读取交接的外观基准、当前阶段、画面说明与设计依据，再按本 Skill 分配槽位。
4. 人物设计中采用的资料事实作为用户指定依据；创作补充用于补齐未确定的画面内容。当前用户明确要求改编时，采用改编要求。

## 读取提示词参考资料

1. 确定画面类型时，依次读取 `references/06-slot-order.md` 和 `references/07-assembly-decision-tree.md`。仍在上下文中的资料可复用。
2. 按 `references/07-assembly-decision-tree.md` 第 5 章匹配最接近用户意图的画面类型。
3. 待填槽位包括用户明确要求的内容对应的槽位，以及匹配画面类型表要求填写的槽位。
4. 画面类型表要求填写、但用户没有指定内容的槽位，采用该表列出的内容。
5. Skill 执行者按下表读取待填槽位的详细资料：

   | 文件 | 读取条件 |
   | --- | --- |
   | `references/08-count-identity.md` | 待填槽位包含 `count_gender` 或 `character_series`。 |
   | `references/09-appearance.md` | `appearance` 是待填槽位。 |
   | `references/10-clothing-state.md` | `clothing_state` 是待填槽位。 |
   | `references/11-pose-action-sex.md` | `pose_action_sex` 是待填槽位。 |
   | `references/12-expression-reaction.md` | `expression_reaction` 是待填槽位。 |
   | `references/13-camera-shot.md` | `camera_shot` 是待填槽位。 |
   | `references/14-scene-environment.md` | `scene_environment` 是待填槽位。 |
   | `references/15-detail-mood.md` | `detail_mood` 是待填槽位。 |
   | `references/16-special-theme.md` | 画面类型匹配 `references/07-assembly-decision-tree.md` 第 5.7 节中的特殊主题。 |

6. 参考文件按当前步骤逐份读取。输出截断时，读取工具提供的完整文件或分段补读。所需资料完整可读后，再构造对应槽位；路径不存在时，先列出参考目录并核对路径。

## 查询缺少的 Prompt 素材

1. Skill 执行者按以下条件，通过 NoobAI MCP 获取所需的作品、角色、画师或 Prompt 词条：

   1. 以下任一条件触发作品查询：

      1. 用户要求采用目录作品身份，且现有输入不能唯一确定该作品。
      2. 用户要求取得该作品的角色名称。

   2. 以下任一条件触发角色查询：

      1. 用户要求取得目录角色的身份或外貌标签，且以下来源不能提供所需内容：

         1. 当前用户消息直接提供的角色 Prompt。
         2. 该角色对应的 Character 上下文记录。
         3. 用户指定给 `character_series` 或 `appearance` 的历史 Prompt 文本。

      2. 用户要求的目录作品与角色身份存在歧义。

   3. 以下任一条件触发指定画师查询：

      1. 用户指定画师，且以下来源均不能提供该画师的非空 Prompt：

         1. 当前用户消息直接提供的画师 Prompt。
         2. 该画师对应的 Style 上下文记录。
         3. 用户指定给 `artist_style` 的历史 Prompt 文本。

      2. 用户提供的画师名称或别名对应多个画师身份。

   4. 以下条件同时满足时，Skill 执行者查询未指定画师的素材：

      1. 当前用户消息的普通文字没有写出画师名称、画师别名或可直接写入 `artist_style` 的非空画师 Prompt。
      2. 当前消息中不存在 `data.kind=style` 的 `comfyui-context` 记录。
      3. 用户没有把可采用的历史 Prompt 文本指定给 `artist_style`。
      4. 用户没有要求排除全部画师或保持 `artist_style` 为空。

   5. 以下任一条件触发 Prompt 词条查询：

      1. 用户使用自然语言描述外貌、服装、动作、表情、构图、场景或氛围概念，且已读取的详细资料不能确定与该概念精确对应的规范 Prompt 标签。
      2. 存在两个以上语义相近但画面含义不同的候选标签。

2. 本节第 1 项第 4 子项的条件满足时，Skill 执行者按以下步骤查询画师：

   1. Skill 执行者完整读取 `references/artist-style-query-vocabulary.md`。
   2. Skill 执行者按该文件形成一条或多条画风查询。
   3. Skill 执行者通过 NoobAI MCP 查找适用于 ANIMA 的画师素材。
   4. Skill 执行者按本节“选择作品、角色、画师与词条”采用结果。

### 查找作品、角色与画师

1. Skill 执行者按“构建并校验提示词”规定的来源顺序采用已有 Prompt。需要补充角色或画师 Prompt 时，Skill 执行者按以下规则查找：

   1. 已有记录 ID 时，Skill 执行者优先通过 NoobAI MCP 获取该记录。
   2. 没有 ID 但已有名称时，Skill 执行者按以下信息查找：

      1. 角色使用名称及已提供的所属作品信息。
      2. 画师使用名称。

   3. ID 与名称均缺失时，Skill 执行者报告缺少的角色或画师信息，并停止处理该记录。

2. 用户同时给出作品和角色名称时，先确认作品，再查找指定角色。用户要求角色名单时，可直接交付查询结果；后续选角或构建 Prompt 时，只采用用户指定的角色。
3. Skill 执行者查询画师素材前，通过 NoobAI MCP 确定名称精确为 `anima` 的唯一底模。没有匹配底模或存在多个匹配底模时，Skill 执行者报告实际结果，并停止本次任务的画师查询。画师素材关联其他底模时，Skill 执行者报告该素材及其底模，并停止采用该素材。

### 选择作品、角色、画师与词条

1. Skill 执行者按以下步骤选择作品与角色：

   1. Skill 执行者按作品名称、别名和类别核对作品候选。
   2. Skill 执行者按所属作品、角色名称和别名核对角色候选。角色候选必须具有非空 Prompt。
   3. 只有一项符合时，Skill 执行者采用该项。
   4. 多项符合时，Skill 执行者报告候选标识、名称、别名及区分候选所需的作品信息，并等待用户选择。

2. Skill 执行者按以下步骤选择画师：

   1. 用户指定画师时，Skill 执行者按画师名称和别名核对身份。
   2. 用户没有指定画师时，Skill 执行者按已经确定的媒介、线条、上色、明暗、纹理和配色比较画师说明。
   3. Skill 执行者只采用适用于“查找作品、角色与画师”第 3 项底模要求且具有非空 Prompt 的候选。
   4. 只有一项符合时，Skill 执行者采用该项。
   5. 多项符合且用户已授权执行者决定画面或画风时，按已确定的视觉特点选择最符合的一项，并保留采用的素材标识。其余多项符合的请求，报告候选并等待用户选择。

3. Skill 执行者按以下步骤选择词条：

   1. Skill 执行者按目标概念比较词条的规范标签及别名。
   2. 只有一项符合时，Skill 执行者采用该项。
   3. 多个候选表达相同含义时，Skill 执行者按使用数量从大到小、ID 从小到大采用第一项。
   4. 候选含义不同且 Skill 执行者无法根据用户要求确定唯一候选时，Skill 执行者报告候选标识、规范标签和别名，并等待用户选择。

4. 没有可采用结果时，Skill 执行者按查询对象处理：

   1. 作品或角色没有可采用结果时，已有画面要求或人物设计能够定义主体则继续构造。用户要求的目录身份仍无法确定时，报告缺少的身份信息并请求补充。
   2. 用户指定画师而没有可采用结果时，Skill 执行者请求用户补充仍无法确定的画师身份或仍缺失的 ANIMA Prompt。
   3. 自动选择画师没有结果时，Skill 执行者沿用已经确定的媒介、线条、上色、明暗、纹理和配色继续构造 Prompt。
   4. 词条没有可采用结果时，Skill 执行者将该概念的英文自然语言描述写入 `slots.natural_language`。

## 构建并校验提示词

### payload 去重

1. payload 去重适用于全部 12 个槽位数组。各数组内相同 payload 出现多次时，按元素顺序保留第一个对应元素，删除后续元素。

### 构建步骤

1. 构造格式校验输入前，先读取 `references/prompt-weight-policy.json`。Skill 执行者从本 Skill 目录读取校验器根帮助，再读取当前模式帮助：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --help
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --prompt-format --help
   ```

   同一会话中可复用仍在上下文中的帮助。压缩后缺少操作依据时，重新读取对应帮助。Skill 执行者按帮助构造 `slots`，并用单行中文概括当前画面，写入 `display_text`。

2. 按当前模式帮助填写固定质量内容。当前用户明确提出其他质量要求时，补充这些要求。

3. Skill 执行者按以下步骤处理画师 Prompt：

   1. 用户要求排除全部画师或保持 `artist_style` 为空时，Skill 执行者不处理任何画师 Prompt 来源，并把 `artist_style` 设置为空数组。
   2. 其他情况下，Skill 执行者按以下顺序处理：

      1. Skill 执行者移除用户明确排除的具体画师对应的全部 Prompt 来源。
      2. Skill 执行者按当前消息中的出现顺序，处理用户明确要求直接采用的非空画师 Prompt。
      3. Skill 执行者处理 `data.kind=style` 记录中的非空 `data.prompt_text`。
      4. Skill 执行者处理从 NoobAI MCP 采用的画师 Prompt。
      5. Skill 执行者把上述 3 类来源按“读取当前消息”规定的画师权重外层与前缀规范化步骤处理，再放入 `artist_style`。

4. Skill 执行者按照用户为每项历史 Prompt 文本指定的槽位处理该文本：

   1. 目标槽位是 `artist_style` 时，Skill 执行者先舍弃用户要求排除的画师对应的文本。用户要求保持 `artist_style` 为空时，Skill 执行者舍弃全部历史 `artist_style` 文本。其余历史 `artist_style` 文本按“读取当前消息”规定的画师权重外层与前缀规范化步骤处理，再放入 `artist_style`。
   2. 目标槽位是其他前 11 槽时，Skill 执行者按以下步骤处理文本：

      1. Skill 执行者按照逗号拆分文本。
      2. Skill 执行者删除每段首尾空白。
      3. Skill 执行者按照 `references/prompt-weight-policy.json` 解析元素形式。
      4. Skill 执行者把解析后的 payload 转换为小写。
      5. Skill 执行者把每个非空 payload 作为候选元素放入用户指定的槽位。

   3. 目标槽位是 `natural_language` 时，用户指定的每个完整字符串必须是能够放入最终 Prompt 的英文句子。Skill 执行者把句子转换为小写，并作为一个数组元素。
   4. 历史文本冲突按[“选择历史 Prompt 文本”第 5 项](#选择历史-prompt-文本)处理。

5. Skill 执行者按以下步骤处理角色 Prompt：

   1. Skill 执行者按以下顺序处理来源：

      1. 用户明确要求直接采用的非空角色 Prompt，按当前消息中的出现顺序处理。
      2. `data.kind=character` 记录中的非空 `data.prompt_text`。
      3. 从 NoobAI MCP 采用的角色 Prompt。

   2. Skill 执行者按逗号拆分每个角色提示词来源，再删除每段首尾空白。
   3. Skill 执行者按照 `references/prompt-weight-policy.json` 解析元素形式，再把解析后的 payload 转换为小写。
   4. Skill 执行者舍弃空 payload。
   5. Skill 执行者依据 `references/08-count-identity.md` 和 `references/09-appearance.md` 定义的内容范围，按以下规则分配候选元素：

      1. 角色或作品身份 payload 作为未加权候选元素放入 `character_series`。
      2. 外观 payload 作为未加权候选元素放入 `appearance`。

6. Skill 执行者按以下步骤组装内容：

   1. Skill 执行者把当前用户意图与人物设计中的可见内容映射到除 `quality` 和 `artist_style` 以外的 10 个内容槽位。Skill 执行者用已读取的详细资料决定每个槽位的数组元素。
   2. Skill 执行者采用目录词条时，只把选中词条的规范标签放入其语义对应的内容槽位。
   3. 读取 `references/05-conflict-table.md` 并删除冲突内容。处理历史文本冲突时，可提前读取并复用。
   4. 全部来源（含历史文本）并入槽位后，按本节“payload 去重”统一处理 12 个槽位数组。
   5. 读取 `references/prompt-weighting.md` 并设计权重。
   6. 各槽位的元素格式按当前模式帮助处理。

7. 读取 `references/04-final-self-check.md` 并逐项自检，再按当前模式帮助校验 Prompt。只有通过格式校验的 Prompt 才能进入“构造生成结果”步骤。

## 构造生成结果

1. ANIMA 十二槽 Prompt 通过格式校验后，Skill 执行者先读取 `references/generation-output-contract.md` 和 `references/generation-profiles.json`，再决定生成目的、负向策略和目标尺寸。
2. 构造生成结果前，Skill 执行者从本 Skill 目录读取当前模式帮助，并按帮助构造和校验生成结果：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --generation-output --help
   ```

   帮助复用按[“构建步骤”第 1 项](#构建步骤)处理。只有通过校验的生成结果才能用于最终回答。

3. 本次请求使用历史查询时，Skill 执行者按“查询历史 Generation Run”第 5 项报告查询结果，再输出生成结果。
