# `outfit` 位置示例

## 用途和读取时机

Skill Agent 读取 [`outfit` 位置规则](../prompt-position-rules/outfit.md)后仍不能确定服装、配饰或物件时，读取本文件。

主体穿着海军蓝羊毛大衣、白衬衫和皮靴：

```text
navy wool coat, white shirt, leather boots
```

主体正在脱下外套时，外套及敞开状态进入 `outfit`，脱下动作进入 `action`。
