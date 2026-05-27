import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-900",
  failed: "bg-red-100 text-red-900",
  running: "bg-blue-100 text-blue-900",
  queued: "bg-amber-100 text-amber-900",
  pending: "bg-amber-100 text-amber-900",
  skipped: "bg-zinc-200 text-zinc-700",
};

const FALLBACK = "bg-zinc-200 text-zinc-700";

export function StatusPill({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[value] ?? FALLBACK,
        className,
      )}
    >
      {value}
    </span>
  );
}
