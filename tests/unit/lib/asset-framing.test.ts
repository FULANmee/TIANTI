import { normalizeAssetFraming } from "@/lib/asset-framing";

describe("asset framing", () => {
  it("keeps a valid framing unchanged", () => {
    expect(normalizeAssetFraming({ cropX: 0.2, cropY: 0.1, cropWidth: 0.6, cropHeight: 0.8 })).toEqual({
      cropX: 0.2,
      cropY: 0.1,
      cropWidth: 0.6,
      cropHeight: 0.8
    });
  });

  it("clamps the origin so the crop never extends beyond the source image", () => {
    const framing = normalizeAssetFraming({ cropX: 0.4, cropY: 0.3, cropWidth: 0.8, cropHeight: 0.9 });
    expect(framing.cropX).toBeCloseTo(0.2);
    expect(framing.cropY).toBeCloseTo(0.1);
    expect(framing.cropWidth).toBe(0.8);
    expect(framing.cropHeight).toBe(0.9);
  });

  it("recovers finite in-bounds values from malformed framing", () => {
    const framing = normalizeAssetFraming({ cropX: Number.NaN, cropY: 2, cropWidth: 0, cropHeight: 3 });
    expect(framing.cropX).toBe(0);
    expect(framing.cropY).toBe(0);
    expect(framing.cropWidth).toBeGreaterThan(0);
    expect(framing.cropHeight).toBe(1);
  });
});
