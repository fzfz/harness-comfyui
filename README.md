# Harness-ComfyUI

Harness-ComfyUI 是运行在 DeepSeek Harness Host/Client 中的 ComfyUI 工作台项目。当前预发布版本交付产品安装、预检、启动、停止、重启、状态、健康检查、日志、升级和回滚基线；后续 GitHub Issues 继续交付工作台界面与生成流程。

## 当前版本

| 记录对象 | 当前值 |
| --- | --- |
| Harness-ComfyUI 产品版本 | `0.1.3` |
| DeepSeek Harness 直接依赖版本 | `0.1.0-rc.8` |
| GitHub Release tag | [`v0.1.3`](https://github.com/fzfz/harness-comfyui/releases/tag/v0.1.3) |
| GitHub Release 状态 | Latest release |
| GitHub Release commit | `b292e1cd69be766204037ea9f781766ef7714015` |
| GitHub Release 发布日期 | `2026-08-24` |

`package.json` 的 `version` 是 Harness-ComfyUI 产品版本的唯一结构化来源。`package.json` 中精确锁定的 `@deepseek-ai/dsh-*` 版本是 DeepSeek Harness 直接依赖版本的唯一结构化来源。产品版本与 Harness 依赖版本表示两个不同对象；维护者不得根据 Harness 依赖版本推断产品版本。

当前 GitHub Release 只发布 Git tag 与 Release 记录，不附加 npm package、tarball 或其他二进制资产。

## 版本记录规范

发布负责人创建新的 GitHub Release 时必须执行以下记录动作：

1. 发布负责人从根 `package.json` 读取 Harness-ComfyUI 产品版本。
2. 发布负责人使用 `v<package.json.version>` 作为 GitHub Release tag。
3. 发布负责人把 GitHub Release tag 指向本次已经验收的精确 Git commit。
4. 发布负责人在本节的版本记录表中写入产品版本、GitHub Release tag、精确 commit、发布日期、Release 状态和交付范围。
5. 发布负责人不得移动已经发布的 GitHub Release tag。验收 commit 发生变化时，发布负责人必须使用新的产品版本和新的 GitHub Release tag。

| 产品版本 | GitHub Release tag | 精确 commit | 发布日期 | 状态 | 交付范围 |
| --- | --- | --- | --- | --- | --- |
| `0.1.3` | [`v0.1.3`](https://github.com/fzfz/harness-comfyui/releases/tag/v0.1.3) | `b292e1cd69be766204037ea9f781766ef7714015` | `2026-08-24` | Latest release | 当前工作区全部变更、Harness v0.82.2 source contract 与 Issue #3 工作台更新 |
| `0.1.0-rc.7` | [`v0.1.0-rc.7`](https://github.com/fzfz/harness-comfyui/releases/tag/v0.1.0-rc.7) | `10c2c1f2eef9c0bfb9497a7b1e7d366627582b44` | `2026-08-22` | Prerelease | Issue #2 产品安装与完整生命周期基线 |

## 产品管理命令

本文中的 Release Artifact 是构建流程生成并由安装门禁与完整生命周期门禁消费的版本化产品 tarball。当前 GitHub Release 没有附加该 Release Artifact。

Release Artifact 中的 `harness-comfyui` CLI 提供以下子命令：

- `install`
- `preflight`
- `start`
- `stop`
- `restart`
- `status`
- `health`
- `logs`
- `upgrade`
- `rollback`

安装文件格式、首次安装命令、installation 目录结构和全部生命周期参数见 [`docs/operations/install-and-run.md`](docs/operations/install-and-run.md)。

## 质量门禁

Pull Request 运行快速质量门禁。产品代码进入 `main` 后，Artifact Qualification workflow 构建一次候选 artifact，并让 Deploy lifecycle、Composition、Browser E2E 和 Release smoke 四个 job 使用同一个候选 artifact。Release Preview 只验证并复用已经通过资格认证的 artifact。

覆盖率阈值、路径分类规则、Qualification Record 和 Release Preview 输入见 [`docs/operations/test-gates.md`](docs/operations/test-gates.md)。

## 产品范围

- [父产品 Issue #1](https://github.com/fzfz/harness-comfyui/issues/1) 定义完整 Harness-ComfyUI 工作台的产品范围。
- [Issue #2](https://github.com/fzfz/harness-comfyui/issues/2) 交付产品安装与生命周期基线。
- Issues #3–#13 继续交付并验收产品工作台功能。
- [Issue #14](https://github.com/fzfz/harness-comfyui/issues/14) 对同一个版本化产品包执行真实产品验收。
- [Issue #15](https://github.com/fzfz/harness-comfyui/issues/15) 发布 Issue #14 已验收的同一个版本化产品包。
