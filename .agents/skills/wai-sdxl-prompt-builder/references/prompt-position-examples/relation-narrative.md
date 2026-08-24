# `relation_narrative` 位置示例

## 用途和读取时机

Skill Agent 读取 [`relation_narrative` 位置规则](../prompt-position-rules/relation-narrative.md)后仍不能用短句消除关系歧义时，读取本文件。

两名主体交接同一把伞：

```text
The woman on the left hands the umbrella to the man on the right as he reaches to receive it.
```

前后状态分镜：

```text
The left panel shows the chair before repair, while the right panel shows the same chair fully repaired.
```

短句始终位于全部标签之后。
