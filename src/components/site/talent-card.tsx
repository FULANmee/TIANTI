import Image from "next/image";
import Link from "next/link";
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
      className="group surface block overflow-hidden rounded-[1.9rem] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-strong)]"
    >
      <div className="relative overflow-hidden" style={{ aspectRatio: coverDisplayPreset.aspectStyle }}>
        {talent.cover ? (
          <>
            <Image
              src={talent.cover.url}
              alt={talent.cover.alt}
              fill
              loading={eagerImage ? "eager" : undefined}
              sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 100vw"
              className="object-cover transition duration-700 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(24,33,47,0)_48%,rgba(24,33,47,0.28))]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(43,109,246,0.12),rgba(255,255,255,0.05)_40%,rgba(24,33,47,0.08))]" />
        )}
        <div className="absolute left-5 top-5 flex flex-wrap gap-2">
          {talent.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full bg-[rgba(248,251,255,0.76)] px-3 py-1 text-[11px] tracking-[0.16em] text-[var(--foreground)]">
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-3 px-5 py-5">
        <div className="space-y-2">
          <h3 className="text-2xl tracking-[-0.03em] text-[var(--foreground)]">{talent.nickname}</h3>
          {talent.futureLocationHint ? (
            <p data-testid={`talent-future-hint-${talent.id}`} className="text-sm ui-subtle">
              {talent.futureLocationHint}
            </p>
          ) : null}
        </div>
        <p className="line-clamp-1 text-sm leading-7 ui-subtle">{talent.bioPreviewLine ?? ""}</p>
      </div>
    </Link>
  );
}
