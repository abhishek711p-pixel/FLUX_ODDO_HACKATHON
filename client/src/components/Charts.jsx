// Small dependency-free SVG charts in the app's palette. All values come from the API (real data only).
// Interactive: they animate in, smoothly animate when filters change, and zoom the hovered part with a tooltip.
import { useEffect, useId, useState } from 'react';
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

const pct = (v, total) => (total ? Math.round((v / total) * 100) : 0);

// true one frame after mount, so CSS transitions can animate from zero
function useMounted() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

// Dark floating label used by every chart
function Tip({ show, x, y, children, align = 'center' }) {
  if (!show) return null;
  // align: center / left / right = above the point; side-right / side-left = beside it (stays inside the card)
  const t = {
    center: 'translate(-50%, calc(-100% - 10px))',
    left: 'translate(0, calc(-100% - 10px))',
    right: 'translate(-100%, calc(-100% - 10px))',
    'side-right': 'translate(10px, -50%)',
    'side-left': 'translate(calc(-100% - 10px), -50%)',
  }[align];
  return (
    <div className="pointer-events-none absolute z-20 whitespace-nowrap rounded-lg bg-brand-900 px-3 py-2 text-xs text-white shadow-lg"
      style={{ left: x, top: y, transform: t }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut: hover a slice or a legend row to zoom that slice; the centre shows its numbers
export function Donut({ segments, centerValue, centerLabel, money = false, size = 168 }) {
  const mounted = useMounted();
  const [active, setActive] = useState(null);
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 42, c = 2 * Math.PI * r;
  const fmt = (v) => (money ? compact(v) : v.toLocaleString('en-IN'));
  const color = (s, i) => s.color || CHART_COLORS[i % CHART_COLORS.length];
  const cur = active !== null ? segments[active] : null;
  let offset = 0;

  return (
    <div className="@container"><div className="flex flex-col items-center gap-4 @md:flex-row @md:items-center">
      <svg viewBox="0 0 120 120" width={size} height={size} className="shrink-0 overflow-visible" role="img" aria-label={centerLabel}
        onMouseLeave={() => setActive(null)}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#EEF4EA" strokeWidth="16" />
        {total > 0 && segments.map((s, i) => {
          const len = (s.value / total) * c;
          const isOn = active === i;
          const el = (
            <circle key={s.label} cx="60" cy="60" r={r} fill="none" stroke={color(s, i)}
              strokeWidth={isOn ? 22 : 16}
              strokeDasharray={mounted ? `${len} ${c - len}` : `0 ${c}`} strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
              opacity={active === null || isOn ? 1 : 0.35}
              className="cursor-pointer motion-safe:transition-[stroke-dasharray,stroke-width,opacity] motion-safe:duration-700 motion-safe:ease-out"
              onMouseEnter={() => setActive(i)}>
              <title>{`${s.label}: ${money ? formatINR(s.value) : s.value.toLocaleString('en-IN')} (${pct(s.value, total)}%)`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        <text x="60" y={cur ? 54 : 58} textAnchor="middle" className="fill-ink font-display" style={{ fontSize: money ? 11 : 15, fontWeight: 700 }}>
          {cur ? fmt(cur.value) : centerValue}
        </text>
        <text x="60" y={cur ? 66 : 72} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 8 }}>
          {cur ? cur.label.replace(/ \(\d+\)$/, '') : centerLabel}
        </text>
        {cur && <text x="60" y="77" textAnchor="middle" className="fill-brand-700" style={{ fontSize: 8, fontWeight: 600 }}>{pct(cur.value, total)}%</text>}
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-0.5 text-sm" onMouseLeave={() => setActive(null)}>
        {segments.map((s, i) => (
          <li key={s.label} onMouseEnter={() => setActive(i)}
            className={`flex cursor-default items-center gap-2 rounded-md px-1.5 py-1 transition ${active === i ? 'bg-brand-50' : ''} ${active !== null && active !== i ? 'opacity-50' : ''}`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full transition-transform ${active === i ? 'scale-150' : ''}`} style={{ background: color(s, i) }} />
            <span className="min-w-0 flex-1 truncate text-slate-600">{s.label}</span>
            <span className="font-medium tabular-nums">{fmt(s.value)}</span>
            <span className="w-10 text-right text-xs text-slate-500 tabular-nums">{pct(s.value, total)}%</span>
          </li>
        ))}
      </ul>
    </div></div>
  );
}

// ---------------------------------------------------------------------------
// Line with a soft area: draws itself in; hover anywhere to zoom the nearest point and see its value
export function AreaLine({ points, money = false, height = 150 }) {
  const gid = useId().replace(/:/g, '');
  const mounted = useMounted();
  const [active, setActive] = useState(null);
  const w = 320, h = height, padL = 20, padR = 20, padT = 18, padB = 22;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i) => padL + (i * (w - padL - padR)) / Math.max(1, points.length - 1);
  const y = (v) => padT + (1 - v / max) * (h - padT - padB);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${h - padB} L${x(0)},${h - padB} Z`;
  const fmt = (v) => (money ? compact(v) : v.toLocaleString('en-IN'));
  const step = (w - padL - padR) / Math.max(1, points.length - 1);
  const cur = active !== null ? points[active] : null;
  const prev = active > 0 ? points[active - 1] : null;

  return (
    <div className="relative" onMouseLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full overflow-visible" role="img" aria-label="Trend">
        <defs>
          <linearGradient id={`area${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2F6B3F" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2F6B3F" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padL} x2={w - padR} y1={h - padB} y2={h - padB} stroke="#E2E8DD" />
        <path d={area} fill={`url(#area${gid})`} className="motion-safe:transition-opacity motion-safe:duration-700" opacity={mounted ? 1 : 0} />
        <path d={line} fill="none" stroke="#2F6B3F" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
          pathLength="1" strokeDasharray="1" strokeDashoffset={mounted ? 0 : 1}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-out" />
        {cur && <line x1={x(active)} x2={x(active)} y1={padT - 6} y2={h - padB} stroke="#2F6B3F" strokeOpacity="0.25" strokeDasharray="3 3" />}
        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.value)} r={active === i ? 6 : 3.4} fill={active === i ? '#2F6B3F' : '#fff'} stroke="#2F6B3F" strokeWidth="2"
              className="motion-safe:transition-all motion-safe:duration-200" />
            <text x={x(i)} y={y(p.value) - 8} textAnchor="middle" className="fill-ink" style={{ fontSize: 8.5, fontWeight: 600 }}
              opacity={active === null || active === i ? 1 : 0.35}>
              {fmt(p.value)}
            </text>
            <text x={x(i)} y={h - 7} textAnchor="middle" className={active === i ? 'fill-brand-700' : 'fill-slate-500'}
              style={{ fontSize: 8.5, fontWeight: active === i ? 700 : 400 }}>{p.label}</text>
            {/* invisible hover column for this point */}
            <rect x={x(i) - step / 2} y={0} width={step} height={h} fill="transparent" onMouseEnter={() => setActive(i)} />
          </g>
        ))}
      </svg>
      {cur && (
        <Tip show x={`${(x(active) / w) * 100}%`} y={`${(y(cur.value) / h) * 100}%`}
          align={active === 0 ? 'left' : active === points.length - 1 ? 'right' : 'center'}>
          <div className="font-semibold">{cur.label}</div>
          <div>{money ? formatINR(cur.value) : cur.value.toLocaleString('en-IN')}</div>
          {prev && prev.value > 0 && (
            <div className={cur.value >= prev.value ? 'text-emerald-300' : 'text-red-300'}>
              {cur.value >= prev.value ? '▲' : '▼'} {Math.abs(Math.round(((cur.value - prev.value) / prev.value) * 100))}% vs {prev.label}
            </div>
          )}
        </Tip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Two bars per group (e.g. invoiced vs collected): bars grow in; hover a month to zoom it and see both values
export function PairBars({ groups, aLabel, bLabel, height = 170, rateLabel }) {
  const mounted = useMounted();
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...groups.flatMap((g) => [g.a, g.b]));
  const cur = active !== null ? groups[active] : null;
  const h = (v) => (mounted ? `${(v / max) * 100}%` : '0%');

  return (
    <div>
      <div className="relative flex items-end gap-3" style={{ height }} onMouseLeave={() => setActive(null)}>
        {groups.map((g, i) => (
          <div key={g.label} onMouseEnter={() => setActive(i)}
            className={`flex h-full flex-1 cursor-default flex-col justify-end rounded-lg transition ${active === i ? 'bg-brand-50' : ''}`}>
            <div className={`flex flex-1 origin-bottom items-end justify-center gap-1 motion-safe:transition-transform motion-safe:duration-200 ${active === i ? 'scale-x-110 scale-y-[1.04]' : ''} ${active !== null && active !== i ? 'opacity-40' : ''}`}>
              <div className="w-1/3 max-w-6 rounded-t bg-brand-200 motion-safe:transition-[height] motion-safe:duration-700 motion-safe:ease-out" style={{ height: h(g.a) }} />
              <div className="w-1/3 max-w-6 rounded-t bg-brand-600 motion-safe:transition-[height] motion-safe:duration-700 motion-safe:ease-out" style={{ height: h(g.b), transitionDelay: mounted ? '0ms' : `${i * 60}ms` }} />
            </div>
          </div>
        ))}
        {cur && (
          <Tip show y="45%"
            x={active < groups.length / 2 ? `${((active + 1) / groups.length) * 100}%` : `${(active / groups.length) * 100}%`}
            align={active < groups.length / 2 ? 'side-right' : 'side-left'}>
            <div className="mb-1 font-semibold">{cur.label}</div>
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand-200" />{aLabel}: <b>{formatINR(cur.a)}</b></div>
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand-100" />{bLabel}: <b>{formatINR(cur.b)}</b></div>
            {cur.a > 0 && <div className="mt-1 text-brand-100">{Math.round((cur.b / cur.a) * 100)}% {rateLabel || `${bLabel.toLowerCase()} of ${aLabel.toLowerCase()}`}</div>}
          </Tip>
        )}
      </div>
      <div className="mt-2 flex gap-3 border-t border-slate-200 pt-2">
        {groups.map((g, i) => (
          <div key={g.label} className={`flex-1 text-center text-xs transition ${active === i ? 'font-semibold text-brand-700' : ''}`}>
            <div className={active === i ? '' : 'text-slate-600'}>{g.label}</div>
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

// ---------------------------------------------------------------------------
// Horizontal share bars (e.g. revenue by plan): bars slide in; hover a row to zoom it
export function ShareBars({ rows, suffix = '' }) {
  const mounted = useMounted();
  const [active, setActive] = useState(null);
  const total = rows.reduce((a, r) => a + r.value, 0);
  const shade = (i) => (i === 0 ? '#2F6B3F' : i === 1 ? '#5C8A63' : '#7FA672');
  return (
    <div className="space-y-1" onMouseLeave={() => setActive(null)}>
      {rows.map((r, i) => (
        <div key={r.label} onMouseEnter={() => setActive(i)}
          className={`rounded-lg px-2 py-1.5 motion-safe:transition-all motion-safe:duration-200 ${active === i ? 'scale-[1.02] bg-brand-50' : ''} ${active !== null && active !== i ? 'opacity-50' : ''}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-medium">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{formatINR(r.value)}<span className="text-xs font-normal text-slate-500">{suffix}</span></span>
          </div>
          <div className={`rounded-full bg-brand-50 motion-safe:transition-all ${active === i ? 'h-3' : 'h-2'}`}>
            <div className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
              style={{ width: mounted ? `${total ? (r.value / total) * 100 : 0}%` : '0%', background: shade(i), transitionDelay: `${i * 70}ms` }} />
          </div>
          <div className="mt-0.5 flex justify-between text-xs text-slate-500"><span>{r.sub}</span><span className="tabular-nums">{pct(r.value, total)}% of total</span></div>
        </div>
      ))}
    </div>
  );
}
