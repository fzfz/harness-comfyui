---
文档用途: 索引源码、配置、测试和构建产物的目录职责。
读取时机: 定位模块、添加文件或调整目录职责前。
---
# 目录结构

## 插件源码目录

1. 本仓库的源码边界是 Harness ComfyUI 插件。官方 Desktop 与 DeepSeek Harness Host 属于独立项目；插件接入边界见[系统架构](architecture.md#官方宿主与插件载入)。

2. 插件源码按以下职责组织。

   | 路径 | 内容 |
   | --- | --- |
   | `src/host/core/` | Core 插件装配、Host 配置加载与存储初始化。 |
   | `src/host/source-client/` | Host 内部数据源客户端与目录协议校验。 |
   | `src/host/catalog/` | Catalog 查询适配、展示投影、查询 Tools 与 Remote。 |
   | `src/host/cli/` | 受管 CLI listener、Tool Call capability、请求分发与 Workspace 登记。 |
   | `src/host/web/` | Host Remote 与媒体路由装配。 |
   | `src/host/generation/` | Generation Runtime、Workflow 参数化、官方前端导出、缓存、Comfy transport、coordinator 与媒体服务。 |
   | `src/host/image-reader/` | 图片读取配置、模型目录、输入处理、Provider 适配与单图读取 Tool。 |
   | `src/host/tools/` | 项目 Tool 注册入口。 |
   | `src/host/resource-path.ts` | 已安装包内资源的定位入口。 |
   | `src/host/node-script-environment.ts` | Electron Node 脚本环境入口。 |
   | `src/source-settings.ts` | 数据源地址与端口合同。 |
   | `src/cli/` | Host、Tool 与 CLI 共用的业务请求和参数合同。 |
   | `src/generation/` | Generation Remote、媒体 URL 与历史 Run 查询合同。 |
   | `src/image-reader/` | 图片读取配置、凭据操作、模型目录与 Remote 合同。 |
   | `src/catalog/` | Catalog 展示字段、详情 schema 与上下文类型。 |
   | `src/config/` | Configuration Profile 载入器。 |
   | `src/client/` | 工作台、上下文选择器、Run 与媒体投影、ComfyUI 设置页。 |

## Preset 与 Skill 资源

1. 项目 Preset 与共享组件位于以下路径。

   | 路径 | 内容 |
   | --- | --- |
   | `agent-presets/presets.cordis.yml` | 项目 Preset registry 声明。 |
   | `agent-presets/harness-comfyui-cli-candidate/` | ComfyUI工作台预设的资源。 |
   | `agent-presets/harness-comfyui-iteration/` | ComfyUI迭代预设的主 Agent、四个角色与派发配置。 |
   | `agent-presets/noobai-mcp.cordis.yml` | 两个项目 Preset 共用的 NoobAI MCP 服务配置。 |
   | `agent-presets/project-installed-presets.mjs` | 已安装 Preset 资源入口。 |
   | `agent-presets/project-installed-skills.mjs` | Preset 作用域内的 Skill 资源入口。 |
   | `agent-presets/project-iteration-dispatch.mjs` | 迭代角色工具与 DSH 子会话派发接口。 |
   | `agent-presets/project-subagent-workspace.mjs` | 父子 Session 的 Workspace 关联。 |
   | `agent-presets/project-tool-visibility.mjs`、`project-system-prompt-visibility.mjs` | Preset 的 Tool 与系统提示词可见范围。 |

2. 项目 Skill 的唯一源码目录如下；执行入口为各目录的 `SKILL.md`。

   | 路径 | 内容 |
   | --- | --- |
   | `.agents/skills/anima-prompt-builder/` | ANIMA3 Prompt 与历史 Generation Run 查询。 |
   | `.agents/skills/character-portrait-prompt-designer/` | 角色立绘 Prompt 与历史 Generation Run 查询。 |
   | `.agents/skills/comfyui-generate/` | Builder 结果消费、模板参数检查、Seed 分配与 ComfyUI 生成。 |
   | `.agents/skills/comfyui-image-review/` | Run 图片读取、参数比较与 Prompt 改进。 |
   | `.agents/skills/comfyui-iterate-generation/` | 图片迭代调度；文件交接合同位于 `references/records.md`。 |
   | `.agents/skills/krea2-anime-prompt-builder/` | Krea2 动漫 Prompt 与历史 Generation Run 查询。 |
   | `.agents/skills/moss-prompt-builder/` | MOSS-Image Caption 与像素 Layout 提示词。 |
   | `.agents/skills/local-image-reader/` | 用户提供本地图片路径时的视觉读取。 |
   | `.agents/skills/wai-sdxl-prompt-builder/` | WAI Prompt 与历史 Generation Run 查询。 |

## 配置与构建入口

1. 配置文件按以下职责组织，字段与生效规则见[配置规范](configuration.md)。

   | 路径 | 内容 |
   | --- | --- |
   | `cordis.patch.yml` | Host 插件与已安装 Preset 的装配声明。 |
   | `locales/` | 官方插件管理界面使用的插件包与组件名称。 |
   | `config/base.json`、`config/profiles/production.json` | Configuration Profile 默认值。 |
   | `config/schema.ts` | Configuration Profile 字段与约束。 |
   | `config/environment-overrides.json` | 环境覆盖映射。 |
   | `config/plugin-storage.json` | 插件存储字段清单。 |
   | `config/product-agent.json`、`config/product-agent-schema.mjs` | Preset 与 Skill 资源清单及约束。 |
   | `config/settings-entry-ids.json` | Profile Settings 条目标识。 |
   | `config/image-reader-profiles.json`、`config/image-reader-processing.json`、`config/image-reader-runtime.json` | 图片读取配置默认值、输入处理参数与运行字段。 |
   | `config/error-catalog.json` | Host 错误码与消息目录。 |
   | `config/plugin-package.json`、`config/plugin-package-schema.mjs` | 发行 tarball 的资源清单及约束。 |
   | `config/runtime-artifacts.json` | Host、Client、CLI 与 Workflow Worker 的源码和构建路径。 |
   | `config/managed-cli-help.json` | 受管 CLI 帮助配置。 |
   | `config/source-client.json` | Host 内部数据源客户端的协议路径与请求限制。 |
   | `config/managed-cli-environment.json` | 受管 CLI 环境字段。 |
   | `config/node-script-runtime.json` | Electron Node 脚本环境字段。 |
   | `config/desktop-e2e.json`、`config/desktop-e2e-schema.mjs` | 官方 Desktop 验收配置与运行记录合同。 |
   | `scripts/build/` | 插件构建与 tarball 打包入口。 |
   | `scripts/cli/` | 受管 CLI 入口、帮助、参数解析与结果文件管理模块。 |

## 数据与构建产物目录

1. 插件业务数据目录由 Configuration Profile 的 `paths` 字段定位，详见[配置规范](configuration.md#configuration-profile-字段)。插件安装目录保存可替换的代码和资源。

2. 构建产物由 `config/runtime-artifacts.json` 定位：`.local/source-host/` 保存 Host bundle 与 Workflow Worker，`.local/source-client/` 保存 Client bundle，`.local/source-cli/` 保存受管 CLI。插件 tarball 的文件范围由 `config/plugin-package.json` 定义。

## 开发验收目录

1. 官方 Desktop 验收目录由 `config/desktop-e2e.json` 定义。`.local/desktop-e2e/<run-id>/` 保存每轮日志、证据与运行记录；`.local/desktop-development/official-environment/` 保存持久开发 Harness home、user-data 与 Workspace。实例操作见[worktree 规范](../agents/worktree-development.md)。

2. 测试代码与验收证据按以下职责组织，执行入口和通过条件见[测试规范](testing.md)。

   | 路径 | 内容 |
   | --- | --- |
   | `tests/desktop/fixtures/` | 官方 Desktop 隔离、安装、CDP 与业务验收夹具。 |
   | `tests/desktop/run-desktop-tests.mjs` | 官方 Desktop 候选构建、打包与验收总入口。 |
   | `tests/desktop/official-desktop-lifecycle.test.mjs` | 设置、Session 隔离与启动和清理生命周期验收。 |
   | `tests/desktop/official-desktop-live.test.mjs` | 插件安装、设置、生成、历史与媒体的官方应用业务 E2E。 |
   | `tests/production/` | 发行包、官方 Profile、Renderer 与安装生命周期的确定性测试。 |
   | `tests/unit/`、`tests/integration/`、`tests/contract/`、`tests/security/` | 模块、插件组合、发行合同与安全边界测试。 |
   | `docs/verification/official-desktop-plugin/` | 官方应用能力、依赖与插件验收记录。 |

## 文档目录

1. `docs/system/` 保存插件架构、配置、技术栈、目录、测试与发布规范。
