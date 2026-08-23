# PRD 13：Release Artifact 的真实产品验收

## 关联 Ticket

Ticket 13 — 从一次构建的版本化产品包完成真实产品验收。

## Harness 核心零改动与公共接口

本 Ticket 验收 Issues #2–#13 已冻结的全部 public interfaces。Release Artifact 不得包含 Harness source patch、fork、vendored source、`@deepseek-ai/*/src/*` import、source checkout路径、项目自定义 forwarded event或 DOM monkey patch。`check:harness-boundary`、tarball-only、composition、E2E和当前worktree的`1440×1000`桌面人工验收必须全部通过。

任何产品任务需要修改 Harness Core才能完成时，本 Ticket 必须判定 NO-GO；发布验证者不得在验收阶段修改 artifact或安装目录中的 Harness package。

## 操作员任务

发布验证者从一个精确提交构建一次版本化 Release Artifact。自动化技术门禁在 clean checkout 和隔离测试目录验证该 artifact；完整产品生命周期与人工 1:1 验收必须在 Ticket 13 自己的 Git worktree 中，使用 `runtime/production/installation.json`、`production` Configuration Profile、Release Artifact 内的 `harness-comfyui` CLI 和当前本地浏览器执行。两类验收必须读取同一个 `.release/quality/artifact.json` 和同一 tarball。

## 构建一次规则

1. release dry-run 接受显式 SemVer 与精确 commit。working tree 内容不进入 artifact。
2. 统一安全门禁在 frozen install 前执行；任一 high/critical advisory 或未审核 lifecycle script 阻止后续安装。
3. 质量命令从同一精确 commit 完成一次 build 和一次 pack，并生成唯一 `.release/quality/artifact.json`。manifest 至少包含 package version、commit、tarball 绝对路径、文件名、byte length 与 SHA-256。该 manifest 指向的 tarball 是 Tickets 13–14 唯一的 Release Artifact。
4. package validation、composition、e2e 和 release-smoke 只消费该 manifest 指向的同一 tarball，不重新 build/pack。
5. Release Artifact 必须包含应用 bundle、`skills/comfyui-generate/`、`skills/anima-prompt-builder/`、`skills/wai-sdxl-prompt-builder/`、`skills/lora-adjustment/`、四个 Configuration Profile、`bin.harness-comfyui`、全部 `scripts/deploy/*.mjs`、`scripts/profile/materialize.mjs`、`scripts/profile/start.mjs`、`profiles/comfyui-workbench/` 的三个模板文件，以及 `deployment/runtime/package.json`、`deployment/runtime/pnpm-lock.yaml` 和 `deployment/runtime/pnpm-workspace.yaml`；不包含运行数据、Saved Media、日志、凭据、测试 fixture、`prototype/`、来源系统内容或验收后生成的 release notes。
6. runtime manifest 必须把 `@deepseek-ai/dsh`、`@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app` 精确锁定为 `0.1.0-rc.8`，runtime lock 必须固定其完整已审核闭包。产品 CLI 必须把它们冻结安装到每个 release 自己的 `harness-runtime/`，并且只调用该目录的 `node_modules/.bin/dsh`。

## Artifact 自动化技术门禁

- composition、e2e 和 release-smoke 可以分别使用隔离 `DSH_HOME`、隔离 Configuration Profile、受控 Catalog/Source CLI fixture、隔离 Run Repository 和 Fake ComfyUI Jobs API，只验证 artifact 的安装、Host/Client composition、contract、生命周期、退出清理和确定性状态分支。
- fixture 必须实现正式 contract 的相同 operation、字段、错误和 credential isolation；fixture 不得进入 Release Artifact，也不得被正式产品配置加载。
- 每个自动化 script 自己拥有前台 Harness Host 生命周期，等待 readiness，执行断言，发送 SIGTERM，等待退出并检查端口释放。
- 产品 CLI 自动化必须覆盖 install、preflight、start、stop、restart、status、health、logs、upgrade 和 rollback，并证明这些命令使用同一 installation schema、PID state、日志与版本目录结构。tarball-only 测试必须在没有仓库 `node_modules`、源码 checkout 或全局 `dsh` 的目录中完成 install/start/status/health/logs/stop，并证明 Host 使用 release-local `harness-runtime/node_modules/.bin/dsh`。清除 ambient `HARNESS_COMFYUI_*` 后，production Host 必须读取 installation JSON 映射出的路径、ComfyUI instance、Source CLI 与 server 值。
- 自动化技术门禁不能替代完整人工 1:1 产品验收，不能把 clean checkout、隔离测试目录或 release-smoke Profile 写成视觉验收环境。

## Ticket 13 worktree 的完整产品验收

- 发布验证者必须进入 Ticket 13 自己的 Git worktree，读取当前 build 生成的 `.release/quality/artifact.json` 及其 tarball，通过 `npm exec --yes --package=<release-tarball> -- harness-comfyui install` 把该 tarball 安装到 `runtime/production/`，再只通过 `runtime/production/bin/harness-comfyui` 启动真实 Harness Host/Client。完整人工验收只能使用该 worktree installation 和当前本地浏览器；不得另建第二个测试 installation 替代它。
- 发布验证者必须通过 installed CLI 执行 status、health 和 logs，并执行一次成功 upgrade。发布验证者还必须用受控失败探针使候选版本 health 失败，证明 upgrade 自动恢复上一 active release，且 shared Run Repository、Run 文件、Saved Media 与日志均未移动、覆盖或删除。
- 正式产品候选、Source 摘要、Run Repository 和 MediaStore 记录必须来自 Tickets 03–12 的 PRD 指定的真实服务。原型只显示静态基准数据；原型数组和 fixture 不得作为正式浏览器数据。
- Ticket 13 worktree 只有在准备 `failed`、`submission_unknown`、取消竞态和其他 PRD 明确列出的故障可见状态时，才可以使用受控 Fake ComfyUI/Jobs 响应。该响应只能控制远端故障分支，不能替换真实 Catalog、Source、Run Repository 或 MediaStore。
- `tests/visual/prototype-fidelity-viewports.json` 是唯一桌面尺寸来源，固定只包含`1440×1000`。移动端布局、移动端导航、窄屏单panel与原型CSS断点不属于本版本。
- 独立视觉审核者不得是本 Ticket 的实现者。独立视觉审核者必须在当前本地浏览器以`1440×1000`操作静态原型与真实 Harness 产品，核对成对截图或录像并给出 PASS/FAIL；实现者自检和自动化测试不能替代独立验收。

## 浏览器任务清单

发布验证者必须在 Ticket 13 worktree 的真实 UI 中完成：

1. 搜索和选择 Session，发送普通消息并观察 Agent 增量文本。
2. 打开 Message Context Modal，在 3 列固定卡片网格中翻页，检查有封面和无封面占位卡片，选择真实资源并原子发送。
3. 完成单图生成、Tool Call 定位和 Actual Workflow 下载。
4. 在零、一个、多个运行 Chat Turn 间切换。
5. 观察 queue、running、downloading、success、failed 和 submission_unknown。
6. 打开任务 Modal，筛选、翻页并取消一项 active Job。
7. 在 Session/Workspace 媒体库筛选、翻页、打开原文件和下载 Workflow。
8. 查看一项包含图片、视频和音频的多输出 Run。
9. 分别使用两个Prompt Skill在中列生成Prompt，使用`lora-adjustment`在中列生成有序LoRA调整结果，并确认这三个轮次都没有新Run；随后显式调用`comfyui-generate`，确认同一数字`turn`保存Skill Invocation、Generation Tool Call和含合法`run_id` meta的Tool Result，且右侧第三列只按该meta建立结果链接。
10. 使用受控Jobs响应让同一个`run_id`依次经过队列等待、远端运行、保存媒体和终态；每一步都确认中列Generation Tool行的异步摘要与右列详细卡片读取同一Store revision。中列与右列同时可见时每个刷新周期只调用一次Remote；关闭右列但保持中列Tool行可见时，状态必须继续更新。

上述完整人工验收开始前，Issues #3–#13必须已经通过各自的真实composition与`1440×1000`桌面验收。任一Issue仍有未解决的public plugin seam阻塞或未完成产品能力时，Release Artifact验收必须判定NO-GO，不得把该能力写成已知限制后继续发布。

## 原型 1:1 验收范围

真实 Harness 产品必须按照 `prototype/generation-workbench/index.html`、`prototype/generation-workbench/app.js` 和 `prototype/generation-workbench/styles.css` 1:1 实现 Issues #3–#13 已交付的全部桌面可见产品区域。1:1 包含全部功能与信息、区域顺序、布局、尺寸、间距、对齐、滚动、字体、颜色、背景、边框、圆角、阴影、图标、媒体比例、badge、控件样式、用户文案、用户交互以及原型展示的 loading、空集合、无结果、选中、禁用、执行中、成功、失败和取消状态。

PRD 与父 Issue #1 只能补足原型未展示的产品要求。只有父 Issue #1 或用户后续决定明确标记的原型错误或缺口修正可以改变对应可见设计；验收证据必须逐项记录原型元素、替代设计、决定来源和成对证据。当前唯一已知可见例外是 PRD 05 增加“提示词条目”导航，并把 ComfyUI Instance 从 Message Context 候选移到独立 Execution Route。除此之外的可见差异全部判定为 FAIL。

## v0.82.2 Source 消费验收

Ticket 13 的 source evidence 必须按 `config/source-contract-v0.82.2.json` 记录：Installation pin 为 `imagegen-source-contract` + `0.82.2`；Catalog discovery 是裸 OpenAPI 3.1 对象；Source discovery 是 `status/message/results/page/page_size/total_count` envelope；两个 CLI 只做 raw-passthrough transport gate，Harness adapter 执行业务 Schema gate。十个 Catalog operation、两个 Source operation 和模板 `expected_output_node_ids_json` 非空数组都必须有真实结果记录。CLI 退出码 `0` 不能单独证明业务 Schema PASS。

## Release notes 与 Preview

release notes 必须列出版本、commit、Source Contract Identity 要求、Configuration Profile 变化、Run Repository 兼容性、产品 CLI 命令、已知限制和用户自行安装所需的版本要求。release notes 是 Release Preview 与后续 GitHub Release 的伴随元数据，不写回 tarball，也不改变 `.release/quality/artifact.json` 或其 SHA-256。Release Preview 另外包含全部自动化门禁结果、artifact identity、包内容清单、产品生命周期 PASS 和 Ticket 13 worktree 的完整 1:1 PASS 证据。

## 失败行为

- 任一安全、类型、测试、构建、包内容、clean install、Host readiness、浏览器任务或独立 1:1 审核失败时结论为 NO-GO。
- NO-GO 不创建 tag、不推送版本、不创建 GitHub Release。
- 失败证据记录具体阶段、命令、产品任务、桌面尺寸和错误；不得把超时当作通过。

## 产品验收

1. 从精确 commit 删除 `lib/` 与 `.release/` 并执行一次统一质量/发布 dry-run；package validation、composition、e2e、release-smoke、产品 CLI 验收、Release Preview 与 Ticket 14 全部读取 `.release/quality/artifact.json` 并记录同一 tarball，生成 release notes 前后 artifact 不变。
2. clean checkout 自动化技术门禁证明没有当前开发源码时仍能通过产品 CLI 安装、启动、检查状态、读取日志和停止 artifact；该结论不代替 Ticket 13 worktree 的视觉验收。
3. Ticket 13 worktree 的 `runtime/production/` installation 和当前本地浏览器在`1440×1000`完成全部浏览器任务，并获得非实现者独立视觉审核PASS。
4. 成功 upgrade 后 active release 指向候选版本；候选 health 失败后自动恢复上一版本，shared 数据与日志保持不变。
5. 验收结束通过 installed CLI 执行 stop 后没有 Harness/Fake ComfyUI 子进程或监听端口。
6. tarball 内 `package/package.json` 声明 `bin.harness-comfyui`，并包含四个 release-local Skill目录、四个 Configuration Profile、全部 CLI deploy modules、两个 profile helper、三个 profile 模板和三个 `deployment/runtime/` 结构化文件；包和日志扫描均不包含运行数据、fixture credential、Authorization 或 API Workflow 下载入口。
7. Release Preview 生成后流程停止，等待用户单独批准实际 Git tag 与 GitHub Release。

## 不属于本 Ticket

本 Ticket 不创建 Git tag 或 GitHub Release，不安装到用户环境，不执行任何版本发布后的部署、激活、健康检查、写验证或回滚。
