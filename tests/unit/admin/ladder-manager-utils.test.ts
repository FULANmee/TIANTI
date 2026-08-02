import { normalizeLadderDraft } from "@/components/admin/ladder-manager-utils";
import type { EditorLadder } from "@/modules/domain/types";

describe("ladder manager utils", () => {
  it("ignores derived titles and whitespace-only differences", () => {
    const base: EditorLadder = {
      id: "ladder-1",
      editorId: "editor-1",
      title: "旧标题",
      subtitle: "副标题",
      tiers: [{ id: "tier-1", name: "T0", order: 8, talentIds: ["talent-1"] }]
    };
    const equivalent: EditorLadder = {
      ...base,
      title: "编辑者的新派生标题",
      subtitle: " 副标题 ",
      tiers: [{ ...base.tiers[0]!, name: " T0 ", order: 0 }]
    };

    expect(normalizeLadderDraft(equivalent)).toEqual(normalizeLadderDraft(base));
  });

  it("keeps tier and talent ordering significant", () => {
    const base: EditorLadder = {
      id: "ladder-1",
      editorId: "editor-1",
      title: "标题",
      subtitle: "副标题",
      tiers: [
        { id: "tier-1", name: "T0", order: 0, talentIds: ["talent-1", "talent-2"] },
        { id: "tier-2", name: "T1", order: 1, talentIds: [] }
      ]
    };
    const reordered = {
      ...base,
      tiers: [
        { ...base.tiers[0]!, talentIds: ["talent-2", "talent-1"] },
        base.tiers[1]!
      ]
    };

    expect(normalizeLadderDraft(reordered)).not.toEqual(normalizeLadderDraft(base));
  });
});
