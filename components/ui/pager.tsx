// Numbered pagination control. Shows first/last, current ±2, and ellipses
// for gaps. Click any number to jump.

import Link from "next/link";
import { cn } from "@/lib/utils";
import { buildPageHref } from "@/lib/pagination";

type Props = {
  basePath: string;
  searchParams: Record<string, string | undefined | null>;
  page: number;
  totalPages: number;
  /** How many neighbors of the current page to show before/after. Default 2. */
  window?: number;
};

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

/** Returns the array of items to render (numbers + ellipsis markers). */
function pageItems(
  page: number,
  total: number,
  windowSize: number,
): Array<number | "..."> {
  if (total <= 1) return [];
  if (total <= 7 + windowSize * 2) return range(1, total);

  const left = Math.max(2, page - windowSize);
  const right = Math.min(total - 1, page + windowSize);
  const items: Array<number | "..."> = [1];
  if (left > 2) items.push("...");
  for (const n of range(left, right)) items.push(n);
  if (right < total - 1) items.push("...");
  items.push(total);
  return items;
}

export function Pager({ basePath, searchParams, page, totalPages, window = 2 }: Props) {
  if (totalPages <= 1) return null;
  const items = pageItems(page, totalPages, window);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-center gap-1 text-sm"
    >
      <PagerLink
        basePath={basePath}
        searchParams={searchParams}
        target={page - 1}
        disabled={page <= 1}
      >
        ← Prev
      </PagerLink>
      {items.map((item, idx) =>
        item === "..." ? (
          <span
            key={`ellipsis-${idx}`}
            className="px-2 text-muted-foreground"
            aria-hidden
          >
            …
          </span>
        ) : (
          <PagerLink
            key={item}
            basePath={basePath}
            searchParams={searchParams}
            target={item}
            current={item === page}
          >
            {item}
          </PagerLink>
        ),
      )}
      <PagerLink
        basePath={basePath}
        searchParams={searchParams}
        target={page + 1}
        disabled={page >= totalPages}
      >
        Next →
      </PagerLink>
    </nav>
  );
}

function PagerLink({
  basePath,
  searchParams,
  target,
  disabled,
  current,
  children,
}: {
  basePath: string;
  searchParams: Record<string, string | undefined | null>;
  target: number;
  disabled?: boolean;
  current?: boolean;
  children: React.ReactNode;
}) {
  const className = cn(
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2.5 text-sm",
    disabled
      ? "pointer-events-none border-transparent text-muted-foreground"
      : current
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input bg-background hover:bg-accent",
  );
  if (disabled) {
    return (
      <span className={className} aria-disabled>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={buildPageHref(basePath, searchParams, target)}
      aria-current={current ? "page" : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}
