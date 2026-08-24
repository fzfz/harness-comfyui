# 作品、角色、画师和 Prompt 标签查询工具说明

目录：

- [`query_semantic_works`](#query_semantic_works)
- [`query_semantic_characters`](#query_semantic_characters)
- [`query_semantic_styles`](#query_semantic_styles)
- [`query_semantic_prompt_terms`](#query_semantic_prompt_terms)

本文是 `query_semantic_works`、`query_semantic_characters`、`query_semantic_styles` 和 `query_semantic_prompt_terms` 的唯一具体说明。只能在 `SKILL.md` 规定的语义查询情况中读取本文。

## prompt_text查询Cli工具

### 介绍和用途
这是一个通过语义查询获得对应的文生图模型能够理解的prompt_text/tag的工具

### Cli名称和默认查询端口和帮助
```
/Users/fzfz/.local/bin/imagegen-semantic-query --port 18093 --help
```
### 帮助语法
```
imagegen-semantic-query --port <port> --help
```
### 单个path的帮助查询
```
imagegen-semantic-query --port <port> --path <operation-path> --help
```
### 语义搜索
```
imagegen-semantic-query --port <port> --path <operation-path>  --mode search --query "keyword"
```
### 通过精确id查询
```
imagegen-semantic-query --port <port> --path <operation-path>  --mode resolve --id "id"
```

### path用途速查表（本skill执行过程中可能用到的）
1. /internal/semantic/base-models - Search or resolve base-model records（底模id获得）
2. /internal/semantic/loras - Search or resolve LoRA records（底模关联的Lora名、特点、用法、权重）
3. /internal/semantic/works - Search or resolve work records（模型支持的漫画、动画、游戏等作品名称）
4. /internal/semantic/characters - Search or resolve character records（作品所属角色名和模型支持的prompt_text）
5. /internal/semantic/styles - Search or resolve style records（画师名、画师的画风描述、对应的prompt_text）
6. /internal/semantic/prompt-terms - Search or resolve prompt-term records（danbooru、文字描述、对应的promt_text）
7. /internal/semantic/artist-prompt-strings - Search or resolve artist Prompt string records(多个6.中的画师组成的画风组合、风格描述、和对应的promt_text)
8. /internal/semantic/comfyui-instances - Search or resolve ComfyUI instance records(目前可用的Comfyui实例)
9. /internal/semantic/comfyui-templates - Search or resolve ComfyUI template summaries（可以根据底模，模型，筛选的Comfyui workflow json文件）





## /internal/semantic/works 


**工具用途**

只确认作品、系列或 IP 身份，并取得返回结果提供的 `character_names`。Work 记录没有 `prompt_text`。

**必须查询的具体情况**

- `noobai_user_prompt.user_text` 中出现作品、系列或 IP，且 需要确认用户指向的作品身份。
- 已经确认某个作品，但必须取得该作品记录的 角色名，以便继续查询 。

**查询步骤**


逐项比较用户原文中的作品、系列或 IP 文本与查询返回结果中的 `name`、`aliases`、`category_name`，然后选择具体作品；
只把选中的作品候选所含 `character_names` 逐项作为 `query_semantic_characters` 的后续查询文本；。




## /internal/semantic/characters

**工具用途**

只确认角色身份并取得角色记录的 `prompt_text`。

- 用户指定角色，但明确选择缺少去除空白后非空的可用 `prompt_text`。
- 用户指定的角色名称、所属作品或角色别名存在歧义，需要确认具体角色身份。



## /internal/semantic/styles 

**工具用途**

查询 Style 记录承载的画师身份名称（`name`、`aliases`）、该身份对应的画师风格说明（`style_description`）和该身份对应的画师触发词（`prompt_text`）。



## /internal/semantic/prompt-terms

**工具用途**

把用户使用自然语言描述的通用视觉概念解析成规范 Prompt 标签。该工具只返回可进入 Prompt 的 `canonical_tag` 和用于理解候选的 `aliases`。

- 用户描述外貌、服装、动作、表情、构图、场景或氛围概念，并且 从已读取的详细资料中不能确定精确规范标签。
- 已读取的详细资料提供两个以上语义相近但画面含义不同的候选标签，需要根据用户原文比较候选。
- 用户明确要求查询某个通用视觉概念对应的规范 Prompt 标签。



