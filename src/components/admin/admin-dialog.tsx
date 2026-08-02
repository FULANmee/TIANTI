"use client";

import { useEffect, useId, useRef, type ReactNode, type SyntheticEvent } from "react";
import { cn } from "@/lib/cn";

interface AdminDialogProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  size?: "md" | "lg" | "xl";
}

const sizeClassNames = {
  md: "max-w-3xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl"
};

export function AdminDialog({ title, description, children, footer, onClose, size = "md" }: AdminDialogProps) {
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

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      className={cn(
        "m-auto max-h-[calc(100dvh-3rem)] w-[calc(100%-2rem)] overflow-visible border-0 bg-transparent p-0 text-[var(--foreground)] outline-none backdrop:bg-[rgba(238,243,248,0.76)] backdrop:backdrop-blur-md",
        sizeClassNames[size]
      )}
    >
      <section
        className="surface max-h-[calc(100dvh-3rem)] w-full overflow-y-auto rounded-[1.8rem] p-6 shadow-[0_24px_80px_rgba(91,109,133,0.16)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line-soft)] pb-4">
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
            关闭
          </button>
        </div>
        <div className="py-5">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line-soft)] pt-4">
          {footer}
        </div>
      </section>
    </dialog>
  );
}
