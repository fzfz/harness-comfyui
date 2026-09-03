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

## Git tag 与 GitHub Release

在最终发布提交执行：

```sh
git tag --annotate v<版本号> <最终提交完整SHA> --message "Harness ComfyUI v<版本号>"
git push origin refs/tags/v<版本号>
gh release create v<版本号> \
  --verify-tag \
  --title "Harness ComfyUI v<版本号>" \
  --notes-file docs/releasenotes.md
```

发布后核对远端 tag 指向最终提交完整 SHA，GitHub Release 指向该 tag，并确认 Release 附件列表为空。已经发布的 tag 与 GitHub Release 不得移动或覆盖；最终提交发生变化时必须使用新的版本号。

## Git tag 生产部署命令

生产 checkout 保留本地 `.env`、`.local/upstreams/dsh-desktop` 和 `.local/desktop-production/`。从已发布 tag 更新并启动完整 Desktop：

```sh
(
set -e
pnpm prod:stop
git fetch --tags
git switch --detach v<版本号>
git -C .local/upstreams/dsh-desktop fetch https://github.com/fzfz/dsh-desktop.git 9a0a39416af44af636e426f8d627cdb80d0baa77
git -C .local/upstreams/dsh-desktop switch --detach FETCH_HEAD
test "$(git -C .local/upstreams/dsh-desktop rev-parse HEAD)" = "9a0a39416af44af636e426f8d627cdb80d0baa77"
(cd .local/upstreams/dsh-desktop && npm ci)
pnpm install --frozen-lockfile
pnpm desktop:dependencies:link
pnpm prod:start
)
```

保持 `prod:start` 终端运行，在第二个终端执行：

```sh
pnpm prod:status
pnpm prod:logs
```

生产运行期间使用：

```sh
pnpm prod:restart
pnpm prod:stop
```

`prod:*` 管理完整 DSH Desktop 生产环境并调用 DSH Desktop `pnpm preview`。生产部署不得使用 `dev:*` 或 `web:*` 替代产品启动。

`v0.39.1` 的 DSH Desktop checkout 必须使用 `fzfz/dsh-desktop:codex/configurable-mobile-bridge-port` 的提交 `9a0a39416af44af636e426f8d627cdb80d0baa77`。该提交提供移动桥接端口环境变量和已修正的 OpenCode Go 静态模型目录；Harness ComfyUI 仓库不包含或复制 DSH Desktop 源码。

## 开发与 Web 调试边界

- `dev:*` 只在从 `main` 创建的 linked worktree 管理完整 DSH Desktop 开发环境。
- `web:*` 只在 linked worktree 管理独立 Web Host 调试环境。
- `prod:*` 只在已发布 Git tag 的生产 checkout 管理完整 DSH Desktop 生产环境。
- 独立 linked worktree 中的 `pnpm quality` 验证源码门禁和真实 Desktop 验收；仓库不配置 GitHub Actions workflow 或自动生产部署 workflow。
