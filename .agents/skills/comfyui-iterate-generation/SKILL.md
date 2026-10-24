---
name: comfyui-iterate-generation
description: 用户要求根据故事和人物构思、生成并迭代图片时使用。主 Agent 调度构图、生成、独立观察、比较和 Prompt 修复。
---

# 主 Agent 调度图片构思与迭代

## 定义任务目标和 Agent 职责

1. 主 Agent 接收用户请求，派发子任务并交付图片。

2. 画面目标指希望观者通过图片理解的人物处境、关系或情绪。核心要素指使目标成立的必要人物、动作、关系和可见线索。构图 Agent 从故事、人物性格和片段经历推导目标与核心要素，并设计主体、空间、视觉主次和照明。

   | 子 Agent | 创建工具 |
   |---|---|
   | 构图 Agent | subagent_composition |
   | 生成 Agent | subagent_generation |
   | 观察 Agent | subagent_observation |
   | 比较 Agent | subagent_comparison |

   各角色的输出内容见[交接目录与文件规范](references/records.md#确定任务目录和文件写入者)。

3. Prompt Builder 是生成 Agent 按实际模型选择的 anima-prompt-builder、krea2-anime-prompt-builder 或 wai-sdxl-prompt-builder。生成 Agent 使用对应 Builder 的 test 尺寸，按构图选择宽高比，再使用 comfyui-generate 提交图片。Run ID 标识实际图片生成记录。观察 Agent 使用 local-image-reader 取得独立视觉观察。

## 派发任务并接收结果文件

1. 首次派发前，主 Agent 完整读取[交接目录与文件规范](references/records.md)，据此创建本次输出目录并分配具体文件路径。

2. 主 Agent 使用原生 skill 工具返回的 resourceBase.path（本 Skill 的实际目录）定位参考文件：构图任务提供 references/composition-design.md；生成任务提供 references/run-query-cli.md；比较任务提供 references/iteration-method.md。子 Agent 直接读取对应参考。

3. 主 Agent 调用对应角色工具，并填写下表参数。构图和生成复用原子会话。每轮首次观察与比较分别新建子会话。同轮补充观察与重新比较各自新建子会话。同一任务缺项或中断时，主 Agent 向原子会话续派。

   | 参数 | 主 Agent 提供的内容 |
   |---|---|
   | description | 本次任务的简短名称 |
   | agent_id | 接收后续任务的已有子 Agent 的 subagentId；首次创建时省略 |
   | requirements | 用户要求及本次新增要求的字符串数组；构图、生成和比较使用。生成任务还包含本次可新增张数和任务累计数量 |
   | input_files | 本次材料列表；每项 path 为需要读取的完整文件或目录路径，purpose 说明材料是什么；构图、生成和比较使用 |
   | reference_files | 对应角色参考文档完整路径的字符串数组；构图、生成和比较使用 |
   | supplied_data | 生成任务所需的已选 Workflow、模型、LoRA 信息，或生成 Agent 请求的完整 Builder JSON 原文；仅生成使用，无需补充数据时省略 |
   | images | 实际图片引用列表；每项 run_id 为所属生成记录，media_id 为该记录中的媒体 ID；仅观察使用。工具按当前 Workspace 查询引用，并将实际图片路径提供给观察 Agent |
   | observation | 首轮使用 `{mode:"initial"}`；补充观察使用 `{mode:"supplement",missing_facts:[待补充事实]}`。待补充事实来自比较结果 |
   | output_files | 本次输出列表；每项 path 为父 Agent 指定的完整文件路径，purpose 说明结果文件的内容 |

4. 主 Agent 按以下顺序接收结果并继续任务。

   1. 将接纳回执及工具附加上下文保存到 task.md，字段见[交接目录与文件规范](references/records.md#确定任务目录和文件写入者)。
   2. 收到对应子 Agent 的原生结束通知后，核对任务状态、最终答复及指定结果文件；任务尚在运行时，主 Agent 可以处理与该结果无关的工作。
   3. 子 Agent 报告错误、缺少输入或需要用户选择时，主 Agent 保留缺项和候选来源。主 Agent 按子任务所用 Skill 的条件转达问题。不得把候选改写成用户选择。
   4. 取得所需答复或材料后，主 Agent 通过原角色工具向当前子任务的 agent_id 补充本次任务所缺的参数。
   5. 满足后续任务的输入条件后，派发依赖该结果的任务。不得派发依赖已知缺项的任务。

## 在原生成子会话中恢复任务

1. 生成子任务因 `max-tokens` 结束，或父任务中断、应用重启后，主 Agent 核对已有产物。主 Agent 读取 task.md、已有 Builder JSON、生成记录和已保存的 Run 查询结果，确定已完成步骤和缺少的产物。

2. 主 Agent 按整个任务累计已接纳的生成张数。恢复和新轮次均沿用 task.md 的数量记录。主 Agent 在续派前核对全任务剩余张数和本次可新增张数。

3. 主 Agent 按派发工具说明找回生成子会话身份，向 subagent_generation 填写原 agent_id。恢复派发必须包含以下输入。

   1. input_files 提供已有产物的路径，如 Builder JSON、生成记录和 Run 查询结果。
   2. requirements 写明已有 Run ID 或尚未提交。requirements 列出未完成步骤、全任务剩余张数和本次可新增张数。
   3. reference_files 提供本 Skill 的 SKILL.md 和 references/run-query-cli.md 的完整路径。requirements 指定生成 Agent 读取“在原生成子会话中恢复任务”节，执行其中的生成步骤。

4. 已有 Run 时，生成 Agent 先按 references/run-query-cli.md 查询已有 Run，复用已取得的参数和媒体。尚未取得图片或查询失败时，生成 Agent 按该参考报告结果，不得据此重复提交。查询未提供完整运行状态时，主 Agent 在 task.md 记录该事实。尚未提交时，生成 Agent 从已有 Builder JSON 或输入继续，仅提交本次可新增张数以内的图片。

5. `max-tokens` 本身不得作为新建生成子会话的依据。宿主拒绝续派时，主 Agent 保存原错误与会话 ID，并处理错误指出的缺项。

## 根据画面目标和观察反馈继续迭代

1. 主 Agent 向构图 Agent 提供原始故事、人物材料和用户要求。构图 Agent 返回材料理解、画面目标、核心要素和构图设计。材料无法支持合理推导且分歧必须由用户决定时，主 Agent 才询问用户。主 Agent 把答复交给原构图 Agent。
2. 主 Agent 向生成 Agent 提供构图文件、用户要求和已选 Workflow、模型及 LoRA 信息。生成 Agent 完成后，主 Agent 读取生成记录中的 Run ID 与媒体 ID。
3. 主 Agent 按 images 参数填写图片引用，以 observation.mode=initial 派发首轮观察。首轮观察只使用图片、输出路径和工具提供的通用观察要求；主 Agent 不得向观察任务补充故事、构图目标或期望答案。
4. 主 Agent 向比较 Agent 提供本轮构图文件、用户要求和原始观察文件。比较 Agent 按 [references/iteration-method.md](references/iteration-method.md) 执行比较。
5. 目标未达成时，主 Agent 按以下条件派发后续任务。

   1. 必要条件缺少证据或观察相互冲突时，主 Agent 将待补充事实放入 observation.missing_facts。主 Agent 以 observation.mode=supplement 派发补充观察，再派发比较任务。补充观察仍不足以判断时，对应条件保留为无法确定。
   2. 比较结果指出材料理解或构图问题时，主 Agent 将比较文件交给原构图 Agent。主 Agent 将返回的构图文件用于后续生成。
   3. 比较结果指出 Prompt 问题时，主 Agent 将比较文件交给原生成 Agent，要求其针对偏差修改 Prompt。主 Agent 再继续生成、观察和比较。

6. 构图 Agent 和生成 Agent 修改构图或 Prompt 时，保留画面目标、核心要素及用户明确要求。

## 核对证据并交付图片

1. 交付前，主 Agent 核对生成记录、原始观察和比较结果中的媒体身份。主 Agent 确认 run_id、media_id 与实际图片路径对应同一张图片。
2. 主 Agent 逐项核对证据表与原始观察。同一张图片的全部必要条件均为满足时，主 Agent 才宣布目标达成。主 Agent 展示图片、实际配置和达成依据。
3. 用户停止、达到用户明确限制或实际错误使任务无法继续时，主 Agent 展示已有结果。主 Agent 说明原因及不满足、无法确定的条件。需要停止仍在工作的子 Agent 时，使用 interrupt_agent 并传入其 agent_id。
