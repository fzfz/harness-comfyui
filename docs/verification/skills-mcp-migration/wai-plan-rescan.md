---
文档用途: 记录 WAI Skill 对迁移计划第 5.5 节的独立逐字回扫结果
读取时机: 判断 WAI 迁移步骤是否满足计划及引用清理要求时
---

# WAI 迁移计划独立回扫

## 1. 结论

1. 当前第 1—20 项指定文字均逐字匹配，未授权修改区域均与基线一致。第 21 项的文件删除已完成，文字引用清理未通过；本次回扫结论为未通过。
2. 本报告核对计划符合性；语义审计与真实模型验收由各自的验收记录承载。

## 2. 基线与比较范围

1. 回扫时间：`2026-10-13T15:10:51+08:00`。工作目录：`/Users/fzfz/.codex/worktrees/skills-mcp-migration/harness-comfyui`。
2. Git 基线：`57bd76d522a3a88c7b153bd78b5be4691dc8bd33`。修改前目录为 `.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/`，其 76 个文件逐文件、逐字节等于该提交中的对应文件。
3. 修改后目录为 `.agents/skills/wai-sdxl-prompt-builder/`，共 75 个文件。比较覆盖全部文件的完整内容；69 个文件逐字节相同，6 个文件修改，1 个文件删除。
4. 计划来源为 `docs/plans/skills-mcp-migration-20261013.md` 第 573—890 行及第 1134—1144 行。逐字比较保留空格、标点和换行，仅去除计划代码块的四空格容器缩进。
5. 对修改前文件依次应用第 1—20 项指定替换及删除，再删除第 21 项指定文件，所得完整目录逐字节等于修改后目录。第 4 节保存本轮实际 Git diff，关联本次文件版本。

## 3. 逐项核对

### 3.1 第 1 项：查询入口与词条采用

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:578`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/SKILL.md:71`（第 71—71 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/SKILL.md`，第 71—77 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.2 第 2 项：作品与角色素材

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:596`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/character.md:26`（第 26—28 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/character.md`，第 26—35 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.3 第 3 项：WAI 底模与画师素材

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:619`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/artist-adoption.md:9`（第 9—9 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md`，第 9—12 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.4 第 4 项：Style 上下文记录

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:634`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/artist-adoption.md:25`（第 25—25 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md`，第 28—28 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.5 第 5 项：指定画师查询

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:646`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/artist-adoption.md:29`（第 29—29 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md`，第 32—32 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.6 第 6 项：指定画师候选选择

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:658`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/artist-adoption.md:31`（第 31—31 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md`，第 34—34 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.7 第 7 项：画风方向与多个画师

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:670`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/artist-adoption.md:33`（第 33—41 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md`，第 36—44 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.8 第 8 项：完整画师说明

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:698`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/artist-adoption.md:43`（第 43—51 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md`，第 46—51 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.9 第 9 项：多个画师的排列顺序

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:723`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/artist-adoption.md:59`（第 59—59 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md`，第 59—59 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.10 第 10 项：画师说明的数据来源

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:735`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/artist-adoption.md:67`（第 67—67 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md`，第 67—67 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.11 第 11 项：缺少画师 Prompt

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:747`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/artist-adoption.md:77`（第 77—79 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md`，第 77—80 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.12 第 12 项：角色 Prompt 来源优先级

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:764`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md:33`（第 33—36 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md`，第 33—36 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.13 第 13 项：画师 Prompt 来源优先级

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:782`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md:42`（第 42—45 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md`，第 42—45 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.14 第 14 项：必选位置与目录词条

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:800`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md:67`（第 67—71 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md`，第 67—71 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.15 第 15 项：位置映射与来源身份

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:820`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md:75`（第 75—75 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md`，第 75—75 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.16 第 16 项：删除接口用途读取要求

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:832`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md:73`（第 73—73 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md`，第 71—75 行之间（原第 73 行已删除）。实际删除指定原文，该句在目标文件中出现次数为零。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.17 第 17 项：构图输入来源

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:838`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/composition-decision-tree.md:11`（第 11—11 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/composition-decision-tree.md`，第 11—11 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.18 第 18 项：构图词条与作品身份

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:850`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/composition-decision-tree.md:15`（第 15—15 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/composition-decision-tree.md`，第 15—15 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.19 第 19 项：构图要求合并顺序

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:862`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/composition-decision-tree.md:19`（第 19—19 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/composition-decision-tree.md`，第 19—19 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.20 第 20 项：非画师风格的词条引用

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:874`。原文位置：`.local/skills-mcp-migration-before/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/non-artist-style.md:17`（第 17—17 行）。
2. 目标位置：`.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/non-artist-style.md`，第 17—17 行。实际完整替换指定原文；目标块与计划逐字一致，原块已被替换。
3. 保留要求：本项之外的文字只接受该文件其他计划条目指定的变更；整文件重建比较通过。结论：通过。

### 3.21 第 21 项：迁入内容、删除查询文档与清理引用

1. 计划位置：`docs/plans/skills-mcp-migration-20261013.md:886`；引用清理要求位于第 1138 行。原文位置：修改前 `references/semantic-tool-orchestration.md:1`，共 197 行。修改后该文件不存在；删除要求通过。
2. 迁入内容：词条选择与空结果规则位于 `SKILL.md:73`；作品、角色候选与空结果规则位于 `references/prompt-position-rules/character.md:26`；WAI 底模及画师素材位于 `references/artist-adoption.md:9`；画师空结果规则位于该文件第 77 行。各目标块均与计划指定文字一致，原文件已整体删除；迁入要求通过。
3. 路径引用：当前项目 Skill 目录内 `semantic-tool-orchestration.md` 字符串出现次数为零。文字引用：`references/prompt-position-rules/non-artist-style.md:14` 仍写“按照语义查询接口文档采用的普通视觉概念”；第 37 行仍写“被采用的普通视觉概念准确使用语义查询接口文档规定的内容”。修改前该文件第 17 行将该文档链接到已删除文件，当前第 17 行仅替换为“词条采用”链接，前后两条要求仍指向原文档。引用清理要求未通过。
4. 实际影响：执行者采用普通视觉概念及完成检查时，仍被要求遵循已删除文档。该差异可从修改前后第 14、17、37 行及删除文件直接确认。
5. 授权边界：第 5.5 节要求替换未涉及文字保持原文，第 20 项仅授权替换第 17 行。第 14、37 行确实逐字保留，但与第 5.10 节的引用清理要求冲突。实施者应按第 5.10 节第 3、4 项补充这两处的完整目标文字并取得批准。第 21 项结论：未通过。

## 4. 本轮实际差异

1. 以下内容为本轮 `git diff -- .agents/skills/wai-sdxl-prompt-builder` 的完整输出。基线与该差异共同确定本次被审文件内容。

```diff
diff --git a/.agents/skills/wai-sdxl-prompt-builder/SKILL.md b/.agents/skills/wai-sdxl-prompt-builder/SKILL.md
index b3374e8..1fa29f8 100644
--- a/.agents/skills/wai-sdxl-prompt-builder/SKILL.md
+++ b/.agents/skills/wai-sdxl-prompt-builder/SKILL.md
@@ -68,7 +68,13 @@ Skill 执行者读取 [WAI Prompt 位置顺序与职责](references/wai-prompt-p

 ## 4. 查询缺少的角色、画师与风格效果 Prompt 内容

-本轮需要查询角色 Prompt、画师 Prompt，或者普通画风、媒介效果、摄影效果或数字效果的 Prompt 词条时，Skill 执行者在第一次查询前完整读取 [Prompt 内容查询 CLI](references/semantic-tool-orchestration.md)，并按照该文件取得查询结果。Skill 执行者把采用的查询结果写入对应的 Prompt 位置。
+本轮缺少角色 Prompt、画师 Prompt 或视觉概念的规范标签时，Skill 执行者通过 NoobAI MCP 获取素材。角色与作品的候选选择按 `references/prompt-position-rules/character.md`，画师选择按 `references/artist-adoption.md`，词条采用按本节“词条采用”执行。
+
+### 词条采用
+
+1. Skill 执行者按目标概念比较词条的规范标签与别名。只有一项符合时采用该项；多个候选表达相同含义时，按使用数量从大到小、ID 从小到大采用第一项；候选含义不同且 Skill 执行者无法根据用户要求确定唯一候选时，Skill 执行者报告候选标识、规范标签和别名，并等待用户选择。
+2. 没有可采用词条时，Skill 执行者把用户描述该概念的文字改写为一个不含逗号的英文小写短语。
+3. Skill 执行者按 `references/wai-prompt-position-order.md` 的“固定顺序和唯一职责”表，将选中的规范标签或英文短语写入唯一职责包含该概念的位置。

 ## 5. 处理冲突、设计权重并自检

diff --git a/.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md b/.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md
index c0039eb..66d64fd 100644
--- a/.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md
+++ b/.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md
@@ -6,7 +6,10 @@

 当前用户消息满足以下任一条件时，Skill 执行者读取本文件：用户直接提供画师 Prompt；消息包含 Style 上下文记录；用户指定复用历史 Generation Run 中的画师 Prompt；用户指定、增加、替换或排除具体画师；用户给出画师风格方向但没有指定具体画师；用户要求组合多个画师。

-本次调用需要执行 Style 语义查询时，Skill 执行者在本次调用的第一次 Style 语义查询前完整读取 [Prompt 内容查询 CLI](semantic-tool-orchestration.md)。
+## 查询 WAI 画师素材
+
+1. Skill 执行者通过 NoobAI MCP 获取画师素材前，先确定名称精确为 `wai` 的唯一底模。底模缺失或重名时，Skill 执行者报告实际结果，并停止本次任务的画师查询。
+2. 已有画师记录 ID 时，Skill 执行者优先获取对应记录；用户指定画师名称而没有 ID 时，按名称查找；用户未指定画师时，使用“用户未指定画师”形成的画风查询词搜索。只采用与该 WAI 底模关联的素材；素材属于其他底模时，Skill 执行者报告素材标识、实际底模与所需底模，并停止采用该素材。

 ## 画师 Prompt 来源

@@ -22,13 +25,13 @@ Skill 执行者按照 [WAI Prompt 位置顺序与职责](wai-prompt-position-ord

 Style 上下文记录的字段和处理顺序由 [当前用户消息输入合同](input-contract.md) 定义。

-当前用户消息没有直接提供该画师的非空 Prompt，并且 Style 上下文记录包含非空 `data.prompt_text` 时，Skill 执行者采用该字段作为画师 Prompt。当前用户消息和用户指定复用的历史 Generation Run 输入都没有提供该画师的非空 Prompt，并且 Style 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 按照 [Prompt 内容查询 CLI](semantic-tool-orchestration.md) 执行一次 Style Resolve。Resolve 结果的 `base_model_id` 不等于本次调用中 Base Model Search 返回的 WAI Base Model ID 时，Skill 执行者报告 Style 上下文记录的 `data.id`、实际 `base_model_id` 和 WAI Base Model ID，并停止该 Style 查询目标。Resolve 结果的 `base_model_id` 等于 WAI Base Model ID 且 `prompt_text` 为非空字符串时，Skill 执行者采用该 `prompt_text`；`base_model_id` 相等但 `prompt_text` 为空，或者 Resolve 没有返回结果时，Skill 执行者按照该 CLI 的 Style 空结果规则处理。`data.id` 缺失或不符合该格式时，Skill 执行者使用非空 `data.name` 执行一次 Style Search，并按照“用户指定画师”一节的名称比较和候选选择规则采用查询结果。Style Search 没有可采用结果时，Skill 执行者按照该 CLI 的 Style 空结果规则处理。两个字段都不能提供查询值时，Skill 执行者报告缺少画师名称，并且不为该记录创建 `artist` 数组元素。
+当前用户消息没有直接提供该画师的非空 Prompt，并且 Style 上下文记录包含非空 `data.prompt_text` 时，Skill 执行者采用该字段作为画师 Prompt。当前消息、该上下文记录和用户指定复用的历史 Generation Run 均未提供该画师的非空 Prompt 时，Skill 执行者按“查询 WAI 画师素材”取得该记录的素材，已有 ID 时，Skill 执行者核对返回资源的 ID 与该记录一致，并采用符合本节底模要求的非空 Prompt；按名称搜索时，Skill 执行者按“用户指定画师”选择候选。没有可采用结果时，按“缺少画师 Prompt”处理。记录既无 ID 也无名称时，Skill 执行者报告缺少画师名称，并且不为该记录创建 `artist` 数组元素。

 ## 用户指定画师

-用户指定具体画师，当前用户消息没有该画师对应的 Style 上下文记录，并且当前用户消息直接提供的画师 Prompt 与用户指定复用的历史 Generation Run 画师 Prompt 均未提供该画师的非空 Prompt 时，Skill 执行者使用用户给出的画师名称执行一次 Style Search。当前用户消息直接提供的画师 Prompt 和用户指定复用的历史 Generation Run 画师 Prompt 均未提供该画师的非空 Prompt，但存在该画师对应的 Style 上下文记录时，Skill 执行者按照“Style 上下文记录中的画师”一节处理该记录。
+用户指定具体画师，当前用户消息没有对应的 Style 上下文记录，并且当前用户消息和用户指定复用的历史 Generation Run 均未提供该画师的非空 Prompt 时，Skill 执行者按“查询 WAI 画师素材”使用用户给出的画师名称取得素材。存在对应 Style 上下文记录时，Skill 执行者按“Style 上下文记录中的画师”处理该记录。

-Style 语义查询返回候选后，Skill 执行者删除用户指定画师名称、候选 `name` 和 `aliases_json` 中每个名称的首尾空白，并对这些名称进行不区分大小写的比较。Skill 执行者把 `name` 或 `aliases_json` 中任一名称与用户指定画师名称相等，并且 `prompt_text` 为非空字符串的候选列为可采用候选。只有一个可采用候选时，Skill 执行者采用该候选的 `prompt_text`；没有可采用候选时，Skill 执行者按照 [Prompt 内容查询 CLI](semantic-tool-orchestration.md) 的 Style 空结果规则处理；有多个可采用候选时，Skill 执行者报告每个可采用候选的 `id`、`name`、`aliases_json` 和 `style_description`，并在用户选择一个候选后采用该候选的 `prompt_text`。
+MCP 返回候选后，Skill 执行者删除用户指定画师名称、候选名称和每个别名的首尾空白，再进行不区分大小写的比较。名称或任一别名与用户指定名称相等且具有非空 Prompt 的候选可以采用。只有一个可采用候选时，Skill 执行者采用其画师 Prompt；没有可采用候选时，按“缺少画师 Prompt”处理；有多个可采用候选时，Skill 执行者报告候选标识、名称、别名和画风说明，等待用户选择后采用选中候选的 Prompt。

 ## 用户未指定画师

@@ -36,19 +39,16 @@ Style 语义查询返回候选后，Skill 执行者删除用户指定画师名

 1. Skill 执行者根据用户要求、选定构图、主体、动作、环境和画面重点，分别写出需要画师呈现的媒介、线条、上色、明暗、纹理和配色特点。
 2. Skill 执行者读取 [画师画风查询预置词](artist-style-query-vocabulary.md)，并选择能够表达这些特点的查询词。
-3. Skill 执行者默认把步骤 2 选出的全部查询词组合成一组，并使用该组查询词执行一次 Style Search。用户明确要求多个不同画风方向时，Skill 执行者按照每个画风方向对步骤 1 的视觉特点分组，再为每组选择对应的预置查询词并执行一次 Style Search。
-4. Skill 执行者分别处理步骤 3 产生的每组查询结果。对于每组查询结果，Skill 执行者把 `style_description` 明确描述该组每项视觉特点且 `prompt_text` 为非空字符串的候选列为匹配候选。用户没有要求从同一画风方向采用多个画师时，该组只有一个匹配候选则采用该候选的 `prompt_text`，没有匹配候选则按照 [Prompt 内容查询 CLI](semantic-tool-orchestration.md) 的 Style 空结果规则处理，有多个匹配候选则报告每个匹配候选的 `id`、`name`、`aliases_json` 和 `style_description`，并在用户选择一个候选后采用该候选的 `prompt_text`。
-5. 用户要求从同一画风方向采用多个画师时，Skill 执行者报告该组全部匹配候选的 `id`、`name`、`aliases_json` 和 `style_description`。用户给出具体画师数量时，匹配候选数量等于该数量则采用全部匹配候选的 `prompt_text`，匹配候选数量大于该数量则在用户选出该数量的候选后采用每个选中候选的 `prompt_text`，匹配候选数量小于该数量则报告现有候选数量和缺少的数量，并在用户调整画师数量或画风方向前停止本次执行。用户只要求多个画师但没有给出具体数量时，至少两个匹配候选才满足要求；Skill 执行者在用户选择两个或更多匹配候选后采用每个选中候选的 `prompt_text`，匹配候选少于两个时报告现有候选数量，并在用户调整画师数量或画风方向前停止本次执行。
+3. Skill 执行者默认把步骤 2 选出的全部查询词组合成一组，并按“查询 WAI 画师素材”使用该组查询词获取候选。用户明确要求多个不同画风方向时，Skill 执行者按照每个画风方向对步骤 1 的视觉特点分组，再为每组选择对应的预置查询词并分别获取候选。
+4. Skill 执行者分别处理步骤 3 产生的每组查询结果。对于每组查询结果，Skill 执行者把画风说明明确描述该组每项视觉特点且 画师 Prompt 非空的候选列为匹配候选。用户没有要求从同一画风方向采用多个画师时，该组只有一个匹配候选则采用该候选的画师 Prompt，没有匹配候选则按照“缺少画师 Prompt”处理，有多个匹配候选则报告每个匹配候选的 标识、名称、别名和画风说明，并在用户选择一个候选后采用该候选的画师 Prompt。
+5. 用户要求从同一画风方向采用多个画师时，Skill 执行者报告该组全部匹配候选的 标识、名称、别名和画风说明。用户给出具体画师数量时，匹配候选数量等于该数量则采用全部匹配候选的画师 Prompt，匹配候选数量大于该数量则在用户选出该数量的候选后采用每个选中候选的画师 Prompt，匹配候选数量小于该数量则报告现有候选数量和缺少的数量，并在用户调整画师数量或画风方向前停止本次执行。用户只要求多个画师但没有给出具体数量时，至少两个匹配候选才满足要求；Skill 执行者在用户选择两个或更多匹配候选后采用每个选中候选的画师 Prompt，匹配候选少于两个时报告现有候选数量，并在用户调整画师数量或画风方向前停止本次执行。

 ## 取得画师说明

-Skill 执行者为每名已采用画师取得非空 `style_description`，再处理该画师与其他视觉内容的冲突。画师来自 Style 语义查询结果时，Skill 执行者采用该结果中的非空 `style_description`；该字段为空时，Skill 执行者报告该画师缺少 `style_description`，并在用户补充画师说明或选择其他画师前停止本次执行。
-
-当前用户消息明确提供某名已采用画师的非空画风说明时，Skill 执行者采用该说明作为该画师的 `style_description`，不再为该画师查询说明。
-
-画师直接采用 Style 上下文记录的 `data.prompt_text` 时，Skill 执行者使用该记录中符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 执行一次 Style Resolve。Style Resolve 结果的 `base_model_id` 不等于 WAI Base Model ID 时，Skill 执行者报告 Style 上下文记录的 `data.id`、实际 `base_model_id` 和 WAI Base Model ID，并停止该 Style 查询目标。Resolve 结果的 `base_model_id` 等于 WAI Base Model ID，并且 `style_description` 为非空字符串时，Skill 执行者采用该字段。Resolve 没有返回结果，或者结果的 `base_model_id` 等于 WAI Base Model ID 但 `style_description` 为空时，Skill 执行者报告该画师缺少 `style_description`。`data.id` 缺失或不符合该格式时，Skill 执行者使用非空 `data.name` 执行一次 Style Search。Skill 执行者删除 `data.name`、结果 `name` 和 `aliases_json` 中每个名称的首尾空白，并进行不区分大小写的比较；Skill 执行者把 `name` 或 `aliases_json` 中任一名称与 `data.name` 相等且 `style_description` 为非空字符串的结果列为可采用说明。只有一项可采用说明时，Skill 执行者采用该结果的 `style_description`；没有可采用说明时，Skill 执行者报告该画师缺少 `style_description`；有多项可采用说明时，Skill 执行者报告每项结果的 `id`、`name`、`aliases_json` 和 `style_description`，并在用户选择一项后采用该项的 `style_description`。Style 上下文记录不能提供查询值时，Skill 执行者报告该画师缺少 `style_description`。Skill 执行者报告缺少 `style_description` 后，在用户补充画师信息或选择其他画师前停止本次执行。
-
-画师 Prompt 来自当前用户消息或历史 Generation Run 输入时，Skill 执行者使用该来源为画师提供的名称执行一次 Style Search，并按照“用户指定画师”一节的名称比较规则选择结果。唯一符合名称的结果包含非空 `style_description` 时，Skill 执行者采用该字段，但继续使用原来源提供的画师 Prompt。来源没有提供画师名称、没有唯一符合名称的结果或所选结果的 `style_description` 为空时，Skill 执行者报告该画师缺少 `style_description`，并在用户补充画师名称、画师说明或选择其他画师前停止本次执行。
+1. Skill 执行者必须为每名已采用画师取得非空的完整画风说明，再处理该画师与其他视觉内容的冲突。用户已在当前消息提供该画师的非空画风说明时，采用用户说明；否则采用已取得素材中的完整画风说明。
+2. 已有素材未提供完整说明时，Skill 执行者按“查询 WAI 画师素材”取得说明。画师 Prompt 来自 Style 上下文记录时，使用该记录的 ID；没有 ID 时使用该记录的名称。Prompt 来自用户消息或历史 Generation Run 时，使用该来源为画师提供的名称。查询说明不替换已采用的 Prompt。
+3. 按名称查询说明时，Skill 执行者删除查询名称、候选名称及别名的首尾空白，并进行不区分大小写的比较。名称或任一别名相等且具有非空完整画风说明的候选可以采用。只有一个候选时采用其说明；多个候选时报告各项标识、名称、别名及说明，并等待用户选择。
+4. 没有可用 ID 或名称、查询无结果或所选素材缺少完整画风说明时，Skill 执行者报告该画师缺少说明，并在用户补充画师信息、说明或选择其他画师前停止本次执行。

 ## 多个画师

@@ -56,7 +56,7 @@ Skill 执行者为每名已采用画师取得非空 `style_description`，再处

 全部视觉特点分配完成后，Skill 执行者检查每名画师的 `style_description` 是否明确描述分配给该画师的每项视觉特点，并检查不同画师是否针对同一视觉属性提出互相排斥的要求。两个条件同时满足时，Skill 执行者共同采用这些画师。任一条件不满足时，Skill 执行者报告每名画师的 `style_description` 未描述的已分配视觉特点，以及不同画师针对同一视觉属性提出的互相排斥要求。Skill 执行者请求用户列出需要保留的画师、需要保留的视觉特点，以及每项保留视觉特点对应的一名或多名负责画师，并在收到完整选择和分配关系前停止本次执行。收到完整选择和分配关系后，Skill 执行者按照该关系分配视觉特点，并再次检查上述两个条件。

-用户给出全部已采用画师的完整顺序时，Skill 执行者按照该顺序排列画师。用户只给出部分已采用画师的顺序时，Skill 执行者报告全部已采用画师，请求用户给出完整顺序，并在收到完整顺序前停止本次执行。用户没有指定画师顺序时，Skill 执行者按照以下位置排列画师：当前用户消息直接提供的画师 Prompt 采用该 Prompt 首次出现的位置；Style 上下文记录提供的画师采用该记录首次出现的位置；历史 Generation Run 输入提供的画师采用用户指定复用这些画师的顺序；用户指定具体画师并通过 Style Search 取得 Prompt 时，采用该画师名称在当前用户消息中首次出现的位置；由画风方向查询结果产生的画师采用对应画风方向首次出现的位置。同一画风方向产生多个已采用画师时，用户选择这些画师的顺序决定其排列顺序；Skill 执行者因匹配候选数量等于用户指定数量而直接采用全部匹配候选时，按照 Style Search `results` 数组中的顺序排列这些画师。
+用户给出全部已采用画师的完整顺序时，Skill 执行者按照该顺序排列画师。用户只给出部分已采用画师的顺序时，Skill 执行者报告全部已采用画师，请求用户给出完整顺序，并在收到完整顺序前停止本次执行。用户没有指定画师顺序时，Skill 执行者按照以下位置排列画师：当前用户消息直接提供的画师 Prompt 采用该 Prompt 首次出现的位置；Style 上下文记录提供的画师采用该记录首次出现的位置；历史 Generation Run 输入提供的画师采用用户指定复用这些画师的顺序；用户指定具体画师并通过 MCP 取得画师 Prompt 时，采用该画师名称在当前用户消息中首次出现的位置；由画风方向查询结果产生的画师采用对应画风方向首次出现的位置。同一画风方向产生多个已采用画师时，用户选择这些画师的顺序决定其排列顺序；Skill 执行者因匹配候选数量等于用户指定数量而直接采用全部匹配候选时，按照 MCP 返回候选的顺序排列这些画师。

 主要作用表示该画师决定整体画风，辅助作用表示该画师只负责局部补充效果，中性作用表示多名画师以相同作用共同决定整体画风。用户为全部画师指定主要、辅助或中性作用时，Skill 执行者按照用户要求设置每名画师。用户只为部分画师指定主要、辅助或中性作用时，Skill 执行者先设置用户已经指定的画师，再报告尚未指定作用的画师，请求用户为这些画师选择主要、辅助或中性作用，并在收到用户选择前停止本次执行。用户没有为任何画师指定作用、全部画师均同等承担整体画风，并且没有画师只负责局部补充效果时，Skill 执行者把全部画师都设为中性画师。用户没有为任何画师指定作用，且用户要求或已经列出的视觉特点明确区分整体画风与局部补充效果时，Skill 执行者把负责整体画风的画师设为主要画师，把只负责局部补充效果的画师设为辅助画师。其余情况下，Skill 执行者报告每名画师负责的视觉特点，请求用户为每名画师选择主要、辅助或中性作用，并在收到用户选择前停止本次执行。

@@ -64,7 +64,7 @@ Skill 执行者为每名已采用画师取得非空 `style_description`，再处

 具体画师 Prompt 的目标位置是 `artist`，普通画风、媒介、渲染、摄影效果和数字效果 Prompt 的目标位置是 `non_artist_style`，整体画面情绪 Prompt 的目标位置是 `detail_mood`，光线 Prompt 的目标位置是 `lighting`。Skill 执行者先按照“写入 `artist` 数组”一节创建 `artist` 数组元素，再处理这些位置之间的冲突。

-Skill 执行者记录每项 `style_description` 的实际数据来源。该字段来自 Style Resolve 或 Style Search 结果时，实际数据来源是对应查询结果；该字段由用户补充时，实际数据来源是当前用户消息。执行 Prompt 冲突比较时，每项 `style_description` 继承对应画师的已采用 Style Prompt 来源优先级。用户只提供画师名称并通过 Style Search 取得 Prompt 时，该画师的 Prompt 和 `style_description` 均使用 Style 查询结果优先级。`non_artist_style`、`detail_mood` 和 `lighting` 中的每项 Prompt 使用产生该内容的来源优先级。
+Skill 执行者记录每项 `style_description` 的实际数据来源。该说明来自 MCP 查询结果时，实际数据来源是对应查询结果；该字段由用户补充时，实际数据来源是当前用户消息。执行 Prompt 冲突比较时，每项 `style_description` 继承对应画师的已采用 Style Prompt 来源优先级。用户只提供画师名称并通过 MCP 取得画师 Prompt 时，该画师的 Prompt 和 `style_description` 均使用 Style 查询结果优先级。`non_artist_style`、`detail_mood` 和 `lighting` 中的每项 Prompt 使用产生该内容的来源优先级。

 Skill 执行者逐项比较 `non_artist_style`、`detail_mood` 和 `lighting` 中的每项 Prompt 与每名已采用画师的 `style_description`。同一视觉属性的两项要求互相排斥时，Skill 执行者按照 [Prompt 冲突规则](prompt-conflict-rules.md)规定的五级来源优先级保留较高优先级内容。被删除内容属于画师的 `style_description` 时，Skill 执行者从已采用画师集合中移除该画师及其 Style Prompt 来源和内容，并删除该画师对应的 `artist` 数组元素；被删除内容属于普通视觉内容 Prompt 时，Skill 执行者从对应位置的待组合内容中删除该 Prompt。同一最高优先级包含两项互斥要求时，Skill 执行者报告两项要求及其来源，请求用户选择，并在收到选择前停止本次执行。

@@ -76,4 +76,5 @@ Skill 执行者按照 [WAI 画师语法](wai-artist-syntax.md) 的规则，把

 ## 缺少画师 Prompt

-Skill 执行者完成“画师 Prompt 来源”一节规定的来源选择后，如果某名画师仍没有已采用的非空 Style Prompt 内容，则不为该画师创建 `artist` 数组元素。
+1. Skill 执行者完成“画师 Prompt 来源”规定的来源选择后，某名画师仍没有已采用的非空 Style Prompt 时，禁止为该画师创建 `artist` 数组元素。
+2. 画师查询没有可采用结果时，当前消息已提供非空画师 Prompt 则继续采用；否则，用户已指定媒介、线条、上色、明暗、纹理或配色中的至少一项时，Skill 执行者使用这些描述继续构造 Prompt。上述两类内容均不存在时，Skill 执行者报告缺少画师 Prompt 和视觉特点，请求用户补充并停止本次执行。
diff --git a/.agents/skills/wai-sdxl-prompt-builder/references/composition-decision-tree.md b/.agents/skills/wai-sdxl-prompt-builder/references/composition-decision-tree.md
index ef99905..5aa1b04 100644
--- a/.agents/skills/wai-sdxl-prompt-builder/references/composition-decision-tree.md
+++ b/.agents/skills/wai-sdxl-prompt-builder/references/composition-decision-tree.md
@@ -8,15 +8,15 @@ Skill 执行者使用[场景分支矩阵](composition-scenario-branches.md)选

 ## 构图输入与来源边界

-Skill 执行者使用冲突处理后保留的构图要求。每项要求继续保留其来源：当前用户消息中的明确要求、当前消息 `comfyui-context` 中的 Character 或 Style 上下文记录、已采用的 Work 或 Prompt-term 查询结果，或者 Skill 执行者补充内容。
+Skill 执行者使用冲突处理后保留的构图要求。每项要求继续保留其来源：当前用户消息中的明确要求、当前消息 `comfyui-context` 中的 Character 或 Style 上下文记录、已采用的目录词条查询结果，或者 Skill 执行者补充内容。

 Skill 执行者按照[当前用户消息输入合同](input-contract.md)区分当前用户消息的普通文字与 `comfyui-context`；Character 或 Style 上下文记录及其提示词字段只从当前消息的 `comfyui-context` 中读取。

-Skill 执行者按照[语义查询接口与调用流程](semantic-tool-orchestration.md)取得 Work 或 Prompt-term 查询结果并读取其提示词字段。
+Skill 执行者按 [词条采用](../SKILL.md#词条采用)获取与构图要求对应的规范标签。作品查询结果只用于确认作品身份和角色所属作品。

 三个候选都必须保留全部已保留构图要求及其来源身份。已保留要求指定的“画格、可变构图属性、主体或对象”具体取值项保持不变；同一属性中没有被已保留要求指定的其他具体取值项仍可改变。

-本文件使用“要求合并顺序”确定画格、对象、动作和其他内容的首次出现位置。Skill 执行者依次合并：当前用户消息普通文字中从前到后的要求；当前消息中 Character 和 Style 上下文记录按照其出现顺序提供的要求；各次 Work 查询按照调用顺序返回的结果；各次 Prompt-term 查询按照调用顺序返回的结果；Skill 执行者按照本文件步骤产生的补充内容。同一次查询返回多项结果时保持返回顺序，同一结果中的提示词内容按照从前到后的顺序读取。后文的“出现顺序”“第一次出现”和“最先出现”均指要求合并顺序。
+本文件使用“要求合并顺序”确定画格、对象、动作和其他内容的首次出现位置。Skill 执行者依次合并：当前用户消息普通文字中从前到后的要求；当前消息中 Character 和 Style 上下文记录按照其出现顺序提供的要求；各次目录词条查询按照调用顺序采用的结果；Skill 执行者按照本文件步骤产生的补充内容。同一次查询返回多项结果时保持返回顺序，同一结果中的提示词内容按照从前到后的顺序读取。后文的“出现顺序”“第一次出现”和“最先出现”均指要求合并顺序。

 “必须可见内容”是已保留要求明确要求在画面中可辨认、但没有要求完整呈现的主体、动作、身体部位、物件或固定环境对象。“必须完整可见内容”是已保留要求明确要求完整呈现的主体、动作、身体部位、物件或固定环境对象。必须完整可见内容受到任何遮挡或裁剪时，候选不能成立；必须可见内容受到局部遮挡或裁剪时，按照候选 A 第 8 项的规则判断可辨认状态。可辨认时，候选可以成立并进入比较计数；不可辨认时，候选不能成立。

diff --git a/.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/character.md b/.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/character.md
index bebe298..b901738 100644
--- a/.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/character.md
+++ b/.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/character.md
@@ -23,9 +23,16 @@ Skill Agent 必须先确定画面中的每个角色，并分别处理每个角
 - Skill Agent 保留目标角色的角色名、作品名和其他不冲突的标签，并保留其他角色的全部标签。
 - Skill Agent 只修改本轮待输出的 `character` 内容，不修改输入来源中保存的 Prompt 文本。

+## 查询作品与角色素材
+
+1. 当前输入来源未提供角色 Prompt 时，Skill Agent 通过 NoobAI MCP 获取角色素材。已有角色 ID 时优先获取对应记录；没有 ID 时按角色名称及已提供的作品信息查找。既没有 ID 也没有角色名称时，Skill Agent 报告缺少角色名称，并停止处理该角色。
+2. Skill Agent 根据用户给出的作品名称或别名核对作品候选；用户提供作品类别时，还须核对类别。多个候选均符合时，Skill Agent 报告候选标识、名称、别名和类别，并等待用户选择。确定作品后，角色查询限定在该作品内。
+3. Skill Agent 根据所属作品、角色名称和别名核对角色候选，只采用具有非空 Prompt 的候选。多个候选均符合时，Skill Agent 报告候选标识、所属作品、名称和别名，并等待用户选择。采用的角色 Prompt 按本文件“Character Prompt 来源”及“新增、替换、排除与来源保留”处理。
+4. 作品或角色没有可采用结果时，Skill Agent 核对当前消息和已采用结果是否已提供用户要求的作品名称、每个角色的名称和非空 Prompt；全部具备时继续构造，缺少任一项时报告具体缺失内容，请求用户补充并停止本次执行。
+
 ## 用户只提供作品时

-用户只提供作品名称而没有指定角色时，Skill Agent 按照[语义查询接口与调用流程](../semantic-tool-orchestration.md)查询并采用唯一符合的 Work 结果，然后报告该结果的 `id` 和 `name`，请求用户指定角色名称。用户指定角色名称后，Skill Agent 使用该 Work 结果的 `id` 作为 `work_id` 查询角色。用户尚未指定角色名称时，Skill Agent 不执行 Character Search，也不创建 `character` 内容。
+用户只提供作品名称而没有指定角色时，Skill Agent 通过 NoobAI MCP 查询作品，并按本文件“查询作品与角色素材”一节确定唯一符合的作品。Skill Agent 向用户报告所选作品的标识和名称，请求用户指定角色名称。用户指定角色名称后，Skill Agent 通过 NoobAI MCP 查询该作品中的指定角色。用户尚未指定角色名称时，Skill Agent 禁止查询角色或创建 `character` 内容。

 ## 多角色顺序

diff --git a/.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/non-artist-style.md b/.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/non-artist-style.md
index 67b6744..9e57e0b 100644
--- a/.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/non-artist-style.md
+++ b/.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/non-artist-style.md
@@ -14,7 +14,7 @@
 - 按照语义查询接口文档采用的普通视觉概念；
 - Skill Agent 根据用户要求、选定构图和完整画面设计完成的普通画面风格内容。

-Prompt-term 接口和字段用途由[语义查询接口与调用流程](../semantic-tool-orchestration.md)统一规定。
+目录词条的采用规则见 [词条采用](../../SKILL.md#词条采用)。

 ## 风格组合

diff --git a/.agents/skills/wai-sdxl-prompt-builder/references/semantic-tool-orchestration.md b/.agents/skills/wai-sdxl-prompt-builder/references/semantic-tool-orchestration.md
deleted file mode 100644
index 6598e49..0000000
--- a/.agents/skills/wai-sdxl-prompt-builder/references/semantic-tool-orchestration.md
+++ /dev/null
@@ -1,197 +0,0 @@
-# Prompt 内容查询 CLI
-
-## CLI 用途与可执行入口
-
-该 CLI 使用 Search 或 Resolve 查询作品、角色、WAI 画师和 Prompt 标签。受管前台 shell Tool Call 提供 Host Electron 可执行文件路径 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE` 和查询脚本路径 `DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI`；Skill 执行者使用以下入口运行本文件中的查询命令：
-
-```sh
-ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI"
-```
-
-## 上下文记录
-
-本文件把当前消息中 `type=comfyui-context` 且 `data.kind=character` 的 JSON 行称为 Character 上下文记录，把 `type=comfyui-context` 且 `data.kind=style` 的 JSON 行称为 Style 上下文记录。
-
-## 数据源连接参数与标准输入
-
-该 CLI 不读取 stdin。Search 和 Resolve 命令必须包含下列数据源连接参数：
-
-| 参数 | 必填条件与允许值 |
-|---|---|
-| `--url` | 必填；参数值使用 `$DSH_HARNESS_COMFYUI_SOURCE_URL`，并且必须是没有用户名、密码、端口、路径、查询字符串或片段的完整 HTTP 或 HTTPS URL。 |
-| `--port` | 必填；参数值使用 `$DSH_HARNESS_COMFYUI_SOURCE_PORT`，并且必须是 `1` 至 `65535` 的十进制整数。 |
-| `--path` | 必填；参数值必须是“查询路径与结果字段”表中的一条完整路径。 |
-| `--timeout-ms` | 可选；参数值必须是 `1` 至 `600000` 的十进制整数。本文命令不传入该参数，因此 CLI 使用默认值 `120000`。 |
-
-每个命令行参数最多出现一次。参数名和参数值必须作为两个独立的命令行参数传入；该 CLI 不接受 `--参数名=参数值` 格式。
-
-## 查询路径与结果字段
-
-| 路径 | 调用条件 | Skill 执行者读取的结果字段 |
-|---|---|---|
-| `/internal/semantic/base-models` | 当前 Skill 执行中第一次执行 Style Search 或 Style Resolve 之前 | `id`、`name` |
-| `/internal/semantic/works` | 需要确认角色所属作品时 | `id`、`name`、`aliases_json`、`category_name` |
-| `/internal/semantic/characters` | 需要确认角色或取得角色 Prompt 时 | `id`、`work_id`、`works.name`、`name`、`aliases_json`、`prompt_text` |
-| `/internal/semantic/styles` | 需要确认画师或取得 WAI 画师 Prompt 时 | `id`、`base_model_id`、`name`、`aliases_json`、`style_description`、`prompt_text` |
-| `/internal/semantic/prompt-terms` | 需要把一个自然语言视觉概念转换为 Prompt 标签时 | `id`、`canonical_tag`、`aliases_json`、`post_count` |
-
-## 查询目标的定义
-
-用户要求确认的每个作品、角色、画师或 Prompt 概念分别构成一个查询目标。“停止当前查询目标”表示 Skill 执行者停止处理该目标；“停止本次语义查询”表示 Skill 执行者停止处理本文件规定的全部查询目标。
-
-## Search 命令
-
-```sh
-ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --quiet --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path '<operation-path>' --mode search --query '<query>' --page 1 --page_size 20
-```
-
-`<operation-path>` 必须取自“查询路径与结果字段”表。`<query>` 必须是长度不超过 200 个字符且不含控制字符的字符串。Skill 执行者在每次 Search 前检查已经构造的完整 `<query>`；长度超过 200 个字符时，Skill 执行者报告实际字符数，请求用户提供不超过 200 个字符的查询文本，并在收到文本前停止当前查询目标。Skill 执行者使用单引号包裹包含空格或 shell 特殊字符的参数值；参数值中的每个单引号写成 `'\''`，使整个值作为一个命令行参数传入。
-
-查询角色时，Skill 执行者可以使用已采用 Work 结果的 `id` 限定结果：
-
-```sh
-ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --quiet --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path /internal/semantic/characters --mode search --query '<character-query>' --page 1 --page_size 20 --work_id '<work-id>'
-```
-
-查询 Style 时，Skill 执行者必须使用当前 Skill 执行中通过 Base Model Search 取得的 WAI Base Model ID 限定结果：
-
-```sh
-ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --quiet --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path /internal/semantic/styles --mode search --query '<style-query>' --page 1 --page_size 20 --base_model_id '<wai-base-model-id>'
-```
-
-## Resolve 命令
-
-Character 上下文记录或 Style 上下文记录没有非空 `data.prompt_text`，但提供符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 时，Skill 执行者使用以下命令查询该 ID：
-
-```sh
-ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --quiet --url "$DSH_HARNESS_COMFYUI_SOURCE_URL" --port "$DSH_HARNESS_COMFYUI_SOURCE_PORT" --path '<operation-path>' --mode resolve --id '<stable-id>'
-```
-
-Character 上下文记录使用 `/internal/semantic/characters`，Style 上下文记录使用 `/internal/semantic/styles`。Skill 执行者把 `data.id` 作为 `<stable-id>`。
-
-Resolve 成功结果的 `results` 必须包含一个对象。返回对象数量为 0 或大于 1 时，Skill 执行者报告实际对象数量，该上下文记录对应的查询目标到此结束。唯一结果对象缺少 `id` 时，Skill 执行者报告缺少 `id`，该查询目标到此结束。唯一结果对象包含 `id` 时，Skill 执行者把该 `id` 转为十进制字符串后与 `<stable-id>` 比较；两者相同时，Skill 执行者继续处理该上下文记录。两者不同时，Skill 执行者报告 `<stable-id>` 和转换后的实际 `id`，该查询目标到此结束。
-
-## 查询顺序与查询值
-
-1. Skill 执行者先采用 Character 上下文记录和 Style 上下文记录中的非空 `data.prompt_text`，并在本次执行后续步骤中直接复用该结果。只有 `data.prompt_text` 为空时，Skill 执行者才查询该上下文记录。
-2. Character 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 执行 Character Resolve。`data.id` 缺失或不符合该格式时，Skill 执行者使用非空 `data.character_name` 执行 Character Search；存在非空 `data.work_name` 时，Skill 执行者按照角色名称、一个半角空格、作品名称的顺序构造同一个 `<query>`。不存在非空 `data.character_name` 时，Skill 执行者报告缺少角色名称并停止该 Character 查询。
-3. 当前消息没有与用户指定角色对应的 Character 上下文记录，且用户同时提供作品名称和角色名称时，Skill 执行者先使用用户原文中的作品名称执行 Work Search。采用一项 Work 结果后，Skill 执行者使用该结果的 `id` 作为 Character Search 的 `<work-id>`，并使用用户原文中的角色名称作为 `<character-query>`。
-4. 当前消息没有与用户指定角色对应的 Character 上下文记录，且用户只提供角色名称时，Skill 执行者使用用户原文中的角色名称执行 Character Search。
-5. Skill 执行者第一次执行 Style Search 或 Style Resolve 前，使用 `wai` 作为 Base Model Search 的 `<query>`。Skill 执行者采用 `name` 精确等于 `wai` 的唯一结果，并把该结果的 `id` 记作 WAI Base Model ID。执行 Style Search 时，Skill 执行者把该 ID 作为 `<wai-base-model-id>`。
-6. Style 上下文记录没有非空 `data.prompt_text` 时，Skill 执行者优先使用符合 `^[1-9][0-9]{0,19}$` 的 `data.id` 执行 Style Resolve。Resolve 结果的 `base_model_id` 等于 WAI Base Model ID，且 `prompt_text` 为非空字符串时，Skill 执行者采用该结果。`base_model_id` 不相等时，Skill 执行者报告 Style 上下文记录的 `data.id`、实际 `base_model_id` 和 WAI Base Model ID，并停止该上下文记录对应的 Style 查询目标。`base_model_id` 相等但 `prompt_text` 为空时，Skill 执行者按照“查询次数与空结果”一节的 Style 空结果规则处理。`data.id` 缺失或不符合该格式时，Skill 执行者使用非空 `data.name` 执行 Style Search；不存在非空 `data.name` 时，Skill 执行者报告缺少画师名称并停止该 Style 查询目标。
-7. 当前消息没有与用户指定画师对应的 Style 上下文记录时，Skill 执行者使用用户原文中的画师名称执行 Style Search。
-8. 用户没有指定画师，且当前消息没有 Style 上下文记录时，Skill 执行者按照 `references/artist-adoption.md`“用户未指定画师”一节取得一组画风查询词，按该组查询词的既定顺序使用一个半角空格连接，形成一个 `<query>`，并使用该 `<query>` 执行 Style Search。
-9. 已取得的 Prompt 内容中没有可表达用户要求的某个外貌、服装、动作、表情、构图、环境、媒介效果、摄影效果、数字效果、画面情绪、光线或技术表现概念的标签时，Skill 执行者为该概念单独执行一次 Prompt-term Search。
-
-多个精确名称为 `wai` 的 Base Model 结果同时存在时，Skill 执行者报告每项结果的 `id` 和 `name`；没有精确名称为 `wai` 的结果时，Skill 执行者报告未找到 WAI Base Model。发生以上任一情况时，Skill 执行者停止本次 Skill 执行中的全部 Style 查询目标。
-
-## Search 与 Resolve 的参数规则
-
-Search 允许的参数集合为 `--url`、`--port`、`--path`、可选的 `--timeout-ms`、`--mode search`、`--query`、`--page 1`、`--page_size 20`、可按查询路径加入的 `--work_id` 或 `--base_model_id`，以及可选的 `--quiet`。Resolve 允许的参数集合为 `--url`、`--port`、`--path`、可选的 `--timeout-ms`、`--mode resolve`、`--id` 和可选的 `--quiet`。`--url`、`--port` 与 `--path` 的取值按“数据源连接参数与标准输入”一节提供。
-
-`--id`、`--work_id` 和 `--base_model_id` 只接受符合 `^[1-9][0-9]{0,19}$` 的十进制字符串。Skill 执行者把查询结果中的数值 `id` 转为十进制字符串后用于后续命令。
-
-## 成功输出
-
-使用 `--quiet` 的命令成功时，退出码为 `0`，stderr 为空，stdout 包含一个符合下列结构的 JSON 对象：
-
-```json
-{
-  "status": "ok",
-  "message": null,
-  "results": [],
-  "page": 1,
-  "page_size": 20,
-  "total_count": 0
-}
-```
-
-成功结果必须包含且只包含 `status`、`message`、`results`、`page`、`page_size` 和 `total_count`。`status` 必须是 `"ok"`，`message` 必须是 `null`，`results` 必须是数组，且 `results` 中的每一项必须是对象；`total_count` 必须是非负整数。Search 结果的 `page` 和 `page_size` 必须与本次 Search 参数相同。Resolve 结果的 `page` 和 `page_size` 必须分别是 `1` 和 `1`，`total_count` 必须等于 `results` 的对象数量。
-
-### 结果对象字段
-
-| 查询对象 | 字段 | 类型与用途 |
-|---|---|---|
-| Base Model | `id` | 正整数；用作 Style Search 的 `base_model_id`。 |
-| Base Model | `name` | 字符串；用于确认结果是否为 `wai`。 |
-| Work | `id` | 正整数；用作 Character Search 的 `work_id`。 |
-| Work | `name` | 字符串；作品名称。 |
-| Work | `aliases_json` | 字符串数组；作品别名。 |
-| Work | `category_name` | 字符串；作品所属类别。 |
-| Character | `id` | 正整数；角色记录 ID。 |
-| Character | `work_id` | 正整数；角色所属作品的 ID。Character Search 传入 `<work-id>` 时，用于核对角色所属作品。 |
-| Character | `works.name` | 字符串；角色所属作品的名称。 |
-| Character | `name` | 字符串；角色名称。 |
-| Character | `aliases_json` | 字符串数组；角色别名。 |
-| Character | `prompt_text` | 字符串；非空时写入生成 Prompt 的 `character` 槽位。 |
-| Style | `id` | 正整数；画师记录 ID。 |
-| Style | `base_model_id` | 正整数；画师记录适用的 Base Model ID。 |
-| Style | `name` | 字符串；画师名称。 |
-| Style | `aliases_json` | 字符串数组；画师别名。 |
-| Style | `style_description` | 字符串；画师作品的视觉特点。 |
-| Style | `prompt_text` | 字符串；非空时写入生成 Prompt 的 `artist` 槽位。 |
-| Prompt-term | `id` | 正整数；Prompt 标签记录 ID。 |
-| Prompt-term | `canonical_tag` | 字符串；规范 Prompt 标签。 |
-| Prompt-term | `aliases_json` | 字符串数组；该 Prompt 标签表示的自然语言概念。 |
-| Prompt-term | `post_count` | 非负整数；使用该 Prompt 标签的样本数量。 |
-
-### Work 结果
-
-Skill 执行者使用每项候选的 `name` 和 `aliases_json` 匹配用户提供的作品名称或作品别名；用户提供作品类别时，Skill 执行者还使用候选的 `category_name` 匹配该作品类别。Skill 执行者把被采用候选的 `id` 用作 Character Search 的 `<work-id>`。符合用户已提供信息的候选超过一项时，Skill 执行者报告每项候选的 `id`、`name`、`aliases_json` 和 `category_name`，请求用户选择后再继续。
-
-### Character 结果
-
-使用 `<work-id>` 查询角色时，Skill 执行者只评估 `work_id` 等于 `<work-id>` 的结果。用户提供作品名称时，Skill 执行者使用候选的 `works.name` 匹配该作品名称。Skill 执行者使用候选的 `name` 和 `aliases_json` 匹配用户提供的角色名称或角色别名，并且只采用 `prompt_text` 为非空字符串的候选。没有符合用户已提供信息且包含非空 `prompt_text` 的候选时，Skill 执行者按照“查询次数与空结果”一节关于 Work 或 Character 查询无可采用结果的规则处理。采用候选后，Skill 执行者把该候选的 `prompt_text` 写入生成 Prompt 的 `character` 槽位。可采用候选超过一项时，Skill 执行者报告每项候选的 `id`、`works.name`、`name` 和 `aliases_json`，请求用户选择后再继续。
-
-### Style 结果
-
-Skill 执行者只评估 `base_model_id` 等于 WAI Base Model ID 的结果。用户指定画师名称时，Skill 执行者使用每项候选的 `name` 和 `aliases_json` 匹配该画师名称；用户未指定画师名称时，Skill 执行者使用每项候选的 `style_description` 筛选视觉特点符合“查询顺序与查询值”第 8 步取得的画风查询词的候选。Skill 执行者只采用 `prompt_text` 为非空字符串的候选，并把被采用候选的 `prompt_text` 写入生成 Prompt 的 `artist` 槽位。没有符合筛选条件且包含非空 `prompt_text` 的候选时，Skill 执行者按照“查询次数与空结果”一节关于 Style 查询无可采用结果的规则继续构造 Prompt。可采用候选超过一项时，Skill 执行者报告每项候选的 `id`、`name`、`aliases_json` 和 `style_description`，请求用户选择后再继续。
-
-### Prompt-term 结果
-
-Skill 执行者使用 `canonical_tag` 和 `aliases_json` 筛选含义符合目标概念的候选。只有一个候选符合时，Skill 执行者按照 `references/wai-prompt-position-order.md` 的“固定顺序和唯一职责”表，把该候选的 `canonical_tag` 写入唯一职责包含该目标概念的位置。多个候选表达相同含义时，Skill 执行者按照 `post_count` 从大到小、`id` 从小到大的顺序采用第一项。多个候选表达不同含义，且仅凭用户要求无法确定唯一含义时，Skill 执行者报告每项候选的 `id`、`canonical_tag` 和 `aliases_json`，请求用户选择后再继续。
-
-## 查询次数与空结果
-
-- 每个 Work 查询目标最多执行两次 Search。第一次没有可采用的 Work 结果时，Skill 执行者从用户原文中按出现顺序取出非空的作品名称、作品别名和作品类别，并使用一个半角空格连接，得到第二次 Search 的 `<query>`。Skill 执行者按照“Search 命令”一节检查该 `<query>`，取得符合要求的查询文本后执行第二次且最后一次 Search。
-- 每个 Character 目标执行一次 Search 或一次 Resolve。
-- 每个 Style 目标执行一次 Search 或一次 Resolve。
-- 每个 Prompt-term 目标执行一次 Search。
-
-Work 或 Character 查询没有可采用结果时，Skill 执行者检查当前消息和已经采用的查询结果是否已经提供用户明确要求的作品名称、每个角色的名称和每个角色的非空 Prompt。用户明确要求的内容均已提供时，Skill 执行者继续构造 Prompt；缺少任一内容时，Skill 执行者报告具体缺少的作品名称、角色名称或角色 Prompt，请求用户补充后停止本次执行。
-
-Style 查询没有可采用结果时，如果用户在当前消息中直接提供了非空画师 Prompt，Skill 执行者使用该画师 Prompt 继续构造 Prompt；如果用户已经明确指定媒介、线条、上色、明暗、纹理或配色中的至少一项，Skill 执行者使用用户指定的描述继续构造 Prompt。上述画师 Prompt 和视觉特点描述均不存在时，Skill 执行者报告缺少可用的画师 Prompt 和画师视觉特点，请求用户补充后停止本次执行。Prompt-term 查询没有可采用结果时，Skill 执行者把用户描述该概念的文字改写为一个不含逗号的英文小写短语，并按照 `references/wai-prompt-position-order.md` 的“固定顺序和唯一职责”表，把该短语写入唯一职责包含该概念的位置。
-
-## 命令错误与返回协议错误
-
-| 退出码 | stderr `error.code` 或内容 | Skill 执行者的处理动作 |
-|---:|---|---|
-| `2` | `INVALID_ARGUMENT` | 无效参数是 Skill 执行者构造的 `--path`、`--mode`、`--query`、`--page`、`--page_size`、`--work_id`、`--base_model_id` 或 `--id` 时，Skill 执行者修正该参数后重试一次；无效参数是 `--url`、`--port` 或 `--timeout-ms` 时，Skill 执行者报告 stderr 并停止本次语义查询。首次失败调用不计入“查询次数与空结果”一节规定的 Search 或 Resolve 次数；重试返回退出码 `0` 时，该重试计为原查询目标的一次 Search 或 Resolve；重试仍返回退出码 `2` 时，该重试不计入查询次数，Skill 执行者停止当前查询目标。 |
-| `3` | `DISCOVERY_HTTP_ERROR` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
-| `4` | `SOURCE_CONNECTION_FAILED` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
-| `5` | `TOTAL_TIMEOUT` | Skill 执行者报告发生超时的查询路径，以及本次调用实际传入的 `query`、`id`、`work_id` 和 `base_model_id` 参数中存在的参数名与参数值，并停止当前查询目标。 |
-| `6` | `CONTRACT_PROTOCOL_ERROR` 或 `INTERNAL_CLI_ERROR` | Skill 执行者报告 stderr 中的错误代码和错误说明，并停止本次语义查询。 |
-| `7` | 数据源服务返回的原始 JSON | Skill 执行者报告完整 stderr，并停止当前查询目标。 |
-| `130` 或 `143` | `PROCESS_CANCELLED` | Skill 执行者停止本次 Skill 执行。 |
-
-命令返回非零退出码时，Skill 执行者仅依据 stderr 和退出码处理本次调用。
-
-命令返回上表未列出的退出码时，Skill 执行者报告退出码和 stderr，并停止本次语义查询。
-
-退出码 `2`、`3`、`4`、`5`、`6`、`130` 和 `143` 的 stderr 首行包含 `{"error":{"code":"<错误代码>","message":"<错误说明>"}}` JSON。退出码 `7` 的 stderr 先保留数据源服务非 2xx 响应中的原始 JSON；该 JSON 没有固定字段。所有失败输出在原始错误正文之后追加换行和 `NEXT:` 修正提示，`--quiet` 仅省略成功提示。Skill 执行者按最后一个换行加 `NEXT:` 分隔错误正文与指引，并解析前者。
-
-使用 `--quiet` 的命令返回退出码 `0` 但 stderr 非空时，Skill 执行者报告 stderr 内容，并停止当前查询目标。
-
-命令返回退出码 `0`，但 stdout 不符合“成功输出”一节的结构时，Skill 执行者报告违反的结构要求、期望类型或期望值以及实际类型或实际值；问题涉及字段时，同时报告字段名，然后停止当前查询目标。`results[]` 中被采用的对象缺少对应查询路径规定的结果字段时，Skill 执行者报告缺少的字段名，并停止当前查询目标。
-
-## 调用次数与结果复用
-
-查询路径、`mode` 以及实际传入的 `query`、`id`、`work_id` 和 `base_model_id` 参数共同标识一次查询调用。Skill 执行者保存每次查询调用已经采用的成功结果；本次 Skill 执行的后续步骤再次需要相同查询调用时，Skill 执行者直接复用该结果。“查询次数与空结果”一节规定的 Work 第二次 Search 作为新调用执行该节构造的查询，并计入该 Work 查询目标最多两次的调用总数。
-
-用户更改要查询的作品、角色、画师或 Prompt 概念，或者更改对应的查询参数时，Skill 执行者按照“查询次数与空结果”一节为更改后的对象开始新的查询目标。退出码 `2` 触发的参数修正仍属于原查询目标的唯一一次自动重试。
-
-用户明确要求重新查询某个已有目标时，Skill 执行者按照“查询次数与空结果”一节规定的次数开始一轮新的查询，并使用本轮查询结果。重新查询成功并采用新结果时，Skill 执行者使用新结果替换此前保存的结果。重新查询失败或没有可采用结果时，Skill 执行者报告本轮结果；用户在获知本轮结果后明确要求采用此前保存的成功结果时，Skill 执行者才重新采用该结果。
-
-## 渐进式帮助与错误指引
-
-Skill 执行者运行 `ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI" --help` 查看离线总览，再按照“下一步”查询实时操作列表和指定路径帮助。省略 `--quiet` 的成功查询在 stderr 输出 `NEXT:` 后续操作。帮助调用成功时，Skill 执行者从 stdout 读取帮助文本。
diff --git a/.agents/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md b/.agents/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md
index 5549091..11fb2ca 100644
--- a/.agents/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md
+++ b/.agents/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md
@@ -33,7 +33,7 @@ Skill 执行者按照 [SKILL.md 第 1 节](../SKILL.md#1-读取本轮输入)规
 1. 第一优先级：Skill 执行者选择当前用户消息作为来源，并采用该消息中直接提供且要求整体采用的完整角色 Prompt 作为 Character Prompt 内容。
 2. 第二优先级：Skill 执行者选择 `data.prompt_text` 非空的 Character 上下文记录作为来源，并采用该记录的 `data.prompt_text` 作为 Character Prompt 内容。
 3. 第三优先级：Skill 执行者选择用户指定复用的历史 Generation Run 输入作为来源，并采用该输入中的完整角色 Prompt 作为 Character Prompt 内容。
-4. 第四优先级：Skill 执行者选择按照[语义查询接口与调用流程](semantic-tool-orchestration.md)取得的 Character 查询结果作为来源，并采用该结果的 `prompt_text` 作为 Character Prompt 内容。
+4. 第四优先级：Skill 执行者选择按照 [目录素材查询](../SKILL.md#4-查询缺少的角色画师与风格效果-prompt-内容)取得的 MCP 角色查询结果作为来源，并采用选中角色的 Prompt 作为 Character Prompt 内容。

 前三种来源均未提供当前角色的完整角色 Prompt 时，Skill 执行者才查询该角色。本节把 Skill 执行者为角色选定的用户消息、Character 上下文记录、历史 Generation Run 输入或 Character 查询结果称为“已采用 Character Prompt 来源”，把从该来源取得的完整角色 Prompt 文本称为“已采用 Character Prompt 内容”。

@@ -42,7 +42,7 @@ Skill 执行者按照 [SKILL.md 第 1 节](../SKILL.md#1-读取本轮输入)规
 1. 第一优先级：Skill 执行者选择当前用户消息作为来源，并采用该消息中直接提供且要求采用的画师 Prompt 作为 Style Prompt 内容。
 2. 第二优先级：Skill 执行者选择 `data.prompt_text` 非空的 Style 上下文记录作为来源，并采用该记录的 `data.prompt_text` 作为 Style Prompt 内容。
 3. 第三优先级：Skill 执行者选择用户指定复用的历史 Generation Run 输入作为来源，并采用该输入中的画师 Prompt 作为 Style Prompt 内容。
-4. 第四优先级：Skill 执行者选择按照[语义查询接口与调用流程](semantic-tool-orchestration.md)取得的 Style 查询结果作为来源，并采用该结果的 `prompt_text` 作为 Style Prompt 内容。
+4. 第四优先级：Skill 执行者选择按照 [目录素材查询](../SKILL.md#4-查询缺少的角色画师与风格效果-prompt-内容)取得的 MCP 画师查询结果作为来源，并采用选中画师的 Prompt 作为 Style Prompt 内容。

 前三种来源均未提供当前画师的 Prompt 时，Skill 执行者才查询该画师。本节把 Skill 执行者为画师选定的用户消息、Style 上下文记录、历史 Generation Run 输入或 Style 查询结果称为“已采用 Style Prompt 来源”，把从该来源取得的画师 Prompt 文本称为“已采用 Style Prompt 内容”。

@@ -65,14 +65,14 @@ Skill 执行者必须按照以下顺序确定本轮使用的位置：
 “实际内容”是至少一项与本轮画面一致、符合该位置唯一职责并且可以直接写入 WAI Prompt 的非空提示词内容。

 1. 把当前主场景在[场景分支矩阵](composition-scenario-branches.md)中要求的位置加入必选位置集合。
-2. 对当前用户消息中不属于已采用 Character Prompt 来源或已采用 Style Prompt 来源的已保留画面要求，以及已采用 Work 和 Prompt-term 查询结果中的提示词内容，按照“固定顺序和唯一职责”表加入对应位置。
+2. 对当前用户消息中不属于已采用 Character Prompt 来源或已采用 Style Prompt 来源的已保留画面要求，以及已采用目录词条的规范标签，按照“固定顺序和唯一职责”表加入对应位置。
 3. 每轮都把 `quality` 加入必选位置集合，并写入 WAI 质量标签和用户明确要求的质量内容。对已采用 Style Prompt 内容中的每项已保留提示词内容，按照“固定顺序和唯一职责”表加入对应位置并写入该内容；其中具体画师提示词只进入 `artist`，非画师画风或创作媒介类别只进入 `non_artist_style`。存在已采用 Character Prompt 内容时，把 `character` 加入位置集合并写入本轮 Character Prompt。
 4. 本轮已经选择的前十四个位置完成内容映射后，如果这些位置仍不能准确表达主体关系或分组、动作归属、物件或接触关系归属、空间关系、画格关系或者剧情内容归属，则把 `relation_narrative` 加入位置集合。
 5. 步骤 2 至步骤 4 完成后，必选位置仍没有实际内容时，Skill 执行者按照该位置规则补全能够满足主场景要求、符合该位置唯一职责并且能够与全部已保留内容同时成立的提示词内容。只有不属于必选位置集合并且没有实际内容的位置才可以删除；最终 Prompt 不保留空位置。

-Skill 执行者按照[语义查询接口与调用流程](semantic-tool-orchestration.md)读取 Style、Character、Work 和 Prompt-term 的接口用途与字段用途。

-位置映射只改变内容在 WAI Prompt 中的位置，不改变用户要求、已采用 Character Prompt 来源、已采用 Style Prompt 来源、Work 和 Prompt-term 查询结果或 Skill 执行者补充内容的来源身份和既有优先级。
+
+位置映射只改变内容在 WAI Prompt 中的位置，不改变用户要求、已采用 Character Prompt 来源、已采用 Style Prompt 来源、目录词条查询结果或 Skill 执行者补充内容的来源身份和既有优先级。

 ## 易混淆内容的位置边界

```
