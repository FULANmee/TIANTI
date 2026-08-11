import { createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { getSeedEditorCredentials } from "@/lib/env";
import { demoSeedState } from "@/modules/domain/seed";
import { getDb } from "@/db/client";
import {
  archiveEntries,
  assets,
  douyinSyncResults,
  douyinSyncRuns,
  editorArchives,
  editors,
  eventLineup,
  eventMergeRuleMembers,
  eventMergeRules,
  events,
  ladderEntries,
  ladders,
  ladderTiers,
  sessions,
  talentAssets,
  talentDouyinProfiles,
  talentDouyinRelatedAccounts,
  talentDouyinScheduleEntries,
  talentLinks,
  talents
} from "@/db/schema";

function toStableUuid(namespace: string, value: string) {
  const chars = createHash("sha256").update(`${namespace}:${value}`).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = "a";

  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars.slice(12, 16).join("")}-${chars
    .slice(16, 20)
    .join("")}-${chars.slice(20, 32).join("")}`;
}

async function buildSeedState() {
  const editorCredentials = getSeedEditorCredentials();
  const [firstPasswordHash, secondPasswordHash] = await Promise.all(
    editorCredentials.map((credential) => hash(credential.password))
  );

  const editorIds = new Map(demoSeedState.editors.map((editor) => [editor.id, toStableUuid("editor", editor.id)]));
  const assetIds = new Map(demoSeedState.assets.map((asset) => [asset.id, toStableUuid("asset", asset.id)]));
  const talentIds = new Map(demoSeedState.talents.map((talent) => [talent.id, toStableUuid("talent", talent.id)]));
  const eventIds = new Map(demoSeedState.events.map((event) => [event.id, toStableUuid("event", event.id)]));
  const mergeRuleIds = new Map(
    demoSeedState.eventMergeRules.map((rule) => [rule.id, toStableUuid("event-merge-rule", rule.id)])
  );
  const mergeRuleMemberIds = new Map(
    demoSeedState.eventMergeRules.flatMap((rule) =>
      rule.members.map((member) => [member.id, toStableUuid("event-merge-rule-member", member.id)])
    )
  );
  const lineupIds = new Map(demoSeedState.lineups.map((lineup) => [lineup.id, toStableUuid("lineup", lineup.id)]));
  const ladderIds = new Map(demoSeedState.ladders.map((ladder) => [ladder.id, toStableUuid("ladder", ladder.id)]));
  const tierIds = new Map(
    demoSeedState.ladders.flatMap((ladder) => ladder.tiers.map((tier) => [tier.id, toStableUuid("tier", tier.id)]))
  );
  const archiveIds = new Map(
    demoSeedState.archives.map((archive) => [archive.id, toStableUuid("archive", archive.id)])
  );
  const archiveEntryIds = new Map(
    demoSeedState.archives.flatMap((archive) =>
      archive.entries.map((entry) => [entry.id, toStableUuid("archive-entry", entry.id)])
    )
  );
  const talentLinkIds = new Map(
    demoSeedState.talents.flatMap((talent) =>
      talent.links.map((link) => [link.id, toStableUuid("talent-link", link.id)])
    )
  );
  const talentRepresentationIds = new Map(
    demoSeedState.talents.flatMap((talent) =>
      talent.representations.map((item) => [item.id, toStableUuid("talent-representation", item.id)])
    )
  );

  return {
    ...demoSeedState,
    editors: demoSeedState.editors.map((editor, index) => ({
      ...editor,
      id: editorIds.get(editor.id)!,
      email: editorCredentials[index]?.email ?? editor.email,
      passwordHash: index === 0 ? firstPasswordHash : secondPasswordHash
    })),
    assets: demoSeedState.assets.map((asset) => ({
      ...asset,
      id: assetIds.get(asset.id)!
    })),
    talents: demoSeedState.talents.map((talent) => ({
      ...talent,
      id: talentIds.get(talent.id)!,
      coverAssetId: talent.coverAssetId ? assetIds.get(talent.coverAssetId) ?? null : null,
      links: talent.links.map((link) => ({
        ...link,
        id: talentLinkIds.get(link.id)!
      })),
      representations: talent.representations.map((representation) => ({
        ...representation,
        id: talentRepresentationIds.get(representation.id)!,
        assetId: representation.assetId ? assetIds.get(representation.assetId) ?? null : null
      }))
    })),
    events: demoSeedState.events.map((event) => ({
      ...event,
      id: eventIds.get(event.id)!
    })),
    eventMergeRules: demoSeedState.eventMergeRules.map((rule) => ({
      ...rule,
      id: mergeRuleIds.get(rule.id)!,
      targetEventId: eventIds.get(rule.targetEventId)!,
      members: rule.members.map((member) => ({
        ...member,
        id: mergeRuleMemberIds.get(member.id)!,
        talentId: talentIds.get(member.talentId)!
      }))
    })),
    lineups: demoSeedState.lineups.map((lineup) => ({
      ...lineup,
      id: lineupIds.get(lineup.id)!,
      eventId: eventIds.get(lineup.eventId)!,
      talentId: talentIds.get(lineup.talentId)!
    })),
    ladders: demoSeedState.ladders.map((ladder) => ({
      ...ladder,
      id: ladderIds.get(ladder.id)!,
      editorId: editorIds.get(ladder.editorId)!,
      tiers: ladder.tiers.map((tier) => ({
        ...tier,
        id: tierIds.get(tier.id)!,
        talentIds: tier.talentIds.map((talentId) => talentIds.get(talentId)!)
      }))
    })),
    archives: demoSeedState.archives.map((archive) => ({
      ...archive,
      id: archiveIds.get(archive.id)!,
      editorId: editorIds.get(archive.editorId)!,
      eventId: eventIds.get(archive.eventId)!,
      entries: archive.entries.map((entry) => ({
        ...entry,
        id: archiveEntryIds.get(entry.id)!,
        talentId: talentIds.get(entry.talentId)!,
        sceneAssetId: entry.sceneAssetId ? assetIds.get(entry.sceneAssetId) ?? null : null,
        sharedPhotoAssetId: entry.sharedPhotoAssetId ? assetIds.get(entry.sharedPhotoAssetId)! : null
      }))
    }))
  };
}

async function main() {
  const db = getDb();
  const state = await buildSeedState();

  await db.delete(sessions);
  await db.delete(douyinSyncResults);
  await db.delete(douyinSyncRuns);
  await db.delete(talentDouyinScheduleEntries);
  await db.delete(talentDouyinRelatedAccounts);
  await db.delete(talentDouyinProfiles);
  await db.delete(archiveEntries);
  await db.delete(editorArchives);
  await db.delete(eventMergeRuleMembers);
  await db.delete(eventMergeRules);
  await db.delete(ladderEntries);
  await db.delete(ladderTiers);
  await db.delete(ladders);
  await db.delete(eventLineup);
  await db.delete(events);
  await db.delete(talentAssets);
  await db.delete(talentLinks);
  await db.delete(talents);
  await db.delete(assets);
  await db.delete(editors);

  await db.insert(editors).values(state.editors);
  await db.insert(assets).values(
    state.assets.map((asset) => ({
      ...asset,
      createdAt: asset.createdAt ? new Date(asset.createdAt) : new Date()
    }))
  );
  await db.insert(talents).values(
    state.talents.map((talent) => ({
      id: talent.id,
      slug: talent.slug,
      nickname: talent.nickname,
      bio: talent.bio,
      aliases: talent.aliases,
      searchKeywords: talent.searchKeywords,
      coverAssetId: talent.coverAssetId,
      updatedAt: new Date(talent.updatedAt)
    }))
  );
  await db.insert(talentLinks).values(
    state.talents.flatMap((talent) =>
      talent.links.map((link, index) => ({
        id: link.id,
        talentId: talent.id,
        label: link.label,
        url: link.url,
        sortOrder: index
      }))
    )
  );
  await db.insert(talentAssets).values(
    state.talents.flatMap((talent) =>
      talent.representations.map((representation, index) => ({
        id: representation.id,
        talentId: talent.id,
        assetId: representation.assetId,
        role: "representation",
        label: representation.title,
        sortOrder: index
      }))
    )
  );
  await db.insert(events).values(
    state.events.map((event) => ({
      id: event.id,
      slug: event.slug,
      name: event.name,
      aliases: event.aliases,
      searchKeywords: event.searchKeywords,
      startsAt: event.startsAt ? new Date(event.startsAt) : null,
      endsAt: event.endsAt ? new Date(event.endsAt) : null,
      city: event.city,
      venue: event.venue,
      status: event.status,
      note: event.note,
      origin: event.origin ?? "manual",
      updatedAt: new Date(event.updatedAt)
    }))
  );
  if (state.eventMergeRules.length > 0) {
    await db.insert(eventMergeRules).values(
      state.eventMergeRules.map((rule) => ({
        id: rule.id,
        targetEventId: rule.targetEventId,
        createdAt: new Date(rule.createdAt),
        updatedAt: new Date(rule.updatedAt)
      }))
    );
    await db.insert(eventMergeRuleMembers).values(
      state.eventMergeRules.flatMap((rule) =>
        rule.members.map((member) => ({
          id: member.id,
          ruleId: rule.id,
          sourceEntryId: member.sourceEntryId,
          talentId: member.talentId,
          city: member.city,
          normalizedName: member.normalizedName,
          startsAt: new Date(member.startsAt),
          endsAt: new Date(member.endsAt),
          lastSeenAt: new Date(member.lastSeenAt)
        }))
      )
    );
  }
  await db.insert(eventLineup).values(
    state.lineups.map((lineup) => ({
      ...lineup,
      lineupDate: lineup.lineupDate ? new Date(lineup.lineupDate) : null
    }))
  );
  await db.insert(ladders).values(
    state.ladders.map((ladder) => ({
      id: ladder.id,
      editorId: ladder.editorId,
      title: ladder.title,
      subtitle: ladder.subtitle
    }))
  );
  await db.insert(ladderTiers).values(
    state.ladders.flatMap((ladder) =>
      ladder.tiers.map((tier) => ({
        id: tier.id,
        ladderId: ladder.id,
        name: tier.name,
        sortOrder: tier.order
      }))
    )
  );
  await db.insert(ladderEntries).values(
    state.ladders.flatMap((ladder) =>
      ladder.tiers.flatMap((tier) =>
        tier.talentIds.map((talentId, index) => ({
          id: toStableUuid("ladder-entry", `${tier.id}:${talentId}`),
          tierId: tier.id,
          talentId,
          sortOrder: index
        }))
      )
    )
  );
  await db.insert(editorArchives).values(
    state.archives.map((archive) => ({
      id: archive.id,
      editorId: archive.editorId,
      eventId: archive.eventId,
      note: archive.note,
      updatedAt: new Date(archive.updatedAt)
    }))
  );
  await db.insert(archiveEntries).values(
    state.archives.flatMap((archive) =>
      archive.entries.map((entry) => ({
        id: entry.id,
        archiveId: archive.id,
        talentId: entry.talentId,
        entryDate: entry.entryDate ? new Date(entry.entryDate) : null,
        sceneAssetId: entry.sceneAssetId,
        sharedPhotoAssetId: entry.sharedPhotoAssetId ?? null,
        cosplayTitle: entry.cosplayTitle,
        hasSharedPhoto: entry.hasSharedPhoto
      }))
    )
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        editors: state.editors.length,
        talents: state.talents.length,
        events: state.events.length,
        ladders: state.ladders.length,
        archives: state.archives.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
