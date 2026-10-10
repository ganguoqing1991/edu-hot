// 站点身份和读者看得到的文案。换成你的行业时，先改这个文件。
// 网页和后端都读它；改完重新构建（docker compose up --build）即可生效。
// 域名不在这里：部署时用环境变量 SITE_URL 设置。

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "教育HOT",
  /**
   * 行业词：拼进默认说法里，比如“教育日报”“教育动态”。
   * 页面上会自动变成“教育日报”“全部教育动态”。
   */
  subject: "教育",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "教育HOT — 教育行业动态 · 每日精选与日报",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: "自动盯住教委官网、政府门户、教育媒体、公众号和一线从业者的发声，用模型摘要、打分、精选，把同一件事的多篇报道归到一起，每天早上出一份教育日报。",
  /** 首页左上角和侧边栏下面的一行小字。 */
  tagline: "值得关注的教育动态",
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "zh-CN",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "http://localhost:3000",
  /**
   * MCP 工具名的前缀（小写字母、数字、下划线），工具会叫 jiaoyuhot_get_latest、jiaoyuhot_search……
   * 已经有人接入后就不要再改。
   */
  mcpPrefix: "jiaoyuhot",
  /** 对外联系邮箱（选填）：使用规则、llms.txt、响应头里会写。 */
  contactEmail: null as string | null,
  /** 页脚的一行小字（选填）。 */
  footerNote: "由 AIHOT 开源框架驱动",
  /** 中国大陆网站的 ICP 备案号（选填），填了就显示在页脚并链接到工信部备案系统。 */
  icp: null as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "教育HOT",
    /** 创始人（选填）：{ name, url, description }。 */
    founder: {
      name: "老甘",
      description: "12 年教培行业新媒体运营，做小红书矩阵获客与教育机构内容赋能",
    } as null | { name: string; url?: string; description?: string },
  },
  /** 抓取信源时报上的名字（User-Agent 里用），不要冒用别的站。 */
  crawlerName: "JiaoYuHOTBot",
} as const;

/** 关于页的文案。数字（信源数、收录数、精选数、日报期数）来自站内实时统计，不用写在这里。 */
export const ABOUT = {
  kicker: `关于 ${SITE.name}`,
  /** 大标题：第一行正常颜色，第二行强调色。 */
  headline: ["教育圈每天都有新动静，", "值得看的，只有几条。"] as [string, string],
  /** 标题下面的一段话。{sources} 会换成实时的信源数。 */
  lead: `${SITE.name} 替你盯着 {sources} 个信源：教委官网、政府门户、教育媒体、公众号和一线从业者的发声，抓取、归并、打分、精选，每天早上 8 点出一份教育日报。免费，不用注册。`,
  /** 信源河动画下面的四个环节。 */
  steps: {
    collect: "教育部与市教委官网、政府门户、教育媒体、公众号和一线校长教师的账号都在看；活跃的源 30 分钟就看一次。",
    store: "抓到的都存下来，同一件事的报道归到一起；只计入热度的账号也算在内，热点榜就是从这里算出来的。",
    select: "模型先看是不是教育领域的事、有没有实际信息，再写中文标题、摘要和推荐理由；招生广告、机构营销稿和重复转发进不来。",
    publish: "每天 08:00 出日报，周一出周报，每月 1 日出月报；最精选的几条可以推到飞书群。",
  },
  /**
   * 作者块（选填），null 就不显示。
   * avatarSourceId：一个 X 账号信源的 id，头像取它的（选填）。
   * 二维码在后台“设置”里上传，或者放进 industry/brand/contact/；没有二维码就不显示那张卡片。
   */
  maker: {
    name: "老甘",
    greeting: [
      "12 年教培行业新媒体运营，从用户增长做到区域新媒体负责人。",
      "现在帮教育机构做小红书矩阵获客与内容体系建设，也顺手把这个站搭了起来。",
    ],
    avatarSourceId: null as string | null,
    wechat: { title: "加我微信", note: "聊聊教育新媒体与获客" },
    feishu: { title: "飞书群", note: "每天精选几条推给你" },
  } as null | {
    name: string;
    greeting: string[];
    avatarSourceId?: string | null;
    wechat?: { title: string; note: string };
    feishu?: { title: string; note: string };
  },
  /** 页面底部的版权与下架说明（结尾会接“反馈页”的链接）。 */
  copyright: `${SITE.name} 是聚合摘要和阅读索引，原文版权归各来源所有。如果你是来源方（教委、学校、媒体或机构），希望更正、下架或调整展示方式，可以通过`,
} as const;

/** “教育日报”这类说法：行业词和名词之间，英文词加空格，中文词不加。 */
export function withSubject(noun: string): string {
  return /[A-Za-z0-9]$/.test(SITE.subject) ? `${SITE.subject} ${noun}` : `${SITE.subject}${noun}`;
}
