---
status: superseded
---

# Source contract v0.84.0 and Catalog sample images

本 ADR 已由 [ADR 0015](0015-independent-data-source-service.md) 取代。以下内容只记录 Harness 曾经消费 Source v0.84.0 时采用的决定，不是当前运行时、Configuration Profile 或测试的输入。

## Context

Source v0.84.0 已经为八个可插入 Catalog operation 提供必填 `sample_image_urls`。Harness 需要在“插入上下文”弹窗中显示封面与样例图片，同时保持 `CatalogContext` 和 composer 草稿合同不变。

## Decision

Harness 的 `production` Configuration Profile 固定使用 `source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.84.0"`。`config/source-contract-v0.84.0.json` 是当前唯一结构化 Source 消费合同。该决定取代 ADR 0009 中关于当前版本为 v0.82.2 的决定；ADR 0009 继续记录历史版本边界。

Source 负责从现有 `item_images` 生成 `sample_image_urls`、排除封面 URL、去除重复 URL并保持 `item_images.sort_order, item_images.id` 顺序。Harness Host 负责把该字段严格映射为 `CatalogItem.sampleImageUrls`。Harness Client 只把该数组用于图片画廊。

Harness 不修改 Source CLI、Source 数据库或 Source HTTP handler。Harness 不把 `coverUrl` 或 `sampleImageUrls` 写入 `CatalogContext`、composer 草稿、`generation-context.v1` 或生成提示词。

资源卡片使用同级的封面预览按钮和记录选择按钮。封面预览按钮只打开图片画廊；记录选择按钮继续维护待确认选择集合。

## Consequences

- 八个可插入 Catalog operation 缺少 `sample_image_urls` 或返回非法图片 URL 时，Harness 返回 `CATALOG_PROTOCOL_ERROR`。
- Base model 和 ComfyUI instance 结果不需要 `sample_image_urls`。
- 图片画廊可以显示 Source 排序后的样例图，而最终 Message Context 保持原合同。
- Harness v0.30.7 的合同测试固定 Source v0.84.0 的版本、八个 operation 和展示字段映射。
