# Harness ComfyUI v0.31.2

v0.31.2 删除 Harness 对 Source 模板参数元数据的运行依赖，并把目标 ComfyUI 官方前端导出的 API Workflow 作为执行基础。用户每次只需要导入 UI Workflow；Host 负责定位显式运行参数、复用本地 Official API Workflow cache，并把本次已确认的运行值覆盖到官方基础对象。

## Workflow 编译与缓存

- Generation Source adapter、Catalog Source adapter、当前 Source contract 和 `comfyui-generate` Skill 不再读取、校验、投影或暴露 Source 模板响应中的 `parameters_json` 与 `bindings_json`。
- Workflow compiler 使用当前 UI Workflow、目标实例实时 `/object_info`、节点输入名称、节点标题、活动状态、上下游连线和 bypass 数据流定位运行输入。该流程不包含模板 ID 或固定节点 ID 特例。
- Official API Workflow cache 按实例身份、实例 origin、实例缓存代次、UI Workflow 内容和执行结构隔离。cache miss 通过目标 ComfyUI 页面的 `loadGraphData()` 与 `graphToPrompt()` 导出官方基础对象；cache hit 不再次启动浏览器。
- ComfyUI 前端导出的字面量载体只在合法执行节点通过输出 `0` 引用时折叠到目标输入。非零输出、未引用同形对象和无效 API Workflow 会明确失败，并且失败结果不会写入缓存。

## 运行参数与 LoRA

- Host 使用一个结构化注册表定义 15 个公开标准参数键：正向 Prompt、负向 Prompt、宽度、高度、Seed、CFG、采样步数、采样器、调度器、去噪强度、批量大小、分辨率预设、参考图、宽高比和百万像素数。
- 运行参数键的节点编号后缀是严格目标选择。不存在的后缀不会回退到唯一同类控件；规范参数和后缀参数以不同值占用同一执行输入时会返回目标冲突错误。
- Prompt 解析区分正向与负向执行链，排除停用和无效 bypass 候选，并在存在下游执行连线时优先选择已连接候选。宽高、Seed、CFG、采样步数、去噪强度和批量大小可以解析连接到执行节点的上游标量控件。
- 空 LoRA 选择保留模板中的标准 LoRA、Power LoRA 或 LoraManager 状态。只有显式 LoRA 选择才会替换对应的可执行 LoRA 输入。
- 参数目标错误文案只指向显式运行参数键、错误详情中的候选 ComfyUI 节点输入、当前 UI Workflow、目标实例节点定义和节点编号后缀，不再要求用户提供模板 binding。

## 验证

- 实例 122 的当前 Source Catalog 包含 33 个 Workflow 模板。真实矩阵逐模板验证 15 个公开参数，共 495 项结果全部符合 [`config/verification/comfyui-workflow-parameter-support.json`](https://github.com/fzfz/harness-comfyui/blob/v0.31.2/config/verification/comfyui-workflow-parameter-support.json) 中的精确非空支持集合。
- 33 个模板各自把全部受支持参数组合提交给 Workflow compiler，全部通过；重复目标、目标歧义和其他编译错误数量均为 0。
- 33 个模板分别完成真实 ComfyUI 页面 Official API Workflow cache miss、同模板 cache hit 和基础对象一致性验证；每个模板在独立缓存目录中只启动一次页面导出。
- 独立 worktree 中的真实浏览器通过模板 39 和实例 122 提交 10 个显式运行参数。Run 成功保存一张 512×512 PNG；Request、Actual Workflow 与 API Workflow 中的 Prompt、Seed、尺寸和采样参数一致，空 LoRA 请求保留模板 LoraManager 内容。
- 完整 `pnpm quality` 已通过：404 项 unit/integration、24 项 contract/security、40 项 production 和 27 项 prototype 测试全部通过；函数覆盖率为 100%。依赖审计结果为 critical 0、high 0、moderate 0、low 0。
- 本版本没有新增 npm 依赖，也没有修改 `pnpm-lock.yaml`。本版本只发布 Git tag 与 GitHub Release 记录，不附加产品包。
