import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  deriveEventTemporalStatus,
  getDateOnlyKey,
  getDateRangeDays,
  isValidDateOnlyValue,
  isMultiDayRange,
  toDateOnlyIso
} from "@/lib/date";
import { isSupportedAssetDisplayRatio } from "@/lib/asset-display";
import { slugify } from "@/lib/slug";
import { cleanupUnusedAssets } from "@/modules/assets/cleanup";
import type {
  BulkActionResult,
  EventBulkPayload,
  TalentBulkPayload,
  TalentBulkResponse
} from "@/modules/admin/types";
import { getContentRepository } from "@/modules/repository";

const talentSchema = z.object({
  id: z.string().optional(),
  nickname: z.string().trim().min(1, "达人昵称不能为空。"),
  slug: z.string().nullable().optional(),
  bio: z.string().optional().default(""),
  aliases: z.array(z.string()).optional(),
  searchKeywords: z.array(z.string()).optional(),
  coverAssetId: z.string().nullable().optional(),
  links: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string().optional().default(""),
        url: z.union([z.literal(""), z.string().url()]).optional().default("")
      })
    )
    .default([]),
  representations: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().optional().default(""),
        assetId: z.string().optional().default("")
      })
    )
    .default([]),
  cleanupCandidateAssetIds: z.array(z.string()).optional().default([])
});

const optionalDateOnlySchema = z
  .string()
  .nullable()
  .optional()
  .refine(
    (value) => value == null || value.trim() === "" || isValidDateOnlyValue(value.trim()),
    "请输入有效的日期。"
  );

const eventSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1, "活动名称不能为空。"),
    slug: z.string().nullable().optional(),
    aliases: z.array(z.string()).optional(),
    searchKeywords: z.array(z.string()).optional(),
    startsAt: optionalDateOnlySchema,
    endsAt: optionalDateOnlySchema,
    city: z.string().optional().default(""),
    venue: z.string().optional().default(""),
    status: z.enum(["future", "past"]).optional(),
    note: z.string().optional().default(""),
    lineups: z
      .array(
        z.object({
          id: z.string().optional(),
          talentId: z.string().nullable().optional(),
          lineupDate: optionalDateOnlySchema,
          status: z.enum(["confirmed", "pending"]).optional().default("confirmed"),
          source: z.string().optional().default(""),
          note: z.string().optional().default("")
        })
      )
      .default([])
  })
  .superRefine((input, context) => {
    const startsAt = input.startsAt?.trim() ?? "";
    const endsAt = input.endsAt?.trim() ?? "";

    if (startsAt && endsAt && endsAt < startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "活动结束日期不能早于开始日期。"
      });
    }
  });

const ladderSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  subtitle: z.string().trim().min(1, "天梯副标题不能为空。"),
  tiers: z.array(
    z.object({
      id: z.string(),
      name: z.string().trim().min(1, "梯度名称不能为空。"),
      order: z.number(),
      talentIds: z.array(z.string())
    })
  )
});

const archiveSchema = z.object({
  id: z.string().optional(),
  eventId: z.string(),
  cleanupCandidateAssetIds: z.array(z.string()).optional().default([]),
  entries: z.array(
    z.object({
      id: z.string().optional(),
      talentId: z.string(),
      entryDate: optionalDateOnlySchema,
      sceneAssetId: z.string().nullable().optional(),
      sharedPhotoAssetId: z.string().nullable().optional(),
      cosplayTitle: z.string().optional().default(""),
      hasSharedPhoto: z.boolean(),
      beautyTier: z.number().int().min(0).max(5).nullable().optional().default(null)
    })
  )
});

const assetSchema = z.object({
  kind: z.enum(["talent_cover", "talent_representation", "event_scene", "shared_photo"]),
  title: z.string().trim().min(1, "图片标题不能为空。"),
  alt: z.string().trim().min(1, "图片替代文本不能为空。"),
  url: z.string().url(),
  objectKey: z.string().nullable().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cropX: z.number().min(0).max(1).default(0),
  cropY: z.number().min(0).max(1).default(0),
  cropWidth: z.number().positive().max(1).default(1),
  cropHeight: z.number().positive().max(1).default(1),
  displayAspectWidth: z.union([z.literal(3), z.literal(4)]).optional(),
  displayAspectHeight: z.union([z.literal(3), z.literal(4)]).optional()
}).refine((value) => value.cropX + value.cropWidth <= 1.000001 && value.cropY + value.cropHeight <= 1.000001, {
  message: "图片取景范围无效。"
}).refine((value) =>
  (!value.displayAspectWidth && !value.displayAspectHeight) ||
  value.displayAspectWidth !== value.displayAspectHeight, {
  message: "图片比例仅支持 3:4 或 4:3。"
});

const talentBulkSchema = z.object({
  action: z.literal("delete"),
  ids: z.array(z.string()).min(1)
});

const eventBulkSchema = z.object({
  action: z.literal("delete"),
  ids: z.array(z.string()).min(1)
});

const editorNameSchema = z.object({
  name: z.string().trim().min(1).max(24)
});

function getDerivedLadderTitle(editorName: string) {
  return `${editorName}的天梯榜`;
}

function dedupeIds(ids: string[]) {
  return [...new Set(ids)];
}

function normalizeOptionalSlug(value?: string | null) {
  const trimmedValue = value?.trim() ?? "";
  if (!trimmedValue) {
    return null;
  }

  const normalizedSlug = slugify(trimmedValue);
  return normalizedSlug || null;
}

function normalizeNickname(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function getValidLineupDateKeys(startsAt?: string | null, endsAt?: string | null) {
  const rangeDates = getDateRangeDays(startsAt, endsAt);
  if (rangeDates.length > 0) {
    return rangeDates;
  }

  const fallbackDate = getDateOnlyKey(startsAt) ?? getDateOnlyKey(endsAt);
  return fallbackDate ? [fallbackDate] : [];
}

async function getValidArchiveDateKeys(
  eventId: string
): Promise<{
  event: Awaited<ReturnType<ReturnType<typeof getContentRepository>["getState"]>>["events"][number] | null;
  isMultiDayEvent: boolean;
  validDateKeys: Set<string>;
  lineupTalentIds: Set<string>;
  lineupDateKeysByTalentId: Map<string, Set<string>>;
}> {
  const repository = getContentRepository();
  const state = await repository.getState();
  const event = state.events.find((item) => item.id === eventId) ?? null;
  const eventLineups = state.lineups.filter((lineup) => lineup.eventId === eventId);
  const lineupDateKeysByTalentId = new Map<string, Set<string>>();

  for (const lineup of eventLineups) {
    const current = lineupDateKeysByTalentId.get(lineup.talentId) ?? new Set<string>();
    const dateKey = getDateOnlyKey(lineup.lineupDate);
    if (dateKey) {
      current.add(dateKey);
    }
    lineupDateKeysByTalentId.set(lineup.talentId, current);
  }

  if (!event) {
    return {
      event: null,
      isMultiDayEvent: false,
      validDateKeys: new Set<string>(),
      lineupTalentIds: new Set<string>(),
      lineupDateKeysByTalentId
    };
  }

  return {
    event,
    isMultiDayEvent: isMultiDayRange(event.startsAt ?? null, event.endsAt ?? null),
    validDateKeys: new Set(getValidLineupDateKeys(event.startsAt ?? null, event.endsAt ?? null)),
    lineupTalentIds: new Set(eventLineups.map((lineup) => lineup.talentId)),
    lineupDateKeysByTalentId
  };
}

function formatMissingReason(kind: "达人" | "活动") {
  return `${kind}不存在或已被删除。`;
}

async function ensureUniqueTalentSlug(id: string, slug?: string | null) {
  if (!slug) return;

  const repository = getContentRepository();
  const state = await repository.getState();
  const duplicate = state.talents.find((talent) => talent.slug === slug && talent.id !== id);

  if (duplicate) {
    throw new Error("该达人 slug 已存在，请修改昵称或 slug。");
  }
}

async function ensureUniqueEventSlug(id: string, slug?: string | null) {
  if (!slug) return;

  const repository = getContentRepository();
  const state = await repository.getState();
  const duplicate = state.events.find((event) => event.slug === slug && event.id !== id);

  if (duplicate) {
    throw new Error("该活动 slug 已存在，请修改活动名称或 slug。");
  }
}

async function ensureUniqueTalentNickname(id: string, nickname: string) {
  const repository = getContentRepository();
  const state = await repository.getState();
  const normalizedNickname = normalizeNickname(nickname);
  const duplicate = state.talents.find(
    (talent) => talent.id !== id && normalizeNickname(talent.nickname) === normalizedNickname
  );

  if (duplicate) {
    throw new Error("已存在同名达人，请修改昵称后再保存。");
  }
}

function normalizeTalentLinks(input: z.infer<typeof talentSchema>["links"]) {
  return input
    .map((link) => ({
      id: link.id ?? randomUUID(),
      label: link.label.trim(),
      url: link.url.trim()
    }))
    .filter((link) => link.label && link.url);
}

function normalizeRepresentations(
  input: z.infer<typeof talentSchema>["representations"],
  assetTitleMap: Map<string | null, string>
) {
  return input
    .map((item) => {
      const assetId = item.assetId?.trim() || null;
      const title = item.title?.trim() ?? "";

      if (!assetId) {
        return null;
      }

      return {
        id: item.id ?? randomUUID(),
        title: title || assetTitleMap.get(assetId) || "未命名代表图",
        assetId
      };
    })
    .filter(
      (item): item is { id: string; title: string; assetId: string } => Boolean(item)
    );
}

export async function saveAsset(payload: unknown) {
  const repository = getContentRepository();
  const input = assetSchema.parse(payload);
  if (!isSupportedAssetDisplayRatio(input.kind, input)) {
    throw new Error(input.kind === "talent_representation" ? "代表图仅支持竖版 3:4。" : "图片比例仅支持 3:4 或 4:3。");
  }
  const displayAspectWidth = input.displayAspectWidth ?? (input.width >= input.height ? 4 : 3);
  const displayAspectHeight = input.displayAspectHeight ?? (input.width >= input.height ? 3 : 4);

  return repository.createAsset({
    id: randomUUID(),
    kind: input.kind,
    title: input.title,
    alt: input.alt,
    url: input.url,
    objectKey: input.objectKey ?? null,
    width: input.width,
    height: input.height,
    cropX: input.cropX,
    cropY: input.cropY,
    cropWidth: input.cropWidth,
    cropHeight: input.cropHeight,
    displayAspectWidth,
    displayAspectHeight,
    createdAt: new Date().toISOString()
  });
}

export async function saveEditorName(editorId: string, payload: unknown) {
  const repository = getContentRepository();
  const input = editorNameSchema.parse(payload);

  return repository.updateEditorName(editorId, input.name);
}

export async function saveTalent(payload: unknown) {
  const repository = getContentRepository();
  const input = talentSchema.parse(payload);
  const state = await repository.getState();
  const id = input.id ?? randomUUID();
  const nickname = input.nickname.trim();
  const slug = normalizeOptionalSlug(input.slug);
  const aliases = dedupeIds((input.aliases ?? []).map((item) => item.trim()).filter(Boolean));
  const searchKeywords = dedupeIds(
    [nickname, ...aliases, ...((input.searchKeywords ?? []).map((item) => item.trim()).filter(Boolean))]
  );
  const assetTitleMap = new Map<string | null, string>(state.assets.map((asset) => [asset.id, asset.title]));

  await ensureUniqueTalentSlug(id, slug);
  await ensureUniqueTalentNickname(id, nickname);

  const talent = await repository.upsertTalent({
    id,
    slug,
    nickname,
    bio: input.bio.trim(),
    aliases,
    searchKeywords,
    coverAssetId: input.coverAssetId?.trim() || null,
    links: normalizeTalentLinks(input.links),
    representations: normalizeRepresentations(input.representations, assetTitleMap),
    updatedAt: new Date().toISOString()
  });

  await cleanupUnusedAssets(input.cleanupCandidateAssetIds ?? []);
  return talent;
}

export async function removeTalent(id: string) {
  const repository = getContentRepository();
  const state = await repository.getState();
  const talent = state.talents.find((item) => item.id === id) ?? null;
  const cleanupCandidateAssetIds = [
    talent?.coverAssetId ?? null,
    ...(talent?.representations.map((representation) => representation.assetId ?? null) ?? [])
  ].filter(Boolean) as string[];

  await repository.deleteTalent(id);
  await cleanupUnusedAssets(cleanupCandidateAssetIds);
}

export async function saveEvent(payload: unknown) {
  const repository = getContentRepository();
  const input = eventSchema.parse(payload);
  const state = await repository.getState();
  const id = input.id ?? randomUUID();
  const existingEvent = state.events.find((event) => event.id === id) ?? null;
  const name = input.name.trim();
  const slug = normalizeOptionalSlug(input.slug);
  const startsAt = toDateOnlyIso(input.startsAt?.trim() ?? "") ?? null;
  const endsAt = toDateOnlyIso(input.endsAt?.trim() ?? "") ?? null;
  const isMultiDayEvent = isMultiDayRange(startsAt, endsAt);
  const validLineupDateKeys = new Set(getValidLineupDateKeys(startsAt, endsAt));
  const existingLineupById = new Map(
    state.lineups.filter((lineup) => lineup.eventId === id).map((lineup) => [lineup.id, lineup])
  );
  const derivedStatus =
    startsAt || endsAt
      ? deriveEventTemporalStatus(startsAt, endsAt) === "past"
        ? "past"
        : "future"
      : existingEvent?.status ?? input.status ?? "future";

  await ensureUniqueEventSlug(id, slug);

  const aliases =
    input.aliases === undefined
      ? (existingEvent?.aliases ?? [])
      : dedupeIds(input.aliases.map((item) => item.trim()).filter(Boolean));
  const searchKeywords =
    input.searchKeywords === undefined
      ? (existingEvent?.searchKeywords ?? [])
      : dedupeIds(input.searchKeywords.map((item) => item.trim()).filter(Boolean));

  const lineups = input.lineups
    .filter((lineup) => lineup.talentId?.trim())
    .map((lineup) => {
      const lineupDate = toDateOnlyIso(lineup.lineupDate?.trim() ?? "") ?? null;
      const lineupDateKey = getDateOnlyKey(lineupDate);

      if (isMultiDayEvent && !lineupDate) {
        throw new Error("多日活动的每条达人阵容都必须选择所属日期。");
      }

      if (lineupDateKey && validLineupDateKeys.size > 0 && !validLineupDateKeys.has(lineupDateKey)) {
        throw new Error("达人阵容的所属日期必须落在活动开始和结束日期之间。");
      }

      const lineupId = lineup.id ?? randomUUID();
      const existingLineup = existingLineupById.get(lineupId);
      const preservesAutomaticIdentity = Boolean(
        existingLineup?.source.startsWith("douyin:") &&
          existingLineup.talentId === lineup.talentId!.trim() &&
          getDateOnlyKey(existingLineup.lineupDate) === getDateOnlyKey(lineupDate)
      );
      return {
        id: lineupId,
        eventId: id,
        talentId: lineup.talentId!.trim(),
        lineupDate,
        status: "confirmed" as const,
        source: existingLineup?.source.startsWith("douyin:")
          ? preservesAutomaticIdentity
            ? existingLineup.source
            : ""
          : "",
        note: lineup.note.trim()
      };
    });

  const event = await repository.upsertEvent({
    id,
    slug,
    name,
    aliases,
    searchKeywords,
    startsAt,
    endsAt,
    city: input.city.trim(),
    venue: input.venue.trim(),
    status: derivedStatus,
    note: input.note.trim(),
    updatedAt: new Date().toISOString(),
    origin: existingEvent?.origin === "douyin_merged" ? "douyin_merged" : "manual"
  });

  await repository.replaceEventLineup(id, lineups);
  const removedDouyinEntryIds = [...existingLineupById.values()]
    .filter((lineup) => {
      if (!lineup.source.startsWith("douyin:")) return false;
      const savedLineup = lineups.find((item) => item.id === lineup.id);
      return !savedLineup || savedLineup.source !== lineup.source;
    })
    .map((lineup) => lineup.source.slice("douyin:".length));
  await repository.suppressDouyinScheduleEntries(removedDouyinEntryIds);

  return event;
}

export async function removeEvent(id: string) {
  const repository = getContentRepository();
  const state = await repository.getState();
  const douyinEntryIds = state.lineups
    .filter((lineup) => lineup.eventId === id && lineup.source.startsWith("douyin:"))
    .map((lineup) => lineup.source.slice("douyin:".length));
  const cleanupCandidateAssetIds = state.archives
    .filter((archive) => archive.eventId === id)
    .flatMap((archive) =>
      archive.entries.flatMap((entry) => [entry.sceneAssetId ?? null, entry.sharedPhotoAssetId ?? null])
    )
    .filter(Boolean) as string[];

  await repository.suppressDouyinScheduleEntries(douyinEntryIds);
  await repository.deleteEvent(id);
  await cleanupUnusedAssets(cleanupCandidateAssetIds);
}

export async function saveLadder(editorId: string, payload: unknown) {
  const repository = getContentRepository();
  const input = ladderSchema.parse(payload);
  const state = await repository.getState();
  const editor = state.editors.find((item) => item.id === editorId);

  if (!editor) {
    throw new Error("当前编辑者不存在。");
  }

  return repository.saveLadder({
    ...input,
    title: getDerivedLadderTitle(editor.name),
    editorId,
    tiers: input.tiers.map((tier, index) => ({
      ...tier,
      order: index
    }))
  });
}

export async function saveArchive(editorId: string, payload: unknown) {
  const repository = getContentRepository();
  const input = archiveSchema.parse(payload);
  const { event, isMultiDayEvent, validDateKeys, lineupTalentIds, lineupDateKeysByTalentId } =
    await getValidArchiveDateKeys(input.eventId);

  if (!event) {
    throw new Error("活动不存在或已被删除。");
  }

  const archive = await repository.saveArchive({
    id: input.id ?? randomUUID(),
    editorId,
    eventId: input.eventId,
    updatedAt: new Date().toISOString(),
    entries: input.entries.map((entry) => {
      const entryDate = toDateOnlyIso(entry.entryDate?.trim() ?? "") ?? null;
      const entryDateKey = getDateOnlyKey(entryDate);

      if (!lineupTalentIds.has(entry.talentId)) {
        throw new Error("现场档案只能选择已在当前活动阵容里的达人。");
      }

      if (isMultiDayEvent && !entryDate) {
        throw new Error("多日活动的每条现场档案记录都必须选择所属日期。");
      }

      if (entryDateKey && validDateKeys.size > 0 && !validDateKeys.has(entryDateKey)) {
        throw new Error("现场档案记录的所属日期必须落在活动开始和结束日期之间。");
      }

      if (isMultiDayEvent && entryDateKey && !lineupDateKeysByTalentId.get(entry.talentId)?.has(entryDateKey)) {
        throw new Error("现场档案记录的所属日期必须匹配该达人在活动阵容中的日期。");
      }

      return {
        id: entry.id ?? randomUUID(),
        talentId: entry.talentId,
        entryDate,
        sceneAssetId: entry.sceneAssetId?.trim() || null,
        sharedPhotoAssetId: entry.sharedPhotoAssetId ?? null,
        cosplayTitle: entry.cosplayTitle.trim(),
        hasSharedPhoto: entry.hasSharedPhoto,
        beautyTier: entry.beautyTier ?? null
      };
    })
  });

  await cleanupUnusedAssets(input.cleanupCandidateAssetIds ?? []);
  return archive;
}

export async function saveTalentBulk(payload: unknown): Promise<TalentBulkResponse> {
  const repository = getContentRepository();
  const input = talentBulkSchema.parse(payload) as TalentBulkPayload;
  const ids = dedupeIds(input.ids);
  const state = await repository.getState();
  const talentMap = new Map(state.talents.map((talent) => [talent.id, talent]));
  const blocked: BulkActionResult["blocked"] = [];

  if (input.action === "delete") {
    const succeededIds: string[] = [];

    for (const id of ids) {
      const talent = talentMap.get(id);
      if (!talent) {
        blocked.push({ id, reason: formatMissingReason("达人") });
        continue;
      }

      try {
        await removeTalent(id);
        succeededIds.push(id);
      } catch (error) {
        blocked.push({
          id,
          reason: error instanceof Error ? error.message : "删除失败。"
        });
      }
    }

    return {
      succeededIds,
      blocked
    };
  }

  return { succeededIds: [], blocked };
}

export async function saveEventBulk(payload: unknown): Promise<BulkActionResult> {
  const repository = getContentRepository();
  const input = eventBulkSchema.parse(payload) as EventBulkPayload;
  const ids = dedupeIds(input.ids);
  const state = await repository.getState();
  const eventMap = new Map(state.events.map((event) => [event.id, event]));
  const blocked: BulkActionResult["blocked"] = [];
  const succeededIds: string[] = [];

  for (const id of ids) {
    const event = eventMap.get(id);
    if (!event) {
      blocked.push({ id, reason: formatMissingReason("活动") });
      continue;
    }

    try {
      await removeEvent(id);
      succeededIds.push(id);
    } catch (error) {
      blocked.push({
        id,
        reason: error instanceof Error ? error.message : "删除失败。"
      });
    }
  }

  return {
    succeededIds,
    blocked
  };
}
