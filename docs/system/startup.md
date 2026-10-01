# Official Desktop 插件运行

## 宿主职责

官方 DeepSeek Harness Desktop 管理应用安装、升级、启动、退出、Profile 和模型凭据。Harness ComfyUI 以 `harness-comfyui` 插件包运行；插件包提供 Host、Client、managed CLI、Workflow 编译 Worker、数据源客户端、两个项目 Preset 和八个 Repository Skills。

官方应用根据当前 Profile 的插件注册加载插件。Host 插件在启用时读取插件配置和 `production` Configuration Profile，校验业务数据目录，注册 Catalog、Generation、图片读取、浏览器设置和 managed CLI 服务。插件的目录、配置层级和凭据归属见 `docs/system/configuration.md`。

插件包内的代码和资源由官方应用安装、加载和更新。Host、Client 和 Skill 资源按当前安装包路径解析。官方应用退出或停用插件时负责结束宿主生命周期；插件在卸载时释放自己的 listener、Coordinator 和数据库资源，并保留插件业务数据。

## 开发与自动化验收

完整官方 Desktop E2E 使用 `pnpm test:desktop` 构建、打包并安装当前候选，然后检查插件界面、Host、managed CLI、Generation 及清理结果。完整通过条件由[测试规范](testing.md#官方-desktop-e2e-通过条件)定义。

开发者需要交互调试时，必须按[worktree 交互调试规范](../agents/worktree-development.md#交互调试)调用官方 Desktop probe。该规范统一定义启动、检查、停止、持久初始化环境、凭据引用和证据位置。
