# NSFW 完整示例

## 用途和读取时机

Skill Agent 为 NSFW 主场景生成的三个候选都不能明确主体姿态、身体接触、动作归属和镜头可见范围时，读取本文件，然后重新设计三个候选。

## 用户要求

成年女性跨坐在成年男性腿上，两人在卧室中接吻，女性用左手扶住男性肩膀。

## 选定画面

使用中景侧面镜头。女性位于前景，男性坐在床沿中景；接吻、跨坐姿态和左手接触点完整可见。

## 位置内容

| 位置 | 英文内容 |
|---|---|
| `quality` | `masterpiece, best quality, ultra-detailed, highres` |
| `subject` | `1woman, 1man, adults` |
| `appearance` | `woman with long black hair, man with short brown hair` |
| `outfit` | `open silk robe, unbuttoned white shirt` |
| `action` | `woman straddling the seated man, kissing, left hand resting on his shoulder, man holding her waist` |
| `expression_reaction` | `closed eyes, flushed cheeks, relaxed bodies` |
| `camera_composition` | `medium shot, side view, both faces and the hand on the shoulder visible, shallow depth of field` |
| `environment` | `private bedroom, bed edge, rumpled sheets, bedside table` |
| `detail_mood` | `soft fabric texture, intimate atmosphere, subtle breathing motion` |
| `lighting` | `warm bedside lamp, soft facial shadows, low contrast` |
| `relation_narrative` | `The woman straddles the seated man and kisses him while her left hand rests on his shoulder and his hands hold her waist.` |

## 最终英文 Prompt 示例

```text
masterpiece, best quality, ultra-detailed, highres, 1woman, 1man, adults, woman with long black hair, man with short brown hair, open silk robe, unbuttoned white shirt, woman straddling the seated man, kissing, left hand resting on his shoulder, man holding her waist, closed eyes, flushed cheeks, relaxed bodies, medium shot, side view, both faces and the hand on the shoulder visible, shallow depth of field, private bedroom, bed edge, rumpled sheets, bedside table, soft fabric texture, intimate atmosphere, subtle breathing motion, warm bedside lamp, soft facial shadows, low contrast, The woman straddles the seated man and kisses him while her left hand rests on his shoulder and his hands hold her waist.
```
