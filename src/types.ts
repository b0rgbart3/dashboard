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
  createdAt: string;
}

export interface StockSummary {
  totalShares: number;    // net shares (buys − sells)
  totalInvested: number;  // cost basis (sum of BUY costs only)
  sellProceeds: number;   // sum of SELL amounts
  cashIncome: number;     // dividends + SLIP
  marketValue: number;    // shares × live price
  totalReturn: number;    // (marketValue + cashIncome) − netInvested
  hasDividends: boolean;  // true if any cashIncome > 0
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
