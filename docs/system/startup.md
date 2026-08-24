# 系统启动规范

## 首次准备

在仓库根目录执行一次依赖安装：

```sh
pnpm install
```

确认 `config/source-production.json` 中的两个 Source CLI 相对路径指向可读文件，并确认Catalog回环服务监听`source.catalogPort`。

## 启动与验证

在仓库根目录启动当前源码：

```sh
pnpm prod:start
```

`prod:start` 先根据当前 `src/client/` 更新 `.local/source-client/client.js`，再以前台方式运行 Host。保持该终端运行，并在另一个终端执行：

```sh
pnpm prod:status
pnpm prod:health
```

默认 Web 地址是 `http://127.0.0.1:4173`。`status` 应返回 `running`，`health` 应返回 `passed`。

## 日常管理

```sh
pnpm prod:logs
pnpm prod:restart
pnpm prod:stop
```

`restart` 先停止当前受管 PID，再使用当前源码和当前配置以前台方式启动。`stop` 成功后，原 `prod:start` 或 `prod:restart` 终端一并退出。

六个生命周期命令均不接受附加参数。`start` 与 `restart` 从固定配置文件读取启动目标并自动更新浏览器 Client 模块；运行中的 `stop`、`status`、`health` 和 `logs` 从受管快照读取同一目标。调用者不需要指定安装文件，也不需要执行独立构建、打包、版本安装或版本升级命令。

生产进程自动化验证使用 `pnpm prod:test`。该命令使用临时目录和端口覆盖六个生命周期操作及其异常分支。

## 运行目录

默认运行根目录是 `.local/production/`：

| 路径 | 内容 |
| --- | --- |
| `dsh-home/` | 当前进程的 Harness home 和 profile |
| `state/process.json` | PID、启动时间和进程命令 |
| `state/operations.jsonl` | 六个命令的操作记录 |
| `state/last-health.json` | 最近一次健康检查结果 |
| `shared/data/runs.sqlite` | Run Repository |
| `shared/runs/` | Run 文件 |
| `shared/saved-media/` | Saved Media |
| `shared/logs/` | Host stdout 与 stderr |

`.local/source-production-managed.json` 保存正在运行的配置快照。以上文件都是本地运行状态，不进入 Git。

`.local/source-client/client.js` 与 source map 是当前 Client 源码的浏览器运行文件。`prod:start` 和 `prod:restart` 每次都会更新它们，Harness 不直接把 TypeScript/TSX 文件作为浏览器脚本返回。

## 状态含义

| 状态 | 含义 |
| --- | --- |
| `stopped` | 没有受管进程，端口空闲 |
| `starting` | PID 存在，端口尚未就绪 |
| `running` | PID、进程身份和端口均通过检查 |
| `unhealthy` | 端口被其他进程占用，或受管进程与端口状态不一致 |

启动失败时先执行 `pnpm prod:logs` 查看 stdout、stderr 和 operations，再修正配置或端口占用问题。
