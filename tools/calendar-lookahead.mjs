#!/usr/bin/env node
// 从 industry/calendar.json 生成「未来 N 天的内容排期表」。
//
// 为什么需要它：站点上的「日历」栏目收的是**节点相关的热点资讯**（校历发布、秋假安排、报名时间明确
// 这类真实稿件），它回答「发生了什么」；而这份表回答「接下来该准备什么内容」——两者互补。
//
// 用法：
//   node tools/calendar-lookahead.mjs                 # 未来 90 天
//   node tools/calendar-lookahead.mjs --days 30
//   node tools/calendar-lookahead.mjs --from 2026-11-01 --days 120
//   node tools/calendar-lookahead.mjs --out 我的排期.md
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(HERE, "..");
const CAL = JSON.parse(fs.readFileSync(path.join(BASE, "industry", "calendar.json"), "utf8"));

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const DAYS = Number(arg("days", 90));
const FROM = arg("from", new Date().toISOString().slice(0, 10));
const OUT = arg("out", `行业日历-未来${DAYS}天.md`);

const DAY_MS = 86_400_000;
const fromMs = Date.parse(`${FROM}T00:00:00+08:00`);
const toMs = fromMs + DAYS * DAY_MS;

const nodeOf = new Map(CAL.nodeTypes.map((n) => [n.key, n]));
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
const fmt = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}月${d}日`;
};
const wd = (iso) => `周${WEEKDAY[new Date(`${iso}T12:00:00+08:00`).getUTCDay()]}`;
const daysUntil = (iso) => Math.ceil((Date.parse(`${iso}T00:00:00+08:00`) - fromMs) / DAY_MS);

/** 与窗口有交集的条目；已结束的排除。 */
const rows = CAL.entries
  .map((e) => ({ ...e, node: nodeOf.get(e.nodeType) }))
  .filter((e) => e.node)
  .filter((e) => {
    const start = Date.parse(`${e.start}T00:00:00+08:00`);
    const end = e.end ? Date.parse(`${e.end}T23:59:59+08:00`) : start;
    return end >= fromMs && start <= toMs;
  })
  .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

const lines = [];
lines.push(`# 教育行业日历 · 未来 ${DAYS} 天内容排期`);
lines.push("");
lines.push(`> 口径：${CAL.scope}　｜　版本：${CAL.version}　｜　窗口：${FROM} 起 ${DAYS} 天　｜　数据：\`industry/calendar.json\``);
lines.push("");
lines.push(`> 置信度：**已公布** = 官方文件写明，可直接用；**惯例** = 往年或全国统一口径，官方公布后需复核；**区县自定** = 市教委下放，需逐区县核对。`);
lines.push("");

if (rows.length === 0) {
  lines.push(`这 ${DAYS} 天内没有已录入的节点。`);
} else {
  const imminent = rows.filter((r) => daysUntil(r.start) >= 0 && daysUntil(r.start) <= 21);
  const ongoing = rows.filter((r) => daysUntil(r.start) < 0);
  if (ongoing.length) {
    lines.push("## 正在进行");
    lines.push("");
    for (const r of ongoing) lines.push(`- **${r.node.name}｜${r.title}**　${fmt(r.start)}—${fmt(r.end ?? r.start)}　\`${r.confidence}\``);
    lines.push("");
  }
  if (imminent.length) {
    lines.push("## 21 天内（该动手了）");
    lines.push("");
    for (const r of imminent) {
      const d = daysUntil(r.start);
      lines.push(`- **剩 ${d} 天 · ${r.node.name}**｜${r.title}`);
      lines.push(`  - ${fmt(r.start)}${r.end && r.end !== r.start ? `—${fmt(r.end)}` : ""}（${wd(r.start)}）　适用：${r.appliesTo}　\`${r.confidence}\``);
      if (r.node.contentPlay) lines.push(`  - 内容动作：${r.node.contentPlay}`);
    }
    lines.push("");
  }
  lines.push("## 全量节点表");
  lines.push("");
  lines.push("| 距今天 | 节点 | 日期 | 适用对象 | 确定性 |");
  lines.push("|---:|---|---|---|---|");
  for (const r of rows) {
    const d = daysUntil(r.start);
    const span = r.end && r.end !== r.start ? `${fmt(r.start)}—${fmt(r.end)}` : fmt(r.start);
    lines.push(`| ${d >= 0 ? `剩 ${d} 天` : `已开始 ${-d} 天`} | ${r.node.name} | ${span} | ${r.appliesTo} | ${r.confidence} |`);
  }
  lines.push("");
  lines.push("## 节点怎么做内容");
  lines.push("");
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.node.key)) continue;
    seen.add(r.node.key);
    lines.push(`### ${r.node.name}`);
    lines.push("");
    lines.push(`- 时间窗：${r.node.window}`);
    lines.push(`- 是什么：${r.node.what}`);
    lines.push(`- 内容动作：${r.node.contentPlay}`);
    lines.push("");
  }
}

lines.push("---");
lines.push("");
lines.push(`由 \`tools/calendar-lookahead.mjs\` 生成，改日期请编辑 \`industry/calendar.json\` 后重跑。`);
lines.push("");

fs.writeFileSync(path.join(BASE, OUT), lines.join("\n"), "utf8");

// 顺带报一下校验结果，避免生成一份建立在坏数据上的排期
const tagSet = new Set();
const tax = fs.readFileSync(path.join(BASE, "industry", "taxonomy.ts"), "utf8");
const block = tax.slice(tax.indexOf("export const TOPIC_TAGS"), tax.indexOf("export const ENTITY_TAGS"));
for (const m of block.matchAll(/"([^"]+)"/g)) tagSet.add(m[1]);
const badTags = CAL.nodeTypes.filter((n) => n.tag && !tagSet.has(n.tag)).map((n) => `${n.name}→${n.tag}`);
const badRefs = CAL.entries.filter((e) => !nodeOf.has(e.nodeType)).map((e) => e.id);

console.log(`已生成 ${OUT}：${rows.length} 个节点在窗口内`);
if (badTags.length) console.log(`⚠ 有节点标签不在 TOPIC_TAGS 里：${badTags.join(", ")}`);
if (badRefs.length) console.log(`⚠ 有条目的 nodeType 未在 nodeTypes 里声明：${badRefs.join(", ")}`);
