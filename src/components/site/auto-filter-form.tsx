"use client";

import type { FormEvent, ReactNode } from "react";
import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

interface AutoFilterFormProps {
  children: ReactNode;
  className?: string;
}

function buildSearchParams(form: HTMLFormElement) {
  const params = new URLSearchParams();
  const formData = new FormData(form);

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    params.set(key, trimmed);
  }

  return params;
}

export function AutoFilterForm({ children, className }: AutoFilterFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function submitForm(form: HTMLFormElement) {
    const params = buildSearchParams(form);
    const href = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitForm(event.currentTarget);
  }

  return (
    <form
      className={className}
      onSubmit={handleSubmit}
      onChange={(event) => {
        const rawTarget = event.target;
        if (
          !(rawTarget instanceof HTMLInputElement) &&
          !(rawTarget instanceof HTMLSelectElement) &&
          !(rawTarget instanceof HTMLTextAreaElement)
        ) {
          return;
        }

        const target = rawTarget;
        if (target.dataset.autoSubmit !== "true") return;

        const form = event.currentTarget;
        const resetTarget = target.dataset.resetTarget;
        if (resetTarget) {
          const field = form.elements.namedItem(resetTarget);
          if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
            field.value = "";
          }
        }

        submitForm(form);
      }}
      data-pending={pending ? "true" : "false"}
      aria-busy={pending}
    >
      {children}
      <span className="sr-only" role="status" aria-live="polite">{pending ? "正在更新筛选结果" : ""}</span>
      <button type="submit" className="sr-only">
        Apply filters
      </button>
    </form>
  );
}
