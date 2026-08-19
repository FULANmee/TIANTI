import "server-only";

import { getMockState, setMockState, toContentState, toEditorProfile } from "@/modules/repository/mock-store";
import type { ContentRepository, EventMergePersistenceInput } from "@/modules/repository/types";
import type { EditorProfile, RepositoryState } from "@/modules/domain/types";

function replaceState(mutator: (state: RepositoryState) => RepositoryState) {
  const current = getMockState();
  const next = mutator(structuredClone(current));
  setMockState(next);
  return next;
}

function isAssetReferenced(state: RepositoryState, assetId: string) {
  return state.talents.some(
    (talent) =>
      talent.coverAssetId === assetId ||
      talent.representations.some((representation) => representation.assetId === assetId)
  ) ||
    state.archives.some((archive) =>
      archive.entries.some(
        (entry) => entry.sceneAssetId === assetId || entry.sharedPhotoAssetId === assetId
      )
    );
}

function pruneDouyinAudit(state: RepositoryState) {
  const retainedRuns = [...state.douyinSyncRuns]
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    .slice(0, 100);
  const retainedRunIds = new Set(retainedRuns.map((run) => run.id));
  state.douyinSyncRuns = retainedRuns;
  state.douyinSyncResults = state.douyinSyncResults.filter((result) => retainedRunIds.has(result.runId));
}

export const mockRepository: ContentRepository = {
  async getState() {
    return toContentState(structuredClone(getMockState()));
  },
  async findEditorByEmail(email) {
    const editor = getMockState().editors.find((item) => item.email.toLowerCase() === email.toLowerCase());
    return editor ? structuredClone(editor) : null;
  },
  async updateEditorName(editorId, name) {
    let nextEditor: EditorProfile | null = null;

    replaceState((state) => {
      const index = state.editors.findIndex((item) => item.id === editorId);
      if (index < 0) {
        throw new Error("当前编辑者不存在。");
      }

      state.editors[index] = {
        ...state.editors[index],
        name
      };
      nextEditor = toEditorProfile(state.editors[index]);
      return state;
    });

    if (!nextEditor) {
      throw new Error("当前编辑者不存在。");
    }

    return nextEditor;
  },
  async createSession(session) {
    replaceState((state) => {
      state.sessions = state.sessions.filter((item) => item.id !== session.id);
      state.sessions.push(session);
      return state;
    });
  },
  async getSessionByTokenHash(tokenHash) {
    const session = getMockState().sessions.find((item) => item.tokenHash === tokenHash);
    return session ? structuredClone(session) : null;
  },
  async deleteSessionByTokenHash(tokenHash) {
    replaceState((state) => {
      state.sessions = state.sessions.filter((item) => item.tokenHash !== tokenHash);
      return state;
    });
  },
  async createAsset(asset) {
    replaceState((state) => {
      const index = state.assets.findIndex((item) => item.id === asset.id);
      if (index >= 0) {
        state.assets[index] = asset;
      } else {
        state.assets.push(asset);
      }
      return state;
    });
    return asset;
  },
  async updateAssetFraming(id, framing) {
    let updated = null as RepositoryState["assets"][number] | null;
    replaceState((state) => {
      const index = state.assets.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("素材不存在。");
      state.assets[index] = { ...state.assets[index], ...framing };
      updated = state.assets[index];
      return state;
    });
    return structuredClone(updated!);
  },
  async deleteAssetIfUnreferenced(id, objectKey) {
    if (isAssetReferenced(getMockState(), id)) {
      return false;
    }

    replaceState((state) => {
      if (isAssetReferenced(state, id)) {
        return state;
      }

      state.assets = state.assets.filter((item) => item.id !== id);
      if (objectKey && !state.assetObjectDeletionJobs.some((job) => job.objectKey === objectKey)) {
        const now = new Date().toISOString();
        state.assetObjectDeletionJobs.push({ objectKey, assetId: id, attempts: 0, lastError: null, createdAt: now, updatedAt: now });
      }
      return state;
    });

    return !getMockState().assets.some((asset) => asset.id === id);
  },
  async listAssetObjectDeletionJobs(limit) {
    return structuredClone(getMockState().assetObjectDeletionJobs.slice(0, limit));
  },
  async completeAssetObjectDeletionJob(objectKey) {
    replaceState((state) => {
      state.assetObjectDeletionJobs = state.assetObjectDeletionJobs.filter((job) => job.objectKey !== objectKey);
      return state;
    });
  },
  async failAssetObjectDeletionJob(objectKey, message) {
    replaceState((state) => {
      state.assetObjectDeletionJobs = state.assetObjectDeletionJobs.map((job) => job.objectKey === objectKey
        ? { ...job, attempts: job.attempts + 1, lastError: message, updatedAt: new Date().toISOString() }
        : job);
      return state;
    });
  },
  async saveAssetCleanupRun(run) {
    replaceState((state) => {
      const index = state.assetCleanupRuns.findIndex((item) => item.id === run.id);
      if (index >= 0) state.assetCleanupRuns[index] = run;
      else state.assetCleanupRuns.push(run);
      return state;
    });
  },
  async upsertTalent(talent) {
    replaceState((state) => {
      const index = state.talents.findIndex((item) => item.id === talent.id);
      if (index >= 0) {
        state.talents[index] = talent;
      } else {
        state.talents.push(talent);
      }
      return state;
    });
    return talent;
  },
  async deleteTalent(id) {
    replaceState((state) => {
      state.talents = state.talents.filter((item) => item.id !== id);
      state.lineups = state.lineups.filter((item) => item.talentId !== id);
      state.ladders = state.ladders.map((ladder) => ({
        ...ladder,
        tiers: ladder.tiers.map((tier) => ({
          ...tier,
          talentIds: tier.talentIds.filter((talentId) => talentId !== id)
        }))
      }));
      state.archives = state.archives.map((archive) => ({
        ...archive,
        entries: archive.entries.filter((entry) => entry.talentId !== id)
      }));
      state.douyinProfiles = state.douyinProfiles.filter((profile) => profile.talentId !== id);
      state.douyinRelatedAccounts = state.douyinRelatedAccounts.filter((account) => account.talentId !== id);
      state.douyinScheduleEntries = state.douyinScheduleEntries.filter((entry) => entry.talentId !== id);
      state.eventMergeRules = state.eventMergeRules.map((rule) => ({
        ...rule,
        members: rule.members.filter((member) => member.talentId !== id)
      }));
      state.douyinSyncResults = state.douyinSyncResults.map((result) =>
        result.talentId === id ? { ...result, talentId: null } : result
      );
      return state;
    });
  },
  async upsertEvent(event) {
    replaceState((state) => {
      const index = state.events.findIndex((item) => item.id === event.id);
      if (index >= 0) {
        state.events[index] = event;
      } else {
        state.events.push(event);
      }
      return state;
    });
    return event;
  },
  async mergeEvents(input: EventMergePersistenceInput) {
    replaceState((state) => {
      const deletedEventIds = new Set(input.deletedEventIds);
      const scheduleEntryIds = new Set(input.scheduleEntryIds);
      const deletedRuleIds = new Set(input.deletedMergeRuleIds);
      const targetExists = state.events.some((event) => event.id === input.targetEvent.id);
      const allSelectedEventIds = new Set([input.targetEvent.id, ...input.deletedEventIds]);

      if (!targetExists || input.deletedEventIds.some((id) => id === input.targetEvent.id)) {
        throw new Error("合并目标活动不存在或不合法。");
      }
      if (input.deletedEventIds.some((id) => !state.events.some((event) => event.id === id))) {
        throw new Error("待合并活动已不存在，请刷新后重试。");
      }

      const eventIndex = state.events.findIndex((event) => event.id === input.targetEvent.id);
      state.events[eventIndex] = structuredClone(input.targetEvent);
      state.lineups = [
        ...state.lineups.filter((lineup) => !allSelectedEventIds.has(lineup.eventId)),
        ...structuredClone(input.lineups)
      ];
      state.archives = [
        ...state.archives.filter((archive) => !allSelectedEventIds.has(archive.eventId)),
        ...structuredClone(input.archives)
      ];
      state.douyinScheduleEntries = state.douyinScheduleEntries.map((entry) =>
        scheduleEntryIds.has(entry.id) ? { ...entry, eventId: input.targetEvent.id } : entry
      );
      state.events = state.events.filter((event) => !deletedEventIds.has(event.id));
      state.douyinScheduleEntries = state.douyinScheduleEntries.map((entry) =>
        entry.eventId && deletedEventIds.has(entry.eventId) ? { ...entry, eventId: null } : entry
      );
      state.eventMergeRules = [
        ...state.eventMergeRules.filter((rule) => !deletedRuleIds.has(rule.id)),
        ...structuredClone(input.mergeRules)
      ];
      return state;
    });
  },
  async replaceEventLineup(eventId, nextLineups) {
    replaceState((state) => {
      const unrelated = state.lineups.filter((item) => item.eventId !== eventId);
      state.lineups = [...unrelated, ...nextLineups.filter((item) => item.eventId === eventId)];
      return state;
    });
  },
  async saveDouyinSyncState(input) {
    replaceState((state) => {
      const suppressedEntryById = new Map(
        state.douyinScheduleEntries
          .filter((entry) => entry.state === "suppressed")
          .map((entry) => [entry.id, entry])
      );
      const scheduleEntries = input.scheduleEntries.map(
        (entry) => suppressedEntryById.get(entry.id) ?? structuredClone(entry)
      );
      const suppressedEntryIds = new Set(suppressedEntryById.keys());
      const sourceLineups = input.sourceLineups.filter((lineup) => {
        const entryId = lineup.source.startsWith("douyin:")
          ? lineup.source.slice("douyin:".length)
          : null;
        return !entryId || !suppressedEntryIds.has(entryId);
      });

      state.douyinProfiles = structuredClone(input.profiles);
      state.douyinFollowerSnapshots.push(...structuredClone(input.followerSnapshots));
      state.douyinRelatedAccounts = structuredClone(input.relatedAccounts);
      state.douyinScheduleEntries = scheduleEntries;
      const nextMergeRules = [...state.eventMergeRules];
      for (const rule of input.eventMergeRules) {
        const ruleIndex = nextMergeRules.findIndex((item) => item.id === rule.id);
        if (ruleIndex >= 0) {
          const currentRule = nextMergeRules[ruleIndex];
          const membersById = new Map(currentRule.members.map((member) => [member.id, member]));
          for (const member of rule.members) {
            membersById.set(member.id, structuredClone(member));
          }
          nextMergeRules[ruleIndex] = {
            ...currentRule,
            ...structuredClone(rule),
            members: [...membersById.values()].sort((left, right) => left.id.localeCompare(right.id))
          };
        } else {
          nextMergeRules.push(structuredClone(rule));
        }
      }
      state.eventMergeRules = nextMergeRules.filter((rule) =>
        state.events.some((event) => event.id === rule.targetEventId)
      );

      for (const event of input.upsertEvents) {
        const eventIndex = state.events.findIndex((item) => item.id === event.id);
        if (eventIndex >= 0) {
          const existingEvent = state.events[eventIndex];
          if (event.origin === "douyin_merged") {
            if (existingEvent.origin === "douyin_merged") {
              state.events[eventIndex] = {
                ...existingEvent,
                startsAt: event.startsAt,
                endsAt: event.endsAt,
                status: event.status,
                updatedAt: event.updatedAt,
                origin: "douyin_merged"
              };
            }
          } else if (existingEvent.origin === "douyin_sync") {
            state.events[eventIndex] = structuredClone(event);
          }
        } else if (event.origin === "douyin_merged") {
          throw new Error("抖音合并目标活动不存在，请刷新后重试。");
        } else {
          state.events.push(structuredClone(event));
        }
      }

      state.lineups = [
        ...state.lineups.filter((lineup) => !lineup.source.startsWith("douyin:")),
        ...structuredClone(sourceLineups)
      ];
      const cleanupCandidateEventIds = new Set([
        ...input.deleteSyncEventIds,
        ...input.upsertEvents.map((event) => event.id)
      ]);
      const deleteEventIds = new Set(
        state.events
          .filter(
            (event) =>
              cleanupCandidateEventIds.has(event.id) &&
              event.origin === "douyin_sync" &&
              !state.lineups.some((lineup) => lineup.eventId === event.id) &&
              !state.archives.some((archive) => archive.eventId === event.id)
          )
          .map((event) => event.id)
      );
      state.events = state.events.filter((event) => !deleteEventIds.has(event.id));
      state.douyinScheduleEntries = state.douyinScheduleEntries.map((entry) =>
        entry.eventId && deleteEventIds.has(entry.eventId) ? { ...entry, eventId: null } : entry
      );

      const runIndex = state.douyinSyncRuns.findIndex((run) => run.id === input.syncRun.id);
      if (runIndex >= 0) {
        state.douyinSyncRuns[runIndex] = structuredClone(input.syncRun);
      } else {
        state.douyinSyncRuns.push(structuredClone(input.syncRun));
      }
      state.douyinSyncResults = [
        ...state.douyinSyncResults.filter((result) => result.runId !== input.syncRun.id),
        ...structuredClone(input.syncResults)
      ];
      pruneDouyinAudit(state);
      return state;
    });
  },
  async tryStartDouyinSyncRun(run, staleBefore) {
    let acquired = false;
    replaceState((state) => {
      state.douyinSyncRuns = state.douyinSyncRuns.map((item) =>
        item.status === "running" && item.startedAt < staleBefore
          ? { ...item, status: "failed", finishedAt: run.startedAt }
          : item
      );
      if (state.douyinSyncRuns.some((item) => item.status === "running")) {
        return state;
      }
      state.douyinSyncRuns.push(structuredClone(run));
      acquired = true;
      return state;
    });
    return acquired;
  },
  async finishDouyinSyncRun(run, results) {
    replaceState((state) => {
      const runIndex = state.douyinSyncRuns.findIndex((item) => item.id === run.id);
      if (runIndex >= 0) {
        state.douyinSyncRuns[runIndex] = structuredClone(run);
      } else {
        state.douyinSyncRuns.push(structuredClone(run));
      }
      state.douyinSyncResults = [
        ...state.douyinSyncResults.filter((result) => result.runId !== run.id),
        ...structuredClone(results)
      ];
      pruneDouyinAudit(state);
      return state;
    });
  },
  async suppressDouyinScheduleEntries(entryIds) {
    const entryIdSet = new Set(entryIds);
    replaceState((state) => {
      state.douyinScheduleEntries = state.douyinScheduleEntries.map((entry) =>
        entryIdSet.has(entry.id) ? { ...entry, state: "suppressed" } : entry
      );
      state.lineups = state.lineups.filter((lineup) => {
        const entryId = lineup.source.startsWith("douyin:") ? lineup.source.slice("douyin:".length) : null;
        return !entryId || !entryIdSet.has(entryId);
      });
      return state;
    });
  },
  async deleteEvent(id) {
    replaceState((state) => {
      state.events = state.events.filter((item) => item.id !== id);
      state.lineups = state.lineups.filter((item) => item.eventId !== id);
      state.archives = state.archives.filter((item) => item.eventId !== id);
      state.eventMergeRules = state.eventMergeRules.filter((rule) => rule.targetEventId !== id);
      state.douyinScheduleEntries = state.douyinScheduleEntries.map((entry) =>
        entry.eventId === id ? { ...entry, eventId: null } : entry
      );
      return state;
    });
  },
  async saveLadder(ladder) {
    replaceState((state) => {
      const index = state.ladders.findIndex((item) => item.id === ladder.id);
      if (index >= 0) {
        state.ladders[index] = ladder;
      } else {
        state.ladders.push(ladder);
      }
      return state;
    });
    return ladder;
  },
  async saveArchive(archive) {
    replaceState((state) => {
      const index = state.archives.findIndex((item) => item.id === archive.id);
      if (index >= 0) {
        state.archives[index] = archive;
      } else {
        state.archives.push(archive);
      }
      return state;
    });
    return archive;
  }
};
