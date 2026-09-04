## 13. 画面细节与氛围

本章用于构造 `detail_mood` 槽位。该槽位描述画面媒介与色彩范围、运动表现、成像与后期效果、故障与显示介质效果、数字图形，以及整体视觉风格与情绪氛围。

### 13.1 构造顺序与数量

Skill 执行者按以下顺序构造 `detail_mood`：

1. 用户明确要求画面媒介或色彩范围时，按第 13.2 节选择一个标签。
2. 用户明确要求运动表现时，按第 13.3 节选择一个标签。
3. 用户明确要求成像或后期效果时，按第 13.4 节选择一个标签。
4. 用户明确要求故障或显示介质效果时，按第 13.5 节选择一个标签。
5. 用户明确要求数字图形时，按第 13.6 节选择一个标签。
6. 用户明确要求整体视觉风格或情绪氛围时，按第 13.7 节选择一个标签。
7. Skill 执行者只记录能够与第 13.2 节至第 13.7 节表格行直接对应的要求。全部要求处理完成后仍没有标签时，Skill 执行者使用 `cinematic`。

每类最多选择一个标签。用户在同一类别中提出多个要求时，Skill 执行者采用用户最后提出的要求。`detail_mood` 最终包含一至六个标签，并按上述类别顺序排列。

### 13.2 画面媒介与色彩范围

| 用户要求的画面媒介或色彩范围 | 标签 |
|---|---|
| 墨迹飞溅 | `ink splash` |
| 水墨晕染 | `ink wash` |
| 书法笔触 | `calligraphic brushstrokes` |
| 水彩纸张或颜料纹理 | `watercolor texture` |
| 漫画式绘制 | `comic-style` |
| 半调网点 | `halftone dots` |
| 网点纸纹理 | `screentone patterns` |
| 素描 | `sketch` |
| 线稿 | `lineart` |
| 潦草排线阴影 | `scribbly shading` |
| 绘画式笔触 | `painterly` |
| 普通胶片颗粒 | `film grain` |
| 老式胶片颗粒 | `vintage film grain` |
| 大量胶片颗粒覆盖 | `heavy film grain overlay` |
| 胶片乳剂划痕 | `emulsion scratch` |
| 灰度画面 | `greyscale` |
| 局部保留颜色 | `spot color` |
| 有限色板 | `limited palette` |

### 13.3 运动表现

| 用户要求的运动表现 | 标签 |
|---|---|
| 漫画式动作线 | `motion lines` |
| 密集方向性速度线 | `speed lines` |
| 多层运动模糊残影 | `multiple overlapping motion blurs` |
| 动作残影 | `afterimages` |

### 13.4 成像与后期效果

| 用户要求的成像或后期效果 | 标签 |
|---|---|
| 人物或物体只显示轮廓 | `silhouette` |
| 整体柔焦 | `soft focus` |
| 画面边缘出现色彩分离 | `chromatic aberration` |
| 画面边缘渐暗 | `vignette` |
| 多个影像重叠 | `multiple exposure effect` |

### 13.5 故障与显示介质效果

| 用户要求的故障或显示介质效果 | 标签 |
|---|---|
| 数字画面错位或撕裂 | `digital glitch effects` |
| 故障艺术风格 | `glitch art` |
| VHS 画面扭曲 | `VHS distortion` |
| 录像磁迹错位 | `tracking errors` |
| 模拟视频扫描线 | `scan lines` |
| CRT 显示器扫描线 | `CRT scanlines` |

### 13.6 数字图形

| 用户要求的数字图形 | 标签 |
|---|---|
| 像素化轮廓 | `pixelated outlines` |
| 块状像素纹理 | `blocky pixelated texture` |
| 数据流视觉元素 | `data stream effects` |
| 二进制代码粒子 | `binary code particles` |

### 13.7 整体视觉风格与情绪氛围

| 用户要求的整体视觉风格或情绪氛围 | 标签 |
|---|---|
| 电影感 | `cinematic` |
| 戏剧张力 | `dramatic tension` |
| 空灵 | `ethereal` |
| 梦核 | `dreamcore` |
| 梦境感 | `dreamlike` |
| 暗黑 | `dark atmosphere` |
| 悬疑 | `suspenseful` |
| 不祥 | `ominous` |
| 诗意 | `poetic atmosphere` |
| 混乱 | `chaos` |

### 13.8 光线、光影与色调边界

Skill 执行者只从第 13.2 节至第 13.7 节选择 `detail_mood` 标签。`greyscale`、`spot color` 和 `limited palette` 仅表示第 13.2 节定义的色彩范围；Skill 执行者不向 `detail_mood` 增加其他光线、光影或色调标签。
