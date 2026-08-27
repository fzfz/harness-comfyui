---
doc_id: harness-source-contract-v0.84.0
title: Harness 消费源数据仓库 v0.84.0 envelope 合同
status: accepted
version: v0.84.0
lifecycle: consumer-contract
structured_source: config/source-contract-v0.84.0.json
---

# 合同所有权

`config/source-contract-v0.84.0.json` 是 Harness 对源数据仓库 v0.84.0 的唯一结构化消费合同。本文解释该结构化合同的运行规则，不重复定义 operation 清单或字段映射。

Harness 固定消费以下已发布产物：

- Source checkout tag：`v0.84.0`
- Source release version：`0.84.0`
- Catalog CLI：`imagegen-semantic-query`
- Host-only Source CLI：`imagegen-comfyui-source-read`
- Source service：CLI `--port` 参数指定的本机回环服务

`source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.84.0"` 由 `production` Configuration Profile 固定。Harness 不从 live discovery 或目标响应推断这两个值。

# CLI 与 envelope

两个 CLI 继续采用 raw-passthrough 行为：

1. CLI 对 discovery 或目标 2xx body 只验证非空、严格 UTF-8 和单个 JSON 值。
2. CLI 成功时使用退出码 `0` 将目标响应原始字节写入 stdout。
3. Harness adapter 负责验证 discovery、分页 envelope、operation 字段和业务字段。
4. Harness adapter 把非零退出、空 stdout、多 JSON 值、非法 UTF-8、连接失败、超时和取消映射为稳定项目错误；Tool Result、日志和浏览器文案不得暴露 CLI stderr、可执行文件路径、数据库路径或凭据。

Catalog discovery 必须是结构化合同声明的 OpenAPI 3.1 对象。Host-only Source discovery 必须是 `status`、`message`、`results`、`page`、`page_size`、`total_count` 成功 envelope，OpenAPI 文档位于 `results[0]`。

Catalog 与 Host-only Source 的目标成功响应都必须先通过统一成功 envelope 校验。Catalog `resolve` 必须返回一条记录，并且 `page`、`page_size` 与 `total_count` 都等于 `1`。

# Catalog 图片字段

以下八个“插入上下文”Catalog operation 的每条成功结果必须包含 `sample_image_urls`：

1. `querySemanticGenerationModelsForSkill`
2. `querySemanticLorasForSkill`
3. `querySemanticWorksForSkill`
4. `querySemanticCharactersForSkill`
5. `querySemanticStylesForSkill`
6. `querySemanticPromptTermsForSkill`
7. `querySemanticArtistPromptStringsForSkill`
8. `querySemanticComfyuiTemplatesForSkill`

`querySemanticBaseModelsForSkill` 与 `querySemanticComfyuiInstancesForSkill` 不提供该展示字段。

Source 按 `item_images.sort_order, item_images.id` 的顺序生成 `sample_image_urls`。该数组必须存在；没有其他图片时返回空数组。该数组不得包含 `cover_url`，也不得包含重复 URL。Source v0.84.0 使用现有 `item_images` 提供样例图片，不需要数据库迁移。

Harness Host 把 `sample_image_urls` 映射为冻结的 `CatalogItem.sampleImageUrls`。Harness Host 对每个 URL 复用 `coverUrl` 的本机回环 HTTP、长度和 URL 解析规则，并拒绝缺失字段、非数组、重复 URL 或重复封面 URL。

`CatalogItem.sampleImageUrls` 只供 Client Module 的资源卡片图片画廊使用。`CatalogContext`、composer 草稿、`generation-context.v1` 与生成提示词不得包含 `coverUrl` 或 `sampleImageUrls`。

# Host-only Source adapter

InstanceSource 与 TemplateBundle 继续使用 v0.84.0 的统一 envelope 和既有字段映射。`authorization` 只进入 Host 进程内存。`expected_output_node_ids_json` 可以是非空数组或 `null`；`null` 表示 Workflow compiler 使用目标 ComfyUI 实例 `/object_info` 中 `output_node: true` 的活动节点。

# 版本关系

本合同取代 v0.82.2 作为 Harness 当前 Source 消费合同。`docs/v0.1/source-contract-v0.82.2.md` 与 `config/source-contract-v0.82.2.json` 只记录历史版本，不能作为当前 Configuration Profile、Host adapter 或测试的输入。
