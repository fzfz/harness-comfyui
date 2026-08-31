# `noobai_user_prompt` 输入合同调研记录

## 用户需求

- 用户要求计划执行者在独立 worktree 中确认系统是否已经不再向 Prompt Builder 类 Skill 输入 `noobai_user_prompt.xxx` 数据。
- 如果系统已经不再输入该数据，用户要求计划执行者调研如何删除相关定义，避免 Skill 执行者产生困扰和误解。
- 用户要求计划执行者先提交实施方案，并等待用户批准后再实施。

## 已确认事实

- 主 checkout 的 `main` 在调研开始时落后 `origin/main` 两个提交。
- 独立 worktree `/Volumes/4Tdisk/work/AI2/harness-comfyui-research-noobai-user-prompt` 已从最新 `origin/main` 创建。
- 独立 worktree 使用分支 `codex/remove-obsolete-noobai-user-prompt`。
- 仓库规范要求修改项目 Skill 后执行自动化检查、独立语义 Review 和真实 Desktop 模型验收。
- 当前仓库对 `noobai_user_prompt` 的精确引用只出现在 `.agents/skills/anima-prompt-builder/` 和 `.agents/skills/wai-sdxl-prompt-builder/references/input-contract.md`；运行时代码的精确字符串搜索没有命中。
- `.agents/skills/anima-prompt-builder/SKILL.md` 把 `noobai_user_prompt.user_text` 和 `noobai_user_prompt.ui_explicit.selections[]` 定义为当前回合输入。
- `.agents/skills/wai-sdxl-prompt-builder/SKILL.md` 的当前流程已经直接使用“用户的自然语言画面要求”和“UI 已选角色、画师”，但是其 `references/input-contract.md` 仍保留 `kind = noobai_user_prompt` 的旧合同定义。
- `.agents/skills/wai-sdxl-prompt-builder/references/input-contract.md` 把 `noobai_user_prompt` 描述为 Skill Agent 可见的“当前轮输入对象”，并定义 `version`、`request_id`、`base_model_name`、`user_text` 和 `ui_explicit`；该文件没有指出哪个 Host 模块或 Harness 接口创建此对象。
- `docs/system/architecture.md` 把 Client 的“插入上下文”选择器和 `.agents/skills/` 列为不同模块，并明确 `CatalogContext` 是上下文选择器使用的数据合同；该文档没有把 `noobai_user_prompt` 列为 Host、Client、Tool 或 CLI 合同。
- `docs/system/architecture.md` 说明 Prompt Skill 使用当前 Session 的用户消息、全局 Skill 文件和按需 CLI；Host 的 managed CLI 身份与 Generation Run 历史查询合同不接受 `noobai_user_prompt`。
- `src/client/workbench/contract.ts` 定义当前 UI 选择的唯一消息序列化格式：每个选择单独写成一行 `{"type":"comfyui-context","data":<CatalogContext>}`。该格式没有 `noobai_user_prompt`、`user_text`、`ui_explicit`、`selection_order`、`version`、`request_id` 或 `base_model_name`。
- `src/client/workbench/controller.ts` 的 `setWorkbenchContexts()` 只调用 Harness 原生 Session input 的 `setDraft()`，把选择行追加到用户的普通草稿文本；该函数不创建额外顶层对象。
- `src/catalog/contract.ts` 的 Character `CatalogContext` 只包含 `kind`、`id`、`work_name`、`character_name` 和 `prompt_text`；Style `CatalogContext` 只包含 `kind`、`id`、`name` 和 `prompt_text`。ID 类型是字符串，不是旧输入合同定义的整数。
- `tests/unit/workbench-controller.test.ts` 和 `tests/unit/native-surfaces.test.tsx` 明确断言确认选择后写入的是原始 `CatalogContext` JSON 行，同时保留用户普通正文；测试没有构造或期待 `noobai_user_prompt` 包装对象。
- `docs/adr/0006-harness-owns-skill-invocation-policy.md` 规定 Harness 原生 Skill provider 负责 Skill 调用；项目 Client 只通过公开输入 API 修改普通草稿，Host 在 Agent 执行前发现 Skill。项目没有第二套 Skill 调用或输入包装流程。
- Git 历史显示 `noobai_user_prompt` 文档和当前 `comfyui-context` 草稿序列化代码都在提交 `e9f78b3` 中进入仓库；因此仓库历史没有出现“先由当前 Host 生成旧对象、后来删除生成器”的阶段。
- 提交 `e9f78b3` 当时保存的迁移 PRD 明确要求 Prompt Skill 读取普通用户消息和同一消息的结构化上下文，并明确要求不迁移 `noobai_user_prompt`；同一提交的调研记录也明确写明当前 Harness 产品不提供该旧输入对象。
- 尽管迁移要求明确删除旧合同，提交 `e9f78b3` 仍把来源 ANIMA Skill 的 `noobai_user_prompt` 路径和来源 WAI Skill 的旧 `references/input-contract.md` 一并加入仓库。该证据说明当前引用是迁移遗漏，不是运行时兼容合同。
- 本机安装的 `node_modules/@deepseek-ai` 和 `.local/upstreams/dsh-desktop` 源码对 `noobai_user_prompt`、`ui_explicit` 和 `selection_snapshot_version` 的精确搜索均无命中；Harness/DSH Desktop 没有项目外的二次包装生产者。
- 生产 checkout 当前固定在已发布版本 `v0.37.6`。对其 `.local/desktop-production` 可读 Session 数据执行只返回命中文件数量的搜索后，`noobai_user_prompt` 命中文件数是 0，`comfyui-context` 命中文件数是 1；当前生产 Session 数据与源码合同一致。
- 全局 `/Users/fzfz/.agents/skills/anima-prompt-builder` 和 `/Users/fzfz/.agents/skills/wai-sdxl-prompt-builder` 都指向主开发 checkout 的 canonical Skill 目录。未来发布提交合并到主开发 checkout 后，无需创建新的全局 Skill 路径；需要在新 Desktop Session 中重新发现更新后的 Skill。

## 待验证假设

- `noobai_user_prompt` 可能只残留在 Skill 文档中，当前 Host 或 managed CLI 已不再构造该输入。
- 历史 Generation Run 的原始输入输出可能仍包含相似名称；该历史查询合同需要与实时 Prompt Builder 输入合同分开判断。
- 当前真实输入来源已经由 Client composer 代码和单元测试确认：用户自然语言保持为普通草稿文本，UI 选择作为独立 `comfyui-context` JSON 行追加到同一草稿。

## 技术决策

| 决策 | 理由 |
| --- | --- |
| 先从精确字符串搜索建立引用清单，再追踪真实输入生产者 | 该顺序可以区分文档残留与可达运行时合同。 |
| 所有结论必须绑定具体文件和数据属性 | 用户需要根据调研结果决定是否批准删除，宽泛判断不足以支持实施。 |
| WAI Skill 保留 `references/input-contract.md` 文件并重写内容 | `SKILL.md` 已把该文件作为整理当前消息前的明确读取入口；保留指针并替换错误合同能够维持信息层级。 |
| ANIMA Skill 在 `SKILL.md` 的“读取当前回合”章节保存当前消息合同 | 该 Skill 已在同一章节集中定义输入采用逻辑；三个参考文件只需改为引用当前用户消息，不再复制数据路径。 |
| 运行时代码和现有单元测试不修改 | 当前 `comfyui-context` 生产、序列化、顺序和保留普通文本的行为已经正确，问题只存在于 Skill 说明。 |

## 受影响文件

| 文件 | 删除或改写的内容 |
| --- | --- |
| `.agents/skills/anima-prompt-builder/SKILL.md` | 删除 frontmatter、历史 Run 分支、当前回合读取表和语义查询条件中的 `noobai_user_prompt` 路径；改用当前消息普通文本和 `comfyui-context` JSON 行。 |
| `.agents/skills/anima-prompt-builder/references/01-quick-start.md` | 把“收到 `noobai_user_prompt`”改为读取当前用户消息。 |
| `.agents/skills/anima-prompt-builder/references/02-role.md` | 把转换来源改为当前用户消息中的自然语言画面要求。 |
| `.agents/skills/anima-prompt-builder/references/semantic-query-interfaces.md` | 把 Work 查询来源改为当前用户消息的普通文本。 |
| `.agents/skills/wai-sdxl-prompt-builder/references/input-contract.md` | 删除旧顶层对象、`ui_explicit`、`selection_snapshot_version`、`selection_order`、旧整数 ID 和空数组定义；定义当前消息普通文本、Character/Style `comfyui-context` 记录和消息行顺序。 |
| `.agents/skills/wai-sdxl-prompt-builder/references/semantic-tool-orchestration.md` | 把两处旧 `user_text` 属性引用改为当前用户消息中的普通文字，避免重写输入合同时留下未定义属性。 |

## 不受影响的合同

- `.agents/skills/anima-prompt-builder/references/generation-cli.md` 和 `.agents/skills/wai-sdxl-prompt-builder/references/generation-cli.md` 的历史 Generation Run 查询参数、输出和错误合同不依赖 `noobai_user_prompt`。
- `src/client/workbench/contract.ts`、`src/client/workbench/controller.ts` 和 `src/catalog/contract.ts` 已经实现真实消息合同，不需要代码修改。
- Prompt 格式校验器的标准输入与输出合同不读取 `noobai_user_prompt`，不需要脚本修改。

## 独立语义 Review 结论

- 第一轮 Reviewer 发现开发 Desktop 从真实 `$HOME/.agents/skills` 读取全局 Skill，而全局 Skill 链接只能指向主 checkout。原方案直接从 linked worktree 启动 Desktop 会读取旧 Skill，不能证明候选修改有效。
- 修订后的方案要求计划执行者先在 worktree 形成候选提交，再在主 checkout 干净且可快进时把主 checkout 同步到候选提交；两个全局 Skill 链接保持指向主 checkout，并在模型验收前记录解析后路径和候选提交完整 SHA。
- 第一轮 Reviewer 要求同类记录顺序具有可观察结果。修订后的 ANIMA 和 WAI 上下文用例都使用一个 Character、Style A 和 Style B，并记录两条 Style JSON 行顺序和最终采用顺序。
- 第一轮 Reviewer 要求分别验证两个历史查询分支。修订后的真实模型验收包含六项独立用户请求。
- 第二轮独立语义 Review 未发现阻塞性或非阻塞性问题，结论为通过。

## 资料路径

- `docs/agents/worktree-development.md`
- `docs/agents/comfyui-workbench-preset-and-skill-development.md`
- `docs/system/architecture.md`
- `docs/system/directory-structure.md`
- `docs/system/configuration.md`
- `docs/system/testing.md`
- `docs/system/releasing.md`

## 问题记录

| 问题 | 处理结果 |
| --- | --- |
| 更新计划文件时补丁上下文少了 `worktree` 后的空格，导致 `apply_patch` 没有匹配 | 重新读取三个计划文件，并使用精确上下文重新应用补丁。 |
