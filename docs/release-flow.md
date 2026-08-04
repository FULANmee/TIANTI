# TIANTI 发布流程

这份流程不绑定某个历史版本、旧账号、固定 Vercel 项目名或部署 URL。每次发布都以当前 GitHub 仓库的提交和当前 Vercel 项目设置为准。

## 1. 真相来源

- GitHub origin/main：当前可发布代码基线
- Pull Request 与 GitHub Actions：变更范围和自动检查记录
- Vercel 项目设置中的 Git Repository 连接：production/preview 的仓库来源
- Vercel deployment 详情：实际部署的分支、提交 SHA、状态和 URL
- src/db/schema.ts、drizzle/*.sql 与 drizzle/meta/**：数据库结构和迁移历史

本地 .vercel/project.json 由 vercel link 生成且被 .gitignore 忽略，只表示这台电脑的本地链接。它不是团队或生产连接的仓库内真相来源。

## 2. 分支与运行时

- main 只承接准备上线的版本，并对应 Vercel production。
- 5.0 是当前 TIANTI 5.0 集成、PR 与 Vercel preview 分支。
- codex/<task-slug> 用于其他功能开发、PR 和 Vercel preview。
- 其他分支是否触发 preview 取决于当前 Vercel Git 集成设置；不要从旧报告推断。

统一使用 Node 24，以 package.json、.nvmrc、environment.yml 和 GitHub Actions 为准。

首次在新电脑操作：

~~~bash
nvm use
npm ci
git remote -v
git fetch origin
~~~

需要用 Vercel CLI 检查部署时可运行 vercel link 选择当前账号下的正确项目。链接前在 Vercel 控制台核对项目团队、GitHub 仓库和 production branch，避免误连同名旧项目。

## 3. 合并前验证

至少执行：

~~~bash
npm run lint
npx tsc --noEmit --types node,vitest/globals
npm test
npm run build
npm run test:e2e:smoke
~~~

涉及后台编辑、上传、拖拽、筛选或 admin 到 public 数据流时，再执行：

~~~bash
npm run test:e2e
~~~

本地网络受限时，npm run build 可能因 Next.js 拉取 Google 字体失败。记录具体失败原因，并以同一提交在 GitHub Actions/Vercel 的构建结果补验；不要把网络错误直接当成应用回归，也不要因此跳过线上构建检查。

## 4. 数据库、环境变量与定时任务

生产内容/存储模式应明确配置，不能依赖默认 mock：

- TIANTI_CONTENT_MODE=database
- DATABASE_URL
- TIANTI_STORAGE_MODE=r2
- R2_BUCKET、R2_ENDPOINT、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_PUBLIC_BASE_URL
- CRON_SECRET
- 可选的 ORPHAN_ASSET_GRACE_MINUTES、ORPHAN_ASSET_CLEANUP_LIMIT
- 抖音同步启用时：Vercel Services 自动生成的 DOUYIN_SCRAPER_URL，以及项目环境中的 SCRAPER_SHARED_SECRET、DOUYIN_SYNC_ENABLED
- 可选的 DOUYIN_COOKIE、DOUYIN_ENABLE_BROWSER_LINKS、DOUYIN_REQUEST_TIMEOUT_SECONDS、DOUYIN_BROWSER_TIMEOUT_SECONDS、DOUYIN_SYNC_CONCURRENCY、DOUYIN_SYNC_COOLDOWN_MINUTES、DOUYIN_SYNC_TIMEOUT_SECONDS

公开 canonical URL 由 src/lib/site.ts 按 SITE_URL、NEXT_PUBLIC_SITE_URL、VERCEL_PROJECT_PRODUCTION_URL 的顺序解析。最后的硬编码 fallback 是迁移前遗留兼容值，不是当前部署的真相来源；若平台提供的 production URL 不是目标公开域名，应显式设置 SITE_URL，并在 Preview/Production 检查 canonical、Open Graph 与 sitemap URL。

.env.example 和 env schema 里仍保留可选的 SESSION_SECRET，但当前 src/lib/session.ts 使用随机 token 与 SHA-256 存储哈希，并不读取该变量；当前部署不应把它误列为必需项。

Preview 和 Production 的变量是不同环境范围，分别核对。不要在日志、PR 或发布记录中粘贴密钥值。

当前 CI 和 Vercel 构建没有自动应用数据库迁移。若提交包含新的 drizzle/*.sql：

1. 复核 SQL、外键、空值、索引和数据回填。
2. 明确目标 DATABASE_URL。
3. 使用团队受控的数据库执行方式应用新增迁移，再部署依赖新结构的代码；若变更需要兼容顺序，先拆成向前兼容阶段。
4. 上线后验证真实数据库读写。

npm run db:push 会直接修改所指数据库，只能在确认目标后有意执行。npm run db:seed 会先清空应用表，禁止对生产或任何需要保留内容的数据库运行。

仓库根目录 `vercel.json` 通过 `experimentalServices` 在现有 Git-connected Vercel 项目内同时构建 Next.js 与 FastAPI。`5.0` 的真实 Preview 已证明根配置在项目设置仍报告 `Next.js` Preset 时也会构建两个服务，因此不要仅为本功能修改 Preset，也不要创建第二个项目或在 `services/douyin-scraper/` 下增加另一份 `vercel.json`。服务名 `douyin_scraper` 自动生成仅服务端可见的 `DOUYIN_SCRAPER_URL`，正常 Preview/Production 无需手工设置它；只有本地 Uvicorn 或经过批准的外部 HTTPS 适配器才使用优先级更高的 `DOUYIN_SCRAPER_URL_OVERRIDE`。

`vercel.json` 每天调用 `/api/cron/cleanup-orphan-assets` 和 `/api/cron/sync-douyin-profiles`。Vercel Cron 只在 Production deployment 激活，因此 Preview 不要求定时触发；Production 必须配置 CRON_SECRET。抖音同步应先在 Preview 隔离数据库单独应用 migration、单独配置 Preview 环境变量，并保持 `DOUYIN_SYNC_ENABLED=false` 完成同一 deployment 内抓取服务的健康检查和只读探针；随后短时启用开关完成后台单达人写入验证，再在 Production 保留开关以启用每日任务。真实 `@账号` 链接还必须先证明 Vercel Python runtime 可启动兼容 Chromium，再用简介内含可点击 mention 的公开主页完成渲染目标验收；Python Playwright 包本身不包含浏览器。无法恢复真实 Douyin URL 时只能返回 unavailable，不能按昵称猜测。回滚优先关闭该开关，不删除已同步的历史数据。

## 5. Preview 核验

1. 保留现有 Vercel 项目和当前 Framework Preset。核对 Preview 范围已配置 `SCRAPER_SHARED_SECRET`、数据库/R2 变量和禁用状态的 `DOUYIN_SYNC_ENABLED=false`；如需真实写入，先对 Preview 的隔离数据库应用新增 migration。不要新建第二个项目。
2. 确认现有项目的 Git Repository 连接仍指向当前仓库，且该分支未被 deployment ignore 后，推送功能分支并记录本地提交。Git push 只触发符合这些条件的 Preview；它不会替代 Preview 环境变量配置或数据库 migration：

   ~~~bash
   git branch --show-current
   git rev-parse HEAD
   git push -u origin <branch>
   git ls-remote --heads origin <branch>
   ~~~

3. 确认 GitHub Actions 对该分支/PR 的适用检查通过。当前工作流自动覆盖 main、5.0 和 codex/**。
4. 在 Vercel deployment 详情中核对：
   - 来源仓库是当前账号下的 TIANTI 仓库；
   - githubCommitRef 是目标分支；
   - githubCommitSha 等于刚记录的远端提交；
   - deployment 状态为 Ready；
   - deployment 是 Preview 而非 Production。
5. 确认同一 Git SHA 的 `web` 与 `douyin_scraper` 都已构建，`/_internal/douyin-scraper/healthz` 返回健康结果，带错误/缺失 Bearer 的 profile 请求被拒绝。`DOUYIN_SCRAPER_URL` 应由 Vercel 自动注入且已包含服务 route prefix。
6. 如使用 CLI，可用 vercel ls 找到 URL，再用 vercel inspect <deployment-url> 查看详情；不要把项目名或 URL 硬编码回文档。
7. 在 Preview 至少回归公开首页、达人/活动浏览、活动详情和后台登录。涉及真实数据库/R2 的变更还要确认 Preview 指向预期的隔离资源。

## 6. Production 核验

1. 通过已审阅的 PR 合并到 main。
2. 获取远端 production 基线：

   ~~~bash
   git fetch origin
   git rev-parse origin/main
   ~~~

3. 确认 main 的 GitHub Actions 全部通过。
4. 在 Vercel production deployment 详情中核对：
   - githubCommitRef 为 main；
   - githubCommitSha 与 origin/main 相同；
   - 状态为 Ready；
   - production 域名指向该 deployment。
5. 对 production 做最小回读：
   - 首页、达人列表/详情、活动列表/详情可访问；
   - 后台登录与本次修改的保存流程正常；
   - admin 保存后的结果能在 public 页面看到；
   - 图片、数据库和定时清理相关变更在真实环境正常。

若 Vercel 没有部署到预期 SHA，先检查 Git Repository 连接、Production Branch 和 deployment 忽略设置，不要用手工部署掩盖迁移后的错误连接。

## 7. 回滚与记录

代码回滚优先通过 Git revert 形成可审计提交，再让 Git 集成重新部署。只有确认数据库结构向后兼容时，才可单独把 production 切回旧 deployment；数据库迁移通常应使用新的向前修复迁移，不修改已应用迁移。

在 PR、Trellis 任务或发布记录中保留：

- 合并后的 main SHA；
- Preview 与 Production deployment URL/时间/SHA；
- GitHub Actions 与手工验证结果；
- 数据库迁移和环境变量范围是否变更；
- 已知限制及回滚条件。

不要为每个版本再新增 completion-report 或 PLAN 文档。长期有效的工程约定更新到 .trellis/spec/**，具体发布证据留在 PR、任务和部署记录中。
