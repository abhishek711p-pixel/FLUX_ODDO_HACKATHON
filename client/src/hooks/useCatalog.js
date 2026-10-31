import { useEffect, useState } from 'react';
import api from '../api/client.js';

// Active products (with variants) and active plans, for line pickers and forms
export function useCatalog() {
  const [products, setProducts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/products', { params: { active: 'true', include: 'variants', pageSize: 100 } }),
      api.get('/plans', { params: { active: 'true' } }),
    ])
      .then(([p, pl]) => {
        setProducts(p.data.data);
        setPlans(pl.data);
      })
      .finally(() => setLoading(false));
  }, []);

  return { products, plans, loading };
}

// Unit price of a product + optional variant
export function unitPriceOf(product, variantId) {
  if (!product) return 0;
  const variant = product.variants?.find((v) => String(v.id) === String(variantId));
  return Number(product.salesPrice) + Number(variant?.extraPrice || 0);
}
