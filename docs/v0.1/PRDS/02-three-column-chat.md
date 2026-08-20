# PRD 02：三列布局与普通聊天

## 关联 Ticket

Ticket 02 — 在真实 Harness Client 中实现原型 A 三列布局与普通聊天。

## 用户任务

浏览器用户搜索并选择一个 Harness Session，发送一条不创建 Generation Run 的普通消息，观察 Agent 增量文本，并在右列确认当前聊天轮次和当前 Session 都没有生成结果。

## 原型依据

- `prototype/generation-workbench/index.html` 的左列 Session 列表、中列 conversation、右列结果标签和空态。
- `prototype/generation-workbench/styles.css` 的宽屏三列、Session 选中态、消息气泡、输入区、结果标签和窄屏 panel 样式。
- `prototype/generation-workbench/app.js` 的 Session 搜索、Session 切换、消息发送、流式文本和结果标签交互。

## 前端要求

1. 当前项目通过 Harness 追加 slot 增加左列 footer action、conversation 附加区域和 priority `-10` 的 `details` 结果面板；当前项目不得替换 `root`、`sidebar` 或 `conversation`。
2. 左列使用 Harness 当前 Workspace 的 Session 列表。每一行显示 Session 标题、最后更新时间和当前仓库的 Generation Run 数量；Ticket 02 在运行服务尚未接入时显示确定的 `0 项运行`。
3. “搜索会话”只在当前已加载 Session 集合中按标题筛选。空字符串恢复全部 Session；无匹配结果显示明确空态，不创建虚构 Session。
4. 中列标题、消息记录、草稿正文和发送状态始终属于当前选中 Session。切换 Session 后不得继续显示上一 Session 的草稿、消息或右列状态。
5. 普通消息提交必须使用 Harness 原生消息入口；Agent 增量文本必须使用 Harness 原生 conversation 流。当前项目不得创建第二个消息接口或复制一份 Session 日志。
6. 右列提供“当前轮次结果”和“本会话结果”两个标签。当前聊天轮次没有 Generation Run 时显示“此轮对话没有创建 ComfyUI 运行”；当前 Session 没有 Saved Media 时显示“当前会话还没有生成运行”。
7. 视口收窄时使用 Harness `AppFrame` 的列收缩规则和原型规定的移动端 panel 切换，不创建新的断点数值。

## 后端与数据要求

- Session 列表、当前 Session、消息记录、数字 `turn` 和 Agent stream 全部来自 Harness 原生 Session/conversation 服务。
- Host 从当前 Harness 上下文派生 Workspace 与 Session；浏览器不能提交任意 Workspace 范围。
- Ticket 02 不创建 Generation Run，也不写 Run Repository。运行计数暂时只能是已接入服务返回的真实计数或零，不能使用原型 fixture 数字。

## 状态与错误

- Session 列表加载失败时，左列保留搜索框并显示可重试错误；中列和右列不得显示其他 Session 的缓存内容。
- 消息提交失败时，草稿正文保留，发送按钮恢复可操作状态，并显示 Harness 返回的具体错误。
- stream 中断时，已经收到的 Agent 文本保留，并显示本次回复中断；页面不得把不完整回复标为完成。
- 没有 Session 时，中列显示未选择 Session 的空态，消息输入与发送按钮禁用并说明原因。

## 产品验收

1. 浏览器用户输入搜索词、清空搜索词、选择两个不同 Session；每次中列标题、消息和右列空态都对应当前 Session。
2. 用户发送普通消息并看到至少两次增量文本更新；该数字 `turn` 的当前轮次结果保持零项。
3. 用户在两个结果标签间往返切换，空态文案、选中态和焦点顺序与原型一致。
4. 用户在原型 CSS 定义的宽屏和窄屏尺寸完成 Session 选择、panel 切换和消息发送。
5. 视觉审核者并排检查 header、列顺序、列宽、panel、Session 行、消息气泡、轮次标题、输入区、结果标签、空态、禁用态和错误态。

## 不属于本 Ticket

本 Ticket 不实现 Message Context、Skill UI、Generation Tool、运行卡片、媒体或任务取消。
