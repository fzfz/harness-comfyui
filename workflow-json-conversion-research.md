# 请求资源快照生成实际 Workflow JSON 的现有实现调研

## 1. 调研范围与代码快照

本报告只回答“源系统如何使用任务资源快照生成并下载实际 Workflow JSON”。本报告没有修改 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV`、`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ` 或 `prototype-scheme.md`。

| 仓库快照 | 调研时状态 | 与本问题有关的实现状态 |
| --- | --- | --- |
| `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV` | `v0.71.8`，提交 `6bc3fc6a027eecf45ccf86dd681e30621c4bc591`，dirty | 该版本具有领域定义、ADR、静态 HTML 原型和普通模板运行测试，但没有迭代生图任务表、实际 Workflow 持久化字段或真实下载调用链。版本说明明确声明 v0.71.8 不修改数据库迁移或表结构：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/versions/v0.71.8/变动范围.md:19](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/versions/v0.71.8/变动范围.md:19)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/versions/v0.71.8/变动范围.md:25](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/versions/v0.71.8/变动范围.md:25)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/versions/v0.71.8/变动范围.md:31](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/versions/v0.71.8/变动范围.md:31)。 |
| `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ` | `main` 的 `HEAD` 为 `e12ac2cc2353f4b0b9866d8e62500f50b4e3c1df`，dirty | `HEAD` 提交包含完整转换、持久化、HTTP 投影、浏览器下载和测试。调研时的工作树把 `comfyui-iterative-run-service.mjs`、`iterative-image-task-service.mjs`、`iterative-image-task-repository.mjs`、`iterative-image-task-workspace.js` 等核心文件标记为 `D`，并修改了 OpenAPI。因此，下文以 `HEAD e12ac2c…` 的提交内容说明完整实现；凡引用当前工作树已经删除的文件，引用后明确标注 `HEAD e12ac2c…`。当前 dirty 工作树本身不能作为该功能仍可启动的证明。 |

本报告没有运行两个源仓库的应用或测试。测试结论表示提交中存在对应的自动化测试，不表示本次调研重新获得了运行时通过结果。

## 2. 三种 JSON 的准确含义

源系统定义了三个不同的对象，不能把三个对象统一称为“快照 JSON”。

| 对象 | 内容 | 用途 |
| --- | --- | --- |
| 任务资源快照 `resource_snapshot_json` | 任务创建时选定的底模、模型、模板修订、运行参数配置修订、实例关系、Skill、固定运行值和 LoRA 快照 | 固定一次任务后续运行使用的数据来源。来源记录发生修改或删除时，任务快照不变化。领域定义见 [/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/CONTEXT.md:151](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/CONTEXT.md:151)。 |
| 本轮实际 Workflow JSON `workflow_json` | 从快照中的模板 Workflow 修订复制得到，并写入本轮最终提示词、固定参数、LoRA 文件和权重的完整 ComfyUI 前端 Workflow 图 | 用户下载并导入 ComfyUI；该对象保留节点、`widgets_values`、连接和画布信息。领域定义见 [/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/CONTEXT.md:154](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/CONTEXT.md:154)。 |
| 实际 Workflow API 请求 JSON `api_workflow_json` | 编译器从本轮实际 Workflow JSON 生成的节点 ID 到 `{class_type, inputs, _meta}` 的请求图 | 提交给远端 ComfyUI `/prompt`。领域定义见 [/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/CONTEXT.md:157](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/CONTEXT.md:157)。 |

结论：用户所说的“快照转换为 workflow json 下载”，在现有实现中准确对应“系统使用已持久化的任务资源快照和本轮运行值生成 `workflow_json`，然后下载该次运行已持久化的 `workflow_json`”。系统没有把整个 `resource_snapshot_json` 序列化为可导入 Workflow，也没有把原始请求对象直接下载。

## 3. 原始请求、任务资源快照和运行请求的实际字段

### 3.1 v0.71.8 的普通模板运行请求

v0.71.8 公开的普通模板运行测试请求只有以下五个字段：

```json
{
  "instance_id": 3,
  "workflow_revision": 1,
  "workflow_sha256": "…64 lowercase hex…",
  "runtime_config_revision": 2,
  "parameters": {}
}
```

校验器把这五个字段同时定义为唯一允许字段和必填字段：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/generation-resources/comfyui-template-runtime-test-service.mjs:26](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/generation-resources/comfyui-template-runtime-test-service.mjs:26)。异步运行记录只保存模板、模型、实例身份、三项修订身份和 `parameters_json` 等运行状态字段，表中没有 `workflow_json` 或 `api_workflow_json`：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/schema/database/022-comfyui-runs.sql:4](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/schema/database/022-comfyui-runs.sql:4)。

### 3.2 开发仓库完整实现的任务创建请求

迭代生图任务创建请求包含以下字段：

```json
{
  "title": "任务标题",
  "original_prompt": "用户原始生图要求",
  "base_model_id": 1,
  "model_id": 3,
  "template_id": 1,
  "instance_id": 1,
  "fixed_parameters": {},
  "lora_ids": [3, 4]
}
```

服务端校验器定义了八个唯一允许且必填的字段：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/iterative-image-tasks/iterative-image-task-service.mjs:105-137`（`HEAD e12ac2c…`）。OpenAPI 使用同一结构：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/api/openapi.yaml:431`（`HEAD e12ac2c…`）。客户端不能提交 `workflow_json` 或 `api_workflow_json`；集成测试分别验证两个额外字段均返回 422：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/integration/issue-252-iterative-run-http.test.mjs:174-187`（`HEAD e12ac2c…`）。

### 3.3 开发仓库完整实现的任务资源快照

任务创建服务从当时的目录记录构造以下顶层快照字段：

- `base_model_id`、`model_id`、`template_id`、`template_revision_id`、`runtime_config_revision`、`instance_id`；
- `prompt_skill_name`、`fixed_parameters`；
- 完整的 `base_model`、`model`、`instance` 投影；
- `template`，其中保存模板身份、`management_state`、`revision` 和 `runtime_config`；
- `loras`，其中保存任务选定的 LoRA 快照。

构造代码位于 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/iterative-image-tasks/iterative-image-task-service.mjs:291-342`（`HEAD e12ac2c…`），OpenAPI 对顶层字段的封闭结构定义位于 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/api/openapi.yaml:448-449`（`HEAD e12ac2c…`）。

`template.revision` 保存 `id`、`template_id`、`revision_number`、`parent_revision_id`、`workflow_json`、`workflow_sha256`、`change_kind`、`repair_operations` 和 `created_at`。`template.runtime_config` 保存 `template_id`、`revision_id`、`workflow_sha256`、`config_revision`、`dimension_strategy`、`parameters`、`bindings`、`created_at`、`updated_at`，运行准入成功时还保存 `expected_output_node_ids`。构造代码位于 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/iterative-image-tasks/iterative-image-task-service.mjs:293-315`（`HEAD e12ac2c…`），OpenAPI 位于 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/api/openapi.yaml:441-443`（`HEAD e12ac2c…`）。

每个 LoRA 快照保存 `source_lora_id`、`base_model_id`、`model_id`、`file_name`、`file_format`、`precision_or_quantization`、`author`、`version`、`release_url`、`description`、`usage`、`trigger_words`、`weight`、`cover_media_path`、`created_at` 和 `updated_at`：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/iterative-image-tasks/iterative-image-task-service.mjs:344-368`（`HEAD e12ac2c…`）、`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/api/openapi.yaml:444-445`（`HEAD e12ac2c…`）。

SQLite 分别保存任务的 `fixed_parameters_json`、`resource_snapshot_json`、Skill 列表、LoRA `snapshot_json`、轮次提示词结果和最终提示词：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/028-iterative-image-tasks.sql:61](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/028-iterative-image-tasks.sql:61)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/028-iterative-image-tasks.sql:85](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/028-iterative-image-tasks.sql:85)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/028-iterative-image-tasks.sql:97](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/028-iterative-image-tasks.sql:97)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/028-iterative-image-tasks.sql:111](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/028-iterative-image-tasks.sql:111)。任务创建代码在读取当前目录记录和验证运行准入后一次性构造快照：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/iterative-image-tasks/iterative-image-task-service.mjs:683-780`（`HEAD e12ac2c…`）。

集成测试在任务创建后修改或删除模型、实例和底模来源记录，任务详情仍返回创建时的模型文件名和实例标题：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/integration/issue-251-iterative-image-task-http.test.mjs:304-358`（`HEAD e12ac2c…`）。单 LoRA 测试在修改并删除 LoRA 来源记录后，任务仍返回创建时的 LoRA 文件名和说明：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/integration/issue-253-single-lora-http.test.mjs:194-209`（`HEAD e12ac2c…`）。

### 3.4 每次 ComfyUI 运行的规范化请求字段

开发仓库为每次运行尝试构造以下请求对象并计算请求散列：`task_id`、`round_id`、`instance_id`、`workflow_revision`、`workflow_sha256`、`runtime_config_revision`、`parameters` 和 `prompt_text`。`parameters` 等于任务固定参数；存在 LoRA 调整结果时，服务把 `lora_adjustment_result` 加入 `parameters`。代码位于 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-run-runtime.mjs:381-396`（`HEAD e12ac2c…`）。

源系统没有一个名为“请求快照 JSON”的独立下载对象。可重复生成一次运行的输入分散在任务 `resource_snapshot_json`、任务固定参数、轮次 `final_prompt_text`、轮次 LoRA 调整结果和运行身份字段中。

## 4. 从任务资源快照到两个 Workflow 的确定性调用链

完整调用链如下：

```text
任务资源快照.template.revision.workflow_json
    + 任务资源快照.template.runtime_config
    + task.fixed_parameters
    + round.final_prompt_text
    + 任务 LoRA 快照及本轮 LoRA 调整结果
        │
        ▼
prepareIterativeWorkflow(...)
        │  生成可导入 ComfyUI 的本轮实际 Workflow JSON
        ▼
compileWorkflowToApi(actualWorkflow, instance.object_info)
        │  生成远端 /prompt 使用的 API Workflow JSON
        ▼
beforeSubmit：同一事务保存两个 JSON
        ▼
session.submit({ api_workflow })
```

### 4.1 参数和节点写入

`prepareIterativeWorkflow` 只接受 ComfyUI Workflow JSON 0.4，先静态校验源图，再 `structuredClone` 源图。服务按照运行配置中的 `parameter_id`、节点 ID 和 `widget_index` 把 `promptText` 与 `fixedValues` 写入克隆图，不修改模板快照：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:249](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:249)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:268](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:268)。底层 `writeWidget` 同时核对节点 ID、节点类型和 `widget_index`：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:23](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:23)。

任务没有 LoRA 且模板包含一个基础 LoRA 节点时，服务把该节点设为 bypass。任务包含一个 LoRA 时，服务在基础节点写入文件名和权重。任务包含多个 LoRA 时，服务按照任务固定顺序复制基础节点、确定性分配节点 ID 和连接 ID、按“基础横坐标 + 序号 ×（基础宽度 + 40）”设置布局，并把原下游 MODEL/CLIP 消费者改接到最后一个 LoRA 节点：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:127](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:127)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:280](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:280)。转换结束后，服务再次静态校验转换图：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:313](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs:313)。

单元测试覆盖源图不变、提示词与固定值写入、无 LoRA 图、LoRA bypass、多 LoRA 节点布局、连接重写和陈旧顶层 ID 计数器：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/unit/comfyui-iterative-workflow-preparer.test.mjs:360](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/unit/comfyui-iterative-workflow-preparer.test.mjs:360)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/unit/comfyui-iterative-workflow-preparer.test.mjs:554](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/unit/comfyui-iterative-workflow-preparer.test.mjs:554)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/unit/comfyui-iterative-workflow-preparer.test.mjs:600](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/unit/comfyui-iterative-workflow-preparer.test.mjs:600)。

### 4.2 从实际 Workflow 编译 API Workflow

运行服务读取 `resource_snapshot.template.revision.workflow_json` 和 `resource_snapshot.template.runtime_config`，结合任务固定值、轮次最终提示词和 LoRA 调整结果调用准备器；然后从实例取得节点定义并调用统一编译器。它把准备结果命名为 `workflow_json`，把编译器结果命名为 `api_workflow_json`：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-iterative-run-service.mjs:50-110`（`HEAD e12ac2c…`）。

编译器跳过 muted、bypass 和编辑器专用节点，把节点的连接和 widget 值投影为 `{class_type, inputs, _meta}`，并返回活动输出节点 ID：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/runtime-compiler.mjs:77](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/runtime-compiler.mjs:77)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/runtime-compiler.mjs:125](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/runtime-compiler.mjs:125)。该调用链没有在 API Workflow 上执行第二套 LoRA 重写。ADR 对这一确定性绑定作出同样规定：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md:9](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md:9)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md:15](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md:15)。

集成测试验证从已保存 `workflow_json` 再次编译得到的 API 图等于已保存 `api_workflow_json`：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/integration/issue-252-iterative-run-http.test.mjs:158-170`（`HEAD e12ac2c…`）。单 LoRA 集成测试验证实际 Workflow widget、API Workflow inputs 和远端收到的 API Workflow 三者使用同一份文件名与权重：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/integration/issue-253-single-lora-http.test.mjs:184-192`（`HEAD e12ac2c…`）。

## 5. 两个 Workflow 的持久化时点和下载数据来源

开发仓库的 `comfyui_runs` 表为每次迭代运行保存 `prompt_text`、`workflow_json`、`api_workflow_json` 和 `output_node_ids_json`：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/029-comfyui-iterative-runs-media.sql:20](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/029-comfyui-iterative-runs-media.sql:20)。

异步 worker 调用运行服务时，通过 `beforeSubmit` 在同一数据库事务中完成以下两个动作：

1. 把本轮实际 Workflow、API Workflow、最终提示词和输出节点 ID 写入当前 `comfyui_runs` 记录；
2. 写入 `submitted_at`，再允许运行服务调用远端 `session.submit`。

实现位于 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-run-runtime.mjs:554-576`（`HEAD e12ac2c…`）。对应 SQL 更新语句位于 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-run-runtime.mjs:193-199`（`HEAD e12ac2c…`）。运行服务在 `beforeSubmit` 返回后才提交 `compilation.api_workflow`：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-iterative-run-service.mjs:101-113`（`HEAD e12ac2c…`）。

同一轮失败重试会创建新的 `comfyui_runs` 记录，每个尝试分别保存两个 JSON。集成测试验证失败尝试和成功重试拥有不同的运行 ID、`prompt_id`，且两条数据库记录都保留非空 `workflow_json` 与 `api_workflow_json`：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/integration/issue-252-iterative-run-http.test.mjs:207-257`（`HEAD e12ac2c…`）。

因此，下载阶段不重新读取源模板，不重新读取数据源目录，不重新应用参数，也不重新编译。下载阶段直接读取成功运行记录中已经持久化的 `workflow_json`。这一行为是 ADR 的明确要求：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md:17](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md:17)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md:19](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md:19)。

## 6. HTTP 投影、下载方式、Content-Type、Content-Disposition 和文件名

### 6.1 没有独立 Workflow 下载 endpoint

完整实现通过 `GET /api/manage/iterative-image-tasks/{id}` 返回任务详情，并把每轮 `runs[]` 中的 `workflow_json` 和 `api_workflow_json` 一起返回。OpenAPI 路由位于 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/api/openapi.yaml:176-179`（`HEAD e12ac2c…`）；HTTP dispatcher 位于 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/http/catalog-http.mjs:594-599`（`HEAD e12ac2c…`）；`ComfyuiRun` schema 同时声明两个属性：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/api/openapi.yaml:495`（`HEAD e12ac2c…`）。

Repository 把数据库中的两个 JSON 解析到运行投影，再把运行投影嵌入轮次和任务详情：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/iterative-image-tasks/iterative-image-task-repository.mjs:13-32`、`:74-93`、`:96-126`（`HEAD e12ac2c…`）。

OpenAPI 和 HTTP dispatcher 没有 `/workflow`、`/workflow.json` 或 `/download` 路由。现有实现没有返回 Workflow 文件的 HTTP 响应，因此没有 Workflow 下载响应的 `Content-Disposition` 头。任务详情接口本身返回普通 JSON envelope；它不是文件下载 endpoint。

### 6.2 浏览器使用 Blob 生成下载文件

真实工作台只从 `runsForRound` 中选择 `status === "succeeded"` 且 `workflow_json` 非空的运行：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/web/assets/iterative-image-task-workspace.js:453-455`（`HEAD e12ac2c…`）。点击按钮后，浏览器执行 `JSON.stringify(value, null, 2)`，创建 `Blob`，创建 object URL，并通过临时 `<a>` 元素的 `download` 属性触发保存：`/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/web/assets/iterative-image-task-workspace.js:180-194`（`HEAD e12ac2c…`）。

| 下载内容 | 按钮文案 | Blob Content-Type | 文件名 |
| --- | --- | --- | --- |
| 本轮实际 Workflow JSON `run.workflow_json` | `下载本轮 Workflow JSON` | `application/json` | `<task_id>-round-<round_number>-workflow.json` |
| 本轮 API Workflow JSON `run.api_workflow_json` | `下载本轮提交文件` | `application/json` | `<task_id>-round-<round_number>-api-workflow.json` |

文件名来自 HTML `download` 属性，不来自 HTTP `Content-Disposition`。浏览器 E2E 测试验证两个建议文件名、两个文件的解析内容以及两个 Blob 的 `application/json` 类型：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/e2e/issue-252-iterative-image-task-media.test.mjs:201](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/e2e/issue-252-iterative-image-task-media.test.mjs:201)。测试还验证失败运行或成功但缺失 `workflow_json` 的运行不显示下载按钮：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/e2e/issue-252-iterative-image-task-media.test.mjs:221](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/tests/e2e/issue-252-iterative-image-task-media.test.mjs:221)。

### 6.3 v0.71.8 静态原型的下载行为

v0.71.8 静态原型中的按钮文案为 `下载本轮 Workflow JSON`：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/web/iterative-image-tasks-prototype.html:208](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/web/iterative-image-tasks-prototype.html:208)。原型分别硬编码 `roundWorkflowApiRequests` 和 `roundActualWorkflows`：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/web/iterative-image-tasks-prototype.html:321](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/web/iterative-image-tasks-prototype.html:321)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/web/iterative-image-tasks-prototype.html:347](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/web/iterative-image-tasks-prototype.html:347)。原型下载代码把硬编码的 `roundActualWorkflows[roundNumber]` 写入 `application/json;charset=utf-8` Blob，并设置 `<task_id>-round-<round_number>-workflow.json`：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/web/iterative-image-tasks-prototype.html:655](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/web/iterative-image-tasks-prototype.html:655)。

该原型没有从 `roundWorkflowApiRequests` 反向生成 `roundActualWorkflows`，也没有调用后端转换接口。两个对象是并列的硬编码演示数据。因此，原型 Blob 下载不能作为转换服务已经实现的证据。

## 7. 实际 Workflow 下载与 API Workflow 下载的区别

| 比较项 | 本轮实际 Workflow JSON | 实际 Workflow API 请求 JSON |
| --- | --- | --- |
| 生成顺序 | 先生成 | 从左侧 JSON 编译生成 |
| 顶层形状 | `version: 0.4`、`nodes[]`、`links[]`、`last_node_id`、`last_link_id`、`groups`、`extra` 等 | 节点 ID 到 `{class_type, inputs, _meta?}` 的对象 |
| 保留内容 | 节点位置、尺寸、widget 当前值、连接、画布信息 | 远端执行需要的输入，不保留 ComfyUI 前端画布结构 |
| 主要用途 | 导入 ComfyUI 前端、审计本次运行使用的完整图 | 发送给 ComfyUI `/prompt`，审计实际提交数据 |
| 现有真实 UI 文案 | `下载本轮 Workflow JSON` | `下载本轮提交文件` |
| 能否代替另一个文件 | 不能 | 不能 |

v0.71.8 ADR 原先只要求实际 Workflow 下载，并规定 API Workflow 留在技术详情：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md:19](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/docs/adr/0005-deterministic-multi-lora-api-workflow-transform.md:19)。开发仓库 `HEAD e12ac2c…` 的真实前端在该要求之外又增加了 API Workflow 下载按钮。用户本次强调的下载对象应对应第一种文件，即可导入 ComfyUI 的 `workflow_json`；第二种文件可以作为独立技术下载保留，但不能命名为“请求快照 JSON”。

## 8. 两个 checkout 的实现完整性结论

### 8.1 PROD-ENV v0.71.8

v0.71.8 的普通模板运行服务确实会在内存中把当前模板 Workflow 编译为 API Workflow 并提交：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/generation-resources/comfyui-template-runtime-test-service.mjs:266](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/generation-resources/comfyui-template-runtime-test-service.mjs:266)。统一编译器也确实生成 `{class_type, inputs}` API 图：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/generation-resources/comfyui-workflow/runtime-compiler.mjs:125](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/generation-resources/comfyui-workflow/runtime-compiler.mjs:125)。

但是，该版本的运行表不保存实际 Workflow 或 API Workflow，运行 HTTP 投影也不返回这两个字段：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/schema/database/022-comfyui-runs.sql:4](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/schema/database/022-comfyui-runs.sql:4)、[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/generation-resources/comfyui-run-runtime.mjs:56](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/app/generation-resources/comfyui-run-runtime.mjs:56)。HTTP 只登记模板运行测试、运行列表和运行详情：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/schema/api/openapi.yaml:141](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ-PROD-ENV/schema/api/openapi.yaml:141)。

结论：PROD-ENV v0.71.8 只有 ADR 和静态原型表达“任务快照生成实际 Workflow 并下载”的目标语义，没有完整生产实现。

### 8.2 开发仓库 `HEAD e12ac2c…`

该提交已经包含以下完整链路：

- 任务创建请求和不可变资源快照；
- 最终提示词、固定参数、零/单/多 LoRA 的确定性实际 Workflow 转换；
- 从实际 Workflow 编译 API Workflow；
- 远端提交前按运行尝试持久化两个 JSON；
- 任务详情 HTTP 投影；
- 成功运行的浏览器 Blob 下载；
- 单元、集成和浏览器 E2E 测试。

结论：开发仓库的提交快照包含完整实现，不只是 prototype 或测试逻辑。但是，调研时的 dirty 工作树已删除多个核心已跟踪文件并修改 OpenAPI，所以“当前工作树可以直接运行完整功能”没有得到确认。

## 9. harness-comfyui 应复用的语义

根据“数据源仓库只提供实例、模板和目录数据；异步运行、持久化和媒体保存必须由 harness-comfyui 实现”的边界，harness-comfyui 应复用以下语义：

1. 数据源 CLI 的只读操作应返回一次运行所需的结构化目录投影：实例身份与 Host 私有连接描述、模板修订中的 UI Workflow JSON、模板运行参数配置、参数绑定、预期输出节点 ID、模型和 LoRA 元数据。Skill 只通过 DeepSeek Harness Tool 获取该结构化结果；Skill 不直接读取数据源仓库文件或数据库。
2. harness-comfyui 的 Host 应在本地分别创建不可变来源快照和不可变运行请求快照。来源快照保存数据源 CLI 返回的完整模板修订、运行配置、bindings 和本次 LoRA 文件投影；运行请求快照保存本次最终提示词、固定参数、LoRA 顺序、权重和运行关联字段。数据源仓库不保存这两个快照。
3. harness-comfyui 的确定性服务应从本地来源快照与运行请求快照生成可导入 ComfyUI 的 `workflow_json`，再从该 `workflow_json` 编译 `api_workflow_json`。同一次运行不能分别从两个不同输入生成两个图。
4. harness-comfyui 应在远端 `/prompt` 调用前，把 `workflow_json` 与 `api_workflow_json` 保存到本地运行记录。同一 DeepSeek Harness ToolExecution 的传输重试或进程恢复必须复用稳定 `request_id` 和原 `run_id`，不能创建第二个远端任务；用户显式发起新重试时使用新的 `tool_call_id`、`request_id` 和 `run_id`，并保存该新运行自己的两个 JSON。
5. “下载 Workflow JSON”操作应读取成功运行记录中已经保存的 `workflow_json`。下载操作不应重新查询数据源 CLI、不应重新应用参数、不应重新编译，也不应返回原始运行请求快照。
6. 变体 A 的成功结果卡应同时使用两个不混淆的名称：`下载本次 Workflow JSON（可导入 ComfyUI）` 和 `下载本次 API Workflow JSON（提交文件）`。
7. 当前系统使用任务 ID 和轮次号命名文件。聊天宿主中一次会话轮次可能产生多个 ComfyUI 运行，因此 harness-comfyui 应使用本地运行身份命名：实际 Workflow 文件使用 `comfyui-run-<run_id>-workflow.json`，API Workflow 文件使用 `comfyui-run-<run_id>-api-workflow.json`。

## 10. harness-comfyui 不能直接复用的仓库模块

1. harness-comfyui 不能静态导入 `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/iterative-image-tasks/iterative-image-task-service.mjs`。该模块依赖源仓库的目录 Service、SQLite Repository、Pi session 和任务编排对象，并会把任务快照写入源仓库数据库。harness-comfyui 应通过数据源 CLI 获取结构化只读数据，并在本仓库重新实现本地运行快照服务。
2. harness-comfyui 不能复用源仓库的 `iterative_image_tasks`、`iterative_image_task_rounds`、`comfyui_runs` 或 `comfyui_run_outputs` 持久化模块来写源仓库数据库。harness-comfyui 必须在本仓库拥有运行、重试、队列状态、两个 Workflow JSON 和媒体记录。
3. `/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/app/generation-resources/comfyui-workflow/iterative-workflow-preparer.mjs` 和 `runtime-compiler.mjs` 的确定性算法可以作为迁移依据，但 harness-comfyui 不应跨仓库静态导入这些文件。计划执行者应把明确需要的算法和测试用例移植到本仓库，并把输入改为数据源 CLI 返回值与本地运行请求快照。
4. 现有下载功能没有可直接调用的后端下载 endpoint。harness-comfyui 如果沿用浏览器 Blob，应从本地任务详情接口读取已持久化 JSON；如果需要 HTTP 文件端点，应在本仓库定义新的 endpoint、`Content-Type`、`Content-Disposition` 和鉴权边界。
5. 源实现的媒体表只允许 `image` 和 `video`，MIME 类型只允许 JPEG、PNG、WebP、MP4 和 WebM：[/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/029-comfyui-iterative-runs-media.sql:78](/Volumes/4Tdisk/work/AI2/NoobAI-XL-FZ/schema/database/029-comfyui-iterative-runs-media.sql:78)。本项目需求还包含音频，因此 harness-comfyui 不能直接复制该媒体 schema。
6. 源实现使用 `task_id` 和 `round_number` 选择成功运行和生成文件名。DeepSeek Harness 的聊天会话、消息轮次、Skill 调用和 ComfyUI 运行之间需要由本仓库定义明确的一对多关系，不能把源系统的迭代任务轮次身份直接当成聊天消息身份。

## 11. 方案中的准确修改建议

原方案中的“请求快照 JSON 下载”应修改为：

> 结果卡同时提供“下载本次 Workflow JSON（可导入 ComfyUI）”与“下载本次 API Workflow JSON（提交文件）”按钮。前一个按钮下载本仓库在远端 ComfyUI 提交前已经持久化的 `workflow_json`；该 JSON 由本地来源快照中的模板 Workflow 修订、运行参数绑定和 LoRA 文件投影，加上本地运行请求快照中的最终提示词、固定参数与 LoRA 权重生成。后一个按钮下载从该 `workflow_json` 编译并实际提交给 ComfyUI `/prompt` 的 `api_workflow_json`。两个按钮都不返回原始来源快照或运行请求快照。

底层服务的最小输出契约应明确区分：

```json
{
  "run_id": "local-run-id",
  "request_snapshot": {},
  "workflow_json": {},
  "api_workflow_json": {},
  "status": "created|prepared|submitting|submission_unknown|remote_pending|remote_running|downloading|succeeded|failed",
  "outputs": []
}
```

其中 `request_snapshot` 用于本地重放和审计，`workflow_json` 用于用户下载和 ComfyUI 前端导入，`api_workflow_json` 用于远端提交和技术审计。三个属性必须分别持久化并使用各自的名称。
