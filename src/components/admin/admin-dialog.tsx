"use client";

import { useEffect, useId, useRef, type ReactNode, type SyntheticEvent } from "react";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface AdminDialogProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  size?: "md" | "lg" | "xl";
  presentation?: "dialog" | "drawer" | "workspace";
  closable?: boolean;
}

const sizeClassNames = {
  md: "max-w-3xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl"
};

export function AdminDialog({
  title,
  description,
  children,
  footer,
  onClose,
  size = "md",
  presentation = "dialog",
  closable = true
}: AdminDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;

    if (!dialog) {
      return undefined;
    }

    document.documentElement.style.overflow = "hidden";
    if (!dialog.open) {
      dialog.showModal();
    }
    closeButtonRef.current?.focus();

    return () => {
      if (dialog.open) {
        dialog.close();
      }
      document.documentElement.style.overflow = previousOverflow;
      if (invoker?.isConnected) {
        invoker.focus();
      }
    };
  }, []);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  if (presentation === "workspace") {
    return (
      <section
        data-testid="admin-editor-workspace"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="admin-editor-stage surface min-h-0 overscroll-contain rounded-[var(--radius-panel)] lg:col-start-2 lg:row-start-1"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line-soft)] bg-[rgba(255,255,255,0.96)] px-5 py-4 md:px-6">
          <div>
            <h2 id={titleId} className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">{title}</h2>
            {description ? <p id={descriptionId} className="mt-2 text-sm leading-6 ui-subtle">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="ui-button-secondary shrink-0 px-3 text-sm lg:hidden"><ArrowLeft aria-hidden="true" className="size-4" />返回列表</button>
          {closable ? <button type="button" onClick={onClose} aria-label="关闭编辑" className="ui-button-secondary hidden shrink-0 px-3 lg:inline-flex"><X aria-hidden="true" className="size-4" /></button> : null}
        </div>
        <div className="px-5 py-5 md:px-6">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line-soft)] bg-[rgba(255,255,255,0.96)] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">{footer}</div>
      </section>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      className={cn(
        "w-[calc(100%-2rem)] overflow-visible border-0 bg-transparent p-0 text-[var(--foreground)] outline-none backdrop:bg-[rgba(24,33,38,0.38)] backdrop:backdrop-blur-sm",
        presentation === "drawer"
          ? "m-0 ml-auto h-dvh max-h-dvh max-w-[min(54rem,100vw)] md:w-[min(54rem,calc(100%-5rem))]"
          : cn("m-auto max-h-[calc(100dvh-3rem)]", sizeClassNames[size])
      )}
    >
      <section
        className={cn(
          "surface grid w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden shadow-[0_24px_80px_rgba(24,33,38,0.18)]",
          presentation === "drawer"
            ? "h-dvh max-h-dvh rounded-none border-y-0 border-r-0"
            : "max-h-[calc(100dvh-3rem)] rounded-[1.25rem]"
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line-soft)] bg-[rgba(255,255,255,0.96)] px-5 py-4 md:px-6">
          <div>
            <h2 id={titleId} className="text-2xl text-[var(--foreground)]">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-2 text-sm leading-6 ui-subtle">
                {description}
              </p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="ui-button-secondary shrink-0 px-3 py-2 text-sm"
          >
            <X aria-hidden="true" className="size-4" />
            <span>关闭</span>
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-5 md:px-6">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line-soft)] bg-[rgba(255,255,255,0.96)] px-5 py-4 md:px-6">
          {footer}
        </div>
      </section>
    </dialog>
  );
}
