# Installation-local CLI 修复计划

## 目标

安装完成后，用户通过 `<installation-root>/bin/harness-comfyui` 执行 `start`、`stop`、`restart`、`status`、`health`、`logs`、`upgrade` 和 `rollback` 时，不再传入 `--installation`。稳定入口必须把自身所属 installation root 内的 `installation.json` 传给 active release CLI。首次 `install` 和独立 `preflight` 继续接收显式 installation JSON 路径。

仓库根目录必须提供 `pnpm prod:*` 源码 production 入口。该入口直接使用当前源码仓库的现有运行前置条件、Skills、锁定依赖和 `production` Configuration Profile 启动真实 Harness Host，并提供 start、stop、restart、status、health 和 logs 的完整进程管理。该入口不要求调用者传递 installation JSON 路径。

GitHub Release、Git tag、build、Release Artifact、install、upgrade 和 rollback 不属于源码 production 进程管理 interface。本任务不在 `pnpm prod:*` 中提供这些命令或步骤。

## 阶段

| 阶段 | 状态 | 验收对象 |
|---|---|---|
| 1. 建立精确复现 | 已完成 | 安装后的 stable bin 执行 `stop` 时不传 `--installation` 的测试必须在现有实现上失败 |
| 2. 验证根因和命令边界 | 已完成 | 明确 bootstrap CLI、installation-local CLI 和源码 production CLI 的参数责任 |
| 3. 修改 stable bin 和完整分支测试 | 已完成 | stable bin 自动传递固定 installation JSON；installation-local 命令拒绝用户传入 `--installation` |
| 4. 增加 `pnpm prod:*` 源码 production 入口 | 已完成 | 当前源码仓库完成 start、stop、restart、status、health 和 logs |
| 5. 更新产品文档 | 已完成 | 操作文档使用 stable bin 简洁命令及 `pnpm prod:*` 源码 production 入口 |
| 6. 运行回归验证 | 已完成 | 参数测试、安装测试、生命周期测试、源码 production 测试和相关部署测试通过 |

## 实现约束

- stable bin 已经唯一属于一个 installation root，用户不能通过运行参数把它重新绑定到其他 installation。
- `installation.json` 是 stable bin 向 active release CLI 提供的内部输入，不是 installation-local 子命令的用户选项。
- `pnpm prod:*` 通过单一 production process module 复用现有 profile materialization、installation-to-environment 映射和进程状态实现，不复制第二套 Host 生命周期。
- `pnpm prod:*` 不执行 build，不安装源码仓库依赖，不生成或下载 artifact，不执行 install、upgrade、GitHub Release 或 Git tag 操作。
- `pnpm prod:*` 的调用者只选择命令；当前源码根、production state、production logs、production profile 和本机 production 配置路径由 module 内部唯一确定。
- 不增加静默搜索、当前目录推断或兼容分支；环境变量只允许使用 `config/environment-overrides.json` 声明的映射。
- 不修改 Skill 目录文件。
- 不改动仓库中与本任务无关的用户文件。

## 错误记录

| 错误 | 次数 | 处理 |
|---|---:|---|
| 完整 lifecycle 红灯测试等待 Host ready 10 秒后才报告缺少参数，反馈环过慢 | 1 | 增加只执行 stable-bin `stop` 的最小测试；该测试 1.5 秒内精确报告缺少 `--installation` |
| 错误地把 GitHub release、artifact install、upgrade 和 build 加入源码 production 命令设计 | 1 | 删除全部相关命令和步骤；源码 production 只保留六个进程管理命令 |
| 运行中修改配置会让旧进程失去定位 | 1 | 使用固定路径保存已启动配置快照；stop、status、health 和 logs 在当前配置损坏时仍然读取快照 |
