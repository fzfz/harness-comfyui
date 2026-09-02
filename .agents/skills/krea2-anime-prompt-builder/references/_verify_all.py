# -*- coding: utf-8 -*-
"""最终验证：三个数据源无重复 + 可加载 + 组合器可用。"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))

issues = 0

def dup(lst):
    seen, d = set(), []
    for x in lst:
        if x in seen:
            d.append(x)
        seen.add(x)
    return d

# ---- 1. hanfu_master ----
import hanfu_master as H
print("== 1. hanfu_master 主数据集 ==")
for name, grp in [("FORMS", H.FORMS), ("PARTS", H.PARTS), ("SKIRTS", H.SKIRTS),
                  ("PATTERNS", H.PATTERNS), ("FABRICS", H.FABRICS)]:
    for k, v in grp.items():
        d = dup(v)
        if d:
            issues += 1; print(f"  [重复] {name}.{k}: {d}")
print(f"  形制款式去重后: {len(H.all_forms())} | 裙制: {len(H.all_skirts())} | "
      f"纹样: {len(H.all_patterns())} | 面料: {len(H.all_fabrics())}")

# ---- 2. anime_big_lib ----
import anime_big_lib as A
print("== 2. anime_big_lib 大词库 ==")
dc = dup(A.COLORS)
if dc: issues += 1; print(f"  [重复] COLORS: {dc}")
for fam, pools in A.FAMILIES.items():
    for dim, lst in pools.items():
        d = dup(lst)
        if d:
            issues += 1; print(f"  [重复] {fam}.{dim}: {d}")
print(f"  COLORS: {len(A.COLORS)} | 家族: {len(A.FAMILIES)} | 汉服组合层: {A._HANFU_OK}")
if A._HANFU_OK:
    for k, v in A.HANFU.items():
        d = dup(v)
        if d: issues += 1; print(f"  [重复] HANFU.{k}: {d}")
    print(f"  HANFU 组合池: {{k: len(v)}} =", {k: len(v) for k, v in A.HANFU.items()})
    print(f"  汉服理论组合数 ≈ {A.hanfu_theoretical():,}")

# ---- 3.（可选）外部 JSON 穿搭词库 ----
# 若同目录存在 亚洲年轻女性穿搭词库.json（可从写实人像技能同步而来）则一并校验；
# 缺失时优雅跳过，不影响本仓库两大核心词库（hanfu_master / anime_big_lib）的验证。
print("== 3.（可选）外部 JSON 穿搭词库 ==")
JP = os.path.join(os.path.dirname(__file__), "亚洲年轻女性穿搭词库.json")
if os.path.exists(JP):
    d = json.load(open(JP, encoding="utf-8"))
    list_keys = [k for k, v in d.items() if isinstance(v, list)]
    for k in list_keys:
        dd = dup(d[k])
        if dd:
            issues += 1; print(f"  [重复] {k}: {dd[:8]}{'...' if len(dd) > 8 else ''}")
    total = sum(len(d[k]) for k in list_keys)
    hanfu_keys = [k for k in d if k.startswith("汉服_")]
    print(f"  顶层键: {len(d)} | list键: {len(list_keys)} | 总词条: {total}")
    print(f"  汉服子维度: {hanfu_keys}")
else:
    print("  [跳过] 未找到 亚洲年轻女性穿搭词库.json（可选项，不影响核心校验）")

print("=" * 40)
print(f"验证结果：{'✅ 全部通过，无重复' if issues == 0 else f'❌ 发现 {issues} 处问题'}")
