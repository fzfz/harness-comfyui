---
status: accepted
文档用途: 定义官方 Desktop 与插件的交付边界。
读取时机: 调整插件交付、宿主接入或生产安装流程前。
---

# 官方 Desktop 插件交付

## 决策与适用范围

1. Harness ComfyUI 以预构建插件 tarball 交付给官方 DeepSeek Harness Desktop。插件源码仓库负责业务实现、插件组合配置、安装资源、构建、测试和发布准备；官方应用负责宿主安装、升级、Profile、凭据及应用生命周期。

2. 本决策替代 [ADR 0004](0004-current-repository-owns-the-harness-bundle.md) 中由当前仓库安装、配置和升级正式 Harness 运行环境的要求，并替代 [ADR 0012](0012-harness-core-is-immutable.md) 中以自有 Desktop 补丁、checkout Skills 路径和源码 exports 为运行基础的要求。两份旧 ADR 保留为历史记录。

## 插件与宿主边界

1. 插件必须通过官方公共 package export、Cordis composition、Client 扩展位和 service 接口调用宿主能力。Session、Agent、Tool、Skill、持久日志及布局的权威状态由官方宿主管理。

2. [Core 插件](../../src/host/core/plugin.ts)与 [Image Reader 插件](../../src/host/image-reader/plugin.ts)必须直接调用 `ctx.tools.register()` 注册业务 Tool。Cordis 管理注册资源的生命周期。项目 Client 必须通过公开扩展位管理自身内容。

3. [package.json](../../package.json) 定义经过验收的 SDK peers、bundle、Client 注入和构建 exports。发行包必须包含这些运行入口及其资源。项目 Preset 必须从安装包资源注册；Skill 服务与目录发现遵循[项目 Preset、Skills 与目录访问](../system/architecture.md#项目-presetskills-与目录访问)。用户通过官方会话界面选择 Preset。

4. 插件持久配置、凭据和业务数据的归属遵循[配置规范](../system/configuration.md)。插件版本更新时，安装目录作为可替换代码目录，配置与业务数据保留在官方环境的持久目录。

## 开发验证与生产交付

1. 开发者按 [worktree 验证规范](../agents/worktree-development.md)调用已安装的官方应用，使用独立目录、端口、进程身份和候选 tarball 完成验收。测试夹具只管理本轮测试资源。

2. 发布者通过[插件发布规范](../system/releasing.md)交付固定版本 tarball。旧生产 checkout 的备份、历史迁移、停止、归档和删除遵循[已批准升级方案](../plans/official-desktop-plugin-20260929.md#生产目录退役与首次切换)的各项授权条件。

## 验证条件

1. 本决策的实现必须通过公共依赖边界检查、类型检查、业务测试、插件包测试、官方 Desktop E2E 和独立审查。验收人员按[已批准升级方案](../plans/official-desktop-plugin-20260929.md)中的验收清单验证候选插件包与生产环境，并记录结果。
