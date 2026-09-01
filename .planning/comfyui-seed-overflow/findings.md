# ComfyUI 运行参数完整合法值诊断记录

## 用户要求

- 计划编写者必须使用独立 worktree。
- 计划编写者必须从生产错误记录定位根因并编写修复方案。
- 计划执行者必须等待用户批准后才能实施修复。
- 用户明确要求“所有合法值校验”覆盖完整目标输入合同。数组不能替代对象，浮点数不能替代整数，超过最大值的数值不能通过；这些只是完整要求的示例，不是最终范围。
- 用户明确指定真实生产目录是 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`。计划执行者不得进入、读取、启动、修改或使用该目录进行测试。

## 用户提供的真实生产故障证据

- 失败 Run：`run_987c5893-0520-4bb9-8670-c2356d1aea02`；错误码：`COMFYUI_PROMPT_REJECTED`。
- 用户提供的 ComfyUI 响应声明节点 31 是 `SeedNode`，收到的 `seed` 是 `12130929238470859000`，允许的最大值是 `9223372036854775807`，并返回 `value_bigger_than_max`。

## 先前误认目录的辅助回归证据

- 先前只读诊断访问了 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env`。用户随后明确该目录不是真实生产目录，因此其中的版本、Run Repository、请求产物和历史统计只能作为相同代码路径的辅助回归样本，不能作为真实生产目录的状态证据。
- 该辅助样本中的请求参数、Actual Workflow 和 API Workflow 都保存了 `12130929238470859000`，并能稳定复现 ComfyUI 的相同上限拒绝。
- 本次实施不再访问 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env`，也不访问真实生产目录。

## 代码证据

- `src/host/generation/generation-tool.ts` 把 `parameters` 定义为 `additionalProperties: true`，并把 `args.parameters` 原样传给 `GenerationRequest`。
- `src/host/generation/workflow-compiler.ts` 的 `parameterTargets()` 只保存实时枚举集合 `liveEnumValues`，没有保存 `INT`/`FLOAT` 类型与 `min`/`max`。
- `liveRuntimeParameterValue()` 在目标不是枚举时直接返回调用方数值；`setParameterWidget()` 随后把该值写入 Actual Workflow。
- `ComfyWorkflowCompiler` 已经读取并缓存目标实例的 `/object_info`，因此修复无需新增网络请求或配置源。
- Git blame 显示数值透传从运行参数编译功能创建时就存在；提交 `215afaf7` 只增加实时枚举校验，没有增加数值校验。`v0.38.3` 的发布提交没有修改 Workflow compiler。

## 反馈环

- 脚本：`.local/diagnostics/reproduce-seed-overflow.mjs`。
- 命令：`node --experimental-strip-types .local/diagnostics/reproduce-seed-overflow.mjs`。
- 该脚本使用真实 `ComfyWorkflowCompiler`、真实 `ComfyHttpTransport`、最小 `SeedNode` Workflow、生产失败值和确定性 ComfyUI 拒绝响应。
- 当前源码连续两次返回退出码 1，并输出 `COMFYUI_PROMPT_REJECTED` 与 `value_bigger_than_max`。
- 修复后的预期结果是编译器返回 `GENERATION_PARAMETER_INVALID`，脚本返回退出码 0，并且 transport 不收到提交。

## 辅助回归样本的历史数值分布

- 辅助 checkout 的数据库包含 836 个 `seed` 或 `seed_<node-id>` 参数，涉及 520 个 Run。
- 54 个 Seed 参数大于 `Number.MAX_SAFE_INTEGER`；其中 48 个属于成功 Run，6 个属于失败 Run。
- 3 个失败 Run 的 6 个 Seed 参数超过节点 31 的最大值；其余 48 个非安全整数 Seed 已被 ComfyUI 成功接受。
- 修复不能把 `Number.MAX_SAFE_INTEGER` 当作 ComfyUI Seed 上限，否则会拒绝辅助回归样本中已经成功的合法数值范围。

## 根因结论

`generate_with_comfyui` 必须允许任意模板参数名称，因此入口合同没有目标节点的具体值合同。`ComfyWorkflowCompiler` 在解析具体参数目标后取得了实时 `/object_info` 和 UI Workflow 序列化值，但当前 `liveRuntimeParameterValue()` 只校验枚举集合，直接透传所有非枚举 JSON 值。超范围 Seed 是完整合法值校验缺失的一种表现；同一缺口还可能允许错误 JSON 容器类型、错误标量类型、非有限数值、非整数 `INT` 和其他违反目标输入声明的值进入 Actual/API Workflow。根因是 Workflow compiler 缺少统一的目标输入值合同校验，不是单独缺少 Seed 上限校验。

## “全部服务器合法值”的可证明边界

- ComfyUI 自定义 Python 校验可以替代而不只是收紧通用 `min`、`max` 和候选检查。Harness 无法从 `/object_info` 判断某个输入是否进入自定义校验，也无法取得该函数的完整业务合同。
- 当前 `JsonValue:number` 无法表达精确的 `9223372036854775807`；JavaScript 会在 Workflow compiler 看到值之前把它变成将序列化为 `9223372036854776000` 的 `number`。
- 因此，在不增加目标 ComfyUI 只校验接口和不改变运行参数原始令牌合同的前提下，Harness 不能证明自己的本地接受集合与目标服务器的全部合法值集合完全相等。
- 可实施且不虚假的目标是：每一个运行参数都进入 Harness 严格类型与 `/object_info` 可判定合同的完整校验分支；无法证明的改变在提交前返回独立的不支持错误；目标服务器继续权威执行自定义 Python 校验。

## 目标实例输入合同审计

- 目标实例 `/system_stats` 报告 ComfyUI `0.34.2`、Frontend `1.49.6`。此前文档中的 `0.33.3` 不是本次故障发生后读取到的当前实例版本。
- 当前 `/object_info` 包含 2,746 个节点类型和 18,779 个 required/optional 输入描述。
- 当前运行参数映射能够识别或显式映射的主要 widget 输入包括：2,461 个旧式数组选择输入、3,456 个 `INT`、2,953 个 `FLOAT`、2,111 个 `STRING`、1,688 个 `BOOLEAN`、558 个 `COMBO`、151 个 `COMFY_DYNAMICCOMBO_V3` 和 4 个 `AUTOCOMPLETE_TEXT_LORAS`。
- 旧式数组选择输入不只包含字符串候选：实例中还存在数值、布尔值、空集合和混合数值/字符串候选。当前 `liveEnumValues()` 只接受全字符串集合，因此这些选择合同当前仍然无校验透传。
- `COMBO.options` 可以包含字符串、数值或混合 JSON 候选；`multiselect` 是结构化配置。列表 widget 在 API Workflow 中必须使用 `{"__value__": [...]}` 区分列表值与节点连接二元组。
- `COMFY_DYNAMICCOMBO_V3.options[]` 使用 `key` 声明父选择值，并在每个选择项的 `inputs.required`/`inputs.optional` 中声明当前分支的子输入合同。UI Workflow 使用 `父输入.子输入` 点分名称序列化这些子 widget。
- 当前实例存在以对象、数组或 `null` 作为 `default` 的自定义 widget 输入，例如 `BOUNDING_BOX`、`BOUNDING_BOXES`、`COLORS`、`COMPOSITOR` 和 `CURVE`。这些描述没有统一 JSON Schema，也没有公开自定义 Python 校验函数；默认值只能证明一个序列化样例，不能证明全部合法对象结构。
- 当前实例的 `STRING.choices`、`STRING.options` 与 `INT.options` 确实存在，但 ComfyUI v0.34.2 通用校验器没有读取这些键。修复不得在没有产品合同的情况下把自定义 UI 配置擅自升级成服务器合法性限制。

## ComfyUI v0.34.2 校验语义

- ComfyUI `execution.py` 对普通字面值调用 `int()`、`float()`、`str()` 和 `bool()` 后再检查 `min`、`max`、旧式选择集合、`COMBO.options` 与 `multiselect`。用户要求 Harness 使用严格类型合同，因此修复不能复制这些强制转换语义。
- ComfyUI 将未包装的 JSON 数组解释为 `[node_id, slot_index]` 连接；列表 widget 值必须由对象的 `__value__` 属性承载。现有 Official API Workflow overlay 已经保留该外壳。
- 现有 overlay 在检查 Official API Workflow 的 `__value__` 外壳之前先按数组形态判断 runtime 值是否为连接。因此，合法列表 widget 值如果恰好形如 `["literal", 0]` 或 `[12, 0]`，当前代码会错误返回连接结构不匹配。
- 自定义节点可以用 `VALIDATE_INPUTS` 或 V3 `validate_inputs` 替换通用输入校验。`/object_info` 返回输入描述，但不返回自定义校验函数的完整机器合同。
- ComfyUI `server.py` 只有 `POST /prompt` 在调用 `validate_prompt()` 成功后立即入队；当前版本没有独立的“只校验、不入队”路由。Harness 不能在不修改目标 ComfyUI 的前提下远程执行完整自定义校验而不触发任务。

## 精确整数边界

- 当前 Node.js 把 `/object_info` 中的十进制 `9223372036854775807` 解析为普通 `number` 后显示为 `9223372036854776000`，其实际二进制整数值是 `2^63`。
- 只用舍入后的 `number` 比较 `value <= max` 会在上限附近产生漏检。同一问题也会让两个不同的十进制候选整数在 JavaScript 中变成相同 `number`，从而破坏候选成员校验。
- Node.js 项目合同是 `^22.19.0 || >=24.0.0`，可以使用 `JSON.parse` reviver 的 `context.source` 为 `/object_info` 合同中的全部数值保存旁路原始令牌，不需要新增依赖，也不需要用包装对象替换其他代码读取的普通 JSON 值。
- 运行参数值已经是 JavaScript `number`，但编译器可以使用该值实际 JSON 序列化出的十进制令牌执行精确比较。这既能拒绝实际会被发送成超上限整数的值，也能保留生产中已经成功的非安全整数。

## 资源

- `src/host/generation/generation-tool.ts`
- `src/host/generation/workflow-compiler.ts`
- `tests/unit/generation-workflow-compiler.test.ts`
- `docs/agents/worktree-development.md`
- `docs/system/architecture.md`
- `docs/system/testing.md`
- `docs/adr/0002-generation-runs-are-durable-and-asynchronous.md`
- `docs/adr/0010-run-repository-is-the-status-authority.md`
