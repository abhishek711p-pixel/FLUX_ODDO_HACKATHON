import Icon from './Icon.jsx';

const STEPS = ['draft', 'quotation', 'confirmed', 'active', 'closed'];
const LABELS = { draft: 'Draft', quotation: 'Quotation', confirmed: 'Confirmed', active: 'Active', closed: 'Closed' };

// Draft → Quotation → Confirmed → Active → Closed, with Paused shown on the Active step
export default function StatusStepper({ status }) {
  const current = STEPS.indexOf(status === 'paused' ? 'active' : status);
  return (
    <ol className="flex w-full items-center">
      {STEPS.map((step, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={step} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center gap-1">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                done ? 'bg-brand-600 text-white' : now ? (status === 'paused' ? 'bg-amber-500 text-white' : 'bg-brand-600 text-white ring-4 ring-brand-100') : 'bg-slate-200 text-slate-500'}`}>
                {done ? <Icon name="check" className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`whitespace-nowrap text-xs ${now ? 'font-semibold text-ink' : 'text-slate-500'}`}>
                {now && status === 'paused' ? 'Paused' : LABELS[step]}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className={`mx-2 mb-5 h-0.5 flex-1 ${i < current ? 'bg-brand-600' : 'bg-slate-200'}`} />}
          </li>
        );
      })}
    </ol>
  );
}
