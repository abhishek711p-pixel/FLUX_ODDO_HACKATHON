import { Children, Fragment, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Drop-in replacement for <select> that looks the same on every OS (the native
// list follows the system theme, which turned dark on macOS dark mode).
// Usage is identical: <Select value onChange={(e) => e.target.value}><option value="">…</option></Select>

function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf(node.props.children);
  return '';
}

function readOptions(children, out = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) return readOptions(child.props.children, out);
    if (child.type === 'option') {
      const label = textOf(child.props.children);
      out.push({ value: String(child.props.value ?? label), label, disabled: !!child.props.disabled });
    }
  });
  return out;
}

export default function Select({ value, onChange, children, className = 'input', id, disabled, ...rest }) {
  const btnClass = className.split(/\s+/).map((c) => (c === 'input' ? 'select-btn' : c)).join(' ');
  const options = readOptions(children);
  const current = String(value ?? '');
  const selectedIndex = options.findIndex((o) => o.value === current);
  const selected = options[selectedIndex];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();

  const choose = (opt) => {
    if (!opt || opt.disabled) return;
    setOpen(false);
    buttonRef.current?.focus();
    if (opt.value !== current) onChange?.({ target: { value: opt.value, id } });
  };

  const place = useCallback(() => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const up = below < 220 && r.top > below;
    setPos({
      left: r.left,
      minWidth: r.width,
      maxHeight: Math.min(288, (up ? r.top : below) - 8),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, []);

  const openList = () => {
    if (disabled) return;
    place();
    setActive(selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled));
    setOpen(true);
  };

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  // Close on outside click, page scroll or resize
  useEffect(() => {
    if (!open) return;
    const away = (e) => {
      if (buttonRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const scrolled = (e) => { if (!listRef.current?.contains(e.target)) setOpen(false); };
    const resized = () => setOpen(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', resized);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', scrolled, true);
      window.removeEventListener('resize', resized);
    };
  }, [open]);

  // Keep the highlighted option visible
  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const step = (dir) => {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) return setActive(i);
    }
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(options.findIndex((o) => !o.disabled)); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      // Type to jump, like a native select
      const now = Date.now();
      typed.current.text = (now - typed.current.at > 700 ? '' : typed.current.text) + e.key.toLowerCase();
      typed.current.at = now;
      const hit = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        id={id}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`${btnClass} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${open ? 'border-brand-500 ring-3 ring-brand-500/15' : ''}`}
        {...rest}
      >
        {/* Width fits the longest option, like a native select */}
        <span className="grid min-w-0">
          {options.map((o) => (
            <span key={o.value} aria-hidden className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap">{o.label}</span>
          ))}
          <span className={`col-start-1 row-start-1 truncate ${selected ? '' : 'text-slate-400'}`}>{selected ? selected.label : 'Choose…'}</span>
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && pos && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{ position: 'fixed', ...pos }}
          className="z-[70] overflow-auto rounded-lg border border-slate-200 bg-white p-1 text-sm text-ink shadow-lg"
        >
          {options.map((o, i) => {
            const isSelected = o.value === current;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled}
                onMouseEnter={() => !o.disabled && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                className={`flex cursor-pointer items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-2
                  ${o.disabled ? 'cursor-not-allowed text-slate-300' : ''}
                  ${i === active && !o.disabled ? 'bg-brand-50 text-brand-700' : ''}
                  ${isSelected ? 'font-medium text-brand-700' : ''}`}
              >
                <span>{o.label}</span>
                {isSelected && (
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4 text-brand-600">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </>
  );
}
