#!/usr/bin/env node
// 从 tools/xhs-targets.json 生成一份人看的《竞品账号清单-待确认.md》
// 用途：把「机器清单」变成「你可以直接在上面划删除线、回我删哪几个」的表。
// 只读 xhs-targets.json，不改任何东西。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const TIER_ORDER = ["自我基准", "对标-头部", "对标-中腰部", "对标-长尾", "待确认-低粉"];
const TIER_HINT = {
  "自我基准": "你自己的官号（用户已确认：晓学茉莉 就是唯一官号），作为对照基准",
  "对标-头部": "赛道里你能看到的最高水位，值得逐条拆",
  "对标-中腰部": "和你的量级最接近，选题与节奏最值得抄",
  "对标-长尾": "单点打法有参考，不必逐条跟",
  "待确认-低粉": "⚠️ 百粉以下，看昵称像家长个人号（用户已确认整批删除，这里不该再出现）",
};

const accounts = JSON.parse(readFileSync(resolve(HERE, "xhs-targets.json"), "utf8"));

function pick(notes, label) {
  const m = new RegExp(`${label}\\s*([0-9,]+)`).exec(notes || "");
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

const rows = accounts.map((a, i) => {
  const fans = pick(a.notes, "粉丝");
  const likes = pick(a.notes, "获赞收藏");
  const hits = pick(a.notes, "命中笔记");
  return { ...a, i: i + 1, fans, likes, hits };
});

const groups = TIER_ORDER.map((tier) => ({
  tier,
  hint: TIER_HINT[tier] || "",
  items: rows.filter((r) => r.category === tier),
})).filter((g) => g.items.length);

let md = "";
md += "# 竞品账号清单 · 定稿\n\n";
md += `> 来源：\`C:/Users/A/Desktop/测试xlsx.xlsx\`（小红书笔记级导出，301 条笔记、21 个字段，去重后 37 个账号）。\n`;
md += `> 用户已确认三件事：① 不补赛道头部号（那份表本来就是测试用）；② 20 个百粉以下的小号整批删除；③ 晓学茉莉就是唯一的官方账号。\n`;
md += `> 被删的 20 个没有丢，存档在 \`tools/xhs-targets.removed.json\`，带删除原因，随时可恢复。\n`;
md += `> 本文件由 \`tools/build-account-list.mjs\` 从 \`tools/xhs-targets.json\` 生成，改清单请改 JSON 再重跑，别直接改这里。\n\n`;

md += "## 一、总览\n\n";
md += "| 分层 | 数量 | 说明 |\n|---:|---:|---|\n";
for (const g of groups) md += `| ${g.tier} | ${g.items.length} | ${g.hint} |\n`;
md += `| **合计** | **${accounts.length}** | 每天有新笔记的号才会被「竞品」栏推送（`+ "`--min-notes`" + ` 闸门） |\n\n`;

md += "## 二、逐条清单\n\n";
for (const g of groups) {
  md += `### ${g.tier}（${g.items.length} 个）\n\n`;
  if (g.hint) md += `_${g.hint}_\n\n`;
  md += "| # | 昵称 | 小红书号 | uid | 抓取时粉丝 | 获赞与收藏 | 名单内命中笔记 | 备注 |\n";
  md += "|---:|---|---|---|---:|---:|---:|---|\n";
  for (const r of g.items) {
    md += `| ${r.i} | ${r.name} | \`${r.red_id || "-"}\` | \`${r.uid}\` | ${r.fans ?? "-"} | ${r.likes ?? "-"} | ${r.hits ?? "-"} | |\n`;
  }
  md += "\n";
}

md += "## 三、已拍板的三件事\n\n";
md += "1. ~~补赛道头部号~~ → **不补**。用户：那份表本来就是测试用的。\n";
md += "2. ~~20 个百粉以下的小号留不留~~ → **整批删**。已删，存档在 `tools/xhs-targets.removed.json`。\n";
md += "3. ~~自我基准位要不要换成真官号~~ → **不用换**。用户：晓学茉莉就是唯一的官方账号。\n\n";

md += "## 四、还缺两个号的 uid（你有号就补给我）\n\n";
md += "- **芥舟语文**：本机小红书工具搜「芥舟语文」只返回 芥末语文 / 渔舟语文 / 柏舟语文 / 舟舟语文，**没有精确匹配**。我没替你猜 uid。\n";
md += "- **重庆南星家长圈**：同上。\n\n";

md += "---\n\n";
md += "清单文件本体（脚本读的）：`tools/xhs-targets.json` · 删除存档：`tools/xhs-targets.removed.json` · 采集脚本：`tools/collect-competitor-xhs.py`\n";
md += "采集脚本自带三道闸门：`--min-notes`（窗口内至少几条新笔记才推）、`--viral-min`（单条至少多少赞才算爆款，日报用 20，看真爆款请用长窗口复盘）、`--max`（一轮最多推几个号）。\n";
md += "改清单：编辑 `tools/xhs-targets.json`，然后重跑 `node tools/build-account-list.mjs` 刷新本文件；想删一批就 `node tools/prune-targets.mjs --drop-tier <分层名>`。\n";

const out = resolve(ROOT, "竞品账号清单.md");
writeFileSync(out, md, "utf8");
console.log(`✓ ${out}`);
console.log(`  ${accounts.length} 个账号 · ${groups.map((g) => g.tier + " " + g.items.length).join(" / ")}`);
