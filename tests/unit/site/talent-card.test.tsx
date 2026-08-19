import { renderToStaticMarkup } from "react-dom/server";
import { TalentCard } from "../../../src/components/site/talent-card";
import type { TalentSummary } from "../../../src/modules/domain/types";

function talent(overrides: Partial<TalentSummary> = {}): TalentSummary {
  return {
    id: "talent-test",
    slug: null,
    nickname: "测试达人",
    bio: "原始简介",
    bioPreviewLine: "原始简介",
    aliases: [],
    cover: null,
    recentHint: null,
    futureLocationHint: null,
    hasFutureEvent: false,
    archiveCount: 0,
    ...overrides
  };
}

describe("TalentCard", () => {
  it("keeps itinerary and bio inside the same fixed-height copy area", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <TalentCard talent={talent({ futureLocationHint: "深圳 · 未来行程" })} />
    );

    const copy = document.querySelector('[data-testid="talent-card-copy-talent-test"]');
    expect(copy?.className).toContain("h-[6.25rem]");
    expect(copy?.textContent).toContain("深圳 · 未来行程");
    expect(copy?.textContent).toContain("原始简介");
    expect(document.querySelector('[data-testid="talent-future-hint-talent-test"]')?.className).toContain("text-[0.68rem]");
  });
});
