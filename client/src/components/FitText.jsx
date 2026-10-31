import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState } from 'react';

// Groups FitText items (a row of cards) so they all shrink to the same size:
// one long amount does not make its card look different from the others.
const Group = createContext(null);

export function FitGroup({ children }) {
  const sizes = useRef(new Map());
  const [shared, setShared] = useState(null);
  const report = useCallback((id, size) => {
    if (size == null) sizes.current.delete(id); else sizes.current.set(id, size);
    const vals = [...sizes.current.values()];
    setShared(vals.length ? Math.min(...vals) : null);
  }, []);
  return <Group.Provider value={{ report, shared }}>{children}</Group.Provider>;
}

// One-line text (big amounts on cards) that shrinks its font until it fits the card,
// instead of spilling out. Full value stays available on hover.
export default function FitText({ children, className = '', min = 14, title }) {
  const ref = useRef(null);
  const group = useContext(Group);
  const id = useId();
  const own = useRef(null);
  const shared = group?.shared ?? null;
  const sharedRef = useRef(shared);
  sharedRef.current = shared;

  // Font size is set directly on the element (not through React) so measuring never fights a re-render
  const apply = () => {
    const el = ref.current;
    if (!el || own.current == null) return;
    const size = sharedRef.current != null ? Math.min(own.current, sharedRef.current) : own.current;
    el.style.fontSize = `${size}px`;
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 0.5 && size > min) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
      own.current = size;
      group?.report(id, size);
      apply();
    };
    fit();
    // Web fonts load after the first paint: fit again once they are ready
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement || el);
    return () => { ro.disconnect(); group?.report(id, null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, min]);

  // Another card in the row shrank: follow it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(apply, [shared]);

  return (
    <div ref={ref} title={title ?? (typeof children === 'string' ? children : undefined)}
      className={`block overflow-hidden whitespace-nowrap tabular-nums ${className}`}>
      {children}
    </div>
  );
}
