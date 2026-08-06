# 实施计划：活动快捷合并与可持续抖音同步

## 执行顺序

### 1. 先修复解析器并锁定回归

- 扩展 `DATE_TOKEN_SOURCE` 支持全角 `～`，保持捕获组位置不变。
- 在 `tests/unit/douyin/itinerary.test.ts` 增加 `8.8～9`、跨月/无效区间和活动名不污染断言。
- 运行 itinerary 单元测试，确认现有 `~`、`-`、`—`、`至` 和紧凑日期没有变化。

### 2. 建立合并覆盖领域/数据库契约

- 更新 `EventOrigin`、`EventMergeRule`、`EventMergeRuleMember`、`ContentState`、repository 输入类型。
- 更新 `src/db/schema.ts`，新增规则及成员表、FK、索引。
- 运行 `npm run db:generate`，审查 SQL、快照和 `_journal.json`；同步更新 Preview v5 migration guard 的表/列/索引/约束清单。
- 更新 Postgres `loadState()` 映射、mock seed/state 和两套 repository 的读写 parity。

### 3. 实现原子 merge mutation

- 扩展 event bulk schema/type/API 支持 `merge` 与 `targetId`。
- 在 admin mutation 中校验至少两个未来活动、目标归属和存在性；计算目标字段、阵容/档案去重、来源行程重挂接和规则成员快照。
- 添加 `ContentRepository.mergeEvents()`：mock 一次性 clone/replace，Postgres 单事务 upsert/迁移/删除。
- 返回目标活动、目标阵容和目标档案，补充 mutation/repository 测试覆盖成功、重复、past 拒绝、失败原子性和规则创建。

### 4. 将覆盖规则接入抖音同步

- 让 `saveDouyinSyncState` 接收规则快照并在同一事务中保存。
- 在 `reconcileEventsAndLineups()` 中按现有 eventId/规则成员匹配多个分组到同一 `douyin_merged` 目标，允许同目标多分组、保持来源阵容和日期更新。
- 保护名称/场馆/备注，更新目标日期；规则成员支持原文/活动名/日期变化并保持过去活动冻结。
- 补充同步回归测试：不同名称合并不拆回、原文/日期变化仍指向同一目标、连续缺失只清理来源阵容、目标活动不被删除。

### 5. 接入后台快捷操作

- 在 `archive-manager-v3.tsx` 的 Bulk Actions 增加合并按钮、目标选择对话框、警告、pending/unsaved 状态。
- 处理 API 成功后的本地 events/lineups/archives 替换、选中项清理和详情选择；失败保持原状态并显示原因。
- 增加组件测试或沿用既有 admin 测试模式，覆盖少于两个禁用、指定目标和成功/失败刷新。

### 6. 全量质量门禁

- 运行 `npm run lint`。
- 运行 `npx tsc --noEmit --types node,vitest/globals`。
- 运行相关 Vitest，再运行完整 `npm test`。
- 运行 `npm run build`，确认 migration guard、Next.js build 和 Vercel Services 配置均通过。
- 检查 `git diff` 不包含用户未要求的同步范围、OAuth 或开播提醒改动。

## 风险点与回滚点

- 数据库迁移和 Preview guard 是第一处回滚点：先审查生成 SQL，再在隔离 Preview 验证；不改写已提交 migration。
- `saveDouyinSyncState` 与 `mergeEvents` 的并发锁是第二处回滚点：任一事务失败必须整体回滚，不允许采用逐项 delete/upsert 的 fallback。
- 合并后的 `douyin_merged` 来源保护是第三处回滚点：普通手工活动仍不能被同步覆盖，过去活动仍不能被清理。
- 如 UI 合并交互验证不足，可保留 API/mutation 功能但暂不暴露按钮；不得让按钮调用 delete 作为降级路径。

## 开始实现前的确认

- `prd.md` 已没有未解决的产品问题，且用户已批准最新规划摘要。
- `design.md`、本执行清单和相关 spec 已读完。
- 当前分支为 `5.0`，工作区只包含本任务规划文件；不覆盖其他任务改动。
