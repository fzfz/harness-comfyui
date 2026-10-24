---
文档用途: 介绍插件功能、安装入口和使用方法。
读取时机: 初次了解或准备使用插件时。
---
# Harness ComfyUI

1. Harness ComfyUI 通过预构建插件包安装到官方 DeepSeek Harness Desktop。宿主提供窗口、会话、模型设置和插件管理；插件提供 ComfyUI 工作台、2 个产品预设、5 个子 Agent 角色预设及项目 Skills。

2. Harness ComfyUI 帮助用户查找绘图素材、设计提示词并调用 ComfyUI 生成图片。

3. 这些工作由 Agent（对话中的 AI 助手）配合 Skills（负责查资料、设计提示词和生图的技能）完成。生成后，还能直接调用图片识别工具，对照要求检查画面，为下一轮调整提供建议。

4. 目前支持图片生成，后续计划支持视频和语音生成。

## 主要功能

1. **插入前查看资源详情。** “插入上下文”弹窗按两列展示资源，提供分类详情和适配窗口的图片预览，便于选定素材后加入对话。

2. **说出想画什么，助手自动找合适的素材。** 按需求的含义查询作品、角色、画师、画师串（多位画师的风格组合）和 LoRA（用于补充人物特征或画风的模型），根据查询结果搭配画师风格与 LoRA，并设置各自的权重，减少自己翻目录、试搭配的工作。
3. **选好模板和底模，绘图参数交给助手。** 根据当前选择设计正向提示词、负面提示词、图片宽高、步数和 CFG（画面对提示词的遵循强度）等参数，并填入工作流，无需逐项手动调整。
4. **三种生图模型，各用适合自己的提示词。** 支持 ANIMA、WAI-illustrious-SDXL 和 Krea2；助手根据选定模型使用对应技能设计提示词与画面参数。
5. **自动调用工作流，支持多个 ComfyUI 实例。** 助手把组合好的提示词和参数交给工作流，再将生成任务发送到目标实例。你可以在同一个界面里查看进度、浏览结果和下载原图。
6. **图片识别模型由你选，出图后还能继续分析。** 内置图片识别工具，支持供应商提供的图片识别模型，也支持自行填写 OpenAI 兼容接口，可接入你选择的无审核图片识别服务。图片识别工具既能描述本地图片，也能对照生图要求指出画面偏差、提出修改建议。
7. **满意的图片，能找回当时的生成方法。** 每次生成都会保存描述和绘图设置，便于查询、复用和继续调整，不必凭记忆重新试参数。

## 适用版本

1. 插件 `0.47.1` 必须搭配官方 macOS DeepSeek Harness Desktop `0.2.1-rc.2` 使用。版本功能见[发布说明](docs/releasenotes.md#harness-comfyui-v0471)。

## CLI 帮助与图片读取

1. Agent 在前台 shell Tool Call 中使用 Host 提供的入口查看帮助：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --help
   ```

2. Agent 将末尾参数依次替换为 `image --help` 和 `image inspect --help`，即可查看图片读取参数、stdin 示例和下一步操作。业务调用将 JSON 结果保存为文件，stdout 返回文件路径，NEXT 指引写入 stderr；`--quiet` 可省略成功指引。


3. 输出达到模型 Token 上限时，CLI 报告 `IMAGE_READER_OUTPUT_LIMIT`。参数设置见[配置图片读取模型](#配置图片读取模型)。

## 安装与使用前准备

1. 用户准备官方 DeepSeek Harness Desktop `0.2.1-rc.2`、本机 Chrome 或 Chromium、可访问的数据源服务和已登记的 ComfyUI 实例。目标实例须具备所选 Workflow 使用的模型、LoRA 和自定义节点。对话模型及凭据通过官方应用设置配置；图片读取模型须支持图片输入，并在插件设置中单独选择。ComfyUI 的生成模型负责实际出图，模型设置中的对话模型负责理解需求和调用工具。

2. 用户从 [GitHub Releases](https://github.com/fzfz/harness-comfyui/releases) 下载目标版本的 `harness-comfyui-<版本>.tgz`。
3. 用户在官方 Desktop 的“插件”页面选择“添加插件”，填写本机包的绝对路径或 Release 附件下载地址，完成安装并启用。
4. 用户完全退出并重新打开应用后，核对实际插件版本和两个产品预设。列表还会显示工作台任务、构图、生成、观察和比较的角色预设，供助手派发子任务使用。

5. 在插件详情页的 ComfyUI 设置中保存数据源 URL、端口、图片读取配置及 Workflow 浏览器可执行文件路径。安装、版本核对、备份、更新和失败恢复的完整步骤见[官方 Desktop 安装与更新](docs/user/install-update.md)。普通用户使用已发布插件包，无需准备项目 checkout 或另装系统 Node、pnpm、DSH。

## 完成第一次生图

### 1. 连接数据源服务

1. 打开插件详情页的“ComfyUI → 数据源服务”，分别填写 URL 和端口并保存。例如，服务运行在本机 `18093` 端口时，URL 填写 `http://127.0.0.1`，端口填写 `18093`。URL 中不包含端口或接口路径。

2. 保存后，工作台资源列表和 Host 的生成请求使用新设置。
3. 使用两个 ComfyUI 预设前，维护者按[连接目录服务](docs/user/install-update.md#连接目录服务)完成配置。

### 2. 创建会话并选择生图资源

1. 在“新建会话”菜单的预设选项中选择“ComfyUI工作台预设”。该预设提供本文介绍的提示词、生图和读图 Skills，无需另外安装。

2. 点击侧边栏“ComfyUI 工作台”，然后点击对话输入区附近的“插入上下文”。在资源列表中搜索并选择条目，最后点击“插入”，将选择加入当前消息。

   | 选择项 | 第一次生图时如何选择 |
   | --- | --- |
   | Workflow | 必须指定一个。选择已经在目标 ComfyUI 实例上准备好模型和节点的 Workflow。 |
   | 生成模型 | 可以使用 Workflow 的默认生成模型；Workflow 未指定默认模型时，必须另选一个。所选生成模型与 Workflow 必须属于相同底模。 |
   | LoRA | 可选。选择时必须与 Workflow 和生成模型属于相同底模。 |
   | 角色、画风 | 可选。选择后可在编写提示词时引用；不选择时直接描述画面。 |

### 3. 先生成提示词结果

1. 下面以 WAI-illustrious-SDXL 为例。先选择适用于该底模的 Workflow 和生成模型，再发送：

   > 使用 wai-sdxl-prompt-builder，为以下画面生成提示词，并返回完整结果 JSON：雨后的街道，一位撑伞的旅人站在路灯下，湿润路面反射暖色灯光，竖幅构图。

2. ANIMA 和 Krea2 分别使用 `anima-prompt-builder` 与 `krea2-anime-prompt-builder`。请求中的提示词类型应与选定生成模型对应。

### 4. 提交生图并查看结果

1. 复制上一条回复中的完整结果 JSON，粘贴到下一条消息中。通过“插入上下文”为这条消息加入选定的 Workflow，以及需要显式指定的生成模型和 LoRA，然后发送：

   > 使用当前选择的 Workflow 和下方 Prompt Builder 结果 JSON 创建一张图片，图片尺寸使用 Workflow 默认值。

2. 将完整结果 JSON 放在这句话下面。生图请求需要携带这份 JSON；只发送画面描述时，Agent 会提示补充提示词结果。

3. Agent 核对所选资源和参数后提交任务，并返回 Run ID。右侧“运行状态”显示任务进展；结果列关闭时，点击“打开结果列”。Agent 回复结束后，尚未结束的任务仍会继续更新，直到运行结束。生成成功后，结果列显示保存的图片。

## 查看与使用生成结果

1. 点击结果列中的图片，在应用内打开查看窗口。查看窗口也支持播放已有生成记录中的视频；视频生成的专用技能属于后续计划。

2. 使用方向按钮或键盘左右键切换当前会话的媒体。
3. 在顶部查看像素尺寸，在媒体下方查看该次运行保存的正向提示词。
4. 点击 Run ID 旁的复制按钮，取得当前媒体所属生成任务的完整编号。
5. 点击“下载原文件”保存当前图片或视频；保存位置由 Desktop 的下载设置决定。
6. 在结果列点击“下载所属运行的 Workflow”，取得该媒体所属运行的工作流文件。

7. 每个 Run ID 对应一次生成调用。需要查询历史参数时，在该任务所属的 Workspace 中发送以下请求，并把占位文字替换为复制的完整 Run ID：

   > 查询 Run ID“在这里粘贴完整 Run ID”保存的生成参数和实际 Workflow，列出正向提示词、Seed、模型与 LoRA 选择。

8. 查询结果取决于该次运行保存的内容；未保存显式模型或 LoRA 选择时，可以继续查看实际 Workflow 中的配置。

## 编写提示词与分析图片

### 按目标选择提示词能力

1. 在采用“ComfyUI工作台预设”的会话中说明目标即可，也可以直接写出 Skill 名称：

   | 使用目的 | 请求示例 |
   | --- | --- |
   | ANIMA 提示词 | 使用 anima-prompt-builder，根据已选角色和画风，为雪夜车站场景构建十二槽 ANIMA3 Prompt。 |
   | WAI 提示词 | 使用 wai-sdxl-prompt-builder，将这段画面描述改写为 WAI-illustrious-SDXL 英文 Prompt，并返回完整结果 JSON。 |
   | MOSS-Image 提示词 | 使用 moss-prompt-builder，将画面描述扩写为 Caption；需要精确布局时，提供画布尺寸并生成 Layout 提示词。 |
   | Krea2 动漫提示词 | 使用 krea2-anime-prompt-builder，为全身正面站姿的舞蹈迁移源图编写提示词，并返回完整结果 JSON。 |
   | 人物立绘提示词 | 使用 character-portrait-prompt-designer，读取我提供的书籍目录，为指定人物设计基本外观和各场景的立绘提示词。 |

2. 人物立绘请求需要附上真实书籍目录与人物名；引用角色或画风目录内容时，通过“插入上下文”把对应条目加入同一条消息。

### 配置图片读取模型

1. 打开插件详情页的“ComfyUI → 图片读取”，新建或编辑一份命名配置：

2. 选择“系统 Provider”时，选择支持图片输入的 Provider 和模型。
3. 选择“OpenAI 兼容接口”时，填写完整 Chat Completions 地址、模型 ID，以及接口需要的 API Key。
4. 填写默认读图提示词、温度和最大输出 Token，保存配置，并将其选为当前使用的配置。

5. 设置页支持保存和切换多份配置。新的选择会用于下一次图片读取，无需重启应用。

### 描述图片或改进生图提示词

1. 读取本地图片时，提供运行 Harness ComfyUI 的机器上可访问的图片绝对路径，例如：

   > 读取图片 /Users/me/Pictures/example.png，描述人物姿态、服装、构图和光照。

2. 分析生成结果时，提供 Run ID，例如：

   > 分析 Run ID“在这里粘贴完整 Run ID”的图片，对比原始提示词，指出人物姿态和光照的偏差，并给出下一轮提示词。

3. 分析完成后，需要重新出图时，先将改进提示词交给对应 Prompt Builder 生成完整结果 JSON，再按照“完成第一次生图”的步骤提交。

### 连续多轮改进图片

1. 需要让助手连续生成、观察和调整图片时，在“新建会话”菜单中选择“ComfyUI迭代预设”，并说明画面目标。助手会先理解人物和故事，提出构图方案供你确认，再通过多轮生成与图片比较调整参数。你也可以提供已有迭代目录继续任务，或要求用新的随机种子复验选中的参数组合；迭代过程中会保存生成参数与图片。

## 日常使用与更新

1. 通过官方 Desktop 打开、退出应用及管理插件。在项目预设会话中使用工作台和受管 CLI；初始化完成后，官方 Profile 保留 Provider、凭据引用、插件设置和业务数据。

2. 更新前等待活动生成结束，完全退出应用，并备份当前官方 Profile 中的插件配置、凭据引用及完整插件数据目录。通过官方插件管理器卸载旧版本、安装目标 Release 的 `.tgz`，启用后完全退出并重新打开，核对版本、配置、历史 Run 和媒体。失败恢复步骤见[安装与更新指南](docs/user/install-update.md#更新失败时恢复)。

## 常见问题与反馈

| 遇到的问题 | 检查与处理方法 |
| --- | --- |
| Desktop 无法启动 | 查看官方 Desktop 的应用日志，按错误检查应用版本、插件安装结果和当前 Profile 的写入权限。插件安装操作见[安装指南](docs/user/install-update.md)。 |
| 工作台无法读取资源 | 打开插件详情页的“ComfyUI → 数据源服务”，检查 URL、端口和服务运行状态。URL 与端口需要分别填写。 |
| Agent 提示缺少 Workflow 或结果 JSON | 为当前消息插入一个 Workflow，并粘贴对应 Prompt Builder 返回的完整结果 JSON，再提交请求。 |
| 生图报错 | 查看 Agent 返回的错误或“运行状态”中的失败信息。检查目标 ComfyUI 实例是否可访问、所选模型和 LoRA 是否匹配、Workflow 所需节点是否已安装，以及本机浏览器路径是否正确。 |
| 图片读取失败 | 检查当前启用的图片读取配置、模型图片输入能力、接口地址与凭据；读取本地图片时检查绝对路径是否存在且可访问。 |
| 历史 Run ID 查询不到结果 | 回到生成任务所属的 Workspace，使用查看窗口中复制的完整 Run ID 重试。 |

1. 需要帮助或报告问题时，请在 [GitHub Issues](https://github.com/fzfz/harness-comfyui/issues) 中提供：使用版本、操作步骤、预期结果、实际错误信息，以及适用时的 Run ID 和相关日志片段。

## 开发与贡献

1. 准备修改源码时，先阅读[系统架构](docs/system/architecture.md)与[目录结构](docs/system/directory-structure.md)。独立 worktree 的准备和 Desktop 验证步骤见[开发环境说明](docs/agents/worktree-development.md)。

2. `pnpm build` 和 `pnpm pack:plugin` 构建插件包；`pnpm test:desktop` 自动构建候选、安装到隔离官方应用、验证业务功能并清理测试进程。交互调试使用独立 worktree 的持久环境，首次初始化后复用已保存配置。完整自动化检查命令是 `pnpm quality`，测试范围见[测试说明](docs/system/testing.md)。提交问题前可以搜索已有 [Issues](https://github.com/fzfz/harness-comfyui/issues)；仓库的问题管理约定见[Issue 管理说明](docs/agents/issue-tracker.md)。

## 相关文档

1. **配置与运行**：[配置说明](docs/system/configuration.md)、[系统启动说明](docs/system/startup.md)。
2. **系统原理**：[技术栈](docs/system/technology-stack.md)、[系统架构](docs/system/architecture.md)、[目录结构](docs/system/directory-structure.md)。
3. **版本记录**：[发布说明](docs/releasenotes.md)、[GitHub Releases](https://github.com/fzfz/harness-comfyui/releases)。
