# 分镜与状态变化完整示例

## 用途和读取时机

Skill Agent 为分镜与状态变化主场景生成的三个候选都不能明确画格内容、前后状态和跨格关系时，读取本文件，然后重新设计三个候选。

## 用户要求

横向两格分镜：左格显示木椅损坏，女性木匠正在检查；右格显示同一把木椅修好，她满意地擦拭椅背。

## 选定画面

两个等宽横向画格使用相同工作台、相同角色和相近镜头。左格使用冷色工作光，右格增加温暖补光，形成完成前后的状态对比。

## 位置内容

| 位置 | 英文内容 |
|---|---|
| `quality` | `masterpiece, best quality, ultra-detailed, highres` |
| `subject` | `1woman` |
| `appearance` | `short auburn hair, brown eyes` |
| `outfit` | `carpenter apron, rolled-up sleeves, work gloves, repair tools` |
| `action` | `left panel inspecting a broken chair, right panel wiping the repaired chair back` |
| `expression_reaction` | `left panel concerned focus, right panel satisfied smile` |
| `camera_composition` | `two-panel horizontal storyboard, matching medium shots, same workbench and chair position` |
| `environment` | `small carpentry workshop, wooden workbench, shelves of tools` |
| `detail_mood` | `left panel rough splinters and repair dust, right panel polished wood and orderly calm` |
| `lighting` | `continuous workshop light, cooler left panel, warmer right panel` |
| `relation_narrative` | `The left panel shows the chair broken before repair, while the right panel shows the same chair fully repaired by the same carpenter.` |

## 最终英文 Prompt 示例

```text
masterpiece, best quality, ultra-detailed, highres, 1woman, short auburn hair, brown eyes, carpenter apron, rolled-up sleeves, work gloves, repair tools, left panel inspecting a broken chair, right panel wiping the repaired chair back, left panel concerned focus, right panel satisfied smile, two-panel horizontal storyboard, matching medium shots, same workbench and chair position, small carpentry workshop, wooden workbench, shelves of tools, left panel rough splinters and repair dust, right panel polished wood and orderly calm, continuous workshop light, cooler left panel, warmer right panel, The left panel shows the chair broken before repair, while the right panel shows the same chair fully repaired by the same carpenter.
```
