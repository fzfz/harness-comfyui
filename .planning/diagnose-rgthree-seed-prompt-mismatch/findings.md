# 诊断发现

## 用户可见现象

- 截图中的 Run ID 为 `run_93a8338c-4b22-4df2-9540-dc1d0c78ddfc`。
- 截图中的模板名称为 `AnimaStandardV8_成熟女性_lora_nsfw_face细化`。
- Agent 回复展示的 Prompt 以 `1 girl, solo, (@atdan:1.00), (@ningen_mame:0.91), ...` 开头。
- 右侧保存媒体的画面与用户期望的提示词语义不一致。
- 截图中的工具调用摘要显示 Agent 已向 `generate_with_comfyui` 提供 `parameters.positive_prompt`；异常发生点位于工具调用之后或提示词展示来源与工作流编译来源之间。

## 待核对证据

- Run Repository 中该 Run 的请求快照、来源快照、Actual Workflow、API Workflow 和状态记录。
- 历史 rgthree `seed = -1` 修复提交的代码和测试。
- 本次模板的节点类型、输入连接和 API Workflow 编译路径。

## 已确认的实现位置

- `src/host/generation/workflow-compiler.ts` 定义 `RGTHREE_SEED_TYPE = 'Seed (rgthree)'`、随机哨兵 `-1` 和 `materializeRgthreeRandomSeeds(...)`。
- `WorkflowCompiler.compile(...)` 在 API Workflow 编译前调用 `materializeRgthreeRandomSeeds(actualWorkflow, definitions, this.createRandomSeed)`。
- `tests/unit/generation-workflow-compiler.test.ts` 已包含 rgthree 前端随机 seed 哨兵物化测试。
- 当前仓库 `.local` 和常规文件中未找到截图 Run ID；需要根据生产配置定位实际 Run Repository 或生产 checkout。

## 历史修复的当前可见边界

- `git log -S` 将 rgthree 随机 seed 物化代码追溯到提交 `265a249`（提交摘要：`release: prepare v0.30.2 source`）。
- 当前物化函数只匹配节点类型精确等于 `Seed (rgthree)`、节点模式不为 2 或 4、并且 `widgetMappings(...)` 映射出的 `seed` widget 值精确等于 `-1` 的节点。
- 当前单元测试明确验证：普通 `KSampler` 的 `seed = -1` 不会被该函数修改；被 bypass 的 `Seed (rgthree)` 也不会进入 API Workflow。
- 因此，本次模板如果使用不同 rgthree seed 节点类型、不同 widget 映射，或让 `-1` 位于非 `Seed (rgthree)` 节点，历史修复不会覆盖。

## 运行数据定位

- 源码运行的默认 Run Repository 为 `.local/production/shared/data/runs.sqlite`，Run 文件目录为 `.local/production/shared/runs/`。
- 当前 checkout 的默认运行路径没有截图 Run ID；需要继续查找实际运行中的生产 checkout 或被配置覆盖的运行目录。

## 截图 Run 的运行事实

- 生产 checkout 为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env`，运行进程监听 `127.0.0.1:5173`。
- Run 状态为 `succeeded`，模板 ID 为 `39`，模板 revision 为 `1`，ComfyUI `prompt_id` 为 `2ad5eb18-ecad-4017-9190-2685249f8285`。
- `request_json.parameters.positive_prompt` 与 Agent 回复展示的 Prompt 完全一致。
- Actual Workflow 中没有 `Seed (rgthree)` 节点。模板使用节点 `31`，类型为 `SeedNode`；其 `seed` 已经是具体值 `658251139082077`，并通过连接供采样器使用。
- API Workflow 节点 `31` 仍为 `SeedNode`，提交值为 `658251139082077`；API Workflow 中没有发现 `seed = -1`。
- 因此，截图 Run 不符合历史 rgthree `Seed (rgthree)` 的 `-1` 哨兵问题，历史修复也没有必要参与该模板的 seed 编译。
- 请求 Prompt 已写入 Actual Workflow 节点 `5`（`Lora Loader (LoraManager)`）的 `text` widget，并写入 API Workflow 节点 `5.inputs.text`。
- 主采样器 API 节点 `6.inputs.positive` 连接 API 节点 `54`，需要继续追踪节点 `54` 的正向 conditioning 是否实际消费节点 `5` 的文本。
- 保存图片包含一名女性和一名男性；请求 Prompt 只有 `1 girl, solo` 与画师标签，没有描述男性、房间或性交场景。画面语义明显来自请求 Prompt 之外的模板输入或旧的 conditioning 路径。

## 正向 conditioning 路径

- 主采样器节点 `6` 的正向 conditioning 路径为：`54:CLIPTextEncode.text <- 48:RegexReplace <- 46:StringConcatenate.string_b <- 3:ImpactWildcardProcessor(POSITIVE).processed text`。
- 节点 `3.inputs.wildcard_text` 和 `3.inputs.populated_text` 仍保存模板原始场景 Prompt；该 Prompt 逐项描述了最终图片中的一名女性、一名男性、旧房间、破窗、木箱、凳子和性行为。
- 请求 Prompt 被写入节点 `5:Lora Loader (LoraManager).inputs.text`。节点 `5` 的字符串输出槽 `2` 是 `trigger_words`，经过节点 `37` 后只作为 LoRA 触发词与节点 `3` 的模板 Prompt 拼接；节点 `5.inputs.text` 不是主正向 Prompt 的可执行入口。
- 画面与节点 `3` 的模板 Prompt 一致，且与请求 Prompt 不一致。这条数据路径已解释用户截图中的精确现象。

## 参数目标解析的相关行为

- `applyRuntimeParameters(...)` 先使用有效 `replace_input` binding；没有有效 binding 时才调用结构解析。
- `positive_prompt` 的候选输入别名顺序为 `text`、`wildcard_text`、`prompt`、`positive`。只要任何活动节点具有未连接的 `text` widget，解析器会在考虑标题中的 `positive` 标记前排除 `wildcard_text` 候选。
- 本次模板同时包含节点 `5.text` 和标题为 `POSITIVE` 的节点 `3.wildcard_text`。如果模板 binding 指向节点 `5`，编译器会直接信任错误 binding；如果 binding 缺失，当前别名优先级仍可能选中节点 `5.text`。
- 历史“connected CLIP widget”测试实际上依赖连接中的 `CLIPTextEncode.text` 不进入候选，并通过结构解析选中唯一的 `ImpactWildcardProcessor.wildcard_text`；该夹具没有包含本次模板中的 LoraManager `text` 干扰候选。

## 模板 39 的实际运行配置

- 数据源 SQLite 中模板 39 的 `positive_prompt` binding 明确指向节点 `54:CLIPTextEncode.text`，其 `widget_index` 为 `0`。
- 节点 `54.text` 在 UI Workflow 中通过 link `110` 连接节点 `48`，因此 `parameterTargets(...)` 把该 connected widget 从可写目标中排除，`validBindingTargets(...)` 返回空数组。
- 编译器把“binding 指向 connected widget”当作 advisory binding 失效，然后进入无 binding 的结构解析。
- 结构解析按别名 `text` 优先于 `wildcard_text`，选择节点 `5:Lora Loader (LoraManager).text`；这与截图 Run 的 Actual Workflow 完全吻合。
- 正确的可执行上游 Prompt 入口是节点 `3:ImpactWildcardProcessor.wildcard_text`。模板 binding 描述了下游连接点节点 `54.text`，Host 需要沿 STRING link 追溯到节点 `3`，或在 binding/运行配置层直接指向节点 `3.wildcard_text`。
- 数据源 Source CLI 当前不可用，但同一生产数据源 checkout 的 `data/app.sqlite` 以只读方式返回了 revision `1`、SHA `8561c7e...` 和 config revision `1`；这些身份与 Run 的 source snapshot 完全一致。

## 确定性复现命令

- 命令：`pnpm exec vitest run .planning/diagnose-rgthree-seed-prompt-mismatch/connected-positive-binding.repro.test.ts`
- 运行时间为 179ms；测试通过内存中的最小 UI Workflow 调用真实 `ComfyWorkflowCompiler.compile(...)`，不依赖生产服务或人工操作。
- 当前结果稳定失败：期望节点 `3` 的 `wildcard_text` 为请求 Prompt，实际仍为 `template scene prompt`。
- 最小夹具保留本次异常的关键结构：一个 `POSITIVE` wildcard 节点、一个具有未连接 `text` widget 的 LoraManager 节点、一个 binding 指向 connected `CLIPTextEncode.text` 的下游节点，以及采样器正向 conditioning 连接。
- 该测试直接断言用户的精确症状，不以“编译不报错”作为成功条件；修复后节点 `3` 接收请求 Prompt 时会转绿。

## 历史测试与生产版本

- 生产 checkout 当前为 tag `v0.30.4`、提交 `1d40cd9`；提交 `265a249` 是其祖先，因此截图 Run 已包含 rgthree `seed = -1` 修复。
- 生产 checkout 的 `workflow-compiler.ts` 与对应测试文件没有未提交修改。
- 现有两个定向测试均通过：rgthree `-1` 物化测试，以及“binding 指向 connected CLIP widget 时改写上游 Prompt”测试。
- 后一项测试来自提交 `7569d77`（`feat: support generation model workflow bindings`）。它的夹具只有一个上游 `ImpactWildcardProcessor.wildcard_text`，没有本次模板的 `Lora Loader.text` 干扰候选，所以该测试在结构回退中得到正确节点，却没有锁住多候选模板。
- 候选别名顺序与 advisory binding 回退来自更早的提交 `5546251`；本次异常是该回退策略与模板 39 组合后的覆盖缺口。

## 已检验假设

1. connected binding 加 `text` 别名误选：最小复现稳定失败，且生产 Actual Workflow 与预测完全一致；已确认。
2. rgthree `seed = -1`：生产 API Workflow 没有 `-1`，模板没有 `Seed (rgthree)`；已排除。
3. 仅 UI 展示错误：请求、Actual Workflow 与 API Workflow 对比证明实际提交路径错误；已排除。
4. ComfyUI 缓存或媒体关联错误：提交节点 `3` 的旧 Prompt 已足以解释图片，媒体 `run_id` 与 `prompt_id` 关联一致；已排除为首因。

## 影响范围

- 数据源当前有 32 份 runtime config，其中 28 份声明 `positive_prompt` binding。
- 只有模板 39 和模板 40 的 `positive_prompt` binding 指向 connected `CLIPTextEncode.text`。
- 只有模板 39 同时具有活动的 `Lora Loader (LoraManager).text` 干扰候选，因此当前数据库中已确认的同构异常模板只有模板 39。
- 模板 39 的 `negative_prompt` binding 同样指向 connected `55:CLIPTextEncode.text`。如果调用者显式提供负面 Prompt，相同的 `text` 别名回退也会误选 LoraManager；修复范围应同时覆盖正面和负面 Prompt。
- 最小复现已收窄为对 `wildcard_text` 的单一正确性断言；第二次运行仍在 153ms 内稳定失败，避免要求不必要的 `populated_text` 同步更新。

## 建议修复边界

- 首选修复位置是 `workflow-compiler.ts` 的 connected binding 解析：编译器应从 binding 指定的 connected 输入沿同类型 STRING link 追溯到实际可写的上游 Prompt widget，并在无法唯一解析时返回明确错误。
- 编译器不应依赖“任意未连接 `text` widget”作为 connected Prompt binding 的回退，因为 `Lora Loader.text`、文件名前缀或其他文本控件不具有 Prompt 语义。
- 回归测试必须使用本次最小结构，至少覆盖 `positive_prompt`、`negative_prompt`、LoraManager `text` 干扰候选、唯一上游 Prompt 和多上游歧义错误分支。
- 只把数据源模板 39 的 binding 改为节点 `3.wildcard_text` 可以修复当前模板，但不能锁住 Host 对其他 connected binding 模板的通用行为；该方案适合作为数据修正，不足以替代编译器回归保护。
