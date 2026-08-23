---
doc_id: source-contract-live-audit
title: NoobAI 源数据目录 v0.82.2 live contract 消费审计
status: complete
version: 2026-08-23
lifecycle: downstream-consumer-audit
---

# 审计范围

本审计只验证 `harness-comfyui` 后续 Ticket 能否消费源数据仓库当前已发布并正在运行的 CLI 与 HTTP contract。本审计没有修改 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV` 的代码、数据库、测试、版本材料或 GitHub Issue。

源数据仓库当前事实：

- checkout：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV`
- checkout state：detached HEAD at `v0.82.2`
- released tag：`v0.82.2` -> `621c35b071a4f23c1cd27485e1cca23faf88f7c9`
- package version：`0.82.2`
- live process：`node scripts/start-local-app.mjs --env-file=.env`
- live process cwd：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV`
- live service：`127.0.0.1:18093`
- source checkout 工作树状态：只有未跟踪 `.planning/` 与 `runtime/`，没有修改已发布代码

# 现场验证

## Discovery

以下请求均返回 HTTP 200，并且 CLI 退出码为 0：

```text
curl -fsS http://127.0.0.1:18093/internal/semantic
imagegen-semantic-query --port 18093 --discovery-json
curl -fsS http://127.0.0.1:18093/internal/comfyui-source
imagegen-comfyui-source-read --port 18093 --discovery-json
```

v0.82.2 的实际 discovery 形状如下：

- Catalog discovery 是 OpenAPI 3.1 对象，顶层字段为 `openapi`、`info`、`x-imagegen-media-origin`、`paths`、`components`。
- Source discovery 是统一分页响应，顶层字段为 `status`、`message`、`results`、`page`、`page_size`、`total_count`；`results[0]` 才是 OpenAPI 3.1 对象。
- 两个 discovery 的实际响应都没有顶层 `contract_id`、`contract_version` 或 `source_release_version` 字段。
- v0.82.2 的两个 CLI 对 discovery 和目标 2xx body 执行非空、严格 UTF-8、单个 JSON 值检查，然后把原始响应字节写到 stdout；CLI 不再校验目标成功响应的业务 Schema 或字段，也不再生成旧的 contract wrapper。

因此，源仓库版本材料中“发布 `imagegen-source-contract / 1`”与 live discovery 的可消费字段不是同一件事。后续 Harness 不能把版本材料中的身份字段当作 live CLI 已返回的字段。

## Catalog CLI

以下十个 operation 在端口 18093 都以搜索命令退出码 0 返回单个 JSON 响应；空结果也按成功处理：

| operation | path | live CLI |
|---|---|---:|
| `querySemanticBaseModelsForSkill` | `/internal/semantic/base-models` | PASS |
| `querySemanticGenerationModelsForSkill` | `/internal/semantic/generation-models` | PASS |
| `querySemanticLorasForSkill` | `/internal/semantic/loras` | PASS |
| `querySemanticWorksForSkill` | `/internal/semantic/works` | PASS |
| `querySemanticCharactersForSkill` | `/internal/semantic/characters` | PASS |
| `querySemanticStylesForSkill` | `/internal/semantic/styles` | PASS |
| `querySemanticPromptTermsForSkill` | `/internal/semantic/prompt-terms` | PASS |
| `querySemanticArtistPromptStringsForSkill` | `/internal/semantic/artist-prompt-strings` | PASS，当前返回空结果 |
| `querySemanticComfyuiInstancesForSkill` | `/internal/semantic/comfyui-instances` | PASS |
| `querySemanticComfyuiTemplatesForSkill` | `/internal/semantic/comfyui-templates` | PASS |

Catalog 模板查询已经不再出现上一轮 v0.82.1 的 CLI 失败。模板搜索返回真实记录，不能再把“模板 operation 不可用”作为当前 blocker。

## Host-only Source CLI

以下命令在 v0.82.2、端口 18093 均退出码 0：

```text
imagegen-comfyui-source-read --port 18093 instance --id 1
imagegen-comfyui-source-read --port 18093 instance --id 2
imagegen-comfyui-source-read --port 18093 template-bundle --id 1
imagegen-comfyui-source-read --port 18093 template-bundle --id 2
imagegen-comfyui-source-read --port 18093 template-bundle --id 37
```

实例与模板响应均是统一 Source 分页 envelope。模板 `results[0]` 当前包含：`id`、`title`、`revision_number`、`workflow_sha256`、`workflow_json`、`config_revision`、`dimension_strategy`、`parameters_json`、`bindings_json`、`expected_output_node_ids_json`。当前三个真实模板的 `expected_output_node_ids_json` 都是 `null`；v0.82.2 CLI 不会替调用方校验或补齐这个字段。

# 对 Harness 后续 Ticket 的结论

## 可以解除的旧阻塞

以下旧结论必须删除：

- “源仓库尚未发布受支持版本”；
- “Catalog 模板 operation CLI 失败”；
- “Host-only Source 的模板 bundle 不存在”；
- “后续 Ticket 需要等待 v0.82.1 或重新发布源仓库”。

当前源仓库确实已经发布 v0.82.2，十个 Catalog operation、实例读取和真实模板 bundle 都能从 18093 读取。

## 仍然存在的消费合同阻塞

当前 Harness 规范不能直接消费 v0.82.2，原因不是数据服务不可用，而是调用方规范仍写着旧合同：

1. `draft-tickets.md`、PRD 03 和 PRD 04 要求 discovery stdout 顶层恰好包含 `contract_id`、`contract_version`、`source_release_version` 与 OpenAPI 对象；v0.82.2 live CLI 没有这些字段。
2. 当前 Ticket 要求 CLI 负责成功响应 Schema 校验；v0.82.2 CLI 明确只检查 JSON 传输形态，业务 Schema 校验必须由 Harness adapter 完成。
3. 当前 Source PRD 把成功响应写成直接 `InstanceSource`/`TemplateBundle`；v0.82.2 实际成功响应是 `status/results/page/page_size/total_count` envelope，Harness 必须按 v0.82.2 OpenAPI 解包并对 `results` 做业务字段校验。
4. 当前生成 PRD 要求 `expected_output_node_ids` 已验证；v0.82.2 三个真实模板的 `expected_output_node_ids_json` 为 `null`，因此模板生成入口不能把它当成已满足的完整运行合同。

用户已选择 B：正式接受 v0.82.2 raw-passthrough contract。Harness 规范现在冻结 v0.82.2 的 discovery 形状、Catalog/Source envelope schema、`results[0]` 映射和 Harness-owned source pin；`expected_output_node_ids_json: null` 时模板生成入口失败关闭。父 Issue、PRD、Ticket 草稿和对应合同文件必须引用同一规则；源数据仓库不需要为本次消费规范再修改代码。

## 需要同步修改的 Ticket 消费边界

- Ticket 03（GitHub #4）：三个 Catalog operation 的数据源可用；删除“源版本未发布”和“模板 Catalog 失败”阻塞。保留 discovery/response 合同阻塞，直到父 Issue 明确选择 A 或 B；若选择 B，Ticket 03 只通过项目 Catalog adapter 接收 v0.82.2 envelope，不直连 HTTP。
- Ticket 04（GitHub #5）：实例读取和真实 TemplateBundle 读取均可调用；删除“Source operation 未发布”阻塞。保留 `expected_output_node_ids_json` 为 `null` 的生成前置阻塞，并要求 `results` 单项、字段闭合和空结果错误映射。
- Ticket 05（GitHub #6）：十个 Catalog operation 已全部有 live search 证据；删除“十项 operation 未实现”阻塞。保留统一 discovery identity/response schema 决策阻塞；不能部分注册九个或把 raw envelope 当成旧 `items` 结构。
- Ticket 12（GitHub #13）：Prompt、LoRA、角色、作品、画风、术语和画师字符串数据可由 Catalog CLI 读取；删除“等待源仓库发布”阻塞。仍依赖 Ticket 05 的统一 registry，并且模板 ContextRef 必须经过 Ticket 04 对 `expected_output_node_ids_json` 的闭合判断。
- Ticket 13（GitHub #14）：release-smoke 必须记录 v0.82.2 tag、live discovery 实际 shape、十个 Catalog operation、两个 Source operation 和模板字段校验；不能继续验收旧 wrapper，也不能把 CLI 退出码 0 自动等同于业务 Schema PASS。

# 最终判定

`v0.82.2` 已满足“源数据仓库有已发布版本、服务正在 18093 运行、十个 Catalog operation 可查询、实例和模板 Source CLI 可读取”的数据可用性要求。

`v0.82.2` 尚不能直接满足当前 Harness PRD 写死的旧 discovery wrapper、旧 CLI Schema 校验和非空 `expected_output_node_ids` 要求。因此当前后续 Ticket 的正确状态是：源数据可用；消费合同未决；不能解除全部 blocker，也不能继续使用 v0.82.1 的模板失败结论。
