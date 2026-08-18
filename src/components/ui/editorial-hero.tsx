import { cn } from "@/lib/cn";
import { ScanLine } from "lucide-react";

interface EditorialHeroProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function EditorialHero({
  eyebrow,
  title,
  description,
  actions,
  aside,
  className,
  contentClassName
}: EditorialHeroProps) {
  return (
    <section
      className={cn(
        "public-stage editorial-grid relative overflow-hidden rounded-[2.4rem] border border-[var(--line-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,251,255,0.74))] shadow-[var(--shadow-strong)]",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(43,109,246,0.12),transparent_34%),radial-gradient(circle_at_85%_10%,rgba(210,155,102,0.16),transparent_28%)]" />
      <ScanLine aria-hidden="true" className="absolute right-8 top-8 size-8 text-[var(--color-accent)] opacity-60" />
      <div
        className={cn(
          "relative grid gap-10 px-6 py-8 md:px-10 md:py-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-12",
          contentClassName
        )}
      >
        <div className="flex min-h-[24rem] flex-col justify-between gap-8 md:min-h-[29rem]">
          <div className="space-y-5">
            {eyebrow ? <p className="ui-kicker">{eyebrow}</p> : null}
            <h1 className="public-display-title max-w-4xl font-display text-6xl leading-[0.86] tracking-[-0.07em] text-[var(--foreground)] md:text-[7.5rem]">
              {title}
            </h1>
            <p className="max-w-2xl text-base leading-8 ui-subtle md:text-lg">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {aside ? <div className="relative">{aside}</div> : null}
      </div>
    </section>
  );
}
