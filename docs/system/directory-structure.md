---
文档用途: 索引源码、配置、测试和构建产物的目录职责。
读取时机: 定位模块、添加文件或调整目录职责前。
---
# 目录结构

## 插件源码目录

1. 本仓库的源码边界是 Harness ComfyUI 插件。官方 Desktop 与 DeepSeek Harness Host 属于独立项目；插件接入边界见[系统架构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md#官方宿主与插件载入>)。

2. 插件源码按以下职责组织。

   | 路径 | 内容 |
   | --- | --- |
   | [src/host/core/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/core>) | Core 插件装配、Host 配置加载与存储初始化。 |
   | [src/host/source-client/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/source-client>) | Host 内部数据源客户端与目录协议校验。 |
   | [src/host/catalog/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/catalog>) | Catalog 查询适配、展示投影与 Remote。 |
   | [src/host/cli/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/cli>) | 受管 CLI listener、Tool Call capability、请求分发与业务身份读取。 |
   | [src/host/web/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/web>) | Host Remote 与媒体路由装配。 |
   | [src/host/generation/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/generation>) | Generation Runtime、Workflow 参数化、官方前端导出、缓存、Comfy transport、coordinator 与媒体服务。 |
   | [src/host/image-reader/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/image-reader>) | 图片读取配置、原生 Provider 设置适配、输入处理与视觉模型调用。 |
   | [src/host/resource-path.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/resource-path.ts>) | 已安装包内资源的定位入口。 |
   | [src/host/node-script-environment.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/host/node-script-environment.ts>) | Electron Node 脚本环境入口。 |
   | [src/source-settings.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/source-settings.ts>) | 数据源地址与端口合同。 |
   | [src/cli/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/cli>) | 受管 CLI 的业务请求和参数合同。 |
   | [src/generation/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/generation>) | Generation Remote、媒体 URL 与历史 Run 查询合同。 |
   | [src/image-reader/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/image-reader>) | 图片读取配置、凭据操作、模型目录与 Remote 合同。 |
   | [src/catalog/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/catalog>) | Catalog 展示字段、详情 schema 与上下文类型。 |
   | [src/config/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/config>) | Configuration Profile 载入器。 |
   | [src/client/](</Volumes/4Tdisk/work/AI2/harness-comfyui/src/client>) | 工作台、上下文选择器、Run 与媒体投影、ComfyUI 设置页。 |

## Preset 与 Skill 资源

1. 项目 Preset 与共享组件位于以下路径。

   | 路径 | 内容 |
   | --- | --- |
   | [agent-presets/presets.cordis.yml](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/presets.cordis.yml>) | 项目 Preset registry 声明。 |
   | [agent-presets/harness-comfyui-cli-candidate/](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/harness-comfyui-cli-candidate>) | ComfyUI工作台预设的资源。 |
   | [agent-presets/shared/agent.cordis.yml](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/shared/agent.cordis.yml>) | 工作台公共工具与 compaction 组合。 |
   | [agent-presets/workbench-composition.mjs](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/workbench-composition.mjs>) | 工作台原生上下文覆盖与工具限制的接入。 |
   | [agent-presets/noobai-mcp.cordis.yml](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/noobai-mcp.cordis.yml>) | 工作台的 NoobAI MCP 服务配置。 |
   | [agent-presets/project-installed-presets.mjs](</Volumes/4Tdisk/work/AI2/harness-comfyui/agent-presets/project-installed-presets.mjs>) | 已安装 Preset 资源入口。 |

2. 下表列出随插件交付的 8 个业务 Skill；执行入口为各目录的 `SKILL.md`。来源配置见[工作台装配配置](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#工作台装配配置>)。

   | 路径 | 内容 |
   | --- | --- |
   | [.agents/skills/anima-prompt-builder/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/anima-prompt-builder>) | ANIMA3 Prompt 与历史 Generation Run 查询。 |
   | [.agents/skills/character-portrait-prompt-designer/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/character-portrait-prompt-designer>) | 角色立绘 Prompt 与历史 Generation Run 查询。 |
   | [.agents/skills/comfyui-generate/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/comfyui-generate>) | ComfyUI 图片生成。 |
   | [.agents/skills/comfyui-image-review/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/comfyui-image-review>) | Run 图片读取、参数比较与 Prompt 改进。 |
   | [.agents/skills/krea2-anime-prompt-builder/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/krea2-anime-prompt-builder>) | Krea2 动漫 Prompt 与历史 Generation Run 查询。 |
   | [.agents/skills/moss-prompt-builder/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/moss-prompt-builder>) | MOSS-Image Caption 与像素 Layout 提示词。 |
   | [.agents/skills/local-image-reader/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/local-image-reader>) | 用户提供本地图片路径时的视觉读取。 |
   | [.agents/skills/wai-sdxl-prompt-builder/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/wai-sdxl-prompt-builder>) | WAI Prompt 与历史 Generation Run 查询。 |

## 配置与构建入口

1. 配置文件按以下职责组织，字段与生效规则见[配置规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md>)。

   | 路径 | 内容 |
   | --- | --- |
   | [cordis.patch.yml](</Volumes/4Tdisk/work/AI2/harness-comfyui/cordis.patch.yml>) | Host 插件与已安装 Preset 的装配声明。 |
   | [locales/](</Volumes/4Tdisk/work/AI2/harness-comfyui/locales>) | 官方插件管理界面使用的插件包与组件名称。 |
   | [config/base.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/base.json>)、[config/profiles/production.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/profiles/production.json>) | Configuration Profile 默认值。 |
   | [config/schema.ts](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/schema.ts>) | Configuration Profile 字段与约束。 |
   | [config/environment-overrides.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/environment-overrides.json>) | 环境覆盖映射。 |
   | [config/plugin-storage.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/plugin-storage.json>) | 插件存储字段清单。 |
   | [config/product-agent.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/product-agent.json>)、[config/product-agent-schema.mjs](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/product-agent-schema.mjs>) | Preset 资源清单及约束。 |
   | [config/settings-entry-ids.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/settings-entry-ids.json>) | Profile Settings 条目标识。 |
   | [config/image-reader-profiles.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/image-reader-profiles.json>)、[config/image-reader-processing.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/image-reader-processing.json>)、[config/image-reader-runtime.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/image-reader-runtime.json>) | 图片读取配置默认值、输入处理参数与运行字段。 |
   | [config/error-catalog.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/error-catalog.json>) | Host 错误码与消息目录。 |
   | [config/plugin-package.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/plugin-package.json>)、[config/plugin-package-schema.mjs](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/plugin-package-schema.mjs>) | 发行 tarball 的资源清单及约束。 |
   | [config/runtime-artifacts.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/runtime-artifacts.json>) | Host、Client、CLI 与 Workflow Worker 的源码和构建路径。 |
   | [config/managed-cli-help.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/managed-cli-help.json>) | 受管 CLI 帮助配置。 |
   | [config/source-client.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/source-client.json>) | Host 内部数据源客户端的协议路径与请求限制。 |
   | [config/managed-cli-environment.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/managed-cli-environment.json>) | 受管 CLI 环境字段。 |
   | [config/node-script-runtime.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/node-script-runtime.json>) | Electron Node 脚本环境字段。 |
   | [config/desktop-e2e.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/desktop-e2e.json>)、[config/desktop-e2e-schema.mjs](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/desktop-e2e-schema.mjs>) | 官方 Desktop 验收配置与运行记录合同。 |
   | [tsconfig.agent-presets.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/tsconfig.agent-presets.json>) | Preset 资源入口的 `checkJs` 类型检查配置。 |
   | [scripts/build/](</Volumes/4Tdisk/work/AI2/harness-comfyui/scripts/build>) | 插件构建与 tarball 打包入口。 |
   | [scripts/cli/](</Volumes/4Tdisk/work/AI2/harness-comfyui/scripts/cli>) | 受管 CLI 入口、帮助、参数解析与结果文件管理模块。 |

## 数据与构建产物目录

1. 插件业务数据目录由 Configuration Profile 的 `paths` 字段定位，详见[配置规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md#configuration-profile-字段>)。插件安装目录保存可替换的代码和资源。

2. 构建产物由 [config/runtime-artifacts.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/runtime-artifacts.json>) 定位：[.local/source-host/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.local/source-host>) 保存 Host bundle 与 Workflow Worker，[.local/source-client/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.local/source-client>) 保存 Client bundle，[.local/source-cli/](</Volumes/4Tdisk/work/AI2/harness-comfyui/.local/source-cli>) 保存受管 CLI。插件 tarball 的文件范围由 [config/plugin-package.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/plugin-package.json>) 定义。

## 开发验收目录

1. 官方 Desktop 验收目录由 [config/desktop-e2e.json](</Volumes/4Tdisk/work/AI2/harness-comfyui/config/desktop-e2e.json>) 定义。`.local/desktop-e2e/<run-id>/` 保存每轮日志、证据与运行记录；`.local/desktop-development/official-environment/` 保存开发实例持久使用的 Harness home、user-data 与 Workspace。实例操作见[worktree 规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/agents/worktree-development.md>)。

2. 测试代码与验收证据按以下职责组织，执行入口和通过条件见[测试规范](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/testing.md>)。

   | 路径 | 内容 |
   | --- | --- |
   | [tests/desktop/fixtures/](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/desktop/fixtures>) | 官方 Desktop 隔离、安装、CDP 与业务验收夹具。 |
   | [tests/desktop/run-desktop-tests.mjs](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/desktop/run-desktop-tests.mjs>) | 官方 Desktop 候选构建、打包与验收总入口。 |
   | [tests/desktop/official-desktop-lifecycle.test.mjs](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/desktop/official-desktop-lifecycle.test.mjs>) | 设置、Session 隔离，以及启动和清理过程的验收。 |
   | [tests/desktop/official-desktop-live.test.mjs](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/desktop/official-desktop-live.test.mjs>) | 插件安装、设置、生成、历史与媒体的官方应用业务 E2E。 |
   | [tests/production/](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/production>) | 发行包、官方 Profile、Renderer 与安装生命周期的确定性测试。 |
   | [tests/unit/](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/unit>)、[tests/integration/](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/integration>)、[tests/contract/](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/contract>)、[tests/security/](</Volumes/4Tdisk/work/AI2/harness-comfyui/tests/security>) | 模块、插件组合、发行合同与安全边界测试。 |
   | [docs/verification/official-desktop-plugin/](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/official-desktop-plugin>) | 官方应用能力、依赖与插件验收记录。 |
   | [docs/verification/host-0.2.1-rc.2/](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/verification/host-0.2.1-rc.2>) | 宿主升级的依赖审计与候选验收证据。 |

## 文档目录

1. [docs/system/](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system>) 保存插件架构、配置、技术栈、目录、测试与发布规范。
