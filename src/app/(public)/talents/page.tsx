import { AutoFilterForm } from "@/components/site/auto-filter-form";
import { TalentCard } from "@/components/site/talent-card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageShell } from "@/components/ui/page-shell";
import { SectionFrame } from "@/components/ui/section-frame";
import { compareByPinyin } from "@/lib/pinyin";
import { buildMetadata } from "@/lib/site";
import { getContentState, getTalentIndex } from "@/modules/content/service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = buildMetadata({
  title: "TIANTI | 达人",
  description: "按标签、编辑视角、MCN 与关键词浏览 TIANTI 的公开达人索引。",
  path: "/talents"
});

export default async function TalentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const tag = typeof params.tag === "string" ? params.tag : undefined;
  const selectedEditorSlug = typeof params.editor === "string" ? params.editor : "";
  const mcn = typeof params.mcn === "string" ? params.mcn : undefined;
  const hasSchedule = typeof params.hasSchedule === "string" && params.hasSchedule === "1";
  const state = await getContentState();
  const tags = [...new Set(state.talents.flatMap((talent) => talent.tags))].sort(compareByPinyin);
  const mcns = [...new Set(state.talents.map((talent) => talent.mcn).filter(Boolean))].sort(compareByPinyin);
  const selectedEditor = state.editors.find((editor) => editor.slug === selectedEditorSlug) ?? null;
  const selectedLadder =
    selectedEditor ? state.ladders.find((ladder) => ladder.editorId === selectedEditor.id) ?? null : null;
  const requestedTierId = typeof params.tier === "string" ? params.tier : undefined;
  const tierId = selectedLadder?.tiers.some((tier) => tier.id === requestedTierId) ? requestedTierId : undefined;
  const talents = await getTalentIndex({
    query: q,
    tag,
    editorId: selectedEditor?.id,
    tierId,
    hasSchedule,
    mcn
  });

  const summaryParts = [
    tag ? `标签：${tag}` : null,
    mcn ? `MCN：${mcn}` : null,
    selectedEditor ? `${selectedEditor.name} 的视角` : null,
    tierId ? `梯度：${selectedLadder?.tiers.find((tier) => tier.id === tierId)?.name}` : null,
    hasSchedule ? "有行程" : null
  ].filter(Boolean);

  return (
    <PageShell>
      <SectionFrame
        eyebrow="Talent Index"
        title="以展示优先的方式浏览达人"
        description="用统一的筛选入口压缩关键词、标签、编辑视角和 MCN，让扫描路径更清楚。"
        titleTestId="talents-page-title"
      />

      <div className="mt-10 space-y-8">
        <FilterBar>
          <AutoFilterForm className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1fr_1fr]">
              <label className="sr-only" htmlFor="talent-filter-search">
                搜索达人
              </label>
              <input
                id="talent-filter-search"
                name="q"
                defaultValue={q}
                placeholder="搜索昵称、别名、标签、MCN 或关键词"
                className="ui-input rounded-full"
                data-testid="talent-filter-search"
              />
              <label className="sr-only" htmlFor="talent-filter-tag">
                按标签筛选达人
              </label>
              <select
                id="talent-filter-tag"
                name="tag"
                defaultValue={tag ?? ""}
                data-auto-submit="true"
                className="ui-select rounded-full"
              >
                <option value="">全部标签</option>
                {tags.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="talent-filter-mcn">
                按 MCN 筛选达人
              </label>
              <select
                id="talent-filter-mcn"
                name="mcn"
                defaultValue={mcn ?? ""}
                data-auto-submit="true"
                className="ui-select rounded-full"
              >
                <option value="">全部 MCN</option>
                {mcns.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="talent-filter-editor">
                按编辑视角筛选达人
              </label>
              <select
                id="talent-filter-editor"
                name="editor"
                defaultValue={selectedEditor?.slug ?? ""}
                data-auto-submit="true"
                data-reset-target="tier"
                className="ui-select rounded-full"
              >
                <option value="">全部编辑视角</option>
                {state.editors.map((editor) => (
                  <option key={editor.id} value={editor.slug}>
                    {editor.name}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="talent-filter-tier">
                按天梯梯度筛选达人
              </label>
              <select
                id="talent-filter-tier"
                name="tier"
                defaultValue={tierId ?? ""}
                disabled={!selectedLadder}
                data-auto-submit="true"
                className="ui-select rounded-full disabled:opacity-45"
              >
                <option value="">{selectedLadder ? "全部梯度" : "先选择编辑视角"}</option>
                {selectedLadder?.tiers
                  .slice()
                  .sort((left, right) => left.order - right.order)
                  .map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.name}
                    </option>
                  ))}
              </select>
            </div>

            <label className="inline-flex items-center gap-3 rounded-full border border-[var(--line-soft)] px-4 py-3 text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                name="hasSchedule"
                value="1"
                defaultChecked={hasSchedule}
                data-auto-submit="true"
              />
              只看有行程的达人
            </label>
          </AutoFilterForm>
        </FilterBar>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm ui-subtle">
          <p>
            共找到 <span className="text-[var(--foreground)]">{talents.length}</span> 位达人
          </p>
          {summaryParts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {summaryParts.map((part) => (
                <span key={part} className="ui-pill px-4 py-2 text-sm">
                  {part}
                </span>
              ))}
            </div>
          ) : (
            <p>默认按名称排序</p>
          )}
        </div>

        {talents.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {talents.map((talent, index) => (
              <TalentCard key={talent.id} talent={talent} eagerImage={index === 0} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="没有匹配的达人"
            description="可以尝试放宽标签、MCN、行程或编辑视角，重新打开更宽的浏览范围。"
          />
        )}
      </div>
    </PageShell>
  );
}
