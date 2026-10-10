#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
教育HOT · 竞品账号采集（小红书）· 走本地 xhs CLI
=================================================

这一层解决的是「数据到我手里」，**和部署完全无关**。
只要本机的 xhs CLI 还登录着，就能抓到真实的小红书账号数据
（主页粉丝数 / 获赞收藏 / 最近笔记标题与赞数），不需要 Postgres、不需要付费接口。

    # 1) 先看清单（uid 怎么拿见 --help）
    # 2) 抓数据 → 生成观察文件（只是本地文件，可以先看再决定推不推）
    python tools/collect-competitor-xhs.py --targets tools/xhs-targets.json --days 30
    # 3) 顺手推给站点（要站点在跑 + INGEST_TOKEN）
    python tools/collect-competitor-xhs.py --targets tools/xhs-targets.json --days 30 --push

为什么是 Python 而不是 Node：这台机器上 Node 调不动某些可执行文件
（execFileSync('...xhs.exe') 直接 EBUSY，连 cmd.exe 也一样），但调 node.exe 正常。
Python 的 subprocess 一切正常。xhs CLI 本身也在同一个 venv 里，用 Python 写省一层。
换一台机器，Node 版大概率也能用——这是环境限制，不是设计选择。

小红书不返回「历史粉丝数」，只有当前值。所以涨粉增量要靠本脚本自己存快照来算，
落在 tools/.state/xhs-followers.json。**第一次跑没有上次值，涨粉字段就是空的**，
第二次起才有——这是正常的，不是 bug。
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
STATE = HERE / ".state" / "xhs-followers.json"
XHS_DEFAULT = "C:/Users/A/.workbuddy/binaries/python/envs/default/Scripts/xhs.exe"
CN = timezone(timedelta(hours=8))
STALE_MS = 48 * 3600 * 1000  # 与站点 content/materials.ts 的 STALE_ON_DISCOVERY_MS 一致


# ── 小工具 ────────────────────────────────────────────────────────────
def parse_count(v):
    """'4万' / '5.4万' / '164.1K' / '11' → int。抓不到就 None，不编数字。"""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v)
    s = re.sub(r"[,，\s]", "", str(v).strip())
    m = re.match(r"^([\d.]+)\s*([万wWkK亿]?)", s)
    if not m:
        return None
    try:
        n = float(m.group(1))
    except ValueError:
        return None
    unit = m.group(2).lower()
    if unit in ("万", "w"):
        return int(round(n * 10000))
    if unit == "k":
        return int(round(n * 1000))
    if unit == "亿":
        return int(round(n * 100000000))
    return int(round(n))


def run_xhs(binary, args, lenient=False):
    """调 xhs CLI 并解析 JSON。失败返回 None（不抛，除非 lenient=False 时打印原因）。"""
    try:
        r = subprocess.run(
            [binary] + args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
        )
    except Exception as e:  # noqa: BLE001
        if not lenient:
            print(f"  ✗ 调不起来 xhs：{type(e).__name__} {e}")
        return None
    if r.returncode != 0:
        if not lenient:
            print(f"  ✗ xhs {' '.join(args[:2])} 返回 {r.returncode}：{(r.stderr or r.stdout or '')[:200]}")
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError as e:
        if not lenient:
            print(f"  ✗ xhs 输出不是 JSON：{e}｜{(r.stdout or '')[:160]}")
        return None


def load_state():
    if STATE.exists():
        try:
            return json.loads(STATE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def save_state(state):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def human_delta(n):
    if n is None:
        return "—"
    return f"+{n}" if n > 0 else str(n)


# ── 主流程 ────────────────────────────────────────────────────────────
def build_obs(args):
    binary = args.xhs
    now = datetime.now(CN)
    since = now - timedelta(days=args.days)

    status = run_xhs(binary, ["status", "--json"])
    if not status or not (status.get("data") or {}).get("authenticated"):
        print("✗ xhs CLI 不在登录态，先跑： xhs login")
        print("  （用 xhs status --json 确认 authenticated 是 true；访客态抓出来是空的）")
        sys.exit(3)
    operator = (status["data"].get("user") or {}).get("nickname")
    print(f"✓ 小红书登录态正常（{operator}）")
    print(f"  窗口：近 {args.days} 天（{since:%Y-%m-%d} → {now:%Y-%m-%d}）")

    targets_path = Path(args.targets).resolve()
    if not targets_path.exists():
        print(f"✗ 读不到 {targets_path}")
        sys.exit(2)
    raw = json.loads(targets_path.read_text(encoding="utf-8"))
    lst = raw if isinstance(raw, list) else raw.get("targets") or []
    if not lst:
        print("✗ 清单里没有账号，格式见 tools/xhs-targets.json")
        sys.exit(2)

    state = load_state()
    accounts = []

    for t in lst:
        label = t.get("name") or t.get("uid")
        uid = t.get("uid")
        if not uid:
            print(f"  ⚠ {label}：没有 uid，跳过")
            continue
        print(f"\n▶ {label}（uid {uid}）")

        prof = run_xhs(binary, ["user", str(uid), "--json"])
        if not prof or not prof.get("data"):
            print("  ⚠ 主页读不到，跳过")
            continue
        d = prof["data"]
        bi = d.get("basic_info") or {}
        inter = d.get("interactions") or []
        pick = lambda ty: parse_count(next((x.get("count") for x in inter if x.get("type") == ty), None))
        fans = pick("fans")
        likes_total = pick("interaction")
        nickname = bi.get("nickname") or t.get("name") or label
        profession = next((x.get("name") for x in (d.get("tags") or []) if x.get("tagType") == "profession"), None)
        print(f"  粉丝 {fans if fans is not None else '?'}｜获赞收藏 {likes_total if likes_total is not None else '?'}"
              + (f"｜{profession}" if profession else ""))

        # 翻页取笔记
        notes, cursor = [], None
        for _ in range(args.pages):
            call = ["user-posts", str(uid), "--json"]
            if cursor:
                call += ["--cursor", cursor]
            page = run_xhs(binary, call)
            data = (page or {}).get("data") or {}
            notes.extend(data.get("notes") or [])
            if not data.get("has_more") or not data.get("cursor"):
                break
            cursor = data["cursor"]

        since_ms = since.timestamp() * 1000
        in_window = [n for n in notes if isinstance(n.get("time"), int) and n["time"] >= since_ms]
        likes_of = lambda n: parse_count((n.get("interact_info") or {}).get("liked_count")) or 0
        ordered = sorted(in_window, key=likes_of, reverse=True)
        best = likes_of(ordered[0]) if ordered else None
        viral = sum(1 for n in ordered if likes_of(n) >= 10000)
        avg = int(round(sum(likes_of(n) for n in in_window) / len(in_window))) if in_window else None
        print(f"  窗口内 {len(in_window)} 条 / 共抓 {len(notes)} 条｜最高赞 {best if best is not None else '?'}｜过万赞 {viral} 条")

        key = f"xhs:{uid}"
        prev = state.get(key) or {}
        delta = (fans - prev["followers"]) if (fans is not None and prev.get("followers") is not None) else None
        # 快照要在「跳过」判断之前落，否则被跳过的号下次仍然算不出涨粉
        state[key] = {"followers": fans, "at": now.isoformat(), "name": nickname}
        if delta is not None:
            print(f"  较上次（{prev.get('at', '')[:10]}）：粉丝 {human_delta(delta)}")

        # 闸门：静止的账号不推。名单一长（几十个对标号），谁都没动的话推 37 条等于把竞品栏淹了。
        if not args.include_idle and len(in_window) < args.min_notes:
            print(f"  ⏭ 窗口内 {len(in_window)} 条新笔记，未达 --min-notes {args.min_notes}，本次不推（粉丝快照已存）")
            continue

        top_titles = [str(n.get("display_title") or "").strip() for n in ordered[:3]]
        top_titles = [s for s in top_titles if s]
        summary = (t.get("summary") or "")
        if top_titles:
            summary = "窗口内高赞选题：" + "、".join(f"「{s[:24]}」" for s in top_titles)

        highlights = []
        if args.highlights > 0 and ordered:
            # 两道筛子，缺一条就会把噪声当情报发出去：
            #   ① 48 小时内（站点规则：更早的算历史，不进「今天」）
            #   ② 赞数过 --viral-min（否则会把 3 个赞的笔记写成「爆款」——那是在编故事）
            fresh = [n for n in ordered if now.timestamp() * 1000 - n["time"] <= STALE_MS]
            stale_n = len(ordered) - len(fresh)
            qualified = [n for n in fresh if likes_of(n) >= args.viral_min]
            if stale_n and not fresh:
                print(f"  ⓘ 有 {stale_n} 条高赞但都超过 48 小时，按站点规则算历史，只计进汇总、不单推")
            elif fresh and not qualified:
                print(f"  ⓘ 48 小时内的 {len(fresh)} 条最高只有 {likes_of(fresh[0])} 赞，"
                      f"没过 --viral-min {args.viral_min}，不单推（只进汇总）")
            for n in qualified[: args.highlights]:
                token = (n.get("xsec_token") or "").strip()
                url = f"https://www.xiaohongshu.com/explore/{n['note_id']}"
                if token:
                    url += f"?xsec_token={token}"
                highlights.append({
                    "title": str(n.get("display_title") or "").strip() or "（无标题）",
                    "url": url,
                    "likes": likes_of(n),
                    "publishedAt": datetime.fromtimestamp(n["time"] / 1000, CN).isoformat(),
                })

        note_bits = [f"分类：{t['category']}" if t.get("category") else None,
                     f"标签：{profession}" if profession else None]
        accounts.append({
            "platform": t.get("platform") or "小红书",
            "name": nickname,
            "handle": bi.get("red_id") or t.get("handle"),
            "profileUrl": t.get("url") or f"https://www.xiaohongshu.com/user/profile/{uid}",
            "window": f"{since:%Y-%m-%d}..{now:%Y-%m-%d}",
            "observedAt": now.isoformat(),
            "summary": summary,
            "metrics": {
                "notes": len(in_window),
                "viral": viral,
                "bestLikes": best,
                "avgLikes": avg,
                "followerDelta": delta,
                "followerTotal": fans,
            },
            "highlights": highlights,
            "notes": "｜".join([b for b in note_bits if b]) or None,
        })

    # --max：名单几十个时，只推「动得最厉害的那几个」。排序口径是「新笔记条数」优先，
    # 同条数再比粉丝数——因为竞品情报的价值在"变化"，不在"体量"。
    if args.max and len(accounts) > args.max:
        accounts.sort(key=lambda a: (-(a["metrics"]["notes"] or 0), -(a["metrics"]["followerTotal"] or 0)))
        dropped = accounts[args.max:]
        accounts = accounts[: args.max]
        print(f"\n⛔ --max {args.max}：按「新笔记条数 → 粉丝数」取前 {args.max} 个，"
              f"本轮不推 {len(dropped)} 个：{'、'.join(a['name'] for a in dropped)}")

    if not accounts:
        print("\n⚠ 一个账号都没推出去。两种可能：")
        print("   ① uid 全错 / 登录态失效 → 检查 uid，跑 xhs status --json")
        print("   ② 名单里的号在这一窗口内都没发新笔记（这是好事，不是错误）")
        print("      → 想连静止的一起推，加 --include-idle；想放宽窗口，把 --days 调大")
        return {
            "_generated": f"由 tools/collect-competitor-xhs.py 于 {now.isoformat()} 抓取（窗口 {args.days} 天）",
            "_source": f"xhs CLI（登录态：{operator}）",
            "_note": "本轮所有账号在这个窗口里都没有新笔记，因此没有可推的条目。",
            "accounts": [],
        }, state

    doc = {
        "_generated": f"由 tools/collect-competitor-xhs.py 于 {now.isoformat()} 抓取（窗口 {args.days} 天）",
        "_source": f"xhs CLI（登录态：{operator}）",
        "_caution": "数据来自小红书公开主页，粉丝/赞数会随时间变动。站点精选标准里竞品类 cred 只给 1，正因为这些数字无法独立核验。",
        "accounts": accounts,
    }
    return doc, state


def main():
    ap = argparse.ArgumentParser(
        description="教育HOT 竞品采集（小红书）· 走本地 xhs CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
怎么拿 uid
  xhs search-user <昵称> --json      # 取返回里的 user_base_dto.user_id
  或打开主页 https://www.xiaohongshu.com/user/profile/<这一段就是 uid>

示例
  python tools/collect-competitor-xhs.py --targets tools/xhs-targets.json --days 7 --dry-run
  python tools/collect-competitor-xhs.py --targets tools/xhs-targets.json --days 30 --highlights 2
  python tools/collect-competitor-xhs.py --targets tools/xhs-targets.json --days 30 --push
""",
    )
    ap.add_argument("--targets", help="目标账号清单 JSON（必填，格式见 tools/xhs-targets.json）")
    ap.add_argument("--days", type=int, default=7, help="观察窗口天数（默认 7）")
    ap.add_argument("--highlights", type=int, default=2, help="单推几条爆款明细（默认 2，只取 48 小时内发布的）")
    ap.add_argument("--viral-min", type=int, default=100,
                    help="单推明细的最低赞数（默认 100）。不设这个门槛，3 个赞的笔记也会被写成「爆款」——那是编故事")
    ap.add_argument("--pages", type=int, default=1, help="每个账号翻几页笔记（1 页 = 30 条，默认 1）")
    ap.add_argument("--xhs", default=XHS_DEFAULT, help=f"xhs CLI 路径（默认 {XHS_DEFAULT}）")
    ap.add_argument("--out", default="tools/_obs-竞品-xhs.json", help="观察文件输出路径")
    ap.add_argument("--push", action="store_true", help="生成后顺手推给站点（需要 INGEST_TOKEN）")
    ap.add_argument("--push-only", action="store_true", help="不抓取，直接把已有的 --out 文件推给站点")
    ap.add_argument("--dry-run", action="store_true", help="只抓不写文件、不推送，把结果打到屏幕")
    # 名单一长（比如几十个对标号），「有没有新动静」比「有多少个号」重要得多。
    # 不加闸门的话，37 个号每天推 37 条，竞品栏会被淹掉、真正有变化的反而看不见。
    ap.add_argument("--include-idle", action="store_true",
                    help="连窗口内没有新笔记的账号也推（默认跳过——静止的账号天天推会把竞品栏淹掉）")
    ap.add_argument("--max", type=int, default=0,
                    help="最多推几个账号（默认 0 = 不限）。按「窗口内有几条新笔记」降序、再按粉丝数取前 N")
    ap.add_argument("--min-notes", type=int, default=1,
                    help="窗口内至少有几条新笔记才算「有动静」（默认 1）")
    args = ap.parse_args()

    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = (Path.cwd() / out_path).resolve()

    if args.push_only:
        push(out_path)
        return

    if not args.targets:
        ap.error("缺 --targets <file.json>（或改用 --push-only）")

    doc, state = build_obs(args)

    if args.dry_run:
        print("\n--- DRY RUN，不写文件 ---\n")
        print(json.dumps(doc, ensure_ascii=False, indent=2))
        return

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    save_state(state)

    print(f"\n✓ 观察文件：{out_path}")
    print(f"✓ 粉丝快照：{STATE}（下次跑就能算涨粉了）")
    first_time = any(a["metrics"]["followerDelta"] is None for a in doc["accounts"])
    print(f"  共 {len(doc['accounts'])} 个账号" + ("（首次跑没有涨粉值，正常）" if first_time else ""))

    if not doc["accounts"]:
        print("  本轮没有可推条目，跳过推送（不是错误——说明这段时间对标号都没动）")
        return

    if args.push:
        push(out_path)
    else:
        print("\n下一步（推送进站，需要站点在跑 + INGEST_TOKEN）：")
        print(f'  node tools/collector-competitor.mjs --kind competitor --in "{out_path}"')


def push(obs_path):
    collector = REPO / "tools" / "collector-competitor.mjs"
    if not Path(obs_path).exists():
        print(f"✗ 观察文件不存在：{obs_path}")
        sys.exit(1)
    print(f"\n→ 交给推送脚本：{collector}")
    r = subprocess.run(["node", str(collector), "--kind", "competitor", "--in", str(obs_path)])
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
