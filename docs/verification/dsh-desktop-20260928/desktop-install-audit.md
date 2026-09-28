# Desktop 2.0.15 依赖与安装核对记录

核对日期为 2026-09-28。实施 Agent 使用本仓库自有 Desktop fork 的本地提交 `b912b85411f5b06b748a7e9216323c1e1ea3b302` 作为 `config/desktop-baseline.json` 中的源码身份。该提交位于 `/Volumes/4Tdisk/work/AI2/harness-comfyui/.local/upstreams/dsh-desktop-2.0.15-owned/`。本文所称“来源声明”是 fork 内 `vendor/dsh-runtime/0.1.7-rc.2/manifest.json` 和 `vendor/agents-anywhere/provenance.json` 对归档及上游提交的记录。

## 必须要实现的目标

依赖审计 Agent 将最终 fork 的 `yarn.lock` 与[逐项安装清单](desktop-install-items.json)按 selector、版本、resolution 和 Yarn checksum 逐项核对。锁文件和清单均有 1,466 个解析条目，其中 npm 1,146 项、本地 `file:` tarball 276 项、`patch:` 38 项、workspace 6 项。最终提交相对于前一审计提交 `0391198aead0d808788ebcd8d28eff1a3fb664b8` 只改变 `@deepseek-ai/dsh-api-session-controller` 的一个 patch 组合条目的 resolution、checksum 和对应补丁内容；清单已经采用最终锁文件的值。清单记录每项的包名、精确版本、用途或直接声明者、安全意见和来源。

根 `package.json` 固定 `yarn@4.18.0`，并记录 650 项 resolutions。Stable workspace `dsh-plugin-desktop/package.json` 固定 Desktop `2.0.15` 和 Electron `44.0.0`；DSH tarball 为 `0.1.7-rc.2`。Beta、Next、Fabric 和 Market workspace 的 manifest 与锁文件条目纳入同一清单。本仓库 `config/desktop-baseline.json` 指向上述最终提交。

依赖审计 Agent 对 276 个本地 tarball 重新计算 SHA-256：文件全部存在，计算值全部等于[逐项清单](desktop-install-items.json)中的值，清单中的 276 个 `sha256MatchesProvenance` 字段均为 `true`。DSH 来源声明指向 `deepseek-harness` 提交 `477b4f420553e8a52c2fbccc464d7561b239c443`；Agents Anywhere 来源声明指向提交 `125aab0a5f30ac535fee59f3571eabd050ac909f`。这些结果证明本地归档与 fork 中的来源声明一致；上游提交到归档的独立重建或正式构建证明仍待来源验收 Agent 提交。

[补丁审计清单](desktop-patch-audit.json)覆盖 36 个 fork 内 patch 和 2 个 Yarn 内建兼容 patch。最终 `dsh-api-session-controller` patch 的 SHA-256 为 `cf2abe68ab94fab41a571a8625098920f9f4d655f4aab359daeff1f1a9a242e1`，新增 463 行；其锁文件 patch hash 为 `f632a7`，Yarn checksum 为 `10c0/040060d5ce1d5e8e370b7349a491bbb4a1a06434583d1e653ef19aed7816fa3b82578b81825a27492eba817750f646e0b4a60912c70b7b5b092a2ca383f5261a`。其余 35 个 fork 内 patch 的 SHA-256 和新增行数与前一审计记录一致。Yarn 内建 patch 的内容仍须对照 Yarn 4.18.0 发行包核对。

安全审计 Agent 对同一组 1,146 个精确 npm 包版本执行 OSV `querybatch`，保存的[命中结果](desktop-osv-hits.json)为空数组。最终 fork 只修改 patch 和锁文件对应条目的 hash、checksum；npm 包版本组保持一致。该查询结果仅说明当日 OSV 对这些名称和版本没有返回公告，vendored 源码、补丁行为及运行安全分别由来源和运行验收确认。

安装执行 Agent 的任务操作记录显示：在 Node 24 环境中运行 `corepack yarn install --immutable` 成功；`corepack yarn workspace dsh-community-market build`、`corepack yarn workspace dsh-plugin-desktop build` 和 `corepack yarn workspace dsh-plugin-desktop prepare:electron-native` 均退出 0。最初使用 Node 25 构建 `fs-ext` 失败，改用 Node 24 后通过。最终 patch 更新后，安装执行 Agent 再次运行 `corepack yarn install --immutable` 并通过，随后在提交 `b912b85411f5b06b748a7e9216323c1e1ea3b302` 的干净工作树上重新执行上述三个构建命令，均退出 0；`prepare:electron-native` 输出确认 Electron 44.0.0 的 darwin-arm64 ABI 149 绑定。当前 fork 中存在 `dsh-community-market/lib/index.js`、`dsh-plugin-desktop/lib/main.js` 和 `dsh-plugin-desktop/node_modules/fs-ext/prebuilds/darwin-arm64/electron.abi149.node`。任务未将完整终端日志另存到本目录。实施 Agent 在本仓库运行 `pnpm check:manifest-lock` 并通过，其终端输出也未另存到本目录。

## 验收清单

- [x] 最终 fork 提交、Desktop 基线、1,466 项锁文件与逐项安装清单对应。
- [x] 276 个 tarball 的本地 SHA-256 与清单中的值对应；来源清单记录相同的归档摘要。
- [x] 36 个 fork 内 patch 的当前 SHA-256 与补丁审计清单对应；另有 2 个 Yarn 内建 patch 记录在清单中。
- [x] OSV 查询保存了 1,146 个精确 npm 版本的零命中结果，最终 patch 提交保持这组版本不变。
- [x] 获授权的 Node 24 安装与三个构建命令已执行并通过；最终 patch 提交后的 immutable 安装已通过；本仓库 manifest-lock 检查已通过。
- [ ] 来源验收 Agent 须提供 vendored tarball 与声明上游提交之间的独立来源证明，并核对 Yarn 内建 patch 的发行内容。
- [ ] 运行验收 Agent 须核对 `dsh-community-market` 的 peer dependency 告警、最终 patch 后的实际调用、Electron 原生绑定与插件功能；最终候选树的 `pnpm quality` 另行记录。

## 非本次目标

本记录整理本地依赖身份、静态摘要及任务中已执行命令的结果。来源验收 Agent 负责上游归档可重建性，运行验收 Agent 负责真实调用和完整 Desktop 测试，发布 Agent 负责远端推送和发布。实施 Agent 应在这些动作完成时将相应结果写入独立验收记录。

## 已获得的授权

用户已批准本次 DSH/Desktop 兼容升级，并明确批准在 fork 内执行 `corepack yarn install --immutable`、Market 与 Stable 的 build、`prepare:electron-native`，以及本仓库独立 Desktop 的 `pnpm dev:start`、`dev:status`、`dev:logs`、`dev:stop`。本记录中的安装和构建命令属于该授权。远端推送、发布和生产部署须依据升级计划取得后续授权。
