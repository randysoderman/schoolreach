// Shared pagination helpers used by list pages.

export const PAGE_SIZE = 50;

export function parsePageParam(value?: string): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Build a paginated URL for a list page. Drops empty filter values and the
 * `page` param when on page 1, so URLs stay clean.
 */
export function buildPageHref(
  basePath: string,
  filters: Record<string, string | null | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
