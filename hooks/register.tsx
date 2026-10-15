import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { TokenBaseline, TokenScan } from "../types";
import { addDays, full, germanDay, parseAmount, parseDay, short, sparkline, windows } from "./format";

// Die frühere Startkarte der Desktop-App, nachgebaut: Token-Verbrauch heute,
// 7 Tage, 30 Tage und gesamt. Gezählt wird von scripts/scan.mjs aus den
// lokalen Verläufen; die Karte steht über dem Eingabefeld, solange der Chat
// noch leer ist, /tokens öffnet die Details jederzeit.

const PANE = "token-stats";
const TITLE = "Token-Verbrauch";
const REFRESH_EVERY_MS = 3 * 60_000;

const scanRef = atom({ plugin: "token-stats", key: "scan" } as const, null);
const isLoading = atom({ plugin: "token-stats", key: "isLoading" } as const, false);
const isFresh = atom({ plugin: "token-stats", key: "isFresh" } as const, false);
const isHidden = atom({ plugin: "token-stats", key: "isHidden" } as const, false);
const baselineRef = atom({ plugin: "token-stats", key: "baseline" } as const, null);

let lastRunAt = 0;

async function runScan($: EngineInterface): Promise<TokenScan> {
  const script = `${$.plugin.root}/scripts/scan.mjs`;
  let result;
  try {
    result = await $.process.run(["node", script], { timeoutMs: 300_000 });
  } catch (error) {
    return { ok: false, error: `Node.js nicht gefunden oder Start fehlgeschlagen: ${String(error)}` };
  }
  try {
    return JSON.parse(result.stdout) as TokenScan;
  } catch {
    return { ok: false, error: result.stderr.trim() || `scan.mjs endete mit Code ${result.exitCode}` };
  }
}

async function refresh($: EngineInterface): Promise<TokenScan | null> {
  if (await read($, isLoading)) return read($, scanRef);
  await update($, isLoading, () => true);
  try {
    const scan = await runScan($);
    lastRunAt = await $.clock.now();
    // Ein Fehlschlag überschreibt keine gültigen Zahlen, er wird daneben gemeldet.
    await update($, scanRef, (old) => (scan.ok || !old?.ok ? scan : { ...old, error: scan.error }));
    return scan;
  } finally {
    await update($, isLoading, () => false);
  }
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "tokens",
      description: "Token-Verbrauch anzeigen (heute, 7 Tage, 30 Tage, gesamt)",
      argumentHint: "[basis <Zahl> [Datum] | basis aus | karte]",
    });
    const stored = (await $.store.get("baseline")) as TokenBaseline | undefined;
    await update($, baselineRef, () => stored ?? null);
    await update($, isFresh, () => true);
    const started = await next(e);
    // Ein fortgesetzter Chat ist nicht neu: die Karte gehört zum leeren Chat.
    if ((await $.session.turns()) > 0) await update($, isFresh, () => false);
    void refresh($);
    return started;
  });

  on("prompt.submit", async ($, e, next) => {
    await update($, isFresh, () => false);
    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const answered = await next(e);
    if ((await $.clock.now()) - lastRunAt > REFRESH_EVERY_MS) void refresh($);
    return answered;
  });

  on("command.run", { command: "tokens" }, async ($, e) => {
    const words = e.args.trim().split(/\s+/).filter(Boolean);
    const scan = (await read($, scanRef)) ?? (await refresh($));
    const today = scan?.today ?? new Date(await $.clock.now()).toISOString().slice(0, 10);

    if (words[0] === "karte") {
      await update($, isHidden, () => false);
      await update($, isFresh, () => true);
      return { text: "Die Token-Karte steht wieder über dem Eingabefeld." };
    }

    if (words[0] === "basis") {
      if (words[1] === "aus") {
        await $.store.delete("baseline");
        await update($, baselineRef, () => null);
        return { text: "Startwert entfernt. Gesamt zählt nur noch die lokalen Verläufe." };
      }
      const tokens = parseAmount(words.slice(1).filter((w) => !/^\d{1,2}\.\d{1,2}\.(\d{4})?$|^\d{4}-\d{2}-\d{2}$/.test(w)).join(""));
      const dayWord = words.slice(1).find((w) => /^\d{1,2}\.\d{1,2}\.(\d{4})?$|^\d{4}-\d{2}-\d{2}$/.test(w));
      const day = dayWord ? parseDay(dayWord, today) : addDays(today, -1);
      if (tokens === undefined || day === undefined) {
        return { text: "So: /tokens basis 50Mrd 14.10.2026 (Zahl wie 50Mrd, 50B oder 50000000000; Datum = Stand der früheren Anzeige, ohne Datum gestern)." };
      }
      const baseline: TokenBaseline = { tokens, day };
      await $.store.set("baseline", baseline);
      await update($, baselineRef, () => baseline);
      return { text: `Startwert ${short(tokens)} (${full(tokens)}) mit Stand ${germanDay(day)} gesetzt. Gesamt zählt ab ${germanDay(addDays(day, 1))} die lokalen Verläufe dazu.` };
    }

    await $.ui.open({ id: PANE, title: TITLE });
    const fresh = await refresh($);
    if (!fresh?.ok) return { text: `Token-Statistik: ${fresh?.error ?? "keine Daten"}` };
    const lines = windows(fresh, await read($, baselineRef)).map((w) => `${w.label}: ${short(w.sum.total)}`);
    return { text: `Token-Verbrauch: ${lines.join(" · ")}` };
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const isQuiet = e.props.hasSurvey || e.props.isWorking || !(await read($, isFresh)) || (await read($, isHidden));
    const scan = await read($, scanRef);
    if (isQuiet || !scan?.ok) return next(e);
    const { Box, Button, Text } = $.ui.resolve(e);
    const list = windows(scan, await read($, baselineRef));
    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2} alignItems="center">
        <Text dimColor>Tokens</Text>
        {list.map((w) => (
          <Box key={w.key} flexDirection="row" columnGap={1}>
            <Text dimColor>{w.label}</Text>
            <Text bold>{short(w.sum.total)}</Text>
          </Box>
        ))}
        <Button key="details" label="Details" onPress={() => void $.ui.open({ id: PANE, title: TITLE })} />
        <Button key="hide" label="Ausblenden" onPress={() => void update($, isHidden, () => true)} />
      </Box>
    );
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e);
    const scan = await read($, scanRef);
    const loading = await read($, isLoading);
    const baseline = await read($, baselineRef);
    const reload = <Button key="reload" label={loading ? "Zähle …" : "Aktualisieren"} onPress={() => void refresh($)} />;

    if (!scan?.ok) {
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text>{loading ? "Zähle die lokalen Verläufe … beim ersten Mal einige Sekunden." : `Keine Zahlen: ${scan?.error ?? "noch nicht gezählt"}`}</Text>
          {reload}
        </Box>
      );
    }

    const wide = e.props.bodyColumns >= 76;
    const cols = wide ? [9, 11, 11, 11, 11, 12, 9] : [9, 11, 9];
    const head = wide ? ["", "Gesamt", "Input", "Output", "Cache neu", "Cache lesen", "Antworten"] : ["", "Gesamt", "Antworten"];
    const cell = (text: string, width: number, i: number, bold = false) => (
      <Box key={String(i)} width={width} justifyContent={i === 0 ? "flex-start" : "flex-end"}>
        <Text bold={bold} dimColor={i === 0} wrap="truncate">{text}</Text>
      </Box>
    );
    const rows = windows(scan, baseline).map((w) => {
      const s = w.sum;
      const values = wide
        ? [w.label, short(s.total), short(s.input), short(s.output), short(s.cacheWrite), short(s.cacheRead), full(s.answers)]
        : [w.label, short(s.total), full(s.answers)];
      return (
        <Box key={w.key} flexDirection="row">
          {values.map((v, i) => cell(v, cols[i] ?? 9, i, i === 1))}
        </Box>
      );
    });
    const days = scan.days ?? {};
    const today = scan.today ?? "";
    const first = Object.keys(days).sort()[0];

    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text dimColor>Stand {scan.time ?? "?"} · {full(scan.files?.known ?? 0)} Verläufe</Text>
          {reload}
        </Box>
        <Box flexDirection="column">
          <Box flexDirection="row">{head.map((h, i) => cell(h, cols[i] ?? 9, i))}</Box>
          {rows}
        </Box>
        <Box flexDirection="column">
          <Text dimColor>Letzte 30 Tage</Text>
          <Text>{sparkline(days, today)}</Text>
          <Text dimColor>{germanDay(addDays(today, -29))} bis heute</Text>
        </Box>
        <Text dimColor wrap="wrap">
          Gezählt: Input, Output, Cache neu und Cache lesen aus den lokalen Verläufen; eine Antwort zählt einmal, auch wenn sie in mehreren Verläufen steht.
          {first ? ` Gesamt reicht bis ${germanDay(first)} zurück` : ""}
          {baseline ? `, dazu der Startwert ${short(baseline.tokens)} mit Stand ${germanDay(baseline.day)}.` : ". Den Wert der früheren Anzeige als Startwert setzen: /tokens basis 50Mrd 14.10.2026"}
        </Text>
      </Box>
    );
  });
};
