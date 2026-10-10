#!/usr/bin/env node
/**
 * 教育HOT · 竞品账号采集（抖音）· 走飞瓜公开榜单
 * ================================================
 *
 * 和「部署」无关：飞瓜数据的抖音行业排行榜是**公开可读的网页**，
 * 本脚本直接抓它，不需要登录态、不需要付费、不需要任何 key。
 *
 *   node tools/collect-competitor-douyin.mjs --dry-run
 *   node tools/collect-competitor-douyin.mjs --period week --watch 重庆
 *   node tools/collect-competitor-douyin.mjs --tags 13,3 --push
 *
 * 能拿到什么（实测 2026-09-29）：
 *   · 行业榜前 20：播主、飞瓜指数、粉丝数、点赞增量、评论增量、转发增量、详情页链接
 *   · 日 / 周 / 月 三档周期
 *   · 往回 31 天的历史日榜（所以可以算「今天新上榜了谁」）
 *
 * 行业标签 id（`--tags` 用）：13 教育校园 · 3 亲子 · 21 母婴 · 4 人文社科 · 31 科普 · 24 法律
 *
 * ── 为什么这条线比小红书「薄」 ───────────────────────────────────
 * 飞瓜公开榜只给前 20 名的**汇总指标**，不给单条作品明细，也不支持任意账号查询。
 * 所以它的定位是「**行业头部今天在动什么**」，不是「盯住某三个对标号」。
 * 要盯具体账号，用小红书那条线（tools/collect-competitor-xhs.py），或者
 * 用 competitor-monitor 技能的 live 模式（借你浏览器的登录态读单个主页）。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? true) : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const TAG_NAMES = {
  13: "教育校园", 3: "亲子", 21: "母婴", 4: "人文社科", 31: "科普", 24: "法律",
  14: "文化", 34: "职场", 37: "财经", 8: "剧情", 33: "美食", 35: "舞蹈", 36: "艺术",
};
const BASE = "http://dy.feigua.cn";

if (has("help") || has("h") || argv.length === 0) {
  console.log(`教育HOT 竞品采集（抖音）· 走飞瓜公开榜单

用法
  node tools/collect-competitor-douyin.mjs [选项]

选项
  --tags <ids>      行业标签，逗号分隔（默认 13 = 教育校园）
                    可选：13 教育校园 · 3 亲子 · 21 母婴 · 4 人文社科 · 31 科普 · 24 法律
  --period <p>      day | week | month（默认 day）
  --date <YYYY-MM-DD>  榜单日期（默认今天；日榜可回溯 31 天）
  --top <n>         每条榜单取前几名（默认 20，飞瓜公开榜上限就是 20）
  --watch <词>      关注的词（逗号分隔），命中的账号在标题里点名，如 --watch 重庆,升学
  --out <file>      观察文件输出路径（默认 tools/_obs-竞品-抖音.json）
  --push            生成后顺手推给站点（需要 INGEST_TOKEN）
  --push-only       不抓取，直接把已有的 --out 文件推给站点
  --dry-run         只抓不写文件、不推送，把结果打到屏幕

它给不了什么
  飞瓜公开榜只有汇总指标（粉丝数 + 增量），没有单条作品明细、也不支持任意账号查询。
  要盯具体对标号，用小红书那条线：python tools/collect-competitor-xhs.py
`);
  process.exit(0);
}

const period = String(flag("period", "day"));
const outFile = resolve(process.cwd(), String(flag("out", "tools/_obs-竞品-抖音.json")));
const dryRun = has("dry-run");
const topN = Number(flag("top", 20));
const watch = String(flag("watch", "")).split(",").map((s) => s.trim()).filter(Boolean);
const passThrough = has("pass-through") || has("push-only");

const today = new Date();
const dateArg = flag("date", null);
const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
/** 20260929 → 2026-09-29 */
const dash = (k) => String(k).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
const dayKey = dateArg ? String(dateArg).replace(/-/g, "") : fmt(today);
const prevKey = (() => {
  const d = dateArg ? new Date(String(dateArg)) : new Date(today);
  d.setDate(d.getDate() - 1);
  return fmt(d);
})();

const tagIds = String(flag("tags", "13")).split(",").map((s) => s.trim()).filter(Boolean);

// ─── 小工具 ──────────────────────────────────────────────────────────
/** "1749.7w" / "1.6w" / "2035" → 数字。飞瓜用 w 表示万。 */
function parseCount(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/[,，\s]/g, "");
  const m = /^([\d.]+)\s*([wW万kK亿]?)/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = m[2].toLowerCase();
  if (u === "w" || u === "万") return Math.round(n * 10000);
  if (u === "k") return Math.round(n * 1000);
  if (u === "亿") return Math.round(n * 100000000);
  return Math.round(n);
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", hellip: "…" };
/** 去标签 + 解 HTML 实体。飞瓜的昵称里带 emoji 的十进制实体（&#128293; = 🔥），不解码就会原样进标题。 */
const stripTags = (s) =>
  String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();

/** 解析一个榜单页 → [{rank,name,index,fans,likeDelta,commentDelta,shareDelta,url}] */
function parseBoard(html) {
  const title = stripTags((html.match(/<title>([^<]*)<\/title>/) || [])[1] || "");
  // 先按 <tr> 切开，每行独立解析，比跨行正则稳
  const rows = [];
  for (const chunk of html.split(/<tr[^>]*>/i)) {
    const idMatch = /href="\/bloggeropen\/([A-Z0-9]+)"/.exec(chunk);
    if (!idMatch) continue;
    const nameMatch = /<td class="person-publicnum text-left">[\s\S]*?<span>([^<]+)<\/span>/.exec(chunk);
    if (!nameMatch) continue;
    const rankMatch = /<span class="rank rank">\s*(\d+)\s*<\/span>/.exec(chunk);
    // 名字后面还有 5 个纯数字 td：指数 / 粉丝数 / 点赞增量 / 评论增量 / 转发增量
    const cells = [...chunk.matchAll(/<td[^>]*>\s*([\d.]+[wW万kK亿]?)\s*<\/td>/g)].map((m) => m[1]);
    rows.push({
      rank: rankMatch ? Number(rankMatch[1]) : null,
      name: stripTags(nameMatch[1]),
      index: parseCount(cells[0]),
      fans: parseCount(cells[1]),
      likeDelta: parseCount(cells[2]),
      commentDelta: parseCount(cells[3]),
      shareDelta: parseCount(cells[4]),
      url: `${BASE}/bloggeropen/${idMatch[1]}`,
    });
  }
  return { title, rows };
}

async function fetchBoard(tag, key, per) {
  const url = `${BASE}/rank/tag/${tag}/${per}/${key}.html`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
    if (!res.ok) return { url, error: `HTTP ${res.status}` };
    const { title, rows } = parseBoard(await res.text());
    if (!rows.length) return { url, error: "页面没有榜单数据（可能这天没出榜）" };
    return { url, title, rows };
  } catch (error) {
    return { url, error: error.message };
  }
}

const num = (n) => (n == null ? "?" : n.toLocaleString("zh-CN"));
const sign = (n) => (n == null ? "?" : (n > 0 ? "+" : "") + n.toLocaleString("zh-CN"));

// ─── 主流程 ──────────────────────────────────────────────────────────
const nowIso = new Date().toISOString();
const accounts = [];

console.log(`抖音行业榜｜周期 ${period}｜日期 ${dayKey}｜标签 ${tagIds.map((t) => `${t}(${TAG_NAMES[t] ?? "?"})`).join(" ")}`);

for (const tag of tagIds) {
  const label = TAG_NAMES[tag] ?? `标签 ${tag}`;
  console.log(`\n▶ ${label}（tag ${tag}）`);

  const cur = await fetchBoard(tag, dayKey, period);
  if (cur.error) {
    console.log(`  ⚠ 取不到：${cur.error}`);
    continue;
  }
  const rows = cur.rows.slice(0, topN);
  console.log(`  ✓ ${rows.length} 名｜榜单日期：${(cur.title.match(/(\d{4}年\d{2}月\d{2}日)/) || [])[1] ?? "?"}`);

  // 与上一期对比 → 新上榜的人。历史日榜可取，所以这个信号是真的。
  let newFaces = [];
  if (period === "day") {
    const prev = await fetchBoard(tag, prevKey, period);
    if (!prev.error) {
      const before = new Set(prev.rows.map((r) => r.name));
      newFaces = rows.filter((r) => !before.has(r.name));
      console.log(`  较前一日：新上榜 ${newFaces.length} 个${newFaces.length ? "（" + newFaces.slice(0, 4).map((r) => r.name).join("、") + "）" : ""}`);
    }
  }

  const gainTop = [...rows].filter((r) => r.likeDelta != null).sort((a, b) => b.likeDelta - a.likeDelta).slice(0, 3);
  const matched = watch.length ? rows.filter((r) => watch.some((w) => r.name.includes(w))) : [];
  if (watch.length) {
    console.log(`  关注词 ${watch.join("/")} 命中：${matched.length ? matched.map((r) => r.name).join("、") : "无"}`);
  }

  // summary 只写「metrics 讲不了的那半」——头部数字交给推送脚本按 basis:"board" 渲染，
  // 两边都写同一条会变成复读。
  const bits = [`榜单日期 ${dash(dayKey)}`];
  if (gainTop.length > 1) bits.push(`紧随其后 ${gainTop.slice(1).map((r) => `${r.name}（${sign(r.likeDelta)}）`).join("、")}`);
  if (period === "day" && newFaces.length) bits.push(`新上榜 ${newFaces.map((r) => r.name).join("、")}`);
  if (matched.length) bits.push(`你关注的号在榜：${matched.map((r) => `${r.name}（第 ${r.rank} 名 / ${num(r.fans)} 粉）`).join("、")}`);

  accounts.push({
    platform: "抖音",
    name: `${label}行业榜`,
    handle: `feigua-tag-${tag}`,
    // 榜单页本身就是稳定 URL：每天推同一条 → 站点记为修订 → 重新分析
    profileUrl: `${BASE}/rank/tag/${tag}/${period}/${dayKey}.html`,
    window: period === "day" ? `${dash(prevKey)}..${dash(dayKey)}` : dash(dayKey),
    observedAt: nowIso,
    summary: bits.join("；"),
    // basis:"board" 告诉推送脚本「这是榜单，数字要念成上榜数/增量」，
    // 否则标题会写成「单条最高 X 赞」——那是错的，榜单给的是一段周期的增量。
    metrics: {
      basis: "board",
      notes: rows.length,
      likeDeltaTop: gainTop[0]?.likeDelta ?? null,
      viral: rows.filter((r) => (r.likeDelta ?? 0) >= 10000).length,
      newFaces: period === "day" ? newFaces.length : null,
      followerTotal: rows[0]?.fans ?? null,
    },
    highlights: gainTop.slice(0, 2).map((r) => ({
      title: `${r.name}（榜第 ${r.rank} 名）点赞增量 ${sign(r.likeDelta)}，粉丝 ${num(r.fans)}`,
      url: r.url,
      likes: r.likeDelta,
      publishedAt: nowIso,
    })),
    notes: [
      `标签：${label}`,
      `周期：${period}`,
      `榜单日期：${dayKey}`,
      newFaces.length ? `新上榜：${newFaces.map((r) => r.name).join("、")}` : null,
      matched.length ? `关注命中：${matched.map((r) => `${r.name}（第${r.rank}名/${num(r.fans)}粉）`).join("、")}` : null,
      `完整前十：${rows.slice(0, 10).map((r) => `${r.rank}.${r.name}(${num(r.fans)})`).join("  ")}`,
    ].filter(Boolean).join("｜"),
  });
}

if (!accounts.length) {
  console.error("\n✗ 一条都没抓到。检查网络，或换 --date 试前一两天（飞瓜可能延迟出榜）。");
  process.exit(1);
}

const doc = {
  _generated: `由 tools/collect-competitor-douyin.mjs 于 ${nowIso} 抓取（飞瓜公开榜，周期 ${period}，日期 ${dayKey}）`,
  _source: "飞瓜数据公开行业榜（无需登录）",
  _caution: "公开榜只有前 20 名的汇总指标，不代表全行业；粉丝/增量是飞瓜的估算口径，与中国站内数据可能有差。站点精选标准里竞品类 cred 只给 1，正因为这类数字无法独立核验。",
  accounts,
};

if (dryRun) {
  console.log("\n--- DRY RUN，不写文件 ---\n");
  console.log(JSON.stringify(doc, null, 2).slice(0, 6000));
  process.exit(0);
}

if (passThrough) {
  await pushToSite(outFile);
  process.exit(0);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(doc, null, 2) + "\n", "utf8");
console.log(`\n✓ 观察文件：${outFile}（${accounts.length} 条榜单）`);

if (has("push")) {
  await pushToSite(outFile);
} else {
  console.log(`\n下一步（推送进站，需要站点在跑 + INGEST_TOKEN）：`);
  console.log(`  node tools/collector-competitor.mjs --kind competitor --in "${outFile}"`);
}

async function pushToSite(file) {
  const { spawnSync } = await import("node:child_process");
  const collector = resolve(REPO, "tools/collector-competitor.mjs");
  console.log(`\n→ 交给推送脚本：${collector}`);
  // 注意：这台机器上 Node 起不了子进程（EBUSY），所以这里很可能失败。
  // 失败也没关系，照提示手动跑那一条命令即可——Python 起子进程是正常的。
  const r = spawnSync(process.execPath, [collector, "--kind", "competitor", "--in", file], { stdio: "inherit" });
  if (r.error || r.status !== 0) {
    console.error(`\n⚠ 自动推送没成功（${r.error?.code ?? `退出码 ${r.status}`}）。手动跑这一条：`);
    console.error(`  node tools/collector-competitor.mjs --kind competitor --in "${file}"`);
    process.exit(1);
  }
  process.exit(0);
}
