# ComfyUI 官方前端编译与本地 API Workflow 缓存实施计划

## 必须要实现的目标

- 计划执行者必须让 Harness Host 后端使用普通 Node 运行时启动本机 Chrome 或 Chromium，并通过 Chrome DevTools Protocol 调用目标 ComfyUI 实例前端提供的 `loadGraphData()` 与 `graphToPrompt()`。
- 计划执行者必须根据规范化 UI Workflow JSON、目标 ComfyUI 实例身份、Host 级缓存代次和编译器 schema 版本生成本地缓存键。
- 计划执行者必须在缓存未命中时等待目标 ComfyUI 前端和自定义节点扩展完成注册，生成并保存基础 API Workflow；缓存命中时不得启动或连接浏览器。
- 计划执行者必须复制基础 API Workflow，再把本次请求的 Prompt、seed、尺寸、LoRA 和其他运行时参数写入副本；计划执行者不得把本次请求参数写回基础缓存。
- 计划执行者必须让模板 39 的 `Lora Loader (LoraManager)` 节点通过官方前端导出得到 `inputs.loras.__value__`，并让用户选择的 LoRA 名称、模型权重、CLIP 权重和 active 状态进入最终 `/prompt` 请求。
- 计划执行者必须保留旧编译器已经通过回归测试的运行时参数解析、Actual Workflow 改写、活动输出节点筛选和运行时投影能力；计划执行者必须删除生产执行路径直接提交手写 UI-to-API 序列化结果的行为。生产执行路径不得在官方前端编译失败时静默回退到直接提交手写结果。
- 计划执行者必须完成单元测试、集成测试、类型检查、仓库全量质量门禁、双轴代码审查、提交、推送、GitHub CI、版本发布和生产部署验证。

## TDD 测试 seam

- seam 1：官方前端编译缓存的公开接口。测试观察相同 UI Workflow 的首次调用返回 cache miss、第二次调用返回 cache hit，以及缓存命中时浏览器编译适配器没有被调用。
- seam 2：基础 API Workflow 参数写入接口。测试观察请求副本包含本次 Prompt、seed、尺寸和 LoRA，同时基础缓存对象保持不变。
- seam 3：Generation Source Preparer 的公开接口。测试观察模板、实例和请求参数产生的最终 Actual Workflow 与 API Workflow，并确认模板 39 的最终 API Workflow 包含官方序列化的结构化 LoRA。
- seam 4：Chrome DevTools Protocol 适配器与受控假页面的集成接口。测试观察适配器等待前端就绪、加载 UI Workflow、调用 `graphToPrompt()`、关闭自有 Chrome 进程，以及清晰返回启动、页面初始化和导出错误。

## 领域名词与模块接口

- **运行时 API Workflow 投影**：`ComfyWorkflowCompiler` 根据 `/object_info`、runtime parameter binding、模型选择和 LoRA 选择生成的本次请求输入值、执行结构和活动节点投影。执行结构只用于计算指纹并校验官方输出；只有非连接请求值可以覆盖官方基础 API Workflow。该对象不能直接提交给 `/prompt`。
- **官方基础 API Workflow**：目标 ComfyUI 实例前端加载参数化后的 Actual Workflow 并调用 `graphToPrompt()` 后返回的 `output` 对象。该对象是节点集合、自定义 widget 序列化、数组包装和虚拟节点展开结果的唯一来源。
- **执行结构指纹**：运行时 API Workflow 投影的节点 ID、`class_type`、输入名称、连接元组和非连接值类型的规范化 SHA-256。该指纹区分 bypass 激活、连接断开和动态输入名称变化，不包含 Prompt、seed、权重或普通控件值。
- **官方 API Workflow 缓存项**：本地 JSON 文件保存的缓存 identity 与官方基础 API Workflow。缓存项不保存本次请求参数修改后的 API Workflow。
- **运行时输入覆盖**：编译器深拷贝官方基础 API Workflow，并用运行时 API Workflow 投影中的非连接请求值替换官方对象中已经存在的同名输入。连接 tuple、虚拟节点连接和官方新增节点始终保留官方基础对象中的值。官方值为 `{ "__value__": VALUE }` 时，覆盖器只替换 `__value__`。
- **官方前端 Adapter**：`ChromeComfyFrontend` 实现的远端前端 Adapter。该 Adapter 负责启动一个带唯一临时用户目录的本机 Chrome、设置目标实例 authorization header、等待页面和自定义节点扩展就绪、调用 `loadGraphData()` 与 `graphToPrompt()`、关闭自身进程并清理自身临时目录。
- `SourceGenerationPreparer` 继续只依赖一个 `WorkflowCompiler.compile()` 接口。浏览器、CDP、缓存文件、执行结构指纹和运行时输入覆盖属于 `ComfyWorkflowCompiler` 深模块的内部实现。

## 生产数据流

```text
SourceGenerationPreparer
  → ComfyWorkflowCompiler.compile(input)
      → 对运行时修改前的原始 input.workflow 计算 templateWorkflowHash
      → GET /object_info
      → 复制模板 UI Workflow
      → 应用 runtime parameters、模型和 LoRA 到 Actual Workflow
      → 生成运行时 API Workflow 投影与 active output node IDs
      → 对参数化后的执行结构计算 executionStructureHash
      → OfficialApiWorkflowCache.read(cacheIdentity)
          ├─ cache hit：读取官方基础 API Workflow，不创建 Chrome
          └─ cache miss：ChromeComfyFrontend.export(Actual Workflow)
                → 等待 window.comfyAPI.app.app 与 splash 结束
                → app.loadGraphData(Actual Workflow)
                → app.graphToPrompt()
                → 原子保存 prompt.output
      → 深拷贝官方基础 API Workflow
      → 覆盖本次运行时输入
      → 返回 Actual Workflow、最终 API Workflow、active output node IDs
  → ComfyHttpTransport POST /prompt
```

## 缓存 identity 与文件结构

- 编译器使用规范化 JSON 对象键顺序计算 `templateWorkflowHash`；数组顺序保持不变。
- 编译器 schema 版本由 `src/host/generation/official-api-workflow.ts` 中唯一常量定义，不能从请求或远端页面覆盖。
- 缓存 identity 必须包含 `instanceId`、`instanceOrigin`、配置项 `instanceCacheEpoch`、编译器 schema 版本、`templateWorkflowHash` 和 `executionStructureHash`。
- 缓存文件名是缓存 identity 规范化 JSON 的 SHA-256 加 `.json`；缓存目录由 Configuration Profile 的 `paths.apiWorkflowCacheDirectory` 提供。
- 缓存项使用以下结构：

```json
{
  "schemaVersion": 1,
  "cacheKey": "sha256",
  "identity": {
    "instanceId": "win3080",
    "instanceOrigin": "http://192.168.110.122:8188",
    "instanceCacheEpoch": "1",
    "compilerSchemaVersion": 1,
    "templateWorkflowHash": "sha256",
    "executionStructureHash": "sha256"
  },
  "apiWorkflow": {}
}
```

- 同一 Host 进程使用按缓存键保存的 in-flight Promise 合并并发 cache miss。编译失败时删除 in-flight 记录且不创建缓存文件。
- 缓存文件不存在表示 cache miss。缓存 JSON 解析失败、identity 不匹配或 API Workflow 结构无效时返回 `COMFYUI_API_WORKFLOW_CACHE_INVALID`；实现不得删除损坏文件并静默重编译。
- `templateWorkflowHash` 的输入只能是运行时修改前的原始 `WorkflowCompilerInput.workflow`；`instanceId` 只能来自 `ComfyInstanceSource.id`。Prompt、seed、尺寸或 LoRA 权重变化不得改变 template hash。
- `executionStructureHash` 保留每个连接 tuple 的节点 ID 和输出索引，并用类型标记替代非连接普通值。mode、bypass、连接断开、活动节点集合或动态输入名称变化只要改变运行时 API Workflow 投影，就必须改变 execution structure hash。单独返回且不改变最终 API Workflow 的 `activeOutputNodeIds` 列表不进入缓存 identity。

## 缓存正确性合同

- 对同一 Actual Workflow，新鲜官方导出结果与“缓存命中后的运行时输入覆盖结果”必须结构等价；允许不同的值只限 ComfyUI 自己生成且不参与 `/prompt` 执行的已定义 metadata。
- 运行时覆盖不得替换任何连接 tuple。官方前端展开虚拟节点或重写连接节点 ID 时，最终 API Workflow 必须保留官方连接。
- 运行时覆盖只处理当前 Generation Request 支持修改的 Prompt、negative Prompt、seed、尺寸、BOOLEAN、enum、模型、标准 LoRA、Power LoRA、LoRA Text Loader 和精确 `Lora Loader (LoraManager)` 结构化 LoRA。
- 官方额外输入默认属于模板静态序列化状态。测试必须对上述每一类运行时修改比较“新鲜官方导出”与“cache hit 覆盖”；如果某个官方额外输入随请求变化，计划执行者必须在合并前为该支持类型增加明确的非连接运行时覆盖，或者把该变化加入 execution structure hash。计划执行者不得在不知道等价关系时保留首次请求值。
- 模板 39、标准 Loader、Power Loader 和 LoRA Text Loader 的代表 Workflow 必须通过新鲜导出与缓存命中等价测试。任一代表 Workflow 不等价时，本次实现不得发布。

## LoraManager 运行时规则

- `Lora Loader (LoraManager)` 与 `LoRA Text Loader (LoraManager)` 是两个不同节点类型。结构化 `loras` 规则只适用于精确节点类型 `Lora Loader (LoraManager)`。
- 编译器依据 UI Workflow 节点 `properties.__lm_widget_ids` 找到 `loras` widget，不能要求 `/object_info` 公开动态 `loras` descriptor。
- 请求包含 LoRA 选择时，编译器必须同时更新 Actual Workflow 的 `text` widget 与结构化 `loras` widget。结构化数组的每一项必须包含实例相对路径 `name`、`strength`、`clipStrength` 和 `active: true`。
- 请求的 LoRA 选择为空时，精确节点类型 `Lora Loader (LoraManager)` 的 `text` widget 必须写入空字符串，结构化 `loras` widget 必须写入空数组，避免执行模板默认 LoRA。
- 运行时 API Workflow 投影使用普通数组表达 `inputs.loras`。运行时输入覆盖读取官方基础对象现有的 `{ "__value__": [...] }` 包装并只替换 `__value__`；投影逻辑不得自行构造官方包装对象。
- 精确节点缺少 `__lm_widget_ids`、缺少 `loras`、widget 索引越界或 widget 值不是数组时返回 `COMFYUI_LORA_INPUT_INVALID`。

## Configuration Profile 变更

- `paths.apiWorkflowCacheDirectory`：生产进程管理器固定生成 `<runtimeRoot>/shared/data/api-workflow-cache`，Host 对该目录执行原子 JSON 读写。
- `comfyui.frontendCompiler.browserExecutablePath`：本机 Chrome 或 Chromium 可执行文件的绝对路径。生产 profile 默认使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，允许通过已登记环境变量覆盖。
- `comfyui.frontendCompiler.instanceCacheEpoch`：Host 级非空字符串。任一已登记 ComfyUI 实例的前端或自定义节点版本变化后，生产维护者修改该值，使全部已登记实例的旧缓存均不再命中。
- `comfyui.frontendCompiler.timeoutMs`：正整数，统一限制 Chrome DevTools 启动、页面扩展就绪和官方导出步骤；生产默认值为 `120000`。
- `config/environment-overrides.json` 新增 `HARNESS_COMFYUI_API_WORKFLOW_CACHE_DIRECTORY`、`HARNESS_COMFYUI_FRONTEND_BROWSER_EXECUTABLE_PATH`、`HARNESS_COMFYUI_FRONTEND_CACHE_EPOCH` 和 `HARNESS_COMFYUI_FRONTEND_COMPILER_TIMEOUT_MS` 的唯一映射。
- `scripts/production/runtime.mjs` 生成缓存目录并把三个 frontend compiler 配置写入 Managed Source State；`scripts/production/process.mjs` 只从受管 runtime 对象向 Host 子进程透传这些值。

## 后端错误码与唯一文案

- `COMFYUI_FRONTEND_BROWSER_FAILED`：Harness Host 无法启动配置的浏览器、无法建立 DevTools target 或浏览器提前退出。
- `COMFYUI_FRONTEND_NOT_READY`：目标 ComfyUI 页面或自定义节点扩展没有在 `timeoutMs` 内完成初始化。
- `COMFYUI_FRONTEND_EXPORT_FAILED`：`loadGraphData()`、`graphToPrompt()` 或官方输出结构验证失败。
- `COMFYUI_API_WORKFLOW_CACHE_INVALID`：现有缓存文件不是有效缓存项或 identity 与文件名对应的请求不一致。
- `COMFYUI_API_WORKFLOW_CACHE_IO_FAILED`：缓存目录读取、创建、临时文件写入或原子 rename 失败。
- `COMFYUI_API_WORKFLOW_OVERLAY_FAILED`：官方基础对象缺少运行时投影节点、缺少非连接输入、`class_type` 不一致，或运行时覆盖试图替换连接 tuple。
- `config/error-catalog.json` 为以上六个错误码分别保存唯一 title、reason、next_step、cancellable 和 confirm_repeat。源代码错误消息只描述当前失败的具体实例 origin、阶段或文件路径。
- 调用方 AbortSignal 取消时沿用 `COMFYUI_REQUEST_CANCELED`；实现必须关闭自身 Chrome 进程且不得写缓存。

## 具体文件修改清单

- 新增 `src/host/generation/comfy-frontend-browser.ts`：Chrome/CDP Adapter、页面就绪、官方导出和精确清理。
- 新增 `src/host/generation/official-api-workflow.ts`：缓存 identity、规范化哈希、文件缓存、in-flight 合并、官方输出验证和运行时输入覆盖。
- 修改 `src/host/generation/workflow-compiler.ts`：把现有手写 API Workflow 定义为运行时投影；接入官方编译缓存；为精确 LoraManager 节点更新结构化 widget 和投影值。
- 修改 `src/host/generation/source-preparer.ts`：向编译器传入 `instanceId`；保持单一 `WorkflowCompiler.compile()` seam。
- 修改 `src/host/plugin.ts`：根据 Configuration Profile 装配 Chrome Adapter、官方缓存和深编译器。
- 修改 `config/schema.ts`、`config/base.json`、`config/profiles/production.json` 和 `config/environment-overrides.json`：增加缓存路径与 frontend compiler 配置。
- 修改 `scripts/production/contract.mjs`、`scripts/production/runtime.mjs`、`scripts/production/process.mjs` 和 `scripts/production/health.mjs`：受管路径、配置快照、Host 环境和缓存目录健康检查。
- 修改 `config/error-catalog.json`：新增六个唯一错误码文案。
- 新增 `tests/unit/generation-official-api-workflow.test.ts` 与 `tests/unit/generation-comfy-frontend-browser.test.ts`；修改 compiler、preparer、config、plugin、production 和 error catalog 相关测试。
- 修改 `CONTEXT.md`、`docs/system/architecture.md`、`docs/system/configuration.md`、`docs/system/testing.md`、`docs/system/technology-stack.md`：记录正式领域术语和生产行为。
- 发布阶段修改 `package.json`、`tests/contract/engineering-baseline.test.ts`、`README.md` 和 `docs/releasenotes.md`，目标产品版本为 `0.31.0`。

## 自动化测试矩阵

- 官方缓存：miss 写入、hit 不调用 Adapter、并发 miss 合并、编译失败不写入、损坏 JSON、identity 不匹配、读取权限、目录创建、临时写入、rename、Workflow/实例/epoch/schema/执行结构变化。
- 运行时覆盖：普通 scalar、官方连接 tuple 保留、虚拟节点连接保留、官方 `__value__` 数组包装、官方额外输入等价性、运行时输入在官方基础中不存在、节点缺失、`class_type` 不一致、覆盖连接 tuple 拒绝、基础对象不可变。
- 缓存等价：同一模板不同 Prompt、seed、尺寸、BOOLEAN、enum、模型、空/单/多 LoRA 请求分别比较新鲜官方导出与 cache hit 结果；模板 39、标准、Power 和 Text Loader 均包含代表 Workflow。
- Chrome Adapter：浏览器启动失败、DevTools port 超时、target 建立失败、authorization header、页面就绪、前端就绪超时、Workflow 加载失败、官方导出失败、调用取消、正常退出和强制退出清理。
- LoraManager：单个选择、多个选择、空选择、inactive 默认项清除、多个 manager 歧义、mode/bypass 激活、`widgets_values_named` 同步、缺少 `__lm_widget_ids`、缺少 `loras`、索引越界、标准 Loader、Power Loader 和 LoRA Text Loader 不受结构化规则影响。
- Source Preparer：实例 ID 与模板 Workflow 进入缓存 identity、最终 API Workflow 使用官方基础对象、Actual Workflow 保持本次参数、source snapshot 不包含 authorization。
- 生产配置：schema 严格字段、环境覆盖类型、缓存路径必须位于 dataDir、Managed Source State 往返、Host 子进程透传、health 可读写缓存目录。
- 真实实例：122 cache miss、122 cache hit、模板 39 最终 API 节点 5、固定 seed 受控生成、远端队列和 history 成功状态。

## 发布与部署顺序

1. 计划执行者在每个 TDD vertical slice 中先运行对应 RED 测试，再实现最小 GREEN 代码，并定期运行 `pnpm run typecheck`。
2. 计划执行者完成源码与测试后运行相关单文件测试、`pnpm run typecheck` 和 `pnpm run quality`。
3. 计划执行者把产品版本更新为 `0.31.0`，提交源码、测试、配置和计划，推送当前分支并等待该提交 GitHub CI 成功。
4. 计划执行者更新 README、发布说明和系统文档，由独立语义 Reviewer 验收并修正文档，再次运行 `pnpm run quality`。
5. 计划执行者使用 `code-review` 对相对 `origin/main` 的提交执行 Standards 与 Spec 双轴并行审查，修正全部确认问题后重新运行受影响测试。
6. 计划执行者提交并推送最终文档与审查修正，等待最终 GitHub CI 成功。
7. 计划执行者确认 `v0.31.0` 与同名 GitHub Release 不存在，在最终完整 SHA 创建并推送 annotated tag，创建无附件 GitHub Release。
8. 生产部署负责人把生产 checkout 更新到最终发布 SHA，保留生产专属 `config/base.json` 与 `.local/production` 状态，执行 `pnpm prod:restart`、`pnpm prod:status`、`pnpm prod:health` 和模板 39 真实实例验收。

## 实施阶段

| 阶段 | 状态 | 产物 |
|---|---|---|
| 1. 固定领域接口、配置来源与持久化边界 | 已完成 | 文件清单、接口定义、缓存 schema、错误码清单 |
| 2. 完成依赖与运行环境安全审计 | 已完成 | Chrome/CDP/Node WebSocket 审计结论、依赖变更结论 |
| 3. 按 seam 1 实现缓存公开接口 | 已完成 | RED 测试、缓存实现、单文件测试结果 |
| 4. 按 seam 2 实现 API Workflow 参数写入 | 已完成 | RED 测试、不可变副本写入、LoRA 包装结构测试 |
| 5. 按 seam 4 实现官方前端 CDP 适配器 | 已完成 | RED 测试、浏览器生命周期、前端就绪和导出实现 |
| 6. 按 seam 3 接入 Generation Source Preparer | 已完成 | RED 测试、生产数据流切换、手写结果直接提交路径移除、旧参数化能力保留 |
| 7. 完成配置、错误码、运行产物和系统文档 | 已完成 | 配置 schema、唯一错误文案、架构/配置/测试文档、独立语义验收 |
| 8. 完成 122 实例集成验证 | 已完成 | cache miss、cache hit、模板 39 API Workflow、受控生成证据 |
| 9. 完成全量质量门禁与双轴代码审查 | 进行中 | quality 输出、Standards 报告、Spec 报告、修订结果 |
| 10. 提交、推送、发布和生产部署验证 | 待开始 | Git commit、GitHub CI、版本、Release、生产 commit 与健康检查 |

## 验收清单

- [x] 同一目标实例和同一 UI Workflow 的第一次调用返回 cache miss，并且只调用一次官方前端编译适配器。
- [x] 同一目标实例和同一 UI Workflow 的第二次调用返回 cache hit，并且不调用浏览器编译适配器。
- [x] UI Workflow 内容、目标实例身份、Host 级缓存代次或编译器 schema 版本变化时产生新的缓存键。
- [x] 并发请求同一缓存键时最多执行一次官方前端编译，其余请求读取同一成功结果；编译失败不得写入缓存。
- [x] 运行时参数只修改基础 API Workflow 的副本，基础缓存 JSON 在不同请求之间保持不变。
- [x] 原有参数 binding、Prompt 上游定位、尺寸倍率、seed、模型、LoRA、bypass 和活动输出节点回归用例继续通过；`OfficialApiWorkflowCompiler` 只接管最终 API Workflow 拓扑与序列化。
- [x] 模板 39 节点 5 的最终 API Workflow 包含 `inputs.loras.__value__`，并与本次 LoRA 选择一致。
- [x] 目标前端未就绪、Chrome 不可启动、Workflow 无法加载或 `graphToPrompt()` 失败时，后端返回唯一错误码对应的清晰错误文案。
- [x] 生产执行路径没有 Skill、Codex Browser Tool、Playwright、Puppeteer 或外部下载脚本依赖。
- [x] 缓存未命中测试证明 Harness Host 普通 Node 进程能够调用 122 官方前端；缓存命中测试证明不存在浏览器调用。
- [x] 新增正常、错误、并发、缓存失效、参数不可变和 LoraManager 分支测试全部通过。
- [x] `pnpm run typecheck`、相关单文件测试和 `pnpm run quality` 全部通过。
- [ ] 双轴代码审查没有未处理的 Standards 或 Spec 缺陷。
- [ ] 最终发布提交已推送，GitHub CI 通过，版本已发布并部署到生产 checkout，生产健康检查和模板 39 验证通过。

## 非本次目标

- 本次实施不修改 ComfyUI、LoraManager 或其他 ComfyUI 自定义节点的远端源码。
- 本次实施不要求用户同时导入 UI Workflow 与 API Workflow。
- 本次实施不为每一种 ComfyUI 自定义节点编写独立 API 序列化器。
- 本次实施不保留旧手写编译器作为静默降级路径。
- 本次实施不设计图片防伪、同名图片检测、PNG metadata 防篡改或其他与官方前端编译缓存无关的校验。
- 本次实施不安装未经计划、安全审计和明确版本固定的新依赖。

## 已获得的授权

- 用户授权计划执行者在现有独立 worktree 和当前分支中设计完整修复方案并实施。
- 用户指定计划执行者使用 `planning-with-files` 保存计划，并使用 `implement` 完成实现、测试、代码审查和提交。
- 用户此前授权计划执行者调试 `192.168.110.122`，该授权包含只读 SSH、官方前端加载、API Workflow 导出和受控生成验证；该授权不包含修改远端源码、配置、模型、插件或进程。
- 仓库 `AGENTS.md` 要求计划执行者完成质量门禁、提交、推送、GitHub CI、版本发布和生产部署；用户本次实施授权包含该仓库规定的标准交付流程。

## 错误记录

| 错误 | 次数 | 处理结果 |
|---|---:|---|
