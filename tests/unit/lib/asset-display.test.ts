import { getAssetDisplayPreset, isSupportedAssetDisplayRatio } from "@/lib/asset-display";

describe("asset display presets", () => {
  it("defaults talent covers to 3:4 when no asset dimensions are present", () => {
    const preset = getAssetDisplayPreset("talent_cover");

    expect(preset.ratioLabel).toBe("3:4");
  });

  it("uses 4:3 when the uploaded asset is landscape", () => {
    const preset = getAssetDisplayPreset("talent_cover", {
      width: 1200,
      height: 900
    });

    expect(preset.ratioLabel).toBe("4:3");
  });

  it("uses non-destructive framing metadata instead of the source file ratio", () => {
    const preset = getAssetDisplayPreset("talent_cover", {
      width: 2400,
      height: 1600,
      displayAspectWidth: 3,
      displayAspectHeight: 4
    });

    expect(preset.ratioLabel).toBe("3:4");
  });

  it("treats only 3:4 and 4:3 as supported upload ratios", () => {
    expect(
      isSupportedAssetDisplayRatio("talent_cover", {
        width: 900,
        height: 1200
      })
    ).toBe(true);

    expect(
      isSupportedAssetDisplayRatio("talent_cover", {
        width: 1200,
        height: 900
      })
    ).toBe(true);

    expect(
      isSupportedAssetDisplayRatio("talent_cover", {
        width: 1000,
        height: 1000
      })
    ).toBe(false);
  });
});
