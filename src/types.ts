export type EntryType =
  | 'purchase' | 'dividend'  // per-ticker form values (legacy)
  | 'BUY' | 'SELL' | 'SLIP'
  | 'MDIV' | 'CDIV'
  | 'SPLIT';                 // normalized stock split (quantity = ratio, e.g. 2.0 or 0.1)

export interface Transaction {
  id: number;
  date: string;
  price: number;
  quantity: number;
  ticker: string;
  type: EntryType;
}

export interface Stock {
  id: string;
  ticker: string;
  name: string;
  shortName?: string;
  createdAt: string;
}

// Average cost per share (AVCO method) at different time granularities.
// BUY adds to running cost/shares; SELL removes cost proportionally; SPLIT adjusts shares only.
export interface CostBasis {
  monthly: Record<string, number>; // "YYYY-MM" → avg cost per share at end of that month
  yearly: Record<string, number>;  // "YYYY"    → avg cost per share at end of that year
  total: number;                   // current avg cost per share across all held shares
}

export interface StockSummary {
  totalShares: number;    // net shares (buys − sells)
  totalInvested: number;  // cost basis (sum of BUY costs only)
  sellProceeds: number;   // sum of SELL amounts
  dividendIncome: number; // MDIV, CDIV, dividend types (all-time)
  ytdDividendIncome: number; // dividends received in the current calendar year
  slipIncome: number;     // SLIP (stock lending program, all-time)
  ytdSlipIncome: number;  // SLIP received in the current calendar year
  marketValue: number;    // shares × live price
  totalReturn: number;    // (marketValue + dividendIncome + slipIncome) − netInvested
  hasDividends: boolean;  // true if any dividendIncome > 0
  costBasis: CostBasis;
  earliestPurchaseDate: string | null;
  rating: number | null;  // 1.0–10.0 normalized vs other active stocks; null if inactive
}

export interface ProjectionSettings {
  monthlyStack: string;
  decayMonths: string;
  stockPrice: string;
  dividendInput: string;
  taperDate: string;
  taperLength: string;
  targetIncome: string;
  projectionLength: string;
  useTaper: boolean;
  stackMode: "average" | "ramping";
  rampUpMonths: string;
}
