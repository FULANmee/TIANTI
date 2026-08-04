# f2 主页简介抓取验证

验证日期：2026-08-04（Asia/Shanghai）

## 研究目标

验证 `Johnserf-Seed/f2` 当前主分支是否适合 TIANTI 5.0 的最小抓取边界：

1. 从公开抖音主页 URL / `sec_user_id` 读取原始简介；
2. 从同一响应读取粉丝量；
3. 判断是否能恢复简介中 `@账号` 的主页目标；
4. 明确 Cookie、签名、运行时和部署约束。

## 被测版本与来源

- 仓库：<https://github.com/Johnserf-Seed/f2>
- 被测主分支 commit：`7dab3e2ffffaa2535834d28fca99dbc2e89fa9d3`
- 许可证：Apache-2.0
- 包版本：`0.0.1.7`
- 运行时：Python >= 3.10；探针使用 CPython 3.11.15
- 关键源码：
  - `f2/apps/douyin/handler.py::DouyinHandler.fetch_user_profile`
  - `f2/apps/douyin/crawler.py::DouyinCrawler.fetch_user_profile`
  - `f2/apps/douyin/api.py::DouyinAPIEndpoints.USER_DETAIL`
  - `f2/apps/douyin/filter.py::UserProfileFilter`
  - `f2/apps/douyin/utils.py::SecUserIdFetcher` / `TokenManager`

## 代码证据

- `SecUserIdFetcher` 可从普通主页 URL 或 `v.douyin.com` 短链解析 `sec_user_id`。
- 用户详情端点为 `https://www.douyin.com/aweme/v1/web/user/profile/other/`。
- 请求参数由 `BaseRequestModel` 生成，包含 `msToken`，最终由 a_bogus/X-Bogus 签名。
- `UserProfileFilter.signature_raw` 读取 `$.user.signature`。
- `UserProfileFilter.follower_count` 读取 `$.user.follower_count`。
- crawler 构造器无条件读取 `kwargs["cookie"]`；Cookie 键必须存在。

## 真实探针结果

使用用户提供的一个公开抖音主页 URL 所含 `sec_user_id`，不登录抖音账号，仅检查字段存在性，不持久化主页内容。

### 空 Cookie

- 请求返回 HTTP 200，但 f2 收到空响应体。
- `DouyinHandler.fetch_user_profile()` 抛出 `APIResponseError`，提示更换 Cookie。
- 结论：不能把 README 的“游客态”理解为“Cookie 可为空”。

### 访客 ttwid

- 使用 `TokenManager.gen_ttwid()` 生成访客 `ttwid`，以 `Cookie: ttwid=<value>` 调用相同接口。
- 响应 `status_code=0`。
- `nickname` 存在。
- `signature_raw` 存在。
- `follower_count` 存在且为整数。
- 结论：被测时点无需登录账号 Cookie，生成的访客 `ttwid` 足以读取该公开主页；实现仍必须允许配置/轮换 Cookie，因为抖音策略可能变化。

### @账号链接元数据

- 第一轮所测主页未返回可用 mention 目标；用户随后提供了简介包含 `@望月水母.zip` 的主账号 `腥味猫罐` 主页 URL。
- 该主账号的 `user.signature_extra[]` 返回权威 `sec_uid`、`start`、`end`，但不返回可直接信任的昵称。用偏移对 `user.signature` 做严格切片可得到完整 `@望月水母.zip`，并恢复其真实 `/user/<sec_uid>` 链接。
- 同一真实探针返回非负整数粉丝量 `2310243`，简介包含 `8.8深圳金铲铲`；本地服务投影为 `linkSource=structured`，不需要 Chromium。
- 上游偏移可能使用 Unicode code point 或 UTF-16 code unit；实现同时尝试两种解释，只在它们归一为唯一完整 `@昵称` 时接受。畸形、越界、拆分 surrogate 或产生两个不同有效昵称时 fail closed。
- 静态主页 HTML 仍未发现可直接依赖的简介锚点。Playwright 仅作为没有 `signature_extra` 时的后备路径，Vercel Python runtime 未证明具备 Chromium，因此继续关闭。

## 设计结论

- 在现有 Git-connected Vercel 项目中采用独立 Python Service，固定并封装 f2 的最小用户主页能力，不把完整 CLI、下载、直播或 SQLite 能力引入 Next.js runtime，也不再依赖外部 Docker 服务。
- 服务内部 Cookie 策略按以下顺序：配置的服务端 Cookie -> 可生成的访客 `ttwid`；任何 Cookie 值均不得写入日志或网站数据库。
- 服务返回版本化、最小化 JSON：账号标识、原始简介、粉丝量、可验证的小号链接、抓取时间和错误分类。
- 网站侧负责行程解析、深圳过滤、5 天聚合、活动/阵容幂等写入、历史保护与公开展示。
- `@账号` 主页目标必须来自真实响应或渲染 DOM，不得按昵称猜测 URL。

## 验收状态与后续验证

- “主账号简介包含 `@小号`”的真实 URL 已提供，结构化 `signature_extra` 路径已恢复目标 `sec_user_id`；仍需把修复部署到 Vercel Preview 后重复同一只读探针。
- 如果未来遇到没有 `signature_extra` 的 `@账号` 简介且必须使用浏览器渲染，需先在 Vercel Python Preview 中证明兼容 Chromium 与系统库可用；Python Playwright 包本身不安装浏览器。此路径仍只用于含 `@` 且结构化提取失败的简介。
- 对同一主页做多次低频请求，验证访客 `ttwid` 有效期、频控错误形态和 Cookie 轮换策略。
- 验证公开主页被注销、私密、风控、验证码或地区限制时的错误分类；这些失败不得推进“未来行程连续消失”计数。

## 相关项目规范

- `.trellis/spec/backend/database-guidelines.md`
- `.trellis/spec/backend/domain-guidelines.md`
- `.trellis/spec/backend/error-handling.md`
- `.trellis/spec/backend/quality-guidelines.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`
