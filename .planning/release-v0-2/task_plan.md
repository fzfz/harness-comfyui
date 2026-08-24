# v0.2 发布与文档重构计划

## 目标

删除原 deploy 与 release 打包体系，建立基于版本修改、Git 提交、push、CI/CD 和 GitHub Release tag 的发布流程；补齐符合当前源码的系统文档，重写 README，完成独立语义验收并发布 `v0.2`。

## 下一步

发布工作已完成。

## 当前阶段

阶段 6：GitHub Release 已发布并验证。

## 阶段

| 阶段 | 状态 | 验收对象 |
| --- | --- | --- |
| 1. 现状与删除范围审计 | 已完成 | deploy/release 文件、package scripts、CI workflow、文档与测试依赖清单 |
| 2. 删除旧流程并修改版本 | 已完成 | 删除 deploy 全部逻辑、测试、文档、现有包和 release 打包逻辑；`package.json.version` 改为 `0.2.0` |
| 3. 首次提交与 CI/CD | 已完成 | 提交并 push 删除与版本修改，所有必需检查通过 |
| 4. 重写文档体系 | 已完成 | README、技术栈、架构、目录、配置、测试、版本发布、系统启动、`docs/releasenotes.md`、AGENTS 引用 |
| 5. 文档验收与第二次 CI/CD | 已完成 | 独立语义审核通过；提交并 push 文档；所有必需检查通过 |
| 6. 发布 GitHub Release | 已完成 | 创建并验证 Git tag 与 GitHub Release `v0.2` |

## 固定决策

- npm package 版本使用合法 SemVer `0.2.0`；GitHub Release tag 使用用户指定的 `v0.2`。
- 源码生产生命周期只保留 `pnpm prod:start|stop|restart|status|health|logs`，自动化验证使用 `pnpm prod:test`。
- 发布流程不构建、不打包、不安装 artifact，不提供 release/upgrade/rollback 生命周期命令。
- 删除动作只覆盖审计确认属于旧 deploy/release 打包体系的文件；保留源码启动与产品运行所需模块。
- 根目录现有计划文件和其他未跟踪目录属于用户现有工作，不纳入本次提交。

## 错误记录

| 错误 | 次数 | 处理 |
| --- | ---: | --- |
| 暂无 | 0 | — |
