# 技术设计：活动快捷合并与可持续抖音同步

## 1. 设计边界

本任务包含两个相互独立但共享同步模型的改动：

1. `src/modules/douyin/itinerary.ts` 扩展日期范围语法并保持现有解析结果契约。
2. 后台活动管理器增加“指定保留活动并合并”的服务端操作；合并后由持久化覆盖规则把多个抖音来源组稳定指向同一个活动。

抖音抓取服务、OAuth、非深圳活动写入和开播提醒不在本次设计内。抓取服务仍只提供简介事实，活动合并规则属于网站领域层。

## 2. 领域模型与持久化

### 2.1 活动来源

扩展 `EventOrigin` 为 `manual | douyin_sync | douyin_merged`。

- `manual`：普通手工活动。
- `douyin_sync`：可由普通自动分组维护的活动。
- `douyin_merged`：编辑指定过保留活动、但日期和抖音来源仍由同步维护的活动。

`douyin_merged` 的名称、别名、场馆、备注和 slug 由编辑选择的保留活动提供；同步只更新日期、状态和自动阵容，不用新的抖音活动名覆盖编辑选择的名称。`saveEvent()` 编辑此类活动时继续保留 `douyin_merged` 来源，避免一次普通编辑让覆盖规则失效。

### 2.2 合并覆盖规则

在 `ContentState` 中增加 `eventMergeRules`，在 Postgres 中增加两张表：

```text
event_merge_rules
  id, target_event_id, created_at, updated_at

event_merge_rule_members
  id, rule_id, source_entry_id, talent_id, city,
  normalized_name, starts_at, ends_at, last_seen_at
```

- `target_event_id` 外键级联删除；规则成员随规则级联删除。
- 成员不直接外键约束抖音行程 ID，避免行程因两次缺失而被清理时丢失匹配历史；`source_entry_id` 是可更新的最近来源 ID。
- 成员保存达人、城市、标准化活动名和最近日期范围，用于同一简介项目改名或调整日期后重新识别。
- 一个目标活动最多一个活动规则；重复合并会将新成员追加到已有规则。
- 规则永不因为来源短暂消失而删除。目标活动被删除时由数据库级联清理规则。

两种 repository 都把关系映射为领域对象；应用代码只使用 `ContentState`，不直接消费 Drizzle 行。

### 2.3 活动合并的字段规则

领域 mutation 在校验通过后计算完整目标快照：

- 基础字段：保留活动的 `name`、`slug`、`aliases`、`searchKeywords`、`city`、`venue`、`note`；`origin` 改为 `douyin_merged`。
- 日期：所有选中活动有效日期的最小开始日和最大结束日；无日期活动不参加日期计算。
- 阵容：合并所有选中活动，按 `talentId + lineupDate` 去重。若同一键同时存在手工和 `douyin:*` 来源，保留带 `douyin:*` 的记录以继续自动更新，并尽量保留已有非空备注；否则优先保留目标活动记录，再按稳定 ID 排序。
- 档案：按编辑者合并为一个 archive；条目按 `talentId + entryDate + cosplayTitle` 去重，同键保留目标档案的素材/字段，缺失字段由来源档案补齐。来源档案中的非重复条目全部迁移。
- 抖音行程：所有选中活动关联的 `TalentDouyinScheduleEntry.eventId` 改为目标活动；成员快照写入覆盖规则。对应 `event_lineup.source` 保持 `douyin:<entryId>`，不能改成空来源。

只允许合并至少两个现有、当前未结束且有 ID 的活动。目标必须是选中项之一；如果来源包含已结束活动，服务端拒绝整次操作，避免历史记录被误删。

## 3. 同步流程改造

现有分组入口是 `src/modules/douyin/itinerary.ts:321`，现有事件/阵容协调在 `src/modules/douyin/sync.ts:552-737`。在不改变普通分组规则的前提下插入覆盖层：

1. `reconcileEventsAndLineups()` 接收并 clone 当前 `eventMergeRules`。
2. 先按当前 `entry.eventId` 找到 `douyin_merged` 目标；这是同一 fingerprint 重新抓取时的稳定路径。
3. 对没有直接映射的活跃 entry，用规则成员匹配：同一达人和城市，优先标准化活动名相同；名称发生变化时只有在规则窗口内且候选唯一时才接受最近日期匹配，存在多个冲突候选则放弃强制映射，避免把明确不同活动吸入同一活动。
4. 一个分组只要含有一个明确匹配成员，就把整个分组指向该目标；同一目标允许被多个明确不同名称的分组重复使用，跳过现有 `usedEventIds` 的互斥限制。不同目标冲突时不强制合并，回退普通分组匹配。
5. 每个覆盖目标收集当前所有命中的分组，日期取这些分组的最早/最晚日期；生成 `douyin_merged` 更新快照时保留名称、场馆、备注等编辑字段，只更新日期、状态和更新时间。
6. 将命中的新行程 ID、日期、标准化名称和 `lastSeenAt` 回写到规则成员；未命中的历史成员保留，供后续简介恢复时匹配。
7. 阵容生成仍使用现有 `douyin:<scheduleEntryId>` 来源和“达人 + 日期”去重逻辑，因此原文、日期、缺失计数和来源审计继续自动更新。
8. 普通 `douyin_sync` 活动继续使用现有名称兼容、五天固定窗口和无人阵容清理；`douyin_merged` 目标永远不进入“无阵容自动删除”候选。规则来源连续两次缺失时只移除对应自动阵容，不能删除目标活动或历史阵容。

`saveDouyinSyncState()` 事务同时写入规则和合并目标活动。Postgres 的 upsert 条件允许更新 `douyin_sync` 与 `douyin_merged`，但不会更新 `manual`；mock 必须具有相同的来源保护语义。

## 4. 服务端 API 与 repository 边界

### 4.1 批量操作契约

扩展 `EventBulkPayload`/schema：

```ts
{ action: "delete" | "merge"; ids: string[]; targetId?: string }
```

`saveEventBulk()` 对 `merge` 执行完整校验、快照计算和 `repository.mergeEvents()`；不在循环里逐个删除。结果扩展为：

```ts
{
  succeededIds: string[];
  blocked: BlockedBulkAction[];
  mergedEvent?: Event;
  mergedLineups?: EventLineup[];
  mergedArchives?: EditorArchive[];
}
```

失败返回一个 blocked 项或抛出可读错误，不能返回部分成功的 merge。删除动作继续保持原有逐项行为。

### 4.2 原子 repository 操作

在 `ContentRepository` 新增 `mergeEvents(input)`，mock 用一次 clone/replace，Postgres 用单一 transaction：

1. 锁定/读取目标与来源活动关联的阵容、档案、行程和规则。
2. upsert 目标活动，替换目标阵容，迁移并 upsert 目标档案。
3. 将来源行程的 `event_id` 更新为目标，写入/替换规则成员。
4. 删除来源活动（由 FK 级联删除其阵容和原档案），删除被重挂接的旧规则。
5. 事务成功后返回目标活动、目标阵容和目标档案给 API。

`mergeEvents` 输入由 mutation 依据最新 `getState()` 计算，repository 不接收未经校验的用户 payload。事务内再次检查目标/来源存在，防止并发删除覆盖。

## 5. 后台交互

在 `src/components/admin/archive-manager-v3.tsx` 的已有 Bulk Actions 区增加“合并活动”按钮：

- 选择少于两个时禁用；有未保存草稿时沿用现有阻止逻辑。
- 点击后打开二次确认对话框，列出选中活动，使用 radio/select 明确“保留活动”，显示日期范围和“来源活动将被删除、后续抖音仍自动更新”的提示。
- 提交 `POST /api/admin/events/bulk` 的 `merge` payload；成功后用响应中的目标活动/阵容/档案替换本地目标数据，移除来源 ID，清空来源勾选并保留目标详情选择。
- 失败不改本地列表，只显示服务端错误。
- 不增加候选审核流程，不在首页或公开活动卡片显示覆盖规则。

## 6. 日期解析

将 `DATE_TOKEN_SOURCE` 的范围分隔符从 `[-~—至]` 扩展为 `[-~～—至]`，保留已有捕获组布局，使 `endDateKey` 的月省略逻辑继续工作。测试覆盖：

- `8.8～9 深圳金铲铲` → `08-08` 至 `08-09`，名称为 `金铲铲`；
- `4.23～26`、半角 `~`、长横线和“至”；
- 结束日早于开始日、无效日期仍只产生安全 skip，不进入活动写入。

## 7. 迁移、并发与回滚

- 更新 `src/db/schema.ts`、领域类型、两套 repository、seed/mock 状态，生成新的 Drizzle migration 和 snapshot；不修改旧 migration。
- Preview v5 迁移守卫脚本的表、列、索引和约束白名单同步增加新表，确保 `5.0` Preview 从保留数据库安全升级。
- `saveDouyinSyncState` 与 `mergeEvents` 均在数据库事务中处理；同步锁和 Postgres 行锁避免管理员合并被较早抓取快照覆盖。若同步已先提交，后执行的合并会重挂接最新来源；若合并先提交，同步事务按当前规则重算。
- 代码回滚可回退到旧逻辑，但新数据库表必须保留；发布前先验证 migration SQL 和 Preview guard，不直接对生产数据库执行 `db:push`。

## 8. 质量验证

- 日期解析单元测试：`tests/unit/douyin/itinerary.test.ts`。
- 同步覆盖测试：规则将两个不同名称分组汇入同一 `douyin_merged` 活动、后续日期/原文变化更新同一目标、来源连续消失不删除目标。
- mutation/repository 测试：目标选择、日期/阵容/档案去重、规则创建、原子失败、past 活动拒绝；mock/Postgres mapping 契约。
- 前端组件测试：合并按钮禁用、目标选择、成功本地状态替换、失败保持原列表。
- 运行项目既有 lint、TypeScript、Vitest、build，并检查新 migration 与 Preview migration guard 测试。
