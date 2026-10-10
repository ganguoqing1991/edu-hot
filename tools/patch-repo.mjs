/**
 * 教育HOT 代码补丁：把 AIHOT 框架里**硬编码在代码里**的 AI 行业文案换成教育行业。
 *
 * 行业包（industry/）能覆盖的东西都不在这里；这里只处理写在代码里的界面文案
 * （主题页分组名、热点榜文案、事件综述标签、OG 卡片），以及依赖示例行业分类的测试 fixture。
 *
 * ⚠️ 硬规则：**只改文案与逻辑，绝不碰样式与配色**。
 *    - 本文件里不许出现对 .css 文件的替换。
 *    - 界面结构（DOM 层次、类名、组件骨架）保持与源文件一致，不新增/删除可见元素。
 *    - 站点配色来自 apps/web/app/app.css（上游是青绿 accent），一律沿用，不改成品牌色。
 *    - 品牌图只落在 industry/brand/（favicon、PWA 图标、/logo.svg），那是品牌资源的既定位置，
 *      不参与界面渲染，所以换图不影响界面观感。
 *
 * 用法（从仓库根目录）：
 *   node tools/patch-repo.mjs --check     # 只报告，不写文件
 *   node tools/patch-repo.mjs             # 应用
 *   node tools/patch-repo.mjs --revert    # 撤回（把 new 换回 old）
 *
 * 每条替换都是精确字符串匹配：找不到原文会报错并跳过，不会静默改错地方。
 * 重复执行安全（发现已是新文案就跳过）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const check = argv.includes("--check");
const revert = argv.includes("--revert");
const dirArg = argv.indexOf("--dir");
const root = path.resolve(dirArg >= 0 ? argv[dirArg + 1] : ".");

/** [文件, 原文, 新文, 说明] */
const EDITS = [
  // ── 主题页：分组名与页面文案 ──────────────────────────────────────────────────────────
  [
    "apps/web/app/routes/topics.tsx",
    `  return pageMeta({ title: "主题", description: "按公司与模型、技术方向、内容形态聚合的 AI 主题页：OpenAI、Anthropic、Agent、多模态、论文与教程等 38 个方向。", path: "/topics", image: "/og/pages/topics.png" });`,
    `  return pageMeta({ title: "主题", description: "按主管单位与学校、学段与赛道、内容形态聚合的教育主题页：教育部、重庆市教委、小升初、中考、双减、机构经营等 36 个方向。", path: "/topics", image: "/og/pages/topics.png" });`,
    "主题页 meta 描述",
  ],
  [
    "apps/web/app/routes/topics.tsx",
    `const GROUPS = [
  { key: "company", name: "公司与模型", blurb: "按厂商与模型系追踪：谁发了什么、又赢了哪一局" },
  { key: "field", name: "技术方向", blurb: "按技术领域深挖：Agent、多模态、具身智能……" },
  { key: "genre", name: "内容形态", blurb: "按内容类型浏览：论文、教程、观点、政策……" },
] as const;`,
    `const GROUPS = [
  { key: "company", name: "机构与学校", blurb: "按主管单位、名校与教育机构追踪：谁发了什么、谁又动了" },
  { key: "field", name: "学段与赛道", blurb: "按学段与细分赛道深挖：幼升小、小升初、中考、双减、机构经营……" },
  { key: "genre", name: "内容形态", blurb: "按内容类型浏览：政策文件、升学招生、家长舆情、一线声音……" },
] as const;`,
    "主题页分组名（key 不变，只改显示名）",
  ],
  [
    "apps/web/app/routes/topics.tsx",
    `text-ink">按主题看 AI</h1>`,
    `text-ink">按主题看教育</h1>`,
    "主题页大标题",
  ],
  [
    "apps/web/app/routes/topics.tsx",
    `          按公司与模型、技术方向、内容形态浏览 <span className="num">{topics.length}</span> 个主题，持续汇集近期焦点与精选。`,
    `          按主管单位与学校、学段与赛道、内容形态浏览 <span className="num">{topics.length}</span> 个主题，持续汇集近期焦点与精选。`,
    "主题页副标题",
  ],

  // ── 热点榜文案 ────────────────────────────────────────────────────────────────────────
  [
    "apps/web/app/routes/hot.tsx",
    `description: "过去 48 小时 AI 圈讨论最多的 10 个事件：热度指数、趋势与组成热度的公开来源。",`,
    `description: "过去 48 小时教育圈讨论最多的 10 个事件：热度指数、趋势与组成热度的公开来源。",`,
    "热点榜 meta 描述",
  ],
  [
    "apps/web/app/routes/hot.tsx",
    `过去 {hot.windowHours} 小时，AI 圈讨论最多的 {hot.entries.length || 10} 件事`,
    `过去 {hot.windowHours} 小时，教育圈讨论最多的 {hot.entries.length || 10} 件事`,
    "热点榜正文文案",
  ],

  // ── 事件综述标签 ──────────────────────────────────────────────────────────────────────
  [
    "apps/web/app/routes/story.tsx",
    `{ label: "AI 综述", text: story.digest, note: story.digestUpdatedAt ? \`AI 根据报道生成 · \${relativeTime(story.digestUpdatedAt)}更新\` : "AI 根据报道生成" }`,
    `{ label: "事件综述", text: story.digest, note: story.digestUpdatedAt ? \`模型根据报道生成 · \${relativeTime(story.digestUpdatedAt)}更新\` : "模型根据报道生成" }`,
    "事件综述标签（原先的 AI 指的是生成方，改成模型以免与教育行业混淆）",
  ],

  // ── OG 分享卡片 ───────────────────────────────────────────────────────────────────────
  [
    "apps/api/src/routes/og.ts",
    `  topics: { kicker: "主题", title: "长期追踪的方向", subtitle: "公司与机构、专题方向、内容形态。" },`,
    `  topics: { kicker: "主题", title: "长期追踪的方向", subtitle: "主管单位与学校、学段与赛道、内容形态。" },`,
    "主题页 OG 卡片副标题",
  ],

  // ── 测试：预筛提示词的识别前缀 ────────────────────────────────────────────────────────
  [
    "tests/analyze.test.ts",
    `system.includes("宽召回的AI相关性预筛") ? "prefilter"`,
    `system.includes("宽召回的教育相关性预筛") ? "prefilter"`,
    "测试识别预筛步骤",
  ],
  [
    "tests/analyze.test.ts",
    "assert.ok(PREFILTER_SYSTEM.startsWith(`为${SITE.name}做宽召回的AI相关性预筛`));",
    "assert.ok(PREFILTER_SYSTEM.startsWith(`为${SITE.name}做宽召回的教育相关性预筛`));",
    "测试校验预筛提示词抬头",
  ],
  [
    "tests/analyze-shutdown.test.ts",
    `system.includes("宽召回的AI相关性预筛") ? "prefilter"`,
    `system.includes("宽召回的教育相关性预筛") ? "prefilter"`,
    "测试识别预筛步骤",
  ],

  // ── 测试：analyze.test.ts 的 fixture 与断言 ──────────────────────────────────────────
  [
    "tests/analyze.test.ts",
    `return answer({ itemType: "model_release", authorRole: "principal", tags: ["模型发布", "开源", "Agent", "不存在的标签"], editorialJudgment: \`理由 \${marker}\`, titleZh: \`理解标题 \${marker}\`, summaryZh: \`理解摘要 \${marker}。第二句补充一个关键数字。\` });`,
    `return answer({ itemType: "policy_release", authorRole: "principal", tags: ["政策/监管", "招生", "小升初", "不存在的标签"], editorialJudgment: \`理由 \${marker}\`, titleZh: \`理解标题 \${marker}\`, summaryZh: \`理解摘要 \${marker}。第二句补充一个关键数字。\` });`,
    "内容理解 fixture（tags 里保留一个近义词和一个不存在的标签，用于验证归一与丢弃）",
  ],
  [
    "tests/analyze.test.ts",
    `return answer({ category: "ai-models", tags: ["模型发布", "推理"], subjects: ["anthropic", "unknown-co"], fact: { title: \`事实 \${marker}\`, subject: "某公司", action: "发布", object: "模型", occurredAt: null } });`,
    `return answer({ category: "policy", tags: ["政策/监管", "小升初"], subjects: ["moe", "unknown-co"], fact: { title: \`事实 \${marker}\`, subject: "某单位", action: "发布", object: "通知", occurredAt: null } });`,
    "结构化 fixture",
  ],
  [
    "tests/analyze.test.ts",
    `assert.equal(tierThreshold("T1"), 60);`,
    `assert.equal(tierThreshold("T1"), 55);`,
    "T1 门槛",
  ],
  [
    "tests/analyze.test.ts",
    `[true, 75], "78 + 72 = 150 >= 120"`,
    `[true, 75], "78 + 72 = 150 >= 110"`,
    "入选门槛注释",
  ],
  [
    "tests/analyze.test.ts",
    `["理解标题 CLEAR", "理由 CLEAR", "ai-models", 5]`,
    `["理解标题 CLEAR", "理由 CLEAR", "policy", 5]`,
    "类别断言",
  ],
  [
    "tests/analyze.test.ts",
    `assert.deepEqual(r.tags, ["模型发布", "开源/仓库", "Agent", "Anthropic"], "vocabulary tags (synonyms mapped, unknown dropped) and the subject's tag");`,
    `assert.deepEqual(r.tags, ["政策/监管", "升学/招生", "小升初", "教育部"], "vocabulary tags (synonyms mapped, unknown dropped) and the subject's tag");`,
    "标签归一断言",
  ],
  [
    "tests/analyze.test.ts",
    `  assert.deepEqual(r.subjects, ["anthropic"]);`,
    `  assert.deepEqual(r.subjects, ["moe"]);`,
    "主体断言",
  ],
  [
    "tests/analyze.test.ts",
    `["understand", "model_release", "PASS", "事实 CLEAR"]`,
    `["understand", "policy_release", "PASS", "事实 CLEAR"]`,
    "内容类型断言",
  ],
  [
    "tests/analyze.test.ts",
    `[false, "理由 RESCUE"], "56 + 50 = 106 > 100"`,
    `[false, "理由 RESCUE"], "56 + 50 = 106 > 96"`,
    "理解下限注释",
  ],
  [
    "tests/analyze.test.ts",
    `assert.deepEqual((await row(lowId)).tags, ["模型发布", "推理", "Anthropic"], "structure tags");`,
    `assert.deepEqual((await row(lowId)).tags, ["政策/监管", "小升初", "教育部"], "structure tags");`,
    "结构化标签断言",
  ],
  [
    "tests/analyze.test.ts",
    `// An UNKNOWN with material is judged and written like a PASS, up to 精选 (60 + 62 ≥ 2 × 60).`,
    `// An UNKNOWN with material is judged and written like a PASS, up to 精选 (60 + 62 ≥ 2 × 55).`,
    "UNKNOWN 入选注释",
  ],
  [
    "tests/analyze.test.ts",
    `  const input = { title: "某实验室发布新模型", text: "某实验室发布了一个新模型，参数规模和价格都有说明。", sourceKind: "rss" };
  const guarded = enforceIdentity(input, { titleZh: "OpenAI 发布新模型", summaryZh: "某实验室发布新模型。" });
  assert.deepEqual([guarded.titleZh, guarded.summaryZh, guarded.identityGuard.outcome], ["某实验室发布新模型", "某实验室发布新模型。", "fallback"]);
  // The identity lexicon: a Chinese rendering of a company the input names in English is no invention.
  const alibaba = { title: "Alibaba ships a new coding model", text: "Alibaba released a coding model with pricing details.", sourceKind: "rss" };
  assert.equal(enforceIdentity(alibaba, { titleZh: "阿里巴巴发布编程模型", summaryZh: "阿里巴巴发布了编程模型并公布价格。" }).identityGuard.outcome, "pass");`,
    `  const input = { title: "某区发布招生政策", text: "某区发布了今年的招生入学政策，明确了报名条件与时间安排。", sourceKind: "rss" };
  const guarded = enforceIdentity(input, { titleZh: "重庆市教委发布招生政策", summaryZh: "某区发布招生政策。" });
  assert.deepEqual([guarded.titleZh, guarded.summaryZh, guarded.identityGuard.outcome], ["某区发布招生政策", "某区发布招生政策。", "fallback"]);
  // The identity lexicon: another name for a body the input does name is no invention.
  const aliased = { title: "学而思发布新的课程体系", text: "学而思发布了新的课程体系与价格。", sourceKind: "rss" };
  assert.equal(enforceIdentity(aliased, { titleZh: "好未来发布新的课程体系", summaryZh: "好未来发布了新的课程体系。" }).identityGuard.outcome, "pass");`,
    "身份词典 fixture（换成教育主体：重庆市教委 / 学而思→好未来）",
  ],

  // ── 测试：analyze-shutdown.test.ts ───────────────────────────────────────────────────
  [
    "tests/analyze-shutdown.test.ts",
    `const content = step === "prefilter" ? { label: "PASS", reason: "AI model release" }`,
    `const content = step === "prefilter" ? { label: "PASS", reason: "教育政策通知" }`,
    "预筛 fixture",
  ],
  [
    "tests/analyze-shutdown.test.ts",
    `: step === "structure" ? { category: "ai-models", tags: ["模型发布"], subjects: [], fact: { title: "新模型发布" } }`,
    `: step === "structure" ? { category: "policy", tags: ["政策/监管"], subjects: [], fact: { title: "某区发布招生入学通知" } }`,
    "结构化 fixture",
  ],
  [
    "tests/analyze-shutdown.test.ts",
    `: { itemType: "model_release", authorRole: "principal", tags: ["模型发布"], editorialJudgment: "模型有明确的能力提升", titleZh: \`新模型发布 \${T}\`, summaryZh: "模型发布并提供了评测和价格。" };`,
    `: { itemType: "policy_release", authorRole: "principal", tags: ["政策/监管"], editorialJudgment: "文件明确了报名条件与时间安排", titleZh: \`某区发布招生入学通知 \${T}\`, summaryZh: "某区发布招生入学通知，明确了报名条件与时间安排。" };`,
    "内容理解 fixture",
  ],

  // ── 测试：default-model.test.ts ──────────────────────────────────────────────────────
  [
    "tests/default-model.test.ts",
    `: system.includes("内容理解编辑") ? { itemType: "product_launch", authorRole: "principal", tags: ["产品更新"], editorialJudgment: "理由", titleZh: "一个模型的标题", summaryZh: "一个模型写的摘要。第二句。" }`,
    `: system.includes("内容理解编辑") ? { itemType: "admission_update", authorRole: "principal", tags: ["升学/招生"], editorialJudgment: "理由", titleZh: "一份招生通知的标题", summaryZh: "一份招生通知的摘要。第二句。" }`,
    "内容理解 fixture",
  ],
  [
    "tests/default-model.test.ts",
    `: system.includes("资料结构化助手") ? { category: "ai-products", tags: ["产品更新"], subjects: [], fact: null }`,
    `: system.includes("资料结构化助手") ? { category: "admission", tags: ["升学/招生"], subjects: [], fact: null }`,
    "结构化 fixture",
  ],
  [
    "tests/default-model.test.ts",
    `assert.equal(res!.output!.titleZh, "一个模型的标题");`,
    `assert.equal(res!.output!.titleZh, "一份招生通知的标题");`,
    "标题断言",
  ],

  // ── 测试：直接写死 category 的三处 fixture ────────────────────────────────────────────
  [
    "tests/events.test.ts",
    `VALUES (\${articleId}, 1, 'rule', 'pass', 'ai-models', \${title}, \${summary}, 80, false, \${sql.json({ fact: { title, subject: "测试", action: "发布", object: "模型" } })})`,
    `VALUES (\${articleId}, 1, 'rule', 'pass', 'policy', \${title}, \${summary}, 80, false, \${sql.json({ fact: { title, subject: "测试", action: "发布", object: "通知" } })})`,
    "归组 fixture 里的类别",
  ],
  [
    "tests/publication.test.ts",
    `VALUES (\${articleId}, 1, 'rule', 'pass', 'ai-models', \${\`标题\${n}-\${T}\`}, \${\`SUMMARY-\${n}-\${T}\`}, '理由', 90, true)`,
    `VALUES (\${articleId}, 1, 'rule', 'pass', 'policy', \${\`标题\${n}-\${T}\`}, \${\`SUMMARY-\${n}-\${T}\`}, '理由', 90, true)`,
    "发布 fixture 里的类别",
  ],
  [
    "tests/signals.test.ts",
    `'ai-models', \${opts.title}`,
    `'policy', \${opts.title}`,
    "信号 fixture 里的类别（report 辅助函数）",
  ],
  [
    "tests/signals.test.ts",
    `'ai-models', \${\`Anthropic 发布 \${TOPIC} Sonnet\`}`,
    `'policy', \${\`Anthropic 发布 \${TOPIC} Sonnet\`}`,
    "信号归组 fixture 里的类别",
  ],

  // ── 旧分类兼容层：AIHOT 的 tip / opinion 在教育行业包里不存在 ─────────────────────────────
  // 原分类 6 个中 tip（教程）与 opinion（观点）同属「技巧与观点」一节，所以 v1/RSS 对外
  // 把一节合并成一个名字发布：请求 tip 时同时返回 opinion。教育行业包的 6 个类别各自独立
  // 成节（不存在「一节含两类别」），这层合并没有可映射的对象 —— 保留它会把两个教育类别
  // 在公开接口里悄悄并成一个，是行为错误而不是类型错误。因此整段去掉，v1 参数一并取消。
  [
    "packages/backend/src/publication/items.ts",
    `export function categoryCondition(category: CategoryKey | null | undefined, v1 = false) {
  if (!category) return sql\`\`;
  // v1 and RSS publish opinion as tip.
  if (v1 && category === "tip") return sql\`AND p.category IN ('tip', 'opinion')\`;
  return sql\`AND p.category = \${category}\`;
}`,
    `export function categoryCondition(category: CategoryKey | null | undefined) {
  if (!category) return sql\`\`;
  return sql\`AND p.category = \${category}\`;
}`,
    "去掉 v1/RSS 的 tip→opinion 合并（教育包无此分组）",
  ],
  [
    "packages/backend/src/publication/feeds.ts",
    `    : sql\`\${selectedCondition(now)} \${categoryCondition(category, true)}`,
    `    : sql\`\${selectedCondition(now)} \${categoryCondition(category)}`,
    "RSS 调用点同步取消 v1 标记",
  ],
  [
    "packages/backend/src/publication/v1.ts",
    `    WHERE \${scope} \${categoryCondition(query.category, true)} \${publicMatchCondition(terms)}`,
    `    WHERE \${scope} \${categoryCondition(query.category)} \${publicMatchCondition(terms)}`,
    "v1 调用点同步取消 v1 标记",
  ],
  [
    "apps/api/src/routes/v1.ts",
    `    const category = q.category === undefined ? null : enumParam<PublicApiCategoryKey>(q.category, "category", PUBLIC_API_CATEGORY_KEYS, "tip");`,
    `    const category = q.category === undefined ? null : enumParam<PublicApiCategoryKey>(q.category, "category", PUBLIC_API_CATEGORY_KEYS, PUBLIC_API_CATEGORY_KEYS[0]!);`,
    "v1 类别兜底值不再硬编码旧分类",
  ],
  [
    "tests/translate.test.ts",
    `'ai-models', \${\`价格更新-\${T}\`}`,
    `'policy', \${\`价格更新-\${T}\`}`,
    "翻译 fixture 里的类别（价格更新）",
  ],
  [
    "tests/translate.test.ts",
    `'ai-models', \${\`链接-\${T}\`}`,
    `'policy', \${\`链接-\${T}\`}`,
    "翻译 fixture 里的类别（链接）",
  ],
  [
    "tests/translate.test.ts",
    `'ai-models', \${\`引用-\${T}\`}`,
    `'policy', \${\`引用-\${T}\`}`,
    "翻译 fixture 里的类别（引用）",
  ],
  [
    "tests/translate-shutdown.test.ts",
    `'ai-models',\${\`终止测试\${T}\`}`,
    `'policy',\${\`终止测试\${T}\`}`,
    "翻译停机 fixture 里的类别",
  ],

  // ── 评分徽章：这是站点自己的模型打分，不是「AI 行业」的意思 ────────────────────────────
  [
    "apps/web/app/components/ui/Score.tsx",
    `/** "AI 评分 · 88" on desktop cards; \`compact\` keeps only the number (phones). */`,
    `/** "精选评分 · 88" on desktop cards; \`compact\` keeps only the number (phones). */`,
    "评分徽章注释",
  ],
  [
    "apps/web/app/components/ui/Score.tsx",
    `      title={\`AI 评分 \${value}/100\`}
      aria-label={\`AI 评分 \${value} 分\`}`,
    `      title={\`精选评分 \${value}/100\`}
      aria-label={\`精选评分 \${value} 分\`}`,
    "评分徽章的 title 与 aria-label",
  ],
  [
    "apps/web/app/components/ui/Score.tsx",
    `leading-none opacity-80">AI 评分</span>`,
    `leading-none opacity-80">精选评分</span>`,
    "评分徽章可见文字",
  ],

  // ── 日报 / 周报 / 月报文案 ───────────────────────────────────────────────────────────
  [
    "apps/web/app/features/report/format.ts",
    `export const MOTTO: Record<ReportKind, string> = { daily: "人工智能 · 每日要闻", weekly: "人工智能 · 每周综述", monthly: "人工智能 · 每月盘点" };`,
    `export const MOTTO: Record<ReportKind, string> = { daily: "教育行业 · 每日要闻", weekly: "教育行业 · 每周综述", monthly: "教育行业 · 每月盘点" };`,
    "报告头题词（跑起来才看得见，静态搜索容易漏）",
  ],
  [
    "apps/web/app/features/report/format.ts",
    `/** "这一天的 4 件 AI 大事" / "本周的 12 件 AI 大事" / "8 月的 20 件 AI 大事". */`,
    `/** "这一天的 4 件教育大事" / "本周的 12 件教育大事" / "8 月的 20 件教育大事". */`,
    "报告条目数注释",
  ],
  [
    "apps/web/app/features/report/format.ts",
    `  if (kind === "daily") return \`这一天的 \${count} 件 AI 大事\`;
  if (kind === "weekly") return \`本周的 \${count} 件 AI 大事\`;
  return \`\${Number(key.slice(5, 7))} 月的 \${count} 件 AI 大事\`;`,
    `  if (kind === "daily") return \`这一天的 \${count} 件教育大事\`;
  if (kind === "weekly") return \`本周的 \${count} 件教育大事\`;
  return \`\${Number(key.slice(5, 7))} 月的 \${count} 件教育大事\`;`,
    "报告条目数文案",
  ],
  [
    "apps/web/app/features/report/ReportPaper.tsx",
    `              AI {KIND_LABEL[report.kind]} · {dateLine(report.kind, report.key)}`,
    `              教育 {KIND_LABEL[report.kind]} · {dateLine(report.kind, report.key)}`,
    "报告页无障碍标题",
  ],
  [
    "apps/web/app/features/report/ReportPaper.tsx",
    `?? \`AI \${KIND_LABEL[report.kind]} · \${key}\``,
    `?? \`教育 \${KIND_LABEL[report.kind]} · \${key}\``,
    "报告页往期条目标题兜底",
  ],
  [
    "apps/web/app/features/report/ReportPaper.tsx",
    `<Kicker>往期 AI {KIND_LABEL[report.kind]}</Kicker>`,
    `<Kicker>往期教育 {KIND_LABEL[report.kind]}</Kicker>`,
    "报告页往期小标题",
  ],
  [
    "apps/web/app/routes/report-latest.tsx",
    `    title: \`AI \${KIND_LABEL[kind]}\`,`,
    `    title: \`教育 \${KIND_LABEL[kind]}\`,`,
    "最新报告页 meta 标题",
  ],
  [
    "apps/web/app/routes/report-latest.tsx",
    `还没有发布 AI \${KIND_LABEL[kind]}`,
    `还没有发布教育 \${KIND_LABEL[kind]}`,
    "最新报告页空状态",
  ],

  // ── 阅读页 ──────────────────────────────────────────────────────────────────────────
  [
    "apps/web/app/routes/item.tsx",
    `? "正文 · AI 翻译"`,
    `? "正文 · 模型翻译"`,
    "阅读页正文标签",
  ],
  [
    "apps/web/app/routes/item.tsx",
    `title="AI 评分"`,
    `title="精选评分"`,
    "阅读页侧栏标题",
  ],
  [
    "apps/web/app/routes/item.tsx",
    `{summaryOnly ? "摘要" : "AI 导读"}`,
    `{summaryOnly ? "摘要" : "模型导读"}`,
    "阅读页导读标签",
  ],

  // ── 反馈页示例 ──────────────────────────────────────────────────────────────────────
  [
    "apps/web/app/routes/feedback.tsx",
    `placeholder="例如：我在搜索“OpenAI”时遇到……我原本想……"`,
    `placeholder="例如：我在搜索“小升初”时遇到……我原本想……"`,
    "反馈页占位示例",
  ],
];

const byFile = new Map();
for (const [file, old, next, note] of EDITS) {
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push({ old, next, note });
}

let applied = 0, skipped = 0;
const problems = [];

for (const [file, edits] of byFile) {
  const full = path.join(root, file);
  let text;
  try {
    text = readFileSync(full, "utf8");
  } catch {
    problems.push(`${file} 读不到`);
    continue;
  }
  const before = text;
  for (const e of edits) {
    const from = revert ? e.next : e.old;
    const to = revert ? e.old : e.next;
    if (!text.includes(from)) {
      if (text.includes(to)) { skipped++; continue; } // 已经改过
      problems.push(`${file}：找不到待替换文本（${e.note}）`);
      continue;
    }
    if (text.split(from).length - 1 !== 1) {
      problems.push(`${file}：待替换文本出现多次（${e.note}）`);
      continue;
    }
    text = text.replace(from, to);
    applied++;
  }
  if (text !== before && !check) writeFileSync(full, text);
  else if (text !== before && check) problems.push(`${file}：有 ${edits.length} 处需要修改（--check 未写入）`);
}

for (const p of problems) console.log(`⚠ ${p}`);
console.log(
  `\n${check ? "检查完毕" : revert ? "已撤回" : "已应用"}：${applied} 处替换 · ${skipped} 处已是目标状态 · 涉及 ${byFile.size} 个文件`,
);
if (problems.length && !check) console.log("有未能替换的条目，请对照上面的提示手工处理。");
