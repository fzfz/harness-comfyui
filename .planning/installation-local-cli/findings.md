# 诊断发现

## 已确认事实

- 生产 stable bin 位于 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env/runtime/production/bin/harness-comfyui`。
- 生产 installation JSON 位于同一 installation root 的 `installation.json`。
- 生产 installation JSON 的 `root` 等于 `/Volumes/4Tdisk/work/AI2/harness-comfyui-prod-env/runtime/production`。
- `scripts/deploy/cli.mjs` 的 `parseLifecycleArguments()` 强制所有 lifecycle 命令接收 `--installation`。
- `scripts/deploy/install.mjs` 生成的 stable bin 已内嵌 installation root 和 installation ID，并通过 `state/active-release.json` 选择 active release CLI。
- 现有 stable bin 只转发用户参数，没有向 active release CLI 注入 `<root>/installation.json`。
- 原文档和测试复制了该参数设计，因此原测试通过不能证明用户操作边界正确。
- `package.json` 当前只提供 `dev:start` 源码运行入口和要求调用者手工补充参数的 `deploy:*` 脚本，没有 `prod:start`、`prod:stop`、`prod:restart`、`prod:status`、`prod:health` 或 `prod:logs` 源码进程管理入口。
- 用户最终明确要求在当前源码仓库实现真正的 production 源码启动和完整进程管理命令。
- 用户明确禁止源码 production 命令执行 build、artifact 生成、artifact install、upgrade、GitHub Release 或 Git tag 操作。
- `scripts/profile/materialize.mjs` 与 `scripts/profile/start.mjs` 已提供源码 profile 物化和前台启动 implementation，但 `package.json` 只暴露 development profile，而且没有 PID、stop、restart、status、health 或 logs interface。
- `scripts/deploy/lifecycle.mjs` 已有 installation-to-environment 映射、进程身份和 operation state implementation；源码 production module 应复用这些 implementation，而不是复制进程管理逻辑。
- `.gitignore` 已忽略 `.local/`、`runtime/` 和日志文件，可以保存当前源码 production 的 profile、state 和 logs，而不提交运行态文件。

## 用户可见的精确症状

用户必须执行：

```text
<installation-root>/bin/harness-comfyui stop --installation <installation-root>/installation.json
```

合理命令应当是：

```text
<installation-root>/bin/harness-comfyui stop
```

## 反馈环

以下命令在 1.5 秒内稳定失败：

```text
./node_modules/.bin/vitest run tests/deploy/lifecycle-cli.test.ts --maxWorkers=1 --no-file-parallelism -t "resolves its installation locally"
```

精确失败输出是 `harness-comfyui: usage: harness-comfyui stop --installation <absolute-json>`，退出码是 1。

## 源码 production seam

- `scripts/profile/materialize.mjs` 可以把当前源码 package 安装到指定 DSH_HOME 的 profile，但该文件只提供 CLI implementation，没有供 production process module 调用的函数 interface。
- `scripts/profile/start.mjs` 可以启动当前源码 package 对应的前台 Host，但只设置 `DSH_HOME`、configuration profile 和 PATH；它没有设置完整 `HARNESS_COMFYUI_*` production 环境，也不保存 PID state 或日志。
- `scripts/deploy/start.mjs` 已实现可靠的 PID identity、日志、信号转发和 state cleanup，但它在进入共享进程逻辑前强制读取 `state/active-release.json` 和 release-local package。
- `scripts/deploy/stop.mjs`、`status.mjs` 和 `health.mjs` 同样把 active release lookup 写在各自 module 内，因此当前源码 production 不能复用它们的完整行为。
- `scripts/deploy/logs.mjs` 只依赖 validated installation 与 log paths，可以直接复用。
- `scripts/deploy/product-agent-files.mjs` 提供 `materializeProductAgentFiles(packageRoot, runtimeRoot, productAgent)`；源码启动路径不再引用版本安装模块。
- 合适的深 module seam 是“validated installation + resolved runtime target”。installed CLI 把 active release 解析为 runtime target，source production CLI 把当前 repository root 解析为 runtime target；PID、stop、status、health 和 logs implementation 只消费 runtime target，不再自行猜测来源。

## 验证结论

- 安装流程会把校验后的 installation JSON 固定保存到 `<root>/installation.json`。
- stable bin 会为 installation-local 命令内部注入该固定路径，并拒绝用户再次传入 `--installation`。
- 源码 production 使用 `config/source-production.json`、`config/base.json`、`config/profiles/production.json` 和 `config/environment-overrides.json`。
- 源码 production 的已启动配置保存在 `.local/source-production-managed.json`；该文件让旧进程管理不依赖当前配置仍然有效。
- installed 和 source 两种入口复用同一套 managed start、stop、status 和 health implementation，并分别解析 installed runtime target 与 source runtime target。
