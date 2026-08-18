"use client";

import { useState } from "react";
import Link from "next/link";
import { FramedImage } from "@/components/ui/framed-image";
import { getAssetDisplayPreset } from "@/lib/asset-display";
import { getTalentPath } from "@/lib/public-path";
import type { Asset } from "@/modules/domain/types";

interface EventArchiveCardProps {
  canToggleSharedPhoto?: boolean;
  cosplayTitle: string;
  sceneAsset?: Asset | null;
  sharedPhotoAsset?: Asset | null;
  talentId: string;
  talentName: string;
  talentSlug?: string | null;
}

export function EventArchiveCard({
  canToggleSharedPhoto = false,
  cosplayTitle,
  sceneAsset,
  sharedPhotoAsset,
  talentId,
  talentName,
  talentSlug
}: EventArchiveCardProps) {
  const [isSharedPhotoVisible, setIsSharedPhotoVisible] = useState(false);
  const showSharedPhoto = Boolean(sharedPhotoAsset) && isSharedPhotoVisible;
  const activeAsset = showSharedPhoto ? sharedPhotoAsset ?? sceneAsset : sceneAsset ?? sharedPhotoAsset;
  const activeDisplayPreset = getAssetDisplayPreset(
    showSharedPhoto ? "shared_photo" : "event_scene",
    activeAsset
  );

  return (
    <div data-testid="event-archive-card" className="public-card surface h-full overflow-hidden rounded-[1.15rem]">
      <div className="relative" style={{ aspectRatio: activeDisplayPreset.aspectStyle }}>
        {sceneAsset ? (
          <FramedImage
            asset={sceneAsset}
            sizes="(min-width: 1280px) 17vw, (min-width: 768px) 34vw, 100vw"
          />
        ) : (
          <div className="absolute inset-0 bg-transparent" />
        )}
        {sharedPhotoAsset ? (
          <FramedImage
            asset={sharedPhotoAsset}
            sizes="(min-width: 1280px) 17vw, (min-width: 768px) 34vw, 100vw"
            className={`transition duration-300 ${showSharedPhoto ? "opacity-100" : "opacity-0"}`}
          />
        ) : null}
      </div>
      <div className="space-y-2 p-4">
        <Link href={getTalentPath({ id: talentId, slug: talentSlug })} className="text-base font-semibold tracking-[-0.03em] text-[var(--foreground)]">
          {talentName}
        </Link>
        {cosplayTitle ? <p className="text-sm ui-subtle">{cosplayTitle}</p> : null}
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.15em] ui-muted">
          {sharedPhotoAsset ? (
            canToggleSharedPhoto ? (
              <button
                type="button"
                data-testid="archive-shared-toggle"
                aria-pressed={showSharedPhoto}
                aria-label={showSharedPhoto ? `返回查看${talentName}的现场图` : `查看${talentName}的合照`}
                onClick={() => setIsSharedPhotoVisible((current) => !current)}
                className="rounded-full border border-[var(--line-soft)] px-3 py-1 text-[11px] tracking-[0.15em] transition hover:border-[rgba(43,109,246,0.22)] hover:text-[var(--foreground)]"
              >
                {showSharedPhoto ? "返回现场" : "查看合照"}
              </button>
            ) : (
              <span>已集邮</span>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
