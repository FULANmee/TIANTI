import { cleanupOrphanedAssets } from "@/modules/assets/cleanup";
import { saveAsset, saveTalent } from "@/modules/admin/mutations";
import { demoSeedState } from "@/modules/domain/seed";
import { getMockState, setMockState } from "@/modules/repository/mock-store";

describe("asset cleanup", () => {
  beforeEach(() => {
    setMockState(structuredClone(demoSeedState));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes orphaned R2 assets after the grace window", async () => {
    const asset = await saveAsset({
      kind: "talent_cover",
      title: "orphaned cover",
      alt: "orphaned cover",
      url: "https://cdn.example.com/uploads/orphaned-cover.jpg",
      objectKey: "uploads/orphaned-cover.jpg",
      width: 300,
      height: 400
    });

    vi.setSystemTime(new Date("2026-04-17T13:00:00.000Z"));
    const result = await cleanupOrphanedAssets();

    expect(result.deletedAssetIds).toContain(asset.id);
    expect(getMockState().assets.some((item) => item.id === asset.id)).toBe(false);
    expect(getMockState().assetCleanupRuns.at(-1)).toMatchObject({
      status: "completed",
      deletedAssetCount: 1,
      errorCount: 0
    });
    expect(getMockState().assetObjectDeletionJobs).toHaveLength(0);
  });

  it("keeps orphaned assets that are still inside the grace window", async () => {
    const asset = await saveAsset({
      kind: "talent_cover",
      title: "fresh cover",
      alt: "fresh cover",
      url: "https://cdn.example.com/uploads/fresh-cover.jpg",
      objectKey: "uploads/fresh-cover.jpg",
      width: 300,
      height: 400
    });

    const result = await cleanupOrphanedAssets();

    expect(result.deletedAssetIds).not.toContain(asset.id);
    expect(getMockState().assets.some((item) => item.id === asset.id)).toBe(true);
  });

  it("keeps referenced R2 assets even after the grace window", async () => {
    const asset = await saveAsset({
      kind: "talent_cover",
      title: "active cover",
      alt: "active cover",
      url: "https://cdn.example.com/uploads/active-cover.jpg",
      objectKey: "uploads/active-cover.jpg",
      width: 300,
      height: 400
    });

    await saveTalent({
      nickname: "Guardian",
      bio: "",
      mcn: "",
      aliases: [],
      coverAssetId: asset.id,
      links: [],
      representations: []
    });

    vi.setSystemTime(new Date("2026-04-17T13:00:00.000Z"));
    const result = await cleanupOrphanedAssets();

    expect(result.deletedAssetIds).not.toContain(asset.id);
    expect(getMockState().assets.some((item) => item.id === asset.id)).toBe(true);
  });
});
