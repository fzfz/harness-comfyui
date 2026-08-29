# 动态 Tool 文章与当前实现对照

## 核心结论

文章的核心结论不是选择名为 `standard` 的预设，而是保持模型请求前缀中的 Tool Interface 小而稳定，把领域流程放进按需加载的知识层，并通过固定通用执行能力调用外部程序。频繁改变 Tool schema 会增加前缀成本并破坏缓存稳定性；即使 Tool 集合固定，持续序列化不需要的领域 Tool 也会增加每次请求成本。

当前 Host 在启动时固定注册 5 个项目 Tool，因此没有逐 Turn 动态增删 schema。它仍把 5 份项目 schema 序列化给使用继承 Tool 的 Agent，即使这些能力已有 CLI adapter 或能够通过项目 CLI 到达。因此当前实现符合“Session 内稳定”，但不符合“按常见任务缩小模型 Tool Interface”。

本次实现增加两个项目 Preset，直接隔离该变量：A 继承 5 个项目 Tool，B 不继承这些 Tool；两组都使用固定 `bash + skill`、同一全局 Skill 和同一 managed CLI。真实模型结果位于 `ab-experiment-report.md`。

## 符合性判断

| 文章原则 | 当前 A | 当前 B | 证据 |
| --- | --- | --- | --- |
| Session 内 Tool schema 稳定 | 符合 | 符合 | Preset standing composition；真实 Session 的 request header |
| 领域知识按需加载 | 部分符合 | 符合 | 全局 Skill 主文件与 `references/` |
| 领域能力不必全部成为模型 Tool | 不符合 | 符合 | A 为 7 schema；B 为 2 schema |
| 执行身份不能由模型编造 | 原生 Tool 符合 | CLI capability 符合 | `generation-tool.ts` 与 `src/host/cli/` |
| 效果必须由真实模型验证 | 已验证兼容性任务集 | 已验证兼容性与双提交生成 | 3 对兼容性 Session；B 的 2 个成功 Run 与 2 个媒体 |

## 验收清单

- [x] 文章由独立队员抓取并审阅。
- [x] Host Tool 注册、Preset composition、Skill、CLI、capability 和 SQLite 链路具有源码证据。
- [x] A/B 使用真实模型而不是 deterministic mock 代替效果测试。
- [x] B 通过真实模型把同一个 Generation Request 独立提交两次，并由远端 ComfyUI 完成两个 Run。
- [x] 报告全文只使用当前定义的 A/B 两组。

## 非本次目标

- 不根据 3 对样本直接批准生产迁移。
- 不删除现有 Host Tool adapters。
- 不安装或运行文章引用的外部项目。

## 已获得的授权

用户授权独立 worktree、文章抓取、A/B 实现和使用指定 Provider/Model 的真实调用。没有生产发布或部署授权。

## 来源

- 文章：`https://yage.ai/share/grok-bot-dynamic-tools-20260827.html`
- 当前实现报告：`.planning/dynamic-tools-analysis/ab-experiment-report.md`
- 当前 Preset 设计：`.planning/dynamic-tools-analysis/preset-design.md`
