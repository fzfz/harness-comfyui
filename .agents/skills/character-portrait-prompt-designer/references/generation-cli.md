---
文档用途: 提供 Generation Run Input CLI 的调用条件、输入输出与错误处理规则。
读取时机: Skill 执行者首次调用本文件所列命令前。
---
# Generation Run Input CLI

## CLI 作用

1. 历史 Generation Run 查询命令只读取一个或多个 `run_id` 创建时保存的生成请求参数，以及对应 Run 保存的 Actual Workflow（实际执行的工作流）。

## 调用时机

1. 用户要求读取、核对或复用已有 `run_id` 的 Workflow、模板 ID、生成模型、LoRA、Prompt 或其他生成参数时，Skill 执行者调用该命令。

## 用法

1. 受管前台 shell Tool Call 提供 Host Electron 可执行文件路径 `DSH_HARNESS_COMFYUI_NODE_EXECUTABLE` 和 CLI 入口脚本路径 `DSH_HARNESS_COMFYUI_CLI`。Skill 执行者必须在当前会话的 Workspace 工作目录设置 `ELECTRON_RUN_AS_NODE=1`，传入 `--expose-internals`，并执行该命令。

2. Run ID 支持完整 ID 和短 ID；短 ID 由 `run_` 和完整 UUID 的起始片段组成，该片段至少包含前八个 UUID 字符。

3. 把只包含 `run_ids` 的 JSON 对象传入标准输入：

   ```bash
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --quiet generation run-inputs --stdin <<'JSON'
   {
     "run_ids": ["run_3c0ad3ed", "run_d26923be"]
   }
   JSON
   ```

4. `run_ids` 必须是包含 1 至 20 个字符串的数组。数组为空、超过 20 项、包含非字符串元素或标准输入包含其他属性时，CLI 返回非零退出码。

5. 短 Run ID 只匹配当前 Workspace 中以该值开头的完整 Run ID。唯一匹配时查询成功；没有匹配时，该项返回不存在错误；匹配多个 Run 时，该项返回歧义错误。Skill 执行者须按完整 Run ID 的字符顺序延长短 ID 后重试。

## 结果文件中的 JSON

1. 结果文件中的 JSON 包含 `runs` 数组。数组长度和顺序与输入 `run_ids` 完全一致，重复的 `run_id` 产生重复的结果项。只要顶层查询请求合法，某个 Run 的查询错误不会使整条命令失败；CLI 仍返回退出码 0，并继续返回其他 Run 的结果。

2. 可用结果项包含：

   1. `run_id`：匹配到的完整 Run ID；
   2. `lookup_status: "available"`；
   3. `arguments.title`：创建 Run 时传入的标题；
   4. 可选的 `arguments.instance_id`：创建 Run 时传入的实例 ID；
   5. `arguments.template_id`：创建 Run 时传入的 Workflow 模板 ID；
   6. 可选的 `arguments.model`：创建 Run 时传入的生成模型 `id` 和 `file_name`；
   7. `arguments.parameters`：创建 Run 时传入的全部运行参数，包括当时的 Prompt；
   8. `arguments.loras`：创建 Run 时传入的全部 LoRA `id`、`file_name`、`weight` 和 `trigger_words`；
   9. Actual Workflow 可用时，结果包含 `workflow_status: "available"` 和 `workflow`；未保存或无法读取时，结果包含 `workflow_status: "unavailable"` 和 `workflow_error`。

3. 历史保存记录没有 `loras` 属性时，结果使用 `arguments.loras: []`。该空数组只表示当时保存的调用参数没有显式结构化 LoRA 选择；Skill 执行者必须依据 Actual Workflow 判断其中预置或活动的 LoRA。历史保存记录没有 `model` 属性时，结果不包含 `arguments.model`；该省略表示当时保存的调用参数没有显式模型覆盖，Run 使用 Actual Workflow 当时保存的模型。

4. 单项查询失败时，结果项包含：

   ```json
   {
     "run_id": "<requested-run-id>",
     "lookup_status": "error",
     "error": {
       "code": "<error-code>",
       "message": "<actionable-message>"
     }
   }
   ```

5. 单项查询错误码的含义如下：

   1. `GENERATION_RUN_ID_INVALID`：输入包含不安全字符，或短 ID 的 UUID 片段格式、长度不符合要求。
   2. `GENERATION_RUN_ID_AMBIGUOUS`：短 ID 在当前 Workspace 中匹配多个 Run；Skill 执行者按照“用法”一节补全短 ID 后重试。
   3. `GENERATION_RUN_NOT_FOUND`：当前 Workspace 中没有与输入匹配的 Run。
   4. `GENERATION_REQUEST_INVALID`：保存的生成请求损坏。
   5. `GENERATION_RUN_LOOKUP_FAILED`：服务读取该项时发生未分类故障。

6. Skill 执行者必须报告失败项的错误，并继续处理 `runs[]` 中的其他项。

## 命令级错误

1. 公共文件错误按“命令帮助”处理。发生其他命令级错误时，标准错误包含 `错误码: 错误消息`。命令级错误表示标准输入、受管 CLI 环境、当前 Workspace 身份或服务请求存在问题。Skill 执行者必须报告标准错误，并按错误类型处理：输入错误由 Skill 执行者修正后重试；环境或身份错误由用户修复受管会话环境后，Skill 执行者重新调用；服务请求错误由用户按照错误消息检查服务并决定是否重新查询。Skill 执行者必须依据单项查询结果判断对应 `run_id` 是否存在。

## 命令帮助

1. 首次调用受管 CLI 前，Skill 执行者将本文件调用入口中的 `--stdin` 替换为 `--help`，读取该命令帮助。公共输出与文件错误按帮助处理。本文件的成功 JSON 指返回路径中的文件内容。
