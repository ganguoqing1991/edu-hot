#!/usr/bin/env node
/**
 * 教育HOT · 竞品账号 / 行业日历 · 外部推送脚本（骨架 + 可直接跑）
 * ==========================================================
 *
 * 站点上「竞品」和「日历」两栏的数据，走的是 AIHOT 的 external source 通道：
 * 站点不抓网、不需要 key，采集脚本自己 POST 到 /api/ingest/items。
 *
 *   node tools/collector-competitor.mjs --kind competitor --in obs.json
 *   node tools/collector-competitor.mjs --kind competitor --in obs.json --dry-run
 *   node tools/collector-competitor.mjs --kind calendar   --in cal.json
 *
 * 需要的环境变量（放在仓库根目录的 .env 里，或用 --base / --token 传）：
 *   INGEST_TOKEN   至少 16 位，占位串会被拒（服务端 PLACEHOLDER 正则）
 *   SITE_URL       API 地址，默认 http://127.0.0.1:3000
 *
 * ─── 三个必须知道的坑（都是读源码读出来的，不是猜的） ───────────────
 *
 * 1) **48 小时陈旧判定**（packages/backend/src/content/materials.ts:62,79）
 *    如果 publishedAt 比「发现时间」早超过 48 小时，这条会被判成 backfill →
 *    isHistorical = true → **永远不会出现在「今天」的新闻里，也不进事件图、不加热度**。
 *    所以竞品周报**绝不能**把 publishedAt 写成窗口起始日（比如 9/22 发 9/22–9/28 的周报）。
 *    本脚本因此把 publishedAt 一律设成**快照时刻（observedAt，通常是现在）**——
 *    语义上也对：这份快照是"现在"才有的。超 48 小时会给你警告。
 *
 * 2) **正文推不上来**（apps/api/src/routes/ingest.ts → packages/backend/src/ingest/items.ts:19）
 *    ingest 接口只接受 title / url / publishedAt / author / raw，**没有 body 字段**。
 *    而且 raw 不会被分析提示词读到（只有 web-list / media / monitor 会读它）。
 *    所以**标题必须自包含**——模型只拿得到标题。
 *    另外 bare 条目若 URL 可抓（小红书/抖音的 URL 都算"可抓"，
 *    extract.ts:96 只排除了 x.com 和 mp.weixin.qq.com），站点会去抓一次，
 *    大概率撞登录墙 → 正文状态 unconfirmed → 仍然只按标题判。
 *    结论：**把该说的话写进标题**，本脚本的 buildTitle() 就是干这个的。
 *
 * 3) **一账号一窗口一个固定 URL**
 *    identity key 来自 URL（lib/url.ts）。同一个 URL 再次提交且标题变了 → 记为
 *    **新修订**（materials.ts:171），会重新走一遍分析。所以"同一个账号同一周、
 *    每天更新一次快照"的用法是：URL 固定（profile + ?w=窗口起始日），标题随数据变。
 *    注意 lib/url.ts 会删掉 from/source/scene/share_source 等跟踪参数，
 *    但**保留** w / date 这类自有参数——所以用 ?w= 是安全的。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

// ─── 参数 ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? true) : fallback;
};
const has = (name) => argv.includes(`--${name}`);

if (has("help") || has("h") || argv.length === 0) {
  console.log(`教育HOT 竞品/日历推送脚本

用法
  node tools/collector-competitor.mjs --kind competitor --in obs.json [选项]
  node tools/collector-competitor.mjs --kind calendar   --in cal.json  [选项]

选项
  --kind <competitor|calendar>  推哪个信源（默认 competitor）
  --in <file>                   观察数据 JSON（必填）
  --base <url>                  API 地址（默认 env SITE_URL 或 http://127.0.0.1:3000）
  --token <t>                   ingest token（默认 env INGEST_TOKEN）
  --out <file>                  把 payload 写到文件，不发请求（便于先看再发）
  --dry-run                     只打印将要发的内容，不看 env、不发请求
  --limit <n>                   最多推几条（默认全部，单次请求上限 50）
  --sleep <ms>                  分批之间的间隔（默认 6500ms，服务端限 10 次/分钟）

信源 id
  competitor → ext-gq-competitor（sources.json 里已声明，T2 / editorial）
  calendar   → ext-gq-calendar  （sources.json 里已声明，T1 / editorial）

输入格式见 tools/sample-observations.competitor.json 与 ...calendar.json
`);
  process.exit(0);
}

const kind = String(flag("kind", "competitor"));
const SOURCE = {
  competitor: { id: "ext-gq-competitor", name: "竞品账号监测（小红书 / 抖音 / 视频号）", label: "竞品" },
  calendar: { id: "ext-gq-calendar", name: "教育行业日历 · 节点与日程", label: "日历" },
}[kind];
if (!SOURCE) {
  console.error(`✗ --kind 只能是 competitor 或 calendar，收到 ${kind}`);
  process.exit(2);
}

const inFile = flag("in");
if (!inFile || inFile === true) {
  console.error("✗ 缺 --in <file>，用 --help 看格式");
  process.exit(2);
}

const dryRun = has("dry-run");
const base = String(flag("base", process.env.SITE_URL || "http://127.0.0.1:3000")).replace(/\/+$/, "");
const token = String(flag("token", process.env.INGEST_TOKEN || ""));
const outFile = flag("out", null);
const limit = Number(flag("limit", 0)) || 0;
const sleepMs = Number(flag("sleep", 6500));

const INGEST_URL = `${base}/api/ingest/items`;

// ─── 小工具 ──────────────────────────────────────────────────────────
const STALE_MS = 48 * 3600 * 1000; // 与 materials.ts:62 保持一致
const FUTURE_MS = 3600 * 1000; // materials.ts:64

const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.log(`  ⚠ ${msg}`);
};

/** 标题里的数字要克制：站点自己的规则是「材料没给数字就不写数字」。 */
const fmtInt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("zh-CN") : null);
const clamp = (s, n) => (Array.from(s).length <= n ? s : Array.from(s).slice(0, n - 1).join("") + "…");

/** 把 "2026-09-22..2026-09-28" / "2026-09-22/2026-09-28" 拆成起止。 */
function parseWindow(w) {
  if (!w) return { start: null, end: null, days: null, text: null };
  // 先按"完整的日期对"匹配，否则 - 会把 2026-09-22 自己切碎
  const pair = /(\d{4}-\d{2}-\d{2})\s*(?:\.\.|~|至|—|--|\/)\s*(\d{4}-\d{2}-\d{2})/.exec(String(w));
  if (pair) {
    const start = pair[1];
    const end = pair[2];
    const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1);
    return { start, end, days, text: `${days} 天` };
  }
  const one = /(\d{4}-\d{2}-\d{2})/.exec(String(w));
  if (one) return { start: one[1], end: one[1], days: 1, text: `1 天` };
  return { start: null, end: null, days: null, text: String(w) };
}

/**
 * 检查一个时间戳会不会被站点判成历史回灌（>48h）或被丢弃（未来 >1h）。
 * 只报警告、不改值——爆款条目要保留它真实的发布时间。
 */
function inspectTime(t, label) {
  const now = new Date();
  const age = now.getTime() - t.getTime();
  if (age > STALE_MS) {
    warn(
      `${label}：时间戳（${t.toISOString()}）比现在早 ${(age / 3600000).toFixed(1)} 小时，` +
        `超过站点 48 小时的陈旧阈值 → 会被当成历史回灌，不进「今天」、不进事件图、不加热度。`,
    );
  }
  if (t.getTime() - now.getTime() > FUTURE_MS) {
    warn(`${label}：时间戳（${t.toISOString()}）在未来，站点会丢弃它`);
  }
}

/**
 * 快照时刻：一旦这个值比"现在"早超过 48 小时，条目就会被判成历史回灌。
 * 所以这里刻意不取窗口起始日。
 */
function snapshotTime(observedAt, label) {
  const now = new Date();
  if (!observedAt) return now;
  const t = new Date(observedAt);
  if (!Number.isFinite(t.getTime())) {
    warn(`${label}：observedAt 不是合法时间（${observedAt}），改用当前时间`);
    return now;
  }
  inspectTime(t, label);
  return t;
}

/** 一个账号 + 一个窗口 → 一个稳定 URL（带 ?w=，lib/url.ts 会保留这个参数）。 */
function rollupUrl(account) {
  const profile = account.profileUrl || account.url;
  if (!profile) return null;
  const w = parseWindow(account.window);
  const anchor = w.start || new Date().toISOString().slice(0, 10);
  try {
    const u = new URL(profile);
    u.searchParams.set("w", anchor);
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * 自包含标题：平台 / 账号 / 窗口 / 动作 / 可观测结果。没有数字就不编数字。
 *
 * metrics.basis 决定「数字该怎么念」——
 *   省略 / "account"：一个账号的动态（N 条更新、单条最高 X 赞）
 *   "board"：一张行业榜单（N 个账号上榜、点赞增量最高 X）
 * 混用会让标题说错话：榜单的「点赞增量」不是「单条最高赞」，那是两回事。
 */
function buildTitleCompetitor(a) {
  const w = parseWindow(a.window);
  const win = w.text ? `近 ${w.text}` : "";
  const bits = [];
  const m = a.metrics || {};
  const board = m.basis === "board";

  if (board) {
    const rows = [fmtInt(m.notes), fmtInt(m.posts)].find(Boolean);
    if (rows) bits.push(`${rows} 个账号上榜`);
    if (m.likeDeltaTop) bits.push(`点赞增量最高 ${fmtInt(m.likeDeltaTop)}`);
    if (m.viral != null && Number(m.viral) > 0) bits.push(`${fmtInt(m.viral)} 个增量过万`);
    if (m.newFaces != null) bits.push(`新上榜 ${fmtInt(m.newFaces)} 个`);
    if (m.followerTotal) bits.push(`榜首粉丝 ${fmtInt(m.followerTotal)}`);
  } else {
    const posts = [fmtInt(m.notes), fmtInt(m.videos), fmtInt(m.posts)].find(Boolean);
    if (posts) bits.push(`${posts} 条更新`);
    if (m.bestLikes) bits.push(`单条最高 ${fmtInt(m.bestLikes)} 赞`);
    else if (m.avgLikes) bits.push(`均赞 ${fmtInt(m.avgLikes)}`);
    if (m.viral != null && Number(m.viral) > 0) bits.push(`${fmtInt(m.viral)} 条过万赞`);
    if (m.followerDelta) bits.push(`${m.followerDelta > 0 ? "涨粉" : "掉粉"} ${fmtInt(Math.abs(m.followerDelta))}`);
    else if (m.followerTotal) bits.push(`粉丝 ${fmtInt(m.followerTotal)}`);
    if (m.liveSessions) bits.push(`${fmtInt(m.liveSessions)} 场直播`);
  }

  const head = `${SOURCE.label}观察｜${a.platform || "社媒"}·${a.name || "未命名账号"}`;
  // 榜单没有「窗口」这回事（它本来就是某一天的切面），日期由 summary 交代，别重复
  const body = [
    board ? bits.join("，") : win ? `${win}${bits.length ? " " + bits.join("，") : ""}` : bits.join("，"),
    a.summary || "",
  ]
    .filter(Boolean)
    .join("；");

  return clamp(body ? `${head}：${body}` : head, 200);
}

/** 日历条目：节点名 + 起止 + 适用范围 + 出处。日历的价值是确定性，所以日期必须写全。 */
function buildTitleCalendar(e) {
  const span = e.start ? `${e.start}${e.end && e.end !== e.start ? `—${e.end}` : ""}` : e.window || "时间待定";
  const bits = [span];
  if (e.appliesTo) bits.push(e.appliesTo);
  if (e.nodeType) bits.push(`节点：${e.nodeType}`);
  if (e.basis) bits.push(`出处：${e.basis}`);
  const head = `行业日历｜${e.title || e.nodeName || "未命名节点"}`;
  return clamp(`${head}（${bits.join(" · ")}）`, 200);
}

// ─── 读输入 ──────────────────────────────────────────────────────────
const inPath = resolve(process.cwd(), String(inFile));
if (!existsSync(inPath)) {
  console.error(`✗ 读不到 ${inPath}`);
  console.error(`  示例：cp tools/sample-observations.${kind}.json ./${kind}-obs.json 然后改内容`);
  process.exit(2);
}

let doc;
try {
  doc = JSON.parse(readFileSync(inPath, "utf8"));
} catch (error) {
  console.error(`✗ ${inPath} 不是合法 JSON：${error.message}`);
  process.exit(2);
}

// ─── 组装 items ──────────────────────────────────────────────────────
const items = [];

if (kind === "competitor") {
  const accounts = Array.isArray(doc) ? doc : doc.accounts;
  if (!Array.isArray(accounts) || !accounts.length) {
    console.error("✗ 输入里没有 accounts[]。格式见 tools/sample-observations.competitor.json");
    process.exit(2);
  }

  for (const a of accounts) {
    const who = `${a.platform || "?"}·${a.name || "未命名"}`;
    const title = buildTitleCompetitor(a);
    const url = rollupUrl(a);
    if (!url) {
      warn(`${who}：没有 profileUrl/url，跳过（需要网址才能定身份）`);
      continue;
    }
    const at = snapshotTime(a.observedAt, who);

    items.push({
      title,
      url,
      publishedAt: at.toISOString(),
      author: a.name || undefined,
      // raw 存着，方便以后回溯；但注意提示词读不到它（见文件头第 2 条坑）。
      raw: { kind: "competitor_rollup", platform: a.platform, handle: a.handle, window: a.window, metrics: a.metrics || null, notes: a.notes || null },
    });

    // 单条爆款的真实链接也一并推——它有自己的 URL，会独立成一条，可能单独进精选。
    const board = (a.metrics || {}).basis === "board";
    for (const h of a.highlights || []) {
      if (!h?.url || !h?.title) continue;
      const label = `${who} 的${board ? "上榜" : "爆款"}《${h.title}》`;
      let t = at;
      if (h.publishedAt) {
        const parsed = new Date(h.publishedAt);
        if (Number.isFinite(parsed.getTime())) {
          t = parsed;
          inspectTime(t, label);
        } else {
          warn(`${label}：publishedAt 不是合法时间，改用快照时间`);
        }
      }
      // 榜单条目里的数字是「周期增量」，不能写成「赞」——那是两回事
      const suffix = board ? "" : h.likes ? `· 赞 ${fmtInt(h.likes)}` : "";
      items.push({
        title: clamp(`${SOURCE.label}${board ? "上榜" : "爆款"}｜${a.platform || "社媒"}·${a.name || "账号"}《${h.title}》${suffix}`.trim(), 200),
        url: h.url,
        publishedAt: t.toISOString(),
        author: a.name || undefined,
        raw: { kind: board ? "competitor_board_entry" : "competitor_highlight", account: a.name, platform: a.platform, likes: h.likes ?? null, collects: h.collects ?? null, comments: h.comments ?? null },
      });
    }
  }
} else {
  const entries = Array.isArray(doc) ? doc : doc.entries;
  if (!Array.isArray(entries) || !entries.length) {
    console.error("✗ 输入里没有 entries[]。格式见 tools/sample-observations.calendar.json");
    process.exit(2);
  }

  for (const e of entries) {
    const who = e.title || e.nodeName || "未命名节点";
    if (!e.url) {
      warn(`${who}：没有 url，跳过。日历条目必须给一个可打开的出处（校历页 / 通知原文）`);
      continue;
    }
    if (!e.start) warn(`${who}：没有 start 日期——站点的日历判定要求写清时间窗口，缺日期大概率会被压分`);
    const at = snapshotTime(e.observedAt || e.publishedAt, who);
    items.push({
      title: buildTitleCalendar(e),
      url: e.url,
      publishedAt: at.toISOString(),
      author: e.publisher || undefined,
      raw: { kind: "calendar_node", nodeType: e.nodeType, start: e.start ?? null, end: e.end ?? null, appliesTo: e.appliesTo ?? null, confidence: e.confidence ?? null, basis: e.basis ?? null },
    });
  }
}

if (!items.length) {
  console.error("✗ 一条都没组装出来，检查输入字段");
  process.exit(1);
}

// 同一请求内重复 URL 只取第一条（服务端行为），这里先去重并提示
const seen = new Set();
const unique = [];
for (const it of items) {
  const key = it.url.trim();
  if (seen.has(key)) {
    warn(`重复网址被去掉：${key}`);
    continue;
  }
  seen.add(key);
  unique.push(it);
}

const finalItems = limit > 0 ? unique.slice(0, limit) : unique;

// ─── 输出 / 发送 ─────────────────────────────────────────────────────
const chunks = [];
for (let i = 0; i < finalItems.length; i += 50) chunks.push(finalItems.slice(i, i + 50));

console.log(`\n信源：${SOURCE.id}（${SOURCE.name}）`);
console.log(`来源文件：${inPath}`);
console.log(`条目：${finalItems.length} 条（原始 ${items.length}，去重后 ${unique.length}）→ ${chunks.length} 批`);

if (dryRun) {
  console.log(`\n--- DRY RUN，只看不发 ---\n`);
  console.log(JSON.stringify({ sourceId: SOURCE.id, sourceName: SOURCE.name, items: chunks[0] }, null, 2));
  if (chunks.length > 1) console.log(`\n（还有 ${chunks.length - 1} 批未显示）`);
  console.log(`\n` + (warnings.length ? `⚠ ${warnings.length} 条提醒（见上）` : `✓ 没有异常`));
  process.exit(0);
}

const payloads = chunks.map((c) => ({ sourceId: SOURCE.id, sourceName: SOURCE.name, items: c }));

if (outFile) {
  const outPath = resolve(process.cwd(), String(outFile));
  writeFileSync(outPath, JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2) + "\n", "utf8");
  console.log(`✓ 已写出 ${outPath}（共 ${chunks.length} 批），没有发请求`);
  process.exit(0);
}

if (!token || token.length < 16) {
  console.error(`\n✗ INGEST_TOKEN 缺失或短于 16 位。`);
  console.error(`  到仓库 .env 里设 INGEST_TOKEN=<至少16位随机串>，或在 .env.example 里找 / 自己生成：`);
  console.error(`  node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`);
  console.error(`  想先看内容而不发送：加 --dry-run 或 --out payload.json`);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let totalCreated = 0;

for (let i = 0; i < payloads.length; i += 1) {
  const body = JSON.stringify(payloads[i]);
  process.stdout.write(`\n[${i + 1}/${payloads.length}] POST ${INGEST_URL} … `);
  try {
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* 服务端偶尔返回纯文本（例如 Unauthorized） */
    }
    if (!res.ok) {
      console.log(`✗ HTTP ${res.status} ${text.slice(0, 200)}`);
      if (res.status === 401) {
        console.log(`  → token 不对，或服务端 INGEST_TOKEN 是占位串/短于 16 位（服务端会一律拒绝）`);
      } else if (res.status === 429) {
        console.log(`  → 触发限速（每客户端每分钟 10 次）。调大 --sleep 再试`);
      } else if (res.status === 413) {
        console.log(`  → 单次超过 50 条，调小 --limit`);
      }
      process.exitCode = 1;
      continue;
    }
    totalCreated += parsed?.created ?? 0;
    console.log(`✓ created=${parsed?.created ?? "?"} 收到=${payloads[i].items.length}`);
  } catch (error) {
    console.log(`✗ 请求失败：${error.message}`);
    console.log(`  → 站点起来了吗？默认打 ${base}，可以用 --base 指定`);
    process.exitCode = 1;
  }
  if (i < payloads.length - 1) await sleep(sleepMs);
}

console.log(`\n完成：新建 ${totalCreated} 条。`);
if (warnings.length) console.log(`（${warnings.length} 条提醒见上；陈旧数据的提醒尤其要看，那类条目不会进「今天」）`);
console.log(`
接下来：
  · 后台「信源」页搜 ${SOURCE.id}，确认它的参与方式是 editorial（sources.json 已声明，正常就是）
  · 抓取后模型会给每条打分类标签，${kind === "competitor" ? "「竞品/账号」" : "「日历/节点」"} 的条目会落到站上对应那一栏
  · 想看「未来 N 天有什么节点」，跑：node tools/calendar-lookahead.mjs --days 120`);
