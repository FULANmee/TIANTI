import { normalizeTalentDraft } from "@/components/admin/talent-manager-utils";

describe("talent manager utils", () => {
  it("compares semantic draft values without client-only row ids or whitespace noise", () => {
    const base = {
      id: "talent-1",
      nickname: "青鸾",
      bio: "简介",
      douyinProfileUrl: "https://www.douyin.com/user/account",
      aliases: "Qingluan",
      coverAssetId: "asset-1",
      representations: [{ id: "persisted-rep", title: "代表作", assetId: "asset-2" }]
    };
    const equivalent = {
      ...base,
      nickname: " 青鸾 ",
      representations: [{ id: "client-rep", title: " 代表作 ", assetId: "asset-2" }]
    };

    expect(normalizeTalentDraft(equivalent)).toEqual(normalizeTalentDraft(base));
  });

  it("ignores rows that the server would discard", () => {
    const normalized = normalizeTalentDraft({
      nickname: "New",
      bio: "",
      douyinProfileUrl: "",
      aliases: "",
      coverAssetId: "",
      representations: [{ title: "Title only", assetId: "" }]
    });

    expect(normalized.representations).toEqual([]);
  });
});
