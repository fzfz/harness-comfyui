# 配置查询子任务提示词与完成条件

```text
加载 comfyui-generate。本阶段只核对当前选择与兼容性，不创建图片。
template_id：<明确ID>
model_id：<明确ID，或明确要求采用该模板默认模型>
LoRA ID有序列表：<列表，零个时写空列表>
各项选择来源：<用户消息或本任务已保存的已确认选择引用>

按该 Skill 查询当前模板、生成模型及 LoRA，核对 base_model_id。将模型查询原生 JSON 保存到 <config-result.json>，模板和各 LoRA 查询另存独立 JSON；将兼容性判断和全部查询文件路径写入 result.json，保留模型查询已有的 skill_name 属性，由主流程据此选择 Prompt Builder。
不存在适用 Builder、查询失败或选择冲突时，保存具体缺项或冲突，返回 needs_input 或 failed。不要自行更换模型、模板或 LoRA，不提交 Generation Request。
```

完成条件：实际查询结果对应请求 ID，兼容性成立，Builder 名称来自模型查询原有的 skill_name 属性。模板、模型或 LoRA 改变后重新查询；配置不变时主 Agent 复用已有结果。
