import sitemap from "@/app/sitemap";
import { getEventPath } from "@/lib/public-path";
import { demoSeedState } from "@/modules/domain/seed";
import { setMockState } from "@/modules/repository/mock-store";

describe("sitemap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const state = structuredClone(demoSeedState);
    state.events[0] = {
      ...state.events[0]!,
      startsAt: "2026-12-01T12:00:00.000Z",
      endsAt: "2026-12-01T12:00:00.000Z",
      status: "past"
    };
    setMockState(state);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses date-derived event state for change frequency", async () => {
    const targetEvent = demoSeedState.events[0];
    if (!targetEvent) throw new Error("Missing sitemap event fixture");
    const entries = await sitemap();
    const entry = entries.find(({ url }) => url.endsWith(getEventPath(targetEvent)));

    expect(entry?.changeFrequency).toBe("daily");
  });
});
