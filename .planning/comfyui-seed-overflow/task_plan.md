# ComfyUI 运行参数合同全量校验修复计划

## “所有”的精确定义与系统边界

- 本计划中的“所有”是指：调用方提供的每一个运行参数都必须命中一个明确的目标输入合同分支；编译器必须校验该分支中由 Harness 严格类型政策和目标实例 `/object_info` 结构化公开的全部约束；任何无法证明合法的改变都必须在提交前明确拒绝。系统不得再存在“不是字符串枚举就原样透传”的无校验路径。
- 本计划不声称 Harness 本地校验等同于目标 ComfyUI 的全部 Python 业务校验。ComfyUI 自定义节点可以用 `VALIDATE_INPUTS` 或 V3 `validate_inputs` 替代通用校验，`/object_info` 不公开这些函数的机器合同，ComfyUI v0.34.2 也没有只校验不入队的接口。
- 目标实例没有公开机器合同的自定义 widget 改变必须返回 `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED`；运行参数明确违反可判定合同时必须返回 `GENERATION_PARAMETER_INVALID`；目标 ComfyUI 的自定义 Python 校验在提交后拒绝 Prompt 时仍然返回 `COMFYUI_PROMPT_REJECTED`。计划执行者和错误文案不得混淆这三种结果。
- 当前 `JsonValue` 使用 JavaScript `number`，不能表达全部十进制整数。编译器必须依据运行参数实际会发送的 JSON 数值令牌判定合法性；例如调用链无法表达精确的 `9223372036854775807`，而只会发送 `9223372036854776000`，因此该实际发送值必须按超上限拒绝。若用户要求 Harness 接受目标服务器可接受但当前 API 无法表达的精确整数，计划执行者必须另行设计保留调用请求原始数值令牌的接口变更。

## 必须要实现的目标

- 计划执行者必须把 `src/host/generation/workflow-compiler.ts` 中只保存 `liveEnumValues` 的 `ParameterTarget` 改为保存目标 ComfyUI 输入的结构化 `RuntimeParameterContract`。该合同必须来自目标实例本次 `/object_info` 响应中的具体节点类型、具体输入名称和输入描述，不得根据运行参数名称猜测类型或范围。
- `ComfyWorkflowCompiler` 必须在写入 Actual Workflow 以及调用 `OfficialApiWorkflowCompiler.compile()` 之前，对每一个调用方提供的运行参数执行合同校验。没有命中合同校验的非枚举值不得继续透传。
- 计划执行者必须使用严格 JSON 类型语义。`INT` 只接受有限的整数 `number`；`FLOAT` 只接受有限的 `number`；`STRING` 与 `AUTOCOMPLETE_TEXT_LORAS` 只接受 `string`；`BOOLEAN` 只接受 `boolean`。编译器不得使用 ComfyUI 服务器的 `int()`、`float()`、`str()` 或 `bool()` 强制转换语义替调用方纠正类型。
- `INT` 与 `FLOAT` 合同必须校验 `/object_info` 声明的 `min` 和 `max`。`INT` 合同还必须校验整数性；`step`、`round`、`display` 和 `control_after_generate` 只影响前端交互或序列化，不得被编造成数值合法性约束。
- 数值合同必须按实际 JSON 十进制令牌进行比较。计划执行者必须把 `/object_info` 的读取从 `Response.json()` 改为 `Response.text()` 加 Node.js `JSON.parse` reviver 的 `context.source`，在不替换普通解析值的旁路结构中保存合同内每一个数值的原始令牌，包括 `INT.min`、`INT.max` 和任意层级候选值中的数值。运行参数数值必须使用它实际会被 JSON 序列化并发送的十进制令牌参与比较。比较器必须支持符号、整数、小数和十进制指数，并通过规范化的十进制系数与小数位数比较，不得依赖舍入后的 `number` 相等性。
- `INT` 比较逻辑必须覆盖 JavaScript 非安全整数，并且不得把 `Number.MAX_SAFE_INTEGER` 当作 ComfyUI Seed 上限。候选集合中的非安全整数也必须按原始候选令牌与实际发送令牌比较，防止两个不同十进制整数被 JavaScript 舍入成同一个 `number` 后误判为相同。
- 旧式首元素数组选择合同与 `COMBO.options` 合同必须支持 `string`、`number`、`boolean`、`null`、数组和对象候选的 JSON 深相等成员校验。只有候选全部为字符串时，编译器才可以保留现有“唯一的大小写无关匹配写回实例精确值”行为。
- `COMBO.multiselect: true` 合同必须只接受数组，并逐项执行候选成员深相等校验；`COMBO.multiselect` 不是 `true` 时必须拒绝数组，除非整个数组本身是 `options` 中的一个明确候选值。
- 计划执行者必须修改 `src/host/generation/official-api-workflow.ts` 的 overlay 判定顺序。Official API Workflow 输入已经使用 `{"__value__": ...}` 声明列表 widget 时，overlay 必须先确认该外壳并写入列表值，然后才能判断未包装输入是不是连接。合法列表值即使恰好形如 `["node-id", 0]` 或 `[12, 0]`，也不得被误判为连接；真正的连接输入仍然必须同时在 runtime projection 与 Official API Workflow 中保持连接二元组。
- `COMFY_DYNAMICCOMBO_V3` 合同必须校验父输入值是唯一、非空字符串 `options[].key` 的精确成员，并且必须从目标选择项的 `inputs.required` 与 `inputs.optional` 递归解析点分子输入的具体合同。编译器必须按动态父输入把相关运行参数分组，先构造父输入与全部子输入的候选最终状态，再根据候选父 key 一次性校验整个分组，最后才允许写入任何 widget。
- 动态父输入切换时，目标分支的每一个未连接 `required` 子输入都必须在当前 Actual Workflow 中具有可写的序列化 widget；`optional` 子输入可以缺省，但当前已经序列化或本次运行参数提供的 optional 子输入必须属于目标分支并通过该输入合同。当前 Workflow 保留不属于目标分支的旧子输入、缺少新分支 required 子输入、同名子输入的当前值或候选值不满足新合同，或者嵌套动态分支无法完整解析时必须拒绝切换；编译器不得依赖运行参数遍历顺序，也不得把旧分支子输入当成新分支的合法输入。
- `STRING.choices`、`STRING.options`、`INT.options` 和其他只影响自定义 UI 的配置不得被通用合同解释成服务器合法性限制。ComfyUI v0.34.2 通用校验器没有读取这些键；只有旧式首元素数组选择合同、`COMBO.options`、`COMBO.multiselect`、`min` 和 `max` 可以作为已经证实的通用值限制。自定义节点通过 Python 校验函数执行的替代或附加业务校验规则仍由目标 ComfyUI 的权威校验负责。
- 对于 `/object_info` 中没有机器可判定值合同的自定义 widget 类型，编译器必须拒绝改变其序列化值，并返回清楚说明具体参数 ID、目标节点、输入类型和“目标实例没有提供可完整校验的值合同”的 `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED`。编译器不得根据默认对象、当前数组样例或 UI 显示文本猜测递归对象结构，也不得继续无校验透传。
- `GENERATION_PARAMETER_INVALID` 错误必须包含运行参数 ID、目标 ComfyUI 节点 ID、节点类型、输入名称、收到值、违反的合同条目以及调用方动作。错误内容不得把非法值静默截断、钳制、替换、随机化或转换成其他 JSON 类型。
- 计划执行者必须把 `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED` 加入 `config/error-catalog.json` 的唯一错误文案来源，并在 `tests/unit/results-drawer.test.tsx` 中从结构上验证 `GENERATION_PARAMETER_INVALID`、`GENERATION_PARAMETER_CONTRACT_UNSUPPORTED` 和 `COMFYUI_PROMPT_REJECTED` 分别映射到独立目录项。独立语义 Reviewer 必须人工验证三类错误的原因与下一步清楚区分，并验证不支持错误明确要求调用方保留 Workflow 当前值或补充机器可判定合同；程序测试不得逐字验收语义文案。
- 计划执行者必须同步更新 `docs/system/architecture.md` 与 `docs/system/testing.md`，把运行参数合同全量校验的可证明边界、精确整数边界和无法表达的自定义 widget 拒绝策略写成明确的系统合同。文档不得声称本地校验等同于全部自定义 Python 校验。
- 计划执行者必须在 `tests/unit/generation-workflow-compiler.test.ts` 中使用参数化测试覆盖下面的完整矩阵，并保留生产失败值的最小反馈环 `.local/diagnostics/reproduce-seed-overflow.mjs` 作为实施期间的定向验证工具。

### 运行参数合法值矩阵

| 目标 `/object_info` 输入描述 | 接受的运行参数值 | 必须拒绝的运行参数值 | 额外约束 |
| --- | --- | --- | --- |
| `INT` | 有限、整数的 JSON `number` | 字符串、布尔值、`null`、数组、对象、非整数、`NaN`、正负无穷 | 精确校验 `min`、`max`；不得限定为安全整数 |
| `FLOAT` | 有限的 JSON `number`，包括整数数值 | 字符串、布尔值、`null`、数组、对象、`NaN`、正负无穷 | 校验 `min`、`max` |
| `STRING` | JSON `string` | 数值、布尔值、`null`、数组、对象 | `choices`/`options` 不作为通用服务器约束 |
| `AUTOCOMPLETE_TEXT_LORAS` | JSON `string` | 数值、布尔值、`null`、数组、对象 | 不把提示文本解释为其他结构 |
| `BOOLEAN` | JSON `boolean` | 字符串、数值、`null`、数组、对象 | 不执行 truthy/falsy 转换 |
| 旧式首元素数组选择合同 | 与任一候选 JSON 深相等的值 | 不在候选集合中的任意值 | 字符串候选可执行唯一大小写归一化；其他候选不得转换 |
| `COMBO` 单选 | 与 `options` 中任一候选 JSON 深相等的值 | 不在候选集合中的任意值 | 空候选集合不允许无校验透传 |
| `COMBO` 多选 | 数组，并且数组的每个元素都与一个候选 JSON 深相等 | 非数组或包含非法成员的数组 | 空数组按照 ComfyUI 多选合同通过 |
| `COMFY_DYNAMICCOMBO_V3` 父输入 | 当前可序列化分支的 `options[].key` | 不存在的 key，或者当前 Workflow 无法完整序列化的另一分支 | 子输入合同由选中分支递归决定 |
| `COMFY_DYNAMICCOMBO_V3` 子输入 | 选中分支中对应点分输入合同允许的值 | 错误类型、错误候选、越界值、非当前分支子输入 | 连接式子输入不是运行参数目标 |
| 没有机器可判定合同的自定义 widget | 与当前序列化值 JSON 深相等的无变化赋值 | 任何改变后的值 | 改变返回 `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED`；不得猜测结构或透传 |

## 验收清单

- [x] 生产失败值 `12130929238470859000` 在节点 31 的 `SeedNode.seed` 上返回 `GENERATION_PARAMETER_INVALID`，错误指出允许范围上限，并且 `OfficialApiWorkflowCompiler.compile()` 与 Comfy transport 都未收到该请求。
- [x] `9223372036854775807` 的原始边界令牌得到保留；会序列化为 `9223372036854776000` 的 JavaScript `number` 不得被误判为合法上限值；测试必须证明比较使用实际发送的十进制令牌而不是舍入后的普通 `number` 上限。
- [x] 数值候选 `9223372036854775807` 不得与实际会发送成 `9223372036854776000` 的运行参数误判为同一个成员；嵌套在数组候选和对象候选中的非安全整数执行同样的精确成员测试。
- [x] 辅助回归样本中成功的非安全整数 Seed 示例 `8777816296766206976` 继续通过节点 31 的当前合同，证明修复没有引入 `Number.MAX_SAFE_INTEGER` 上限。
- [x] `INT` 的合法普通整数、合法非安全整数、精确最小边界通过；错误 JSON 类型、非整数、非有限值、低于 `min` 和高于 `max` 的整数分别被拒绝。
- [x] `FLOAT` 的整数数值、普通小数、最小边界和最大边界通过；错误 JSON 类型、非有限值、低于 `min` 与高于 `max` 分别被拒绝。
- [x] `STRING`、`AUTOCOMPLETE_TEXT_LORAS` 与 `BOOLEAN` 对每一种其他 JSON 顶层类型执行拒绝测试；测试证明 `STRING.choices`、`STRING.options` 与 `INT.options` 不会被擅自升级成通用服务器合法性限制。
- [x] 旧式数组选择合同覆盖字符串、数值、布尔值、`null`、数组、对象和混合候选；测试证明对象与数组使用 JSON 深相等，不使用字符串化碰撞，不对非字符串候选执行类型转换。
- [x] `COMBO` 单选覆盖合法与非法成员；`COMBO` 多选覆盖空数组、多个合法成员、一个非法成员、非数组和列表值的 `__value__` overlay。
- [x] Official overlay 覆盖形如 `["literal", 0]` 与 `[12, 0]` 的合法列表 widget 值，证明 `__value__` 上下文优先于连接二元组形态判断；另有真正连接结构匹配与结构不匹配测试，证明连接保护没有被削弱。
- [x] `COMFY_DYNAMICCOMBO_V3` 覆盖合法父 key、非法/空/重复父 key、当前分支的合法与非法 `INT`/`FLOAT`/`COMBO` 子输入、嵌套动态分支和连接式子输入排除。
- [x] 动态父分支切换覆盖 required 子输入完整且全部候选最终值合法时通过，以及缺少新分支 required 子输入、存在不属于目标分支的旧子输入、同名子输入类型改变、当前遗留值在新分支越界时拒绝；目标分支缺省 optional 子输入必须通过，已经序列化或由调用方提供的 optional 子输入必须单独通过合同；父参数与子参数输入顺序互换必须产生相同结果。
- [x] 一个具有对象序列化值的未知自定义 widget 接收数组、不同对象和标量时全部在提交前被拒绝；相同对象的无变化赋值通过。一个具有数组序列化值的未知自定义 widget 接收对象时同样被拒绝。
- [x] 未知自定义 widget 改变返回 `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED`；已知合同违反返回 `GENERATION_PARAMETER_INVALID`；模拟目标 ComfyUI 自定义校验拒绝继续返回 `COMFYUI_PROMPT_REJECTED`。结果抽屉结构测试验证三个错误码映射到独立目录项；独立语义 Reviewer 人工确认三类错误具有不同且可执行的下一步。
- [x] malformed `/object_info` 合同覆盖非法描述数组、非法配置对象、非法 `min`/`max`、`min > max` 和非法 `COMBO.options`，并返回稳定、可理解的编译错误。
- [x] 字符串候选 `['Foo', 'foo']` 的两个精确值分别通过，非精确输入 `'FOO'` 因大小写归一化不唯一而返回 `GENERATION_PARAMETER_INVALID`；完全重复候选的精确值通过。大小写碰撞不得被误报为 malformed `/object_info`。
- [x] `runtimeParameters` 中两个参数指向同一个目标时，编译器先分别规范化并校验，再执行现有同值合并或异值冲突判定；非法别名值不得借助另一个合法参数绕过合同。
- [x] JSON 深相等测试证明数组按长度和顺序比较，对象按相同键集合与对应值递归比较且忽略属性插入顺序，数值叶子使用实际发送令牌的十进制语义。候选成员、未知 widget 无变化赋值和别名同值合并分别覆盖对象键顺序变化。
- [x] 十进制规范化覆盖 `1`/`1.0`/`1e0` 等值、`-0`/`0` 等值、正负数、正负指数、尾随零、跨零范围、`INT` 小数边界和嵌套候选；极大正负指数测试证明比较器通过符号、去零系数、scale 与数量级比较，不通过物化与指数等长的零字符串工作。
- [x] 现有 seed 控件尾值、rgthree 随机 Seed、LoRA 文本、模型路径解析、连接输入排除、节点后缀解析、枚举大小写归一化和 Official API Workflow overlay 测试继续通过。
- [x] `.local/diagnostics/reproduce-seed-overflow.mjs` 连续两次返回退出码 0，输出 `GENERATION_PARAMETER_INVALID`，并证明 transport 提交次数为 0。
- [x] `/object_info` 精确数值元数据在同一实例首次编译、缓存命中、并发请求合并和 TTL 刷新后都通过非安全整数边界及嵌套数值候选测试；测试同时核对 `/object_info` fetch 次数。
- [ ] 一个独立运行时能力测试验证 `JSON.parse` primitive reviver 获得 `context.source`、object/array reviver 不依赖该字段、reviver 返回后普通 definitions 值未被包装。该测试必须在项目最低支持版本 Node.js `22.19.0` 的发布验证环境运行；若实施环境没有该版本，计划执行者必须把缺少的最低版本实测列为发布阻塞，不得用 Node.js `25.8.2` 结果代替。
- [x] `pnpm test:unit -- tests/unit/generation-workflow-compiler.test.ts tests/unit/generation-official-api-workflow.test.ts tests/unit/generation-tool.test.ts tests/unit/results-drawer.test.tsx`、`pnpm quality` 与 `git diff --check` 全部通过。
- [x] 独立 Reviewer 根据最终 diff、错误文案、测试矩阵和门禁输出确认修复覆盖本计划中的全部合同分支。
- [x] 完整 Desktop 在独立 worktree 中通过 `pnpm dev:start`、第二终端 `pnpm dev:status`、隔离测试 workspace 验收、`pnpm dev:stop` 和最终 `pnpm dev:status` 验证。该验收不得读取或打开 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness`。

## 非本次目标

- 本次修复不把 `generate_with_comfyui.parameters` 改成固定属性表。该对象必须继续接受不同 Workflow 定义的参数名称；具体值合同只能在 `ComfyWorkflowCompiler` 解析目标实例、目标节点和目标输入后建立。
- 本次修复不复制、执行或猜测自定义 ComfyUI 节点的 Python `VALIDATE_INPUTS` 或 V3 `validate_inputs` 业务逻辑。目标实例 `/object_info` 没有公开这类代码的完整机器合同，ComfyUI v0.34.2 也没有独立的“只校验、不入队”接口；因此无法本地证明的改变必须拒绝，而不是伪装成已完整校验。
- 本次修复不新增 ComfyUI “只校验、不入队”接口，也不改变 `JsonValue` 以保留调用请求原始数值令牌。实现与目标 ComfyUI 全部 Python 合法值集合完全等价的本地校验需要这两项新的跨系统合同，必须由用户另行授权。
- 本次修复不修改 ComfyUI 服务器、自定义节点、DSH Desktop、Run Repository schema、Catalog Source 或历史 Run 数据。
- 本次修复不钳制超范围数值，不自动生成替代 Seed，不自动重试失败 Run，不迁移或删除 `run_987c5893-0520-4bb9-8670-c2356d1aea02`。
- 本次修复不把 `step`、`round`、前端显示配置、提示文本语义或资源是否存在解释成通用值合同。
- 本次修复不优化 `official-api-workflow.ts` 中 `executionStructure()` 对二元数组字面值造成的额外 cache miss。`__value__` overlay 优先级修复保证列表值提交正确；现有证据没有显示 cache identity 分类会生成错误 Workflow。
- 本次修复不新增第三方依赖。Node.js 项目合同已经允许使用 `JSON.parse` reviver 的 `context.source`；计划执行者必须使用标准运行时能力保存精确整数边界。
- 本次修复不推送、不发布、不部署真实生产目录，也不重新运行失败请求。`$implement` 只授权计划执行者在独立 worktree 中修改、验证并提交当前分支。

## 已获得的授权

- 用户已经授权计划编写者创建独立 git worktree、读取生产运行记录、读取目标 ComfyUI 实例的只读 `/system_stats` 与 `/object_info`、定位根因并编写修复方案。
- 用户已经明确要求修复方案覆盖所有运行参数合法值合同，而不是只覆盖枚举或本次 Seed 数值上限。
- 用户已经调用 `$implement`，授权计划执行者在独立 worktree 中修改仓库源码、测试和系统文档，运行隔离验证，并提交当前分支。
- 用户明确禁止计划执行者在真实生产目录 `/Volumes/4Tdisk/work/AI2/run-comfyui-workflows-harness` 中执行任何操作。本次授权不包含推送、发布、部署或重新运行真实生产失败请求。

## 实施阶段

### 阶段一：先写完整失败矩阵

- 计划执行者必须先在 `tests/unit/generation-workflow-compiler.test.ts` 添加本计划验收清单中的类型、范围、候选、容器、动态合同、未知合同和精确整数边界测试，并确认当前源码允许这些非法非枚举值透传。
- 计划执行者必须保留生产失败 Seed 的定向反馈环，并在修改源码前记录当前 `COMFYUI_PROMPT_REJECTED` 红灯。

### 阶段二：建立单一结构化合同

- 计划执行者必须使用判别联合定义 `RuntimeParameterContract`，并让 `ParameterTarget` 只引用该合同；类型、候选、数值范围、多选和动态子合同不得分散到互相独立的条件来源。
- `/object_info` 解析结果必须是同时包含普通 `definitions` 与原始数值令牌索引的单一结构化缓存项。`objectInfoCache` 与 `objectInfoRequests` 必须共享该完整缓存项，并让 definitions 与旁路元数据同时命中、同时过期、同时刷新；缓存命中或并发请求不得丢失数值令牌。
- 原始数值令牌索引必须以父对象与属性名或父数组与索引为键保存全部原始令牌，同时验证整个目标输入描述的结构。旁路元数据不得替换节点默认值、模型路径候选或其他现有消费方读取的普通 JSON 值；合同构建完成前不得 clone definitions 导致父对象身份与令牌索引失配。
- 动态合同解析器必须依据每个动态分组的候选最终父选择项构造点分子输入合同，并把当前 Workflow 的连接状态和可序列化 widget 映射作为合同的一部分。解析器必须递归处理嵌套动态选择，并在写入前原子校验整个分组。

### 阶段三：统一校验后再写 Workflow

- 计划执行者必须用一个统一入口替换 `liveRuntimeParameterValue()` 的枚举专用分支。该入口必须先验证并规范化值，再执行目标冲突判断，最后才允许 `setParameterWidget()` 写入 Actual Workflow。
- 计划执行者必须让已知合同非法输入返回 `GENERATION_PARAMETER_INVALID`，让未知合同改变返回 `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED`，并证明两类本地拒绝都没有调用 Official API Workflow compiler 与 transport。
- 计划执行者必须让 Official overlay 依据 Official API Workflow 的 `__value__` 外壳识别列表字面值，不能只依据 runtime 数组的元素形态识别连接。

### 阶段四：文档、局部测试与完整门禁

- 计划执行者必须更新系统架构与测试文档，并由独立语义 Reviewer 检查错误文案和合同描述是否具有明确主体、目标输入和调用方动作。
- 计划执行者必须运行定向单元测试、完整 `pnpm quality` 和 `git diff --check`。最终文件修改完成后必须重新运行完整门禁，并在门禁后不得继续修改文件。
- 计划执行者必须按照 `docs/agents/worktree-development.md` 启动并停止独立 worktree Desktop，完成真实合法 Seed 与生产失败 Seed 的端到端验收。

## 技术决策

| 决策 | 理由 |
| --- | --- |
| 在目标解析完成后校验 | 只有 Workflow compiler 同时知道运行参数 ID、实际节点、实际输入、连接状态、UI 序列化位置和实时 `/object_info` 合同。 |
| 使用统一判别联合合同 | 当前枚举专用字段造成其他类型默认透传；统一合同让每一个可写目标必须明确进入一个校验分支。 |
| 对非法值继续使用 `GENERATION_PARAMETER_INVALID` | 调用方可以修正具体参数并重新调用；错误信息必须区分值非法与目标不存在或目标歧义。 |
| 对无法机器判定的自定义 widget 使用 `GENERATION_PARAMETER_CONTRACT_UNSUPPORTED` | `/object_info` 没有公开任意 Python 自定义校验逻辑；该错误不能把“无法证明”伪报成“已经证明值非法”。 |
| 使用 JSON 原始令牌比较合同数值 | 普通 JavaScript `number` 会把不同十进制整数舍入成同一个值；该问题同时影响 64 位上下限和任意层级的数值候选成员。 |
| 不采用安全整数上限 | 辅助回归样本中有 48 个非安全整数 Seed 参数已经成功；安全整数限制会制造实际回归。 |
| 不执行自动修正 | 截断、钳制、强制类型转换或替换 Seed 会改变调用方明确提供的生成参数和可重复性。 |

## 当前状态

- 根因诊断：完成。
- 运行参数合同全量校验方案：独立 Reviewer 复核完成，没有阻塞项。
- 源码实施：核心合同、精确数值解析、动态合同、错误目录、系统文档、完整单元测试、独立审查、隔离 Desktop 验收、完整质量门禁和修复提交已经完成。项目最低支持版本 Node.js `22.19.0` 的 `JSON.parse` reviver `context.source` 能力测试仍是发布前门禁。
