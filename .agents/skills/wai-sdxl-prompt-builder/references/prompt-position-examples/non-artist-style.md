# `non_artist_style` 位置示例

## 用途和读取时机

Skill Agent 读取 [`non_artist_style` 位置规则](../prompt-position-rules/non-artist-style.md)后仍不能确定普通画风或媒介风格时，读取本文件。

用户要求水彩插画和赛璐璐上色：

```text
watercolor illustration, cel shading
```

具体画师不进入本位置；纸张颗粒等当前画面质感进入 `detail_mood`。
