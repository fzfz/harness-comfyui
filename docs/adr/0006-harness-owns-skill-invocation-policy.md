---
status: accepted
---

# Harness owns Skill Invocation policy

DeepSeek Harness原生Skill provider、Skill声明与active profile共同决定是否允许用户显式Skill Invocation、模型自动Skill Invocation或两者同时存在。用户在消息输入框键入`/`后，Harness随附`ui-input-trigger`与`ui-skill`必须显示当前Session可调用的Skill；用户选择后，Harness必须把普通`/skill-name `文本写入当前草稿。项目不得调用SkillsApi实现第二套候选菜单，不得实现候选查询、候选排序、菜单状态、键盘选择或Skill选择状态，也不得注册第二个Skill provider或invocation policy。Host在Agent执行前重新按当前Session scope发现并校验Skill。Generation Tool Host adapter只根据Tool执行上下文中名称与`call_id`唯一匹配的原生Tool Call、Session header中的Workspace目录和Workspace Registry归属建立Run身份，不读取或检查`skill-invocation`Context。

项目bundle停用上游随附`ui-layout`插件后，项目Client plugin向内建`root`注册唯一root并声明`conversation` child slot；`ui-conversation`的ConversationRoot注册到该slot，使`conversation.input.overlay`继续由其合法声明者渲染。项目只通过`priority: -10`替换`conversation.composer.bar`的可见输入区，并把ConversationRoot传入的`overlay`原样渲染在composer card中。项目输入组件使用公开`useInput`与`inputActions`读写草稿，并通过`ctx.inputTriggers.sessionOf(sessionScope)`调用公开`track()`、`arbitrate()`、`onSpace()`与`dismiss()`连接当前textarea；候选获取、MenuView渲染、候选选择和普通`/skill-name `文本插入仍全部由Harness随附插件拥有。项目不注册第二个root，也不实现移动端布局。
