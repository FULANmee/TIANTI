export interface NormalizedAssetFraming {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

const MIN_CROP_SIZE = 0.000001;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

export function normalizeAssetFraming(framing: Partial<NormalizedAssetFraming>): NormalizedAssetFraming {
  const cropWidth = clamp(framing.cropWidth ?? 1, MIN_CROP_SIZE, 1);
  const cropHeight = clamp(framing.cropHeight ?? 1, MIN_CROP_SIZE, 1);

  return {
    cropX: clamp(framing.cropX ?? 0, 0, 1 - cropWidth),
    cropY: clamp(framing.cropY ?? 0, 0, 1 - cropHeight),
    cropWidth,
    cropHeight
  };
}
