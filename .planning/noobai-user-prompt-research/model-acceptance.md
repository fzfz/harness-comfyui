# Prompt Builder 当前消息输入合同模型验收记录

## 验收环境

- 验收时间：2026-08-31
- linked worktree：`/Volumes/4Tdisk/work/AI2/harness-comfyui-research-noobai-user-prompt`
- 候选提交：`dff04f2812bb93eca53946c465924d7b101f4153`
- 主 checkout 提交：`dff04f2812bb93eca53946c465924d7b101f4153`
- Preset：`ComfyUI工作台预设`
- Provider 配置对应的真实模型：`DeepSeek V4 Flash`
- 推理等级：`Default`
- 开发 Desktop 启动命令：`pnpm dev:start`
- 最终补充验收启动状态：`pnpm dev:status` 返回 `{"status":"running","pid":19575}`
- 停止状态：`pnpm dev:stop` 返回 `{"status":"stopped","pid":19575}`；随后 `pnpm dev:status` 返回 `{"status":"stopped"}`

Desktop 的 Skill 工具分别显示以下实际注入路径：

- `/Volumes/4Tdisk/work/AI2/harness-comfyui-research-noobai-user-prompt/.local/desktop-development/home/.agents/skills/anima-prompt-builder`
- `/Volumes/4Tdisk/work/AI2/harness-comfyui-research-noobai-user-prompt/.local/desktop-development/home/.agents/skills/wai-sdxl-prompt-builder`

两个注入路径通过全局 Skill 链接解析到以下 canonical 目录：

- `/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/anima-prompt-builder`
- `/Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/wai-sdxl-prompt-builder`

主 checkout 与候选提交的两个 Skill 目录均没有 Git 差异。

## UI 上下文原始记录

### ANIMA Character/Style 用例

计划执行者在 Desktop 的 ComfyUI 上下文选择器中依次选择 Character `Ani (Grok Companion)`、Style `say_hana` 和 Style `ds_mile`。Character 的目录记录同时包含角色词和外观词。Desktop 按选择顺序写入以下三行：

```json
{"type":"comfyui-context","data":{"kind":"character","id":"39934","work_name":"其它","character_name":"Ani (Grok Companion)","prompt_text":"Ani_(Grok), blonde hair, twintails, long hair, blue eyes,"}}
{"type":"comfyui-context","data":{"kind":"style","id":"12415","name":"say_hana","prompt_text":"say_hana"}}
{"type":"comfyui-context","data":{"kind":"style","id":"12414","name":"ds_mile","prompt_text":"ds_mile"}}
```

### WAI Character/Style 用例

计划执行者在 Desktop 的 ComfyUI 上下文选择器中依次选择 Character `2b`、Style `say_hana` 和 Style `ds_mile`。Desktop 按选择顺序写入以下三行：

```json
{"type":"comfyui-context","data":{"kind":"character","id":"39933","work_name":"尼尔机械纪元","character_name":"2b","prompt_text":"nier2b,"}}
{"type":"comfyui-context","data":{"kind":"style","id":"12415","name":"say_hana","prompt_text":"say_hana"}}
{"type":"comfyui-context","data":{"kind":"style","id":"12414","name":"ds_mile","prompt_text":"ds_mile"}}
```

## 六项模型验收

### ANIMA 普通文字

用户请求：

> 明确调用 anima-prompt-builder，只根据这条普通文字构建并校验 ANIMA3 十二槽 Prompt：一名成年女性站在雨夜霓虹街道上，半身构图，回头看向镜头。不要生成图片。

Skill 执行者直接读取普通文字，构建十二槽 Prompt，并运行 `node scripts/validate-output.mjs`。校验器返回 `result: success`。Skill 执行者没有询问旧输入对象或旧输入属性。

### ANIMA Character 与 Style

用户请求由“金发双马尾蓝眸的少女 Ani 站在白色摄影棚中，正面半身肖像”的普通文字和目录选择器写入的三行 JSON 组成。

Skill 执行者按消息行顺序报告 `Character 39934 → Style 12415 → Style 12414`。Skill 执行者把 Character `data.prompt_text` 中的 `ani_(grok)` 分类到 `character_series`，把 `blonde hair`、`twintails`、`long hair` 和 `blue eyes` 分类到 `appearance`。Skill 执行者把 Style 记录规范化为 `artist_style=["@say_hana","@ds_mile"]`。

Skill 执行者在 `anima-prompt-builder` 目录执行以下前台校验调用：

```sh
cat <<'EOF' > /tmp/anima_input.json
{"slots":{"quality":["masterpiece","best quality","score_7","highres","safe"],"artist_style":["@say_hana","@ds_mile"],"count_gender":["1girl","solo"],"character_series":["ani_(grok)"],"appearance":["blonde hair","twintails","long hair","blue eyes"],"clothing_state":["white_dress","long_dress"],"pose_action_sex":["standing","posing"],"expression_reaction":["eye_contact"],"camera_shot":["upper_body","from front","facing_viewer"],"scene_environment":["white_background","simple_background","indoors","studio"],"detail_mood":[],"natural_language":[]},"display_text":"金发双马尾蓝眸的少女 Ani 站立于白色摄影棚中，正面半身肖像，直视镜头。"}
EOF
node scripts/validate-output.mjs < /tmp/anima_input.json
```

校验器返回 `result: success`。

### WAI 普通文字

用户请求：

> 明确调用 wai-sdxl-prompt-builder，只根据这条普通文字构建并检查 WAI-illustrious-SDXL Prompt：一名成年女性坐在咖啡馆窗边读书，午后，半身构图。不要生成图片。

Skill 执行者直接读取普通文字，完成十五位置设计，并运行 `node scripts/validate-output.mjs`。校验器退出码为 0。Skill 执行者没有询问旧顶层对象。

### WAI Character 与 Style

用户请求由“2b 站在白色摄影棚中，正面半身肖像”的普通文字和目录选择器写入的三行 JSON 组成。

Skill 执行者按消息行顺序报告 `Character 2b → Style say_hana → Style ds_mile`。Skill 执行者采用 `character=["nier2b,"]`，并按 Style 行顺序采用 `artist=["(say_hana:1.0)","(ds_mile:1.0)"]`。

Skill 执行者在 canonical WAI Skill 目录执行以下前台校验调用：

```sh
cd /Volumes/4Tdisk/work/AI2/harness-comfyui/.agents/skills/wai-sdxl-prompt-builder
node scripts/validate-output.mjs < /tmp/wai_input2.json
```

校验器退出码为 0，返回 `result: success`。

### ANIMA 纯历史 Run 查询

用户请求：

> 明确调用 anima-prompt-builder，只查询 run_id run_missing 的历史 Generation Run 原始生成参数和 Actual Workflow；不要构建 Prompt，也不要要求当前画面文字或 UI 上下文。

Skill 执行者先读取 `references/generation-cli.md`，再执行：

```sh
node "$DSH_HARNESS_COMFYUI_CLI" generation run-inputs --stdin <<'JSON'
{"run_ids":["run_missing"]}
JSON
```

CLI 返回 `lookup_status: error` 和 `GENERATION_RUN_NOT_FOUND`。Skill 执行者没有构建 Prompt，也没有要求当前画面文字或 UI 上下文。

### WAI 纯历史 Run 查询

用户请求：

> 明确调用 wai-sdxl-prompt-builder，只查询 run_id run_missing 的历史 Generation Run 原始生成参数和 Actual Workflow；不要构建 Prompt，也不要要求当前画面文字或 UI 上下文。

Skill 执行者先读取 `references/generation-cli.md`，再执行与 ANIMA 用例相同的 `generation run-inputs --stdin` 命令。CLI 退出码为 0，并返回 `lookup_status: error` 和 `GENERATION_RUN_NOT_FOUND`。Skill 执行者没有构建 Prompt，也没有要求当前画面文字或 UI 上下文。

## 模型实际读取的 Skill 文档

- ANIMA 普通文字用例读取 `SKILL.md`、`references/00-template-header.md`、`references/01-quick-start.md`、`references/02-role.md`、`references/03-output-protocol.md`、`references/04-final-self-check.md`、`references/05-conflict-table.md`、`references/06-slot-order.md`、`references/07-assembly-decision-tree.md`、`references/08-count-identity.md`、`references/09-appearance.md`、`references/10-clothing-state.md`、`references/11-pose-action-sex.md`、`references/12-expression-reaction.md`、`references/13-camera-shot.md`、`references/14-scene-environment.md` 和 `references/15-detail-mood.md`，并执行 `scripts/validate-output.mjs`。
- ANIMA Character/Style 用例读取 `SKILL.md`、`references/00-template-header.md`、`references/01-quick-start.md`、`references/02-role.md`、`references/03-output-protocol.md`、`references/04-final-self-check.md`、`references/05-conflict-table.md`、`references/06-slot-order.md`、`references/07-assembly-decision-tree.md`、`references/08-count-identity.md`、`references/09-appearance.md`、`references/10-clothing-state.md`、`references/11-pose-action-sex.md`、`references/12-expression-reaction.md`、`references/13-camera-shot.md`、`references/14-scene-environment.md`、`references/15-detail-mood.md`、`references/17-examples.md` 和 `references/semantic-query-interfaces.md`，并执行 `scripts/validate-output.mjs`。
- WAI 普通文字与 Character/Style 用例在同一 Session 中读取 `SKILL.md`、`references/input-contract.md`、`references/composition-scenario-branches.md`、`references/composition-decision-tree.md`、`references/visual-design-slot-order.md`、`references/wai-prompt-position-order.md`、`references/action-structure.md`、`references/prompt-self-check.md`、`references/prompt-conflict-rules.md`、`references/prompt-format-validator.md`、`references/prompt-position-rules/action.md`、`references/prompt-position-rules/appearance.md`、`references/prompt-position-rules/artist.md`、`references/prompt-position-rules/camera-composition.md`、`references/prompt-position-rules/character.md`、`references/prompt-position-rules/detail-mood.md`、`references/prompt-position-rules/environment.md`、`references/prompt-position-rules/expression-reaction.md`、`references/prompt-position-rules/lighting.md`、`references/prompt-position-rules/non-artist-style.md`、`references/prompt-position-rules/outfit.md`、`references/prompt-position-rules/quality.md`、`references/prompt-position-rules/relation-narrative.md`、`references/prompt-position-rules/subject.md` 和 `references/prompt-position-rules/technical.md`，并执行 `scripts/validate-output.mjs`。
- 两个纯历史 Run 查询用例分别读取对应 Skill 的 `SKILL.md` 和 `references/generation-cli.md`。

上述文件均从 Desktop 的实际注入 Skill 路径读取。历史查询命令使用 Desktop 注入的 `$DSH_HARNESS_COMFYUI_CLI`。

## 仓库最低真实模型行为验收

### 标准 Preset 的 Host 项目 Tool

计划执行者在 `标准模式` 中要求模型直接调用 `query_semantic_comfyui_instances`。模型使用固定参数 `{"mode":"search","query":"","page":1,"page_size":100}` 完成调用，Tool 返回 `status: ok` 和实例 ID `2`。模型没有调用 shell，也没有生成图片。

### ComfyUI Preset 的 Host 项目 Tool 隔离

计划执行者在 `ComfyUI工作台预设` 中要求模型只检查直接 Tool schema。模型确认 `query_semantic_comfyui_instances` 不在当前直接 Tool schema 中；当前直接 Tool 只有 `bash` 和 `skill`。模型没有读取 Skill 或文件，也没有调用 shell。

### 全局 Skill 与 managed CLI

ANIMA 和 WAI 的历史查询用例均通过全局 Skill 链接加载对应 `SKILL.md` 和 `references/generation-cli.md`，并在前台 shell 中执行 Desktop 注入的 managed CLI。两个用例均返回结构化 `GENERATION_RUN_NOT_FOUND`，证明全局 Skill 发现、参考文档读取和 managed CLI 授权链路可用。

### 同一 Generation Request 的多个独立 Run

计划执行者通过 UI 选择 Workflow `AnimaStandardV8_完整25步吃负面词`（ID `43`）和生成模型 `anima-aesthetic-v1.1.safetensors`（ID `3`）。Desktop 写入：

```json
{"type":"comfyui-context","data":{"kind":"comfyui-template","id":"43","title":"AnimaStandardV8_完整25步吃负面词"}}
{"type":"comfyui-context","data":{"kind":"model","id":"3","file_name":"anima-aesthetic-v1.1.safetensors"}}
```

模型加载 `comfyui-generate`，读取 `references/catalog-cli.md` 和 `references/generation-cli.md`，核对 Workflow 与生成模型的 `base_model_id` 均为 `1`，再对同一 Generation Request 执行两次独立的 `generation submit --stdin`。Run Repository 和结果抽屉显示两次原始提交创建了不同 Run：

- `run_5ce8998b-6d06-4946-bf09-ab796668a886`
- `run_c007d8fd-6314-4324-9f71-504bcba990ee`

两次请求的 `instanceId`、`templateId`、`model`、`parameters.positive_prompt` 和空 `loras` 完全相同。两个 CLI 调用在 60 秒内没有把 `run_id` 返回给模型；两个 Run 随后都以 `COMFYUI_FRONTEND_BROWSER_FAILED` 结束，错误说明实例 `2` 的 `http://192.168.110.122:8188` Chrome DevTools 目标不可连接。该实例错误不改变两个独立 Run 已经持久化的事实。模型按 CLI 错误指引开始第三次重试后，计划执行者停止该重试。

## 验收结论

- 六项真实 Desktop 模型用例全部通过。
- ANIMA Character/Style 用例确认真实目录 Character `data.prompt_text` 中的角色词进入 `character_series`，外观词进入 `appearance`。
- 两个 Prompt Builder 均从当前消息普通文字和 `comfyui-context.data` 读取当前回合输入。
- 两个 Prompt Builder 均按 Style JSON 行在当前消息中的出现顺序采用 Style 记录。
- 两个纯历史查询分支均独立运行。
- 六项用例均没有要求或推测 `noobai_user_prompt`、`ui_explicit`、`selection_snapshot_version` 或 `selection_order`。
- 仓库最低真实模型行为中的标准 Preset Host Tool、ComfyUI Preset Tool 隔离、全局 Skill 与 managed CLI、同一请求多个独立 Run 均已实际执行。两个独立 Run 的持久化通过；向外部 ComfyUI 实例传输并完成图片生成没有通过。该外部实例失败不属于六项 Prompt Builder 理解用例。
