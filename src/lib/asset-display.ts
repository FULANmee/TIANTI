import type { Asset, AssetKind } from "@/modules/domain/types";

export interface AssetDisplayPreset {
  aspectWidth: number;
  aspectHeight: number;
  aspectRatio: number;
  aspectStyle: string;
  ratioLabel: string;
  cropTitle: string;
  cropHint: string;
}

type AssetDisplayCopy = Pick<AssetDisplayPreset, "cropTitle" | "cropHint">;
type AssetDisplayDimensions = Pick<Asset, "width" | "height" | "displayAspectWidth" | "displayAspectHeight">;

const MAX_ASPECT_RATIO_DELTA = 0.03;

function createDisplayPreset(aspectWidth: number, aspectHeight: number): Omit<AssetDisplayPreset, "cropTitle" | "cropHint"> {
  return {
    aspectWidth,
    aspectHeight,
    aspectRatio: aspectWidth / aspectHeight,
    aspectStyle: `${aspectWidth} / ${aspectHeight}`,
    ratioLabel: `${aspectWidth}:${aspectHeight}`
  };
}

function attachDisplayCopy(
  preset: Omit<AssetDisplayPreset, "cropTitle" | "cropHint">,
  copy: AssetDisplayCopy
): AssetDisplayPreset {
  return {
    ...preset,
    ...copy
  };
}

function getClosestDisplayPreset(
  presets: AssetDisplayPreset[],
  asset: AssetDisplayDimensions | null | undefined
) {
  if (!asset || asset.width <= 0 || asset.height <= 0) {
    return null;
  }

  if (asset.displayAspectWidth && asset.displayAspectHeight) {
    const exact = presets.find((preset) =>
      preset.aspectWidth === asset.displayAspectWidth && preset.aspectHeight === asset.displayAspectHeight
    );
    if (exact) return exact;
  }

  const assetAspectRatio = asset.width / asset.height;
  let bestMatch: AssetDisplayPreset | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const preset of presets) {
    const delta = Math.abs(assetAspectRatio - preset.aspectRatio);
    if (delta < bestDelta) {
      bestMatch = preset;
      bestDelta = delta;
    }
  }

  if (!bestMatch || bestDelta > MAX_ASPECT_RATIO_DELTA) {
    return null;
  }

  return bestMatch;
}

const PORTRAIT_DISPLAY_PRESET = createDisplayPreset(3, 4);
const LANDSCAPE_DISPLAY_PRESET = createDisplayPreset(4, 3);

const ASSET_DISPLAY_COPY: Record<AssetKind, AssetDisplayCopy> = {
  talent_cover: {
    cropTitle: "达人封面",
    cropHint: "前台封面和卡片会按所选比例同步显示。"
  },
  talent_representation: {
    cropTitle: "代表图",
    cropHint: "前台代表图统一使用竖版 3:4 取景，完整原图仍会保留。"
  },
  event_scene: {
    cropTitle: "现场图",
    cropHint: "前台现场图和卡片会按所选比例同步显示。"
  },
  shared_photo: {
    cropTitle: "合照",
    cropHint: "前台合照和卡片会按所选比例同步显示。"
  }
};

export const ASSET_UPLOAD_PRESET_OPTIONS: Record<AssetKind, AssetDisplayPreset[]> = {
  talent_cover: [
    attachDisplayCopy(PORTRAIT_DISPLAY_PRESET, ASSET_DISPLAY_COPY.talent_cover),
    attachDisplayCopy(LANDSCAPE_DISPLAY_PRESET, ASSET_DISPLAY_COPY.talent_cover)
  ],
  talent_representation: [
    attachDisplayCopy(PORTRAIT_DISPLAY_PRESET, ASSET_DISPLAY_COPY.talent_representation)
  ],
  event_scene: [
    attachDisplayCopy(PORTRAIT_DISPLAY_PRESET, ASSET_DISPLAY_COPY.event_scene),
    attachDisplayCopy(LANDSCAPE_DISPLAY_PRESET, ASSET_DISPLAY_COPY.event_scene)
  ],
  shared_photo: [
    attachDisplayCopy(PORTRAIT_DISPLAY_PRESET, ASSET_DISPLAY_COPY.shared_photo),
    attachDisplayCopy(LANDSCAPE_DISPLAY_PRESET, ASSET_DISPLAY_COPY.shared_photo)
  ]
};

export const ASSET_DISPLAY_PRESETS: Record<AssetKind, AssetDisplayPreset> = {
  talent_cover: ASSET_UPLOAD_PRESET_OPTIONS.talent_cover[0],
  talent_representation: ASSET_UPLOAD_PRESET_OPTIONS.talent_representation[0],
  event_scene: ASSET_UPLOAD_PRESET_OPTIONS.event_scene[0],
  shared_photo: ASSET_UPLOAD_PRESET_OPTIONS.shared_photo[0]
};

export function getAssetDisplayPreset(kind: AssetKind, asset?: AssetDisplayDimensions | null) {
  return getClosestDisplayPreset(ASSET_UPLOAD_PRESET_OPTIONS[kind], asset) ?? ASSET_DISPLAY_PRESETS[kind];
}

export function isSupportedAssetDisplayRatio(kind: AssetKind, asset: AssetDisplayDimensions) {
  return Boolean(getClosestDisplayPreset(ASSET_UPLOAD_PRESET_OPTIONS[kind], asset));
}
