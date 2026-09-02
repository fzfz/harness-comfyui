# Template Parameter Inspection CLI

## CLI 的用途与适用任务

`generation inspect-template-parameters --stdin` 读取当前 Workflow 模板和目标 ComfyUI 实例实际发布的运行参数合同。`comfyui-generate` 在提交图片生成任务前使用该命令确认正向 Prompt、负向 Prompt、Seed 和尺寸参数，并把 Prompt Builder 的模板无关目标尺寸转换为模板实际接受的一种尺寸表示。

Prompt Builder 不调用本命令。Catalog resolve 不提供模板参数能力，也不能替代本命令。

## 调用环境与可执行入口

Skill 执行者只能在 Harness 提供的前台 shell Tool Call 中调用以下入口：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation inspect-template-parameters --stdin
```

前台 shell 的工作目录必须是当前 Session 的 Workspace。调用前，Harness Host 必须处于运行状态，并且 managed shell environment 必须提供非空 `DSH_HARNESS_COMFYUI_CLI`、CLI endpoint 和短期 capability。CLI 从 managed environment 自动取得 endpoint、capability、Session、Turn、Tool Call 和工作目录对应的执行身份；Skill 执行者不设置这些环境值，也不传 Workspace ID、Session ID、Turn 或 Tool Call ID。本命令只使用标准输入中的模板 ID 与实例 ID。

## 命令与调用时机

Skill 执行者必须先完成模板 resolve 和实例目录查询，再对本次执行中每组唯一的非空 `(template_id, instance_id)` 调用一次检查命令。多项 Generation Request 使用同一组 ID 时，可以复用本次执行仍完整保留的同一检查结果；任一 ID 改变时必须重新检查。

Skill 执行者必须在构造第一项 Generation Request 的实际 `parameters` 以前完成检查。检查失败时不得提交 Run。

## 参数与标准输入

标准输入必须是只包含 `template_id` 与 `instance_id` 的 JSON 对象：

```json
{"template_id":"36","instance_id":"2"}
```

两个属性都必须是首尾去除空白后非空的字符串。标准输入缺少属性、包含额外属性、属性类型错误或空字符串时，CLI 返回请求错误。

## ID 与运行值的来源

`template_id` 来自当前消息唯一 Workflow 上下文的 `data.id`，并且模板 resolve 结果的 `id` 必须与该值一致。`instance_id` 来自当前 `catalog instance list` 结果中首个可用实例的 `id`。Skill 执行者不得使用模板 ID、模型 ID、LoRA ID、历史实例 ID 或猜测值替代实例目录结果。

本命令返回的 `parameter_id`、当前值和允许值来自该模板在该实例上的实际 Workflow 参数合同。Skill 执行者必须按返回的精确 `parameter_id` 构造提交参数，不根据常见参数名、节点后缀或静态模板名单猜测参数能力。

## 输出与完成语义

成功输出是只包含 `parameters` 与 `size_candidates` 的 JSON 对象。

`parameters` 包含非尺寸运行参数。每项包含：

- `parameter_id`：提交时必须使用的精确参数名；
- `kind`：标准运行参数语义；
- `value_type`：`integer`、`number`、`string`、`boolean` 或 `choice`；
- `current_value`：Workflow 当前值；
- 实际存在时返回 `minimum`、`maximum` 或 `allowed_values`。

`size_candidates` 的每一项都有唯一 `candidate_id`，并且只使用以下一种结构：

- `representation: "width_height"`：`width` 与 `height` 分别是完整参数对象。
- `representation: "aspect_ratio_megapixels"`：`aspect_ratio` 与 `megapixels` 分别是完整参数对象。
- `representation: "resolution_preset"`：`parameter` 是 preset 参数对象；`mapped_options` 的每项包含原始 `value`、确定的 `width` 与 `height`；`unmapped_values` 只供报告，不能自动选择。

`size_candidates` 只返回能够控制所有活动图片输出最终可见尺寸的末端尺寸控件。活动图片输出是 `/object_info` 标记为 `output_node: true`，并且通过已连接的 `IMAGE` 输入或 `IMAGE` 类型连线接收图片的活动 ComfyUI 节点；只接收 `COMBO`、字符串或其他非图片数据的辅助输出节点不属于图片输出。一个上游 latent 尺寸在输出路径中被下游独立 resize 或 upscale 尺寸覆盖时，检查结果不把上游尺寸作为可兑现的候选；下游尺寸控件具有可写合同时，检查结果返回该控件的精确带节点后缀 `parameter_id`。没有一组尺寸控件能够控制所有活动图片输出时，`size_candidates` 为空，生成 Skill 必须报告模板不兼容并停止提交。

生成 Skill 必须确认 `parameters` 中存在 `positive_prompt`、`seed` 和 `batch_size`。`batch_size` 必须使用 `value_type: "integer"`，并且其 `minimum`、`maximum` 或 `allowed_values` 合同必须接受整数 `1`；每项图片请求必须使用该项返回的精确 `parameter_id` 写入整数 `1`。原生负向模式还必须存在 `negative_prompt`。缺少对应参数或 `batch_size` 合同不接受 `1` 时，生成 Skill 停止提交并报告模板 ID、实例 ID 和具体参数合同。正向规避模式不得向模板提交负向参数。具体 Seed 必须按 `generation-cli.md` 对检查结果中的 Seed 参数合同进行预校验。

生成 Skill 按以下顺序选择实际尺寸：

1. 完全原值匹配时，优先 `width_height`，其次 `aspect_ratio_megapixels`，最后 `resolution_preset`。
2. `width_height` 只能按同一缩放比例调整两个整数值，并同时满足各参数的最小值与最大值。
3. `aspect_ratio_megapixels` 先选择规范化后完全相同的允许比例；没有完全匹配时，选择比例偏差最小的允许比例。百万像素值使用范围内原值，或者选择差值最小的允许值。
4. `resolution_preset` 只能自动选择 `mapped_options`；不能从 `unmapped_values` 猜测像素尺寸。
5. 所有自动调整都必须同时满足相对宽高比偏差不超过 `5%` 和相对像素面积偏差不超过 `10%`。阈值包含恰好 `5%` 和 `10%`。
6. 多个调整候选都合格时，先选择比例偏差最小者，再选择面积偏差最小者。

目标比例是 Builder `width ÷ height`，目标面积是 Builder `width × height`。比例偏差为 `abs(实际比例 - 目标比例) ÷ 目标比例`；面积偏差为 `abs(实际面积 - 目标面积) ÷ 目标面积`。Selector 的实际面积使用 `megapixels × 1,000,000`。

使用调整候选前，Skill 执行者必须向用户说明 Builder 目标尺寸、实际参数、比例偏差和面积偏差。用户明确要求尺寸不得调整时，只能接受原值候选。没有合格候选时，Skill 执行者报告模板 ID、实例 ID、目标尺寸和实际允许值，并要求用户选择其他模板、接受一项明确列出的尺寸或返回 Prompt Builder 重新设计。

命令成功时退出码为 `0`，stderr 为空，stdout 写入一行完整 JSON 检查结果。命令成功只表示检查完成；不表示模板已经编译，不表示 Run 已创建，也不表示图片已经生成。命令失败时退出码非零，stdout 不作为检查结果使用，stderr 使用 `错误码: 错误消息` 格式。

## 错误、修正与重试

CLI 返回非零退出码时，标准错误包含具体错误码与消息。Skill 执行者按下列分支处理：

- 输入请求错误：修正缺失、额外、空白或类型错误的 `template_id`、`instance_id` 后重试。
- 模板或实例不存在：重新执行对应 Catalog 查询并取得当前 ID 后重试。
- 实例连接错误：确认当前实例目录状态恢复后重试。
- `GENERATION_PARAMETER_TARGET_AMBIGUOUS`：报告模板中的歧义参数目标并停止；不能选择其中一个猜测目标。
- `GENERATION_PARAMETER_TARGET_NOT_FOUND`：报告找不到的实际参数目标并停止；不能使用静态参数名单补足。
- `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED`：报告参数 ID 与不受支持的实际合同并停止。
- `GENERATION_PARAMETER_INVALID`：报告参数 ID 与实际合同错误；只有修正模板实际参数值或目标实例状态后才能重试。

检查错误发生后，Skill 执行者必须在修正输入或确认实例恢复后才重试。同一错误没有任何输入或外部状态变化时不能重复调用。

## 副作用与重复调用

本命令是只读命令。本命令不创建 Generation Run，不修改 Workflow，不提交图片任务，也不触发 Official API Workflow 编译。

同一组 `(template_id, instance_id)` 在一次 Skill 执行中只需检查一次。上下文压缩后检查结果不再完整可见时，Skill 执行者必须重新读取本文件并重新调用检查命令。

## 完整调用示例

调用：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation inspect-template-parameters --stdin <<'JSON'
{"template_id":"36","instance_id":"2"}
JSON
```

示例成功输出：

```json
{
  "parameters": [
    {"parameter_id":"positive_prompt","kind":"positive_prompt","value_type":"string","current_value":""},
    {"parameter_id":"seed","kind":"seed","value_type":"integer","current_value":0,"minimum":0,"maximum":2147483647},
    {"parameter_id":"batch_size","kind":"batch_size","value_type":"integer","current_value":1,"minimum":1,"maximum":8}
  ],
  "size_candidates": [
    {
      "candidate_id":"aspect_ratio_megapixels:aspect_ratio:megapixels",
      "representation":"aspect_ratio_megapixels",
      "aspect_ratio":{"parameter_id":"aspect_ratio","kind":"aspect_ratio","value_type":"choice","current_value":"1:1","allowed_values":["1:1","9:16","16:9"]},
      "megapixels":{"parameter_id":"megapixels","kind":"megapixels","value_type":"number","current_value":1,"minimum":0.5,"maximum":2}
    }
  ]
}
```

本例中的模板 ID `36` 来自当前消息的 Workflow 选择，实例 ID `2` 来自前置 `catalog instance list` 结果。生成 Skill 必须使用输出中的 `positive_prompt`、`seed`、`batch_size`、`aspect_ratio` 和 `megapixels` 这些精确 `parameter_id`，并按所选 Builder 结果与 Seed 合同填写实际值。
