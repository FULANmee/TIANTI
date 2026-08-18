import type { LocationItineraryEntry } from "../../../src/modules/domain/types";
import {
  compareLocationItineraryEntries,
  getLocationItineraryRecency,
  getLocationItineraryRecencyForSelection
} from "../../../src/components/site/location-itinerary-dialog";

function entry(
  date: string | null,
  isPast: boolean,
  city = "深圳",
  province = "广东省"
): LocationItineraryEntry {
  return { rawText: date ?? "日期未知", date, endDate: date, province, city, isPast };
}

describe("location itinerary ordering", () => {
  it("places every future itinerary before expired itineraries", () => {
    const entries = [
      entry("2026-08-17", true),
      entry("2026-08-20", false),
      entry("2026-08-01", true),
      entry("2026-08-19", false)
    ].sort(compareLocationItineraryEntries);

    expect(entries.map((item) => item.isPast)).toEqual([false, false, true, true]);
  });

  it("classifies a talent with mixed itineraries in the future group", () => {
    expect(getLocationItineraryRecency([
      entry("2026-08-17", true),
      entry("2026-08-19", false)
    ])).toMatchObject({ hasFuture: true });

    expect(getLocationItineraryRecency([
      entry("2026-08-17", true),
      entry("2026-08-01", true)
    ])).toMatchObject({ hasFuture: false });
  });

  it("classifies talents using only itineraries in the selected province", () => {
    const zhuhaiPastWithShanghaiFuture = [
      entry("2026-08-11", true, "珠海"),
      entry("2026-08-19", false, "上海", "上海市")
    ];
    const dongguanFuture = [entry("2026-08-20", false, "东莞")];

    expect(getLocationItineraryRecencyForSelection(
      zhuhaiPastWithShanghaiFuture,
      "广东省",
      ""
    )).toMatchObject({ hasFuture: false });
    expect(getLocationItineraryRecencyForSelection(
      dongguanFuture,
      "广东省",
      ""
    )).toMatchObject({ hasFuture: true });
  });
});
