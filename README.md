# TIANTI Web

TIANTI 是一个面向公开访客的 `cosplay / 国风达人展示 + 活动档案` 站点，同时提供后台工作台，用于维护达人、活动、阵容、档案与编辑人天梯榜。

## 快速开始

1. 切换到项目固定的 Node.js 版本

   ```bash
   nvm use
   ```

2. 复制环境变量模板

   ```bash
   cp .env.example .env.local
   ```

3. 按锁文件安装依赖

   ```bash
   npm ci
   ```

4. 启动开发环境

   ```bash
   npm run dev
   ```

5. 可选：初始化一个确认可以清空的数据库

   ```bash
   npm run db:push
   npm run db:seed
   ```

   `db:push` 会修改 `DATABASE_URL` 指向的数据库，`db:seed` 会先清空应用表；不要对生产库或需要保留内容的数据库运行。

当前标准运行时为 `Node 24`，`.nvmrc`、`environment.yml` 与 GitHub Actions 已统一到同一基线。

## 环境模式

- 默认使用 `TIANTI_CONTENT_MODE=mock`，可以直接浏览演示内容并运行测试。
- 接入真实 Postgres 与 R2 后，切换到 `database + r2` 作为标准部署模式。

推荐的真实环境配置：

```env
TIANTI_CONTENT_MODE=database
TIANTI_STORAGE_MODE=r2
DATABASE_URL=postgres://...
R2_ENDPOINT=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_BASE_URL=...
```

如需覆盖默认编辑账号，可额外设置：

```env
SEED_EDITOR_ONE_EMAIL=
SEED_EDITOR_ONE_PASSWORD=
SEED_EDITOR_TWO_EMAIL=
SEED_EDITOR_TWO_PASSWORD=
```

## 常用命令

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npx tsc --noEmit --types node,vitest/globals`
- `npm test`
- `npm run test:e2e:smoke`
- `npm run test:e2e`
- `npm run db:generate`
- `npm run db:push`
- `npm run db:seed`

## 发布与分支约定

- `main`
  - 只承接可上线版本
  - 对应 Vercel production
- `5.0`
  - 当前 TIANTI 5.0 集成与联调分支
  - 对应 Vercel preview，并由 GitHub Actions 直接验证
- `codex/*`
  - 用于其他功能开发和联调
  - 对应 Vercel preview
- 其他功能分支
  - 默认只用于预览和 PR 协作

发布时请遵循：

1. 在功能分支完成开发并通过本地验证。
2. 推送分支，确认 Vercel preview 可用。
3. 合并到 `main`。
4. 确认 Vercel production 指向与 `main` 相同的提交。

当前可部署基线以 GitHub `main` 为准；当前 5.0 集成分支固定为 `5.0`，其他功能分支使用 `codex/<task-slug>` 命名。

## 标准发布检查清单

合并或上线前至少执行：

```bash
npm run lint
npx tsc --noEmit --types node,vitest/globals
npm test
npm run build
npm run test:e2e:smoke
```

发布前建议再补一轮全量 E2E：

```bash
npm run test:e2e
```

如果涉及真实存储或部署环境，再额外确认：

- Vercel 项目环境变量齐全
- `main` 对应 production，`5.0` 与 `codex/*` 对应 preview
- 数据库与 R2 配置已生效
- 后台登录、公开站浏览、活动档案页可正常使用
- Vercel deployment 的 `githubCommitRef` 与目标分支一致

具体步骤见 [发布流程](docs/release-flow.md)。

## 文档

- [5.0 交接文档](docs/handoff-5.0.md)
- [发布流程](docs/release-flow.md)
- [后端开发规范](.trellis/spec/backend/index.md)
- [前端开发规范](.trellis/spec/frontend/index.md)

历史计划与完成报告不再作为当前文档维护；如需追溯，请查阅 Git 历史。

## 孤立素材清理

`vercel.json` 配置了每天调用一次 `/api/cron/cleanup-orphan-assets` 的 Vercel Cron Job。清理只处理：

- 仍有 R2 object key，或能从 R2 公共 URL 推导 object key 的素材
- 未被达人或档案引用的素材
- 已超过配置保留窗口的素材

所需环境变量：

```env
CRON_SECRET=...
ORPHAN_ASSET_GRACE_MINUTES=30
ORPHAN_ASSET_CLEANUP_LIMIT=50
```

Cron 路由要求 `Authorization: Bearer ${CRON_SECRET}`，仅用于生产自动化。

## 抖音主页同步（5.0）

网站通过同一个 Vercel 项目中的独立 Python Service 读取已配置达人的公开抖音简介和粉丝量。Production 每 6 小时同步一次；主页行程保持为独立资料，不再创建或更新活动与阵容。抓取失败不会清空上次成功资料。

仓库根目录的 `vercel.json` 使用 `experimentalServices` 声明两个服务：Next.js `web` 继续挂载在 `/`，FastAPI `douyin_scraper` 通过文件入口 `services/douyin-scraper/main.py` 挂载在 `/_internal/douyin-scraper`。这是保留 Bearer 鉴权的内部约定路径，并不是绕过公网访问控制的私有网络。

现有 Git-connected Vercel 项目的一次性设置与 Preview 顺序：

1. 保留现有 Git-connected Vercel 项目及其当前 Framework Preset；不要新建第二个项目，也不要在子目录添加 `vercel.json`。`5.0` Preview 已实际证明：即使项目设置仍显示 `Next.js`，根目录 `experimentalServices` 也会构建并挂载两个服务。
2. 为 Preview 配置 `SCRAPER_SHARED_SECRET`、数据库/R2 变量和下列抓取选项，先保持 `DOUYIN_SYNC_ENABLED=false`。
3. 仅在 `5.0` Preview 范围设置 `TIANTI_PREVIEW_V5_MIGRATIONS=1`。构建门会验证 Vercel Preview/目标环境/分支/deployment、Neon endpoint 和非 Production branch ID，在单一事务内只应用 `0007`、`0008`；其他分支、本地与 Production 必须保持该值非 `1`。不要对保留内容的数据库执行 `db:seed`。
4. 确认现有项目仍连接当前 Git 仓库，且该分支未被 deployment ignore 后再推送功能分支；满足这些前提时，同一次 Preview 会从同一提交先运行受控迁移门，再构建两个服务，并向 Next.js 服务注入由服务名生成的服务端 `DOUYIN_SCRAPER_URL`。推送不会替代其他 Preview 环境变量配置。
5. 访问 `/_internal/douyin-scraper/healthz`，再用 Bearer 鉴权完成只读 profile 探针。确认结果后才短时启用同步并用后台单达人操作验证写入。

```env
SCRAPER_SHARED_SECRET=...
DOUYIN_COOKIE=
DOUYIN_ENABLE_BROWSER_LINKS=false
DOUYIN_REQUEST_TIMEOUT_SECONDS=12
DOUYIN_BROWSER_TIMEOUT_SECONDS=20
DOUYIN_SYNC_ENABLED=false
DOUYIN_SYNC_CONCURRENCY=2
DOUYIN_SYNC_COOLDOWN_MINUTES=10
DOUYIN_SYNC_TIMEOUT_SECONDS=20
TIANTI_PREVIEW_V5_MIGRATIONS=0
```

`DOUYIN_SCRAPER_URL` 由 `douyin_scraper` 服务自动生成，正常的 Vercel Preview/Production 不要手工覆盖。如需在本地把 Next.js 指向 Uvicorn，或临时使用经过批准的外部 HTTPS 适配器，可设置优先级更高的 `DOUYIN_SCRAPER_URL_OVERRIDE`；Production override 仍必须使用 HTTPS。

`CRON_SECRET` 同时保护素材清理和 `/api/cron/sync-douyin-profiles`。Vercel Cron 只在 Production deployment 激活，Preview 核验通过只读探针和后台手动同步完成，不要求定时任务实际运行。共享密钥、Cookie、`ttwid`、签名 URL 和上游完整响应不得进入日志或数据库。回滚时关闭 `DOUYIN_SYNC_ENABLED`，保留已有资料、活动和迁移结构。
