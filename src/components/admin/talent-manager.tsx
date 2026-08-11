"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { useAdminUnsavedChanges } from "@/components/admin/admin-unsaved-changes";
import { InlineAssetUpload } from "@/components/admin/inline-asset-upload";
import { normalizeTalentDraft, splitCommaValues } from "@/components/admin/talent-manager-utils";
import { compareByPinyin } from "@/lib/pinyin";
import { extractDouyinProfileUrl, getPrimaryDouyinProfileLink } from "@/modules/douyin/profile-link";
import type { DouyinSyncResponse, TalentBulkResponse } from "@/modules/admin/types";
import type {
  Asset,
  DouyinSyncResult,
  DouyinSyncRun,
  Talent,
  TalentDouyinAdminStatus
} from "@/modules/domain/types";

interface TalentManagerProps {
  talents: Talent[];
  assets: Asset[];
  douyinStatuses: TalentDouyinAdminStatus[];
  initialLastSyncRun: DouyinSyncRun | null;
  initialLastSyncResults: DouyinSyncResult[];
}

interface RepresentationDraft {
  id: string;
  title: string;
  assetId: string;
}

interface LinkDraft {
  id: string;
  label: string;
  url: string;
}

interface TalentDraft {
  id?: string;
  nickname: string;
  bio: string;
  douyinProfileUrl: string;
  aliases: string;
  coverAssetId: string;
  links: LinkDraft[];
  representations: RepresentationDraft[];
}

const UNSAVED_MESSAGE = "当前达人资料还有未保存的修改，关闭或离开后会丢失。确定继续吗？";

function toCommaText(value?: string[]) {
  return value?.join(", ") ?? "";
}

function sortTalents(value: Talent[]) {
  return [...value].sort(
    (left, right) =>
      compareByPinyin(left.nickname, right.nickname) ||
      left.nickname.localeCompare(right.nickname, "zh-CN") ||
      left.id.localeCompare(right.id)
  );
}

function normalizeNickname(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function formatAdminSyncTime(value?: string | null) {
  if (!value) return "暂无成功记录";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function createRepresentationDraft(title = "", assetId = ""): RepresentationDraft {
  return {
    id: crypto.randomUUID(),
    title,
    assetId
  };
}

function createLinkDraft(label = "", url = ""): LinkDraft {
  return {
    id: crypto.randomUUID(),
    label,
    url
  };
}

function createTalentDraft(talent?: Talent | null): TalentDraft {
  if (!talent) {
    return {
      nickname: "",
      bio: "",
      douyinProfileUrl: "",
      aliases: "",
      coverAssetId: "",
      links: [],
      representations: []
    };
  }

  const primaryDouyin = getPrimaryDouyinProfileLink(talent).link;
  return {
    id: talent.id,
    nickname: talent.nickname,
    bio: talent.bio,
    douyinProfileUrl: primaryDouyin?.url ?? "",
    aliases: toCommaText(talent.aliases),
    coverAssetId: talent.coverAssetId ?? "",
    links: talent.links.filter((link) => link.id !== primaryDouyin?.id).map((link) => ({
      id: link.id,
      label: link.label,
      url: link.url
    })),
    representations: talent.representations.map((item) => ({
      id: item.id,
      title: item.title,
      assetId: item.assetId ?? ""
    }))
  };
}

export function TalentManager({
  talents,
  assets,
  douyinStatuses,
  initialLastSyncRun,
  initialLastSyncResults
}: TalentManagerProps) {
  const { setGuard } = useAdminUnsavedChanges();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [liveTalents, setLiveTalents] = useState(() => sortTalents(talents));
  const [selectedId, setSelectedId] = useState<string | null>(talents[0]?.id ?? null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [liveAssets, setLiveAssets] = useState(assets);
  const [cleanupCandidateAssetIds, setCleanupCandidateAssetIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [syncPending, startSyncTransition] = useTransition();
  const [syncClock, setSyncClock] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [liveDouyinStatuses, setLiveDouyinStatuses] = useState(douyinStatuses);
  const [lastSyncRun, setLastSyncRun] = useState(initialLastSyncRun);
  const [lastSyncResults, setLastSyncResults] = useState(initialLastSyncResults);
  const [draggingRepresentationId, setDraggingRepresentationId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const selectedTalent = liveTalents.find((talent) => talent.id === selectedId) ?? null;
  const selectedDouyinStatus = liveDouyinStatuses.find((status) => status.talentId === selectedId) ?? null;
  const selectedSyncCoolingDown = Boolean(
    selectedDouyinStatus?.manualSyncAvailableAt &&
      Date.parse(selectedDouyinStatus.manualSyncAvailableAt) > syncClock
  );
  const [draft, setDraft] = useState<TalentDraft>(() => createTalentDraft(selectedTalent));
  const persistedDraft = useMemo(() => createTalentDraft(selectedTalent), [selectedTalent]);
  const hasUnsavedChanges =
    isEditorOpen &&
    JSON.stringify(normalizeTalentDraft(draft)) !== JSON.stringify(normalizeTalentDraft(persistedDraft));

  useEffect(() => {
    setGuard(hasUnsavedChanges ? { isDirty: true, message: UNSAVED_MESSAGE } : null);
    return () => setGuard(null);
  }, [hasUnsavedChanges, setGuard]);

  useEffect(() => {
    const timer = window.setInterval(() => setSyncClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const assetMap = useMemo(() => new Map(liveAssets.map((asset) => [asset.id, asset])), [liveAssets]);

  const filteredTalents = useMemo(
    () =>
      liveTalents.filter((talent) =>
        `${talent.nickname} ${talent.aliases.join(" ")} ${talent.bio} ${talent.searchKeywords.join(" ")}`
          .toLowerCase()
          .includes(deferredQuery.toLowerCase())
      ),
    [deferredQuery, liveTalents]
  );

  const duplicateNicknameTalent = useMemo(() => {
    if (draft.id) {
      return null;
    }

    const normalizedDraftNickname = normalizeNickname(draft.nickname);
    if (!normalizedDraftNickname) {
      return null;
    }

    return (
      liveTalents.find((talent) => normalizeNickname(talent.nickname) === normalizedDraftNickname) ?? null
    );
  }, [draft.id, draft.nickname, liveTalents]);

  const hasSelectedTalents = selectedIds.length > 0;

  function openTalentEditor(id: string | null) {
    const nextTalent = liveTalents.find((talent) => talent.id === id) ?? null;
    setSelectedId(id);
    setDraft(createTalentDraft(nextTalent));
    setCleanupCandidateAssetIds([]);
    setDraggingRepresentationId(null);
    setMessage(null);
    setIsEditorOpen(true);
  }

  function closeTalentEditor() {
    if (hasUnsavedChanges && !window.confirm(UNSAVED_MESSAGE)) return;
    const nextTalent = liveTalents.find((talent) => talent.id === selectedId) ?? null;
    setDraft(createTalentDraft(nextTalent));
    setCleanupCandidateAssetIds([]);
    setDraggingRepresentationId(null);
    setIsEditorOpen(false);
  }

  function openDouyinSearch() {
    const nickname = draft.nickname.trim();
    if (!nickname) return;
    window.open(`https://www.douyin.com/search/${encodeURIComponent(nickname)}`, "_blank", "noopener,noreferrer");
  }

  function toggleSelectedTalent(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    );
  }

  function toggleAllFilteredTalents() {
    const filteredIds = filteredTalents.map((talent) => talent.id);
    const areAllSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

    setSelectedIds((current) =>
      areAllSelected
        ? current.filter((id) => !filteredIds.includes(id))
        : [...new Set([...current, ...filteredIds])]
    );
  }

  function enqueueCleanupAssetId(assetId?: string | null) {
    if (!assetId) return;
    setCleanupCandidateAssetIds((current) => [...new Set([...current, assetId])]);
  }

  function updateLink(index: number, patch: Partial<LinkDraft>) {
    setDraft((current) => ({
      ...current,
      links: current.links.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    }));
  }

  function addLinkRow() {
    setDraft((current) => ({
      ...current,
      links: [...current.links, createLinkDraft()]
    }));
  }

  function removeLinkRow(index: number) {
    setDraft((current) => ({
      ...current,
      links: current.links.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function updateRepresentation(index: number, patch: Partial<RepresentationDraft>) {
    setDraft((current) => ({
      ...current,
      representations: current.representations.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    }));
  }

  function addRepresentationRow() {
    setDraft((current) => ({
      ...current,
      representations: [createRepresentationDraft(), ...current.representations]
    }));
  }

  function moveRepresentation(representationId: string, toIndex: number) {
    setDraft((current) => {
      const movingRepresentation = current.representations.find((item) => item.id === representationId);
      if (!movingRepresentation) {
        return current;
      }

      const remainingRepresentations = current.representations.filter((item) => item.id !== representationId);
      const safeIndex = Math.max(0, Math.min(toIndex, remainingRepresentations.length));

      return {
        ...current,
        representations: [
          ...remainingRepresentations.slice(0, safeIndex),
          movingRepresentation,
          ...remainingRepresentations.slice(safeIndex)
        ]
      };
    });
  }

  function handleRepresentationDrop(targetRepresentationId: string) {
    if (!draggingRepresentationId || draggingRepresentationId === targetRepresentationId) {
      setDraggingRepresentationId(null);
      return;
    }

    const targetIndex = draft.representations
      .filter((item) => item.id !== draggingRepresentationId)
      .findIndex((item) => item.id === targetRepresentationId);

    moveRepresentation(draggingRepresentationId, targetIndex >= 0 ? targetIndex : draft.representations.length);
    setDraggingRepresentationId(null);
  }

  function handleRepresentationDropToEnd() {
    if (!draggingRepresentationId) return;
    moveRepresentation(draggingRepresentationId, draft.representations.length);
    setDraggingRepresentationId(null);
  }

  function removeRepresentationRow(index: number) {
    setDraft((current) => {
      const assetId = current.representations[index]?.assetId ?? "";
      enqueueCleanupAssetId(assetId || null);

      return {
        ...current,
        representations: current.representations.filter((_, itemIndex) => itemIndex !== index)
      };
    });
  }

  function handleCoverUploaded(asset: Asset) {
    setLiveAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
    setDraft((current) => {
      enqueueCleanupAssetId(current.coverAssetId || null);
      return { ...current, coverAssetId: asset.id };
    });
    setMessage(`已上传并替换封面「${asset.title}」。`);
  }

  function handleClearCover() {
    setDraft((current) => {
      enqueueCleanupAssetId(current.coverAssetId || null);
      return { ...current, coverAssetId: "" };
    });
    setMessage("已清空当前封面，保存后生效。");
  }

  function handleRepresentationUploaded(index: number, asset: Asset) {
    setLiveAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
    setDraft((current) => ({
      ...current,
      representations: current.representations.map((representation, itemIndex) => {
        if (itemIndex !== index) {
          return representation;
        }

        enqueueCleanupAssetId(representation.assetId || null);
        return {
          ...representation,
          assetId: asset.id,
          title: representation.title
        };
      })
    }));
    setMessage(`已上传并替换代表图「${asset.title}」。`);
  }

  function handleClearRepresentation(index: number) {
    setDraft((current) => ({
      ...current,
      representations: current.representations.map((representation, itemIndex) => {
        if (itemIndex !== index) {
          return representation;
        }

        enqueueCleanupAssetId(representation.assetId || null);
        return {
          ...representation,
          assetId: ""
        };
      })
    }));
    setMessage("已清空当前代表图，保存后生效。");
  }

  function handleDouyinSync(talentId?: string) {
    if (talentId && hasUnsavedChanges) {
      setMessage("请先保存当前达人资料，再按已保存的抖音主页立即同步。");
      return;
    }

    setMessage(null);
    startSyncTransition(async () => {
      try {
        const response = await fetch(
          talentId ? `/api/admin/talents/${talentId}/douyin-sync` : "/api/admin/douyin-sync",
          { method: "POST" }
        );
        const data = (await response.json().catch(() => null)) as DouyinSyncResponse | null;
        if (!response.ok || !data?.run || !data.results) {
          setMessage(data?.error ?? "抖音同步失败，请稍后重试。");
          return;
        }

        setLastSyncRun(data.run);
        setLastSyncResults(data.results);
        if (data.statuses) {
          setLiveDouyinStatuses(data.statuses);
        }
        setMessage(
          `抖音同步完成：成功 ${data.run.succeededCount}，跳过 ${data.run.skippedCount}，失败 ${data.run.failedCount}。`
        );
      } catch {
        setMessage("无法连接抖音同步服务，请稍后重试。");
      }
    });
  }

  async function handleSave() {
    if (duplicateNicknameTalent) {
      setMessage(`已存在同名达人“${duplicateNicknameTalent.nickname}”，请修改昵称后再保存。`);
      return;
    }

    setMessage(null);
    const normalizedDouyinProfileUrl = draft.douyinProfileUrl.trim()
      ? extractDouyinProfileUrl(draft.douyinProfileUrl)
      : null;
    if (draft.douyinProfileUrl.trim() && !normalizedDouyinProfileUrl) {
      setMessage("没有识别到有效的抖音达人主页，请粘贴主页链接或完整分享文案。");
      return;
    }

    const payload = {
      id: draft.id,
      nickname: draft.nickname,
      bio: draft.bio,
      aliases: splitCommaValues(draft.aliases),
      coverAssetId: draft.coverAssetId || null,
      cleanupCandidateAssetIds,
      links: [
        ...(normalizedDouyinProfileUrl
          ? [{ id: crypto.randomUUID(), label: "抖音主页", url: normalizedDouyinProfileUrl }]
          : []),
        ...draft.links
        .map((link) => ({
          id: link.id,
          label: link.label.trim(),
          url: link.url.trim()
        }))
        .filter((link) => link.label || link.url)
      ],
      representations: draft.representations
        .map((item) => ({
          id: item.id,
          title: item.title.trim(),
          assetId: item.assetId.trim()
        }))
        .filter((item) => item.assetId || item.title)
    };

    startTransition(async () => {
      const response = await fetch(draft.id ? `/api/admin/talents/${draft.id}` : "/api/admin/talents", {
        method: draft.id ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = (await response.json().catch(() => null)) as { error?: string; talent?: Talent } | null;
      if (!response.ok || !data?.talent) {
        setMessage(data?.error ?? "保存失败。");
        return;
      }

      setLiveTalents((current) => {
        const exists = current.some((talent) => talent.id === data.talent!.id);
        const next = exists
          ? current.map((talent) => (talent.id === data.talent!.id ? data.talent! : talent))
          : [...current, data.talent!];
        return sortTalents(next);
      });
      setSelectedId(data.talent.id);
      setDraft(createTalentDraft(data.talent));
      setCleanupCandidateAssetIds([]);
      setIsEditorOpen(false);
      if (normalizedDouyinProfileUrl) {
        const syncResponse = await fetch(`/api/admin/talents/${data.talent.id}/douyin-sync`, { method: "POST" });
        const syncData = (await syncResponse.json().catch(() => null)) as DouyinSyncResponse | null;
        if (syncResponse.ok && syncData?.run && syncData.results) {
          setLastSyncRun(syncData.run);
          setLastSyncResults(syncData.results);
          if (syncData.statuses) setLiveDouyinStatuses(syncData.statuses);
          setMessage(`已保存达人「${data.talent.nickname}」，并完成抖音主页校验与同步。`);
        } else {
          setMessage(`已保存达人「${data.talent.nickname}」，但抖音同步暂未完成：${syncData?.error ?? "请稍后重试"}。`);
        }
      } else {
        setMessage(`已保存达人「${data.talent.nickname}」。`);
      }
    });
  }

  async function handleDelete() {
    if (!selectedTalent) return;
    if (!confirm(`确定删除 ${selectedTalent.nickname} 吗？`)) return;

    startTransition(async () => {
      const response = await fetch(`/api/admin/talents/${selectedTalent.id}`, {
        method: "DELETE"
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setMessage(data?.error ?? "删除失败。");
        return;
      }

      const nextTalents = liveTalents.filter((talent) => talent.id !== selectedTalent.id);
      const nextSelectedTalent = nextTalents[0] ?? null;

      setLiveTalents(nextTalents);
      setSelectedIds((current) => current.filter((id) => id !== selectedTalent.id));
      setSelectedId(nextSelectedTalent?.id ?? null);
      setDraft(createTalentDraft(nextSelectedTalent));
      setCleanupCandidateAssetIds([]);
      setIsEditorOpen(false);
      setMessage(`已删除达人「${selectedTalent.nickname}」。`);
    });
  }

  async function handleBulkDelete() {
    if (!hasSelectedTalents) {
      setMessage("请先勾选至少一位达人。");
      return;
    }

    if (!confirm(`确定批量删除 ${selectedIds.length} 位达人吗？`)) {
      return;
    }

    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/talents/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "delete",
          ids: selectedIds
        })
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; result?: TalentBulkResponse }
        | null;
      if (!response.ok || !data?.result) {
        setMessage(data?.error ?? "批量操作失败。");
        return;
      }

      const succeededIds = data.result.succeededIds;
      const nextTalents = liveTalents.filter((talent) => !succeededIds.includes(talent.id));
      const nextSelectedTalent =
        selectedId && succeededIds.includes(selectedId)
          ? (nextTalents[0] ?? null)
          : (nextTalents.find((talent) => talent.id === selectedId) ?? nextTalents[0] ?? null);

      setLiveTalents(nextTalents);
      setSelectedIds((current) => current.filter((id) => !succeededIds.includes(id)));
      setSelectedId(nextSelectedTalent?.id ?? null);
      setDraft(createTalentDraft(nextSelectedTalent));
      if (selectedId && succeededIds.includes(selectedId)) {
        setIsEditorOpen(false);
      }

      const blockedSummary =
        data.result.blocked.length > 0
          ? `，${data.result.blocked.length} 项未完成：${data.result.blocked.map((item) => item.reason).join(" / ")}`
          : "";
      setMessage(`已批量删除达人 ${data.result.succeededIds.length} 项${blockedSummary}`);
    });
  }

  return (
    <div
      data-testid="talent-manager"
      data-unsaved={hasUnsavedChanges ? "true" : "false"}
      className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]"
    >
      <aside className="surface rounded-[1.8rem] p-5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索达人"
          className="w-full rounded-full border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
        />
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/55">
          <button
            type="button"
            data-testid="talent-select-all"
            onClick={toggleAllFilteredTalents}
            className="rounded-full border border-white/12 px-3 py-2 transition hover:border-white/25 hover:text-white"
          >
            {filteredTalents.length > 0 && filteredTalents.every((talent) => selectedIds.includes(talent.id))
              ? "取消全选当前结果"
              : "全选当前结果"}
          </button>
          <span className="rounded-full border border-white/8 px-3 py-2">
            已选 {selectedIds.length} / {liveTalents.length}
          </span>
        </div>
        <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-black/15 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-white/45">Bulk Actions</p>
          <div className="mt-3 grid gap-3">
            <button
              type="button"
              data-testid="bulk-delete-talents"
              onClick={handleBulkDelete}
              disabled={pending || !hasSelectedTalents}
              className="rounded-full border border-[#b13b45]/45 px-4 py-2 text-sm text-[#5f0f18] disabled:opacity-50"
            >
              批量删除达人
            </button>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <button
            type="button"
            data-testid="new-talent-button"
            onClick={() => openTalentEditor(null)}
            className="w-full rounded-[1.2rem] border border-dashed border-white/15 px-4 py-4 text-left text-sm text-white/70 transition hover:border-white/30 hover:text-white"
          >
            + 新建达人
          </button>
          {filteredTalents.map((talent) => {
            const isChecked = selectedIds.includes(talent.id);

            return (
              <div
                key={talent.id}
                className={`flex items-start gap-3 rounded-[1.2rem] px-3 py-3 transition ${
                  selectedId === talent.id ? "bg-white/10" : "bg-black/10 hover:bg-white/6"
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`选择 ${talent.nickname}`}
                  checked={isChecked}
                  onChange={(event) => toggleSelectedTalent(talent.id, event.target.checked)}
                  className="mt-1 size-4 rounded border-white/20 bg-black/30"
                />
                <button type="button" onClick={() => openTalentEditor(talent.id)} className="flex-1 text-left">
                  <p className="text-lg text-white">{talent.nickname}</p>
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <section className="space-y-6">
        {message ? (
          <div className="surface rounded-[1.4rem] px-5 py-4 text-sm text-[#5f3d00]">{message}</div>
        ) : null}
        <div className="surface rounded-[1.8rem] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">Talent Workspace</p>
              <h2 className="mt-3 text-3xl text-white">达人资料</h2>
            </div>
            <button
              type="button"
              data-testid="sync-all-douyin"
              onClick={() => handleDouyinSync()}
              disabled={syncPending}
              className="ui-button-secondary px-5 py-2.5 text-sm disabled:opacity-50"
            >
              {syncPending ? "同步中..." : "立即同步全部抖音"}
            </button>
          </div>
          <p className="mt-3 text-sm leading-7 text-white/60">
            新增和编辑会在独立弹窗中完成；列表保持用于搜索、勾选和批量管理。
          </p>
          <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-black/15 px-4 py-3 text-sm text-white/55">
            {lastSyncRun ? (
              <div className="space-y-2">
                <p>
                  最近同步：成功 {lastSyncRun.succeededCount} · 跳过 {lastSyncRun.skippedCount} · 失败 {lastSyncRun.failedCount}
                </p>
                <p className="text-xs text-white/40">{formatAdminSyncTime(lastSyncRun.finishedAt ?? lastSyncRun.startedAt)}</p>
                {lastSyncResults.some((result) => result.status !== "succeeded") ? (
                  <p className="text-xs text-white/45">
                    {lastSyncResults
                      .filter((result) => result.status !== "succeeded")
                      .slice(0, 3)
                      .map((result) => result.message)
                      .join(" / ")}
                  </p>
                ) : null}
              </div>
            ) : (
              "还没有抖音同步记录。"
            )}
          </div>
          <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-black/15 p-4">
            {selectedTalent ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-lg text-white">{selectedTalent.nickname}</p>
                  <p className="mt-2 text-xs text-white/45">
                    抖音上次成功：{formatAdminSyncTime(selectedDouyinStatus?.lastSuccessAt)}
                    {selectedDouyinStatus?.lastErrorCode
                      ? ` · 最近错误 ${selectedDouyinStatus.lastErrorCode}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    data-testid="sync-selected-douyin"
                    onClick={() => handleDouyinSync(selectedTalent.id)}
                    disabled={syncPending || selectedSyncCoolingDown}
                    className="ui-button-secondary px-5 py-2.5 text-sm disabled:opacity-50"
                  >
                    {syncPending ? "同步中..." : selectedSyncCoolingDown ? "同步冷却中" : "立即同步抖音"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openTalentEditor(selectedTalent.id)}
                    className="ui-button-secondary px-5 py-2.5 text-sm"
                  >
                    编辑达人
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-white/60">当前没有选中的达人。</p>
                <button
                  type="button"
                  onClick={() => openTalentEditor(null)}
                  className="ui-button-secondary px-5 py-2.5 text-sm"
                >
                  新建达人
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {isEditorOpen ? (
        <AdminDialog
          title={selectedTalent ? `编辑 ${selectedTalent.nickname}` : "新建达人"}
          description="只有昵称必填；保存成功后弹窗会自动关闭，并同步左侧列表。"
          onClose={closeTalentEditor}
          size="xl"
          footer={<span className="text-xs leading-6 ui-muted">别名支持中英文逗号分隔。</span>}
        >
          <section className="space-y-6">
            <div className="space-y-5">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">Talent Editor</p>
              <h2 className="mt-3 text-3xl text-white">
                {selectedTalent ? `编辑 ${selectedTalent.nickname}` : "新建达人"}
              </h2>
            </div>
            {selectedTalent ? (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-full border border-[#b13b45]/55 px-4 py-2 text-sm text-[#5f0f18]"
              >
                删除
              </button>
            ) : null}
          </div>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <input
                name="nickname"
                value={draft.nickname}
                onChange={(event) => setDraft((current) => ({ ...current, nickname: event.target.value }))}
                placeholder="昵称"
                className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
              />
              {duplicateNicknameTalent ? (
                <p className="text-xs text-[#b13b45] md:col-span-2">
                  已存在同名达人“{duplicateNicknameTalent.nickname}”，建议更换昵称后再保存。
                </p>
              ) : null}
            </div>

            <div className="space-y-3 rounded-[1.4rem] border border-white/10 bg-black/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">抖音主页</p>
                  <p className="mt-1 text-xs text-white/45">先打开抖音搜索，进入达人主页后复制链接回来。</p>
                </div>
                <button
                  type="button"
                  data-testid="open-douyin-search"
                  onClick={openDouyinSearch}
                  disabled={!draft.nickname.trim()}
                  className="rounded-full border border-white/12 px-3 py-2 text-xs text-white/72 disabled:opacity-40"
                >
                  打开抖音搜索
                </button>
              </div>
              <textarea
                name="douyinProfileUrl"
                value={draft.douyinProfileUrl}
                onChange={(event) => setDraft((current) => ({ ...current, douyinProfileUrl: event.target.value }))}
                placeholder="粘贴主页链接或完整分享文案"
                rows={2}
                className="w-full rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
              />
            </div>

            <textarea
              name="bio"
              value={draft.bio}
              onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
              placeholder="简介"
              rows={4}
              className="w-full rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
            />

            <div className="grid gap-4 md:grid-cols-2">
              <input
                name="aliases"
                value={draft.aliases}
                onChange={(event) => setDraft((current) => ({ ...current, aliases: event.target.value }))}
                placeholder="别名 / 英文名，支持中英文逗号分隔"
                className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
              />
            </div>

            <div className="space-y-3 rounded-[1.4rem] border border-white/10 bg-black/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">封面图片</p>
                  <p className="mt-1 text-xs text-white/45">当前图片可直接替换或清空，不再从素材池手动选择。</p>
                </div>
                <InlineAssetUpload
                  kind="talent_cover"
                  dataTestId="talent-cover-upload"
                  currentAsset={draft.coverAssetId ? (assetMap.get(draft.coverAssetId) ?? null) : null}
                  onClear={handleClearCover}
                  onUploaded={handleCoverUploaded}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-[1.4rem] border border-white/10 bg-black/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">平台链接</p>
                  <p className="mt-1 text-xs text-white/45">一个框填名称，一个框填链接。空行会自动忽略。</p>
                </div>
                <button
                  type="button"
                  onClick={addLinkRow}
                  className="rounded-full border border-white/12 px-3 py-2 text-xs text-white/72"
                >
                  + 添加链接
                </button>
              </div>

              {draft.links.length > 0 ? (
                <div className="space-y-3">
                  {draft.links.map((link, index) => (
                    <div
                      key={link.id}
                      className="grid gap-3 rounded-[1.1rem] border border-white/10 bg-black/20 p-3 md:grid-cols-[0.9fr_1.5fr_auto]"
                    >
                      <input
                        value={link.label}
                        onChange={(event) => updateLink(index, { label: event.target.value })}
                        placeholder="平台名称"
                        className="rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                      />
                      <input
                        value={link.url}
                        onChange={(event) => updateLink(index, { url: event.target.value })}
                        placeholder="https://"
                        className="rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeLinkRow(index)}
                        className="rounded-[1rem] border border-[#b13b45]/45 px-3 py-2 text-sm text-[#5f0f18]"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.1rem] border border-dashed border-white/10 px-4 py-4 text-sm text-white/55">
                  还没有平台链接。
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-[1.4rem] border border-white/10 bg-black/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">代表图</p>
                  <p className="mt-1 text-xs text-white/45">代表图现在允许为空；不需要时可以删到 0 项。</p>
                </div>
                <button
                  type="button"
                  onClick={addRepresentationRow}
                  className="rounded-full border border-white/12 px-3 py-2 text-xs text-white/72"
                >
                  + 添加代表图
                </button>
              </div>

              {draft.representations.length > 0 ? (
                <div className="space-y-4" onDragOver={(event) => event.preventDefault()} onDrop={handleRepresentationDropToEnd}>
                  {draft.representations.map((representation, index) => (
                    <div
                      key={representation.id}
                      data-testid={`representation-row-${index}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleRepresentationDrop(representation.id);
                      }}
                      className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4"
                    >
                      <div
                        data-testid={`representation-drop-${index}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleRepresentationDrop(representation.id);
                        }}
                        className="mb-3 h-3 rounded-full border border-dashed border-white/10 bg-black/15"
                      />
                      <div className="grid gap-3 md:grid-cols-[auto_1fr_auto]">
                        <div
                          data-testid={`representation-handle-${index}`}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", representation.id);
                            event.dataTransfer.effectAllowed = "move";
                            setDraggingRepresentationId(representation.id);
                          }}
                          onDragEnd={() => setDraggingRepresentationId(null)}
                          className="flex min-h-10 cursor-grab items-center rounded-[1rem] border border-white/10 bg-black/25 px-3 text-xs uppercase tracking-[0.2em] text-white/55"
                        >
                          拖动
                        </div>
                        <input
                          data-testid={`representation-title-${index}`}
                          value={representation.title}
                          onChange={(event) => updateRepresentation(index, { title: event.target.value })}
                          placeholder="代表图标题"
                          className="rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeRepresentationRow(index)}
                          className="rounded-[1rem] border border-[#b13b45]/45 px-3 py-2 text-sm text-[#5f0f18]"
                        >
                          删除
                        </button>
                      </div>
                      <div className="mt-3">
                        <InlineAssetUpload
                          kind="talent_representation"
                          dataTestId={`talent-representation-upload-${index}`}
                          currentAsset={representation.assetId ? (assetMap.get(representation.assetId) ?? null) : null}
                          onClear={() => handleClearRepresentation(index)}
                          onUploaded={(asset) => handleRepresentationUploaded(index, asset)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.1rem] border border-dashed border-white/10 px-4 py-4 text-sm text-white/55">
                  当前没有代表图。
                </div>
              )}
            </div>

            {message ? <p className="text-sm text-[#5f3d00]">{message}</p> : null}
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs leading-6 text-white/45">
                只有昵称必填，其他字段都可以留空；别名支持中英文逗号分隔。
              </p>
              <button
                type="button"
                disabled={pending || Boolean(duplicateNicknameTalent)}
                data-testid="save-talent"
                onClick={handleSave}
                className="rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm uppercase tracking-[0.25em] text-black disabled:opacity-60"
              >
                {pending ? "保存中..." : "保存并公开"}
              </button>
            </div>
          </div>
            </div>
          </section>
        </AdminDialog>
      ) : null}
    </div>
  );
}
