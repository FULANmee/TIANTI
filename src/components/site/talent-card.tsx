import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { FramedImage } from "@/components/ui/framed-image";
import { getAssetDisplayPreset } from "@/lib/asset-display";
import { getTalentPath } from "@/lib/public-path";
import type { TalentSummary } from "@/modules/domain/types";

interface TalentCardProps {
  eagerImage?: boolean;
  talent: TalentSummary;
}

export function TalentCard({ eagerImage = false, talent }: TalentCardProps) {
  const coverDisplayPreset = getAssetDisplayPreset("talent_cover", talent.cover);

  return (
    <Link
      href={getTalentPath(talent)}
      data-testid={`talent-card-${talent.id}`}
      className="public-card ui-status-spine group surface block overflow-hidden rounded-[1.15rem] transition duration-300 hover:shadow-[var(--shadow-strong)]"
      style={{ "--status-color": talent.futureLocationHint ? "var(--color-success)" : "var(--color-accent)" } as React.CSSProperties}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: coverDisplayPreset.aspectStyle }}>
        {talent.cover ? (
          <>
            <FramedImage
              asset={talent.cover}
              eager={eagerImage}
              sizes="(min-width: 1280px) 17vw, (min-width: 768px) 34vw, 100vw"
              className="transition duration-700 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(24,33,47,0)_48%,rgba(24,33,47,0.28))]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(43,109,246,0.12),rgba(255,255,255,0.05)_40%,rgba(24,33,47,0.08))]" />
        )}
      </div>
      <div data-testid={`talent-card-copy-${talent.id}`} className="h-[6.25rem] overflow-hidden px-4 py-4">
        <div className="flex items-start justify-between gap-2"><h3 className="line-clamp-1 text-lg font-semibold tracking-[-0.04em] text-[var(--foreground)] 2xl:text-xl">{talent.nickname}</h3><ArrowUpRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--color-accent)] transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
        {talent.futureLocationHint ? <div className="mt-1.5 space-y-0.5">
          <p data-testid={`talent-future-hint-${talent.id}`} className="flex items-center gap-1 text-[0.68rem] leading-4 ui-subtle">
            <MapPin aria-hidden="true" className="size-3 shrink-0" />
            <span className="line-clamp-1">{talent.futureLocationHint}</span>
          </p>
          <p className="line-clamp-1 text-[0.68rem] leading-4 ui-muted">{talent.bioPreviewLine ?? ""}</p>
        </div> : <p className="mt-3 line-clamp-1 text-sm leading-7 ui-subtle">{talent.bioPreviewLine ?? ""}</p>}
      </div>
    </Link>
  );
}
