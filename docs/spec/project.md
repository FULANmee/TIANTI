# TIANTI 项目地图

## 用途与边界

TIANTI 是面向公开访客的 cosplay / 国风达人展示和活动档案站，同时提供后台工作台维护达人、活动、阵容、现场档案与编辑人天梯榜。公开路由与后台路由分别位于 `src/app/(public)/` 和 `src/app/admin/(protected)/`（`README.md`、`docs/handoff-5.0.md`）。

抖音资料同步不使用 OAuth。Next.js 通过同一 Vercel 项目中的 FastAPI Service 读取公开主页资料；部署由根目录 `vercel.json` 的 `experimentalServices` 定义（`vercel.json`、`services/douyin-scraper/app/`、`src/modules/douyin/`）。

## 技术与结构

- Web 使用 Node.js 24、Next.js 16、React 19 和 TypeScript；依赖及脚本以 `package.json`、`.nvmrc` 为准。
- 数据访问使用 Drizzle ORM 与 PostgreSQL，表定义和迁移分别位于 `src/db/schema.ts`、`drizzle/`；真实读写与测试用 mock 分别位于 `src/modules/repository/postgres-repository.ts` 和 `src/modules/repository/mock-repository.ts`。
- 对象存储支持 R2；上传、签名与清理入口位于 `src/storage/`、`src/app/api/admin/assets/`、`src/app/api/uploads/presign/` 和 `src/modules/assets/cleanup.ts`。
- Python 抖音服务位于 `services/douyin-scraper/`，依赖由该目录的 `pyproject.toml` 与 `uv.lock` 锁定。
- 单元、浏览器和配置验证位于 `tests/unit/`、`tests/e2e/`、`vitest.config.ts` 与 `playwright.config.ts`。

## 验证命令

以 `package.json` 和 `README.md` 为准，标准发布检查包括：

```bash
npm run lint
npx tsc --noEmit --types node,vitest/globals
npm test
npm run build
npm run test:e2e:smoke
```

涉及完整后台或公开数据流时运行 `npm run test:e2e`。Python Service 在 `services/douyin-scraper/` 下使用 `uv run pytest` 验证（`docs/handoff-5.0.md`）。

## 高风险约束

- `npm run db:seed` 会清空应用表，不得用于需要保留内容的数据库（`README.md`、`scripts/seed.ts`）。
- 抖音 Cookie、共享密钥、数据库和 R2 凭据不得进入源码、日志或文档（`docs/handoff-5.0.md`）。
- Vercel Cron 只在 Production deployment 激活；Preview 的抖音能力通过服务探针和后台手动同步验收（`vercel.json`、`docs/handoff-5.0.md`）。
