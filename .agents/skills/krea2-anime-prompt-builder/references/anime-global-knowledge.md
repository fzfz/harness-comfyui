# 动漫提示词全球知识加固（本技能）

本文件汇总来自全球（日/中/英/韩）爬取和搜索的动漫提示词工程知识。

---

## 一、全球公式共识

### 1.1 日式写法（Danbooru 标签系统）

日本/全球动漫提示词通用结构：
```
[质量tag] + [画风tag] + [角色tag] + [服装tag] + [姿势tag] + [场景tag] + [背景tag]
```

- 质量前置：`(masterpiece:1.2), (best quality:1.2), highres, absurdres`
- 画风定调：`anime coloring, cel shading, thick lineart`
- 角色描述：`1girl, brown hair, green eyes, blush`
- 姿势锁定：`standing, full-body shot, arms at sides`
- 服装细节：`hanfu, flying ribbon, translucent sleeves`
- 场景氛围：`cherry blossom, sunset, temple background`

**权重标注法**：`(keyword:1.1~1.4)` 或 `[keyword:0.8~0.9]`
- 1.1-1.2 = 轻微强调
- 1.3-1.4 = 强烈强调
- 0.8 = 轻度弱化
- 0.5-0.7 = 明显弱化

### 1.2 中文写法（国内社区）

中国社区倾向于更自由的散文式描述 + 关键英文tag组合：
```
画质标签 + 画风标签 + 中文描述 + 英文tag
```

来自哩布哩布/知乎的经验：
- 中文关键词用逗号分隔短句胜过长句
- "长发，白色长发，白色连衣裙，少女" > "一个穿着白色连衣裙的长发少女"
- 国内模型能理解：`萌系/软萌/治愈系/御姐/优雅/傲娇`

### 1.3 韩式写法（Naver/Kakao社区）

基于日式Danbooru标签的韩文翻译：
```
(걸작:1.2), (최고 품질:1.2), 애니메이션 스타일, 셀식 채색, 전신, 서있음
```
大多数韩国社区使用 Danbooru 英文 tag + 韩文场景描述混写。

---

## 二、日本来源关键发现

### 2.1 tbs283blog：「立ち絵・全身画像のプロンプト一覧」

**核心8词防切模板（已验证4次多次高成功率）**：
```text
standing, full-body shot, feet fully visible, no cropping at the feet,
shoes clearly shown, visible ground below the feet,
feet not touching bottom edge, shot with room to breathe
```

**全身图推荐比例**：2:3 或 9:16（纵长），避开 1:1（极易切脚）

**地面技巧**（避免足元切れ）：
- `a cluster of petals has gathered around her feet` → 脚底有花瓣自动不切
- `a shopping bag placed beside her feet` → 有小物件在脚边
- `one foot resting on the edge of a step` → 台阶指示空间
- `white crosswalk lines running along her shoes` → 地面划线指示存在

**背景选择**：
- 切り抜き用：`white background / simple background`
- サムネ用（缩略图）：留白多一些

### 2.2 ai-nante.com：「立ち方・立ちポーズのプロンプト一覧」

**20+站姿变体分类**：

| 类别 | 日本名 | 英文 | 效果 |
|------|-------|------|------|
| 基本 | まっすぐ立つ | `stand at attention` | 直立/気をつけ |
| | 休め | `parade rest` | 放松站立 |
| | A立ち | `a-pose` | 常见游戏立绘 |
| | 猫背 | `slouching` | 慵懒 |
| 优雅 | モデル立ち | `contrapposto` | S曲线 |
| | 腰反らせ | `sway back` | 妩媚 |
| | 背中反らせ | `arched back` | 反弓 |
| | 足交差 | `crossed legs` | 优雅 |
| | ワトソンクロス | `watson cross` | 最洗练 |
| 动感 | 片足浮かせ | `uneven footing` | 动态 |
| | つま先立ち | `tiptoes` | 踮脚 |
| | 内股 | `pigeon-toed` | 萌系 |
| | 手足大広げ | `spread eagle` | 大字形 |

### 2.3 Pixiv 跨平台标签链

Danbooru 为每个标签维护跨平台别名链（已验证）：
- `full_body` → `全身`(CN), `全身絵`(JP), `全景镜头`(CN)
- `1girl` → `girl`, `女の子`, `少女`, `소녀`, `女孩子`
- `chinese_clothes` → `中国服`, `漢服`, `中国衣装`

这意味着**中文关键词也会被国际模型理解**，中英混写是最佳策略。

---

## 三、中文来源关键发现

### 3.1 知乎「AI绘画人物提示词完全指南」

**人物绘画三要素**：
1. 基础特征：性别/年龄/发型发色/服装风格
2. 画面构图：上半身+45度侧脸+逆光=绝美侧颜杀
3. 风格参数：8K+虚幻引擎5渲染+吉卜力

**角色设计万能公式**：
```
((masterpiece))), ((best quality)), [年龄][身份]，
[发色][发型]，[服装+细节]，
[动作+道具]，[背景+氛围]，
[画风+情绪]，[构图+光影]
```

**经验教训**：
- 不要大杂烩（赛博+古风+精灵尖耳+兽人尾巴=四不像）
- 拒绝抽象描述（"好看的衣服"=>AI乱画，"伤疤的位置+磨痕+褶皱"=>正确）
- 具象化+留白20%给AI发挥 = 最佳

### 3.2 塔猴「3D国漫漫剧指令」

**3D国漫仙侠提示词结构**：
```
国漫古风仙侠风格，3D写实渲染，
[性别] [年龄] [身份]，
[发型+发饰]，[服装+材质]，[姿态+表情]，
[背景场景+光效+氛围]，
CG渲染，电影级光影，8K超高清，细节丰富，极致画质
```

**场景四型**：
- 柔美型：月下禅茗/湖泊/灵树/月下品茗/氤氲雾气
- 宏大性：万剑归宗/断崖/云海/夕阳残晖
- 幻想型：浮空大殿/回廊/星空间传/悬浮岛屿
- 温馨型：竹林医庐/竹屋/阳光斑驳/药材/风铃

### 3.3 哩布哩布「提示词结构」

国内平台的结构化提示词推荐：
```
[质量tag] + [画风] + [角色特征] + [动作姿态] + [场景环境]
```

比长句描述更有效：用逗号分隔的短语（tag式写法）

---

## 四、模型与参数知识

### 4.1 动漫系 CLIP 选择

| 模型 | 推荐 CLIP | 原因 |
|------|----------|------|
| Krea2 / Z-Image | `qwen3vl_4b (type=krea2)` | 原生支持，长中文上下文 |
| SDXL / NAI系 | `CLIP-ViT-bigG`+`CLIP-ViT-L` | NAI标准双CLIP |
| Flux 系 | `T5-XXL` / `Qwen3-8B CLIP` | Klein版用Qwen |
| Anima 20B | 随模型自带 | 安装即用 |

### 4.2 动漫出图参数

| 参数 | Krea2 Turbo | SDXL动漫系 | Flux+动漫LoRA | Anima 20B |
|------|------------|-----------|--------------|-----------|
| Sampler | DPM++ 2M Karras | Euler a / DPM++ 2M Karras | DPM++ 2M Karras | 按模型推荐 |
| Steps | 8 | 20-30 | 25-30 | 8-50 |
| CFG | 0-1.0 | 5-8 | 3-5 | 按模型推荐 |
| 分辨率 | 任意1K-2K | 1024×1536 | 1024×1536 | 据模型 |

---

## 五、推荐的ComfyUI动漫工作流选型

### 5.1 5条可选路线对比

| 路线 | 模型 | 速度 | 品质 | 成本 | 适合场景 |
|------|------|------|------|------|---------|
| A | Krea2 Turbo | ⚡ 极快(8步) | ⭐⭐⭐ | 免费+已部署 | 快速测试、批量生成 |
| B | Animagine XL / NoobAI | 🐢 中(20-30步) | ⭐⭐⭐⭐ | 需下载(5-7GB) | 日系高质量插画 |
| C | Flux.2 Klein + 动漫LoRA | 🐌 慢(25-30步) | ⭐⭐⭐⭐⭐ | 已有Flux+LoRA需下载 | 高质量兼顾写实 |
| D | Anima 20B | 🐌 慢(20-50步) | ⭐⭐⭐⭐⭐ | 需下载(20B参数) | 纯动漫最佳品质 |
| E | WAN / LTX + 图生视频 | 视视频而定 | ⭐⭐⭐ | 已有部署 | 动漫舞蹈视频输出 |

### 5.2 给用户的推荐

鉴于用户现有：
- **RTX 5090 32GB** → 全部路线跑得动
- **ComfyUI 已部署** → 无需换环境
- **Krea2 已配置** → 路线A立即能用
- **Flux2 Klein 已安装** → 加动漫LoRA即路线C
- **目标是抖音舞蹈视频** → 最终输出是路线E

**推荐顺序**：
1. **先用路线A（Krea2）跑出图**——最快验证本技能提示词有效性
2. 如果动漫感不够纯（Krea2 偏向半写实），**加路线B（Animagine XL / NoobAI 下载）**——纯日系二次元
3. 如果要最高品质，**路线D（Anima 20B）**——专门为动漫优化的20B模型
4. **Flux路线**作为"真实系与动漫的杂交风"备选

---

## 六、平台写法差异

| 平台 | 写法特点 |
|------|---------|
| ComfyUI (Krea2) | 中文段式+英文tag，带括号权重，不吃负面限制 |
| ComfyUI (SDXL) | 英文tag为主，Danbooru格式，负向必填且有效 |
| ComfyUI (Flux) | 长提示词直接写入，需LongCLIP（Klein版用Qwen不用）|
| ComfyUI (Anima) | 随模型官方推荐格式 |
| GPT Image 2 | 散文式英文，不吃负面 |
