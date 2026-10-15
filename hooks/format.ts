import type { TokenBaseline, TokenDay, TokenScan } from "../types";

export type TokenSum = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  answers: number;
  total: number;
};

export type TokenWindow = { key: "today" | "week" | "month" | "all"; label: string; sum: TokenSum };

const DAY_MS = 86_400_000;

/** Verschiebt ein JJJJ-MM-TT-Datum um `days` Tage (kalendarisch, ohne Zeitzone). */
export function addDays(day: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

export function sumDays(days: Record<string, TokenDay>, from?: string, to?: string): TokenSum {
  const sum: TokenSum = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, answers: 0, total: 0 };
  for (const [day, v] of Object.entries(days)) {
    if ((from !== undefined && day < from) || (to !== undefined && day > to)) continue;
    sum.input += v[0];
    sum.output += v[1];
    sum.cacheWrite += v[2];
    sum.cacheRead += v[3];
    sum.answers += v[4];
  }
  sum.total = sum.input + sum.output + sum.cacheWrite + sum.cacheRead;
  return sum;
}

/** Heute, 7 und 30 Kalendertage (heute eingeschlossen) und Gesamt, mit Startwert. */
export function windows(scan: TokenScan, baseline: TokenBaseline | null): [TokenWindow, TokenWindow, TokenWindow, TokenWindow] {
  const days = scan.days ?? {};
  const today = scan.today ?? Object.keys(days).sort().at(-1) ?? "1970-01-01";
  const all = baseline ? sumDays(days, addDays(baseline.day, 1)) : sumDays(days);
  if (baseline) all.total += baseline.tokens;
  return [
    { key: "today", label: "Heute", sum: sumDays(days, today) },
    { key: "week", label: "7 Tage", sum: sumDays(days, addDays(today, -6)) },
    { key: "month", label: "30 Tage", sum: sumDays(days, addDays(today, -29)) },
    { key: "all", label: "Gesamt", sum: all },
  ];
}

const one = (n: number) => n.toFixed(1).replace(".", ",").replace(/,0$/, "");

/** Kurzform: 16,7 Mrd · 245,3 Mio · 12,4 Tsd · 830. */
export function short(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${one(n / 1e9)} Mrd`;
  if (abs >= 1e6) return `${one(n / 1e6)} Mio`;
  if (abs >= 1e3) return `${one(n / 1e3)} Tsd`;
  return String(Math.round(n));
}

/** Volle Zahl mit Punkt als Tausendertrenner. */
export function full(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** JJJJ-MM-TT → TT.MM.JJJJ. */
export function germanDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Liest eine Tokenzahl: "50B", "50 Mrd", "50,5 Mrd.", "50e9", "50.000.000.000",
 * "245M", "245 Mio". Unlesbar: undefined.
 */
export function parseAmount(text: string): number | undefined {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  const match = /^([0-9.,]+(?:e[0-9]+)?)(mrd\.?|b|mio\.?|m|tsd\.?|k)?$/.exec(t);
  if (!match) return undefined;
  let digits = match[1] ?? "";
  if (/e/.test(digits)) {
    const value = Number(digits.replace(",", "."));
    return Number.isFinite(value) ? value : undefined;
  }
  const unit = match[2] ?? "";
  if (unit === "") digits = digits.replace(/[.,]/g, "");
  else digits = digits.replace(/\./g, "").replace(",", ".");
  const base = Number(digits);
  if (!Number.isFinite(base)) return undefined;
  const factor = unit.startsWith("mrd") || unit === "b" ? 1e9 : unit.startsWith("mio") || unit === "m" ? 1e6 : unit.startsWith("tsd") || unit === "k" ? 1e3 : 1;
  return Math.round(base * factor);
}

/** Liest "14.10.2026", "14.10." (laufendes Jahr von `today`) oder "2026-10-14". */
export function parseDay(text: string, today: string): string | undefined {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/.exec(t);
  if (!match) return undefined;
  const [, day = "", month = "", year = today.slice(0, 4)] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Ein Balken je Tag der letzten `count` Tage, aus den Blockzeichen ▁ bis █. */
export function sparkline(days: Record<string, TokenDay>, today: string, count = 30): string {
  const blocks = "▁▂▃▄▅▆▇█";
  const values: number[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const v = days[addDays(today, -i)];
    values.push(v ? v[0] + v[1] + v[2] + v[3] : 0);
  }
  const max = Math.max(...values);
  return values.map((v) => (v === 0 || max === 0 ? " " : blocks.charAt(Math.min(7, Math.floor((v / max) * 7.999))))).join("");
}
