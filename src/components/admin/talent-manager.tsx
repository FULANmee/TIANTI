"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";
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

function formatFollowerCount(value?: number | null) {
  if (value === null || value === undefined) return "未读取";
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function getSyncPresentation(
  hasProfileLink: boolean,
  status: TalentDouyinAdminStatus | null,
  coolingDown: boolean
) {
  if (!hasProfileLink) return { label: "未绑定", color: "var(--foreground-muted)" };
  if (!status?.lastSuccessAt && !status?.lastErrorCode) return { label: "待首次同步", color: "var(--color-warning)" };
  if (status?.lastErrorCode) return { label: "同步异常", color: "var(--color-danger)" };
  if (coolingDown) return { label: "冷却中", color: "var(--color-warning)" };
  return { label: "同步正常", color: "var(--color-success)" };
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
  const [syncingTalentId, setSyncingTalentId] = useState<string | "all" | null>(null);
  const [syncClock, setSyncClock] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [liveDouyinStatuses, setLiveDouyinStatuses] = useState(douyinStatuses);
  const [lastSyncRun, setLastSyncRun] = useState(initialLastSyncRun);
  const [lastSyncResults, setLastSyncResults] = useState(initialLastSyncResults);
  const [draggingRepresentationId, setDraggingRepresentationId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(() => talents.length > 0);

  const talentMap = useMemo(() => new Map(liveTalents.map((talent) => [talent.id, talent])), [liveTalents]);
  const douyinStatusMap = useMemo(
    () => new Map(liveDouyinStatuses.map((status) => [status.talentId, status])),
    [liveDouyinStatuses]
  );
  const selectedTalent = selectedId ? talentMap.get(selectedId) ?? null : null;
  const selectedDouyinStatus = selectedId ? douyinStatusMap.get(selectedId) ?? null : null;
  const selectedDouyinLink = selectedTalent ? getPrimaryDouyinProfileLink(selectedTalent).link : null;
  const selectedSyncCoolingDown = Boolean(
    selectedDouyinStatus?.manualSyncAvailableAt &&
      Date.parse(selectedDouyinStatus.manualSyncAvailableAt) > syncClock
  );
  const selectedSyncPresentation = getSyncPresentation(
    Boolean(selectedDouyinLink),
    selectedDouyinStatus,
    selectedSyncCoolingDown
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
    if (id !== selectedId && hasUnsavedChanges && !window.confirm(UNSAVED_MESSAGE)) return;
    const nextTalent = id ? talentMap.get(id) ?? null : null;
    setSelectedId(id);
    setDraft(createTalentDraft(nextTalent));
    setCleanupCandidateAssetIds([]);
    setDraggingRepresentationId(null);
    setMessage(null);
    setIsEditorOpen(true);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[data-testid="admin-editor-workspace"]')?.scrollIntoView({ block: "start" });
      });
    }
  }

  function inspectTalent(id: string) {
    openTalentEditor(id);
  }

  function closeTalentEditor() {
    if (hasUnsavedChanges && !window.confirm(UNSAVED_MESSAGE)) return;
    const nextTalent = selectedId ? talentMap.get(selectedId) ?? null : null;
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
    setSyncingTalentId(talentId ?? "all");
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
      } finally {
        setSyncingTalentId(null);
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

    const previousDouyinProfileUrl = selectedTalent
      ? getPrimaryDouyinProfileLink(selectedTalent).link?.url ?? null
      : null;
    const shouldSyncAfterSave = Boolean(
      normalizedDouyinProfileUrl && normalizedDouyinProfileUrl !== previousDouyinProfileUrl
    );

    startTransition(async () => {
      try {
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
        setIsEditorOpen(true);
        setMessage(`已保存达人「${data.talent.nickname}」。`);

        if (shouldSyncAfterSave) {
          setSyncingTalentId(data.talent.id);
          const syncResponse = await fetch(`/api/admin/talents/${data.talent.id}/douyin-sync`, { method: "POST" });
          const syncData = (await syncResponse.json().catch(() => null)) as DouyinSyncResponse | null;
          if (syncResponse.ok && syncData?.run && syncData.results) {
            setLastSyncRun(syncData.run);
            setLastSyncResults(syncData.results);
            if (syncData.statuses) setLiveDouyinStatuses(syncData.statuses);
            const result = syncData.results.find((item) => item.talentId === data.talent!.id) ?? syncData.results[0];
            setMessage(
              result?.status === "succeeded"
                ? `已保存达人「${data.talent.nickname}」，抖音资料同步成功。`
                : `已保存达人「${data.talent.nickname}」；抖音同步${result?.status === "skipped" ? "已跳过" : "未完成"}：${result?.message ?? "请稍后重试"}。`
            );
          } else {
            setMessage(`已保存达人「${data.talent.nickname}」，但抖音同步暂未完成：${syncData?.error ?? "请稍后重试"}。`);
          }
          setSyncingTalentId(null);
        }
      } catch {
        setMessage("无法连接保存服务，请检查网络后重试。");
        setSyncingTalentId(null);
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
      setIsEditorOpen(Boolean(nextSelectedTalent));
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
        setIsEditorOpen(Boolean(nextSelectedTalent));
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
      className="admin-workspace grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]"
    >
      <aside className="surface flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-panel)]">
        <div className="space-y-3 border-b border-[var(--line-soft)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="ui-kicker">对象索引</p>
              <h1 className="mt-1 text-xl font-semibold">达人</h1>
            </div>
            <button type="button" data-testid="new-talent-button" onClick={() => openTalentEditor(null)} className="ui-button-primary text-sm">
              <Plus aria-hidden="true" className="size-4" />
              新建达人
            </button>
          </div>
          <label className="ui-field-label">
            <span className="flex items-center gap-2"><Search aria-hidden="true" className="size-3.5" />搜索达人</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入昵称、别名或简介"
              className="ui-input text-sm"
            />
          </label>
          <div className="flex items-center justify-between gap-3 text-xs ui-muted">
            <span>{filteredTalents.length} 位达人</span>
            <button type="button" data-testid="talent-select-all" onClick={toggleAllFilteredTalents} className="ui-button-secondary min-h-9 px-3 py-1 text-xs">
              {filteredTalents.length > 0 && filteredTalents.every((talent) => selectedIds.includes(talent.id)) ? "取消全选" : "全选结果"}
            </button>
          </div>
          {hasSelectedTalents ? (
            <div className="flex items-center justify-between gap-3 rounded-[0.8rem] bg-[var(--color-danger-soft)] p-3 text-sm">
              <span>已进入批量模式 · {selectedIds.length} 项</span>
              <button type="button" data-testid="bulk-delete-talents" onClick={handleBulkDelete} disabled={pending} className="ui-button-danger min-h-9 px-3 py-1 text-xs">
                <Trash2 aria-hidden="true" className="size-3.5" />
                删除所选
              </button>
            </div>
          ) : null}
        </div>

        <div className="admin-scroll-region flex-1 space-y-1 overflow-y-auto p-2" data-testid="talent-index">
          {filteredTalents.length ? filteredTalents.map((talent) => {
            const isChecked = selectedIds.includes(talent.id);
            const profileLink = getPrimaryDouyinProfileLink(talent).link;
            const status = douyinStatusMap.get(talent.id) ?? null;
            const coolingDown = Boolean(status?.manualSyncAvailableAt && Date.parse(status.manualSyncAvailableAt) > syncClock);
            const presentation = getSyncPresentation(Boolean(profileLink), status, coolingDown);

            return (
              <div
                key={talent.id}
                className={`ui-status-spine grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[0.8rem] py-2 pl-3 pr-2 transition ${selectedId === talent.id ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--surface-tint)]"}`}
                style={{ "--status-color": presentation.color } as React.CSSProperties}
              >
                <input type="checkbox" aria-label={`批量选择 ${talent.nickname}`} checked={isChecked} onChange={(event) => toggleSelectedTalent(talent.id, event.target.checked)} className="size-4 accent-[var(--color-accent)]" />
                <button type="button" aria-pressed={selectedId === talent.id} onClick={() => inspectTalent(talent.id)} className="min-w-0 rounded-md px-2 py-1 text-left">
                  <span className="block truncate text-sm font-semibold">{talent.nickname}</span>
                  <span className="mt-0.5 block text-xs ui-muted">{presentation.label} · {formatAdminSyncTime(status?.lastSuccessAt)}</span>
                </button>
              </div>
            );
          }) : (
            <div className="px-4 py-10 text-center text-sm ui-muted">没有匹配的达人。清除搜索词后查看全部。</div>
          )}
        </div>
      </aside>

      <section id="talent-inspector" className={`${isEditorOpen ? "hidden" : ""} min-w-0 scroll-mt-24 space-y-4 lg:sticky lg:top-[5.25rem] lg:self-start`} data-testid="talent-inspector">
        {selectedTalent ? (
          <div className="surface overflow-hidden rounded-[var(--radius-panel)]">
            <div className="ui-status-spine flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line-soft)] px-6 py-5" style={{ "--status-color": selectedSyncPresentation.color } as React.CSSProperties}>
              <div className="pl-2">
                <p className="text-xs font-semibold tracking-[0.12em] ui-muted">详情检查器</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">{selectedTalent.nickname}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 ui-subtle">{selectedTalent.bio || "尚未填写达人简介。"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => openTalentEditor(selectedTalent.id)} className="ui-button-primary text-sm"><Pencil aria-hidden="true" className="size-4" />编辑达人</button>
                <button type="button" data-testid="sync-selected-douyin" onClick={() => handleDouyinSync(selectedTalent.id)} disabled={syncPending || selectedSyncCoolingDown || !selectedDouyinLink} className="ui-button-secondary text-sm">
                  <RefreshCw aria-hidden="true" className={`size-4 ${syncingTalentId === selectedTalent.id ? "animate-spin" : ""}`} />
                  {syncingTalentId === selectedTalent.id ? "正在同步" : selectedSyncCoolingDown ? "同步冷却中" : "立即同步抖音"}
                </button>
              </div>
            </div>

            <div className="grid gap-px bg-[var(--line-soft)] md:grid-cols-3">
              {[
                ["同步状态", selectedSyncPresentation.label],
                ["粉丝", formatFollowerCount(selectedDouyinStatus?.followerCount)],
                ["未来行程", `${selectedDouyinStatus?.activeScheduleCount ?? 0} 条`]
              ].map(([label, value]) => (
                <div key={label} className="bg-[var(--surface-strong)] px-5 py-4">
                  <p className="text-xs ui-muted">{label}</p>
                  <p className="mt-1 font-mono text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-5 p-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <section className="rounded-[0.9rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">抖音资料</h3>
                      <p className="mt-1 text-xs ui-muted">上次成功：{formatAdminSyncTime(selectedDouyinStatus?.lastSuccessAt)}</p>
                    </div>
                    {selectedDouyinLink ? <a href={selectedDouyinLink.url} target="_blank" rel="noreferrer" className="ui-button-secondary min-h-9 px-3 py-1 text-xs">打开主页</a> : null}
                  </div>
                  {selectedDouyinStatus ? (
                    <dl className="mt-4 grid gap-3 text-sm">
                      <div><dt className="text-xs ui-muted">简介</dt><dd className="mt-1 leading-6">{selectedDouyinStatus.signature || "未读取"}</dd></div>
                      <div><dt className="text-xs ui-muted">主页行程</dt><dd className="mt-1 whitespace-pre-line leading-6">{selectedDouyinStatus.itineraryText || "暂无可识别行程"}</dd></div>
                      {selectedDouyinStatus.lastErrorCode ? <div className="rounded-[0.75rem] bg-[var(--color-danger-soft)] p-3 text-[#96362d]"><dt className="text-xs font-semibold">最近同步异常</dt><dd className="mt-1">{selectedDouyinStatus.lastErrorCode}</dd></div> : null}
                    </dl>
                  ) : <p className="mt-4 text-sm ui-muted">绑定抖音主页并完成首次同步后，这里会显示资料和行程。</p>}
                </section>
              </div>

              <div className="space-y-4">
                <section className="rounded-[0.9rem] border border-[var(--line-soft)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-semibold">最近批量同步</h3><p className="mt-1 text-xs ui-muted">{lastSyncRun ? formatAdminSyncTime(lastSyncRun.finishedAt ?? lastSyncRun.startedAt) : "尚无记录"}</p></div>
                    <button type="button" data-testid="sync-all-douyin" onClick={() => handleDouyinSync()} disabled={syncPending} className="ui-button-secondary min-h-9 px-3 py-1 text-xs">{syncingTalentId === "all" ? "同步中" : "同步全部"}</button>
                  </div>
                  {lastSyncRun ? <p className="mt-3 text-sm">成功 {lastSyncRun.succeededCount} · 跳过 {lastSyncRun.skippedCount} · 失败 {lastSyncRun.failedCount}</p> : null}
                  {lastSyncResults.some((result) => result.status !== "succeeded") ? (
                    <ul className="mt-3 space-y-2 text-xs ui-subtle">
                      {lastSyncResults.filter((result) => result.status !== "succeeded").slice(0, 5).map((result) => {
                        const talentName = result.talentId ? talentMap.get(result.talentId)?.nickname ?? "未知达人" : "未知达人";
                        return <li key={result.id} className="rounded-[0.7rem] bg-[var(--color-danger-soft)] p-2"><strong>{talentName}</strong>：{result.message}</li>;
                      })}
                    </ul>
                  ) : null}
                </section>
              </div>
            </div>
          </div>
        ) : (
          <div className="surface rounded-[var(--radius-panel)] px-6 py-16 text-center"><h2 className="text-xl font-semibold">选择一位达人</h2><p className="mt-2 text-sm ui-muted">从左侧对象索引选择达人，详情会保持在当前视口。</p></div>
        )}
      </section>

      {isEditorOpen ? (
        <AdminDialog
          title={selectedTalent ? `编辑 ${selectedTalent.nickname}` : "新建达人"}
          description="保存与抖音同步分开反馈；只有主页新增或变更时才自动同步。"
          onClose={closeTalentEditor}
          presentation="workspace"
          size="xl"
          closable={false}
          footer={<button type="button" disabled={pending || Boolean(duplicateNicknameTalent)} data-testid="save-talent" onClick={handleSave} className="ui-button-primary text-sm"><Save aria-hidden="true" className="size-4" />{pending ? "保存中" : "保存更改"}</button>}
        >
          <div className="space-y-6">
            {selectedTalent ? <section className="ui-status-spine grid gap-3 rounded-[0.9rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] p-4 pl-5 md:grid-cols-[1fr_auto]" style={{ "--status-color": selectedSyncPresentation.color } as React.CSSProperties}><div><p className="text-sm font-semibold">抖音同步 · {selectedSyncPresentation.label}</p><p className="mt-1 text-xs ui-muted">上次成功：{formatAdminSyncTime(selectedDouyinStatus?.lastSuccessAt)} · 粉丝 {formatFollowerCount(selectedDouyinStatus?.followerCount)} · 行程 {selectedDouyinStatus?.activeScheduleCount ?? 0} 条</p></div><button type="button" data-testid="sync-selected-douyin-editor" onClick={() => handleDouyinSync(selectedTalent.id)} disabled={syncPending || selectedSyncCoolingDown || !selectedDouyinLink} className="ui-button-secondary text-sm"><RefreshCw aria-hidden="true" className={`size-4 ${syncingTalentId === selectedTalent.id ? "animate-spin" : ""}`} />{syncingTalentId === selectedTalent.id ? "正在同步" : selectedSyncCoolingDown ? "同步冷却中" : "立即同步"}</button></section> : null}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-4"><div><p className="ui-kicker">基本资料</p><p className="mt-1 text-sm ui-muted">昵称必填，其他字段可留空。</p></div>{selectedTalent ? <button type="button" onClick={handleDelete} className="ui-button-danger text-sm"><Trash2 aria-hidden="true" className="size-4" />删除达人</button> : null}</div>
              <label className="ui-field-label"><span>昵称 <span className="text-[var(--color-danger)]">*</span></span><input name="nickname" value={draft.nickname} onChange={(event) => setDraft((current) => ({ ...current, nickname: event.target.value }))} className="ui-input" /></label>
              {duplicateNicknameTalent ? <p role="alert" className="text-sm text-[var(--color-danger)]">已存在同名达人“{duplicateNicknameTalent.nickname}”，请更换昵称。</p> : null}
              <label className="ui-field-label"><span>简介</span><textarea name="bio" value={draft.bio} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} rows={4} className="ui-textarea" /></label>
              <label className="ui-field-label"><span>别名 / 英文名</span><input name="aliases" value={draft.aliases} onChange={(event) => setDraft((current) => ({ ...current, aliases: event.target.value }))} className="ui-input" /><span className="ui-field-help">支持中英文逗号分隔。</span></label>
            </section>

            <section className="space-y-4 border-t border-[var(--line-soft)] pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="ui-kicker">抖音资料</p><p className="mt-1 text-sm ui-muted">粘贴主页链接或完整分享文案。</p></div><button type="button" data-testid="open-douyin-search" onClick={openDouyinSearch} disabled={!draft.nickname.trim()} className="ui-button-secondary text-sm">打开抖音搜索</button></div>
              <label className="ui-field-label"><span>抖音主页</span><textarea name="douyinProfileUrl" value={draft.douyinProfileUrl} onChange={(event) => setDraft((current) => ({ ...current, douyinProfileUrl: event.target.value }))} rows={2} className="ui-textarea" /><span className="ui-field-help">清空后会停止公开展示历史同步资料，但保留历史用于恢复。</span></label>
            </section>

            <section className="space-y-4 border-t border-[var(--line-soft)] pt-6"><div><p className="ui-kicker">封面图片</p><p className="mt-1 text-sm ui-muted">替换、重新取景或清空当前图片。</p></div><InlineAssetUpload kind="talent_cover" dataTestId="talent-cover-upload" currentAsset={draft.coverAssetId ? (assetMap.get(draft.coverAssetId) ?? null) : null} onClear={handleClearCover} onUploaded={handleCoverUploaded} /></section>

            <section className="space-y-4 border-t border-[var(--line-soft)] pt-6">
              <div className="flex items-center justify-between gap-3"><div><p className="ui-kicker">平台链接</p><p className="mt-1 text-sm ui-muted">抖音主页在上一分区维护。</p></div><button type="button" onClick={addLinkRow} className="ui-button-secondary text-sm"><Plus aria-hidden="true" className="size-4" />添加链接</button></div>
              {draft.links.length ? draft.links.map((link, index) => <div key={link.id} className="grid gap-3 rounded-[0.9rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] p-3 md:grid-cols-[0.8fr_1.5fr_auto]"><label className="ui-field-label"><span>平台名称</span><input value={link.label} onChange={(event) => updateLink(index, { label: event.target.value })} className="ui-input" /></label><label className="ui-field-label"><span>链接</span><input value={link.url} onChange={(event) => updateLink(index, { url: event.target.value })} placeholder="https://" className="ui-input" /></label><button type="button" onClick={() => removeLinkRow(index)} className="ui-button-danger self-end text-sm">删除</button></div>) : <p className="rounded-[0.9rem] border border-dashed border-[var(--line-strong)] p-4 text-sm ui-muted">尚未添加其他平台链接。</p>}
            </section>

            <section className="space-y-4 border-t border-[var(--line-soft)] pt-6">
              <div className="flex items-center justify-between gap-3"><div><p className="ui-kicker">代表图</p><p className="mt-1 text-sm ui-muted">可拖拽，也可使用上下移动按钮调整顺序。</p></div><button type="button" onClick={addRepresentationRow} className="ui-button-secondary text-sm"><Plus aria-hidden="true" className="size-4" />添加代表图</button></div>
              {draft.representations.length ? <div className="space-y-4" onDragOver={(event) => event.preventDefault()} onDrop={handleRepresentationDropToEnd}>{draft.representations.map((representation, index) => <div key={representation.id} data-testid={`representation-row-${index}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); handleRepresentationDrop(representation.id); }} className="rounded-[0.9rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] p-4"><div data-testid={`representation-drop-${index}`} className="sr-only" /><div className="grid gap-3 md:grid-cols-[auto_1fr_auto]"><div data-testid={`representation-handle-${index}`} draggable onDragStart={(event) => { event.dataTransfer.setData("text/plain", representation.id); event.dataTransfer.effectAllowed = "move"; setDraggingRepresentationId(representation.id); }} onDragEnd={() => setDraggingRepresentationId(null)} className="flex min-h-11 cursor-grab items-center gap-2 rounded-[0.8rem] border border-[var(--line-strong)] px-3 text-xs ui-muted"><GripVertical aria-hidden="true" className="size-4" />拖动</div><label className="ui-field-label"><span>图片标题</span><input data-testid={`representation-title-${index}`} value={representation.title} onChange={(event) => updateRepresentation(index, { title: event.target.value })} className="ui-input" /></label><div className="flex items-end gap-2"><button type="button" aria-label={`上移代表图 ${index + 1}`} onClick={() => moveRepresentation(representation.id, index - 1)} disabled={index === 0} className="ui-button-secondary px-3"><ArrowUp aria-hidden="true" className="size-4" /></button><button type="button" aria-label={`下移代表图 ${index + 1}`} onClick={() => moveRepresentation(representation.id, index + 1)} disabled={index === draft.representations.length - 1} className="ui-button-secondary px-3"><ArrowDown aria-hidden="true" className="size-4" /></button><button type="button" onClick={() => removeRepresentationRow(index)} className="ui-button-danger text-sm"><Trash2 aria-hidden="true" className="size-4" />删除</button></div></div><div className="mt-3"><InlineAssetUpload kind="talent_representation" dataTestId={`talent-representation-upload-${index}`} currentAsset={representation.assetId ? (assetMap.get(representation.assetId) ?? null) : null} onClear={() => handleClearRepresentation(index)} onUploaded={(asset) => handleRepresentationUploaded(index, asset)} /></div></div>)}</div> : <p className="rounded-[0.9rem] border border-dashed border-[var(--line-strong)] p-4 text-sm ui-muted">当前没有代表图。</p>}
            </section>
            {message ? <p role="status" className="rounded-[0.8rem] bg-[var(--color-warning-soft)] p-3 text-sm">{message}</p> : null}
          </div>
        </AdminDialog>
      ) : null}
    </div>
  );
}
