# ADR 0015：Harness-ComfyUI 通过内置客户端访问独立数据源服务

## 状态

已接受。

## 问题

Harness-ComfyUI 与数据源仓库需要分别发布和安装。使用者既可以在本机部署数据源服务，也可以连接另一台机器已经部署的数据源服务。Harness-ComfyUI 运行时不能通过数据源仓库路径读取客户端、配置或文档，也不能执行数据源仓库中的脚本。

## 决策

插件发行包包含 `scripts/source-client/imagegen-semantic-query.mjs` 和 `scripts/source-client/imagegen-comfyui-source-read.mjs`。前者请求数据源服务的 Catalog discovery 和语义查询接口；后者请求 Source discovery、ComfyUI 实例接口和 Workflow bundle 接口。两个客户端的接口路径、HTTP method、请求参数和响应处理逻辑保存在各自脚本中。

Host 使用 `harness-comfyui-source` Settings namespace 保存数据源服务 URL 和端口。Harness 的“ComfyUI”设置入口包含“图片读取”和“数据源服务”两个页签；“图片读取”页签显示图片读取设置页面，“数据源服务”页签允许使用者修改 `harness-comfyui-source` Settings namespace 中的数据源服务 URL 和端口。

`CatalogCli` 和 `GenerationSourceCli` 在每次启动内置客户端前读取最新 Settings 地址。上下文插入、Host 语义 Tool、managed CLI、Prompt Builder Skill、ComfyUI 实例读取和 Workflow bundle 读取都通过内置客户端访问 Settings 地址对应的数据源服务。保存地址后的下一次请求使用新地址，不要求重启 Harness。

ANIMA、Krea2 和 WAI Prompt Builder Skill 使用前台 shell 环境中的 `DSH_HARNESS_COMFYUI_SEMANTIC_QUERY_CLI`、`DSH_HARNESS_COMFYUI_SOURCE_URL` 和 `DSH_HARNESS_COMFYUI_SOURCE_PORT`。三个 Skill 不读取数据源仓库路径、配置或文档。

Configuration Profile 只保留 `source.catalogPort` 作为 Settings 首次注册时的默认端口。插件发行包内置客户端和 `harness-comfyui-source` Settings namespace 中的 URL、端口构成当前运行时访问数据源服务所需的全部客户端与配置。

## 结果

Harness-ComfyUI 与数据源仓库可以独立发布。Harness-ComfyUI 使用者必须部署一个数据源服务或获得一个可访问的数据源服务地址。数据源服务不可访问时，语义查询、上下文插入、ComfyUI 实例读取和 Workflow bundle 读取向使用者返回数据源服务连接错误；这些功能的唯一数据来源是 Settings 当前地址对应的数据源服务。

ADR 0009、ADR 0013 和 ADR 0014 保留为历史记录。本 ADR 取代这些文档中关于当前运行时读取外部客户端路径、固定 Source contract JSON 和 Source release version 的决定。
