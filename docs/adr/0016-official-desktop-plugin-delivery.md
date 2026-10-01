---
status: accepted
---

# 官方 Desktop 插件交付

## 决策与适用范围

Harness ComfyUI 以预构建插件 tarball 交付给官方 DeepSeek Harness Desktop。插件源码仓库负责业务实现、bundle composition、安装资源、构建、测试和发布准备；官方应用负责宿主安装、升级、Profile、凭据及应用生命周期。

本决策替代 [ADR 0004](0004-current-repository-owns-the-harness-bundle.md) 中由当前仓库安装、配置和升级正式 Harness 运行环境的要求，并替代 [ADR 0012](0012-harness-core-is-immutable.md) 中以自有 Desktop 补丁、checkout Skills 路径和源码 exports 为运行基础的要求。两份旧 ADR 保留为历史记录。

## 插件与宿主边界

插件必须通过官方公共 package export、Cordis composition、Client 扩展位和 service 接口调用宿主能力。Session、Agent、Tool、Skill、持久日志及布局的权威状态继续由官方宿主管理。项目 Host 必须使用 `src/host/tools/register-project-tools.ts` 注册业务 Tool；项目 Client 必须通过公开扩展位管理自身内容。

`package.json` 定义经过验收的 SDK peers、bundle、Client 注入和构建 exports。发行包必须包含这些运行入口及其资源。两个 ComfyUI Preset 必须从安装包资源注册，并按[架构规范](../system/architecture.md#官方宿主与插件载入)保持项目 Skills 的 Preset 作用域。用户通过官方会话界面选择 Preset。

插件持久配置、凭据和业务数据的归属遵循[配置规范](../system/configuration.md)。插件版本更新时，安装目录作为可替换代码目录，配置与业务数据保留在官方环境的持久目录。

## 开发验证与生产交付

开发者通过[worktree 验证规范](../agents/worktree-development.md)调用已安装官方应用，使用独立目录、端口、进程身份和候选 tarball 验收。测试夹具只管理本轮测试资源。

发布者通过[插件发布规范](../system/releasing.md)交付固定版本 tarball。旧生产 checkout 的备份、历史迁移、停止、归档和删除遵循[已批准升级方案](../plans/official-desktop-plugin-20260929.md#生产目录退役与首次切换)的各项授权条件。

## 验证条件

本决策的实现必须通过公共依赖边界检查、类型检查、业务测试、插件包测试、官方 Desktop E2E 和独立审查。正式候选与生产验收分别按升级方案的验收清单记录结果；各项真实模型和正式 ComfyUI Run 的通过条件由该方案统一定义。
