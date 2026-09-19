# 版本发布规范

GitHub Release 发布 Git tag 与 Release 记录，不附加产品安装包。`package.json.version` 是产品版本的唯一结构化来源，Git tag 使用 `v<package.json.version>`。

## 发布前门禁

计划执行者必须先在独立 linked worktree 完成最终源码、测试、版本元数据、发布说明和受影响的系统规范。源码变更必须通过独立 Standards Review 和独立 Spec Review；Skill、Markdown 和用户可见文案变更必须通过独立语义 Review。

计划执行者处理完全部审查问题后，必须对最终候选树执行：

```sh
pnpm quality
git diff --check
```

`pnpm quality` 是仓库唯一的完整自动化测试命令。该命令依次执行安装前依赖检查、Harness 边界检查、类型检查、覆盖率测试、合同与安全测试、生产生命周期测试、原型测试和真实 Desktop 测试。`git diff --check` 和必需的独立审查是另外两类发布门禁。审查问题或门禁失败导致任何文件变化时，计划执行者必须重新执行受影响的独立审查、`pnpm quality` 和 `git diff --check`。

本地门禁通过后，计划执行者不得再修改候选树。计划执行者必须提交该候选树、推送最终提交，并确认本地 `HEAD` 与 `origin/main` 指向同一个完整提交 SHA。

最终发布提交必须同时满足：

1. 根 `package.json.version` 等于目标 SemVer。
2. `README.md`、`docs/releasenotes.md` 与 `docs/system/` 描述当前实现。
3. 必需的独立审查、`pnpm quality` 和 `git diff --check` 全部通过。
4. 本地 `HEAD` 与 `origin/main` 指向同一个完整提交 SHA。
5. 目标 Git tag 与 GitHub Release 尚不存在。

## v0.44.2 的发布范围与发布条件

v0.44.2 更新 Stable 基线、DSH peer 范围、纯 CLI Profile 和包管理器版本，详情见 [v0.44.2 发布说明](../releasenotes.md#harness-comfyui-v0442)。用户已授权创建 PR、合入 main、同步本地 main、发布 v0.44.2 并部署生产目录。三种 Preset 的真实 Desktop 模型验收已完成，证据见[基线验证记录](../verification/upstream-baseline-20260919.md)。发布执行者必须按本文件核对最终提交与发布门禁。

## v0.44.1 的历史发布范围与 Desktop 基线

v0.44.1 发布渐进式 CLI 帮助、参数修正指引、事实观察默认提示词、请求阶段日志与输出截断错误。该历史版本使用 Desktop 2.0.9、DSH 0.1.5-rc.1 和 Electron 43.3.0，源码身份以 v0.44.1 tag 中的 config/desktop-baseline.json 为准。部署验收必须确认当前插件版本为 0.44.1，生产 checkout 与发布提交一致。部署保留已保存的图片读取配置；默认提示词修复、真实回放结果及尚未通过的验收见 [v0.44.1 发布说明](../releasenotes.md#harness-comfyui-v0441)。

## v0.44.0 的历史发布范围与 Desktop 基线

v0.44.0 将 managed CLI、Catalog/Generation、图片读取和 Web 展示分别装配，增加纯 DSH CLI Profile。该历史版本的 Desktop、DSH 与 Electron 基线以 v0.44.0 tag 中的 config/desktop-baseline.json 为准。部署验收必须确认当前插件版本为 0.44.0，生产 checkout 与发布提交一致，并完成本文规定的生产验收。已记录的 Desktop 真实模型验收超时和基线依赖公告见 [v0.44.0 发布说明](../releasenotes.md#harness-comfyui-v0440)。

## v0.43.1 的历史发布范围与 Desktop 基线

v0.43.1 改进插入上下文弹窗的两列资源列表、分类详情和图片预览，具体范围见 [v0.43.1 发布说明](../releasenotes.md#harness-comfyui-v0431)。共用 Desktop 基线见下文 v0.43.0 历史说明。该版本的部署验收确认插件版本为 0.43.1、生产 checkout 与发布提交一致。

## v0.43.0 的历史发布范围与 Desktop 基线

v0.43.0 使用自有 Desktop 2.0.9 与 DSH 0.1.5-rc.1，固定提交由 config/desktop-baseline.json 指定。工作台结果页采用原生右侧栏页签，两个项目预设采用 Persona prefix 配置。会话删除、真实 Session 请求头、Provider 推理配置和 managed CLI 路由鉴权继续由自有 Desktop 补丁提供。该版本的部署验收确认插件版本为 0.43.0、生产 checkout 与发布提交一致。

## Git tag 与 GitHub Release

发布执行者必须从 Harness checkout 根目录执行以下命令；任一命令失败时，shell 必须立即停止：

```sh
set -e
release_version="$(node -p "require('./package.json').version")"
test -n "$release_version"
release_commit_sha="$(git rev-parse HEAD)"
test "$release_commit_sha" = "$(git rev-parse origin/main)"
git tag --annotate "v$release_version" "$release_commit_sha" --message "Harness ComfyUI v$release_version"
git push origin "refs/tags/v$release_version"
gh release create "v$release_version" \
  --verify-tag \
  --title "Harness ComfyUI v$release_version" \
  --notes-file docs/releasenotes.md
```

发布后核对远端 tag 指向最终提交完整 SHA，GitHub Release 指向该 tag，并确认 Release 附件列表为空。已经发布的 tag 与 GitHub Release 不得移动或覆盖；最终提交发生变化时必须使用新的版本号。

## 当前 Desktop 的安装准备

发布执行者从待发布提交读取 config/desktop-baseline.json，并准备其中指定的 fzfz/dsh-desktop-anywhere commit 与 Stable workspace。发布执行者必须按照该 commit 的 yarn.lock 预先列出依赖版本、安装步骤和依赖审计结果；取得安装授权后才安装和构建。开发启动脚本只使用已安装环境，不自动安装或升级上游依赖。Desktop 2.0.11 的 Stable 构建与 Electron 原生绑定准备命令见[启动规范](startup.md#主开发-checkout-依赖准备)。

发布执行者必须验证源码 origin、完整 commit、Desktop、Harness 和 Electron 版本与基线配置一致，并完成当前插件的真实 Desktop 门禁。旧 fork 的补丁及历史验收记录不能代替 anywhere Stable 的验收结果。

## 生产部署与验收

生产部署需要明确授权。部署执行者保留生产 checkout 的 .env、上游安装目录和运行状态，停止已核实身份的生产实例，从已发布 Git tag 更新受管源码。部署执行者按当前基线准备已获准的 Desktop 安装，并核对待运行提交与发布提交一致。

部署执行者从生产 checkout 执行 pnpm prod:start，保持该终端运行，并在第二个终端执行 pnpm prod:status 与 pnpm prod:logs。prod:* 使用与 dev:* 相同的 Profile 安装和 Electron 生命周期实现，生产实例不启用远程调试端口。

验收执行者必须确认当前插件版本、Profile 安装来源、进程组启动入口、Host 监听端口归属，以及本次启动 run 的 Renderer 健康完成记录；随后确认 Client 显示 ComfyUI 工作台，remote.agentPresets.list 返回两个项目 Preset，remote.harnessComfyuiImageReader.models 返回配置中的模型分组，remote.harnessComfyuiCatalog.baseModels 返回数据源的基础模型记录。生产数据迁移须另行确定迁移对象与验收方案。

## 开发与 Web 调试边界

- `dev:*` 只在从 `main` 创建的 linked worktree 管理完整 DSH Desktop 开发环境。
- `web:*` 只在 linked worktree 管理独立 Web Host 调试环境。
- `prod:*` 只在已发布 Git tag 的生产 checkout 管理完整 DSH Desktop 生产环境。
- 独立 linked worktree 中的 `pnpm quality` 验证源码门禁和真实 Desktop 验收；仓库不配置 GitHub Actions workflow 或自动生产部署 workflow。

## v0.41.1 的 Desktop 版本与依赖公告

v0.41.1 使用的 `fzfz/dsh-desktop` 提交 `f2a27b4461e8c15d21268533efb7b99bb9bb14f2` 包含提交 `8b018c991fe88abdb61939b280c3dbea020acfc8` 的全部变更，以及 DSH Desktop PR #3 和 PR #4 引入的变更。

生产部署按照该 Desktop 提交的 `package-lock.json` 安装全部锁定依赖，其中包含 `pptxgenjs 4.0.1 → image-size 1.2.1`。2026-09-05 的安装前检查发现 `GHSA-w3rx-r6r6-pgpr` 和 `GHSA-5p2g-fcmc-qvqq` 两项高危公告。用户已明确授权执行该锁文件安装；发布记录必须保留这两项发现。
