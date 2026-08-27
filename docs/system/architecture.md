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

`prod:stop`、`prod:status`、`prod:health` 和 `prod:logs` 使用受管运行快照定位当前进程，不生成 Client 模块。

`package.json.exports` 的 Host 入口直接指向 `src/index.ts`。Client 类型入口指向 `src/client/index.tsx`，浏览器运行入口指向 `prod:start` 或 `prod:restart` 根据当前 Client 源码生成的 `.local/source-client/client.js`。启动与重启链路不读取 `lib/` 或发布产物。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `scripts/production/` | Client 模块生成、配置解析、PID 与端口所有权、启停、状态、健康和日志 |
| `scripts/profile/source.mjs` | 在运行目录中创建指向当前源码的 Harness profile |
| `src/host/catalog/` | 通过本地 Catalog CLI 查询上下文目录，提供 Agent 模板、LoRA、生成模型与 ComfyUI 实例 ID 查询 Tool，并向 Client 提供 Catalog Typert Remote |
| `src/host/generation/` | Run Repository、Source adapter、Workflow compiler、Comfy transport、coordinator、Generation Tool、Generation Remote 和媒体路由 |
| `src/host/tools/` | 项目 Tool 唯一注册入口 |
| `src/generation/` | Host 与 Client 共用的 Generation Remote 和媒体 URL 合同 |
| `src/client/` | 使用 Harness 原生扩展位的工作台、上下文选择器与 Generation Run/Media 投影 |
| `.agents/skills/comfyui-generate/` | 从当前消息的模板与画面上下文调用异步 Generation Tool 的项目 Skill |
| `config/` | 生产配置、schema、环境变量映射和数据源合同 |
| `profiles/` | Harness bundle composition 模板 |

Client 在已保存 Session 中通过 Harness 原生 `details` 扩展位显示真实 Generation Run/Media 投影。Harness `0.1.1-rc.2` 不为尚未保存的空白 Session 分配 `details` 列宽；Client 仅在该状态通过公开 `shell.overlay` 扩展位显示空结果列。Session 保存后，`shell.overlay` 结果列退出，原生 `details` 结果列接管，页面只保留一个可见结果列。

## 进程与状态

`prod:start` 和 `prod:restart` 先更新浏览器 Client 模块，再以前台子进程运行 DSH。进程管理器记录 PID、进程启动时间和命令，并验证端口由该 PID 持有。`prod:stop` 只停止匹配该身份的进程。`prod:health` 检查源码版本、Harness Web、Client ModuleLoader 注册、Run Repository 和 Saved Media。

`prod:test` 使用 Vitest 和临时运行目录自动调用同一套进程管理模块，覆盖六个生命周期操作、PID 身份和端口异常分支。

运行状态默认写入 `.local/production/`，源码仍保留在仓库根目录。配置变更在下一次 `prod:start` 或 `prod:restart` 时生效。

## Generation 生命周期

`query_semantic_comfyui_instances` 使用固定 search 请求读取 Catalog CLI 当前返回的 ComfyUI 实例目录，并且每个实例结果项只向 Agent 投影 `id`。`comfyui-generate` 把当前查询的首个有效 ID 传给 `generate_with_comfyui`；Host 不根据 Workflow、生成模型、LoRA、运行参数或已有 Run 记录选择实例。

`generate_with_comfyui` 在 Run Repository 持久接纳当前 Tool `callId` 后立即返回 `run_id`。Host 内的 Generation Coordinator 继续执行准备、提交、观察和媒体保存。Host 停止时 coordinator 中止本地观察但不取消远端 ComfyUI 任务；Host 重启后从非终态 Run 继续观察。

Workflow compiler 根据实时 `/object_info` 和 UI Workflow 连接生成 API Workflow。`replace_input` binding 指向已连接输入时，compiler 沿对应端口类型解析真正生效的唯一上游 widget；Prompt 和非分辨率参数存在零目标、多目标，或多个参数对同一 widget 写入不同值时终止编译。Connected width/height 无法解析唯一上游目标时，compiler 断开 binding 指定输入的 selector 连接并把请求值写入该输入的本地 widget。模板明确绑定 bypass LoRA Loader 时，compiler 优先使用并激活该 Loader，再使用未绑定的 active LoRA Loader 容量。下游 `LatentUpscale` 的默认宽高使用同一倍率时，compiler 以新源尺寸保持该倍率。实时输入定义为 `BOOLEAN` 且 UI Workflow 序列化值不是布尔值时，compiler 使用该输入定义中的布尔默认值；实时定义没有布尔默认值时终止编译。

Comfy transport 向 `/prompt` 发送 API Workflow，并把同一 Run 的 Actual Workflow 放入 `extra_data.extra_pnginfo.workflow`，供读取 `EXTRA_PNGINFO` 的节点使用。Jobs API 完成响应中的 `type=temp` 预览不进入 Saved Media；`type=output` 图片或视频继续执行 descriptor 路径、响应媒体类型、大小和文件签名校验。

Run Repository 保存状态和索引；Run 目录保存每次运行独立的请求、来源快照、Actual Workflow 和 API Workflow；Saved Media 使用随机 `media_id` 的两级前缀分片。媒体内容与媒体所属 Actual Workflow 通过同一个 Harness HTTP 服务的 `/api/harness-comfyui/media/<media_id>/content|workflow` 提供。
