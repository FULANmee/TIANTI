import { normalizeTalentDraft } from "@/components/admin/talent-manager-utils";

describe("talent manager utils", () => {
  it("compares semantic draft values without client-only row ids or whitespace noise", () => {
    const base = {
      id: "talent-1",
      nickname: "青鸾",
      bio: "简介",
      mcn: "机构",
      tags: "国风, 舞台",
      aliases: "Qingluan",
      coverAssetId: "asset-1",
      links: [{ id: "persisted-link", label: "Bilibili", url: "https://example.com" }],
      representations: [{ id: "persisted-rep", title: "代表作", assetId: "asset-2" }]
    };
    const equivalent = {
      ...base,
      nickname: " 青鸾 ",
      tags: "国风，舞台，国风",
      links: [{ id: "client-link", label: " Bilibili ", url: "https://example.com " }],
      representations: [{ id: "client-rep", title: " 代表作 ", assetId: "asset-2" }]
    };

    expect(normalizeTalentDraft(equivalent)).toEqual(normalizeTalentDraft(base));
  });

  it("ignores rows that the server would discard", () => {
    const normalized = normalizeTalentDraft({
      nickname: "New",
      bio: "",
      mcn: "",
      tags: "",
      aliases: "",
      coverAssetId: "",
      links: [{ label: "Label only", url: "" }],
      representations: [{ title: "Title only", assetId: "" }]
    });

    expect(normalized.links).toEqual([]);
    expect(normalized.representations).toEqual([]);
  });
});
