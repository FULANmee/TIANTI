interface TalentDraftValue {
  id?: string;
  nickname: string;
  bio: string;
  mcn: string;
  douyinProfileUrl?: string;
  aliases: string;
  coverAssetId: string;
  links: Array<{ label: string; url: string }>;
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
    mcn: value.mcn.trim(),
    douyinProfileUrl: value.douyinProfileUrl?.trim() ?? "",
    aliases: splitCommaValues(value.aliases),
    coverAssetId: value.coverAssetId.trim(),
    links: value.links
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.label && link.url),
    representations: value.representations
      .map((item) => ({ title: item.title.trim(), assetId: item.assetId.trim() }))
      .filter((item) => item.assetId)
  };
}
