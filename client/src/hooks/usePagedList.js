import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';

// Loads a paginated list from the API with search (debounced) and filters.
// Usage: const list = usePagedList('/customers', { status: 'active' });
export function usePagedList(url, filters = {}, pageSize = 20) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const filterKey = JSON.stringify(filters);

  // Wait 300ms after typing stops before searching
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Go back to page 1 when search or filters change
  useEffect(() => setPage(1), [debounced, filterKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, pageSize, ...JSON.parse(filterKey) };
      if (debounced) params.search = debounced;
      const res = await api.get(url, { params });
      setResult(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [url, page, pageSize, debounced, filterKey]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    rows: result.data,
    total: result.total,
    counts: result.counts,
    summary: result.summary,
    page,
    pageSize,
    setPage,
    search,
    setSearch,
    loading,
    error,
    reload: load,
  };
}
