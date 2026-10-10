#!/usr/bin/env node
// 精简 tools/xhs-targets.json：按分层删掉不要的号，并把删掉的号存档（不是丢掉）。
// 用法：
//   node tools/prune-targets.mjs --drop-tier 待确认-低粉
//   node tools/prune-targets.mjs --keep-tier 自我基准,对标-头部,对标-中腰部,对标-长尾
// 删掉的会追加到 tools/xhs-targets.removed.json，想恢复手工挪回去即可。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGETS = resolve(HERE, "xhs-targets.json");
const REMOVED = resolve(HERE, "xhs-targets.removed.json");

const argv = process.argv.slice(2);
function arg(name, def = null) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}

const dropTier = (arg("drop-tier") || "").split(",").map((s) => s.trim()).filter(Boolean);
const keepTier = (arg("keep-tier") || "").split(",").map((s) => s.trim()).filter(Boolean);

if (!dropTier.length && !keepTier.length) {
  console.error("✗ 至少要给 --drop-tier 或 --keep-tier");
  process.exit(1);
}

const all = JSON.parse(readFileSync(TARGETS, "utf8"));
const keep = all.filter((a) =>
  keepTier.length ? keepTier.includes(a.category) : !dropTier.includes(a.category)
);
const drop = all.filter((a) => !keep.includes(a));

// 存档：已有的先读出来拼上，按 uid 去重
let archived = [];
if (existsSync(REMOVED)) {
  try {
    archived = JSON.parse(readFileSync(REMOVED, "utf8"));
  } catch {
    archived = [];
  }
}
const seen = new Set(archived.map((a) => a.uid));
for (const d of drop) {
  if (!seen.has(d.uid)) {
    archived.push({ ...d, removedAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ") + " +08:00", removedReason: "用户确认整批删除（百粉以下，疑似家长个人号）" });
    seen.add(d.uid);
  }
}

writeFileSync(TARGETS, JSON.stringify(keep, null, 2) + "\n", "utf8");
writeFileSync(REMOVED, JSON.stringify(archived, null, 2) + "\n", "utf8");

const tally = {};
for (const a of keep) tally[a.category] = (tally[a.category] || 0) + 1;
console.log(`✓ 保留 ${keep.length} 个 → tools/xhs-targets.json`);
console.log(`   ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" / ")}`);
console.log(`✓ 存档 ${drop.length} 个 → tools/xhs-targets.removed.json（累计 ${archived.length} 个，随时可恢复）`);
