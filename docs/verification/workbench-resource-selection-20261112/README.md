---
文档用途: 保存实验工作台资源选择功能的官方 Desktop 视觉验收与免费模型验收证据。
读取时机: 复核资源选择、请求资料、提示词结果及验收范围时。
---
# 资源选择验收

## 1. 验收环境

1. 验收日期为 2026-11-12，开发分支为 `codex/workbench-resource-selection`，开发目录为 `/Users/fzfz/.codex/worktrees/workbench-resource-selection/harness-comfyui`。
2. 验收者通过官方 DeepSeek Harness Desktop 安装当前分支构建的插件包。实例、安装包来源及冷启动后的分支记录见 [visual.json](visual.json)。
3. 资源目录来自本机 `http://127.0.0.1:18093`，来源图片来自 `http://127.0.0.1:18092`。模型验收使用 OpenRouter 的 `thinkingmachines/inkling-2-small:free`。

## 2. 真实界面验收

1. 8 类资源入口均可见。生成模型和 Workflow 分别选中 1 项，其余 6 类分别选中 2 项；切换类别后选择保持。界面按 3 栏显示，1265 像素内容区内的横向滚动宽度同为 1265 像素。截图见 [资源目录与已选项](resources-final.png)。
2. 验收者修改 2 条 LoRA 权重为 `0.75` 和 `1.25`，保存并冷启动后，2 条 LoRA 的权重仍为 `0.75` 和 `1.25`。移除 `ds_mile` 后取消编辑，分支恢复已保存的 4 条提示词资源引用。
3. 目录分页显示源响应页数。筛选 moss 画风后返回 0 项，8 类入口及已选项继续显示；点击“清除筛选”后恢复 12413 项画风。截图见 [空结果与恢复入口](empty-results.png)。
4. 验收者打开 8 类资源详情，核对正文与来源图片。Workflow 的“其他字段”默认折叠，展开后可读取 `workflow_json` 原值。截图见 [Workflow 图数据](workflow-details.png)。

## 3. 免费模型验收

1. 本次验收包含生成、连续改写和采用结果。2 轮请求、资源快照、返回值及采用后的分支输入见 [model.json](model.json)。
2. 首轮从未保存的表单生成提示词，读取模型、Workflow、2 条 LoRA、2 条画风和 2 条画师串。请求预览输入与本轮持久化输入逐字段一致。
3. 首轮输出包含 `say_hana`、`ds_mile`、2 组画师串，以及白发、蓝色外套、雨夜街道、全身构图和霓虹倒影。
4. 改写前，验收者移除 `ds_mile`，保留 2 条画师串，并使用第 2 节保存的 LoRA 权重。改写请求读取当前未保存选择；首轮快照继续保留原选择和原权重。
5. 改写结果去除 `ds_mile` 与 `watercolor`，加入 `clean lineart` 和 `(reflection:1.2)`。点击“采用生成结果”并保存后，分支提示词与第二轮结果一致。截图见 [提示词对比](prompt-comparison.png)。

## 4. 自动化证据

1. [资源集成测试](../../../tests/integration/workbench-resource-selection.test.ts)覆盖候选接纳、实验委派、Run 来源优先级与历史复用。
2. [提示词集成测试](../../../tests/integration/workbench-prompt-edit.test.ts)覆盖请求快照与提示词结果保存。
3. [资源单元测试](../../../tests/unit/workbench-resources.test.ts)覆盖资源字段投影与读取失败。
4. [界面测试](../../../tests/unit/experiment-workbench.test.tsx)覆盖目录交互、选择状态与详情入口。
5. 全量覆盖运行通过 2889 项测试，函数覆盖率为 100%（3471/3471）；记录见 [覆盖日志](../../../.local/resource-selection-implementation/coverage-complete.log)。
6. 仓库完整门禁命令为 `pnpm quality`，执行记录见 [质量日志](../../../.local/resource-selection-implementation/quality-delivery.log)。

## 5. 证据范围

1. [官方会话索引](../../../.local/resource-selection-implementation/model-trace-final/trace-index.json)关联完整事件序列与工具记录。官方导出包含持久化消息；Provider 原始 HTTP 请求和流未保存在该导出中。
2. 模型验收覆盖提示词生成、改写和采用。图像风格效果需要后续生成图片并由用户审阅。
3. 独立验收环境的翻译功能提示选择可用模型，中文译文尚未通过验收。
