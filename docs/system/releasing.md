---
文档用途: 定义插件候选、发布、安装和生产切换的门禁与授权要求。
读取时机: 准备版本、构建发行包、发布或更新生产插件前。
---
# 插件版本发布规范

## 交付物与版本来源

1. Harness ComfyUI 以预构建 tarball 交付。`package.json.version` 是插件版本的唯一结构化来源，Git tag 使用 `v<package.json.version>`。普通用户通过官方 Desktop 的插件管理界面安装对应 GitHub Release 附件。
2. `package.json` 定义宿主、SDK peers 与公开导出。发布者必须核对 tarball 中的精确约束、导出目标、`dsh.bundle.patch` 和 `dsh.client`；所有运行入口必须位于 tarball 内。

## 候选包与发布门禁

1. 计划执行者必须在独立 linked worktree 中准备源码、测试、版本元数据、发布说明和受影响的系统文档。源码变更须通过独立 Standards Review 和 Spec Review；Skill、Markdown 和用户可见文案须通过独立语义 Review。
2. 发布者在候选工作树的根目录依次运行 `pnpm build` 和 `pnpm pack:plugin`。构建与资源清单由 `config/runtime-artifacts.json` 和 `config/plugin-package.json` 定义；候选包须通过官方插件安装验收。
3. 全部审查问题处理完成后，计划执行者必须对最终候选树执行以下门禁。

   ```sh
   pnpm quality
   git diff --check
   ```

4. `pnpm quality` 的覆盖范围见[测试规范](testing.md)。审查或门禁修正改变文件后，计划执行者必须重跑受影响的独立审查、`pnpm quality` 和 `git diff --check`。全部通过后，计划执行者必须保持候选树不变并提交该树。
5. 最终发布提交必须满足以下条件。

   1. `package.json.version` 等于目标 SemVer，tarball 使用该版本命名。
   2. `README.md`、`docs/releasenotes.md` 和 `docs/system/` 准确描述候选实现。
   3. 第 1、3、4 项的审查与门禁全部通过。
   4. 当前获准任务要求的官方应用、真实模型和业务验收全部通过。
   5. 本地 `HEAD` 与 `origin/main` 指向同一个完整提交 SHA。
   6. 目标 Git tag 与 GitHub Release 均不存在。

## Git tag、GitHub Release 与插件附件

1. 取得发布授权后，发布执行者必须从最终提交创建注释 tag、推送 tag，并把同一提交构建的 tarball 附加到 GitHub Release。任一步骤失败时，shell 必须立即停止。

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

2. 发布者必须核对远端 tag 指向最终提交的完整 SHA、GitHub Release 指向该 tag，且附件包含本次 tarball。已经发布的 tag 和 Release 必须保留原提交身份；最终提交变化时，发布者必须使用新版本号。

## 官方 Desktop 安装、更新与生产验收

1. 安装者使用符合插件 `engines.dsh` 约束的官方 DeepSeek Harness Desktop，在 Plugins 界面安装 Release 的固定版本 tarball。应用重开后，验收者核对插件版本、实际加载目录、配置和数据归属，再按获准任务完成业务验收。
2. 更新前，更新执行者必须等待活动 Run 完成并完全退出应用，再备份 Profile 中的插件设置、凭据引用和插件业务数据。更新后，验收者必须核对设置、凭据、历史 Run、媒体与 Workspace 关联。操作和恢复步骤见[安装与更新指南](../user/install-update.md)。
3. 生产交付使用 Release 附件。`/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env` 保留为旧版本、配置与数据的迁移来源；源码、测试和发布文件在开发仓库修改。
4. 合并、发布、生产切换、历史迁移、旧实例停止、旧环境归档或删除须分别取得明确授权。执行者必须记录 tag、完整 SHA、发行包地址与版本、官方应用版本、加载目录、业务结果、备份位置和恢复步骤。
5. 生产插件故障须在开发仓库修复；部署版本需要改变时，须发布新的补丁版本。维护者必须保留生产专属配置和运行数据，并用正式发行包验证生产结果。

## 开发与验证入口

1. `pnpm test:desktop` 构建并安装候选，验证官方界面、业务与资源释放。交互调试和证据要求见[worktree 规范](../agents/worktree-development.md)。
