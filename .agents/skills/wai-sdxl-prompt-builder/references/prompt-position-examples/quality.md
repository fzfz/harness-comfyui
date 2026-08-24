# `quality` 位置示例

## 用途和读取时机

Skill Agent 读取 [`quality` 位置规则](../prompt-position-rules/quality.md)后仍不能确定质量内容时，读取本文件。

默认 WAI 质量内容：

```text
masterpiece, best quality, ultra-detailed, highres
```

用户明确要求减少细节并保留高清画面时，可以调整为：

```text
best quality, clean details, highres
```
