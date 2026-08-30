# DSH Desktop 现有外部 Harness 插件接入入口调研

## 调研范围

本文只读检查以下第一方源码：

- DSH Desktop 本地源码：`.local/upstreams/dsh-desktop`，提交 `abf8779deb3f6fffca74db9f7f31f89b99f8d32b`。
- DSH Desktop 仓库内随应用分发的 Harness `0.1.2-alpha.1` npm 源码包：`.local/upstreams/dsh-desktop/packages/harness-0.1.2-alpha.1/npm-dsh/`。
- 当前仓库的 Harness ComfyUI 插件 manifest、Host 插件和 Web 客户端代码，用于确认现有 Harness 接口能否承载当前插件。

本文没有安装或启动 DSH Desktop，没有执行外部脚本，也没有读取外部项目的 `AGENTS.md`。下文中的 `npm-dsh/<archive>::<member>:Lx-Ly` 行号通过对归档成员执行只读的 `tar -xOf ... | nl -ba` 获得。

## 结论

“DSH Desktop 缺少公开插件接口，因此外部 Harness 插件必须修改 Desktop 核心源码”这个前提不成立。

Harness 已公开提供以下完整接入链路：

1. `dsh plugin --profile web add <package-or-path>` 把外部包安装到 normal `web` profile。
2. 外部包在 `package.json` 中声明 `dsh.bundle.patch` 后，`dsh plugin` 自动把该包加入 `dsh.profile.bundles`。
3. 外部包在 `package.json` 中声明 `dsh.client` 并导出 `./client` 后，Harness Web Host 自动把该客户端包加入浏览器启动图；DSH Desktop 不需要为每个 Web 插件增加 Electron 接线代码。
4. 外部 Host 插件通过公开的 `ctx.shellEnv.register(...)` 为每次 Agent shell ToolExecution 生成环境变量和短期 capability；DSH Desktop 不参与 capability 的生成。
5. profile patch、`$DSH_HOME/cordis.patch.yml`、重复的 `--patch`、`$DSH_HOME/settings.yaml`、Preset root 和 Skill root 都是现有 Harness 配置入口。

DSH Desktop 自带的 `dsh-desktop-*` 插件使用另一条安装期路径：Desktop 通过固定 `--patch build/dsh-desktop.patch.yml` 插入这些包，因此必须把这些 Desktop 自有包补进 `@deepseek-ai/dsh` 的安装依赖闭包。该约束只适用于“由 Desktop 固定 overlay 插入但没有安装进 profile”的包，不适用于通过 `dsh plugin` 安装在 normal `web` profile `node_modules` 中的外部包。证据见 `.local/upstreams/dsh-desktop/test/desktop-plugin-closure.test.ts:L7-L18`、`.local/upstreams/dsh-desktop/patches/@deepseek-ai+dsh+0.1.2-alpha.1.patch:L1-L15`，以及 `npm-dsh/deepseek-ai-dsh-app-boot-0.1.2-alpha.1.tgz::package/lib/index.js:L292-L309`。

当前 Harness ComfyUI 插件仍需要适配 DSH Desktop 随附的 Harness API：当前仓库 `package.json:L43-L67` 和 `package.json:L78-L102` 面向 Harness `0.1.1-rc.2`，而被调研的 Desktop 随附 `0.1.2-alpha.1`。这属于当前插件仓库的兼容性修改，不是 Desktop 核心接口缺失。

## 入口分类

本文使用以下三种分类：

- **已有入口**：Harness 或 DSH Desktop 已提供对外命令、manifest、配置文件或公共服务接口。
- **已有配置可用**：DSH Desktop 没有单独的产品设置项，但是外部插件可以通过现有 Harness profile、patch、settings 或服务接口实现目标。
- **确实缺失**：DSH Desktop 没有对应启动参数或通用 Electron 接口；只有需求明确要求该 Desktop 级行为时才需要修改 Desktop。

| 需求 | 结论 | 分类 | 是否阻止 normal `web` profile 插件接入 |
|---|---|---|---|
| 外部插件依赖与 bundle | `dsh plugin` 支持 registry、git、tarball、绝对路径和相对路径包；bundle 自动加入 profile | 已有入口 | 否 |
| 外部 Web 客户端 | `dsh.client` manifest 自动形成 Host 启动图和浏览器 bundle | 已有入口 | 否 |
| profile/user/home patch | normal profile patch 和 home patch自动加载 | 已有入口 | 否 |
| Desktop 额外 `--patch` 参数 | Desktop 只传一个固定产品 overlay，没有对外追加参数 | 确实缺失 | 否；外部插件应使用 profile bundle 或 profile patch |
| 任意 profile 的 Desktop 启动选择 | Harness 支持任意 profile；Desktop 产品只选择 `web` 或 `desktop-safe-mode` | 确实缺失 | 否；当前产品插件目标就是 normal `web` profile |
| 继承环境与 `$DSH_HOME/.env` | Desktop 传入登录 shell 环境；Harness再加载启动目录和 DSH home 的 `.env` | 已有入口 | 否 |
| 指定仓库 `.env` | Desktop 把 Harness cwd 固定为 `userData/launch-root`，没有 `--env-file` 或 repo cwd 参数 | 确实缺失 | 否；可使用继承环境或 `$DSH_HOME/.env` |
| 覆盖 Desktop `DSH_HOME` / Electron `userData` | Desktop 在源码中固定开发、生产目录并覆盖 `DSH_HOME` | 确实缺失 | 否；插件使用 Desktop 已选定的 DSH home |
| 启动 workspace | Harness 把启动 cwd 当默认 workspace；Desktop 把 cwd 固定为 `launch-root` | Desktop 覆盖参数确实缺失；插件服务可用 | 否；外部插件可调用 Workspace 公共服务并在自己的客户端选择 workspace |
| 默认 LLM 与 Settings 默认值 | composition config 是 base，`settings.yaml` 用户值覆盖 base | 已有入口 | 否 |
| 自定义 Preset | 支持配置 roots 和 `$DSH_HOME/.agent-presets` | 已有入口 | 否 |
| 自定义 Skill | 支持项目、custom、DSH home 和 Agents home roots | 已有入口 | 否 |
| Agent shell capability | `ctx.shellEnv.register` 每个 ToolExecution 调用 contributor | 已有入口 | 否 |
| 同源 `_blank` 自动转应用内 modal | Electron 当前允许同源 URL 创建新 BrowserWindow；没有通用 modal 转换器 | 确实缺失 | 否；当前插件应在自己的 React 客户端使用 Modal |

## 1. Desktop 根目录、normal profile 与 Safe Mode profile

### 1.1 DSH Desktop 仓库根目录不是 Harness profile

DSH Desktop 根目录的 `package.json` 是 npm 管理的 Electron 应用和随包依赖清单：

- `postinstall` 依次执行 `patch-package`、品牌资源安装脚本和 Electron 安装器；开发命令是 `electron-vite dev`：`.local/upstreams/dsh-desktop/package.json:L25-L42`。
- 根 manifest 直接携带 Harness 依赖闭包和四个 `dsh-desktop-*` 产品插件：`.local/upstreams/dsh-desktop/package.json:L44-L271`。
- 打包时把固定的 `build/dsh-desktop.patch.yml` 复制为应用 resource：`.local/upstreams/dsh-desktop/package.json:L312-L335`。
- 根目录存在 `package-lock.json`，不存在根级 `pnpm-workspace.yaml` 和根级 `cordis.patch.yml`。因此不能把 Desktop 根 manifest 与 `$DSH_HOME/profiles/<name>/package.json` 混为一谈。

`build/dsh-desktop.patch.yml` 是版本库维护的固定产品 overlay，不是运行时生成文件。该 overlay 插入 Desktop UI、market installer、HMR fallback 和 preset transfer：`.local/upstreams/dsh-desktop/build/dsh-desktop.patch.yml:L1-L49`。`npm ci` 的 `postinstall` 会重新应用 `patches/` 中的 `patch-package` 文件：`.local/upstreams/dsh-desktop/docs/development.md:L13-L24`。维护补丁时由 Desktop 开发者重新生成并提交补丁：`.local/upstreams/dsh-desktop/docs/development.md:L64-L75`。

### 1.2 normal `web` profile 的生成规则

normal profile 位于 `$DSH_HOME/profiles/web/`。Harness 的 `web` 模板固定为：

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"],
      "patchReload": "live"
    }
  }
}
```

模板定义见 `npm-dsh/deepseek-ai-dsh-app-boot-0.1.2-alpha.1.tgz::package/lib/index.js:L328-L360`。初始化器同时创建：

- `package.json`：空 `dependencies`、模板 bundles 和 `patchReload`。
- `cordis.patch.yml`：内容为顶层空数组 `[]`。
- `pnpm-workspace.yaml`：`packages: [.]`、`nodeLinker: hoisted`、`autoInstallPeers: false`。

初始化器只创建缺失文件，绝不覆盖已存在文件：同一归档成员 `L361-L399`。Desktop 启动时发现 normal profile `package.json` 缺失，会直接调用同一个 `PROFILE_TEMPLATES.web` 和 `initProfile`，没有另造 Desktop profile schema：`.local/upstreams/dsh-desktop/src/main/state/generation-launch.ts:L44-L55`。

Harness 每次启动 profile 时还会重写 `$DSH_HOME/profiles/<name>/cordis.yml` 为一个空 Loader root。该文件只为 Loader 提供 profile 目录的 `baseUrl`；真正的配置来自 bundle 和 patch 层。Harness 重写该文件是为了防止 Loader write-back 把组合结果固化后重复插入：`npm-dsh/deepseek-ai-dsh-0.1.2-alpha.1.tgz::package/lib/profile-boot-BTzzdrGY.js:L122-L164`。`cordis.yml` 与用户维护的 `cordis.patch.yml` 是两个不同文件。

### 1.3 normal profile 的修复边界

Desktop 不会在每次启动时重置 normal profile 的 `package.json`、`cordis.patch.yml` 或 `pnpm-workspace.yaml`：

- Desktop 只在 `package.json` 缺失时调用 `initProfile`：`.local/upstreams/dsh-desktop/src/main/state/generation-launch.ts:L44-L54`。
- Desktop 的 package 修复通过 `dsh plugin --profile web install --no-frozen-lockfile` 重新物化 manifest 已声明的依赖：`.local/upstreams/dsh-desktop/src/main/runtime/profile-plugin-command.ts:L74-L91`、`.local/upstreams/dsh-desktop/src/main/index.ts:L919-L957`。
- Desktop 根据 `node_modules/.modules.yaml` 修复 profile `.npmrc` 中的 `store-dir`，不选择新 store，也不改 profile manifest：`.local/upstreams/dsh-desktop/src/main/state/profile-store.ts:L21-L59`、`L79-L112`。
- consistency 检查只报告 bundle、dependency 和 profile patch 的矛盾，不重写这些声明：`.local/upstreams/dsh-desktop/src/main/state/profile-consistency.ts:L113-L157`、`.local/upstreams/dsh-desktop/src/main/index.ts:L960-L975`。

因此，通过公开 profile 命令加入的外部插件不会被 normal profile 初始化器清除。

### 1.4 Safe Mode profile 的生成规则

Safe Mode profile 位于 `$DSH_HOME/profiles/desktop-safe-mode/`。Desktop 每次启动 Safe Mode 都把以下三个受管文件恢复为源码定义的精确内容：

- `package.json`：空 `dependencies`，bundles 只有 `@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app`。
- `cordis.patch.yml`：受管注释加 `[]`，不读取 normal `web` profile patch。
- `pnpm-workspace.yaml`：与 normal profile 相同的 hoisted、no-auto-peers 配置。

证据见 `.local/upstreams/dsh-desktop/src/main/state/safe-mode-profile.ts:L4-L20`、`L22-L51`。Safe Mode 使用固定 profile 名启动，并明确不加载 normal profile 的第三方 bundles：`.local/upstreams/dsh-desktop/src/main/index.ts:L1112-L1123`。

需要区分一个实际边界：Harness 对所有 profile 都继续加载 `$DSH_HOME/cordis.patch.yml`，然后再加载 Desktop 传入的固定 `--patch`。组合顺序由 `npm-dsh/deepseek-ai-dsh-0.1.2-alpha.1.tgz::package/lib/profile-boot-BTzzdrGY.js:L166-L210` 和 `L254-L260` 直接规定。因此外部插件应安装成 normal `web` profile bundle；如果把第三方插件插入 `$DSH_HOME/cordis.patch.yml`，该 home patch 也会作用于 Safe Mode，不能再声称 Safe Mode 完全排除了该插件。

## 2. 外部插件、profile、patch、环境、workspace 和 Settings

### 2.1 外部插件依赖是 Harness 公开入口

Harness 命令文档把 `dsh plugin --profile <name> <pnpm args>` 定义为 profile 插件管理命令：`npm-dsh/deepseek-ai-dsh-0.1.2-alpha.1.tgz::package/README.md:L5-L19`。命令解析器把 `add`、`remove`、`install` 等剩余参数原样转给 profile 目录中的 pnpm：同一归档 `package/lib/bin.js:L74-L105`。

插件命令完成后，Harness 检查 profile 的每一个 dependency：

- dependency 的 manifest 声明 `dsh.bundle.patch` 时，包名自动追加到 `dsh.profile.bundles`。
- dependency 被删除或不再声明 bundle 时，包名自动从 bundles 删除。
- 相对 `.`、`../plugin`、`file:`、`link:` 路径以命令调用目录为基准，而不是 profile 目录。

证据见 `npm-dsh/deepseek-ai-dsh-0.1.2-alpha.1.tgz::package/lib/plugin-F7ZVfRyo.js:L7-L16`、`L25-L77`、`L79-L127`。当前仓库已经声明 `dsh.bundle.patch: ./cordis.patch.yml`：`package.json:L130-L133`，所以完成 Harness `0.1.2` API 适配并构建客户端后，可以走这条标准路径加入 normal `web` profile。

### 2.2 外部 Web 客户端不需要 Desktop 接线

Harness 的 client module 系统扫描已启用的 Loader package；package 声明 `dsh.client.platform: web`、导出 `./client` 并提供构建后的 client bundle 后，Host 自动生成 `/plugins` bundle 和浏览器启动图：`npm-dsh/deepseek-ai-dsh-client-modules-0.1.2-alpha.1.tgz::package/README.md:L10-L12`、`L25-L44`。当前仓库已有 `dsh.client` 和 `./client` export：`package.json:L134-L158`。

因此 Harness ComfyUI 的 React 抽屉、Settings 页面、Modal 和 Host routes 都应继续由当前插件包提供。Desktop 只有在插件需要原生 Electron main/preload 权限时才需要专用接入；普通 Host API 与 Web UI 不需要。

### 2.3 profile 与 patch overlay

Harness 已有以下顺序固定的配置层：bundle patches → profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → 每个 `--patch` overlay。bundle 先从 DSH 安装闭包解析，再从 profile `node_modules` 解析：`npm-dsh/deepseek-ai-dsh-0.1.2-alpha.1.tgz::package/README.md:L33-L45`。

`--patch` 是可重复的公开参数：同一归档 `package/lib/bin.js:L47-L64`、`L74-L95`。overlay 的 `insert.name` 使用 `./` 或 `../` 时，以 overlay 文件所在目录为基准解析为 file URL：`npm-dsh/deepseek-ai-dsh-app-boot-0.1.2-alpha.1.tgz::package/lib/index.js:L1118-L1170`。

DSH Desktop 自身只构造一个固定 `--patch <dsh-desktop.patch.yml>`，并固定 `--no-open --host 127.0.0.1 --port <reserved>`：`.local/upstreams/dsh-desktop/src/main/runtime/harness-runtime.ts:L182-L198`。Desktop 没有对用户暴露“追加另一个 `--patch`”参数。但是外部插件已经可以通过 normal profile bundle 或 normal profile patch 接入，不需要追加 Desktop overlay。

Harness 支持 `dsh --profile <name>` 和通过 `dsh plugin` 初始化自定义 profile；自定义 profile默认只有 `@deepseek-ai/dsh-base`：`npm-dsh/deepseek-ai-dsh-app-boot-0.1.2-alpha.1.tgz::package/lib/index.js:L357-L399`。Desktop 的 `HarnessRuntime.start(launchDirectory, profile)` 内部也能接收 profile 名：`.local/upstreams/dsh-desktop/src/main/runtime/harness-runtime.ts:L316-L374`。但是 Desktop 产品启动路径只调用 normal `web` 和固定 `desktop-safe-mode`，没有读取任意 profile 名的 argv 或环境配置：`.local/upstreams/dsh-desktop/src/main/index.ts:L1030-L1092`、`L1112-L1123`。所以“任意外部 profile 的 Desktop 启动选择”确实未公开；normal `web` profile 插件不依赖该能力。

### 2.4 环境变量、`DSH_HOME` 和 Electron `userData`

Desktop 启动 Harness 前读取用户的交互式登录 shell 环境；失败时使用 Electron 进程环境：`.local/upstreams/dsh-desktop/src/main/runtime/harness-runtime.ts:L32-L113`。spawn 时保留该环境，但强制写入 Desktop 选择的 `DSH_HOME`：同一文件 `L200-L241`。

Harness 随后按以下优先级加载普通变量：继承环境 → Harness 启动 cwd 下的 `.env` → `$DSH_HOME/.env`；前一层已存在的变量不会被后一层覆盖：`npm-dsh/deepseek-ai-dsh-app-boot-0.1.2-alpha.1.tgz::package/lib/index.js:L1030-L1065`。`DSH_*`、`PATH`、代理和其他启动级变量禁止写入发现的 `.env`，必须从继承环境导出：同一成员 `L933-L1024`。

Desktop 固定以下路径：

- 开发版 `userData`：`<appData>/dsh-desktop-dev`。
- 生产版 `userData`：`<appData>/dsh-desktop`。
- Desktop `DSH_HOME`：`<userData>/harness`。
- Harness 启动 cwd：`<userData>/launch-root`。

证据见 `.local/upstreams/dsh-desktop/src/main/index.ts:L438-L451`、`.local/upstreams/dsh-desktop/src/main/index.ts:L1993-L2006`、`.local/upstreams/dsh-desktop/src/main/state/launch-root.ts:L4-L11`。Harness 本身支持显式 config → `$DSH_HOME` → `~/.dsh` 的解析顺序：`npm-dsh/deepseek-ai-dsh-home-paths-0.1.2-alpha.1.tgz::package/lib/index.js:L63-L75`；但是 Desktop spawn 在该层之前已经覆盖 `DSH_HOME`，所以启动 Desktop 时设置外部 `DSH_HOME` 不会改变 Desktop 的 Harness home。

直接结果是：Desktop 不会读取当前插件仓库根目录的 `.env`，因为 Harness 的项目 `.env` 实际指向 `<userData>/launch-root/.env`。无需修改 Desktop 核心即可使用的现有入口只有“启动前导出的继承环境”和“`<userData>/harness/.env` 中的普通变量”。Desktop 没有 repo `.env` 路径参数。

### 2.5 启动 workspace

Harness 把命令调用目录作为默认 workspace root：`npm-dsh/deepseek-ai-dsh-0.1.2-alpha.1.tgz::package/README.md:L19-L29`；默认 sandbox 也把 `workspaceRoot` 设置为 `process.cwd()`：`npm-dsh/deepseek-ai-dsh-base-0.1.2-alpha.1.tgz::package/cordis.patch.yml:L208-L219`。DSH Web 命令公开的启动参数只有 Web Host、端口、浏览器打开和 trusted host，不包含 workspace 参数：`npm-dsh/deepseek-ai-dsh-web-app-0.1.2-alpha.1.tgz::package/README.md:L25-L50`。

Desktop 把 cwd 固定为 `<userData>/launch-root`，所以 Desktop 没有“启动时直接指定仓库 workspace”的配置入口。该缺失不要求插件修改 Desktop 核心：Harness 的公开 Workspace 服务允许 Host 插件调用 `ctx.workspaceRegistry.create('/path/to/dir', title)` 创建或取得 workspace：`npm-dsh/deepseek-ai-dsh-workspace-0.1.2-alpha.1.tgz::package/README.md:L51-L64`。如果产品要求启动后直接选中该 workspace，Harness ComfyUI 应在自己的 Host 配置中确定目标路径，并由自己的 client 插件调用现有 session/workspace 接口；该行为属于插件，不属于 Electron shell。

### 2.6 默认 LLM 与 Settings 默认值

默认 composition 把 `agent-default-model` 配置为 `deepseek-official/deepseek-v4-flash`，并挂载 `$DSH_HOME/settings.yaml` provider：`npm-dsh/deepseek-ai-dsh-base-0.1.2-alpha.1.tgz::package/cordis.patch.yml:L73-L98`。

默认模型的优先级是：插件 composition config 提供 deployment base，Settings 中 `agent-default-model` 用户值覆盖 base，新建 Agent 读取当前值：`npm-dsh/deepseek-ai-dsh-agent-default-model-0.1.2-alpha.1.tgz::package/README.md:L25-L57`。Settings 服务对每个 namespace 使用 schema defaults → composition base → 用户文档 section 的组合顺序：`npm-dsh/deepseek-ai-dsh-settings-0.1.2-alpha.1.tgz::package/README.md:L10-L12`、`L46-L68`。文件 provider 默认路径为 `$DSH_HOME/settings.yaml`，也支持 composition 中配置绝对路径：`npm-dsh/deepseek-ai-dsh-settings-file-0.1.2-alpha.1.tgz::package/README.md:L34-L53`。

所以默认 LLM、默认 Preset 和 Harness ComfyUI 自己的“图片读取”默认配置都应通过各自的 composition base 或 `settings.yaml` namespace 提供，不需要 Desktop 设置项，也不需要由 health 命令写配置。

## 3. Preset 与 Skill 的实际加载目录

### 3.1 Preset

Web profile 挂载 `@deepseek-ai/dsh-agent-presets`，默认 Preset 是 `standard`：`npm-dsh/deepseek-ai-dsh-web-app-0.1.2-alpha.1.tgz::package/cordis.patch.yml:L427-L438`。

Preset roster 按以下来源加载：

1. `@deepseek-ai/dsh-agent-presets` 包内 `presets/`。
2. composition 中 `roots[]` 指定的目录。
3. `$DSH_HOME/.agent-presets`。

`includeShippedRoot` 和 `includeUserRoot` 分别控制第 1、3 项：`npm-dsh/deepseek-ai-dsh-agent-presets-0.1.2-alpha.1.tgz::package/README.md:L30-L58`。用户默认 Preset 由 `settings.yaml` 的 `agent-presets.default` 覆盖：同一文档 `L60-L69`。

外部插件包中的任意目录不会仅因“插件已安装”而自动成为 Preset root。插件若要提供项目 Preset，必须明确选择以下现有入口之一：把 Preset 放入 `$DSH_HOME/.agent-presets`，或在 `agent-presets` composition config 的 `roots` 中增加目录。

### 3.2 Skill

`@deepseek-ai/dsh-skill-filesystem` 按以下顺序扫描：

1. `<projectRoot>/.dsh/skills`
2. `<projectRoot>/.agents/skills`
3. `Config.customSkillDirs`
4. `<dshHome>/skills`
5. `<agentsHome>/skills`
6. 可选 `bundledSkillDir`

项目根目录是 lookup cwd 向上最近包含 `.git` 的目录；找不到 `.git` 时使用 lookup cwd：`npm-dsh/deepseek-ai-dsh-skill-filesystem-0.1.2-alpha.1.tgz::package/README.md:L42-L75`、`L95-L108`。standard Preset 已挂载该 provider：`npm-dsh/deepseek-ai-dsh-agent-presets-0.1.2-alpha.1.tgz::package/presets/standard/agent.cordis.yml:L76-L87`。

当前仓库的项目 Skills 位于 `.agents/skills`。当 Agent session cwd 位于当前仓库内时，它们通过第 2 个默认 root 被发现；当 Desktop 仍以 `launch-root` 创建 session 时，它们不会因为 Harness ComfyUI 包已安装而自动出现。现有解决入口是让 session 使用当前仓库 workspace、为该 Preset 设置 `customSkillDirs`，或者由当前插件注册自己的 Skill provider。该问题不是 Desktop 的插件接口缺失。

## 4. Agent 前台 shell capability

Harness `shell-env` 是 Host plane 公共服务。官方契约明确规定每个 bash/pwsh ToolExecution 都重新收集一次 managed `DSH_*` 环境，并允许其他 Host 插件通过 `ctx.shellEnv.register({ name, variables, resolve })` 注册 contributor：`npm-dsh/deepseek-ai-dsh-shell-env-0.1.2-alpha.1.tgz::package/README.md:L25-L63`。具体实现为每次 `collect(execution)` 调用 contributor 的 `resolve(execution)`：同一归档 `package/lib/index.js:L29-L97`。

Web profile 明确保留 `shell-env` 在 Host plane，因为 shell tools 位于每个 Agent Preset 内，而 contributor 必须在 session 生成前可用：`npm-dsh/deepseek-ai-dsh-web-app-0.1.2-alpha.1.tgz::package/cordis.patch.yml:L296-L311`。

当前 Harness ComfyUI Host 插件已经按该接口实现：

- 创建 `CliShellCapabilityStore`：`src/host/plugin.ts:L149-L154`。
- 注册 CLI Host route：`src/host/plugin.ts:L186-L193`。
- 通过 `shellEnv.register` 为每个执行生成 capability，并在 `tools/result` 撤销：`src/host/plugin.ts:L194-L209`。
- capability 只对当前 Agent 的前台 bash/pwsh tool call 签发；它绑定 session id、turn、call id 和 cwd：`src/host/cli/shell-capability.ts:L37-L56`、`L71-L100`。

因此，外层 Codex shell 没有这枚 capability 是正常现象：Codex shell 不是 DSH Agent 的 ToolExecution。它不影响 DSH Desktop 中 Agent 调用 Skill。若 DSH Desktop 内的 Agent 前台 shell 仍缺 capability，直接原因只可能是 Harness ComfyUI Host 插件没有进入 normal `web` composition，或者调用不满足插件声明的“前台 bash/pwsh”条件；无需新增 Desktop capability API。Safe Mode 不加载 normal profile 插件，因此 Safe Mode 中没有 Harness ComfyUI capability 也是预期行为。

## 5. Web 新窗口行为与应用内 Modal

DSH Desktop 对主 BrowserWindow 安装统一策略：

- URL 是 `file:`、`dsh-recovery:` 或任意 `http://127.0.0.1...` / `http://localhost...` 时，`setWindowOpenHandler` 返回 `allow`。
- 其他 HTTP(S) URL 调用 `shell.openExternal(url)` 后返回 `deny`。
- webview 一律禁止。

证据见 `.local/upstreams/dsh-desktop/src/main/security-policy.ts:L1-L20` 和 `.local/upstreams/dsh-desktop/src/main/security.ts:L4-L17`。因此：

- 外部网站的 `window.open` 或 `target="_blank"` 会交给系统浏览器。
- 同源 Harness 媒体 URL 的 `window.open` 或 `target="_blank"` 会创建新的 Electron BrowserWindow；Desktop 当前不会把它转换为应用内 Modal。

Harness 第一方 Web 客户端仍有两类 `_blank` 外部链接：Markdown HTTP(S) 链接和 Web Search source link，见 `npm-dsh/deepseek-ai-dsh-client-ui-primitives-0.1.2-alpha.1.tgz::package/lib/index.js:L5696-L5707`、`L6009-L6029`。DSH Desktop 自身还有打开官网 Preset 页面的 `window.open` 补丁：`.local/upstreams/dsh-desktop/patches/@deepseek-ai+dsh-client-ui-agent-preset+0.1.2-alpha.1.patch:L239`、`L576`。这些链接目标是外部网站，按 Desktop 规则进入系统浏览器，不应改成媒体 Modal。

对于 Harness ComfyUI 自己的媒体卡片，正确边界是插件客户端直接渲染应用内 Modal，而不是修改 Electron 的全局新窗口策略。当前 worktree 已这样实现：媒体缩略图是 button，点击后设置 `viewerMediaId`：`src/client/workbench/results-drawer.tsx:L180-L205`、`L251-L264`、`L299-L315`；随后在当前页面渲染 Harness `Modal` 和同源 viewer iframe：同一文件 `L343-L364`。测试也在 `tests/unit/results-drawer.test.tsx:L142-L145`、`L213-L216` 覆盖该行为。

如果产品要求把所有第三方插件、Markdown 内容和同源 `_blank` 全局改成一种统一的应用内 Modal，Desktop 目前没有该通用接口，这才属于确实缺失的 Desktop 行为。当前 Harness ComfyUI 媒体查看不需要该全局改造。

## 6. 开发启动命令与可用覆盖参数

DSH Desktop 第一方开发命令是：

```bash
npm ci
npm run dev
```

来源为 `.local/upstreams/dsh-desktop/docs/development.md:L13-L24` 和 `.local/upstreams/dsh-desktop/package.json:L25-L32`。调研没有执行这些命令。

当前源码可确认的覆盖入口只有：

- Desktop argv `--safe-mode`：`.local/upstreams/dsh-desktop/src/main/safe-mode.ts:L56-L58`、`.local/upstreams/dsh-desktop/src/main/index.ts:L171`。
- `DSH_TUNNEL_FORCE_PINGGY=1`：只用于测试移动桥隧道 fallback：`.local/upstreams/dsh-desktop/docs/development.md:L38-L44`、`.local/upstreams/dsh-desktop/src/main/index.ts:L2030-L2035`。
- 启动进程的普通环境变量：通过登录 shell 环境传给 Harness；其中 DSH 自己识别的环境变量继续生效，但 Desktop 会覆盖 `DSH_HOME`。
- Harness profile 的 `settings.yaml`、normal `web/cordis.patch.yml` 和插件依赖：位于开发 `userData/harness` 内，开发版与生产版隔离。

Desktop 没有对外覆盖以下项目：Harness profile 名、额外 `--patch`、Harness host、Harness port、Harness启动 cwd、repo `.env` 路径、Electron `userData` 或 Desktop `DSH_HOME`。Harness 端口由 Desktop 在 `127.0.0.1:0` 上申请空闲端口后传入：`.local/upstreams/dsh-desktop/src/main/runtime/harness-runtime.ts:L345-L353`、`L716-L731`。开发版和生产版使用不同 userData，但是多个 Desktop 开发 worktree 默认共享同一个 `dsh-desktop-dev`：`.local/upstreams/dsh-desktop/docs/development.md:L22-L24`。

## 无需修改 Desktop 核心的最小接入方案

1. 当前仓库把 Harness ComfyUI 包适配到 Desktop 随附的 Harness API，并生成 Host 与 `./client` 构建产物。
2. 集成启动器使用 Harness 公开命令把当前包加入 Desktop normal profile：`dsh plugin --profile web add <harness-comfyui-package-or-path>`。该命令负责 dependency、pnpm 安装和 bundle 入栈。
3. 当前插件继续在自己的 `cordis.patch.yml` 中插入 `harness-comfyui` Host row；不要修改 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 或 DSH Desktop 的 `build/dsh-desktop.patch.yml`。
4. 普通运行变量使用继承环境或 Desktop 的 `$DSH_HOME/.env`；用户 Settings 写入 Desktop 的 `$DSH_HOME/settings.yaml`。不要假设 Desktop 会读取当前仓库根 `.env`。
5. 项目 Preset 放入 `$DSH_HOME/.agent-presets` 或加入 `agent-presets.roots`；项目 Skills 通过 session workspace 的 `.agents/skills`、`customSkillDirs` 或插件 Skill provider 加载。
6. 启动 workspace 由当前插件使用 Harness Workspace/session 公共接口创建并选中。Desktop 仍以 `launch-root` 启动 Harness，不需要改 Electron main process。
7. Agent CLI capability 保持当前 `ctx.shellEnv.register` 实现。不要让 Desktop 或 health 命令签发、保存或改变 capability。
8. Harness ComfyUI 自己的图片和视频继续使用当前应用内 Modal；不要把 Desktop 全局 `setWindowOpenHandler` 当作媒体查看器。

只有以下新增需求才构成修改 DSH Desktop 核心的充分理由：

- Desktop 启动命令必须直接选择任意 Harness profile。
- Desktop 启动命令必须直接覆盖 `userData`、`DSH_HOME`、Harness cwd、repo `.env`、Host、port 或额外 `--patch`。
- 外部插件必须调用新的 Electron main/preload 原生权限，而 Harness Host/Web 公共接口无法完成该操作。
- Desktop 必须把所有同源 `_blank` 全局重写成统一的应用内 Modal。

当前 Harness ComfyUI 插件接入 normal `web` profile、加载 Host/Client、提供 capability、默认模型、Settings、Preset、Skill、workspace 和媒体 Modal 均不满足上述条件，因此不应以“Desktop 缺少公开插件接口”为理由修改 DSH Desktop 核心源码。
