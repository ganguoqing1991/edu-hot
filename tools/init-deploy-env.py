#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成 / 补全教育HOT 的 .env，并把同一个 INGEST_TOKEN 写进 tools/.env.daily。

为什么要有这个脚本：手填 .env 容易漏（尤其是 INGEST_TOKEN 两处必须一致），
所以把它做成幂等的：已存在的 .env 会被读取，**已有值不覆盖**，只补缺失项。
密钥一律不打印。

用法：
  python tools/init-deploy-env.py                       # 默认操作 _deploy/edu-hot
  python tools/init-deploy-env.py --dir D:/edu-hot
  python tools/init-deploy-env.py --show-admin          # 打印管理员密码（唯一需要人记的一项）
"""
from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

LLM_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
LLM_MODEL = "doubao-seed-evolving-latest-version"
LLM_EXTRA_JSON = '{"thinking":{"type":"disabled"}}'

# 站点 .env 里我们要保证存在的键（顺序即写入顺序）
MANAGED = [
    "SITE_URL",
    "ADMIN_PASSWORD",
    "SESSION_SECRET",
    "IMG_PROXY_SIGN_SECRET",
    "POSTGRES_PASSWORD",
    "LLM_BASE_URL",
    "LLM_API_KEY",
    "LLM_MODEL",
    "LLM_EXTRA_JSON",
    "INGEST_TOKEN",
    "TRUST_PROXY",
    "COLLECT_ENABLED",
    "MODEL_CALLS_ENABLED",
]


def ark_key() -> str:
    """从本机 arkcli 配置里读方舟 key；读不到就返回空串。不打印值。"""
    env = Path(os.path.expanduser("~")) / ".arkcli" / ".env"
    if not env.exists():
        return ""
    for line in env.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("VOLCENGINE_ARK_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def read_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(REPO / "_deploy" / "edu-hot"),
                    help="部署目录（含 docker-compose.yml）")
    ap.add_argument("--site-url", default="http://localhost:3000")
    ap.add_argument("--show-admin", action="store_true", help="把管理员密码打到屏幕")
    args = ap.parse_args()

    deploy = Path(args.dir).resolve()
    if not (deploy / "docker-compose.yml").exists():
        print(f"✗ {deploy} 里没有 docker-compose.yml，路径不对")
        return 1
    if not (deploy / ".env.example").exists():
        print(f"✗ {deploy} 里没有 .env.example")
        return 1

    env_path = deploy / ".env"
    cur = read_env(env_path)
    existed = bool(cur)

    ak = ark_key()
    fresh = {
        "SITE_URL": args.site_url,
        "ADMIN_PASSWORD": secrets.token_urlsafe(12),
        "SESSION_SECRET": secrets.token_hex(32),
        "IMG_PROXY_SIGN_SECRET": secrets.token_hex(32),
        "POSTGRES_PASSWORD": secrets.token_hex(24),
        "LLM_BASE_URL": LLM_BASE_URL,
        "LLM_API_KEY": ak,
        "LLM_MODEL": LLM_MODEL,
        "LLM_EXTRA_JSON": LLM_EXTRA_JSON,
        "INGEST_TOKEN": secrets.token_hex(24),
        "TRUST_PROXY": "false",
        "COLLECT_ENABLED": "true",
        "MODEL_CALLS_ENABLED": "true",
    }

    merged = dict(cur)
    added, kept = [], []
    for k in MANAGED:
        if cur.get(k):
            kept.append(k)
        else:
            merged[k] = fresh[k]
            added.append(k)

    # 保留用户可能自己加的其他键
    for k, v in cur.items():
        merged.setdefault(k, v)

    lines = [
        "# 教育HOT 部署配置 —— 由 tools/init-deploy-env.py 生成，可手工继续改。",
        "# 这个文件含密钥，别提交到 Git、别放进要分享的 zip。",
        "",
    ]
    for k in MANAGED:
        lines.append(f"{k}={merged[k]}")
    extra_keys = [k for k in merged if k not in MANAGED]
    if extra_keys:
        lines.append("")
        lines.append("# —— 你自己保留的其他配置 ——")
        for k in extra_keys:
            lines.append(f"{k}={merged[k]}")
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"{'读入已存在的' if existed else '新建'} .env → {env_path}")
    print(f"  补写 {len(added)} 项：{', '.join(added) if added else '（无）'}")
    print(f"  保留 {len(kept)} 项：{', '.join(kept) if kept else '（无）'}")
    if not merged.get("LLM_API_KEY"):
        print("  ⚠️ 没读到 LLM_API_KEY —— 站起来了但条目不会被分类，请手工填进 .env")

    # 同一个 token 写进日报脚本的配置，两处必须一致，所以由脚本保证
    daily = REPO / "tools" / ".env.daily"
    daily.write_text(
        "# 由 tools/init-deploy-env.py 生成：站点地址 + 推送 token（与部署目录 .env 里的 INGEST_TOKEN 一致）\n"
        f"SITE_URL={merged['SITE_URL'].replace('localhost', '127.0.0.1')}\n"
        f"INGEST_TOKEN={merged['INGEST_TOKEN']}\n",
        encoding="utf-8",
    )
    print(f"已写 tools/.env.daily（站点地址 + 同一个 INGEST_TOKEN，竞品日报会自动推送）")

    if args.show_admin:
        print(f"\n管理员密码（登录 /admin 用）：{merged['ADMIN_PASSWORD']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
