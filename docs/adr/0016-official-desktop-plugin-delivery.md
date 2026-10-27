---
status: accepted
文档用途: 定义官方 Desktop 与插件的交付边界。
读取时机: 调整插件交付、宿主接入或生产安装流程前。
---

# 官方 Desktop 插件交付

## 决策与适用范围

1. Harness ComfyUI 以预构建插件 tarball 交付给官方 DeepSeek Harness Desktop。插件源码仓库负责业务代码、组合配置、安装资源、构建、测试和发布准备。官方应用负责宿主安装、升级、Profile、凭据及应用生命周期。

2. 本决策替代 [ADR 0004](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/adr/0004-current-repository-owns-the-harness-bundle.md>)的运行环境归属要求。宿主接入边界以本决策替代 [ADR 0012](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/adr/0012-harness-core-is-immutable.md>)的对应要求。

## 插件与宿主边界

1. 插件必须通过官方公共 package export、Cordis composition、Client 扩展位和 service 接口调用宿主能力。Session、Agent、Tool、Skill、持久日志及布局的权威状态由官方宿主管理。

2. [Core 插件](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/core/plugin.ts>)与 [Image Reader 插件](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/image-reader/plugin.ts>)提供常驻业务服务，由 CLI 和 Remote 共用。Agent 通过原生 NoobAI MCP 查询目录，通过受管 CLI 执行业务命令。Cordis 管理服务及预设注册的生命周期；Client 通过公开扩展位管理自身内容。

3. [package.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/package.json>) 定义经过验收的 SDK peers、bundle、Client 注入和构建 exports。发行包必须包含这些运行入口及其资源。项目 Preset 必须从安装包资源注册；Skill 服务与目录发现遵循[项目 Preset、Skills 与目录访问](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#项目-presetskills-与目录访问>)。用户通过官方会话界面选择 Preset。

4. 插件持久配置、凭据和业务数据的归属遵循[配置规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md>)。插件版本更新时，安装目录作为可替换代码目录，配置与业务数据保留在官方环境的持久目录。

## 开发验证与生产交付

1. 开发者按 [worktree 验证规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/agents/worktree-development.md>)调用已安装的官方应用，使用独立目录、端口、进程身份和候选 tarball 完成验收。测试夹具只管理本轮测试资源。

2. 发布者通过[插件发布规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/releasing.md>)交付固定版本 tarball。生产部署目录的备份、历史迁移、停止、归档和删除所需的授权，见[生产目录退役与首次切换](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/plans/official-desktop-plugin-20260929.md#生产目录退役与首次切换>)。

## 验证条件

1. 验收入口与通过条件见[测试规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/testing.md>)。验收人员按获准任务的验收清单验证候选插件包与目标环境，并保存结果。
