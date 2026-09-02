---
name: krea2-anime-prompt-builder
description: 根据用户的自然语言画面要求、当前消息中的 Character/Style 选择、构建过程中采用的语义目录结果和可选历史 ComfyUI Generation Run，构建一条 Krea2 动漫角色提示词；支持展示图与舞蹈或姿态迁移源图，也可按一个或多个 run_id 独立查询历史生成参数和 Actual Workflow。用户要求生成、改写、补全或检查 Krea2 动漫 Prompt，设计动漫全身角色或动作迁移源图，或查询历史 run_id 时使用。
---

# Krea2 Anime Prompt Builder

## 查询或复用历史 Generation Run

用户要求读取、核对或复用一个或多个 `run_id` 对应的生成参数或 Actual Workflow 时，Skill 执行者必须在第一条查询命令前完整读取 `references/generation-cli.md`，再按该文件调用 `generation run-inputs --stdin`。当前上下文经过压缩而不再完整保留该文件时，Skill 执行者必须在下一条 CLI 命令前重新完整读取该文件。

Skill 执行者必须按查询结果的 `runs[]` 顺序分别处理每个 `run_id`。`lookup_status: "available"` 的结果使用 CLI 返回的完整 canonical `run_id`、`arguments`、`workflow_status` 以及对应的 `workflow` 或 `workflow_error`；`lookup_status: "error"` 的结果使用 CLI 原样返回的请求 `run_id`、`error.code` 和 `error.message`。Skill 执行者不得为错误结果猜测完整 Run ID。一个 `run_id` 返回错误项时，Skill 执行者继续处理其余结果。

用户只要求查询历史 Generation Run 时，Skill 执行者按顺序报告查询结果后结束本次执行。用户还要求构建或修改 Krea2 Prompt 时，Skill 执行者完成查询后继续执行本文件的 Prompt 流程；用户明确要求复用某个可用结果的历史正向 Prompt 时，Skill 执行者读取该结果实际保存的 `arguments.parameters.positive_prompt` 作为输入。

CLI 返回命令级错误、逐项错误或可修正请求时，Skill 执行者只执行 `references/generation-cli.md` 已定义的报告、修正与重试规则。本 Skill 不增加自动分组查询、结果候选协议或额外历史查询输出格式。

## 读取当前回合输入

需要构建 Prompt 时，Skill 执行者必须完整读取 `references/input-contract.md`，再按该文件读取当前消息中的普通文字、Character 记录和 Style 记录。Skill 执行者必须按消息中的出现顺序处理 `comfyui-context` 记录。Character/Style 记录中的非空 `data.prompt_text` 是直接 Prompt 来源；缺少 `data.prompt_text` 时，记录中的 ID、名称和所属作品只用于本文件规定的目录查询与候选消歧。

以下三类内容构成本次可用 Prompt 输入：

1. 当前用户普通文字中的画面要求、修改、排除或路线要求；
2. 用户明确选定的历史正向 Prompt；
3. 当前消息中的可识别 Character/Style 记录，包括可直接采用的 `data.prompt_text` 或可用于目录查询的 ID、名称和所属作品。

三类内容全部不存在时，Skill 执行者必须请用户提供具体画面要求或有效 Character/Style 选择，然后停止。当前请求没有要求历史查询时，Skill 执行者不调用 `generation run-inputs --stdin`；Prompt 构建分支可以按后文调用语义目录 CLI。所有分支都不调用任何生成器。

## 构建单条 Krea2 动漫 Prompt

Skill 执行者必须完整读取 `references/krea2-prompt-rules.md`，并按以下优先级采用内容：

1. 当前普通文字中的明确画面要求、修改、排除和路线要求；
2. 用户明确选定的历史正向 Prompt 基线；
3. 按消息顺序读取且不与前两项冲突的 Character/Style `data.prompt_text`；
4. 按语义目录查询合同采用的角色、画师与 Prompt 词条；
5. 当前画面需要的条件参考资料；
6. `references/krea2-prompt-rules.md` 定义的 Krea2 动漫默认设计。

两个当前明确要求无法同时成像，并且上述优先级不能消解冲突时，Skill 执行者必须指出互斥的两个具体要求，请用户选择后停止。

用户明确要求舞蹈迁移、姿态迁移、动作迁移或迁移源图时，Skill 执行者必须读取 `references/motion-migration-constraints.md`，并执行动作迁移路线。其他请求执行展示路线。动作迁移路线的构图、四肢可见性、鞋履、人物比例和背景约束属于该路线的完成条件。

Skill 执行者只在画面需要对应内容时读取下列资料，并且只能采用表中列出的内容：

| 画面需要 | 读取文件 | 允许采用的内容 |
| --- | --- | --- |
| 用户指定动漫画风，或需要补齐动漫画风方向 | `references/anime-style-presets.md` | 各预设的“画风推荐”中描述渲染媒介、线条、上色、明暗或纹理的词语，以及“配色”字段；`action lines`、`impact frames` 和其他动作、运动效果词语不属于画风内容。 |
| 国风、仙侠、东方幻想或游戏角色的服装原型与服装家族 | `references/游戏服装多样性库.md` | “代表女角色与服装原型”中的服装剪裁、服装部件、材质和穿戴配饰，以及“常用色板”；鞋履、武器、发型、背景和旧路线说明不属于服装内容。 |

条件资料中的背景、姿态、动作迁移、人物比例、构图、镜头、防裁切和鞋履说明均不参与 Builder 执行。`references/krea2-prompt-rules.md` 和动作迁移路线使用的 `references/motion-migration-constraints.md` 是 Builder 的背景设计、主体分离、姿态、比例、构图和鞋履合同。Skill 执行者不得使用条件资料或其他保留资产替换这两个文件的规则。

## 查询目录中的作品、角色、画师和 Prompt 词条

以下任一情况发生时，Skill 执行者必须在第一条语义目录命令前完整读取 `references/semantic-query-cli.md`，再按该文件执行查询、候选比较、字段采用、错误处理和重试：

1. 当前普通文字出现作品、系列或 IP，且 Skill 执行者需要确认作品身份或取得该作品的角色名称；
2. 用户指定角色，但当前 Character 记录没有非空 `data.prompt_text`，或者作品与角色身份存在歧义；
3. 作品查询返回的 `character_names` 中存在本幅画面需要的角色，并且需要取得该角色的 `prompt_text`；
4. 用户指定具体画师，但当前 Style 记录没有非空 `data.prompt_text`，或者画师身份存在歧义；
5. 用户没有指定具体画师，并且当前消息没有包含非空 `data.prompt_text` 的 Style 记录；
6. 用户使用自然语言描述外貌、服装、动作、表情、构图、场景、光线或氛围，但已读取的 Krea2 规则与条件资料不能确定精确 Prompt 标签，或者存在两个以上画面含义不同的相近标签；
第 5 种情况中，Skill 执行者必须先根据已确定的画面设计形成具体画师方向，再按 `references/semantic-query-cli.md` 查询 Krea2 底模和该底模下的 Style 记录。目录没有合适 Style 结果时，Skill 执行者继续使用已经读取的动漫画风资料与 Krea2 默认设计，不把其他底模的 Style 记录作为 Krea2 结果。

当前上下文经过压缩而不再完整保留 `references/semantic-query-cli.md` 时，Skill 执行者必须在下一条语义目录命令前重新完整读取该文件。以上六种情况均未发生时，Skill 执行者不读取该文件，也不调用 `imagegen-semantic-query`。

全部 Character 查询结束后，Skill 执行者必须检查当前请求要求出现的每名主体。某名必需主体对应的 Character 记录没有非空 `data.prompt_text`，目录查询也没有返回可采用的 `prompt_text`，并且当前普通文字、用户选定的历史正向 Prompt 或其他合法来源仍不能完整定义该主体时，Skill 执行者必须报告具体 Character 名称或 ID 没有可用 Prompt 内容，请用户补充该主体的外观与身份要求或选择包含有效 `data.prompt_text` 的 Character 记录，然后停止。其他来源只有在能够完整定义当前请求要求的全部主体时，Skill 执行者才继续构建 Prompt。

Skill 执行者必须把选定内容组装成一条自然语言主体明确、关系清楚、可直接输入 Krea2 的 Prompt。成功构建 Prompt 时，最终回答必须直接以 Prompt 正文的画面质量、动漫媒介或主体描述开头，并且只包含一个 Prompt 正文段落。Prompt 正文不写“根据规则”“已读取资料”“完成自检”“以下是 Prompt”或其他引导句，也不同时提供候选 Prompt、负向 Prompt、批量编号、路线说明、参数建议、约束清单或制作备注。

## 完成前自检

Skill 执行者提交最终 Prompt 前必须逐项确认：

- 最终输出只有一条 Prompt 正文，并且正文描述一幅画面；
- 最终回答的第一个句子已经开始描述画面，Prompt 前后没有引导句或说明段落；
- 当前明确要求已经采用，明确排除的内容没有重新出现；
- Character 与 Style 内容只来自对应记录的非空 `data.prompt_text` 或语义目录查询中被采用候选的对应 `prompt_text`；
- 人物身份、外观、服装、动作、镜头、场景和光线之间不存在可见冲突；
- 背景是具体、绚丽、具有静态空间层次的场景，主体轮廓仍然清楚；
- 动作迁移路线已经满足 `references/motion-migration-constraints.md` 的全部检查项；
- Prompt 不包含负向提示词、内部文件说明、人类可读检查项或生成器调用说明。

全部检查通过后，Skill 执行者直接返回最终 Prompt 正文，最终回答的第一字符就是 Prompt 正文的第一字符。本 Skill 不创建输出目录或编号文件。
