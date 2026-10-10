/**
 * 行业包自检：改完 taxonomy.ts / topics.json / selection.ts 之后跑一遍，防止词表漂移。
 *
 * 用法（从仓库根目录）：
 *   node --experimental-strip-types tools/check_pack.mjs
 *   node --experimental-strip-types tools/check_pack.mjs --dir industry
 *
 * 检查项：
 *   1. CATEGORIES 的 key 唯一，且必须有一个 key 为 industry（未归类的兜底分节）
 *   2. ITEM_TYPES 与 CATEGORY_BY_ITEM_TYPE 的键完全对应，值都落在 CATEGORY_TAGS 里
 *   3. 三张标签白名单两两不重叠
 *   4. TAG_SYNONYMS 的值都落在白名单内，且键不与白名单冲突（键也不能是 entity:<id>）
 *   5. ENTITY_TAGS 都能在 ENTITIES 里找到对应主体
 *   6. topics.json 的 group / tags / related 合法
 *   7. sources.json 的 kind 受支持、id 唯一、tier 受支持、mp_account 缺 ghid 会被提示
 *   8. calendar.json 的节点标签落在 TOPIC_TAGS 里、日期合法、nodeType 有声明、confidence 在枚举内
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const dirArg = argv.indexOf("--dir");
const base = path.resolve(dirArg >= 0 ? argv[dirArg + 1] : "industry");

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const { CATEGORIES, ITEM_TYPES, CATEGORY_TAGS, TOPIC_TAGS, ENTITY_TAGS, TAG_SYNONYMS, CATEGORY_BY_ITEM_TYPE, ENTITIES } =
  await import(`file://${path.join(base, "taxonomy.ts").replace(/\\/g, "/")}`);
const { SITE, ABOUT } = await import(`file://${path.join(base, "site.ts").replace(/\\/g, "/")}`);
const { SELECTION } = await import(`file://${path.join(base, "selection.ts").replace(/\\/g, "/")}`);
const topics = JSON.parse(readFileSync(path.join(base, "topics.json"), "utf8"));
const sources = JSON.parse(readFileSync(path.join(base, "sources.json"), "utf8")).sources;
const calendar = JSON.parse(readFileSync(path.join(base, "calendar.json"), "utf8"));

// 1. 类别
const keys = CATEGORIES.map((c) => c.key);
if (new Set(keys).size !== keys.length) fail(`CATEGORIES 的 key 有重复：${keys.join(", ")}`);
if (!keys.includes("industry")) fail("CATEGORIES 里必须有一个 key 为 industry（未归类资料的兜底分节）");
for (const c of CATEGORIES) if (!c.section || !c.guide) fail(`类别 ${c.key} 缺 section 或 guide`);

// 2. 内容类型
const t = [...ITEM_TYPES];
const bt = Object.keys(CATEGORY_BY_ITEM_TYPE);
const miss = t.filter((x) => !bt.includes(x));
const extra = bt.filter((x) => !t.includes(x));
if (miss.length) fail(`CATEGORY_BY_ITEM_TYPE 缺少内容类型：${miss.join(", ")}`);
if (extra.length) fail(`CATEGORY_BY_ITEM_TYPE 有多余键：${extra.join(", ")}`);
for (const [k, v] of Object.entries(CATEGORY_BY_ITEM_TYPE))
  if (!CATEGORY_TAGS.includes(v)) fail(`CATEGORY_BY_ITEM_TYPE.${k} = "${v}" 不在 CATEGORY_TAGS 里`);

// 3. 白名单两两不重叠
const overlap = (a, b, na, nb) => {
  const hit = a.filter((x) => b.includes(x));
  if (hit.length) fail(`${na} 与 ${nb} 重叠：${hit.join(", ")}`);
};
overlap(CATEGORY_TAGS, TOPIC_TAGS, "CATEGORY_TAGS", "TOPIC_TAGS");
overlap(CATEGORY_TAGS, ENTITY_TAGS, "CATEGORY_TAGS", "ENTITY_TAGS");
overlap(TOPIC_TAGS, ENTITY_TAGS, "TOPIC_TAGS", "ENTITY_TAGS");

// 4. 近义词表
const vocab = new Set([...CATEGORY_TAGS, ...TOPIC_TAGS, ...ENTITY_TAGS]);
for (const [k, v] of Object.entries(TAG_SYNONYMS)) {
  if (!vocab.has(v)) fail(`TAG_SYNONYMS["${k}"] = "${v}" 不在任何白名单里`);
  if (vocab.has(k)) fail(`TAG_SYNONYMS 的键 "${k}" 本身是白名单标签，会把合法标签吃掉`);
}
if (Object.keys(TAG_SYNONYMS).length === 0) warn("TAG_SYNONYMS 是空的，模型写的近义词将不会被归一");

// 5. ENTITY_TAGS 与 ENTITIES
const entityNames = new Set(Object.values(ENTITIES).flatMap((e) => [e.name, ...e.aliases]));
const displayTags = new Set(Object.values(ENTITIES).map((e) => e.displayTag).filter(Boolean));
for (const tag of ENTITY_TAGS)
  if (!entityNames.has(tag) && !displayTags.has(tag))
    warn(`ENTITY_TAGS 的 "${tag}" 在 ENTITIES 里找不到对应主体（不会被自动归类到主题页）`);

// 6. topics.json
const groups = new Set(topics.groups.map((g) => g.key));
const slugs = topics.topics.map((x) => x.slug);
if (new Set(slugs).size !== slugs.length) fail("topics.json 有重复 slug");
for (const x of topics.topics) {
  if (!groups.has(x.group)) fail(`主题 ${x.slug} 的 group "${x.group}" 未在 groups 里声明`);
  if (!x.definition) fail(`主题 ${x.slug} 缺 definition`);
  for (const tag of x.tags ?? []) {
    const isEntityRef = tag.startsWith("entity:");
    if (isEntityRef && !(tag.slice(7) in ENTITIES)) fail(`主题 ${x.slug} 引用了不存在的主体 ${tag}`);
    else if (!isEntityRef && !vocab.has(tag)) fail(`主题 ${x.slug} 的标签 "${tag}" 不在白名单里`);
  }
  for (const r of x.related ?? []) if (!slugs.includes(r)) fail(`主题 ${x.slug} 的 related 指向不存在的 ${r}`);
  if (!x.tags?.length && !x.entityId) fail(`主题 ${x.slug} 既没有 tags 也没有 entityId，收不到任何内容`);
}

// 7. sources.json
const KINDS = ["rss", "web_list", "json_list", "x_search", "mp_account", "external"];
const TIERS = ["T1", "T1_5", "T2", "EXCLUDE_MP"];
const MODES = ["editorial", "hot_signal", "isolated"];
const sids = sources.map((s) => s.id);
if (new Set(sids).size !== sids.length) fail("sources.json 有重复 id");
for (const s of sources) {
  if (!KINDS.includes(s.kind)) fail(`信源 ${s.id} 的 kind "${s.kind}" 不受支持`);
  if (!TIERS.includes(s.tier)) fail(`信源 ${s.id} 的 tier "${s.tier}" 不受支持`);
  if (!MODES.includes(s.participation_mode)) fail(`信源 ${s.id} 的 participation_mode "${s.participation_mode}" 不受支持`);
  if (s.owner_entity_id && !(s.owner_entity_id in ENTITIES)) warn(`信源 ${s.id} 的 owner_entity_id "${s.owner_entity_id}" 不在 ENTITIES 里`);
  if (s.kind === "mp_account" && !s.config?.ghid && !s.config?.wxid)
    warn(`信源 ${s.id}（公众号）还没填 ghid，会一直停在「未配置」`);
  if (s.kind === "web_list" && !s.config?.itemSelector && s.config?.parseMode !== "markdown")
    warn(`信源 ${s.id} 是 web_list 但没有 itemSelector，也不是 markdown 模式`);
}

// 8. site.ts / selection.ts 的常识检查
if (!SITE.name || !SITE.subject || !SITE.mcpPrefix) fail("site.ts 缺 name / subject / mcpPrefix");
if (!/^[a-z0-9_]+$/.test(SITE.mcpPrefix)) fail(`SITE.mcpPrefix "${SITE.mcpPrefix}" 只能用小写字母、数字、下划线`);
if (SITE.organization.name === "MyHOT") warn("site.ts 还留着示例站名 MyHOT");
if (ABOUT.copyright.includes("MyHOT")) warn("ABOUT.copyright 还留着示例站名");
for (const [tier, th] of Object.entries(SELECTION.thresholds))
  if (!TIERS.includes(tier)) fail(`SELECTION.thresholds 里的 "${tier}" 不是合法分级`);

// 9. calendar.json（行业日历）
const CONF = Object.keys(calendar.confidenceLevels ?? {});
const nodeKeys = (calendar.nodeTypes ?? []).map((n) => n.key);
if (new Set(nodeKeys).size !== nodeKeys.length) fail("calendar.json 的 nodeTypes 有重复 key");
for (const n of calendar.nodeTypes ?? []) {
  if (!n.key || !n.name || !n.window || !n.what) fail(`日历节点 ${n.key ?? "?"} 缺 key / name / window / what`);
  if (n.tag !== null && n.tag !== undefined && !TOPIC_TAGS.includes(n.tag))
    fail(`日历节点 ${n.key} 的标签 "${n.tag}" 不在 TOPIC_TAGS 里（模型永远打不出这个标签）`);
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;
for (const e of calendar.entries ?? []) {
  if (!nodeKeys.includes(e.nodeType)) fail(`日历条目 ${e.id} 的 nodeType "${e.nodeType}" 未在 nodeTypes 里声明`);
  if (!ISO.test(e.start ?? "")) fail(`日历条目 ${e.id} 的 start 不是 YYYY-MM-DD`);
  if (e.end && !ISO.test(e.end)) fail(`日历条目 ${e.id} 的 end 不是 YYYY-MM-DD`);
  if (e.end && e.end < e.start) fail(`日历条目 ${e.id} 的 end 早于 start`);
  if (!CONF.includes(e.confidence)) fail(`日历条目 ${e.id} 的 confidence "${e.confidence}" 不在 confidenceLevels 里`);
  if (e.confidence !== "已公布" && !e.basis) warn(`日历条目 ${e.id} 是「${e.confidence}」，建议在 basis 里写清依据`);
}
const entryIds = (calendar.entries ?? []).map((e) => e.id);
if (new Set(entryIds).size !== entryIds.length) fail("calendar.json 的 entries 有重复 id");
const taglessNodes = (calendar.nodeTypes ?? []).filter((n) => !n.tag).map((n) => n.name);
if (taglessNodes.length > 1) warn(`有多个节点不设标签（${taglessNodes.join("、")}），确认是有意的`);

for (const w of warnings) console.log(`警告  ${w}`);
for (const e of errors) console.log(`错误  ${e}`);
console.log(
  errors.length
    ? `\n✗ ${errors.length} 个错误，${warnings.length} 个警告`
    : `\n✓ 行业包自检通过（${warnings.length} 个警告）：${CATEGORIES.length} 个类别 · ${ITEM_TYPES.length} 个内容类型 · ${topics.topics.length} 个主题 · ${sources.length} 个信源 · 日历 ${(calendar.nodeTypes ?? []).length} 类节点 / ${(calendar.entries ?? []).length} 条日期`,
);
process.exit(errors.length ? 1 : 0);
