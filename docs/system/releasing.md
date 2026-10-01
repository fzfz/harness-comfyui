# 插件版本发布规范

Harness ComfyUI 以预构建插件 tarball 作为正式交付物。`package.json.version` 是插件版本的唯一结构化来源，Git tag 使用 `v<package.json.version>`。发布执行者将本次候选 tarball 附加到对应 GitHub Release；普通用户从官方 DeepSeek Harness Desktop 的插件管理界面安装并运行该版本。

本版已经采用官方 Desktop 插件交付方式。新的官方 Desktop 自动化入口已通过完整回归，旧 Desktop、Web Host 和 headless 启动与安装入口已退役。最终候选真实验收、独立审查和完整质量门禁的状态由[验收记录](../verification/official-desktop-plugin/acceptance-status.json)保存。发布与生产切换必须满足本文各自的条件和授权。

2026-10-01 本轮交付按用户最新要求执行合并、发布、正式数据迁移和插件安装，并停止追加验收。本轮执行者依据已有完整质量检查结果交付，保留此前未完成项目的原状态；具体范围见[本轮交付记录](../verification/official-desktop-plugin/delivery-scope-20261001.json)。下文继续定义常规版本的发布规则。

## 候选包与发布门禁

发布者在最终候选提交的根目录依次运行 `pnpm build` 和 `pnpm pack:plugin`。前者生成 Host、Client、managed CLI 和 Workflow worker 运行产物；后者按 `config/plugin-package.json` 组装包内配置、Preset、Skills、CLI 资源和编译产物，并生成 `harness-comfyui-<version>.tgz`。发布者核对归档中的 `package.json`、`exports`、`dsh.bundle.patch` 和 `dsh.client` 引用均指向归档内文件，再使用该 tarball 完成官方插件安装验收。

计划执行者必须在独立 linked worktree 中准备最终源码、测试、版本元数据、发布说明和受影响的系统规范。源码变更必须通过独立 Standards Review 和独立 Spec Review；Skill、Markdown 和用户可见文案变更必须通过独立语义 Review。全部审查问题处理完成后，计划执行者必须对最终候选树执行：

```sh
pnpm quality
git diff --check
```

`pnpm quality` 是仓库完整自动化门禁，包含安装前依赖检查、Harness 边界检查、类型检查、覆盖率测试、合同与安全测试、插件构建、Profile 与安装夹具测试、原型测试和官方 Desktop 自动化回归。独立审查和 `git diff --check` 是另外两项发布门禁。审查或门禁修正改变任何文件后，计划执行者必须重跑受影响的独立审查、`pnpm quality` 和 `git diff --check`。三个门禁全部通过后，计划执行者必须保持候选树不变并提交该树。

最终发布提交必须同时满足以下条件：

1. 根 `package.json.version` 等于目标 SemVer，插件 tarball 使用该版本命名。
2. `README.md`、`docs/releasenotes.md` 和 `docs/system/` 准确描述候选实现。
3. 必需的独立审查、`pnpm quality` 和 `git diff --check` 全部通过。
4. 本地 `HEAD` 与 `origin/main` 指向同一个完整提交 SHA。
5. 目标 Git tag 与 GitHub Release 均不存在。
6. [官方 Desktop 插件升级方案的验收清单](../plans/official-desktop-plugin-20260929.md#验收清单)以 A1 至 A18 标识各项验收；其中 A1 至 A15 与 A18 的候选记录必须满足对应通过条件。

`package.json` 是 SDK peer 版本与运行时 `exports` 的权威来源。发布者必须在候选 tarball 中核对该 manifest 的精确版本和所有导出目标，并使用包内构建文件验证每个运行入口。

## Git tag、GitHub Release 与插件附件

发布执行者必须从最终 Harness 提交创建注释 tag、推送 tag，并把同一提交构建的 tarball 附加到 GitHub Release。任一步骤失败时，shell 必须立即停止：

```sh
set -e
release_version="$(node -p "require('./package.json').version")"
test -n "$release_version"
release_commit_sha="$(git rev-parse HEAD)"
test "$release_commit_sha" = "$(git rev-parse origin/main)"
plugin_archive=".local/plugin-packages/harness-comfyui-$release_version.tgz"
test -f "$plugin_archive"
git tag --annotate "v$release_version" "$release_commit_sha" --message "Harness ComfyUI v$release_version"
git push origin "refs/tags/v$release_version"
gh release create "v$release_version" "$plugin_archive" \
  --verify-tag \
  --title "Harness ComfyUI v$release_version" \
  --notes-file docs/releasenotes.md
```

发布后，发布者核对远端 tag 指向最终提交的完整 SHA，GitHub Release 指向该 tag，并且 Release 附件中包含本次 tarball。发布者必须保留已经发布的 tag 和 GitHub Release 的原提交身份；最终提交发生变化时，发布者必须使用新版本号。GitHub Release 附件只用于官方插件管理器安装和候选回装，不包含 Desktop 安装包。

## 官方 Desktop 安装、更新与生产验收

正式使用环境的插件来源是 GitHub Release 中的固定版本 tarball。安装者在官方 DeepSeek Harness Desktop `0.2.0-rc.2` 的 Plugins 界面添加该 tarball、启用插件并按提示重新打开应用。正式环境的宿主安装、启动、退出、Profile 和模型凭据均由官方应用管理。生产验收者核对应用显示的插件版本、插件实际安装目录、配置和数据归属，并按 A16 与 A18 完成真实业务验收。

插件更新通过官方插件管理器卸载旧版本、安装目标 tarball 并重新打开应用。更新执行者须先等待活动 Run 完成并完全退出应用，然后备份本插件在官方 Profile 中的设置、凭据引用和 `ctx.dshHomePath()` 下的业务数据。更新后，验收者核对插件版本、设置、凭据引用、历史 Run、媒体及 Workspace 关联；失败时按备份恢复步骤回装前一插件版本并复验。配置与数据的实际文件位置和操作步骤由用户安装与更新指南定义；插件版本间保留合同由 A4 验收。

生产交付使用官方应用中的发行 tarball，不使用 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env` 构建或安装源码。该旧生产 checkout 在获授权的旧环境退役前只保留为旧版本、配置和数据的迁移来源。首次生产切换、历史数据迁移、旧实例停止、旧环境归档或删除都需要各自的明确授权；发布授权也不能替代合并或生产切换授权。切换与退役按已批准方案 A16、A17、A18 记录发布 tag、完整提交 SHA、发行包地址和版本、官方应用版本、实际加载目录、业务结果、备份位置及恢复说明。本文不表示任何尚未获准的发布、合并、切换、迁移或旧环境处置已经执行。

生产插件故障须形成仓库修复；部署版本需要改变时须发布新的补丁版本。维护者必须保留生产专属配置和运行数据，在开发仓库完成修复，再使用正式发行包完成生产验证。

## 开发与验证边界

- `pnpm build` 与 `pnpm pack:plugin` 构建并打包插件；预设结构校验在构建开始前执行。
- `pnpm test:desktop` 自动构建候选包、启动隔离官方应用、执行安装与业务验收，并核对进程、端口和租约清理。交互调试与证据要求见[worktree 规范](../agents/worktree-development.md)。
- 插件日常运行及生产使用由官方应用管理。旧生产 checkout、历史数据和旧安装的操作按“官方 Desktop 安装、更新与生产验收”的授权规则执行。
- 独立 worktree 的审查、本地完整质量门禁和官方应用验收是发布准备的必需步骤。

## v0.44.3 的历史发布范围与发布条件

v0.44.3 把 Desktop 更新到 2.0.15、DSH 更新到 0.1.7-rc.2、Electron 更新到 44.0.0，并迁移产品 Preset 注册和 Profile 设置持久化。该版本发布与生产验收使用当时的 Desktop checkout 交付方式；该记录只描述 v0.44.3 历史状态。历史验收记录见 [v0.44.3 发布说明](../releasenotes.md#harness-comfyui-v0443) 和 [运行验收记录](../verification/dsh-desktop-20260928/runtime-acceptance.md)。

## v0.44.2 的历史发布范围与发布条件

v0.44.2 更新 Stable 基线、DSH peer 范围、纯 CLI Profile 和包管理器版本，详情见 [v0.44.2 发布说明](../releasenotes.md#harness-comfyui-v0442)。该版本当时获得了创建 PR、合入 main、同步本地 main、发布 v0.44.2 并部署生产目录的授权。三种 Preset 的真实 Desktop 模型验收在当时完成，证据见[基线验证记录](../verification/upstream-baseline-20260919.md)。

## v0.44.1 的历史发布范围与 Desktop 基线

v0.44.1 发布渐进式 CLI 帮助、参数修正指引、事实观察默认提示词、请求阶段日志与输出截断错误。该历史版本使用 Desktop 2.0.9、DSH 0.1.5-rc.1 和 Electron 43.3.0，源码身份以 v0.44.1 tag 中的 config/desktop-baseline.json 为准。默认提示词修复、真实回放结果及尚未通过的验收见 [v0.44.1 发布说明](../releasenotes.md#harness-comfyui-v0441)。

## v0.44.0 的历史发布范围与 Desktop 基线

v0.44.0 将 managed CLI、Catalog/Generation、图片读取和 Web 展示分别装配，增加纯 DSH CLI Profile。该历史版本的 Desktop、DSH 与 Electron 基线以 v0.44.0 tag 中的 config/desktop-baseline.json 为准。已记录的 Desktop 真实模型验收超时和基线依赖公告见 [v0.44.0 发布说明](../releasenotes.md#harness-comfyui-v0440)。

## v0.43.1 的历史发布范围与 Desktop 基线

v0.43.1 改进插入上下文弹窗的两列资源列表、分类详情和图片预览，具体范围见 [v0.43.1 发布说明](../releasenotes.md#harness-comfyui-v0431)。共用 Desktop 基线见下文 v0.43.0 历史说明。

## v0.43.0 的历史发布范围与 Desktop 基线

v0.43.0 使用自有 Desktop 2.0.9 与 DSH 0.1.5-rc.1，固定提交由 config/desktop-baseline.json 指定。工作台结果页采用原生右侧栏页签，两个项目预设采用 Persona prefix 配置。会话删除、真实 Session 请求头、Provider 推理配置和 managed CLI 路由鉴权继续由自有 Desktop 补丁提供。

## v0.41.1 的历史 Desktop 依赖记录

v0.41.1 使用的 `fzfz/dsh-desktop` 提交 `f2a27b4461e8c15d21268533efb7b99bb9bb14f2` 包含提交 `8b018c991fe88abdb61939b280c3dbea020acfc8` 的全部变更，以及 DSH Desktop PR #3 和 PR #4 引入的变更。

历史生产部署按照该 Desktop 提交的 `package-lock.json` 安装全部锁定依赖，其中包含 `pptxgenjs 4.0.1 → image-size 1.2.1`。2026-09-05 的安装前检查发现 `GHSA-w3rx-r6r6-pgpr` 和 `GHSA-5p2g-fcmc-qvqq` 两项高危公告。该记录保留当时已授权部署所依据的依赖审计结果。
