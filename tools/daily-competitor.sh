#!/usr/bin/env bash
# 教育HOT · 竞品日报一键跑
# 被人肉运行、被自动化任务调用都用这一条：bash tools/daily-competitor.sh
#
# 它做两件事：
#   1) 小红书 —— 18 个对标号（清单 tools/xhs-targets.json），走本机 xhs CLI，免部署免登录
#   2) 抖音   —— 飞瓜公开行业榜（教育校园 / 亲子 / 母婴），免登录
#
# 站点地址与推送 token 从哪来（按优先级）：
#   1. 环境变量 SITE_URL / INGEST_TOKEN
#   2. 文件 tools/.env.daily（部署完把这两行填进去，日常工作不用管环境变量）
#   3. 都没有 → 只产出观察文件，不推送（照样有结果可看）
set -uo pipefail

REPO="C:/Users/A/WorkBuddy/2026-09-29-10-26-22/aihot-edu"
PY="C:/Users/A/.workbuddy/binaries/python/versions/3.13.12/python.exe"
NODE="C:/Users/A/.workbuddy/binaries/node/versions/22.22.2-3/node.exe"

cd "$REPO" || { echo "✗ 找不到工作目录 $REPO"; exit 1; }

# ── 读 tools/.env.daily（存在就 source，不存在不报错）──────────
if [ -f tools/.env.daily ]; then
  set -a
  # shellcheck disable=SC1091
  . tools/.env.daily
  set +a
fi

STAMP="$(date +%Y-%m-%d)"
mkdir -p 日报

# Python 输出默认块缓冲，被管道接住时会整段憋到最后才吐，日志顺序会错乱（子进程 node 的话先出来）
export PYTHONUNBUFFERED=1

# 站点探活：连不上就这一轮不推送。
# 为什么要有这一步：站点没在跑的时候（比如 Docker Desktop 没开），推送会连接被拒，
# 整个日报脚本看起来像"失败了"——但其实观察文件和简报都好好的。
# 探一下、明确说"站点没起"，比让用户对着连接错误猜要好。
probe_site() {
  "$NODE" -e '
    const u = process.argv[1];
    fetch(u, { method: "GET", signal: AbortSignal.timeout(5000) })
      .then((r) => process.exit(r.status < 500 ? 0 : 1))
      .catch(() => process.exit(1));
  ' "$1"
}

PUSH_XHS=""
PUSH_DY=""
if [ -n "${SITE_URL:-}" ] && [ -n "${INGEST_TOKEN:-}" ]; then
  printf '[i] 探活站点 %s … ' "$SITE_URL"
  if probe_site "$SITE_URL"; then
    echo "在跑 —— 采集完会直接推进入库"
    PUSH_XHS="--push"
    PUSH_DY="--push"
  else
    echo "连不上"
    echo "    → 这一轮只产出观察文件，不推送。常见原因：Docker Desktop 没开、容器没起、端口不对"
    echo "    → 站点起来后重跑一次，或直接把观察文件推过去："
    echo "      node tools/collector-competitor.mjs --kind competitor --in tools/_obs-竞品-xhs.json"
  fi
else
  echo "[i] 没配 SITE_URL / INGEST_TOKEN：这一轮只产出观察文件，不推送"
  echo "    （部署完把这两行写进 tools/.env.daily 就会自动开始推送）"
fi

echo
echo "──────── 1/2 小红书 · 18 个对标号 ────────"
# --days 2          : 看最近 48 小时；站点自己的时效上限也是 48 小时，正好卡齐
# --viral-min 20    : 单条 20 赞才算「爆款」单独成条。日报窗口里新发的笔记赞数还没涨起来，
#                     门槛设 100 会把所有明细都筛掉，所以日报用 20，看真爆款请用周度窗口
# --max 12          : 一轮最多推 12 个号，按「新笔记条数 → 粉丝数」排，避免静号刷屏
"$PY" tools/collect-competitor-xhs.py \
  --targets tools/xhs-targets.json \
  --days 2 --highlights 3 --viral-min 20 --max 12 \
  $PUSH_XHS
XHS_RC=$?

echo
echo "──────── 2/2 抖音 · 飞瓜公开榜 ────────"
"$NODE" tools/collect-competitor-douyin.mjs \
  --tags 13,3,21 --period day --top 20 \
  --out "tools/_obs-竞品-抖音.json" \
  $PUSH_DY
DY_RC=$?

echo
echo "──────── 汇总 ────────"
echo "小红书采集退出码：$XHS_RC　抖音采集退出码：$DY_RC"
for f in "tools/_obs-竞品-xhs.json" "tools/_obs-竞品-抖音.json"; do
  if [ -f "$f" ]; then
    n="$("$NODE" -e "const fs=require('fs');try{console.log((JSON.parse(fs.readFileSync('$f','utf8')).accounts||[]).length)}catch(e){console.log('?')}")"
    echo "  $f → $n 个账号"
  fi
done
echo "日期：$STAMP　（生成的观察文件会留在 tools/ 下，第二天跑会算出粉丝增量）"

# 两个采集器都挂掉才算失败；只挂一个也把结果留下
if [ "$XHS_RC" -ne 0 ] && [ "$DY_RC" -ne 0 ]; then
  echo "✗ 两个采集器都没跑成"
  exit 1
fi
exit 0
