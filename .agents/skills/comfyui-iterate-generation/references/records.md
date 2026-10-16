---
文档用途: 规定迭代任务的交接文件及写入职责。
读取时机: 主 Agent 首次分配迭代任务的输入和输出文件前。
---
# 主 Agent 分配交接文件并传递结果

## 确定任务目录和文件写入者

1. 主 Agent 使用用户指定的输出目录；用户未指定时，在当前任务 Workspace 中选择本次任务目录。下文 TASK_DIR 表示该目录的实际绝对路径。

   | 相对 TASK_DIR 的路径 | 写入者 | 文件内容 |
   |---|---|---|
   | task.md | 主 Agent | 用户明确要求、原始材料路径、各子 Agent 的职责及接纳身份（subagentId 和各次派发的 messageId）、任务进展、当前构图及各轮结果文件路径；完成时记录最终图片和达成依据，中止时记录原因及未达成内容 |
   | composition/001.md | 构图 Agent | 对故事与人物的理解、画面目标、核心要素及其作用、构图设计、材料依据和需要用户决定的问题 |
   | rounds/001/builder.json | 生成 Agent | 实际模型对应的 Prompt Builder 输出的完整 JSON |
   | rounds/001/generation.md | 生成 Agent | 本轮构图文件路径、实际 Prompt、生成参数或对应记录路径、run_id、查询所得的 media_id 与实际图片路径，以及本次修改 |
   | rounds/001/observation-001.md | 观察 Agent | 每张图片的原始观察、实际图片路径、run_id 对应关系、观察模型信息、无法判断之处和读取错误 |
   | rounds/001/comparison-001.md | 比较 Agent | 所用构图和观察文件路径、逐图达成情况、观察依据、具体偏差、原因假设、修改方向和必须保留的表现 |

2. ComfyUI 图片保留在实际生成位置。

3. 生成 Agent 需要交付完整查询结果时，将 CLI 已保存的文件复制到本轮目录，并在 generation.md 中记录副本路径。后续保存和交接复用该副本。

## 为构图版本、生成轮次和补充结果编号

1. 主 Agent 按以下规则分配编号。编号从 001 开始，至少使用三位十进制数，已有结果保留。

   1. 新构图版本依次使用 composition/001.md、composition/002.md。
   2. 主 Agent 每次派发新一轮生成任务时，新建下一轮目录，如 rounds/002/；生成 Agent 将本轮 Builder JSON 和生成记录分别写入该目录中的 builder.json 和 generation.md。
   3. 每轮首次观察写入 observation-001.md；同轮补充观察依次使用 observation-002.md、observation-003.md。
   4. 每轮首次比较写入 comparison-001.md；同轮根据补充证据重新比较依次使用 comparison-002.md、comparison-003.md。

2. 主 Agent 在派发前创建本次输出目录。output_files 的填写规则见 [SKILL.md](../SKILL.md#派发任务并接收结果文件) 的参数表。子 Agent 写入指定文件，完成回复只返回这些文件的完整路径；实际错误或缺少输入时报告具体问题。

## 按交接对象提供输入文件

1. 下表中的文件编号用于举例说明各类任务的输入与输出。主 Agent 派发任务时，将示例编号替换为本次任务的实际编号，并将相对路径转换为 TASK_DIR 下的完整绝对路径。

   | 接收者与任务 | 主 Agent 提供的输入 | 本次输出 |
   |---|---|---|
   | 构图 Agent：首次设计 | 原始故事和人物材料路径、用户要求 | composition/001.md |
   | 生成 Agent：首次生图 | composition/001.md、用户要求、已选 Workflow、模型及 LoRA 信息 | rounds/001/builder.json 和 rounds/001/generation.md |
   | 观察 Agent：首次读图 | rounds/001/generation.md 中的图片引用，以及主 Agent 编写的中性问题；图片引用按 [SKILL.md](../SKILL.md) 的 images 参数填写 | rounds/001/observation-001.md |
   | 比较 Agent：首次比较 | composition/001.md、用户要求、rounds/001/observation-001.md；分析偏差所需的 rounds/001/generation.md 和 rounds/001/builder.json | rounds/001/comparison-001.md |
   | 原生成 Agent：修改后生图 | 当前构图文件、用户要求、上一轮比较文件、生成记录、Builder JSON 及比较所依据的观察文件 | rounds/002/builder.json 和 rounds/002/generation.md |
   | 原构图 Agent：修正理解或设计 | 当前构图文件、原始材料、用户要求和指出构图问题的比较文件 | composition/002.md |
   | 观察 Agent：同轮补充读图 | 本轮图片引用和需要补充的中性问题 | rounds/001/observation-002.md |
   | 比较 Agent：同轮补充证据后重比 | 本轮使用的构图文件、用户要求、首次与补充观察文件，以及首次与补充观察对应的生成记录 | rounds/001/comparison-002.md |

2. 主 Agent 接收完成回复后读取指定文件，将结果路径记入 task.md，向后续任务传递所需输入。

3. 生成 Agent 按 comfyui-generate 的输入要求，请求在后续消息中接收完整 Builder JSON 时，主 Agent 读取对应 builder.json。主 Agent 通过 subagent_generation 的 supplied_data 原样转交文件内容。agent_id 填该生成 Agent 的 subagentId。
