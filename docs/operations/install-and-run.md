# 安装和运行 Harness 产品基线

本文说明 Release Artifact 用户如何使用 `production` Configuration Profile 创建一个 Harness 产品 installation，并通过同一套产品 CLI 管理该 installation 的完整生命周期。

本文描述 Issue #2 已交付的生命周期基线。本文不表示 Issue #3 及后续 Issue 负责的产品 UI、Generation Workbench、ComfyUI 写入操作或 prototype 页面已经交付。

## 输入边界

每个 lifecycle 子命令的唯一配置输入是用户指定的 `installation.json`。`preflight`、`install` 和 `upgrade` 还需要用户显式指定 Release Artifact tarball；`start`、`stop`、`restart`、`status`、`health`、`logs` 和 `rollback` 只读取 installation JSON 与 installation 目录中的状态。

产品 CLI 是 `installation.json` 到 Harness Host 环境的唯一转换器。产品 CLI 会从已经通过 schema 校验的 installation JSON 生成 Host 环境值，并忽略进程外已有的 `HARNESS_COMFYUI_*` 环境变量。用户不需要、也不能通过第二个配置文件覆盖 installation JSON 的运行字段。

### `production` Configuration Profile

`installation.configurationProfile` 的值必须是 `production`。`production` Configuration Profile 由 `config/base.json` 与 `config/profiles/production.json` 合并得到，并接受 `config/environment-overrides.json` 中列出的运行时路径映射。该 Profile 为产品 Host 提供生产运行语义和非敏感默认值；该 Profile 不保存某个用户 installation 的具体目录。

`production` Configuration Profile 与 Harness composition profile 是两个不同对象：

- `config/profiles/production.json` 描述产品 Host 使用的 Configuration Profile。
- `profiles/comfyui-workbench/` 描述 Harness 加载 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 和 `harness-comfyui` bundle 的顺序。

产品 CLI 从 installation JSON 生成数据目录、Run Repository、Saved Media、日志、Source CLI、Host、端口和 Client 刷新间隔的环境值。产品 Host 通过这些环境值加载 `production` Configuration Profile；产品 Host 不把 `installation.json` 当作第二个 Harness composition profile。

### `installation.json` 完整结构

下面的示例包含当前 schema 的全部字段。示例中的所有 `/absolute/path/...` 都是用户环境中的绝对路径占位符；示例不包含 credential、token 或 secret。

```json
{
  "schemaVersion": 1,
  "installationId": "harness-comfyui-production",
  "root": "/absolute/path/to/worktree/runtime/production",
  "configurationProfile": "production",
  "host": "127.0.0.1",
  "port": 4173,
  "paths": {
    "dataDir": "/absolute/path/to/worktree/runtime/production/shared/data",
    "runRepositoryFile": "/absolute/path/to/worktree/runtime/production/shared/data/runs.sqlite",
    "runDirectory": "/absolute/path/to/worktree/runtime/production/shared/runs",
    "savedMediaDirectory": "/absolute/path/to/worktree/runtime/production/shared/saved-media",
    "logDirectory": "/absolute/path/to/worktree/runtime/production/shared/logs"
  },
  "comfyui": {
    "defaultInstanceId": "production"
  },
  "source": {
    "catalogCliPath": "/absolute/path/to/catalog-discovery-cli",
    "sourceCliPath": "/absolute/path/to/source-discovery-cli",
    "contractId": "imagegen-source-contract",
    "supportedContractVersions": [1]
  },
  "client": {
    "runRefreshIntervalMs": 1000
  },
  "process": {
    "shutdownTimeoutMs": 10000
  }
}
```

`root` 是 installation 根目录。`paths.dataDir`、`paths.runDirectory`、`paths.savedMediaDirectory` 和 `paths.logDirectory` 必须分别指向 `root/shared/data`、`root/shared/runs`、`root/shared/saved-media` 和 `root/shared/logs`。`paths.runRepositoryFile` 必须位于 `root/shared/data` 内。

`source.catalogCliPath` 和 `source.sourceCliPath` 必须分别指向能够接受 `--discovery-json` 的绝对可执行文件。两个 Source CLI 必须返回相同的 `imagegen-source-contract` 与版本 `1`。`comfyui.defaultInstanceId`、`client.runRefreshIntervalMs` 和 `process.shutdownTimeoutMs` 是 installation 的非敏感运行参数。

本版本的必需 Host Runtime Credential 集合为空。当前 schema、Configuration Profile、`environment-overrides.json`、Release Artifact 和生命周期 workflow 不创建 Host Runtime Credential 字段、secret 名称或 credential 环境变量。ComfyUI Instance Authorization 只由 Source Operation 在 Host 进程内使用，不属于 installation JSON 的字段。

## 首次安装和 stable bin

首次安装必须使用同一个绝对 tarball 路径作为 `npm exec --package` 的值和 `--artifact` 的值。`--installation` 的值也必须是绝对 installation JSON 路径。

```sh
npm exec --yes --package=<absolute-tarball> -- harness-comfyui install --installation <absolute-installation-json> --artifact <absolute-tarball>
```

`install` 会完成 artifact、Node、pnpm、Configuration Profile、目录、端口和 Source contract 的 preflight，创建第一个不可变 release 目录，安装该 release 的 Harness runtime，物化 `comfyui-workbench` profile，并写入 active release state。`install` 不启动 Harness Host；用户必须随后显式运行 `start`。

成功的 `install` 会创建以下唯一 stable bin：

```text
<root>/bin/harness-comfyui
```

首次安装完成后，`start`、`stop`、`restart`、`status`、`health`、`logs`、`upgrade` 和 `rollback` 都必须通过 `<root>/bin/harness-comfyui` 运行。stable bin 只读取 `<root>/state/active-release.json`，再把同一 CLI 请求转交给 active release。后续生命周期命令不读取源码 worktree、全局安装的 `dsh` 或 npm cache。

## 十个 lifecycle 子命令

下面的命令使用以下占位符：

- `<absolute-installation-json>` 是 installation JSON 的绝对路径。
- `<absolute-tarball>` 是 Release Artifact tarball 的绝对路径。
- `<root>` 是 installation JSON 中 `root` 字段的值。

`start`、`restart`、`upgrade` 和 `rollback` 是前台命令。这四个命令在切换后的 Harness Host 仍然运行时持续拥有该前台 Host；用户在另一个终端运行同一个 installation 的 `stop` 后，受管 Host 退出，前台命令也退出。`install` 不启动 Host；`preflight`、`stop`、`status`、`health` 和不带 `--follow` 的 `logs` 是一次性命令。

| 子命令 | 精确命令 | 命令行为 |
| --- | --- | --- |
| `preflight` | `harness-comfyui preflight --installation <absolute-installation-json> --artifact <absolute-tarball>` | 校验 installation JSON、Release Artifact、Node/pnpm/Harness 版本、持久目录读写能力、Run Repository 路径、监听地址和两个 Source contract discovery identity。`preflight` 不停止当前 Host。 |
| `install` | `harness-comfyui install --installation <absolute-installation-json> --artifact <absolute-tarball>` | 创建不可变 release、安装 installation-local Harness runtime、物化 profile、写入 active release state 和 stable bin。`install` 不启动 Host。首次安装使用上一节的 `npm exec` 命令。 |
| `start` | `<root>/bin/harness-comfyui start --installation <absolute-installation-json>` | 启动 active release 的真实 Harness Host，转发终端 stdout/stderr，并把脱敏后的输出写入产品日志。命令保持前台运行，直到另一个终端运行 `stop`。 |
| `stop` | `<root>/bin/harness-comfyui stop --installation <absolute-installation-json>` | 读取 installation state 标识的 PID 与 process identity，只向相同进程发送 `SIGTERM`，等待进程退出，确认监听端口释放，并删除拥有者仍然匹配的 `state/process.json`。 |
| `restart` | `<root>/bin/harness-comfyui restart --installation <absolute-installation-json>` | 先调用同一 installation 的 stop 生命周期，再启动 active release。命令保持切换后 Host 的前台所有权，直到另一个终端运行 `stop`。 |
| `status` | `<root>/bin/harness-comfyui status --json --installation <absolute-installation-json>` | 输出 JSON 状态。状态包含 `installationId`、`activeVersion`、`pid`、`startedAt`、`host`、`port` 和 `status`；`status` 值为 `stopped`、`starting`、`running` 或 `unhealthy`。 |
| `health` | `<root>/bin/harness-comfyui health --json --installation <absolute-installation-json>` | 输出 JSON 健康证据，检查 process、active release、Harness Web、Client bundle、`pluginStatus` Remote、Catalog contract、Source contract、Run Repository 和 Saved Media。健康检查不发送 Harness 消息，也不调用 ComfyUI `/prompt`。 |
| `logs` | `<root>/bin/harness-comfyui logs --installation <absolute-installation-json> --source <stdout|stderr|operations|all> --lines <positive-integer> [--follow]` | 读取指定行数的日志。`stdout` 读取 Host 标准输出，`stderr` 读取 Host 标准错误，`operations` 读取部署操作记录，`all` 读取前三个 source。`--follow` 让命令持续读取新增行，直到用户发送终止信号。 |
| `upgrade` | `<root>/bin/harness-comfyui upgrade --installation <absolute-installation-json> --artifact <absolute-tarball>` | 预检并安装候选 release，停止旧 Host，切换 active release，启动候选 Host 并调用 health 检查。命令保持候选 Host 的前台所有权；候选启动或健康检查失败时，CLI 自动恢复、启动并检查上一 release 的健康状态。 |
| `rollback` | `<root>/bin/harness-comfyui rollback --installation <absolute-installation-json>` | 要求 active release 存在 `previousRelease`，停止当前 Host，把 previous release 与当前 release 在 active state 中交换，启动恢复的 previous release，并重新调用 health 检查。命令保持恢复后 Host 的前台所有权。 |

`status` 和 `health` 必须带 `--json`。`start`、`stop`、`restart` 和 `rollback` 不接受 `--json`。`logs` 必须同时提供 `--source` 与正整数 `--lines`，并且只允许 `--follow` 作为可选标志。

## Installation 目录和状态

安装后的 installation 使用下面的目录布局：

```text
<root>/
├── bin/
│   └── harness-comfyui
├── releases/
│   └── <version>/
│       ├── package/
│       ├── harness-runtime/
│       │   ├── package.json
│       │   ├── pnpm-lock.yaml
│       │   ├── pnpm-workspace.yaml
│       │   └── node_modules/.bin/dsh
│       └── dsh-home/
├── shared/
│   ├── data/
│   ├── runs/
│   ├── saved-media/
│   └── logs/
└── state/
    ├── active-release.json
    ├── process.json
    ├── last-health.json
    └── operations.jsonl
```

`releases/<version>/package/` 保存 Release Artifact 解包后的产品 package。`releases/<version>/harness-runtime/` 保存该版本的 runtime manifest、runtime lock、runtime workspace 和 installation-local Harness 依赖；该目录中的 `node_modules/.bin/dsh` 是该版本唯一允许使用的 Harness executable。`releases/<version>/dsh-home/` 保存该版本物化的 Harness `comfyui-workbench` profile。

`shared/data/` 保存 Run Repository 文件及其他跨版本数据，`shared/runs/` 保存跨版本 Run 数据，`shared/saved-media/` 保存跨版本 Saved Media，`shared/logs/` 保存 Host stdout 与 stderr 日志。`install`、`upgrade` 和 `rollback` 不移动、覆盖或删除任何 `shared` 目录；这些目录在 release 切换中保持不变。

`state/active-release.json` 记录 installation ID、active version、active release path 和 previous release descriptor。`state/process.json` 记录受管 Host 的 installation ID、active version、PID、operation ID、启动时间、host、port 以及 process identity。`state/last-health.json` 保存最近一次完整 health 结果。`state/operations.jsonl` 按行保存 lifecycle operation 的开始和结束记录。状态 JSON 通过临时文件加原子 rename 更新。

Host stdout 写入 `<root>/shared/logs/host.stdout.log`，Host stderr 写入 `<root>/shared/logs/host.stderr.log`。日志输出会对 Authorization、credential、secret、token、password 和 `HARNESS_COMFYUI_*` 值脱敏；状态文件和操作记录不保存这些敏感值。

### PID reuse 和 stop 清理

每次 Host 启动都会把 PID 的启动时间和完整 command 写入 `state/process.json`。`status`、`stop`、`restart`、`upgrade` 和 `rollback` 会比较 state 中的 process identity 与当前 PID 的 process identity。PID 已经被其他进程复用时，CLI 报告 identity mismatch，并且不向复用 PID 发送 `SIGTERM`。

`stop` 只会向 installation state 与 process identity 同时匹配的 Host PID 发送 `SIGTERM`。Host 退出并且端口释放后，CLI 删除 `state/process.json`；成功 stop 后，installation 不再保存已退出 Host 的 PID state，监听端口也不再被该 installation 占用。

## 生产验收路径

生产验收必须让 package validation、deploy lifecycle、composition、browser E2E 和 release smoke 使用 `.release/quality/artifact.json` 指向的同一 artifact identity。生产验收使用该 artifact 与 `runtime/production/installation.json`，不从源码 worktree 或 prototype 启动 Host。

验收者按以下顺序操作：

1. 验收者准备使用 `configurationProfile: "production"` 的 `runtime/production/installation.json`，并确认 JSON 中所有路径满足本文件的 root/shared 归属规则。
2. 验收者使用同一绝对 tarball 两次的首次安装命令创建 `<root>/bin/harness-comfyui`，然后使用 stable bin 启动 active release。
3. 验收者在另一个终端使用 stable bin 运行 `status --json`、`health --json` 和 `logs`，确认 process、active release、Harness Web、Client bundle、`pluginStatus`、两个 Source contract、Run Repository 和 Saved Media 均通过健康检查。
4. 验收者打开 installation JSON 中 `host` 与 `port` 对应的浏览器地址，确认真实 Harness Web 渲染原生 `AppFrame`，并确认当前项目 Host plugin、Client plugin 和 `pluginStatus` Remote 已加载。
5. 验收者在另一个终端使用 stable bin 运行 `stop`，确认前台 start 命令退出、`state/process.json` 被清理且监听端口释放。

该验收路径只证明 Release Artifact 能够安装、启动、检查、记录日志和停止真实 Harness 基线。该验收路径不声明 Issue #3 及后续 Issue 的产品 UI 或 prototype 页面已经实现。
