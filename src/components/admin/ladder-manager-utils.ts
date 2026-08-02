import type { EditorLadder } from "@/modules/domain/types";

export function normalizeLadderDraft(value: EditorLadder) {
  return {
    id: value.id,
    subtitle: value.subtitle.trim(),
    tiers: value.tiers.map((tier, index) => ({
      id: tier.id,
      name: tier.name.trim(),
      order: index,
      talentIds: [...tier.talentIds]
    }))
  };
}
