---
文档用途: 说明官方 Desktop 中的插件加载、停止与开发验收入口。
读取时机: 启动、停止或调试插件及官方 Desktop 实例前。
---
# 官方 Desktop 插件运行

## 宿主职责

1. 官方 DeepSeek Harness Desktop 管理应用安装、升级、启动、退出、Profile 和模型凭据。Harness ComfyUI 以 `harness-comfyui` 插件包运行；宿主版本约束见[技术栈](technology-stack.md#宿主与运行技术)。
2. 官方应用根据当前 Profile 加载插件。插件配置、数据目录和凭据归属见[配置规范](configuration.md)。
3. 官方应用按安装包路径加载 Host、Client 和 Preset 资源。应用退出或插件停用时，插件释放运行资源，并保留业务数据。

## 开发与自动化验收

1. 开发者运行 `pnpm test:desktop`，构建、打包并安装当前工作目录中的插件，完成官方 Desktop 自动化验收。验收范围和通过条件见[测试规范](testing.md#官方-desktop-e2e-通过条件)。
2. 需要交互调试时，开发者必须按[worktree 交互调试规范](../agents/worktree-development.md#交互调试)调用官方 Desktop probe。
