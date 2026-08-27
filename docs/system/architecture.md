# 系统架构

## 启动与重启链路

```text
pnpm prod:start|restart
  → scripts/production/cli.mjs
  → 配置加载与运行合同校验
  → 当前 Client 源码转换为 .local/source-client/client.js
  → 源码 profile 和 DSH home 准备
  → DeepSeek Harness Host
      → src/host/plugin.ts
      → .local/source-client/client.js
  → .local/production/ 中的进程状态、日志和业务数据
```

独立 worktree 开发入口复用同一生命周期深模块：

```text
pnpm worktree:start|restart
  → scripts/worktree/cli.mjs
  → config/worktree-development.json 与 linked-worktree 门禁
  → scripts/production/cli.mjs 的共享生命周期
  → .local/worktree-development/dsh-home
      → 主开发 worktree .env 的符号链接
      → comfyui-workbench-development Profile
  → Host 注册 startup workspace 后暴露项目能力
```

`prod:stop`、`prod:status`、`prod:health` 和 `prod:logs` 使用受管运行快照定位当前进程，不生成 Client 模块。

`package.json.exports` 的 Host 入口直接指向 `src/index.ts`。Client 类型入口指向 `src/client/index.tsx`，浏览器运行入口指向 `prod:start` 或 `prod:restart` 根据当前 Client 源码生成的 `.local/source-client/client.js`。启动与重启链路不读取 `lib/` 或发布产物。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `scripts/production/` | Client 模块生成、配置解析、PID 与端口所有权、启停、状态、健康和日志 |
| `scripts/worktree/` | linked-worktree 门禁、开发定义解析和共享生命周期命令适配 |
| `scripts/profile/source.mjs` | 在运行目录中创建指向当前源码的 Harness profile |
| `src/host/catalog/` | 通过本地 Catalog CLI 查询上下文目录，严格映射 Source v0.84.0 的封面与样例图片展示字段，提供 Agent 模板、LoRA、生成模型与 ComfyUI 实例 ID 查询 Tool，并向 Client 提供 Catalog Typert Remote |
| `src/host/generation/` | Run Repository、Source adapter、运行时 Workflow 参数化、官方前端 API Workflow 导出与缓存、Comfy transport、coordinator、Generation Tool、Generation Remote 和媒体路由 |
| `src/host/tools/` | 项目 Tool 唯一注册入口 |
| `src/generation/` | Host 与 Client 共用的 Generation Remote 和媒体 URL 合同 |
| `src/client/` | 使用 Harness 原生扩展位的工作台、上下文选择器与 Generation Run/Media 投影 |
| `.agents/skills/comfyui-generate/` | 从当前消息的模板与画面上下文调用异步 Generation Tool 的项目 Skill |
| `config/` | 生产配置、schema、环境变量映射和数据源合同 |
| `profiles/` | Harness bundle composition 模板 |

Client 在已保存 Session 中通过 Harness 原生 `details` 扩展位显示真实 Generation Run/Media 投影。Harness `0.1.1-rc.2` 不为尚未保存的空白 Session 分配 `details` 列宽；Client 仅在该状态通过公开 `shell.overlay` 扩展位显示空结果列。Session 保存后，`shell.overlay` 结果列退出，原生 `details` 结果列接管，页面只保留一个可见结果列。

“插入上下文”资源卡片把封面预览按钮与记录选择按钮作为同级交互。封面预览按钮在同一个 Catalog `Modal` 中切换到图片画廊；关闭画廊后恢复 Catalog 查询、分页和待确认选择。画廊 header 不参与 flex 收缩，画廊 body 只占用 Modal 中 header 之外的剩余高度；图片按固有尺寸显示，超出查看区域时由该区域提供水平和垂直滚动条。`CatalogItem.coverUrl` 与 `CatalogItem.sampleImageUrls` 只属于 Client 展示投影，不进入 `CatalogContext` 或 composer 草稿。

## 进程与状态

`prod:start`、`prod:restart`、`worktree:start` 和 `worktree:restart` 先更新浏览器 Client 模块，再以前台子进程运行 DSH。进程管理器记录 PID、进程启动时间和命令，并验证端口由该 PID 持有。stop 只停止匹配该入口 runtime ID 和进程身份的进程。health 检查源码版本、Harness Web、Client ModuleLoader 注册、Run Repository、Official API Workflow Cache 和 Saved Media。

`prod:test` 使用 Vitest 和临时运行目录自动调用同一套进程管理模块，覆盖六个生命周期操作、PID 身份和端口异常分支。

生产运行状态写入 `.local/production/`；独立 worktree 开发状态写入当前 worktree 的 `.local/worktree-development/`。源码仍保留在仓库根目录。配置变更在下一次对应入口的 start 或 restart 时生效。

## Generation 生命周期

`query_semantic_comfyui_instances` 使用固定 search 请求读取 Catalog CLI 当前返回的 ComfyUI 实例目录，并且每个实例结果项只向 Agent 投影 `id`。`comfyui-generate` 把当前查询的首个有效 ID 传给 `generate_with_comfyui`；Host 不根据 Workflow、生成模型、LoRA、运行参数或已有 Run 记录选择实例。

`generate_with_comfyui` 在 Run Repository 持久接纳当前 Tool `callId` 后立即返回 `run_id`。Host 内的 Generation Coordinator 继续执行准备、提交、观察和媒体保存。Host 停止时 coordinator 中止本地观察但不取消远端 ComfyUI 任务；Host 重启后从非终态 Run 继续观察。

Generation 编译链路分为参数语义和最终导出两个阶段：

```text
原始 UI Workflow + 请求参数
  → ComfyWorkflowCompiler 读取实时 /object_info
  → 修改 Actual Workflow，并生成运行时 API Workflow 投影
  → OfficialApiWorkflowCompiler 查找本地缓存
      → cache miss：ChromeComfyFrontend 调用目标实例官方 loadGraphData() 与 graphToPrompt()
      → cache hit：直接读取 Official Base API Workflow
  → Runtime Input Overlay 把非连接请求值写入官方基础对象的深拷贝
  → Comfy transport 把最终 API Workflow 提交给 /prompt
```

`ComfyWorkflowCompiler` 保留原编译器已经通过回归测试的通用能力。`replace_input` binding 指向已连接输入时，compiler 沿对应端口类型解析真正生效的唯一上游 widget；Prompt 和非分辨率参数存在零目标、多目标，或多个参数对同一 widget 写入不同值时终止编译。Connected width/height 无法解析唯一上游目标时，compiler 断开 binding 指定输入的 selector 连接并把请求值写入该输入的本地 widget。模板明确绑定 bypass LoRA Loader 时，compiler 优先使用并激活该 Loader，再使用未绑定的 active LoRA Loader 容量。下游 `LatentUpscale` 的默认宽高使用同一倍率时，compiler 以新源尺寸保持该倍率。实时输入定义为 `BOOLEAN` 且 UI Workflow 序列化值不是布尔值时，compiler 使用该输入定义中的布尔默认值；实时定义没有布尔默认值时终止编译。Seed、模型实例路径、标准 LoRA、Power LoRA、LoRA Text Loader、bypass 解析和活动输出节点筛选同样继续由该阶段负责。

`ComfyWorkflowCompiler` 产生的手写 API Workflow 现在只作为运行时 API Workflow 投影。Official Base API Workflow 才是最终节点集合、连接 tuple、虚拟节点和自定义 widget 序列化的权威来源。Runtime Input Overlay 只替换官方对象中已经存在的同名非连接输入；当官方输入使用 `{ "__value__": ... }` 包装时只替换 `__value__`。Runtime Input Overlay 不替换官方连接，也不删除官方额外节点或额外输入。官方前端导出、缓存读取或 Runtime Input Overlay 失败时，本次 Generation Run 明确失败，生产路径不会直接提交手写投影。

Official API Workflow Cache 的 identity 包含目标实例 ID、实例 origin、Host 级缓存代次、编译器 schema 版本、原始 UI Workflow 哈希和参数化后执行结构哈希。执行结构哈希包含节点 ID、`class_type`、输入名称、连接 tuple 和非连接值类型，因此 bypass、连接断开和 Power LoRA 动态输入数量变化会产生新的缓存项；Prompt、seed、尺寸和权重变化复用同一基础对象。Host 级缓存代次变化时，全部已登记实例的旧缓存均不再命中。损坏或 identity 不匹配的缓存文件返回明确错误，不触发静默重编译。同一 Host 进程中的并发 cache miss 合并为一次官方前端导出。

精确类型为 `Lora Loader (LoraManager)` 的节点同时更新 `text` 与结构化 `loras` widget。没有选择 LoRA 时，compiler 清空模板保存的 `text` 与 `loras` 默认值。最终官方输出中的数组包装由目标实例前端生成，因此节点的 `inputs.loras.__value__` 与本次 LoRA 名称、模型权重、CLIP 权重和 active 状态一致。

Comfy transport 向 `/prompt` 发送 API Workflow，并把同一 Run 的 Actual Workflow 放入 `extra_data.extra_pnginfo.workflow`，供读取 `EXTRA_PNGINFO` 的节点使用。Jobs API 完成响应中的 `type=temp` 预览不进入 Saved Media；`type=output` 图片或视频继续执行 descriptor 路径、响应媒体类型、大小和文件签名校验。

Run Repository 保存状态和索引；Run 目录保存每次运行独立的请求、来源快照、Actual Workflow 和 API Workflow；Saved Media 使用随机 `media_id` 的两级前缀分片。媒体内容与媒体所属 Actual Workflow 通过同一个 Harness HTTP 服务的 `/api/harness-comfyui/media/<media_id>/content|workflow` 提供。
