# `action` 位置示例

## 用途和读取时机

Skill Agent 读取 [`action` 位置规则](../prompt-position-rules/action.md)和[动作结构](../action-structure.md)后仍不能确定动作内容时，读取本文件。

一名女性把信递给一名男性，男性伸手接信：

```text
woman handing a letter to the man, man reaching out to receive it
```

动作主体与目标仍不清楚时，在 `relation_narrative` 中补充完整关系句。
