---
doc_id: harness-source-contract-v0.86.1
title: Harness 消费源数据仓库 v0.86.1 envelope 合同
status: accepted
version: v0.86.1
lifecycle: consumer-contract
structured_source: config/source-contract-v0.86.1.json
---

# 合同所有权

`config/source-contract-v0.86.1.json` 是 Harness 对源数据仓库 v0.86.1 的唯一结构化消费合同。本文解释该结构化合同的运行规则；operation 清单和字段映射以该 JSON 文件为准。

Harness 固定消费以下已发布产物：

- Source checkout tag：`v0.86.1`
- Source release version：`0.86.1`
- Catalog CLI：`imagegen-semantic-query`
- Host-only Source CLI：`imagegen-comfyui-source-read`
- Source service：CLI `--port` 参数指定的本机回环服务

`source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.86.1"` 由 `production` Configuration Profile 固定。Harness 不从 live discovery 或目标响应推断这两个值。

# CLI 与 envelope

两个 CLI 采用 raw-passthrough 行为：

1. CLI 对 discovery 或目标 2xx body 只验证非空、严格 UTF-8 和单个 JSON 值。
2. CLI 成功时使用退出码 `0` 将目标响应原始字节写入 stdout。
3. Harness adapter 负责验证 discovery、分页 envelope、operation 字段和业务字段。
4. Harness adapter 把非零退出、空 stdout、多 JSON 值、非法 UTF-8、连接失败、超时和取消映射为稳定项目错误；Tool Result、日志和浏览器文案不得暴露 CLI stderr、可执行文件路径、数据库路径或凭据。

Catalog discovery 必须是结构化合同声明的 OpenAPI 3.1 对象。Host-only Source discovery 必须是 `status`、`message`、`results`、`page`、`page_size`、`total_count` 成功 envelope，OpenAPI 文档位于 `results[0]`。

# Catalog 图片字段

Catalog 保留十个 operation。以下八个“插入上下文”operation 的每条成功结果必须包含 `sample_image_urls`：

1. `querySemanticGenerationModelsForSkill`
2. `querySemanticLorasForSkill`
3. `querySemanticWorksForSkill`
4. `querySemanticCharactersForSkill`
5. `querySemanticStylesForSkill`
6. `querySemanticPromptTermsForSkill`
7. `querySemanticArtistPromptStringsForSkill`
8. `querySemanticComfyuiTemplatesForSkill`

`querySemanticBaseModelsForSkill` 与 `querySemanticComfyuiInstancesForSkill` 不提供该展示字段。Harness Host 把 `sample_image_urls` 严格映射为冻结的 `CatalogItem.sampleImageUrls`。该字段只供 Client Module 的资源卡片图片画廊使用，不进入 `CatalogContext`、composer 草稿、`generation-context.v1` 或生成提示词。

# Host-only Source adapter

Host-only Source 保留两个 operation：实例读取与 TemplateBundle 读取。InstanceSource 必须包含 `id`、`title`、`url`、`credential_type` 和 `authorization`；`authorization` 只进入 Host 进程内存。

Source v0.86.1 TemplateBundle 必须包含且由 Harness adapter 投影以下三个字段：

- `id`：模板 ID。
- `title`：模板标题。
- `workflow_json`：ComfyUI UI Workflow。

Harness adapter 不读取 `revision_number`、`workflow_sha256`、`config_revision`、`dimension_strategy` 或 `expected_output_node_ids_json`。新建 Generation Run 的 source snapshot 只保存模板 ID 和模板标题；Harness 不重写历史 Run 已保存的 source snapshot。

# 输出节点责任

`ComfyWorkflowCompiler` 读取目标 ComfyUI 实例实时 `/object_info`，从 API Workflow 中选择 `output_node: true` 且已满足必需输入的节点。compiler 从 API Workflow 删除未满足必需输入的输出节点；没有活动输出节点时返回 `WORKFLOW_COMPILE_FAILED`。

compiler 返回的 `activeOutputNodeIds` 是编译结果。Generation Runtime 把该集合保存到 `generation_runs.expected_output_node_ids_json`，并把该集合交给 Comfy transport 筛选 Jobs API 输出。该 SQLite 列不表示 Source TemplateBundle 字段，本合同升级不需要数据库迁移。

# 版本关系

本合同取代 v0.84.0 作为 Harness 当前 Source 消费合同。`docs/v0.1/source-contract-v0.84.0.md` 与 `config/source-contract-v0.84.0.json` 只记录历史版本，不能作为当前 Configuration Profile、Host adapter 或测试的输入。
