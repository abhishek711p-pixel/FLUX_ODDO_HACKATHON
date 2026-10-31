import { createContext, useContext, useEffect, useState } from 'react';

// Lets a page name its current record in the top bar breadcrumb (e.g. "INV/2026/18780")
const CrumbContext = createContext({ crumb: '', setCrumb: () => {} });

export function CrumbProvider({ children }) {
  const [crumb, setCrumb] = useState('');
  return <CrumbContext.Provider value={{ crumb, setCrumb }}>{children}</CrumbContext.Provider>;
}

export const useCrumbValue = () => useContext(CrumbContext).crumb;

// Call from a page: useCrumb(sub?.number). Cleared when the page closes.
export function useCrumb(label) {
  const { setCrumb } = useContext(CrumbContext);
  useEffect(() => {
    setCrumb(label || '');
    return () => setCrumb('');
  }, [label, setCrumb]);
}
