export interface MoneyFormat {
  symbol: string;
  position: 'before' | 'after';
  decimals: number;
  digits: 'latin' | 'myanmar';
}

const MM_DIGITS = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];

export function localizeDigits(s: string, digits: 'latin' | 'myanmar'): string {
  if (digits === 'latin') return s;
  return s.replace(/[0-9]/g, (d) => MM_DIGITS[Number(d)]);
}

/** Convert Myanmar digits typed by the user back to Latin digits. */
export function latinizeDigits(s: string): string {
  return s.replace(/[၀-၉]/g, (d) => String(d.charCodeAt(0) - 0x1040));
}

export function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format a minor-unit integer as plain number text (no symbol). */
export function formatNumber(minor: number, decimals: number, digits: 'latin' | 'myanmar' = 'latin'): string {
  const neg = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const factor = 10 ** decimals;
  const major = Math.floor(abs / factor);
  const frac = abs % factor;
  let out = groupThousands(String(major));
  if (decimals > 0) out += '.' + String(frac).padStart(decimals, '0');
  return localizeDigits((neg ? '-' : '') + out, digits);
}

export function formatMoney(minor: number, f: MoneyFormat): string {
  const n = formatNumber(minor, f.decimals, f.digits);
  if (!f.symbol) return n;
  return f.position === 'before' ? `${f.symbol}${n}` : `${n} ${f.symbol}`;
}

/** Format a quantity: integers without decimals, fractions up to 3 places. */
export function formatQty(q: number, digits: 'latin' | 'myanmar' = 'latin'): string {
  const s = Number.isInteger(q) ? groupThousands(String(q)) : String(Math.round(q * 1000) / 1000);
  return localizeDigits(s, digits);
}

/** Parse what a person typed ("12,500", "12.5", Myanmar digits) into minor units. */
export function parseMoney(input: string, decimals: number): number | null {
  const cleaned = latinizeDigits(input).replace(/[,\s]/g, '').trim();
  if (cleaned === '') return null;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** decimals);
}

export function parseQty(input: string): number | null {
  const cleaned = latinizeDigits(input).replace(/[,\s]/g, '').trim();
  if (cleaned === '' || !/^\d*(\.\d*)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

/** Minor units → the editable string shown in an input. */
export function toInput(minor: number, decimals: number): string {
  if (decimals === 0) return String(minor);
  return (minor / 10 ** decimals).toFixed(decimals);
}
