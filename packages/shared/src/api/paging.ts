// Supabase's API returns at most 1000 rows per request (PostgREST max-rows),
// so whole-team lists (Reports, Admin, Goals) are read page by page —
// otherwise months of imported history would be silently cut off.
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows = 20000
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await page(from, Math.min(from + PAGE_SIZE, maxRows) - 1);
    if (error) return { data: all.length ? all : null, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}
