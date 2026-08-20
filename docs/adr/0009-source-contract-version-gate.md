---
status: accepted
---

# Source contract version gate

Catalog discovery 与 Source discovery 都返回同一 `contract_id` 和 `contract_version`。Harness ComfyUI Host 插件分别读取两个 discovery，并只接受 `config/runtime.json` 中明确列出的版本。任一 adapter 遇到未知 `contract_id` 或不受支持的 `contract_version` 时停止注册对应的数据源能力并返回明确的 `SOURCE_CONTRACT_UNSUPPORTED` 错误；adapter 不猜测字段含义、不回退到旧路径，也不忽略版本差异。
