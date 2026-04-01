export interface Purchase {
  id: number;
  date: string;
  price: number;
  quantity: number;
  ticker: string;
}

export interface Dividend {
  id: number;
  date: string;
  price: number;
  quantity: number;
  ticker: string;
}

export type EntryType = 'purchase' | 'dividend';

export interface CombinedEntry extends Purchase {
  type: EntryType;
}

export interface Stock {
  id: string;
  ticker: string;
  name: string;
  createdAt: string;
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
}
