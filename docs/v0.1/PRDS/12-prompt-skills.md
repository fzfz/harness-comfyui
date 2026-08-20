# PRD 12：Harness 原生 Prompt Skill 生成闭环

## 关联 Ticket

Ticket 12 — 使用迁移的 Prompt Skill 完成同一生成闭环。

## 用户任务

浏览器用户通过 Harness 原生 Skill 入口分别选择 Anima Prompt Skill 和 WAI Prompt Skill；每个 Skill 查询真实 Catalog、组装提示词并调用既有 `generate_with_comfyui`，右列继续按 `run_id` 显示结果。

## 来源与打包

- 源文件只来自 `fzfz/NoobAI-XL-FZ@6bc3fc6a027eecf45ccf86dd681e30621c4bc591` 中确实存在的 `skills/anima-prompt-builder/` 与 `skills/wai-sdxl-prompt-builder/` committed tree。
- 当前仓库把两个 Skill 复制为独立可发布目录，并保留其内部相对文件关系。Skill 不得引用来源 checkout 绝对路径、当前仓库运行模块、SQLite 路径或 ComfyUI URL。
- Release Artifact 包含两个 Skill 的执行文件与其需要的 references/scripts，不包含来源仓库其他文件。

## Harness 注册与权限

1. Harness 原生 Skill provider 发现两个 Skill；active profile 决定用户显式调用、模型自动调用或两者是否允许。
2. 当前项目不得注册第二套 Skill 按钮、菜单、选择状态或 Tool 详情面板。
3. 两个 Skill 只使用当前 profile 明确授权的十个 `query_semantic_*` Catalog Tool 与 `generate_with_comfyui`。
4. Source Operation、Run Repository 私有方法、API Workflow 和 ComfyUI credentials 不得出现在 Skill Tool 列表。
5. Skill 输出与工具参数必须符合 Harness 当前版 contract；不支持的设置返回明确错误，不静默删参数或换模板。

## Skill 用户路径

- Anima Skill 使用消息中的不可变 Message Context 和 Catalog Tool 生成 Anima 兼容提示词，选择适用模板并调用 Generation Tool。
- WAI Skill使用同一上下文与 Catalog Tool 生成 WAI 兼容提示词，选择适用模板并调用 Generation Tool。
- Skill 可以在一次 Chat Turn 内不调用、调用一次或调用多次 Generation Tool。每次实际调用创建独立 `run_id`。
- Agent 增量文本、Tool Call/Result 和调用顺序继续由 Harness 原生中列轨迹呈现；右列不复制参数或结果 JSON。

## 错误行为

- 缺少模板、实例、必填运行参数或 profile Tool 权限时，Skill 返回具体缺失对象和修复动作。
- Catalog contract 不兼容或查询失败时，Skill 不编造目录记录，也不调用 Generation Tool。
- Skill validation script 只能验证确定的输出结构，不能用程序判断提示词语义质量；语义质量由独立语义审核者人工验收。

## 产品验收

1. 真实 Harness Skill chooser 显示两个 Skill；当前项目 DOM 中不存在项目自建 Skill 选择器。
2. 两个 Skill 的黑盒组合测试分别调用至少一个真实 Catalog Tool 和一次 `generate_with_comfyui`，Tool Result 与右列使用同一个 `run_id`。
3. 禁用某个必需 Tool 后，Skill 返回明确权限/缺失错误且没有创建 Run。
4. 在隔离安装中执行 Skill，来源 checkout 不存在时仍能完整工作。
5. 包内容检查确认只包含被引用的 Skill 文件，没有绝对路径、源数据库或凭据。
6. 独立语义审核者检查两个 Skill 的输入理解、Catalog 结果使用、提示词输出和错误文案。

## 不属于本 Ticket

管理 Skill 没有已确认的来源目录与 revision，本 Ticket 不创建其占位文件。Harness 原生 Skill invocation policy 不由当前项目重写。
