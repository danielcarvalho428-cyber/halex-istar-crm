type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export const SUPABASE_PAGE_SIZE = 1000;

export async function fetchAllSupabaseRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = SUPABASE_PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
