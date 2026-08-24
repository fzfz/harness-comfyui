# Harness ComfyUI v0.2

v0.2 将系统运行方式收敛为当前源码的统一生产进程管理。

## 主要变更

- 新增 `prod:start`、`prod:stop`、`prod:restart`、`prod:status`、`prod:health` 和 `prod:logs` 六个源码进程命令，并使用 `prod:test` 自动验证完整生命周期和异常分支。
- Host、Client 和 Product Agent 直接从 `src/` 加载，不依赖预先生成的 `lib/` 文件。
- Configuration Profile 收敛为唯一的 `production`，并明确四个配置文件的读取顺序和环境变量覆盖规则。
- 删除产品包构建、安装、升级、回滚、部署和旧发布打包流程。
- GitHub Release 改为在最终通过 CI 的提交上发布 Git tag 与 Release 记录。
- 重写 README，并补齐技术栈、架构、目录、配置、测试、发布和启动规范。

## 验证

- 真实执行 `prod:start`、`prod:status`、`prod:health`、`prod:logs` 和 `prod:stop`，源码进程完整通过验证。
- `pnpm quality` 通过依赖审计、类型检查、覆盖率、合同、安全、production 和 prototype 测试。
- GitHub CI 在干净检出和冻结依赖安装条件下通过。
