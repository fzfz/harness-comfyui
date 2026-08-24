# 工作进度

## 2026-08-24

- 读取仓库 `CONTEXT.md`、部署 CLI、stable bin 生成逻辑、相关测试和生产 installation 文件。
- 确认用户描述的多余 `--installation` 来自产品 CLI 的统一生命周期参数解析器。
- 确认 stable bin 已绑定唯一 installation root，因此生命周期命令无需再次要求用户选择 installation JSON。
- 用户把任务范围扩展为当前源码仓库提供真实 production 源码启动的完整进程管理步骤，并明确要求 `pnpm prod:*` 入口。
- 确认仓库当前缺少全部 `prod:*` scripts，现有 `deploy:*` 只暴露内部 CLI 且要求调用者自行拼接路径。
- 撤销错误判断：本任务不创建其他运行仓库或其他源码目录。
- 读取 `codebase-design` 后决定把 production 命令集中到一个深 module；调用者只学习 `pnpm prod:<command>`，profile、环境映射、PID state 和日志路径保留在 module implementation 内。
- stable-bin 无参数最小回归测试已在 1.5 秒内稳定红灯，精确捕获用户报告的 usage 错误。
- 完整 lifecycle 红灯测试会等待 10 秒才失败，因此保留为最终端到端验收，不再用作诊断反馈环。
- 检查现有源码与 installed lifecycle 后确认：可靠进程管理已经存在，但 active release lookup 散落在 start、stop、status 和 health module 中；源码 production 当前只有无状态的前台 `dev:start`。
- 用户明确删除此前错误加入的 GitHub release、build、artifact install 和 upgrade 设计；源码 production 最终只保留六个进程管理命令。
- 完成 `prod:start|stop|restart|status|health|logs`；六个命令直接运行当前源码和现有 `node_modules`。
- 完成四个 JSON 配置文件的名称、格式、配置项、读取顺序和四级覆盖优先级定义。
- 完成固定运行快照；当前配置缺失、损坏、类型错误或包含未声明环境变量时，stop、status、health 和 logs 仍然管理已启动进程。
- 完成 stable bin 内部读取 `<root>/installation.json`，installation-local 命令不再要求用户传入 `--installation`。
- 完成真实 start、status、health、logs、restart 和 stop 冒烟；源码进程和运行快照已经清理。
- 完成 14 项源码 production 测试、74 项定向部署测试和类型检查；完整部署回归最终结果为 159 项通过、1 项跳过，失败项修复后的 42 项定向复测全部通过；独立语义验收通过。
