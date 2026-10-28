---
文档用途: 介绍插件功能、安装入口和使用方法。
读取时机: 初次了解或准备使用插件时。
---
# Harness ComfyUI

1. Harness ComfyUI 通过预构建插件包安装到官方 DeepSeek Harness Desktop。宿主提供窗口、会话、模型设置和插件管理；插件提供 ComfyUI 工作台与“ComfyUI工作台预设”。

2. Harness ComfyUI 的 Agent（对话中的 AI 助手）调用 Skills（技能），帮助用户查找绘图素材、设计提示词并调用 ComfyUI 生成图片。

## 主要功能

1. **插入前查看资源详情。** “插入上下文”弹窗按两列展示资源，提供分类详情和图片预览。用户可选定素材后加入对话。

2. **说出想画什么，助手自动找合适的素材。** 助手按需求查询作品、角色、画师和 LoRA。画师串用于组合多位画师的风格；LoRA 用于补充人物特征或画风。助手根据查询结果搭配画师风格与 LoRA，并设置各自的权重。
3. **选好模板和底模，绘图参数交给助手。** 助手根据当前选择设计提示词和绘图参数，再填入工作流。参数包括图片宽高、步数和 CFG（画面对提示词的遵循强度）。
4. **按生图模型设计提示词。** 支持 ANIMA、WAI-illustrious-SDXL 和 Krea2；助手根据选定模型使用对应技能设计提示词与画面参数。
5. **自动调用工作流，支持多个 ComfyUI 实例。** 助手把组合好的提示词和参数交给工作流，再将生成任务发送到目标实例。你可以在同一个界面里查看进度、浏览结果和下载原图。
6. **独立选择图片读取模型，分析生成结果。** 用户可选择宿主视觉模型，也可填写自定义 OpenAI 兼容接口。每份命名配置分别保存模型和默认读图提示词。助手既能描述本地图片，也能对照生图要求指出画面偏差、提出修改建议。
7. **查询并复用生成参数。** 每次生成都会保存描述和绘图设置，供用户查询、复用和调整。
8. **持续推进明确目标。** 用户要求持续完成目标时，工作台使用宿主 Goal 管理进度。用户可在会话中查看、暂停和恢复目标。

## 适用版本

1. 插件 `0.49.0` 必须搭配官方 macOS DeepSeek Harness Desktop `0.2.1-rc.3` 使用。版本功能见[发布说明](<https://github.com/fzfz/harness-comfyui/blob/main/docs/releasenotes.md#harness-comfyui-v0490>)。

## CLI 帮助与图片读取

1. Agent 在官方 Desktop 的工作台会话中，通过前台 Shell 工具执行以下命令，查看插件 CLI 帮助。插件向该工具提供命令所用的两个环境变量：

   ```sh
   ELECTRON_RUN_AS_NODE=1 "$DSH_HARNESS_COMFYUI_NODE_EXECUTABLE" --expose-internals "$DSH_HARNESS_COMFYUI_CLI" --help
   ```

2. Agent 将命令末尾的 `--help` 依次替换为 `image --help` 和 `image inspect --help`，查看图片读取参数及调用示例。

3. 输出达到模型 Token 上限时，CLI 报告 `IMAGE_READER_OUTPUT_LIMIT`。用户可按[配置图片读取模型](<#配置图片读取模型>)调整最大输出 Token。

## 安装与使用前准备

1. 用户按[适用版本](<#适用版本>)准备官方 DeepSeek Harness Desktop，并准备本机 Chrome 或 Chromium。用户还须准备可访问的数据源服务，以及服务中登记的 ComfyUI 实例和 Workflow 模板。目标实例须具备所选 Workflow 使用的模型、LoRA 和自定义节点。服务配置见[连接目录服务](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/user/install-update.md#连接目录服务>)。

2. 用户在官方应用设置中配置对话模型及凭据；图片读取模型按[配置图片读取模型](<#配置图片读取模型>)准备。

3. 用户从 [GitHub Releases](<https://github.com/fzfz/harness-comfyui/releases>) 下载目标版本的 `harness-comfyui-<版本>.tgz`。
4. 用户在官方 Desktop 的“插件”页面选择“添加插件”。填写本机包的绝对路径或 Release 附件下载地址，完成安装并启用。
5. 用户完全退出并重新打开应用后，核对实际插件版本，并确认“ComfyUI工作台预设”可选。

6. 用户在插件详情页的 ComfyUI 设置中保存 Workflow 浏览器可执行文件路径。安装、版本核对、备份、更新和失败恢复的完整步骤见[官方 Desktop 安装与更新](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/user/install-update.md>)。
7. 插件随包提供 8 个提示词、生图与读图 Skill。用户在工作台预设会话中即可使用，名称与用途见[项目 Skills](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/user/install-update.md#项目-skills>)。

## 完成第一次生图

### 1. 连接数据源服务

1. 打开插件详情页的“ComfyUI → 数据源服务”，分别填写 URL 和端口并保存。URL 填写协议和主机地址。例如，服务运行在本机 `18093` 端口时，URL 填写 `http://127.0.0.1`，端口填写 `18093`。

2. 维护者按[连接目录服务](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/user/install-update.md#连接目录服务>)配置同一数据源服务的 NoobAI MCP 入口，供 Agent 查询素材。

### 2. 创建会话并选择生图资源

1. 在官方 Desktop 中选择项目目录作为工作区（Workspace）。在“新建会话”菜单的预设选项中选择“ComfyUI工作台预设”。后续历史查询使用同一项目目录对应的工作区。

2. 点击侧边栏“ComfyUI 工作台”，然后点击对话输入区附近的“插入上下文”。在资源列表中搜索并选择条目，最后点击“插入”，将选择加入当前消息。

   | 选择项 | 第一次生图时如何选择 |
   | --- | --- |
   | Workflow | 必须指定一个。选择已经在目标 ComfyUI 实例上准备好模型和节点的 Workflow。 |
   | 生成模型 | 可以使用 Workflow 的默认生成模型；Workflow 未指定默认模型时，必须另选一个。所选生成模型与 Workflow 必须属于相同底模。 |
   | LoRA | 可选。选择时必须与 Workflow 和生成模型属于相同底模。 |
   | 角色、画风 | 可选。选择后可在编写提示词时引用；不选择时直接描述画面。 |

### 3. 先生成提示词结果

1. 下面以 WAI-illustrious-SDXL 为例。先选择适用于该底模的 Workflow 和生成模型，再发送：

   > 使用 wai-sdxl-prompt-builder，为以下画面生成提示词，并返回完整结果 JSON。画面：雨后街道上的旅人撑伞站在路灯下。湿润路面反射暖色灯光，采用竖幅构图。

2. ANIMA 和 Krea2 分别使用 `anima-prompt-builder` 与 `krea2-anime-prompt-builder`。请求中的提示词类型应与选定生成模型对应。

### 4. 提交生图并查看结果

1. 将上一条回复中的完整结果 JSON 粘贴到下方请求之后。通过“插入上下文”加入选定的 Workflow，以及要显式指定的生成模型和 LoRA：

   > 使用当前选择的 Workflow 和下方提示词技能返回的完整结果 JSON 创建一张图片，图片尺寸使用 Workflow 默认值。

2. Agent 核对所选资源和参数后提交任务，并返回生成任务编号（Run ID）。右侧“运行状态”显示任务进展；结果列关闭时，点击“打开结果列”。Agent 回复结束后，“运行状态”继续更新任务进度。生成成功后，结果列显示保存的图片。

## 查看与使用生成结果

1. 点击结果列中的图片，在应用内打开查看窗口。查看窗口也支持播放已有生成记录中的视频。

2. 使用方向按钮或键盘左右键切换当前会话的媒体。
3. 在顶部查看像素尺寸，在媒体下方查看该次运行保存的正向提示词。
4. 点击 Run ID 旁的复制按钮，取得当前媒体所属生成任务的完整编号。
5. 点击“下载原文件”保存当前图片或视频；保存位置由 Desktop 的下载设置决定。
6. 在结果列点击“下载所属运行的 Workflow”，取得该媒体所属运行的工作流文件。

7. 需要查询历史参数时，回到任务所属的工作区。将占位文字替换为复制的完整 Run ID，再发送以下请求：

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

2. 人物立绘请求需要附上存放书籍或角色卡材料的文件夹绝对路径与人物名；引用角色或画风目录内容时，通过“插入上下文”把对应条目加入同一条消息。

### 配置图片读取模型

1. 打开插件详情页的“ComfyUI → 图片读取”，新建或编辑一份命名配置。

2. 选择“系统 Provider”时，选择支持图片输入的 Provider 和模型。
3. 选择“OpenAI 兼容接口”时，填写完整 Chat Completions 地址、模型 ID 和图片服务的 API Key。
4. 填写默认读图提示词、温度和最大输出 Token，保存配置，并将其选为当前使用的配置。所选配置从下一次图片读取开始生效。

5. 需要不同分析方法时，新建多份配置并分别保存默认读图提示词。对话模型与图片读取模型分别选择；临时提出的读图要求只用于本次读取。

### 描述图片或改进生图提示词

1. 读取本地图片时，提供运行 Harness ComfyUI 的机器上可访问的图片绝对路径，例如：

   > 读取图片 /Users/me/Pictures/example.png，描述人物姿态、服装、构图和光照。

2. 分析生成结果时，提供 Run ID，例如：

   > 分析 Run ID“在这里粘贴完整 Run ID”的图片。对比原始提示词，指出人物姿态和光照的偏差，并给出下一轮提示词。

3. 需要重新出图时，将改进提示词交给对应技能生成完整结果 JSON。再按照“完成第一次生图”的步骤提交。

## 日常使用与更新

1. 用户通过官方 Desktop 打开和退出应用，并在“插件”页面管理 Harness ComfyUI。

2. 更新插件或恢复更新失败的环境时，按[安装与更新指南](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/user/install-update.md>)操作。

## 常见问题与反馈

1. 按下表处理使用问题：

   | 遇到的问题 | 检查与处理方法 |
   | --- | --- |
   | Desktop 无法启动 | 查看官方 Desktop 的应用日志，按错误检查应用版本、插件安装结果和当前 Profile 的写入权限。插件安装操作见[安装指南](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/user/install-update.md>)。 |
   | 工作台无法读取资源 | 打开插件详情页的“ComfyUI → 数据源服务”，检查 URL、端口和服务运行状态。URL 与端口需要分别填写。 |
   | Agent 提示缺少 Workflow 或结果 JSON | 为当前消息插入一个 Workflow，并粘贴对应提示词技能返回的完整结果 JSON，再提交请求。 |
   | 生图报错 | 查看 Agent 返回的错误或“运行状态”中的失败信息。检查目标 ComfyUI 实例是否可访问，以及所选模型和 LoRA 是否匹配。再检查 Workflow 所需节点和本机浏览器路径。 |
   | 图片读取失败 | 检查当前启用的图片读取配置、模型图片输入能力、接口地址与凭据；读取本地图片时检查绝对路径是否存在且可访问。 |
   | 历史 Run ID 查询不到结果 | 回到生成任务所属的工作区，使用查看窗口中复制的完整 Run ID 重试。 |

2. 需要帮助或报告问题时，在 [GitHub Issues](<https://github.com/fzfz/harness-comfyui/issues>) 中提供以下内容。

   1. 插件与官方 Desktop 版本。
   2. 操作步骤、预期结果与实际错误信息。
   3. 生成任务的 Run ID，以及包含失败信息的日志片段。

## 开发与贡献

1. 准备修改源码时，先阅读[系统架构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md>)与[目录结构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/directory-structure.md>)。独立 worktree 的准备和 Desktop 验证步骤见[开发环境说明](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/agents/worktree-development.md>)。

2. 构建与验收命令见[测试说明](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/testing.md>)。
3. 提交问题前，搜索已有 [Issues](<https://github.com/fzfz/harness-comfyui/issues>)；问题管理要求见[Issue 管理说明](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/agents/issue-tracker.md>)。

## 文档入口

1. **配置与运行**：[配置说明](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/configuration.md>)、[系统启动说明](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/startup.md>)。
2. **代码与依赖**：[技术栈](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/technology-stack.md>)、[系统架构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/architecture.md>)、[目录结构](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/system/directory-structure.md>)。
3. **版本记录**：[发布说明](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/releasenotes.md>)、[GitHub Releases](<https://github.com/fzfz/harness-comfyui/releases>)。
