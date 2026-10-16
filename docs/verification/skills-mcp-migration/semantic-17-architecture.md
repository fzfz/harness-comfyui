---
文档用途: 记录 architecture.md 的逐行语义审计修改项。
读取时机: 修改 architecture.md 并复核文档职责、术语和查询入口表述时。
---
# architecture.md 语义审计

## 审计范围

1. 本轮已逐行阅读 `docs/system/architecture.md` 第 1—204 行；审计依据为指定的文字规范，未读取其他文件或核实实现。
2. 下列修改项覆盖需要调整的行；其余行在本轮语义审计中通过。

## 需修改项

### 1. 补充文档用途与读取时机

1. 位置：第 1 行之前。
2. 独立理解及理由：文档直接进入架构描述，缺少非 `SKILL.md` 文档必需的 YAML 字段，读者无法从文档开头确认适用的阅读任务。
3. 完整插入文字：

   ```yaml
   ---
   文档用途: 说明 Harness ComfyUI 插件的模块职责、宿主接口与数据流。
   读取时机: 调整插件模块边界、宿主接口或数据流之前。
   ---
   ```

### 2. 用有序列表组织同层级说明

1. 位置：第 5—28、36—47、69—75、79—85、89—179、183—204 行的正文段落，以及第 9—16、51—65 行的表格。
2. 独立理解及理由：除第 32 行外，同层级说明均使用普通段落或表格，未按指定规范使用有序列表。第 87 行下连续容纳调用入口、历史查询、编译、缓存和媒体界面等多种职责，也缺少下级标题。
3. 修改要求：每个章节中的正文段落依次添加有序列表编号；表格分别改为“入口职责”和“模块职责”下的有序列表，每项保留原表一行的入口或模块名及职责。代码块归入其引导列表项。
4. 在第 89、103、105、115、121、167 行前依次添加以下完整标题，并将第 103、107 行的数据源客户端说明归入“目录查询入口”：

   ```markdown
   ### Skill 调度与调用入口

   ### 目录查询入口

   ### 历史 Run 查询

   ### 生成提交与运行恢复

   ### Workflow 编译

   ### Run 存储与媒体访问
   ```

### 3. 统一查询入口的职责说明

1. 位置：第 30—32、103、107、117 行。
2. 独立理解及理由：第 32 行称两个预设通过原生 MCP 查询目录，第 117 行却要求 `comfyui-generate` 通过 CLI 参考规定的 Catalog 入口执行 search；第 103、107 行还描述 Skill 直接运行内置数据源客户端。这些段落未解释“目录查询”与“语义查询”的边界，读者无法判断哪些请求经过 MCP、哪些请求由 Skill 启动客户端。仅凭本文无法确定这些入口是否并存，也无法判定哪个入口是当前契约。
3. 第 32 行完整替换文字：

   ```markdown
   1. 两个 ComfyUI 预设通过 DSH 原生 MCP 客户端查询目录。Host 业务模块通过 Catalog 适配器读取数据源。
   ```

4. 第 117 行完整替换文字：

   ```markdown
   1. `comfyui-generate` 查询当前 ComfyUI 实例目录，并把首个有效实例 ID 写入 Generation Request 的 `instance_id`。Skill 的目录查询入口遵循“预设目录 MCP”，提交入口遵循自身 CLI 参考文档。
   ```

5. 第 103、107 行中涉及 Skill 启动数据源客户端的说明需要由维护者依据当前接口契约核实后统一；本轮仅审计文档，不能为尚未核实的查询路径提供替换事实。第 107 行关于专用 HTTP 服务和 capability 的重复说明可按第 4 项删除。

### 4. 合并 managed CLI 身份链路的重复定义

1. 位置：第 36—47、89、105、107 行。
2. 独立理解及理由：第 36—47 行已经说明 shellEnv 注入、回环地址、短期 capability 校验与撤销。第 107 行再次解释相同服务地址与身份链路；第 105 行再次说明 CLI 从 capability 派生身份。重复维护会使入口说明产生分歧。
3. 第 105 行完整替换文字：

   ```markdown
   1. `read_comfyui_run_inputs` Tool 从 Tool Call、Session cwd 和 workspace registry 派生当前 Workspace；CLI 身份解析遵循“Host Node 与 managed CLI”。两种入口均调用 `GenerationRuntime.readGenerationRunInputs()`，查询范围由当前 Workspace 决定。
   ```

4. 第 107 行前三句删除不替换；数据源客户端说明按第 3 项核实后归入“目录查询入口”。

### 5. 将历史查询的实现细节与单个 Skill 流程收敛为职责说明

1. 位置：第 109—113 行。
2. 独立理解及理由：三段分别复述 Run ID 解析算法、Krea2 Skill 的查询操作以及请求字段投影规则。架构读者需要知道身份范围、逐项结果与职责归属；参数数量、字符串匹配算法、属性缺省处理和某个 Skill 的完整操作顺序应由相应契约或 Skill 文档提供。第 111 行自己已经给出 Skill 参考文件，却继续复述其执行步骤。
3. 第 109—113 行完整替换文字：

   ```markdown
   1. `GenerationRuntime.readGenerationRunInputs()` 负责当前 Workspace 内的 Run ID 解析、历史请求读取与 Actual Workflow 读取，并按输入顺序返回逐项结果。查询契约由 `src/generation/` 和 `src/cli/` 维护，读取实现位于 `src/host/generation/`。
   2. 各 Skill 按自身 CLI 参考文档使用历史查询结果；Prompt 构建与改写由执行 Skill 的 Agent 完成。
   ```

### 6. 收敛 Workflow 章节中的算法复述

1. 位置：第 135—163 行。
2. 独立理解及理由：本段群包含进程信号、浏览器启动参数、候选值深比较、数值 token 处理、动态控件递归、缓存键组成和单个 LoRA 节点写法等实现细节。大量算法文字掩盖了 compiler、官方前端导出器、overlay 和 transport 的职责边界，也与“文档提供索引和职责而不复述代码”的规范冲突。第 125 行与第 153 行还重复记录同一缓存有效期。
3. 第 135—163 行完整替换文字：

   ```markdown
   1. `ComfyWorkflowCompiler` 根据 UI Workflow、请求参数和目标实例的 `/object_info` 解析参数目标、校验输入合同并生成 Actual Workflow。运行参数检查与编译共用参数发现逻辑；`SourceGenerationPreparer`、`GenerationRuntime` 和 managed CLI 转交输入与结果。
   2. `OfficialApiWorkflowCompiler` 负责官方基础 API Workflow 的导出与缓存。缓存未命中时，`NodeWorkerComfyFrontend` 启动包内 Worker，由 `ChromeComfyFrontend` 调用目标实例的官方前端完成导出；Host 负责 Worker 的取消与进程清理。
   3. 官方基础 API Workflow 定义最终执行节点、连接和自定义控件序列化结果。Runtime Input Overlay 负责将本次请求的非连接输入值写入该结果，Comfy transport 负责提交最终 API Workflow。
   4. 目标 ComfyUI 负责节点自定义输入校验；Generation Run 保存远端拒绝信息，供调用方修正参数或 Workflow。
   5. 上述组件的实现与参数校验逻辑位于 `src/host/generation/`，共享请求合同位于 `src/generation/` 和 `src/cli/`。
   ```

4. 第 125 行中的“10 分钟进程内”删除不替换，流程图保留缓存读取职责。

### 7. 将媒体界面行为移出运行生命周期描述

1. 位置：第 169—179 行。
2. 独立理解及理由：这组段落详细描述方向键、复制提示、Promise 迟到结果、临时锚点、文件名编码、尺寸事件与重试文案，内容已经从运行生命周期转为界面实现与交互规则。架构文档需要保留 Host 的归属校验、iframe 与主框架的职责和事件合同，其余实现应回到对应模块。
3. 第 169—179 行完整替换文字：

   ```markdown
   1. Client 结果列通过媒体查看页展示当前 Session 的媒体。Host 在提供查看页、内容和下载响应前验证 Session、Workspace 与媒体归属。
   2. Session Media Viewer iframe 负责媒体播放、固有尺寸与提示词展示；主框架 Modal 负责完整 Run ID 的展示、复制与原文件下载。
   3. iframe 通过当前媒体消息同步所选媒体。主框架验证消息来源、`src/generation/contract.ts` 定义的结构及当前 Session 的媒体归属后，更新 Run ID 和下载目标。
   4. Client 交互实现位于 `src/client/`，媒体查询、查看页和下载路由实现位于 `src/host/generation/`。
   ```

### 8. 将图片读取章节收敛为服务边界与适配器职责

1. 位置：第 191—200 行。
2. 独立理解及理由：章节细述缩放比例、像素舍入、响应体上限、错误字段顺序和 UTF-16 截断规则，复述了图像处理与错误格式化实现。第 196 行只用排除句描述服务职责，而第 204 行已经明确 Run 解析、图片读取和 Prompt 对比的分工。
3. 第 191—200 行完整替换文字：

   ```markdown
   1. `prepareImageReaderInput()` 负责本地图片验证和模型输入准备，处理结果交给所选 Provider 适配器。
   2. `runtime` 适配器通过 Harness Attachment 和 LLM Runtime 调用配置的模型；`openai-compatible` 适配器通过配置的 Chat Completions 地址提交图片与提示词。两种适配器均返回模型观察文本。
   3. `inspect_image` Tool 和 managed CLI 将观察文本包装为共享结果，并向调用方传播服务错误。`ImageReaderService` 负责调用取消与 Provider 失败的区分，以及诊断信息的格式化。
   4. 图片处理、适配器和诊断实现位于 `src/host/image-reader/`，共享结果合同位于 `src/image-reader/`。
   ```

### 9. 删除已退役入口的过程说明

1. 位置：第 81 行最后一句。
2. 独立理解及理由：“已退役”描述历史修改过程；同句后半部分又重复第 5 行的官方应用生命周期归属。删除后不影响当前架构的理解或执行。
3. 删除以下整句，不替换：“旧 Desktop/Web Host 启动器、Profile 写入器和独立 headless 产品入口已退役；运行中的正式插件由官方应用管理。”

### 10. 明确核心术语，统一中文表达

1. 位置：第 5—28、55、61、73、89、121—179 行。
2. 独立理解及理由：文档在定义前交替使用 Run、Generation Run、Media、Saved Media、Actual Workflow、API Workflow、投影和合同。部分词是代码标识，部分词是中文概念；尤其“投影”和“合同”在工作台快照、请求返回值和编译结果中指代不同，增加读者理解负担。
3. 在第 3 行前添加以下完整章节，并将后文泛指的“合同”统一为“接口契约”或“输入约束”；将“投影”按具体对象改为“工作台查询结果”“历史请求返回字段”或“运行时 API Workflow”：

   ```markdown
   ## 本文术语

   1. Host 指官方 DeepSeek Harness Desktop 的插件运行环境；Client 指其用户界面及插件界面扩展。
   2. Generation Run，简称 Run，指一次生成请求及其持久化执行记录；Generation Media 指该 Run 的媒体记录，Saved Media 指插件保存的媒体文件。
   3. UI Workflow 指 ComfyUI 前端工作流；Actual Workflow 指应用本次生成参数后保存的 UI Workflow；API Workflow 指提交给 ComfyUI 执行接口的工作流。
   4. managed CLI 指由 Host 提供执行环境和调用身份的插件命令行入口；capability 指绑定当前前台 Tool Call 的短期调用凭据。
   ```
