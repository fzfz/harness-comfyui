# Prompt Builder 权重真实模型验收

## 验收环境

- 执行日期：2026-09-01，时区 `Asia/Shanghai`。
- 独立 worktree：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-weighted-tags`。
- 候选检查点提交：`3840659f8f65bad634d935e2af1539800f0e818f`。
- 用户可见 Preset：`ComfyUI工作台预设`。
- Preset 内部 ID：`harness-comfyui-cli-candidate`。
- Provider ID：`opencode-go`。
- Agent 模型 ID：`deepseek-v4-flash`；产品路由为 `opencode-go/deepseek-v4-flash`。
- 推理等级：`Default`。
- ANIMA Session：`session-15d4606a-f161-4262-89bc-6e01ba9dfd12`。
- WAI Session：`session-55524b10-0b34-46ee-a0a2-a0a35610c799`。

当前 `ComfyUI工作台预设` 向模型公开 Skill Tool 与 Bash Tool，没有公开 `run_skill_script` Tool。以下六个用例如实记录实际 Bash Tool Call：模型以前台 Bash 把标准输入 JSON 交给对应 Skill 自带的 `scripts/validate-output.mjs`。Bash Tool 对无退出标记的成功调用返回 `isError=false`，因此 ANIMA 三个用例的退出码为 0；WAI 三个用例还在同一前台命令中输出 `EXIT=0`。六个调用的标准错误均为空。

## 用例 A1：ANIMA 普通 tag 与两种画师形式

- 执行时间：2026-09-01 17:50:17 CST 至 17:54:51 CST。
- 配置：`ComfyUI工作台预设`；Provider `opencode-go`；模型 `deepseek-v4-flash`；推理等级 `Default`。
- 完整用户请求：

```text
明确调用 anima-prompt-builder，只构建并校验 ANIMA3 Prompt，不生成图片。画面是一名成年女性的 chibi 角色站在白色摄影棚中，正面半身构图。必须把普通 tag `(chibi:2)` 放入正确槽位；必须把未加权画师 `@fukahire` 和显式权重画师 `(@say_hana:2)` 分别作为两个 artist_style 元素；其他没有竞争的 tag 保持未加权。严格读取权重策略与权重方法，并调用 Skill 规定的校验器。
```

- 预期：`(chibi:2)` 位于 `appearance`；`@fukahire` 与 `(@say_hana:2)` 分别成为两个 `artist_style` 元素；两个用户显式数值逐字符保留；其他 tag 保持未加权。
- Agent 实际读取的 Skill 文件：
  - `.agents/skills/anima-prompt-builder/SKILL.md`
  - `.agents/skills/anima-prompt-builder/references/00-template-header.md`
  - `.agents/skills/anima-prompt-builder/references/01-quick-start.md`
  - `.agents/skills/anima-prompt-builder/references/02-role.md`
  - `.agents/skills/anima-prompt-builder/references/03-output-protocol.md`
  - `.agents/skills/anima-prompt-builder/references/04-final-self-check.md`
  - `.agents/skills/anima-prompt-builder/references/05-conflict-table.md`
  - `.agents/skills/anima-prompt-builder/references/prompt-weight-policy.json`
  - `.agents/skills/anima-prompt-builder/references/prompt-weighting.md`
  - `.agents/skills/anima-prompt-builder/references/06-slot-order.md`
  - `.agents/skills/anima-prompt-builder/references/07-assembly-decision-tree.md`
  - `.agents/skills/anima-prompt-builder/references/08-count-identity.md`
  - `.agents/skills/anima-prompt-builder/references/09-appearance.md`
  - `.agents/skills/anima-prompt-builder/references/10-clothing-state.md`
  - `.agents/skills/anima-prompt-builder/references/11-pose-action-sex.md`
  - `.agents/skills/anima-prompt-builder/references/12-expression-reaction.md`
  - `.agents/skills/anima-prompt-builder/references/13-camera-shot.md`
  - `.agents/skills/anima-prompt-builder/references/14-scene-environment.md`
  - `.agents/skills/anima-prompt-builder/references/15-detail-mood.md`
  - `.agents/skills/anima-prompt-builder/scripts/validate-output.mjs`
- 实际调用表面：Bash Tool Call。
- 实际 `script_path`：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-weighted-tags/.local/desktop-development/home/.agents/skills/anima-prompt-builder/scripts/validate-output.mjs`。
- 标准输入：

```json
{
  "slots": {
    "quality": ["masterpiece", "best quality", "score_7", "highres", "safe"],
    "artist_style": ["@fukahire", "(@say_hana:2)"],
    "count_gender": ["1girl", "solo"],
    "character_series": [],
    "appearance": ["(chibi:2)", "mature female", "long hair", "blue eyes", "fair skin"],
    "clothing_state": ["dress"],
    "pose_action_sex": ["standing"],
    "expression_reaction": ["direct eye contact", "smile"],
    "camera_shot": ["upper body", "from front", "facing viewer"],
    "scene_environment": ["white background", "simple background", "indoors"],
    "detail_mood": [],
    "natural_language": []
  },
  "display_text": "画面是一名成年女性形象的chibi角色，正面站在白色摄影棚中半身构图，直视镜头，表情自然微笑，背景为干净的白色摄影棚环境。"
}
```

- 退出码：0。
- stdout：

```json
{"kind":"noobai_assistant_prompt","result":"success","contract_version":"1.0.0","prompt_text":"masterpiece, best quality, score_7, highres, safe, @fukahire, (@say_hana:2), 1girl, solo, (chibi:2), mature female, long hair, blue eyes, fair skin, dress, standing, direct eye contact, smile, upper body, from front, facing viewer, white background, simple background, indoors","display_text":"画面是一名成年女性形象的chibi角色，正面站在白色摄影棚中半身构图，直视镜头，表情自然微笑，背景为干净的白色摄影棚环境。"}
```

- stderr：空。
- 实际 `prompt_text`：`masterpiece, best quality, score_7, highres, safe, @fukahire, (@say_hana:2), 1girl, solo, (chibi:2), mature female, long hair, blue eyes, fair skin, dress, standing, direct eye contact, smile, upper body, from front, facing viewer, white background, simple background, indoors`。
- 结论：通过。普通 tag 权重、未加权画师和显式权重画师均位于预期槽位，其他 tag 没有机械加权。

## 用例 A2：ANIMA Style 分段、单个 @ 与来源权重

- 执行时间：2026-09-01 17:55:31 CST 至 17:58:08 CST。
- 配置：`ComfyUI工作台预设`；Provider `opencode-go`；模型 `deepseek-v4-flash`；推理等级 `Default`。
- 完整用户请求：

```text
明确调用 anima-prompt-builder，只根据当前消息构建并校验 ANIMA3 Prompt，不生成图片。画面是一名成年女性站在白色摄影棚中，正面半身构图。当前 Style 记录的 prompt_text 在逗号后包含分段外部空白，并且第二名画师带合法来源权重；必须按“分段、清理分段外部空白、解析外层、规范化单个 @、恢复来源权重”处理，输出两个 artist_style 元素并逐字符保留第二项 weight。
{"type":"comfyui-context","data":{"kind":"style","id":"weight-case-2","name":"two weighted artists","prompt_text":"@fukahire, (@say_hana:2)"}}
```

- 预期：Style 字符串先按逗号分段并删除第二段外部空白，再解析来源外层；最终为 `@fukahire` 与 `(@say_hana:2)`，第二项 weight `2` 逐字符保留，两个 payload 都只有一个 `@`。
- Agent 本轮实际重新读取的 Skill 文件：A1 的十个固定参考文件，以及 `.agents/skills/anima-prompt-builder/references/09-appearance.md` 与 `.agents/skills/anima-prompt-builder/references/10-clothing-state.md`；`SKILL.md` 与校验脚本沿用同一 Session 已加载内容。
- 实际调用表面：Bash Tool Call。
- 实际 `script_path`：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-weighted-tags/.local/desktop-development/home/.agents/skills/anima-prompt-builder/scripts/validate-output.mjs`。
- 标准输入：

```json
{
  "slots": {
    "quality": ["masterpiece", "best quality", "score_7", "highres", "safe"],
    "artist_style": ["@fukahire", "(@say_hana:2)"],
    "count_gender": ["1girl", "solo"],
    "character_series": [],
    "appearance": ["mature female", "long hair", "blue eyes", "fair skin"],
    "clothing_state": ["dress"],
    "pose_action_sex": ["standing"],
    "expression_reaction": ["direct eye contact", "smile"],
    "camera_shot": ["upper body", "from front", "facing viewer"],
    "scene_environment": ["white background", "simple background", "indoors"],
    "detail_mood": [],
    "natural_language": []
  },
  "display_text": "画面是一名成年女性站在白色摄影棚中，正面半身构图，直视镜头，表情自然微笑，背景为干净的白色摄影棚环境。"
}
```

- 退出码：0。
- stdout：

```json
{"kind":"noobai_assistant_prompt","result":"success","contract_version":"1.0.0","prompt_text":"masterpiece, best quality, score_7, highres, safe, @fukahire, (@say_hana:2), 1girl, solo, mature female, long hair, blue eyes, fair skin, dress, standing, direct eye contact, smile, upper body, from front, facing viewer, white background, simple background, indoors","display_text":"画面是一名成年女性站在白色摄影棚中，正面半身构图，直视镜头，表情自然微笑，背景为干净的白色摄影棚环境。"}
```

- stderr：空。
- 实际 `prompt_text`：`masterpiece, best quality, score_7, highres, safe, @fukahire, (@say_hana:2), 1girl, solo, mature female, long hair, blue eyes, fair skin, dress, standing, direct eye contact, smile, upper body, from front, facing viewer, white background, simple background, indoors`。
- 结论：通过。Style 的分段外部空白被删除，两个画师保持独立，第二项合法来源 weight 原文没有改变。

## 用例 W3：WAI 普通 tag 与画师显式权重

- 执行时间：2026-09-01 18:00:57 CST 至 18:04:27 CST。
- 配置：`ComfyUI工作台预设`；Provider `opencode-go`；模型 `deepseek-v4-flash`；推理等级 `Default`。
- 完整用户请求：

```text
明确调用 wai-sdxl-prompt-builder，只构建并校验 WAI-illustrious-SDXL Prompt，不生成图片。画面是一名成年女性站在夜晚霓虹街道，正面半身构图。必须把普通光线 tag `(rim lighting:1.2)` 放入 lighting 位置；当前 Style 的画师提示词 `(say_hana:1.1)` 必须作为一个 artist 元素并逐字符保留 weight；其他没有竞争的 tag 保持未加权。严格读取 prompt-weight-policy.json 与 prompt-weighting.md，并调用 Skill 规定的校验器。
{"type":"comfyui-context","data":{"kind":"style","id":"weight-case-3","name":"weighted say hana","prompt_text":"(say_hana:1.1)"}}
```

- 预期：用户明确权重 `(rim lighting:1.2)` 位于 `lighting`；合法 UI Style 来源权重 `(say_hana:1.1)` 位于 `artist`；两个合法数值均逐字符保留；默认质量段与其他 tag 未加权。
- Agent 实际读取的 Skill 文件：
  - `.agents/skills/wai-sdxl-prompt-builder/SKILL.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/input-contract.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/composition-scenario-branches.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/composition-decision-tree.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/visual-design-slot-order.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/wai-prompt-position-order.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/action-structure.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/prompt-position-rules/{quality,artist,subject,appearance,outfit,action,expression-reaction,camera-composition,environment,detail-mood,lighting}.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/prompt-conflict-rules.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/prompt-weight-policy.json`
  - `.agents/skills/wai-sdxl-prompt-builder/references/prompt-weighting.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/prompt-self-check.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/prompt-format-validator.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/wai-artist-syntax.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/artist-adoption.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/examples/single-subject-portrait.md`
  - `.agents/skills/wai-sdxl-prompt-builder/references/semantic-tool-orchestration.md`
  - `.agents/skills/wai-sdxl-prompt-builder/scripts/validate-output.mjs`
- 实际调用表面：Bash Tool Call。
- 实际 `script_path`：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-weighted-tags/.local/desktop-development/home/.agents/skills/wai-sdxl-prompt-builder/scripts/validate-output.mjs`。
- 标准输入：

```json
{"positions":{"quality":["masterpiece","best quality","ultra-detailed","highres"],"artist":["(say_hana:1.1)"],"subject":["1girl","adult"],"appearance":["long hair","brown eyes","pale skin"],"outfit":["black leather jacket","white blouse","black skirt"],"action":["standing","facing the camera"],"expression_reaction":["looking at the camera","calm expression"],"camera_composition":["upper body","front view","centered composition"],"environment":["night","city street","neon signs","neon lights"],"detail_mood":["cinematic","night atmosphere"],"lighting":["(rim lighting:1.2)","neon lighting","colorful lighting"]},"display_text":"已生成成年女性夜晚霓虹街道正面半身构图 WAI-illustrious-SDXL 提示词。"}
```

- 退出码：0。
- stdout：

```text
{"kind":"noobai_assistant_prompt","result":"success","contract_version":"1.0.0","prompt_text":"masterpiece, best quality, ultra-detailed, highres, (say_hana:1.1), 1girl, adult, long hair, brown eyes, pale skin, black leather jacket, white blouse, black skirt, standing, facing the camera, looking at the camera, calm expression, upper body, front view, centered composition, night, city street, neon signs, neon lights, cinematic, night atmosphere, (rim lighting:1.2), neon lighting, colorful lighting","display_text":"已生成成年女性夜晚霓虹街道正面半身构图 WAI-illustrious-SDXL 提示词。"}
EXIT=0
```

- stderr：空。
- 实际 `prompt_text`：`masterpiece, best quality, ultra-detailed, highres, (say_hana:1.1), 1girl, adult, long hair, brown eyes, pale skin, black leather jacket, white blouse, black skirt, standing, facing the camera, looking at the camera, calm expression, upper body, front view, centered composition, night, city street, neon signs, neon lights, cinematic, night atmosphere, (rim lighting:1.2), neon lighting, colorful lighting`。
- 结论：通过。合法 UI Style 来源画师权重与用户明确 lighting tag 权重同时通过，两个来源的 weight 原文均被保留，默认质量段与其余 tag 未加权。

### W3 后置语义修复复验

- 复验时间：2026-09-01 18:21:35 CST 至 18:21:54 CST。
- 复验原因：后置 Semantic Reviewer 发现初版记录把合法 UI Style 来源画师权重误写为用户明确权重。计划执行者修正来源定义后，使用相同 WAI Session 原样重新提交 W3 请求。
- 配置：`ComfyUI工作台预设`；Provider `opencode-go`；模型 `deepseek-v4-flash`；推理等级 `Default`。
- 完整用户请求：

```text
明确调用 wai-sdxl-prompt-builder，只构建并校验 WAI-illustrious-SDXL Prompt，不生成图片。画面是一名成年女性站在夜晚霓虹街道，正面半身构图。必须把普通光线 tag `(rim lighting:1.2)` 放入 lighting 位置；当前 Style 的画师提示词 `(say_hana:1.1)` 必须作为一个 artist 元素并逐字符保留 weight；其他没有竞争的 tag 保持未加权。严格读取 prompt-weight-policy.json 与 prompt-weighting.md，并调用 Skill 规定的校验器。
{"type":"comfyui-context","data":{"kind":"style","id":"weight-case-3","name":"weighted say hana","prompt_text":"(say_hana:1.1)"}}
```

- Agent 实际重新读取的 Skill 文件：`.agents/skills/wai-sdxl-prompt-builder/references/prompt-weight-policy.json` 与 `.agents/skills/wai-sdxl-prompt-builder/references/prompt-weighting.md`。
- Agent 实际来源判定：`artist` 元素 `(say_hana:1.1)` 来自合法 UI Style；`lighting` 元素 `(rim lighting:1.2)` 来自用户明确权重；其他无竞争 tag 保持未加权。
- 实际调用表面：Bash Tool Call。
- 实际工作目录：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-weighted-tags/.local/desktop-development/home/.agents/skills/wai-sdxl-prompt-builder/scripts`。
- 实际 `script_path`：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-weighted-tags/.local/desktop-development/home/.agents/skills/wai-sdxl-prompt-builder/scripts/validate-output.mjs`。
- 实际 Bash 命令：`echo '<标准输入 JSON>' | node validate-output.mjs; echo "EXIT=$?"`。
- 标准输入：

```json
{"positions":{"quality":["masterpiece","best quality","ultra-detailed","highres"],"artist":["(say_hana:1.1)"],"subject":["1girl","adult"],"appearance":["long hair","brown eyes","pale skin"],"outfit":["black leather jacket","white blouse","black skirt"],"action":["standing","facing the camera"],"expression_reaction":["looking at the camera","calm expression"],"camera_composition":["upper body","front view","centered composition"],"environment":["night","city street","neon signs","neon lights"],"detail_mood":["cinematic","night atmosphere"],"lighting":["(rim lighting:1.2)","neon lighting","colorful lighting"]},"display_text":"已生成成年女性夜晚霓虹街道正面半身构图 WAI-illustrious-SDXL 提示词。"}
```

- 退出码：0。
- stdout：

```text
{"kind":"noobai_assistant_prompt","result":"success","contract_version":"1.0.0","prompt_text":"masterpiece, best quality, ultra-detailed, highres, (say_hana:1.1), 1girl, adult, long hair, brown eyes, pale skin, black leather jacket, white blouse, black skirt, standing, facing the camera, looking at the camera, calm expression, upper body, front view, centered composition, night, city street, neon signs, neon lights, cinematic, night atmosphere, (rim lighting:1.2), neon lighting, colorful lighting","display_text":"已生成成年女性夜晚霓虹街道正面半身构图 WAI-illustrious-SDXL 提示词。"}
EXIT=0
```

- stderr：空。
- 实际 `prompt_text`：`masterpiece, best quality, ultra-detailed, highres, (say_hana:1.1), 1girl, adult, long hair, brown eyes, pale skin, black leather jacket, white blouse, black skirt, standing, facing the camera, looking at the camera, calm expression, upper body, front view, centered composition, night, city street, neon signs, neon lights, cinematic, night atmosphere, (rim lighting:1.2), neon lighting, colorful lighting`。
- 结论：通过。模型在修正后的语义定义下明确区分两个来源，重新读取规范并再次生成相同的合法 Prompt；校验器返回 `result: success` 和退出码 0。

## 用例 W4：WAI 中性、主要、辅助画师与去重

- 执行时间：2026-09-01 18:05:01 CST 至 18:06:44 CST。
- 配置：`ComfyUI工作台预设`；Provider `opencode-go`；模型 `deepseek-v4-flash`；推理等级 `Default`。
- 完整用户请求：

```text
继续明确调用 wai-sdxl-prompt-builder，只构建并校验 Prompt，不生成图片。画面是一名成年女性站在白色摄影棚中，正面半身构图。采用当前四条 Style 记录：把 fukahire 定义为中性画师，把 say_hana 定义为主要画师，把 alzi xiaomi 定义为辅助画师；第四条是 say_hana 的重复来源。先解析并记录 payload、删除重复画师，再只生成一次最终权重外层。中性画师必须保持未加权，主要与辅助画师必须分别读取 WAI 策略的 light 与 deemphasis 数值并形成不同权重；其他 tag 保持未加权。重新读取权重策略与方法并调用校验器。
{"type":"comfyui-context","data":{"kind":"style","id":"weight-case-4-neutral","name":"neutral fukahire","prompt_text":"fukahire"}}
{"type":"comfyui-context","data":{"kind":"style","id":"weight-case-4-primary","name":"primary say hana","prompt_text":"say_hana"}}
{"type":"comfyui-context","data":{"kind":"style","id":"weight-case-4-auxiliary","name":"auxiliary alzi xiaomi","prompt_text":"alzi xiaomi"}}
{"type":"comfyui-context","data":{"kind":"style","id":"weight-case-4-duplicate","name":"duplicate say hana","prompt_text":"artist:say_hana"}}
```

- 预期：规范化后删除重复 `say_hana`；中性 `fukahire` 保持裸 payload；主要 `say_hana` 读取 `recommendations.levels.light`；辅助 `alzi xiaomi` 读取 `recommendations.levels.deemphasis`；最终只生成一层外层。
- Agent 本轮实际重新读取的 Skill 文件：`.agents/skills/wai-sdxl-prompt-builder/references/prompt-weight-policy.json` 与 `.agents/skills/wai-sdxl-prompt-builder/references/prompt-weighting.md`；其他规则沿用同一 Session 已加载内容。
- 实际调用表面：Bash Tool Call。
- 实际 `script_path`：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-weighted-tags/.local/desktop-development/home/.agents/skills/wai-sdxl-prompt-builder/scripts/validate-output.mjs`。
- 标准输入：

```json
{"positions":{"quality":["masterpiece","best quality","ultra-detailed","highres"],"artist":["(say_hana:1.1)","fukahire","(alzi xiaomi:0.8)"],"subject":["1girl","adult"],"appearance":["long hair","brown eyes","pale skin"],"outfit":["black leather jacket","white blouse","black skirt"],"action":["standing","facing the camera"],"expression_reaction":["looking at the camera","calm expression"],"camera_composition":["upper body","front view","centered composition"],"environment":["white photo studio","white seamless backdrop"],"detail_mood":["clean atmosphere"],"lighting":["soft studio lighting","bright lighting","even lighting"]},"display_text":"已生成成年女性白色摄影棚正面半身构图 WAI-illustrious-SDXL 提示词。"}
```

- 退出码：0。
- stdout：

```text
{"kind":"noobai_assistant_prompt","result":"success","contract_version":"1.0.0","prompt_text":"masterpiece, best quality, ultra-detailed, highres, (say_hana:1.1), fukahire, (alzi xiaomi:0.8), 1girl, adult, long hair, brown eyes, pale skin, black leather jacket, white blouse, black skirt, standing, facing the camera, looking at the camera, calm expression, upper body, front view, centered composition, white photo studio, white seamless backdrop, clean atmosphere, soft studio lighting, bright lighting, even lighting","display_text":"已生成成年女性白色摄影棚正面半身构图 WAI-illustrious-SDXL 提示词。"}
EXIT=0
```

- stderr：空。
- 实际 `prompt_text`：`masterpiece, best quality, ultra-detailed, highres, (say_hana:1.1), fukahire, (alzi xiaomi:0.8), 1girl, adult, long hair, brown eyes, pale skin, black leather jacket, white blouse, black skirt, standing, facing the camera, looking at the camera, calm expression, upper body, front view, centered composition, white photo studio, white seamless backdrop, clean atmosphere, soft studio lighting, bright lighting, even lighting`。
- 结论：通过。重复来源被删除，主要、中性和辅助画师分别形成显式轻度强调、未加权和显式减弱三种结果，没有双重外层。

## 用例 A5：ANIMA 无竞争内容保持未加权

- 执行时间：2026-09-01 18:05:47 CST 至 18:09:25 CST。
- 配置：`ComfyUI工作台预设`；Provider `opencode-go`；模型 `deepseek-v4-flash`；推理等级 `Default`。
- 完整用户请求：

```text
继续明确调用 anima-prompt-builder，只构建并校验 ANIMA3 Prompt，不生成图片。画面是一名成年女性穿简洁连衣裙站在白色摄影棚中，正面半身构图并自然微笑。用户没有指定任何优先级、竞争内容或权重；必须按照槽位权重方法让全部没有竞争的普通 tag 保持未加权，不能为了填满槽位机械增加括号或数值权重。重新读取 prompt-weight-policy.json 与 prompt-weighting.md，并调用 Skill 规定的校验器。
```

- 预期：固定质量段和普通 tag 均保持未加权；Skill 不为各槽机械生成权重；无画师输入按照 ANIMA 自身语义 Style 流程处理。
- Agent 本轮实际重新读取的 Skill 文件：A1 的十个固定参考文件，以及 `.agents/skills/anima-prompt-builder/references/semantic-query-interfaces.md`。Agent 通过语义 Style 查询采用未加权 `lpip`，并执行同一 Session 已加载的校验脚本。
- 实际调用表面：Bash Tool Call。
- 实际 `script_path`：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-weighted-tags/.local/desktop-development/home/.agents/skills/anima-prompt-builder/scripts/validate-output.mjs`。
- 标准输入：

```json
{
  "slots": {
    "quality": ["masterpiece", "best quality", "score_7", "highres", "safe"],
    "artist_style": ["@lpip"],
    "count_gender": ["1girl", "solo"],
    "character_series": [],
    "appearance": ["mature female", "long hair", "blue eyes", "fair skin"],
    "clothing_state": ["dress"],
    "pose_action_sex": ["standing", "arms at sides"],
    "expression_reaction": ["direct eye contact", "smile"],
    "camera_shot": ["upper body", "from front", "facing viewer"],
    "scene_environment": ["white background", "simple background", "indoors"],
    "detail_mood": [],
    "natural_language": []
  },
  "display_text": "画面是一名成年女性身穿简洁连衣裙，正面半身构图站在白色摄影棚中，自然微笑注视镜头。"
}
```

- 退出码：0。
- stdout：

```json
{"kind":"noobai_assistant_prompt","result":"success","contract_version":"1.0.0","prompt_text":"masterpiece, best quality, score_7, highres, safe, @lpip, 1girl, solo, mature female, long hair, blue eyes, fair skin, dress, standing, arms at sides, direct eye contact, smile, upper body, from front, facing viewer, white background, simple background, indoors","display_text":"画面是一名成年女性身穿简洁连衣裙，正面半身构图站在白色摄影棚中，自然微笑注视镜头。"}
```

- stderr：空。
- 实际 `prompt_text`：`masterpiece, best quality, score_7, highres, safe, @lpip, 1girl, solo, mature female, long hair, blue eyes, fair skin, dress, standing, arms at sides, direct eye contact, smile, upper body, from front, facing viewer, white background, simple background, indoors`。
- 结论：通过。语义采用的画师与全部普通 tag 均未加权，没有括号或数值权重。

## 用例 W6：WAI 无画师且无竞争内容保持未加权

- 执行时间：2026-09-01 18:07:06 CST 至 18:07:40 CST。
- 配置：`ComfyUI工作台预设`；Provider `opencode-go`；模型 `deepseek-v4-flash`；推理等级 `Default`。
- 完整用户请求：

```text
继续明确调用 wai-sdxl-prompt-builder，只构建并校验 WAI-illustrious-SDXL Prompt，不生成图片。画面是一名成年女性穿简洁连衣裙站在白色摄影棚中，正面半身构图并自然微笑。本用例明确不采用画师或 Style，artist 位置留空；用户没有指定优先级、竞争内容或权重。必须让默认质量段和全部没有竞争的普通 tag 保持未加权，不能为了每个位置机械增加括号或数值权重。重新读取 prompt-weight-policy.json 与 prompt-weighting.md，并调用 Skill 规定的校验器。
```

- 预期：不创建 `artist`；默认质量段和全部普通 tag 保持未加权；不为每个位置机械生成权重。
- Agent 本轮实际重新读取的 Skill 文件：`.agents/skills/wai-sdxl-prompt-builder/references/prompt-weight-policy.json` 与 `.agents/skills/wai-sdxl-prompt-builder/references/prompt-weighting.md`；其他规则沿用同一 Session 已加载内容。
- 实际调用表面：Bash Tool Call。
- 实际 `script_path`：`/Volumes/4Tdisk/work/AI2/harness-comfyui-plan-weighted-tags/.local/desktop-development/home/.agents/skills/wai-sdxl-prompt-builder/scripts/validate-output.mjs`。
- 标准输入：

```json
{"positions":{"quality":["masterpiece","best quality","ultra-detailed","highres"],"subject":["1girl","adult"],"appearance":["long hair","brown eyes","pale skin"],"outfit":["simple dress"],"action":["standing","facing the camera"],"expression_reaction":["natural smile","looking at the camera"],"camera_composition":["upper body","front view","centered composition"],"environment":["white photo studio","white seamless backdrop"],"detail_mood":["clean atmosphere"],"lighting":["soft studio lighting","bright lighting","even lighting"]},"display_text":"已生成成年女性白色摄影棚简洁连衣裙正面半身构图 WAI-illustrious-SDXL 提示词。"}
```

- 退出码：0。
- stdout：

```text
{"kind":"noobai_assistant_prompt","result":"success","contract_version":"1.0.0","prompt_text":"masterpiece, best quality, ultra-detailed, highres, 1girl, adult, long hair, brown eyes, pale skin, simple dress, standing, facing the camera, natural smile, looking at the camera, upper body, front view, centered composition, white photo studio, white seamless backdrop, clean atmosphere, soft studio lighting, bright lighting, even lighting","display_text":"已生成成年女性白色摄影棚简洁连衣裙正面半身构图 WAI-illustrious-SDXL 提示词。"}
EXIT=0
```

- stderr：空。
- 实际 `prompt_text`：`masterpiece, best quality, ultra-detailed, highres, 1girl, adult, long hair, brown eyes, pale skin, simple dress, standing, facing the camera, natural smile, looking at the camera, upper body, front view, centered composition, white photo studio, white seamless backdrop, clean atmosphere, soft studio lighting, bright lighting, even lighting`。
- 结论：通过。`artist` 没有创建，默认质量段与全部普通 tag 均保持未加权。

## 总结与 Desktop 停止状态

| 用例 | 结论 | 关键证据 |
| --- | --- | --- |
| A1 | 通过 | `(chibi:2)`、`@fukahire`、`(@say_hana:2)` 同时通过 |
| A2 | 通过 | Style 分段空白、单个 `@` 和来源 weight `2` 保留 |
| W3 | 通过 | `(say_hana:1.1)` 与 `(rim lighting:1.2)` 同时通过 |
| W4 | 通过 | 主要 `1.1`、中性裸 payload、辅助 `0.8`，重复来源删除 |
| A5 | 通过 | `@lpip` 与全部普通 tag 均未加权 |
| W6 | 通过 | `artist` 留空，默认质量段与全部普通 tag 均未加权 |

六个用例完成后，计划执行者执行 `pnpm dev:stop`，命令返回 `{"status":"stopped","pid":11266}`；随后执行 `pnpm dev:status`，命令返回 `{"status":"stopped"}`。开发 Desktop 前台进程因该受管停止收到 `SIGTERM`，开发端口已经释放。
