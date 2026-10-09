import { localizeDigits } from './money';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(ts: number | Date = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(ts: number | Date = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function startOfDay(ts: number | Date = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts: number | Date = Date.now()): number {
  return startOfDay(ts) + 86_400_000 - 1;
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function parseDayKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

export function formatDate(ts: number, fmt: string, digits: 'latin' | 'myanmar' = 'latin'): string {
  const d = new Date(ts);
  const s = fmt
    .replace('YYYY', String(d.getFullYear()))
    .replace('MM', pad(d.getMonth() + 1))
    .replace('DD', pad(d.getDate()));
  return localizeDigits(s, digits);
}

export function formatTime(ts: number, digits: 'latin' | 'myanmar' = 'latin'): string {
  const d = new Date(ts);
  return localizeDigits(`${pad(d.getHours())}:${pad(d.getMinutes())}`, digits);
}

export type RangePreset = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'last30' | 'thisYear' | 'custom';

export interface DateRange {
  from: number;
  to: number;
}

export function presetRange(p: Exclude<RangePreset, 'custom'>, now = Date.now()): DateRange {
  const today = startOfDay(now);
  const d = new Date(now);
  switch (p) {
    case 'today':
      return { from: today, to: endOfDay(now) };
    case 'yesterday':
      return { from: addDays(today, -1), to: today - 1 };
    case 'last7':
      return { from: addDays(today, -6), to: endOfDay(now) };
    case 'last30':
      return { from: addDays(today, -29), to: endOfDay(now) };
    case 'thisMonth':
      return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: endOfDay(now) };
    case 'lastMonth':
      return {
        from: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(),
        to: new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 1,
      };
    case 'thisYear':
      return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: endOfDay(now) };
  }
}

/** Document-number period for a reset policy. */
export function periodKey(reset: string, ts = Date.now()): string {
  const d = new Date(ts);
  const yy = pad(d.getFullYear() % 100);
  switch (reset) {
    case 'daily':
      return `${yy}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    case 'monthly':
      return `${yy}${pad(d.getMonth() + 1)}`;
    case 'yearly':
      return String(d.getFullYear());
    default:
      return '';
  }
}

export function formatDocNumber(prefix: string, device: string, period: string, seq: number, padding: number): string {
  const head = `${prefix}${device}`;
  const parts = [head, period, String(seq).padStart(padding, '0')].filter(Boolean);
  return parts.join('-');
}

const MY_WEEKDAYS = ['တနင်္ဂနွေ', 'တနင်္လာ', 'အင်္ဂါ', 'ဗုဒ္ဓဟူး', 'ကြာသပတေး', 'သောကြာ', 'စနေ'];
const MY_MONTHS = ['ဇန်နဝါရီ', 'ဖေဖော်ဝါရီ', 'မတ်', 'ဧပြီ', 'မေ', 'ဇွန်', 'ဇူလိုင်', 'ဩဂုတ်', 'စက်တင်ဘာ', 'အောက်တိုဘာ', 'နိုဝင်ဘာ', 'ဒီဇင်ဘာ'];

/** Browsers don't ship Burmese date names, so they're spelled out here. */
export function weekdayName(ts: number, lang: string, short = true): string {
  const d = new Date(ts).getDay();
  // Burmese has no common short forms, so the full names are used.
  if (lang === 'my') return MY_WEEKDAYS[d];
  return new Date(ts).toLocaleDateString('en-GB', { weekday: short ? 'short' : 'long' });
}

export function monthTitle(ts: number, lang: string, digits: 'latin' | 'myanmar' = 'latin'): string {
  const d = new Date(ts);
  if (lang === 'my') return `${MY_MONTHS[d.getMonth()]} ${localizeDigits(String(d.getFullYear()), digits)}`;
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
