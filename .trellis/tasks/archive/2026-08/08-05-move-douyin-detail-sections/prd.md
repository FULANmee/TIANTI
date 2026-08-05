# 移动达人详情页抖音行程与关联小号

## Goal

将达人详情页中的抖音主页行程和关联小号放到达人资料首屏的图 2 标注位置，让用户在看到达人基本资料时就能同时看到这两类信息，减少向下滚动。

## Requirements

- 在达人详情页首屏资料区域、图 2 标注位置渲染抖音主页行程和关联小号。
- 保留现有数据内容和展示规则：行程按抓取后的原始展示块顺序显示；关联小号仅显示已验证的抖音主页链接。
- 移除当前首屏下方独立的“主页行程”SectionFrame，不重复渲染行程或关联小号。
- 使用现有 `surface`、`surface-strong`、`ui-kicker`、`ui-subtle` 等视觉样式，并兼容桌面双列和移动端堆叠布局。
- 不改变抓取、解析、数据库、粉丝量、活动同步或关联小号验证逻辑。

## Acceptance Criteria

- [x] 达人详情页在图 2 标注位置显示行程和关联小号；首屏下方不再出现独立抖音信息栏。
- [x] 行程原文、顺序、换行和关联小号链接与移动前一致。
- [x] 只有行程或只有关联小号时仍能正常显示；两者都没有时不显示空卡片。
- [x] 桌面端布局清晰，移动端内容堆叠且无横向溢出；长中文行程可换行。
- [x] 既有抖音投影单元测试保持通过，并新增或调整页面验收以证明不重复渲染。
- [x] lint、TypeScript、相关单元测试和生产构建通过。

## Out of Scope

- 不调整抖音简介抓取、行程解析、活动聚合、粉丝量格式或关联小号 URL 验证。
- 不修改首页、达人列表卡片、搜索结果或活动页中的粉丝量显示规则。
- 不新增后台字段、数据库迁移或 API。

## Confirmed Technical Facts

- 当前渲染入口为 `src/app/(public)/talents/[slug]/page.tsx`。
- 行程和关联小号目前由页面下方独立的 `SectionFrame` 渲染；达人基本资料在同一文件的首屏右侧资料列渲染。
- 数据来自 `detail.douyinProfile.itineraryBlocks` 和 `detail.douyinProfile.relatedAccounts`，无需改变领域投影。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
