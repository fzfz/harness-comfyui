# CLI 调研报告

## 调研结果与证据

独立 worktree 为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-image-inspect-investigation`，分支为 `codex/investigate-image-inspect`，从 main 的 `70d4625` 创建。此次调研使用 Node v25.8.2 运行当前 CLI 源码，未启动 Desktop。该实验验证本地解析与等待行为，生产现场核对及安装产物复现结果见“生产会话现场核对”。

| 输入或实验 | 实际结果 | 判断 |
| --- | --- | --- |
| `node scripts/cli/harness-comfyui.mjs --help` | 退出码 2，`CLI_ARGUMENT_INVALID: CLI command is invalid` | CLI 未实现帮助入口。用户贴出的该行错误属于 help 调用。 |
| Python subprocess 的 argv 包含单项 `image inspect --stdin` | 退出码 2，`CLI_REQUEST_INVALID: CLI command is invalid` | 原样复现用户叙述中的错误组合，原会话实际采用两项业务 argv：`image inspect` 与 `--stdin`，同属拼接字符串相同但参数数量错误的情况；详见现场核对。 |
| argv 分别为 `image`、`inspect`、`--stdin`，stdin 为合法 JSON 并关闭 | 到达 `CLI_ENVIRONMENT_INVALID` | 参数解析通过；本实验没有真实受管环境。 |
| 合法命令的 stdin 含独立 `$` 行并关闭 | 立即返回 `CLI_REQUEST_INVALID: Image inspection stdin must contain one JSON object` | 字面 `$` 无法单独解释超时；现场原始命令已确认没有独立 `$` 行。 |
| 写入合法 JSON，保持 stdin 打开 | 一秒后仍等待，实验主动终止子进程 | CLI 读取到 EOF 才解析 JSON。该实验展示等待机制，未复现原会话的 180 秒超时。 |
| 合法命令连接本地受控 HTTP endpoint，endpoint 收到请求但保持响应未结束 | endpoint 收到 `image.inspect`，一秒后子进程仍等待且 stderr 为空 | stdin 已关闭时，等待 HTTP 响应也可产生静默等待。此实验未调用真实 Host 或视觉模型。 |

### 错误分类的代码根因

`scripts/cli/harness-comfyui.mjs` 用 `argv.join(' ')` 判断错误应属于哪一类，而 stdin 读取和 `src/cli/contract.ts` 的解析还要求 `argv.length === 3`。单参数和三参数形式具有相同的拼接字符串，导致不同模块对同一输入作出不同判断。解析器拒绝单参数形式，但入口根据拼接字符串把错误归入 `CLI_REQUEST_INVALID`。`.agents/skills/local-image-reader/references/image-inspection-cli.md` 的“错误、修正与重试”章节将 `CLI_REQUEST_INVALID` 解释为 stdin 不合合同，因而会把修正方向引向 JSON。

`--help` 没有独立分支，落入解析器的通用未知命令错误。该错误使 Agent 无法通过帮助确认命令用法。

### 超时的证据边界

CLI 的 `stdinText()` 等待 EOF；随后 `fetch()` 和响应体读取未设置本项目的完成期限。`src/host/cli/route.ts` 将连接取消信号交给业务调用，`src/host/image-reader/image-reader-service.ts` 将该信号传入视觉模型调用。以上代码没有提供足以区分原会话等待阶段的输出。

`src/host/cli/dispatch.ts` 的 `image.inspect` 分支直接调用图片读取服务，使用绝对图片路径，不调用 Workspace 解析。CLI 在 argv 和 stdin 解析完成后才读取 endpoint 和 capability。因此 cwd 或 capability 不能解释本地的 `CLI command is invalid`；真实请求阶段的身份问题应根据对应错误另查。

原会话的 Python 调用和 Bash 轨迹已核对，结果见“生产会话现场核对”章。已进一步读取视觉服务的历史日志并完成真实模型回放，内部等待及重复输出机制见“超时根因取证”。


## 全部公开 CLI 的帮助现状

| 入口 | 现状与证据 |
| --- | --- |
| `scripts/cli/harness-comfyui.mjs` | 实测根帮助退出 2；解析器没有分类或叶子帮助分支，影响全部 Catalog、Generation 和 Image 命令。 |
| `scripts/source-client/imagegen-comfyui-source-read.mjs` | 实测根帮助及 instance 帮助退出 0；源码另有 template-bundle 帮助。已有帮助内容仍需按渐进式标准验收。 |
| `scripts/source-client/imagegen-semantic-query.mjs` | 实测根帮助退出 0；操作帮助通过服务 discovery 获取，代码在有 URL、port 时先请求 discovery，再生成路径帮助。 |
| `scripts/desktop/cli.mjs` 与 `production-cli.mjs` | 静态解析仅接受单项 start、stop、restart、status、logs；无帮助分支。未执行生命周期入口。 |
| `scripts/worktree/cli.mjs` 与 `scripts/production/cli.mjs` | 源码已有根帮助；解析限制根帮助为单独参数，子命令帮助需要补齐。 |
| `scripts/cli/run.mjs` | main 在转发任何 argv 前先执行 prepareCliRuntime，因而帮助没有本地提前返回路径。未运行此入口，以免创建运行产物。 |
| 三个 `.agents/skills/*-prompt-builder/scripts/validate-output.mjs` | ANIMA、Krea2、WAI 的根帮助实测分别退出 1、2、1，全部拒绝 --help。 |

上述入口的实现分别维护参数解析和帮助逻辑，仓库当前没有统一落实根帮助、分类帮助、命令帮助和后续操作指引。此为代码观察；缺失功能的历史决策原因尚无证据。帮助缺口的实施范围应覆盖这些公开入口，已有帮助也需要行为验收。

## 生产会话现场核对

证据文件为生产部署目录的 `.local/desktop-production/home/harness/sessions/--Volumes-4Tdisk-work-AI2-run-comfyui-workflows-harness--/session-d5f78b6d-5b6e-41d2-8b12-458c03d6ee65/session.v3.jsonl.zstd`。生产部署目录绝对路径为 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env`。以下 seq 为文件中的事件序号，时间为北京时间，日期均为 2026-09-11。

| 事件 | 时间与耗时 | 直接证据 |
| --- | --- | --- |
| seq 309/310，step 48 | 21:58:43.229–21:58:43.465，236 ms | Python 两次执行 `subprocess.run(['node',os.environ['DSH_HARNESS_COMFYUI_CLI'],'image inspect','--stdin'],input=inp,capture_output=True,text=True)`，均返回 2。 |
| seq 314/315，step 49 | 21:58:45.440–21:58:45.464 | 读取前一步结果，两个结果均包含 `CLI_REQUEST_INVALID: CLI command is invalid`。 |
| seq 319/320，step 50 | 21:58:48.975–22:01:49.006，180031 ms | Bash 明确设置 timeoutMs=180000。先调用 --help，后调用分开的 image、inspect、--stdin，并使用完整 heredoc 传入仅含 file_path 的 JSON。结果为 help 的 CLI_ARGUMENT_INVALID、标记行、180000ms 超时和 SIGTERM。 |
| seq 324/325，step 51 | 22:01:53.610–22:02:22.561，28951 ms | 对同一图片使用文件重定向，JSON 增加 prompt，Bash 期限设为 420000ms；返回完整 observation 和 rc=0。返回 provider 为 openai-compatible，model 为 Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-MLX-mxfp4。 |

### 现场根因与误判

首次失败的直接原因已经确定：Python 将 `image inspect` 作为一个 argv 元素传入，应该分别传入 `image` 和 `inspect`。项目 CLI 使用拼接字符串分类错误，使该命令行错误被误报为请求体错误。现场 Agent 在 seq 318 和 seq 323 的消息中反复考虑 cwd、capability 和 prompt，并尝试调用不存在的帮助入口。错误信息缺少修正指引可能延长了排查过程，这是根据该轨迹作出的推断。

生产 checkout 当前 HEAD 为 `70d462576d24bee09847ca9edb333e679a84c065`。对生产现存 `.local/source-cli/harness-comfyui.mjs` 使用现场的两项业务 argv 和无敏感信息的替代 JSON，实测退出 2，并原样返回 `CLI_REQUEST_INVALID: CLI command is invalid`。该调用在本地解析阶段退出，没有发送业务请求。安装产物同样以 `argv.join(" ")` 分类错误，并以 `argv.length === 3` 识别合法命令。此证据确认现存生产产物包含缺陷；历史调用实际脚本路径未记录在该段轨迹中。

超时命令包含真实换行、匹配的 heredoc 结束符，且没有独立 `$` 行。正常 Bash heredoc 会提供 EOF，因此“调用者保持 stdin 打开”与这段原始命令不符。180000ms 是该次 Bash 请求显式设置的外层期限，SIGTERM 由工具超时行为产生；它不是 CLI 参数解析返回的错误。

成功调用除了改用文件重定向，还添加了本次 prompt，并增大了外层期限。它实际约 29 秒就结束，故“因为期限从 180 秒增至 420 秒才成功”没有证据。省略 prompt 会使用活动配置的默认提示词；该差异需要与输入方式、服务负载分别对照。当前 settings 不能单独证明失败时的历史活动配置。

会话事件及 Harness 日志缺少请求阶段耗时；后续从视觉服务日志取得历史解码和取消记录，并使用原图片执行下述对照。


## 超时根因取证

视觉服务位于 `192.168.110.16:8003`。取证读取该机器 `/Users/yaojun/.omlx/logs/server.log`，并核对 `/Users/yaojun/Library/Application Support/oMLX/logs/server.log` 中的同一记录。取证期间保持远端程序和配置原状。

历史失败请求 `5f7e2d0f-4a6b-4813-8fc5-363822ce7e38` 在 21:58:55.010 开始视觉 MTP 解码，22:01:49.112 收到取消，与会话的外层超时相差 106 毫秒。成功请求 `4495bef7-e254-4153-a285-205ec7a4357b` 在 22:01:57.340 开始解码，22:02:22.544 完成；服务记录 593 tokens、28.62 秒、`finish_reason=stop`。这些记录确认失败调用已到达模型解码阶段。

开发者从生产 settings 读取当前活动图片读取配置，使用仓库原有 `ImageReaderService` 和图片预处理函数回放原图。回放直接调用同一视觉 endpoint，保留模型、温度 `0.2`、`max_tokens=8192` 和图片处理方式。它验证 Host 图片读取服务之后的真实调用链；CLI 到 Host 的历史链路由上述时间记录支持。

| 对照 | 实际结果 |
| --- | --- |
| 省略 prompt，使用活动配置的 2,436 字符默认提示词 | 图片处理 26 毫秒，HTTP 响应头 2,226 毫秒，180,005 毫秒仍未完成而被实验期限取消。 |
| 仅替换为现场 `/tmp/e08/probe.txt` 的 520 字符提示词 | 图片处理 28 毫秒，HTTP 响应头 2,231 毫秒，总耗时 29,635 毫秒；服务记录 589 tokens、正常停止。该文件正文已与会话 seq 309 的创建命令核对。 |
| 原默认提示词，改用流式传输观察输出，60 秒后结束实验 | 收到 3,234 字符正文，推理字段为空。正文在初始标签后持续重复 `soft lighting, soft shadows, soft glow`，没有进入要求的构图段落。 |
| 同默认提示词并发回放，使服务按现有调度规则进入普通 BatchGenerator | 两项服务请求记录均跳过视觉 MTP。其中一项 60 秒收到 3,399 字符，持续重复同组光线和渲染标签；另一项因排队较晚收到 1,222 字符，已出现反复扩展的近义标签。 |

活动默认提示词要求输出标签列表和一段构图描述，但仅限制构图描述最多 60 词，没有限定一般标签数量。该提示词与当前 Qwen 模型组合发生重复输出；普通 BatchGenerator 对照说明视觉 MTP 不是复现该问题的必要条件。服务配置的重复惩罚为 `1.0`，出现惩罚为 `0.0`，请求允许输出 8,192 tokens。

Harness 的 OpenAI-compatible 分支采用非流式 Chat Completions，并等待完整响应体后才解析 observation。oMLX 的 `server.py:_json_response_or_keepalive` 在请求未完成时先返回 HTTP 200 和保活内容；HTTP 200 因此不能证明推理已结束。在回放中，持续重复使完整结果迟迟没有返回，实验期限先到达 180 秒并取消请求；仅替换提示词的受控回放约 29 秒完成。这支持历史超时同样由重复输出引起的推断。历史日志直接证实的是模型已经进入解码、外层 Bash 到达期限后取消请求。

历史取消请求没有保存部分输出，因此无法逐字证明历史请求重复了同一短语。历史解码时间与使用原图、当前活动配置的回放共同支持上述根因推断；报告将历史日志事实与回放观察分别列出。诊断原始日志、计时和流式结果保存在本 worktree 的 `.local/timeout-diagnosis/`。该目录中的凭证文件仅用于本次回放，已由开发者在完成回放后删除。

最小候选验证：仅在原默认提示词末尾补充最多 40 个标签、每项一次和结束条件，仍在 180,008 毫秒超时；该方案未通过。改用 `IMAGE_READER_LEGACY_SETTINGS_DEFAULTS.configuration.defaultPrompt` 中已有的 55 字符观察提示词，保持其他参数不变，在 29,707 毫秒正常完成。开发者在修改默认输出用途前，需要用户确定默认读图应提供事实观察还是标签列表。
