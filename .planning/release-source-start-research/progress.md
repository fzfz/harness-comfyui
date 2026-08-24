# Release 与源码生产启动调研进度

## 2026-08-24

- 读取并采用 `diagnosing-bugs`、`research`、`planning-with-files` 和 `find-docs` 的执行规范。
- 运行 planning session catchup；catchup 没有报告未同步上下文。
- 检查当前工作区：`main` 与 `origin/main` 同步，未跟踪目录只有 `.planning/issue-1-native-ui-entry-discussion/`。
- 确认仓库根目录已有其他任务的三个过程文件；本次调研改用隔离目录。
- 读取与当前仓库相关的历史记录；历史记录只能用来确定检查方向，当前结论必须用本轮代码和 GitHub 状态验证。
- 首次运行 `pnpm run prod:start` 时，pnpm 在脚本解析前尝试刷新 `node_modules`，然后因非交互终端中止；该命令没有安装或删除依赖，后续不再通过 pnpm 运行反馈环。
- 运行不依赖 pnpm 的源码生产入口反馈环；该命令以退出码 1 证明 `package.json` 没有 `prod:start`。
- 运行 `node scripts/deploy/cli.mjs start`；该命令以退出码 1 证明现有 production start 必须接收绝对 installation JSON。
- 读取 package scripts、release/deploy workflows、release PRD、delivery ADR 和生命周期实现；当前实现把 tarball 与 active release state 设为生产启动前提。
- 通过 `gh` 读取默认分支、workflow、Release、tag、Actions 和 Issues 的实时状态；最新 `v0.1.17` Release 附加了 802398-byte 产品 tarball。
- 确认当前三个 GitHub workflow 都没有发布 tag/Release 的实现；当前 Release 的实际创建命令无法从 workflow 代码直接得出。
- 一个 shell tracked-file 分类循环产生了不可信结果；调研者已停止使用该输出，等待用 `git ls-files --stage -- <path>` 重新核对。
- 使用 `git ls-files --stage` 纠正 tracked 状态，并确认 GitHub source archive 缺少完整 `lib/` build outputs。
- 读取源码 profile materializer、Configuration Profile loader、production profile 和 installation 环境映射；现有底层 helper 可以接受 production，但 package scripts 和源码配置注入没有暴露该路径。
- 读取 README blame、Git 历史和 GitHub Issues #1/#14/#15；当前仓库同时保留“Release 不附加 tarball”的说明和“Release 必须附加同一 tarball”的 Issue/PRD 硬要求。
- 读取 GitHub 官方 Release、source archive 与 `gh release create` 文档；官方契约确认自定义 binary asset 是可选项，tag/Release 会自动提供源码归档入口。
- 比较 `v0.1.0-rc.7`、`v0.1.3` 与 `v0.1.17` 的实时 assets，并读取 `21e8181`、`b292e1cd`、`f2edfa9` 的历史差异；确认附件流程在后续发布合同中逐步固化。
- 读取 package/workflow/profile/deploy contract 测试；当前自动化明确锁定 tarball-only 产品路径，并未覆盖源码 production runner。
- 按 `codebase-design` 的 seam 规范形成方向：把 production 配置到 Harness foreground process 的映射收敛成一个 source production runner，不复制 artifact lifecycle。
