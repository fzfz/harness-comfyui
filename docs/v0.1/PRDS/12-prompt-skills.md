# PRD 12：迁移 Prompt 与 LoRA 调整 Skills

## 关联 Ticket

Ticket 12 — 在普通 Harness 会话中使用迁移的 Prompt 与 LoRA 调整 Skills 准备生成内容。

## 产品目的

浏览器用户必须能够在中列通过同一个 Harness Skill 候选入口调用三项来源系统能力：`anima-prompt-builder`、`wai-sdxl-prompt-builder` 和 `lora-adjustment`。Prompt Skill 生成最终提示词；LoRA 调整 Skill 基于当前提示词和本次消息附带的有序 LoRA 快照返回调整后的提示词、权重和实际触发词。这三项迁移 Skill 都只在中列返回内容，不创建 Generation Run。

`comfyui-generate` 是 Ticket 04 交付的另一项普通 Harness Skill。用户只有在后续消息中显式调用 `comfyui-generate`，并且 Agent 实际调用 `generate_with_comfyui` 后，右侧第三列才按 Tool Result 的 `run_id` 显示生成结果。Prompt Skill、LoRA 调整 Skill和ComfyUI生成Skill之间不存在上下级关系。

## Harness 核心零改动与公共接口

本 Ticket 使用 `0.1.1-rc.2` 已有 `@deepseek-ai/dsh-skill-filesystem` provider 和 Host `dsh-tool-skill` 校验。项目源码保存以下三个目录：

- `skills/anima-prompt-builder/`
- `skills/wai-sdxl-prompt-builder/`
- `skills/lora-adjustment/`

`harness-comfyui` Agent Preset必须通过`includeDefaultRoots: false`与项目Skill目录配置只读取上述源码目录。Harness随附`ui-input-trigger`与`ui-skill`把这些Skill加入当前Session的原生`/`菜单；用户选择后，Harness把普通`/<skill-name> `文本写入项目输入框。Host在执行前按当前Session的cwd与preset scope重新发现并校验Skill。

项目不得调用SkillsApi实现Skill候选菜单，不得保存Skill选择状态，也不得注册第二个Skill provider、invocation policy或Skill调用结果存储。项目必须保留ConversationRoot、原生`conversation.input.overlay`以及`ui-input-trigger`与`ui-skill`的`/`选择交互。三个迁移Skill使用Harness原生Session历史、AgentLoop、Tool调用和普通assistant消息。项目不得修改Harness Skill package。

## 来源与逐目录迁移决定

唯一来源是 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV` 的 committed tree `799b7759029d70076791321e2b02bf53c651c98f`（tag `v0.80.0`）：

| 来源目录 | 当前仓库目标目录 | 保留内容 | 必须改写或移除的内容 |
|---|---|---|---|
| `skills/anima-prompt-builder/` | `skills/anima-prompt-builder/` | Prompt 构造知识和本次任务需要的 `references/` | 重写 `SKILL.md` 的输入、Tool和直接输出协议；不迁移 `agents/openai.yaml`、`scripts/validate-output.mjs`、`run_skill_script`、`finalize_skill_error`、`noobai_user_prompt` 或来源运行时说明 |
| `skills/wai-sdxl-prompt-builder/` | `skills/wai-sdxl-prompt-builder/` | Prompt 构造知识和本次任务需要的 `references/` | 重写 `SKILL.md` 的输入、Tool和直接输出协议；不迁移 `agents/openai.yaml`、`scripts/validate-output.mjs`、`run_skill_script`、`finalize_skill_error`、旧调用标识字段或来源运行时说明 |
| `management-skills/lora-adjustment/` | `skills/lora-adjustment/` | LoRA 权重、MODEL/CLIP、停用成员、触发词和连续调整语义；`references/weight-guidance.md` | 重写 `SKILL.md` 为普通 Harness Skill；不迁移 `config/result-contract.json`、`scripts/`、`run_skill_script`、`finalize_management_skill_success`、`finalize_management_skill_error`、专用管理 Pi 或专用管理 Skill 会话 |

迁移后的 Skill 目录只能引用自身相对文件和 Harness 向当前 Agent 授权的 Tool。Skill 文件不得引用来源 checkout、当前仓库业务模块、SQLite、ComfyUI URL、本机绝对路径或用户全局 Skill 目录。

### 三个目标目录的逐文件结果

计划执行者必须按以下清单创建目标目录；不能整目录复制后再保留旧运行文件：

| 目标目录 | 必须创建或重写 | 允许原样保留的来源内容 | 不进入目标目录 |
|---|---|---|---|
| `skills/anima-prompt-builder/` | 重写`SKILL.md`、`references/01-quick-start.md`和`references/02-role.md`；新建`references/catalog-tools.md`和`references/output-format.md` | `references/00-template-header.md`、`04-final-self-check.md`至`17-examples.md`以及`artist-style-query-vocabulary.md`中不依赖旧输入、Tool或finalizer的Prompt知识 | `agents/`、`scripts/`、`references/03-output-protocol.md`、`references/semantic-query-interfaces.md` |
| `skills/wai-sdxl-prompt-builder/` | 重写`SKILL.md`；新建`references/catalog-tools.md`、`references/message-input.md`和`references/prompt-output-format.md`；把所有指向旧`semantic-tool-orchestration.md`的链接改为`catalog-tools.md` | composition、action、spatial、position、artist adoption、storyboard和examples等纯Prompt知识文件，但文件内容必须改为从当前消息不可变快照或新Catalog Tool结果取得角色/画师数据 | `agents/`、`scripts/`、`references/semantic-tool-orchestration.md`、`references/input-contract.md`、`references/prompt-format-validator.md` |
| `skills/lora-adjustment/` | 重写`SKILL.md`；保留并按新输入字段修订`references/weight-guidance.md` | LoRA的MODEL/CLIP权重、停用成员、触发词和连续调整语义 | `config/`、`scripts/`、来源专用管理Pi和来源专用管理Skill会话说明 |

目标`SKILL.md`必须只描述Harness Skill执行者能够看到的当前普通用户消息、`generation-context.v1`快照、普通Session历史、相对references和获授权Tool。Anima和WAI的Prompt输出必须由Skill直接写入最终assistant消息；LoRA调整结果必须由Skill直接写入最终assistant消息。三个目录都不能包含或调用旧Skill脚本执行器、成功finalizer、错误finalizer、来源输入包装对象或旧批量Tool协议。

### Skill调用Harness Tool的固定方式

三个迁移Skill只能调用PRD 05已经通过Harness公开`defineTool()`和统一`registerProjectTools()`注册的Tool；Skill不得调用数据源CLI、数据源HTTP接口、当前仓库Remote或任一本机路径。Tool的description与闭合schema来自已发布数据源OpenAPI并由当前仓库manifest核对，Skill references只说明何时调用和如何采用字段，不重新定义Tool schema。

Anima与WAI对一个查询目标发出一次调用：

```json
{ "mode": "search", "query": "用户正文或当前不可变快照产生的一个查询目标", "page": 1, "page_size": 10 }
```

作品调用`query_semantic_works`；角色调用`query_semantic_characters`并且只有当前不可变作品快照提供`work_id`时才附加该筛选；画师或画风调用`query_semantic_styles`；普通视觉概念调用`query_semantic_prompt_terms`。多个作品、角色、画师方向或提示词概念必须形成多次独立Tool Call，采用顺序等于查询目标在当前用户要求和不可变快照中的顺序。Skill不得发送`queries`或读取`groups`，不得把上一条消息的目录记录当作当前不可变快照。

`lora-adjustment`必须按当前消息LoRA快照顺序，对每个`source_lora_id`调用一次：

```json
{ "mode": "resolve", "id": "<source_lora_id>" }
```

该Skill只调用`query_semantic_loras`，不调用来源系统旧LoRA查询Tool，也不接受Host隐式补入底模、LoRA集合或权重范围。可选`base_model_id`只能来自当前消息的不可变底模或Workflow模板快照，并且只能按PRD 05允许的search筛选使用；`resolve`只允许`id`。

## Prompt Skill 输入、Tool 与输出

1. 用户在中列选择 `anima-prompt-builder` 或 `wai-sdxl-prompt-builder`，输入本次画面要求，并按需附加 `generation-context.v1` 的作品、角色、画师或画风、提示词条目、画师串、Workflow模板、LoRA、生成模型或Saved Media快照。
2. Skill 读取当前普通用户消息、同一消息中的不可变 `generation-context.v1` 快照和当前 Harness Session 中与本次要求有关的普通消息历史。Skill 不读取 `noobai_user_prompt` 或独立输入对象。
3. 两个 Prompt Skill 只允许调用 `query_semantic_works`、`query_semantic_characters`、`query_semantic_styles` 和 `query_semantic_prompt_terms`。Skill 只能把 Tool 返回的真实记录作为语义依据；查询失败时不能编造记录。
4. Skill 成功时在中列返回一条可直接使用的完整单行提示词。Skill 不调用 `generate_with_comfyui`，不返回 `run_id`，不选择 ComfyUI Instance，也不创建 Generation Run。
5. Skill 无法根据用户正文、消息快照和 Catalog 结果确定提示词时，普通 assistant 回复必须明确列出缺少的具体信息和用户下一步；Skill 不调用旧结果脚本或错误 finalizer。

## LoRA 调整 Skill 输入、Tool 与输出

用户调用 `lora-adjustment` 的当前消息必须包含：

- 用户本次调整要求；
- 一项 `comfyui-template` 的 `generation-context.v1` 快照；
- 至少一项 `lora` 的 `generation-context.v1` 快照；
- 当前完整提示词。当前提示词可以由用户在本条消息中明确提供，也可以是同一 Harness Session 中最近一条成功 Prompt Skill 或 `lora-adjustment` 回复；存在多个候选且用户没有指明时，Skill 必须请求用户选择，不能猜测。

Workflow模板安全快照必须提供 `base_lora_node_type: "LoraLoader" | "LoraLoaderModelOnly"`、`weight_ranges.model` 和 `weight_ranges.clip`。每项 LoRA 快照必须提供 `source_lora_id`、`file_name`、`description`、`usage`、`trigger_words` 和默认 `weight`。这些字段由 PRD 05 的真实 Catalog `resolve` 响应产生；原型数组或模型猜测不能补齐缺失字段。

`lora-adjustment` 必须按消息中的 LoRA 快照顺序处理全部成员，并为每个 `source_lora_id` 调用一次 `query_semantic_loras` 的 `resolve` 模式。Catalog结果只用于理解当前说明；它不能增加、删除、替换或重排本条消息的不可变 LoRA 快照，也不能替换快照中的 `file_name` 或允许触发词。

成功时，Skill 在中列直接返回且只返回以下 JSON 对象；不调用结果 finalizer：

```json
{
  "prompt_text": "调整后的完整单行提示词",
  "loras": [
    {
      "source_lora_id": "17",
      "model_weight": 0.8,
      "clip_weight": 0.8,
      "trigger_words": ["portrait_token"]
    }
  ]
}
```

LoRA 结果必须遵守以下规则：

- `loras` 与输入快照数量、顺序和 `source_lora_id` 完全一致。
- `model_weight` 与适用的 `clip_weight` 必须是各自闭区间内的有限数值。
- `LoraLoader` 的每项结果必须包含 `clip_weight`；`usage` 没有独立 CLIP 说明时，`clip_weight` 等于 `model_weight`。
- `LoraLoaderModelOnly` 的每项结果不得包含 `clip_weight`。
- 本次停用的 LoRA 使用零权重和空 `trigger_words`；`LoraLoader` 同时把 MODEL 与 CLIP 权重设为零。
- 每个返回触发词必须来自同一 LoRA 快照的允许集合、不得重复，并原样出现在 `prompt_text` 中。
- 连续调整以同一 Session 中最近一次成功 LoRA 调整结果为当前基线；新的追加要求保留当前基线，明确替换或删除的要求只修改对应内容。Skill 不恢复已经被后续结果替换的旧提示词。

输入不完整、模板不支持 LoRA、Catalog查询失败或结果无法满足上述规则时，Skill 在中列返回具体失败原因和需要用户补充或重选的对象；Skill 不创建 Generation Run。

## 与 `comfyui-generate` 的交接

用户需要实际生成时，必须在一条新的用户消息中显式选择 `comfyui-generate`，附加本次使用的 Workflow模板，并明确引用要使用的Prompt Skill输出。`comfyui-generate` 根据当前消息和Session历史组装 `generate_with_comfyui` 参数；Prompt Skill和LoRA调整Skill不得代替用户发起该调用。当前消息包含LoRA上下文时，`comfyui-generate`请用户取消LoRA选择，不调用Tool。

只有同一数字`turn`同时包含`comfyui-generate`的原生`skill-invocation`Context和`generate_with_comfyui` Tool Call时，Host才允许创建`run_id`。Tool Result的公开meta必须符合PRD 04固定合同；中列Tool行与右列运行卡片必须按该meta中的同一`run_id`读取同一`GenerationRunProjectionStore`快照。

## 三列可见结果

| 用户调用 | 中列 | 右列“当前轮次结果” |
|---|---|---|
| `anima-prompt-builder` | Agent 流式文本和最终单行Prompt | 明确显示本轮无ComfyUI运行 |
| `wai-sdxl-prompt-builder` | Agent 流式文本和最终单行Prompt | 明确显示本轮无ComfyUI运行 |
| `lora-adjustment` | Agent 流式文本和最终 `{prompt_text, loras}` JSON | 明确显示本轮无ComfyUI运行 |
| `comfyui-generate` | Agent流式文本、`generate_with_comfyui` Tool Call、异步状态摘要与“定位结果” | 只按通过合同校验的`ToolResultNode.meta.run_id`显示零个、一个或多个运行卡片 |

左列始终是Harness Session列表。任何Skill都不得创建专用Session类型，也不得把中列Skill结果渲染到右列。

## 错误行为

- Skill不在公开SkillsApi结果或Host重新校验失败时，Workbench保留用户正文与上下文并显示具体Skill名称；不得调用另一个Skill代替。
- Catalog contract不兼容或查询失败时，三个迁移Skill不得编造目录记录。
- Prompt Skill和LoRA调整Skill即使成功，也不得出现`generate_with_comfyui` Tool Call、`run_id`或右列新运行。
- `lora-adjustment` 不得接受空LoRA集合、重复`source_lora_id`、不包含零的权重范围、未知节点类型、越界权重或快照外触发词。
- Skill输出结构可以由确定性测试检查；提示词、LoRA用途、权重和触发词的语义质量必须由非实现者独立语义审核，程序测试不能替代。

## 产品验收

1. 真实Harness Host provider发现三个迁移Skill；用户在项目输入框输入`/`后，Harness原生Skill菜单显示当前Session全部获授权的user-invocable Skill，其中包含三个迁移Skill和Ticket 04的`comfyui-generate`。选择任一Skill后输入区出现普通`/<skill-name> `文本，Host执行前重新校验对应Skill；项目bundle中不存在第二套Skill菜单或Skill选择存储。
2. Anima与WAI各完成一项真实Catalog辅助的Prompt任务；中列显示各自最终Prompt，当前轮次右列均没有新运行，Run Repository计数不变。
3. `lora-adjustment`分别完成`LoraLoader`、`LoraLoaderModelOnly`、临时停用、独立CLIP权重、多LoRA有序返回和同Session连续调整；中列结果符合本PRD结构，当前轮次右列没有新运行，Run Repository计数不变。
4. 用户在后续消息选择`comfyui-generate`，重新附加同一Workflow并引用上一条Prompt Skill输出；同一数字`turn`保存Skill Invocation、一次Generation Tool Call和含合法`run_id` meta的Tool Result。中列Tool行持续显示该运行的异步状态摘要，右列只显示同一Store快照的详细运行卡片。Prompt与LoRA结果没有被复制成右列卡片。
5. 源码生产进程在来源checkout不存在时仍能从项目Skill目录发现并运行三个迁移Skill，其他Preset不能从默认Skill roots发现这些项目Skill。
6. 项目源码包含三个迁移Skill需要的`SKILL.md`和references，不包含三个来源Skill的validation/report脚本、agents配置、来源数据库、绝对路径、凭据、旧调用标识字段、`run_skill_script`或任何finalizer协议。
7. 非实现者独立语义审核者检查两个Prompt的画面语义、LoRA调整的顺序/权重/触发词/连续修改语义，以及全部失败文案，并逐项给出PASS/FAIL。
8. Skill黑盒测试必须运行真实Harness Skill provider和Tool registry并记录实际Tool Call与Tool Result：Anima和WAI分别覆盖单目标、多目标、空结果、Catalog错误和无需查询；每个查询目标恰好产生一次闭合`search`调用。LoRA分别覆盖单个、多个、有序resolve、Catalog错误和连续调整；每个快照恰好产生一次闭合`resolve`调用。断言不能只扫描Skill文本。
9. 黑盒测试必须确认三个迁移Skill从未调用数据源CLI、旧Skill脚本执行器、任何finalizer、来源系统旧LoRA查询Tool或`generate_with_comfyui`；Prompt与LoRA消息不产生`run_id`，Run Repository计数不变。

## 不属于本 Ticket

本Ticket不迁移旧Pi进程、专用提示词会话、专用管理Skill会话、迭代生图任务编排器、三轮限制、旧结果脚本或finalizer Tool。`comfyui-generate`、Generation Tool、Run Repository和右列结果卡片由Ticket 04及其后续Tickets交付。
