---
文档用途: 定义插件与独立数据源服务的访问边界。
读取时机: 修改数据源客户端、配置归属或发布耦合关系前。
---
# ADR 0015：Harness-ComfyUI 通过内置客户端访问独立数据源服务

## 状态

1. 已接受。

## 问题

1. Harness-ComfyUI 与数据源仓库需要分别发布和安装。使用者既可以在本机部署数据源服务，也可以连接另一台机器已经部署的数据源服务。Harness-ComfyUI 运行时不能通过数据源仓库路径读取客户端、配置或文档，也不能执行数据源仓库中的脚本。

## 决策

1. Host 使用 `src/host/source-client/` 中的内部模块请求数据源服务的 Catalog discovery、目录查询、Source discovery、实例与 Workflow bundle 接口。内部模块随 Host bundle 构建，运行参数由 `config/source-client.json` 定义。

2. Host 数据源设置的存储位置、字段与生效规则遵循[配置规范](../system/configuration.md#harness-comfyui-数据源服务设置)。

3. `CatalogClient` 和 `GenerationSourceClient` 在每次请求前读取最新 Settings 地址。上下文插入、Host 目录 Tool、ComfyUI 实例读取和 Workflow bundle 读取通过内部客户端访问该地址。

4. 两个项目预设的 Skill 目录查询遵循[系统架构](../system/architecture.md#项目-preset-skills-与目录访问)中的“项目 Preset、Skills 与目录访问”。


## 结果

1. Harness-ComfyUI 与数据源仓库可以独立发布。Harness-ComfyUI 使用者必须部署一个数据源服务或获得一个可访问的数据源服务地址。数据源服务不可访问时，语义查询、上下文插入、ComfyUI 实例读取和 Workflow bundle 读取向使用者返回数据源服务连接错误；这些功能的唯一数据来源是 Settings 当前地址对应的数据源服务。

2. ADR 0009、ADR 0013 和 ADR 0014 保留为历史记录。本 ADR 取代这些文档中关于当前运行时读取外部客户端路径、固定 Source contract JSON 和 Source release version 的决定。
