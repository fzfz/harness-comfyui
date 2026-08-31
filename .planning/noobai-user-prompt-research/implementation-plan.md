# 删除 Prompt Builder 旧 `noobai_user_prompt` 输入定义的实施方案

## 调研结论

当前系统不会向 Prompt Builder 类 Skill 提供 `noobai_user_prompt` 对象。

当前用户消息由普通用户文字和零个或多个 `comfyui-context` JSON 行组成。Character 选择行采用以下数据结构：

```json
{"type":"comfyui-context","data":{"kind":"character","id":"39933","work_name":"尼尔机械纪元","character_name":"2b","prompt_text":"2b, yorha no. 2 type b"}}
```

Style 选择行采用以下数据结构：

```json
{"type":"comfyui-context","data":{"kind":"style","id":"12415","name":"say_hana","prompt_text":"say_hana"}}
```

`src/client/workbench/contract.ts` 的 `serializeWorkbenchContext()` 创建上述 JSON 行。`src/client/workbench/controller.ts` 的 `setWorkbenchContexts()` 把这些 JSON 行追加到 Harness 原生 Session 草稿。`tests/unit/workbench-controller.test.ts` 和 `tests/unit/native-surfaces.test.tsx` 已经验证普通用户文字保持不变、每个已选目录记录保持原始 `CatalogContext` 数据、记录顺序采用消息行顺序。

仓库运行时代码、本机安装的 Harness 源码和本机 DSH Desktop 源码均不存在 `noobai_user_prompt` 生产者。生产 checkout 的 `.local/desktop-production` Session 数据中，`noobai_user_prompt` 命中文件数为 0，`comfyui-context` 命中文件数为 1。

Git 历史显示旧定义和当前 `comfyui-context` 实现在提交 `e9f78b3` 中同时进入仓库。该提交保存的迁移 PRD 明确要求 Prompt Skill 读取普通用户消息和消息内结构化上下文，并明确要求不迁移 `noobai_user_prompt`。因此，当前六个 Skill 文件中的旧定义属于迁移遗漏，不属于运行时兼容合同。

## 执行主体

- “计划执行者”指用户批准本方案后负责修改仓库、运行检查、提交、发布和部署的执行主体。
- “Skill 执行者”指真实 Desktop Session 中读取并执行 ANIMA3 Prompt Builder 或 WAI Prompt Builder 的真实模型。
- “独立语义 Reviewer”指不修改被审查文件、只读取 Skill 或计划并出具语义验收清单的独立 Reviewer。

## 必须要实现的目标

1. 计划执行者必须删除 ANIMA3 Prompt Builder 中全部 `noobai_user_prompt` 路径，并把当前回合输入来源改为当前用户消息中的普通文字和 `comfyui-context` JSON 行。
2. 计划执行者必须重写 WAI Prompt Builder 的 `references/input-contract.md`，使该文件只定义当前消息普通文字、Character `comfyui-context` 数据、Style `comfyui-context` 数据和消息行顺序。
3. 计划执行者必须删除旧合同中的 `version`、`request_id`、`base_model_name`、`ui_explicit`、`selection_snapshot_version`、`selection_order`、`id` 整数类型、`work_id` 和空 `selections` 数组定义；计划执行者必须保留真实合同中的字符串 `data.id`。
4. 计划执行者必须保留两个 Prompt Builder 的 Prompt 构造行为、语义查询行为、格式校验行为和历史 Generation Run 查询行为。
5. 计划执行者必须通过独立语义 Review 和真实 Desktop 模型验收证明两个 Prompt Builder 不再等待或推测旧对象。

## 实施步骤

### 1. 修改 ANIMA3 Prompt Builder

计划执行者必须修改 `.agents/skills/anima-prompt-builder/SKILL.md`：

- frontmatter `description` 必须把输入来源改为用户自然语言画面要求、当前消息中的 Character/Style 选择和参考资料。
- “查询历史 Generation Run”必须说明纯历史查询不要求当前消息包含画面要求、Workflow、生成模型或 LoRA 选择。
- “读取当前回合”必须把普通用户文字定义为自然语言意图来源，把 `type=comfyui-context` 且 `data.kind=character` 或 `data.kind=style` 的 JSON 行定义为 UI 选择来源。
- Character 记录必须使用 `data.character_name`、`data.work_name` 和 `data.prompt_text`；Style 记录必须使用 `data.name` 和 `data.prompt_text`。
- Skill 执行者必须按照这些 JSON 行在当前消息中的出现顺序处理选择。修改后的内容不得要求 `selection_order`。
- “读取语义查询说明”的作品查询和缺少画师判断必须引用当前用户消息的普通文字和当前消息中的 Style `comfyui-context` 记录。

计划执行者必须修改以下 ANIMA3 参考文件：

| 文件 | 修改动作 |
| --- | --- |
| `.agents/skills/anima-prompt-builder/references/01-quick-start.md` | 把接收条件改为“收到当前用户消息后”，不再命名旧对象。 |
| `.agents/skills/anima-prompt-builder/references/02-role.md` | 把转换来源改为当前用户消息中的自然语言画面要求。 |
| `.agents/skills/anima-prompt-builder/references/semantic-query-interfaces.md` | 把 Work 查询来源改为当前用户消息普通文字中实际出现的作品、系列或 IP。 |

### 2. 修改 WAI Prompt Builder

计划执行者必须保留 `.agents/skills/wai-sdxl-prompt-builder/references/input-contract.md` 的文件名和 `.agents/skills/wai-sdxl-prompt-builder/SKILL.md` 中的现有读取指针。计划执行者必须用以下真实合同重写该参考文件：

- 当前用户消息中的非 `comfyui-context` 普通文字提供自然语言画面要求。
- `type=comfyui-context` 且 `data.kind=character` 的 JSON 行提供字符串 `data.id`、`data.work_name`、`data.character_name` 和 `data.prompt_text`。
- `type=comfyui-context` 且 `data.kind=style` 的 JSON 行提供字符串 `data.id`、`data.name` 和 `data.prompt_text`。
- Skill 执行者按 JSON 行在当前消息中的出现顺序消费 Character 和 Style 记录。
- 当前消息没有 Character 或 Style `comfyui-context` 记录时，Skill 执行者只使用普通用户文字完成画面设计。
- Character `data.prompt_text` 继续进入 `character` 采用流程；Style `data.prompt_text` 继续进入 `artist` 采用流程。

计划执行者必须修改 `.agents/skills/wai-sdxl-prompt-builder/references/semantic-tool-orchestration.md` 中两处反引号包围的 `user_text` 属性引用。两处规则都必须改为“当前用户消息中的普通文字”，并继续限制 Work 查询文本只能来自用户实际写出的作品名、系列名、IP 名、作品别名或类别限定。

该步骤只校正当前已经声明的 Character 和 Style 输入分支。计划执行者不得把 Model、LoRA、Work、Prompt Term、Artist String 或 Workflow Template 引入 WAI Prompt Builder 的新采用逻辑。

### 3. 保持运行时代码和校验器不变

计划执行者不得修改以下文件及其数据合同：

- `src/client/workbench/contract.ts`
- `src/client/workbench/controller.ts`
- `src/catalog/contract.ts`
- `.agents/skills/anima-prompt-builder/scripts/validate-output.mjs`
- `.agents/skills/wai-sdxl-prompt-builder/scripts/validate-output.mjs`
- 两个 Prompt Builder 的 `references/generation-cli.md`

当前运行时代码已经创建正确消息，两个格式校验器只校验 Prompt 输出，历史 Generation Run CLI 只读取 `run_id`。修改这些文件会扩大本次问题的行为范围。

### 4. 完成语义验收

独立语义 Reviewer 必须逐项核对以下内容：

- 两个 Prompt Builder 的每条输入规则都具有明确的 Skill 执行主体、读取动作和具体消息属性。
- ANIMA3 Prompt Builder 的普通文字来源、Character 字段、Style 字段和记录顺序与 `src/client/workbench/contract.ts`、`src/catalog/contract.ts` 完全一致。
- WAI `references/input-contract.md` 不再描述不存在的顶层对象、快照对象、请求 ID、底模名称或选择顺序属性。
- 两个 Prompt Builder 的纯历史 Generation Run 查询分支不要求当前消息包含画面要求或目录选择。
- 修改后的 Skill 文件不要求 Skill 执行者读取仓库 `docs/`、Host 源码、其他 Skill 目录或机器绝对路径来理解本次当前消息合同。
- Reviewer 必须人工阅读语义内容并出具验收清单；程序搜索只能检查旧标识是否仍有残留，不能代替语义验收。

### 5. 执行候选提交门禁并同步主 checkout

计划执行者必须先在 linked worktree 中执行以下检查：

1. 对两个 Prompt Builder 目录搜索 `noobai_user_prompt`、`ui_explicit`、`selection_snapshot_version`、`selection_order` 和反引号包围的 `user_text`；搜索结果必须不存在旧输入合同引用。
2. 执行 `pnpm quality`；全部自动化测试、合同检查、依赖审计和真实 Desktop 自动化测试必须通过。
3. 执行 `git diff --check`；命令必须无错误。
4. 在 worktree 分支提交候选变更，并记录候选提交的完整 SHA。

开发 Desktop 的 Skill 根目录来自真实 `$HOME/.agents/skills`，两个全局 Skill 链接必须继续指向主 checkout，不能临时指向 linked worktree。为了让真实模型读取候选 Skill，计划执行者必须执行以下主 checkout 同步步骤：

1. 计划执行者必须确认主 checkout 没有未提交修改。主 checkout 存在未提交修改、远端新提交导致候选提交不能快进合并或候选提交不是最新 `origin/main` 的后代时，计划执行者必须停止同步并请求用户处理具体 Git 状态。
2. 计划执行者必须获取最新 `origin/main`，把主 checkout 的 `main` 依次快进到最新 `origin/main` 和候选提交。计划执行者不得使用强制更新、reset 或覆盖用户修改。
3. 计划执行者必须确认主 checkout `HEAD` 等于候选提交完整 SHA。
4. 计划执行者必须解析两个全局 Skill 链接，确认解析后路径分别是主 checkout 的 `.agents/skills/anima-prompt-builder` 和 `.agents/skills/wai-sdxl-prompt-builder`。
5. 计划执行者必须比较候选提交与主 checkout 中两个 Skill 目录；Git 比较结果必须没有差异。

### 6. 完成真实 Desktop 模型验收

完成主 checkout 候选提交同步后，计划执行者必须按照 `docs/agents/worktree-development.md` 在当前 linked worktree 中以前台方式执行 `pnpm dev:start`，并在第二个终端执行 `pnpm dev:status` 和 `pnpm dev:logs`。`dev:status` 必须返回 `running`。

启动后，计划执行者必须再次记录两个全局 Skill 链接的解析后绝对路径、主 checkout `HEAD` 和候选提交完整 SHA。主 checkout `HEAD` 必须等于候选提交完整 SHA，两个链接必须解析到该主 checkout 的 canonical Skill 目录，验收记录才能继续。

计划执行者必须在 `ComfyUI工作台预设` 中使用当前配置的真实 Provider 和真实模型完成以下用例：

| 用例 | 当前消息 | 预期结果 |
| --- | --- | --- |
| ANIMA 普通文字 | 明确调用 ANIMA3 Prompt Builder，只输入画面要求，不选择 Character 或 Style | Skill 执行者直接构建并校验十二槽 Prompt，不询问 `noobai_user_prompt`、`user_text` 属性或 `ui_explicit`。 |
| ANIMA Character 与 Style | 明确调用 ANIMA3 Prompt Builder，按可记录的点击顺序插入一个 Character、Style A 和 Style B，不声明画师顺序，再输入画面要求 | Skill 执行者读取三个 `comfyui-context` JSON 行；Character `data.prompt_text` 的分段继续分类到 `character_series` 和 `appearance`，Style A 与 Style B 的规范化结果继续按两条 Style JSON 行的顺序进入 `artist_style`。 |
| WAI 普通文字 | 明确调用 WAI Prompt Builder，只输入画面要求，不选择 Character 或 Style | Skill 执行者直接完成画面设计和十五位置输出，不询问旧顶层对象。 |
| WAI Character 与 Style | 明确调用 WAI Prompt Builder，按可记录的点击顺序插入一个 Character、Style A 和 Style B，不声明画师顺序，再输入画面要求 | Skill 执行者让 Character `data.prompt_text` 进入 `character` 采用流程，让 Style A 与 Style B 的 `data.prompt_text` 按两条 Style JSON 行的顺序进入 `artist` 采用流程，并且不推测 `selection_order`。 |
| ANIMA 纯历史 Run 查询 | 明确调用 ANIMA3 Prompt Builder，只要求查询一个 `run_id` | Skill 执行者先执行历史 Run 查询分支，不要求补充当前画面要求或目录选择。 |
| WAI 纯历史 Run 查询 | 明确调用 WAI Prompt Builder，只要求查询一个 `run_id` | Skill 执行者先执行历史 Run 查询分支，不要求补充当前画面要求或目录选择。 |

验收记录必须保存所选 Preset、真实模型、六项用户请求、原始 `comfyui-context` JSON 行顺序、Skill 执行者解析的选择记录顺序、最终采用顺序、Skill 执行者实际读取文件的解析后绝对路径、该路径所属的主 checkout 提交、格式校验器或历史 Run CLI 的前台 shell 调用和返回结果。验收完成后，计划执行者必须执行 `pnpm dev:stop` 和 `pnpm dev:status`；最终状态必须是 `stopped`。

### 7. 完成最终质量门禁、发布与生产部署

当前版本是 `0.37.6`。本次修改属于 Skill 输入合同修复，目标补丁版本是 `0.37.7`。用户批准本方案后，计划执行者必须：

1. 把根 `package.json.version` 更新为 `0.37.7`，不修改依赖版本或 `pnpm-lock.yaml` 中的依赖解析结果。
2. 更新 `README.md`、`docs/releasenotes.md`、`docs/system/testing.md`、`docs/system/startup.md` 和 `docs/system/releasing.md` 中的当前版本、六项真实模型验收记录和发布说明。
3. 完成最终候选树的独立 Standards Review、独立 Spec Review 和独立语义 Review，再次执行 `pnpm quality` 和 `git diff --check`。最终结果必须是 critical、high、moderate 和 low 依赖漏洞数量均为 0。
4. 在 worktree 分支提交最终发布文档，并把主 checkout 从候选提交快进到最终发布提交。主 checkout 存在未提交修改或不能快进时，计划执行者必须停止并请求用户处理具体 Git 状态。
5. 推送最终 `main`，并确认本地 `HEAD` 与 `origin/main` 指向同一个完整提交 SHA。
6. 创建并推送 `v0.37.7` annotated tag，创建无附件的 GitHub Release。
7. 确认主 checkout `HEAD` 与 `v0.37.7` 指向同一个最终发布提交，并确认两个全局 Skill 链接解析到该主 checkout 的 canonical Skill 目录。
8. 按 `docs/system/releasing.md` 从 `v0.37.7` 更新生产 checkout，保留生产 `.env` 和 `.local` 运行状态，启动生产 Desktop，并确认 `pnpm prod:status` 返回 `running`。
9. 确认生产 checkout `HEAD`、主 checkout `HEAD` 和 `v0.37.7` 指向同一个最终发布提交。确认两个全局 Skill 链接的解析后路径位于该主 checkout，并确认主 checkout 中两个 Skill 目录与 `v0.37.7` 没有 Git 差异。
10. 在新生产 Desktop Session 中重新执行一项 ANIMA 普通文字用例和一项 WAI Character/Style 用例；验收记录必须包含 Skill 执行者实际读取文件的解析后绝对路径和最终发布提交完整 SHA。

生产部署会按照仓库发布规范对已下载的 DSH Desktop checkout 执行 `npm ci`，并对生产 checkout 执行 `pnpm install --frozen-lockfile`。本方案没有新增依赖；用户批准本方案后，批准范围包含上述基于已提交 lockfile 的安装和启动命令，不包含任何未列出的依赖安装、后台启动或定时任务。

## 验收清单

- [ ] `.agents/skills/anima-prompt-builder/` 不再包含 `noobai_user_prompt` 输入引用。
- [ ] `.agents/skills/wai-sdxl-prompt-builder/` 不再包含 `noobai_user_prompt`、`ui_explicit`、`selection_snapshot_version`、`selection_order` 或反引号包围的 `user_text` 输入属性引用。
- [ ] ANIMA 当前回合输入章节使用普通用户文字、Character `comfyui-context` 和 Style `comfyui-context` 的真实字段名。
- [ ] WAI `references/input-contract.md` 使用普通用户文字、Character `comfyui-context` 和 Style `comfyui-context` 的真实字段名。
- [ ] 两个 Prompt Builder 按当前消息中同类 Style JSON 行的顺序处理 Style A 和 Style B。
- [ ] 两个 Prompt Builder 的纯历史 Run 查询不要求当前画面输入。
- [ ] 独立语义 Reviewer 已通过全部语义检查项。
- [ ] 六项真实 Desktop 模型用例全部通过，且验收记录包含实际 Skill 路径、Git 提交、消息行顺序、采用顺序和 shell 调用证据。
- [ ] `pnpm quality` 和 `git diff --check` 全部通过。
- [ ] 最终候选树通过必需的独立审查、`pnpm quality` 和 `git diff --check`，且本地 `HEAD` 与 `origin/main` 指向同一个完整提交 SHA。
- [ ] `v0.37.7` tag、GitHub Release、主 checkout 和生产 checkout 指向同一个最终提交。
- [ ] 新生产 Desktop Session 能发现并正确执行更新后的两个全局 Skill。

## 非本次目标

- 本次不改变 `comfyui-context` 的运行时 JSON 数据结构。
- 本次不增加 `noobai_user_prompt` 兼容层、别名解析、静默降级或迁移逻辑。
- 本次不改变 Prompt Builder 对 Model、LoRA、Work、Prompt Term、Artist String 或 Workflow Template 的采用范围。
- 本次不改变语义查询接口、Prompt 输出槽位、WAI 十五位置、格式校验器或 Generation Run 数据结构。
- 本次不修改 Harness 或 DSH Desktop 外部项目源码。
- 本次不增加或升级依赖。

## 已获得的授权

- 用户已经授权计划执行者创建独立 worktree、读取仓库和本机运行状态、完成调研并编写本实施方案。
- 用户已经明确批准本实施方案，并授权计划执行者修改六个 Skill 文件、启动开发 Desktop、执行真实模型验收、更新版本与发布文件、提交、推送、发布和部署。
- 用户要求计划执行者使用独立语义 Reviewer 审查 Skill 内容，并使用真实模型理解 Skill 后完成验收。
