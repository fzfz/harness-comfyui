---
文档用途: 介绍插件功能、安装入口和使用方法。
读取时机: 初次了解或准备使用插件时。
---
# Harness ComfyUI

1. Harness ComfyUI 通过预构建插件包安装到官方 DeepSeek Harness Desktop。宿主提供窗口、会话、模型设置和插件管理。插件提供 ComfyUI 工作台、按任务分工的 Agent 预设和“翻译预设”。

2. Harness ComfyUI 的 Agent（对话中的 AI 助手）调用 Skills（技能），帮助用户查找绘图素材、设计提示词并调用 ComfyUI 生成图片。

## 主要功能

1. **插入前查看资源详情。** “插入上下文”弹窗按两列展示资源，提供分类详情和图片预览。用户可选定素材后加入对话。

2. **说出想画什么，助手自动找合适的素材。** 助手按需求查询作品、角色、画师和 LoRA。画师串用于组合多位画师的风格；LoRA 用于补充人物特征或画风。助手根据查询结果搭配画师风格与 LoRA，并设置各自的权重。
3. **选好模板和底模，绘图参数交给助手。** 助手根据当前选择设计提示词和绘图参数，再填入工作流。参数包括图片宽高、步数和 CFG（画面对提示词的遵循强度）。
4. **按生图模型设计提示词。** 支持 ANIMA、WAI-illustrious-SDXL 和 Krea2；助手根据选定模型使用对应技能设计提示词与画面参数。
5. **自动调用工作流，支持多个 ComfyUI 实例。** 助手把组合好的提示词和参数交给工作流，再将生成任务发送到目标实例。你可以在同一个界面里查看进度、浏览结果和下载原图。
6. **独立选择图片读取模型，分析生成结果。** 用户可选择宿主视觉模型，也可填写自定义 OpenAI 兼容接口。每份命名配置分别保存模型和默认读图提示词。助手既能描述本地图片，也能对照生图要求指出画面偏差、提出修改建议。
7. **查询并复用生成参数。** 每次生成都会保存描述和绘图设置，供用户查询、复用和调整。
8. **从文件批量生成与单张重做。** 助手可直接使用提示词文件，一次提交最多 20 项任务。重复提交原请求时沿用原生成记录，修改指定项后可单独重做。
9. **持续推进明确目标。** 用户要求持续完成目标时，工作台使用宿主 Goal 管理进度。用户可在会话中查看、暂停和恢复目标。

## 使用实验工作台

### 创建工作与保存输入

1. 点击侧边栏的“实验工作台”，打开工作台界面。再次点击该按钮，返回原生会话。
2. 选择工作区，通过“新建工作”填写名称和目标。工作台创建提示词为空的主分支。
3. 在右栏的“准备运行”中点击“编辑参数”。
4. 填写原始需求，选择生成所需资源。资源包括 ComfyUI 实例、生成模型、Workflow 模板和 LoRA。模板参数随所选模板加载。
5. 手动填写提示词，或点击“生成提示词”。在对比弹窗中提出改写要求、查看各轮结果，并编辑或采纳提示词。
6. 点击“保存参数”。后续任务使用已保存的输入；“取消”恢复此前保存的内容。
7. 查看历史运行、来源记录或图片时，工作台保留未保存的编辑。

### 引用历史记录、经验与收藏

1. 编辑参数时，通过“参考来源”引用任务、运行、经验或收藏。选择弹窗支持按工作区筛选，来源可位于当前 Profile 的其他工作区。
2. 点击“添加引用”，将所选记录加入参考来源。任务可引用历史提示词等产物，也可引用任务中的具体运行。
3. 需要继承运行参数时，点击“使用此运行输入”。工作台将参数填入当前分支编辑区，并添加来源引用。用户可填写本次改进要求，再保存参数。
4. 顶部“经验”和“收藏”页签显示整个工作台的记录。用户可一次选择多条经验或收藏，添加到当前分支。
5. 经验卡显示适用条件和经验结论。已记录的来源与证据可展开查看。运行和经验均可收藏；移除任务中的引用后，收藏记录仍保留。

### 设置 Workflow 输入图片与 Agent 参考图片

1. 在右栏的图片区域选择图片用途。

   | 图片区域 | 使用方法 |
   | --- | --- |
   | Workflow 输入图片 | 为每张图片选择模板图片参数。单图参数各接收一张图片；多图参数按绑定顺序接收图片。 |
   | Agent 参考图片 | 填写 Agent 参考要求，说明需要观察、保留或改变的内容。Agent 通过读图工具读取图片。 |

2. 点击对应区域的“从运行记录选择”或“选择本机图片”。两个入口均支持多选，运行记录可来自其他工作区。
3. 需要共用图片时，点击卡片上的“也用作”按钮。图片会同时出现在两个区域，各自保存用途和设置。
4. 从一个区域移除共用图片时，另一区域继续保留图片。更换模板或实例后，用户可为已有图片重新选择参数。
5. 完成图片选择与设置后，点击“保存参数”。运行时，工作台将 Workflow 用途的图片上传至所选实例。

### 配置 Agent 与翻译提示词

1. 在“配置中心”为各项功能设置 Agent 执行配置。配置包括预设、提供商、模型、推理等级和执行要求。任务型功能还可指定 Skill。提示词功能支持按块编辑请求模板、插入变量和预览实际请求。
2. 点击正向或负向提示词旁的“翻译”，查看原文与中文译文。弹窗支持切换提示词页签、失败重试和复制译文。
3. 编辑中的提示词、已保存的提示词和历史运行提示词均可翻译。翻译结果保留在弹窗中，原提示词保持原值。
4. 首次使用前，按[配置提示词翻译](docs/user/install-update.md#配置提示词翻译)设置模型。复制译文用于生图前，按[翻译输出限制](docs/releasenotes.md#翻译输出限制)核对标记。

### 运行任务与查看输入

1. 保存参数后，点击“运行任务”执行一次。需要连续迭代时，选择“持续实验”，设置最多运行次数，再点击“开始实验”。
2. 任务和运行结果归入创建任务时的分支。切换工作区或浏览其他记录后，执行中的任务继续更新原分支。
3. 点击生成图片查看原图，或比较多次运行。成功和失败的运行均保留记录，可从指定运行继续创建分支。
4. 选中运行后，在右栏切换到“查看运行”。展开“提交输入”查看提交参数、图片来源和参数绑定。展开“实际输入”查看图片准备后的参数与上传结果；准备未完成时，页面显示对应状态。
5. 点击“用于下次运行”，将历史运行参数复制到当前分支编辑区。
6. 在“记录评价与经验”中填写结论，或让 Agent 分析后回填。用户确认内容后保存。
7. 运行结果中的“Agent 评价”和“下一轮计划”默认折叠。展开后可滚动阅读长正文，也可滚动中央区域查看底部运行列表。

## 适用版本

1. 插件 `0.53.1` 必须搭配官方 macOS DeepSeek Harness Desktop `0.2.1-rc.3` 使用。版本功能见[发布说明](<https://github.com/fzfz/harness-comfyui/blob/main/docs/releasenotes.md#harness-comfyui-v0531>)。

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

1. 在官方 Desktop 中选择项目目录作为工作区（Workspace）。在“新建会话”菜单的预设选项中选择“ComfyUI工作台预设”。

2. 点击侧边栏“ComfyUI 工作台”，然后点击对话输入区附近的“插入上下文”。在资源列表中搜索并选择条目，最后点击“插入”，将选择加入当前消息。

   | 选择项 | 第一次生图时如何选择 |
   | --- | --- |
   | Workflow | 必须指定一个。选择已经在目标 ComfyUI 实例上准备好模型和节点的 Workflow。 |
   | 生成模型 | 可以使用 Workflow 的默认生成模型；Workflow 未指定默认模型时，必须另选一个。 |
   | LoRA | 可选。选择后可调整权重。 |
   | 角色、画风 | 可选。选择后可在编写提示词时引用；不选择时直接描述画面。 |

### 3. 准备提示词

1. 下面以 WAI-illustrious-SDXL 为例。先选择适用于该底模的 Workflow 和生成模型，再发送：

   > 使用 wai-sdxl-prompt-builder，为以下画面生成提示词，并返回完整结果 JSON。画面：雨后街道上的旅人撑伞站在路灯下。湿润路面反射暖色灯光，采用竖幅构图。

2. 已有提示词时，用户可直接提供文本或文件路径。长提示词可保存在 UTF-8 文件中；批量生成时，列出各文件与图片要求。

3. ANIMA 和 Krea2 分别使用 `anima-prompt-builder` 与 `krea2-anime-prompt-builder`。请求中的提示词类型应与选定生成模型对应。

### 4. 提交生图并查看结果

1. 提供上一条回复中的提示词产物，或已有提示词文件的路径。通过“插入上下文”加入选定的 Workflow，以及要显式指定的生成模型和 LoRA：

   > 使用当前选择的 Workflow 和上一条回复中的提示词创建一张图片，图片尺寸使用 Workflow 默认值。

2. Agent 核对所选资源和参数后提交任务，并返回生成任务编号（Run ID）。右侧“运行状态”显示任务进展；结果列关闭时，点击“打开结果列”。Agent 回复结束后，“运行状态”继续更新任务进度。生成成功后，结果列显示保存的图片。

## 查看与使用生成结果

1. 点击结果列中的图片，在应用内打开查看窗口。查看窗口也支持播放已有生成记录中的视频。

2. 使用方向按钮或键盘左右键切换当前会话的媒体。
3. 在顶部查看像素尺寸，在媒体下方查看该次运行保存的正向提示词。
4. 点击 Run ID 旁的复制按钮，取得当前媒体所属生成任务的完整编号。
5. 点击“下载原文件”保存当前图片或视频；保存位置由 Desktop 的下载设置决定。
6. 在结果列点击“下载所属运行的 Workflow”，取得该媒体所属运行的工作流文件。

7. 需要查询历史参数时，在工作台会话中发送以下请求。将占位文字替换为复制的完整 Run ID：

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

3. 需要重新出图时，提供原 Run ID、改进提示词和需要调整的参数，并指定重做哪些图片。Agent 为指定项创建生成记录。

## 日常使用与更新

1. 用户通过官方 Desktop 打开和退出应用，并在“插件”页面管理 Harness ComfyUI。

2. 更新插件或恢复更新失败的环境时，按[安装与更新指南](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/user/install-update.md>)操作。

## 常见问题与反馈

1. 按下表处理使用问题：

   | 遇到的问题 | 检查与处理方法 |
   | --- | --- |
   | Desktop 无法启动 | 查看官方 Desktop 的应用日志，按错误检查应用版本、插件安装结果和当前 Profile 的写入权限。插件安装操作见[安装指南](</Volumes/4Tdisk/work/AI2/harness-comfyui/docs/user/install-update.md>)。 |
   | 工作台无法读取资源 | 打开插件详情页的“ComfyUI → 数据源服务”，检查 URL、端口和服务运行状态。URL 与端口需要分别填写。 |
   | Agent 提示缺少生成输入 | 为当前消息插入一个 Workflow，并提供提示词文本、提示词产物或文件路径。 |
   | 生图报错 | 查看 Agent 返回的错误或“运行状态”中的失败信息。检查目标 ComfyUI 实例是否可访问，以及所选模型和 LoRA 是否匹配。再检查 Workflow 所需节点和本机浏览器路径。 |
   | 图片读取失败 | 检查当前启用的图片读取配置、模型图片输入能力、接口地址与凭据；读取本地图片时检查绝对路径是否存在且可访问。 |
   | 历史 Run ID 查询不到结果 | 使用查看窗口中复制的完整 Run ID 重试，并核对当前 Profile 是否保存该记录。 |

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
