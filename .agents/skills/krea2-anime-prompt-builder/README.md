# Krea2 Anime Prompt Builder

`krea2-anime-prompt-builder` 根据自然语言画面要求、当前消息中的 Character/Style 选择、构建过程中采用的语义目录结果和可选历史 Generation Run，构建一条可直接输入 Krea2 的动漫 Prompt。Builder 支持角色展示图与舞蹈或姿态迁移源图；构建 Prompt 时可以查询作品、角色、Krea2 画师风格和 Prompt 词条，也可以独立查询历史 Run 的原始生成参数与 Actual Workflow。

## Builder 输出

- 展示路线输出一条完整动漫画面 Prompt，允许用户指定自由姿态、镜头和构图。
- 动作迁移路线输出一条垂直全身源图 Prompt，要求四肢轮廓、鞋履、人物比例和静态背景满足迁移约束。
- 历史查询路线完全采用现有 `generation run-inputs --stdin` 的 `runs[]` 行为：保持输入顺序，可用项返回 canonical 完整 Run ID，错误项保留请求 Run ID，逐项错误不阻断其余结果。
- 成功构建 Prompt 时，最终回答直接以画面描述开头，只包含一个 Prompt 正文段落。Prompt 正文不附带“已读取资料”或“完成自检”等引导句、负向 Prompt、候选方案、路线说明、参数建议或制作备注。历史纯查询、缺少输入和冲突停止分支继续返回各自合同规定的信息。

## 输入来源

Builder 按以下优先级采用内容：

1. 当前用户普通文字中的明确要求、修改、排除和路线要求；
2. 用户明确选定的历史正向 Prompt；
3. 当前消息中 Character/Style 记录的 `data.prompt_text`；
4. 通过 `imagegen-semantic-query` 采用的角色、画师和 Prompt 词条；
5. 与画面主题对应的 Skill 内参考资料；
6. Krea2 动漫默认设计。

Character/Style 记录已经提供非空 `data.prompt_text` 时，Builder 直接采用该字段。该字段为空时，名称、所属作品和 ID 只用于语义目录查询与候选消歧；只有被采用查询结果的 `prompt_text` 会产生对应角色或画师内容。

## Skill 文件

| 文件 | 用途 |
| --- | --- |
| `SKILL.md` | Builder 的查询、复用、构建、冲突处理和完成流程。 |
| `agents/openai.yaml` | Skill 列表中的显示名称、简述和默认调用文本。 |
| `references/input-contract.md` | 当前普通文字与 Character/Style 上下文的输入合同。 |
| `references/krea2-prompt-rules.md` | 单条 Krea2 动漫 Prompt 的内容顺序、路线和自检规则。 |
| `references/motion-migration-constraints.md` | 动作迁移源图的垂直构图、鞋履、比例和背景约束。 |
| `references/semantic-query-cli.md` | 作品、角色、Krea2 底模画师风格和 Prompt 词条的只读语义目录 CLI 合同。 |
| `references/generation-cli.md` | 历史 Generation Run 只读查询的 managed CLI 合同。 |

Builder 只在当前画面需要对应内容时读取 `references/anime-style-presets.md` 和 `references/游戏服装多样性库.md`。动漫风格资料只提供渲染媒介、线条、上色、明暗、纹理和配色；游戏服装资料只提供服装剪裁、服装部件、材质、穿戴配饰和色板。两份条件资料中的背景、姿态、动作迁移、人物比例、构图、镜头、防裁切和鞋履说明不参与 Builder 执行。`references/krea2-prompt-rules.md` 与 `references/motion-migration-constraints.md` 定义 Builder 的背景、姿态、比例、构图和鞋履合同。`references/` 中其他国风素材、背景、服装与背景联合索引、Danbooru 标签和既有数据词库作为保留资产存在，不属于 Builder 的执行资料来源。

## 既有批量资产边界

`scripts/gen_anime_v1.py` 是保留的旧式英文标签批量资产，`scripts/selftest.py` 只检查该资产。Krea2 Anime Prompt Builder 不调用这些脚本，不创建批量输出目录，也不覆盖提示词文件。

## 典型请求

```text
使用 $krea2-anime-prompt-builder 设计一条国风龙女全身展示 Prompt，青玉配色，鞋履完整入镜，背景是月下琉璃宫殿。
```

```text
使用 $krea2-anime-prompt-builder 把 run_3c0ad3ed 的正向 Prompt 改成舞蹈动作迁移源图，保留角色和服装。
```
