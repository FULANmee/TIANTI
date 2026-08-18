import provinceCities from "china-division/dist/pc.json";

type ProvinceCityMap = Record<string, string[]>;

const DIRECT_CITIES = new Set(["北京市", "天津市", "上海市", "重庆市"]);
const SUFFIX_PATTERN = /(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/u;
const map = provinceCities as ProvinceCityMap;

function shortName(value: string) {
  return value.replace(SUFFIX_PATTERN, "");
}

export interface ItineraryLocation {
  province: string;
  city: string | null;
  label: string;
}

export const ITINERARY_PROVINCES = Object.keys(map).map((province) => ({
  name: province,
  label: shortName(province),
  cities: DIRECT_CITIES.has(province)
    ? [{ name: province, label: shortName(province) }]
    : map[province].map((city) => ({ name: city, label: shortName(city) }))
}));

const aliases = ITINERARY_PROVINCES.flatMap((province) => [
  { alias: province.name, province: province.name, city: null },
  { alias: province.label, province: province.name, city: null },
  ...province.cities.flatMap((city) => [
    { alias: city.name, province: province.name, city: city.name },
    { alias: city.label, province: province.name, city: city.name }
  ])
]).sort((left, right) => right.alias.length - left.alias.length);

export const ITINERARY_LOCATION_PATTERN_SOURCE = aliases
  .map((item) => item.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .filter((alias, index, values) => values.indexOf(alias) === index)
  .join("|");

export function findItineraryLocation(value: string): ItineraryLocation | null {
  const match = aliases.find((item) => value.includes(item.alias));
  if (!match) return null;
  return {
    province: match.province,
    city: match.city,
    label: match.city ? shortName(match.city) : shortName(match.province)
  };
}

export function getProvinceForItineraryLocation(value: string) {
  return findItineraryLocation(value)?.province ?? null;
}
