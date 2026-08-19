import { matchesPinyinSearch } from "@/lib/pinyin";

describe("pinyin search", () => {
  it("matches Chinese, full pinyin, initials, aliases and keywords", () => {
    const values = ["青鸾", "Qinglan Studio", "舞台达人"];

    expect(matchesPinyinSearch(values, "青鸾")).toBe(true);
    expect(matchesPinyinSearch(values, "qingluan")).toBe(true);
    expect(matchesPinyinSearch(values, "ql")).toBe(true);
    expect(matchesPinyinSearch(values, "studio")).toBe(true);
    expect(matchesPinyinSearch(values, "wtdr")).toBe(true);
    expect(matchesPinyinSearch(values, "missing")).toBe(false);
  });
});
