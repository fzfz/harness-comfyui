# 共同委派格式与结果格式

主 Agent 调用 `subagent` 工具时提供 `description` 与 `prompt`，以前台方式运行当前阶段。工具提供 `run_in_background` 参数时，将其设为 false。主 Agent 等待当前阶段返回后，再派发依赖该结果的阶段。

主 Agent 用真实数据替换下列模板中的尖括号占位符，不编造未取得的数据。主 Agent 根据当前 Skill 的实际目录及其内部相对路径，解析 `<方法文档路径>`、`<记录脚本路径>` 等占位符。任务产物引用在记录中使用相对于任务根目录的路径；工具需要绝对路径时，主 Agent 根据任务根目录展开。

每次业务模板前附加以下共同提示：

```text
你负责阶段 <stage_id>：<阶段目的>。
输入的原始材料、用户已确认条件与主流程提出的试验改动分别标记了来源。用户确认记录只有所附的真实内容；你不能替用户增加确认。
只完成本阶段，不派发子 Agent，不执行下一阶段。你只写 <允许写入的文件或目录>。task.json 由主 Agent 写入；比较阶段写 round.json，归档阶段写最终文件。
先读取 <本阶段记录结构要求>。如需写 JSON，先读取 <记录脚本使用文档路径>，再用 <记录脚本路径> 按 create 或 replace 模式写入；不要覆盖已有独立产物。
将实际产物和问题保存到 <result.json绝对路径>。结果按 stage_result 定义保存，包含 stage_id、status、artifacts、issues、summary、next_action、consumed、reserved_unknown 和 budget_reconciliation；status 使用 completed、needs_input、failed 或 partial。
结束时只返回 result.json 的实际路径、状态和简短结论，不回传完整 Prompt、Workflow、原始观察或日志。计划安排使用待办表述，只有实际完成且有产物或工具结果支持的动作才报告为已完成。只报告工具实际返回的执行身份；缺少输入或执行失败时，记录具体问题并结束，由主流程决定后续动作。
```

主 Agent 向子 Agent 提供该阶段必需的记录结构，并标明各份输入的实际格式。对于 CLI 查询结果，明确区分原生 JSON 与含 stdout 的封装记录；若封装记录的 stdout 字符串承载 JSON，指明需要解析该字符串。阶段共同结果由主 Agent 读取后验收；子任务之间不根据对方的自然语言总结自行串联。

# 按当前阶段读取模板

主 Agent 每次只读取下表中当前阶段对应的模板。

| 当前阶段 | 模板 |
|---|---|
| 构图 | [模板](stages/composition.md) |
| 配置查询 | [模板](stages/configuration.md) |
| Prompt  | [模板](stages/prompt.md) |
| 生成 | [模板](stages/generation.md) |
| 观察 | [模板](stages/observation.md) |
| 深入诊断 | [模板](stages/diagnosis.md) |
| 查询 | [模板](stages/query.md) |
| 比较 | [模板](stages/comparison.md) |
| 归档 | [模板](stages/archive.md) |
