import Icon from './Icon.jsx';

// Same rules as the server (server/src/utils/validation.js)
export const PASSWORD_RULES = [
  { label: 'More than 8 characters', test: (p) => p.length > 8 },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'One special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export const isStrongPassword = (p) => PASSWORD_RULES.every((r) => r.test(p));

// Live checklist shown under password fields
export default function PasswordRules({ password }) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-700' : 'text-slate-500'}`}>
            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${ok ? 'bg-emerald-600 text-white' : 'border border-slate-300'}`}>
              {ok && <Icon name="check" className="h-2.5 w-2.5" />}
            </span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
