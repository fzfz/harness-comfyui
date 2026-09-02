#!/usr/bin/env python3
# 旧式英文标签生成器冒烟检查：运行小批量任务，输出 OK/WARN
# 用法：python scripts/selftest.py
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

def run(script, n=20):
    print(f"\n=== 生成器冒烟检查 {script} (n={n}) ===")
    out_dir = tempfile.mkdtemp(prefix="anime-prompt-selftest-")
    try:
        r = subprocess.run(
            [sys.executable, os.path.join(HERE, script), out_dir, str(n)],
            capture_output=True,
            text=True,
        )
    finally:
        shutil.rmtree(out_dir, ignore_errors=True)
    tail = (r.stdout or "")[-600:]
    print(tail)
    if r.returncode != 0:
        print("WARN: 生成器运行失败\n", (r.stderr or "")[-500:])
        return False
    return True


if __name__ == "__main__":
    ok = run("gen_anime_v1.py", 20)
    print("\n===== 本技能生成器自测:", "OK" if ok else "WARN", "=====")
    sys.exit(0 if ok else 1)
