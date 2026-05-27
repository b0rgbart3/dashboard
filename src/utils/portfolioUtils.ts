export const API_BASE = "http://localhost:5001";

export const REQUIRED_COLUMNS = ["activity date", "instrument", "trans code", "quantity", "price"] as const;

export type SortKey =
  | "ticker" | "name" | "totalInvested" | "totalValue" | "totalGain"
  | "gainPct" | "annualGainPct" | "totalShares" | "dividends" | "ytdDividends"
  | "slipIncome" | "realizedPnL" | "ytdRealizedPnL" | "held" | "rating" | "absoluteRating";

export interface TableRow {
  ticker: string;
  name: string;
  totalValue: number;
  totalGain: number;
  totalInvested: number;
  totalShares: number;
  dividends: number;
  ytdDividends: number;
  slipIncome: number;
  realizedPnL: number;
  ytdRealizedPnL: number;
  ytdSlipIncome: number;
  gainPct: number;
  yearsHeld: number | null;
  annualGainPct: number | null;
  heldMs: number | null;
  lengthHeld: string;
  purchaseDate: string | null;
  closedDate: string | null;
  rating: number | null;
  absoluteRating: number | null;
  stockType: "income" | "growth" | "balanced" | null;
}

export function formatHeldDuration(startDate: string | null, endDate?: string | null): string {
  if (!startDate) return "—";
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate + "T12:00:00") : new Date();
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}mo`);
  return parts.length > 0 ? parts.join(" ") : "< 1mo";
}
