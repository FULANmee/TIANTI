import { createArchiveDraft, createLineupDrafts } from "@/components/admin/archive-manager-utils";
import type { EditorArchive, Event, EventLineup } from "@/modules/domain/types";

describe("archive manager utils", () => {
  it("normalizes saved archive entry dates back to date input values", () => {
    const archives: EditorArchive[] = [
      {
        id: "archive-1",
        editorId: "editor-1",
        eventId: "event-1",
        updatedAt: "2026-04-19T00:00:00.000Z",
        entries: [
          {
            id: "entry-1",
            talentId: "talent-1",
            entryDate: "2026-04-18T12:00:00.000Z",
            sceneAssetId: null,
            sharedPhotoAssetId: null,
            cosplayTitle: "Test Role",
            hasSharedPhoto: false
          }
        ]
      }
    ];

    const draft = createArchiveDraft("event-1", archives);

    expect(draft.entries[0]?.entryDate).toBe("2026-04-18");
  });

  it("normalizes lineup status and source out of editable drafts", () => {
    const event: Event = {
      id: "event-1",
      slug: null,
      name: "Test Event",
      aliases: [],
      searchKeywords: [],
      startsAt: "2026-04-18T12:00:00.000Z",
      endsAt: "2026-04-18T12:00:00.000Z",
      city: "",
      venue: "",
      status: "future",
      note: "",
      updatedAt: "2026-04-18T12:00:00.000Z"
    };
    const lineups: EventLineup[] = [
      {
        id: "lineup-1",
        eventId: "event-1",
        talentId: "talent-1",
        lineupDate: "2026-04-18T12:00:00.000Z",
        status: "confirmed",
        source: "Official",
        note: ""
      },
      {
        id: "lineup-2",
        eventId: "event-1",
        talentId: "talent-2",
        lineupDate: "2026-04-18T12:00:00.000Z",
        status: "pending",
        source: "Hint",
        note: ""
      }
    ];

    const draft = createLineupDrafts(event, lineups);

    expect(draft.every((lineup) => lineup.status === "confirmed")).toBe(true);
    expect(draft.find((lineup) => lineup.id === "lineup-1")?.source).toBe("");
    expect(draft.find((lineup) => lineup.id === "lineup-2")?.source).toBe("");
  });
});
