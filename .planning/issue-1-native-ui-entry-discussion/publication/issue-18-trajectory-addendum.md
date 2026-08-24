## 2026-08-24 Harness 原生轨迹视图补充（本 Issue 唯一最新轨迹规范）

本节补充本 Issue 已链接的不可变实施计划。该实施计划中的四个 workbench动态 occupant只统计项目注册的 occupant；`@deepseek-ai/dsh-client-ui-trajectory`注册的原生 Trajectory occupant属于 Harness Web composition，不计入项目 occupant数量。

### 必须实现的目标

1. 计划执行者必须让 Harness Web composition继续启用 `@deepseek-ai/dsh-client-ui-trajectory@0.1.0-rc.8`。计划执行者不得禁用、删除或替换 `ui-trajectory` Loader row。
2. native mode和 workbench mode必须保留 ConversationRoot顶部视图标签环中的原生轨迹入口。该入口必须继续由 `ui-trajectory`向 `conversation.view`注册，注册项固定使用 `id: "trajectory"`、`order: 10`和 Harness locale提供的“轨迹”或“Trajectory”标签。
3. workbench mode只能替换 `conversation.view`中 `id: "chat"`的项目内容。项目不得隐藏 ConversationRoot顶部视图标签环，不得覆盖或注销 `id: "trajectory"`的原生注册项。
4. 用户点击“轨迹”后，ConversationRoot必须显示 `ui-trajectory`提供的原生 TrajectoryView。TrajectoryView必须读取当前 Workbench Session的同一 Session窗口，不得创建第二个 Session、第二份事件记录或项目轨迹数据源。
5. workbench mode必须保留 rc.8 TrajectoryView的原生功能：按 Turn和 Step组织的用户、Assistant、Tool、嵌套 Subtool与 Compaction记录；Overview时间线；Duration与实际时间显示切换；Turns与 Calls展开或折叠；轨迹搜索；时间线区间选择、缩放和平移；记录选择与局部检查器；更早历史加载。
6. 项目不得复制 TrajectoryView、TrajectoryToolbar、TrajectoryTimeline、TrajectoryTable、Trajectory Definition、Trajectory snapshot builder或局部检查器。项目必须通过 Harness现有 Web composition和 `conversation.view` slot复用这些功能。

### 验收清单

1. Composition测试必须证明最终 Web composition包含一个启用状态的 `ui-trajectory` Loader row，并且 `conversation.view`中只存在一个 `id: "trajectory"`的注册项。
2. Surface切换测试必须连续进入和退出 workbench mode十次，并证明 `id: "trajectory"`的注册项没有被移除或重复注册。
3. 浏览器验收必须证明 native mode与 workbench mode在存在当前 Session时都显示 ConversationRoot顶部的“聊天”和“轨迹”入口。
4. 浏览器用户进入 workbench mode并点击“轨迹”后，页面必须显示当前 Workbench Session的原生 Overview时间线和按 Turn、Step组织的原生记录表；返回“聊天”后仍显示同一个 Workbench Session。
5. 受控 Session必须包含 user message、Assistant message、根 Tool Call、嵌套 Subtool Call和 Compaction记录。轨迹记录表必须按当前 Session事件顺序显示这些记录。
6. 浏览器验收必须分别操作并验证轨迹搜索、Turns展开或折叠、Calls展开或折叠、Duration切换、实际时间切换、时间线区间选择、滚轮缩放、右键平移、记录选择和局部检查器。
7. 记录检查器必须显示所选记录拥有的 token用量、耗时、输入、输出和计时信息；缺少某项真实记录时，原生 TrajectoryView不得伪造该项数值。
8. 当前 Session存在更早历史时，浏览器用户必须能够通过原生记录表首行控件或 Overview省略号控件加载一页更早历史；加载后当前轨迹仍属于同一个 Session。
9. 独立视觉审核者必须在 `1440×1000`保存 workbench mode顶部“轨迹”入口、TrajectoryView主界面、局部检查器和更早历史入口的浏览器证据。

### 非本次目标

1. 本 Issue不新增项目轨迹组件、项目轨迹状态、项目轨迹 Remote或项目轨迹持久化格式。
2. 本 Issue不修改 `@deepseek-ai/dsh-client-ui-trajectory` package、Harness Session事件、Trajectory Definition或 Trajectory snapshot builder。
3. 本 Issue不新增 rc.8 TrajectoryView未提供的记录锚点深链接，也不新增跨 Session或整个 Workspace的聚合轨迹页面。
4. 本 Issue不修改 GitHub Issue #1、#4、#6、#10、#11、#13或 #14，也不修改产品代码。

### 已获得的授权

用户已经明确授权计划编写者修改 GitHub Issue #18，把 Harness原生顶部轨迹入口与现有 TrajectoryView功能加入 Issue #18。该授权不包含修改其他 GitHub Issue、不可变实施计划或产品代码。
