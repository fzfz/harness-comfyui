# PRD 13：Release Artifact 的真实产品验收

## 关联 Ticket

Ticket 13 — 从一次构建的版本化产品包完成真实产品验收。

## 操作员任务

发布验证者从一个精确提交构建一次版本化 Release Artifact，在干净隔离目录安装该 artifact，启动真实 Harness Host/Client，并完成 Tickets 02–12 的浏览器任务；验证者据此生成可供用户批准的 Release Preview。

## 构建一次规则

1. release dry-run 接受显式 SemVer 与精确 commit。working tree 内容不进入 artifact。
2. 统一安全门禁在 frozen install 前执行；任一 high/critical advisory 或未审核 lifecycle script 阻止后续安装。
3. 质量命令完成一次 build 和一次 pack，并生成唯一 `.release/quality/artifact.json`。manifest 至少包含 package version、commit、tarball 绝对路径、文件名、byte length 与 SHA-256。该 manifest 指向的 tarball 是 Tickets 13–14 唯一的 Release Artifact。
4. package validation、composition、e2e 和 release-smoke 只消费该 manifest 指向的同一 tarball，不重新 build/pack。
5. Release Artifact 只包含应用 bundle、两个 Prompt Skill、配置模板和 license/readme；不包含运行数据、Saved Media、日志、凭据、测试 fixture、`prototype/`、来源系统内容或验收后生成的 release notes。

## 受控验收环境

- release-smoke 使用隔离 `DSH_HOME`、隔离 Configuration Profile、受控 Catalog/Source CLI fixture、隔离 Run Repository 和 Fake ComfyUI Jobs API。
- fixture 必须实现正式 contract 的相同 operation、字段、错误和 credential isolation；fixture 不能被 production profile 加载。
- 每个 composition、e2e、release-smoke script 自己拥有前台 Harness Host 生命周期，等待 readiness，执行断言，发送 SIGTERM，等待退出并检查端口释放。

## 浏览器任务清单

发布验证者必须在 artifact 启动的真实 UI 中完成：

1. 搜索和选择 Session，发送普通消息并观察 Agent 增量文本。
2. 打开 Message Context Modal，在 3 列固定卡片网格中翻页，检查有封面和无封面占位卡片，选择资源并原子发送。
3. 完成单图生成、Tool Call 定位和 Actual Workflow 下载。
4. 在零、一个、多个运行 Chat Turn 间切换。
5. 观察 queue、running、downloading、success、failed 和 submission_unknown。
6. 打开任务 Modal，筛选、翻页并取消一项 active Job。
7. 在 Session/Workspace 媒体库筛选、翻页、打开原文件和下载 Workflow。
8. 查看一项包含图片、视频和音频的多输出 Run。
9. 分别使用两个 Prompt Skill 完成生成闭环。

## Release notes 与 Preview

release notes 必须列出版本、commit、Source Contract Identity 要求、Configuration Profile 变化、Run Repository 兼容性、已知限制和回滚条件。release notes 是 Release Preview 与后续 GitHub Release 的伴随元数据，不写回 tarball，也不改变 `.release/quality/artifact.json` 或其 SHA-256。Release Preview 另外包含全部门禁结果、artifact identity、包内容清单和 release-smoke 证据。

## 失败行为

- 任一安全、类型、测试、构建、包内容、干净安装、Host readiness 或浏览器任务失败时结论为 NO-GO。
- NO-GO 不创建 tag、不推送版本、不创建 GitHub Release，也不触发生产部署。
- 失败证据记录具体阶段、命令、产品任务和错误；不得把超时当作通过。

## 产品验收

1. 删除 `lib/` 与 `.release/` 后执行一次统一质量/发布 dry-run；package validation、composition、e2e、release-smoke、Release Preview 与 Ticket 14 全部读取 `.release/quality/artifact.json` 并记录同一 tarball SHA-256，生成 release notes 前后该 SHA-256 不变。
2. 干净隔离目录没有当前 checkout 时仍能安装并启动 artifact。
3. 浏览器任务清单逐项通过，并与静态原型对应区域并排视觉检查。
4. 测试结束后没有 Harness/Fake ComfyUI 子进程或监听端口。
5. 包内容和日志扫描不包含运行数据、fixture credential、路径、Authorization 或 API Workflow 下载入口。
6. Release Preview 生成后流程停止，等待用户单独批准实际 Git tag 与 GitHub Release。

## 不属于本 Ticket

本 Ticket 不创建 Git tag、GitHub Release，不访问 production，不执行生产 ComfyUI 写操作。
