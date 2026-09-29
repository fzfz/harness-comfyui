# Desktop 2.0.15 与 DSH 0.1.7-rc.2 隔离验收记录

## 版本与启动

实施 Agent 在独立 worktree 中使用 `config/desktop-baseline.json` 指定的 fork 提交 `b912b85411f5b06b748a7e9216323c1e1ea3b302`。fork 的 Stable workspace 固定 Desktop 2.0.15、DSH 0.1.7-rc.2 和 Electron 44.0.0；[依赖安装审计](desktop-install-audit.md)记录锁文件身份、补丁及构建结果。

实施 Agent 使用 `pnpm dev:start` 启动隔离 Desktop。当前成功运行的 `runId` 为 `0dd572e5-9bb2-415b-be98-a05fca5b6c7c`；`.local/desktop-development/user-data/lifecycle-events/startup.jsonl` 中该运行的 `renderer.boot.completed` 记录 `rendererStatus: healthy`，`startup.run.completed` 记录 `finalStage: health-commit`。启动时确认进程组主进程 PID 78609、监听端口 `127.0.0.1:57040` 和 `127.0.0.1:51854`；Desktop Profile 的 `node_modules/harness-comfyui` 指向当前 worktree 的 `.local/desktop-development/managed-plugins/harness-comfyui`。验收后执行 `pnpm dev:stop`，再次运行 `pnpm dev:status` 返回 `{"status":"stopped"}`。

## 隔离迁移演练

`tests/production/desktop-session-migration.test.mjs` 使用隔离目录中的旧 Session、Attachment、投影索引及 Workspace Session 关系，检查首次迁移后目标文件可读、源文件保持原值，并检查重复迁移保留目标记录。`tests/production/desktop-development-settings.test.mjs` 使用隔离 `settings.yaml` 和 Profile patch，检查 Desktop、数据源、图片读取配置与凭据的迁移、原文件归档、重复启动保留已保存值，以及缺失或冲突文件的拒绝分支。`tests/production/source-agent-preset.test.mjs` 检查两个受管 Preset 的文件物化、Profile 声明和重复执行结果；`tests/production/cli-runtime.test.mjs` 检查纯 CLI 启动准备调用同一声明生成器。

本次定向运行的 `cli-runtime.test.mjs`、`source-production.test.mjs` 和 `source-agent-preset.test.mjs` 共 133 项测试通过；后续修改 Workspace 错误文案后，`source-agent-preset.test.mjs` 的 102 项测试通过。最终候选的 `pnpm quality` 已通过，包括 manifest 与锁文件检查、依赖公告与构建脚本审计、Harness 边界检查、类型检查、覆盖率、合同测试、生产测试、原型测试和 Desktop 测试。Desktop 测试的 3 个文件、4 项测试全部通过。

`tests/desktop/desktop-live.test.mjs` 在 Desktop 2.0.15 中验证了会话删除、Provider 推理等级保存及 Profile 文件持久化、Session 运行发现、图片读取配置保存与切换，以及媒体操作。测试按新版 AccountMenu 打开设置页；当 Provider 编辑页报告配置版本冲突时，测试按界面提示关闭并重新打开后重试一次。图片读取配置切换使设置页重新挂载时，测试重新进入设置页核对当前配置。

## 真实模型 Session 与 Tool 可见性

用户授权真实模型调用后，验收 Agent 使用 OpenRouter `thinkingmachines/inkling:free` 和外部 Workspace `/private/tmp/dsh-model-acceptance-20260928`。验收 Agent 在该 Workspace 建立 `workspace-acceptance-marker` Skill，并在调用者用户主目录建立 `user-acceptance-marker` Skill；两个 Skill 分别含唯一标记 `WORKSPACE_ACCEPTANCE_20260928_A6D4` 与 `USER_ACCEPTANCE_20260928_B7E5`。产品 Preset 各发现当前 checkout 的 8 个 Repository Skills；`standard`、`ptc`、`cordis` 发现两个标记 Skill，`minimal` 的 Skill 列表为空。`standard`、`ptc`、`cordis` 的模型实际读取并复述两个标记。

最终修复版运行的 `runId` 为 `978ba6db-9a99-4f2c-acd7-ace237cb508a`。该运行的 `startup.run.completed` 记录 `rendererStatus: healthy`；Desktop PID 与进程组 ID 均为 40571，Host PID 为 40626，Host 监听 57040 与 63936，CDP 端口 63929 由同一进程组监听。Profile 中的 `harness-comfyui` 插件链接指向当前 worktree 的 managed plugin，安装后的 `project-tool-visibility.mjs` SHA-256 与源码一致。验收 Agent 在退出前核对进程组和端口归属，执行 `pnpm dev:stop` 后，`pnpm dev:status` 返回 `{"status":"stopped"}`。

| Session ID | 选择的 Preset 与请求 | 模型响应及 Tool/Skill/CLI 结果 |
| --- | --- | --- |
| `acceptance-final-20260929-implicit-default` | 省略 `agentPreset`，请求读取 `local-image-reader/SKILL.md`。 | 实际选择 `harness-comfyui-cli-candidate`；模型读取并报告当前 checkout 中的绝对路径；request/header 仅有 `bash`、`skill`，CLI 调用为无。 |
| `acceptance-final-20260929-explicit-product` | 显式选择 `harness-comfyui-cli-candidate`，请求用 `local-image-reader` 读取临时 32×32 PNG 并返回 `FINAL_CLI_OK`。 | 模型完整读取 `SKILL.md` 和 `references/image-inspection-cli.md`，通过前台 shell 调用 `image inspect --stdin`；退出码 0，stdout 含 `provider=openai-compatible`、视觉模型与 `observation=FINAL_CLI_OK`；request/header 仅有 `bash`、`skill`。 |
| `acceptance-final-20260929-iteration` | 显式选择 `harness-comfyui-iteration`，请求读取 `comfyui-iterate-generation/SKILL.md` 并列出四个子 Agent 派发 Tool。 | 模型实际读取该 Skill，正确列出四个派发 Tool；request/header 仅含 Preset 本地 Tool 与控制 Tool，未含 8 个 Host 项目 Tool；CLI 调用为无。 |
| `acceptance-final-20260929-standard` | 显式选择 `standard`，请求核对 `inspect_image` 与 `query_semantic_comfyui_templates`。 | 模型确认两个 Tool 可见并返回 `STANDARD_FINAL_OK`；request/header 保留 8 个 Host 项目 Tool；Skill 参考与 CLI 调用为无。 |
| `acceptance-20260928-ptc` | 显式选择 `ptc`，请求读取 Workspace 和用户级标记 Skill。 | 模型读取两个 Skill 并复述 `WORKSPACE_ACCEPTANCE_20260928_A6D4` 与 `USER_ACCEPTANCE_20260928_B7E5`；CLI 调用为无。 |
| `acceptance-20260928-minimal` | 显式选择 `minimal`，请求检查两个标记 Skill。 | 模型通过 shell 读取 Workspace 标记文件，但该 Preset 的 Skill 列表为空；未发现用户级标记 Skill，CLI 调用为无。 |
| `acceptance-20260928-cordis` | 显式选择 `cordis`，请求读取 Workspace 和用户级标记 Skill。 | 模型读取两个 Skill 并复述两个唯一标记；CLI 调用为无。 |
| `acceptance-user-20260929-session` | 显式选择一次性用户自建 `acceptance-user-20260929`，请求只回复 `USER_PRESET_MODEL_OK` 并说明可见 Skill 数量。 | 模型回复 `USER_PRESET_MODEL_OK` 并说明没有可确认的 Skill；`remote.skills.list` 为空，Skill 参考读取、CLI 调用与实际 Tool Call 均为无；request/header 保留 8 个 Host 项目 Tool。 |

表中的八个 Session 均已附加到 Workspace ID `27457de3-7cd8-4371-86da-88b18750b063`，模型均为 OpenRouter `thinkingmachines/inkling:free`。用户自建 Preset 的独立运行 `226f042e-fb1f-4af9-ac31-f965af395a50` 同样记录 Renderer healthy、本 worktree 插件来源，以及 PID/PGID 45071 与 Host 端口归属；验收 Agent 在模型调用后移除临时 Preset、恢复 Profile patch 并确认 `dev:status` 为 stopped。修复前的真实模型请求曾让工作台调用 `query_semantic_comfyui_templates`，让迭代子 Session 调用 `read_comfyui_run_inputs`；这证明旧的 `project-tool-visibility.mjs` 只限制初始化时已注册的全局 Tool。修复后的最终请求不再包含这 8 个 Host 项目 Tool；`standard` 保留它们。

新增工作台续派验收使用 `pnpm dev:start` 运行 `796850c2`。该运行的 PID/PGID 为 50322，Host 监听端口为 57040 和 57427；本次 `startup.run.completed` 的 Renderer 状态为 healthy，Profile 安装记录指向当前 worktree。OpenRouter `thinkingmachines/inkling:free` 的父 Session `session-ec2dab41-52ae-4d4a-a030-17bda37d4907` 明确选择 `harness-comfyui-cli-candidate`；这是与上表显式工作台验收不同的新 Session。父 Agent 首次请求子 Agent 报告当前 cwd、子 Session ID、可用委派工具和 `FIRST_OK`，且不修改文件；父 Agent 在收到完成通知后续派，请同一子 Agent 报告相同 Session ID、cwd 和 `SECOND_OK`。首次 `subagent_task` 创建子 Session `15601887-77af-40b5-96d0-3f85d64fc813`，工具返回 `kind=continuable` 和该 `subagentId`；子 Agent 回复 `FIRST_OK` 及 cwd `/private/tmp/dsh-model-acceptance-20260928`。父 Session 将同一 ID 作为 `agent_id` 续派，工具返回 `messageId=907abaeb-1c28-4793-8429-bd7353c83558`；子 Agent 回复 `SECOND_OK`、相同子 Session ID、相同 cwd 和未修改文件。父 Session 的记录包含两次完成通知；`workspace.json` 同时登记父子 Session，二者的 `cwd` 相同。原生 UI 仅展示两次工具请求摘要，本记录没有逐字还原完整 `task` 参数。子 Session 的实际工具调用只有 `bash` 和 `send_message`，没有再次委派。子 Agent 自述的工具列表与配置不一致；`toolFilter.deny` 配置了禁止再次委派，本轮实际调用记录没有出现再次委派。验收 Agent 在本轮开始前曾误用一次直接启动接口，随即停止该实例，并使用受管 `pnpm dev:start` 重新完成上述验收。验收后关闭临时本机浏览器访问设置，将偏好文件恢复到开启前的相同字节，执行 `pnpm dev:stop` 并确认 `pnpm dev:status` 为 stopped。

## 子 Agent 与 managed CLI

隔离开发 Profile 的四个子 Agent 原配置指定 `deepseek/deepseek-v4-flash-0731`。验收 Agent 仅在开发实例中把四个模型字段临时改为 `thinkingmachines/inkling:free`，没有修改仓库源码。最终 Tool 隔离修复版的四角色联测运行 `5e8f197d-1f62-44b1-ae2f-b51fe222b24d` 记录 Renderer healthy、PID/PGID 17765、监听端口归属与当前 worktree 插件来源。迭代父 Session `acceptance-final-roles-20260929-parent` 已附加到 Workspace ID `27457de3-7cd8-4371-86da-88b18750b063`。

父 Session 派发构图 `1f34ee37-51f0-46f7-a0d5-56a68bf9c823`、生成 `86330028-7719-4e7e-b91f-bd0f73b9b8aa`、观察 `086e100a-8ca4-4826-b06f-f6b8d724ecf4` 和比较 `fa824eee-e7c9-480d-927d-447bf065bcdb` 四个子 Session。四个子 Session 的实际 request/header 均为 OpenRouter 免费模型，Tool roster 仅有 `bash`、`send_message`、`skill`，没有 8 个 Host 项目 Tool 或再次委派 Tool；各自 persona、父 Workspace 归属、完成通知与输出文件均已核对。构图子 Session 以同一 ID 续派，返回 messageId `da820cba-155e-4520-b49b-f69ce755e985`，结果文件同时包含 `COMPOSITION_OK` 与 `COMPOSITION_CONTINUED_OK`；生成与比较结果分别包含 `GENERATION_DISPATCH_OK` 与 `COMPARISON_OK`。观察子 Session 的 `local-image-reader` 不可用，因此改用本地 PNG 解析；该步骤没有验证视觉模型的实际观察。首次派发时，免费模型误填空 `agent_id`，修正参数后又创建了一个构图子 Session；上述续派使用原构图子 Session 的正确 ID。验收 Agent 完成后将 Profile patch 恢复到覆盖前的相同字节，执行 `pnpm dev:stop`，并确认 `pnpm dev:status` 返回 stopped。原配置中的收费子 Agent 模型、真实图像生成与 Generation Run 均未在本次四角色联测中调用。

显式工作台 Session `acceptance-final-20260929-explicit-product` 的成功 `image inspect --stdin` 调用证明模型按 Skill 的 CLI 参考在前台执行了 managed CLI。首次试用的系统图标路径不存在，CLI 返回 `IMAGE_READER_FILE_INVALID`；验收 Agent 改用有效的临时 PNG 后，命令退出码为 0。图片读取结果归属该 Session 与上述 Workspace。

## Generation Run 验收

此前显式工作台 Session 完整读取 `comfyui-generate/SKILL.md` 和 `references/catalog-cli.md` 后，前台 managed CLI 的实例、模板和模型查询均因 `CATALOG_QUERY_FAILED` 停止。实施 Agent 已让内置 Source 客户端精确校验 `querySemanticPromptTermsForSkill.search` 的条件分支，并支持 `root_id`、`category_ids`、`category_match` 和 `classification_status`。本轮真实工作台 Session 的前台 managed CLI 已成功解析 Workflow 模板 43、列出实例 2，并解析生成模型 3；三条命令均退出码 0。

此前模板 43 和实例 2 的 `generation inspect-template-parameters --stdin` 因已登记实例 `win3080`（`192.168.110.122:8188`）暂时不可连接而返回 `COMFYUI_CONNECTION_FAILED`，当时没有提交 Run。用户启动该实例后，`/object_info` 返回 HTTP 200。验收 Agent 用 `pnpm dev:start` 启动受管运行 `76b5bf1a-6967-417f-b05e-ad1a9483eacb`：PID/PGID 均为 21120，同一进程组监听 `127.0.0.1:50516` 与 `127.0.0.1:57040`；该运行的 `renderer.boot.completed` 和 `startup.run.completed` 均记录 `rendererStatus: healthy`，插件安装记录指向当前 worktree。

OpenRouter `thinkingmachines/inkling:free` 的工作台父 Session `session-ec2dab41-52ae-4d4a-a030-17bda37d4907` 用前台 managed CLI 对模板 43、实例 2 执行 `generation inspect-template-parameters --stdin`，退出码为 0，stderr 为空。父 Agent 从同一份 `/tmp/proposed_request.json` 依次执行两次 `generation submit --stdin`，两次退出码均为 0，stdout 分别返回 `run_18d4650d-393d-4e99-95c9-d2fd77ba8553` 和 `run_466f5679-4041-4f3f-9bc4-ed26edb2fc13`，没有重试提交。Run Repository 保存的两份 `request_json` 字节相同，SHA-256 均为 `8d9502ea50852c9a248f4940464ce44e12cb0ef89f2d3dbdbe2fc663f7c96802`。两项 Run 最终状态均为 `succeeded`，错误码和错误信息均为空。父 Agent 对两个 Run 分别执行 `generation run-inputs --stdin`，退出码均为 0；两份结果的 `lookup_status` 和 `workflow_status` 均为 `available`，`arguments` 相同，包含标题 `Desktop dual-run acceptance`、实例 2、模板 43、批量 1、1024×1024、种子 123456、相同的正负提示词及空 LoRA 列表。首次输出过大导致模型展示层截断，父 Agent 只读重查一次并保存完整结果，没有再次提交。验收 Agent 执行 `pnpm dev:stop` 后，`pnpm dev:status` 返回 stopped；本轮没有开启浏览器访问，偏好文件与验收前备份字节一致。

## 工作台续派与发布

工作台续派已由上文的真实父子 Session 和 Workspace 记录验收。默认、显式工作台、迭代及用户自建 Preset 四种 Session 均获得与请求对应的模型响应，Skill 列表符合产品 Preset 规范；工作台续派、前台 managed CLI 和双 Run 验收均已通过。用户已批准本次升级实施，并明确授权创建 PR、合入 main、同步本地 main、发布版本和生产目录部署；执行者按[升级计划](../../plans/dsh-desktop-20260928.md#已获得的授权)完成 fork 提交推送、版本发布与生产部署。

隔离测试和 Desktop 界面测试覆盖了设置页、Catalog、Generation、ImageReader Remote、上下文插入和结果页的功能路径。生产 Desktop 的真实模型与数据源验收须在部署后单独记录。
