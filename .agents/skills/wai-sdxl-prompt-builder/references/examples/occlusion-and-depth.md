# 遮挡与深度完整示例

## 用途和读取时机

Skill Agent 为遮挡与深度主场景生成的三个候选都不能明确遮挡者、被遮挡者、景深层级和可见部分时，读取本文件，然后重新设计三个候选。

## 用户要求

从半开的门外看见房间里的女性，门框遮住她的左肩，但脸和右手中的钥匙必须清楚可见。

## 选定画面

相机位于门外。门框占据前景，女性位于房间中景，室内家具位于背景；焦点落在脸和钥匙上。

## 位置内容

| 位置 | 英文内容 |
|---|---|
| `quality` | `masterpiece, best quality, ultra-detailed, highres` |
| `subject` | `1woman` |
| `camera_composition` | `medium shot from outside the doorway, foreground doorframe occluding her left shoulder, face and right hand fully visible and in focus, room interior in the background` |
| `environment` | `half-open wooden door, doorway, quiet room, desk and shelves in the background` |

## 最终英文 Prompt 示例

```text
masterpiece, best quality, ultra-detailed, highres, 1woman, medium shot from outside the doorway, foreground doorframe occluding her left shoulder, face and right hand fully visible and in focus, room interior in the background, half-open wooden door, doorway, quiet room, desk and shelves in the background
```
