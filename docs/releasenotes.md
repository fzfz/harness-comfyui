# Harness ComfyUI v0.30.5

v0.30.5 修复 connected runtime binding 没有改写真实上游 widget、模板序列化结构与实时节点定义不一致、派生分辨率没有同步，以及临时预览媒体阻断保存图下载导致的生成错误。

## 主要变更

- Workflow compiler 沿 `replace_input` binding 的连接解析真正生效的上游 Prompt、seed、width、height 和其他 widget。正负 Prompt 不再写入 LoRA Manager 配置文本；Prompt 和非分辨率参数的零目标或多目标结构返回包含参数 ID 与候选目标的明确错误。Connected width/height 无法解析唯一上游目标时，compiler 断开对应 selector 连接并把请求值写入 binding 指定的本地 widget。
- 多个 runtime 参数解析到同一个 widget 时，相同值只写入一次，不同值返回冲突错误。模板明确绑定 bypass LoRA Loader 时，compiler 激活该 Loader 并写入 LoRA 文件名和权重。
- Compiler 只对缺少实时 `/object_info` 定义且满足严格序列化形状的 `TextInput_` 与 `Float` 节点内联常量；动态 COMBO widget 顺序、断开输出节点、connected 分辨率输入和同倍率 `LatentUpscale` 派生尺寸均按实际 Workflow 结构编译。
- Comfy transport 在同一个完成响应包含 `PreviewImage(type=temp)` 与 `SaveImage(type=output)` 时忽略临时预览并保存正式输出。未知 descriptor type、不安全路径、媒体类型错误和媒体签名错误继续返回 `COMFYUI_OUTPUT_INVALID`。

## 验证

- 本地 `pnpm quality` 通过：283 项 unit/integration、20 项 contract/security、14 项 production 和 27 项 prototype 测试全部通过。
- 生产数据源的 32 个现有模板全部通过声明参数单探针、组合参数和 LoRA 编译矩阵；32 个模板均完成真实生成，34 次成功运行下载的 46 张图片均完成人工查看，Actual Workflow 与 API Workflow 中的请求参数均逐项一致。
- 当前数据源声明的 runtime parameter kind 为正面提示词、负面提示词、宽度、高度、种子、分辨率预设、参考图、LoRA 模型、LoRA 权重和 LoRA 触发词。数据源没有声明 steps、CFG、denoise、batch size、宽高比或放大倍数参数，因此本次验收没有把这些未声明参数计为公开请求通过。
- 源码版本提交 `dd9f0fb41f87c81ad041370c9bdb8374c2c19ff2` 的 GitHub CI 已成功。
- 本版本只发布 Git tag 与 GitHub Release 记录，不附加产品包。
