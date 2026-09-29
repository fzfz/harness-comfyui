# Harness ComfyUI

Harness ComfyUI 是一个帮你自动查素材、配参数、调用 ComfyUI 出图的 AI 助手。你只需说清想画什么、选好工作流模板和底模，助手就会根据需求查找作品、角色、画师和 LoRA，搭配画师风格与 LoRA、设置各自的权重，并设计提示词和绘图参数。你不用逐项打开工作流手动调参数，可以把精力放在画面本身。

这些工作由 Agent（对话中的 AI 助手）配合 Skills（负责查资料、设计提示词和生图的技能）完成。生成后，还能直接调用图片识别工具，对照要求检查画面，为下一轮调整提供建议。

目前支持图片生成，后续计划支持视频和语音生成。

## 主要功能

- **插入前查看资源详情。** “插入上下文”弹窗按两列展示资源，提供分类详情和适配窗口的图片预览，便于选定素材后加入对话。

- **说出想画什么，助手自动找合适的素材。** 按需求的含义查询作品、角色、画师、画师串（多位画师的风格组合）和 LoRA（用于补充人物特征或画风的模型），根据查询结果搭配画师风格与 LoRA，并设置各自的权重，减少自己翻目录、试搭配的工作。
- **选好模板和底模，绘图参数交给助手。** 根据当前选择设计正向提示词、负面提示词、图片宽高、步数和 CFG（画面对提示词的遵循强度）等参数，并填入工作流，无需逐项手动调整。
- **三种生图模型，各用适合自己的提示词。** 支持 ANIMA、WAI-illustrious-SDXL 和 Krea2；助手根据选定模型使用对应技能设计提示词与画面参数。
- **自动调用工作流，支持多个 ComfyUI 实例。** 助手把组合好的提示词和参数交给工作流，再将生成任务发送到目标实例。你可以在同一个界面里查看进度、浏览结果和下载原图。
- **图片识别模型由你选，出图后还能继续分析。** 内置图片识别工具，支持供应商提供的图片识别模型，也支持自行填写 OpenAI 兼容接口，可接入你选择的无审核图片识别服务。它既能描述本地图片，也能对照生图要求指出画面偏差、提出修改建议。
- **满意的图片，能找回当时的生成方法。** 每次生成都会保存描述和绘图设置，便于查询、复用和继续调整，不必凭记忆重新试参数。

## 当前版本验收

v0.44.3 将 Desktop Stable 基线更新至 2.0.15，并将 DSH 插件 peer 范围更新为 `>=0.1.7-rc.2 <0.1.8`。OpenRouter 免费模型已验收工作台、用户自建预设、工具隔离、图片读取命令、迭代预设的四角色派发与构图角色续派，并验证以相同请求提交的两次生成任务；数据目录中的实例、模板和生成模型查询成功。四角色联测的视觉观察限制见 [v0.44.3 发布说明](docs/releasenotes.md#harness-comfyui-v0443)。

## CLI 帮助与图片读取

Agent 可通过 `node "$DSH_HARNESS_COMFYUI_CLI" --help` 查看命令分类，再通过 `node "$DSH_HARNESS_COMFYUI_CLI" image --help` 和 `node "$DSH_HARNESS_COMFYUI_CLI" image inspect --help` 逐层查看参数、stdin 示例和下一步操作。帮助调用在本地完成；业务调用默认将 JSON 结果写入 stdout，将 NEXT 指引写入 stderr，`--quiet` 可省略成功指引。

仓库内置图片读取配置与新建配置默认使用事实观察提示词。已有命名配置保留已保存的提示词；需要采用新默认用途时，在“设置 → ComfyUI → 图片读取”中编辑该配置。输出达到模型 token 上限时，CLI 报告 `IMAGE_READER_OUTPUT_LIMIT` 并提示检查参数。观察结果仍须对照原图核实，当前视觉模型的遮挡姿态误判记录见 [v0.44.1 发布说明](docs/releasenotes.md#harness-comfyui-v0441)。

## 使用前准备

本项目通过源码启动 DSH Desktop，也提供普通 Node.js 与 DSH 的纯 CLI 入口。GitHub Releases 提供版本记录和源码标签，不提供桌面安装包。当前默认配置使用 macOS 路径；在其他机器上使用前，需要按下文设置本机路径。

| 准备项 | 要求与用途 |
| --- | --- |
| Git、Node.js、pnpm | 使用 Git 获取源码。Node.js 支持 `^22.19.0` 或 `>=24.0.0`；pnpm 使用 `11.11.0`。 |
| DSH Desktop（桌面模式） | 提供桌面窗口、对话和模型设置。按下文准备本版本要求的 Desktop 源码与依赖。 |
| Chrome 或 Chromium | 安装在运行 Harness ComfyUI 的机器上，用于将 Workflow 转换为 ComfyUI 可执行的请求。 |
| 数据源服务 | 单独部署、可通过 HTTP 或 HTTPS 访问的服务，提供角色、画风、生成模型、LoRA、ComfyUI 实例与 Workflow 目录。准备服务 URL 和端口。 |
| ComfyUI 实例 | 在数据源服务中登记可访问的实例，并准备 Workflow 所需的模型、LoRA 和自定义节点。 |
| 对话模型 | 为 Agent 理解需求、编写提示词和调用生图能力提供服务。默认配置使用 OpenCode Go，需要相应 API Key。 |
| 图片读取模型 | 在需要描述图片或分析生成结果时使用，必须支持图片输入；在“设置 → ComfyUI → 图片读取”中单独配置。 |

对话模型和图片读取模型通过模型服务接口工作；生成模型运行在 ComfyUI 实例中，负责实际出图。选择对话模型不会替换 ComfyUI 的生成模型。

## 安装与首次启动

### 1. 选择源码版本

v0.44.3 使用自有仓库 fzfz/dsh-desktop-anywhere 的 Desktop Stable 2.0.15、DSH 0.1.7-rc.2 和 Electron 44.0.0，固定提交和安装路径由 config/desktop-baseline.json 指定。managed CLI 使用 DSH 进程内的专用回环 HTTP 服务，并通过前台 shell Tool Call 的短期 capability 认证。已发布版本的生产安装使用对应 tag 中的基线配置和说明。

### 2. 准备 DSH Desktop 与依赖

按 [Desktop 安装准备](docs/system/releasing.md#当前-desktop-的安装准备)准备基线配置指定的仓库、commit、Stable workspace 与锁定依赖。Desktop 必须完成安装和构建后才能启动本项目。

主 checkout 的项目依赖按 pnpm-lock.yaml 安装。独立 worktree 不执行 pnpm install；pnpm dev:start 从主 checkout 复用业务依赖和构建工具，并从基线 Stable workspace 解析宿主依赖。开发验收步骤见 [独立 worktree 开发规范](docs/agents/worktree-development.md)。

### 3. 准备开发 worktree 配置

独立 worktree 的 `dev:start` 从仓库配置物化非凭据 Provider 与图片读取配置，并从主 checkout 的 Git 忽略私密来源选择性物化所需凭据。配置来源、目标文件和覆盖规则见[系统配置说明](docs/system/configuration.md#desktop-基线与实例配置)。

### 4. 填写本机配置

首次安装时创建环境文件：

```sh
cp .env.example .env
```

启动前完成以下设置：

| 配置位置 | 需要填写的内容 |
| --- | --- |
| `.env` 中的 `OPENCODE_GO_API_KEY` | 将示例值替换为你的 OpenCode Go API Key，以使用默认对话模型。其他 Provider 和模型配置见[系统启动说明](docs/system/startup.md)。 |
| `config/desktop-production.json` 中的 `startupWorkspacePath` | 改为本机用于保存工作文件的 Workspace 绝对目录，并提前创建该目录。Desktop 启动后会直接打开这个 Workspace。 |
| `.env` 中的 `HARNESS_COMFYUI_FRONTEND_BROWSER_EXECUTABLE_PATH` | 默认值是 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。如果本机浏览器不在这个位置，取消示例行注释并填写实际可执行文件的绝对路径。 |

完整配置项及修改方式见[配置说明](docs/system/configuration.md)。数据源服务和图片读取模型在应用启动后通过设置页填写。

### 5. 启动并确认应用可用

```sh
pnpm prod:start
```

保持这个终端运行。另开一个终端，进入同一项目目录，执行：

```sh
pnpm prod:status
pnpm prod:logs
```

启动成功后，`prod:status` 显示 `ready`，Desktop 打开指定 Workspace，侧边栏提供“ComfyUI 工作台”入口。接下来配置数据源并完成第一次生图。

## 完成第一次生图

### 1. 连接数据源服务

打开“设置 → ComfyUI → 数据源服务”，分别填写 URL 和端口并保存。例如，服务运行在本机 `18093` 端口时，URL 填写 `http://127.0.0.1`，端口填写 `18093`。URL 中不包含端口或接口路径。

保存后，下一次目录查询使用新设置，无需重启应用。

### 2. 创建会话并选择生图资源

在“新建会话”菜单的预设选项中选择“ComfyUI工作台预设”；它也是本项目的默认预设。该预设提供本文介绍的提示词、生图和读图 Skills，无需另外安装。

点击侧边栏“ComfyUI 工作台”，然后点击对话输入区附近的“插入上下文”。在资源列表中搜索并选择条目，最后点击“插入”，将选择加入当前消息。

| 选择项 | 第一次生图时如何选择 |
| --- | --- |
| Workflow | 必须指定一个。选择已经在目标 ComfyUI 实例上准备好模型和节点的 Workflow。 |
| 生成模型 | 可以使用 Workflow 的默认生成模型；Workflow 未指定默认模型时，必须另选一个。所选生成模型与 Workflow 必须属于相同底模。 |
| LoRA | 可选。选择时必须与 Workflow 和生成模型属于相同底模。 |
| 角色、画风 | 可选。选择后可在编写提示词时引用；不选择时直接描述画面。 |

### 3. 先生成提示词结果

下面以 WAI-illustrious-SDXL 为例。先选择适用于该底模的 Workflow 和生成模型，再发送：

> 使用 wai-sdxl-prompt-builder，为以下画面生成提示词，并返回完整结果 JSON：雨后的街道，一位撑伞的旅人站在路灯下，湿润路面反射暖色灯光，竖幅构图。

ANIMA 和 Krea2 分别使用 `anima-prompt-builder` 与 `krea2-anime-prompt-builder`。请求中的提示词类型应与选定生成模型对应。

### 4. 提交生图并查看结果

复制上一条回复中的完整结果 JSON，粘贴到下一条消息中。通过“插入上下文”为这条消息加入选定的 Workflow，以及需要显式指定的生成模型和 LoRA，然后发送：

> 使用当前选择的 Workflow 和下方 Prompt Builder 结果 JSON 创建一张图片，图片尺寸使用 Workflow 默认值。

将完整结果 JSON 放在这句话下面。生图请求需要携带这份 JSON；只发送画面描述时，Agent 会提示补充提示词结果。

Agent 核对所选资源和参数后提交任务，并返回 Run ID。右侧“运行状态”显示任务进展；结果列关闭时，点击“打开结果列”。Agent 回复结束后，尚未结束的任务仍会继续更新，直到运行结束。生成成功后，结果列显示保存的图片。

## 查看与使用生成结果

点击结果列中的图片，在应用内打开查看窗口。查看窗口也支持播放已有生成记录中的视频；视频生成的专用技能属于后续计划。

- 使用方向按钮或键盘左右键切换当前会话的媒体。
- 在顶部查看像素尺寸，在媒体下方查看该次运行保存的正向提示词。
- 点击 Run ID 旁的复制按钮，取得当前媒体所属生成任务的完整编号。
- 点击“下载原文件”保存当前图片或视频；保存位置由 Desktop 的下载设置决定。
- 在结果列点击“下载所属运行的 Workflow”，取得该媒体所属运行的工作流文件。

每个 Run ID 对应一次生成调用。需要查询历史参数时，在该任务所属的 Workspace 中发送以下请求，并把占位文字替换为复制的完整 Run ID：

> 查询 Run ID「在这里粘贴完整 Run ID」保存的生成参数和实际 Workflow，列出正向提示词、Seed、模型与 LoRA 选择。

查询结果取决于该次运行保存的内容；未保存显式模型或 LoRA 选择时，可以继续查看实际 Workflow 中的配置。

## 编写提示词与分析图片

### 按目标选择提示词能力

在采用“ComfyUI工作台预设”的会话中说明目标即可，也可以直接写出 Skill 名称：

| 使用目的 | 请求示例 |
| --- | --- |
| ANIMA 提示词 | 使用 anima-prompt-builder，根据已选角色和画风，为雪夜车站场景构建十二槽 ANIMA3 Prompt。 |
| WAI 提示词 | 使用 wai-sdxl-prompt-builder，将这段画面描述改写为 WAI-illustrious-SDXL 英文 Prompt，并返回完整结果 JSON。 |
| Krea2 动漫提示词 | 使用 krea2-anime-prompt-builder，为全身正面站姿的舞蹈迁移源图编写提示词，并返回完整结果 JSON。 |
| 人物立绘提示词 | 使用 character-portrait-prompt-designer，读取我提供的书籍目录，为指定人物设计基本外观和各场景的立绘提示词。 |

人物立绘请求需要附上真实书籍目录与人物名；引用角色或画风目录内容时，通过“插入上下文”把对应条目加入同一条消息。

### 配置图片读取模型

打开“设置 → ComfyUI → 图片读取”，新建或编辑一份命名配置：

- 选择“系统 Provider”时，选择支持图片输入的 Provider 和模型。
- 选择“OpenAI 兼容接口”时，填写完整 Chat Completions 地址、模型 ID，以及接口需要的 API Key。
- 填写默认读图提示词、温度和最大输出 Token，保存配置，并将其选为当前使用的配置。

设置页支持保存多份配置并在它们之间切换。新的选择会用于下一次图片读取，无需重启应用。

系统向视觉模型发送图片前，会在内存中把 PNG、JPEG、WebP 或 GIF 无条件等比缩放至原宽高的 70%。处理结果保持输入格式；PNG、WebP 和 GIF 的透明像素以及动画 GIF/WebP 的帧、延时和循环次数继续保留。系统不会修改或上传用户原图。

### 描述图片或改进生图提示词

读取本地图片时，提供运行 Harness ComfyUI 的机器上可访问的图片绝对路径，例如：

> 读取图片 /Users/me/Pictures/example.png，描述人物姿态、服装、构图和光照。

分析生成结果时，提供 Run ID，例如：

> 分析 Run ID「在这里粘贴完整 Run ID」的图片，对比原始提示词，指出人物姿态和光照的偏差，并给出下一轮提示词。

分析完成后，需要重新出图时，先将改进提示词交给对应 Prompt Builder 生成完整结果 JSON，再按照“完成第一次生图”的步骤提交。

### 连续多轮改进图片

需要让助手连续生成、观察和调整图片时，在“新建会话”菜单中选择“ComfyUI迭代预设”，并说明画面目标。助手会先理解人物和故事，提出构图方案供你确认，再通过多轮生成与图片比较调整参数。你也可以提供已有迭代目录继续任务，或要求用新的随机种子复验选中的参数组合；迭代过程中会保存生成参数与图片。

## 纯 CLI 运行

纯 CLI 使用普通 Node.js 与 DSH `0.1.7-rc.2`，从当前目录创建 Session 和 Workspace。先准备 `profiles/comfyui-cli/package.json` 声明的精确 DSH 依赖、项目构建工具和业务依赖，并在独立 DSH home 配置 Provider、模型及凭据；目录和配置步骤见[纯 DSH CLI 启动说明](docs/system/startup.md#纯-dsh-cli)。

```sh
pnpm cli:run -- "请读取指定本地图片并描述画面"
```

任务文本需要给出实际图片绝对路径。生成任务需要最终图片时，调用者应在任务文本中要求 Agent 查询生成结果并在取得结果后结束。CLI 使用独立的会话、生成记录和媒体目录，复用 Desktop 的业务实现。

## 日常启动、停止与更新

以下命令在安装的已发布版本项目根目录执行：

| 命令 | 用途 |
| --- | --- |
| `pnpm prod:start` | 启动 Desktop；启动终端需要保持运行。 |
| `pnpm prod:status` | 查看运行状态。 |
| `pnpm prod:logs` | 查看 Desktop 日志。 |
| `pnpm prod:stop` | 停止 Desktop。 |
| `pnpm prod:restart` | 按当前版本和配置重启 Desktop。 |

修改 `.env` 或 JSON 配置文件后，执行 `pnpm prod:restart`。通过应用设置页保存的数据源服务和图片读取配置在下一次请求中生效。

更新前先停止 Desktop，并备份 `.env`、本机修改过的配置和 `.local/desktop-production/`。该运行目录包含会话、生成记录和保存的媒体。保留 `.local/upstreams/dsh-desktop`，按目标版本要求更新 Desktop 源码与依赖。

从 [Releases](https://github.com/fzfz/harness-comfyui/releases) 选择已发布版本，再按[版本更新步骤](docs/system/releasing.md#生产部署与验收)切换源码、更新依赖并启动。更新时保留本机路径配置与已有运行数据。

## 常见问题与反馈

| 遇到的问题 | 检查与处理方法 |
| --- | --- |
| Desktop 无法启动 | 执行 `pnpm prod:logs`，根据错误检查 Node.js、pnpm、Desktop 依赖、Workspace 路径和 `.env`。详见[系统启动说明](docs/system/startup.md)。 |
| 工作台无法读取资源 | 打开“设置 → ComfyUI → 数据源服务”，检查 URL、端口和服务运行状态。URL 与端口需要分别填写。 |
| Agent 提示缺少 Workflow 或结果 JSON | 为当前消息插入一个 Workflow，并粘贴对应 Prompt Builder 返回的完整结果 JSON，再提交请求。 |
| 生图报错 | 查看 Agent 返回的错误或“运行状态”中的失败信息。检查目标 ComfyUI 实例是否可访问、所选模型和 LoRA 是否匹配、Workflow 所需节点是否已安装，以及本机浏览器路径是否正确。 |
| 图片读取失败 | 检查当前启用的图片读取配置、模型图片输入能力、接口地址与凭据；读取本地图片时检查绝对路径是否存在且可访问。 |
| 历史 Run ID 查询不到结果 | 回到生成任务所属的 Workspace，使用查看窗口中复制的完整 Run ID 重试。 |

需要帮助或报告问题时，请在 [GitHub Issues](https://github.com/fzfz/harness-comfyui/issues) 中提供：使用版本、操作步骤、预期结果、实际错误信息，以及适用时的 Run ID 和相关日志片段。

## 开发与贡献

准备修改源码时，先阅读[系统架构](docs/system/architecture.md)与[目录结构](docs/system/directory-structure.md)。独立 worktree 的准备和 Desktop 验证步骤见[开发环境说明](docs/agents/worktree-development.md)。

开发 Desktop 使用 `pnpm dev:*`；`pnpm web:*` 用于单独调试 Web Host。完整自动化检查命令是 `pnpm quality`，测试范围见[测试说明](docs/system/testing.md)。提交问题前可以搜索已有 [Issues](https://github.com/fzfz/harness-comfyui/issues)；仓库的问题管理约定见[Issue 管理说明](docs/agents/issue-tracker.md)。

## 相关文档

- **配置与运行**：[配置说明](docs/system/configuration.md)、[系统启动说明](docs/system/startup.md)。
- **系统原理**：[技术栈](docs/system/technology-stack.md)、[系统架构](docs/system/architecture.md)、[目录结构](docs/system/directory-structure.md)。
- **版本记录**：[发布说明](docs/releasenotes.md)、[GitHub Releases](https://github.com/fzfz/harness-comfyui/releases)。
