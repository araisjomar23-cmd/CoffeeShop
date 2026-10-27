// Fail rather than showing a partial total if any page cannot be loaded.
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await fetchPage(offset, offset + 499);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
