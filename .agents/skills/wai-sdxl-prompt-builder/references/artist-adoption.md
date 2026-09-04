# 画师采用规则

## 用途与读取时机

本文件规定 Skill 执行者如何采用当前用户消息直接提供的画师 Prompt、Style 上下文记录、用户指定复用的历史 Generation Run 画师 Prompt 和 Style 查询结果，以及如何把采用的画师 Prompt 写入 `artist` 数组。

当前用户消息满足以下任一条件时，Skill 执行者读取本文件：用户直接提供画师 Prompt；消息包含 Style 上下文记录；用户指定复用历史 Generation Run 中的画师 Prompt；用户指定、增加、替换或排除具体画师；用户给出画师风格方向但没有指定具体画师；用户要求组合多个画师。

本次调用需要执行 Style 语义查询时，Skill 执行者在本次调用的第一次 Style 语义查询前完整读取 [Prompt 内容查询 CLI](semantic-tool-orchestration.md)。

## 画师 Prompt 来源

Skill 执行者按照 [WAI Prompt 位置顺序与职责](wai-prompt-position-order.md)的“Character 和 Style Prompt 来源”一节，为每名画师确定一项已采用 Style Prompt 来源和对应的已采用 Style Prompt 内容。

当前用户消息直接提供一名画师的非空 Prompt 并要求采用时，Skill 执行者采用该 Prompt，不再处理该画师的其他 Prompt 来源。

当前用户消息没有直接提供该画师的非空 Prompt，并且对应的 Style 上下文记录没有提供非空 `data.prompt_text` 时，用户指定复用历史 Generation Run 输入中该画师的非空 Prompt，Skill 执行者采用该 Prompt，不为取得该画师的另一条 Prompt 执行 Style 查询。

用户没有替换或排除已采用 Style Prompt 来源对应的画师时，Skill 执行者保留该画师的 Style Prompt 来源和内容。用户要求新增画师时，Skill 执行者保留未被排除画师的 Style Prompt 来源和内容，并按照本节为新增画师确定一项来源；前三类来源均未提供新增画师的非空 Prompt 时，Skill 执行者为新增画师执行 Style 查询。用户要求替换画师时，Skill 执行者移除被替换画师的已采用 Style Prompt 来源和内容，并按照本节为替换后的画师确定一项来源。用户要求排除画师时，Skill 执行者移除该画师的已采用 Style Prompt 来源和内容，不为该画师创建 `artist` 数组元素。

## Style 上下文记录中的画师

Style 上下文记录的字段和处理顺序由 [当前用户消息输入合同](input-contract.md) 定义。

当前用户消息没有直接提供该画师的非空 Prompt，并且 Style 上下文记录包含非空 `data.prompt_text` 时，Skill 执行者采用该字段作为画师 Prompt。当前用户消息和用户指定复用的历史 Generation Run 输入都没有提供该画师的非空 Prompt，并且 Style 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 按照 [Prompt 内容查询 CLI](semantic-tool-orchestration.md) 执行一次 Style Resolve。Resolve 结果的 `base_model_id` 不等于本次调用中 Base Model Search 返回的 WAI Base Model ID 时，Skill 执行者报告 Style 上下文记录的 `data.id`、实际 `base_model_id` 和 WAI Base Model ID，并停止该 Style 查询目标。Resolve 结果的 `base_model_id` 等于 WAI Base Model ID 且 `prompt_text` 为非空字符串时，Skill 执行者采用该 `prompt_text`；`base_model_id` 相等但 `prompt_text` 为空，或者 Resolve 没有返回结果时，Skill 执行者按照该 CLI 的 Style 空结果规则处理。`data.id` 缺失或不符合该格式时，Skill 执行者使用非空 `data.name` 执行一次 Style Search，并按照“用户指定画师”一节的名称比较和候选选择规则采用查询结果。Style Search 没有可采用结果时，Skill 执行者按照该 CLI 的 Style 空结果规则处理。两个字段都不能提供查询值时，Skill 执行者报告缺少画师名称，并且不为该记录创建 `artist` 数组元素。

## 用户指定画师

用户指定具体画师，当前用户消息没有该画师对应的 Style 上下文记录，并且当前用户消息直接提供的画师 Prompt 与用户指定复用的历史 Generation Run 画师 Prompt 均未提供该画师的非空 Prompt 时，Skill 执行者使用用户给出的画师名称执行一次 Style Search。当前用户消息直接提供的画师 Prompt 和用户指定复用的历史 Generation Run 画师 Prompt 均未提供该画师的非空 Prompt，但存在该画师对应的 Style 上下文记录时，Skill 执行者按照“Style 上下文记录中的画师”一节处理该记录。

Style 语义查询返回候选后，Skill 执行者删除用户指定画师名称、候选 `name` 和 `aliases_json` 中每个名称的首尾空白，并对这些名称进行不区分大小写的比较。Skill 执行者把 `name` 或 `aliases_json` 中任一名称与用户指定画师名称相等，并且 `prompt_text` 为非空字符串的候选列为可采用候选。只有一个可采用候选时，Skill 执行者采用该候选的 `prompt_text`；没有可采用候选时，Skill 执行者按照 [Prompt 内容查询 CLI](semantic-tool-orchestration.md) 的 Style 空结果规则处理；有多个可采用候选时，Skill 执行者报告每个可采用候选的 `id`、`name`、`aliases_json` 和 `style_description`，并在用户选择一个候选后采用该候选的 `prompt_text`。

## 用户未指定画师

用户要求新增或选择画师，但只给出画师风格方向而未给出具体画师名称时，Skill 执行者执行以下步骤：

1. Skill 执行者根据用户要求、选定构图、主体、动作、环境和画面重点，分别写出需要画师呈现的媒介、线条、上色、明暗、纹理和配色特点。
2. Skill 执行者读取 [画师画风查询预置词](artist-style-query-vocabulary.md)，并选择能够表达这些特点的查询词。
3. Skill 执行者默认把步骤 2 选出的全部查询词组合成一组，并使用该组查询词执行一次 Style Search。用户明确要求多个不同画风方向时，Skill 执行者按照每个画风方向对步骤 1 的视觉特点分组，再为每组选择对应的预置查询词并执行一次 Style Search。
4. Skill 执行者分别处理步骤 3 产生的每组查询结果。对于每组查询结果，Skill 执行者把 `style_description` 明确描述该组每项视觉特点且 `prompt_text` 为非空字符串的候选列为匹配候选。用户没有要求从同一画风方向采用多个画师时，该组只有一个匹配候选则采用该候选的 `prompt_text`，没有匹配候选则按照 [Prompt 内容查询 CLI](semantic-tool-orchestration.md) 的 Style 空结果规则处理，有多个匹配候选则报告每个匹配候选的 `id`、`name`、`aliases_json` 和 `style_description`，并在用户选择一个候选后采用该候选的 `prompt_text`。
5. 用户要求从同一画风方向采用多个画师时，Skill 执行者报告该组全部匹配候选的 `id`、`name`、`aliases_json` 和 `style_description`。用户给出具体画师数量时，匹配候选数量等于该数量则采用全部匹配候选的 `prompt_text`，匹配候选数量大于该数量则在用户选出该数量的候选后采用每个选中候选的 `prompt_text`，匹配候选数量小于该数量则报告现有候选数量和缺少的数量，并在用户调整画师数量或画风方向前停止本次执行。用户只要求多个画师但没有给出具体数量时，至少两个匹配候选才满足要求；Skill 执行者在用户选择两个或更多匹配候选后采用每个选中候选的 `prompt_text`，匹配候选少于两个时报告现有候选数量，并在用户调整画师数量或画风方向前停止本次执行。

## 取得画师说明

Skill 执行者为每名已采用画师取得非空 `style_description`，再处理该画师与其他视觉内容的冲突。画师来自 Style 语义查询结果时，Skill 执行者采用该结果中的非空 `style_description`；该字段为空时，Skill 执行者报告该画师缺少 `style_description`，并在用户补充画师说明或选择其他画师前停止本次执行。

当前用户消息明确提供某名已采用画师的非空画风说明时，Skill 执行者采用该说明作为该画师的 `style_description`，不再为该画师查询说明。

画师直接采用 Style 上下文记录的 `data.prompt_text` 时，Skill 执行者使用该记录中符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 执行一次 Style Resolve。Style Resolve 结果的 `base_model_id` 不等于 WAI Base Model ID 时，Skill 执行者报告 Style 上下文记录的 `data.id`、实际 `base_model_id` 和 WAI Base Model ID，并停止该 Style 查询目标。Resolve 结果的 `base_model_id` 等于 WAI Base Model ID，并且 `style_description` 为非空字符串时，Skill 执行者采用该字段。Resolve 没有返回结果，或者结果的 `base_model_id` 等于 WAI Base Model ID 但 `style_description` 为空时，Skill 执行者报告该画师缺少 `style_description`。`data.id` 缺失或不符合该格式时，Skill 执行者使用非空 `data.name` 执行一次 Style Search。Skill 执行者删除 `data.name`、结果 `name` 和 `aliases_json` 中每个名称的首尾空白，并进行不区分大小写的比较；Skill 执行者把 `name` 或 `aliases_json` 中任一名称与 `data.name` 相等且 `style_description` 为非空字符串的结果列为可采用说明。只有一项可采用说明时，Skill 执行者采用该结果的 `style_description`；没有可采用说明时，Skill 执行者报告该画师缺少 `style_description`；有多项可采用说明时，Skill 执行者报告每项结果的 `id`、`name`、`aliases_json` 和 `style_description`，并在用户选择一项后采用该项的 `style_description`。Style 上下文记录不能提供查询值时，Skill 执行者报告该画师缺少 `style_description`。Skill 执行者报告缺少 `style_description` 后，在用户补充画师信息或选择其他画师前停止本次执行。

画师 Prompt 来自当前用户消息或历史 Generation Run 输入时，Skill 执行者使用该来源为画师提供的名称执行一次 Style Search，并按照“用户指定画师”一节的名称比较规则选择结果。唯一符合名称的结果包含非空 `style_description` 时，Skill 执行者采用该字段，但继续使用原来源提供的画师 Prompt。来源没有提供画师名称、没有唯一符合名称的结果或所选结果的 `style_description` 为空时，Skill 执行者报告该画师缺少 `style_description`，并在用户补充画师名称、画师说明或选择其他画师前停止本次执行。

## 多个画师

画师由某个画风方向的查询结果产生时，Skill 执行者先把该查询组的每项视觉特点分配给该画师。用户明确指定某项视觉特点的负责画师时，用户指定的分配替代该项视觉特点的查询组默认分配。应用上述两条规则后，某项视觉特点仍没有负责画师时，Skill 执行者报告该项视觉特点和全部已采用画师，请求用户指定一名或多名负责该项视觉特点的画师，并在收到用户选择前停止本次执行。

全部视觉特点分配完成后，Skill 执行者检查每名画师的 `style_description` 是否明确描述分配给该画师的每项视觉特点，并检查不同画师是否针对同一视觉属性提出互相排斥的要求。两个条件同时满足时，Skill 执行者共同采用这些画师。任一条件不满足时，Skill 执行者报告每名画师的 `style_description` 未描述的已分配视觉特点，以及不同画师针对同一视觉属性提出的互相排斥要求。Skill 执行者请求用户列出需要保留的画师、需要保留的视觉特点，以及每项保留视觉特点对应的一名或多名负责画师，并在收到完整选择和分配关系前停止本次执行。收到完整选择和分配关系后，Skill 执行者按照该关系分配视觉特点，并再次检查上述两个条件。

用户给出全部已采用画师的完整顺序时，Skill 执行者按照该顺序排列画师。用户只给出部分已采用画师的顺序时，Skill 执行者报告全部已采用画师，请求用户给出完整顺序，并在收到完整顺序前停止本次执行。用户没有指定画师顺序时，Skill 执行者按照以下位置排列画师：当前用户消息直接提供的画师 Prompt 采用该 Prompt 首次出现的位置；Style 上下文记录提供的画师采用该记录首次出现的位置；历史 Generation Run 输入提供的画师采用用户指定复用这些画师的顺序；用户指定具体画师并通过 Style Search 取得 Prompt 时，采用该画师名称在当前用户消息中首次出现的位置；由画风方向查询结果产生的画师采用对应画风方向首次出现的位置。同一画风方向产生多个已采用画师时，用户选择这些画师的顺序决定其排列顺序；Skill 执行者因匹配候选数量等于用户指定数量而直接采用全部匹配候选时，按照 Style Search `results` 数组中的顺序排列这些画师。

主要作用表示该画师决定整体画风，辅助作用表示该画师只负责局部补充效果，中性作用表示多名画师以相同作用共同决定整体画风。用户为全部画师指定主要、辅助或中性作用时，Skill 执行者按照用户要求设置每名画师。用户只为部分画师指定主要、辅助或中性作用时，Skill 执行者先设置用户已经指定的画师，再报告尚未指定作用的画师，请求用户为这些画师选择主要、辅助或中性作用，并在收到用户选择前停止本次执行。用户没有为任何画师指定作用、全部画师均同等承担整体画风，并且没有画师只负责局部补充效果时，Skill 执行者把全部画师都设为中性画师。用户没有为任何画师指定作用，且用户要求或已经列出的视觉特点明确区分整体画风与局部补充效果时，Skill 执行者把负责整体画风的画师设为主要画师，把只负责局部补充效果的画师设为辅助画师。其余情况下，Skill 执行者报告每名画师负责的视觉特点，请求用户为每名画师选择主要、辅助或中性作用，并在收到用户选择前停止本次执行。

## 画师与其他视觉内容

具体画师 Prompt 的目标位置是 `artist`，普通画风、媒介、渲染、摄影效果和数字效果 Prompt 的目标位置是 `non_artist_style`，整体画面情绪 Prompt 的目标位置是 `detail_mood`，光线 Prompt 的目标位置是 `lighting`。Skill 执行者先按照“写入 `artist` 数组”一节创建 `artist` 数组元素，再处理这些位置之间的冲突。

Skill 执行者记录每项 `style_description` 的实际数据来源。该字段来自 Style Resolve 或 Style Search 结果时，实际数据来源是对应查询结果；该字段由用户补充时，实际数据来源是当前用户消息。执行 Prompt 冲突比较时，每项 `style_description` 继承对应画师的已采用 Style Prompt 来源优先级。用户只提供画师名称并通过 Style Search 取得 Prompt 时，该画师的 Prompt 和 `style_description` 均使用 Style 查询结果优先级。`non_artist_style`、`detail_mood` 和 `lighting` 中的每项 Prompt 使用产生该内容的来源优先级。

Skill 执行者逐项比较 `non_artist_style`、`detail_mood` 和 `lighting` 中的每项 Prompt 与每名已采用画师的 `style_description`。同一视觉属性的两项要求互相排斥时，Skill 执行者按照 [Prompt 冲突规则](prompt-conflict-rules.md)规定的五级来源优先级保留较高优先级内容。被删除内容属于画师的 `style_description` 时，Skill 执行者从已采用画师集合中移除该画师及其 Style Prompt 来源和内容，并删除该画师对应的 `artist` 数组元素；被删除内容属于普通视觉内容 Prompt 时，Skill 执行者从对应位置的待组合内容中删除该 Prompt。同一最高优先级包含两项互斥要求时，Skill 执行者报告两项要求及其来源，请求用户选择，并在收到选择前停止本次执行。

Skill 执行者每次从已采用画师集合中移除画师后，删除该画师负责视觉特点的分配关系；仍需保留的视觉特点没有负责画师时，Skill 执行者按照“多个画师”一节的分配规则请求用户重新指定负责画师。移除后仍有多个画师时，Skill 执行者重新执行“多个画师”一节的画师说明检查、视觉特点分配、兼容性检查、排列和作用设置。

## 写入 `artist` 数组

Skill 执行者按照 [WAI 画师语法](wai-artist-syntax.md) 的规则，把每名画师的 Prompt 转换为 `artist` 数组中的一个元素。

## 缺少画师 Prompt

Skill 执行者完成“画师 Prompt 来源”一节规定的来源选择后，如果某名画师仍没有已采用的非空 Style Prompt 内容，则不为该画师创建 `artist` 数组元素。
