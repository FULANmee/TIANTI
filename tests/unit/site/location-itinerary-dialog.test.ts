import type { LocationItineraryEntry } from "../../../src/modules/domain/types";
import {
  compareLocationItineraryEntries,
  getLocationItineraryRecency
} from "../../../src/components/site/location-itinerary-dialog";

function entry(date: string | null, isPast: boolean): LocationItineraryEntry {
  return { rawText: date ?? "日期未知", date, endDate: date, province: "广东省", city: "深圳", isPast };
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
});
