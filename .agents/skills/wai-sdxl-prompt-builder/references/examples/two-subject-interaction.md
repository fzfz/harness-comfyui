# 双主体互动完整示例

## 用途和读取时机

Skill Agent 为双主体互动生成的三个候选都不能明确两名主体的动作、位置和关系时，读取本文件，然后重新设计三个候选。

## 用户要求

雨中，左侧女性把透明雨伞递给右侧男性，男性伸手接住。

## 选定画面

使用全身侧面镜头。两名主体位于同一中景，雨伞处于两人之间，手部交接点为主焦点。

## 位置内容

| 位置 | 英文内容 |
|---|---|
| `quality` | `masterpiece, best quality, ultra-detailed, highres` |
| `subject` | `1girl, 1boy` |
| `appearance` | `woman with short red hair, man with black hair` |
| `outfit` | `woman in a beige coat, man in a dark raincoat, transparent umbrella` |
| `action` | `woman handing over the umbrella, man reaching out to receive it` |
| `expression_reaction` | `gentle smile, attentive expression, both looking at the umbrella` |
| `camera_composition` | `full body, side view, woman on the left, man on the right, hands in focus` |
| `environment` | `rainy station entrance, wet pavement, blurred commuters in the background` |
| `detail_mood` | `soft rain streaks, subtle motion, warm and considerate atmosphere` |
| `lighting` | `cool rainy daylight, soft reflections, gentle backlight` |
| `relation_narrative` | `The woman on the left hands the umbrella to the man on the right as he reaches to receive it.` |

## 最终英文 Prompt 示例

```text
masterpiece, best quality, ultra-detailed, highres, 1girl, 1boy, woman with short red hair, man with black hair, woman in a beige coat, man in a dark raincoat, transparent umbrella, woman handing over the umbrella, man reaching out to receive it, gentle smile, attentive expression, both looking at the umbrella, full body, side view, woman on the left, man on the right, hands in focus, rainy station entrance, wet pavement, blurred commuters in the background, soft rain streaks, subtle motion, warm and considerate atmosphere, cool rainy daylight, soft reflections, gentle backlight, The woman on the left hands the umbrella to the man on the right as he reaches to receive it.
```
