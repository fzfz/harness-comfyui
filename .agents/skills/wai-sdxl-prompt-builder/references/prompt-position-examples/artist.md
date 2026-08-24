# `artist` 位置示例

## 用途和读取时机

Skill Agent 读取 [`artist` 位置规则](../prompt-position-rules/artist.md)和[WAI 画师语法](../wai-artist-syntax.md)后仍不能确定画师格式时，读取本文件。

采用画师 `fukahire`，没有主次要求：

```text
(fukahire:1.0)
```

采用一名主要画师和一名辅助画师：

```text
(fukahire:1.1), (alzi xiaomi:0.8)
```
