---
name: comfyui-iterate-generation
description: 主 Agent 在用户要求根据故事和人物构思画面，并通过生图、独立观察、比较反馈和小步 Prompt 修复迭代达成画面目标时使用。
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

3. 主 Agent 调用对应角色工具，并填写下表参数。

   1. 角色工具等待子 Agent 本轮工作结束后返回。
   2. 首次任务省略 agent_id，工具返回 kind=continuable 和 subagentId。
   3. 构图和生成的后续任务仍调用原角色工具，agent_id 填原 subagentId；返回的 messageId 标识本次接纳的消息。
   4. 每轮观察与比较分别创建新子 Agent。

   | 参数 | 主 Agent 提供的内容 |
   |---|---|
   | description | 本次任务的简短名称 |
   | agent_id | 接收后续任务的已有子 Agent 的 subagentId；首次创建时省略 |
   | requirements | 用户要求及本次新增要求的字符串数组；构图、生成和比较使用 |
   | input_files | 本次材料列表；每项 path 为需要读取的完整文件或目录路径，purpose 说明材料是什么；构图、生成和比较使用 |
   | reference_files | 对应角色参考文档完整路径的字符串数组；构图、生成和比较使用 |
   | supplied_data | 生成任务所需的已选 Workflow、模型、LoRA 信息，或生成 Agent 请求的完整 Builder JSON 原文；仅生成使用，无需补充数据时省略 |
   | images | 实际图片引用列表；每项 run_id 为所属生成记录，media_id 为该记录中的媒体 ID；仅观察使用。工具按当前 Workspace 查询引用，并将实际图片路径提供给观察 Agent |
   | questions | 中性观察问题的字符串数组；仅观察使用 |
   | output_files | 本次输出列表；每项 path 为父 Agent 指定的完整文件路径，purpose 说明结果文件的内容 |

4. 主 Agent 按以下顺序接收结果并继续任务。

   1. 将工具附加上下文中的接纳身份保存到 task.md。
   2. 读取原生结束通知及其结果文件。
   3. 子 Agent 报告错误、缺少输入或需要用户选择时，保留报告中的缺项和候选来源，按该子任务所用 Skill 的条件转达问题。不得把候选改写成用户选择。
   4. 取得所需答复或材料后，通过原角色工具向原 agent_id 发送补充后的任务参数。
   5. 满足后续任务的输入条件后，派发依赖该结果的任务。不得派发依赖已知缺项的任务。

5. 派发中断后，主 Agent 读取 task.md 中的接纳身份；尚未保存时，从工具附加上下文读取。缺少 subagentId 时，调用 list_agents 找回原子会话。主 Agent 等待仍在运行的子会话结束，再按本节第 4 项处理通知与结果。不得因派发中断而重建同一任务。

## 根据画面目标和观察反馈继续迭代

1. 主 Agent 向构图 Agent 提供原始故事、人物材料和用户要求，取得对材料的理解、画面目标、核心要素和构图设计。只有材料无法支持合理推导且必须由用户决定的关键分歧，主 Agent 才询问用户，并把答复交给原构图 Agent。
2. 主 Agent 向生成 Agent 提供构图文件、用户要求和已选 Workflow、模型及 LoRA 信息。生成 Agent 完成后，主 Agent 读取生成记录中的 Run ID 与媒体 ID。
3. 主 Agent 按本 Skill 的 images 参数填写图片引用，并向观察 Agent 提供中性问题。中性问题询问可见内容，不预设期望答案，例如“人物双手在哪里，手中物件是否可辨”。
4. 主 Agent 向比较 Agent 提供本轮构图文件、用户要求和原始观察文件；分析偏差时补充生成参数、Prompt 和此前结果。比较 Agent 分别判断每张图片是否满足画面目标、全部核心要素和用户明确要求。
5. 目标未达成时，主 Agent 按以下条件派发后续任务。

   1. 主 Agent 将比较文件交给原生成 Agent，要求原生成 Agent 针对比较指出的具体偏差修改 Prompt，再继续生成、观察和比较。
   2. 材料理解或构图有问题时，交给原构图 Agent。新的构图文件用于后续生成。
   3. 缺少关键观察时，主 Agent 先针对实际图片派发补充中性读图，再派发比较任务。

6. 构图 Agent 和生成 Agent 修改构图或 Prompt 时，保留画面目标、核心要素及用户明确要求。同一幅图片同时满足全部目标和要求时，主 Agent 展示图片、实际配置及达成依据。

7. 用户停止、达到用户明确限制或实际错误使任务无法继续时，主 Agent 展示已有结果，说明具体原因和未达成内容；需要停止仍在工作的子 Agent 时，使用 interrupt_agent 并传入其 agent_id。
