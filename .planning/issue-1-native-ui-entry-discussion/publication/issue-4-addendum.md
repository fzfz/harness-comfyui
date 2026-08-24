## 2026-08-24 原生 InputBar 与 Message Context修订（本 Issue唯一最新输入规范）

### 不可变实施计划

- [Harness 原生 Surface 与输入能力实施计划](https://github.com/fzfz/harness-comfyui/blob/5010c2ab832dd7c056ce94b384b92e715414b930/plans/issue-1-native-surface-and-input-capabilities.md)

本节和不可变实施计划替代本 Issue与 `docs/v0.1/PRDS/03-message-context-core.md`中关于项目 composer、已确认 `ContextRef[]`草稿、项目 File/object URL草稿、项目直接 `SessionFace.prompt()`、正文末尾 block解析和 Issue #16隔离 Skill roots的冲突条款。

### 实现责任

1. 原生 InputBar必须继续拥有 textarea、图片附件、发送按钮、ModelSelect、PermissionSelect、`/`菜单和默认提交 sink。项目不得注册 `conversation.composer.bar` occupant。
2. 项目必须把“本次消息上下文”标题、数量和“添加上下文”按钮注册到 `conversation.input.dock`。Message Context Modal、Catalog查询、候选详情、分页、确认和已发送消息折叠块继续属于本 Issue。
3. Modal确认时，项目必须通过 `ctx.sessions.scope(sessionId)`和 `ctx.conversation.input.for(sessionScope)`取得原生 `SessionInput`，并按选择顺序调用 `insertReference()`。Context reference必须插入唯一 Route reference之前；没有 Route reference时必须插入当前草稿末尾。
4. 项目必须注册不可变实施计划定义的 codec-only `generation-context` source，并按计划中的固定 JSON字段顺序、`ReferenceInsert`、`clipboardText()`和 `serialize()`合同实现。
5. 计划执行者必须创建 `src/client/workbench/input-error-messages.ts`，并从该唯一结构化映射显示 `MESSAGE_CONTEXT_INSERT_FAILED`对应文案。
6. 任一插入失败必须恢复确认前草稿、保留 Modal选择、保持 Modal打开，并且不得保留本次部分插入结果。
7. 原生 InputBar必须显示 Context inline reference。项目不得保存第二份已确认 ContextRef列表；Message Context数量必须读取当前 `InputState.occurrences`。
8. 原生 InputBar必须负责图片编码、reference序列化和默认提交。失败必须保留正文、reference occurrence和图片；成功只能增加一条 user message。
9. 项目唯一 user-message parser必须扫描完整 user message，按出现顺序提取 schema有效的 `generation-context.v1` block，并只删除每个有效 block后紧邻的一个机器 ASCII分隔空格。parser必须保留用户输入的其他空格、换行和非法或未知 block文本。
10. 计划执行者必须同步修改 `docs/v0.1/PRDS/03-message-context-core.md`。

### 验收

- Modal确认两个 ContextRef后，页面只能显示两个原生 inline reference，Message Context数量必须等于二。
- 用户用原生 Backspace删除一个 occurrence后，数量必须等于一，剩余顺序必须保持不变。
- 用户复制 Context reference时，剪贴板必须得到且只得到 `@generation-context <json>`。
- 用户发送正文、两个 ContextRef和一张图片后，Harness Session只能增加一条 user message。
- Context解析或图片编码失败时，原生 InputBar必须保留正文、全部 reference occurrence和图片。
- `insertReference()`中途失败时，项目必须恢复确认前草稿，保留 Modal选择并保持 Modal打开。

### Blocked by

- Issue #18 — 恢复 Harness 原生界面，并在工作台复用原生输入能力。

本节替代原文中与本 blocker关系冲突的旧输入能力前置条件。
