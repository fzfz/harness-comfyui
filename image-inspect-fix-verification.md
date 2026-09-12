# 图片读取修复验证记录

## 实现范围

本次候选位于独立 worktree `/Volumes/4Tdisk/work/AI2/harness-comfyui-image-inspect-investigation`，在 CLI 帮助提交 `734f3381a78d4462c194840463d9c7b35de516ee` 上实施已批准的[超时修复方案](image-inspect-timeout-fix-plan.md)。超时回放通过；事实观察可靠性与 Desktop 会话验收尚未全部通过。

`config/image-reader-profiles.json` 中内置配置使用获批的事实观察提示词，`src/image-reader/settings.ts` 从同一结构化配置读取新建配置的默认提示词。已有用户配置及单次 prompt 覆盖逻辑保持原有行为。

`src/host/image-reader/image-reader-service.ts` 输出图片准备、请求发出、响应头到达、响应体读完和成功、失败或取消的诊断记录。`src/image-reader/diagnostics-schema.ts` 定义阶段、总耗时、阶段耗时、配置 ID、模型及可选服务 request ID。OpenAI-compatible 路径从 `x-request-id` 响应头取服务 request ID；runtime 路径在失败上下文提供 request ID 时记录该字段。本次 oMLX 响应未提供该响应头，因此回放诊断中没有 request ID；下表的 completion ID 是独立回放程序从响应体提取的值。

`src/host/image-reader/plugin.ts` 将诊断记录送入 Cordis Host logger。Desktop 由现有文件 exporter 保存 Host 日志；headless Profile 没有文件 exporter，本次 headless 验收没有持久化这些阶段记录。插件集成测试确认记录进入 logger，真实服务回放通过诊断回调保存阶段记录。

OpenAI-compatible 返回 `finish_reason=length` 时，服务抛出 `IMAGE_READER_OUTPUT_LIMIT`，CLI 返回退出码 1。错误目录和 `image inspect --help` 说明结果未正常结束，并引导调用者检查本次 prompt、当前图片读取配置的默认提示词和输出上限。

## 原图回放

实施 Agent 使用现场原图、Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-MLX-mxfp4、温度 0.2 和 max_tokens 8192，连续执行三次省略单次 prompt 的调用。每次实验期限为 180 秒，活动配置仅在回放内存中替换默认提示词。

| 回放 | 总耗时 | finish_reason | completion ID |
| --- | --- | --- | --- |
| 1 | 25,394 ms | stop | chatcmpl-a652389a |
| 2 | 29,891 ms | stop | chatcmpl-6b18fa4f |
| 3 | 30,768 ms | stop | chatcmpl-fe5617c0 |

原标签提示词对照在 2,321 ms 收到响应头，60,007 ms 被实验期限取消；阶段记录没有 `response_complete` 或 `completed`。这验证 HTTP 响应头到达与完整结果返回是不同阶段。

计时、诊断和观察正文位于本 worktree 的 `.local/timeout-diagnosis/approved-1.json`、`approved-2.json`、`approved-3.json` 与 `approved-control.json`。历史根因证据见 [CLI 调研报告](cli-investigation-report.md) 的“超时根因取证”。

独立 Reviewer 对照原图后，确认三份输出均完整结束且没有循环重复，但全部未通过事实可靠性验收：输出把画外手部写成撑地姿态、推断被遮挡肢体，第一份还把正面视角写成身后视角。缺陷段包含无法定位的评价。一次额外候选实验明确要求标注画外和遮挡部位，14,233 ms 正常停止，仍出现类似误判；该候选保存在 `approved-candidate.json`，未写入产品默认提示词。

## 受管 CLI 与 Desktop

headless Harness 会话 `session-d018cb40-e882-4040-8573-abbc0780fcf4` 使用 Workspace `/Volumes/4Tdisk/work/AI2/harness-comfyui-image-inspect-investigation`、项目 Preset `harness-comfyui-cli-candidate`、Agent 模型 `deepseek-official/deepseek-v4-flash`。会话先读取当前 worktree 的 `.agents/skills/local-image-reader/SKILL.md` 和 `.agents/skills/local-image-reader/references/image-inspection-cli.md`，再在真实前台 Bash 中执行两个独立 CLI 子进程；每个子进程期限为 180 秒。

两次调用使用同一原图。第一次 stdin 仅含 file_path，第二次增加“生产配置待执行动作”章列出的事实观察 prompt。真实 stdin、stdout、stderr、退出码和计时保存于 `.local/cli-runtime/timeout-acceptance-results.json`。两次分别耗时 44,611 ms 和 23,700 ms，退出码均为 0；stdout 为 provider、model、file_path、observation 四字段 JSON，stderr 为读取完成及下一次读取的 NEXT 指引。会话轨迹位于 `.local/cli-runtime/dsh-home/sessions/--Volumes-4Tdisk-work-AI2-harness-comfyui-image-inspect-investigation--/session-d018cb40-e882-4040-8573-abbc0780fcf4/session.v3.jsonl.zstd`，工具事件 20、25 对应文档读取，事件 35 对应两个调用的执行。

隔离 Desktop 使用仓库基线 Desktop 2.0.9、DSH 0.1.5-rc.1、Electron 43.3.0。启动 run `8493d37a-1380-4aa2-87ca-cf5881564710` 的 `startup.run.completed` 记录 Renderer healthy；进程组 74505 的宿主子进程 74584 监听 59196、62488，Profile 引用当前 worktree 的 managed-plugins/harness-comfyui。实施 Agent 已通过 `pnpm dev:stop` 停止实例，并通过 `pnpm dev:status` 确认 stopped。

CUA 返回 `Sky Computer Use service startup request failed`，因此实施 Agent 未完成隔离 Desktop 内两种图片读取调用及真实模型 Preset 矩阵。上述 headless 结果仅证明 headless Harness 的受管 Bash 调用链。

## 测试与审阅

新增回归测试覆盖新建配置默认提示词、正常停止、输出上限错误、保活响应等待及取消、runtime 成功与失败阶段、失败 request ID、schema 非法字段和插件 logger 接入。既有测试继续验证单次 prompt 原样传递、已保存配置保留、服务错误与调用取消。相关测试及类型检查通过。规范 Reviewer 提出的 runtime 诊断断言缺口已修正；需求 Reviewer 保留事实观察及 Desktop 会话验收未通过的结论。

## 生产配置待执行动作

生产当前活动图片读取配置 ID 为 `profile_4ab0183130de4a46adb0629f5dfacd0d`。本次工作保持生产源码和该配置原值，未发布或部署。

获批方案对应的待替换默认提示词为：

> 请准确描述图片中的主体、构图、姿态、服装、环境、光线、风格、明显缺陷和可见文字。只报告图片中可以观察到的内容。

生产配置更新需要单独授权。部署执行者获得授权后，须通过图片读取设置接口更新该 ID 的 defaultPrompt。保留原标签提示词时，已复现的重复输出及超时仍可能发生；采用上述提示词后，事实准确性仍需独立核对。
