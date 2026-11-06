export type Pagination = { page: number; pageSize: number };

export function parsePagination(
  searchParams: URLSearchParams,
  options: { defaultPageSize?: number; maxPageSize?: number } = {}
): Pagination {
  const defaultPageSize = options.defaultPageSize ?? 20;
  const maxPageSize = options.maxPageSize ?? 100;
  const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10);
  const parsedPageSize = Number.parseInt(searchParams.get('pageSize') || String(defaultPageSize), 10);

  return {
    page: Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1,
    pageSize: Number.isFinite(parsedPageSize)
      ? Math.min(maxPageSize, Math.max(1, parsedPageSize))
      : defaultPageSize,
  };
}
