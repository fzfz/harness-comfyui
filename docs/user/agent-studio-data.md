---
文档用途: 说明 Agent Studio 四池数据的导入与预设绑定步骤。
读取时机: 在官方 Desktop 中配置 ComfyUI 的 Studio 预设时。
---
# Agent Studio 数据配置

## 安装与导入

1. 用户安装 Harness ComfyUI `0.54.4` 和 Agent Studio `0.1.8`，重启官方 Desktop。
2. 用户从 Harness ComfyUI `0.54.4` 的 Release 下载 `four-pools.json`，在“Agent 中心”导入该文件，选择全部条目并保存改动。
3. 四池分别保存 Agent、提示词集、工具集和 Skill 集。每个 Agent 已选择对应集合，用户可在原版界面编辑这些内容。

## 创建空壳预设

1. 维护者按[预设映射](../verification/agent-studio-data/mapping.json)，在 Agent 中心选择来源预设，再点击“新建预设”，填写目标 ID 与名称。
2. 维护者完全退出 Desktop，备份当前 Profile。备份范围见[更新前备份](install-update.md#更新前备份)。
3. 维护者按以下步骤转换 Profile。

   1. 调用 [loadOfficialProfilePatchAdapter()](../../tests/desktop/fixtures/official-profile-patch.mjs)，传入仓库的 `config/desktop-e2e.json`。
   2. 以当前 Profile 的 `cordis.patch.yml` 全文调用返回对象的 `parse()`。
   3. 定位 `agent-studio.config.createdPresets`，按 ID 找到本次创建的条目。
   4. 按[数据转换计划第 5.3 节](../plans/agent-studio-data-conversion-20261114.md#53-实施步骤)转换这些条目，保留其余配置。
   5. 调用 `serialize()`，将返回文本写回同一文件。

4. [预设定义](../verification/agent-studio-data/preset-definitions.json)保存已验收的开发 Profile 数据。应用到其他 Profile 时，维护者将模块与 Skill 目录改为目标 Profile 内插件包的实际路径。维护者同时采用目标环境的 MCP 地址和凭据引用。

## 绑定与使用

1. 用户重启 Desktop，在 Agent 中心为每个空壳预设选择映射中的 Agent，并保存改动。
2. 用户关闭翻译 Agent 的运行时上下文，保留其他 Agent 的运行时上下文。
3. 用户新建会话，选择名称带“· Studio”的预设，发送请求并核对回复。
4. 用户重启 Desktop 后，确认预设、集合与绑定仍然可见。验收范围见[验收记录](../verification/agent-studio-data/acceptance.json)。
