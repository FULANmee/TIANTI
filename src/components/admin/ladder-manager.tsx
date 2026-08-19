"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { GripVertical, Plus, Save, Search, Trash2 } from "lucide-react";
import { useAdminUnsavedChanges } from "@/components/admin/admin-unsaved-changes";
import { normalizeLadderDraft } from "@/components/admin/ladder-manager-utils";
import { StatusNotice } from "@/components/ui/status-notice";
import { matchesPinyinSearch } from "@/lib/pinyin";
import type { EditorLadder, Talent } from "@/modules/domain/types";

interface LadderManagerProps {
  ladder: EditorLadder;
  talents: Talent[];
  editorName: string;
}

const talentNameCollator = new Intl.Collator("zh-Hans-CN-u-co-pinyin", {
  numeric: true,
  sensitivity: "base"
});

const UNSAVED_MESSAGE = "当前天梯榜还有未保存的修改，离开后会丢失。确定继续吗？";

function getDerivedLadderTitle(editorName: string) {
  return `${editorName}的天梯榜`;
}

function compareTalentsByNickname(first: Talent, second: Talent) {
  return talentNameCollator.compare(first.nickname, second.nickname) || first.id.localeCompare(second.id);
}

export function LadderManager({ ladder, talents, editorName }: LadderManagerProps) {
  const { setGuard } = useAdminUnsavedChanges();
  const derivedTitle = getDerivedLadderTitle(editorName);
  const [persistedLadder, setPersistedLadder] = useState<EditorLadder>(ladder);
  const [draft, setDraft] = useState<EditorLadder>({ ...ladder, title: derivedTitle });
  const [dragging, setDragging] = useState<{ talentId: string; fromTierId: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ text: string; variant: "error" | "success" } | null>(null);
  const [talentQuery, setTalentQuery] = useState("");
  const hasUnsavedChanges =
    JSON.stringify(normalizeLadderDraft(draft)) !== JSON.stringify(normalizeLadderDraft(persistedLadder));

  useEffect(() => {
    setGuard(hasUnsavedChanges ? { isDirty: true, message: UNSAVED_MESSAGE } : null);
    return () => setGuard(null);
  }, [hasUnsavedChanges, setGuard]);

  const talentMap = useMemo(() => new Map(talents.map((talent) => [talent.id, talent])), [talents]);
  const assignedTalentIds = useMemo(() => new Set(draft.tiers.flatMap((tier) => tier.talentIds)), [draft.tiers]);
  const unassignedTalents = useMemo(
    () => talents.filter((talent) => !assignedTalentIds.has(talent.id) && matchesPinyinSearch([talent.nickname, ...talent.aliases, ...talent.searchKeywords], talentQuery)).sort(compareTalentsByNickname),
    [assignedTalentIds, talentQuery, talents]
  );

  function updateTierName(tierId: string, name: string) {
    setDraft((current) => ({
      ...current,
      tiers: current.tiers.map((tier) => (tier.id === tierId ? { ...tier, name } : tier))
    }));
  }

  function moveTalent(talentId: string, toTierId: string | null, toIndex?: number) {
    setDraft((current) => ({
      ...current,
      tiers: current.tiers.map((tier) => {
        const filteredTalentIds = tier.talentIds.filter((item) => item !== talentId);
        if (!toTierId || tier.id !== toTierId) {
          return { ...tier, talentIds: filteredTalentIds };
        }

        const safeIndex =
          typeof toIndex === "number"
            ? Math.max(0, Math.min(toIndex, filteredTalentIds.length))
            : filteredTalentIds.length;

        return {
          ...tier,
          talentIds: [
            ...filteredTalentIds.slice(0, safeIndex),
            talentId,
            ...filteredTalentIds.slice(safeIndex)
          ]
        };
      })
    }));
  }

  function handleDropToPool() {
    if (!dragging) return;
    moveTalent(dragging.talentId, null);
    setDragging(null);
  }

  function removeEmptyTier(tierId: string) {
    setDraft((current) => {
      const tier = current.tiers.find((item) => item.id === tierId);
      if (!tier || tier.talentIds.length > 0) {
        return current;
      }

      return {
        ...current,
        tiers: current.tiers
          .filter((item) => item.id !== tierId)
          .map((item, itemIndex) => ({ ...item, order: itemIndex }))
      };
    });
  }

  function handleDropToTierEnd(tierId: string) {
    if (!dragging) return;
    moveTalent(dragging.talentId, tierId);
    setDragging(null);
  }

  function handleDropToTierPosition(tierId: string, targetTalentId: string) {
    if (!dragging) return;
    if (dragging.talentId === targetTalentId && dragging.fromTierId === tierId) {
      setDragging(null);
      return;
    }

    const targetTier = draft.tiers.find((tier) => tier.id === tierId);
    if (!targetTier) {
      setDragging(null);
      return;
    }

    const targetIndex = targetTier.talentIds.filter((item) => item !== dragging.talentId).indexOf(targetTalentId);
    moveTalent(dragging.talentId, tierId, targetIndex >= 0 ? targetIndex : undefined);
    setDragging(null);
  }

  async function handleSave() {
    setNotice(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/ladder", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...draft,
          title: derivedTitle
        })
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; ladder?: EditorLadder }
        | null;
      if (!response.ok || !data?.ladder) {
        setNotice({ text: data?.error ?? "保存失败。", variant: "error" });
        return;
      }

      const nextLadder = { ...data.ladder, title: derivedTitle };
      setPersistedLadder(nextLadder);
      setDraft(nextLadder);
      setNotice({ text: "天梯榜已保存。", variant: "success" });
    });
  }

  return (
    <div
      data-testid="ladder-manager"
      data-unsaved={hasUnsavedChanges ? "true" : "false"}
      className="space-y-6"
    >
      <section className="surface rounded-[1.8rem] p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--color-accent)]">Ladder Title</p>
            <input data-testid="ladder-title" value={derivedTitle} readOnly className="ui-input opacity-80" />
            <p className="text-xs ui-muted">主标题始终跟随当前编辑昵称自动生成。</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--color-accent)]">Subtitle</p>
            <input
              data-testid="ladder-subtitle"
              value={draft.subtitle}
              onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))}
              className="ui-input"
              placeholder="天梯副标题"
            />
            <p className="text-xs ui-muted">副标题仍可自定义，公开页会直接使用这里的内容。</p>
          </div>
        </div>
      </section>

      <section className="surface rounded-[1.8rem] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="ui-kicker">Unranked Pool</p>
            <h2 className="mt-3 text-2xl text-[var(--foreground)]">未入榜达人</h2>
          </div>
        </div>
        <label className="ui-field-label mt-4"><span className="flex items-center gap-2"><Search aria-hidden="true" className="size-3.5" />搜索达人</span><input value={talentQuery} onChange={(event) => setTalentQuery(event.target.value)} placeholder="中文、拼音或首字母" className="ui-input text-sm" /></label>
        <div
          className="mt-5 flex min-h-24 flex-wrap gap-3 rounded-[1.2rem] border border-dashed border-[var(--line-strong)] bg-[rgba(248,251,255,0.82)] p-4"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDropToPool}
        >
          {unassignedTalents.map((talent) => (
            <div
              key={talent.id}
              data-testid={`unassigned-talent-${talent.id}`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", talent.id);
                event.dataTransfer.effectAllowed = "move";
                setDragging({ talentId: talent.id, fromTierId: "" });
              }}
              onDragEnd={() => setDragging(null)}
              className="cursor-grab rounded-full border border-[var(--line-soft)] bg-[var(--surface-strong)] px-4 py-2 text-sm text-[var(--foreground)]"
            >
              {talent.nickname}
            </div>
          ))}
          {unassignedTalents.length === 0 ? (
            <div className="surface-strong flex min-h-10 items-center rounded-[1rem] px-4 py-3 text-sm text-[var(--foreground-soft)]">
              把达人拖回这里即可移出榜单。
            </div>
          ) : null}
        </div>
      </section>

      <div className="space-y-4">
        {draft.tiers
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((tier) => (
            <section
              key={tier.id}
              className="surface rounded-[1.35rem] p-3"
            >
              <div className="grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-center">
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                >
                  <input
                    value={tier.name}
                    onChange={(event) => updateTierName(tier.id, event.target.value)}
                    className="ui-input min-h-11 rounded-[0.95rem] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    aria-disabled={tier.talentIds.length > 0}
                    data-testid={`tier-${tier.id}-delete`}
                    onClick={() => removeEmptyTier(tier.id)}
                    onDragOver={(event) => {
                      if (dragging) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDropToPool();
                    }}
                    title="空梯度可删除；拖拽达人到这里可移出榜单。"
                    className={`ui-button-danger min-h-11 px-3 py-2 text-xs ${
                      dragging ? "border-red-300 bg-red-50" : ""
                    } ${tier.talentIds.length > 0 ? "opacity-70" : ""}`}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    删除
                  </button>
                </div>

                <div
                  className="min-w-0 overflow-x-auto py-1 lg:py-0"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDropToTierEnd(tier.id)}
                >
                  <div className="flex min-h-11 w-max min-w-full items-center gap-2 rounded-[0.95rem] border border-dashed border-[var(--line-soft)] bg-[rgba(248,251,255,0.84)] p-2">
                    {tier.talentIds.map((talentId, talentIndex) => {
                      const talent = talentMap.get(talentId);
                      if (!talent) return null;

                      return (
                        <div
                          key={talentId}
                          data-testid={`tier-${tier.id}-talent-${talentIndex}`}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", talentId);
                            event.dataTransfer.effectAllowed = "move";
                            setDragging({ talentId, fromTierId: tier.id });
                          }}
                          onDragEnd={() => setDragging(null)}
                          onDoubleClickCapture={() => moveTalent(talentId, null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleDropToTierPosition(tier.id, talentId);
                          }}
                          className="inline-flex w-fit cursor-grab items-center gap-2 whitespace-nowrap rounded-[0.8rem] border border-[var(--line-soft)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--color-accent)] active:cursor-grabbing"
                        >
                          <GripVertical aria-hidden="true" className="size-4 text-[var(--foreground-muted)]" />
                          <span>{talent.nickname}</span>
                        </div>
                      );
                    })}

                    {tier.talentIds.length === 0 ? (
                      <div className="inline-flex min-h-8 items-center rounded-full border border-dashed border-[var(--line-strong)] px-3 py-1.5 text-sm ui-subtle">
                        把达人拖到这里，或拖到具体卡片上方进行插入排序。
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ))}
        <button
          type="button"
          data-testid="add-tier"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              tiers: [
                ...current.tiers,
                {
                  id: crypto.randomUUID(),
                  name: `T${current.tiers.length}`,
                  order: current.tiers.length,
                  talentIds: []
                }
              ]
            }))
          }
          className="ui-button-secondary w-fit px-4 py-2 text-sm"
        >
          <Plus aria-hidden="true" className="size-4" />
          新增梯度
        </button>
      </div>

      {notice ? <StatusNotice variant={notice.variant}>{notice.text}</StatusNotice> : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          data-testid="save-ladder"
          disabled={pending}
          className="ui-button-primary text-sm disabled:opacity-60"
        >
          <Save aria-hidden="true" className="size-4" />
          {pending ? "保存中..." : "保存天梯"}
        </button>
      </div>
    </div>
  );
}
