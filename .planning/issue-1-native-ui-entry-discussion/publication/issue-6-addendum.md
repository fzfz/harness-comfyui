## 2026-08-24 原生 Route reference修订（本 Issue唯一最新路线输入规范）

### 不可变实施计划

- [Harness 原生 Surface 与输入能力实施计划](https://github.com/fzfz/harness-comfyui/blob/5010c2ab832dd7c056ce94b384b92e715414b930/plans/issue-1-native-surface-and-input-capabilities.md)

本节和不可变实施计划替代本 Issue与 `docs/v0.1/PRDS/05-full-catalog-context-and-route.md`中关于项目 Execution Route草稿、route block位于正文末尾、Execution Route不生成 inline reference和项目直接 `SessionFace.prompt()`的冲突条款。

### 实现责任

1. 项目必须把 Execution Route控件注册到 `conversation.input.right`，并从当前 `InputState.occurrences`中的唯一 `generation-route` occurrence读取显式实例；没有该 occurrence时显示“使用默认实例”。
2. 项目必须注册不可变实施计划定义的 codec-only `generation-route` source，并按计划中的固定 JSON字段顺序、`ReferenceInsert`、`clipboardText()`和 `serialize()`合同实现。
3. 当前输入没有 Route reference时，显式实例选择必须在最新草稿末尾插入唯一 Route reference。
4. Issue #6必须在 `src/client/workbench/input-error-messages.ts`增加 `EXECUTION_ROUTE_INSERT_FAILED`和 `EXECUTION_ROUTE_REMOVE_CURRENT_FIRST`固定映射。
5. Route reference存在时，控件必须拒绝另一个显式实例或默认实例，并显示“请先在输入框中删除当前执行路线，再选择新的执行路线。”项目不得通过 `setDraft()`猜测、删除或替换 Route reference。
6. 用户必须使用原生 Backspace或 Delete按 occurrence identity删除 Route reference；删除后控件显示默认实例并允许重新选择。
7. Route reference不是 ContextRef，不得进入 Message Context数量或 Modal选择。原生 InputBar必须显示 Route inline reference。
8. Issue #4的插入规则必须保证全部 Context reference位于唯一 Route reference之前。原生 InputBar必须在一次默认提交中序列化全部 Context block和唯一 Route block。
9. Issue #6必须与 Issue #4共用完整 user message parser，不得假设 Route block位于正文末尾。
10. 计划执行者必须同步修改 `docs/v0.1/PRDS/05-full-catalog-context-and-route.md`。

### 验收

- 显式实例产生唯一 Route inline reference，Message Context数量不变。
- Route reference存在时，改选或选择默认实例显示 `EXECUTION_ROUTE_REMOVE_CURRENT_FIRST`并保留原 Route reference。
- 用户用原生 Backspace或 Delete删除 Route reference后，控件显示默认实例并允许选择新实例。
- 联合验收必须依次选择显式路线、确认两个 ContextRef、继续输入包含空格和换行的正文并发送；Session只能增加一条 user message。
- parser必须提取两个 Context block和一个 Route block；Route block位于两个 Context block之后。删除三个有效 block与对应机器 ASCII分隔空格后，剩余文本必须逐字符等于用户正文。

### Blocked by

- Issue #18 — 恢复 Harness 原生界面，并在工作台复用原生输入能力。
- Issue #4 — 使用原生 InputBar提交 Message Context。

本节替代原文中与这两个 blocker关系冲突的旧输入能力前置条件。
