const pinyinCollator = new Intl.Collator("zh-CN-u-co-pinyin", {
  sensitivity: "base",
  numeric: true
});

export function compareByPinyin(left: string, right: string) {
  return pinyinCollator.compare(left.trim(), right.trim());
}

export function matchesPinyinSearch(values: Array<string | null | undefined>, query: string) {
  const needle = query.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
  if (!needle) return true;

  return values.some((value) => {
    if (!value) return false;
    const normalized = value.toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
    const syllables = pinyin(value, { toneType: "none", type: "array" }).map((item) => item.toLocaleLowerCase());
    return normalized.includes(needle)
      || syllables.join("").includes(needle)
      || syllables.map((item) => item[0] ?? "").join("").includes(needle);
  });
}
import { pinyin } from "pinyin-pro";
