# 官方 DeepSeek Harness Desktop 安装与更新

本文说明如何在 macOS 官方 DeepSeek Harness Desktop 中安装 Harness-ComfyUI 已发布的预构建插件包、启用插件、选择项目预设、配置插件设置，以及在更新失败时恢复备份。

## 适用版本与版本核对

本文面向官方 DeepSeek Harness Desktop `0.2.0-rc.2`。用户下载插件前，先核对目标 Release 说明列出的宿主版本与当前应用版本一致，再选择其中的预构建 `.tgz` 附件。

用户在 Plugins 页面打开“查看安装详情”。详情页面明确显示版本时，用户将该版本与所选 `.tgz` 包文件名中的版本核对；页面未明确显示版本时，用户将版本核对标记为待确认，安装成功提示只表示安装流程结束。

## 安装与启用

1. 从项目正式 Release 下载目标版本的预构建 `harness-comfyui-<版本>.tgz`，或复制该包的下载地址。
2. 打开 DeepSeek Harness Desktop，进入侧边栏“插件”，选择“添加插件”。在安装输入框中填写 Release 包下载地址，或填写本机 `.tgz` 文件的绝对路径，然后点击“安装”。
3. 等待安装任务结束。在“已安装”列表确认插件名为 `harness-comfyui`，然后选择“立即启用”或该插件对应的启用控件。
4. 完全退出 Desktop 后重新打开应用。macOS 上使用应用菜单中的“退出”或按 `⌘Q`；关闭窗口不等于退出应用。重开后再次检查插件处于启用状态，并打开“查看安装详情”核对安装包信息。

## 选择项目预设

新建会话时，在 Agent Preset 列表中选择要使用的项目预设：

- `ComfyUI工作台预设` 用于 ComfyUI 资源目录查询、Workflow 上下文使用和单次生图任务。
- `ComfyUI迭代预设` 用于需要构图、生成、独立观察和比较的多轮画面迭代。

开始工作前先确认所选名称出现在预设列表；列表缺少任一名称时，记录缺少的名称并联系插件维护者核对该发行包。

## 配置模型与插件设置

在官方 Desktop 自身设置中完成 Provider、模型和宿主凭据配置。Harness-ComfyUI 的插件设置由插件配置页提供，包含“图片读取”“数据源服务”和“Workflow 浏览器”三个页签。

- 在“数据源服务”页填写服务 URL 和端口。URL 填协议、主机名及可选根路径，端口单独填写 `1` 至 `65535` 的整数。选择“保存数据源服务设置”；保存成功后，下一次数据源请求使用新地址。
- 在“图片读取”页选择“系统 Provider”或“OpenAI 兼容接口”。系统 Provider 使用官方 Desktop 当前可用且支持图片输入的模型；OpenAI 兼容接口需要填写完整 Chat Completions 地址和模型信息，接口要求认证时填写 API Key。保存配置，并在活动配置选择器中选中要用于后续图片读取的配置。
- 在“Workflow 浏览器”页填写本机 Chrome 或 Chromium 可执行文件的绝对路径，然后选择“保存浏览器设置”。后续 Workflow 编译使用保存的路径。

当设置页显示只读或保存失败时，按页面提示检查官方 Profile 的写入权限或输入值，再重新保存。API Key 等凭据由官方凭据服务保存；使用者按“更新前备份”一节创建和记录凭据备份。

## 更新前备份

每次卸载旧版本前，先等待活动生成任务结束，完全退出 Desktop，并把备份保存到独立于插件数据目录的位置。备份对象按以下顺序准备：

1. 完整 Profile 配置文件，并在备份清单中注明属于 Harness-ComfyUI 的配置项。
2. 凭据文件及其中与这些插件配置项对应的凭据记录。备份保留原文件权限，并把副本放在私有目录。
3. 插件完整数据目录，包含 Run 数据库、Run 文件、媒体、日志和 API Workflow 缓存。

DSH home 是官方宿主的数据根目录。本机已核实的默认官方 Profile 目录为 `/Users/fzfz/.dsh/profiles/desktop`；其他 macOS 账号或自定义 DSH home 的路径会不同。插件数据目录使用官方 Profile 中 `harness-comfyui-core.config.dataDirectory` 保存的绝对路径；没有设置该项时，插件 schema 将默认数据布局定义在 DSH home 的 `data/plugins/harness-comfyui/` 下。

本机默认 Profile 配置文件为 `/Users/fzfz/.dsh/profiles/desktop/cordis.patch.yml`，凭据文件为 `/Users/fzfz/.dsh/.credentials.yaml`，默认插件数据目录为 `/Users/fzfz/.dsh/data/plugins/harness-comfyui/`。本插件的配置项为 `harness-comfyui-core`、`harness-comfyui-image-reader`、`harness-comfyui-cli`、`harness-comfyui` 和 `harness-comfyui-presets`；图片读取凭据使用 `harness-comfyui-image-reader.config.credentialRefs` 中各配置 ID 对应的引用名称。备份清单必须记录当前实际 Profile、凭据文件与数据目录的绝对路径，以及模型配置引用的凭据名称。自定义 DSH home 或 `dataDirectory` 时，以当前配置中的路径为准。

## 更新已安装版本

官方 Plugins 页面当前提示插件安装后暂不自动更新，升级时须先卸载再安装新版。完成“更新前备份”后，重新打开 Desktop 并进入“插件”：

1. 在“已安装”列表打开 `harness-comfyui`，选择卸载旧版本，并等待卸载任务结束。
2. 选择“添加插件”，安装目标 Release 的 `.tgz` 下载地址或本机绝对路径。
3. 安装完成后启用插件，完全退出 Desktop，再重新打开应用。
4. 按“适用版本与版本核对”核对安装包信息和版本。再确认两个项目预设可选、插件设置能读取备份前的配置、历史 Run 可见且媒体可打开，并完成一次业务请求。

如果插件管理器提示插件仍在使用且不能卸载，首次使用命令路线时先打开 Desktop 完成 Profile 初始化，再完全退出应用，并按 DeepSeek Harness 随附的 Manage dsh Command 指引使用官方 `dsh plugin` 命令。命令格式为 `dsh plugin --profile desktop add <插件包>`、`dsh plugin --profile desktop list` 和 `dsh plugin --profile desktop remove <包名>`；操作后重新打开 Desktop。

## 更新失败时恢复

更新后的版本、配置或历史数据核对失败时，按以下顺序恢复：

1. 完全退出 Desktop，并先把失败后的 Profile 配置、凭据文件和插件数据目录复制到另一份独立目录，保存失败现场。
2. 如果失败版本仍然已安装，用户打开 Desktop，在 Plugins 页面卸载该版本，然后完全退出应用。插件已经卸载时，用户直接执行第 3 步。
3. 使用更新前的备份，只恢复 Harness-ComfyUI 的 Profile 配置项和同名凭据记录；保留当前配置文件中的其他条目。把完整插件数据目录恢复到原路径，并保留凭据文件权限。
4. 回装先前使用的已发布插件包，按“更新已安装版本”中的启用、退出和重开步骤完成加载。
5. 核对回装版本、历史 Run、媒体打开、插件配置读取和一次业务请求，并记录备份位置、恢复对象及核对结果。

恢复前先逐项核对备份清单中的绝对路径、配置项与凭据名称，确认备份目录中的对应文件完整。

## 首次生产切换与旧环境退役

维护者准备首次生产切换或旧环境退役时，按[升级方案的“生产目录退役与首次切换”](../plans/official-desktop-plugin-20260929.md#生产目录退役与首次切换)提交目标发行版本、安装位置和备份验证结果。该节集中定义切换步骤、生产真实验收、失败处置和旧环境退役条件。

本文涵盖普通用户在个人 Desktop 中安装和更新已发布插件。版本发布、生产切换、历史数据迁移和旧环境退役分别由维护者取得单独授权后执行；旧安装及数据的物理删除另行取得用户授权。
