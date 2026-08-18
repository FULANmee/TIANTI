import { cn } from "@/lib/cn";

interface SectionFrameProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  titleTestId?: string;
  align?: "left" | "center";
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  headingLevel?: "h1" | "h2";
}

export function SectionFrame({
  eyebrow,
  title,
  description,
  titleTestId,
  align = "left",
  actions,
  children,
  className,
  headerClassName,
  contentClassName,
  headingLevel = "h2"
}: SectionFrameProps) {
  const Heading = headingLevel;
  return (
    <section className={cn("public-section-frame space-y-8", className)}>
      {eyebrow || title || description || actions ? (
        <div
          className={cn(
            "flex flex-col gap-4 border-b pb-5 ui-divider md:flex-row md:items-end md:justify-between",
            align === "center" && "mx-auto max-w-3xl items-center text-center md:flex-col md:justify-center",
            headerClassName
          )}
        >
          <div className="space-y-3">
            {eyebrow ? <p className="ui-kicker">{eyebrow}</p> : null}
            {title ? (
              <Heading
                data-testid={titleTestId}
                className={cn(
                  "font-display text-4xl leading-[0.95] tracking-[-0.05em] text-[var(--foreground)] md:text-6xl",
                  align === "center" && "mx-auto"
                )}
              >
                {title}
              </Heading>
            ) : null}
            {description ? (
              <p
                className={cn(
                  "max-w-3xl text-sm leading-7 ui-subtle md:text-base",
                  align === "center" && "mx-auto"
                )}
              >
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      ) : null}
      {children ? <div className={contentClassName}>{children}</div> : null}
    </section>
  );
}
