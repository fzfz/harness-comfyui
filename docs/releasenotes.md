# Harness ComfyUI v0.30.1

v0.30.1 交付生成模型选择、复杂 Workflow 编译和 LoRA 输入处理增强。

## 主要变更

- `comfyui-generate` Skill 支持将已解析的生成模型传入 `generate_with_comfyui`，并把模板 `model_id` 解释为 Workflow 当前保存的默认生成模型；模板、生成模型和 LoRA 继续按 `base_model_id` 校验兼容性。
- Workflow compiler 支持在唯一的 `ckpt_name` 或 `unet_name` 输入中替换生成模型，并按目标 ComfyUI 实例的资源路径解析模型文件名；模型输入缺失、输入不唯一、资源缺失和资源路径不唯一时返回独立错误码。
- Workflow compiler 支持序列化命名控件值、Power Lora Loader、绕过节点链接解析，以及对已连接输入的参数写入保护；参数更新同时维护 `widgets_values` 与 `widgets_values_named`。
- Workflow compiler 扩展宽度、高度和 Seed 参数的目标匹配规则，并保留现有模板参数、LoRA 输入、输出节点和异步 Generation Run 链路。
- 错误目录新增生成模型输入与生成模型资源错误文案，单元测试覆盖模型替换、复杂 LoRA 输入、绕过链接、命名控件和参数分支。

## 验证

- `pnpm quality` 通过后，发布负责人在源码提交和最终发布提交的 GitHub CI 均成功时创建 GitHub Release。
- 发布标签 `v0.30.1` 指向最终发布提交的完整 SHA，GitHub Release 不附加产品包。
