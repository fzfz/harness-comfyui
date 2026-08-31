---
status: accepted
---

# Source contract v0.86.1 and compiler-owned output discovery

## Context

Source v0.86.1 的 TemplateBundle 只返回 `id`、`title` 和 `workflow_json`。Harness v0.37.2 仍读取 Source v0.84.0 的模板 revision、Workflow SHA-256、config revision、dimension strategy 和输出节点过滤器，因此合法三字段响应在 Generation Run 创建前返回 `SOURCE_PROTOCOL_ERROR`。

Generation Runtime 已经依赖 `ComfyWorkflowCompiler.activeOutputNodeIds` 保存编译后活动输出节点集合，并使用该集合筛选 ComfyUI Jobs API 输出。该运行时集合与 Source v0.84.0 的 `expected_output_node_ids_json` 输入具有不同所有者和生命周期。

## Decision

Harness 的 `production` Configuration Profile 固定使用 `source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.86.1"`。`config/source-contract-v0.86.1.json` 是当前唯一结构化 Source 消费合同。Source v0.84.0 的结构化合同与 ADR 0013 保留为历史记录。

`GenerationSourceCli` 只校验并投影 TemplateBundle 的 `id`、`title` 和 `workflow_json`。`SourceGenerationPreparer` 的 source snapshot 只保存模板 ID 和模板标题。Harness 不增加 v0.84.0 与 v0.86.1 双版本解析，也不为已退役字段填默认值。

`ComfyWorkflowCompiler` 根据目标实例实时 `/object_info` 的 `output_node: true` 标记与 Workflow 必需输入连线生成 `activeOutputNodeIds`。compiler 删除未满足必需输入的输出节点，并在没有活动输出节点时终止编译。

Generation Runtime 继续保存 compiler 返回的 `activeOutputNodeIds`，Comfy transport 继续使用该集合筛选 Jobs API 输出。`generation_runs.expected_output_node_ids_json` 保存 compiler 输出，因此本次合同升级不修改该列，也不执行数据库迁移。

## Consequences

- Source v0.86.1 三字段 TemplateBundle 可以在 Run 创建前通过 Host adapter 校验。
- 输出节点发现规则只有 `ComfyWorkflowCompiler` 一个所有者。
- 目标实例 `/object_info` 或 Workflow 连线没有活动输出节点时，调用方收到 `WORKFLOW_COMPILE_FAILED`。
- 历史 Generation Run 的 source snapshot 与编译后输出节点集合保持可读，不需要重写。
- Harness v0.37.2 不能单独与 Source v0.86.1 配合使用；功能回滚必须同时恢复兼容的 Source v0.84.0。
