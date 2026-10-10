// 这个行业的分类体系：类别、标签词表、主体名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉模型怎么归类。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 */
export const CATEGORIES = [
  {
    key: "policy",
    label: "政策",
    section: "政策与官方动向",
    guide: "教委、政府、人大政协发布的政策文件、通知、通报、公示、征求意见稿、新闻发布会、部署会议要求，以及上级部门的监管口径",
  },
  {
    key: "admission",
    label: "升学",
    section: "升学节点与招生动态",
    guide: "招生入学相关：招生方案、划片范围、摇号派位、报名时间、现场审核、学位预警、转学学籍、开放日、分班、期中期末、开学与放假安排",
  },
  {
    key: "sentiment",
    label: "舆情",
    section: "家长情绪与舆情焦点",
    guide: "家长视角的情绪与争议：投诉举报、维权、吐槽、热议、网络问政诉求、伙食校服班费争议、作业量与睡眠、心理健康、学校回应与官方调查",
  },
  {
    key: "industry",
    label: "行业",
    section: "机构与行业动态",
    guide: "教育机构与市场的经营面：机构监管、年检注销、违规查处、跑路退费、融资并购、人事变动、获客成本、商业模式、竞品动作。没归上类的资料默认进这一节",
  },
  {
    key: "practitioner",
    label: "一线",
    section: "一线声音",
    guide: "校长、教师、班主任、教研员、机构经营者等一线从业者的第一人称自述、观点、经验复盘与实际处境，区别于官方口径和媒体报道",
  },
  {
    key: "guide",
    label: "解读",
    section: "内容风向与解读",
    guide: "政策解读、择校攻略、升学方法论、避坑经验、家长高频问题的科普，以及社媒上正在讨论的教育内容风向",
  },
  {
    key: "wechat",
    label: "公众号",
    section: "公众号与抖音动向",
    guide: "来自微信公众号的内容。**平台优先于主题**：只要这篇是微信公众号发的（信源属公众号类，或标题、来源里出现公众号名称、公众号、推送、阅读量、关注后回复这类字样），就归这一栏——包括公众号上的政策解读、择校攻略、真题与资料分享、机构号与老师个人号的通知，以及账号级动作（哪篇跑了爆款、涨粉、矩阵增删）。例外：官方一手的正式发文（教委文件、考试院公告）与媒体原创报道仍按主题归到政策、升学、舆情等栏目，不因为发在公众号上就搬过来",
  },
  {
    key: "douyin",
    label: "抖音",
    section: "公众号与抖音动向",
    guide: "来自抖音平台的内容。**平台优先于主题**：标题或来源里标注了抖音、抖音号、直播间、抖加、DOU+，或来自抖音行业榜单的（榜单名次、点赞增量、粉丝数），都归这一栏——包括跑出来的爆款视频、涨粉与掉粉、直播场次与话术、投放起量、矩阵号增删。边界：账号怎么打归这里；机构被查被罚、年检注销、融资人事仍归「行业」；小红书内容不设专栏，按主题归到行业或解读",
  },
  {
    key: "calendar",
    label: "日历",
    section: "行业日历与节点",
    guide: "全年的教育与行业时间节点：开学、期末、半期、月考、选拔考试、中高考、政策发布窗口、招生报名、家长会、竞赛、节假日、展会、节令、大促、申报与上新。写清节点名称与起止时间（含年份），以及它牵动哪个学段、家长在那个窗口要做什么决定",
  },
] as const;

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = [
  "policy_release", "admission_update", "institution_move", "market_business", "parent_sentiment", "practitioner_voice", "guide_explainer",
  "competitor_move", "calendar_node",
] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "政策/监管", "升学/招生", "家长/舆情", "一线/从业者", "机构/经营", "学校/建设", "行业/市场", "解读/攻略", "内容/风向",
  "竞品/账号", "日历/节点", "其他",
] as const;

/**
 * 可选的主题标签。分三组：常态主题（学段、赛道、经营）· 竞品账号动作 · 行业日历节点。
 * 竞品与节点这两组是「竞品」「日历」两个栏目的抓手，卡片上点一下就能筛。
 */
export const TOPIC_TAGS = [
  // 常态主题
  "幼升小", "小升初", "中考", "高考", "双减", "招生政策", "学区划片", "学位预警", "民办学校", "集团化办学",
  "教培监管", "家长焦虑", "教师减负", "机构经营", "私域获客", "内容运营", "艺体特长", "心理健康", "区县教育",
  // 竞品账号动作
  "竞品账号", "爆款笔记", "涨粉", "直播间", "付费投放", "账号矩阵", "选题排期",
  // 行业日历节点（可多选；对应 calendar.json 里的 17 类节点，其中「其他」不设标签）
  "开学", "期末", "半期", "月考", "选拔考试", "中高考", "政策", "招生", "家长会", "竞赛",
  "节假日", "展会", "节令", "大促", "申报", "上新",
] as const;

/** 可选的实体标签（机构、平台）。 */
export const ENTITY_TAGS = [
  "教育部", "重庆市教委", "重庆教育考试院", "七龙珠", "学而思", "新东方", "作业帮", "猿辅导", "高途", "中公教育",
  "小红书", "抖音", "视频号", "芥舟语文",
] as const;

/** 模型常写的近义词，统一成词表里的写法。注意：不要映射到 TOPIC_TAGS 里的词，否则会吃掉主题标签。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  监管: "政策/监管", 法规: "政策/监管", 通知: "政策/监管", 公告: "政策/监管", 公示: "政策/监管",
  征求意见: "政策/监管", 条例: "政策/监管", 规定: "政策/监管", 建档立卡: "政策/监管", 学籍: "政策/监管",
  入学: "升学/招生", 划片: "升学/招生", 摇号: "升学/招生", 派位: "升学/招生", 报名: "升学/招生",
  学位: "升学/招生", 升学: "升学/招生", 录取: "升学/招生", 择校: "升学/招生", 分班: "升学/招生", 转学: "升学/招生",
  家长: "家长/舆情", 舆情: "家长/舆情", 投诉: "家长/舆情", 举报: "家长/舆情", 维权: "家长/舆情", 争议: "家长/舆情",
  热议: "家长/舆情", 吐槽: "家长/舆情", 问政: "家长/舆情", 焦虑: "家长/舆情", 情绪: "家长/舆情",
  教师: "一线/从业者", 老师: "一线/从业者", 校长: "一线/从业者", 班主任: "一线/从业者", 教研员: "一线/从业者",
  从业者: "一线/从业者", 一线: "一线/从业者", 非教学事务: "一线/从业者", 站讲台: "一线/从业者",
  机构: "机构/经营", 教培: "机构/经营", 培训: "机构/经营", 辅导班: "机构/经营", 补习: "机构/经营", 托管: "机构/经营",
  课后服务: "机构/经营", 退费: "机构/经营", 跑路: "机构/经营", 年检: "机构/经营", 办学许可证: "机构/经营", 无证办学: "机构/经营",
  学校: "学校/建设", 新建学校: "学校/建设", 新校区: "学校/建设", 名校: "学校/建设", 集团化: "学校/建设",
  县中: "学校/建设", 校区: "学校/建设",
  行业: "行业/市场", 市场: "行业/市场", 融资: "行业/市场", 并购: "行业/市场", 收购: "行业/市场", 上市: "行业/市场",
  商业: "行业/市场", 获客: "行业/市场", 生意: "行业/市场",
  解读: "解读/攻略", 攻略: "解读/攻略", 科普: "解读/攻略", 经验: "解读/攻略", 方法: "解读/攻略", 指南: "解读/攻略", 避坑: "解读/攻略",
  内容: "内容/风向", 风向: "内容/风向", 短视频: "内容/风向", 爆款: "内容/风向", 选题: "内容/风向", 流量: "内容/风向", 矩阵: "内容/风向",
  教育: "其他", 非教育: "其他", 通用: "其他", 动态: "其他",
  // 竞品与节点
  对标账号: "竞品账号", 竞品: "竞品账号", 同行账号: "竞品账号", 对标: "竞品账号",
  爆款内容: "爆款笔记", 涨粉量: "涨粉", 粉丝增长: "涨粉", 直播: "直播间", 投流: "付费投放", 投放: "付费投放",
  矩阵号: "账号矩阵", 内容排期: "选题排期", 排期: "选题排期",
  开学季: "开学", 期中: "半期", 期中考试: "半期", 摸底考: "月考", 模拟考: "选拔考试", 自主招生: "招生",
  寒暑假: "节假日", 假期: "节假日", 节气: "节令", 节日: "节令", 行业会议: "展会", 会销: "大促",
  // 平台
  视频号直播: "视频号",
};

/** 模型漏了分类标签时，按内容类型补一个。 */
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string, string>> = {
  policy_release: "政策/监管",
  admission_update: "升学/招生",
  institution_move: "机构/经营",
  market_business: "行业/市场",
  parent_sentiment: "家长/舆情",
  practitioner_voice: "一线/从业者",
  guide_explainer: "解读/攻略",
  competitor_move: "竞品/账号",
  calendar_node: "日历/节点",
};

// ── 主体机构与学校 ──────────────────────────────────────────────────────────────────────

/** 机构主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[] }> = {
  moe: { name: "教育部", displayTag: "教育部", aliases: ["教育部", "中华人民共和国教育部", "国家教育部"] },
  "cq-jw": {
    name: "重庆市教委",
    displayTag: "重庆市教委",
    aliases: ["重庆市教委", "重庆市教育委员会", "重庆教委"],
  },
  "cq-ksy": {
    name: "重庆教育考试院",
    displayTag: null,
    aliases: ["重庆市教育考试院", "重庆教育考试院", "重庆招考"],
  },
  qilongzhu: {
    name: "七龙珠（重庆七所直属校）",
    displayTag: "七龙珠",
    aliases: ["七龙珠", "重庆一中", "南开中学", "重庆八中", "巴蜀中学", "育才中学", "西南大学附中", "重庆外国语学校", "西大附中", "一外"],
  },
  xueersi: { name: "学而思 / 好未来", displayTag: null, aliases: ["学而思", "好未来", "TAL"] },
  xdf: { name: "新东方", displayTag: null, aliases: ["新东方", "New Oriental"] },
  zuoyebang: { name: "作业帮", displayTag: null, aliases: ["作业帮"] },
  yuanfudao: { name: "猿辅导", displayTag: null, aliases: ["猿辅导", "猿编程", "斑马"] },
  gaotu: { name: "高途", displayTag: null, aliases: ["高途", "跟谁学"] },
  offcn: { name: "中公教育", displayTag: null, aliases: ["中公教育", "中公"] },
  fenbi: { name: "粉笔", displayTag: null, aliases: ["粉笔", "粉笔教育"] },
  xiaohongshu: { name: "小红书", displayTag: null, aliases: ["小红书", "RED"] },
  douyin: { name: "抖音", displayTag: null, aliases: ["抖音", "Douyin"] },
  shipinhao: { name: "视频号", displayTag: "视频号", aliases: ["视频号", "微信视频号"] },
  // 竞品 / 对标账号：照这个格式往里加，displayTag 写账号名，aliases 写常见简称。
  // 小红书、抖音上的账号没有域名，不会自动认领，靠 aliases 命中正文里的账号名。
  jiezhou: { name: "芥舟语文", displayTag: "芥舟语文", aliases: ["芥舟语文", "芥舟"] },
};

/**
 * 身份词典：摘要和标题里出现的机构，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "moe", name: "教育部", patterns: [/教育部|中华人民共和国教育部/] },
  { id: "cq-jw", name: "重庆市教委", patterns: [/重庆市?教育委员会|重庆市?教委|重庆教委/] },
  { id: "cq-ksy", name: "重庆教育考试院", patterns: [/重庆市?教育考试院|重庆招考/] },
  {
    id: "qilongzhu",
    name: "七龙珠",
    patterns: [/七龙珠|重庆一中|南开中学|重庆八中|巴蜀中学|育才中学|西南大学附中|西大附中|重庆外国语学校|重庆一外/],
  },
  { id: "xueersi", name: "学而思 / 好未来", patterns: [/学而思|好未来|\bTAL\b/] },
  { id: "xdf", name: "新东方", patterns: [/新东方/i] },
  { id: "zuoyebang", name: "作业帮", patterns: [/作业帮/] },
  { id: "yuanfudao", name: "猿辅导", patterns: [/猿辅导|猿编程|斑马(?:英语|AI)?/] },
  { id: "gaotu", name: "高途", patterns: [/高途|跟谁学/] },
  { id: "offcn", name: "中公教育", patterns: [/中公教育/] },
  { id: "fenbi", name: "粉笔", patterns: [/粉笔(?:教育|公考|网校)?/] },
  { id: "jiezhou", name: "芥舟语文", patterns: [/芥舟语文|芥舟/] },
];

/** 这些域名上的文章，发布方就是对应的机构（托管平台不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "moe", domains: ["moe.gov.cn"] },
  { entityId: "cq-jw", domains: ["jw.cq.gov.cn"] },
  { entityId: "cq-ksy", domains: ["cqksy.cn"] },
  { entityId: "xdf", domains: ["xdf.cn"] },
  { entityId: "xueersi", domains: ["xueersi.com", "100tal.com"] },
  { entityId: "zuoyebang", domains: ["zuoyebang.com"] },
  { entityId: "yuanfudao", domains: ["yuanfudao.com"] },
  { entityId: "offcn", domains: ["offcn.com"] },
  { entityId: "fenbi", domains: ["fenbi.com"] },
];

/** 原文里的这些写法也算提到了对应机构。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "cq-jw", pattern: /@重庆教育\b|“重庆教育”微信公众号/ },
  { entityId: "cq-ksy", pattern: /@重庆招考\b/ },
  { entityId: "moe", pattern: /@微言教育\b|“微言教育”/ },
];
