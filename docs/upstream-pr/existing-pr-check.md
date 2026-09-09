# 上游重复改动检查记录

## 检查对象与时间

2026-09-09，主 Agent 检查 GitHub 仓库 anywhere-labs/dsh-desktop 的全部状态 PR，以及默认分支 master 的提交 90217cdaee9d5c47062a7ae4a2133b8bf5a5af54。

## PR 查询与结果

主 Agent 使用 GitHub Search API 查询 session、删除、session deletion、session delete、pi-ai、session-id、x-deepseek-harness-session-id、reasoning、推理、reasoningEfforts、thinkingLevelMap、OpenCode 和 0.84.4，并读取相关 PR 的正文、变更文件与合并状态。

| PR | 状态与核对结果 |
| --- | --- |
| [#51](https://github.com/anywhere-labs/dsh-desktop/pull/51) | 包含会话删除，但已关闭且未合并。作者的关闭说明指出该分支属于另一个仓库，提交目标错误。 |
| [#554](https://github.com/anywhere-labs/dsh-desktop/pull/554) | 开放。处理旧版工作区行的右键菜单，只复用重命名、派生和归档动作，没有实现永久删除。 |
| [#679](https://github.com/anywhere-labs/dsh-desktop/pull/679) | 开放。为 dsh-llm-pi-ai 0.1.1-rc.2 的 inputModalities 增加别名，不涉及本次真实 Session ID 请求头或推理等级配置。 |
| [#670](https://github.com/anywhere-labs/dsh-desktop/pull/670) | 开放。处理 0.1.1-rc.2 的图片输入能力配置，不涉及本次 Session ID 请求头。 |
| [#470](https://github.com/anywhere-labs/dsh-desktop/pull/470) | 已关闭且未合并。处理 Vision 模型展示和附件体验，不是本次自定义 Provider 推理等级保存实现。 |

精确请求头名称、reasoningEfforts、thinkingLevelMap、OpenCode 和 0.84.4 查询未返回同类 PR。检索结果没有显示已合并的会话永久删除实现，也没有显示处理真实 Session ID 请求头或自定义 Provider 推理等级配置的开放或已合并 PR。

## 默认分支代码核对

master 从固定候选提交 b39ffbf5621aea51e87f27e7b83d9c3e1ff5e24d 前进到 90217cdaee9d5c47062a7ae4a2133b8bf5a5af54，新增提交更新 Beta 到 DSH 0.1.5-alpha.1。Stable 的 vendor/dsh-runtime/0.1.2-rc.1 内容没有变化，Stable 目录仅测试文件 package.spec.ts 发生变化。

主 Agent 在 master 的 patches、package.json 和 dsh-plugin-desktop/src 中检查 session/delete、x-deepseek-harness-session-id、reasoningEfforts 和 0.84.4，未发现匹配实现。

## 草稿准备要求

主 Agent 在 PR 草稿中说明与上述 PR 的范围差异。用户已授权主 Agent 在 fzfz/dsh-desktop-anywhere 创建 PR 并合入该 fork 的 main。
