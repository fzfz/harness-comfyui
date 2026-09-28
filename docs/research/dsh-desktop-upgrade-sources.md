# DSH 与 Desktop 升级来源核验

本文将 DSH 定义为 `deepseek-ai/deepseek-harness`，将社区 Desktop 定义为 `anywhere-labs/dsh-desktop`，将自有 Desktop fork 定义为 `fzfz/dsh-desktop-anywhere`。核验时间为 2026-09-28。以下版本和提交均来自发布方的 GitHub 仓库或 npm 注册表。

## 可复现的目标版本

| 对象 | 已核实版本与提交 | 来源 |
| --- | --- | --- |
| DSH 最新 GitHub Release | `dsh-v0.1.7-rc.2`，提交 `477b4f420553e8a52c2fbccc464d7561b239c443`，2026-09-24 发布，预发布版本 | [发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.2)、[Git 标签](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.7-rc.2) |
| DSH npm 包 | `@deepseek-ai/dsh@0.1.7-rc.2`；核验时 `latest` 与 `next` 均指向此版本；包完整性值为 `sha512-SQFhriLvza8GnFApnC5/32AgpcyKxrWnYXhvwDOLJdgWpkCX2EexyR9c8kCkMITJXnFLEN3Qb2CEh0W36vkLyw==` | [npm 版本元数据](https://registry.npmjs.org/@deepseek-ai/dsh/0.1.7-rc.2)、[npm dist-tags](https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags) |
| 社区 Desktop 最新 Stable | `v2.0.15`，提交 `08f179499c155f6653eb9ca25bab3d4453bd89d5`，2026-09-25 发布，内置 DSH `0.1.7-rc.2` | [Stable 发布说明](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.15)、[该提交的 upstream.json](https://github.com/anywhere-labs/dsh-desktop/blob/08f179499c155f6653eb9ca25bab3d4453bd89d5/upstream.json) |
| 社区 Desktop Beta 与 NEXT | `v2.0.15-beta.1` 和 `v2.0.15-next` 与 Stable 使用同一发布提交；Stable、Beta 的 `upstream.json` 都指定 DSH `0.1.7-rc.2`。NEXT 发布说明也确认该版本。 | [Beta 发布](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.15-beta.1)、[NEXT 发布](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.15-next)、[upstream.json](https://github.com/anywhere-labs/dsh-desktop/blob/08f179499c155f6653eb9ca25bab3d4453bd89d5/upstream.json) |

社区 Desktop `v2.0.14` 曾内置 DSH `0.1.7-rc.1`，其提交为 `84946e2abec910b60e1f5f8aa69e45ab34df2a04`。`v2.0.15` 已将内核升级至 `0.1.7-rc.2`。实施 Agent 应将 `v2.0.15` 与 DSH `rc.2` 作为一组目标版本写入升级计划。[2.0.14 发布说明](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.14)、[2.0.15 发布说明](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.15)。

社区 Desktop 的 `master` 在核验时为 `f9ff3dc31d0b1c7726530894ea8d68cc5e17d557`，其 `upstream.json` 已指向不同的 DSH 提交 `21638c56315ae6a2b552d6091945d3144c9af32e`，虽然仍标称 `0.1.7-rc.2`。实施 Agent 应以发布标签 `v2.0.15` 和 DSH 标签 `dsh-v0.1.7-rc.2` 的准确提交作为可复现基线，并单独评估发布后的 `master` 改动。[Desktop master 的 upstream.json](https://github.com/anywhere-labs/dsh-desktop/blob/f9ff3dc31d0b1c7726530894ea8d68cc5e17d557/upstream.json)。

## 自有 fork 的现状

自有 fork 没有 GitHub Release 或标签。默认分支 `main` 指向 `94748d71134ad0912334ffbd420c1bfc0d421b49`，版本为 Desktop `2.0.9`，Stable 与 Beta 都绑定 DSH `0.1.5-rc.1`。分支 `codex/desktop-2.0.11` 指向 `a3ac8fe929e3b32e62c032d120071f5f09ff6210`，Stable 绑定 DSH `0.1.5-rc.2` 提交 `fb2c4b9e698e30edb738bca4cf0618587db7d203`，Beta 绑定 `0.1.6-alpha.1` 提交 `0a15e36e7f82b6ed45af6fa9759f29b40dcd965d`。实施 Agent 应从该分支的准确提交创建候选分支，并保存尚未推送的本地工作。[fork main 提交](https://github.com/fzfz/dsh-desktop-anywhere/commit/94748d71134ad0912334ffbd420c1bfc0d421b49)、[2.0.11 分支提交](https://github.com/fzfz/dsh-desktop-anywhere/commit/a3ac8fe929e3b32e62c032d120071f5f09ff6210)、[2.0.11 upstream.json](https://github.com/fzfz/dsh-desktop-anywhere/blob/a3ac8fe929e3b32e62c032d120071f5f09ff6210/upstream.json)。

## 升级与数据迁移依据

DSH `0.1.7-alpha.1` 将 Session 日志升级为 V4，将设置保存到当前 Profile 的插件配置，并仅尝试一次导入旧 `settings.yaml`。旧目录式 Agent 预设需要迁移到插件组合包；自定义插件需要适配新的设置、附件、Remote `readBytes` 和 `agent/created` 接口。[DSH 0.1.7-alpha.1 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.1)。

DSH `0.1.6-alpha.1` 调整了 PTC 的包名与服务名、Node PTC 进程环境，并将请求图片缓存移至 `DSH_HOME/cache/attachments/request-images`。`0.1.7-alpha.2` 要求自定义 `spill-policy` 将 `maxInlineBytes` 改为 `maxInlineTokens`。[0.1.6-alpha.1 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.1)、[0.1.7-alpha.2 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.2)。

社区 Desktop `2.0.15` 继续使用 `~/.dsh`。发布方建议退出旧版并备份该目录；窗口模式等启动设置在重启后生效。该发布同时修复了新 Profile 的选项保存、首次引导衔接和 Windows 打开文件夹的问题。[Desktop 2.0.15 发布说明](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.15)。

## 依赖版本与安全审计范围

社区 Desktop `v2.0.15` 根清单指定 `yarn@4.18.0` 和 Node `^22.19.0 || >=24.0.0`。Stable 工作区将运行入口 `@deepseek-ai/dsh` 和 Agent 包 `@deepseek-ai/dsh-agent` 等 DSH 包固定为 `0.1.7-rc.2`；其余直接包包括 Cordis 容器 `@deepseek-ai/cordis@4.0.4`、插件市场 `dshmarket@1.66.0`、桌面运行时 `electron@44.0.0`、打包器 `electron-builder@26.15.7`、Profile 包管理器 `pnpm@11.8.0`、界面库 `react@18.3.1`、编译器 `typescript@6.0.3`、前端构建器 `vite@8.2.1` 和测试器 `vitest@4.1.8`。Beta 工作区同样固定 DSH `0.1.7-rc.2`。[根 package.json](https://github.com/anywhere-labs/dsh-desktop/blob/08f179499c155f6653eb9ca25bab3d4453bd89d5/package.json)、[Stable package.json](https://github.com/anywhere-labs/dsh-desktop/blob/08f179499c155f6653eb9ca25bab3d4453bd89d5/dsh-plugin-desktop/package.json)、[Beta package.json](https://github.com/anywhere-labs/dsh-desktop/blob/08f179499c155f6653eb9ca25bab3d4453bd89d5/dsh-plugin-desktop-beta/package.json)。

本次核验读取发布清单与 npm 元数据。实施 Agent 应在安装前依据目标 `yarn.lock` 和所选平台，逐项完成依赖版本与安全审计，并记录准确版本、用途及审计结论。现有核验结果只支持上文列出的直接包版本，不覆盖完整依赖树。[目标 yarn.lock](https://github.com/anywhere-labs/dsh-desktop/blob/08f179499c155f6653eb9ca25bab3d4453bd89d5/yarn.lock)。
