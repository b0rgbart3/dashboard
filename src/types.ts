export interface Purchase {
  id: number;
  date: string;
  price: number;
  quantity: number;
}

export interface Dividend {
  id: number;
  date: string;
  price: number;
  quantity: number;
}

export type EntryType = 'purchase' | 'dividend';

export interface CombinedEntry extends Purchase {
  type: EntryType;
}
