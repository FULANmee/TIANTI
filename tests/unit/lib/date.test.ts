import { getDateRangeDays, isValidDateOnlyValue, toDateOnlyIso } from "@/lib/date";

describe("date-only helpers", () => {
  it("stores valid calendar dates at noon UTC", () => {
    expect(toDateOnlyIso("2028-02-29")).toBe("2028-02-29T12:00:00.000Z");
    expect(isValidDateOnlyValue("2028-02-29")).toBe(true);
  });

  it.each(["", "2026-2-01", "2026-00-10", "2026-13-01", "2026-02-29", "2026-02-31", "2026-04-31"])(
    "rejects invalid date-only value %j",
    (value) => {
      expect(toDateOnlyIso(value)).toBeNull();
      expect(isValidDateOnlyValue(value)).toBe(false);
    }
  );

  it("does not create ranges from impossible dates", () => {
    expect(getDateRangeDays("2026-02-30", "2026-03-02")).toEqual([]);
  });
});
