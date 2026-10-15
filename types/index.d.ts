/** Tagessumme: Input, Output, Cache schreiben, Cache lesen, Antworten. */
export type TokenDay = [number, number, number, number, number];

/** Was scripts/scan.mjs auf stdout schreibt. */
export type TokenScan = {
  ok: boolean;
  error?: string;
  /** Heutiges Datum in Ortszeit, JJJJ-MM-TT. */
  today?: string;
  /** Uhrzeit der Zählung in Ortszeit, HH:MM. */
  time?: string;
  generatedAt?: string;
  ledgerCreatedAt?: string;
  ledgerPath?: string;
  files?: { known: number; read: number; deleted: number };
  /** Tagessummen nach Datum (JJJJ-MM-TT, Ortszeit). */
  days?: Record<string, TokenDay>;
};

/** Startwert aus der früheren Anzeige: gilt bis einschließlich `day`. */
export type TokenBaseline = { tokens: number; day: string };

declare module "claude-code" {
  interface PluginState {
    "token-stats": {
      scan: TokenScan | null;
      isLoading: boolean;
      isFresh: boolean;
      isHidden: boolean;
      baseline: TokenBaseline | null;
    };
  }
}
