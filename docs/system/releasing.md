# 版本发布规范

GitHub Release 发布 Git tag 与 Release 记录，不附加产品安装包。`package.json.version` 是产品版本的唯一结构化来源，Git tag 使用 `v<package.json.version>`。

## 发布前门禁

版本源码提交前执行：

```sh
pnpm quality
git diff --check
```

源码提交并 push 后，GitHub CI 必须同时通过 Ubuntu `Source quality gates` 和 macOS `DSH Desktop acceptance`。发布说明和受影响的系统规范完成独立语义审查后，再次执行 `pnpm quality` 与 `git diff --check`，提交并 push 最终文档。

最终发布提交必须同时满足：

1. 根 `package.json.version` 等于目标 SemVer。
2. `README.md`、`docs/releasenotes.md` 与 `docs/system/` 描述当前实现。
3. GitHub CI 的两个 job 成功。
4. 目标 Git tag 与 GitHub Release 尚不存在。

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
pnpm prod:stop
git fetch --tags
git switch --detach v<版本号>
git -C .local/upstreams/dsh-desktop fetch https://github.com/fzfz/dsh-desktop.git codex/configurable-mobile-bridge-port
git -C .local/upstreams/dsh-desktop switch --detach FETCH_HEAD
(cd .local/upstreams/dsh-desktop && npm ci)
pnpm install --frozen-lockfile
pnpm desktop:dependencies:link
pnpm prod:start
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

`v0.37.4` 的 DSH Desktop checkout 必须使用 `fzfz/dsh-desktop:codex/configurable-mobile-bridge-port`。该分支提供移动桥接端口环境变量；Harness ComfyUI 仓库不包含或复制 DSH Desktop 源码。

## 开发与 Web 调试边界

- `dev:*` 只在从 `main` 创建的 linked worktree 管理完整 DSH Desktop 开发环境。
- `web:*` 只在 linked worktree 管理独立 Web Host 调试环境。
- `prod:*` 只在已发布 Git tag 的生产 checkout 管理完整 DSH Desktop 生产环境。
- CI 验证源码门禁和真实 Desktop 验收；仓库不创建自动生产部署 workflow。
