interface TalentDraftValue {
  id?: string;
  nickname: string;
  bio: string;
  douyinProfileUrl?: string;
  aliases: string;
  coverAssetId: string;
  representations: Array<{ title: string; assetId: string }>;
}

export function splitCommaValues(value: string) {
  return [...new Set(value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))];
}

export function normalizeTalentDraft(value: TalentDraftValue) {
  return {
    id: value.id ?? "",
    nickname: value.nickname.trim(),
    bio: value.bio.trim(),
    douyinProfileUrl: value.douyinProfileUrl?.trim() ?? "",
    aliases: splitCommaValues(value.aliases),
    coverAssetId: value.coverAssetId.trim(),
    representations: value.representations
      .map((item) => ({ title: item.title.trim(), assetId: item.assetId.trim() }))
      .filter((item) => item.assetId)
  };
}
