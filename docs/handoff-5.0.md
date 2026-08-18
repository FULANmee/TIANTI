# TIANTI 5.0 交接文档

> 历史交接说明：抖音关联小号、行程自动建活动及活动合并功能已在后续版本移除。当前规则以 `docs/spec/talents-and-assets.md`、`docs/spec/ratings-and-ladders.md` 和 ADR 0003 为准。

> 这份文档面向接手 TIANTI 5.0 的开发者、部署维护者和内容编辑。它记录已经实现的产品行为、代码入口、部署约定和不能踩的坑。文档生成日期：2026-08-10。

## 1. 项目结论

TIANTI 是一个面向公开访客的 cosplay / 国风达人展示站，同时提供后台工作台维护达人、活动、活动阵容、现场档案和编辑人天梯榜。

5.0 的核心新增能力是：

- 不使用抖音 OAuth，通过同一个 Vercel 项目里的 Python Service 读取公开抖音主页资料。
- 同步达人主页简介原文、粉丝量和简介中可以权威确认的 `@账号` 小号链接。
- 达人详情页展示粉丝量（例如 `1.2 万`）、原样行程和关联小号；首页和达人卡片不展示这些字段。
- 只把明确解析出的“未来 + 深圳”行程自动写入活动；其他城市行程只保留在达人详情页展示。
- 活动从未来变成过去后，保留已经发生的活动和同步记录，不因为达人后来删掉简介行程而自动删除历史。
- 支持人工合并活动；合并后抖音来源仍然绑定到保留活动，后续同步不会重新拆回去。
- 修复活动档案页两个保存按钮共享 loading 状态的问题：保存活动信息和保存我的档案各自显示自己的 loading 文案。

5.0 已在本地通过完整质量检查，并在 Vercel Preview 成功构建过。生产上线前仍必须按本文档的环境变量、数据库和 Preview 验证步骤执行。

## 2. 用户可见功能

### 2.1 公开站

主要路由：

- `/`：公开首页。
- `/talents`：达人列表。
- `/talents/[slug]`：达人详情，包含主页行程、关联小号、抖音粉丝量、未来活动和历史记录。
- `/events`：活动列表和筛选。
- `/events/[slug]`：活动详情和现场档案。
- `/ladder`：公开天梯榜。
- `/search`：公开搜索。
- `/schedule`：兼容旧入口，会重定向到活动视图。

达人详情页的抖音区域位于顶部资料区：

- “主页行程”按抓取时的简介文本原样分块显示，可读性由换行和容器布局提升，不改写用户原文。
- “关联小号”只显示服务返回的真实抖音链接，点击新窗口打开。
- 粉丝量通过 `src/modules/douyin/format.ts` 格式化成“多少万”，不显示抓取时间。
- 没有成功同步资料时不渲染空的抖音区块。

### 2.2 后台工作台

- `/admin/login`：编辑账号登录。
- `/admin/talents`：达人资料、抖音主页链接、代表图和手动同步。
- `/admin/archives`：活动、阵容、现场档案、活动合并。
- `/admin/events`：兼容旧入口，重定向到活动档案工作区。
- `/admin/ladder`：编辑个人天梯榜。

达人后台的抖音同步按钮：

- “立即同步抖音”：同步当前选中达人。
- “立即同步全部抖音”：同步所有已配置有效抖音主页的达人。
- 手动同步有冷却时间，避免重复请求；运行中的批次由数据库锁保护。
- 同步失败保留上一次成功的简介、粉丝量和小号数据，只记录错误状态。

活动档案页的两个保存动作互不共用可见 loading：

- 活动保存期间显示“保存中...”，档案按钮仍显示“保存我的档案”。
- 档案保存期间显示“保存中...”，活动按钮仍显示“保存活动信息”。
- 删除、批量删除、活动合并仍使用工作区级别的 transition 来防止重复提交。

## 3. 关键产品规则

### 3.1 抖音主页链接和小号

主抖音主页必须作为达人链接中的一项保存，并且链接标签标注为“抖音”“抖音主页”或 `douyin`。URL 必须是安全的抖音个人主页路径：

- `https://www.douyin.com/user/<id>`
- `https://v.douyin.com/<code>`（仅作为主主页输入时接受）

如果有多个被标注为主抖音的链接，或者存在抖音链接但没有正确标签，同步会跳过，不会猜测哪个是大号。

简介里的 `@账号` 固定按关联小号处理，但只有服务拿到了真实、可验证的抖音 URL 才会展示。不能根据昵称拼接 URL，也不能用无法验证的短链接替代真实主页链接。

### 3.2 行程解析

解析器入口是 `src/modules/douyin/itinerary.ts`，当前支持：

- `8.8深圳金铲铲`
- `8.8～9 深圳金铲铲`
- `8.8-9 深圳`
- `815成都明日之后` 这类紧凑日期
- 年/月/日、中文标点和常见分隔符
- 当前代码内置的城市词表

活动名缺失时保持空白，不弹候选名，也不按城市硬填活动名。简介原文仍会进入展示区；解析失败的行程会记录跳过原因。

### 3.3 深圳自动活动和合并

只有满足以下条件的解析条目才参与自动活动写入：

1. 日期未过期；
2. 城市标准化后是深圳；
3. 有可用的日期范围。

合并规则：

- 同一规范化活动名优先分组。
- 没有活动名的条目只有在能唯一匹配某个命名组时才加入。
- 组内最早日期到最晚日期的总跨度最多 5 天；不是“任意相邻日期差 5 天”。
- 相同日期、相同城市但活动名明确不同的条目不合并，例如 `8.8金铲铲深圳` 和 `8.8和平精英深圳`。
- 自动创建的事件使用 `origin = douyin_sync`；人工合并后的保留事件使用 `origin = douyin_merged`。

后台人工合并流程：勾选至少两个未结束活动 → 点击“合并活动” → 选择保留活动 → 确认合并。合并时会迁移并去重阵容、各编辑人的现场档案和抖音来源关系，并建立 `event_merge_rules`，让后续同步继续更新保留活动。

### 3.4 删除和历史保留

- 已完成活动不能参加批量合并，也不能被抖音简介同步自动删除。
- 手动活动不会被同步删除。
- 未来的抖音自动活动在来源连续缺失达到阈值、且没有阵容和现场档案时才可清理。
- 有阵容或档案的活动会保留，避免内容丢失。
- 已经映射到过去活动的行程会进入 `retained_past`，简介之后删掉该行程也不会回收历史活动。

## 4. 系统架构和代码地图

```text
公开页面 / 后台 Client Manager
        │
        ├─ Server Component → content service → repository
        └─ Admin JSON API → admin mutations → repository

抖音手动同步 / Vercel Cron
        → src/modules/douyin/sync.ts
        → src/modules/douyin/scraper-client.ts
        → Vercel Service: FastAPI
        → Johnserf-Seed/f2 provider
        → 抖音公开主页
```

### 4.1 前端和路由

- `src/app/(public)/...`：公开 Server Components。
- `src/app/admin/(protected)/...`：受保护的后台页面。
- `src/components/admin/talent-manager.tsx`：达人编辑和抖音同步按钮。
- `src/components/admin/archive-manager-v3.tsx`：活动、阵容、现场档案、合并和保存状态。
- `src/components/admin/archive-manager-utils.ts`：活动/档案草稿初始化和规范化。
- `src/app/api/admin/douyin-sync/route.ts`：手动同步全部。
- `src/app/api/admin/talents/[id]/douyin-sync/route.ts`：手动同步单个达人。
- `src/app/api/cron/sync-douyin-profiles/route.ts`：Cron 同步入口。

### 4.2 抖音同步模块

- `src/modules/douyin/itinerary.ts`：日期、城市、活动名、展示块和深圳分组。
- `src/modules/douyin/profile-link.ts`：主主页和关联账号 URL 校验。
- `src/modules/douyin/format.ts`：粉丝量展示格式化。
- `src/modules/douyin/scraper-client.ts`：Next.js 到 Python Service 的 Bearer 请求、超时和响应 Zod 校验。
- `src/modules/douyin/sync.ts`：批次锁、并发抓取、资料写入、行程保留、自动活动和合并规则重算。

### 4.3 Python Service

- `services/douyin-scraper/main.py`：Vercel Python 入口。
- `services/douyin-scraper/app/main.py`：FastAPI app。
- `services/douyin-scraper/app/provider.py`：f2 调用、公开资料读取和结构化字段提取。
- `services/douyin-scraper/app/models.py`：请求/响应模型。
- `services/douyin-scraper/app/security.py`：内部 Bearer 鉴权。
- `services/douyin-scraper/pyproject.toml`、`uv.lock`：Python 3.12 和依赖锁定。
- `services/douyin-scraper/README.md`：服务本地运行和浏览器后备路径说明。

抖音功能借鉴并封装了 Apache-2.0 上游项目
[Johnserf-Seed/f2](https://github.com/Johnserf-Seed/f2)，当前锁定 commit：
`7dab3e2ffffaa2535834d28fca99dbc2e89fa9d3`。更新 f2 时要重新核对 profile response、签名字段和依赖许可证。

### 4.4 数据层

- `src/db/schema.ts`：Drizzle/Postgres 表定义。
- `src/modules/repository/postgres-repository.ts`：真实数据库映射。
- `src/modules/repository/mock-repository.ts`、`mock-store.ts`：本地 mock 和 E2E 状态。
- `src/modules/domain/queries.ts`：公开读取模型。
- `src/modules/admin/mutations.ts`：后台写入规则和合并事务边界。
- `src/modules/domain/types.ts`：领域类型。

## 5. 关键数据表和状态

| 表 | 用途 |
| --- | --- |
| `talent_douyin_profiles` | 每个达人最近一次成功的主主页资料、原始简介、粉丝量、抓取时间和错误状态 |
| `talent_douyin_related_accounts` | 从简介中取得的真实关联小号 URL、昵称和排序 |
| `talent_douyin_schedule_entries` | 解析后的行程原子记录、指纹、日期范围、城市、活动名和映射活动 |
| `douyin_sync_runs` | 同步批次、触发来源、成功/跳过/失败数量和运行锁 |
| `douyin_sync_results` | 每个达人在某次批次中的结果码和安全提示文案 |
| `event_merge_rules` | 人工合并后，保留活动与来源行程的稳定关系 |
| `event_merge_rule_members` | 合并规则中的来源条目、达人、城市、规范化活动名和日期快照 |
| `events.origin` | `manual`、`douyin_sync`、`douyin_merged`，决定同步能否接管活动 |

行程状态：

- `active`：当前简介中存在，且是有效未来条目。
- `removed_future`：未来条目连续缺失达到删除阈值。
- `retained_past`：已发生或已映射到过去活动，永久保留。
- `suppressed`：被人工编辑或删除流程明确压制，不应被同步恢复。

### 5.1 数据库迁移

- `0007_adorable_brood.sql`：抖音资料、关联账号、行程、同步批次/结果及 `events.origin`。
- `0008_big_tigra.sql`：同步运行锁索引。
- `0009_lowly_fabian_cortez.sql`：活动人工合并规则和成员表。

`scripts/apply-preview-v5-migrations.ts` 是受保护的 5.0 migration gate：

- Preview 只有在 `TIANTI_PREVIEW_V5_MIGRATIONS=1`、Vercel 环境是 Preview、分支是 `5.0`、deployment ID 合法时才运行。
- Production 只有在 `TIANTI_PRODUCTION_V5_MIGRATIONS=1`、Vercel 环境是 Production、分支是 `main`、deployment ID 合法时才运行。
- 数据库 endpoint 必须是 Neon deployment endpoint；Preview 使用非生产 Neon branch，Production 只使用登记的 Production branch。
- fresh schema 一次事务应用 0007、0008、0009。
- `legacy_complete` 只补 0009。
- `complete` 直接跳过。
- `partial` 或非法基础库直接失败，不能猜测修复。
- Preview 迁移拒绝 Production branch；Production 迁移只接受代码中登记的 Production Neon branch。
- 本地和其他分支应保持两个迁移开关为 `0` 或不设置。Production 开关只在 schema 升级期间开启，完成后可保留为幂等检查或关闭。

不要对需要保留内容的数据库运行 `npm run db:seed`；该命令会清空应用表。

## 6. Vercel Services 部署

这是一个 Git-connected Vercel 项目，不使用 Docker，也不要另建第二个 Vercel 项目。仓库根目录的 `vercel.json` 同时定义：

```text
web
  entrypoint: .
  routePrefix: /

douyin_scraper
  entrypoint: services/douyin-scraper/main.py
  routePrefix: /_internal/douyin-scraper
```

Vercel 项目设置即使显示 Next.js Framework Preset，也应保留根目录 `experimentalServices`。不要在 `services/douyin-scraper/` 下面再添加 `vercel.json`。

Vercel 自动注入 `DOUYIN_SCRAPER_URL`，正常 Preview/Production 不要手工覆盖。只有本地 Uvicorn 或经过批准的外部 HTTPS 适配器才使用 `DOUYIN_SCRAPER_URL_OVERRIDE`。

当前 Cron：

- `/api/cron/cleanup-orphan-assets`：每天 `03:17` UTC。
- `/api/cron/sync-douyin-profiles`：每天 `04:23` UTC。

Vercel Cron 只在 Production deployment 激活。Preview 使用后台手动同步和只读 service probe 验收，不要把“Preview 没跑 Cron”当成故障。

## 7. 环境变量

### 7.1 真实生产环境

至少需要：

```env
TIANTI_CONTENT_MODE=database
TIANTI_STORAGE_MODE=r2
DATABASE_URL=postgres://...
R2_ENDPOINT=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_BASE_URL=...
CRON_SECRET=...
```

### 7.2 抖音同步

```env
SCRAPER_SHARED_SECRET=...
DOUYIN_SYNC_ENABLED=false
DOUYIN_SYNC_CONCURRENCY=2
DOUYIN_SYNC_COOLDOWN_MINUTES=10
DOUYIN_SYNC_TIMEOUT_SECONDS=20
DOUYIN_COOKIE=...
DOUYIN_ENABLE_BROWSER_LINKS=false
DOUYIN_REQUEST_TIMEOUT_SECONDS=12
DOUYIN_BROWSER_TIMEOUT_SECONDS=20
```

`DOUYIN_COOKIE`、`SCRAPER_SHARED_SECRET`、数据库密码、R2 密钥、Cron secret 都不能提交到 Git、日志、PR 或抓取结果中。

### 7.3 本地 / E2E

默认使用：

```env
TIANTI_CONTENT_MODE=mock
TIANTI_STORAGE_MODE=mock
```

`.env.example` 中的 `SEED_EDITOR_ONE_*`、`SEED_EDITOR_TWO_*` 只用于显式配置种子编辑账号。真实数据库 seed 流程要求显式账号密码；不要把默认密码用于 Production。

`SESSION_SECRET` 仍在环境 schema 中作为兼容可选项，但当前会话实现使用随机 token + SHA-256 哈希保存，不把它作为部署必需变量。

## 8. 本地开发和验证

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

常用检查：

```bash
npm run lint
npx tsc --noEmit --types node,vitest/globals
npm test
npm run build
npm run test:e2e:smoke
npm run test:e2e
```

Python Service 单独运行：

```bash
cd services/douyin-scraper
uv sync
uv run uvicorn app.main:app --reload
uv run pytest
```

本地 Next.js 指向 Uvicorn 时，设置：

```env
DOUYIN_SCRAPER_URL_OVERRIDE=http://127.0.0.1:8000
```

生产和外部适配器必须使用 HTTPS；只有 localhost、127.0.0.1 或 `::1` 允许 HTTP。

### 8.1 Service 探针

健康检查：

```bash
curl "$DOUYIN_SCRAPER_URL/healthz"
```

应得到 `{"ok":true,"version":"5.0.0"}`。Profile 请求是内部 Bearer 接口：

```bash
curl -X POST "$DOUYIN_SCRAPER_URL/v1/profiles/fetch" \
  -H "Authorization: Bearer $SCRAPER_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"requestId":"handoff-check","profileUrl":"https://www.douyin.com/user/REPLACE"}'
```

不要把真实 Cookie、Bearer 值或上游完整响应粘到文档、Issue 或日志里。

## 9. 已验证结果

在 `fix: isolate archive save pending states`（`6a40d29`）这条 5.0 集成线上，已完成：

- `npm run lint`：通过。
- `npx tsc --noEmit --types node,vitest/globals`：通过。
- `npm test`：147 个单测通过。
- `npm run build`：通过，Next.js 和 Python Service 均被 Vercel 构建。
- `npm run test:e2e`：27 个完整浏览器场景通过。
- `npm run test:e2e:smoke`：3 个 CI smoke 场景通过。
- Vercel Preview：构建状态 `READY`，同一 SHA 包含 `web` 和 `douyin_scraper`。

之后如果修改抓取协议、数据库结构、合并规则或公开读模型，不能只跑 lint；至少重新执行单测、build、CI smoke，并补充完整 E2E 或对应领域测试。

## 10. 已知限制和后续工作

1. **抖音平台兼容性**：f2 已锁定 commit，但抖音接口和签名字段可能变化。升级时必须重新核对 provider、响应 schema、Cookie 需求和抓取频率。
2. **浏览器后备小号链接未完成生产验收**：`DOUYIN_ENABLE_BROWSER_LINKS` 继续保持 `false`，除非确认 Vercel Python runtime 同时具备兼容 Chromium 和系统依赖，并使用真实公开主页完成渲染链接回归。
3. **没有 OAuth**：当前设计明确不做抖音 OAuth；不要为了取得资料而引入账号授权流程。
4. **只自动写深圳活动**：不要把其他城市简介行程直接写入“未来活动”，除非产品需求明确变更并同步调整 parser、sync、测试和 UI。
5. **人工合并依赖规则表**：如果改动活动删除、阵容保存或行程指纹，必须检查 `event_merge_rules` 是否还能保持后续自动更新。
6. **抓取失败不清空成功资料**：任何“失败即清空字段”的改动都会破坏历史可用性，应保持上一次成功快照。
7. **不要猜测小号 URL**：`linkSource=unavailable` 是合法结果；不能按昵称拼接主页地址。

## 11. 交接前检查清单

- [ ] 确认当前 Git 分支、远端和工作树状态；不要把本地未提交清理误认为 5.0 业务提交。
- [ ] 确认 Vercel 项目仍连接当前 GitHub 仓库，没有被 deployment ignore。
- [ ] 确认 Preview / Production 环境变量分开配置，密钥没有进入仓库。
- [ ] 确认 Production 使用 `database + r2`，不是默认 mock。
- [ ] 确认 `DOUYIN_SYNC_ENABLED` 只在已完成 Service probe 和单达人手动验证后开启。
- [ ] 确认 `DOUYIN_ENABLE_BROWSER_LINKS=false`，直到 Chromium 后备路径完成真实验收。
- [ ] 确认 Preview migration gate 只对 `5.0` Preview 开启；Production 迁移开关仅在 schema 升级期间按本文档规则开启，本地关闭。
- [ ] 运行 lint、TypeScript、unit、build、CI smoke；涉及 admin/public 数据流时再跑完整 E2E。
- [ ] 在 Vercel deployment 详情中核对 `githubCommitRef`、`githubCommitSha`、服务构建状态和 deployment 环境。
- [ ] 手动检查公开首页、达人详情、活动详情、后台登录和单达人同步。

## 12. 当前工作区注意事项

生成本文档时，工作区不是干净状态：

- 当前检出的是本地 `5.0`，远端 `origin/5.0` 的已知业务基线为 `6a40d29`。
- 本地存在后续的上下文清理提交 `48d6a07 remove trellis`，不属于 5.0 抖音业务逻辑本身。
- `docs/release-flow.md` 在当前工作区被删除但尚未提交；处理该删除前请先确认是否为有意的文档迁移。
- 本地 `main` 还可能包含尚未推送的 UI/上下文工具变更。接手时以 `git status -sb`、`git branch -vv` 和 GitHub 远端为准，不要直接用 `git reset --hard` 覆盖这些改动。

如果需要把本交接文档发布到远端，请只提交 `docs/handoff-5.0.md`，不要顺手把未确认的删除、上下文清理或本地分支差异一起提交。
