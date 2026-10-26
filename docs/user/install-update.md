---
文档用途: 说明官方 Desktop 插件的安装、更新与恢复步骤。
读取时机: 安装、更新或恢复插件前。
---
# 官方 DeepSeek Harness Desktop 插件安装、更新与恢复

## 适用版本与版本核对

1. 插件 `0.48.0` 要求使用官方 DeepSeek Harness Desktop `0.2.1-rc.3`。用户下载插件前，先核对目标 Release 说明列出的宿主版本与当前应用版本一致，再选择其中的预构建 `.tgz` 附件。

2. 用户在 Plugins 页面打开“查看安装详情”。详情页面明确显示版本时，用户将该版本与所选 `.tgz` 包文件名中的版本核对；页面未显示版本时，用户联系插件维护者核对实际安装版本，并记录核对结果。

## 安装与启用

1. 从项目正式 Release 下载目标版本的预构建 `harness-comfyui-<版本>.tgz`，或复制该包的下载地址。
2. 打开 DeepSeek Harness Desktop，进入侧边栏“插件”，选择“添加插件”。在安装输入框中填写 Release 包下载地址，或填写本机 `.tgz` 文件的绝对路径，然后点击“安装”。
3. 等待安装任务结束。在“已安装”列表确认插件显示名称为“ComfyUI 工作台”（英文界面为“ComfyUI Workbench”），然后选择“立即启用”或该插件对应的启用控件。
4. 完全退出 Desktop 后重新打开应用。macOS 上使用应用菜单中的“退出”或按 `⌘Q`。重开后再次检查插件处于启用状态，并打开“查看安装详情”核对安装包信息。

## 安装项目 Skills

1. 从项目源码的 `.agents/skills/` 目录取得需要使用的 Skill 目录。项目 Skill 列表见[目录结构](../system/directory-structure.md#preset-与-skill-资源)。每个目录必须保留 `SKILL.md` 及随附文件。
2. 将每个 Skill 目录放入工作区的 `.agents/skills/` 或用户目录 `~/.agents/skills/`。需要随源码更新 Skill 时，在所选安装目录下创建与 Skill 同名、指向源码中对应 Skill 目录的软链接。
3. 使用自定义 `DSH_AGENTS_HOME` 时，将用户级 Skill 放入该目录的 `skills/` 子目录。
4. 完成“选择项目预设”后，在该预设的会话中查看 Skill 列表，确认所需名称可见。

## 连接目录服务

1. 维护者按[NoobAI MCP 服务配置](../system/configuration.md#noobai-mcp-服务)准备项目预设的 MCP 地址与应用进程凭据，并确认 MCP 与 Host 数据源服务连接同一目录。配置完成后，维护者完全退出并重新打开官方应用。

## 选择项目预设

1. 新建会话时，在 Agent Preset 列表中选择“ComfyUI工作台预设”。
2. 列表缺少“ComfyUI工作台预设”时，联系插件维护者核对该发行包。

## 配置模型与插件设置

1. 在官方 Desktop 自身设置中完成 Provider、模型和宿主凭据配置。Harness-ComfyUI 的插件设置由插件配置页提供，包含“图片读取”“数据源服务”和“Workflow 浏览器”三个页签。

2. 在“数据源服务”页填写服务 URL 和端口。URL 填协议、主机名及可选根路径，端口单独填写 `1` 至 `65535` 的整数。选择“保存数据源服务设置”；保存成功后，下一次数据源请求使用新地址。
3. 在“图片读取”页选择“系统 Provider”或“OpenAI 兼容接口”。系统 Provider 使用官方 Desktop 当前可用且支持图片输入的模型；OpenAI 兼容接口需要填写完整 Chat Completions 地址和模型信息，接口要求认证时填写 API Key。保存配置，并在活动配置选择器中选中要用于后续图片读取的配置。
4. 在“Workflow 浏览器”页填写本机 Chrome 或 Chromium 可执行文件的绝对路径，然后选择“保存浏览器设置”。后续 Workflow 编译使用保存的路径。

5. 设置页显示只读时，按页面提示检查官方 Profile 的写入权限；保存失败时，按页面提示修正输入值后重新保存。

## 更新前备份

1. 卸载旧版本前，先等待活动生成任务结束并完全退出 Desktop。备份须保存到插件数据目录以外的位置，包含以下对象。

   1. 完整 Profile 配置文件；备份清单注明本插件的配置项。
   2. 凭据文件及本插件配置引用的凭据记录。副本保留原文件权限，并存放在私有目录。
   3. 插件完整数据目录，包含 Run 数据库、Run 文件、媒体、日志和 API Workflow 缓存。

2. DSH home 是官方宿主的数据根目录，默认路径为 `~/.dsh/`。默认 Profile 配置文件为其下的 `profiles/desktop/cordis.patch.yml`，凭据文件为 `.credentials.yaml`。自定义启动目录时，维护者按当前应用的启动配置确认实际路径。

3. 插件数据目录使用官方 Profile 中 `harness-comfyui-core.config.dataDirectory` 保存的绝对路径；省略该项时，插件数据保存在 DSH home 的 `data/plugins/harness-comfyui/` 下。

4. 本插件的 Profile 配置项为 `harness-comfyui-core`、`harness-comfyui-image-reader`、`harness-comfyui-cli`、`harness-comfyui` 和 `harness-comfyui-presets`。API Key 等凭据由官方凭据服务保存；图片读取凭据使用 `harness-comfyui-image-reader.config.credentialRefs` 中各配置 ID 对应的引用名称。

5. 备份清单必须记录当前实际 Profile、凭据文件与数据目录的绝对路径，以及模型配置引用的凭据名称。

## 更新已安装版本

1. 更新插件时，用户先完成“更新前备份”，再重新打开 Desktop，依次执行以下步骤。

   1. 在“已安装”列表打开“ComfyUI 工作台”，选择卸载旧版本，并等待卸载任务结束。
   2. 选择“添加插件”，填写目标 Release 的 `.tgz` 下载地址或本机文件绝对路径，然后点击“安装”。
   3. 安装完成后启用插件，完全退出 Desktop，再重新打开应用。
   4. 按“适用版本与版本核对”核对安装包信息和版本。
   5. 确认“ComfyUI工作台预设”可选，设置能读取备份前的配置。
   6. 确认历史 Run 可见、媒体可打开。
   7. 通过所选预设生成一张图片，并确认结果可查看。

2. 插件仍在使用且无法卸载时，按 DeepSeek Harness 随附的 Manage dsh Command 指引使用 `dsh plugin`。首次使用前，打开 Desktop 完成 Profile 初始化，再完全退出应用。先运行 `dsh plugin --profile desktop list`，根据列表中的包名运行 `dsh plugin --profile desktop remove <包名>`，再运行 `dsh plugin --profile desktop add <插件包>`；操作后重新打开 Desktop。

## 更新失败时恢复

1. 恢复前先核对备份清单的路径、配置项和凭据名称，确认对应文件完整。

2. 版本、配置或历史数据核对失败时，按以下顺序恢复。

   1. 完全退出 Desktop，把失败后的 Profile 配置、凭据和插件数据复制到独立目录。
   2. 失败版本仍在安装列表时，打开 Desktop，在 Plugins 页面卸载该版本，再完全退出应用。
   3. 使用更新前备份恢复本插件的 Profile 配置项和同名凭据记录，并保留其他条目。把完整插件数据恢复到原路径，并保留凭据文件权限。
   4. 按先前插件的版本说明准备其要求的官方宿主，再回装该版本插件包。按“更新已安装版本”中的启用、退出和重开步骤完成加载。
   5. 核对回装版本、历史 Run、媒体和设置。
   6. 通过所选预设生成一张图片，并确认结果可查看。
   7. 记录备份位置、恢复对象和核对结果。

## 首次生产切换与旧环境退役

1. 维护者按[生产目录退役与首次切换](../plans/official-desktop-plugin-20260929.md#生产目录退役与首次切换)准备切换与退役操作。
