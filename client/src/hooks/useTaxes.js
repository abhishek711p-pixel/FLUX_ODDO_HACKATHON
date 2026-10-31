import { useEffect, useState } from 'react';
import api from '../api/client.js';

// Loads the GST rules once, for tax dropdowns
export function useTaxes() {
  const [taxes, setTaxes] = useState([]);
  useEffect(() => {
    api.get('/taxes').then((res) => setTaxes(res.data)).catch(() => setTaxes([]));
  }, []);
  return taxes;
}
