import { expect, test } from "claude-code/testing";

import type { TokenScan } from "../types";
import { addDays, full, parseAmount, parseDay, short, sparkline, windows } from "../hooks/format";

const scan: TokenScan = {
  ok: true,
  today: "2026-10-15",
  days: {
    "2026-10-15": [10, 20, 30, 40, 1], // heute: 100
    "2026-10-10": [100, 0, 0, 0, 2], // in 7 Tagen
    "2026-09-20": [1000, 0, 0, 0, 3], // in 30 Tagen
    "2026-07-30": [10000, 0, 0, 0, 4], // nur Gesamt
  },
};

test("Zeiträume zählen Kalendertage einschließlich heute", async () => {
  const [today, week, month, all] = windows(scan, null);
  expect(today.sum.total).toBe(100);
  expect(week.sum.total).toBe(200);
  expect(month.sum.total).toBe(1200);
  expect(all.sum.total).toBe(11200);
  expect(all.sum.answers).toBe(10);
});

test("Startwert ersetzt alles bis zu seinem Datum", async () => {
  const all = windows(scan, { tokens: 50e9, day: "2026-10-14" })[3];
  expect(all.sum.total).toBe(50e9 + 100);
});

test("Datum, Zahlen und Kurzform", async () => {
  expect(addDays("2026-10-15", -29)).toBe("2026-09-16");
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  expect(parseAmount("50B")).toBe(50e9);
  expect(parseAmount("50,5Mrd")).toBe(50.5e9);
  expect(parseAmount("50.000.000.000")).toBe(50e9);
  expect(parseAmount("245Mio")).toBe(245e6);
  expect(parseAmount("5e10")).toBe(5e10);
  expect(parseAmount("viel")).toBe(undefined);
  expect(parseDay("14.10.2026", "2026-10-15")).toBe("2026-10-14");
  expect(parseDay("1.9.", "2026-10-15")).toBe("2026-09-01");
  expect(short(16_710_454_085)).toBe("16,7 Mrd");
  expect(short(245_300_000)).toBe("245,3 Mio");
  expect(short(2_000_000_000)).toBe("2 Mrd");
  expect(full(16_710_454_085)).toBe("16.710.454.085");
});

test("Sparkline: ein Zeichen je Tag, leerer Tag leer, Maximum voll", async () => {
  const line = sparkline(scan.days ?? {}, "2026-10-15", 30);
  expect(line.length).toBe(30);
  expect(line.at(-1)).toBe("▁");
  expect(line.includes("█")).toBe(true);
});
