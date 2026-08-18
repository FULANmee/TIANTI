import { cn } from "@/lib/cn";

interface StatusNoticeProps {
  children: React.ReactNode;
  variant?: "info" | "success" | "warning" | "error";
  className?: string;
}

const toneMap = {
  info: "border-[rgba(43,109,246,0.14)] bg-[rgba(43,109,246,0.08)] text-[var(--foreground)]",
  success: "border-[rgba(43,146,93,0.16)] bg-[rgba(43,146,93,0.08)] text-[#1f6f48]",
  warning: "border-[rgba(187,138,58,0.28)] bg-[rgba(187,138,58,0.12)] text-[#5f3d00]",
  error: "border-[rgba(187,61,61,0.28)] bg-[rgba(187,61,61,0.1)] text-[#5f0f18]"
} as const;

export function StatusNotice({ children, variant = "info", className }: StatusNoticeProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={cn("rounded-[0.9rem] border px-4 py-3 text-sm leading-6", toneMap[variant], className)}
    >
      {children}
    </div>
  );
}
