---
doc_id: harness-source-data-catalog-implementation
title: 源数据目录 Catalog Tool 定义历史实施记录
status: completed
version: v0.1
lifecycle: historical-record
---

# 源数据目录 Catalog Tool 定义历史实施记录

本文档记录 Source v0.84.0 发布前的责任边界与实施来源。对应 Source 工作已经完成并部署；当前 Harness 实施不得执行本文档中的历史 Source 修改、测试、CI、发布或部署步骤。

> 本文档只记录 Source v0.84.0 发布前的历史实施。当前 Harness-ComfyUI 使用插件内置客户端请求设置页指定的数据源服务；关于 Harness-ComfyUI 通过插件内置客户端连接数据源服务的当前架构决定，见 [`ADR 0015`](../adr/0015-independent-data-source-service.md)。本文不作为当前 Configuration Profile、Host adapter、Skill 或测试的输入。

本文档依据 Source 历史 revision `6bc3fc6a027eecf45ccf86dd681e30621c4bc591` 编写。Source v0.84.0 的最终发布接口记录在同目录的 `source-contract-v0.84.0.md`；`source-contract-v0.84.0.md` 和 `config/source-contract-v0.84.0.json` 均为历史产物，不是当前 Harness-ComfyUI 的实施输入。

## 1. 两个仓库的责任边界

| 仓库 | 负责内容 | 不负责内容 |
|---|---|---|
| `NoobAI-XL-FZ-PROD-ENV` | 目录数据库读取、语义检索、10 个只读 Catalog HTTP operation、OpenAPI discovery、结构化 `imagegen-semantic-query` CLI、源数据仓库自己的契约测试和版本发布 | Harness `Tool` 注册、Skill 加载、会话消息、三列 UI、上下文弹窗、生成 Run |
| `harness-comfyui` | 通过 Harness 插件调用 `ctx.tools.register()` 注册项目 Tool；把已发布的 Catalog CLI 作为子进程调用；把 CLI JSON 映射为 Harness Tool Result；Skill 只调用 Harness Tool；UI 消费自己的后端快照 | 源数据目录 Schema、源数据 HTTP handler、源数据 CLI、源数据仓库的发布提交和标签 |

Harness Tool 的实际注册仍由 `harness-comfyui` 插件完成。源数据仓库只能发布 Tool 所需的 OpenAPI 元数据、只读 handler、CLI 和测试证据；源数据仓库不得实现或假设 `ctx.tools.register()`。

## 2. 源数据仓库开始实施前必须遵守的治理文件

源数据仓库 `AGENTS.md` 要求开发、测试、部署或运行任务先阅读 `docs/README.md`、`docs/global/README.md`，涉及版本时再阅读 `docs/versions/<版本>/变动范围.md`。源数据仓库的执行者必须将本项工作登记为源数据仓库自己的 Issue，并在源数据仓库的版本目录中记录变动范围和验收结果。

源数据仓库 revision `6bc3fc6a027eecf45ccf86dd681e30621c4bc591` 的发布规范事实包括：

- `package.json` 固定 Node.js `>=22.19.0`，依赖版本写在 `package.json`；不能在本项工作中无计划安装依赖。
- `.github/workflows/release.yml` 使用 Node.js `22.19.0`、锁定依赖安装、空白检查、凭据扫描、契约测试、单元测试、集成测试和端到端测试。
- `docs/versions/v0.71.8/quality/release-acceptance.md` 要求版本号、专项回归、完整质量门、测试边界、覆盖率、空白检查、正式材料链接和无迁移检查，并规定发布只提交代码、推送 `main` 和推送带注释标签，不修改生产目录、生产进程或生产数据。
- 源数据仓库 `docs/agents/imagegen-semantic-query.md` 是现有 CLI 的 Agent 使用说明和唯一静态说明。CLI 接口改变时，源数据仓库必须同步更新该文档和对应版本材料。

以上文件是源数据仓库的治理依据，不是 `harness-comfyui` 的执行脚本。本文档不授权当前仓库代替源数据仓库执行发布。

## 3. 当前源数据实现与本次变更原因

当前 OpenAPI 在 `schema/api/openapi.yaml:184-257` 声明 discovery 和 4 个内部 Skill operation：`works`、`characters`、`styles`、`prompt-terms`。当前 4 个 operation 使用 `x-noobai-pi-tool-name`，请求分别引用 `InternalSemanticQueryRequest` 或 `InternalSemanticStyleQueryRequest`；这些请求在 `schema/api/openapi.yaml:406-407` 使用 `queries[]` 和 `limit`，Style operation 还声明 `base_model_name`。

当前实现的 handler manifest 在 `app/http/semantic-handler-routes.mjs:7-12` 只登记上述 4 个 operation；`app/http/catalog-http.mjs:89-97` 只映射上述 4 个 Skill 查询方法。当前 CLI 在 `scripts/imagegen-semantic-query.mjs:73-110` 解析 `--port`、`--path`、`--timeout-ms`，在 `:126-180` 通过回环 HTTP discovery，在 `:629-710` 构造并发送动态查询。

本次变更的目标是让源数据仓库发布一组稳定、只读、可被 Harness 项目 Tool 消费的 Catalog operation。Harness 不再依赖源数据仓库的旧 Pi Tool 名称、`queries[]/groups[]` 聚合请求或隐式宿主注入字段。

## 4. OpenAPI 与 discovery 实施要求

### 4.1 Tool 元数据

源数据仓库执行者必须在每个新的内部 Catalog operation 上增加统一的 Tool 元数据扩展。扩展名称和字段必须在源数据仓库 OpenAPI 解析器、discovery 输出、契约测试和版本文档中保持唯一来源；建议采用以下结构，并在源数据仓库 Issue 中冻结最终名称后再实现：

```yaml
x-harness-tool-name: query_semantic_base_models
```

每个 Catalog operation 必须同时具备：

- 唯一 `operationId`；
- 唯一 `x-harness-tool-name`；
- 非空、面向 Skill 调用者说明用途的 `summary` 和 `description`；
- `POST`、`application/json`、关闭未知字段的 request schema；
- 关闭未知字段的 success/error response schema；
- request 和 response 每个可见字段的非空描述与可验证 example；
- discovery 输出中可重复读取的 method、path、operationId、Tool name、描述、请求 Schema、成功 Schema、错误 Schema。

源数据仓库执行者必须明确旧 `x-noobai-pi-tool-name` 和 `x-noobai-callable-projection` 的迁移方式。新的 Harness 消费契约不得把旧扩展当成唯一来源，也不得继续依赖 Style 的隐式 `base_model_name` 注入。

### 4.2 10 个 Catalog operation

源数据仓库必须为下表实现 10 个只读 operation。表中的 path、operationId、Tool name 和允许过滤字段构成跨仓库接口；字段的最终 JSON Schema 仍以源数据仓库发布的 OpenAPI 为唯一来源。

| 数据类型 | POST path | operationId | Harness Tool name | 允许过滤字段 |
|---|---|---|---|---|
| 底模 | `/internal/semantic/base-models` | `querySemanticBaseModelsForSkill` | `query_semantic_base_models` | 无 |
| 生图模型 | `/internal/semantic/generation-models` | `querySemanticGenerationModelsForSkill` | `query_semantic_generation_models` | `base_model_id` |
| LoRA | `/internal/semantic/loras` | `querySemanticLorasForSkill` | `query_semantic_loras` | `base_model_id` |
| 作品 | `/internal/semantic/works` | `querySemanticWorksForSkill` | `query_semantic_works` | 无 |
| 角色 | `/internal/semantic/characters` | `querySemanticCharactersForSkill` | `query_semantic_characters` | `work_id` |
| 画风 | `/internal/semantic/styles` | `querySemanticStylesForSkill` | `query_semantic_styles` | `base_model_id` |
| Prompt 术语 | `/internal/semantic/prompt-terms` | `querySemanticPromptTermsForSkill` | `query_semantic_prompt_terms` | 无 |
| 画师 Prompt 字符串 | `/internal/semantic/artist-prompt-strings` | `querySemanticArtistPromptStringsForSkill` | `query_semantic_artist_prompt_strings` | `base_model_id` |
| ComfyUI 实例 | `/internal/semantic/comfyui-instances` | `querySemanticComfyuiInstancesForSkill` | `query_semantic_comfyui_instances` | 无 |
| ComfyUI 模板 | `/internal/semantic/comfyui-templates` | `querySemanticComfyuiTemplatesForSkill` | `query_semantic_comfyui_templates` | `base_model_id` |

源数据仓库执行者必须同步更新以下独立来源，使 10 个 operation 的数量和身份一致：

1. `schema/api/openapi.yaml` 的 path、operation、components 和 response。
2. `app/http/semantic-handler-routes.mjs` 的实际 handler manifest。
3. `app/http/catalog-http.mjs` 的 operation 到只读 service 方法映射和字段投影。
4. OpenAPI runtime validator 生成的 semantic operation metadata。
5. discovery 输出和 discovery contract tests。

如果某个 operation 尚无实际只读 service 方法，源数据仓库执行者必须把该 operation 标记为未实现并阻止发布；不能只在 OpenAPI 中声明它来让 Harness 看见一个不存在的 Tool。

### 4.3 统一请求契约

每个 operation 使用同一组封闭请求形状：

```json
{"mode":"search","query":"watercolor","page":1,"page_size":20}
```

或：

```json
{"mode":"resolve","id":123}
```

具体 operation 只允许表中列出的过滤字段。`mode` 为 `search` 时，`query` 可以省略或按 Schema 规则为空；`mode` 为 `resolve` 时只允许 `id` 和 operation 允许的固定过滤字段。源数据仓库执行者必须在 Schema 中明确 required、enum、minimum、maximum、minLength、maxLength 和 `additionalProperties: false`。

一个 Tool 调用只表达一个查询目标。源数据仓库新的 request schema 不得包含 `queries[]`、`groups[]`、operationId、请求或传输标识字段、workspace/session/call identity 或隐式宿主字段。

### 4.4 统一成功和错误响应

Search 成功响应必须返回固定的分页对象：`items`、`page`、`page_size`、`total_count`。Resolve 成功响应必须返回一个且仅一个 `items` 记录，并将 `page`、`page_size`、`total_count` 固定为 `1`。所有返回记录必须只包含 Harness Skill 需要的安全目录字段：标识、名称、别名、Prompt/说明、状态或能力摘要；不得返回本机绝对路径、数据库文件路径、凭据、内部 SQL、向量分数或运行时秘密。

错误响应必须使用源数据仓库已有稳定错误目录并为 discovery 声明 HTTP status 和 JSON Schema。CLI/Tool 层只需要稳定错误 code 和面向调用者的 message；错误中不得要求调用者解析 stderr 路径、HTTP transport correlation 或内部堆栈。

## 5. 只读 handler 与服务层实施要求

源数据仓库执行者必须在现有 `app/http/catalog-http.mjs` 分派链和对应 catalog service 中增加 10 个 operation 的方法映射。handler 必须：

- 只读取源数据仓库的目录数据库和已登记的只读语义索引；
- 对 `search` 和 `resolve` 分别执行严格 Schema 校验；
- 对 `base_model_id`、`work_id`、`id` 执行整数、存在性和所属关系校验；
- 对每个数据类型执行字段投影，避免把管理页完整记录或本机文件路径泄露给 Skill；
- 将空结果作为合法成功分页返回；
- 将未知 operation、未知字段、重复字段、无效分页和不匹配的 resolve 记录转换为稳定的源数据错误；
- 在 handler manifest 中登记后，才允许 discovery 暴露 operation。

ComfyUI 实例是执行路由数据，不是 Message Context 的可插入 Catalog 记录；实例 operation 只能返回安全名称、健康状态和能力摘要。ComfyUI 模板 operation 只能返回模板标识、名称、封面引用、底模关系和安全参数摘要，不得返回完整 Workflow JSON 或内部节点绑定给 Catalog Tool。

## 6. 结构化 CLI 实施要求

源数据仓库执行者必须在 `scripts/imagegen-semantic-query.mjs` 中增加面向 Harness 的结构化调用模式，同时保留源数据仓库现有 CLI 的治理、回环限制、超时、退出码和无重定向原则。Harness 调用时使用已安装的 CLI 路径；Harness 不传入可执行路径，也不让 Skill 决定 CLI 路径。

结构化模式必须满足：

```text
imagegen-semantic-query --path <manifest-path> --mode search [--query <text>] [--page <n>] [--page_size <n>] [allowed filter flags]
imagegen-semantic-query --path <manifest-path> --mode resolve --id <n> [allowed filter flags]
```

其中：

- `<manifest-path>` 由源数据仓库安装的 CLI 固定解析为自身发布的 OpenAPI/discovery manifest；调用者不能把任意文件路径或 URL 注入 CLI。
- CLI 必须根据 manifest 校验 operation、mode、参数类型、必填字段、分页范围和允许过滤字段。
- CLI 必须向 stdout 写一个 JSON 值和一个末尾换行；成功时 stderr 为空、退出码为 `0`。
- 非零源服务、空 stdout、多 JSON 值、JSON Schema 不匹配、operation/path 不匹配、未知字段或取消必须使用文档化的非零退出码，并且 stdout 为空。
- CLI 必须把父进程取消信号传给 HTTP 请求；不能在取消后继续修改源数据。
- 输出 JSON 不得附加日志、颜色、进度、请求 ID、绝对路径或内部错误堆栈。

CLI 的参数帮助、退出码、安装路径、Node.js 版本和发布方式必须同步写入 `docs/agents/imagegen-semantic-query.md` 及本次源数据版本的发布验收文档。Harness 只消费 CLI 的 stdout JSON、stderr 是否为空和退出码，不解析旧 `queries[]/groups[]` 协议。

## 7. 源数据仓库必须新增或修订的测试

源数据仓库执行者必须在源数据仓库自己的测试目录增加测试，不得把这些测试放进 `harness-comfyui` Issue：

| 测试层 | 必须证明的事实 | 现有可衔接位置 |
|---|---|---|
| OpenAPI contract | 10 个 operation 的 path、method、operationId、Tool name、描述、封闭 request/response schema、错误 schema 唯一且完整 | `tests/contract/anima-prompt-builder-openapi.test.mjs`、`tests/contract/authoritative-contracts.test.mjs` |
| Handler manifest | OpenAPI 声明与 `app/http/semantic-handler-routes.mjs` 实际 route 一一对应；缺 route 或多 route 都失败 | `tests/unit/issue-177-discovery.test.mjs`、`tests/integration/issue-177-semantic-discovery-startup.test.mjs` |
| Read-only service | 每种数据类型的 search/resolve、过滤字段、空结果、无效 ID、越权关联和字段投影 | `tests/unit/issue-177-semantic-contract.test.mjs`、`tests/unit/issue-212-style-semantic.test.mjs` 及新的 Catalog 专项测试 |
| Discovery | discovery 只暴露已实现 operation；Schema、example、描述和 operation 元数据可被 CLI 严格读取 | `tests/unit/issue-177-discovery.test.mjs`、`tests/unit/issue-182-semantic-cli-help.test.mjs` |
| CLI | search/resolve 参数编码、分页、过滤、空结果、非法输入、空 stdout、错误退出码、取消和不输出内部字段 | `tests/unit/issue-179-semantic-cli-query.test.mjs`、`tests/unit/issue-183-semantic-cli-errors.test.mjs`、`tests/unit/issue-194-semantic-cli-compact-help.test.mjs` |
| Agent guide | CLI 文档与实际 help、退出码、安装路径和版本行为一致 | `tests/unit/issue-184-semantic-cli-agent-guide.test.mjs` |
| Release acceptance | 新版本的契约、完整测试、静态边界、版本号、文档链接和无生产修改条件 | `tests/contract/issue-215-release-acceptance.test.mjs`、`tests/integration/issue-215-release-acceptance.test.mjs`、`docs/versions/<new-version>/quality/release-acceptance.md` |

测试必须覆盖以下失败分支：OpenAPI 只声明未实现 handler、重复 Tool name、未知请求字段、`search` 缺少合法参数、`resolve` 缺少或找不到 ID、过滤字段不属于当前 operation、源服务返回非 JSON、stdout 为空、返回多值 JSON、成功响应违反 Schema、错误 status 未声明、取消信号未终止请求。

## 8. 源数据仓库版本发布实施顺序

源数据仓库执行者必须按以下顺序在源数据仓库自己的 Issue 中实施：

1. 阅读源数据仓库 `AGENTS.md`、`docs/README.md`、`docs/global/README.md`、当前版本 `变动范围.md`、`docs/agents/imagegen-semantic-query.md` 和当前 release acceptance；记录基线 revision。
2. 在源数据仓库的版本计划中冻结 10 个 operation 的 OpenAPI metadata、request/response schema、错误目录、handler manifest 和 CLI 输出协议。
3. 先编写失败的 OpenAPI、discovery、handler、CLI contract tests，再实现源数据代码；不要先修改 Harness 仓库来掩盖源数据缺口。
4. 修改源数据仓库的 OpenAPI、runtime validator、handler manifest、catalog service、CLI 和 Agent 使用说明；保持所有修改在同一个源数据仓库版本范围内。
5. 执行源数据仓库自己的定向测试和完整质量门；把实际命令、提交和结果写入该版本的 release acceptance。
6. 按源数据仓库自己的发布规范更新 `package.json`、锁文件、版本变动范围、发布验收材料和标签；发布前不得修改生产目录、生产进程或生产数据。
7. 发布后提供给 `harness-comfyui` 的交付物只能是：源数据仓库 commit/tag、OpenAPI/discovery 契约版本、已安装 CLI 的版本、CLI 安装路径约定、10 个 operation 清单、通过的测试命令和 release acceptance 结果。

## 9. `harness-comfyui` 消费边界

源数据仓库发布完成前，`harness-comfyui` 的 Catalog Tool Issue 只能实现消费端适配和阻塞记录，不能自行复制或猜测源数据 Schema。源数据发布后，`harness-comfyui` 执行者必须：

- 在项目自己的 `catalog-tool-manifest.ts` 中记录已发布 10 个 Tool 的消费映射，并在启动时核对 discovery metadata；
- 由项目插件统一调用 Harness `ctx.tools.register()` 注册 Tool；源数据仓库不参与 Harness 注册；
- 由项目 `StructuredCliGenerationCatalog` 使用配置中的已安装 CLI 路径启动 CLI，传递已知 manifest path、mode、query/id、page/page_size 和允许过滤字段；
- 只把 CLI stdout JSON 转成 Harness Tool Result；不把源数据 HTTP transport 的 request ID、绝对路径或旧 Pi metadata 暴露给 Skill；
- 在项目自己的测试中验证真实 Harness Tool call、CLI 退出码和 source contract mismatch 的 fail-closed 行为。

若源数据仓库尚未发布包含 10 个 operation 和结构化 CLI 的版本，`harness-comfyui` 的对应 Catalog Tool Issue 必须保持阻塞；Issue 执行者不得在本仓库伪造 source response、直接修改源数据仓库或把旧 4-operation 协议当作完成条件。

## 10. 源数据仓库交付验收清单

源数据仓库版本只有同时满足以下条件，才可以解除 `harness-comfyui` 的源数据依赖阻塞：

- [ ] 源数据仓库自己的 Issue、分支、变动范围和 release acceptance 已记录本项变更。
- [ ] 10 个 operation 均有实际只读 handler、OpenAPI Schema、discovery metadata 和唯一 Tool name。
- [ ] `queries[]`、`groups[]`、旧 Pi Tool name 和隐式宿主注入字段不再出现在新 Harness Catalog request/response contract 中。
- [ ] search/resolve、分页、过滤、空结果和失败分支均有自动化测试。
- [ ] CLI 能通过固定 manifest path 输出单个 JSON 值，错误时 stdout 为空并返回稳定退出码。
- [ ] CLI 安装说明、help、退出码、版本信息和 release acceptance 已同步。
- [ ] 源数据仓库完整质量门通过，发布 commit/tag 可复现，且发布过程没有修改生产目录、生产进程或生产数据。
- [ ] 交付给 `harness-comfyui` 的 commit/tag、CLI 版本、manifest 版本、测试结果和 release acceptance 链接完整。
