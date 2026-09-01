# `artist` 位置示例

## 用途和读取时机

Skill Agent 读取 [`artist` 位置规则](../prompt-position-rules/artist.md)、[WAI 画师语法](../wai-artist-syntax.md)和 `../prompt-weight-policy.json` 后仍不能确定画师格式时，读取本文件。

采用中性画师 `fukahire`：

```text
fukahire
```

采用一名主要画师和一名辅助画师时，Skill Agent 按下表取得数值：

| 画师 | 读取属性 |
| --- | --- |
| 主要画师 `fukahire` | `recommendations.levels.light` |
| 辅助画师 `alzi xiaomi` | `recommendations.levels.deemphasis` |

Skill Agent 读取两个属性的数值后，分别生成两个 `(payload:weight)` 数组元素。属性路径只用于读取策略，不能作为 weight 文本写入最终 Prompt。
