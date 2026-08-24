---
status: accepted
---

# Source contract version gate

本仓库正式消费源数据仓库 `v0.82.2` 的 raw-passthrough envelope。唯一结构化合同是 `config/source-contract-v0.82.2.json`。

`production` Configuration Profile 固定 `source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.82.2"`。这两个值是 Harness-owned pin；v0.82.2 的 Catalog discovery、Source discovery 和目标响应不要求返回同名字段。Host 插件必须分别通过 `imagegen-semantic-query --discovery-json` 与 `imagegen-comfyui-source-read --discovery-json` 读取 live discovery，并按结构化合同校验 discovery shape、OpenAPI、operation metadata、统一分页 envelope 和业务字段。

Catalog discovery 必须是 OpenAPI 3.1 对象；Source discovery 必须是 `status/message/results/page/page_size/total_count` 成功 envelope，OpenAPI 位于 `results[0]`。两个 CLI 只验证非空、严格 UTF-8 和单个 JSON 值并原始透传，业务 Schema 校验由 Harness adapter 完成。

任一 pin、discovery shape、operation metadata、envelope、响应字段或 `expected_output_node_ids_json` 校验失败时，adapter 停止注册或读取对应数据源能力，并返回明确的 `SOURCE_CONTRACT_UNSUPPORTED`、`SOURCE_PROTOCOL_ERROR` 或 `SOURCE_TEMPLATE_UNAVAILABLE`。adapter 不猜测字段含义、不回退旧 wrapper、不从 Workflow 推导缺失输出节点，也不直接请求 HTTP。
