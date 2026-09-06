---
doc_id: harness-source-contract-v0.82.2
title: Harness 消费源数据仓库 v0.82.2 envelope 合同历史记录
status: historical
version: v0.82.2
lifecycle: historical-record
---

# 历史记录用途

本文记录 Harness 曾经消费源数据仓库 v0.82.2 时使用的接口和执行规则。本文提到的 `config/source-contract-v0.82.2.json` 已经删除；当前 Harness-ComfyUI 的运行时代码和测试均不读取本文或该 JSON 文件。当前数据源服务访问方式由 [`ADR 0015`](../adr/0015-independent-data-source-service.md) 定义。

Harness 只消费以下已发布源数据版本：

- source checkout tag：`v0.82.2`
- source release version：`0.82.2`
- Catalog CLI：`imagegen-semantic-query`
- Host-only Source CLI：`imagegen-comfyui-source-read`
- source service：调用方通过 `--port` 指定的本机回环服务

`source.contractId: "imagegen-source-contract"` 与 `source.sourceReleaseVersion: "0.82.2"` 是 `production` Configuration Profile 的固定 pin。它们不是 v0.82.2 live discovery 或目标响应中必须出现的字段，Harness 不从响应 body 猜测或补读这两个值。

# CLI 传输合同

两个 CLI 都采用 v0.82.2 raw-passthrough 行为：

1. CLI 对 discovery 或目标 2xx body 只验证非空、严格 UTF-8 和单个 JSON 值。
2. CLI 成功时以退出码 `0` 将目标响应原始字节写入 stdout，不添加 envelope、字段或换行。
3. CLI 不验证目标成功响应的业务 Schema；Harness adapter 必须在读取 stdout 后验证结构化 envelope、operation 字段和业务字段。
4. 非零退出、空 stdout、多 JSON 值、非法 UTF-8、连接、超时和取消由 CLI 退出码表达；Harness adapter 把这些情况映射为 `SOURCE_PROTOCOL_ERROR`，但不得把 CLI stderr、路径、数据库位置或凭据写入 Tool Result、日志或浏览器。
5. Harness 不直接请求 HTTP，不调用源仓库内部模块，不执行源仓库脚本，也不根据原型 fixture 补齐响应。

v0.82.2 合同生效期间，Harness adapter 使用生产配置中的可执行文件路径启动 Catalog CLI，将 Source service 端口作为 `--port` 参数，并根据结构化 operation manifest 生成其余调用参数。Harness adapter 只使用 `instance --id` 与 `template-bundle --id` 两种命令调用 Source CLI。

# Discovery 合同

## Catalog discovery

`imagegen-semantic-query --port <port> --discovery-json` 的 stdout 必须是一个 OpenAPI `3.1.0` 对象，顶层字段固定为：

```text
openapi
info
x-imagegen-media-origin
paths
components
```

该对象不需要也不得包含顶层 `contract_id`、`contract_version` 或 `source_release_version`。当时的 Harness adapter 使用 `config/source-contract-v0.82.2.json` 的十项 operation manifest 核对 `x-harness-tool-name`、`operationId`、path、HTTP method、request schema 和描述；任一项缺失或漂移时返回 `SOURCE_CONTRACT_UNSUPPORTED`，不得部分注册 Catalog Tool。

## Host-only Source discovery

`imagegen-comfyui-source-read --port <port> --discovery-json` 的 stdout 必须是成功 Source envelope：

```json
{
  "status": "ok",
  "message": null,
  "results": [{"openapi": "3.1.0", "info": {}, "paths": {}, "components": {}}],
  "page": 1,
  "page_size": 1,
  "total_count": 1
}
```

Harness adapter 只读取 `results[0]` 作为 Source OpenAPI 文档，并核对两个 Host-only operation。顶层 `results` 不是 TemplateBundle 或 InstanceSource；任何 Source 成功响应都必须先通过 envelope 校验，再读取 `results`。

# 成功与错误 envelope

Catalog 与 Host-only Source 的目标成功响应都必须满足：

```json
{
  "status": "ok",
  "message": null,
  "results": [],
  "page": 1,
  "page_size": 20,
  "total_count": 0
}
```

`results` 的记录字段由对应 OpenAPI operation 声明。Harness adapter 不把数据库记录原样暴露给 Client，而是按 operation manifest 投影为严格的 Catalog item 或 Host-only snapshot。Catalog `resolve` 必须返回一条记录且 `page=1`、`page_size=1`、`total_count=1`。

错误响应必须满足：`status: "error"`、非空 `message`、空 `results`、`page: 1`、`page_size: 0`、`total_count: 0`。HTTP 非 2xx 由 CLI 以退出码 `7` 交给 adapter；adapter 读取响应 envelope 的稳定错误语义后映射项目错误码。

# Catalog adapter 规则

Catalog adapter 必须：

1. 先校验 Catalog discovery，再注册全部十个 Catalog Tool。
2. 将成功响应的 `results` 映射为内部 `items`；不能要求源 body 提供 `items`、`kind`、`source_release_version` 或 `result_contract_id`。
3. 从 `production` Configuration Profile 的 `source.sourceReleaseVersion` 写入内部 `source_release_version`，从本地 operation manifest 写入 `kind` 与 `result_contract_id`。
4. 对每个 operation 按 live OpenAPI 业务 Schema校验字段；Schema 不匹配、结果记录缺少必需字段或 `resolve` 不是单项时返回 `SOURCE_PROTOCOL_ERROR`。
5. 保留合法空集合；空集合不是错误，也不能用 prototype fixture 补齐。
6. 不把 ComfyUI Instance 转为 `ContextRef`；Instance 只提供 Execution Route 安全投影。

当时的 Harness adapter 从 `config/source-contract-v0.82.2.json` 读取十个 Catalog operation 的 Tool 名、path、operationId 和允许筛选字段，不从 Markdown 解析。

# Host-only Source adapter 规则

## InstanceSource

`results` 必须恰好包含一条记录，并且记录至少包含 `id`、`title`、`url`、`credential_type` 和 `authorization`。`authorization` 只进入 Host 进程内存；持久快照只保存 `id`、`title` 和 `credential_type`，不得写入 Client、Session、Tool Result、日志或本地运行文件。

## TemplateBundle

`results` 必须恰好包含一条记录，并按以下字段映射：

| v0.82.2 Source record | Harness Host snapshot |
|---|---|
| `id` | `template_id` |
| `title` | `title` |
| `revision_number` | `workflow_revision` |
| `workflow_sha256` | `workflow_sha256` |
| `workflow_json` | `source_workflow` |
| `config_revision` | `runtime_config_revision` |
| `dimension_strategy` | `dimension_strategy` |
| `parameters_json` | `parameters` |
| `bindings_json` | `bindings` |
| `expected_output_node_ids_json` | `expected_output_node_ids` |

`expected_output_node_ids_json` 可以是非空数组或 `null`。非空数组限制本次观察的输出节点；`null` 表示不提供输出节点过滤器，Harness 编译 Actual Workflow 时依据目标 ComfyUI 实例 `/object_info` 中 `output_node: true` 的活动节点生成输出节点集合。空数组、非法 JSON 或字段缺失时，adapter 返回 `SOURCE_PROTOCOL_ERROR`。Harness 不按节点名称猜测输出节点，也不补默认节点。

当前模板结果没有独立 `source_revision` 字段。Harness 快照使用 Configuration Profile pin `source_release_version: "0.82.2"` 作为来源发布标识，不把它伪装成 Workflow revision 或 runtime config revision。

# Ticket 状态门禁

- Ticket 03、05、12 可以使用 v0.82.2 Catalog data；它们必须先通过统一 discovery、envelope 和 adapter schema gate。
- Ticket 04 可以读取 InstanceSource 和 TemplateBundle envelope；`expected_output_node_ids_json` 为 `null` 时使用目标 ComfyUI 实例节点定义识别活动输出节点。
- Ticket 06–12 只能消费 Ticket 03–05 已规范化的 Harness adapter 结果，不得直接运行 CLI 或读取 Source envelope。
- Ticket 13 必须在当前开发测试环境中记录同一 v0.82.2 pin、discovery shape、十个 Catalog operation、两个 Source operation、envelope 校验和模板输出节点校验；CLI 退出码 `0` 单独不能作为业务 Schema PASS。

所有旧的“discovery 顶层必须包含 `contract_id`/`contract_version`/`source_release_version`”“CLI 负责业务响应 Schema 校验”“Source 直接返回 `TemplateBundle`”条款均由本合同取代。
