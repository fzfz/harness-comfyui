---
name: krea2-anime-prompt-builder
description: 用户要求构建、改写或检查 Krea2 动漫 Prompt 时使用。
---

# Krea2 Anime Prompt Builder

## 查询或复用历史 Generation Run

1. 当前 Krea2 Prompt 任务需要读取、核对或复用历史生成参数或 Actual Workflow 时，Skill 执行者使用用户提供的 `run_id` 查询。
2. 本分支首次使用受管 CLI 时，Skill 执行者通过受管前台 shell Tool Call 读取根帮助：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --help
   ```

3. 查询前，Skill 执行者读取命令帮助，再按帮助执行查询：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --help
   ```

4. 同一会话中，Skill 执行者可复用仍在上下文中的帮助。压缩后缺少操作依据时，重新读取本节或对应帮助。
5. 查询完成后，按 `runs[]` 顺序用单独消息报告各 `run_id` 的结果。单项查询失败时，仍报告其余结果。本次还要求构建 Prompt 时，在构造生成结果前发出查询报告；只要求查询时，交付报告并结束。
6. 用户明确要求复用某个可用结果的历史正向 Prompt 时，Skill 执行者读取该结果实际保存的 `arguments.parameters.positive_prompt` 作为输入。

## 读取当前回合输入

1. 设计画面前，完整读取 `references/input-contract.md`，按该文件整理输入来源与待查询项。

2. 满足 `references/input-contract.md` 的“输入整理完成条件”后，按“构建单条 Krea2 动漫 Prompt”设计画面。

3. 参考文件按当前分支逐份读取。输出截断时，读取工具提供的完整文件或分段补读，再执行依赖该资料的步骤。

## 构建单条 Krea2 动漫 Prompt

1. 完整读取 `references/krea2-prompt-rules.md`，先依据已有内容设计画面。待查询内容在下一节补齐。采用内容的优先级如下：

   1. 当前普通文字中的明确画面要求、修改、排除和路线要求；
   2. 用户指定材料中采用的事实；
   3. 用户明确选定的历史正向 Prompt 基线；
   4. 按消息顺序读取的 Character/Style `data.prompt_text`；
   5. 本文件目录查询步骤采用的角色、画师与 Prompt 词条；
   6. 当前画面需要的条件参考资料；
   7. `references/krea2-prompt-rules.md` 定义的 Krea2 动漫默认设计；
   8. 人物设计与 Prompt 构造中的创作补充。

2. 来源冲突按 `references/krea2-prompt-rules.md` 的“冲突与去重”处理。

3. 用户明确要求舞蹈迁移、姿态迁移、动作迁移或迁移源图时，Skill 执行者必须读取 `references/motion-migration-constraints.md`，并执行动作迁移路线。其他请求执行展示路线。动作迁移路线的构图、四肢可见性、鞋履、人物比例和背景约束属于该路线的完成条件。

4. Skill 执行者只在画面需要对应内容时读取下列资料，并且只能采用表中列出的内容：

   | 画面需要 | 读取文件 | 允许采用的内容 |
   | --- | --- | --- |
   | 用户指定动漫画风，或需要补齐动漫画风方向 | `references/anime-style-presets.md` | 各预设的“画风推荐”中描述渲染媒介、线条、上色、明暗或纹理的词语，以及“配色”字段；`action lines`、`impact frames` 和其他动作、运动效果词语不属于画风内容。 |
   | 国风、仙侠、东方幻想或游戏角色的服装原型与服装家族 | `references/游戏服装多样性库.md` | “代表女角色与服装原型”中的服装剪裁、服装部件、材质和穿戴配饰，以及“常用色板”；不得采用该文件中的鞋履、武器、发型、背景和流程说明。 |

5. 背景设计、主体分离、姿态、比例、构图和鞋履按照 `references/krea2-prompt-rules.md` 执行；动作迁移路线同时按照 `references/motion-migration-constraints.md` 执行。

6. 完成画面设计后，进入“查询目录中的作品、角色、画师和 Prompt 词条”，补充本轮需要的目录素材。

## 查询目录中的作品、角色、画师和 Prompt 词条

1. 先按“构建单条 Krea2 动漫 Prompt”的来源优先级，核对全部已采用输入与排除要求。只查询仍缺少的目录内容。用户排除的画师不得查询或采用。
2. 通过 NoobAI MCP 获取待补充内容：

   1. 用户要求的目录作品身份或角色名单尚未提供时，查询作品。
   2. 目录角色所需的身份或 Prompt 仍缺少，或身份存在歧义时，查询角色。
   3. 指定画师所需的身份或 Prompt 仍缺少时，查询该画师。
   4. 用户未指定具体画师，且已采用输入中既无可用画师 Prompt，也无可用 Style 内容时，查询画风候选。
   5. 已读取资料仍不能确定视觉概念的精确标签，或相近标签的画面含义存在歧义时，查询 Prompt 词条。

3. 查询画风候选时，按已确定的画面设计形成画师方向。结果采用与缺失处理按“选择作品、角色、画师与词条”执行。

### 查找作品、角色与画师

1. Skill 执行者需要补充角色或画师 Prompt 时，已有记录 ID 优先用于通过 NoobAI MCP 获取对应记录；没有 ID 时按名称查找，角色查询同时使用已提供的作品信息。记录既没有 ID 也没有名称时，Skill 执行者报告缺少的角色或画师名称，并停止处理该记录。用户同时提供作品和角色名称时，先确认作品，再查找指定角色。用户要求角色名单时，可直接交付查询结果；后续选角或构建 Prompt 时，只采用用户指定的角色。
2. Skill 执行者通过 NoobAI MCP 确定名称精确为 `krea2` 的唯一底模，并只采用该底模对应的画师素材。底模缺失或重名时，Skill 执行者报告实际结果，并停止本次任务的画师查询；画师素材属于其他底模时，报告该素材及其底模，并停止采用该素材。

### 选择作品、角色、画师与词条

1. Skill 执行者按作品名称、别名和类别核对作品候选，按所属作品、角色名称和别名核对角色候选。角色候选必须具有非空 Prompt。只有一项符合时采用该项；多项符合时，Skill 执行者报告候选标识、名称、别名和所属作品，并等待用户选择。
2. 用户指定画师时，按名称和别名核对身份。用户未指定画师时，按已确定的媒介、线条、上色、明暗、纹理和配色比较说明。只采用符合底模要求且具有非空 Prompt 的候选。只有一项符合时采用该项。多项符合且用户已授权决定画面或画风时，选择最符合视觉特点的一项；其余多项符合的请求，报告候选并等待用户选择。
3. Skill 执行者按概念比较词条规范标签及别名。只有一项符合时采用该项；多个候选表达相同含义时，按使用数量从大到小、ID 从小到大采用第一项；含义不同且 Skill 执行者无法根据用户要求确定唯一候选时，Skill 执行者报告候选标识、规范标签和别名，并等待用户选择。
4. 没有可采用结果时，按当前仍缺少的内容处理：

   1. 作品或角色按“确认主体并组装 Prompt”判断能否继续。
   2. 指定画师所需内容已有来源提供时，继续采用。仍缺少身份或 Prompt 时，只报告该缺项并请用户补充。
   3. 自动选择画师无结果时，使用已确定的画风和 Krea2 默认设计继续构造。
   4. 词条无结果时，将该概念的英文自然语言描述写入 `positive_prompt`。


### 确认主体并组装 Prompt

1. 本轮已触发的目录查询处理完成后，Skill 执行者逐项核对全部已采用来源是否提供了当前请求必需的主体、外观与画面信息。
2. 信息仍有缺项时，Skill 执行者报告所缺信息及涉及的主体或场景；存在相关 Character 记录时，附上其名称或 ID。Skill 执行者请求用户补充这些信息，或选择包含有效 `data.prompt_text` 的 Character 上下文记录，然后停止。
3. 信息齐全时，Skill 执行者按 `references/krea2-prompt-rules.md` 的“正向 Prompt 合同”和“内容顺序”组装正文。

## 完成前自检

1. 按 `references/krea2-prompt-rules.md` 的“最终自检”逐项核对。

2. 全部检查通过后，Skill 执行者先读取 `references/generation-output-contract.md` 和 `references/generation-profiles.json`，再决定生成目的、正向规避策略和目标尺寸。
3. 构造生成结果前，Skill 执行者从本 Skill 目录读取校验器根帮助，再读取当前模式帮助：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --help
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals scripts/validate-output.mjs --generation-output --help
   ```

   同一会话中可复用仍在上下文中的帮助。压缩后缺少操作依据时，重新读取对应帮助。Skill 执行者按帮助构造和校验生成结果。

4. 请求包含 Prompt 构建时，最终回答只包含通过生成结果校验器的结构化结果。
