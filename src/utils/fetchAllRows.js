/**
 * Read every row of a query in pages. Supabase (PostgREST) caps a single
 * response at 1,000 rows by default, so a plain select('*') silently drops
 * everything past the first 1,000 once a table grows beyond that.
 *
 * @param {(from: number, to: number) => PromiseLike<{ data: any[]|null, error: any }>} fetchPage
 *   Runs the query for rows [from, to] inclusive, e.g. q.range(from, to).
 * @param {{ pageSize?: number, maxPages?: number }} [options]
 * @returns {Promise<{ data: any[]|null, error: any }>} the first error stops paging
 *   and is returned with data null, like a single Supabase call.
 */
export const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllRows(fetchPage, { pageSize = DEFAULT_PAGE_SIZE, maxPages = 50 } = {}) {
    const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
    const rows = [];
    for (let page = 0; page < maxPages; page++) {
        const from = page * size;
        const { data, error } = (await fetchPage(from, from + size - 1)) ?? {};
        if (error) return { data: null, error };
        if (!Array.isArray(data)) return { data: rows.length ? rows : data ?? null, error: null };
        rows.push(...data);
        // A short page is the last one.
        if (data.length < size) break;
    }
    return { data: rows, error: null };
}
