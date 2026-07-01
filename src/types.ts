export type FilterValue =
  | "all"
  | "exact0"
  | "lt100" | "lt1000" | "lt5000" | "lt10000"
  | "gt10" | "gt100" | "gt500" | "gt1000" | "gt5000" | "gt10000";

export function matchesValueFilter(marketValue: number, filter: FilterValue): boolean {
  switch (filter) {
    case "all":     return true;
    case "exact0":  return marketValue < 0.50;
    case "lt100":   return marketValue < 100;
    case "lt1000":  return marketValue < 1000;
    case "lt5000":  return marketValue < 5000;
    case "lt10000": return marketValue < 10000;
    case "gt10":    return marketValue > 10;
    case "gt100":   return marketValue > 100;
    case "gt500":   return marketValue > 500;
    case "gt1000":  return marketValue > 1000;
    case "gt5000":  return marketValue > 5000;
    case "gt10000": return marketValue > 10000;
  }
}

export type EntryType =
  | 'purchase' | 'dividend'  // per-ticker form values (legacy)
  | 'BUY' | 'SELL' | 'SLIP'
  | 'MDIV' | 'CDIV' | 'DTAX'
  | 'DFEE'                   // ADR depositary fee (cash expense, no share change)
  | 'AFEE'                   // account/administrative fee (cash expense, no share change)
  | 'MRGS'                   // margin interest charged (cash expense, no share change)
  | 'MRGC'                   // margin interest credit/rebate (cash income, no share change)
  | 'MRGS_MERGER'            // merger share conversion — shares received via corporate action
  | 'MRGC_MERGER'            // merger cash component — cash-in-lieu from corporate action
  | 'SPLIT'                  // normalized stock split (quantity = ratio, e.g. 2.0 or 0.1)
  | 'REC'                    // shares received (ACATS transfer, corporate action, etc.)
  | 'SPINOFF'                // spin-off: shares of new company received (corporate action, zero/allocated cost)
  | 'SHARE_EXCHANGE'         // security exchange in: shares received in reorganization/conversion
  | 'SHARE_EXCHANGE_OUT'     // security exchange out: shares removed in reorganization (no realized PnL)
  | 'RETURN_OF_CAPITAL';     // return of capital: cash distribution that reduces cost basis

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
  description?: string;
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
  realizedPnL: number;    // profit/loss locked in from SELL transactions (AVCO method)
  ytdRealizedPnL: number; // realized P/L from SELL transactions in the current calendar year
  dividendIncome: number; // MDIV, CDIV, dividend types (all-time, GROSS before tax)
  ytdDividendIncome: number; // dividends received in the current calendar year (gross)
  withheldTax: number;    // DTAX — tax withheld from dividends (all-time)
  ytdWithheldTax: number; // DTAX withheld in the current calendar year
  slipIncome: number;     // SLIP (stock lending program, all-time)
  ytdSlipIncome: number;  // SLIP received in the current calendar year
  brokerageFeeExpense: number;  // DFEE + AFEE — brokerage/depositary fees paid (all-time)
  ytdBrokerageFeeExpense: number; // brokerage fees paid in the current calendar year
  marginInterestExpense: number; // MRGS — margin interest charged (all-time)
  ytdMarginInterestExpense: number;
  marginCreditIncome: number;    // MRGC — margin interest credit/rebate (all-time)
  ytdMarginCreditIncome: number;
  rocIncome: number;             // RETURN_OF_CAPITAL distributions received (all-time)
  ytdRocIncome: number;          // return of capital received in current calendar year
  marketValue: number;    // shares × live price
  totalReturn: number;    // (marketValue + dividendIncome + slipIncome + marginCreditIncome + rocIncome − withheldTax − brokerageFeeExpense − marginInterestExpense) − netInvested
  hasDividends: boolean;  // true if any dividendIncome > 0
  costBasis: CostBasis;
  earliestPurchaseDate: string | null;
  closedDate: string | null;          // date of final SELL that brought shares to zero; null if still open
  rating: number | null;  // 1.0–10.0 normalized vs other active stocks; null if inactive
  absoluteRating: number | null; // 1.0–10.0 type-aware absolute score (income/growth/balanced)
  stockType: 'income' | 'growth' | 'balanced' | null; // classification driving absoluteRating
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
