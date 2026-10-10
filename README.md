# 教育HOT

> 一个**自己找热点、自己写日报**的教育行业资讯站。
>
> 把信源换成教育圈的，把精选标准换成教培的 KnowHow —— 它每天替你盯 22 个信源，
> 抓取、归并、打分、精选，早上 8 点出一份教育日报。

本站基于开源项目 [AIHOT](https://github.com/KKKKhazix/AIHOT) 改造，界面保持原样，
行业配置（分类、信源、精选标准、提示词、行业日历）整体换成了教育行业。

---

## 打开就能看到什么

首页有 9 个栏目，从左到右就是它的工作流：

| 栏目 | key | 收什么 |
|---|---|---|
| **政策** | `policy` | 教委、政府、人大政协的发文、通知、公示、征求意见稿、发布会 |
| **升学** | `admission` | 划片、摇号、报名、学位预警、转学学籍、开学放假、期中考 |
| **舆情** | `sentiment` | 家长投诉举报、维权、热议、问政诉求、伙食校服班费争议 |
| **行业** | `industry` | 机构监管、年检注销、违规查处、跑路退费、融资人事、竞品动作（**未归类的都落到这**） |
| **一线** | `practitioner` | 校长 / 教师 / 班主任 / 教研员 / 机构经营者的第一人称自述 |
| **解读** | `guide` | 政策解读、择校攻略、避坑经验、家长高频问题科普 |
| **公众号** | `wechat` | 微信公众号来的内容（**平台优先于主题**） |
| **抖音** | `douyin` | 抖音来的内容：行业榜、爆款视频、涨粉、直播、投放 |
| **日历** | `calendar` | 全年节点：开学、期中期末、中高考、报名窗口、政策发布期 |

另外还有「热点榜」（按热度信号排序）和「教育日报」（每天 08:00 成刊）。

后台在 `/admin`，能看信源状态、收录量、运行日志，还能上传关于页的二维码。

---

## 在自己电脑上跑起来

需要 **Docker Desktop**（先打开它，等左下角变绿）。

```bash
# 1. 生成配置（会顺手读本机的火山方舟 key，生成随机密码与推送 token）
python tools/init-deploy-env.py

# 2. 起站（首次会构建镜像，要几分钟）
docker compose up -d

# 3. 打开
#   http://localhost:3000        站点
#   http://localhost:3000/admin  后台
```

管理员密码在 `.env` 的 `ADMIN_PASSWORD`。想看它打印出来：

```bash
python tools/init-deploy-env.py --show-admin
```

> `tools/init-deploy-env.py` 是幂等的：**已存在的值一律不覆盖**，只补缺失的键；
> 你手工加的配置和它上方的注释也会原样保留。

---

## 想改东西，改哪里

| 想改什么 | 改哪个文件 |
|---|---|
| 站名、行业词、首页大标题、关于页文案、页脚 | `industry/site.ts` |
| 栏目（增删分类、栏目说明） | `industry/taxonomy.ts` 的 `CATEGORIES` |
| 标签词表、机构名录、身份词典 | `industry/taxonomy.ts` |
| 信源（加/删/改抓取方式） | `industry/sources.json` |
| 主题页 | `industry/topics.json` |
| 行业日历节点与真实日期 | `industry/calendar.json` |
| 入选门槛（什么内容算「精选」） | `industry/selection.ts` |
| 给模型看的行业 KnowHow | `industry/prompts/`（27 份提示词） |
| 品牌图（favicon / PWA 图标 / logo） | `industry/brand/` |

改完 `docker compose up -d --build` 生效。

> **栏目的增删不用改界面代码。** 筛选栏、卡片角标、RSS 分类、分享图都是从
> `CATEGORIES` 自动推导出来的 —— 这就是为什么加「公众号」「抖音」「日历」三栏
> 一行 UI 代码都没动。

---

## 两个必须知道的坑

这两条是实际踩出来的，重新部署时**务必**保留：

### 1. 分析并发必须压到 1

`.env` 里：

```
ANALYZE_CONCURRENCY=1
```

上游默认是 6（写死在 `packages/backend/src/jobs/content.ts`，而且没进 `.env.example`）。
实测上游模型端点扛不住并发：**串行 6 次全通，并发 6 次只成 1 次**，失败形态是
`ECONNRESET` 和连接超时（不是 429）。

更麻烦的是第二层：这类**网络级失败**在计费保护里会被判成 `unknown` 收据
（系统怕重复计费，不敢自动重发），于是文章直接进 `failed`、**不产生任何对外可见的条目**。
表面看就是「某个栏目突然不更新了」，但根因在模型调用，跟栏目没关系。

排查入口：后台「运行」页能看失败条目与收据状态；`processing_error` 里出现
`receipt NNNN outcome unknown` 就是这条。

### 2. 没配 Jina key 就要关掉正文兜底

`.env` 里：

```
JINA_BODY_FALLBACK=false
```

`packages/backend/src/providers/jina.ts` 在没配 `JINA_API_KEY` 时是**直接抛错**，
不是优雅降级；而 `extract.ts` 的默认值是不等于 `false` 就开启。
于是没配 key 的部署会在正文抽取阶段抛错、整条处理链崩。

关掉之后正文状态是 `unconfirmed`，按标题判定 —— 对资讯类内容够用。
以后想真正渲染正文，去 https://jina.ai 拿个 key 填 `JINA_API_KEY`，再把上面改成 `true`。

---

## 还要补什么才能满血

| 缺什么 | 影响 | 怎么补 |
|---|---|---|
| `DAJIALA_KEY` | 9 个微信公众号信源抓不到，**「公众号」栏是空的** | 找搭啦数据拿 key，填 `.env` |
| `JINA_API_KEY` | 两个教委栏目（公告公示 / 部门动态）需要它渲染正文 | 同上，填完把 `JINA_BODY_FALLBACK` 改回 `true` |
| 三个 `web_list` 信源待校准 | 中国教育新闻网、澎湃教育、黑板洞察从没产出过 | 后台信源页用「试抓」校准选择器 |
| 小红书采集登录态 | 本机 `xhs` CLI 的 cookie 约 7 天过期，过期后小红书那条线静默断 | 定期跑 `xhs login` |

---

## 目录结构

```
├── industry/                  教育行业包 —— 换行业只动这里
│   ├── site.ts                站名与全部文案
│   ├── taxonomy.ts            分类、标签词表、机构名录、身份词典
│   ├── sources.json           22 个信源
│   ├── topics.json            40 个主题页
│   ├── calendar.json          行业日历节点
│   ├── selection.ts           入选门槛
│   ├── prompts/               27 份提示词（模型看到的行业 KnowHow）
│   └── brand/                 品牌图
├── apps/                      应用层
│   ├── web/                   React Router 8 + SSR 前端
│   ├── api/                   Fastify 接口
│   └── worker/                抓取与分析的常驻进程
├── packages/backend/          核心逻辑
│   ├── content/               抓取、正文抽取、归并
│   ├── editorial/             分类、打分、精选（analyze.ts 是主流程）
│   ├── providers/             模型 / 搜索 / 抓取供应商，含计费收据
│   └── jobs/                  队列与定时任务
├── database/                  数据库迁移与种子
├── tools/                     日常工具（竞品采集、部署配置、单页导出）
└── docker-compose.yml         db + setup + api + worker + web
```

---

## 日常工具

| 工具 | 干什么 |
|---|---|
| `tools/init-deploy-env.py` | 生成 / 补全 `.env`（幂等，不覆盖已有值） |
| `tools/collect-competitor-douyin.mjs` | 抓抖音行业榜（飞瓜公开榜，免登录） |
| `tools/collect-competitor-xhs.py` | 抓小红书对标账号（需要本机 `xhs` 登录态） |
| `tools/collector-competitor.mjs` | 把上面的观察推进入库接口 |
| `tools/calendar-lookahead.mjs` | 查「未来 N 天有什么节点」 |
| `tools/check_pack.mjs` | 行业包自检（防词表漂移） |
| `tools/stage-publish.py` | 把部署目录整理成可发布的源码树，并反向核查密钥没混进来 |
| `tools/scan-secrets.py` | 密钥扫描（值比对 + 形态匹配 + 赋值形态三路） |

---

## 来源与许可

上游框架：[AIHOT](https://github.com/KKKKhazix/AIHOT)，MIT 许可（见 `LICENSE` / `NOTICE`）。
上游原始 README 保留在 [`README-上游AIHOT原版.md`](README-上游AIHOT原版.md)。

改造说明与施工记录见 [`README-教育HOT改造说明.md`](README-教育HOT改造说明.md)。

> ⚠️ 那份改造说明写于改造当时，其中「8 个分类」的表述**已过期** ——
> 后来「竞品」栏被拆成了「公众号」+「抖音」两栏，现在是 9 个分类。
> 以 `industry/taxonomy.ts` 为准。

**本仓库不含任何密钥。** `.env` 已在 `.gitignore` 里排除，只保留 `.env.example` 模板。
