# `character` 位置示例

## 用途和读取时机

Skill Agent 读取 [`character` 位置规则](../prompt-position-rules/character.md)后仍不能确定角色内容如何保留时，读取本文件。

被采用的芙莉莲角色提示词为：

```text
frieren, sousou no frieren, 1girl, green eyes, long hair, white hair, grey hair, twintails, parted bangs, white capelet, long sleeves, earrings, elf
```

用户没有修改芙莉莲的外貌或服装时，`character` 完整保留上述内容。`subject` 仍然根据整幅画面的主体总数写入 `1girl`、`2girls` 或其他准确的总量标签；`appearance` 和 `outfit` 不重复上述内容。

用户明确要求芙莉莲改为蓝眼睛和短发时，本轮位置内容为：

```text
character: frieren, sousou no frieren, 1girl, white hair, grey hair, parted bangs, white capelet, long sleeves, earrings, elf
appearance: blue eyes, short hair
```

Skill Agent 只从本轮 `character` 内容中删除冲突的 `green eyes`、`long hair` 和 `twintails`。语义查询结果或 UI 选择中的原始 `prompt_text` 保持不变。
