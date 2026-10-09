import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Search, X } from 'lucide-react';
import { cx } from '../lib/util';
import { parseMoney, parseQty, toInput } from '../lib/money';
import { useFormat, useT } from '../state/app';
import { presetRange, dayKey, parseDayKey, endOfDay, type DateRange, type RangePreset } from '../lib/dates';

// ---------- toasts ----------

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}
const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }));
let toastSeq = 0;

export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastSeq;
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, text, kind }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((x) => x.id !== id) })), kind === 'error' ? 4500 : 2600);
}

export function Toasts() {
  const items = useToasts((s) => s.items);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx('toast', t.kind === 'error' && 'error')}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------- overlays ----------

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

export function Sheet(props: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  actions?: ReactNode;
}) {
  const t = useT();
  useEscape(props.onClose);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={cx('sheet', props.wide && 'wide')} role="dialog" aria-modal="true">
        <div className="sheet-head">
          <h2>{props.title}</h2>
          {props.actions}
          <button className="btn ghost icon" onClick={props.onClose} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>
        <div className="sheet-body">{props.children}</div>
        {props.footer && <div className="sheet-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

export function Dialog(props: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEscape(props.onClose);
  return (
    <div className="scrim center" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="dialog" role="dialog" aria-modal="true">
        <div className="sheet-head">
          <h2>{props.title}</h2>
        </div>
        <div className="sheet-body">{props.children}</div>
        {props.footer && <div className="sheet-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

// ---------- form controls ----------

export function Field(props: { label: ReactNode; help?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={props.htmlFor}>{props.label}</label>
      {props.children}
      {props.error ? <div className="error">{props.error}</div> : props.help ? <div className="help">{props.help}</div> : null}
    </div>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <span className="switch">
      <input
        type="checkbox"
        role="switch"
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span />
    </span>
  );
}

export function Seg<V extends string>(props: { value: V; options: { value: V; label: ReactNode }[]; onChange: (v: V) => void; label?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          className={cx(props.value === o.value && 'on')}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Money input that edits major units but reports minor units. */
export function MoneyInput(props: {
  value: number | null;
  onChange: (minor: number | null) => void;
  id?: string;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { decimals } = useFormat();
  const [text, setText] = useState(props.value === null ? '' : toInput(props.value, decimals));
  const last = useRef(props.value);
  useEffect(() => {
    if (props.value !== last.current) {
      last.current = props.value;
      setText(props.value === null ? '' : toInput(props.value, decimals));
    }
  }, [props.value, decimals]);
  const invalid = text !== '' && parseMoney(text, decimals) === null;
  return (
    <input
      id={props.id}
      className={cx('input num', invalid && 'invalid', props.className)}
      inputMode="decimal"
      autoFocus={props.autoFocus}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseMoney(e.target.value, decimals);
        last.current = v;
        props.onChange(v);
      }}
    />
  );
}

export function QtyInput(props: { value: number | null; onChange: (q: number | null) => void; id?: string; autoFocus?: boolean; ariaLabel?: string }) {
  const [text, setText] = useState(props.value === null ? '' : String(props.value));
  const last = useRef(props.value);
  useEffect(() => {
    if (props.value !== last.current) {
      last.current = props.value;
      setText(props.value === null ? '' : String(props.value));
    }
  }, [props.value]);
  const invalid = text !== '' && parseQty(text) === null;
  return (
    <input
      id={props.id}
      className={cx('input num', invalid && 'invalid')}
      inputMode="decimal"
      autoFocus={props.autoFocus}
      aria-label={props.ariaLabel}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseQty(e.target.value);
        last.current = v;
        props.onChange(v);
      }}
    />
  );
}

export function SearchBox(props: { value: string; onChange: (v: string) => void; placeholder?: string; onEnter?: () => void; autoFocus?: boolean; inputRef?: React.Ref<HTMLInputElement> }) {
  return (
    <div className="search">
      <Search size={18} />
      <input
        ref={props.inputRef}
        className="input"
        type="search"
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        autoFocus={props.autoFocus}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && props.onEnter) {
            e.preventDefault();
            props.onEnter();
          }
        }}
      />
    </div>
  );
}

export function Tabs<V extends string>(props: { value: V; tabs: { value: V; label: ReactNode }[]; onChange: (v: V) => void }) {
  return (
    <div className="tabs" role="tablist">
      {props.tabs.map((tb) => (
        <button key={tb.value} role="tab" aria-selected={props.value === tb.value} className={cx(props.value === tb.value && 'on')} onClick={() => props.onChange(tb.value)}>
          {tb.label}
        </button>
      ))}
    </div>
  );
}

export function Empty(props: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {props.icon}
      <div>{props.children}</div>
      {props.action}
    </div>
  );
}

export function PageHead(props: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{props.title}</h1>
      {props.children}
    </div>
  );
}

// ---------- date range ----------

const PRESETS: Exclude<RangePreset, 'custom'>[] = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth', 'thisYear'];

export function useRange(initial: Exclude<RangePreset, 'custom'> = 'today') {
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [custom, setCustom] = useState<DateRange>(presetRange(initial));
  const range = preset === 'custom' ? custom : presetRange(preset);
  return { preset, setPreset, range, custom, setCustom };
}

export function RangePicker(props: ReturnType<typeof useRange>) {
  const t = useT();
  return (
    <>
      <select
        className="select"
        aria-label={t('reports.period')}
        value={props.preset}
        onChange={(e) => {
          const p = e.target.value as RangePreset;
          if (p === 'custom') props.setCustom(props.range);
          props.setPreset(p);
        }}
      >
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {t(`range.${p}`)}
          </option>
        ))}
        <option value="custom">{t('range.custom')}</option>
      </select>
      {props.preset === 'custom' && (
        <>
          <input
            type="date"
            className="input"
            aria-label={t('common.from')}
            value={dayKey(props.custom.from)}
            onChange={(e) => e.target.value && props.setCustom({ ...props.custom, from: parseDayKey(e.target.value) })}
          />
          <input
            type="date"
            className="input"
            aria-label={t('common.to')}
            value={dayKey(props.custom.to)}
            onChange={(e) => e.target.value && props.setCustom({ ...props.custom, to: endOfDay(parseDayKey(e.target.value)) })}
          />
        </>
      )}
    </>
  );
}
