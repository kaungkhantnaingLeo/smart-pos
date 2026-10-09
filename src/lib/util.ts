export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return toHex(a.buffer);
}

/**
 * Hash a PIN with a per-user salt. This keeps PINs from being readable in a
 * backup file; it is not protection against someone with full device access.
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
}

export function download(filename: string, content: string, type = 'text/plain'): void {
  // Prefix CSV with a BOM so Excel opens Myanmar text as UTF-8.
  const body = type.startsWith('text/csv') ? '﻿' + content : content;
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sumBy<T>(items: T[], f: (t: T) => number): number {
  return items.reduce((s, x) => s + f(x), 0);
}

export function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Case-insensitive match against several fields. */
export function matches(q: string, ...fields: (string | undefined | null)[]): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return fields.some((f) => f && f.toLowerCase().includes(s));
}
