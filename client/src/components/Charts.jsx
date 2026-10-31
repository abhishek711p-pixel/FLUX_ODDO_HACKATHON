// Small dependency-free SVG charts in the app's palette. All values come from the API (real data only).
import { formatINR } from '../utils/format.js';

// Distinct hues that still sit in the green palette (no red: red means overdue in this app)
export const CHART_COLORS = ['#2F6B3F', '#7FA672', '#C9A227', '#4F7FA8', '#B7CDA9', '#8C6BB1', '#1B3524', '#94A3B8'];

const compact = (v) => {
  const n = Math.abs(v);
  if (n >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
};
export { compact as compactINR };

// Donut with a total in the middle and a legend with values and percentages
export function Donut({ segments, centerValue, centerLabel, money = false, size = 168 }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 42, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="@container"><div className="flex flex-col items-center gap-4 @md:flex-row @md:items-center">
      <svg viewBox="0 0 120 120" width={size} height={size} className="shrink-0" role="img" aria-label={centerLabel}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#EEF4EA" strokeWidth="16" />
        {total > 0 && segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={s.label} cx="60" cy="60" r={r} fill="none" stroke={s.color || CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)">
              <title>{`${s.label}: ${money ? formatINR(s.value) : s.value.toLocaleString('en-IN')}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        <text x="60" y="58" textAnchor="middle" className="fill-ink font-display" style={{ fontSize: money ? 11 : 15, fontWeight: 700 }}>{centerValue}</text>
        <text x="60" y="72" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 8 }}>{centerLabel}</text>
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color || CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate text-slate-600">{s.label}</span>
            <span className="font-medium tabular-nums">{money ? compact(s.value) : s.value.toLocaleString('en-IN')}</span>
            <span className="w-10 text-right text-xs text-slate-500 tabular-nums">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div></div>
  );
}

// Line with a soft filled area. points: [{ label, value }]
export function AreaLine({ points, money = false, height = 150 }) {
  const w = 320, h = height, padL = 20, padR = 20, padT = 16, padB = 22;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i) => padL + (i * (w - padL - padR)) / Math.max(1, points.length - 1);
  const y = (v) => padT + (1 - v / max) * (h - padT - padB);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${h - padB} L${x(0)},${h - padB} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Trend">
      <defs>
        <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2F6B3F" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2F6B3F" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={padL} x2={w - padR} y1={h - padB} y2={h - padB} stroke="#E2E8DD" />
      <path d={area} fill="url(#areaFill)" />
      <path d={line} fill="none" stroke="#2F6B3F" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r="3.4" fill="#fff" stroke="#2F6B3F" strokeWidth="2">
            <title>{`${p.label}: ${money ? formatINR(p.value) : p.value.toLocaleString('en-IN')}`}</title>
          </circle>
          <text x={x(i)} y={y(p.value) - 7} textAnchor="middle" className="fill-ink" style={{ fontSize: 8.5, fontWeight: 600 }}>
            {money ? compact(p.value) : p.value.toLocaleString('en-IN')}
          </text>
          <text x={x(i)} y={h - 7} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 8.5 }}>{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

// Two bars per group (e.g. billed vs paid). groups: [{ label, a, b }]
export function PairBars({ groups, aLabel, bLabel, height = 170 }) {
  const max = Math.max(1, ...groups.flatMap((g) => [g.a, g.b]));
  return (
    <div>
      <div className="flex items-end gap-3" style={{ height }}>
        {groups.map((g) => (
          <div key={g.label} className="flex h-full flex-1 flex-col justify-end">
            <div className="flex flex-1 items-end justify-center gap-1">
              <div className="w-1/3 max-w-6 rounded-t bg-brand-200" style={{ height: `${(g.a / max) * 100}%` }} title={`${aLabel}: ${formatINR(g.a)}`} />
              <div className="w-1/3 max-w-6 rounded-t bg-brand-600" style={{ height: `${(g.b / max) * 100}%` }} title={`${bLabel}: ${formatINR(g.b)}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3 border-t border-slate-200 pt-2">
        {groups.map((g) => (
          <div key={g.label} className="flex-1 text-center text-xs">
            <div className="text-slate-600">{g.label}</div>
            <div className="text-slate-400">{compact(g.b)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-200" />{aLabel}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-600" />{bLabel}</span>
      </div>
    </div>
  );
}

// Horizontal share bars. rows: [{ label, sub, value }]
export function ShareBars({ rows, suffix = '' }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-medium">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{formatINR(r.value)}<span className="text-xs font-normal text-slate-500">{suffix}</span></span>
          </div>
          <div className="h-2 rounded-full bg-brand-50">
            <div className="h-2 rounded-full" style={{ width: `${total ? (r.value / total) * 100 : 0}%`, background: i === 0 ? '#2F6B3F' : i === 1 ? '#5C8A63' : '#7FA672' }} />
          </div>
          <div className="mt-0.5 flex justify-between text-xs text-slate-500"><span>{r.sub}</span><span className="tabular-nums">{total ? Math.round((r.value / total) * 100) : 0}% of total</span></div>
        </div>
      ))}
    </div>
  );
}
