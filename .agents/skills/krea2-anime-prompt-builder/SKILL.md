---
name: krea2-anime-prompt-builder
description: 用户要求根据自然语言画面要求、当前消息 `comfyui-context` 中的 Character 或 Style 上下文记录、语义查询结果或用户指定的历史正向 Prompt，构建、改写或检查一条 Krea2 动漫 Prompt，或者要求读取一个或多个 run_id 保存的生成参数或 Actual Workflow 时使用。
---

# Krea2 Anime Prompt Builder

## 查询或复用历史 Generation Run

用户要求读取、核对或复用一个或多个 `run_id` 保存的生成参数或 Actual Workflow 时，Skill 执行者完整读取 `references/generation-cli.md`，并按照该文件取得每个 `run_id` 的查询结果。

Skill 执行者按照 `references/generation-cli.md` 规定的顺序和结果分支处理每个 `run_id`。

用户只要求查询历史 Generation Run 时，Skill 执行者按顺序报告查询结果后结束本次执行。用户还要求构建或修改 Krea2 Prompt 时，Skill 执行者完成查询后继续执行本文件的 Prompt 流程；用户明确要求复用某个可用结果的历史正向 Prompt 时，Skill 执行者读取该结果实际保存的 `arguments.parameters.positive_prompt` 作为输入。

## 读取当前回合输入

需要构建 Prompt 时，Skill 执行者必须完整读取 `references/input-contract.md`，再按该文件读取当前消息中的普通文字、Character 记录和 Style 记录。Skill 执行者必须按消息中的出现顺序处理 `comfyui-context` 记录。Character/Style 记录中的非空 `data.prompt_text` 是直接 Prompt 来源；缺少 `data.prompt_text` 时，记录中的 ID、名称和所属作品只用于本文件规定的目录查询与候选消歧。

以下三类内容构成本次可用 Prompt 输入：

1. 当前用户普通文字中的画面要求、修改、排除或路线要求；
2. 用户明确选定的历史正向 Prompt；
3. 当前消息中的可识别 Character/Style 记录，包括可直接采用的 `data.prompt_text` 或可用于目录查询的 ID、名称和所属作品。

三类内容全部不存在时，Skill 执行者必须请用户提供具体画面要求或有效 Character/Style 上下文记录，然后停止。当前请求没有要求历史查询时，Skill 执行者直接进入 Prompt 构建流程，并按后文条件通过 NoobAI MCP 查询目录。

## 构建单条 Krea2 动漫 Prompt

Skill 执行者必须完整读取 `references/krea2-prompt-rules.md`，并按以下优先级采用内容：

1. 当前普通文字中的明确画面要求、修改、排除和路线要求；
2. 用户明确选定的历史正向 Prompt 基线；
3. 按消息顺序读取且不与前两项冲突的 Character/Style `data.prompt_text`；
4. 本文件目录查询步骤采用的角色、画师与 Prompt 词条；
5. 当前画面需要的条件参考资料；
6. `references/krea2-prompt-rules.md` 定义的 Krea2 动漫默认设计。

两个当前明确要求无法同时成像，并且上述优先级不能消解冲突时，Skill 执行者必须指出互斥的两个具体要求，请用户选择后停止。

用户明确要求舞蹈迁移、姿态迁移、动作迁移或迁移源图时，Skill 执行者必须读取 `references/motion-migration-constraints.md`，并执行动作迁移路线。其他请求执行展示路线。动作迁移路线的构图、四肢可见性、鞋履、人物比例和背景约束属于该路线的完成条件。

Skill 执行者只在画面需要对应内容时读取下列资料，并且只能采用表中列出的内容：

| 画面需要 | 读取文件 | 允许采用的内容 |
| --- | --- | --- |
| 用户指定动漫画风，或需要补齐动漫画风方向 | `references/anime-style-presets.md` | 各预设的“画风推荐”中描述渲染媒介、线条、上色、明暗或纹理的词语，以及“配色”字段；`action lines`、`impact frames` 和其他动作、运动效果词语不属于画风内容。 |
| 国风、仙侠、东方幻想或游戏角色的服装原型与服装家族 | `references/游戏服装多样性库.md` | “代表女角色与服装原型”中的服装剪裁、服装部件、材质和穿戴配饰，以及“常用色板”；鞋履、武器、发型、背景和旧路线说明不属于服装内容。 |

`references/anime-style-presets.md` 只提供表中规定的画风和配色内容，`references/游戏服装多样性库.md` 只提供表中规定的服装内容。背景设计、主体分离、姿态、比例、构图和鞋履按照 `references/krea2-prompt-rules.md` 执行；动作迁移路线同时按照 `references/motion-migration-constraints.md` 执行。

## 查询目录中的作品、角色、画师和 Prompt 词条

以下任一情况发生时，Skill 执行者通过 NoobAI MCP 获取作品、角色、画师或 Prompt 词条：

1. 当前普通文字出现作品、系列或 IP，且 Skill 执行者需要确认作品身份或取得该作品的角色名称；
2. 用户指定角色，但当前 Character 记录没有非空 `data.prompt_text`，或者作品与角色身份存在歧义；
3. 作品查询返回的角色名单中存在用户已指定且本幅画面需要的角色，并且需要取得该角色的 Prompt；
4. 用户指定具体画师，但当前 Style 记录没有非空 `data.prompt_text`，或者画师身份存在歧义；
5. 用户没有指定具体画师，并且当前消息没有包含非空 `data.prompt_text` 的 Style 记录；
6. 用户使用自然语言描述外貌、服装、动作、表情、构图、场景、光线或氛围，但已读取的 Krea2 规则与条件资料不能确定精确 Prompt 标签，或者存在两个以上画面含义不同的相近标签；
第 5 种情况中，Skill 执行者必须先根据已确定的画面设计形成具体画师方向，再通过 NoobAI MCP 查找适用于 Krea2 的画师素材，并按本节“选择作品、角色、画师与词条”采用结果。目录没有合适 Style 结果时，Skill 执行者继续使用已经读取的动漫画风资料与 Krea2 默认设计，不把其他底模的 Style 记录作为 Krea2 结果。

### 查找作品、角色与画师

1. Skill 执行者需要补充角色或画师 Prompt 时，已有记录 ID 优先用于通过 NoobAI MCP 获取对应记录；没有 ID 时按名称查找，角色查询同时使用已提供的作品信息。记录既没有 ID 也没有名称时，Skill 执行者报告缺少的角色或画师名称，并停止处理该记录。用户同时提供作品和角色名称时，先确认作品，再查找该作品中的指定角色；作品返回的角色名单只用于核对用户已经指定的角色。
2. Skill 执行者通过 NoobAI MCP 确定名称精确为 `krea2` 的唯一底模，并只采用该底模对应的画师素材。底模缺失或重名时，Skill 执行者报告实际结果，并停止本次任务的画师查询；画师素材属于其他底模时，报告该素材及其底模，并停止采用该素材。

### 选择作品、角色、画师与词条

1. Skill 执行者按作品名称、别名和类别核对作品候选，按所属作品、角色名称和别名核对角色候选。角色候选必须具有非空 Prompt。只有一项符合时采用该项；多项符合时，Skill 执行者报告候选标识、名称、别名和所属作品，并等待用户选择。
2. 用户指定画师时，Skill 执行者按画师名称和别名核对身份；用户未指定画师时，Skill 执行者按已经确定的媒介、线条、上色、明暗、纹理和配色比较画师说明。只采用符合“查找作品、角色与画师”第 2 项底模要求且具有非空 Prompt 的候选。只有一项符合时采用该项；多项符合时，Skill 执行者报告候选标识、名称、别名和画风说明，并等待用户选择。
3. Skill 执行者按概念比较词条规范标签及别名。只有一项符合时采用该项；多个候选表达相同含义时，按使用数量从大到小、ID 从小到大采用第一项；含义不同且 Skill 执行者无法根据用户要求确定唯一候选时，Skill 执行者报告候选标识、规范标签和别名，并等待用户选择。
4. 作品或角色没有可采用结果时，Skill 执行者按“确认主体并组装 Prompt”决定继续构造或请求用户补充。指定画师没有可采用结果时，Skill 执行者报告缺少该画师的 Krea2 Prompt，并请求用户补充。自动选择画师无结果时，Skill 执行者继续使用已经读取的动漫画风资料与 Krea2 默认设计构造 Prompt。词条没有可采用结果时，Skill 执行者将该概念的英文自然语言描述写入 `positive_prompt`。

### 确认主体并组装 Prompt

全部 Character 查询结束后，Skill 执行者必须检查当前请求要求出现的每名主体。某名必需主体对应的 Character 上下文记录没有非空 `data.prompt_text`，MCP 查询也没有返回可采用的角色 Prompt，并且当前普通文字、用户选定的历史正向 Prompt、条件参考资料与 Krea2 默认设计仍不能完整定义该主体时，Skill 执行者必须报告具体 Character 名称或 ID 没有可用 Prompt 内容，请用户补充该主体的外观与身份要求或选择包含有效 `data.prompt_text` 的 Character 上下文记录，然后停止。上述来源能够完整定义当前请求要求的全部主体时，Skill 执行者继续构建 Prompt。

Skill 执行者必须把选定内容组装成一条自然语言主体明确、关系清楚、可直接输入 Krea2 的正向 Prompt。该 Prompt 正文直接以画面质量、动漫媒介或主体描述开头，只描述一幅画面，不写“根据规则”“已读取资料”“完成自检”“以下是 Prompt”或其他引导句，也不包含候选 Prompt、批量编号、路线说明、参数推荐内容、约束清单或制作备注。

## 完成前自检

Skill 执行者提交最终 Prompt 前必须逐项确认：

1. `positive_prompt` 只包含一条 Prompt 正文，并且正文描述一幅画面；
2. `positive_prompt` 的第一个句子已经开始描述画面，Prompt 前后没有引导句或说明段落；
3. 当前明确要求已经采用，明确排除的内容没有重新出现；
4. `positive_prompt` 中的人物身份、外观与画风内容来自“构建单条 Krea2 动漫 Prompt”章节规定的六类来源；Character 或 Style 上下文记录只采用非空 `data.prompt_text`，MCP 查询结果只采用完成候选比较后选中的角色或画师 Prompt；
5. 人物身份、外观、服装、动作、镜头、场景和光线之间不存在可见冲突；
6. 背景符合当前普通文字中的明确要求；用户未指定背景时，背景具体、绚丽、具有静态空间层次，并且主体轮廓清楚；
7. 动作迁移路线已经满足 `references/motion-migration-constraints.md` 的全部检查项；
8. Prompt 不包含负向提示词、内部文件说明、人类可读检查项或生成器调用说明。

全部检查通过后，Skill 执行者必须在决定生成目的、正向规避策略和目标尺寸以前，完整读取 `references/generation-output-contract.md`、`references/generation-output-schema.json` 与 `references/generation-profiles.json`。Skill 执行者按这些参考构造一个结构化生成结果，再按 `references/generation-output-contract.md` 规定的校验接口校验该结果。

最终回答必须是通过生成结果校验器的结构化结果。
