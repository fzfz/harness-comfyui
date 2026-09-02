# Generation CLI

## CLI 的用途与适用任务

`comfyui-generate` 使用本文件中的三个 managed CLI 命令：

- `generation run-inputs --stdin` 按一个或多个 `run_id` 读取历史 Generation Run 创建时保存的生成参数与 Actual Workflow。
- `generation random-seeds --stdin` 为本次图片请求取得互不相同的普通随机 Seed。
- `generation submit --stdin` 提交一项异步 Generation Run。

历史查询与随机 Seed 命令不创建 Generation Run。提交命令会创建 Generation Run。Prompt Builder 可以按各自 Skill 的历史查询参考调用 `generation run-inputs --stdin` 读取历史 Prompt 与 Actual Workflow，但不得为 Seed 决策发起查询，也不得把历史 Seed 写入 Builder 结果。Prompt Builder 不调用 `generation random-seeds --stdin` 或 `generation submit --stdin`；`comfyui-generate` 独占 Seed 的来源解析、模板合同校验、请求分配和重试处理。

## 调用环境与可执行入口

Skill 执行者只能在 Harness 提供的前台 shell Tool Call 中调用以下入口：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin
node "$DSH_HARNESS_COMFYUI_CLI" generation random-seeds --stdin
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin
```

前台 shell 的工作目录必须是当前 Session 的 Workspace。调用前，Harness Host 必须处于运行状态，并且 managed shell environment 必须提供非空 `DSH_HARNESS_COMFYUI_CLI`、CLI endpoint 和短期 capability。CLI 从 managed environment 自动取得 endpoint、capability、Session、Turn、Tool Call 和工作目录对应的执行身份；Skill 执行者不设置这些环境值，也不传 Workspace ID、Session ID、Turn 或 Tool Call ID。提交成功或失败时，Host 使用该执行身份保存 Generation Run 的归属。

## 命令与调用时机

用户要求读取、核对或复用已有 `run_id` 的 Workflow、模板 ID、模型、LoRA、Prompt、Seed 或其他生成参数时，Skill 执行者调用 `generation run-inputs --stdin`。只查询历史 Run 时不得调用提交命令。

Skill 执行者先把全部逻辑结果展开为 N 张图片，再为每张图片分别确定显式整数、历史复用或默认随机三种 Seed 来源。存在 M 张默认随机图片时，Skill 执行者调用一次 `generation random-seeds --stdin` 并传入 `count: M`；没有默认随机图片时不调用随机 Seed 命令。一次 Skill 执行最多创建 20 张图片；用户要求的全部逻辑结果及图片数量之和必须满足 `1 <= N <= 20`。

用户明确要求创建图片，并且已经完成模板与实例检查、模型与 LoRA 兼容性核对、Prompt 结果消费、尺寸适配和全部参数合同校验时，Skill 执行者对每张图片分别调用一次 `generation submit --stdin`。每张图片必须使用一个独立 Generation Request 和一个独立前台 shell Tool Call。

## 参数与标准输入

历史查询的标准输入必须是只包含 `run_ids` 的 JSON 对象。`run_ids` 必须是包含 1 至 20 个字符串的数组。每个字符串可以是完整 Run ID，也可以是 `run_` 加 canonical UUID 起始片段的短 Run ID；UUID 片段必须至少包含前八个字符。CLI 按数组顺序独立查询每一项，并保留重复项。

```json
{"run_ids":["run_3c0ad3ed","run_d26923be"]}
```

随机 Seed 的标准输入必须是只包含 `count` 的 JSON 对象。`count` 必须是 1 至 20 的整数，并且等于本次需要默认随机 Seed 的图片数量。

```json
{"count":3}
```

每张已展开图片的 Seed 来源遵守以下规则：

1. 用户为某张图片显式提供整数 Seed 时，只有该图片使用该整数。用户提供整数 Seed 但没有限定图片或逻辑结果时，全部 N 张图片使用该整数。
2. 用户为某张图片只说“固定 Seed”但没有提供整数或历史 `run_id` 时，Skill 执行者必须要求用户为该图片提供具体整数或 `run_id`，不能先随机再固定。没有限定图片或逻辑结果的“固定 Seed”请求适用于全部 N 张图片。
3. 用户为某张图片显式要求复用历史 Run 的 Seed 时，只有可用查询结果的 `arguments.parameters` 中与 Seed 对应的已保存参数值是整数时，该图片才能复用该值。用户没有限定图片或逻辑结果时，全部 N 张图片复用该历史 Seed。历史 Run 没有保存整数 Seed 时，Skill 执行者报告该 Run 没有可直接复用的已保存 Seed，不能从文件名、Run ID 或 Actual Workflow 的其他 ComfyUI 节点猜测 Seed。
4. 某张图片没有显式整数 Seed 或历史复用要求时，该图片使用随机 Seed 命令按默认随机图片顺序返回的对应值。成功返回的每个 Seed 都是普通随机数，不提供加密性质。

Skill 执行者必须把每张图片的候选 Seed 与 `generation inspect-template-parameters --stdin` 返回的 Seed 参数合同进行预校验。检查结果必须包含唯一的 `kind: "seed"` 参数项；Skill 执行者必须使用该项的精确 `parameter_id`，并确认候选值是整数且满足该项的 `minimum`、`maximum` 和 `allowed_values` 中实际存在的全部约束。显式整数 Seed 或历史 Seed 不合格时停止提交并报告模板 ID、实例 ID、Seed 值与具体合同。默认随机 Seed 不合格时，Skill 执行者只为受影响图片重新取得随机 Seed 并重新校验；最终分配给 M 张默认随机图片的 M 个 Seed 必须互不相同。

提交命令的标准输入必须是一个 Generation Request：

```json
{
  "title": "角色立绘",
  "instance_id": "2",
  "template_id": "39",
  "model": {
    "id": "3",
    "file_name": "anima-aesthetic-v1.1.safetensors"
  },
  "parameters": {
    "positive_prompt": "1girl, portrait",
    "negative_prompt": "worst quality, low quality",
    "seed": 184273991,
    "width": 1024,
    "height": 1024,
    "batch_size": 1
  },
  "loras": [
    {
      "id": "91",
      "file_name": "example.safetensors",
      "weight": 0.8,
      "trigger_words": ["example trigger"]
    }
  ]
}
```

`title` 是非空运行标题。`model` 是所选模型的 `id` 与 `file_name`，没有模型覆盖时使用 `null`。`loras` 是本次实际使用的 LoRA 数组，没有 LoRA 时使用空数组；每项包含 `id`、`file_name`、有限数字 `weight` 和最终正向 Prompt 实际采用的 `trigger_words`。

每张图片的 `parameters` 必须使用模板检查结果中的精确 `parameter_id`：正向 Prompt 写入唯一 `kind: "positive_prompt"` 参数；原生负向模式把负向 Prompt 写入唯一 `kind: "negative_prompt"` 参数；正向规避模式不提交负向参数；Seed 写入唯一 `kind: "seed"` 参数；批量大小写入唯一 `kind: "batch_size"` 参数并固定为整数 `1`。模板检查返回的批量大小合同必须接受整数 `1`。

每张图片的 `parameters` 必须只采用模板检查后选定的一种尺寸表示：一对 `width` 与 `height` 参数、一对 `aspect_ratio` 与 `megapixels` 参数，或者一个 `resolution_preset` 参数。实际参数名和实际值必须遵守 `template-parameter-inspection-cli.md`。

## ID 与运行值的来源

`template_id` 来自当前消息唯一 Workflow 上下文的 `data.id`，并且模板 resolve 结果的 `id` 必须与该值一致。`instance_id` 来自当前 `catalog instance list` 结果中首个可用实例的 `id`。`model.id`、`model.file_name` 和各 LoRA 的 `id`、`file_name` 来自对应 Catalog resolve 结果。缺少任一必需 ID 时停止提交并说明缺少的选择或查询结果，不编造 ID。

Prompt、Seed、批量大小与尺寸的参数 ID 来自本次 `generation inspect-template-parameters --stdin` 的实际检查结果。Skill 执行者不得从 Catalog resolve、Source 返回的 `parameters_json`、静态模板名单、常见参数名或 ComfyUI 节点编号猜测模板参数能力。

历史 Run 查询只在当前 Workspace 内匹配 Run。短 Run ID 唯一匹配时，CLI 返回 canonical 完整 Run ID；没有匹配时返回不存在错误；多个匹配时返回歧义错误。

## 输出与完成语义

三个命令成功时退出码为 `0`、stderr 为空、stdout 写入一行完整 JSON。命令失败时退出码非零，stdout 不作为成功结果使用，stderr 使用 `错误码: 错误消息` 格式。

历史查询成功输出包含与输入等长、同序的 `runs` 数组。可用项包含 canonical `run_id`、`lookup_status: "available"`、创建时保存的 `arguments`，以及 `workflow_status: "available"` 与 `workflow`，或者 `workflow_status: "unavailable"` 与 `workflow_error`。历史记录没有 `loras` 时使用 `arguments.loras: []`；没有显式模型覆盖时省略 `arguments.model`。单项失败包含请求值、`lookup_status: "error"`、`error.code` 和 `error.message`；合法顶层请求中的单项失败不改变命令退出码，也不阻断其他项。

随机 Seed 成功输出只包含 `seeds`。数组长度必须等于 `count`，每项必须是互不相同的 0 至 2,147,483,647 整数。该范围是命令的输出合同；Skill 执行者仍必须按目标模板的实时 Seed 合同逐项校验。

提交成功输出只包含：

```json
{"run_id":"<durable-run-id>"}
```

`run_id` 表示项目已经接受异步 Generation Run；该命令不等待远端 ComfyUI 完成，也不表示图片已经生成。Skill 执行者必须分别列出每项提交返回的 `run_id` 或错误。

## 错误、修正与重试

历史查询的单项错误码包括：`GENERATION_RUN_ID_INVALID` 表示 Run ID 字符串或短前缀不合法；`GENERATION_RUN_ID_AMBIGUOUS` 表示短 ID 匹配多个 Run；`GENERATION_RUN_NOT_FOUND` 表示当前 Workspace 没有匹配项；`GENERATION_REQUEST_INVALID` 表示已保存生成请求损坏；`GENERATION_RUN_LOOKUP_FAILED` 表示 Host 读取失败。Skill 执行者报告错误项后继续处理同一 `runs[]` 的其他项。命令级错误表示标准输入、managed CLI 环境、执行身份或 Host 请求失败；Skill 执行者报告 stderr，并且只在修正输入或外部状态恢复后重试。

随机 Seed 命令输入或输出不符合合同时，Skill 执行者停止提交并报告具体错误。模板合同拒绝某个默认随机 Seed 时，Skill 执行者只为受影响图片重新取得随机 Seed；不能改变已经合格的其他图片 Seed。

提交返回非零退出码时，Skill 执行者使用以下错误说明：“CLI 未返回 `run_id`；项目可能已经持久化失败 Run，不能据此判断不存在 Run。”

网络、Host 或传输类瞬时错误发生后，如果 Skill 执行者没有修改任何输入，则重试必须提交逐字段相同的完整 Generation Request JSON，并复用该项已经分配的 Seed。Prompt、尺寸、模型、LoRA、参数名或参数值存在可修正错误时，Skill 执行者可以修正受影响内容并重新执行相应模板或 Catalog 检查；修正后的请求必须继续使用该项原 Seed。只有用户明确要求新的随机尝试时，Skill 执行者才为该项取得新随机 Seed 并重新建立请求。

## 副作用与重复调用

`generation run-inputs --stdin` 和 `generation random-seeds --stdin` 是只读命令。它们不创建 Generation Run、不修改 Workflow、不编译 Workflow、不提交 ComfyUI 任务，也不修改 Catalog 记录。

`generation submit --stdin` 可以持久化成功或失败的 Generation Run。非零退出码不能证明 Host 没有持久化失败 Run；再次提交也不会修改前一次调用可能保存的 Run。Skill 执行者必须把每次调用视为独立结果。

每张图片只在一个前台 shell Tool Call 中提交一次。某项确需重试时使用新的前台 shell Tool Call，并按上一节保持或更新请求。多张图片的成功与失败分别汇总；一个图片请求失败不改变其他已展开请求的 Seed。

## 完整调用示例

查询两个历史 Run：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_3c0ad3ed","run_d26923be"]}
JSON
```

为三张默认随机图片取得普通随机 Seed：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation random-seeds --stdin <<'JSON'
{"count":3}
JSON
```

模板检查确认精确参数 ID、Seed 合同、`batch_size: 1` 和实际尺寸表示后，提交一张图片：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation submit --stdin <<'JSON'
{
  "title":"角色立绘",
  "instance_id":"2",
  "template_id":"39",
  "model":{"id":"3","file_name":"anima-aesthetic-v1.1.safetensors"},
  "parameters":{
    "positive_prompt":"1girl, portrait",
    "negative_prompt":"worst quality, low quality",
    "seed":184273991,
    "width":1024,
    "height":1024,
    "batch_size":1
  },
  "loras":[]
}
JSON
```
