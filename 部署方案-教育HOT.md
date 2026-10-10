# 教育HOT · 部署方案

> 给你（老甘）自己执行的一步步操作。全程在你这台 Windows 上，不用买服务器，不用备案，先跑通再说。
> 已确认：本机 Docker 29.2.1 + Compose v5.1.0 可用；补丁后代码 6 个项目 typecheck 全部 0 错误。

---

## 当前进度（2026-09-29 15:35）

**包和配置都备好了，只差两步。** 部署目录已经生成：`aihot-edu\_deploy\edu-hot\`

| 已就绪 | 说明 |
|---|---|
| ✅ 部署包 | `_deploy\edu-hot\`（源文件）与 `_deploy\教育HOT-部署包.zip`（9.0 MB，干净版） |
| ✅ `.env` | **已替你生成好，第 2 步可以直接跳过。** 管理员密码在 `_deploy/edu-hot/.env` 的 `ADMIN_PASSWORD` 里（**本文档不再写出明文，上公网前记得换**） |
| ✅ 模型 | 已接上你 `~/.arkcli` 里那个方舟 key，模型 `doubao-seed-evolving-latest-version`，实测 JSON 模式可用、响应约 2 秒 |
| ✅ 竞品日报 | `tools\.env.daily` 已配好（站点地址 + 推送 token），两条抓取链路实测能跑 |

| 还没做 | 原因 |
|---|---|
| ❌ `docker compose up` | **Docker Desktop 的引擎在我这边起不了**——我启动的 GUI 进程会随命令结束被沙箱回收，实测引擎起来约 10 秒后就被清掉，日志里连退出原因都没有。**需要你手动打开 Docker Desktop 一次**（沙箱外面的进程不受影响） |
| ❌ 数据进站 | 站点没起，所以还没跑第一次推送 |

> **想继续时**：手动打开 Docker Desktop（等左下角显示 Engine running）→ 在 `_deploy\edu-hot` 下跑 `docker compose up -d --build`。就这两步。也可以直接跟我说「继续部署 教育HOT」，我接着往下做。

---

## 0. 你要准备的东西（就两样）

| 要什么 | 为什么 | 去哪弄 |
|---|---|---|
| **一个模型的 API Key** | 站点靠模型把抓到的条目分类（判断哪条属于「竞品」）、写中文标题摘要、打分精选。**没有它，条目进得来但不会归到「竞品」栏** | 你手上应该已经有方舟/DeepSeek 的 key，任何 OpenAI 兼容接口都行 |
| **Docker Desktop** | 一个命令起数据库+后端+前端 | 已装在你这台机器上（29.2.1） |

数据库密码、会话密钥这些不用你操心，下面第 2 步给你现成的。

---

## 1. 解压部署包

把 `教育HOT-部署包.zip` 解压到一个**路径不带空格**的目录，比如：

```
D:\edu-hot\
```

解压后目录里应该有这些（关键几项）：

```
edu-hot\
├─ docker-compose.yml          ← 部署入口
├─ .env.example                ← 环境变量模板（下一步复制成 .env）
├─ industry\                   ← 你的行业包：8 个分类 / 9 类内容 / 40 主题 / 22 信源
│   ├─ site.ts                  站名「教育HOT」、关于页、页脚
│   ├─ taxonomy.ts              分类与标签（含「竞品」「日历」两栏）
│   ├─ sources.json             信源（教委官网、政府门户、媒体、9 个公众号、2 个外部采集口）
│   ├─ calendar.json            2026-2027 学年行业日历（15 条节点）
│   └─ prompts\                 分类与精选用的提示词
├─ tools\                      ← 采集工具
│   ├─ daily-competitor.sh      竞品日报一键跑（小红书 + 抖音）
│   ├─ collect-competitor-xhs.py
│   ├─ collect-competitor-douyin.mjs
│   ├─ collector-competitor.mjs 统一推进入库
│   └─ xhs-targets.json         18 个对标账号清单（已按你的确认删掉 20 个低粉号）
├─ 竞品账号清单-待确认.md
├─ 行业日历-未来120天.md
└─ README-教育HOT改造说明.md    ← 改造全过程，想改哪块先看它
```

> 包里还带一个 `industry.bak-<时间戳>\`，是最原始的 AI 版行业包，留着方便回退。不想要可以删。

---

## 2. 填 `.env`（已替你做完，想换值再看这节）

> ⚠️ **这一步已经自动完成了**，`.env` 就在 `_deploy\edu-hot\.env` 里。想核对或重生成：
> `python tools/init-deploy-env.py --dir <部署目录> --show-admin`
> （脚本是幂等的：已有的值不覆盖，只补缺失项。管理员密码和推送 token 也都是它生成的。）

在部署目录里把 `.env.example` 复制成 `.env`，然后**只改下面这几行**，其余整段不管：

```ini
# ── 必填 ──
SITE_URL=http://localhost:3000
ADMIN_PASSWORD=（设一个至少 12 位的密码，登录 /admin 用）

SESSION_SECRET=（随机串，见下方生成命令）
IMG_PROXY_SIGN_SECRET=（随机串，见下方生成命令）
POSTGRES_PASSWORD=（随机串，数据库密码，见下方生成命令）

# ── 模型（必填，否则条目不分类）──
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=（你的 key）
LLM_MODEL=deepseek-flash
LLM_EXTRA_JSON={"thinking":{"type":"disabled"}}

# ── 打开推送接口（竞品日报靠它进来）──
INGEST_TOKEN=（随机串，至少 16 位，见下方生成命令）
```

**随机串一条命令生成 4 个**（在 Git Bash 里跑）：

```bash
for i in 1 2 3 4; do openssl rand -hex 24; done
```

依次填给 `SESSION_SECRET` / `IMG_PROXY_SIGN_SECRET` / `POSTGRES_PASSWORD` / `INGEST_TOKEN`。

⚠️ **`INGEST_TOKEN` 别填成 `test`、`changeme`、`your-token` 这类词**——源码里有个占位符黑名单（`apps/api/src/routes/ingest.ts:9`），命中就整个接口关闭，返回 401 且不告诉你原因。

> 你要是已经有别的 OpenAI 兼容 key（方舟/千问/智谱），`.env.example` 里都写了对应三行的写法，照着换即可。

---

## 3. 起站（一条命令）

**先手动打开 Docker Desktop**（开始菜单搜 Docker Desktop，双击）。等它左下角显示绿色 `Engine running` 再往下走。

> 为什么必须你手动开：我这边启动的 Docker Desktop 会被沙箱连带回收（实测引擎起来约 10 秒后进程消失，日志里没有退出记录）。这不是 Docker 的问题，是沙箱对"我拉起的 GUI 进程"的清理机制。你自己双击开的完全不受影响，`restart: unless-stopped` 的容器会一直跟着 Docker Desktop 活着。

在部署目录打开 Git Bash：

```bash
cd "C:/Users/A/WorkBuddy/2026-09-29-10-26-22/aihot-edu/_deploy/edu-hot"
docker compose up -d --build
```

第一次会下载 Postgres 镜像 + 构建应用，**大概 5–15 分钟**。看到 `db` 健康、`setup` 退出、`api/worker/web` 都 Up 就成了。

```bash
docker compose ps          # 四个服务应该都是 running / healthy
docker compose logs -f web # 想看日志就这个
```

然后浏览器打开：

- **http://localhost:3000** —— 首页
- **http://localhost:3000/admin** —— 后台，用 `ADMIN_PASSWORD` 登录

**验收三件事**（现在就能验）：
1. 首页出来了吗？站名是不是「教育HOT」，导航条是不是 8 个栏目：全部 / 一手 / 政策 / 升学 / 舆情 / 行业 / 一线 / 解读 / **竞品** / **日历**。
2. 后台「信源」页能不能看到 22 个源，包括 `ext-gq-competitor`（竞品账号监测）。
3. 后台「信源」页把 `ext-gq-competitor` 的参与方式确认为 **editorial**（包里的 `sources.json` 已经声明好了，正常就是这样）。

---

## 4. 接上竞品日报（你的电脑每天往里推）

> ✅ `tools\.env.daily` **已经替你写好了**（站点地址 + 推送 token，token 与部署目录 `.env` 里的一致）。这一步可以跳过。
> 想手动改：把 `tools\.env.daily.example` 复制成 `tools\.env.daily`，填两行：

```ini
SITE_URL=http://127.0.0.1:3000
INGEST_TOKEN=（和 .env 里那个一模一样）
```

然后手工跑一次，看能不能推进入库：

```bash
cd C:/Users/A/WorkBuddy/2026-09-29-10-26-22/aihot-edu
bash tools/daily-competitor.sh
```

跑完你会看到 `✓ created=12 收到=12` 这种回执（实测就是这个数）。**刷新首页 → 点「竞品」栏 → 应该能看到重庆那 12 个号当天的动静**，标题长这样：

```
竞品上榜｜小红书 渝城优升圈｜窗口内高赞选题：「重庆一外优秀班主任公布！」…
```

> 采集脚本跑在**你这台电脑**上（小红书那边需要本机登录态），推给站点走 HTTP，所以站部署在服务器上也能这么用。

---

## 5. 确认「明天能拿到最新信息」

这条链路我已经实测过，但你自己验一遍更放心。**明天上午 10 点之后**看这三处：

| 看哪里 | 应该看到什么 | 没看到说明什么 |
|---|---|---|
| 站上「竞品」栏 | 12 个重庆号当天的账号动态 + 抖音三张榜 | 推送没成功：查 `tools\.env.daily` 的 `SITE_URL`/`INGEST_TOKEN`，或站点没起 |
| `tools\_obs-竞品-xhs.json` | 文件时间戳是今天 10 点 | 自动化任务没跑：看任务列表 |
| 公众号/人民日报等栏目 | 有新条目 | 这些信源需要你自己校准：后台「信源」页逐个点「试抓」 |

**时效规则你得知道**（这是站的硬规则，不是 bug）：- `publishedAt` 比「收录时刻」早 **超过 48 小时**的条目 → 自动降级为「回灌」，**不进「今天」、不进事件图、不加热度**。所以日报窗口设成 `--days 2` 正好卡住上限，再长就是白发。
- `publishedAt` 在未来（时区写错）→ **直接置空**，不报错。
- **这些时间都是脚本自己带的**，站点不猜。小红书那条链路我特意加了检查，超过 48 小时会打警告但**不改写**真实发布时间。

### 「日历」栏的内容怎么来的（这条要单独说）

**它不靠脚本刷，靠教委公告源抓到真实通知。** 具体路径：`web-cqjw-gggs`（重庆市教委公告公示）+ `web-moe-news` 抓到校历发布、考试日程、报名通知这类文件 → 模型判定为 `calendar_node` → 自动落进「日历」栏。

**我有意没做「按 `industry/calendar.json` 自动生成条目」这个功能。** 那份日历是**排期表**（未来 120 天有什么节点，离线用 `node tools/calendar-lookahead.mjs --days 120` 看），不是新闻。把它自动灌进首页，等于每天给自己造一批"未来某天会发生"的假新闻——站点会把它们按当天新闻排序，那是纯噪声。所以「日历」栏空着是**正常的**，等教委真发文件那天它自己就满了。

> 判断标准：这条是不是"今天真被人发出来的东西"？是 → 可以进；不是（只是你知道它未来会发生）→ 只进离线排期表。

---

## 6. 每天 10:00 自动跑

已经给你建好了一条自动化任务（**教育HOT · 竞品日报，每天 10:00**）。它每天会：

1. 跑 `bash tools/daily-competitor.sh`（小红书 18 个对标号 + 抖音飞瓜三张榜，有配 `.env.daily` 就推进入库）
2. 读两个观察文件，生成 `日报\竞品日报-YYYY-MM-DD.md`
3. 在对话里给你一段摘要：哪几个号有动静、有没有值得抄的选题、有没有新号上榜、有没有异常（掉粉 / 采集失败）

**注意**：任务跑的时候**你电脑要开着**（采集脚本在本机）。站点是 Docker 容器，`restart: unless-stopped`，**Docker Desktop 开着它就一直在**，不用管。

**站点没起也没关系**：脚本会先探活，连不上就明确说「站点没起，这一轮只出文件不推送」，照常生成 `日报\竞品日报-日期.md`。所以**部署前后每天都有简报可看**，不会因为没部署就白跑一天。

---

## 7. 想上服务器 / 挂域名（可选，先不急）

本机跑顺了再考虑。同一份代码：

```bash
# 服务器上：装 docker，上传部署包，改 .env 里的两行
SITE_URL=https://你的域名

# 用自带的 Caddy 自动签 HTTPS
SITE_DOMAIN=你的域名
docker compose --profile https up -d --build
```

还有三行上了公网再填：

```ini
TRUST_PROXY=true                     # Caddy 后面才开，直连时保持 false
ADMIN_EMAILS=你的邮箱                 # 管理员白名单
# MCP_ALLOWED_HOSTS=你的域名          # 域名和 SITE_URL 不同才需要
```

备案和域名你自己那条线；`industry\site.ts` 里的 `icp` 字段填了才会在页脚显示。

---

## 8. 出问题先看这张表

| 症状 | 原因 | 怎么办 |
|---|---|---|
| `docker compose up` 报端口占用 | 3000 被别的程序（比如你之前起的预览服务）占了 | `.env` 里加 `PORT=3030`，或 `docker compose down` 后重来 |
| 网页打得开，「竞品」栏是空的 | 推送没通 / 没填 LLM key | `bash tools/daily-competitor.sh` 手动跑一次看回执；确认 `LLM_API_KEY` 非空 |
| 推送返回 `401 Unauthorized` | `INGEST_TOKEN` 两边不一致，或命中占位符黑名单 | 两边对齐；换一个 24 位随机串 |
| 推送返回 `429` | 1 分钟超过 10 次请求 | 脚本已经按 50 条一批、批间隔 6.5 秒发，正常不会触发；手动连点才会 |
| 推送返回 `413` | 单次超过 50 条 | 脚本自动分批，正常不会触发 |
| 小红书那步一个号都没数据 | 本机 `xhs` 登录态过期 | `xhs status --json` 看 `authenticated` 是不是 true，重登一次 |
| 抖音那步抓不到 | 飞瓜页面结构改了 | 报我，我按新结构修 `tools/collect-competitor-douyin.mjs` |
| 文章进去了但不分类 | 模型调用失败或没配额 | `docker compose logs -f worker` 看报错 |
| 页面标题乱码 | 数据库字符集 | 一般不会；真出现就把 `docker compose down -v` 重来（会清库） |

---

## 9. 还剩三件只有你能做的事

1. **公众号 9 个源要付费接口**：那 9 个 `mp_account` 源走的是「极致了 / Dajiala」，要在 `.env` 里填 `DAJIALA_KEY`。不填它们就不运行——不填也不影响竞品和官网那几路。
2. **官网类信源的选择器要校准**：`web-cqjw-gggs`、`web-cqjw-bmdt` 用的是 `parseMode: "markdown"`，需要 `JINA_API_KEY`；`web-thepaper-edu`、`web-jyb`、`web-heibandongcha` 也建议点一次「试抓」确认抓得到。
3. **精选标准要拿你的判断力校准**：`industry\gold.example.jsonl` 是给你手标「这条该不该选」的样例，标完跑 `scripts/eval-selection.ts` 就能调阈值。默认参数是我按行业经验给的，不是你的尺子。

---

## 附：最小命令清单（想直接抄）

```bash
# 生成 4 个随机串
for i in 1 2 3 4; do openssl rand -hex 24; done

# 起站
cd /d/edu-hot
cp .env.example .env        # 然后编辑 .env，填 8 行，见第 2 步
docker compose up -d --build
docker compose ps

# 接上竞品日报
cd "C:/Users/A/WorkBuddy/2026-09-29-10-26-22/aihot-edu"
cp tools/.env.daily.example tools/.env.daily   # 填 SITE_URL + INGEST_TOKEN
bash tools/daily-competitor.sh

# 打开看
#   http://localhost:3000          首页
#   http://localhost:3000/all?category=competitor   竞品栏
#   http://localhost:3000/all?category=calendar     日历栏
#   http://localhost:3000/admin    后台
```
