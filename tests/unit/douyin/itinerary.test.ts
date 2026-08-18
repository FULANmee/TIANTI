import { groupFutureShenzhenItineraries, parseDouyinItinerary } from "@/modules/douyin/itinerary";

const NOW = new Date("2026-08-03T12:00:00.000Z");

const SAMPLE_ONE = `✨夜行生物 重庆最不能吃辣c位 百变猫罐不被定义✨
日常夺舍：@望月水母.zip
行程：8.7成都codm➡️8.8深圳金铲铲➡️8.9青岛AS(签售)
商务：[已脱敏]`;

const SAMPLE_TWO = `全平台同名
✨ 签售行程：5.16广州鸣潮o/5.23南京碧蓝o/5.30上海/6.6南宁/6.19金华/6.20厦门/6.21武汉/8.2广州
✨线下行程：4.17上海/4.23-26广州异环/5.1-3星铁land/5.4杭州cp/5.24广州/7.11南京/7.24-26广州`;

const SAMPLE_THREE = `谢谢你的关注
8.8深圳金铲铲 815成都明日之后
理想型@我是闪电侠`;

const SAMPLE_FOUR = `唯一小号@摸鱼儿 8.9号广州黑蜻蜓`;

const SAMPLE_FIVE = `谨防冒充
理想型：@走路摇mini
7.31 上海cj 8.1郑州 8.7成都 codm 8.8重庆 8.9上海闪魂绝区零
商务：[已脱敏]`;

describe("Douyin itinerary parsing", () => {
  it("preserves itinerary source text while parsing separated entries", () => {
    const parsed = parseDouyinItinerary(SAMPLE_ONE, NOW);

    expect(parsed.displayBlocks).toEqual([
      "行程：8.7成都codm➡️8.8深圳金铲铲➡️8.9青岛AS(签售)"
    ]);
    expect(parsed.entries.map((entry) => [entry.dateKey, entry.city, entry.eventName])).toEqual([
      ["2026-08-07", "成都", "codm"],
      ["2026-08-08", "深圳", "金铲铲"],
      ["2026-08-09", "青岛", "AS(签售)"]
    ]);
  });

  it("recognizes province names and cities outside the former shortlist", () => {
    const parsed = parseDouyinItinerary("行程：8.8广东活动 / 8.9惠州见面会", NOW);
    expect(parsed.entries.map((entry) => entry.city)).toEqual(["广东", "惠州"]);
  });

  it("keeps labeled historical blocks visible without rolling them into the next year", () => {
    const parsed = parseDouyinItinerary(SAMPLE_TWO, NOW);

    expect(parsed.displayBlocks).toHaveLength(2);
    expect(parsed.entries.every((entry) => entry.isFuture === false)).toBe(true);
    expect(parsed.entries.find((entry) => entry.rawText.startsWith("4.23-26"))?.endDateKey).toBe(
      "2026-04-26"
    );
  });

  it("recognizes compact dates only in itinerary context", () => {
    const parsed = parseDouyinItinerary(SAMPLE_THREE, NOW);

    expect(parsed.entries.map((entry) => [entry.dateKey, entry.city, entry.eventName])).toEqual([
      ["2026-08-08", "深圳", "金铲铲"],
      ["2026-08-15", "成都", "明日之后"]
    ]);
  });

  it("parses full-width wave date ranges without leaking the end day into the name", () => {
    const parsed = parseDouyinItinerary("8.8～9深圳金铲铲", NOW);

    expect(parsed.entries).toEqual([
      expect.objectContaining({
        dateKey: "2026-08-08",
        endDateKey: "2026-08-09",
        city: "深圳",
        eventName: "金铲铲"
      })
    ]);
  });

  it.each(["-", "~", "～", "—", "至"])(
    "keeps the existing date-range separator %s equivalent",
    (separator) => {
      const parsed = parseDouyinItinerary(`8.8${separator}9深圳金铲铲`, NOW);

      expect(parsed.entries).toEqual([
        expect.objectContaining({
          dateKey: "2026-08-08",
          endDateKey: "2026-08-09",
          eventName: "金铲铲"
        })
      ]);
    }
  );

  it("keeps full-width wave ranges safe when the end date is invalid", () => {
    const parsed = parseDouyinItinerary("行程：8.8～2深圳测试活动", NOW);

    expect(parsed.entries).toEqual([]);
    expect(parsed.skipped).toContainEqual({
      rawText: "8.8～2深圳测试活动",
      reason: "invalid_date"
    });
  });

  it("starts unlabeled display blocks at the first date", () => {
    expect(parseDouyinItinerary(SAMPLE_FOUR, NOW).displayBlocks).toEqual(["8.9号广州黑蜻蜓"]);
    expect(parseDouyinItinerary(SAMPLE_FIVE, NOW).displayBlocks).toEqual([
      "7.31 上海cj 8.1郑州 8.7成都 codm 8.8重庆 8.9上海闪魂绝区零"
    ]);
  });

  it("keeps invalid date-led itinerary text visible and records a safe skip", () => {
    const parsed = parseDouyinItinerary(
      "行程：2.30深圳测试活动 / 8.8深圳金铲铲",
      new Date("2026-02-01T12:00:00.000Z")
    );

    expect(parsed.displayBlocks).toEqual(["行程：2.30深圳测试活动 / 8.8深圳金铲铲"]);
    expect(parsed.skipped).toContainEqual({
      rawText: "2.30深圳测试活动",
      reason: "invalid_date"
    });
    expect(parsed.entries).toEqual([
      expect.objectContaining({ dateKey: "2026-08-08", city: "深圳", eventName: "金铲铲" })
    ]);
  });

  it("does not treat unrelated compact business numbers as itinerary dates", () => {
    expect(parseDouyinItinerary("商务：1234品牌合作", NOW).displayBlocks).toEqual([]);
  });

  it("keeps a labeled itinerary without a date as display-only text", () => {
    const parsed = parseDouyinItinerary("签售行程：待定", NOW);

    expect(parsed.displayBlocks).toEqual(["签售行程：待定"]);
    expect(parsed.entries).toEqual([]);
    expect(parsed.skipped).toEqual([{ rawText: "签售行程：待定", reason: "missing_date" }]);
  });

  it("groups the two sample Shenzhen appearances into one named activity", () => {
    const entries = [SAMPLE_ONE, SAMPLE_TWO, SAMPLE_THREE, SAMPLE_FOUR, SAMPLE_FIVE].flatMap(
      (sample) => parseDouyinItinerary(sample, NOW).entries
    );
    const groups = groupFutureShenzhenItineraries(entries);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      name: "金铲铲",
      startsOn: "2026-08-08",
      endsOn: "2026-08-08"
    });
    expect(groups[0].entries).toHaveLength(2);
  });

  it("uses a fixed five-day diameter instead of transitive expansion", () => {
    const parsed = parseDouyinItinerary("8.1深圳 8.6深圳 8.11深圳", new Date("2026-07-01T12:00:00.000Z"));
    const groups = groupFutureShenzhenItineraries(parsed.entries);

    expect(groups.map((group) => [group.startsOn, group.endsOn])).toEqual([
      ["2026-08-01", "2026-08-06"],
      ["2026-08-11", "2026-08-11"]
    ]);
  });

  it("keeps explicit different names separate and leaves an ambiguous unnamed entry alone", () => {
    const parsed = parseDouyinItinerary(
      "8.8金铲铲深圳 8.8和平精英深圳 8.8深圳",
      new Date("2026-08-01T12:00:00.000Z")
    );
    const groups = groupFutureShenzhenItineraries(parsed.entries);

    expect(groups.map((group) => group.name).sort()).toEqual(["", "和平精英", "金铲铲"].sort());
  });
});
