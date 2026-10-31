import { useEffect, useState } from 'react';
import api from '../api/client.js';

// The business using this installation (set on the server with COMPANY_NAME). Fetched once and shared.
let cached = null;
let pending = null;
const FALLBACK = { companyName: '', companyEmail: '' };

export function useCompany() {
  const [company, setCompany] = useState(cached || FALLBACK);
  useEffect(() => {
    if (cached) return;
    pending = pending || api.get('/meta').then((r) => (cached = r.data)).catch(() => FALLBACK);
    let alive = true;
    pending.then((c) => alive && setCompany(c));
    return () => { alive = false; };
  }, []);
  return company;
}
