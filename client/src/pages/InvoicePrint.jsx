import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import InvoiceDocument from '../components/InvoiceDocument.jsx';

// Clean, printable invoice (opens the browser print dialog; "Save as PDF" works too)
export default function InvoicePrint() {
  const { id } = useParams();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/invoices/${id}`)
      .then((res) => {
        setInv(res.data);
        document.title = `${res.data.number} · Brightloop Software`;
        setTimeout(() => window.print(), 400);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (!inv) return <p className="p-10 text-center text-sm text-slate-500">{error || 'Preparing invoice…'}</p>;
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl p-8 print:p-0">
        <div className="mb-6 flex justify-end gap-2 print:hidden">
          <button className="btn-secondary" onClick={() => window.close()}>Close</button>
          <button className="btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
        </div>
        <InvoiceDocument inv={inv} />
        <p className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          This is a computer generated invoice. Thank you for your business.
        </p>
      </div>
    </div>
  );
}
