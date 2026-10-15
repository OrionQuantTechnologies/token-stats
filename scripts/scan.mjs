#!/usr/bin/env node
// Zählt den Token-Verbrauch aus den lokalen Claude-Code-Verläufen
// (<config>/projects/**/*.jsonl, ein usage-Block je Modellantwort) und führt
// ein Hauptbuch, damit "Gesamt" auch Verläufe behält, die Claude Code nach
// cleanupPeriodDays löscht.
//
//   node scan.mjs            -> JSON auf stdout
//
// Hauptbuch: <config>/token-stats/ledger.json, je Datei Größe, Änderungszeit,
// Tagessummen und Kurz-Hashes ihrer Antworten. Unveränderte Dateien werden
// nicht neu gelesen; eine Antwort, die in mehreren Dateien steht (fortgesetzte
// oder abgezweigte Sessions), zählt nur einmal.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { createInterface } from "node:readline";

const CONFIG = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const ROOT = join(CONFIG, "projects");
const LEDGER = join(CONFIG, "token-stats", "ledger.json");
const VERSION = 1;

const pad = (n) => String(n).padStart(2, "0");
const localDay = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const shortHash = (key) => createHash("sha1").update(key).digest("base64url").slice(0, 11);

async function walk(dir, found = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, found);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(path);
  }
  return found;
}

async function loadLedger() {
  try {
    const ledger = JSON.parse(await readFile(LEDGER, "utf8"));
    if (ledger.version === VERSION && ledger.files) return ledger;
  } catch {}
  return { version: VERSION, createdAt: new Date().toISOString(), files: {} };
}

// Liest eine Datei Zeile für Zeile; Dateien über 1 GB sind kein Problem.
async function readUsage(path, rel, owners) {
  const days = {};
  const keys = [];
  const seen = new Set();
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('"usage"')) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const message = row.message;
    const usage = message && message.usage;
    if (!usage || typeof usage !== "object") continue;
    const ms = Date.parse(row.timestamp);
    if (!Number.isFinite(ms)) continue;
    // Eine Antwort steht beim Streamen in mehreren Zeilen mit demselben usage.
    const idKey = `${message.id || ""}|${row.requestId || ""}`;
    const key = idKey === "|" ? `${rel}|${row.uuid}` : idKey;
    if (seen.has(key)) continue;
    seen.add(key);
    const hash = shortHash(key);
    const owner = owners.get(hash);
    if (owner !== undefined && owner !== rel) continue;
    owners.set(hash, rel);
    keys.push(hash);
    const day = (days[localDay(ms)] ??= [0, 0, 0, 0, 0]);
    day[0] += usage.input_tokens || 0;
    day[1] += usage.output_tokens || 0;
    day[2] += usage.cache_creation_input_tokens || 0;
    day[3] += usage.cache_read_input_tokens || 0;
    day[4] += 1;
  }
  return { days, keys };
}

async function main() {
  const ledger = await loadLedger();
  const paths = await walk(ROOT);
  const present = new Map();
  for (const path of paths) {
    try {
      const info = await stat(path);
      present.set(relative(ROOT, path).split(sep).join("/"), { path, size: info.size, mtimeMs: Math.floor(info.mtimeMs) });
    } catch {}
  }

  const changed = [];
  const owners = new Map();
  for (const [rel, entry] of Object.entries(ledger.files)) {
    const now = present.get(rel);
    const isSame = now && now.size === entry.size && now.mtimeMs === entry.mtimeMs;
    if (!now || isSame) for (const hash of entry.keys) owners.set(hash, rel);
  }
  for (const [rel, now] of present) {
    const entry = ledger.files[rel];
    if (!entry || entry.size !== now.size || entry.mtimeMs !== now.mtimeMs) changed.push([rel, now]);
  }
  changed.sort((a, b) => a[1].mtimeMs - b[1].mtimeMs);

  for (const [rel, now] of changed) {
    const { days, keys } = await readUsage(now.path, rel, owners);
    ledger.files[rel] = { size: now.size, mtimeMs: now.mtimeMs, days, keys };
  }

  if (changed.length > 0) {
    await mkdir(join(CONFIG, "token-stats"), { recursive: true });
    const temp = `${LEDGER}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(ledger));
    await rename(temp, LEDGER);
  }

  const days = {};
  let deleted = 0;
  for (const [rel, entry] of Object.entries(ledger.files)) {
    if (!present.has(rel)) deleted += 1;
    for (const [day, v] of Object.entries(entry.days)) {
      const sum = (days[day] ??= [0, 0, 0, 0, 0]);
      for (let i = 0; i < 5; i += 1) sum[i] += v[i];
    }
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      today: localDay(Date.now()),
      time: `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`,
      generatedAt: new Date().toISOString(),
      ledgerCreatedAt: ledger.createdAt,
      ledgerPath: LEDGER,
      files: { known: Object.keys(ledger.files).length, read: changed.length, deleted },
      days,
    }),
  );
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }));
  process.exitCode = 1;
});
