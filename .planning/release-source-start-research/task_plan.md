# Release 与源码生产启动调研计划

## Goal

调研者必须核对当前仓库和 GitHub 仓库的真实发布流程，复现 GitHub checkout 后的源码生产启动失败，并向用户提供符合“发布版本时只创建 GitHub Release 与 Git tag”的最小改造方案。

## Scope

- 本轮只读取仓库、GitHub 状态和官方技术资料。
- 本轮可以新增调研记录和本目录中的过程记录。
- 本轮不修改发布脚本、GitHub Actions、生产启动脚本、依赖版本或 GitHub Release。

## Phases

### Phase 1: 建立可复现证据

- [x] 调研者核对当前分支、本地 GitHub Actions、package scripts、发布脚本和生产启动入口。
- [x] 调研者在不安装依赖、不修改生产环境的前提下构造并运行能够判定源码生产启动条件的命令。
- **Status:** completed

### Phase 2: 定位偏差和根因

- [x] 调研者比较用户原始发布需求、当前发布实现和 GitHub Release 实际产物。
- [x] 调研者列出源码 checkout 缺少的运行产物、生成步骤或安装前提，并追踪这些前提的唯一生产者。
- **Status:** completed

### Phase 3: 核对官方契约

- [x] 调研者使用 GitHub 官方资料验证 tag、Release、source archive 和可选 Release asset 行为。
- **Status:** completed

### Phase 4: 形成方案

- [ ] 调研者给出目标发布流程、源码生产启动流程、具体文件改动边界、迁移顺序和分支完整测试清单。
- [ ] 调研者明确推荐方案、可选方案和不建议保留的流程。
- **Status:** in_progress

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| 现有仓库根目录已经包含其他任务的 `task_plan.md`、`findings.md` 和 `progress.md` | 1 | 调研者使用 `.planning/release-source-start-research/` 保存本次过程记录，不覆盖现有文件。 |
| `pnpm run prod:start` 在查找脚本前尝试刷新现有 `node_modules`，随后因非交互终端报告 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` | 1 | 调研者不重复该命令，不设置 `CI=true`，不允许 pnpm 修改依赖；后续反馈环使用 Node 直接读取 `package.json`。 |
