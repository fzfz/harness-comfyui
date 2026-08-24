# 动作展示完整示例

## 用途和读取时机

Skill Agent 为动作展示生成的三个候选都不能同时显示动作路径、动作目标和镜头焦点时，读取本文件，然后重新设计三个候选。

## 用户要求

芙丽莲背对镜头举起法杖，对着前方空中的魔族蓄积法焰。

## 选定画面

使用中远景和后方三分之二视角。芙丽莲位于前景中央，魔族位于上方中景，法杖连接两者的动作方向，法杖尖端是主焦点。

## 位置内容

| 位置 | 英文内容 |
|---|---|
| `quality` | `masterpiece, best quality, ultra-detailed, highres` |
| `subject` | `1girl, 1demon` |
| `character` | `frieren, sousou no frieren, 1girl, green eyes, long hair, white hair, grey hair, twintails, parted bangs, white capelet, long sleeves, earrings, elf` |
| `appearance` | `small horned demon, dark wings` |
| `outfit` | `wooden magic staff` |
| `action` | `standing with her back to the camera, raising the staff toward the airborne demon, charging a spell at the staff tip` |
| `expression_reaction` | `focused posture, demon watching the growing spell` |
| `camera_composition` | `medium-wide shot, rear three-quarter view, Frieren in the foreground, demon in the upper midground, staff tip in focus` |
| `environment` | `forest clearing, broken branches, night sky` |
| `detail_mood` | `swirling magic particles, rising dust, tense magical confrontation` |
| `lighting` | `cool moonlight, bright blue spell light, sharp rim light, high contrast` |
| `relation_narrative` | `Frieren aims the raised staff at the airborne demon while the spell gathers at its tip.` |

`subject` 中的 `1girl, 1demon` 表达整幅画面的主体数量和类别；`character` 中的 `1girl` 属于完整角色来源内容。该重复符合 Character 来源内容规则。

## 最终英文 Prompt 示例

```text
masterpiece, best quality, ultra-detailed, highres, 1girl, 1demon, frieren, sousou no frieren, 1girl, green eyes, long hair, white hair, grey hair, twintails, parted bangs, white capelet, long sleeves, earrings, elf, small horned demon, dark wings, wooden magic staff, standing with her back to the camera, raising the staff toward the airborne demon, charging a spell at the staff tip, focused posture, demon watching the growing spell, medium-wide shot, rear three-quarter view, Frieren in the foreground, demon in the upper midground, staff tip in focus, forest clearing, broken branches, night sky, swirling magic particles, rising dust, tense magical confrontation, cool moonlight, bright blue spell light, sharp rim light, high contrast, Frieren aims the raised staff at the airborne demon while the spell gathers at its tip.
```
