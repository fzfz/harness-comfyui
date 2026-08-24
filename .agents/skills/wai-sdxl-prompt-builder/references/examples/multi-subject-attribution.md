# 多主体群像完整示例

## 用途和读取时机

Skill Agent 为多主体群像生成的三个候选都不能让每名主体的身份、位置和动作保持唯一归属时，读取本文件，然后重新设计三个候选。

## 用户要求

三名博物馆工作人员布置展厅：左侧女性挂画，中间男性记录编号，右侧女性指向入口地图。

## 选定画面

使用广角全身镜头。三名主体分别位于左、中、右中景，每人具有不同外貌锚点、道具和动作目标。

## 位置内容

| 位置 | 英文内容 |
|---|---|
| `quality` | `masterpiece, best quality, ultra-detailed, highres` |
| `subject` | `2girls, 1boy` |
| `appearance` | `red-haired woman, black-haired man with glasses, silver-haired woman` |
| `outfit` | `museum staff uniforms, picture frame, clipboard, entrance map` |
| `action` | `hanging a picture frame, writing an exhibit number, pointing to a map` |
| `expression_reaction` | `concentrated expression, careful gaze, instructive expression` |
| `camera_composition` | `wide full-body shot, three subjects separated across the frame, clear left-center-right layout` |
| `environment` | `museum gallery, white walls, framed artworks, display lights, entrance sign` |
| `detail_mood` | `orderly preparation, subtle working motion, professional atmosphere` |
| `lighting` | `neutral gallery lighting, soft shadows, even subject separation` |
| `relation_narrative` | `The red-haired woman hangs the frame on the left, the black-haired man records its number in the center, and the silver-haired woman points to the entrance map on the right.` |

## 最终英文 Prompt 示例

```text
masterpiece, best quality, ultra-detailed, highres, 2girls, 1boy, red-haired woman, black-haired man with glasses, silver-haired woman, museum staff uniforms, picture frame, clipboard, entrance map, hanging a picture frame, writing an exhibit number, pointing to a map, concentrated expression, careful gaze, instructive expression, wide full-body shot, three subjects separated across the frame, clear left-center-right layout, museum gallery, white walls, framed artworks, display lights, entrance sign, orderly preparation, subtle working motion, professional atmosphere, neutral gallery lighting, soft shadows, even subject separation, The red-haired woman hangs the frame on the left, the black-haired man records its number in the center, and the silver-haired woman points to the entrance map on the right.
```
