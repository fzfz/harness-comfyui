# -*- coding: utf-8 -*-
"""
本技能 · 动漫动作迁移提示词生成器（大词库版）
===========================================
加载 references/anime_big_lib.py（合并：原生成库 + 参考库 + 国内站爬取数据）。
每条提示词 = 固定人设 + 动作迁移铁律 + (颜色×服装×款式×饰品×鞋履×背景) 唯一组合。
背景全部为「绚丽场景」且已剔除含移动物/动物者（避免被一并迁移）。
输出：每个提示词一个独立 .txt 文件（仅含喂给 AI 的正文，无任何元信息）。

用法：
    python gen_anime_v1.py <输出目录> [数量N，默认1000] [随机种子]
例：
    python gen_anime_v1.py "output/大词库生成" 1000
"""
import os
import sys
import random

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(os.path.dirname(HERE), "references")
sys.path.insert(0, REF)
from anime_big_lib import COLORS, FAMILIES, compose_hanfu, hanfu_theoretical, _HANFU_OK  # noqa

# ---------- 固定人设（人物迁移必须同脸，不可随机） ----------
PERSONA = (
    "a beautiful anime girl, melon-seed face, large round eyes, "
    "extremely fair skin with pink undertone, long straight black hair, "
    "hourglass figure, sweet yet seductive, "
)

# ---------- 质量 / 画风 tag ----------
MASTER = (
    "masterpiece, best quality, ultra-detailed, 8k, highly detailed anime, "
    "official art, beautiful composition, dramatic lighting, "
    "(anime coloring, cel shading), "
)

# ---------- 动作迁移铁律（垂直 T-pose，便于骨架识别） ----------
POSE = (
    "(standing:1.2), feet together, hands resting at sides, full body, "
    "vertical posture, head occupies less than 25% of frame, "
    "legs occupy more than 65% of frame, both shoes fully visible at bottom, "
)

# ---------- 背景铁律（绚丽 + 无移动物，已被词库过滤） ----------
BG_PREFIX = "gorgeous splendid magnificent background, "


def build_prompt(fam, bg, outfit, style, acc, shoes, color):
    # 颜色前置修饰服装；款式补充剪裁/气质；饰品/鞋履独立成句
    outfit_phrase = f"{color} {outfit}".strip()
    parts = [
        MASTER,
        PERSONA,
        POSE,
        f"{outfit_phrase}, {style}, ",
        f"{acc}, ",
        f"{shoes}, ",
        BG_PREFIX + f"{bg}, ",
        f"({fam} style), ",
    ]
    return "".join(parts).strip()


def gen_unique(n, seed=20260709):
    random.seed(seed)
    fams = list(FAMILIES.keys())
    seen = set()
    out = []
    attempts = 0
    max_attempts = n * 50 + 1000
    while len(out) < n and attempts < max_attempts:
        attempts += 1
        fam = random.choice(fams)
        d = FAMILIES[fam]
        bg = random.choice(d["bg"])
        style = random.choice(d["style"])
        acc = random.choice(d["acc"])
        shoes = random.choice(d["shoes"])
        # 国风仙侠：启用汉服组合层，动态拼装完整汉服（形制+领型+袖型+纹样+面料+色）
        if fam == "国风仙侠" and _HANFU_OK:
            outfit = compose_hanfu(random)   # 已含传统色，故 color 置空避免重复
            color = ""
        else:
            outfit = random.choice(d["outfit"])
            color = random.choice(COLORS)
        key = (fam, bg, outfit, style, acc, shoes, color)
        if key in seen:
            continue
        seen.add(key)
        out.append((fam, build_prompt(fam, bg, outfit, style, acc, shoes, color)))
    return out


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "./generated_anime"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 20260709
    os.makedirs(out_dir, exist_ok=True)
    results = gen_unique(n, seed)
    width = max(3, len(str(len(results))))
    for i, (fam, txt) in enumerate(results, 1):
        fn = os.path.join(out_dir, f"{i:0{width}d}.txt")
        with open(fn, "w", encoding="utf-8") as f:
            f.write(txt + "\n")
    # 统计
    fam_count = {}
    for fam, _ in results:
        fam_count[fam] = fam_count.get(fam, 0) + 1
    print(f"已生成 {len(results)} 条唯一提示词 -> {out_dir}")
    print(f"颜色池: {len(COLORS)} | 家族数: {len(FAMILIES)}")
    print("各家族分布:", fam_count)
    if _HANFU_OK:
        print(f"汉服组合层已启用 · 国风仙侠组合数 ≈ {hanfu_theoretical():,}")
    print("理论唯一组合上限：数百亿级（足够生成任意数量唯一提示词）")


if __name__ == "__main__":
    main()
